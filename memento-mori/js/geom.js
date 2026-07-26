// Polyline geometry. Everything here works on plain arrays of [x, y] pairs and
// is coordinate-system agnostic; the app uses page millimetres, y increasing
// downward (SVG convention) from the moment geometry leaves the raster stage.

export const EPS = 1e-9;

export function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }

export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

export function bbox(paths) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of paths) {
    for (const [x, y] of p) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function transformPaths(paths, fn) {
  return paths.map((p) => p.map(fn));
}

/** Affine helper: scale about (0,0) then translate. */
export function mapPaths(paths, sx, sy, tx, ty) {
  return paths.map((p) => p.map(([x, y]) => [x * sx + tx, y * sy + ty]));
}

/* ------------------------------------------------------------ resampling --- */

/** Uniform arc-length resample. Keeps both endpoints. */
export function resample(pts, step) {
  if (pts.length < 2 || step <= 0) return pts.slice();
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    let seg = dist(a, b);
    if (seg < EPS) continue;
    const dx = (b[0] - a[0]) / seg, dy = (b[1] - a[1]) / seg;
    let t = step - carry;
    while (t <= seg) {
      out.push([a[0] + dx * t, a[1] + dy * t]);
      t += step;
    }
    carry = seg - (t - step);
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.35) out.push(last.slice());
  return out;
}

/** Ramer-Douglas-Peucker. Iterative so long paths can't blow the stack. */
export function simplify(pts, tol) {
  if (pts.length < 3 || tol <= 0) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [i0, i1] = stack.pop();
    if (i1 - i0 < 2) continue;
    const ax = pts[i0][0], ay = pts[i0][1];
    const bx = pts[i1][0], by = pts[i1][1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1, bestD = 0;
    for (let i = i0 + 1; i < i1; i++) {
      const px = pts[i][0] - ax, py = pts[i][1] - ay;
      let d2;
      if (len2 < EPS) {
        d2 = px * px + py * py;
      } else {
        let t = (px * dx + py * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - dx * t, ey = py - dy * t;
        d2 = ex * ex + ey * ey;
      }
      if (d2 > bestD) { bestD = d2; best = i; }
    }
    if (bestD > tol2 && best > 0) {
      keep[best] = 1;
      stack.push([i0, best], [best, i1]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/** Chaikin corner cutting. `closed` keeps the loop watertight. */
export function smoothChaikin(pts, iterations = 1, closed = false) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) return cur;
    const next = [];
    if (!closed) next.push(cur[0].slice());
    const n = cur.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = cur[i], b = cur[(i + 1) % n];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) next.push(cur[n - 1].slice());
    cur = next;
  }
  return cur;
}

/** Gaussian-ish smoothing that keeps the point count and pins the ends. */
export function smoothMoving(pts, passes = 1, closed = false) {
  let cur = pts.map((p) => p.slice());
  const n = cur.length;
  if (n < 3) return cur;
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.map((p) => p.slice());
    const lo = closed ? 0 : 1;
    const hi = closed ? n : n - 1;
    for (let i = lo; i < hi; i++) {
      const a = cur[(i - 1 + n) % n], b = cur[i], c = cur[(i + 1) % n];
      next[i][0] = a[0] * 0.25 + b[0] * 0.5 + c[0] * 0.25;
      next[i][1] = a[1] * 0.25 + b[1] * 0.5 + c[1] * 0.25;
    }
    cur = next;
  }
  return cur;
}

/* -------------------------------------------------------------- clipping --- */

/** Liang-Barsky clip of one segment to an axis-aligned rect. */
function clipSegRect(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - r.x0, r.x1 - a[0], a[1] - r.y0, r.y1 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPS) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return [
    [a[0] + dx * t0, a[1] + dy * t0],
    [a[0] + dx * t1, a[1] + dy * t1],
  ];
}

/** Clip a polyline to a rect, returning the pieces that survive. */
export function clipToRect(pts, rect) {
  const out = [];
  let run = null;
  for (let i = 1; i < pts.length; i++) {
    const seg = clipSegRect(pts[i - 1], pts[i], rect);
    if (!seg) { run = null; continue; }
    if (run && dist(run[run.length - 1], seg[0]) < 1e-6) {
      run.push(seg[1]);
    } else {
      run = [seg[0], seg[1]];
      out.push(run);
    }
  }
  return out.filter((p) => polylineLength(p) > EPS);
}

export function pointInRing(pt, ring) {
  let inside = false;
  const x = pt[0], y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y)) {
      const xInt = xi + ((y - yi) / (yj - yi)) * (xj - xi);
      if (x < xInt) inside = !inside;
    }
  }
  return inside;
}

/**
 * Exact clip of a polyline against a closed ring. Splits every segment at all
 * ring crossings and keeps the runs whose midpoint is on the wanted side, so
 * the resulting cut is crisp rather than sampled.
 */
