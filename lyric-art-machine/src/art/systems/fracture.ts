/**
 * Fracture — the picture plane broken and driven apart.
 *
 * Chosen for defiance and anger. The field is drawn once, then split along
 * hard diagonals and displaced, so every shard holds a piece of a coherent
 * image that no longer lines up.
 */

import type { RenderEnv, SystemDraw } from '../renderer';

interface Shard {
  points: [number, number][];
  depth: number;
}

/** Splits a polygon with a straight cut through a point near its centroid. */
function split(shard: Shard, angle: number, bias: number): Shard[] {
  const pts = shard.points;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  cx /= pts.length;
  cy /= pts.length;

  // Nudge the cut off-center so shards vary in size.
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const offset = bias;

  const side = (p: [number, number]): number => (p[0] - cx) * nx + (p[1] - cy) * ny - offset;

  const a: [number, number][] = [];
  const b: [number, number][] = [];

  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i] as [number, number];
    const q = pts[(i + 1) % pts.length] as [number, number];
    const sp = side(p);
    const sq = side(q);

    if (sp >= 0) a.push(p);
    else b.push(p);

    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      const intersection: [number, number] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      a.push(intersection);
      b.push(intersection);
    }
  }

  const out: Shard[] = [];
  if (a.length >= 3) out.push({ points: a, depth: shard.depth + 1 });
  if (b.length >= 3) out.push({ points: b, depth: shard.depth + 1 });
  return out.length === 2 ? out : [shard];
}

export const fracture: SystemDraw = function* (env: RenderEnv) {
  const { ctx, width, height, unit, palette, genome, rng, noise } = env;

  const bleed = unit * 0.08;
  let shards: Shard[] = [
    {
      points: [
        [-bleed, -bleed],
        [width + bleed, -bleed],
        [width + bleed, height + bleed],
        [-bleed, height + bleed],
      ],
      depth: 0,
    },
  ];

  // The dominant crack direction — one axis the whole picture answers to.
  const primaryAngle = rng.range(0, Math.PI);
  const angleSpread = 0.25 + genome.turbulence * 1.3;
  const targetShards = Math.round(12 + genome.density * 150);

  while (shards.length < targetShards) {
    // Bias splitting toward the largest shards so the result stays varied
    // instead of collapsing into uniform confetti.
    let widestIndex = 0;
    let widestArea = -1;
    const sampleCount = Math.min(shards.length, 8);
    for (let i = 0; i < sampleCount; i += 1) {
      const candidate = rng.int(0, shards.length - 1);
      const pts = (shards[candidate] as Shard).points;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [x, y] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const area = (maxX - minX) * (maxY - minY);
      if (area > widestArea) {
        widestArea = area;
        widestIndex = candidate;
      }
    }

    const target = shards[widestIndex] as Shard;
    if (target.depth > 9) break;

    const angle = primaryAngle + rng.gaussian(0, angleSpread);
    const bias = rng.gaussian(0, unit * 0.06 * (1 + genome.turbulence));
    const pieces = split(target, angle, bias);
    if (pieces.length === 2) {
      shards.splice(widestIndex, 1, ...pieces);
    } else {
      break;
    }

    if (shards.length % 12 === 0) yield (shards.length / targetShards) * 0.5;
  }

  // Draw each shard displaced along the crack axis. Displacement scales with
  // how far from center it sits, so the middle holds and the edges fly apart.
  const push = unit * (0.004 + genome.turbulence * 0.05);
  const dx = Math.cos(primaryAngle + Math.PI / 2);
  const dy = Math.sin(primaryAngle + Math.PI / 2);

  for (let i = 0; i < shards.length; i += 1) {
    const shard = shards[i] as Shard;
    let cx = 0;
    let cy = 0;
    for (const [x, y] of shard.points) {
      cx += x;
      cy += y;
    }
    cx /= shard.points.length;
    cy /= shard.points.length;

    const distance = Math.hypot(cx - width / 2, cy - height / 2) / (unit * 0.5);
    const shove = push * distance * rng.range(-1, 1.4);

    ctx.save();
    ctx.translate(dx * shove, dy * shove);

    ctx.beginPath();
    const first = shard.points[0] as [number, number];
    ctx.moveTo(first[0], first[1]);
    for (let p = 1; p < shard.points.length; p += 1) {
      const pt = shard.points[p] as [number, number];
      ctx.lineTo(pt[0], pt[1]);
    }
    ctx.closePath();

    const tone = noise(cx * 0.0022, cy * 0.0022);
    const paletteIndex = Math.min(
      palette.marks.length - 1,
      Math.floor(tone * palette.marks.length),
    );
    ctx.fillStyle = rng.next() > 0.93
      ? palette.accent
      : (palette.marks[paletteIndex] as string);
    ctx.globalAlpha = 0.3 + tone * (0.4 + genome.weight * 0.4);
    ctx.fill();

    // Every shard is outlined — the fracture lines are the subject.
    ctx.strokeStyle = palette.nocturne ? palette.veil : 'hsl(0 0% 8% / 0.75)';
    ctx.globalAlpha = 0.35 + genome.weight * 0.5;
    ctx.lineWidth = unit * (0.0004 + genome.weight * 0.0035);
    ctx.stroke();

    ctx.restore();

    if (i % 10 === 0) yield 0.5 + (i / shards.length) * 0.45;
  }

  // Impact lines — a few long slashes right across everything.
  const slashes = Math.round(2 + genome.arousal * 8);
  ctx.globalAlpha = 0.7;
  ctx.lineCap = 'square';
  for (let i = 0; i < slashes; i += 1) {
    const angle = primaryAngle + rng.gaussian(0, 0.4);
    const cx = rng.range(0, width);
    const cy = rng.range(0, height);
    const length = unit * rng.range(0.4, 1.5);
    ctx.strokeStyle = i % 2 === 0 ? palette.accent : (palette.marks[0] as string);
    ctx.lineWidth = unit * (0.0008 + genome.weight * 0.005) * rng.range(0.5, 2.5);
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(angle) * length, cy - Math.sin(angle) * length);
    ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  yield 1;
};
