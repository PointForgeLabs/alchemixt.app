/**
 * Broken engines — structure defined by where it gives way.
 */

import { boundsOf, centroid, push, rectPoints, type Point } from '../geometry';
import type { EngineDef, EngineEnv } from './types';

interface Shard {
  points: Point[];
  depth: number;
}

/** Cuts a polygon with a straight line offset from its centroid. */
function splitShard(shard: Shard, angle: number, bias: number): Shard[] {
  const pts = shard.points;
  const [cx, cy] = centroid(pts);
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const side = (p: Point): number => (p[0] - cx) * nx + (p[1] - cy) * ny - bias;

  const a: Point[] = [];
  const b: Point[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i] as Point;
    const q = pts[(i + 1) % pts.length] as Point;
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) a.push(p);
    else b.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      const crossing: Point = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      a.push(crossing);
      b.push(crossing);
    }
  }

  if (a.length >= 3 && b.length >= 3) {
    return [
      { points: a, depth: shard.depth + 1 },
      { points: b, depth: shard.depth + 1 },
    ];
  }
  return [shard];
}

/** The plane split into shards and driven apart along a dominant axis. */
function* fracture(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome } = env;

  const bleed = unit * 0.08;
  const shards: Shard[] = [
    { points: rectPoints(-bleed, -bleed, width + bleed * 2, height + bleed * 2), depth: 0 },
  ];

  const primaryAngle = rng.range(0, Math.PI);
  const spread = 0.25 + genome.turbulence * 1.3;
  const target = Math.round(12 + genome.density * 150);

  while (shards.length < target) {
    // Bias toward splitting the largest shards, so the result stays varied
    // instead of collapsing into uniform confetti.
    let widestIndex = 0;
    let widestArea = -1;
    for (let i = 0; i < Math.min(shards.length, 8); i += 1) {
      const candidate = rng.int(0, shards.length - 1);
      const b = boundsOf((shards[candidate] as Shard).points);
      const area = (b.maxX - b.minX) * (b.maxY - b.minY);
      if (area > widestArea) {
        widestArea = area;
        widestIndex = candidate;
      }
    }

    const targetShard = shards[widestIndex] as Shard;
    if (targetShard.depth > 9) break;

    const pieces = splitShard(
      targetShard,
      primaryAngle + rng.gaussian(0, spread),
      rng.gaussian(0, unit * 0.06 * (1 + genome.turbulence)),
    );
    if (pieces.length !== 2) break;
    shards.splice(widestIndex, 1, ...pieces);
    if (shards.length % 12 === 0) yield (shards.length / target) * 0.55;
  }

  // Displace each shard along the crack axis, more the further out it sits.
  const shove = unit * (0.004 + genome.turbulence * 0.05);
  const dx = Math.cos(primaryAngle + Math.PI / 2);
  const dy = Math.sin(primaryAngle + Math.PI / 2);

  for (let i = 0; i < shards.length; i += 1) {
    const shard = shards[i] as Shard;
    const [cx, cy] = centroid(shard.points);
    const distance = Math.hypot(cx - width / 2, cy - height / 2) / (unit * 0.5);
    const push_ = shove * distance * rng.range(-1, 1.4);
    const moved = shard.points.map(([x, y]) => [x + dx * push_, y + dy * push_] as Point);
    const tone = noise(cx * 0.0022, cy * 0.0022);

    push(scene, moved, {
      closed: true,
      fill: true,
      tone,
      weight: 0.4 + genome.weight * 2,
      alpha: 0.32 + tone * (0.4 + genome.weight * 0.4),
      accent: rng.next() > 0.93,
      layer: rng.next() > 0.93 ? 1 : 0,
    });
    if (i % 10 === 0) yield 0.55 + (i / shards.length) * 0.45;
  }
}

/** Radial cracks propagating from impact points, like struck glass. */
function* shatter(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome } = env;

  const impacts = 1 + Math.round(genome.turbulence * 4);
  for (let k = 0; k < impacts; k += 1) {
    const ix = rng.range(width * 0.2, width * 0.8);
    const iy = rng.range(height * 0.2, height * 0.8);
    const radials = Math.round(10 + genome.density * 60);

    // Radial cracks, each wandering and occasionally forking.
    const angles: number[] = [];
    for (let i = 0; i < radials; i += 1) {
      const angle = (i / radials) * Math.PI * 2 + rng.gaussian(0, 0.12);
      angles.push(angle);
      const reach = unit * rng.range(0.15, 0.85);
      const steps = 18;
      const points: Point[] = [[ix, iy]];
      let a = angle;
      let x = ix;
      let y = iy;
      for (let s = 0; s < steps; s += 1) {
        a += (noise(x * 0.004, y * 0.004) - 0.5) * genome.turbulence * 0.5;
        x += Math.cos(a) * (reach / steps);
        y += Math.sin(a) * (reach / steps);
        points.push([x, y]);
      }
      push(scene, points, {
        tone: rng.next(),
        weight: 0.6 + genome.weight * 2.4,
        alpha: 0.35 + rng.next() * 0.5,
        accent: rng.next() > 0.9,
        layer: 0,
      });
    }

    // Concentric cracks joining neighbouring radials.
    const rings = Math.round(3 + genome.density * 14);
    for (let r = 0; r < rings; r += 1) {
      const radius = unit * (0.04 + (r / rings) * 0.7) * rng.range(0.85, 1.15);
      const points: Point[] = [];
      for (const angle of angles) {
        const jitter = radius * rng.range(0.9, 1.12);
        points.push([ix + Math.cos(angle) * jitter, iy + Math.sin(angle) * jitter]);
      }
      push(scene, points, {
        closed: true,
        tone: r / rings,
        weight: 0.5 + genome.weight * 1.6,
        alpha: 0.3 + rng.next() * 0.35,
        accent: r % 4 === 0,
        layer: 1,
      });
    }
    yield (k + 1) / impacts;
  }
}

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}

