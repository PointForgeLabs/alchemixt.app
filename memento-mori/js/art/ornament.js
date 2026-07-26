// Frames, vignette shapes and the memento mori accessories. Everything here
// works in page millimetres with y increasing downward, and returns plain arrays
// of polylines ready to be layered into the drawing.

import {
  ellipseRing, rectRing, roundRectRing, archRing, closeRing, resample,
} from '../geom.js';

/* --------------------------------------------------------------- curves --- */

export function bezier(p0, p1, p2, p3, steps = 40) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    pts.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
  return pts;
}

/** Logarithmic spiral, the basis of every engraved corner scroll. */
export function spiral(cx, cy, r0, turns, growth, startAngle = 0, steps = 90) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = startAngle + t * turns * Math.PI * 2;
    const r = r0 * Math.pow(growth, t * turns);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function tangentAt(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
}

/* --------------------------------------------------------------- frames --- */

/**
 * @returns {{paths: Array, inner: {x0,y0,x1,y1}}} the frame strokes and the
 *          rectangle the picture must stay inside.
 */
export function buildFrame(rect, style, rng) {
  const { x0, y0, x1, y1 } = rect;
  const paths = [];
  const pad = (d) => ({ x0: x0 + d, y0: y0 + d, x1: x1 - d, y1: y1 - d });

  if (style === 'none') return { paths, inner: rect };

  if (style === 'hairline') {
    paths.push(closeRing(rectRing(x0, y0, x1, y1)));
    return { paths, inner: pad(3) };
  }

  if (style === 'double') {
    paths.push(closeRing(rectRing(x0, y0, x1, y1)));
    const i = pad(2.4);
    paths.push(closeRing(rectRing(i.x0, i.y0, i.x1, i.y1)));
    return { paths, inner: pad(6) };
  }

  if (style === 'shaded') {
    paths.push(closeRing(rectRing(x0, y0, x1, y1)));
    const i = pad(4.5);
    paths.push(closeRing(rectRing(i.x0, i.y0, i.x1, i.y1)));
    // Diagonal fill in the band between the two rules.
    const step = 1.1;
    const span = (x1 - x0) + (y1 - y0);
    for (let k = -span; k < span; k += step) {
      const seg = [[x0 + k, y0], [x0 + k + (y1 - y0), y1]];
      for (const piece of clipSegToBand(seg, rect, i)) paths.push(piece);
    }
    return { paths, inner: pad(8) };
  }

  // 'deco': double rule with a scroll at each corner.
  paths.push(closeRing(rectRing(x0, y0, x1, y1)));
  const i = pad(3);
  paths.push(closeRing(rectRing(i.x0, i.y0, i.x1, i.y1)));
  const s = Math.min(x1 - x0, y1 - y0) * 0.085;
  const corners = [
    [i.x0, i.y0, 1, 1], [i.x1, i.y0, -1, 1], [i.x1, i.y1, -1, -1], [i.x0, i.y1, 1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    const a = bezier(
      [cx + sx * s * 2.4, cy], [cx + sx * s * 1.1, cy + sy * s * 0.15],
      [cx + sx * s * 0.4, cy + sy * s * 0.9], [cx, cy + sy * s * 2.4], 26,
    );
    paths.push(a);
    const sp = spiral(cx + sx * s * 0.85, cy + sy * s * 0.85, s * 0.55, 0.8, 0.42,
                      sy > 0 ? 0.6 : 3.7);
    paths.push(sp.map(([px, py]) => [px, py]));
    paths.push(bezier(
      [cx + sx * s * 2.4, cy], [cx + sx * s * 1.6, cy + sy * s * 0.6],
      [cx + sx * s * 1.2, cy + sy * s * 1.2], [cx + sx * s * 0.4, cy + sy * s * 2.0], 20,
    ));
  }
  return { paths, inner: pad(7 + s * 0.6) };
}

/** Keep the parts of a segment that fall between the outer and inner rects. */
function clipSegToBand(seg, outer, inner) {
  const out = [];
  const steps = 120;
  let run = null;
  const inRect = (p, r) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const p = [seg[0][0] + (seg[1][0] - seg[0][0]) * t, seg[0][1] + (seg[1][1] - seg[0][1]) * t];
    const ok = inRect(p, outer) && !inRect(p, inner);
    if (ok) { if (!run) { run = [p]; out.push(run); } else run.push(p); }
    else run = null;
  }
  return out.filter((r) => r.length > 1);
}

/* ------------------------------------------------------------- vignettes --- */

