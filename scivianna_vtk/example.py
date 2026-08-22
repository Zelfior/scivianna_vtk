"""
Main example launcher for scivianna_vtk.

This module provides a unified interface to run different geometry examples.
For individual examples, see the `examples` subpackage.

Usage
-----
To run the full example with all geometry types:
    python -m scivianna_vtk.example

To run individual examples:
    python -m scivianna_vtk.examples.example_sliced_sphere
    python -m scivianna_vtk.examples.example_string_data
"""

import param
import numpy as np
import panel_material_ui as pmui
import matplotlib.pyplot as plt
import pyvista as pv
from scivianna_vtk.plotter import VTKPlotter


# =============================================================================
# Geometry creation functions
# =============================================================================

def set_color(polydata: pv.DataSet, cmap: str = "viridis"):
    """
    Set color for the given pyvista mesh using the specified colormap.

    Parameters
    ----------
    polydata : pv.DataSet
        PyVista dataset (PolyData, UnstructuredGrid, etc.).
    cmap : str, optional
        Colormap name used to map cell values to RGB colors. Default is "viridis".
    """
    if "cell_value" not in polydata.cell_data:
        n_cells = polydata.n_cells
        polydata.cell_data["cell_value"] = np.arange(n_cells, dtype=np.float32)

    cell_value = polydata["cell_value"]
    norm_values = (cell_value - cell_value.min()) / (cell_value.max() - cell_value.min())
    cmap_obj = plt.get_cmap(cmap)
    rgb = cmap_obj(norm_values)[:, :3]
    polydata["rgb"] = rgb


def create_sliced_sphere(theta_count: int, phi_count: int, cmap: str = "viridis") -> pv.PolyData:
    """Create a sliced sphere geometry."""
    sphere = pv.Sphere(theta_resolution=theta_count, phi_resolution=phi_count)
    num_cells = sphere.n_cells
    cell_id = np.arange(num_cells, dtype=np.int32)
    cell_value = cell_id.astype(np.float32)
    sphere.cell_data["cell_id"] = cell_id
    sphere.cell_data["cell_value"] = cell_value
    set_color(sphere, cmap=cmap)
    return sphere


def create_uniform_structured_grid(nx: int, ny: int, nz: int, spacing: float = 1.0, cmap: str = "viridis") -> pv.StructuredGrid:
    """Create a uniform structured grid."""
    x = np.arange(nx, dtype=np.float32) * spacing / nx
    y = np.arange(ny, dtype=np.float32) * spacing / ny
    z = np.arange(nz, dtype=np.float32) * spacing / nz
    X, Y, Z = np.meshgrid(x, y, z, indexing='ij')
    grid = pv.StructuredGrid(X, Y, Z)

    n_cells = (nx - 1) * (ny - 1) * (nz - 1)
    cell_id = np.arange(n_cells, dtype=np.float32)

    x_norm = np.arange(max(nx - 1, 1), dtype=np.float32)
    y_norm = np.arange(max(ny - 1, 1), dtype=np.float32)
    z_norm = np.arange(max(nz - 1, 1), dtype=np.float32)

    if nx > 1:
        x_norm = x_norm / (nx - 2) if nx > 2 else x_norm
    if ny > 1:
        y_norm = y_norm / (ny - 2) if ny > 2 else y_norm
    if nz > 1:
        z_norm = z_norm / (nz - 2) if nz > 2 else z_norm

    X_c, Y_c, Z_c = np.meshgrid(x_norm, y_norm, z_norm, indexing='ij')
    cell_value = X_c.flatten()

    if len(cell_value) != n_cells:
        cell_value = cell_value[:n_cells]
        if len(cell_value) < n_cells:
            cell_value = np.pad(cell_value, (0, n_cells - len(cell_value)))

    grid.cell_data["cell_id"] = cell_id
    grid.cell_data["cell_value"] = cell_value
    set_color(grid, cmap=cmap)
    return grid


