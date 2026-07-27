/**
 * Treatments — how a mark is realized.
 *
 * The engine decides where a form sits; the treatment decides whether it is an
 * ink line, a field of stipple, a woodcut gouge, or an offset riso pass. This
 * is where most of the visual variety in the catalogue comes from: the same
 * geometry under two treatments reads as two different media.
 *
 * Treatments work in two stages. The geometry stage rewrites marks and is what
 * the plotter ultimately draws. The finish stage is raster-only and is skipped
 * entirely when exporting for a pen.
 */

import {
  boundsOf,
  hatchPolygon,
  jitterPoints,
  mark,
  pointInPolygon,
  type Mark,
  type Point,
} from './geometry';
import type { ArtGenome } from '../analysis/interpret';
import type { Rng } from './rng';

export interface TreatmentContext {
  unit: number;
  rng: Rng;
  noise: (x: number, y: number) => number;
  genome: ArtGenome;
}

export interface FinishEnv {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  unit: number;
  rng: Rng;
  genome: ArtGenome;
  nocturne: boolean;
}

export interface PaintHints {
  /** Regions are outlined rather than filled. */
  strokeOnly?: boolean;
  blend?: GlobalCompositeOperation;
  weightScale?: number;
  alphaScale?: number;
  /** Honour the scene's raster glows. */
  glows?: boolean;
  lineCap?: CanvasLineCap;
}

export interface Treatment {
  key: string;
  label: string;
  description: string;
  /** True when a pen can reproduce this honestly. */
  plottable: boolean;
  /** Palette adjustments applied before painting. */
  groundShift?: { lightness?: number; saturation?: number };
  transform?: (marks: Mark[], ctx: TreatmentContext) => Mark[];
  paint?: PaintHints;
  finish?: (env: FinishEnv) => void;
}

/** Global ceiling so a dense scene under a heavy treatment can't hang the tab. */
const MAX_MARKS = 120000;

function cap(marks: Mark[]): Mark[] {
  return marks.length > MAX_MARKS ? marks.slice(0, MAX_MARKS) : marks;
}

/** Replaces filled regions with hatch lines; leaves strokes alone. */
function hatchFills(
  marks: Mark[],
  ctx: TreatmentContext,
  options: { spacing: number; cross: boolean; keepOutline: boolean; tonal: boolean },
): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    if (!m.fill || m.points.length < 3) {
      out.push(m);
      continue;
    }

    // Darker regions get tighter lines — the only way a pen makes a tone.
    const density = options.tonal ? 0.4 + (1 - m.tone) * 1.6 : 1;
    const spacing = Math.max(ctx.unit * 0.0018, (options.spacing * ctx.unit) / density);
    const angle = ctx.rng.range(0, Math.PI);

    for (const line of hatchPolygon(m.points, angle, spacing)) {
      out.push(mark(line, {
        tone: m.tone,
        weight: m.weight * 0.55,
        alpha: Math.min(1, m.alpha * 1.25),
        accent: m.accent,
        layer: m.layer,
      }));
    }
    if (options.cross) {
      for (const line of hatchPolygon(m.points, angle + Math.PI / 2.4, spacing * 1.25)) {
        out.push(mark(line, {
          tone: m.tone,
          weight: m.weight * 0.45,
          alpha: Math.min(1, m.alpha),
          accent: m.accent,
          layer: m.layer,
        }));
      }
    }
    if (options.keepOutline) {
      out.push({ ...m, fill: false, alpha: Math.min(1, m.alpha * 1.4) });
    }
    if (out.length > MAX_MARKS) break;
  }
  return cap(out);
}

/**
 * Scatters dots inside regions and along lines.
 *
 * Dots have to be drawn firmly: a dot at the alpha of the stroke it replaces
 * disappears, because a line's weight comes from its length and a dot has none.
 * So alpha gets a floor and the dots are deliberately larger than the marks
 * they stand in for.
 */
