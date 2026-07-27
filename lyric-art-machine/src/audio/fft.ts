/**
 * Iterative radix-2 FFT.
 *
 * Hand-rolled because the whole point of this project is no runtime
 * dependencies. Tables are precomputed per size and reused across the
 * thousands of frames a full song needs.
 */

export class FFT {
  readonly size: number;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly reverseTable: Uint32Array;

  constructor(size: number) {
    if (size <= 0 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`);
    }
    this.size = size;
    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i += 1) {
      this.cosTable[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sinTable[i] = Math.sin((-2 * Math.PI * i) / size);
    }

    // Bit-reversal permutation table.
    this.reverseTable = new Uint32Array(size);
    let bits = 0;
    while (1 << bits < size) bits += 1;
    for (let i = 0; i < size; i += 1) {
      let reversed = 0;
      for (let b = 0; b < bits; b += 1) {
        reversed = (reversed << 1) | ((i >>> b) & 1);
      }
      this.reverseTable[i] = reversed;
    }
  }

  /**
   * In-place complex FFT. `real` and `imag` must both be `size` long.
   */
  transform(real: Float32Array, imag: Float32Array): void {
    const n = this.size;

    for (let i = 0; i < n; i += 1) {
      const j = this.reverseTable[i] as number;
      if (j > i) {
        const tr = real[i] as number;
        real[i] = real[j] as number;
        real[j] = tr;
        const ti = imag[i] as number;
        imag[i] = imag[j] as number;
        imag[j] = ti;
      }
    }

    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j += 1, k += step) {
          const cos = this.cosTable[k] as number;
          const sin = this.sinTable[k] as number;
          const jr = real[j + half] as number;
          const ji = imag[j + half] as number;
          const tr = jr * cos - ji * sin;
          const ti = jr * sin + ji * cos;
          real[j + half] = (real[j] as number) - tr;
          imag[j + half] = (imag[j] as number) - ti;
          real[j] = (real[j] as number) + tr;
          imag[j] = (imag[j] as number) + ti;
        }
      }
    }
  }

  /** Magnitude spectrum of a real signal. Returns size/2 bins. */
  magnitudes(input: Float32Array, out: Float32Array, window: Float32Array): void {
    const n = this.size;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      real[i] = (input[i] ?? 0) * (window[i] as number);
    }
    this.transform(real, imag);
    for (let i = 0; i < n / 2; i += 1) {
      const re = real[i] as number;
      const im = imag[i] as number;
      out[i] = Math.sqrt(re * re + im * im);
    }
  }
}

/** Hann window — standard choice for music analysis. */
export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}
