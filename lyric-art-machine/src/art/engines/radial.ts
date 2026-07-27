/**
 * Radial engines — everything measured from a centre.
 */

import { arcPoints, circlePoints, push, type Point } from '../geometry';
import type { EngineDef, EngineEnv } from './types';

/** Picks a centre that is near the middle but never mechanically exact. */
function centreOf(env: EngineEnv): Point {
  const { width, height, unit, rng, genome } = env;
  return [
    width / 2 + rng.gaussian(0, unit * 0.06 * (1 + genome.turbulence)),
    height / 2 + rng.gaussian(0, unit * 0.05 * (1 + genome.turbulence)),
  ];
}

/** Rays and orbits around a luminous core. */
function* radiance(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome } = env;
  const [cx, cy] = centreOf(env);
  const maxRadius = Math.hypot(width, height) * 0.62;
  const core = unit * (0.06 + genome.gravity * 0.16);

  scene.glows.push({ x: cx, y: cy, radius: core * 3.2, tone: 0.1, accent: true, strength: 1 });

  const rays = Math.round(50 + genome.density * 320);
  for (let i = 0; i < rays; i += 1) {
    const even = (i / rays) * Math.PI * 2;
    const angle = even * genome.symmetry + rng.range(0, Math.PI * 2) * (1 - genome.symmetry);
    const inner = core * rng.range(0.7, 1.6);
    const outer = inner + maxRadius * rng.range(0.12, 1) * (0.4 + genome.arousal * 0.8);

    const points: Point[] = [];
    const segments = 12;
    for (let s = 0; s <= segments; s += 1) {
      const t = s / segments;
      const r = inner + (outer - inner) * t;
      const wobble = (noise(Math.cos(angle) * r * 0.004, Math.sin(angle) * r * 0.004) - 0.5)
        * genome.turbulence * 0.9 * t;
      const a = angle + wobble;
      points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    push(scene, points, {
      tone: rng.next(),
      weight: rng.range(0.4, 2.2) * (0.4 + genome.weight),
      alpha: 0.14 + rng.next() * 0.5,
      accent: rng.next() > 0.9,
      layer: rng.next() > 0.9 ? 1 : 0,
    });
    if (i % 24 === 0) yield (i / rays) * 0.7;
  }

  const orbits = Math.round(4 + genome.density * 22 + (genome.heard ? genome.sections * 2 : 0));
  for (let i = 0; i < orbits; i += 1) {
    const r = core * 1.5 + (maxRadius - core) * ((i + rng.range(0, 0.6)) / orbits);
    const start = rng.range(0, Math.PI * 2);
    const sweep = Math.PI * 2 * (0.25 + (1 - genome.turbulence) * rng.range(0.3, 0.75));
    push(scene, arcPoints(cx, cy, r, start, sweep), {
      tone: i / orbits,
      weight: rng.range(0.6, 2.4) * (0.4 + genome.weight),
      alpha: 0.22 + rng.next() * 0.45,
      accent: i % 5 === 0,
      layer: i % 5 === 0 ? 1 : 0,
    });
    yield 0.7 + (i / orbits) * 0.3;
  }

  // Motes caught in the light. Biased toward the centre so the halo stays the
  // subject — this is most of what gives the piece its sense of volume.
  const motes = Math.round(90 + genome.density * 700);
  for (let i = 0; i < motes; i += 1) {
    const angle = rng.range(0, Math.PI * 2);
    const r = core + Math.pow(rng.next(), 1.7) * maxRadius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    const size = unit * 0.0011 * rng.range(0.4, 3.2) * (1 + genome.weight);
    push(scene, circlePoints(x, y, size, 8), {
      closed: true,
      fill: true,
      tone: rng.next(),
      weight: 0.5,
      alpha: 0.16 + rng.next() * 0.55,
      accent: rng.next() > 0.85,
      layer: rng.next() > 0.85 ? 1 : 0,
    });
    if (i % 120 === 0) yield 0.9 + (i / motes) * 0.1;
  }
}

