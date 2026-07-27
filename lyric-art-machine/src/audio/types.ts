/**
 * What the machine hears.
 *
 * Every field is normalized to a stable, interpretable range so the fusion
 * stage can mix it with lyric measurements without special-casing units.
 */

export const PITCH_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

export interface AudioFeatures {
  /** How the audio reached the machine. */
  source: 'file' | 'tab';
  /** Seconds actually analyzed (may be less than the track for very long files). */
  duration: number;
  /** True when analysis stopped early because the track was very long. */
  truncated: boolean;

  /** Beats per minute. 0 when no stable pulse was found. */
  tempo: number;
  /** 0..1 — how metrically clear that pulse is. Free-time music scores low. */
  pulseClarity: number;
  /** 0..1 — rhythmic event rate, normalized. */
  onsetDensity: number;

  /** 0..1 — overall loudness. */
  energy: number;
  /** 0..1 — variation in loudness. Compressed masters score low. */
  dynamicRange: number;

  /** 0..1 — spectral centroid. Dark and bassy at 0, bright and airy at 1. */
  brightness: number;
  /** 0..1 — spectral flatness. Tonal at 0, noisy/distorted at 1. */
  roughness: number;
  /** 0..1 — mean spectral change. Static drone at 0, restless at 1. */
  flux: number;

  /** Tonic pitch class, 0 = C. */
  keyIndex: number;
  mode: 'major' | 'minor';
  /** 0..1 — how confident the key estimate is. */
  keyConfidence: number;
  /** Display form, e.g. "F♯ minor". */
  keyName: string;

  /** 0..1 — stereo spread. Mono at 0, wide at 1. */
  stereoWidth: number;
  /** Number of structural sections detected. */
  sections: number;
  /** Normalized loudness envelope across the track, ~64 points. */
  arc: number[];
}
