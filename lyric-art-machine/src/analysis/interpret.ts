/**
 * Interpretation: measurements become a picture's genome, plus a written
 * account of why. The written part matters — a machine that makes an image and
 * can't say what it read is a slot machine, not an interpreter.
 *
 * When audio is present the division of labour is deliberate: the lyrics decide
 * what the song is *about*, and so which visual system is used; the audio
 * decides how it *moves* — energy, texture, pulse, color temperature — and can
 * overrule the system choice when it flatly contradicts the words.
 */

import type { SongAnalysis } from './analyze';
import type { ThemeKey } from './lexicons';
import type { AudioFeatures } from '../audio/types';
import type { Harmony } from '../art/color';
import { chooseStyle, STYLE_BY_KEY, type Style } from '../art/catalog';
import { ENGINE_BY_KEY } from '../art/engines';
import { TREATMENT_BY_KEY } from '../art/treatments';

export interface ArtGenome {
  /** Key into the style catalogue — engine plus treatment. */
  style: string;
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

  // ---- audio-derived; inert defaults when the machine never heard the song ----
  /** True when audio informed this genome. */
  heard: boolean;
  /** 0..1 — tempo mapped across a musical range. 0.5 when unheard. */
  pulse: number;
  /** 0..1 — spectral brightness, biases palette lightness. */
  brightness: number;
  /** Structural sections detected in the audio; 1 when unheard. */
  sections: number;
  /** Added to palette saturation. Distortion pushes colour acidic. */
  saturationBoost: number;
  /** 0..1 — lightness range across the palette's marks, from dynamics. */
  spread: number;
  /** Where the hue came from, for the written reading. */
  hueSource: 'named' | 'key' | 'theme';
  /** Loudness envelope across the track, used to shape the composition. */
  arc: number[];
}

export interface Reading {
  /** One-sentence verdict, the headline of the machine's interpretation. */
  verdict: string;
  /** Bullet lines explaining each decision. */
  notes: string[];
  /** Separate bullets for what the machine heard, when it heard anything. */
  heardNotes: string[];
  /** Style name, e.g. "Rootstock". */
  styleLabel: string;
  /** What the engine does structurally. */
  systemDescription: string;
  /** Treatment name, e.g. "Woodcut". */
  treatmentLabel: string;
  /** What the treatment does to the marks. */
  treatmentDescription: string;
  /** Whether a pen plotter can reproduce this style honestly. */
  plottable: boolean;
}

/** Describes a style for display, tolerating an unknown key. */
function describeStyle(key: string): {
  style: Style | null;
  label: string;
  system: string;
  treatmentLabel: string;
  treatmentDescription: string;
  plottable: boolean;
} {
  const style = STYLE_BY_KEY.get(key) ?? null;
  const engine = style ? ENGINE_BY_KEY.get(style.engine) : undefined;
  const treatment = style ? TREATMENT_BY_KEY.get(style.treatment) : undefined;
  return {
    style,
    label: style?.name ?? 'Unknown',
    system: engine?.description ?? '',
    treatmentLabel: treatment?.label ?? '',
    treatmentDescription: treatment?.description ?? '',
    plottable: treatment?.plottable ?? false,
  };
}

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

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

/** Blends two hue angles the short way round, weighted t = 0..1 toward b. */
function circularBlend(a: number, b: number, t: number): number {
  const delta = (((b - a) % 360) + 540) % 360 - 180;
  return ((a + delta * t) % 360 + 360) % 360;
}

/**
 * Musical key to hue, laid out around the circle of fifths rather than the
 * chromatic scale — neighbouring keys sound related, so they should look related.
 */
function hueFromKey(keyIndex: number, mode: 'major' | 'minor'): number {
  const fifthsPosition = (keyIndex * 7) % 12;
  // Minor keys sit a little cooler than their major counterparts.
  return (fifthsPosition * 30 + (mode === 'minor' ? 18 : 0)) % 360;
}

/** How hard the music hits, independent of what the words say. */
function aggression(audio: AudioFeatures): number {
  const fast = clamp((audio.tempo - 100) / 70, 0, 1);
  return clamp(audio.energy * 0.4 + audio.roughness * 0.3 + fast * 0.2 + audio.onsetDensity * 0.25, 0, 1);
}

/** How close the music is to standing still. */
function stillness(audio: AudioFeatures): number {
  const slow = clamp((100 - audio.tempo) / 55, 0, 1);
  return clamp((1 - audio.energy) * 0.4 + slow * 0.3 + (1 - audio.onsetDensity) * 0.3, 0, 1);
}

