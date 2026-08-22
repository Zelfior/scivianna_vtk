/**
 * Main VTK Plotter component for Panel.
 * 
 * This module orchestrates the VTK.js rendering pipeline, integrating
 * geometry loading, clip plane controls, feature edges, hover picking,
 * and colorbar visualization.
 */

import '@kitware/vtk.js/Rendering/Profiles/Geometry';

import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';

import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkStringArray from '@kitware/vtk.js/Common/Core/StringArray';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';

import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkClipPolyData from '@kitware/vtk.js/Filters/Core/ClipPolyData';
import vtkImplicitPlaneWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImplicitPlaneWidget';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';

import vtkScalarBarActor from '@kitware/vtk.js/Rendering/Core/ScalarBarActor';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';

import vtkInteractorStyleManipulator from '@kitware/vtk.js/Interaction/Style/InteractorStyleManipulator';
import vtkMouseCameraTrackballPanManipulator from '@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballPanManipulator';
import vtkMouseCameraTrackballZoomManipulator from '@kitware/vtk.js/Interaction/Manipulators/MouseCameraTrackballZoomManipulator';

// Import modular components
import { toTyped, getArrayValue, makeCellArray, toStrings } from './src/utils.js';
import { buildFeatureEdges, createEdgeActor, loadEdgesInto } from './src/edges.js';
import { updateHover, clearHighlight, applyHighlight, computeGroupKey } from './src/hover.js';

