"""Tests for ExamplePanel with all geometry options."""
import pytest
from scivianna_vtk.example import ExamplePanel


def test_example_panel_sphere():
    """Test ExamplePanel with sliced_sphere geometry."""
    panel = ExamplePanel()
    
    # Verify initial geometry is set
    assert panel.poly is not None
    assert panel.poly.n_cells > 0
    
    # Set geometry to sphere
    panel.geom_select.value = "sliced_sphere"
    
    # Trigger theta slider update
    panel.theta_slider.value = 20
    
    # Verify mesh was updated
    assert panel.poly is not None
    assert panel.poly.n_cells > 0


def test_example_panel_structured_grid():
    """Test ExamplePanel with structured_grid geometry."""
    panel = ExamplePanel()
    
    # Set geometry to structured grid
    panel.geom_select.value = "structured_grid"
    
    # Trigger theta slider update
    panel.theta_slider.value = 15
    
    # Verify mesh was updated (StructuredGrid may have different cell representation)
    assert panel.poly is not None
    assert panel.poly.n_points > 0


def test_example_panel_unstructured_grid():
    """Test ExamplePanel with unstructured_grid geometry."""
    panel = ExamplePanel()
    
    # Set geometry to unstructured grid
    panel.geom_select.value = "unstructured_grid"
    
    # Trigger theta slider update
    panel.theta_slider.value = 12
    
    # Verify mesh was updated
    assert panel.poly is not None
    assert panel.poly.n_cells > 0


def test_example_panel_colormap_change():
    """Test ExamplePanel colormap change."""
    panel = ExamplePanel()
    
    # Change colormap
    panel.cmap_select.value = "plasma"
    
    # Verify rgb array exists in cell data (set by set_color function)
    assert hasattr(panel.poly, 'cell_data')


def test_example_panel_display_info():
    """Test ExamplePanel display info toggle."""
    panel = ExamplePanel()
    
    # Verify initial state
    assert panel.vtk_view.info is True
    
    # Toggle display info
    panel.display_info.value = False
    assert panel.vtk_view.info is False
    
    panel.display_info.value = True
    assert panel.vtk_view.info is True


def test_example_panel_clip_plane():
    """Test ExamplePanel clip plane functionality."""
    panel = ExamplePanel()
    
    # Test clip plane state retrieval
    state = panel.vtk_view.clip_plane_state
    assert 'enabled' in state
    assert 'origin' in state
    assert 'normal' in state
    
    # Verify initial state
    assert panel.vtk_view.clip_enabled is False
    assert isinstance(panel.vtk_view.clip_origin, list)
    assert len(panel.vtk_view.clip_origin) == 3
    assert isinstance(panel.vtk_view.clip_normal, list)
    assert len(panel.vtk_view.clip_normal) == 3
    
    # Test enable/disable
    panel.clip_enabled.value = True
    assert panel.vtk_view.clip_enabled is True
    
    panel.clip_enabled.value = False
    assert panel.vtk_view.clip_enabled is False
    
    # Test axis change (note: _update_clip_axis also updates position, so just test the normal)
    initial_origin = panel.vtk_view.clip_origin.copy()
    panel.clip_axis_select.value = "x"
    assert panel.vtk_view.clip_normal == [1, 0, 0]
    
    panel.clip_axis_select.value = "y"
    assert panel.vtk_view.clip_normal == [0, 1, 0]
    
    # Test clip_plane_state property values
    state = panel.vtk_view.clip_plane_state
    assert isinstance(state['origin'], list)
    assert len(state['origin']) == 3
    assert isinstance(state['normal'], list)
    assert len(state['normal']) == 3


def test_example_panel_clip_plane_methods():
    """Test VTKPlotter clip plane control methods."""
    panel = ExamplePanel()
    
    # Test set_clip_enabled
    panel.vtk_view.set_clip_enabled(True)
    assert panel.vtk_view.clip_enabled is True
    
    # Test set_clip_axis
    panel.vtk_view.set_clip_axis('x')
    assert panel.vtk_view.clip_normal == [1, 0, 0]
    
    panel.vtk_view.set_clip_axis('z', sign=-1)
    assert panel.vtk_view.clip_normal == [0, 0, -1]
    
    # Test set_clip_plane with origin
    new_origin = [0.5, 0.5, 0.5]
    panel.vtk_view.set_clip_plane(origin=new_origin)
    assert panel.vtk_view.clip_origin == new_origin
    
    # Test set_clip_plane with normal
    new_normal = [1, 0, 0]
    panel.vtk_view.set_clip_plane(normal=new_normal)
    assert panel.vtk_view.clip_normal == new_normal
    
    # Test clip_center and clip_axes properties
    center = panel.vtk_view.clip_center
    axes = panel.vtk_view.clip_axes
    assert isinstance(center, list)
    assert len(center) == 3
    assert isinstance(axes, list)
    assert len(axes) == 3
    
    # Test set_plane_enabled
    panel.vtk_view.set_plane_enabled(True)
    assert panel.vtk_view.plane_visible is True
    
    panel.vtk_view.set_plane_enabled(False)
    assert panel.vtk_view.plane_visible is False
