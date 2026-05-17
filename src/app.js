import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';

import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

export function render({ model, el }) {

  // ----------------------------------------------------------------------------
  // Renderer setup
  // ----------------------------------------------------------------------------

  const genericRenderWindow = vtkGenericRenderWindow.newInstance();
  genericRenderWindow.setContainer(el);

  el.style.width = '100%';
  el.style.height = '100%';
  el.style.overflow = 'hidden';

  genericRenderWindow.resize();

  const renderer = genericRenderWindow.getRenderer();
  const renderWindow = genericRenderWindow.getRenderWindow();

  renderer.setBackground(1, 1, 1);

  // ----------------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------------

  const toTyped = (buffer, Type) =>
    buffer ? new Type(buffer) : null;

  function makeCellArray(cell) {

    if (!cell || !cell.buffer) return null;

    const values = new Uint32Array(cell.buffer);

    const vtkArr = vtkCellArray.newInstance();
    vtkArr.setData(values);

    return vtkArr;
  }

  // ----------------------------------------------------------------------------
  // Build PolyData from Python binary payload
  // ----------------------------------------------------------------------------

  const data = model.vtp_data;

  const polyData = vtkPolyData.newInstance();

  // ----------------------------------------------------------------------------
  // POINTS
  // ----------------------------------------------------------------------------

  const pts = toTyped(data.points.buffer, Float32Array);

  const points = vtkPoints.newInstance();
  points.setData(pts, 3);

  polyData.setPoints(points);

  // ----------------------------------------------------------------------------
  // TOPOLOGY (CORRECT API)
  // ----------------------------------------------------------------------------

  const polys = makeCellArray(data.polys);
  const lines = makeCellArray(data.lines);
  const verts = makeCellArray(data.verts);
  const strips = makeCellArray(data.strips);

  if (polys) polyData.setPolys(polys);
  if (lines) polyData.setLines(lines);
  if (verts) polyData.setVerts(verts);
  if (strips) polyData.setStrips(strips);

  // ----------------------------------------------------------------------------
  // POINT DATA
  // ----------------------------------------------------------------------------

  const pointData = data.pointData || {};

  Object.entries(pointData).forEach(([name, entry]) => {

    const arr = toTyped(entry.buffer, Float32Array);

    const vtkArr = vtkDataArray.newInstance({
      name,
      values: arr,
      numberOfComponents: entry.components || 1,
    });

    polyData.getPointData().addArray(vtkArr);

    // default scalar
    polyData.getPointData().setScalars(vtkArr);
  });

  // ----------------------------------------------------------------------------
  // CELL DATA
  // ----------------------------------------------------------------------------

  const cellData = data.cellData || {};

  Object.entries(cellData).forEach(([name, entry]) => {

    const arr = toTyped(entry.buffer, Float32Array);

    const vtkArr = vtkDataArray.newInstance({
      name,
      values: arr,
      numberOfComponents: entry.components || 1,
    });

    polyData.getCellData().addArray(vtkArr);
  });

  // ----------------------------------------------------------------------------
  // Mapper / Actor
  // ----------------------------------------------------------------------------

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyData);
  mapper.setScalarVisibility(true);
  mapper.setColorByArrayName('cell_id');

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  const prop = actor.getProperty();

    prop.setRepresentationToSurface();
    prop.setEdgeVisibility(true);
    prop.setEdgeColor(0, 0, 0);
    prop.setAmbient(0.2);
    prop.setDiffuse(0.8);
    prop.setSpecular(0.1);

  renderer.addActor(actor);

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  renderer.resetCamera();
  renderWindow.render();

  // ----------------------------------------------------------------------------
  // Resize handling
  // ----------------------------------------------------------------------------

  const resizeObserver = new ResizeObserver(() => {
    genericRenderWindow.resize();
    renderWindow.render();
  });

  resizeObserver.observe(el);

  // ----------------------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------------------

  return () => {
    resizeObserver.disconnect();
    genericRenderWindow.delete();
  };
}