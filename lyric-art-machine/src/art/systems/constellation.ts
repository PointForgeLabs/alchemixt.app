/**
 * Constellation — points of light on a dark ground, with lines drawn between
 * the ones that belong together.
 *
 * Chosen for night and dream. The connective lines are the whole idea: isolated
 * things that the eye insists on joining up.
 */

import type { RenderEnv, SystemDraw } from '../renderer';

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
}

export const constellation: SystemDraw = function* (env: RenderEnv) {
  const { ctx, width, height, unit, palette, genome, rng, noise, arcAt } = env;

  // Atmosphere first: soft clouds so the dark isn't uniform.
  const clouds = Math.round(6 + genome.density * 20);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < clouds; i += 1) {
    const cx = rng.range(0, width);
    const cy = rng.range(0, height);
    const r = unit * rng.range(0.1, 0.55);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, (palette.marks[rng.int(0, palette.marks.length - 1)] as string));
    gradient.addColorStop(1, 'hsl(0 0% 0% / 0)');
    ctx.globalAlpha = 0.05 + rng.next() * 0.14;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    yield (i / clouds) * 0.15;
  }
  ctx.globalCompositeOperation = 'source-over';

  // Stars, clustered by the noise field rather than spread evenly — a night sky
  // has crowds and voids, and so should this.
  const starCount = Math.round(180 + genome.density * 1500);
  const stars: Star[] = [];
  let attempts = 0;
  while (stars.length < starCount && attempts < starCount * 6) {
    attempts += 1;
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    // Loud passages of the track become dense fields of stars.
    const clusterBias = noise(x * 0.0018, y * 0.0018) * arcAt(x / width);
    if (rng.next() > clusterBias * (0.5 + genome.density)) continue;
    stars.push({
      x,
      y,
      size: unit * 0.0009 * rng.range(0.4, 4) * (1 + genome.weight * 1.4),
      brightness: rng.next(),
    });
  }
  yield 0.25;

  // Lines between near neighbors. Turbulence loosens the threshold, so a
  // restless song gets a more tangled web.
  const linkRadius = unit * (0.05 + genome.gravity * 0.1 + genome.turbulence * 0.04);
  ctx.lineWidth = unit * 0.00035 * (1 + genome.weight);
  for (let i = 0; i < stars.length; i += 1) {
    const a = stars[i] as Star;
    if (a.brightness < 0.55) continue;
    for (let j = i + 1; j < stars.length; j += 1) {
      const b = stars[j] as Star;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > linkRadius) continue;
      if (rng.next() > 0.22) continue;
      ctx.strokeStyle = palette.veil;
      ctx.globalAlpha = (1 - d / linkRadius) * 0.32;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    if (i % 40 === 0) yield 0.25 + (i / stars.length) * 0.35;
  }

  // The stars themselves, drawn over the web.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < stars.length; i += 1) {
    const star = stars[i] as Star;
    const isBright = star.brightness > 0.93;
    ctx.fillStyle = isBright
      ? palette.accent
      : (palette.marks[Math.floor(star.brightness * palette.marks.length) % palette.marks.length] as string);
    ctx.globalAlpha = 0.3 + star.brightness * 0.65;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();

    // Bright stars get a halo and cross flare.
    if (isBright) {
      const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 14);
      glow.addColorStop(0, palette.accent);
      glow.addColorStop(1, 'hsl(0 0% 0% / 0)');
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size * 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = palette.accent;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = star.size * 0.5;
      const flare = star.size * rng.range(6, 16);
      ctx.beginPath();
      ctx.moveTo(star.x - flare, star.y);
      ctx.lineTo(star.x + flare, star.y);
      ctx.moveTo(star.x, star.y - flare);
      ctx.lineTo(star.x, star.y + flare);
      ctx.stroke();
    }

    if (i % 80 === 0) yield 0.6 + (i / stars.length) * 0.4;
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};