def create_random_tetrahedral_mesh(n_tetras: int = 20, seed: int = 42, cmap: str = "viridis") -> pv.UnstructuredGrid:
    """Create a random tetrahedral mesh."""
    np.random.seed(seed)
    all_points = []
    cell_connectivity = []

    base_points = np.random.rand(8, 3) * 2 - 1
    all_points.extend(base_points.tolist())

    tetra_configs = [
        [0, 1, 3, 4], [1, 2, 3, 4], [1, 3, 7, 4], [3, 5, 7, 4], [3, 6, 7, 5], [1, 3, 5, 7]
    ]

    for config in tetra_configs[:min(n_tetras, len(tetra_configs))]:
        cell_connectivity.extend([4] + list(config))

    current_n_tetras = len(tetra_configs[:min(n_tetras, len(tetra_configs))])
    while current_n_tetras < n_tetras:
        offset = np.random.rand(3) * 4 - 2
        new_points = np.random.rand(4, 3) + offset
        start_idx = len(all_points)
        all_points.extend(new_points.tolist())
        cell_connectivity.extend([4, start_idx, start_idx + 1, start_idx + 2, start_idx + 3])
        current_n_tetras += 1

    points_array = np.array(all_points, dtype=np.float64)
    n_cells = len(cell_connectivity) // 5
    cell_types = np.full(n_cells, pv.CellType.TETRA, dtype=np.uint8)
    ugrid = pv.UnstructuredGrid(np.array(cell_connectivity, dtype=np.int64), cell_types, points_array)

    cell_id = np.arange(n_cells, dtype=np.int32)
    cell_value = cell_id.astype(np.float32)
    ugrid.cell_data["cell_id"] = cell_id
    ugrid.cell_data["cell_value"] = cell_value
    set_color(ugrid, cmap=cmap)
    return ugrid


def create_sphere_with_string_data(theta_count: int = 20, phi_count: int = 20) -> pv.PolyData:
    """
    Create a sphere with string cell IDs and string cell values.

    This demonstrates the ability to use string data for cell identification
    and values, which is useful for categorical data or named regions.
    """
    sphere = pv.Sphere(theta_resolution=theta_count, phi_resolution=phi_count)
    num_cells = sphere.n_cells

    cell_id_strings = [f"cell_{i}" for i in range(num_cells)]

    zone_labels = ["zone_A", "zone_B", "zone_C"]
    cell_value_strings = [zone_labels[i % len(zone_labels)] for i in range(num_cells)]

    sphere.cell_data["cell_id"] = cell_id_strings
    sphere.cell_data["cell_value"] = cell_value_strings

    zone_colors = {
        "zone_A": [47 / 255, 84 / 255, 101 / 255],  # Red
        "zone_B": [215 / 255, 200 / 255, 106 / 255],  # Green
        "zone_C": [99 / 255, 145 / 255, 158 / 255],  # Blue
    }
    rgb = np.array([zone_colors[v] for v in cell_value_strings])
    sphere.cell_data["rgb"] = rgb

    return sphere


# =============================================================================
# Main Example Panel
# =============================================================================

