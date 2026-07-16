"""
scivianna_vtk - Interactive VTK/PyVista visualization with vtk.js for Panel.

This package provides Panel JSComponent-based tools for interactive 3D 
visualization using vtk.js, bundled as part of the scivianna_vtk pip package.

Features
--------
- Convert pyvista meshes (PolyData, UnstructuredGrid, StructuredGrid) to 
  vtk.js-compatible binary format
- Interactive 3D visualization with hover cell identification
- Clip plane visualization with data-accurate slice capping
- Plane overlay display
- Colormap-based cell coloring

Examples
--------
>>> from scivianna_vtk import VTKPlotter
>>> import pyvista as pv
>>> sphere = pv.Sphere()
>>> plotter = VTKPlotter()
>>> plotter.update_polydata(sphere)

>>> from scivianna_vtk import polydata_to_dict
>>> data = polydata_to_dict(sphere)

Modules
-------
plotter : VTK plotting and mesh conversion utilities
example : ExamplePanel UI component for interactive visualization
"""
from pathlib import Path

from .plotter import (
    VTKPlotter,
    polydata_to_dict,
    unstructured_grid_to_dict,
    extract_cell_stream,
    _pack,
    _pyvista_to_numpy,
)

__version__ = Path(__file__).parent / "VERSION"
__version__ = __version__.read_text().strip()

__all__ = [
    "VTKPlotter",
    "polydata_to_dict",
    "unstructured_grid_to_dict",
    "extract_cell_stream",
    "_pack",
    "_pyvista_to_numpy",
]