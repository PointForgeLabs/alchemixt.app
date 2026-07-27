/**
 * Strata — the image laid down in horizontal bands.
 *
 * Chosen for memory and loss. Sediment is the right metaphor: what happened
 * earlier is still there, just further down and partly covered.
 */

import type { RenderEnv, SystemDraw } from '../renderer';

export const strata: SystemDraw = function* (env: RenderEnv) {
  const { ctx, width, height, unit, palette, genome, rng, noise, arcAt } = env;

  // With audio, each band is a moment in the track: the stack reads bottom-up
  // as the song plays, so loud passages become thick, emphatic layers.
  const bandCount = Math.round(14 + genome.density * 70);
  const roughness = unit * (0.004 + genome.turbulence * 0.05);
  const scale = 0.0016 + genome.turbulence * 0.004;

  // Bands accumulate from the bottom, each one thinner than the last, so the
  // top of the picture is the recent past and the bottom is the deep past.
  let y = height * rng.range(1.02, 1.12);
  let index = 0;

  while (y > -height * 0.1 && index < bandCount * 2) {
    const loudness = arcAt(1 - y / height);
    const thickness =
      (height / bandCount) * rng.range(0.35, 1.75) * (1 - genome.gravity * 0.25) * loudness;
    const top = y - thickness;

    const color = index % 7 === 0
      ? palette.accent
      : (palette.marks[index % palette.marks.length] as string);

    ctx.fillStyle = color;
    ctx.globalAlpha = (0.2 + rng.next() * (0.35 + genome.weight * 0.4)) * loudness;

    // The band's upper edge is a noise-displaced line, not a straight one.
    ctx.beginPath();
    ctx.moveTo(-roughness, y);
    const segments = Math.max(24, Math.round(width / 12));
    for (let s = 0; s <= segments; s += 1) {
      const px = (s / segments) * width;
      const displacement = (noise(px * scale, top * scale + index * 0.7) - 0.5) * roughness * 2;
      ctx.lineTo(px, top + displacement);
    }
    ctx.lineTo(width + roughness, y);
    ctx.closePath();
    ctx.fill();

    // Hairlines within the band — the texture of a layer, not just its color.
    const hairlines = Math.round(genome.density * 14);
    ctx.globalAlpha = 0.1 + genome.weight * 0.25;
    ctx.lineWidth = unit * 0.0006;
    ctx.strokeStyle = palette.veil;
    for (let h = 0; h < hairlines; h += 1) {
      const hy = top + thickness * rng.next();
      ctx.beginPath();
      const startX = rng.range(-width * 0.1, width * 0.6);
      const endX = startX + rng.range(width * 0.15, width * 0.9);
      for (let s = 0; s <= 20; s += 1) {
        const px = startX + ((endX - startX) * s) / 20;
        const displacement = (noise(px * scale * 1.6, hy * scale * 1.6) - 0.5) * roughness;
        if (s === 0) ctx.moveTo(px, hy + displacement);
        else ctx.lineTo(px, hy + displacement);
      }
      ctx.stroke();
    }

    y = top - thickness * rng.range(0.02, 0.3);
    index += 1;
    yield Math.min(0.75, index / bandCount);
  }

  // Vertical fault lines cutting through the stack — where the record breaks.
  const faults = Math.round(genome.turbulence * 9);
  ctx.globalCompositeOperation = palette.nocturne ? 'lighter' : 'multiply';
  for (let f = 0; f < faults; f += 1) {
    const fx = rng.range(width * 0.08, width * 0.92);
    ctx.strokeStyle = f % 2 === 0 ? palette.accent : palette.veil;
    ctx.globalAlpha = 0.25 + rng.next() * 0.4;
    ctx.lineWidth = unit * (0.001 + genome.weight * 0.006) * rng.range(0.5, 2);
    ctx.beginPath();
    let px = fx;
    for (let s = 0; s <= 60; s += 1) {
      const py = (s / 60) * height;
      px += (noise(fx * 0.01, py * scale * 3) - 0.5) * roughness * 0.9;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    yield 0.75 + (f / Math.max(1, faults)) * 0.15;
  }
  ctx.globalCompositeOperation = 'source-over';

  // A horizon: one clean line that gives the stack a place to be looked at from.
  const horizonY = height * (0.32 + rng.next() * 0.36);
  ctx.strokeStyle = palette.accent;
  ctx.globalAlpha = 0.55 + genome.gravity * 0.35;
  ctx.lineWidth = unit * (0.0012 + genome.weight * 0.003);
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(width, horizonY);
  ctx.stroke();
  ctx.globalAlpha = 1;
  yield 1;
};
