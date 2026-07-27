/**
 * Offline audio analysis — the machine listening to a whole song at once.
 *
 * Written as a generator for the same reason the renderers are: a four-minute
 * track is thousands of FFT frames, and the interface should stay responsive
 * and show progress rather than freezing.
 */

import { FFT, hannWindow } from './fft';
import { PITCH_NAMES, type AudioFeatures } from './types';

const FRAME = 2048;
const HOP = 512;
/** Very long uploads are truncated so a podcast-length file can't hang the page. */
const MAX_SECONDS = 600;

/**
 * Krumhansl-Schmuckler key profiles — empirically derived ratings of how well
 * each pitch class fits a key. Correlating a song's chroma against all 24
 * rotations is the standard way to name a key.
 */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function mean(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i] as number;
  return sum / values.length;
}

/** Pearson correlation, used for both key matching and stereo width. */
function correlate(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = (a[i] as number) - ma;
    const y = (b[i] as number) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

function detectKey(chroma: Float64Array): {
  keyIndex: number;
  mode: 'major' | 'minor';
  confidence: number;
} {
  const values = Array.from(chroma);
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return { keyIndex: 0, mode: 'major', confidence: 0 };

  let best = { keyIndex: 0, mode: 'major' as 'major' | 'minor', score: -Infinity };
  let second = -Infinity;

  for (let tonic = 0; tonic < 12; tonic += 1) {
    for (const [mode, profile] of [
      ['major', MAJOR_PROFILE],
      ['minor', MINOR_PROFILE],
    ] as const) {
      // Rotate the song's chroma so the candidate tonic sits at index 0.
      const rotated = Array.from({ length: 12 }, (_, i) => values[(i + tonic) % 12] as number);
      const score = correlate(rotated, profile);
      if (score > best.score) {
        second = best.score;
        best = { keyIndex: tonic, mode, score };
      } else if (score > second) {
        second = score;
      }
    }
  }

  // Confidence is the margin over the runner-up: a song that fits two keys
  // equally well hasn't really told us its key.
  const margin = Number.isFinite(second) ? best.score - second : 0;
  return {
    keyIndex: best.keyIndex,
    mode: best.mode,
    confidence: clamp(margin * 4, 0, 1),
  };
}

/**
 * Tempo from the onset envelope by autocorrelation, restricted to a musical
 * range. The parabolic refinement matters: at this hop size, neighbouring
 * integer lags can be 20 BPM apart.
 */
function detectTempo(onsets: number[], hopSeconds: number): { tempo: number; clarity: number } {
  if (onsets.length < 16) return { tempo: 0, clarity: 0 };

  const avg = mean(onsets);
  const centered = onsets.map((v) => v - avg);

  const minLag = Math.max(2, Math.floor(60 / (200 * hopSeconds)));
  const maxLag = Math.min(centered.length - 1, Math.ceil(60 / (55 * hopSeconds)));
  if (maxLag <= minLag) return { tempo: 0, clarity: 0 };

  let bestLag = minLag;
  let bestScore = -Infinity;
  const scores: number[] = [];

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i + lag < centered.length; i += 1) {
      sum += (centered[i] as number) * (centered[i + lag] as number);
    }
    const raw = sum / (centered.length - lag);

    // Autocorrelation peaks just as happily at half and double the real tempo.
    // Weighting by a preference centred on 120 BPM resolves most of those
    // octave errors, and unlike hard folding it still allows genuinely slow
    // and genuinely fast music through.
    const bpm = 60 / (lag * hopSeconds);
    const preference = Math.exp(-0.5 * ((Math.log2(bpm / 120) / 0.9) ** 2));
    const score = raw * preference;

    scores.push(score);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Clarity is peak prominence: how far the winner stands above the rest of
  // the curve in standard deviations.
  const scoreAvg = mean(scores);
  const scoreSpread = Math.sqrt(mean(scores.map((v) => (v - scoreAvg) ** 2)));
  const clarity = scoreSpread > 0 ? clamp(((bestScore - scoreAvg) / scoreSpread - 0.8) / 2.6, 0, 1) : 0;

  // Parabolic interpolation around the winning lag for sub-sample precision.
  const idx = bestLag - minLag;
  const prev = scores[idx - 1];
  const next = scores[idx + 1];
  let refined = bestLag;
  if (prev !== undefined && next !== undefined) {
    const denom = prev - 2 * bestScore + next;
    if (denom !== 0) refined = bestLag + (0.5 * (prev - next)) / denom;
  }

  let tempo = 60 / (refined * hopSeconds);
  // Only fold when the result leaves the plausible musical range entirely —
  // the preference weighting above has already handled the ambiguous cases,
  // and folding at a tighter bound would corrupt genuinely slow tempos.
  while (tempo > 0 && tempo < 50) tempo *= 2;
  while (tempo > 205) tempo /= 2;

  return { tempo, clarity };
}

