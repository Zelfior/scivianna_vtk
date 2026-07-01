# vtk_panel

Interactive 3D mesh visualization in the browser using Panel and vtk.js.

![vtk_panel demo](image/image.png)

## Features

- 🎨 Interactive 3D visualization with hover information
- 🔧 Dynamic geometry control via sliders
- ✂️ Clip plane utility for viewing interior geometry
- 📊 Multiple geometry types: spheres, structured grids, unstructured grids
- 🌈 Configurable colormaps (viridis, plasma, inferno, magma)
- 🚀 Runs in browser - no local VTK installation needed for viewers

## Installation

```bash
pip install -e .
```

Requirements:
- Python >= 3.10
- panel >= 1.0.0
- panel-material-ui >= 0.1.0
- pyvista >= 0.40.0
- vtk >= 9.0.0
- matplotlib >= 3.5.0
- numpy >= 1.20.0
- param >= 2.0.0

## Usage

Run the example application:

```bash
python -m vtk_panel.example
```

This launches a web server and opens a browser window with:
- **Geometry Type selector**: Choose between sliced_sphere, structured_grid, or unstructured_grid
- **Resolution sliders**: Control mesh resolution (theta and phi)
- **Colormap selector**: Change the color scheme
- **Display Info toggle**: Show/hide hover information panel
- **3D viewer**: Interactive visualization with cell hover feedback

### Clip Plane Controls

Use the clip plane to see inside the geometry. You can control it via keyboard or Python:

**Keyboard Controls (in the browser):**
- `C` - Toggle clip plane on/off
- `X`, `Y`, `Z` - Set clip plane normal axis
- `↑` / `+` - Move plane forward along normal
- `↓` / `-` - Move plane backward along normal
- Hold `Shift` while moving for fine adjustment (0.1 step instead of 1.0)

**Python Controls:**

```python
from vtk_panel.example import ExamplePanel

panel = ExamplePanel()

# Enable/disable clipping
panel.vtk_view.set_clip_enabled(True)
panel.vtk_view.set_clip_enabled(False)

# Set plane orientation
panel.vtk_view.set_clip_axis('z')  # X, Y, or Z
panel.vtk_view.set_clip_axis('x', sign=-1)  # Negative direction

# Set position (origin and normal)
panel.vtk_view.set_clip_plane(origin=[0.5, 0.5, 0.5])
panel.vtk_view.set_clip_plane(normal=[0, 0, 1])

# Move along current normal
panel.vtk_view.move_clip_plane(0.1)  # Move forward
panel.vtk_view.move_clip_plane(-0.1) # Move backward

# Get current state
state = panel.vtk_view.clip_plane_state
print(f"Enabled: {state['enabled']}")
print(f"Origin: {state['origin']}")
print(f"Normal: {state['normal']}")

# Get center and axes directly
center = panel.vtk_view.clip_center  # [x, y, z]
axes = panel.vtk_view.clip_axes      # [nx, ny, nz]
```

**JavaScript Console Controls:**

```javascript
// Enable clipping
window.vtkPanelClipPlane.setEnabled(true);

// Move the plane along its normal
window.vtkPanelClipPlane.move(0.1);  // Move forward
window.vtkPanelClipPlane.move(-0.1); // Move backward

// Change orientation
window.vtkPanelClipPlane.setAxis('x', 1);  // X-axis normal
window.vtkPanelClipPlane.setAxis('y', -1); // Y-axis normal  
window.vtkPanelClipPlane.setAxis('z', 1);  // Z-axis normal (default)

// Get current state
const state = window.vtkPanelClipPlane.getState();
console.log(state); // { enabled: true, origin: [x,y,z], normal: [nx,ny,nz] }
```

## Project Structure

```
vtk_js/
├── vtk_panel/
│   ├── __init__.py
│   ├── plotter.py      # VTKPlotter component and conversion functions
│   └── example.py      # Example implementation with geometry creation
├── tests/
│   └── test_example.py # Pytest tests
├── pyproject.toml      # Package configuration
├── AGENT.md            # Developer documentation
└── README.md           # This file
```
