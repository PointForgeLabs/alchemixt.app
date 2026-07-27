/**
 * Radiance — everything organized around one luminous center.
 *
 * Chosen for transcendence, fire, and love: the three fields that in lyrics
 * behave the same way structurally, by making one thing the center of everything.
 */

import { hsl } from '../color';
import type { RenderEnv, SystemDraw } from '../renderer';

export const radiance: SystemDraw = function* (env: RenderEnv) {
  const { ctx, width, height, unit, palette, genome, rng, noise } = env;

  // Perfect centering reads as clip art; the offset scales with disorder.
  const cx = width / 2 + rng.gaussian(0, unit * 0.06 * (1 + genome.turbulence));
  const cy = height / 2 + rng.gaussian(0, unit * 0.05 * (1 + genome.turbulence));
  const maxRadius = Math.hypot(width, height) * 0.62;

  // The core: a bloom of light that everything else is measured against.
  const coreRadius = unit * (0.06 + genome.gravity * 0.16);
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 3.2);
  core.addColorStop(0, palette.nocturne ? hsl(genome.baseHue, 90, 88, 0.95) : hsl(genome.baseHue, 70, 96, 0.9));
  core.addColorStop(0.35, palette.accent);
  core.addColorStop(1, 'hsl(0 0% 0% / 0)');
  ctx.globalCompositeOperation = palette.nocturne ? 'lighter' : 'source-over';
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, coreRadius * 3.2, 0, Math.PI * 2);
  ctx.fill();
  yield 0.05;

  // Rays. Symmetry decides whether they are evenly spaced or scattered.
  const rayCount = Math.round(60 + genome.density * 460);
  ctx.lineCap = 'round';
  for (let i = 0; i < rayCount; i += 1) {
    const even = (i / rayCount) * Math.PI * 2;
    const scattered = rng.range(0, Math.PI * 2);
    const angle = even * genome.symmetry + scattered * (1 - genome.symmetry);

    const inner = coreRadius * rng.range(0.7, 1.6);
    const outer = inner + maxRadius * rng.range(0.12, 1) * (0.4 + genome.arousal * 0.8);

    ctx.strokeStyle = rng.next() > 0.9
      ? palette.accent
      : (palette.marks[rng.int(0, palette.marks.length - 1)] as string);
    ctx.globalAlpha = 0.08 + rng.next() * (0.18 + genome.weight * 0.3);
    ctx.lineWidth = unit * (0.0004 + genome.weight * 0.005) * rng.range(0.4, 2.2);

    // Rays bend through the noise field rather than running straight, which
    // keeps a sunburst from looking mechanical.
    ctx.beginPath();
    const segments = 14;
    for (let s = 0; s <= segments; s += 1) {
      const t = s / segments;
      const r = inner + (outer - inner) * t;
      const wobble = (noise(Math.cos(angle) * r * 0.004, Math.sin(angle) * r * 0.004) - 0.5)
        * genome.turbulence * 0.9 * t;
      const a = angle + wobble;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    if (i % 20 === 0) yield 0.05 + (i / rayCount) * 0.55;
  }

  // Orbits — concentric arcs, broken where the song is unresolved. With audio,
  // each detected section gets its own ring, so structure becomes visible.
  // Additive, not multiplicative: scaling by section count would put hundreds
  // of rings on a track the analyzer read as highly sectional.
  const orbitCount = Math.round(4 + genome.density * 22 + (genome.heard ? genome.sections * 2 : 0));
  for (let i = 0; i < orbitCount; i += 1) {
    const r = coreRadius * 1.5 + (maxRadius - coreRadius) * ((i + rng.range(0, 0.6)) / orbitCount);
    const start = rng.range(0, Math.PI * 2);
    const sweep = Math.PI * 2 * (0.25 + (1 - genome.turbulence) * rng.range(0.3, 0.75));

    ctx.strokeStyle = i % 5 === 0 ? palette.accent : (palette.marks[i % palette.marks.length] as string);
    ctx.globalAlpha = 0.18 + rng.next() * 0.4;
    ctx.lineWidth = unit * (0.0006 + genome.weight * 0.004) * rng.range(0.6, 2.4);
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + sweep);
    ctx.stroke();
    yield 0.6 + (i / orbitCount) * 0.25;
  }

  // Motes caught in the light.
  ctx.globalCompositeOperation = palette.nocturne ? 'lighter' : 'source-over';
  const motes = Math.round(120 + genome.density * 900);
  for (let i = 0; i < motes; i += 1) {
    const angle = rng.range(0, Math.PI * 2);
    // Biased toward the center so the halo stays the subject.
    const r = coreRadius + Math.pow(rng.next(), 1.7) * maxRadius;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    const size = unit * 0.001 * rng.range(0.4, 3.4) * (1 + genome.weight);
    ctx.fillStyle = rng.next() > 0.85 ? palette.accent : (palette.marks[rng.int(0, palette.marks.length - 1)] as string);
    ctx.globalAlpha = 0.15 + rng.next() * 0.55;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
    if (i % 60 === 0) yield 0.85 + (i / motes) * 0.15;
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};
