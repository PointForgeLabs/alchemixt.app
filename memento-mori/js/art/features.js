// Sutures, the temporal line and cracks.
//
// These are surface markings, not shading, so they are defined as zero sets of
// scalar functions of the *model-space* hit position that the raymarch pass hands
// back. Tracing them in that space means they wrap the form correctly and are
// occluded for free: only visible surface points exist in the buffer at all.

import { traceIsolines } from './isolines.js';
import { simplify, smoothMoving, polylineLength } from '../geom.js';

const R = {
  VAULT: 1, FRONTAL: 2, TEMPORAL: 3, ORBIT: 4, NASAL: 5, MAXILLA: 6,
  ZYGO: 7, TEETH_U: 8, TEETH_L: 9, MANDIBLE: 10, RAMUS: 11, BASE: 12,
};

/* --------------------------------------------------------------- noise --- */

function hash3(x, y, z, seed) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 51.3) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
}

function vnoise3(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz, seed);
  const x00 = c(0, 0, 0) * (1 - fx) + c(1, 0, 0) * fx;
  const x10 = c(0, 1, 0) * (1 - fx) + c(1, 1, 0) * fx;
  const x01 = c(0, 0, 1) * (1 - fx) + c(1, 0, 1) * fx;
  const x11 = c(0, 1, 1) * (1 - fx) + c(1, 1, 1) * fx;
  return (x00 * (1 - fy) + x10 * fy) * (1 - fz) + (x01 * (1 - fy) + x11 * fy) * fz;
}

function fbm3(x, y, z, seed, oct) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise3(x, y, z, seed + i * 7.3);
    n += a; a *= 0.5;
    x *= 2.03; y *= 2.03; z *= 2.03;
  }
  return s / n;
}

/* --------------------------------------------------------- trace helper --- */

/**
 * Trace the zero set of `fn(ax, py, pz, px, i)` over the visible surface.
 * `delta` is left enormous so exactly one level -- zero -- is traced.
 */
function traceSurfaceField(fields, fn, allowed, { minLenPx = 4, smoothPasses = 1, simplifyTol = 0.3 } = {}) {
  const { width: w, height: h, px, py, pz, region, mask, depth } = fields;
  const field = new Float32Array(w * h);
  const valid = new Uint8Array(w * h);
  const allow = new Set(allowed);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || !allow.has(Math.round(region[i]))) continue;
    const v = fn(Math.abs(px[i]), py[i], pz[i], px[i], i);
    if (v === null) continue;
    field[i] = v;
    valid[i] = 1;
  }
  const traced = traceIsolines({
    field, valid, depth, region: null, width: w, height: h,
    delta: 1e9, phase: 0, minSpacingPx: 0, depthJump: 0.004,
  });
  const out = [];
  for (let t of traced) {
    let p = t.pts;
    if (polylineLength(p) < minLenPx) continue;
    if (smoothPasses) p = smoothMoving(p, smoothPasses, false);
    p = simplify(p, simplifyTol);
    if (p.length >= 2) out.push(p);
  }
  return out;
}

/* -------------------------------------------------------------- sutures --- */

/**
 * The cranial sutures, each an interdigitated seam. Amount 0..1 scales both how
 * many are drawn and how strongly they zigzag.
 */
