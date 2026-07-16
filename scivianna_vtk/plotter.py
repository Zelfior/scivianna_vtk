import param
import panel as pn
from panel.custom import JSComponent
import numpy as np
import pyvista as pv

# =============================================================================
# Binary helpers
# =============================================================================

def _pack(arr: np.ndarray, dtype) -> bytes:
    """
    Pack a numpy array into bytes with the specified dtype.
    
    Parameters
    ----------
    arr : np.ndarray
        Input numpy array to pack.
    dtype : type
        NumPy dtype for casting (e.g., np.float32).
    
    Returns
    -------
    bytes
        Raw bytes of the array data.
    """
    return memoryview(arr.astype(dtype, copy=False)).tobytes()


def _pyvista_to_numpy(vtk_array) -> np.ndarray:
    """
    Convert a VTK array to a numpy array.
    
    Works with pyvista's underlying VTK arrays by using vtk.util.numpy_support.
    
    Parameters
    ----------
    vtk_array : vtkArray
        VTK array to convert.
    
    Returns
    -------
    np.ndarray
        Numpy array equivalent of the VTK array.
    """
    import vtk.util.numpy_support as vtk_np
    return vtk_np.vtk_to_numpy(vtk_array)

# =============================================================================
# VTK 9.6+ SAFE CELL EXTRACTION
# =============================================================================

def extract_cell_stream(cell) -> dict:
    """
    Convert VTK cell array (polys/lines/verts) into vtk.js-compatible binary stream.
    
    Uses the modern VTK API methods GetOffsetsArray() and GetConnectivityArray()
    to extract cell topology data in a format compatible with vtk.js.
    
    Parameters
    ----------
    cell : vtkCellArray or None
        VTK cell array containing polygon, line, or vertex data.
    
    Returns
    -------
    dict or None
        Dictionary with 'buffer' key containing bytes of the stream, or None 
        if input is None. The stream format is: [num_cells, p0, p1, ..., pN] 
        for each cell where num_cells is the number of points in the cell.
    """

    if cell is None:
        return None

    offsets_vtk = cell.GetOffsetsArray()
    conn_vtk = cell.GetConnectivityArray()

    offsets = _pyvista_to_numpy(offsets_vtk)
    conn = _pyvista_to_numpy(conn_vtk)

    stream = []

    for i in range(len(offsets) - 1):

        start = offsets[i]
        end = offsets[i + 1]

        cell_pts = conn[start:end]

        stream.append(len(cell_pts))
        stream.extend(cell_pts.tolist())

    stream_np = np.array(stream, dtype=np.uint32)

    return {
        "buffer": memoryview(stream_np).tobytes(),
    }


def polydata_to_dict(poly: pv.PolyData) -> dict:
    """
    Convert pyvista.PolyData to a vtk.js-friendly binary dictionary structure.
    
    Extracts points, topology (polys, lines, verts, strips), and both point 
    and cell data from the PolyData, converting them to binary buffers suitable
    for transmission to vtk.js via Panel's JSComponent interface.
    
    Parameters
    ----------
    poly : pv.PolyData
        PyVista PolyData object. Note: pyvista.PolyData is a subclass of 
        vtkPolyData, so the VTK API is directly compatible.
    
    Returns
    -------
    dict
        Dictionary with keys: 'points', 'polys', 'lines', 'verts', 'strips', 
        'pointData', 'cellData'. Each contains binary buffers and metadata 
        required by vtk.js for rendering.
    """

    # -------------------------------------------------------------------------
    # POINTS
    # -------------------------------------------------------------------------

    pts = _pyvista_to_numpy(poly.GetPoints().GetData())

    points = {
        "buffer": _pack(pts, np.float32),
        "components": 3,
    }

    # -------------------------------------------------------------------------
    # TOPOLOGY
    # -------------------------------------------------------------------------

    def cell(cell):
        return extract_cell_stream(cell)

    polys = cell(poly.GetPolys())
    lines = cell(poly.GetLines())
    verts = cell(poly.GetVerts())
    strips = cell(poly.GetStrips())

    # -------------------------------------------------------------------------
    # POINT DATA
    # -------------------------------------------------------------------------

    point_data = {}
    pd = poly.GetPointData()

    for i in range(pd.GetNumberOfArrays()):

        arr = pd.GetArray(i)
        name = arr.GetName()

        np_arr = _pyvista_to_numpy(arr)

        point_data[name] = {
            "buffer": memoryview(np_arr).tobytes(),
            "components": arr.GetNumberOfComponents(),
            "dtype": str(np_arr.dtype),
        }

    # -------------------------------------------------------------------------
    # CELL DATA
    # -------------------------------------------------------------------------

    cell_data = {}
    cd = poly.GetCellData()

    for i in range(cd.GetNumberOfArrays()):

        arr = cd.GetArray(i)
        name = arr.GetName()

        np_arr = _pyvista_to_numpy(arr)

        cell_data[name] = {
            "buffer": _pack(np_arr, np.float32),
            "components": arr.GetNumberOfComponents(),
        }

    return {
        "points": points,

        "polys": polys,
        "lines": lines,
        "verts": verts,
        "strips": strips,

        "pointData": point_data,
        "cellData": cell_data,
    }