function stipple(marks: Mark[], ctx: TreatmentContext): Mark[] {
  const out: Mark[] = [];
  const dot = ctx.unit * 0.002;
  const firm = (alpha: number): number => Math.max(0.5, Math.min(1, alpha * 1.5));

  const emit = (p: Point, m: Mark, scale: number): void => {
    const r = dot * scale;
    out.push(mark([[p[0] - r, p[1]], [p[0] + r, p[1]]], {
      tone: m.tone,
      weight: Math.max(1, m.weight) * 1.6,
      alpha: firm(m.alpha),
      accent: m.accent,
      layer: m.layer,
    }));
  };

  for (const m of marks) {
    const b = boundsOf(m.points);
    const spanned = Math.max(b.maxX - b.minX, b.maxY - b.minY);

    if (m.fill && m.points.length >= 3 && spanned > ctx.unit * 0.012) {
      const area = (b.maxX - b.minX) * (b.maxY - b.minY);
      const wanted = Math.min(2600, Math.round((area / (ctx.unit * ctx.unit)) * 2600 * (1 - m.tone * 0.6)));
      let placed = 0;
      let attempts = 0;
      while (placed < wanted && attempts < wanted * 3) {
        attempts += 1;
        const p: Point = [ctx.rng.range(b.minX, b.maxX), ctx.rng.range(b.minY, b.maxY)];
        if (!pointInPolygon(p, m.points)) continue;
        placed += 1;
        emit(p, m, ctx.rng.range(0.5, 1.8));
      }
    } else if (spanned <= ctx.unit * 0.012) {
      // Already dot-sized — a star, a bud, a terminal node. Stippling it would
      // just delete it, so keep it as a single firm dot.
      const [cx, cy] = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
      emit([cx, cy], m, Math.max(0.7, (spanned / dot) * 0.5));
    } else {
      // Strokes become dotted trails. Every point is a candidate — decimating
      // first and sampling second used to leave short marks with nothing at all.
      const stride = m.points.length > 40 ? 2 : 1;
      let any = false;
      for (let i = 0; i < m.points.length; i += stride) {
        if (ctx.rng.next() > 0.72) continue;
        emit(m.points[i] as Point, m, ctx.rng.range(0.45, 1.4));
        any = true;
      }
      // Never let a mark vanish entirely to chance.
      if (!any) emit(m.points[0] as Point, m, 1);
    }
    if (out.length > MAX_MARKS) break;
  }
  return cap(out);
}

/** Redraws every mark a few times with a wobble — the hand-drawn look. */
function sketchPasses(marks: Mark[], ctx: TreatmentContext, passes: number, amount: number): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    for (let p = 0; p < passes; p += 1) {
      out.push({
        ...m,
        fill: false,
        points: jitterPoints(m.points, ctx.unit * amount, ctx.noise, p * 13.7),
        alpha: m.alpha * (p === 0 ? 0.9 : 0.55),
        weight: m.weight * (p === 0 ? 1 : 0.75),
      });
    }
    if (out.length > MAX_MARKS) break;
  }
  return cap(out);
}

/** Duplicates marks into offset color passes — misregistered printing. */
function separations(marks: Mark[], ctx: TreatmentContext, count: number, offset: number): Mark[] {
  const out: Mark[] = [];
  const shifts: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    shifts.push([ctx.rng.gaussian(0, ctx.unit * offset), ctx.rng.gaussian(0, ctx.unit * offset)]);
  }

  for (const m of marks) {
    for (let i = 0; i < count; i += 1) {
      const shift = shifts[i] as Point;
      out.push({
        ...m,
        points: m.points.map(([x, y]) => [x + shift[0], y + shift[1]] as Point),
        // Each pass is a different ink, so tone is quantized per separation.
        tone: (i + 0.5) / count,
        accent: i === count - 1 && m.accent,
        alpha: m.alpha * 0.72,
        layer: i,
      });
    }
    if (out.length > MAX_MARKS) break;
  }
  return cap(out);
}

// ---------------------------------------------------------------- raster finishes

function grain(env: FinishEnv, strength: number): void {
  if (strength <= 0.02) return;
  const { ctx, width, height, rng } = env;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const amount = strength * 26;
  for (let i = 0; i < data.length; i += 4) {
    const n = (rng.next() - 0.5) * amount;
    data[i] = Math.max(0, Math.min(255, (data[i] as number) + n));
    data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] as number) + n));
    data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] as number) + n));
  }
  ctx.putImageData(image, 0, 0);
}

