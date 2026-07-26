// A single-stroke ("engraver's") roman. Every glyph is a set of open polylines
// with no outlines and no fill, because that is what a pen can actually draw --
// a normal outline font has to be double-stroked or filled, which looks wrong and
// takes forever to plot.
//
// Coordinates: baseline y = 0, y increasing upward, cap height 14, x-height 9.5,
// descender -4.5. Each glyph declares its own advance width, side bearings
// included. Callers scale by (size / 14) to get millimetres of cap height.

export const CAP_HEIGHT = 14;
export const X_HEIGHT = 9.5;
export const DESCENDER = -4.5;

class Pen {
  constructor() { this.paths = []; this.cur = null; }

  m(x, y) { this.cur = [[x, y]]; this.paths.push(this.cur); return this; }

  l(x, y) { this.cur.push([x, y]); return this; }

  /** Elliptical arc, angles in degrees, counter-clockwise from +x. */
  a(cx, cy, rx, ry, a0, a1, steps) {
    const n = steps || Math.max(6, Math.round(Math.abs(a1 - a0) / 12));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
    }
    if (this.cur) {
      // Continue the current stroke if the arc starts where we already are.
      const last = this.cur[this.cur.length - 1];
      const gap = Math.hypot(last[0] - pts[0][0], last[1] - pts[0][1]);
      if (gap < 0.6) { for (let i = 1; i < pts.length; i++) this.cur.push(pts[i]); return this; }
    }
    this.cur = pts;
    this.paths.push(pts);
    return this;
  }

  /** Catmull-Rom spline through the given knots -- how the curved glyphs are cut. */
  c(...knots) {
    const k = knots;
    if (k.length < 2) return this;
    const ext = [k[0], ...k, k[k.length - 1]];
    const pts = [k[0].slice()];
    const SEG = 5;
    for (let i = 1; i < ext.length - 2; i++) {
      const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
      for (let s = 1; s <= SEG; s++) {
        const t = s / SEG, t2 = t * t, t3 = t2 * t;
        pts.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    if (this.cur) {
      const last = this.cur[this.cur.length - 1];
      if (Math.hypot(last[0] - pts[0][0], last[1] - pts[0][1]) < 0.6) {
        for (let i = 1; i < pts.length; i++) this.cur.push(pts[i]);
        return this;
      }
    }
    this.cur = pts;
    this.paths.push(pts);
    return this;
  }
}

const G = (width, build) => {
  const pen = new Pen();
  build(pen);
  return { width, paths: pen.paths };
};

/* ------------------------------------------------------------- glyph set --- */

export const GLYPHS = {
  ' ': { width: 6, paths: [] },

  /* ---- capitals ---- */
  A: G(13, (p) => { p.m(0, 0).l(6.5, 14).l(13, 0); p.m(2.4, 4.6).l(10.6, 4.6); }),
  B: G(11.6, (p) => {
    p.m(0, 14).l(6, 14).a(6, 10.9, 3.4, 3.1, 90, -90).l(0, 7.8);
    p.m(0, 7.8).l(6.6, 7.8).a(6.6, 3.9, 3.8, 3.9, 90, -90).l(0, 0);
    p.m(0, 0).l(0, 14);
  }),
  C: G(12.4, (p) => p.a(6.2, 7, 6.2, 7, 52, 308)),
  D: G(12.4, (p) => { p.m(0, 0).l(0, 14).l(5, 14).a(5, 7, 7.2, 7, 90, -90).l(0, 0); }),
  E: G(10.6, (p) => { p.m(10.4, 14).l(0, 14).l(0, 0).l(10.4, 0); p.m(0, 7.4).l(8.2, 7.4); }),
  F: G(10.2, (p) => { p.m(0, 0).l(0, 14).l(10.2, 14); p.m(0, 7.4).l(7.8, 7.4); }),
  G: G(12.8, (p) => {
    p.a(6.2, 7, 6.2, 7, 52, 300);
    p.m(12.6, 5.9).l(12.6, 0.9).l(9.3, 0.9);
    p.m(12.6, 5.9).l(8.4, 5.9);
  }),
  H: G(12.4, (p) => { p.m(0, 0).l(0, 14); p.m(12.4, 0).l(12.4, 14); p.m(0, 7.4).l(12.4, 7.4); }),
  I: G(5, (p) => { p.m(0.6, 14).l(4.4, 14); p.m(2.5, 14).l(2.5, 0); p.m(0.6, 0).l(4.4, 0); }),
  J: G(9.2, (p) => {
    p.m(6.8, 14).l(6.8, 3.8).a(3.5, 3.8, 3.3, 3.8, 0, -180).l(0.2, 5.6);
    p.m(4.9, 14).l(8.7, 14);
  }),
  K: G(12, (p) => { p.m(0, 0).l(0, 14); p.m(11.6, 14).l(0, 6.4); p.m(4.2, 9.2).l(12, 0); }),
  L: G(10, (p) => p.m(0, 14).l(0, 0).l(10, 0)),
  M: G(15, (p) => p.m(0, 0).l(0, 14).l(7.5, 2.4).l(15, 14).l(15, 0)),
  N: G(12.6, (p) => p.m(0, 0).l(0, 14).l(12.6, 0).l(12.6, 14)),
  O: G(13, (p) => p.a(6.5, 7, 6.5, 7, 0, 360)),
  P: G(11.2, (p) => { p.m(0, 0).l(0, 14).l(6, 14).a(6, 10.6, 3.6, 3.4, 90, -90).l(0, 7.2); }),
  Q: G(13, (p) => { p.a(6.5, 7, 6.5, 7, 0, 360); p.m(8.2, 3.6).l(13, -1.4); }),
  R: G(11.6, (p) => {
    p.m(0, 0).l(0, 14).l(6, 14).a(6, 10.6, 3.6, 3.4, 90, -90).l(0, 7.2);
    p.m(5.6, 7.2).l(11.6, 0);
  }),
  S: G(11, (p) => p.c([9.8, 12.2], [7.6, 13.9], [4.4, 14.1], [1.6, 12.9], [1, 10.6],
                      [2.4, 8.6], [5.6, 7.6], [8.8, 6.4], [10.2, 4.2], [9.2, 1.6],
                      [6, 0], [2.6, 0.3], [0.4, 2])),
  T: G(11, (p) => { p.m(0, 14).l(11, 14); p.m(5.5, 14).l(5.5, 0); }),
  U: G(12.4, (p) => p.c([0, 14], [0, 5.4], [0.8, 2.2], [3.4, 0.2], [6.2, 0],
                        [9, 0.2], [11.6, 2.2], [12.4, 5.4], [12.4, 14])),
  V: G(13, (p) => p.m(0, 14).l(6.5, 0).l(13, 14)),
  W: G(18.6, (p) => p.m(0, 14).l(4.4, 0).l(9.3, 11.4).l(14.2, 0).l(18.6, 14)),
  X: G(12.4, (p) => { p.m(0, 0).l(12.4, 14); p.m(0, 14).l(12.4, 0); }),
  Y: G(12.4, (p) => { p.m(0, 14).l(6.2, 6.8).l(12.4, 14); p.m(6.2, 6.8).l(6.2, 0); }),
  Z: G(11.4, (p) => p.m(0, 14).l(11.4, 14).l(0, 0).l(11.4, 0)),

  /* ---- lowercase ---- */
  a: G(10, (p) => {
    p.m(8.6, 9.5).l(8.6, 0);
    p.c([8.6, 7.4], [7, 9.2], [4.2, 9.6], [1.6, 8.4], [0.4, 5.6], [0.8, 2.4],
        [3, 0.2], [5.8, 0], [8.6, 1.8]);
  }),
  b: G(10, (p) => {
    p.m(0, 14).l(0, 0);
    p.c([0, 7.2], [1.6, 9.2], [4.4, 9.6], [7, 8.4], [8.6, 5.6], [8.2, 2.4],
        [6, 0.2], [3.2, 0], [0, 2]);
  }),
  c: G(9.2, (p) => p.c([8.6, 7.6], [6.6, 9.3], [3.8, 9.5], [1.4, 8], [0.4, 5],
                       [1, 2], [3.2, 0.2], [6.2, 0], [8.6, 1.8])),
  d: G(10, (p) => {
    p.m(8.6, 14).l(8.6, 0);
    p.c([8.6, 7.2], [7, 9.2], [4.2, 9.6], [1.6, 8.4], [0, 5.6], [0.4, 2.4],
        [2.6, 0.2], [5.4, 0], [8.6, 2]);
  }),
  e: G(9.6, (p) => {
    p.m(0.4, 5.2).l(8.8, 5.2);
    p.c([8.8, 5.2], [8.6, 7.8], [6.2, 9.5], [3.4, 9.3], [1.1, 7.4], [0.4, 4.4],
        [1.4, 1.6], [4, 0], [6.6, 0.4], [8.6, 1.8]);
  }),
  f: G(7, (p) => {
    p.c([6.4, 13.4], [4.6, 14.3], [2.6, 13], [2.4, 10], [2.4, 0]);
    p.m(0, 9.5).l(5.8, 9.5);
  }),
  g: G(10, (p) => {
    p.c([8.6, 9.5], [8.6, -1.4], [7.6, -3.8], [4.6, -4.5], [1.8, -3.6]);
    p.c([8.6, 7.4], [7, 9.2], [4.2, 9.6], [1.6, 8.4], [0.4, 5.6], [0.8, 2.4],
        [3, 0.2], [5.8, 0], [8.6, 1.8]);
  }),
  h: G(10, (p) => {
    p.m(0, 14).l(0, 0);
    p.c([0, 6.6], [2, 9], [4.8, 9.6], [7.4, 8.4], [8.6, 6], [8.6, 0]);
  }),
  i: G(4.2, (p) => { p.m(2.1, 9.5).l(2.1, 0); p.m(2.1, 12.4).l(2.1, 13.5); }),
  j: G(5.2, (p) => {
    p.c([3.2, 9.5], [3.2, -1.6], [2.6, -3.8], [0.2, -4.4]);
    p.m(3.2, 12.4).l(3.2, 13.5);
  }),
  k: G(9.6, (p) => { p.m(0, 14).l(0, 0); p.m(8.6, 9.5).l(0.8, 3.4); p.m(3.4, 5.6).l(9.4, 0); }),
  l: G(4.2, (p) => p.m(2.1, 14).l(2.1, 0)),
  m: G(15, (p) => {
    p.m(0, 9.5).l(0, 0);
    p.c([0, 6.6], [1.6, 8.8], [4, 9.5], [6.2, 8.6], [7.2, 6.2], [7.2, 0]);
    p.c([7.2, 6.6], [8.8, 8.8], [11.2, 9.5], [13.4, 8.6], [14.6, 6.2], [14.6, 0]);
  }),
  n: G(10, (p) => {
    p.m(0, 9.5).l(0, 0);
    p.c([0, 6.6], [2, 8.9], [4.8, 9.6], [7.4, 8.4], [8.6, 6], [8.6, 0]);
  }),
  o: G(10, (p) => p.a(4.9, 4.75, 4.9, 4.75, 0, 360)),
  p: G(10, (p) => {
    p.m(0, 9.5).l(0, -4.5);
    p.c([0, 7], [1.6, 9], [4.4, 9.5], [7, 8.3], [8.6, 5.5], [8.2, 2.3],
        [6, 0.2], [3.2, 0], [0, 1.8]);
  }),
  q: G(10, (p) => {
    p.m(8.6, 9.5).l(8.6, -4.5);
    p.c([8.6, 7], [7, 9], [4.2, 9.5], [1.6, 8.3], [0, 5.5], [0.4, 2.3],
        [2.6, 0.2], [5.4, 0], [8.6, 1.8]);
  }),
  r: G(7.2, (p) => {
    p.m(0, 9.5).l(0, 0);
    p.c([0, 5.6], [1.2, 8.2], [3.4, 9.5], [6.6, 9.3]);
  }),
  s: G(8.6, (p) => p.c([7.8, 7.8], [5.6, 9.5], [3, 9.4], [1.2, 8], [1.6, 6],
                       [4.2, 4.8], [6.8, 3.9], [7.4, 2], [5.8, 0.3], [3, 0], [0.8, 1.4])),
  t: G(6.8, (p) => {
    p.c([2.4, 14], [2.4, 2.4], [2.8, 0.2], [5, -0.2], [6.6, 0.9]);
    p.m(0, 9.5).l(5.6, 9.5);
  }),
  u: G(10, (p) => {
    p.c([0, 9.5], [0, 3], [1.2, 0.6], [3.8, -0.2], [6.6, 0.6], [8.6, 3]);
    p.m(8.6, 9.5).l(8.6, 0);
  }),
  v: G(10, (p) => p.m(0, 9.5).l(5, 0).l(10, 9.5)),
  w: G(14.4, (p) => p.m(0, 9.5).l(3.4, 0).l(7.2, 7.8).l(11, 0).l(14.4, 9.5)),
  x: G(9.4, (p) => { p.m(0, 9.5).l(9.4, 0); p.m(0, 0).l(9.4, 9.5); }),
  y: G(9.8, (p) => { p.m(0, 9.5).l(5.2, 0.4); p.m(9.8, 9.5).l(2.4, -4.5); }),
  z: G(9.2, (p) => p.m(0, 9.5).l(9.2, 9.5).l(0, 0).l(9.2, 0)),

  /* ---- digits ---- */
  0: G(11, (p) => p.a(5.5, 7, 5.5, 7, 0, 360)),
  1: G(8.8, (p) => { p.m(1.6, 11.4).l(4.6, 14).l(4.6, 0); p.m(1.4, 0).l(7.6, 0); }),
  2: G(10, (p) => {
    p.c([0.6, 11], [2, 13.4], [5, 14.1], [7.8, 13], [8.6, 10.4], [7, 7.6],
        [0.4, 1.2], [0, 0]);
    p.l(9.6, 0);
  }),
  3: G(10, (p) => {
    p.c([0.8, 12.8], [3, 14.1], [6.4, 13.6], [7.8, 11.4], [6.2, 8.4], [3.8, 7.6]);
    p.c([3.8, 7.6], [7, 7], [8.6, 4.4], [7, 1.4], [3.6, 0.2], [0.6, 1.4]);
  }),
  4: G(10.4, (p) => { p.m(6.8, 0).l(6.8, 14).l(0, 4.6).l(10.4, 4.6); }),
  5: G(10, (p) => {
    p.m(8.6, 14).l(1.4, 14).l(0.8, 7.8);
    p.c([0.8, 7.8], [3, 9], [5.6, 8.8], [7.8, 7], [8.4, 4], [6.6, 1.2],
        [3.4, 0.2], [0.6, 1.4]);
  }),
  6: G(10, (p) => p.c([8.2, 12.8], [5.6, 14.1], [2.6, 13], [0.8, 9.6], [0.4, 5.4],
                      [1.6, 1.8], [4.6, 0.2], [7.2, 1.4], [8.6, 4], [7.4, 6.6],
                      [4.6, 7.6], [1.8, 6.8], [0.6, 5])),
  7: G(10, (p) => p.m(0, 14).l(9.8, 14).l(3.4, 0)),
  8: G(10, (p) => { p.a(4.9, 10.4, 4.4, 3.6, 0, 360); p.a(4.9, 3.7, 4.9, 3.7, 0, 360); }),
  9: G(10, (p) => p.c([0.8, 1.2], [3.2, 0], [6.2, 1], [8, 4.4], [8.6, 8.6],
                      [7.2, 12.2], [4.2, 13.9], [1.6, 12.6], [0.4, 10], [1.4, 7.4],
                      [4.2, 6.4], [7, 7.2], [8.2, 9])),

  /* ---- punctuation ---- */
  '.': G(4.4, (p) => p.m(2.2, 0).l(2.2, 1)),
  ',': G(4.4, (p) => p.c([2.6, 1], [2.2, -0.4], [1, -2.2])),
  ':': G(4.4, (p) => { p.m(2.2, 0).l(2.2, 1); p.m(2.2, 6.2).l(2.2, 7.2); }),
  ';': G(4.4, (p) => { p.m(2.2, 6.2).l(2.2, 7.2); p.c([2.6, 1], [2.2, -0.4], [1, -2.2]); }),
  '!': G(4.4, (p) => { p.m(2.2, 14).l(2.2, 4.4); p.m(2.2, 0).l(2.2, 1); }),
  '?': G(9.2, (p) => {
    p.c([0.8, 11.6], [2.4, 13.8], [5.4, 14.2], [7.8, 12.8], [8.6, 10.2],
        [7, 7.8], [4.6, 6.2], [4.4, 4.4]);
    p.m(4.4, 0).l(4.4, 1);
  }),
  "'": G(3.4, (p) => p.m(1.7, 14).l(1.7, 10.6)),
  '"': G(6.2, (p) => { p.m(1.7, 14).l(1.7, 10.6); p.m(4.5, 14).l(4.5, 10.6); }),
  '-': G(8, (p) => p.m(0.8, 6.6).l(7.2, 6.6)),
  '–': G(11, (p) => p.m(0.8, 6.6).l(10.2, 6.6)),
  '—': G(14, (p) => p.m(0.8, 6.6).l(13.2, 6.6)),
  '(': G(5.6, (p) => p.c([4.6, 14], [1.7, 10], [1.3, 6], [1.7, 2], [4.6, -2])),
  ')': G(5.6, (p) => p.c([1, 14], [3.9, 10], [4.3, 6], [3.9, 2], [1, -2])),
  '/': G(8, (p) => p.m(0, -1).l(8, 15)),
  '+': G(10, (p) => { p.m(5, 2).l(5, 11); p.m(0.5, 6.5).l(9.5, 6.5); }),
  '=': G(10, (p) => { p.m(0.6, 8.4).l(9.4, 8.4); p.m(0.6, 4.8).l(9.4, 4.8); }),
  '*': G(9, (p) => {
    p.m(4.5, 14).l(4.5, 7.4); p.m(1.6, 12.4).l(7.4, 8.8); p.m(7.4, 12.4).l(1.6, 8.8);
  }),
  '†': G(9, (p) => { p.m(4.5, 14).l(4.5, -2); p.m(1, 10.4).l(8, 10.4); }),
  '·': G(4.4, (p) => p.m(2.2, 6).l(2.2, 7)),
  '°': G(6.4, (p) => p.a(3.2, 11.8, 2.2, 2.2, 0, 360)),
  '&': G(13, (p) => {
    p.c([12.4, 0], [8.4, 5.2], [4.4, 9], [4, 11.6], [5.4, 13.8], [7.6, 13.6],
        [8.4, 11.6], [7, 9], [3.2, 6], [0.6, 3.4], [1.2, 1], [3.8, 0],
        [6.6, 1], [8.6, 3.4], [10.2, 5.4], [12.4, 5.8]);
  }),
};

/** Fallback for anything unmapped: a small box, so missing glyphs are visible. */
const TOFU = G(9, (p) => p.m(1, 0).l(8, 0).l(8, 13).l(1, 13).l(1, 0));

export function glyph(ch) {
  if (GLYPHS[ch]) return GLYPHS[ch];
  const up = ch.toUpperCase();
  if (GLYPHS[up]) return GLYPHS[up];
  return TOFU;
}

/**
 * Lay out a string. Returns paths in millimetres with the baseline at y = 0 and
 * y increasing *downward* (page convention), plus the advance width.
 *
 * @param {number} size      cap height in mm
 * @param {number} tracking  extra letter spacing as a fraction of cap height
 */
export function layoutText(text, { size = 7, tracking = 0.3 } = {}) {
  const s = size / CAP_HEIGHT;
  const extra = tracking * size;
  const paths = [];
  let x = 0;
  for (const ch of text) {
    const g = glyph(ch);
    for (const stroke of g.paths) {
      paths.push(stroke.map(([gx, gy]) => [x + gx * s, -gy * s]));
    }
    x += g.width * s + extra;
  }
  const width = Math.max(0, x - extra);
  return { paths, width, size };
}

/** Measure without building geometry. */
export function measureText(text, { size = 7, tracking = 0.3 } = {}) {
  const s = size / CAP_HEIGHT;
  const extra = tracking * size;
  let x = 0;
  for (const ch of text) x += glyph(ch).width * s + extra;
  return Math.max(0, x - extra);
}

/**
 * Bend a laid-out line of text around a circular arc. `bend` is -1..1; positive
 * arches the text upward (text on the top of a circle), negative sags it.
 */
export function arcText(layout, bend, radiusHint) {
  if (!bend) return layout.paths;
  const R = radiusHint || layout.width / Math.max(Math.abs(bend), 0.05) / 1.6;
  const sign = bend >= 0 ? -1 : 1;
  const cx = layout.width / 2;
  return layout.paths.map((p) => p.map(([x, y]) => {
    const theta = ((x - cx) / R) * (bend >= 0 ? 1 : -1);
    const r = R + sign * y;
    return [cx + Math.sin(theta) * r, sign * (R - Math.cos(theta) * r)];
  }));
}
