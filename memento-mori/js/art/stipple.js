// Weighted stippling. Dart throwing with a density-dependent rejection radius
// gives dot spacing proportional to 1/sqrt(ink), which is the relationship that
// makes a stipple read as an even tonal ramp rather than as clumps.

/**
 * @param {Float32Array} ink   0..1 ink demand, one value per pixel
 * @param {function} inside    (x,y) -> boolean
 * @param {number} spacingPx   dot spacing at full ink
 * @param {number} maxDots     hard cap, so a dense plate cannot run for hours
 * @returns {Array<[number,number]>} dot centres in pixel space
 */
export function stipplePoints({ ink, width: w, height: h, inside, spacingPx, maxDots, rng, gamma = 1 }) {
  const cell = Math.max(spacingPx, 1.2);
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const grid = new Array(gw * gh);
  const dots = [];
  const attempts = Math.min(maxDots * 26, 4_000_000);

  for (let a = 0; a < attempts && dots.length < maxDots; a++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const xi = x | 0, yi = y | 0;
    const k = ink[yi * w + xi];
    if (k <= 0.012) continue;
    if (!inside(x, y)) continue;
    const weight = Math.pow(k, gamma);
    // Radius grows as the tone lightens.
    const r = cell / Math.sqrt(Math.max(weight, 0.02));
    const gx = Math.min(gw - 1, (x / cell) | 0);
    const gy = Math.min(gh - 1, (y / cell) | 0);
    const span = Math.ceil(r / cell);
    let ok = true;
    for (let dy = -span; dy <= span && ok; dy++) {
      for (let dx = -span; dx <= span && ok; dx++) {
        const cxi = gx + dx, cyi = gy + dy;
        if (cxi < 0 || cyi < 0 || cxi >= gw || cyi >= gh) continue;
        const bucket = grid[cyi * gw + cxi];
        if (!bucket) continue;
        for (const [bx, by] of bucket) {
          if ((bx - x) ** 2 + (by - y) ** 2 < r * r) { ok = false; break; }
        }
      }
    }
    if (!ok) continue;
    const gi = gy * gw + gx;
    if (!grid[gi]) grid[gi] = [];
    grid[gi].push([x, y]);
    dots.push([x, y]);
  }
  return dots;
}

/**
 * Turn dots into plottable strokes. A zero-length path is ambiguous to a lot of
 * plotter software, so each dot is a very short stroke in a random direction --
 * which also stops a dense stipple looking machine-stamped.
 */
export function dotsToStrokes(dots, lengthPx, rng) {
  const out = [];
  for (const [x, y] of dots) {
    const a = rng.next() * Math.PI * 2;
    const hx = (Math.cos(a) * lengthPx) / 2;
    const hy = (Math.sin(a) * lengthPx) / 2;
    out.push([[x - hx, y - hy], [x + hx, y + hy]]);
  }
  return out;
}