class ExamplePanel(param.Parameterized):
    """
    Interactive Panel UI for VTK/PyVista visualization with vtk.js.

    Provides a configurable interface for creating and visualizing
    different geometry types with colormap selection, clip plane controls,
    and hover info display.
    """

    def __init__(self, **params):
        super().__init__(**params)

        self.theta_slider = pmui.IntSlider(
            label="Resolution Theta",
            start=4,
            end=80,
            sizing_mode="stretch_width",
            value=15,
        )
        self.phi_slider = pmui.IntSlider(
            label="Resolution Phi",
            start=4,
            end=80,
            sizing_mode="stretch_width",
            value=14,
        )
        self.cmap_select = pmui.Select(
            label="Colormap",
            options=["viridis", "plasma", "inferno", "magma"],
            sizing_mode="stretch_width",
        )
        self.geom_select = pmui.Select(
            label="Geometry Type",
            options=["sliced_sphere", "structured_grid", "unstructured_grid", "string_data_sphere"],
            sizing_mode="stretch_width",
        )
        self.display_info = pmui.Checkbox(
            label="Display Info",
            value=True,
            sizing_mode="stretch_width",
        )

        self.plane_enabled = pmui.Checkbox(
            label="Enable Plane (V to toggle)",
            value=False,
            sizing_mode="stretch_width",
        )
        self.clip_enabled = pmui.Checkbox(
            label="Enable Clip Plane (C to toggle)",
            value=False,
            sizing_mode="stretch_width",
        )
        self.clip_axis_select = pmui.Select(
            label="Clip Axis (X/Y/Z keys)",
            options=["x", "y", "z"],
            value="z",
            sizing_mode="stretch_width",
        )
        self.edges_visible = pmui.Checkbox(
            label="Show Edges",
            value=True,
            sizing_mode="stretch_width",
        )
        self.view_2d_mode = pmui.Checkbox(
            label="2D Top View (XY plane)",
            value=False,
            sizing_mode="stretch_width",
        )

        self.colorbar_visible = pmui.Checkbox(
            label="Show Colorbar",
            value=False,
            sizing_mode="stretch_width",
        )
        self.colorbar_scale = pmui.Select(
            label="Colorbar Scale",
            options=["linear", "log"],
            value="linear",
            sizing_mode="stretch_width",
        )
        self.colorbar_min = pmui.FloatInput(
            label="Colorbar Min",
            value=0.0,
            sizing_mode="stretch_width",
        )
        self.colorbar_max = pmui.FloatInput(
            label="Colorbar Max",
            value=1.0,
            sizing_mode="stretch_width",
        )

        self.theta_slider.param.watch(self._update_vtp_data, "value")
        self.phi_slider.param.watch(self._update_vtp_data, "value")
        self.cmap_select.param.watch(self._update_color, "value")
        self.geom_select.param.watch(self._update_vtp_data, "value")
        self.display_info.param.watch(self._update_info_display, "value")
        self.plane_enabled.param.watch(self._update_plane_enabled, "value")
        self.clip_enabled.param.watch(self._update_clip_enabled, "value")
        self.clip_axis_select.param.watch(self._update_clip_axis, "value")
        self.edges_visible.param.watch(self._update_edges_visible, "value")
        self.colorbar_visible.param.watch(self._update_colorbar_visible, "value")
        self.colorbar_scale.param.watch(self._update_colorbar_scale, "value")
        self.colorbar_min.param.watch(self._update_colorbar_range, "value")
        self.colorbar_max.param.watch(self._update_colorbar_range, "value")
        self.view_2d_mode.param.watch(self._update_view_2d_mode, "value")

        self.poly = create_sliced_sphere(
            theta_count=self.theta_slider.value,
            phi_count=self.phi_slider.value,
            cmap=self.cmap_select.value,
        )

        self.description = pmui.Typography("Hover to update...")
        self.description_clip = pmui.Typography("Enable clip to update...")

        self.vtk_view = VTKPlotter(sizing_mode="stretch_both")
        self.vtk_view.update_polydata(self.poly)

        self._update_colorbar_from_data()

        self.vtk_view.param.watch(self.update_description, "hover_cell_id")
        self.vtk_view.param.watch(self.update_description, "hover_cell_value")
        self.vtk_view.param.watch(self.update_description, "hover_position")

        self.vtk_view.param.watch(self.update_description_clip, "clip_origin")
        self.vtk_view.param.watch(self.update_description_clip, "clip_normal")

        self._init_clip_plane()
        self._update_clip_controls_visibility()

    def _init_clip_plane(self):
        self._update_clip_position()

    def update_description(self, event=None):
        self.description.object = f"""
        Hovered Cell ID: {self.vtk_view.hover_cell_id}
        Hovered Cell Value: {self.vtk_view.hover_cell_value}

        Hovered Coordinates:

        - X : {self.vtk_view.hover_position[0]:.3f}
        - Y : {self.vtk_view.hover_position[1]:.3f}
        - Z : {self.vtk_view.hover_position[2]:.3f}
        """

    def update_description_clip(self, event=None):
        self.description_clip.object = f"""
        Clip origin: {self.vtk_view.hover_cell_id}

        - X : {self.vtk_view.clip_origin[0]:.3f}
        - Y : {self.vtk_view.clip_origin[1]:.3f}
        - Z : {self.vtk_view.clip_origin[2]:.3f}

        Clip axis: {self.vtk_view.hover_cell_value}

        - X : {self.vtk_view.clip_normal[0]:.3f}
        - Y : {self.vtk_view.clip_normal[1]:.3f}
        - Z : {self.vtk_view.clip_normal[2]:.3f}
        """

    def show(self):
        pmui.Row(
            pmui.Column(
                self.geom_select,
                self.theta_slider,
                self.phi_slider,
                self.cmap_select,
                self.view_2d_mode,
                self.plane_enabled,
                self.clip_enabled,
                self.clip_axis_select,
                self.description_clip,
                self.edges_visible,
                self.colorbar_visible,
                self.colorbar_scale,
                self.colorbar_min,
                self.colorbar_max,
                self.display_info,
                self.description,
                width=300,
            ),
            self.vtk_view,
            sizing_mode="stretch_both",
        ).show()

    def _update_vtp_data(self, event=None):
        print("Updating VTKPlotter data...")
        if self.geom_select.value == "structured_grid":
            mesh = create_uniform_structured_grid(
                nx=self.theta_slider.value,
                ny=self.phi_slider.value,
                nz=self.phi_slider.value,
                spacing=1.0 / self.theta_slider.value,
                cmap=self.cmap_select.value,
            )
        elif self.geom_select.value == "unstructured_grid":
            mesh = create_random_tetrahedral_mesh(
                n_tetras=max(self.theta_slider.value * 2, 10),
                seed=42,
                cmap=self.cmap_select.value,
            )
        elif self.geom_select.value == "string_data_sphere":
            mesh = create_sphere_with_string_data(
                theta_count=self.theta_slider.value,
                phi_count=self.phi_slider.value,
            )
        else:
            mesh = create_sliced_sphere(
                theta_count=self.theta_slider.value,
                phi_count=self.phi_slider.value,
                cmap=self.cmap_select.value,
            )

        self.poly = mesh
        self.vtk_view.update_polydata(mesh)
        self._update_colorbar_from_data()

    def _update_colorbar_from_data(self):
        if hasattr(self, 'poly') and self.poly is not None:
            if "cell_value" in self.poly.cell_data:
                cell_value = self.poly["cell_value"]
                if len(cell_value) or isinstance(cell_value[0], str):
                    self.vtk_view.colorbar_visible = False
                    return

                vmin = float(cell_value.min())
                vmax = float(cell_value.max())
                self.vtk_view.colorbar_min = vmin
                self.vtk_view.colorbar_max = vmax
                self.colorbar_min.value = vmin
                self.colorbar_max.value = vmax

            cmap_obj = plt.get_cmap(self.cmap_select.value)
            num_colors = 100
            normalized_colors = cmap_obj(np.linspace(0, 1, num_colors))
            self.vtk_view.colorbar_colors = normalized_colors[:, :3].tolist()

    def _update_color(self, event=None):
        set_color(self.poly, cmap=self.cmap_select.value)
        self.vtk_view.update_colors(self.poly)
        self._update_colorbar_from_data()

    def _update_info_display(self, event=None):
        self.vtk_view.info = self.display_info.value

    def _update_clip_enabled(self, event=None):
        self.vtk_view.set_clip_enabled(self.clip_enabled.value)

    def _update_plane_enabled(self, event=None):
        self.vtk_view.set_plane_enabled(self.plane_enabled.value)

    def _update_clip_axis(self, event=None):
        self.vtk_view.set_clip_axis(self.clip_axis_select.value)
        self._update_clip_position()

    def _update_edges_visible(self, event=None):
        self.vtk_view.edges_visible = self.edges_visible.value

    def _update_colorbar_visible(self, event=None):
        self.vtk_view.colorbar_visible = self.colorbar_visible.value

    def _update_colorbar_scale(self, event=None):
        self.vtk_view.colorbar_scale = self.colorbar_scale.value

    def _update_colorbar_range(self, event=None):
        self.vtk_view.set_colorbar_range(
            vmin=self.colorbar_min.value,
            vmax=self.colorbar_max.value
        )

    def _update_clip_controls_visibility(self):
        is_2d = self.view_2d_mode.value
        self.plane_enabled.visible = not is_2d
        self.clip_enabled.visible = not is_2d
        self.clip_axis_select.visible = not is_2d
        self.description_clip.visible = not is_2d

    def _update_view_2d_mode(self, event=None):
        self.vtk_view.set_view_2d_mode(self.view_2d_mode.value)
        self._update_clip_controls_visibility()

    def _update_clip_position(self, event=None):
        if hasattr(self, 'poly') and self.poly is not None:
            bounds = self.poly.bounds
            axis_idx = {'x': 0, 'y': 1, 'z': 2}.get(self.clip_axis_select.value, 2)

            min_val = bounds[axis_idx * 2]
            max_val = bounds[axis_idx * 2 + 1]
            range_val = max_val - min_val
            pos = min_val + range_val / 2

            origin = [0.0, 0.0, 0.0]
            origin[axis_idx] = pos

            for i in range(3):
                if i != axis_idx:
                    origin[i] = (bounds[i * 2] + bounds[i * 2 + 1]) / 2

            self.vtk_view.set_clip_plane(origin=origin)


# =============================================================================
# Main entry point
# =============================================================================

if __name__ == "__main__":
    ExamplePanel().show()