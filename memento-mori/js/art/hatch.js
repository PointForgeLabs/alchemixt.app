// Tonal modulation of strokes, and the straight-hatch generators.
//
// A pen has one width, so tone can only come from how much of the paper the
// strokes cover. Rather than switch passes on and off at hard thresholds (which
// bands badly), every stroke is walked and broken into dashes whose duty cycle
// tracks the local ink demand. Light areas become sparse ticks, mid tones become
// broken lines, dark areas become solid ones -- which is how an engraver builds
// a tonal ramp with a single burin.

import { polylineLength, dist } from '../geom.js';

/**
 * Walk a polyline and keep only the parts the tone asks for.
 *
 * @param {Array} pts        polyline in pixel space
 * @param {function} inkAt   (x,y) -> 0..1 ink demand
 * @param {function} duty    (ink) -> 0..1 fraction of the period to draw
 * @param {number} period    dash period in pixels
 * @param {number} phase     0..1 stagger, so neighbouring lines do not align
 * @param {number} step      sampling step in pixels
 * @param {number} minRun    discard runs shorter than this (pixels)
 * @param {function} [wobble] (s) -> extra phase noise
 */
export function modulatePath(pts, {
  inkAt, duty, period, phase = 0, step = 1.0, minRun = 0.8, wobble = null,
}) {
  if (pts.length < 2) return [];
  const out = [];
  let run = null;
  let s = 0;
  const invPeriod = 1 / Math.max(period, 1e-6);

  const emit = (p) => {
    if (!run) { run = [p]; out.push(run); } else run.push(p);
  };
  const close = () => { run = null; };

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const segLen = dist(a, b);
    if (segLen < 1e-9) continue;
    const dx = (b[0] - a[0]) / segLen, dy = (b[1] - a[1]) / segLen;
    let t = 0;
    while (t <= segLen) {
      const x = a[0] + dx * t, y = a[1] + dy * t;
      const d = duty(inkAt(x, y));
      let on;
      if (d >= 0.999) on = true;
      else if (d <= 0.001) on = false;
      else {
        let ph = s * invPeriod + phase;
        if (wobble) ph += wobble(s);
        on = ph - Math.floor(ph) < d;
      }
      if (on) emit([x, y]); else close();
      t += step;
      s += step;
    }
    // Land exactly on the vertex so corners are not rounded off by the step.
    const d2 = duty(inkAt(b[0], b[1]));
    if (d2 >= 0.999 && run) emit([b[0], b[1]]);
  }
  return out.filter((r) => r.length >= 2 && polylineLength(r) >= minRun);
}

/** Standard four-stage engraving ramp: each pass fades in over its own window. */
export function makeDuty(lo, hi, softness) {
  // softness 0 -> a hard switch at the midpoint (woodcut); 1 -> a long fade.
  const mid = (lo + hi) * 0.5;
  const a = mid + (lo - mid) * Math.max(softness, 0.02);
  const b = mid + (hi - mid) * Math.max(softness, 0.02);
  const span = Math.max(b - a, 1e-4);
  return (ink) => {
    if (ink <= a) return 0;
    if (ink >= b) return 1;
    const t = (ink - a) / span;
    return t * t * (3 - 2 * t);
  };
}

/**
 * Displace a polyline sideways with smooth noise, so strokes read as cut by
 * hand rather than stepped by a machine.
 */
export function jitterPath(pts, amp, noise, freq = 0.035, seedOffset = 0) {
  if (amp <= 0 || pts.length < 2) return pts;
  const out = new Array(pts.length);
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += dist(pts[i - 1], pts[i]);
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    const n = noise(s * freq + seedOffset, seedOffset * 3.1);
    out[i] = [pts[i][0] - ty * n * amp, pts[i][1] + tx * n * amp];
  }
  return out;
}

/** Approximate parallel offset, used to thicken a stroke with a second pass. */
export function offsetPath(pts, d) {
  if (pts.length < 2) return pts;
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    out[i] = [pts[i][0] - ty * d, pts[i][1] + tx * d];
  }
  return out;
}

/**
 * A family of parallel straight lines at `angleDeg`, spaced `spacing` pixels,
 * covering the given rectangle. Returned as long polylines for the modulator to
 * cut up; each carries an index so dash phases can be staggered.
 */
export function parallelLines(rect, angleDeg, spacing, { resample = 3 } = {}) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const nx = -dy, ny = dx;                       // line normal
  const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
  const corners = [
    [rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1],
  ];
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, y] of corners) {
    const px = x - cx, py = y - cy;
    const u = px * dx + py * dy;
    const v = px * nx + py * ny;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  const lines = [];
  const k0 = Math.ceil(vMin / spacing), k1 = Math.floor(vMax / spacing);
  const step = Math.max(resample, 0.5);
  for (let k = k0; k <= k1; k++) {
    const v = k * spacing;
    const pts = [];
    for (let u = uMin; u <= uMax; u += step) {
      pts.push([cx + dx * u + nx * v, cy + dy * u + ny * v]);
    }
    pts.push([cx + dx * uMax + nx * v, cy + dy * uMax + ny * v]);
    lines.push({ index: k, pts });
  }
  return lines;
}