export function extractSutures(fields, { amount = 1, seed = 1 } = {}) {
  if (amount <= 0.01) return [];
  const serr = 1.5 * amount;          // fine interdigitation, ~1.5mm
  const meander = 3.4 * amount;       // slow wander of the whole seam
  const wob = (x, y, z, s) =>
    serr * fbm3(x * 0.32, y * 0.32, z * 0.32, seed + s, 2) +
    meander * fbm3(x * 0.035, y * 0.035, z * 0.035, seed + s + 40, 2);

  const out = [];
  const add = (paths) => { for (const p of paths) out.push(p); };

  // Sagittal: the midline seam over the vault.
  add(traceSurfaceField(fields, (ax, y, z, x) => (
    y < 14 ? null : x + wob(ax, y, z, 1) * 0.7
  ), [R.VAULT, R.FRONTAL]));

  // Coronal: bregma forward and down to each pterion.
  add(traceSurfaceField(fields, (ax, y, z) => (
    z + 18 + 0.38 * (y - 84) + wob(ax, y, z, 2)
  ), [R.VAULT, R.FRONTAL, R.TEMPORAL]));

  // Lambdoid: from lambda down and out across the occiput.
  add(traceSurfaceField(fields, (ax, y, z) => (
    z > -50 ? null : z + 108 + 0.5 * (y - 58) + wob(ax, y, z, 3)
  ), [R.VAULT, R.BASE]));

  // Squamosal: the arc of the temporal squama, struck from the ear canal.
  add(traceSurfaceField(fields, (ax, y, z) => (
    Math.hypot(ax - 52, y + 16, z + 40) - 46 + wob(ax, y, z, 4)
  ), [R.TEMPORAL, R.VAULT]));

  if (amount > 0.4) {
    // Zygomaticomaxillary: down across the cheek from the orbital margin.
    add(traceSurfaceField(fields, (ax, y, z) => {
      const d = (ax - 41) * 0.42 + (y + 20) * -0.86 + (z - 30) * 0.29;
      return d + wob(ax, y, z, 5) * 0.5;
    }, [R.ZYGO, R.MAXILLA]));

    // Temporozygomatic: the vertical break part-way along the arch.
    add(traceSurfaceField(fields, (ax, y, z) => (
      ax < 52 ? null : z + 12 + wob(ax, y, z, 6) * 0.4
    ), [R.ZYGO]));

    // Internasal and nasomaxillary seams around the nasal bones.
    add(traceSurfaceField(fields, (ax, y, z, x) => (
      y < -18 ? null : x + wob(ax, y, z, 7) * 0.35
    ), [R.NASAL]));
  }

  // Superior temporal line: the faint crest bounding the temporal fossa.
  add(traceSurfaceField(fields, (ax, y, z) => {
    const q = Math.hypot((ax - 8) / 58, (y + 12) / 62, (z + 18) / 56);
    return (q - 1) * 58 + wob(ax, y, z, 8) * 0.8;
  }, [R.VAULT, R.FRONTAL, R.TEMPORAL], { minLenPx: 14 }));

  return out;
}

/* --------------------------------------------------------------- cracks --- */

/**
 * Cracks read as long, slightly jagged fissures. Tracing the level sets of a
 * low-frequency 3D noise gives exactly that character, and a per-arc-length gate
 * breaks them up so they do not run the whole width of the skull.
 */
export function extractCracks(fields, { amount = 0.3, seed = 1 } = {}) {
  if (amount <= 0.01) return [];
  const count = Math.round(2 + amount * 7);
  const out = [];
  for (let c = 0; c < count; c++) {
    const s = seed * 3.1 + c * 17.7;
    const level = (c / Math.max(count - 1, 1) - 0.5) * 0.9;
    const paths = traceSurfaceField(fields, (ax, y, z) => (
      fbm3(z * 0.021 + 3.1, y * 0.021, ax * 0.021, s, 3) - level * 0.55
      + 0.10 * fbm3(z * 0.28, y * 0.28, ax * 0.28, s + 9, 2)
    ), [R.VAULT, R.FRONTAL, R.TEMPORAL, R.BASE, R.MAXILLA, R.ZYGO, R.MANDIBLE, R.RAMUS],
      { minLenPx: 18, smoothPasses: 0, simplifyTol: 0.4 });

    // Keep sparse fragments, not continuous contour lines.
    for (const p of paths) {
      let acc = [];
      let sLen = 0;
      for (let i = 0; i < p.length; i++) {
        if (i > 0) sLen += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        const gate = fbm3(sLen * 0.06, c * 4.4, 0, s + 21, 2);
        if (gate > -0.15) acc.push(p[i]);
        else if (acc.length > 1) { out.push(acc); acc = []; }
        else acc = [];
      }
      if (acc.length > 1) out.push(acc);
    }
  }
  return out.filter((p) => polylineLength(p) > 8);
}