/** A rigid grid, subdivided unevenly and broken in places. */
function* lattice(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome } = env;

  const margin = unit * 0.04;
  const maxDepth = Math.round(3 + genome.density * 5);
  const cells: Cell[] = [];
  const queue: Cell[] = [
    { x: margin, y: margin, w: width - margin * 2, h: height - margin * 2, depth: 0 },
  ];

  while (queue.length > 0) {
    const cell = queue.pop() as Cell;
    const field = noise(cell.x * 0.0016, cell.y * 0.0016);
    const shouldSplit =
      cell.depth < maxDepth
      && cell.w > unit * 0.03
      && cell.h > unit * 0.03
      && rng.next() < 0.42 + field * 0.5;

    if (!shouldSplit) {
      cells.push(cell);
      continue;
    }

    const vertical = cell.w > cell.h ? true : cell.h > cell.w ? false : rng.bool();
    const ratio = Math.max(0.18, Math.min(0.82, 0.5 + rng.gaussian(0, 0.16 * (1 - genome.symmetry * 0.7))));
    if (vertical) {
      const w1 = cell.w * ratio;
      queue.push({ x: cell.x, y: cell.y, w: w1, h: cell.h, depth: cell.depth + 1 });
      queue.push({ x: cell.x + w1, y: cell.y, w: cell.w - w1, h: cell.h, depth: cell.depth + 1 });
    } else {
      const h1 = cell.h * ratio;
      queue.push({ x: cell.x, y: cell.y, w: cell.w, h: h1, depth: cell.depth + 1 });
      queue.push({ x: cell.x, y: cell.y + h1, w: cell.w, h: cell.h - h1, depth: cell.depth + 1 });
    }
  }
  yield 0.25;

  const gutter = unit * 0.002 * (1 + genome.weight);
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i] as Cell;
    const field = noise(cell.x * 0.003 + 40, cell.y * 0.003 + 40);
    const broken = rng.next() < genome.turbulence * 0.16;
    const offset = broken ? unit * 0.02 * genome.turbulence : 0;

    const x = cell.x + gutter + (broken ? rng.range(-offset, offset) : 0);
    const y = cell.y + gutter + (broken ? rng.range(-offset, offset) : 0);
    const w = Math.max(1, cell.w - gutter * 2);
    const h = Math.max(1, cell.h - gutter * 2);

    push(scene, rectPoints(x, y, w, h), {
      closed: true,
      // Roughly a third of cells are solid; the rest read as outline.
      fill: rng.next() < 0.38,
      tone: field,
      weight: 0.4 + genome.weight * 2,
      alpha: 0.25 + field * (0.4 + genome.weight * 0.4),
      accent: broken || rng.next() > 0.94,
      layer: broken ? 1 : 0,
    });
    if (i % 14 === 0) yield 0.25 + (i / cells.length) * 0.6;
  }

  // Circuit runs threaded over the grid.
  const runs = Math.round(3 + genome.density * 16);
  for (let i = 0; i < runs; i += 1) {
    let px = rng.range(0, width);
    let py = rng.range(0, height);
    const points: Point[] = [[px, py]];
    const legs = rng.int(3, 9);
    for (let l = 0; l < legs; l += 1) {
      const length = unit * rng.range(0.04, 0.3);
      if (l % 2 === 0) px += rng.bool() ? length : -length;
      else py += rng.bool() ? length : -length;
      points.push([px, py]);
    }
    push(scene, points, {
      tone: 0.85,
      weight: 0.6 + genome.weight * 2.4,
      alpha: 0.35 + rng.next() * 0.45,
      accent: i % 4 === 0,
      layer: 1,
    });
    yield 0.85 + (i / runs) * 0.15;
  }
}

export const BROKEN_ENGINES: EngineDef[] = [
  {
    key: 'fracture',
    label: 'Fracture',
    description:
      'The picture plane broken into shards and driven apart along hard diagonals. Each fragment keeps a piece of the original field.',
    run: fracture,
  },
  {
    key: 'shatter',
    label: 'Shatter',
    description:
      'Cracks running outward from points of impact, joined by concentric rings. Struck glass rather than shifted plates.',
    run: shatter,
  },
  {
    key: 'lattice',
    label: 'Lattice',
    description:
      'A rigid grid imposed on the canvas, then made to carry something it was not built for. The structure holds, but not evenly.',
    run: lattice,
  },
];