export function vignetteRing(kind, rect) {
  const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
  const rx = (rect.x1 - rect.x0) / 2, ry = (rect.y1 - rect.y0) / 2;
  switch (kind) {
    case 'oval': return ellipseRing(cx, cy, rx, ry, 300);
    case 'circle': return ellipseRing(cx, cy, Math.min(rx, ry), Math.min(rx, ry), 260);
    case 'arch': return closeRing(archRing(rect.x0, rect.y0, rect.x1, rect.y1, 0.5, 120));
    case 'feathered': return ellipseRing(cx, cy, rx, ry, 300);
    default: return null;
  }
}

/* ------------------------------------------------------------ botanicals --- */

/** An almond leaf on a stem: outline plus midrib, optionally veined. */
function leaf(x, y, len, wid, angle, veins, curl = 0.25) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const to = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
  const up = [], dn = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const bulge = Math.sin(Math.PI * t) ** 0.85;
    const drift = curl * len * t * t;
    up.push(to(t * len, -bulge * wid + drift * 0.15));
    dn.push(to(t * len, bulge * wid * 0.82 + drift * 0.15));
  }
  const outline = up.concat(dn.reverse());
  const paths = [outline];
  const rib = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    rib.push(to(t * len, curl * len * t * t * 0.15));
  }
  paths.push(rib);
  if (veins) {
    for (let k = 1; k <= 3; k++) {
      const t = 0.22 + k * 0.19;
      const bulge = Math.sin(Math.PI * t) ** 0.85;
      paths.push([to(t * len, 0), to((t + 0.16) * len, -bulge * wid * 0.7)]);
      paths.push([to(t * len, 0), to((t + 0.16) * len, bulge * wid * 0.6)]);
    }
  }
  return paths;
}

/** Leaves alternating along a stem, tapering toward the tip. */
function spray(stem, { count, len, wid, veins, splay = 0.7, taper = 0.55, flip = 1 }) {
  const paths = [stem];
  const pts = resample(stem, Math.max(0.6, stem.length / 40));
  for (let k = 0; k < count; k++) {
    const t = 0.12 + (k / Math.max(count - 1, 1)) * 0.84;
    const i = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
    const [tx, ty] = tangentAt(pts, i);
    const side = k % 2 === 0 ? 1 : -1;
    const base = Math.atan2(ty, tx);
    const a = base + side * flip * splay;
    const scale = 1 - taper * t;
    for (const p of leaf(pts[i][0], pts[i][1], len * scale, wid * scale, a, veins,
                         0.3 * side)) {
      paths.push(p);
    }
  }
  return paths;
}

/**
 * Placed by its springing point and its reach rather than by a bounding box:
 * the band under a skull is shallow and wide, and sizing an arrangement to that
 * box either shrinks it to a token squiggle or drops it onto the lettering.
 *
 * @param {number} at.cx     midline the arrangement is symmetric about
 * @param {number} at.cy     springing point (the base of the stems)
 * @param {number} at.reach  half-span; the arrangement rises about 0.62 of this
 */
