/**
 * Hover picking and cell highlighting module.
 */

import { getArrayValue } from './utils.js';

const HOVER_DARKEN_OFFSET = 20 / 255;

/**
 * Darken an RGB tuple for hover highlight effect.
 * @param {number[]} tuple - RGB tuple to darken.
 * @returns {number[]} Darkened RGB tuple.
 */
function darkenTuple(tuple) {
  const out = new Array(tuple.length);
  for (let i = 0; i < tuple.length; i++) {
    // Leave an alpha component (4th channel), if present, untouched.
    out[i] = (tuple.length === 4 && i === 3)
      ? tuple[i]
      : Math.max(0, Math.min(1, tuple[i] - HOVER_DARKEN_OFFSET));
  }
  return out;
}

/**
 * Compute a group key for highlighting cells with the same cell_id.
 * @param {vtkPolyData} dataset - The dataset being hovered.
 * @param {number} cellId - The cell ID.
 * @param {*} cellValue - The cell value.
 * @returns {string|null} Group key or null if no dataset.
 */
export function computeGroupKey(dataset, cellId, cellValue) {
  if (!dataset) return null;
  const cellIdArray = dataset.getCellData().getArrayByName('cell_id');
  return cellIdArray ? `v:${cellValue}` : `c:${cellId}`;
}

/**
 * Clear the current highlight.
 * @param {object} highlight - Current highlight state.
 */
export function clearHighlight(highlight) {
  if (!highlight) return;
  const { array, dataset, indices, originals } = highlight;
  indices.forEach((i, idx) => array.setTuple(i, originals[idx]));
  array.modified();
  dataset.modified();
  return null;
}

/**
 * Apply highlight to cells sharing the same cell_id value.
 * @param {vtkPolyData} dataset - The dataset.
 * @param {number} cellId - The picked cell ID.
 * @param {*} cellValue - The cell value.
 * @param {string} groupKey - The group key.
 * @returns {object|null} Highlight state or null if nothing to highlight.
 */
export function applyHighlight(dataset, cellId, cellValue, groupKey) {
  if (!dataset || cellId < 0) return null;
  const cd = dataset.getCellData();
  const array = cd.getArrayByName('rgb');
  if (!array || cellId >= array.getNumberOfTuples()) return null;

  const cellIdArray = cd.getArrayByName('cell_id');
  let indices;
  if (cellIdArray) {
    // Darken every cell sharing this cell_id value.
    indices = [];
    const n = cellIdArray.getNumberOfTuples();
    for (let i = 0; i < n; i++) {
      if (getArrayValue(cellIdArray, i) === cellValue) indices.push(i);
    }
  } else {
    // No cell_id grouping available - fall back to single-cell behavior.
    indices = [cellId];
  }

  const originals = indices.map((i) => Array.from(array.getTuple(i)));
  const highlight = { array, dataset, groupKey, indices, originals };
  indices.forEach((i, idx) => array.setTuple(i, darkenTuple(originals[idx])));
  array.modified();
  dataset.modified();
  return highlight;
}

/**
 * Update hover state and sync to model.
 * @param {number} cellId - The hovered cell ID.
 * @param {*} cellValue - The cell value.
 * @param {number[]} world - World coordinates [x, y, z].
 * @param {vtkPolyData} dataset - The dataset being hovered.
 * @param {object} model - The Panel model.
 * @param {boolean} is2DMode - Whether in 2D mode.
 * @param {object} lastHover - Last hover state.
 * @returns {number[]} Updated world coordinates.
 */
export function updateHover(cellId, cellValue, world, dataset, model, is2DMode, lastHover) {
  let x = world?.[0] ?? NaN;
  let y = world?.[1] ?? NaN;
  let z = world?.[2] ?? NaN;

  // In 2D mode, transform the picked world position into the custom
  // coordinate system defined by hover_origin + hover_u_vector + hover_v_vector.
  if (is2DMode && !isNaN(x) && !isNaN(y)) {
    const u0 = model.hover_u_vector?.[0] ?? 1.0;
    const u1 = model.hover_u_vector?.[1] ?? 0.0;
    const u2 = model.hover_u_vector?.[2] ?? 0.0;

    const v0 = model.hover_v_vector?.[0] ?? 0.0;
    const v1 = model.hover_v_vector?.[1] ?? 1.0;
    const v2 = model.hover_v_vector?.[2] ?? 0.0;

    const o0 = model.hover_origin?.[0] ?? 0.0;
    const o1 = model.hover_origin?.[1] ?? 0.0;
    const o2 = model.hover_origin?.[2] ?? 0.0;

    const w0 = u1 * v2 - u2 * v1;
    const w1 = u2 * v0 - u0 * v2;
    const w2 = u0 * v1 - u1 * v0;

    const w_val = o0 * w0 + o1 * w1 + o2 * w2;
    const ox = x, oy = y;
    x = ox * u0 + oy * v0 + w_val * w0;
    y = ox * u1 + oy * v1 + w_val * w1;
    z = ox * u2 + oy * v2 + w_val * w2;
  }

  if (
    lastHover.cellId === cellId &&
    lastHover.cellValue === cellValue &&
    lastHover.dataset === dataset &&
    lastHover.position[0] === x &&
    lastHover.position[1] === y &&
    lastHover.position[2] === z
  ) {
    return [x, y, z];
  }

  const groupKey = computeGroupKey(dataset, cellId, cellValue);

  // Swap the darken-highlight to the newly hovered cell_id group.
  if (lastHover.highlight && (lastHover.highlight.dataset !== dataset || lastHover.highlight.groupKey !== groupKey)) {
    lastHover.highlight = clearHighlight(lastHover.highlight);
  }
  if (dataset && cellId >= 0 && !lastHover.highlight) {
    lastHover.highlight = applyHighlight(dataset, cellId, cellValue, groupKey);
  }

  lastHover.cellId = cellId;
  lastHover.cellValue = cellValue;
  lastHover.position = [x, y, z];
  lastHover.dataset = dataset;

  model.hover_cell_id = cellId;
  model.hover_cell_value = cellValue;
  model.hover_position = [x, y, z];

  return [x, y, z];
}