export function render({ model, el }) {

  // =============================================================================
  // Renderer setup
  // =============================================================================

  const genericRenderWindow = vtkGenericRenderWindow.newInstance();
  genericRenderWindow.setContainer(el);

  el.style.width = '100%';
  el.style.height = '100%';
  el.style.overflow = 'hidden';
  el.style.position = 'relative';

  genericRenderWindow.resize();

  const renderer = genericRenderWindow.getRenderer();
  const renderWindow = genericRenderWindow.getRenderWindow();
  const interactor = renderWindow.getInteractor();
  const openGLRenderWindow = genericRenderWindow.getApiSpecificRenderWindow();

  // =============================================================================
  // Interactor Styles Setup
  // =============================================================================

  const defaultInteractorStyle = interactor.getInteractorStyle();

  const panZoomInteractorStyle = vtkInteractorStyleManipulator.newInstance();
  panZoomInteractorStyle.addMouseManipulator(
    vtkMouseCameraTrackballPanManipulator.newInstance({ button: 1 })
  );
  panZoomInteractorStyle.addMouseManipulator(
    vtkMouseCameraTrackballPanManipulator.newInstance({ button: 2 })
  );
  panZoomInteractorStyle.addMouseManipulator(
    vtkMouseCameraTrackballZoomManipulator.newInstance({ button: 3 })
  );
  panZoomInteractorStyle.addMouseManipulator(
    vtkMouseCameraTrackballZoomManipulator.newInstance({ scrollEnabled: true })
  );

  renderer.setBackground(1, 1, 1);

  // =============================================================================
  // 2D Mode State
  // =============================================================================

  let is2DMode = model.view_2d_mode !== undefined ? model.view_2d_mode : false;
  let savedCameraState = null;

  // =============================================================================
  // Tooltip
  // =============================================================================

  const tooltip = document.createElement('div');
  tooltip.style.position = 'absolute';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.background = 'rgba(0,0,0,0.8)';
  tooltip.style.color = 'white';
  tooltip.style.padding = '6px 8px';
  tooltip.style.fontSize = '12px';
  tooltip.style.fontFamily = 'monospace';
  tooltip.style.borderRadius = '4px';
  tooltip.style.whiteSpace = 'nowrap';
  tooltip.style.display = 'none';
  tooltip.style.zIndex = '100';
  el.appendChild(tooltip);

  // =============================================================================
  // Colorbar
  // =============================================================================

  const scalarBarActor = vtkScalarBarActor.newInstance();
  const lookupTable = vtkColorTransferFunction.newInstance();
  lookupTable.setNanColor([1.0, 1.0, 1.0, 1.0]);

  scalarBarActor.setScalarsToColors(lookupTable);

  let colorbarVisible = model.colorbar_visible !== undefined ? model.colorbar_visible : false;
  let colorbarScale = model.colorbar_scale !== undefined ? model.colorbar_scale : 'linear';
  let colorbarMin = model.colorbar_min !== undefined ? model.colorbar_min : 0.0;
  let colorbarMax = model.colorbar_max !== undefined ? model.colorbar_max : 1.0;
  let colorbarColors = model.colorbar_colors !== undefined && model.colorbar_colors !== null
    ? model.colorbar_colors
    : [[0.0, 0.0, 1.0], [0.0, 1.0, 0.0], [1.0, 0.0, 0.0]];

  scalarBarActor.setVisibility(colorbarVisible);
  scalarBarActor.setAxisLabel('');
  scalarBarActor.setTickTextStyle({ fontColor: '#666666' });

  function rebuildLookupTable() {
    lookupTable.removeAllPoints();

    const colors = (colorbarColors && colorbarColors.length >= 2)
      ? colorbarColors
      : [[0.0, 0.0, 1.0], [0.0, 1.0, 0.0], [1.0, 0.0, 0.0]];

    let min = colorbarMin;
    let max = colorbarMax;

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      const base = Number.isFinite(min) ? min : 0;
      min = base;
      max = base + 1;
    }

    const span = max - min;
    const n = colors.length;
    const useLog = colorbarScale === 'log' && min > 0 && max > 0;
    const logMin = useLog ? Math.log10(min) : 0;
    const logMax = useLog ? Math.log10(max) : 0;
    const minStep = span > 0 ? span * 1e-6 : 1e-6;

    let lastValue = -Infinity;
    colors.forEach((rgb, i) => {
      const t = n === 1 ? 0 : i / (n - 1);
      let value = useLog
        ? Math.pow(10, logMin + t * (logMax - logMin))
        : min + t * span;

      if (value <= lastValue) {
        value = lastValue + minStep;
      }
      lastValue = value;

      lookupTable.addRGBPoint(value, rgb[0], rgb[1], rgb[2]);
    });

    lookupTable.updateRange();
  }

  function updateColorbarRange() { rebuildLookupTable(); }
  function setColorbarVisible(visible) {
    colorbarVisible = visible;
    scalarBarActor.setVisibility(visible);
    renderWindow.render();
  }
  function setColorbarScale(scale) {
    colorbarScale = scale;
    rebuildLookupTable();
    renderWindow.render();
  }
  function setColorbarRange(min, max) {
    colorbarMin = min;
    colorbarMax = max;
    rebuildLookupTable();
    renderWindow.render();
  }
  function setColorbarColors(colors) {
    colorbarColors = colors;
    rebuildLookupTable();
    renderWindow.render();
  }

  renderer.addActor(scalarBarActor);
  rebuildLookupTable();

  // =============================================================================
  // Clip Plane and Widget
  // =============================================================================

  const plane = vtkPlane.newInstance();
  plane.setNormal(0, 0, 1);
  plane.setOrigin(0, 0, 0);

  const widget = vtkImplicitPlaneWidget.newInstance();
  const widgetState = widget.getWidgetState();

  function syncWidgetFromPlane() {
    widgetState.setOrigin(clipOrigin);
    widgetState.setNormal(clipNormal);
  }

  const widgetManager = vtkWidgetManager.newInstance();
  widgetManager.setRenderer(renderer);
  const widgetInstance = widgetManager.addWidget(widget);
  widgetManager.enablePicking();

  let planeEnabled = model.plane_visible !== undefined ? model.plane_visible : true;

  function setPlaneWidgetVisible(enabled) {
    planeEnabled = enabled;
    widgetInstance.setVisibility(enabled);
    renderWindow.render();
  }
  setPlaneWidgetVisible(planeEnabled);

  function initializeWidget() {
    const bounds = polyData.getBounds();
    const size = [bounds[1] - bounds[0], bounds[3] - bounds[2], bounds[5] - bounds[4]];
    if (size[0] > 0 || size[1] > 0 || size[2] > 0) {
      widget.placeWidget(bounds);
    }
  }

  // =============================================================================
  // Persistent pipeline
  // =============================================================================

  const polyData = vtkPolyData.newInstance();

  const mapper = vtkMapper.newInstance();
  mapper.setInputData(polyData);
  mapper.setScalarVisibility(true);
  mapper.setScalarModeToUseCellFieldData();
  mapper.setColorModeToDirectScalars();
  mapper.setColorByArrayName('rgb');

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);

  const prop = actor.getProperty();
  prop.setRepresentationToSurface();
  prop.setEdgeVisibility(false);
  prop.setAmbient(0.2);
  prop.setDiffuse(0.8);
  prop.setSpecular(0.1);
  prop.setOpacity(1.0);

  renderer.addActor(actor);

  // =============================================================================
  // Clipped Actor Setup
  // =============================================================================

  const clipper = vtkClipPolyData.newInstance();
  clipper.setClipFunction(plane);
  clipper.setInputData(polyData);

  const clipMapper = vtkMapper.newInstance();
  clipMapper.setInputConnection(clipper.getOutputPort());
  clipMapper.setScalarVisibility(true);
  clipMapper.setScalarModeToUseCellFieldData();
  clipMapper.setColorModeToDirectScalars();
  clipMapper.setColorByArrayName('rgb');

  const clipActor = vtkActor.newInstance();
  clipActor.setMapper(clipMapper);

  const clipProp = clipActor.getProperty();
  clipProp.setRepresentationToSurface();
  clipProp.setEdgeVisibility(false);
  clipProp.setAmbient(0.2);
  clipProp.setDiffuse(0.8);
  clipProp.setSpecular(0.1);

  renderer.addActor(clipActor);

  // =============================================================================
  // Cap Actor Setup
  // =============================================================================

  const capPolyData = vtkPolyData.newInstance();

  const capMapper = vtkMapper.newInstance();
  capMapper.setInputData(capPolyData);
  capMapper.setScalarVisibility(true);
  capMapper.setScalarModeToUseCellFieldData();
  capMapper.setColorModeToDirectScalars();
  capMapper.setColorByArrayName('rgb');

  let hasCapSlice = false;

  const capActor = vtkActor.newInstance();
  capActor.setMapper(capMapper);

  const capProp = capActor.getProperty();
  capProp.setRepresentationToSurface();
  capProp.setEdgeVisibility(false);
  capProp.setAmbient(0.3);
  capProp.setDiffuse(0.7);
  capProp.setSpecular(0.0);
  capProp.setLighting(true);

  capActor.setVisibility(false);
  renderer.addActor(capActor);

  // =============================================================================
  // Feature Edges
  // =============================================================================

  const vtkClasses = {
    vtkPoints,
    vtkCellArray,
    vtkDataArray,
    vtkPolyData,
    vtkMapper,
    vtkActor,
  };

  const { edgePolyData: mainEdgePolyData, edgeActor: mainEdgeActor } = createEdgeActor(vtkClasses);
  const { edgePolyData: clipEdgePolyData, edgeActor: clipEdgeActor } = createEdgeActor(vtkClasses);
  const { edgePolyData: capEdgePolyData, edgeActor: capEdgeActor } = createEdgeActor(vtkClasses);

  // Add edge actors to the renderer
  renderer.addActor(mainEdgeActor);
  renderer.addActor(clipEdgeActor);
  renderer.addActor(capEdgeActor);

  let hasMainEdges = false;
  let hasClipEdges = false;
  let hasCapEdges = false;

  let edgesVisible = (model.edges_visible !== undefined && model.edges_visible !== null) ? model.edges_visible : true;
  let mainEdgesStale = false;
  let clipEdgesStale = false;
  let capEdgesStale = false;

  function syncEdgeVisibility() {
    mainEdgeActor.setVisibility(edgesVisible && hasMainEdges && actor.getVisibility());
    clipEdgeActor.setVisibility(edgesVisible && hasClipEdges && clipActor.getVisibility());
    capEdgeActor.setVisibility(edgesVisible && hasCapEdges && capActor.getVisibility());
  }

  function refreshMainEdges() {
    if (edgesVisible) {
      hasMainEdges = loadEdgesInto(polyData, mainEdgePolyData, vtkClasses);
      mainEdgesStale = false;
    } else {
      mainEdgesStale = true;
    }
    syncEdgeVisibility();
  }
  function refreshClipEdges() {
    if (edgesVisible) {
      hasClipEdges = loadEdgesInto(clipper.getOutputData(), clipEdgePolyData, vtkClasses);
      clipEdgesStale = false;
    } else {
      clipEdgesStale = true;
    }
    syncEdgeVisibility();
  }
  function refreshCapEdges() {
    if (edgesVisible) {
      hasCapEdges = hasCapSlice ? loadEdgesInto(capPolyData, capEdgePolyData, vtkClasses) : false;
      capEdgesStale = false;
    } else {
      capEdgesStale = true;
    }
    syncEdgeVisibility();
  }

  function updateCapVisibility() {
    capActor.setVisibility(clipEnabled && hasCapSlice);
    syncPickList();
    syncEdgeVisibility();
    renderUpdate(true);
  }

  function setEdgesVisible(enabled) {
    const wasVisible = edgesVisible;
    edgesVisible = enabled;

    if (enabled && !wasVisible) {
      if (mainEdgesStale) {
        hasMainEdges = loadEdgesInto(polyData, mainEdgePolyData, vtkClasses);
        mainEdgesStale = false;
      }
      if (clipEdgesStale) {
        hasClipEdges = loadEdgesInto(clipper.getOutputData(), clipEdgePolyData, vtkClasses);
        clipEdgesStale = false;
      }
      if (capEdgesStale) {
        hasCapEdges = hasCapSlice ? loadEdgesInto(capPolyData, capEdgePolyData, vtkClasses) : false;
        capEdgesStale = false;
      }
    }

    syncEdgeVisibility();
    renderWindow.render();
  }

  // =============================================================================
  // Clip Plane Controls
  // =============================================================================

  let clipEnabled = model.clip_enabled || false;
  let clipNormal = model.clip_normal || [0, 0, 1];
  let clipOrigin = model.clip_origin || [0, 0, 0];

  plane.setOrigin(clipOrigin[0], clipOrigin[1], clipOrigin[2]);
  plane.setNormal(clipNormal[0], clipNormal[1], clipNormal[2]);

  clipActor.setVisibility(clipEnabled);
  actor.setVisibility(!clipEnabled);

  widgetInstance.onStartInteractionEvent(() => {
    capActor.setVisibility(false);
    mainEdgeActor.setVisibility(false);
    clipEdgeActor.setVisibility(false);
    capEdgeActor.setVisibility(false);
    syncPickList();
  });

  widgetInstance.onInteractionEvent(() => {
    const state = widgetInstance.getWidgetState();
    const normal = state.getNormal();
    const origin = state.getOrigin();

    clipOrigin = [origin[0], origin[1], origin[2]];
    clipNormal = [normal[0], normal[1], normal[2]];

    plane.setNormal(normal[0], normal[1], normal[2]);
    plane.setOrigin(origin[0], origin[1], origin[2]);

    plane.modified();
    clipper.modified();
    renderWindow.render();
  });

  widgetInstance.onEndInteractionEvent(() => {
    syncClipStateToModel();
    refreshClipEdges();
    syncEdgeVisibility();
    renderWindow.render();
  });

  function updateClipPlane(origin, normal) {
    if (origin) {
      clipOrigin = origin;
      plane.setOrigin(origin[0], origin[1], origin[2]);
    }
    if (normal) {
      clipNormal = normal;
      plane.setNormal(normal[0], normal[1], normal[2]);
    }

    plane.modified();
    clipper.modified();
    clipper.update();
    refreshClipEdges();
    capActor.setVisibility(false);
    syncPickList();
    syncWidgetFromPlane();
    renderWindow.render();
  }

  function setClipEnabled(enabled) {
    clipEnabled = enabled;
    clipActor.setVisibility(enabled);
    actor.setVisibility(!enabled);
    updateCapVisibility();
    renderWindow.render();
  }

  function moveClipPlane(offset) {
    const newOrigin = [
      clipOrigin[0] + clipNormal[0] * offset,
      clipOrigin[1] + clipNormal[1] * offset,
      clipOrigin[2] + clipNormal[2] * offset,
    ];
    updateClipPlane(newOrigin, null);
  }

  function setClipAxis(axis) {
    const axes = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
    const target = axes[axis];
    const eps = 1e-6;

    const aligned =
      Math.abs(Math.abs(clipNormal[0]) - Math.abs(target[0])) < eps &&
      Math.abs(Math.abs(clipNormal[1]) - Math.abs(target[1])) < eps &&
      Math.abs(Math.abs(clipNormal[2]) - Math.abs(target[2])) < eps;

    if (aligned) {
      updateClipPlane(null, [-clipNormal[0], -clipNormal[1], -clipNormal[2]]);
    } else {
      updateClipPlane(null, target);
    }
  }

  function autoClipPlane() {
    const bounds = polyData.getBounds();
    const center = [
      (bounds[0] + bounds[1]) / 2,
      (bounds[2] + bounds[3]) / 2,
      (bounds[4] + bounds[5]) / 2,
    ];
    clipOrigin = center;
    plane.setOrigin(center[0], center[1], center[2]);
    clipper.modified();
    syncWidgetFromPlane();
    renderWindow.render();
  }

  autoClipPlane();

  function renderUpdate(resetCamera = false) {
    mapper.modified();
    if (resetCamera) {
      renderer.resetCamera();
    } else {
      renderer.resetCameraClippingRange();
    }
    renderWindow.render();
  }

  // =============================================================================
  // 2D Mode Control
  // =============================================================================

  const camera = renderer.getActiveCamera();

  function apply2DView() {
    if (!savedCameraState) {
      savedCameraState = {
        position: camera.getPosition(),
        focalPoint: camera.getFocalPoint(),
        viewUp: camera.getViewUp(),
        parallelProjection: camera.getParallelProjection(),
        parallelScale: camera.getParallelScale(),
      };
    }

    const bounds = polyData.getBounds();
    const center = [(bounds[0]+bounds[1])/2, (bounds[2]+bounds[3])/2, (bounds[4]+bounds[5])/2];
    const xSize = bounds[1] - bounds[0];
    const ySize = bounds[3] - bounds[2];
    const maxXYSize = Math.max(xSize, ySize, 1);

    camera.setParallelProjection(true);
    camera.setParallelScale(maxXYSize / 2);
    camera.setFocalPoint(center[0], center[1], center[2]);
    camera.setPosition(center[0], center[1], center[2] + maxXYSize * 2);
    camera.setViewUp(0, -1, 0);
    camera.setDistance(maxXYSize * 2);

    renderer.resetCameraClippingRange();
  }

  function restore3DView() {
    if (savedCameraState) {
      camera.setPosition(...savedCameraState.position);
      camera.setFocalPoint(...savedCameraState.focalPoint);
      camera.setViewUp(...savedCameraState.viewUp);
      camera.setParallelProjection(savedCameraState.parallelProjection);
      camera.setParallelScale(savedCameraState.parallelScale);
      savedCameraState = null;
    }
  }

  function set2DMode(enabled) {
    is2DMode = enabled;

    if (enabled) {
      apply2DView();
      interactor.setInteractorStyle(panZoomInteractorStyle);
    } else {
      restore3DView();
      interactor.setInteractorStyle(defaultInteractorStyle);
    }
    renderWindow.render();
  }

  // =============================================================================
  // Initial load
  // =============================================================================

  function updateGeometry(data) {
    if (!data) return;

    const pts = toTyped(data.points?.buffer, data.points?.dtype || "float32");
    if (pts) {
      const points = vtkPoints.newInstance();
      points.setData(pts, 3);
      polyData.setPoints(points);
    }

    polyData.setPolys(makeCellArray(data.polys));
    polyData.setLines(makeCellArray(data.lines));
    polyData.setVerts(makeCellArray(data.verts));
    polyData.setStrips(makeCellArray(data.strips));

    polyData.modified();
    clipper.modified();

    refreshMainEdges();
  }

  function updateScalars(data) {
    if (!data) return;

    const pd = polyData.getPointData();
    pd.initialize();

    Object.entries(data.pointData || {}).forEach(([name, entry], idx) => {
      let vtkArr;
      if (entry.dtype === 'string') {
        const strings = toStrings(new Uint8Array(entry.buffer), entry.numTuples, entry.stringLength);
        vtkArr = vtkStringArray.newInstance({ name, values: strings, numberOfComponents: 1 });
      } else {
        vtkArr = vtkDataArray.newInstance({
          name,
          values: toTyped(entry.buffer, entry.dtype),
          numberOfComponents: entry.components,
        });
      }
      pd.addArray(vtkArr);
      if (idx === 0) pd.setScalars(vtkArr);
    });

    const cd = polyData.getCellData();
    cd.initialize();

    Object.entries(data.cellData || {}).forEach(([name, entry]) => {
      let vtkArr;
      if (entry.dtype === 'string') {
        const strings = toStrings(new Uint8Array(entry.buffer), entry.numTuples, entry.stringLength);
        vtkArr = vtkStringArray.newInstance({ name, values: strings, numberOfComponents: 1 });
      } else {
        vtkArr = vtkDataArray.newInstance({
          name,
          values: toTyped(entry.buffer, entry.dtype),
          numberOfComponents: entry.components,
        });
      }
      cd.addArray(vtkArr);
    });

    pd.modified();
    cd.modified();
    polyData.modified();
    clipper.modified();
  }

  function updateCapSlice(data) {
    if (!data) { hasCapSlice = false; return; }

    const pts = toTyped(data.points?.buffer, data.points?.dtype || 'float32');
    if (pts) {
      const points = vtkPoints.newInstance();
      points.setData(pts, 3);
      capPolyData.setPoints(points);
    }

    capPolyData.setPolys(makeCellArray(data.polys));
    capPolyData.setLines(makeCellArray(data.lines));
    capPolyData.setVerts(makeCellArray(data.verts));
    capPolyData.setStrips(makeCellArray(data.strips));

    const pd = capPolyData.getPointData();
    pd.initialize();
    Object.entries(data.pointData || {}).forEach(([name, entry], idx) => {
      let vtkArr;
      if (entry.dtype === 'string') {
        const strings = toStrings(new Uint8Array(entry.buffer), entry.numTuples, entry.stringLength);
        vtkArr = vtkStringArray.newInstance({ name, values: strings, numberOfComponents: 1 });
      } else {
        vtkArr = vtkDataArray.newInstance({
          name,
          values: toTyped(entry.buffer, entry.dtype),
          numberOfComponents: entry.components,
        });
      }
      pd.addArray(vtkArr);
      if (idx === 0) pd.setScalars(vtkArr);
    });

    const cd = capPolyData.getCellData();
    cd.initialize();
    Object.entries(data.cellData || {}).forEach(([name, entry]) => {
      let vtkArr;
      if (entry.dtype === 'string') {
        const strings = toStrings(new Uint8Array(entry.buffer), entry.numTuples, entry.stringLength);
        vtkArr = vtkStringArray.newInstance({ name, values: strings, numberOfComponents: 1 });
      } else {
        vtkArr = vtkDataArray.newInstance({
          name,
          values: toTyped(entry.buffer, entry.dtype),
          numberOfComponents: entry.components,
        });
      }
      cd.addArray(vtkArr);
    });

    pd.modified();
    cd.modified();
    capPolyData.modified();
    hasCapSlice = true;
  }

  // =============================================================================
  // Picker
  // =============================================================================

  const picker = vtkCellPicker.newInstance();
  picker.setPickFromList(true);
  picker.setTolerance(0.0005);

  function syncPickList() {
    picker.initializePickList();
    if (actor.getVisibility()) picker.addPickList(actor);
    if (clipActor.getVisibility()) picker.addPickList(clipActor);
    if (capActor.getVisibility()) picker.addPickList(capActor);
  }
  syncPickList();

  // =============================================================================
  // Load initial data
  // =============================================================================

  updateGeometry(model.geometry);
  updateScalars(model.geometry);
  renderUpdate(true);

  initializeWidget();
  refreshMainEdges();
  refreshClipEdges();

  if (is2DMode) {
    set2DMode(true);
  }

  // =============================================================================
  // Hover state
  // =============================================================================

  let hoverEnabled = !!model.info;
  let lastHover = { cellId: -2, cellValue: null, position: [NaN, NaN, NaN], dataset: null, highlight: null };

  // =============================================================================
  // Mouse interaction
  // =============================================================================

  function onMouseMove(e) {
    if (!hoverEnabled) return;
    const rect = el.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;

    const [canvasWidth, canvasHeight] = openGLRenderWindow.getSize();
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;

    const pickX = cssX * scaleX;
    const pickY = canvasHeight - cssY * scaleY;

    picker.pick([pickX, pickY, 0], renderer);
    const pickedCellId = picker.getCellId();

    if (pickedCellId < 0) {
      tooltip.style.display = 'none';
      updateHover(-1, -1, null, null, model, is2DMode, lastHover);
      if (lastHover.highlight) {
        lastHover.highlight = clearHighlight(lastHover.highlight);
      }
      return;
    }

    let world = picker.getPickPosition();

    const dataset =
      (picker.getDataSet && picker.getDataSet()) ||
      (picker.getMapper() && picker.getMapper().getInputData()) ||
      polyData;

    const cellData = dataset.getCellData();
    const cellIdArray = cellData.getArrayByName('cell_id');
    const rgbaArray = cellData.getArrayByName('rgba');
    const cellValueArray = cellData.getArrayByName('cell_value');

    const cellId = cellIdArray ? getArrayValue(cellIdArray, pickedCellId) : 'N/A';
    const cellValue = cellValueArray ? getArrayValue(cellValueArray, pickedCellId) : 'N/A';

    world = updateHover(pickedCellId, cellId, world, dataset, model, is2DMode, lastHover);
    renderWindow.render();

    tooltip.innerHTML = `
      <div><b>cell_id</b>: ${cellId}</div>
      <div><b>cell_value</b>: ${cellValue}</div>
      <div><b>xyz</b>: ${world.map(v => v.toFixed(4)).join(', ')}</div>
    `;

    tooltip.style.left = `${cssX + 12}px`;
    tooltip.style.top = `${cssY + 12}px`;
    tooltip.style.display = 'block';
  }

  function onMouseLeave() {
    tooltip.style.display = 'none';
    updateHover(-1, -1, null, null, model, is2DMode, lastHover);
    if (lastHover.highlight) {
      lastHover.highlight = clearHighlight(lastHover.highlight);
    }
    renderWindow.render();
  }

  function enableHover(enable) {
    hoverEnabled = enable;
    tooltip.style.display = 'none';
    if (!enable) {
      if (lastHover.highlight) {
        lastHover.highlight = clearHighlight(lastHover.highlight);
      }
      lastHover = { cellId: -2, cellValue: null, position: [NaN, NaN, NaN], dataset: null, highlight: null };
      renderWindow.render();
    }
  }

  el.addEventListener('mousemove', onMouseMove);
  el.addEventListener('mouseleave', onMouseLeave);

  // =============================================================================
  // Expose global API
  // =============================================================================

  window.vtkPanelClipPlane = {
    update: updateClipPlane,
    setEnabled: setClipEnabled,
    setPlaneVisible: setPlaneWidgetVisible,
    setEdgesVisible: setEdgesVisible,
    setColorbarVisible: setColorbarVisible,
    setColorbarScale: setColorbarScale,
    setColorbarRange: setColorbarRange,
    setColorbarColors: setColorbarColors,
    move: moveClipPlane,
    setAxis: setClipAxis,
    set2DMode: set2DMode,
    getState: () => ({
      enabled: clipEnabled,
      planeVisible: planeEnabled,
      edgesVisible: edgesVisible,
      colorbarVisible: colorbarVisible,
      colorbarScale: colorbarScale,
      colorbarMin: colorbarMin,
      colorbarMax: colorbarMax,
      colorbarColors: colorbarColors,
      origin: [...clipOrigin],
      normal: [...clipNormal],
      is2DMode: is2DMode,
    }),
  };

  const originalSet2DMode = set2DMode;
  set2DMode = (enabled) => {
    originalSet2DMode(enabled);
    model.view_2d_mode = enabled;
  };

  // =============================================================================
  // Sync to model
  // =============================================================================

  function syncClipStateToModel() {
    model.clip_enabled = clipEnabled;
    model.clip_origin = [...clipOrigin];
    model.clip_normal = [...clipNormal];
  }

  const originalUpdateClipPlane = updateClipPlane;
  updateClipPlane = (origin, normal) => {
    originalUpdateClipPlane(origin, normal);
    syncClipStateToModel();
  };

  const originalSetClipEnabled = setClipEnabled;
  setClipEnabled = (enabled) => {
    originalSetClipEnabled(enabled);
    syncClipStateToModel();
  };

  // =============================================================================
  // Keyboard interaction
  // =============================================================================

  const CLIP_OFFSET_FINE = 0.1;
  const CLIP_OFFSET_COARSE = 1.0;

  function onKeyDown(e) {
    let handled = false;
    const offset = e.shiftKey ? CLIP_OFFSET_FINE : CLIP_OFFSET_COARSE;

    switch (e.key.toLowerCase()) {
      case 'c':
        setClipEnabled(!clipEnabled);
        handled = true;
        break;
      case 'x':
        setClipAxis('x');
        handled = true;
        break;
      case 'y':
        setClipAxis('y');
        handled = true;
        break;
      case 'z':
        setClipAxis('z');
        handled = true;
        break;
      case 'f':
        updateClipPlane(null, [-clipNormal[0], -clipNormal[1], -clipNormal[2]]);
        handled = true;
        break;
      case 'v':
        setPlaneWidgetVisible(!planeEnabled);
        handled = true;
        break;
      case 'arrowup':
      case '+':
      case '=':
        moveClipPlane(offset);
        handled = true;
        break;
      case 'arrowdown':
      case '-':
      case '_':
        moveClipPlane(-offset);
        handled = true;
        break;
    }

    if (handled) {
      e.preventDefault();
    }
  }

  el.setAttribute('tabindex', '0');
  el.style.outline = 'none';
  el.addEventListener('keydown', onKeyDown);
  el.focus();

  let mouseDown = null;
  const DRAG_THRESHOLD = 5;

  function onMouseDown(e) {
    mouseDown = { x: e.clientX, y: e.clientY };
  }

  function onMouseUp(e) {
    if (!mouseDown) return;
    const dx = e.clientX - mouseDown.x;
    const dy = e.clientY - mouseDown.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      model.clicks = (model.clicks || 0) + 1;
    }
    mouseDown = null;
  }

  el.addEventListener('mousedown', onMouseDown);
  el.addEventListener('mouseup', onMouseUp);

  // =============================================================================
  // Model watchers
  // =============================================================================

  const onInfoChange = () => {
    const next = !!model.info;
    if (next !== hoverEnabled) enableHover(next);
  };

  model.on("change:clip_enabled", () => { setClipEnabled(model.clip_enabled); });
  model.on("change:clip_origin", () => { updateClipPlane(model.clip_origin, null); });
  model.on("change:clip_normal", () => { updateClipPlane(null, model.clip_normal); });

  model.on("change:clip_slice", () => {
    if (lastHover.highlight && lastHover.highlight.dataset === capPolyData) {
      lastHover.highlight = clearHighlight(lastHover.highlight);
    }
    updateCapSlice(model.clip_slice);
    refreshCapEdges();
    updateCapVisibility();
    renderUpdate(false);
  });

  model.on("change:geometry", () => {
    if (lastHover.highlight) {
      lastHover.highlight = clearHighlight(lastHover.highlight);
    }
    lastHover = { cellId: -2, cellValue: null, position: [NaN, NaN, NaN], dataset: null, highlight: null };

    updateGeometry(model.geometry);
    updateScalars(model.geometry);

    hasCapSlice = false;
    updateCapVisibility();
    autoClipPlane();
    syncClipStateToModel();
    initializeWidget();
    syncWidgetFromPlane();
    refreshMainEdges();
    refreshClipEdges();
    renderUpdate(false);
  });

  model.on?.('change:info', onInfoChange);

  model.on("change:plane_visible", () => { setPlaneWidgetVisible(model.plane_visible); renderUpdate(false); });
  model.on("change:edges_visible", () => { setEdgesVisible(model.edges_visible); renderUpdate(false); });
  model.on("change:colorbar_visible", () => { setColorbarVisible(model.colorbar_visible); renderUpdate(false); });
  model.on("change:colorbar_scale", () => { setColorbarScale(model.colorbar_scale); renderUpdate(false); });
  model.on("change:colorbar_min", () => { setColorbarRange(model.colorbar_min, colorbarMax); renderUpdate(false); });
  model.on("change:colorbar_max", () => { setColorbarRange(colorbarMin, model.colorbar_max); renderUpdate(false); });
  model.on("change:colorbar_colors", () => { setColorbarColors(model.colorbar_colors); renderUpdate(false); });
  model.on("change:view_2d_mode", () => { set2DMode(model.view_2d_mode); });

  // =============================================================================
  // Resize handling
  // =============================================================================

  const resizeObserver = new ResizeObserver(() => {
    genericRenderWindow.resize();
    renderWindow.render();
  });
  resizeObserver.observe(el);

  // =============================================================================
  // Cleanup
  // =============================================================================

  return () => {
    resizeObserver.disconnect();
    el.removeEventListener('mousemove', onMouseMove);
    el.removeEventListener('mouseleave', onMouseLeave);
    el.removeEventListener('keydown', onKeyDown);
    el.removeEventListener('mousedown', onMouseDown);
    el.removeEventListener('mouseup', onMouseUp);
    model.off?.('change:geometry', updateGeometry);
    model.off?.('change:info', onInfoChange);
    model.off?.('change:colorbar_visible', setColorbarVisible);
    model.off?.('change:colorbar_scale', setColorbarScale);
    model.off?.('change:colorbar_min', setColorbarRange);
    model.off?.('change:colorbar_max', setColorbarRange);
    model.off?.('change:colorbar_colors', setColorbarColors);
    model.off?.('change:view_2d_mode', set2DMode);
    tooltip.remove();
    renderer.removeActor(scalarBarActor);
    scalarBarActor.delete();
    lookupTable.delete();
    widgetManager.delete();
    genericRenderWindow.delete();
  };
}