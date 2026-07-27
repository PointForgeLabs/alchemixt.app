/**
 * Growth — branching forms grown from seed points until they run out of energy.
 *
 * Chosen for nature and body imagery. Each branch inherits a share of its
 * parent's energy, so the structure thins out on its own rather than by rule.
 */

import type { RenderEnv, SystemDraw } from '../renderer';

interface Branch {
  x: number;
  y: number;
  angle: number;
  energy: number;
  thickness: number;
  generation: number;
}

export const growth: SystemDraw = function* (env: RenderEnv) {
  const { ctx, width, height, unit, palette, genome, rng, noise } = env;

  const seedCount = Math.round(2 + genome.density * 12);
  const branches: Branch[] = [];

  for (let i = 0; i < seedCount; i += 1) {
    // Seeds sit along the bottom edge or scattered, depending on how much the
    // song is anchored to a ground.
    const grounded = rng.next() < genome.gravity;
    branches.push({
      x: grounded ? rng.range(0, width) : rng.range(width * 0.1, width * 0.9),
      y: grounded ? height * rng.range(0.94, 1.02) : rng.range(height * 0.15, height * 0.9),
      angle: grounded ? -Math.PI / 2 + rng.gaussian(0, 0.3) : rng.range(0, Math.PI * 2),
      energy: unit * rng.range(0.34, 0.6) * (0.65 + genome.density * 0.6),
      thickness: unit * (0.002 + genome.weight * 0.012) * rng.range(0.7, 1.4),
      generation: 0,
    });
  }

  ctx.lineCap = 'round';
  const splitAngle = 0.28 + genome.turbulence * 0.75;
  const wander = 0.12 + genome.turbulence * 0.4;
  // Each child keeps most of its parent's reach, so a lineage travels roughly
  // 2x its seed energy before dying out — enough to cross the canvas.
  const decay = 0.68 + (1 - genome.turbulence) * 0.12;

  let processed = 0;
  const budget = Math.round(3000 + genome.density * 22000);
  const tips: [number, number, number][] = [];

  // Breadth-first via a moving read head. Depth-first would spend the entire
  // budget on one seed's deepest twigs and leave the canvas nearly empty.
  let head = 0;
  while (head < branches.length && processed < budget) {
    const branch = branches[head] as Branch;
    head += 1;
    processed += 1;

    if (branch.energy < unit * 0.008 || branch.generation > 11) {
      tips.push([branch.x, branch.y, branch.thickness]);
      continue;
    }

    const segmentLength = branch.energy * rng.range(0.4, 0.7);
    let x = branch.x;
    let y = branch.y;
    let angle = branch.angle;

    ctx.strokeStyle = branch.generation > 6 && rng.next() > 0.85
      ? palette.accent
      : (palette.marks[Math.min(palette.marks.length - 1, branch.generation % palette.marks.length)] as string);
    ctx.globalAlpha = 0.35 + rng.next() * 0.5;
    ctx.lineWidth = Math.max(0.4, branch.thickness);

    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 8;
    for (let s = 0; s < steps; s += 1) {
      // The noise field bends growth, so branches curve like living things.
      angle += (noise(x * 0.003, y * 0.003) - 0.5) * wander;
      x += Math.cos(angle) * (segmentLength / steps);
      y += Math.sin(angle) * (segmentLength / steps);
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (x < -unit * 0.1 || x > width + unit * 0.1 || y < -unit * 0.1 || y > height + unit * 0.1) {
      continue;
    }

    // Two children usually, occasionally three — the extra one is what makes
    // dense songs look overgrown rather than merely branched.
    const childCount = rng.next() < 0.12 + genome.density * 0.25 ? 3 : 2;
    for (let c = 0; c < childCount; c += 1) {
      const spread = (c - (childCount - 1) / 2) * splitAngle;
      branches.push({
        x,
        y,
        angle: angle + spread + rng.gaussian(0, 0.1),
        energy: branch.energy * decay * rng.range(0.8, 1.1),
        thickness: branch.thickness * rng.range(0.6, 0.82),
        generation: branch.generation + 1,
      });
    }

    if (processed % 60 === 0) yield Math.min(0.85, processed / budget);
  }

  // Terminal buds — where the growth stopped.
  ctx.globalCompositeOperation = palette.nocturne ? 'lighter' : 'source-over';
  for (let i = 0; i < tips.length; i += 1) {
    const tip = tips[i] as [number, number, number];
    const size = Math.max(0.6, tip[2] * rng.range(1.2, 3.6));
    ctx.fillStyle = rng.next() > 0.8 ? palette.accent : (palette.marks[palette.marks.length - 1] as string);
    ctx.globalAlpha = 0.3 + rng.next() * 0.5;
    ctx.beginPath();
    ctx.arc(tip[0], tip[1], size, 0, Math.PI * 2);
    ctx.fill();
    if (i % 120 === 0) yield 0.85 + (i / Math.max(1, tips.length)) * 0.15;
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
};
