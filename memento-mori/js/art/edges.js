// Contour extraction: the lines an engraver would cut first. Built as a Canny
// pipeline over a composite discontinuity field rather than over luminance,
// because the lines that describe a form are depth and normal breaks (silhouette,
// occluding contours, the orbital rim, tooth boundaries) -- not brightness edges,
// which drift with the lighting.

import { sample } from './fields.js';
import { traceIsolines } from './isolines.js';
import { simplify, smoothMoving, polylineLength } from '../geom.js';

/** Composite edge strength: depth breaks, normal creases, region boundaries. */
export function edgeStrength(fields, { depthWeight = 1, normalWeight = 1, regionWeight = 0.7 } = {}) {
  const { width: w, height: h, depth, nx, ny, nz, region, mask } = fields;
  const E = new Float32Array(w * h);
  const DEPTH_SCALE = 1 / 0.006;     // ~4mm of depth step saturates
  const NORMAL_SCALE = 1 / 0.06;     // ~20 degrees of bend saturates

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const nbr = [i - 1, i + 1, i - w, i + w];
      let openEdge = false, dd = 0, dn = 0, rgn = 0;
      for (const j of nbr) {
        if (!mask[j]) { openEdge = true; continue; }
        const ad = Math.abs(depth[j] - depth[i]);
        if (ad > dd) dd = ad;
        const dot = nx[i] * nx[j] + ny[i] * ny[j] + nz[i] * nz[j];
        const bend = 1 - Math.min(1, dot);
        if (bend > dn) dn = bend;
        if (Math.round(region[j]) !== Math.round(region[i])) rgn = 1;
      }
      let e = Math.min(2, dd * DEPTH_SCALE) * depthWeight
            + Math.min(2, dn * NORMAL_SCALE) * normalWeight
            + rgn * regionWeight;
      if (openEdge) e += 2.2;
      E[i] = e;
    }
  }
  return E;
}

/** Non-maximum suppression along the gradient of E, then hysteresis. */
export function thinEdges(E, w, h, hi, lo) {
  const keep = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const e = E[i];
      if (e < lo) continue;
      const gx = E[i + 1] - E[i - 1];
      const gy = E[i + w] - E[i - w];
      const g = Math.hypot(gx, gy);
      if (g < 1e-6) { keep[i] = e >= hi ? 2 : 1; continue; }
      const ux = gx / g, uy = gy / g;
      const a = sample(E, w, h, x + ux, y + uy);
      const b = sample(E, w, h, x - ux, y - uy);
      if (e >= a && e >= b) keep[i] = e >= hi ? 2 : 1;
    }
  }
  // Promote weak pixels that touch strong ones (hysteresis), iterated to spread.
  const stack = [];
  for (let i = 0; i < w * h; i++) if (keep[i] === 2) stack.push(i);
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (keep[j] === 1) { keep[j] = 2; stack.push(j); }
      }
    }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = keep[i] === 2 ? 1 : 0;
  return out;
}

const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/**
 * Link a thinned edge map into polylines. Walks from open ends first so curves
 * are not chopped in the middle, preferring the straightest continuation at
 * every step, then mops up closed loops.
 */
export function linkEdges(bin, w, h) {
  const deg = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!bin[i]) continue;
      let c = 0;
      for (const [dx, dy] of N8) if (bin[i + dy * w + dx]) c++;
      deg[i] = c;
    }
  }
  const used = new Uint8Array(w * h);
  const paths = [];

  const walk = (start) => {
    const pts = [[start % w, (start / w) | 0]];
    used[start] = 1;
    let cur = start;
    let dirx = 0, diry = 0;
    for (let guard = 0; guard < w * h; guard++) {
      const x = cur % w, y = (cur / w) | 0;
      let best = -1, bestScore = -Infinity;
      for (const [dx, dy] of N8) {
        const xx = x + dx, yy = y + dy;
        if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
        const j = yy * w + xx;
        if (!bin[j] || used[j]) continue;
        const len = Math.hypot(dx, dy);
        // Prefer straight continuation, and prefer 4-neighbours over diagonals.
        const align = dirx || diry ? (dx * dirx + dy * diry) / len : 0;
        const score = align * 2 - len * 0.1;
        if (score > bestScore) { bestScore = score; best = j; dirx = dx; diry = dy; }
      }
      if (best < 0) break;
      used[best] = 1;
      pts.push([best % w, (best / w) | 0]);
      cur = best;
    }
    if (pts.length >= 2) paths.push(pts);
  };

  for (let i = 0; i < w * h; i++) if (bin[i] && !used[i] && deg[i] === 1) walk(i);
  for (let i = 0; i < w * h; i++) if (bin[i] && !used[i] && deg[i] >= 3) walk(i);
  for (let i = 0; i < w * h; i++) if (bin[i] && !used[i]) walk(i);
  return paths;
}

/**
 * Full contour pass. `sensitivity` is 0..1: low keeps only the strongest breaks.
 */
export function extractContours(fields, { sensitivity = 0.34, minLenPx = 3, smoothPasses = 2 } = {}) {
  const { width: w, height: h } = fields;
  const E = edgeStrength(fields);
  // Map sensitivity onto the strong threshold. The open-silhouette bonus is 2.2,
  // so anything below that always survives.
  const hi = 0.35 + (1 - sensitivity) * 1.5;
  const raw = linkEdges(thinEdges(E, w, h, hi, hi * 0.4), w, h);
  const out = [];
  for (let p of raw) {
    if (polylineLength(p) < minLenPx) continue;
    p = smoothMoving(p, smoothPasses, false);
    p = simplify(p, 0.35);
    if (p.length >= 2) out.push(p);
  }
  return out;
}

/** Clean closed outline of the silhouette, traced from the coverage mask. */
export function extractSilhouette(fields) {
  const { width: w, height: h, mask } = fields;
  const f = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) f[i] = mask[i];
  const valid = new Uint8Array(w * h).fill(1);
  const traced = traceIsolines({
    field: f, valid, depth: null, region: null, width: w, height: h,
    delta: 1, phase: 0.5, minSpacingPx: 0,
  });
  return traced
    .map((t) => simplify(smoothMoving(t.pts, 2, false), 0.28))
    .filter((p) => p.length >= 3 && polylineLength(p) > 6);
}
