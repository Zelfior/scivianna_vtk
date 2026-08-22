/**
 * Feature edges rendering module.
 * 
 * VTK's built-in EdgeVisibility draws every triangle edge in one flat
 * color - visually flat, and noisy on triangulated meshes since every
 * triangulation edge shows, not just meaningful ones. Instead we build our
 * own thin line geometry per surface (main / clipped / cap) containing
 * only:
 *   - mesh boundary edges (used by exactly one triangle), and
 *   - edges shared by two triangles whose 'cell_id' differ.
 * Internal triangulation edges within the same cell_id are skipped
 * entirely. Each edge is colored from its adjacent face color(s),
 * darkened by a fixed amount, so edge color tracks face color instead of
 * being flat black.
 */

import { getArrayValue } from './utils.js';

import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

const EDGE_DARKEN_FRACTION = 0.5;

/**
 * Darken an RGB tuple by a fixed fraction.
 * @param {number[]} tuple - RGB tuple to darken.
 * @returns {number[]} Darkened RGB tuple.
 */
function darkenRGB(tuple) {
  return tuple.map((v) => v * (1 - EDGE_DARKEN_FRACTION));
}

/**
 * Parse a vtk.js CellArray into an array of point-id arrays, one per cell.
 * @param {vtkCellArray} cellArray - The cell array to parse.
 * @returns {number[][]} Array of point ID arrays for each cell.
 */
function parseCellsPointIds(cellArray) {
  if (!cellArray || cellArray.getNumberOfCells() === 0) return [];
  const data = cellArray.getData();
  const cells = [];
  let i = 0;
  while (i < data.length) {
    const n = data[i];
    const pts = new Array(n);
    for (let k = 0; k < n; k++) pts[k] = data[i + 1 + k];
    cells.push(pts);
    i += n + 1;
  }
  return cells;
}

/**
 * Build feature edges geometry from a PolyData.
 * @param {vtkPolyData} sourcePolyData - The source polydata.
 * @returns {object|null} Object with points, lines, colors or null if nothing to draw.
 */
export function buildFeatureEdges(sourcePolyData) {
  const polys = sourcePolyData?.getPolys();
  const points = sourcePolyData?.getPoints();
  if (!polys || polys.getNumberOfCells() === 0 || !points) return null;

  const cd = sourcePolyData.getCellData();
  const cellIdArray = cd.getArrayByName('cell_id');
  const rgbArray = cd.getArrayByName('rgb');

  // Cell data is indexed across verts+lines+polys+strips in that order,
  // so a poly at local index `k` sits at global cell id `cellOffset + k`.
  const cellOffset =
    sourcePolyData.getVerts().getNumberOfCells() +
    sourcePolyData.getLines().getNumberOfCells();

  const cellsPointIds = parseCellsPointIds(polys);

  // edgeKey "a_b" (a < b) -> owning poly-local cell indices
  const edgeOwners = new Map();
  cellsPointIds.forEach((pts, cellIdx) => {
    const n = pts.length;
    for (let k = 0; k < n; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % n];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      let owners = edgeOwners.get(key);
      if (!owners) {
        owners = [];
        edgeOwners.set(key, owners);
      }
      owners.push(cellIdx);
    }
  });

  const linePairs = [];
  const lineColors = [];

  edgeOwners.forEach((owners, key) => {
    let colorTuple = null;

    if (owners.length === 1) {
      // Mesh boundary edge - always shown.
      const g = cellOffset + owners[0];
      colorTuple = rgbArray ? Array.from(rgbArray.getTuple(g)) : [0, 0, 0];
    } else {
      // Shared by 2+ triangles. Only show if owning cells belong to different groups.
      const [c0, c1] = owners;
      const g0 = cellOffset + c0;
      const g1 = cellOffset + c1;
      const id0 = cellIdArray ? getArrayValue(cellIdArray, g0) : g0;
      const id1 = cellIdArray ? getArrayValue(cellIdArray, g1) : g1;
      if (id0 !== id1) {
        const rgb0 = rgbArray ? Array.from(rgbArray.getTuple(g0)) : [0, 0, 0];
        const rgb1 = rgbArray ? Array.from(rgbArray.getTuple(g1)) : [0, 0, 0];
        colorTuple = rgb0.map((v, i) => (v + rgb1[i]) / 2);
      }
    }

    if (colorTuple) {
      const [a, b] = key.split('_').map(Number);
      linePairs.push(a, b);
      const dark = darkenRGB(colorTuple);
      lineColors.push(dark[0]*255, dark[1]*255, dark[2]*255);
    }
  });

  if (linePairs.length === 0) return null;

  const numEdges = linePairs.length / 2;
  const linesFlat = new Uint32Array(numEdges * 3);
  for (let e = 0; e < numEdges; e++) {
    linesFlat[e * 3] = 2;
    linesFlat[e * 3 + 1] = linePairs[e * 2];
    linesFlat[e * 3 + 2] = linePairs[e * 2 + 1];
  }

  return {
    points: points.getData(),
    lines: linesFlat,
    colors: new Uint8Array(lineColors),
  };
}

/**
 * Create an edge actor for rendering feature edges.
 * @param {object} vtk - Object containing vtk classes.
 * @returns {object} Object with edgePolyData and edgeActor.
 */
export function createEdgeActor(vtk) {
  const { vtkPolyData, vtkMapper, vtkActor } = vtk;
  
  const edgePolyData = vtkPolyData.newInstance();
  const edgeMapper = vtkMapper.newInstance();
  edgeMapper.setInputData(edgePolyData);
  edgeMapper.setScalarVisibility(true);
  edgeMapper.setScalarModeToUseCellFieldData();
  edgeMapper.setColorModeToDirectScalars();
  edgeMapper.setColorByArrayName('rgb');

  const edgeActor = vtkActor.newInstance();
  edgeActor.setMapper(edgeMapper);
  edgeActor.getProperty().setLighting(false);
  edgeActor.getProperty().setLineWidth(1.5);
  edgeActor.setVisibility(false);

  return { edgePolyData, edgeActor };
}

/**
 * Load feature edges into a target edge PolyData.
 * @param {vtkPolyData} sourcePolyData - Source polydata.
 * @param {vtkPolyData} targetEdgePolyData - Target edge polydata.
 * @param {object} vtk - Object containing vtk classes.
 * @returns {boolean} True if edges were loaded, false otherwise.
 */
export function loadEdgesInto(sourcePolyData, targetEdgePolyData, vtk) {
  const { vtkPoints, vtkCellArray, vtkDataArray } = vtk;
  const built = buildFeatureEdges(sourcePolyData);
  if (!built) return false;

  const pointsObj = vtkPoints.newInstance();
  pointsObj.setData(built.points, 3);
  targetEdgePolyData.setPoints(pointsObj);

  const linesArr = vtkCellArray.newInstance();
  linesArr.setData(built.lines);
  targetEdgePolyData.setLines(linesArr);

  const cellD = targetEdgePolyData.getCellData();
  cellD.initialize();
  const colorArr = vtkDataArray.newInstance({
    name: 'rgb',
    values: built.colors,
    numberOfComponents: 3,
  });
  cellD.addArray(colorArr);
  cellD.setScalars(colorArr);
  cellD.modified();

  targetEdgePolyData.modified();
  return true;
}