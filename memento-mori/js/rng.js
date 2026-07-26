// Deterministic randomness. A given seed must reproduce a byte-identical plot
// forever, so nothing in here may touch Math.random() or the clock.

/** xmur3 string hash -> 32-bit seed generator. */
export function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Small, fast, well-distributed counter-based PRNG (sfc32). */
export class Rng {
  constructor(seed) {
    const gen = hashString(String(seed));
    this.a = gen(); this.b = gen(); this.c = gen(); this.d = gen();
    // Discard the first few outputs so nearby seeds decorrelate.
    for (let i = 0; i < 12; i++) this.next();
  }

  next() {
    this.a |= 0; this.b |= 0; this.c |= 0; this.d |= 0;
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  range(lo, hi) { return lo + (hi - lo) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  pick(arr) { return arr[this.int(arr.length)]; }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }

  /** Box-Muller, cached second deviate. */
  gauss(mean = 0, sd = 1) {
    if (this._spare !== undefined) {
      const s = this._spare; this._spare = undefined;
      return mean + sd * s;
    }
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * v;
    this._spare = r * Math.sin(th);
    return mean + sd * r * Math.cos(th);
  }

  /** A fresh independent stream, so adding a feature can't reshuffle others. */
  fork(tag) { return new Rng(`${this.a}:${this.b}:${tag}`); }
}

/* ---------------------------------------------------------------- noise --- */

function fract(x) { return x - Math.floor(x); }
function smooth(t) { return t * t * (3 - 2 * t); }

/** Hash-based 2D value noise in [-1,1]. Cheap and adequate for line jitter. */
export function makeValueNoise2D(seed) {
  const sx = new Rng(seed + ':nx').next() * 1000 + 17;
  const sy = new Rng(seed + ':ny').next() * 1000 + 41;
  const h = (i, j) => {
    const n = Math.sin(i * 127.1 + j * 311.7 + sx) * (43758.5453 + sy);
    return fract(n) * 2 - 1;
  };
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = smooth(x - i), fy = smooth(y - j);
    const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

/** Fractal sum of a 2D noise function. */
export function fbm2(noise, x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(fx, fy);
    norm += amp;
    amp *= gain;
    fx *= lacunarity; fy *= lacunarity;
  }
  return sum / (norm || 1);
}
