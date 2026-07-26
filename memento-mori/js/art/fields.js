// Sampling helpers over the G-buffer, and the tone model that turns rendered
// luminance into an ink demand the line passes can share.

/** Bilinear sample of a Float32 field, clamped at the borders. */
export function sample(f, w, h, x, y) {
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0;
  const fx = x - x0, fy = y - y0;
  const i = y0 * w + x0;
  const a = f[i], b = f[i + 1], c = f[i + w], d = f[i + w + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

export function sampleNearest(f, w, h, x, y) {
  const xi = Math.min(w - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(h - 1, Math.max(0, Math.round(y)));
  return f[yi * w + xi];
}

/**
 * Mask test with a small inward bias: strokes that stop exactly on the
 * silhouette leave a ragged fringe once the pen has width, so the fill passes
 * are held back by `inset` pixels.
 */
export function makeMaskTest(fields, inset = 0) {
  const { width: w, height: h, mask } = fields;
  if (inset <= 0) {
    return (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      return xi >= 0 && yi >= 0 && xi < w && yi < h && mask[yi * w + xi] === 1;
    };
  }
  // Cheap inward erosion via a squared-distance transform of the mask edge.
  const dist = erodedDistance(mask, w, h);
  return (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return false;
    return dist[yi * w + xi] >= inset;
  };
}

/** Two-pass chamfer distance from every set pixel to the nearest clear pixel. */
export function erodedDistance(mask, w, h) {
  const d = new Float32Array(w * h);
  const BIG = 1e9;
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? BIG : 0;
  const D1 = 1, D2 = 1.4142;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + D1);
      if (y > 0) v = Math.min(v, d[i - w] + D1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + D2);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + D2);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + D1);
      if (y < h - 1) v = Math.min(v, d[i + w] + D1);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + D2);
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + D2);
      d[i] = v;
    }
  }
  return d;
}

/**
 * Ink demand field: 0 = leave the paper white, 1 = solid black. Built once so
 * every pass agrees on what the tones are, then adjusted by the tone controls.
 *
 * Occlusion is folded in separately from luminance: AO carries the small-scale
 * form that engravers read as depth, and letting it bite a little harder than
 * pure radiometry is what keeps sockets, sutures and the nasal cavity reading.
 */
export function buildInk(fields, p) {
  const { width: w, height: h, lum, ao, mask, ndotv } = fields;
  const ink = new Float32Array(w * h);
  const floor = p.toneFloor, ceil = p.toneCeil;
  const span = Math.max(ceil - floor, 1e-3);
  const g = p.toneGamma;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) { ink[i] = 0; continue; }
    let v = lum[i] * (0.66 + 0.34 * ao[i]);
    // Remap the usable luminance window to 0..1, then invert to ink.
    v = (v - floor) / span;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    let k = Math.pow(1 - v, g);
    // Deep occlusion -- sockets, the nasal cavity, under the zygomatic arch --
    // is what an engraver renders almost solid, and radiometry alone understates
    // it because those cavities still catch a little bounce.
    const cav = 1 - ao[i];
    k += cav * cav * 0.42;
    // Grazing surfaces darken: the engraver's turn-under at the edge.
    k += (1 - Math.min(1, ndotv[i] * 2.4)) * 0.20;
    // Never quite solid: leaving a little headroom keeps line structure visible
    // in the darks instead of filling them in.
    ink[i] = k > 0.97 ? 0.97 : k;
  }
  return ink;
}

/** Screen-space gradient magnitude of a field, in units per pixel. */
export function gradientMag(f, w, h, x, y) {
  const gx = (sample(f, w, h, x + 1, y) - sample(f, w, h, x - 1, y)) * 0.5;
  const gy = (sample(f, w, h, x, y + 1) - sample(f, w, h, x, y - 1)) * 0.5;
  return Math.hypot(gx, gy);
}

/** Box-blur a field in place-ish (returns a new array). Used to calm noise. */
export function blur(f, w, h, radius = 1) {
  if (radius <= 0) return f;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) acc += f[y * w + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      const add = f[y * w + Math.min(w - 1, x + radius + 1)];
      const sub = f[y * w + Math.max(0, x - radius)];
      acc += add - sub;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      const add = tmp[Math.min(h - 1, y + radius + 1) * w + x];
      const sub = tmp[Math.max(0, y - radius) * w + x];
      acc += add - sub;
    }
  }
  return out;
}
