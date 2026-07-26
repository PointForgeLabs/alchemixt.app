// Marching-squares isoline tracer, specialised for engraving.
//
// Three details matter for line work and are why this is not a generic
// implementation:
//
//  * Region validity. Each anatomical region carries its own form
//    parameterisation, so a cell straddling two regions would trace a line
//    across a discontinuity. Those cells are refused; the contour pass draws
//    the boundary instead.
//  * Depth validity. A cell spanning a silhouette must not be traced, or lines
//    leap between foreground and background.
//  * Density levelling. Where the surface turns away, isolines crowd together
//    faster than the pen can resolve. Levels are dropped by parity as the local
//    spacing tightens, which is exactly what an engraver does by hand.

const MAX_LEVELS_PER_CELL = 6;

/**
 * @param {Float32Array} field  scalar to trace, one value per pixel
 * @param {Uint8Array} valid    1 where the pixel may participate
 * @param {Float32Array} depth  used to reject cells that span a silhouette
 * @returns {Array<{level:number, pts:Array<[number,number]>}>}
 */
export function traceIsolines({
  field, valid, depth, region, width: w, height: h,
  delta, phase = 0, minSpacingPx = 2.2, depthJump = 0.004,
}) {
  if (!(delta > 0)) return [];
  const byLevel = new Map();          // level index -> flat segment list
  const push = (k, ia, ax, ay, ib, bx, by) => {
    let arr = byLevel.get(k);
    if (!arr) { arr = []; byLevel.set(k, arr); }
    arr.push(ia, ax, ay, ib, bx, by);
  };

  // Crossing identity: a point on a grid edge is shared by exactly two cells,
  // so chaining needs no spatial hashing at all.
  const HB = w * h;
  const hid = (x, y) => y * w + x;
  const vid = (x, y) => HB + y * w + x;

  const tight = minSpacingPx;
  const veryTight = minSpacingPx * 0.5;

  for (let y = 0; y < h - 1; y++) {
    const row = y * w;
    for (let x = 0; x < w - 1; x++) {
      const i00 = row + x, i10 = i00 + 1, i01 = i00 + w, i11 = i01 + 1;
      if (!(valid[i00] & valid[i10] & valid[i01] & valid[i11])) continue;
      if (region) {
        const r = region[i00];
        if (region[i10] !== r || region[i01] !== r || region[i11] !== r) continue;
      }
      if (depth) {
        const d0 = depth[i00];
        if (Math.abs(depth[i10] - d0) > depthJump ||
            Math.abs(depth[i01] - d0) > depthJump ||
            Math.abs(depth[i11] - d0) > depthJump) continue;
      }
      const v00 = field[i00], v10 = field[i10], v01 = field[i01], v11 = field[i11];
      let lo = v00, hi = v00;
      if (v10 < lo) lo = v10; else if (v10 > hi) hi = v10;
      if (v01 < lo) lo = v01; else if (v01 > hi) hi = v01;
      if (v11 < lo) lo = v11; else if (v11 > hi) hi = v11;

      let k0 = Math.ceil((lo - phase) / delta);
      const k1 = Math.floor((hi - phase) / delta);
      if (k1 < k0) continue;
      if (k1 - k0 + 1 > MAX_LEVELS_PER_CELL) continue;   // hopelessly compressed

      // Local spacing between adjacent levels, in pixels.
      const gx = (v10 - v00 + v11 - v01) * 0.5;
      const gy = (v01 - v00 + v11 - v10) * 0.5;
      const grad = Math.hypot(gx, gy);
      const spacing = grad > 1e-9 ? delta / grad : Infinity;
      let parity = 1;
      if (spacing < veryTight) parity = 4;
      else if (spacing < tight) parity = 2;

      for (let k = k0; k <= k1; k++) {
        if (parity > 1 && (k % parity + parity) % parity !== 0) continue;
        const lv = phase + k * delta;
        // Corner codes, counter-clockwise from the top-left.
        const c = (v00 > lv ? 1 : 0) | (v10 > lv ? 2 : 0) | (v11 > lv ? 4 : 0) | (v01 > lv ? 8 : 0);
        if (c === 0 || c === 15) continue;
        // Edge crossing positions.
        const tTop = (lv - v00) / (v10 - v00);
        const tRight = (lv - v10) / (v11 - v10);
        const tBot = (lv - v01) / (v11 - v01);
        const tLeft = (lv - v00) / (v01 - v00);
        const TOPx = x + tTop, TOPy = y;
        const RGTx = x + 1, RGTy = y + tRight;
        const BOTx = x + tBot, BOTy = y + 1;
        const LFTx = x, LFTy = y + tLeft;
        const TOPi = hid(x, y), BOTi = hid(x, y + 1);
        const LFTi = vid(x, y), RGTi = vid(x + 1, y);

        switch (c) {
          case 1: case 14: push(k, LFTi, LFTx, LFTy, TOPi, TOPx, TOPy); break;
          case 2: case 13: push(k, TOPi, TOPx, TOPy, RGTi, RGTx, RGTy); break;
          case 3: case 12: push(k, LFTi, LFTx, LFTy, RGTi, RGTx, RGTy); break;
          case 4: case 11: push(k, RGTi, RGTx, RGTy, BOTi, BOTx, BOTy); break;
          case 6: case 9:  push(k, TOPi, TOPx, TOPy, BOTi, BOTx, BOTy); break;
          case 7: case 8:  push(k, LFTi, LFTx, LFTy, BOTi, BOTx, BOTy); break;
          case 5:          // saddle: two segments
            push(k, LFTi, LFTx, LFTy, TOPi, TOPx, TOPy);
            push(k, RGTi, RGTx, RGTy, BOTi, BOTx, BOTy);
            break;
          case 10:
            push(k, TOPi, TOPx, TOPy, RGTi, RGTx, RGTy);
            push(k, LFTi, LFTx, LFTy, BOTi, BOTx, BOTy);
            break;
          default: break;
        }
      }
    }
  }

  const out = [];
  for (const [k, seg] of byLevel) {
    for (const pts of chainSegments(seg)) {
      if (pts.length >= 2) out.push({ level: k, pts });
    }
  }
  return out;
}

