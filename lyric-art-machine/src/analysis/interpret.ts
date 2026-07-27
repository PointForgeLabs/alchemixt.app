/**
 * Interpretation: measurements become a picture's genome, plus a written
 * account of why. The written part matters — a machine that makes an image and
 * can't say what it read is a slot machine, not an interpreter.
 */

import type { SongAnalysis } from './analyze';
import type { ThemeKey } from './lexicons';
import type { Harmony } from '../art/color';

export type SystemKey =
  | 'current'
  | 'radiance'
  | 'strata'
  | 'fracture'
  | 'constellation'
  | 'lattice'
  | 'growth';

export interface ArtGenome {
  system: SystemKey;
  seed: number;
  baseHue: number;
  harmony: Harmony;
  valence: number;
  arousal: number;
  /** 0..1 — how many marks land on the canvas. */
  density: number;
  /** 0..1 — how far marks stray from their ideal position. */
  turbulence: number;
  /** 0..1 — how strongly forms organize around a single center. */
  gravity: number;
  /** 0..1 — mark weight, from hairline to heavy. */
  weight: number;
  /** 0..1 — how much the composition mirrors itself. */
  symmetry: number;
  /** 0..1 — grain and paper texture. */
  grain: number;
  forceNocturne: boolean;
}

export interface Reading {
  /** One-sentence verdict, the headline of the machine's interpretation. */
  verdict: string;
  /** Bullet lines explaining each decision. */
  notes: string[];
  /** The named visual system, for display. */
  systemLabel: string;
  systemDescription: string;
}

const SYSTEM_BY_THEME: Record<ThemeKey, SystemKey> = {
  motion: 'current',
  water: 'current',
  transcendence: 'radiance',
  fire: 'radiance',
  love: 'radiance',
  memory: 'strata',
  loss: 'strata',
  defiance: 'fracture',
  night: 'constellation',
  city: 'lattice',
  nature: 'growth',
  body: 'growth',
};

const SYSTEM_INFO: Record<SystemKey, { label: string; description: string }> = {
  current: {
    label: 'Current',
    description:
      'Thousands of particles released into a noise field, each tracing where the song pushes it. Nothing is placed; everything is carried.',
  },
  radiance: {
    label: 'Radiance',
    description:
      'Everything organized around a single luminous center — rays, arcs, and orbits that either resolve into a halo or burn out at the edges.',
  },
  strata: {
    label: 'Strata',
    description:
      'The image laid down in horizontal bands, like sediment or a stack of exposures. Older layers show through the newer ones.',
  },
  fracture: {
    label: 'Fracture',
    description:
      'The picture plane broken into shards and driven apart along hard diagonals. Each fragment keeps a piece of the original field.',
  },
  constellation: {
    label: 'Constellation',
    description:
      'Points of light scattered across a dark ground, with faint lines drawn between the ones that belong together.',
  },
  lattice: {
    label: 'Lattice',
    description:
      'A rigid grid imposed on the canvas, then made to carry something it was not built for. The structure holds, but not evenly.',
  },
  growth: {
    label: 'Growth',
    description:
      'Branching forms grown from seed points, splitting and thinning until they run out of energy.',
  },
};