function vignette(env: FinishEnv): void {
  const { ctx, width, height, nocturne } = env;
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.25,
    width / 2, height / 2, Math.max(width, height) * 0.78,
  );
  gradient.addColorStop(0, 'hsl(0 0% 0% / 0)');
  gradient.addColorStop(1, nocturne ? 'hsl(0 0% 0% / 0.55)' : 'hsl(0 0% 12% / 0.24)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** Bloom: blur-ish light spill, faked by scaling the canvas into itself. */
function bloom(env: FinishEnv, strength: number): void {
  const { ctx, width, height } = env;
  const scratch = document.createElement('canvas');
  scratch.width = Math.max(1, Math.round(width / 6));
  scratch.height = Math.max(1, Math.round(height / 6));
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  sctx.drawImage(ctx.canvas, 0, 0, scratch.width, scratch.height);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = strength;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch, 0, 0, width, height);
  ctx.restore();
}

/** Overlays a regular dot screen, so the image reads as printed. */
function halftoneScreen(env: FinishEnv, pitch: number): void {
  const { ctx, width, height, nocturne } = env;
  ctx.save();
  ctx.globalCompositeOperation = nocturne ? 'multiply' : 'screen';
  ctx.fillStyle = nocturne ? 'hsl(0 0% 0% / 0.5)' : 'hsl(0 0% 100% / 0.4)';
  for (let y = 0; y < height; y += pitch) {
    for (let x = 0; x < width; x += pitch) {
      ctx.beginPath();
      ctx.arc(x, y, pitch * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Paper fibre — faint long streaks, as if the stock had a grain direction. */
function paperTexture(env: FinishEnv): void {
  const { ctx, width, height, rng, nocturne } = env;
  ctx.save();
  ctx.globalCompositeOperation = nocturne ? 'lighter' : 'multiply';
  ctx.strokeStyle = nocturne ? 'hsl(40 30% 70% / 0.03)' : 'hsl(30 20% 40% / 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 400; i += 1) {
    const y = rng.range(0, height);
    const x = rng.range(0, width);
    const len = rng.range(width * 0.02, width * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + rng.range(-2, 2));
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the catalogue

export const TREATMENTS: Treatment[] = [
  {
    key: 'ink',
    label: 'Ink',
    description: 'Clean strokes and solid regions. The geometry, stated plainly.',
    plottable: true,
    paint: { glows: true, lineCap: 'round' },
    finish: (env) => {
      vignette(env);
      grain(env, env.genome.grain * 0.7);
    },
  },
  {
    key: 'hatch',
    label: 'Cross-hatch',
    description: 'Every region becomes crossed pen lines. Tone exists only as line density.',
    plottable: true,
    transform: (marks, ctx) =>
      hatchFills(marks, ctx, { spacing: 0.012, cross: true, keepOutline: true, tonal: true }),
    paint: { strokeOnly: true, lineCap: 'round' },
    finish: (env) => {
      vignette(env);
      grain(env, env.genome.grain * 0.5);
    },
  },
  {
    key: 'engrave',
    label: 'Engraving',
    description: 'Fine parallel rulings, tightening where the image darkens. Banknote logic.',
    plottable: true,
    transform: (marks, ctx) =>
      hatchFills(marks, ctx, { spacing: 0.006, cross: false, keepOutline: false, tonal: true }),
    paint: { strokeOnly: true, weightScale: 0.6, lineCap: 'butt' },
    finish: (env) => {
      vignette(env);
      grain(env, env.genome.grain * 0.35);
    },
  },
  {
    key: 'stipple',
    label: 'Stipple',
    description: 'Nothing but dots. Density does all the work that a line would normally do.',
    plottable: true,
    transform: (marks, ctx) => stipple(marks, ctx),
    paint: { strokeOnly: true, lineCap: 'round', weightScale: 1.4 },
    finish: (env) => {
      vignette(env);
      grain(env, env.genome.grain * 0.4);
    },
  },
  {
    key: 'sketch',
    label: 'Sketch',
    description: 'Each mark drawn two or three times, never quite landing in the same place.',
    plottable: true,
    transform: (marks, ctx) => sketchPasses(marks, ctx, 3, 0.006),
    paint: { strokeOnly: true, alphaScale: 0.8, lineCap: 'round' },
    finish: (env) => {
      paperTexture(env);
      vignette(env);
      grain(env, env.genome.grain * 0.6);
    },
  },
  {
    key: 'woodcut',
    label: 'Woodcut',
    description: 'Heavy gouged marks, full contrast, no half measures. Everything is either cut or uncut.',
    plottable: true,
    transform: (marks, ctx) =>
      hatchFills(marks, ctx, { spacing: 0.018, cross: false, keepOutline: true, tonal: false }).map((m) => ({
        ...m,
        alpha: 1,
        weight: m.weight * (2.2 + ctx.genome.weight),
      })),
    paint: { strokeOnly: true, lineCap: 'butt', alphaScale: 1 },
    finish: (env) => {
      paperTexture(env);
      grain(env, env.genome.grain * 0.8);
    },
  },
  {
    key: 'blueprint',
    label: 'Blueprint',
    description: 'Thin bright rulings on deep blue. A drawing meant to be built from.',
    plottable: true,
    groundShift: { lightness: -46, saturation: 34 },
    transform: (marks, ctx) =>
      hatchFills(marks, ctx, { spacing: 0.016, cross: false, keepOutline: true, tonal: false }),
    paint: { strokeOnly: true, weightScale: 0.7, lineCap: 'butt' },
    finish: (env) => {
      vignette(env);
      grain(env, 0.25);
    },
  },
  {
    key: 'riso',
    label: 'Risograph',
    description: 'Two or three ink passes, each slightly out of register, overprinting where they meet.',
    plottable: true,
    transform: (marks, ctx) => separations(marks, ctx, ctx.rng.bool() ? 2 : 3, 0.006),
    paint: { blend: 'multiply', alphaScale: 0.85, lineCap: 'round' },
    finish: (env) => {
      grain(env, 0.55);
      paperTexture(env);
    },
  },
  {
    key: 'screenprint',
    label: 'Screenprint',
    description: 'Flat spot colors pulled slightly off-register, with the screen showing through.',
    plottable: true,
    transform: (marks, ctx) => separations(marks, ctx, 2, 0.004),
    paint: { alphaScale: 0.95, lineCap: 'butt', weightScale: 1.3 },
    finish: (env) => {
      halftoneScreen(env, Math.max(4, env.unit * 0.006));
      vignette(env);
      grain(env, 0.3);
    },
  },
  {
    key: 'wash',
    label: 'Wash',
    description: 'Soft, wide, translucent strokes that pool and bleed into one another.',
    plottable: false,
    paint: { weightScale: 5.5, alphaScale: 0.22, lineCap: 'round', glows: true },
    finish: (env) => {
      bloom(env, 0.35);
      paperTexture(env);
      vignette(env);
      grain(env, env.genome.grain * 0.5);
    },
  },
  {
    key: 'neon',
    label: 'Neon',
    description: 'Light rather than pigment — every line glows, and the dark does the rest.',
    plottable: false,
    groundShift: { lightness: -30 },
    paint: { blend: 'lighter', glows: true, lineCap: 'round', alphaScale: 0.75 },
    finish: (env) => {
      bloom(env, 0.6);
      vignette(env);
      grain(env, 0.2);
    },
  },
  {
    key: 'halftone',
    label: 'Halftone',
    description: 'The whole image resolved into a printer’s dot screen, coarse enough to see.',
    plottable: false,
    paint: { lineCap: 'round', weightScale: 1.6 },
    finish: (env) => {
      halftoneScreen(env, Math.max(3, env.unit * 0.0045));
      vignette(env);
      grain(env, 0.35);
    },
  },
];

export const TREATMENT_BY_KEY = new Map(TREATMENTS.map((t) => [t.key, t]));
