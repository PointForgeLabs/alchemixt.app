/**
 * Render orchestration.
 *
 * Systems are generators that yield progress between 0 and 1. The renderer
 * drives them across animation frames so the canvas fills in visibly — the
 * machine is supposed to look like it is working, not like it is loading.
 */

import type { ArtGenome, SystemKey } from '../analysis/interpret';
import { buildPalette, type Palette } from './color';
import { makeNoise2D, makeRng, type Rng } from './rng';

import { current } from './systems/current';
import { radiance } from './systems/radiance';
import { strata } from './systems/strata';
import { fracture } from './systems/fracture';
import { constellation } from './systems/constellation';
import { lattice } from './systems/lattice';
import { growth } from './systems/growth';

export interface RenderEnv {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Shortest edge — the unit most sizing should be expressed in. */
  unit: number;
  palette: Palette;
  genome: ArtGenome;
  rng: Rng;
  noise: (x: number, y: number) => number;
}

export type SystemDraw = (env: RenderEnv) => Generator<number, void, unknown>;

const SYSTEMS: Record<SystemKey, SystemDraw> = {
  current,
  radiance,
  strata,
  fracture,
  constellation,
  lattice,
  growth,
};

/** Flat ground plus a soft directional wash, so the field is never dead flat. */
function layGround(env: RenderEnv): void {
  const { ctx, width, height, palette, genome } = env;
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, width, height);

  const angle = genome.baseHue * (Math.PI / 180);
  const wash = ctx.createLinearGradient(
    width / 2 - Math.cos(angle) * width * 0.6,
    height / 2 - Math.sin(angle) * height * 0.6,
    width / 2 + Math.cos(angle) * width * 0.6,
    height / 2 + Math.sin(angle) * height * 0.6,
  );
  wash.addColorStop(0, palette.marks[0] ?? palette.veil);
  wash.addColorStop(1, palette.ground);
  ctx.globalAlpha = 0.16 + genome.arousal * 0.1;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}

/** Per-pixel grain plus a vignette. Applied last, over everything. */
function applyFinish(env: RenderEnv): void {
  const { ctx, width, height, genome, palette, rng } = env;

  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.25,
    width / 2, height / 2, Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, 'hsl(0 0% 0% / 0)');
  vignette.addColorStop(1, palette.nocturne ? 'hsl(0 0% 0% / 0.55)' : 'hsl(0 0% 12% / 0.24)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const strength = genome.grain;
  if (strength <= 0.02) return;

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const amount = strength * 26;
  for (let i = 0; i < data.length; i += 4) {
    // One RNG draw per pixel keeps the grain deterministic with everything else.
    const n = (rng.next() - 0.5) * amount;
    data[i] = Math.max(0, Math.min(255, (data[i] as number) + n));
    data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] as number) + n));
    data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] as number) + n));
  }
  ctx.putImageData(image, 0, 0);
}

export interface RenderHandle {
  /** Resolves when the piece is finished; rejects nothing, cancels silently. */
  done: Promise<void>;
  cancel(): void;
}

export function render(
  canvas: HTMLCanvasElement,
  genome: ArtGenome,
  options: { width: number; height: number; onProgress?: (p: number) => void } ,
): RenderHandle {
  const { width, height } = options;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable in this browser.');

  const rng = makeRng(genome.seed);
  const palette = buildPalette({
    baseHue: genome.baseHue,
    harmony: genome.harmony,
    valence: genome.valence,
    arousal: genome.arousal,
    forceNocturne: genome.forceNocturne,
    rng,
  });

  const env: RenderEnv = {
    ctx,
    width,
    height,
    unit: Math.min(width, height),
    palette,
    genome,
    rng,
    noise: makeNoise2D(genome.seed ^ 0x5bf03635),
  };

  layGround(env);

  const iterator = SYSTEMS[genome.system](env);
  let cancelled = false;
  let frame = 0;

  const done = new Promise<void>((resolve) => {
    const step = (): void => {
      if (cancelled) return;

      // Work in time slices rather than fixed iteration counts so slow devices
      // still hit 60fps and fast ones finish sooner.
      const deadline = performance.now() + 12;
      let result = iterator.next();
      while (!result.done && performance.now() < deadline) {
        result = iterator.next();
      }

      options.onProgress?.(result.done ? 1 : Math.min(0.99, (result.value as number) || 0));

      if (result.done) {
        applyFinish(env);
        options.onProgress?.(1);
        resolve();
        return;
      }
      frame = requestAnimationFrame(step);
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