def _convert_cells_to_polys(poly: pv.PolyData) -> pv.PolyData:
    """
    Convert cell-based PolyData to polygon surface geometry.
    
    For structured grids and other datasets that don't have explicit 
    polygon primitives, extracts the surface or generates polygons from cells.
    
    Parameters
    ----------
    poly : pv.PolyData
        Input PolyData that may or may not contain polygon primitives.
    
    Returns
    -------
    pv.PolyData
        PolyData with polygon surface. If input already has polys, returns 
        unchanged. Otherwise returns the result of extract_surface().
    """
    # Check if we already have polys
    if poly.GetPolys().GetNumberOfCells() > 0:
        return poly

    # Try to extract surface which will create proper polys
    try:
        return poly.extract_surface(algorithm='dataset_surface')
    except Exception:
        # If extract_surface fails, return original
        return poly


def unstructured_grid_to_dict(ugrid: pv.UnstructuredGrid) -> dict:
    """
    Convert pyvista.UnstructuredGrid to a vtk.js-friendly binary dictionary structure.
    
    For vtk.js compatibility, converts the unstructured grid to PolyData using 
    vtkDataSetSurfaceFilter, which preserves original cell IDs for proper data 
    mapping. Point and cell data arrays are remapped from the original grid to 
    the converted PolyData.
    
    Parameters
    ----------
    ugrid : pv.UnstructuredGrid
        PyVista UnstructuredGrid to convert.
    
    Returns
    -------
    dict
        Dictionary with keys: 'points', 'polys', 'lines', 'verts', 'strips', 
        'pointData', 'cellData'. Contains binary buffers and metadata for 
        vtk.js rendering, with cell data properly mapped from the original grid.
    """
    import vtk

    # Use vtkDataSetSurfaceFilter which preserves original cell IDs
    surface_filter = vtk.vtkDataSetSurfaceFilter()
    surface_filter.SetInputData(ugrid)
    surface_filter.Update()

    poly = pv.PolyData(surface_filter.GetOutput())

    # The filter adds 'vtkOriginalCellIds' array to point data
    # We need to use it to map cell data from original to new cells
    if 'vtkOriginalCellIds' in poly.cell_data:
        original_ids = poly.cell_data['vtkOriginalCellIds'].astype(int)

        # Map each cell data array from original to new cells
        for name, arr in ugrid.cell_data.items():
            if len(original_ids) == len(arr):
                # Same number of cells, direct copy
                poly.cell_data[name] = arr
            else:
                # Different number of cells, use original IDs to map
                if len(original_ids) <= len(arr):
                    new_arr = arr[original_ids]
                    poly.cell_data[name] = new_arr

    return polydata_to_dict(poly)


