/**
 * Current — particles released into a noise field.
 *
 * Chosen for songs about motion, travel, escape, and water. Nothing is placed
 * by hand: every mark is the record of where the field carried a point.
 */

import type { RenderEnv, SystemDraw } from '../renderer';

export const current: SystemDraw = function* (env: RenderEnv) {
  const { ctx, width, height, unit, palette, genome, rng, noise } = env;

  const particleCount = Math.round(600 + genome.density * 2600);
  const stepsPerParticle = Math.round(60 + (1 - genome.turbulence) * 260);
  const scale = 0.0007 + genome.turbulence * 0.0022;
  const stepLength = unit * (0.0016 + genome.arousal * 0.004);
  const lineWidth = unit * (0.0004 + genome.weight * 0.0042);

  // A slow global drift keeps the field from looking like pure noise — songs
  // about going somewhere should read as going somewhere.
  const driftAngle = rng.range(0, Math.PI * 2);
  const driftStrength = 0.28 + genome.gravity * 0.5;

  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = palette.nocturne ? 'lighter' : 'multiply';

  for (let p = 0; p < particleCount; p += 1) {
    let x = rng.range(-unit * 0.1, width + unit * 0.1);
    let y = rng.range(-unit * 0.1, height + unit * 0.1);

    const tone = rng.next();
    const color = tone > 0.94
      ? palette.accent
      : (palette.marks[rng.int(0, palette.marks.length - 1)] as string);

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.05 + rng.next() * (0.12 + genome.weight * 0.2);
    ctx.lineWidth = lineWidth * rng.range(0.5, 1.9);
    ctx.beginPath();
    ctx.moveTo(x, y);

    const life = Math.round(stepsPerParticle * rng.range(0.35, 1.2));
    for (let s = 0; s < life; s += 1) {
      const n = noise(x * scale, y * scale);
      const fieldAngle = n * Math.PI * 4;
      const angle = fieldAngle * (1 - driftStrength) + driftAngle * driftStrength;

      x += Math.cos(angle) * stepLength;
      y += Math.sin(angle) * stepLength;

      if (x < -unit * 0.2 || x > width + unit * 0.2 || y < -unit * 0.2 || y > height + unit * 0.2) break;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (p % 24 === 0) yield p / particleCount;
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // A few heavy strokes on top give the eye somewhere to land.
  const anchors = Math.round(3 + genome.weight * 9);
  for (let i = 0; i < anchors; i += 1) {
    let x = rng.range(0, width);
    let y = rng.range(0, height);
    ctx.strokeStyle = i % 3 === 0 ? palette.accent : (palette.marks[0] as string);
    ctx.globalAlpha = 0.5 + rng.next() * 0.4;
    ctx.lineWidth = lineWidth * rng.range(4, 11);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 220; s += 1) {
      const angle = noise(x * scale, y * scale) * Math.PI * 4 * (1 - driftStrength) + driftAngle * driftStrength;
      x += Math.cos(angle) * stepLength * 1.6;
      y += Math.sin(angle) * stepLength * 1.6;
      if (x < 0 || x > width || y < 0 || y > height) break;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    yield 0.9 + (i / anchors) * 0.1;
  }

  ctx.globalAlpha = 1;
};