export function clipToRing(pts, ring, keepInside = true) {
  const out = [];
  let run = null;
  const n = ring.length;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const ts = [0, 1];
    for (let j = 0; j < n; j++) {
      const c = ring[j], d = ring[(j + 1) % n];
      const ex = d[0] - c[0], ey = d[1] - c[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < EPS) continue;
      const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
      const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
      if (t > EPS && t < 1 - EPS && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    for (let k = 1; k < ts.length; k++) {
      const t0 = ts[k - 1], t1 = ts[k];
      if (t1 - t0 < 1e-7) continue;
      const tm = (t0 + t1) * 0.5;
      const inside = pointInRing([a[0] + dx * tm, a[1] + dy * tm], ring);
      if (inside !== keepInside) { run = null; continue; }
      const p0 = [a[0] + dx * t0, a[1] + dy * t0];
      const p1 = [a[0] + dx * t1, a[1] + dy * t1];
      if (run && dist(run[run.length - 1], p0) < 1e-6) run.push(p1);
      else { run = [p0, p1]; out.push(run); }
    }
  }
  return out.filter((p) => polylineLength(p) > EPS);
}

/** Clip a whole set of paths to a ring. */
export function clipPathsToRing(paths, ring, keepInside = true) {
  const out = [];
  for (const p of paths) {
    if (p.length < 2) continue;
    for (const piece of clipToRing(p, ring, keepInside)) out.push(piece);
  }
  return out;
}

/* --------------------------------------------------------------- shapes --- */

export function ellipseRing(cx, cy, rx, ry, steps = 256, rot = 0) {
  const pts = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}

export function circleRing(cx, cy, r, steps = 192) {
  return ellipseRing(cx, cy, r, r, steps);
}

export function rectRing(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

export function roundRectRing(x0, y0, x1, y1, r, stepsPerCorner = 12) {
  const w = x1 - x0, h = y1 - y0;
  r = Math.min(r, Math.min(w, h) / 2);
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= stepsPerCorner; i++) {
      const a = a0 + (i / stepsPerCorner) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return pts;
}

/** Arched "tombstone" outline: rectangle with a semicircular (or ogee) top. */
export function archRing(x0, y0, x1, y1, shoulder = 0.5, steps = 96) {
  const w = x1 - x0;
  const rx = w / 2;
  const ry = rx * shoulder * 2;
  const cx = (x0 + x1) / 2;
  const topY = y0 + ry;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI;
    pts.push([cx + Math.cos(a) * rx, topY + Math.sin(a) * ry]);
  }
  pts.push([x1, y1], [x0, y1]);
  return pts;
}

export function closeRing(ring) {
  const out = ring.map((p) => p.slice());
  if (dist(out[0], out[out.length - 1]) > EPS) out.push(out[0].slice());
  return out;
}

/* -------------------------------------------------------------- chaining --- */

/**
 * Weld paths whose endpoints coincide within `tol` into longer strokes. Fewer,
 * longer paths means fewer pen lifts, which is most of the win on a plotter.
 */
export function chainPaths(paths, tol = 0.12) {
  const cell = Math.max(tol, 1e-4) * 2;
  const key = (p) => `${Math.round(p[0] / cell)},${Math.round(p[1] / cell)}`;
  const items = paths.filter((p) => p.length >= 2).map((p) => ({ pts: p, used: false }));
  const buckets = new Map();
  const add = (p, idx, end) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = `${Math.round(p[0] / cell) + dx},${Math.round(p[1] / cell) + dy}`;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push({ idx, end });
      }
    }
  };
  items.forEach((it, i) => {
    add(it.pts[0], i, 0);
    add(it.pts[it.pts.length - 1], i, 1);
  });

  const findNext = (pt, skip) => {
    const cands = buckets.get(key(pt));
    if (!cands) return null;
    let best = null, bestD = tol;
    for (const c of cands) {
      if (c.idx === skip || items[c.idx].used) continue;
      const p = c.end === 0 ? items[c.idx].pts[0] : items[c.idx].pts[items[c.idx].pts.length - 1];
      const d = dist(pt, p);
      if (d <= bestD) { bestD = d; best = c; }
    }
    return best;
  };

  const out = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].used) continue;
    items[i].used = true;
    let chain = items[i].pts.map((p) => p.slice());
    // Extend forward, then backward.
    for (let guard = 0; guard < 10000; guard++) {
      const tail = chain[chain.length - 1];
      const nxt = findNext(tail, -1);
      if (!nxt) break;
      items[nxt.idx].used = true;
      const seg = items[nxt.idx].pts;
      const ordered = nxt.end === 0 ? seg : seg.slice().reverse();
      for (let k = 1; k < ordered.length; k++) chain.push(ordered[k].slice());
    }
    for (let guard = 0; guard < 10000; guard++) {
      const head = chain[0];
      const nxt = findNext(head, -1);
      if (!nxt) break;
      items[nxt.idx].used = true;
      const seg = items[nxt.idx].pts;
      const ordered = nxt.end === 1 ? seg : seg.slice().reverse();
      const pre = ordered.slice(0, ordered.length - 1).reverse();
      chain = pre.map((p) => p.slice()).concat(chain);
    }
    out.push(chain);
  }
  return out;
}

/** Drop paths shorter than a threshold; they read as dirt on paper. */
export function dropShort(paths, minLen) {
  return paths.filter((p) => p.length >= 2 && polylineLength(p) >= minLen);
}

/** Remove points closer together than `minStep` (plotters gain nothing). */
export function decimate(paths, minStep) {
  return paths.map((p) => {
    if (p.length < 3) return p;
    const out = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      if (dist(out[out.length - 1], p[i]) >= minStep) out.push(p[i]);
    }
    out.push(p[p.length - 1]);
    return out;
  });
}
