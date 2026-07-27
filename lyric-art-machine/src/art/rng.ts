/**
 * Deterministic randomness.
 *
 * The whole machine depends on this: the same lyrics plus the same variation
 * number must always produce the same canvas, on any device, forever. So no
 * Math.random anywhere in the art pipeline.
 */

/** mulberry32 — small, fast, good enough distribution for visual work. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    bool: (probability = 0.5) => next() < probability,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick() called with an empty list');
      return items[Math.floor(next() * items.length)] as T;
    },
    /** Bell-ish distribution around a center — most values near the middle. */
    gaussian: (center = 0, spread = 1) => {
      const u = Math.max(next(), Number.EPSILON);
      const v = next();
      return center + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * spread;
    },
  };
}

export interface Rng {
  next(): number;
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  bool(probability?: number): boolean;
  pick<T>(items: readonly T[]): T;
  gaussian(center?: number, spread?: number): number;
}

/**
 * Classic value-noise field. Smooth, seedable, and cheap — used for flow
 * directions and organic displacement.
 */
export function makeNoise2D(seed: number): (x: number, y: number) => number {
  const perm = new Uint8Array(512);
  const rng = makeRng(seed);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = rng.int(0, i);
    const tmp = base[i] as number;
    base[i] = base[j] as number;
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255] as number;

  const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const grad = (hash: number, x: number, y: number): number => {
    switch (hash & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  };

  return (x: number, y: number): number => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[(perm[xi] as number) + yi] as number;
    const ab = perm[(perm[xi] as number) + yi + 1] as number;
    const ba = perm[(perm[xi + 1] as number) + yi] as number;
    const bb = perm[(perm[xi + 1] as number) + yi + 1] as number;

    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return (lerp(x1, x2, v) + 1) / 2;
  };
}
