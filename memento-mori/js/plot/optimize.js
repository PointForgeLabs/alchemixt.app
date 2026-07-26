// Pen-travel optimisation and plot statistics.
//
// On a real plotter the pen-up moves are pure waste, and a naive ordering spends
// more time travelling than drawing. Nearest-neighbour ordering with free path
// reversal removes most of it; a windowed 2-opt and an or-opt pass clean up the
// long jumps the greedy pass leaves behind.

import { dist, polylineLength } from '../geom.js';

/** Uniform grid over path endpoints for nearest-neighbour queries. */
class EndpointGrid {
  constructor(paths, cell) {
    this.cell = cell;
    this.buckets = new Map();
    this.paths = paths;
    for (let i = 0; i < paths.length; i++) {
      this._add(paths[i][0], i, 0);
      this._add(paths[i][paths[i].length - 1], i, 1);
    }
  }

  _key(x, y) { return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`; }

  _add(pt, idx, end) {
    const k = this._key(pt[0], pt[1]);
    let b = this.buckets.get(k);
    if (!b) { b = []; this.buckets.set(k, b); }
    b.push(idx * 2 + end);
  }

  /** Nearest unused endpoint to `pt`, searching outward ring by ring. */
  nearest(pt, used) {
    const cx = Math.floor(pt[0] / this.cell), cy = Math.floor(pt[1] / this.cell);
    let best = -1, bestD = Infinity;
    for (let r = 0; r < 4096; r++) {
      // Once a hit exists, one more ring is enough to beat a diagonal miss.
      if (best >= 0 && (r - 1) * this.cell > bestD) break;
      let sawAny = false;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const b = this.buckets.get(`${cx + dx},${cy + dy}`);
          if (!b) continue;
          sawAny = true;
          for (const code of b) {
            const idx = code >> 1;
            if (used[idx]) continue;
            const p = code & 1 ? this.paths[idx][this.paths[idx].length - 1] : this.paths[idx][0];
            const d = dist(pt, p);
            if (d < bestD) { bestD = d; best = code; }
          }
        }
      }
      // Keep expanding while the grid is sparse.
      if (!sawAny && best < 0 && r > 256) break;
    }
    return best;
  }
}

/** Greedy nearest-neighbour ordering, reversing paths when that end is closer. */
export function nearestNeighbourOrder(paths, start = [0, 0]) {
  if (paths.length < 2) return paths.slice();
  let span = 0;
  for (const p of paths) span = Math.max(span, polylineLength(p));
  const cell = Math.max(2, span / 4 || 2);
  const grid = new EndpointGrid(paths, cell);
  const used = new Uint8Array(paths.length);
  const out = [];
  let cur = start;
  for (let n = 0; n < paths.length; n++) {
    const code = grid.nearest(cur, used);
    if (code < 0) {
      for (let i = 0; i < paths.length; i++) if (!used[i]) { used[i] = 1; out.push(paths[i]); break; }
      continue;
    }
    const idx = code >> 1;
    used[idx] = 1;
    const path = code & 1 ? paths[idx].slice().reverse() : paths[idx];
    out.push(path);
    cur = path[path.length - 1];
  }
  return out;
}

function travelOf(order, start = [0, 0]) {
  let t = dist(start, order[0][0]);
  for (let i = 1; i < order.length; i++) {
    t += dist(order[i - 1][order[i - 1].length - 1], order[i][0]);
  }
  return t;
}

/**
 * Windowed 2-opt: reverse a run of paths (and each path within it) when doing so
 * shortens the pen-up travel. Restricting j to a window keeps this linear enough
 * to run on tens of thousands of strokes.
 */
function twoOptPass(order, window, start) {
  const n = order.length;
  const endOf = (p) => p[p.length - 1];
  let improved = false;
  for (let i = 0; i < n - 1; i++) {
    const aEnd = i === 0 ? start : endOf(order[i - 1]);
    for (let j = i + 1; j < Math.min(n, i + window); j++) {
      const cur = dist(aEnd, order[i][0]) + (j + 1 < n ? dist(endOf(order[j]), order[j + 1][0]) : 0);
      const alt = dist(aEnd, endOf(order[j])) + (j + 1 < n ? dist(order[i][0], order[j + 1][0]) : 0);
      if (alt < cur - 1e-6) {
        const seg = order.slice(i, j + 1).reverse().map((p) => p.slice().reverse());
        order.splice(i, j - i + 1, ...seg);
        improved = true;
      }
    }
  }
  return improved;
}

/** Or-opt: pull single paths out and reinsert them where they cost least. */
function orOptPass(order, window, start) {
  const endOf = (p) => p[p.length - 1];
  let improved = false;
  for (let i = 1; i < order.length - 1; i++) {
    const prev = endOf(order[i - 1]);
    const next = order[i + 1][0];
    const removeGain = dist(prev, order[i][0]) + dist(endOf(order[i]), next) - dist(prev, next);
    if (removeGain <= 1e-6) continue;
    let bestK = -1, bestCost = removeGain, bestRev = false;
    for (let k = Math.max(1, i - window); k < Math.min(order.length, i + window); k++) {
      if (k === i || k === i + 1) continue;
      const a = endOf(order[k - 1]);
      const b = order[k][0];
      const base = dist(a, b);
      const fwd = dist(a, order[i][0]) + dist(endOf(order[i]), b) - base;
      const rev = dist(a, endOf(order[i])) + dist(order[i][0], b) - base;
      if (fwd < bestCost) { bestCost = fwd; bestK = k; bestRev = false; }
      if (rev < bestCost) { bestCost = rev; bestK = k; bestRev = true; }
    }
    if (bestK >= 0) {
      const [moved] = order.splice(i, 1);
      const target = bestK > i ? bestK - 1 : bestK;
      order.splice(target, 0, bestRev ? moved.slice().reverse() : moved);
      improved = true;
    }
  }
  return improved;
}

/**
 * @param {number} effort 0 = leave order alone, 1 = greedy, 2-3 = greedy plus
 *                        increasing amounts of local search.
 */
export function optimiseOrder(paths, effort = 1, start = [0, 0]) {
  if (effort <= 0 || paths.length < 3) return paths.slice();
  let order = nearestNeighbourOrder(paths, start);
  if (effort >= 2) {
    const rounds = effort >= 3 ? 4 : 2;
    const window = effort >= 3 ? 60 : 28;
    for (let r = 0; r < rounds; r++) {
      const a = twoOptPass(order, window, start);
      const b = orOptPass(order, window, start);
      if (!a && !b) break;
    }
  }
  return order;
}

/** Draw length, pen-up travel, stroke count and an estimated plot time. */
export function computeStats(layers, p) {
  let draw = 0, travel = 0, strokes = 0, points = 0;
  let cur = [0, 0];
  for (const layer of layers) {
    for (const path of layer.paths) {
      strokes++;
      points += path.length;
      travel += dist(cur, path[0]);
      draw += polylineLength(path);
      cur = path[path.length - 1];
    }
  }
  const drawTime = draw / Math.max(p.plotSpeed, 1);
  const travelTime = travel / Math.max(p.penUpSpeed, 1);
  const liftTime = (strokes * 2 * Math.max(p.penLiftMs, 0)) / 1000;
  return {
    strokes, points,
    drawMm: draw, travelMm: travel,
    seconds: drawTime + travelTime + liftTime,
  };
}

export function formatDuration(seconds) {
  if (!isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