/**
 * Weld a level's segments into polylines using exact crossing identity.
 * `seg` is flat: [idA, ax, ay, idB, bx, by, ...].
 */
function chainSegments(seg) {
  const n = seg.length / 6;
  // crossing id -> up to two segment indices
  const inc = new Map();
  for (let s = 0; s < n; s++) {
    const ia = seg[s * 6], ib = seg[s * 6 + 3];
    let a = inc.get(ia);
    if (a === undefined) inc.set(ia, s); else if (Array.isArray(a)) a.push(s);
    else inc.set(ia, [a, s]);
    let b = inc.get(ib);
    if (b === undefined) inc.set(ib, s); else if (Array.isArray(b)) b.push(s);
    else inc.set(ib, [b, s]);
  }
  const used = new Uint8Array(n);
  const other = (s, id) => (seg[s * 6] === id ? seg[s * 6 + 3] : seg[s * 6]);
  const ptOf = (s, id) => (seg[s * 6] === id
    ? [seg[s * 6 + 1], seg[s * 6 + 2]]
    : [seg[s * 6 + 4], seg[s * 6 + 5]]);
  const neighbour = (id, notS) => {
    const e = inc.get(id);
    if (e === undefined) return -1;
    if (!Array.isArray(e)) return e === notS ? -1 : e;
    for (const s of e) if (s !== notS && !used[s]) return s;
    return -1;
  };

  const out = [];
  // Start from open ends first so open curves are not split mid-way.
  for (let pass = 0; pass < 2; pass++) {
    for (let s0 = 0; s0 < n; s0++) {
      if (used[s0]) continue;
      const idA = seg[s0 * 6], idB = seg[s0 * 6 + 3];
      const openA = neighbour(idA, s0) === -1;
      const openB = neighbour(idB, s0) === -1;
      if (pass === 0 && !openA && !openB) continue;

      const startId = pass === 0 ? (openA ? idA : idB) : idA;
      used[s0] = 1;
      const pts = [ptOf(s0, startId), ptOf(s0, other(s0, startId))];
      let curId = other(s0, startId);
      let curS = s0;
      for (let guard = 0; guard < 200000; guard++) {
        const nx = neighbour(curId, curS);
        if (nx === -1) break;
        used[nx] = 1;
        const nid = other(nx, curId);
        pts.push(ptOf(nx, nid));
        curId = nid;
        curS = nx;
      }
      out.push(pts);
    }
  }
  return out;
}

/**
 * Build the per-pixel validity mask shared by every isoline pass: inside the
 * silhouette, and optionally restricted to a set of region ids.
 */
export function buildValid(fields, { regions = null, inset = 0, erodedDist = null } = {}) {
  const { width: w, height: h, mask, region } = fields;
  const v = new Uint8Array(w * h);
  const allow = regions ? new Set(regions) : null;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    if (allow && !allow.has(Math.round(region[i]))) continue;
    if (erodedDist && erodedDist[i] < inset) continue;
    v[i] = 1;
  }
  return v;
}