export function buildBotanical(kind, at, rng) {
  if (kind === 'none') return [];
  const { cx, cy: baseY, reach } = at;
  const w = reach * 2, h = reach;
  const paths = [];

  // Build one side, then reflect it. Building the second side with s = -1 and
  // *also* reflecting it would land both sprays on top of each other.
  const mirrored = (build) => {
    const side = build(1);
    for (const p of side) paths.push(p);
    for (const p of side) paths.push(p.map(([x, y]) => [2 * cx - x, y]));
  };

  if (kind === 'laurel') {
    mirrored((s) => spray(
      bezier([cx + s * reach * 0.06, baseY],
             [cx + s * reach * 0.52, baseY - reach * 0.04],
             [cx + s * reach * 0.94, baseY - reach * 0.30],
             [cx + s * reach * 1.0, baseY - reach * 0.62], 44),
      { count: 11, len: reach * 0.30, wid: reach * 0.075, veins: true, splay: 0.85 * s, flip: 1 },
    ));
  } else if (kind === 'wheat') {
    mirrored((s) => {
      const stem = bezier([cx + s * reach * 0.04, baseY],
                          [cx + s * reach * 0.4, baseY - reach * 0.10],
                          [cx + s * reach * 0.82, baseY - reach * 0.34],
                          [cx + s * reach * 0.92, baseY - reach * 0.66], 40);
      const out = [stem];
      const pts = resample(stem, 1.1);
      for (let k = 0; k < 16; k++) {
        const t = 0.25 + (k / 15) * 0.72;
        const i = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
        const [tx, ty] = tangentAt(pts, i);
        const base = Math.atan2(ty, tx);
        const gl = reach * 0.14 * (1 - 0.4 * t);
        for (const side of [1, -1]) {
          const a = base + side * 1.05 * s;
          out.push(...leaf(pts[i][0], pts[i][1], gl, gl * 0.28, a, false, 0.1));
          // Awn.
          out.push([
            [pts[i][0] + Math.cos(a) * gl, pts[i][1] + Math.sin(a) * gl],
            [pts[i][0] + Math.cos(a) * gl * 2.1, pts[i][1] + Math.sin(a) * gl * 2.1],
          ]);
        }
      }
      return out;
    });
  } else if (kind === 'ivy') {
    mirrored((s) => {
      const stem = bezier([cx + s * reach * 0.04, baseY],
                          [cx + s * reach * 0.68, baseY - reach * 0.02],
                          [cx + s * reach * 0.58, baseY - reach * 0.42],
                          [cx + s * reach * 1.02, baseY - reach * 0.62], 46);
      const out = [stem];
      const pts = resample(stem, 1.1);
      for (let k = 0; k < 7; k++) {
        const t = 0.14 + (k / 6) * 0.82;
        const i = Math.min(pts.length - 1, Math.round(t * (pts.length - 1)));
        const [tx, ty] = tangentAt(pts, i);
        const base = Math.atan2(ty, tx) + (k % 2 ? 1 : -1) * 1.0 * s;
        const L = reach * 0.26 * (1 - 0.3 * t);
        // Ivy leaf: three lobes built from overlapping almonds.
        for (const off of [-0.5, 0, 0.5]) {
          out.push(...leaf(pts[i][0], pts[i][1], L * (off === 0 ? 1 : 0.72),
                           L * 0.26, base + off, false, 0.05));
        }
      }
      return out;
    });
  } else if (kind === 'rose') {
    // A single wilting rose, head bowed.
    const stem = bezier([cx, baseY], [cx + reach * 0.1, baseY - reach * 0.40],
                        [cx + reach * 0.58, baseY - reach * 0.58], [cx + reach * 0.5, baseY - reach * 0.74], 40);
    paths.push(stem);
    const hx = stem[stem.length - 1][0], hy = stem[stem.length - 1][1];
    const R = reach * 0.20;
    for (let k = 0; k < 5; k++) {
      const a = -1.9 + k * 0.72;
      paths.push(...leaf(hx, hy, R * (1 - k * 0.06), R * 0.42, a, false, 0.5));
    }
    for (let k = 0; k < 3; k++) {
      paths.push(ellipseRing(hx + R * 0.1, hy - R * 0.15, R * (0.5 - k * 0.13),
                             R * (0.38 - k * 0.1), 40, 0.4));
    }
    // Two fallen petals.
    for (let k = 0; k < 2; k++) {
      const px = cx - reach * (0.5 + k * 0.35), py = baseY - reach * 0.01;
      paths.push(ellipseRing(px, py, R * 0.34, R * 0.16, 26, k ? -0.5 : 0.3));
    }
    // Leaves on the stem.
    const pts = resample(stem, 1.2);
    for (let k = 0; k < 4; k++) {
      const i = Math.round((0.25 + k * 0.18) * (pts.length - 1));
      const [tx, ty] = tangentAt(pts, i);
      const a = Math.atan2(ty, tx) + (k % 2 ? 1.2 : -1.2);
      paths.push(...leaf(pts[i][0], pts[i][1], reach * 0.22, reach * 0.07, a, true, 0.2));
    }
  } else if (kind === 'palm') {
    mirrored((s) => spray(
      bezier([cx + s * reach * 0.05, baseY],
             [cx + s * reach * 0.68, baseY - reach * 0.06],
             [cx + s * reach * 1.04, baseY - reach * 0.36],
             [cx + s * reach * 1.10, baseY - reach * 0.72], 46),
      { count: 18, len: reach * 0.34, wid: reach * 0.035, veins: false, splay: 1.15 * s, taper: 0.65 },
    ));
  }
  return paths;
}

/* --------------------------------------------------------------- motifs --- */

