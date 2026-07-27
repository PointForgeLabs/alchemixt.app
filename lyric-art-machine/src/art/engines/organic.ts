/**
 * Organic engines — structure that grows, scatters, or accumulates.
 */

import { circlePoints, push, type Point } from '../geometry';
import type { EngineDef, EngineEnv } from './types';

interface Branch {
  x: number;
  y: number;
  angle: number;
  energy: number;
  thickness: number;
  generation: number;
}

/** Branching forms grown from seeds until they run out of energy. */
function* growth(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome } = env;

  const seeds = Math.round(2 + genome.density * 12);
  const branches: Branch[] = [];
  for (let i = 0; i < seeds; i += 1) {
    const grounded = rng.next() < genome.gravity;
    branches.push({
      x: grounded ? rng.range(0, width) : rng.range(width * 0.1, width * 0.9),
      y: grounded ? height * rng.range(0.94, 1.02) : rng.range(height * 0.15, height * 0.9),
      angle: grounded ? -Math.PI / 2 + rng.gaussian(0, 0.3) : rng.range(0, Math.PI * 2),
      energy: unit * rng.range(0.34, 0.6) * (0.65 + genome.density * 0.6),
      thickness: 0.6 + genome.weight * 3 * rng.range(0.7, 1.4),
      generation: 0,
    });
  }

  const splitAngle = 0.28 + genome.turbulence * 0.75;
  const wander = 0.12 + genome.turbulence * 0.4;
  const decay = 0.68 + (1 - genome.turbulence) * 0.12;
  const budget = Math.round(1200 + genome.density * 9000);
  const tips: Point[] = [];

  // Breadth-first: depth-first would spend the whole budget on one seed's
  // deepest twigs and leave the rest of the canvas empty.
  let head = 0;
  let processed = 0;
  while (head < branches.length && processed < budget) {
    const branch = branches[head] as Branch;
    head += 1;
    processed += 1;

    if (branch.energy < unit * 0.008 || branch.generation > 11) {
      tips.push([branch.x, branch.y]);
      continue;
    }

    const length = branch.energy * rng.range(0.4, 0.7);
    let x = branch.x;
    let y = branch.y;
    let angle = branch.angle;
    const points: Point[] = [[x, y]];
    for (let s = 0; s < 6; s += 1) {
      angle += (noise(x * 0.003, y * 0.003) - 0.5) * wander;
      x += Math.cos(angle) * (length / 6);
      y += Math.sin(angle) * (length / 6);
      points.push([x, y]);
    }

    push(scene, points, {
      tone: Math.min(1, branch.generation / 10),
      weight: branch.thickness,
      alpha: 0.4 + rng.next() * 0.45,
      accent: branch.generation > 6 && rng.next() > 0.85,
      layer: branch.generation > 6 ? 1 : 0,
    });

    if (x < -unit * 0.1 || x > width + unit * 0.1 || y < -unit * 0.1 || y > height + unit * 0.1) {
      continue;
    }

    const children = rng.next() < 0.12 + genome.density * 0.25 ? 3 : 2;
    for (let c = 0; c < children; c += 1) {
      branches.push({
        x,
        y,
        angle: angle + (c - (children - 1) / 2) * splitAngle + rng.gaussian(0, 0.1),
        energy: branch.energy * decay * rng.range(0.8, 1.1),
        thickness: branch.thickness * rng.range(0.62, 0.82),
        generation: branch.generation + 1,
      });
    }

    if (processed % 90 === 0) yield Math.min(0.9, processed / budget);
  }

  for (let i = 0; i < tips.length; i += 1) {
    const tip = tips[i] as Point;
    push(scene, circlePoints(tip[0], tip[1], unit * 0.002 * rng.range(0.6, 2.6), 12), {
      closed: true,
      fill: true,
      tone: 0.9,
      weight: 0.5,
      alpha: 0.35 + rng.next() * 0.45,
      accent: rng.next() > 0.8,
      layer: 1,
    });
    if (i % 200 === 0) yield 0.9 + (i / Math.max(1, tips.length)) * 0.1;
  }
}