/** Counts structural sections by finding jumps in a smoothed timbre+harmony curve. */
function detectSections(profiles: number[][]): number {
  if (profiles.length < 8) return 1;

  const novelty: number[] = [];
  for (let i = 1; i < profiles.length; i += 1) {
    const a = profiles[i - 1] as number[];
    const b = profiles[i] as number[];
    let distance = 0;
    for (let k = 0; k < a.length; k += 1) {
      const d = (a[k] as number) - (b[k] as number);
      distance += d * d;
    }
    novelty.push(Math.sqrt(distance));
  }

  // Smooth first: frame-to-frame jitter is not structure, and without this a
  // constant-timbre track reports a dozen imaginary sections.
  const smoothed: number[] = [];
  for (let i = 0; i < novelty.length; i += 1) {
    const window = novelty.slice(Math.max(0, i - 2), Math.min(novelty.length, i + 3));
    smoothed.push(mean(window));
  }

  const avg = mean(smoothed);
  const spread = Math.sqrt(mean(smoothed.map((v) => (v - avg) ** 2)));
  // A genuine section boundary is a large, isolated jump, not a mild one.
  const threshold = avg + spread * 2.2;

  let count = 1;
  let cooldown = 0;
  for (const value of smoothed) {
    if (cooldown > 0) {
      cooldown -= 1;
      continue;
    }
    if (value > threshold) {
      count += 1;
      // Sections can't be shorter than a decent stretch of the track.
      cooldown = 8;
    }
  }
  return clamp(count, 1, 10);
}

export interface AnalysisProgress {
  progress: number;
  stage: string;
}

/**
 * Extracts features from a decoded buffer. Yields progress; returns the
 * finished feature set.
 */