function pickHarmony(a: SongAnalysis, dominant: ThemeKey, audio: AudioFeatures | null): Harmony {
  // With audio, the palette's *structure* follows the music: how far apart the
  // colours sit is a question about tempo and texture, not subject matter.
  if (audio) {
    if (audio.roughness > 0.6 && audio.energy > 0.5) return 'complementary';
    if (audio.tempo >= 138) return 'complementary';
    if (audio.tempo >= 112) return a.diversity > 0.6 ? 'triad' : 'split';
    if (audio.tempo >= 88) return 'analogous';
    if (audio.mode === 'minor' && audio.brightness < 0.45) return 'monochrome';
    return 'analogous';
  }

  // Conflicted songs get conflicted palettes.
  const contested = a.themes.length > 1 && (a.themes[1]?.strength ?? 0) > 0.72;
  if (contested) return a.arousal > 0.6 ? 'complementary' : 'split';
  if (dominant === 'defiance' || dominant === 'fire') return 'complementary';
  if (dominant === 'night' || dominant === 'loss') return 'monochrome';
  if (a.diversity > 0.72) return 'triad';
  return 'analogous';
}

/** Small stable hash so two different recordings never share a seed. */
function audioSeed(audio: AudioFeatures): number {
  const parts = [
    Math.round(audio.tempo * 10),
    Math.round(audio.energy * 1000),
    Math.round(audio.brightness * 1000),
    Math.round(audio.roughness * 1000),
    audio.keyIndex,
    audio.mode === 'minor' ? 1 : 0,
    audio.sections,
  ];
  let h = 0x811c9dc5;
  for (const part of parts) {
    h ^= part;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Selects a style from the catalogue. Split out because the reading needs to
 * compare what the lyrics alone would have chosen against the final answer.
 */
export function selectStyle(
  analysis: SongAnalysis,
  audio: AudioFeatures | null,
  seed: number,
): { chosen: string; fromLyricsAlone: string } {
  const themes = analysis.themes.map((t) => ({ key: t.key, strength: t.strength }));

  const lyricEnergy = analysis.arousal;
  const lyricGrit = clamp(analysis.arousal * 0.5 + Math.max(0, -analysis.valence) * 0.5, 0, 1);
  const fromLyricsAlone = chooseStyle(themes, lyricEnergy, lyricGrit, seed).key;

  if (!audio) return { chosen: fromLyricsAlone, fromLyricsAlone };

  // Audio is far better evidence for how hard a song hits and how rough it
  // sounds, which is exactly what separates one treatment from another.
  const heardEnergy = clamp(
    audio.energy * 0.45 + clamp((audio.tempo - 60) / 120, 0, 1) * 0.3 + audio.onsetDensity * 0.25,
    0,
    1,
  );
  const heardGrit = clamp(audio.roughness * 0.7 + (1 - audio.dynamicRange) * 0.3, 0, 1);

  return { chosen: chooseStyle(themes, heardEnergy, heardGrit, seed).key, fromLyricsAlone };
}

export function interpret(
  analysis: SongAnalysis,
  audio: AudioFeatures | null,
  variation = 0,
  forcedStyle?: string,
): ArtGenome {
  const dominant = analysis.themes[0];
  const dominantKey: ThemeKey = dominant && dominant.strength > 0 ? dominant.key : 'memory';
  const second = analysis.themes[1];
  const secondStrength = second?.strength ?? 0;

  // ---- emotional register ----
  // Mode is the single strongest musical signal of brightness or sadness, so it
  // is allowed to move valence, scaled by how confident the key estimate is.
  const modeShift = audio ? (audio.mode === 'major' ? 0.32 : -0.32) * audio.keyConfidence : 0;
  const valence = audio
    ? clamp(mix(analysis.valence, analysis.valence + modeShift + (audio.brightness - 0.5) * 0.3, 0.75), -1, 1)
    : analysis.valence;

  // Energy is where audio is simply better evidence than word choice, so it
  // dominates the blend rather than merely nudging it.
  const heardArousal = audio
    ? clamp(audio.energy * 0.45 + clamp((audio.tempo - 60) / 120, 0, 1) * 0.3 + audio.onsetDensity * 0.25, 0, 1)
    : 0;
  const arousal = audio ? clamp(mix(analysis.arousal, heardArousal, 0.7), 0, 1) : analysis.arousal;

  // ---- palette anchor ----
  const themeHue = HUE_BY_THEME[dominantKey];
  let baseHue: number;
  let hueSource: ArtGenome['hueSource'];

  if (analysis.namedHues.length > 0) {
    // Colors the lyrics state outright still win over everything.
    baseHue = circularMean(analysis.namedHues.slice(0, 3));
    hueSource = 'named';
  } else if (audio && audio.keyConfidence > 0.16) {
    // The key leads in proportion to how sure the machine is of it. Weighting
    // the theme two-to-one against the key, as this used to, meant the music
    // could never move the colour more than a third of the way — every song
    // about the same subject came back the same hue.
    const lead = clamp(0.35 + audio.keyConfidence * 0.65, 0, 1);
    baseHue = circularBlend(themeHue, hueFromKey(audio.keyIndex, audio.mode), lead);
    hueSource = 'key';
  } else {
    baseHue = themeHue;
    hueSource = 'theme';
  }

  const seedBase = audio ? (analysis.fingerprint ^ audioSeed(audio)) >>> 0 : analysis.fingerprint;
  const seed = (seedBase ^ Math.imul(variation + 1, 0x9e3779b9)) >>> 0;

  // A style picked by hand always wins; the machine only chooses when asked to.
  const style = forcedStyle && STYLE_BY_KEY.has(forcedStyle)
    ? forcedStyle
    : selectStyle(analysis, audio, seedBase).chosen;

  return {
    style,
    seed,
    baseHue,
    harmony: pickHarmony(analysis, dominantKey, audio),
    valence,
    arousal,

    density: audio
      ? clamp(0.2 + audio.onsetDensity * 0.45 + audio.flux * 0.2 + analysis.diversity * 0.25, 0.08, 1)
      : clamp(0.24 + analysis.diversity * 0.5 + analysis.arousal * 0.28 - analysis.repetition * 0.2, 0.08, 1),

    turbulence: audio
      ? clamp(audio.roughness * 0.42 + audio.flux * 0.28 + (1 - audio.pulseClarity) * 0.2 + Math.max(0, -valence) * 0.2, 0, 1)
      : clamp(analysis.arousal * 0.62 + Math.max(0, -analysis.valence) * 0.3 + analysis.inquiry * 0.25, 0, 1),

    gravity: clamp(
      (analysis.voice === 'address' ? 0.55 : analysis.voice === 'collective' ? 0.42 : 0.3)
        + secondStrength * 0.16
        + (dominantKey === 'transcendence' || dominantKey === 'love' ? 0.24 : 0)
        // A strong tonal center is literally a gravitational center.
        + (audio ? audio.keyConfidence * 0.2 - audio.stereoWidth * 0.12 : 0),
      0,
      1,
    ),

    // Loud and heavily compressed masters are the visual equivalent of heavy marks.
    weight: audio
      ? clamp(0.16 + audio.energy * 0.5 + (1 - audio.dynamicRange) * 0.24 + analysis.repetition * 0.2, 0.08, 1)
      : clamp(0.22 + analysis.repetition * 0.5 + analysis.arousal * 0.26, 0.08, 1),

    // A metronomic track is a symmetrical one.
    symmetry: audio
      ? clamp(analysis.rhyme * 0.3 + analysis.repetition * 0.28 + audio.pulseClarity * 0.42, 0, 1)
      : clamp(analysis.rhyme * 0.5 + analysis.repetition * 0.42, 0, 1),

    grain: audio
      ? clamp(0.2 + audio.roughness * 0.45 + Math.max(0, -valence) * 0.25, 0, 1)
      : clamp(0.26 + Math.max(0, -analysis.valence) * 0.42 + analysis.repetition * 0.18, 0, 1),

    forceNocturne: audio
      ? (audio.brightness < 0.32 && valence < 0.15) || dominantKey === 'night' || dominantKey === 'loss'
      : dominantKey === 'night' || dominantKey === 'loss',

    heard: audio !== null,
    pulse: audio && audio.tempo > 0 ? clamp((audio.tempo - 60) / 130, 0, 1) : 0.5,
    brightness: audio ? audio.brightness : 0.5,
    sections: audio ? audio.sections : 1,

    // Noisy, distorted music gets acidic colour; clean music stays calmer.
    // Minor keys sit a little more muted than major ones.
    saturationBoost: audio
      ? clamp(audio.roughness * 26 - 8 + (audio.mode === 'major' ? 5 : -5) * audio.keyConfidence, -14, 24)
      : 0,
    // Wide dynamics mean a wide range of values; a squashed master flattens it.
    spread: audio ? clamp(0.25 + audio.dynamicRange * 0.75, 0, 1) : 0.5,
    hueSource,
    arc: audio ? audio.arc : [],
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

function describeTempo(bpm: number): string {
  if (bpm >= 160) return 'headlong';
  if (bpm >= 130) return 'quick';
  if (bpm >= 108) return 'walking';
  if (bpm >= 85) return 'unhurried';
  return 'slow';
}

export function explain(
  analysis: SongAnalysis,
  genome: ArtGenome,
  audio: AudioFeatures | null,
): Reading {
  const info = describeStyle(genome.style);
  const dominant = analysis.themes[0];
  const second = analysis.themes[1];
  const notes: string[] = [];
  const heardNotes: string[] = [];

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
    `Emotional register reads ${describeValence(genome.valence)} and ${describeArousal(genome.arousal)}, ` +
      `which sets the palette ${genome.forceNocturne || genome.valence < 0.08 ? 'against a dark ground' : 'on a pale ground'} ` +
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
      'The lyrics name colors directly, so the palette is anchored to what the song says rather than what it means.',
    );
  }

  if (analysis.inquiry > 0.08) {
    notes.push(
      `${Math.round(analysis.inquiry * 100)}% of lines are questions, which adds unresolved motion to the field.`,
    );
  }

  // ---- what it heard ----
  if (audio) {
    if (audio.tempo > 0) {
      const pace = describeTempo(audio.tempo);
      heardNotes.push(
        `${Math.round(audio.tempo)} BPM — ${/^[aeiou]/.test(pace) ? 'an' : 'a'} ${pace} pulse, ` +
          (audio.pulseClarity > 0.55
            ? 'and a strongly metrical one, so the composition is more regular and symmetrical.'
            : 'but a loose one, so the composition is left freer and less aligned.'),
      );
    }

    if (genome.hueSource === 'key') {
      heardNotes.push(
        `Palette is anchored to the music: ${audio.keyName} places it at ${Math.round(genome.baseHue)}° ` +
          `on the circle of fifths, ${audio.tempo >= 138 ? 'the tempo opens it into complementary opposites' : audio.tempo >= 112 ? 'the tempo spreads it across the wheel' : 'the tempo keeps it to neighbouring hues'}` +
          `, and ${audio.roughness > 0.55 ? 'the distortion pushes it acidic' : 'the clean texture keeps it calm'}.`,
      );
    } else if (genome.hueSource === 'named') {
      heardNotes.push(
        'The lyrics name colours outright, so those override the key — the words win that argument.',
      );
    }

    if (audio.keyConfidence > 0.28) {
      heardNotes.push(
        `Reads as ${audio.keyName}. ${
          audio.mode === 'minor'
            ? 'The minor mode pulls the register darker than the words alone suggest'
            : 'The major mode lifts the register above what the words alone suggest'
        }, and the key sets the hue around the circle of fifths.`,
      );
    } else {
      heardNotes.push(
        'No stable key emerged — either the harmony moves too much or the mix is too dense — so hue stays anchored to the lyrics.',
      );
    }

    heardNotes.push(
      `Loudness sits at ${Math.round(audio.energy * 100)}% with ${
        audio.dynamicRange > 0.55 ? 'wide dynamics, so marks vary in weight' : 'narrow dynamics, so marks stay uniformly heavy'
      }.`,
    );

    heardNotes.push(
      `Timbre is ${audio.brightness > 0.6 ? 'bright' : audio.brightness > 0.35 ? 'mid-weighted' : 'dark and bass-heavy'} and ${
        audio.roughness > 0.6 ? 'noisy or distorted, which coarsens the grain' : 'fairly clean, which keeps edges crisp'
      }.`,
    );

    if (audio.sections > 1) {
      heardNotes.push(
        `${audio.sections} structural sections detected, and the loudness arc across the track shapes where the canvas gets busy.`,
      );
    }

    const { fromLyricsAlone } = selectStyle(analysis, audio, genome.seed);
    if (fromLyricsAlone !== genome.style) {
      const alternative = describeStyle(fromLyricsAlone);
      heardNotes.push(
        `The words alone would have produced ${alternative.label}, but the music is ${
          aggression(audio) > 0.6
            ? 'harder and rougher'
            : stillness(audio) > 0.6
              ? 'stiller'
              : 'weighted differently'
        } than they are, so the machine chose ${info.label} instead.`,
      );
    }

    if (audio.truncated) {
      heardNotes.push('The track was long, so only the first ten minutes were analyzed.');
    }
  }

  const mood = describeValence(genome.valence);
  // "A ambivalent song" reads as a bug even though it is only a grammar slip.
  const article = /^[aeiou]/.test(mood) ? 'An' : 'A';
  const verdict = dominant && dominant.strength > 0
    ? `${article} ${mood}, ${describeArousal(genome.arousal)} song about ${dominant.label.toLowerCase()}, rendered as ${info.label}.`
    : `${article} ${mood}, ${describeArousal(genome.arousal)} song, rendered as ${info.label}.`;

  return {
    verdict,
    notes,
    heardNotes,
    styleLabel: info.label,
    systemDescription: info.system,
    treatmentLabel: info.treatmentLabel,
    treatmentDescription: info.treatmentDescription,
    plottable: info.plottable,
  };
}
