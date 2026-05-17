import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

import vtkCalculator from '@kitware/vtk.js/Filters/General/Calculator';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';

import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';

import vtkImplicitPlaneWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImplicitPlaneWidget';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';

import {
  AttributeTypes,
} from '@kitware/vtk.js/Common/DataModel/DataSetAttributes/Constants';

import {
  FieldDataTypes,
} from '@kitware/vtk.js/Common/DataModel/DataSet/Constants';

export function render({ model, el }) {

  // ----------------------------------------------------------------------------
  // Render window
  // ----------------------------------------------------------------------------

  const genericRenderWindow = vtkGenericRenderWindow.newInstance();

  genericRenderWindow.setContainer(el);

  el.style.width = '100%';
  el.style.height = '100%';
  el.style.overflow = 'hidden';

  genericRenderWindow.resize();

  const renderer = genericRenderWindow.getRenderer();
  const renderWindow = genericRenderWindow.getRenderWindow();

  renderer.setBackground(1.0, 1.0, 1.0);

  // ----------------------------------------------------------------------------
  // Cone source
  // ----------------------------------------------------------------------------

  const coneSource = vtkConeSource.newInstance({
    height: 5.0,
    radius: 2.0,
    resolution: model.resolution,
    capping: true,
  });

  // ----------------------------------------------------------------------------
  // Random scalar calculator
  // ----------------------------------------------------------------------------

  const filter = vtkCalculator.newInstance();

  filter.setInputConnection(coneSource.getOutputPort());

  let scalars = null;

  filter.setFormula({

    getArrays: (inputDataSets) => {

      const dataSet = inputDataSets[0];
      const numCells = dataSet.getNumberOfCells();

      if (!scalars || scalars.length !== numCells) {
        scalars = new Float32Array(numCells);
      }

      return {
        input: [],
        output: [
          {
            location: FieldDataTypes.CELL,
            name: 'Random',
            dataType: 'Float32Array',
            attribute: AttributeTypes.SCALARS,
            data: scalars,
          },
        ],
      };
    },

    evaluate: (arraysIn, arraysOut) => {

      const outputScalars = arraysOut[0].getData();

      for (let i = 0; i < outputScalars.length; i++) {
        outputScalars[i] = Math.random();
      }
    },
  });

  // ----------------------------------------------------------------------------
  // Main cone actor
  // ----------------------------------------------------------------------------

  const mapper = vtkMapper.newInstance();

  mapper.setInputConnection(filter.getOutputPort());
  mapper.setScalarVisibility(true);

  const actor = vtkActor.newInstance();

  actor.setMapper(mapper);

  renderer.addActor(actor);

  // ----------------------------------------------------------------------------
  // Cutting plane
  // ----------------------------------------------------------------------------

  const plane = vtkPlane.newInstance({
    origin: [0, 0, 0],
    normal: [1, 0, 0],
  });

  // ----------------------------------------------------------------------------
  // Cutter
  // ----------------------------------------------------------------------------

  const cutter = vtkCutter.newInstance();

  cutter.setCutFunction(plane);

  cutter.setInputConnection(filter.getOutputPort());

  const sliceMapper = vtkMapper.newInstance();

  sliceMapper.setInputConnection(cutter.getOutputPort());

  const sliceActor = vtkActor.newInstance();

  sliceActor.setMapper(sliceMapper);

  sliceActor.getProperty().setColor(1, 0, 0);
  sliceActor.getProperty().setLineWidth(5);

  renderer.addActor(sliceActor);

  // ----------------------------------------------------------------------------
  // Widget manager
  // ----------------------------------------------------------------------------

  const widgetManager = vtkWidgetManager.newInstance();

  widgetManager.setRenderer(renderer);

  // ----------------------------------------------------------------------------
  // Plane widget
  // ----------------------------------------------------------------------------

  const planeWidget = vtkImplicitPlaneWidget.newInstance();

  const widget = widgetManager.addWidget(planeWidget);

  widget.placeWidget(actor.getBounds());

  widget.setPlaceFactor(1.25);

  widgetManager.enablePicking();

  // ----------------------------------------------------------------------------
  // Widget interaction
  // ----------------------------------------------------------------------------

  widget.onInteractionEvent(() => {

    const state = widget.getWidgetState();

    const origin = state.getOrigin();
    const normal = state.getNormal();

    plane.setOrigin(...origin);
    plane.setNormal(...normal);

    cutter.modified();

    renderWindow.render();
  });

  // ----------------------------------------------------------------------------
  // Initial render
  // ----------------------------------------------------------------------------

  renderer.resetCamera();

  renderWindow.render();

  // ----------------------------------------------------------------------------
  // Resize support
  // ----------------------------------------------------------------------------

  const resizeObserver = new ResizeObserver(() => {

    genericRenderWindow.resize();

    renderWindow.render();
  });

  resizeObserver.observe(el);

  // ----------------------------------------------------------------------------
  // Model updates
  // ----------------------------------------------------------------------------

  model.on('resolution', () => {

    coneSource.setResolution(model.resolution);

    filter.modified();

    renderWindow.render();
  });

  model.on('representation', () => {

    actor
      .getProperty()
      .setRepresentation(model.representation);

    renderWindow.render();
  });

  // ----------------------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------------------

  return () => {

    resizeObserver.disconnect();

    widgetManager.delete();

    genericRenderWindow.delete();
  };
}