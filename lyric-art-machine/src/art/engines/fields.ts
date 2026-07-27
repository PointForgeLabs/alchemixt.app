/**
 * Field engines — structure that comes from a force acting across the canvas
 * rather than from placed objects.
 */

import { push, type Point } from '../geometry';
import type { EngineDef, EngineEnv } from './types';

/** Particles released into a noise field, each tracing where it was carried. */
function* current(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  const count = Math.round(320 + genome.density * 1500);
  const scale = 0.0007 + genome.turbulence * 0.0022;
  const step = unit * (0.004 + genome.arousal * 0.007);
  const drift = rng.range(0, Math.PI * 2);
  const pull = 0.28 + genome.gravity * 0.5;

  for (let p = 0; p < count; p += 1) {
    let x = rng.range(-unit * 0.1, width + unit * 0.1);
    let y = rng.range(-unit * 0.1, height + unit * 0.1);
    const loudness = arcAt(x / width);
    const life = Math.round((30 + (1 - genome.turbulence) * 90) * rng.range(0.4, 1.3) * loudness);

    const points: Point[] = [[x, y]];
    for (let s = 0; s < life; s += 1) {
      const angle = noise(x * scale, y * scale) * Math.PI * 4 * (1 - pull) + drift * pull;
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      if (x < -unit * 0.2 || x > width + unit * 0.2 || y < -unit * 0.2 || y > height + unit * 0.2) break;
      points.push([x, y]);
    }

    push(scene, points, {
      tone: rng.next(),
      weight: rng.range(0.4, 1.8) * (0.4 + genome.weight),
      alpha: (0.16 + rng.next() * 0.5) * loudness,
      accent: rng.next() > 0.94,
      layer: rng.next() > 0.94 ? 1 : 0,
    });

    if (p % 24 === 0) yield p / count;
  }
}

/** Contour lines through a noise field — a landscape read as elevation. */
function* terrain(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  const levels = Math.round(8 + genome.density * 40);
  const scale = 0.0009 + genome.turbulence * 0.0016;
  const columns = Math.round(width / Math.max(4, unit * 0.006));

  // Each level is a horizontal traverse displaced by the field: cheap contours
  // that read as topography without a marching-squares pass.
  for (let level = 0; level < levels; level += 1) {
    const base = (level / levels) * height;
    const points: Point[] = [];
    for (let c = 0; c <= columns; c += 1) {
      const x = (c / columns) * width;
      const field = noise(x * scale, base * scale + level * 0.35);
      const amplitude = unit * (0.02 + genome.turbulence * 0.16) * arcAt(x / width);
      points.push([x, base + (field - 0.5) * amplitude * 2]);
    }
    push(scene, points, {
      tone: level / levels,
      weight: 0.5 + genome.weight * 1.4,
      alpha: 0.3 + rng.next() * 0.45,
      accent: level % 9 === 0,
      layer: level % 9 === 0 ? 1 : 0,
    });
    yield level / levels;
  }
}