export function* extractFeatures(
  buffer: AudioBuffer,
  source: 'file' | 'tab',
): Generator<AnalysisProgress, AudioFeatures, unknown> {
  const sampleRate = buffer.sampleRate;
  const maxSamples = Math.floor(MAX_SECONDS * sampleRate);
  const totalSamples = Math.min(buffer.length, maxSamples);
  const truncated = buffer.length > maxSamples;

  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

  // Stereo width, measured before the downmix destroys it.
  let stereoWidth = 0;
  if (right) {
    const step = Math.max(1, Math.floor(totalSamples / 40000));
    const l: number[] = [];
    const r: number[] = [];
    for (let i = 0; i < totalSamples; i += step) {
      l.push(left[i] as number);
      r.push(right[i] as number);
    }
    // Perfectly correlated channels are mono; decorrelated ones are wide.
    stereoWidth = clamp(1 - Math.abs(correlate(l, r)), 0, 1);
  }
  yield { progress: 0.04, stage: 'Downmixing' };

  const mono = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    mono[i] = right ? ((left[i] as number) + (right[i] as number)) / 2 : (left[i] as number);
  }

  const fft = new FFT(FRAME);
  const window = hannWindow(FRAME);
  const bins = FRAME / 2;
  const spectrum = new Float32Array(bins);
  let previous = new Float32Array(bins);

  const frameCount = Math.max(1, Math.floor((totalSamples - FRAME) / HOP));
  const rmsFrames: number[] = [];
  const centroids: number[] = [];
  const flatnesses: number[] = [];
  const fluxes: number[] = [];
  const onsets: number[] = [];
  const chroma = new Float64Array(12);
  const sectionProfiles: number[][] = [];
  const superFrameSize = Math.max(1, Math.floor(frameCount / 160));
  let superCentroid = 0;
  let superFlatness = 0;
  let superCount = 0;

  // Precompute each bin's pitch class and frequency once.
  const binFrequency = new Float32Array(bins);
  const binPitchClass = new Int8Array(bins);
  for (let k = 0; k < bins; k += 1) {
    const freq = (k * sampleRate) / FRAME;
    binFrequency[k] = freq;
    if (freq >= 55 && freq <= 2200) {
      const midi = 69 + 12 * Math.log2(freq / 440);
      binPitchClass[k] = ((Math.round(midi) % 12) + 12) % 12;
    } else {
      binPitchClass[k] = -1;
    }
  }

  const frameBuffer = new Float32Array(FRAME);

  for (let f = 0; f < frameCount; f += 1) {
    const offset = f * HOP;
    frameBuffer.set(mono.subarray(offset, offset + FRAME));
    fft.magnitudes(frameBuffer, spectrum, window);

    let sum = 0;
    let weighted = 0;
    let logSum = 0;
    let flux = 0;
    let rms = 0;

    for (let k = 0; k < bins; k += 1) {
      const mag = spectrum[k] as number;
      sum += mag;
      weighted += mag * (binFrequency[k] as number);
      logSum += Math.log(mag + 1e-10);
      // Only rising energy counts as onset evidence.
      const diff = mag - (previous[k] as number);
      if (diff > 0) flux += diff;

      const pc = binPitchClass[k] as number;
      if (pc >= 0) chroma[pc] = (chroma[pc] as number) + mag;
    }

    for (let i = offset; i < offset + FRAME; i += 8) {
      const s = mono[i] as number;
      rms += s * s;
    }
    rms = Math.sqrt(rms / (FRAME / 8));

    const centroid = sum > 0 ? weighted / sum : 0;
    const arithmetic = sum / bins;
    const geometric = Math.exp(logSum / bins);
    const flatness = arithmetic > 0 ? geometric / arithmetic : 0;

    rmsFrames.push(rms);
    centroids.push(centroid);
    flatnesses.push(flatness);
    fluxes.push(flux);
    onsets.push(flux);

    // Accumulate a coarse timbre profile for structural segmentation; the
    // harmonic half of the profile is sampled per super-frame just below.
    superCentroid += centroid / 5000;
    superFlatness += flatness;
    superCount += 1;
    if (superCount >= superFrameSize) {
      const profile: number[] = [];
      profile.push(superCentroid / superCount);
      profile.push(superFlatness / superCount);
      // Chroma for this super-frame, taken fresh from the current spectrum.
      let chromaSum = 0;
      const localChroma = new Float64Array(12);
      for (let k = 0; k < bins; k += 1) {
        const pc = binPitchClass[k] as number;
        if (pc >= 0) {
          localChroma[pc] = (localChroma[pc] as number) + (spectrum[k] as number);
          chromaSum += spectrum[k] as number;
        }
      }
      for (let pc = 0; pc < 12; pc += 1) {
        profile.push(chromaSum > 0 ? (localChroma[pc] as number) / chromaSum : 0);
      }
      sectionProfiles.push(profile);
      superCentroid = 0;
      superFlatness = 0;
      superCount = 0;
    }

    // Copy in place — allocating a fresh array per frame would mean thousands
    // of throwaway buffers over a full track.
    previous.set(spectrum);

    if (f % 48 === 0) {
      yield { progress: 0.04 + (f / frameCount) * 0.86, stage: 'Listening' };
    }
  }

  yield { progress: 0.93, stage: 'Finding the pulse' };

  const hopSeconds = HOP / sampleRate;
  const { tempo, clarity } = detectTempo(onsets, hopSeconds);
  const key = detectKey(chroma);

  // Onset density: how often flux crosses well above its own average.
  const fluxAvg = mean(fluxes);
  const fluxPeak = Math.max(...fluxes, 1e-9);
  let onsetCount = 0;
  for (let i = 1; i < fluxes.length - 1; i += 1) {
    const v = fluxes[i] as number;
    if (v > fluxAvg * 1.6 && v >= (fluxes[i - 1] as number) && v > (fluxes[i + 1] as number)) {
      onsetCount += 1;
    }
  }
  const seconds = totalSamples / sampleRate;
  const onsetDensity = clamp(onsetCount / seconds / 6, 0, 1);

  // Loudness in dB, which matches perception far better than raw amplitude.
  const meanRms = mean(rmsFrames);
  const energy = clamp((20 * Math.log10(meanRms + 1e-9) + 55) / 50, 0, 1);
  const rmsDb = rmsFrames.map((v) => 20 * Math.log10(v + 1e-9));
  const dbAvg = mean(rmsDb);
  const dbSpread = Math.sqrt(mean(rmsDb.map((v) => (v - dbAvg) ** 2)));
  const dynamicRange = clamp(dbSpread / 14, 0, 1);

  const meanCentroid = mean(centroids);
  // Log scale: the ear hears brightness logarithmically.
  const brightness = clamp((Math.log2(meanCentroid + 20) - Math.log2(120)) / (Math.log2(5200) - Math.log2(120)), 0, 1);

  const roughness = clamp(mean(flatnesses) * 3.2, 0, 1);
  const flux = clamp(fluxAvg / (fluxPeak * 0.35), 0, 1);

  // Loudness arc, resampled to a fixed number of points.
  const arcPoints = 64;
  const arc: number[] = [];
  const bucket = Math.max(1, Math.floor(rmsFrames.length / arcPoints));
  for (let i = 0; i < arcPoints; i += 1) {
    const slice = rmsFrames.slice(i * bucket, (i + 1) * bucket);
    arc.push(slice.length > 0 ? mean(slice) : 0);
  }
  const arcPeak = Math.max(...arc, 1e-9);
  const normalizedArc = arc.map((v) => clamp(v / arcPeak, 0, 1));

  yield { progress: 0.99, stage: 'Reading the structure' };

  return {
    source,
    duration: seconds,
    truncated,
    tempo,
    pulseClarity: clarity,
    onsetDensity,
    energy,
    dynamicRange,
    brightness,
    roughness,
    flux,
    keyIndex: key.keyIndex,
    mode: key.mode,
    keyConfidence: key.confidence,
    keyName: `${PITCH_NAMES[key.keyIndex]} ${key.mode}`,
    stereoWidth,
    sections: detectSections(sectionProfiles),
    arc: normalizedArc,
  };
}