/** One continuous spiral, wound tight — obsession rendered as a single line. */
function* spiral(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome } = env;
  const [cx, cy] = centreOf(env);
  const maxRadius = Math.hypot(width, height) * 0.55;

  const turns = 8 + Math.round(genome.density * 60);
  const perTurn = 90;
  const total = turns * perTurn;
  const wobbleAmount = unit * genome.turbulence * 0.05;

  const points: Point[] = [];
  for (let i = 0; i <= total; i += 1) {
    const t = i / total;
    const angle = t * turns * Math.PI * 2;
    const r = maxRadius * Math.pow(t, 0.85);
    const wobble = (noise(Math.cos(angle) * r * 0.01, Math.sin(angle) * r * 0.01) - 0.5) * wobbleAmount;
    points.push([cx + Math.cos(angle) * (r + wobble), cy + Math.sin(angle) * (r + wobble)]);
    if (i % 900 === 0) yield (i / total) * 0.7;
  }

  push(scene, points, {
    tone: 0.5,
    weight: 0.8 + genome.weight * 2,
    alpha: 0.85,
    layer: 0,
  });

  // A few counter-spirals so the picture is not a single hypnotic disc.
  const counters = Math.round(genome.turbulence * 5);
  for (let c = 0; c < counters; c += 1) {
    const ccx = rng.range(width * 0.2, width * 0.8);
    const ccy = rng.range(height * 0.2, height * 0.8);
    const cTurns = 4 + rng.int(0, 10);
    const cRadius = unit * rng.range(0.08, 0.3);
    const cPoints: Point[] = [];
    for (let i = 0; i <= cTurns * 60; i += 1) {
      const t = i / (cTurns * 60);
      const angle = -t * cTurns * Math.PI * 2;
      const r = cRadius * Math.pow(t, 0.9);
      cPoints.push([ccx + Math.cos(angle) * r, ccy + Math.sin(angle) * r]);
    }
    push(scene, cPoints, {
      tone: rng.next(),
      weight: 0.6 + genome.weight,
      alpha: 0.6,
      accent: c % 2 === 0,
      layer: c % 2 === 0 ? 1 : 0,
    });
    yield 0.7 + (c / Math.max(1, counters)) * 0.3;
  }
}

/** Nested ellipses at drifting angles — a spirograph of overlapping cycles. */
function* orbits(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, scene, rng, genome } = env;
  const [cx, cy] = centreOf(env);
  const maxRadius = Math.min(width, height) * 0.46;

  const rings = Math.round(10 + genome.density * 90);
  for (let i = 0; i < rings; i += 1) {
    const t = i / rings;
    const rx = maxRadius * (0.08 + t * 0.95);
    const ry = rx * rng.range(0.25, 1);
    const tilt = t * Math.PI * (0.5 + genome.turbulence * 3) + rng.gaussian(0, 0.1);
    const segments = 80;

    const points: Point[] = [];
    for (let s = 0; s <= segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry;
      points.push([
        cx + x * Math.cos(tilt) - y * Math.sin(tilt),
        cy + x * Math.sin(tilt) + y * Math.cos(tilt),
      ]);
    }
    push(scene, points, {
      closed: true,
      tone: t,
      weight: 0.4 + genome.weight * 1.6,
      alpha: 0.22 + rng.next() * 0.4,
      accent: i % 11 === 0,
      layer: i % 11 === 0 ? 1 : 0,
    });
    if (i % 8 === 0) yield i / rings;
  }
}

/** Circle packing — cells grown until they touch. */
function* bloom(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  interface Disc {
    x: number;
    y: number;
    r: number;
  }
  const discs: Disc[] = [];
  const target = Math.round(60 + genome.density * 500);
  const maxRadius = unit * (0.04 + (1 - genome.density) * 0.12);
  let attempts = 0;

  while (discs.length < target && attempts < target * 40) {
    attempts += 1;
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    // The noise field decides where packing is dense, so the picture has
    // clearings rather than uniform froth.
    const bias = noise(x * 0.0018, y * 0.0018) * arcAt(x / width);
    if (rng.next() > bias * 1.2) continue;

    let r = maxRadius * rng.range(0.15, 1);
    for (const d of discs) {
      const gap = Math.hypot(d.x - x, d.y - y) - d.r;
      if (gap < r) r = gap;
      if (r < unit * 0.004) break;
    }
    if (r < unit * 0.004) continue;

    discs.push({ x, y, r });
    const segments = Math.max(10, Math.round(r / (unit * 0.002)));
    push(scene, circlePoints(x, y, r, Math.min(64, segments)), {
      closed: true,
      fill: rng.next() < 0.35,
      tone: bias,
      weight: 0.4 + genome.weight * 1.8,
      alpha: 0.3 + rng.next() * 0.5,
      accent: rng.next() > 0.93,
      layer: rng.next() > 0.93 ? 1 : 0,
    });

    if (discs.length % 24 === 0) yield discs.length / target;
  }
}

export const RADIAL_ENGINES: EngineDef[] = [
  {
    key: 'radiance',
    label: 'Radiance',
    description:
      'Everything organized around a single luminous centre — rays, arcs, and orbits that either resolve into a halo or burn out at the edges.',
    run: radiance,
  },
  {
    key: 'spiral',
    label: 'Spiral',
    description:
      'One continuous line wound from the centre outward. A single gesture that never lifts, circling the same point hundreds of times.',
    run: spiral,
  },
  {
    key: 'orbits',
    label: 'Orbits',
    description:
      'Nested ellipses at drifting angles, overlapping into interference. Cycles that almost, but never quite, align.',
    run: orbits,
  },
  {
    key: 'bloom',
    label: 'Bloom',
    description:
      'Circles grown outward until they touch, packing tight in some places and leaving the canvas open in others.',
    run: bloom,
  },
];
