import param
from panel.custom import JSComponent

import panel_material_ui as pmui

class VTKCone(JSComponent):
    """A Panel component that renders a VTK cone using VTK.js."""
    # Reactive properties to control the VTK scene
    resolution = param.Integer(default=6, bounds=(4, 80))
    representation = param.Integer(
        default=2, bounds=(0, 2)
    )  # 0: Points, 1: Wireframe, 2: Surface

    _importmap = {
        "imports": {
            "@kitware/vtk.js": "https://esm.sh/@kitware/vtk.js@35.15.1",
        }
    }

    # ECMAScript Module (ESM) for the VTK.js rendering logic
    _esm = "./src/app.js"


if __name__ == "__main__":
    # Serve the component
    resolution_slider = pmui.IntSlider(
        name="Resolution",
        start=4,
        end=80,
        width=150,
    )
    representation_selector = pmui.Select(
        name="Representation",
        options=["Points", "Wireframe", "Surface"],
        width=150,
    )

    vtk_cone = VTKCone(sizing_mode="stretch_both")
    resolution_slider.link(vtk_cone, value="resolution")

    def update_representation(event):
        if event.new == "Points":
            vtk_cone.representation = 0
        elif event.new == "Wireframe":
            vtk_cone.representation = 1
        else:
            vtk_cone.representation = 2
    representation_selector.param.watch(update_representation, "value")

    pmui.Row(
        pmui.Column(
            resolution_slider,
            representation_selector,
            width=200,
            height=300,
        ),
        vtk_cone,
        sizing_mode="stretch_both"
    ).show()