export function buildHourglass(cx, cy, h, rng) {
  const w = h * 0.52;
  const paths = [];
  const hw = w / 2, hh = h / 2, neck = w * 0.07;
  // Frame: top and bottom plates plus two posts.
  paths.push([[cx - hw * 1.16, cy - hh], [cx + hw * 1.16, cy - hh]]);
  paths.push([[cx - hw * 1.16, cy + hh], [cx + hw * 1.16, cy + hh]]);
  paths.push([[cx - hw * 1.05, cy - hh], [cx - hw * 1.05, cy + hh]]);
  paths.push([[cx + hw * 1.05, cy - hh], [cx + hw * 1.05, cy + hh]]);
  // Glass: two funnels meeting at the neck.
  for (const s of [-1, 1]) {
    paths.push(bezier([cx + s * hw, cy - hh * 0.88], [cx + s * hw * 0.92, cy - hh * 0.3],
                      [cx + s * neck * 2.2, cy - hh * 0.12], [cx + s * neck, cy], 26));
    paths.push(bezier([cx + s * neck, cy], [cx + s * neck * 2.2, cy + hh * 0.12],
                      [cx + s * hw * 0.92, cy + hh * 0.3], [cx + s * hw, cy + hh * 0.88], 26));
  }
  paths.push([[cx - hw, cy - hh * 0.88], [cx + hw, cy - hh * 0.88]]);
  paths.push([[cx - hw, cy + hh * 0.88], [cx + hw, cy + hh * 0.88]]);
  // Sand: a heap below, a cone above, and the falling thread.
  paths.push(bezier([cx - hw * 0.8, cy + hh * 0.88], [cx - hw * 0.4, cy + hh * 0.46],
                    [cx + hw * 0.4, cy + hh * 0.46], [cx + hw * 0.8, cy + hh * 0.88], 24));
  paths.push([[cx - hw * 0.86, cy - hh * 0.5], [cx + hw * 0.86, cy - hh * 0.5]]);
  paths.push([[cx, cy - hh * 0.05], [cx, cy + hh * 0.62]]);
  return paths;
}

export function buildCrossbones(cx, cy, len, rng) {
  const paths = [];
  const bone = (angle) => {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const to = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
    const half = len / 2, r = len * 0.055;
    const out = [];
    // Shaft.
    out.push([to(-half * 0.78, -r), to(half * 0.78, -r)]);
    out.push([to(-half * 0.78, r), to(half * 0.78, r)]);
    // Condyles: two lobes at each end.
    for (const s of [-1, 1]) {
      for (const v of [-1, 1]) {
        const c = to(s * half * 0.82, v * r * 1.5);
        out.push(ellipseRing(c[0], c[1], r * 2.0, r * 1.7, 26, angle));
      }
    }
    return out;
  };
  for (const p of bone(0.42)) paths.push(p);
  for (const p of bone(-0.42)) paths.push(p);
  return paths;
}

export function buildWings(cx, cy, span, rng) {
  const paths = [];
  for (const s of [-1, 1]) {
    const root = [cx + s * span * 0.1, cy];
    const tip = [cx + s * span * 0.5, cy - span * 0.1];
    const spine = bezier(root, [cx + s * span * 0.25, cy - span * 0.16],
                         [cx + s * span * 0.42, cy - span * 0.16], tip, 34);
    paths.push(spine);
    // Three rows of feathers, longest at the trailing edge.
    for (let row = 0; row < 3; row++) {
      const rowLen = span * (0.10 + row * 0.055);
      const n = 9 - row;
      for (let k = 0; k < n; k++) {
        const t = 0.12 + (k / (n - 1)) * 0.86;
        const i = Math.round(t * (spine.length - 1));
        const [tx, ty] = tangentAt(spine, i);
        const a = Math.atan2(ty, tx) + s * (1.15 - row * 0.12);
        const L = rowLen * (0.55 + 0.7 * Math.sin(Math.PI * t) ** 0.6);
        const bx = spine[i][0] + Math.cos(a) * rowLen * row * 0.55;
        const by = spine[i][1] + Math.sin(a) * rowLen * row * 0.55;
        paths.push(...leaf(bx, by, L, L * 0.16, a, false, 0.18 * s));
      }
    }
  }
  return paths;
}

export function buildRosette(cx, cy, r, petals = 12) {
  const paths = [ellipseRing(cx, cy, r * 0.2, r * 0.2, 40)];
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * Math.PI * 2;
    paths.push(...leaf(cx + Math.cos(a) * r * 0.2, cy + Math.sin(a) * r * 0.2,
                       r * 0.8, r * 0.16, a, false, 0));
  }
  paths.push(ellipseRing(cx, cy, r * 1.06, r * 1.06, 90));
  return paths;
}

/** Registration crosses for multi-pen work, one per corner. */
export function buildRegistration(rect, size = 5) {
  const paths = [];
  const pts = [
    [rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x1, rect.y1], [rect.x0, rect.y1],
  ];
  for (const [x, y] of pts) {
    paths.push([[x - size / 2, y], [x + size / 2, y]]);
    paths.push([[x, y - size / 2], [x, y + size / 2]]);
  }
  return paths;
}

export { roundRectRing };