/** Points of light on a dark ground, with lines between the ones that belong. */
function* constellation(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  const clouds = Math.round(5 + genome.density * 16);
  for (let i = 0; i < clouds; i += 1) {
    scene.glows.push({
      x: rng.range(0, width),
      y: rng.range(0, height),
      radius: unit * rng.range(0.1, 0.55),
      tone: rng.next(),
      accent: false,
      strength: 0.14 + rng.next() * 0.2,
    });
  }
  yield 0.1;

  interface Star {
    x: number;
    y: number;
    size: number;
    brightness: number;
  }
  const stars: Star[] = [];
  const target = Math.round(120 + genome.density * 700);
  let attempts = 0;
  while (stars.length < target && attempts < target * 6) {
    attempts += 1;
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    const bias = noise(x * 0.0018, y * 0.0018) * arcAt(x / width);
    if (rng.next() > bias * (0.5 + genome.density)) continue;
    stars.push({
      x,
      y,
      size: unit * 0.0012 * rng.range(0.4, 3.6) * (1 + genome.weight),
      brightness: rng.next(),
    });
  }
  yield 0.35;

  // Links between near neighbours — the eye insists on joining these up.
  const linkRadius = unit * (0.05 + genome.gravity * 0.1 + genome.turbulence * 0.04);
  for (let i = 0; i < stars.length; i += 1) {
    const a = stars[i] as Star;
    if (a.brightness < 0.55) continue;
    for (let j = i + 1; j < stars.length; j += 1) {
      const b = stars[j] as Star;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > linkRadius || rng.next() > 0.22) continue;
      push(scene, [[a.x, a.y], [b.x, b.y]], {
        tone: 0.2,
        weight: 0.35 + genome.weight * 0.8,
        alpha: (1 - d / linkRadius) * 0.4,
        layer: 0,
      });
    }
    if (i % 60 === 0) yield 0.35 + (i / stars.length) * 0.35;
  }

  for (let i = 0; i < stars.length; i += 1) {
    const star = stars[i] as Star;
    const bright = star.brightness > 0.93;
    push(scene, circlePoints(star.x, star.y, star.size, bright ? 16 : 10), {
      closed: true,
      fill: true,
      tone: star.brightness,
      weight: 0.5,
      alpha: 0.35 + star.brightness * 0.6,
      accent: bright,
      layer: bright ? 1 : 0,
    });

    if (bright) {
      scene.glows.push({
        x: star.x,
        y: star.y,
        radius: star.size * 14,
        tone: 0.1,
        accent: true,
        strength: 0.3,
      });
      const flare = star.size * rng.range(6, 16);
      push(scene, [[star.x - flare, star.y], [star.x + flare, star.y]], {
        tone: 0.95, weight: 0.5 + genome.weight, alpha: 0.5, accent: true, layer: 1,
      });
      push(scene, [[star.x, star.y - flare], [star.x, star.y + flare]], {
        tone: 0.95, weight: 0.5 + genome.weight, alpha: 0.5, accent: true, layer: 1,
      });
    }
    if (i % 120 === 0) yield 0.7 + (i / stars.length) * 0.3;
  }
}

/** Marks scattered by density alone — no structure, only accumulation. */
function* drift(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  const count = Math.round(300 + genome.density * 2600);
  const length = unit * (0.006 + genome.arousal * 0.05);

  for (let i = 0; i < count; i += 1) {
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    const bias = noise(x * 0.0022, y * 0.0022) * arcAt(x / width);
    if (rng.next() > bias * 1.3) continue;

    // Each mark is a short stroke aligned to the field — a drawn texture
    // rather than a drawn object.
    const angle = noise(x * 0.001 + 9, y * 0.001 + 9) * Math.PI * 4;
    const len = length * rng.range(0.3, 1.6);
    push(
      scene,
      [
        [x - Math.cos(angle) * len * 0.5, y - Math.sin(angle) * len * 0.5],
        [x + Math.cos(angle) * len * 0.5, y + Math.sin(angle) * len * 0.5],
      ],
      {
        tone: bias,
        weight: rng.range(0.3, 2.2) * (0.4 + genome.weight),
        alpha: 0.25 + rng.next() * 0.5,
        accent: rng.next() > 0.95,
        layer: rng.next() > 0.95 ? 1 : 0,
      },
    );
    if (i % 96 === 0) yield i / count;
  }
}

export const ORGANIC_ENGINES: EngineDef[] = [
  {
    key: 'growth',
    label: 'Growth',
    description:
      'Branching forms grown from seed points, splitting and thinning until they run out of energy.',
    run: growth,
  },
  {
    key: 'constellation',
    label: 'Constellation',
    description:
      'Points of light scattered across a dark ground, with faint lines drawn between the ones that belong together.',
    run: constellation,
  },
  {
    key: 'drift',
    label: 'Drift',
    description:
      'Thousands of short strokes aligned to a hidden field. No objects, no centre — only accumulated texture.',
    run: drift,
  },
];
