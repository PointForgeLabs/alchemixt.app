/**
 * Render orchestration.
 *
 * Four stages, all spread across animation frames so the canvas fills visibly
 * rather than freezing: build geometry, apply the treatment, paint, finish.
 *
 * The scene produced in stage one is kept and handed back, because that
 * geometry — not the pixels — is what SVG export and the plotter need.
 */

import type { ArtGenome } from '../analysis/interpret';
import { buildPalette, type Palette } from './color';
import { createScene, type Mark, type Scene } from './geometry';
import { makeNoise2D, makeRng, type Rng } from './rng';
import { ENGINE_BY_KEY } from './engines';
import { STYLE_BY_KEY, type Style } from './catalog';
import { TREATMENT_BY_KEY, type Treatment } from './treatments';
import { layGround, paintGlows, paintMarks, type PaintEnv } from './painter';

/** Builds the loudness-envelope sampler; returns 1 when nothing was heard. */
function makeArcSampler(arc: number[]): (t: number) => number {
  if (arc.length < 2) return () => 1;
  return (t: number): number => {
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    const position = clamped * (arc.length - 1);
    const index = Math.floor(position);
    const next = Math.min(arc.length - 1, index + 1);
    const frac = position - index;
    const value = (arc[index] as number) * (1 - frac) + (arc[next] as number) * frac;
    // Compressed toward 1 so a quiet intro thins the canvas without emptying it.
    return 0.45 + value * 0.55;
  };
}

/** Applies a style's bias multipliers without letting them leave 0..1. */
function biasGenome(genome: ArtGenome, style: Style): ArtGenome {
  if (!style.bias) return genome;
  const clamp = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  return {
    ...genome,
    density: clamp(genome.density * (style.bias.density ?? 1)),
    turbulence: clamp(genome.turbulence * (style.bias.turbulence ?? 1)),
    weight: clamp(genome.weight * (style.bias.weight ?? 1)),
    symmetry: clamp(genome.symmetry * (style.bias.symmetry ?? 1)),
    gravity: clamp(genome.gravity * (style.bias.gravity ?? 1)),
  };
}

export interface RenderResult {
  /** Geometry as the treatment left it — exactly what a plotter would draw. */
  marks: Mark[];
  scene: Scene;
  palette: Palette;
  style: Style;
  treatment: Treatment;
  genome: ArtGenome;
}

export interface RenderHandle {
  done: Promise<RenderResult>;
  cancel(): void;
}

export interface RenderOptions {
  width: number;
  height: number;
  onProgress?: (progress: number) => void;
}

export function render(
  canvas: HTMLCanvasElement,
  genome: ArtGenome,
  options: RenderOptions,
): RenderHandle {
  const { width, height } = options;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable in this browser.');

  const style = STYLE_BY_KEY.get(genome.style) ?? (STYLE_BY_KEY.values().next().value as Style);
  const treatment = TREATMENT_BY_KEY.get(style.treatment) as Treatment;
  const engine = ENGINE_BY_KEY.get(style.engine);
  if (!engine) throw new Error(`Unknown engine "${style.engine}".`);

  const biased = biasGenome(genome, style);
  const rng: Rng = makeRng(biased.seed);
  const noise = makeNoise2D(biased.seed ^ 0x5bf03635);

  const palette = buildPalette({
    baseHue: biased.baseHue,
    harmony: biased.harmony,
    valence: biased.valence,
    arousal: biased.arousal,
    forceNocturne: biased.forceNocturne,
    brightness: biased.brightness,
    saturationBoost: biased.saturationBoost,
    spread: biased.spread,
    lightnessShift: treatment.groundShift?.lightness,
    saturationShift: treatment.groundShift?.saturation,
    rng,
  });

  const scene = createScene();
  const unit = Math.min(width, height);
  const engineEnv = {
    width,
    height,
    unit,
    scene,
    rng,
    noise,
    genome: biased,
    arcAt: makeArcSampler(biased.arc),
  };

  const paintEnv: PaintEnv = { ctx, width, height, unit, palette };
  layGround(paintEnv, biased.baseHue, biased.arousal);

  const iterator = engine.run(engineEnv);
  let cancelled = false;
  let frame = 0;

  // Stage machine: geometry -> transform -> paint -> finish.
  let stage: 'geometry' | 'transform' | 'paint' | 'finish' = 'geometry';
  let marks: Mark[] = [];
  let painted = 0;

  const done = new Promise<RenderResult>((resolve, reject) => {
    const step = (): void => {
      if (cancelled) return;
      try {
        if (stage === 'geometry') {
          const deadline = performance.now() + 12;
          let result = iterator.next();
          while (!result.done && performance.now() < deadline) {
            result = iterator.next();
          }
          options.onProgress?.(Math.min(0.55, ((result.value as number) || 0) * 0.55));
          if (result.done) stage = 'transform';
        } else if (stage === 'transform') {
          marks = treatment.transform
            ? treatment.transform(scene.marks, { unit, rng, noise, genome: biased })
            : scene.marks;
          // Glows are on unless a treatment opts out — the atmosphere is the
          // point, and only strict line work has a reason to refuse it.
          if (treatment.paint?.glows !== false) {
            paintGlows(paintEnv, scene);
          }
          options.onProgress?.(0.6);
          stage = 'paint';
        } else if (stage === 'paint') {
          painted = paintMarks(paintEnv, marks, treatment.paint ?? {}, painted, 12);
          const ratio = marks.length > 0 ? painted / marks.length : 1;
          options.onProgress?.(0.6 + ratio * 0.35);
          if (painted >= marks.length) stage = 'finish';
        } else {
          treatment.finish?.({
            ctx,
            width,
            height,
            unit,
            rng,
            genome: biased,
            nocturne: palette.nocturne,
          });
          options.onProgress?.(1);
          resolve({ marks, scene, palette, style, treatment, genome: biased });
          return;
        }
        frame = requestAnimationFrame(step);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Rendering failed.'));
      }
    };
    frame = requestAnimationFrame(step);
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    },
  };
}
