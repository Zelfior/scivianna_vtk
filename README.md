# scivianna-vtk

Interactive VTK/PyVista visualization with vtk.js for Panel.

## Installation

```bash
pip install scivianna-vtk
```

## Usage

```python
import param
import numpy as np
import panel_material_ui as pmui
from scivianna_vtk import VTKPlotter, polydata_to_dict
import pyvista as pv

# Create a simple sphere
sphere = pv.Sphere(theta_resolution=30, phi_resolution=30)

# Convert to vtk.js format
vtk_data = polydata_to_dict(sphere)

# Create plotter
plotter = VTKPlotter()
plotter.update_polydata(sphere)

# Show with Panel
plotter.show()
```

## Features

- Interactive 3D visualization using vtk.js
- Support for PolyData, UnstructuredGrid, StructuredGrid
- Cell hover information display
- Clip plane visualization and control
- Binary data transfer for efficient performance

## Dependencies

- panel >= 1.4.0
- param >= 2.0.0
- numpy >= 1.24.0
- pyvista >= 0.43.0
- vtk >= 9.0.0

## License

MIT