class VTKPlotter(JSComponent):
    """
    Interactive VTK/PyVista plotter component using vtk.js for rendering.
    
    A Panel JSComponent that renders 3D geometry server-side converted from 
    pyvista mesh objects to vtk.js-compatible binary format. Supports hover 
    interaction for cell identification, clip plane visualization, and plane 
    overlay display.
    
    Parameters
    ----------
    geometry : dict, optional
        Binary geometry data (points and topology) for vtk.js rendering.
    colors : dict, optional
        Binary color data (pointData and cellData) for vtk.js rendering.
    clip_slice : dict or None, optional
        PolyData of the intersection between clip plane and source mesh, 
        used as a data-accurate cap over the vtk.js clip hole.
    info : bool, optional
        Whether to show the info panel. Default is True.
    hover_cell_id : int, optional
        ID of the currently hovered cell (-1 if none). Default is -1.
    hover_cell_value : int, optional
        Value of the currently hovered cell. Default is -1.
    hover_position : list, optional
        [x, y, z] coordinates of the current hover position. Default is [nan, nan, nan].
    clip_enabled : bool, optional
        Enable/disable clip plane visualization. Default is False.
    clip_origin : list, optional
        Clip plane origin as [x, y, z]. Default is [0.0, 0.0, 0.0].
    clip_normal : list, optional
        Clip plane normal vector as [x, y, z]. Default is [0.0, 0.0, 1.0].
    plane_visible : bool, optional
        Show/hide the plane visualization overlay. Default is False.
    
    Attributes
    ----------
    _source_mesh : pv.DataSet or None
        Reference to the actual pyvista dataset currently being displayed.
    _esm : str
        Path to the bundled JavaScript ESM module.
    
    Examples
    --------
    >>> import pyvista as pv
    >>> from scivianna_vtk.plotter import VTKPlotter
    >>> sphere = pv.Sphere()
    >>> plotter = VTKPlotter()
    >>> plotter.update_polydata(sphere)
    """

    geometry = param.Dict()
    colors = param.Dict()

    # The exact intersection of the clip plane with the source mesh,
    # computed in python whenever the clip plane settles (see
    # `_recompute_clip_slice`). `None` means "no slice available yet" (or
    # the plane doesn't currently intersect the mesh) - the JS side simply
    # doesn't show a cap in that case, leaving the plain vtk.js hole.
    clip_slice = param.Dict(default=None, allow_None=True, doc=(
        "PolyData (points/topology/point&cell data) of the intersection "
        "between the clip plane and the real source mesh, computed "
        "server-side with pyvista's `.slice()`. Used by the JS side as a "
        "data-accurate cap over the hole left by the local vtk.js clip."
    ))

    info = param.Boolean(default=True, doc="Whether to show the info panel.")

    hover_cell_id = param.Integer(default=-1, doc="ID of the currently hovered cell.")
    hover_cell_value = param.Number(default=-1, doc="Value of the currently hovered cell.")

    hover_position = param.List(
        default=[float("nan"), float("nan"), float("nan")],
        doc="[x, y, z] coordinates of the current hover position."
    )

    # Clip plane parameters
    clip_enabled = param.Boolean(default=False, doc="Enable/disable clip plane visualization")
    clip_origin = param.List(default=[0.0, 0.0, 0.0], doc="Clip plane origin [x, y, z]")
    clip_normal = param.List(default=[0.0, 0.0, 1.0], doc="Clip plane normal [x, y, z]")

    plane_visible = param.Boolean(default=False, doc="Plane visualization visible")

    clicks = param.Integer(default=0, doc="Number of clicks on the plotter")

    # _importmap = {
    #     "imports": {
    #         "@kitware/vtk.js": "https://esm.sh/@kitware/vtk.js@35.15.1",
    #     }
    # }

    _esm = "./VTKPlotter.bundle.js"

    def __init__(self, **params):
        """
        Initialize the VTKPlotter component.
        
        Sets up parameter watchers for clip plane changes so that the 
        intersection slice is recomputed whenever the plane origin, normal, 
        or enabled state changes.
        
        Parameters
        ----------
        **params : dict
            Parameter key-value pairs to set during initialization.
        """
        super().__init__(**params)

        # Reference to the actual pyvista dataset currently being displayed.
        # Needed so we can re-clip it (with real data) whenever the plane
        # changes, rather than only ever clipping the vtk.js-side surface.
        self._source_mesh = None

        # Whenever the clip plane settles - whether that's because the user
        # dragged the widget and released the mouse (JS syncs clip_origin /
        # clip_normal at that point, see app.js), or because clip_enabled /
        # clip_origin / clip_normal were changed from python directly - we
        # recompute the precise capped mesh.
        self.param.watch(
            self._recompute_clip_slice,
            ["clip_origin", "clip_normal", "clip_enabled"],
        )

    # -------------------------------------------------------------------------
    # Clip Plane Control Methods
    # -------------------------------------------------------------------------

    def set_plane_enabled(self, enabled: bool):
        """
        Enable or disable the plane visualization overlay.
        
        Parameters
        ----------
        enabled : bool
            Whether to show the plane visualization.
        """
        if self.plane_visible != enabled:
            self.plane_visible = enabled

    def set_clip_enabled(self, enabled: bool):
        """
        Enable or disable the clip plane visualization.
        
        Parameters
        ----------
        enabled : bool
            Whether to enable clipping of the rendered geometry.
        """
        if self.clip_enabled != enabled:
            self.clip_enabled = enabled

    @pn.io.hold()
    def set_clip_plane(self, origin=None, normal=None):
        """
        Set clip plane position and orientation.
        
        Updates the clip plane origin and/or normal, triggering a 
        recomputation of the clip slice if clipping is enabled.
        
        Parameters
        ----------
        origin : list of 3 floats, optional
            Plane origin [x, y, z]. If None, keeps current origin.
        normal : list of 3 floats, optional
            Plane normal [x, y, z]. If None, keeps current normal.
        
        Examples
        --------
        >>> plotter.set_clip_plane(origin=[0.5, 0.5, 0.5])
        >>> plotter.set_clip_plane(normal=[1, 0, 0])
        >>> plotter.set_clip_plane(origin=[0, 0, 0], normal=[0, 0, 1])
        """
        if origin is not None:
            if not np.isclose(
                origin,
                self.clip_origin
            ).all():
                self.clip_origin = list(origin)
                
        if normal is not None:
            if np.allclose(normal, self.clip_normal, rtol=1e-4):
                return
            self.clip_normal = list(normal)

        if (origin is not None or normal is not None) and self.clip_enabled:
            self._recompute_clip_slice(None)

    def set_clip_axis(self, axis: str, sign: int = 1):
        """
        Set clip plane normal to a cardinal direction.
        
        Sets the clip plane normal to one of the six cardinal directions 
        (±x, ±y, ±z) based on the axis and sign parameters.
        
        Parameters
        ----------
        axis : {'x', 'y', 'z'}
            Axis for the normal direction.
        sign : {1, -1}, optional
            Direction sign. Default is 1 (positive direction).
        
        Examples
        --------
        >>> plotter.set_clip_axis('x')      # Normal: [1, 0, 0]
        >>> plotter.set_clip_axis('z', -1)  # Normal: [0, 0, -1]
        """
        normals = {
            'x': [sign, 0, 0],
            'y': [0, sign, 0],
            'z': [0, 0, sign],
        }
        self.clip_normal = normals.get(axis, [0, 0, sign])

    @property
    def clip_plane_state(self) -> dict:
        """
        Get current clip plane state as a dictionary.
        
        Returns
        -------
        dict
            Dictionary with keys:
            - 'enabled' (bool): Whether clipping is enabled.
            - 'origin' (list): Plane origin [x, y, z].
            - 'normal' (list): Plane normal [x, y, z].
        """
        return {
            'enabled': self.clip_enabled,
            'origin': self.clip_origin,
            'normal': self.clip_normal,
        }

    @property
    def clip_center(self) -> list:
        """
        Get clip plane center (origin).
        
        Returns
        -------
        list
            Clip plane origin as [x, y, z].
        """
        return self.clip_origin

    @property
    def clip_axes(self) -> list:
        """
        Get clip plane normal vector.
        
        Returns
        -------
        list
            Clip plane normal as [x, y, z].
        """
        return self.clip_normal

    def _convert_mesh(self, mesh):
        """
        Convert various pyvista mesh types to vtk.js-compatible dictionary format.
        
        Dispatches to the appropriate conversion function based on mesh type:
        - pv.PolyData → polydata_to_dict()
        - pv.UnstructuredGrid / pv.StructuredGrid → unstructured_grid_to_dict()
        - pv.RectilinearGrid / pv.ImageData → extract_surface then polydata_to_dict()
        
        Parameters
        ----------
        mesh : pv.DataSet
            PyVista mesh object to convert.
        
        Returns
        -------
        dict
            Dictionary with binary geometry and color data for vtk.js.
        
        Raises
        ------
        TypeError
            If the mesh type is not supported.
        """
        if isinstance(mesh, pv.PolyData):
            # Ensure we have polys for proper rendering
            if mesh.GetPolys().GetNumberOfCells() == 0 and hasattr(mesh, 'extract_surface'):
                mesh = _convert_cells_to_polys(mesh)
            return polydata_to_dict(mesh)
        elif isinstance(mesh, (pv.StructuredGrid, pv.UnstructuredGrid)):
            return unstructured_grid_to_dict(mesh)
        elif isinstance(mesh, (pv.RectilinearGrid, pv.ImageData)):
            # Convert to PolyData using extract_surface for proper polygon generation
            poly = mesh.extract_surface(algorithm='dataset_surface')
            return polydata_to_dict(poly)
        else:
            raise TypeError(f"Unsupported mesh type: {type(mesh)}")

    # -------------------------------------------------------------------------
    # Precise (data-accurate) clip cap
    # -------------------------------------------------------------------------
    def _recompute_clip_slice(self, *events):
        """
        Compute the exact intersection between the clip plane and the real 
        source mesh for data-accurate clip cap rendering.
        
        Computes the intersection using pyvista's `.slice()` method (not 
        `.clip()`) to extract only the thin cross-section polygon, not the 
        full clipped body. This slice is serialized and stored in clip_slice 
        for the JS side to render as a colored cap over the hole left by 
        local vtk.js clipping.
        
        Only called when the plane "settles" (mouse release on JS side or 
        python-side parameter change), not on every drag frame, to avoid 
        performance issues from repeated slicing and serialization.
        
        Parameters
        ----------
        *events : tuple
            Parameter change events that triggered this callback.
        """
        if self._source_mesh is None:
            return

        if not self.clip_enabled:
            self.clip_slice = None
            return

        try:
            mesh_slice: pv.PolyData = self._source_mesh.slice(
                normal=self.clip_normal,
                origin=self.clip_origin,
                generate_triangles=True,
            )
        except Exception:
            # A degenerate plane (e.g. missing the mesh entirely) shouldn't
            # crash the app - just fall back to "no cap available".
            self.clip_slice = None
            return

        if mesh_slice is None or mesh_slice.n_points == 0:
            self.clip_slice = None
            return
        
        d = self._convert_mesh(mesh_slice)

        self.clip_slice = {
            "points": d["points"],
            "polys": d["polys"],
            "lines": d["lines"],
            "verts": d["verts"],
            "strips": d["strips"],
            "pointData": d["pointData"],
            "cellData": d["cellData"],
            "origin": self.clip_origin
        }

    @pn.io.hold()
    def update_polydata(self, polydata):
        """
        Update the plotter with new geometry and data.
        
        Converts the input pyvista mesh to vtk.js-compatible format and 
        stores a reference to the original mesh for clip plane recomputation.
        Invalidates any previously computed clip slice.
        
        Parameters
        ----------
        polydata : pv.DataSet
            PyVista mesh object (PolyData, UnstructuredGrid, etc.).
        
        Examples
        --------
        >>> import pyvista as pv
        >>> sphere = pv.Sphere()
        >>> plotter.update_polydata(sphere)
        """
        # Keep a handle on the real dataset so the clip plane can be
        # re-applied to it later (with real data) instead of only ever
        # clipping the already-converted vtk.js surface.
        self._source_mesh = polydata

        d = self._convert_mesh(polydata)

        self.geometry = {
            "points": d["points"],
            "polys": d["polys"],
            "lines": d["lines"],
            "verts": d["verts"],
            "strips": d["strips"],
        }

        self.colors = {
            "pointData": d["pointData"],
            "cellData": d["cellData"],
        }

        # New geometry invalidates any previously computed clip cap.
        self._recompute_clip_slice()

    @pn.io.hold()
    def update_colors(self, polydata):
        """
        Update only the color data while keeping the same geometry.
        
        Re-converts the input mesh to extract updated point and cell data 
        (colors), storing a reference for clip plane recomputation.
        
        Parameters
        ----------
        polydata : pv.DataSet
            PyVista mesh object with updated color data.
        
        Examples
        --------
        >>> plotter.update_colors(updated_mesh)
        """
        self._source_mesh = polydata

        d = self._convert_mesh(polydata)

        self.colors = {
            "pointData": d["pointData"],
            "cellData": d["cellData"],
        }

        self._recompute_clip_slice()