/** Where each theme anchors the palette when the lyrics name no colors. */
const HUE_BY_THEME: Record<ThemeKey, number> = {
  love: 348,
  loss: 218,
  defiance: 6,
  transcendence: 46,
  nature: 122,
  night: 246,
  motion: 196,
  body: 18,
  memory: 34,
  city: 208,
  water: 202,
  fire: 24,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Averages hue angles correctly (circular mean), so red + violet don't average to green. */
function circularMean(hues: number[]): number {
  if (hues.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const h of hues) {
    const rad = (h * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

function pickHarmony(a: SongAnalysis, dominant: ThemeKey): Harmony {
  // Conflicted songs get conflicted palettes.
  const contested = a.themes.length > 1 && (a.themes[1]?.strength ?? 0) > 0.72;
  if (contested) return a.arousal > 0.6 ? 'complementary' : 'split';
  if (dominant === 'defiance' || dominant === 'fire') return 'complementary';
  if (dominant === 'night' || dominant === 'loss') return 'monochrome';
  if (a.diversity > 0.72) return 'triad';
  return 'analogous';
}

export function interpret(analysis: SongAnalysis, variation = 0): ArtGenome {
  const dominant = analysis.themes[0];
  const dominantKey: ThemeKey = dominant && dominant.strength > 0 ? dominant.key : 'memory';
  const second = analysis.themes[1];

  // Named colors in the lyrics beat the thematic default — if a song says gold,
  // the picture should be gold.
  const baseHue = analysis.namedHues.length > 0
    ? circularMean(analysis.namedHues.slice(0, 3))
    : HUE_BY_THEME[dominantKey];

  const secondStrength = second?.strength ?? 0;

  return {
    system: SYSTEM_BY_THEME[dominantKey],
    // Variation is folded into the seed so re-rolls are reproducible too.
    seed: (analysis.fingerprint ^ Math.imul(variation + 1, 0x9e3779b9)) >>> 0,
    baseHue,
    harmony: pickHarmony(analysis, dominantKey),
    valence: analysis.valence,
    arousal: analysis.arousal,

    // A wordy song puts more on the canvas; a repetitive one puts less, but louder.
    density: clamp(0.24 + analysis.diversity * 0.5 + analysis.arousal * 0.28 - analysis.repetition * 0.2, 0.08, 1),

    // Turbulence is disorder: loud, unresolved, and asking questions.
    turbulence: clamp(analysis.arousal * 0.62 + Math.max(0, -analysis.valence) * 0.3 + analysis.inquiry * 0.25, 0, 1),

    // Songs that address someone or reach upward pull toward a center.
    gravity: clamp(
      (analysis.voice === 'address' ? 0.55 : analysis.voice === 'collective' ? 0.42 : 0.3)
        + secondStrength * 0.16
        + (dominantKey === 'transcendence' || dominantKey === 'love' ? 0.24 : 0),
      0,
      1,
    ),

    // Repetition is emphasis, and emphasis is weight.
    weight: clamp(0.22 + analysis.repetition * 0.5 + analysis.arousal * 0.26, 0.08, 1),

    // Rhyme and repeated lines are formal structure, and structure shows as symmetry.
    symmetry: clamp(analysis.rhyme * 0.5 + analysis.repetition * 0.42, 0, 1),

    grain: clamp(0.26 + Math.max(0, -analysis.valence) * 0.42 + analysis.repetition * 0.18, 0, 1),

    forceNocturne: dominantKey === 'night' || dominantKey === 'loss',
  };
}

function describeValence(v: number): string {
  if (v > 0.4) return 'radiant';
  if (v > 0.12) return 'warm';
  if (v > -0.12) return 'ambivalent';
  if (v > -0.4) return 'shadowed';
  return 'bleak';
}

function describeArousal(a: number): string {
  if (a > 0.72) return 'violent';
  if (a > 0.52) return 'driving';
  if (a > 0.32) return 'steady';
  if (a > 0.16) return 'subdued';
  return 'nearly motionless';
}

const VOICE_NOTE: Record<SongAnalysis['voice'], string> = {
  confessional: 'It speaks in the first person, so the composition keeps a single point of view.',
  address: 'It is addressed to someone, so the forms lean toward a center that is not themselves.',
  collective: 'It speaks as "we", so the marks gather into crowds rather than individuals.',
  observed: 'It watches other people, so the composition holds its subject at a distance.',
};

export function explain(analysis: SongAnalysis, genome: ArtGenome): Reading {
  const info = SYSTEM_INFO[genome.system];
  const dominant = analysis.themes[0];
  const second = analysis.themes[1];
  const notes: string[] = [];

  if (dominant && dominant.strength > 0) {
    notes.push(
      `Strongest field is ${dominant.label.toLowerCase()} — it ${dominant.gloss}. ` +
        `Triggered by words like ${dominant.hits.slice(0, 4).join(', ')}.`,
    );
  } else {
    notes.push(
      'No thematic field dominates, so the machine falls back to structure alone: rhythm, repetition, and line length.',
    );
  }

  if (second && second.strength > 0.5 && dominant) {
    notes.push(
      `${second.label} runs underneath at ${Math.round(second.strength * 100)}% of the dominant field, and ${second.gloss}.`,
    );
  }

  notes.push(
    `Emotional register reads ${describeValence(analysis.valence)} and ${describeArousal(analysis.arousal)}, ` +
      `which sets the palette ${genome.forceNocturne || analysis.valence < 0.08 ? 'against a dark ground' : 'on a pale ground'} ` +
      `at ${Math.round(genome.baseHue)}° hue.`,
  );

  notes.push(VOICE_NOTE[analysis.voice]);

  if (analysis.repetition > 0.3) {
    notes.push(
      `${Math.round(analysis.repetition * 100)}% of lines repeat, so marks are heavier and the composition more symmetrical — ` +
        'the machine treats a hook as insistence.',
    );
  } else if (analysis.diversity > 0.65) {
    notes.push(
      'Vocabulary is unusually wide and repeats little, so the canvas is dense and detailed rather than bold.',
    );
  }

  if (analysis.namedHues.length > 0) {
    notes.push(
      `The lyrics name colors directly, so the palette is anchored to what the song says rather than what it means.`,
    );
  }

  if (analysis.inquiry > 0.08) {
    notes.push(
      `${Math.round(analysis.inquiry * 100)}% of lines are questions, which adds unresolved motion to the field.`,
    );
  }

  const mood = describeValence(analysis.valence);
  // "A ambivalent song" reads as a bug even though it is only a grammar slip.
  const article = /^[aeiou]/.test(mood) ? 'An' : 'A';
  const verdict = dominant && dominant.strength > 0
    ? `${article} ${mood}, ${describeArousal(analysis.arousal)} song about ${dominant.label.toLowerCase()}, rendered as ${info.label}.`
    : `${article} ${mood}, ${describeArousal(analysis.arousal)} song, rendered as ${info.label}.`;

  return {
    verdict,
    notes,
    systemLabel: info.label,
    systemDescription: info.description,
  };
}
