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

/**
 * Converts one of our `hsl(H S% L%)` strings to hex plus a separate alpha.
 *
 * Canvas is happy with CSS Color Level 4's space-separated syntax, but a lot of
 * SVG software is not — Inkscape simply fails to parse it, and every path
 * silently becomes invisible. Hex is the one colour notation everything
 * understands, so exports go through here.
 */
export function hslToHex(input: string): { hex: string; alpha: number } {
  const match = /hsl\(\s*([-\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*(?:\/\s*([\d.]+)\s*)?\)/.exec(input);
  if (!match) {
    // Already hex, or something we did not author — pass it through.
    return { hex: input.startsWith('#') ? input : '#000000', alpha: 1 };
  }

  const h = ((Number(match[1]) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, Number(match[2]))) / 100;
  const l = Math.max(0, Math.min(100, Number(match[3]))) / 100;
  const alpha = match[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(match[4])));

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const channel = (v: number): string =>
    Math.round(Math.max(0, Math.min(255, (v + m) * 255)))
      .toString(16)
      .padStart(2, '0');

  return { hex: `#${channel(r)}${channel(g)}${channel(b)}`, alpha };
}

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
  /** Treatment ground override, e.g. blueprint's deep blue. */
  lightnessShift?: number;
  saturationShift?: number;
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
  const lightnessShift = input.lightnessShift ?? 0;
  // A treatment that darkens the ground implies a dark picture, whatever the
  // lyrics felt like.
  const nocturne = lightnessShift < -20 ? true : input.forceNocturne ?? valence < 0.08;

  const saturation = 28 + arousal * 46 + Math.abs(valence) * 12 + (input.saturationShift ?? 0);
  const offsets = HARMONY_OFFSETS[harmony];

  const groundLightness = (nocturne
    ? 6 + Math.max(0, valence) * 6 + rng.range(0, 3)
    : 91 - Math.max(0, -valence) * 8 + rng.range(-2, 2))
    + (lightnessShift < -20 ? Math.max(-6, lightnessShift + 26) : lightnessShift);

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
