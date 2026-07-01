# vtk_panel - Agent Documentation

## Project Overview

This project provides a Panel-based web interface for visualizing VTK/pyvista meshes in the browser using vtk.js. The package allows interactive 3D visualization with hover information and dynamic geometry updates.

## Key Files

### `vtk_panel/plotter.py`
Core module containing:
- **VTKPlotter**: A JSComponent subclass that renders vtk.js visualizations in Panel
- **polydata_to_dict()**: Converts pyvista.PolyData to vtk.js-compatible binary format
- **unstructured_grid_to_dict()**: Converts pyvista.UnstructuredGrid using vtkDataSetSurfaceFilter

### `vtk_panel/example.py`
Example implementation containing:
- **ExamplePanel**: Interactive panel with sliders for geometry control
- Geometry creation functions:
  - `create_sliced_sphere()` - Creates sphere with cell coloring
  - `create_uniform_structured_grid()` - Creates structured grid, converts via extract_surface
  - `create_random_tetrahedral_mesh()` - Creates tetrahedral unstructured grid
  - `create_unstructured_grid()` - Creates random tetrahedral cells
- **set_color()**: Applies matplotlib colormaps to cell data

### `tests/test_example.py`
Pytest tests covering:
- All three geometry types (sphere, structured_grid, unstructured_grid)
- Colormap changes
- Display info toggle

## Technical Details

### Mesh Conversion Pipeline

1. **PolyData**: Direct conversion via `polydata_to_dict()`, extracts polys/lines/verts/strips
2. **StructuredGrid/RectilinearGrid/ImageData**: Convert via `extract_surface(algorithm='dataset_surface')` to get proper polygon topology
3. **UnstructuredGrid**: Convert via `vtkDataSetSurfaceFilter`, maps cell data using `vtkOriginalCellIds`

### Cell Data Handling

- Cell data is preserved through surface extraction using VTK's `vtkOriginalCellIds` array
- The `set_color()` function normalizes `cell_value` and applies matplotlib colormap to generate RGB arrays
- RGB arrays are stored as `cell_data["rgb"]` for vtk.js consumption

### vtk.js Binary Format

The conversion produces:
```python
{
    "points": {"buffer": bytes, "components": 3},
    "polys": {"buffer": bytes},  # Cell stream format: [n_pts, p0, p1, ...]
    "lines": {"buffer": bytes},
    "verts": {"buffer": bytes},
    "strips": {"buffer": bytes},
    "pointData": {name: {"buffer": bytes, "components": N, "dtype": str}},
    "cellData": {name: {"buffer": bytes, "components": N}}
}
```

### Dependencies

- **panel** >= 1.0.0 - Web app framework
- **panel-material-ui** >= 0.1.0 - Material UI components
- **pyvista** >= 0.40.0 - VTK wrapper for mesh handling
- **vtk** >= 9.0.0 - Underlying VTK library
- **matplotlib** >= 3.5.0 - Colormap support
- **numpy** >= 1.20.0 - Array operations
- **param** >= 2.0.0 - Parameter handling

## Clip Plane Utility

The JavaScript viewer includes a clip plane utility for viewing interior geometry. Access it via `window.vtkPanelClipPlane`:

```javascript
// Enable/disable clipping
window.vtkPanelClipPlane.setEnabled(true);

// Move plane along its normal (positive = forward, negative = backward)
window.vtkPanelClipPlane.move(0.5);

// Set plane orientation to cardinal axis
window.vtkPanelClipPlane.setAxis('x', 1);  // Normal points in +X direction
window.vtkPanelClipPlane.setAxis('y', -1); // Normal points in -Y direction
window.vtkPanelClipPlane.setAxis('z', 1);  // Normal points in +Z direction

// Update plane position and orientation directly
window.vtkPanelClipPlane.update([0, 0, 0], [0, 0, 1]); // origin, normal

// Get current state
const state = window.vtkPanelClipPlane.getState();
console.log(state); // { enabled: true, origin: [x,y,z], normal: [nx,ny,nz] }
```

The clip plane is automatically positioned at the geometry center on initial load.

## Common Issues & Solutions

### No geometry displayed
- Ensure mesh has proper polygons: `mesh.GetPolys().GetNumberOfCells() > 0`
- For structured grids, always use `extract_surface()` not `cast_to_poly_points()`
- For unstructured grids, use `vtkDataSetSurfaceFilter` for conversion

### Cell data mismatch after conversion
- Surface extraction changes cell count; use `vtkOriginalCellIds` to map data
- The filter adds this array automatically to cell_data

### Deprecation warnings
- Use `label` instead of `name` for panel-material-ui widgets
- Use `extract_surface(algorithm='dataset_surface')` to silence future warnings

## Testing

Run tests with:
```bash
pip install pytest
python -m pytest tests/ -v
```

## Development Notes

- The project uses pyvista as the primary mesh interface (not direct vtk)
- pyvista provides cleaner APIs but some operations still require direct vtk (e.g., DataSetSurfaceFilter)
- All geometry creation functions should return meshes with `cell_value` array for coloring