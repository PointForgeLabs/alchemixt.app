/**
 * Palette construction.
 *
 * Hue comes from what the song is about, saturation from how hard it hits, and
 * lightness range from how dark the mood is. Built in HSL because the mapping
 * from feeling to hue-angle is the whole point and HSL keeps that legible.
 */

import type { Rng } from './rng';

export interface Palette {
  /** Deepest value in the picture — what the canvas is flooded with. */
  ground: string;
  /** Three to five marks used for the bulk of the forms. */
  marks: string[];
  /** One hot color reserved for the smallest, brightest accents. */
  accent: string;
  /** Faint tone for texture, grain, and structural lines. */
  veil: string;
  /** True when the ground is dark and marks sit on top as light. */
  nocturne: boolean;
}

export type Harmony = 'analogous' | 'complementary' | 'triad' | 'split' | 'monochrome';

export function hsl(h: number, s: number, l: number, a = 1): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s));
  const lum = Math.max(0, Math.min(100, l));
  return a >= 1
    ? `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${lum.toFixed(1)}%)`
    : `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${lum.toFixed(1)}% / ${a.toFixed(3)})`;
}

/** Offsets from the base hue for each harmony scheme. */
const HARMONY_OFFSETS: Record<Harmony, number[]> = {
  analogous: [0, 22, -22, 42],
  complementary: [0, 180, 18, 198],
  triad: [0, 120, 240, 30],
  split: [0, 150, 210, 20],
  monochrome: [0, 8, -8, 4],
};

export interface PaletteInput {
  /** Where the palette is anchored, 0-360. */
  baseHue: number;
  harmony: Harmony;
  /** -1..1 — drives lightness and how much color survives. */
  valence: number;
  /** 0..1 — drives saturation and accent intensity. */
  arousal: number;
  /** Force a dark ground regardless of valence. */
  forceNocturne?: boolean;
  /** 0..1 spectral brightness from the audio. 0.5 is neutral / unheard. */
  brightness?: number;
  rng: Rng;
}

export function buildPalette(input: PaletteInput): Palette {
  const { baseHue, harmony, valence, arousal, rng } = input;
  // A bass-heavy mix should not produce an airy pastel picture, and a bright
  // one should not produce a murky ink drawing.
  const brightness = input.brightness ?? 0.5;
  const lift = (brightness - 0.5) * 22;

  // Bleak songs get dark grounds; radiant ones get paper. The threshold sits
  // slightly below neutral so ambiguous songs lean dark, which simply looks better.
  const nocturne = input.forceNocturne ?? valence < 0.08;

  const saturation = 28 + arousal * 46 + Math.abs(valence) * 12;
  const offsets = HARMONY_OFFSETS[harmony];

  const groundLightness = nocturne
    ? 6 + Math.max(0, valence) * 6 + rng.range(0, 3)
    : 91 - Math.max(0, -valence) * 8 + rng.range(-2, 2);

  const ground = hsl(
    baseHue + rng.range(-12, 12),
    nocturne ? saturation * 0.5 : saturation * 0.14,
    groundLightness,
  );

  // Marks need to read against the ground, so lightness moves opposite to it.
  const marks = offsets.map((offset, i) => {
    const drift = rng.range(-9, 9);
    const step = i / Math.max(1, offsets.length - 1);
    const lightness = nocturne
      ? 42 + step * 30 + arousal * 12 + lift
      : 46 - step * 26 - arousal * 8 - lift * 0.6;
    return hsl(
      baseHue + offset + drift,
      saturation * (0.72 + step * 0.35),
      lightness,
    );
  });

  // The accent is intentionally out of key — it's the line the song underlines.
  const accentHue = baseHue + (rng.bool() ? 168 : -168) + rng.range(-14, 14);
  const accent = hsl(
    accentHue,
    Math.min(96, saturation * 1.5 + 18),
    nocturne ? 62 + arousal * 16 : 48 + arousal * 10,
  );

  const veil = hsl(
    baseHue + rng.range(-20, 20),
    saturation * 0.35,
    nocturne ? 74 : 22,
  );

  return { ground, marks, accent, veil, nocturne };
}
