"""
scivianna_vtk - Python module for interactive VTK/PyVista visualization with vtk.js

This package provides Panel components for interactive 3D visualization using vtk.js,
bundled as part of the scivianna_vtk pip package.
"""

from .plotter import (
    VTKPlotter,
    polydata_to_dict,
    unstructured_grid_to_dict,
    extract_cell_stream,
    _pack,
    _pyvista_to_numpy,
)

__version__ = "0.1.0"
__all__ = [
    "VTKPlotter",
    "polydata_to_dict",
    "unstructured_grid_to_dict",
    "extract_cell_stream",
    "_pack",
    "_pyvista_to_numpy",
]