/** Agents that steer toward their neighbours — flocking, not flowing. */
function* swarm(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome } = env;

  const agents = Math.round(60 + genome.density * 260);
  const steps = Math.round(40 + (1 - genome.turbulence) * 80);
  const step = unit * (0.004 + genome.arousal * 0.006);

  const xs = new Float64Array(agents);
  const ys = new Float64Array(agents);
  const as = new Float64Array(agents);
  // One live trail per agent, plus a pile of completed ones. Keeping these
  // separate matters: appending finished trails to an agent-indexed array
  // would silently misroute every subsequent point.
  const live: Point[][] = [];
  const finished: Point[][] = [];

  for (let i = 0; i < agents; i += 1) {
    xs[i] = rng.range(0, width);
    ys[i] = rng.range(0, height);
    as[i] = rng.range(0, Math.PI * 2);
    live.push([[xs[i] as number, ys[i] as number]]);
  }

  const cohesion = 0.02 + genome.gravity * 0.08;

  for (let s = 0; s < steps; s += 1) {
    // Flock centre, recomputed each step — crude but it produces the clumping
    // and streaming that makes this read differently from a flow field.
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < agents; i += 1) {
      cx += xs[i] as number;
      cy += ys[i] as number;
    }
    cx /= agents;
    cy /= agents;

    for (let i = 0; i < agents; i += 1) {
      const x = xs[i] as number;
      const y = ys[i] as number;
      const toCentre = Math.atan2(cy - y, cx - x);
      const field = noise(x * 0.0015, y * 0.0015) * Math.PI * 4;
      let angle = as[i] as number;
      angle += Math.sin(toCentre - angle) * cohesion;
      angle += Math.sin(field - angle) * (0.05 + genome.turbulence * 0.2);
      as[i] = angle;

      const nx = x + Math.cos(angle) * step;
      const ny = y + Math.sin(angle) * step;
      const wrappedX = nx < 0 ? width : nx > width ? 0 : nx;
      const wrappedY = ny < 0 ? height : ny > height ? 0 : ny;
      xs[i] = wrappedX;
      ys[i] = wrappedY;

      // Wrapping would otherwise draw a line straight back across the canvas,
      // so retire the trail and start a fresh one at the new edge.
      if (wrappedX !== nx || wrappedY !== ny) {
        finished.push(live[i] as Point[]);
        live[i] = [[wrappedX, wrappedY]];
      } else {
        (live[i] as Point[]).push([nx, ny]);
      }
    }
    if (s % 8 === 0) yield s / steps;
  }

  for (const trail of [...finished, ...live]) {
    push(scene, trail, {
      tone: rng.next(),
      weight: rng.range(0.5, 2) * (0.4 + genome.weight),
      alpha: 0.2 + rng.next() * 0.5,
      accent: rng.next() > 0.92,
      layer: rng.next() > 0.92 ? 1 : 0,
    });
  }
}

/** Vertical striation — rain, curtains, falling light. */
function* columns(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  const count = Math.round(40 + genome.density * 320);
  for (let i = 0; i < count; i += 1) {
    const x = rng.range(0, width);
    const loudness = arcAt(x / width);
    const top = rng.range(-height * 0.05, height * 0.7);
    const length = height * rng.range(0.12, 0.9) * loudness;
    const segments = Math.max(2, Math.round(length / (unit * 0.02)));

    const points: Point[] = [];
    for (let s = 0; s <= segments; s += 1) {
      const t = s / segments;
      const y = top + length * t;
      // Slight lateral drift so the curtain breathes instead of ruling lines.
      const sway = (noise(x * 0.004, y * 0.002) - 0.5) * unit * genome.turbulence * 0.14;
      points.push([x + sway, y]);
    }

    push(scene, points, {
      tone: rng.next(),
      weight: rng.range(0.3, 2.4) * (0.4 + genome.weight),
      alpha: (0.18 + rng.next() * 0.55) * loudness,
      accent: rng.next() > 0.93,
      layer: rng.next() > 0.93 ? 1 : 0,
    });

    if (i % 32 === 0) yield i / count;
  }
}

export const FIELD_ENGINES: EngineDef[] = [
  {
    key: 'current',
    label: 'Current',
    description:
      'Particles released into a noise field, each tracing where the song pushed it. Nothing is placed; everything is carried.',
    run: current,
  },
  {
    key: 'terrain',
    label: 'Terrain',
    description:
      'The song read as elevation — stacked contour lines that swell and settle like a landscape seen from above.',
    run: terrain,
  },
  {
    key: 'swarm',
    label: 'Swarm',
    description:
      'Agents that steer toward one another, clumping and streaming. Structure emerges from crowding rather than from a field.',
    run: swarm,
  },
  {
    key: 'columns',
    label: 'Columns',
    description:
      'Vertical striation falling the height of the picture — rain, curtains, or a downpour of light.',
    run: columns,
  },
];
