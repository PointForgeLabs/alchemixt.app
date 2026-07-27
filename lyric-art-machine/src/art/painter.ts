/**
 * The painter — geometry to pixels.
 *
 * Deliberately the only place that knows about both marks and canvas. SVG
 * export reads the same marks this reads and never touches this file, which is
 * what keeps plotter output faithful to what is on screen.
 */

import type { Mark, Scene } from './geometry';
import type { Palette } from './color';
import type { PaintHints } from './treatments';

export interface PaintEnv {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  unit: number;
  palette: Palette;
}

/** Resolves a mark's color from the palette. */
export function colorFor(palette: Palette, m: Mark): string {
  if (m.accent) return palette.accent;
  const index = Math.min(
    palette.marks.length - 1,
    Math.max(0, Math.floor(m.tone * palette.marks.length)),
  );
  return palette.marks[index] as string;
}

export function layGround(env: PaintEnv, baseHue: number, arousal: number): void {
  const { ctx, width, height, palette } = env;
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, width, height);

  const angle = baseHue * (Math.PI / 180);
  const wash = ctx.createLinearGradient(
    width / 2 - Math.cos(angle) * width * 0.6,
    height / 2 - Math.sin(angle) * height * 0.6,
    width / 2 + Math.cos(angle) * width * 0.6,
    height / 2 + Math.sin(angle) * height * 0.6,
  );
  wash.addColorStop(0, palette.marks[0] ?? palette.veil);
  wash.addColorStop(1, palette.ground);
  ctx.globalAlpha = 0.16 + arousal * 0.1;
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}

export function paintGlows(env: PaintEnv, scene: Scene): void {
  const { ctx, palette } = env;
  ctx.save();
  ctx.globalCompositeOperation = palette.nocturne ? 'lighter' : 'source-over';
  for (const glow of scene.glows) {
    const gradient = ctx.createRadialGradient(glow.x, glow.y, 0, glow.x, glow.y, glow.radius);
    const color = glow.accent
      ? palette.accent
      : (palette.marks[Math.min(palette.marks.length - 1, Math.floor(glow.tone * palette.marks.length))] as string);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'hsl(0 0% 0% / 0)');
    ctx.globalAlpha = glow.strength;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(glow.x, glow.y, glow.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function tracePath(ctx: CanvasRenderingContext2D, m: Mark): void {
  const first = m.points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < m.points.length; i += 1) {
    const p = m.points[i] as [number, number];
    ctx.lineTo(p[0], p[1]);
  }
  if (m.closed) ctx.closePath();
}

/**
 * Paints a slice of the mark list. Returns the index it stopped at, so the
 * renderer can spread a large scene across animation frames.
 */
export function paintMarks(
  env: PaintEnv,
  marks: Mark[],
  hints: PaintHints,
  from: number,
  budgetMs: number,
): number {
  const { ctx, unit, palette } = env;
  const weightScale = hints.weightScale ?? 1;
  const alphaScale = hints.alphaScale ?? 1;
  const baseWidth = unit * 0.0013;

  ctx.save();
  ctx.lineCap = hints.lineCap ?? 'round';
  ctx.lineJoin = 'round';
  if (hints.blend) ctx.globalCompositeOperation = hints.blend;

  const deadline = performance.now() + budgetMs;
  let i = from;
  for (; i < marks.length; i += 1) {
    const m = marks[i] as Mark;
    if (m.points.length < 2) continue;

    const color = colorFor(palette, m);
    ctx.globalAlpha = Math.max(0, Math.min(1, m.alpha * alphaScale));

    if (m.fill && !hints.strokeOnly && m.closed) {
      tracePath(ctx, m);
      ctx.fillStyle = color;
      ctx.fill();
      // A hairline keeps filled regions from bleeding into each other.
      ctx.strokeStyle = color;
      ctx.lineWidth = baseWidth * m.weight * weightScale * 0.5;
      ctx.stroke();
    } else {
      tracePath(ctx, m);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.25, baseWidth * m.weight * weightScale);
      ctx.stroke();
    }

    // Checking the clock every mark would cost more than it saves.
    if ((i & 63) === 0 && performance.now() > deadline) {
      i += 1;
      break;
    }
  }

  ctx.restore();
  return i;
}
