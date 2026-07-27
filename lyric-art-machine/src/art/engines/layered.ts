/**
 * Layered engines — structure built by stacking, interleaving, or overlaying.
 */

import { push, type Point } from '../geometry';
import type { EngineDef, EngineEnv } from './types';

/** Horizontal bands, like sediment or a stack of exposures. */
function* strata(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  const bandCount = Math.round(14 + genome.density * 70);
  const roughness = unit * (0.004 + genome.turbulence * 0.05);
  const scale = 0.0016 + genome.turbulence * 0.004;
  const segments = Math.max(24, Math.round(width / 12));

  let y = height * rng.range(1.02, 1.12);
  let index = 0;

  while (y > -height * 0.1 && index < bandCount * 2) {
    // With audio, the stack reads bottom-up as the track plays.
    const loudness = arcAt(1 - y / height);
    const thickness = (height / bandCount) * rng.range(0.35, 1.75)
      * (1 - genome.gravity * 0.25) * loudness;
    const top = y - thickness;

    const upper: Point[] = [];
    for (let s = 0; s <= segments; s += 1) {
      const x = (s / segments) * width;
      const displacement = (noise(x * scale, top * scale + index * 0.7) - 0.5) * roughness * 2;
      upper.push([x, top + displacement]);
    }

    // Closed region: the painter fills it, the plotter hatches it.
    push(scene, [[-roughness, y], ...upper, [width + roughness, y]], {
      closed: true,
      fill: true,
      tone: (index % 7) / 7,
      weight: 0.5 + genome.weight,
      alpha: (0.22 + rng.next() * (0.35 + genome.weight * 0.4)) * loudness,
      accent: index % 7 === 0,
      layer: index % 7 === 0 ? 1 : 0,
    });

    y = top - thickness * rng.range(0.02, 0.3);
    index += 1;
    yield Math.min(0.85, index / bandCount);
  }

  // Vertical faults cutting the whole stack.
  const faults = Math.round(genome.turbulence * 9);
  for (let f = 0; f < faults; f += 1) {
    const fx = rng.range(width * 0.08, width * 0.92);
    const points: Point[] = [];
    let px = fx;
    for (let s = 0; s <= 60; s += 1) {
      const py = (s / 60) * height;
      px += (noise(fx * 0.01, py * scale * 3) - 0.5) * roughness * 0.9;
      points.push([px, py]);
    }
    push(scene, points, {
      tone: 0.9,
      weight: 1 + genome.weight * 3,
      alpha: 0.3 + rng.next() * 0.4,
      accent: f % 2 === 0,
      layer: 1,
    });
    yield 0.85 + (f / Math.max(1, faults)) * 0.15;
  }
}

/** Warp and weft — two sets of lines interleaved into cloth. */
function* weave(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  // The floor matters: a mesh finer than this greys out into flat tone instead
  // of reading as cloth.
  const spacing = Math.max(unit * 0.016, unit * (0.05 - genome.density * 0.03));
  const amplitude = unit * (0.004 + genome.turbulence * 0.03);

  // Warp: vertical threads.
  let index = 0;
  for (let x = spacing * 0.5; x < width; x += spacing) {
    const points: Point[] = [];
    const steps = Math.max(8, Math.round(height / (unit * 0.02)));
    for (let s = 0; s <= steps; s += 1) {
      const y = (s / steps) * height;
      const over = Math.sin((y / spacing) * Math.PI) * amplitude;
      const drift = (noise(x * 0.003, y * 0.003) - 0.5) * amplitude * 2;
      points.push([x + over + drift, y]);
    }
    push(scene, points, {
      tone: (index % 5) / 5,
      weight: 0.7 + genome.weight * 2.2,
      alpha: 0.5 + rng.next() * 0.45,
      accent: index % 13 === 0,
      layer: 0,
    });
    index += 1;
    if (index % 12 === 0) yield (x / width) * 0.5;
  }

  // Weft: horizontal threads, thinned where the track is quiet.
  index = 0;
  for (let y = spacing * 0.5; y < height; y += spacing) {
    const loudness = arcAt(1 - y / height);
    if (rng.next() > loudness) {
      index += 1;
      continue;
    }
    const points: Point[] = [];
    const steps = Math.max(8, Math.round(width / (unit * 0.02)));
    for (let s = 0; s <= steps; s += 1) {
      const x = (s / steps) * width;
      const over = Math.sin((x / spacing) * Math.PI + Math.PI / 2) * amplitude;
      const drift = (noise(x * 0.003, y * 0.003 + 17) - 0.5) * amplitude * 2;
      points.push([x, y + over + drift]);
    }
    push(scene, points, {
      tone: (index % 5) / 5,
      weight: 0.7 + genome.weight * 2.2,
      alpha: (0.5 + rng.next() * 0.45) * loudness,
      accent: index % 13 === 0,
      layer: 1,
    });
    index += 1;
    if (index % 12 === 0) yield 0.5 + (y / height) * 0.5;
  }
}

/** Two rotated line grids, overlaid until they interfere. */
function* moire(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, genome } = env;

  const diagonal = Math.hypot(width, height);
  const layerCount = 2 + Math.round(genome.turbulence * 1.5);

  for (let layer = 0; layer < layerCount; layer += 1) {
    // Nearly-equal angles are what produce the interference; identical ones
    // would just look like one grid.
    const angle = (layer / layerCount) * Math.PI + rng.gaussian(0, 0.06);
    const spacing = Math.max(unit * 0.012, unit * (0.045 - genome.density * 0.03))
      * (1 + layer * 0.04);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const cx = width / 2 + rng.gaussian(0, unit * 0.03);
    const cy = height / 2 + rng.gaussian(0, unit * 0.03);

    let index = 0;
    for (let offset = -diagonal / 2; offset < diagonal / 2; offset += spacing) {
      const nx = -sin * offset;
      const ny = cos * offset;
      push(
        scene,
        [
          [cx + nx - cos * diagonal, cy + ny - sin * diagonal],
          [cx + nx + cos * diagonal, cy + ny + sin * diagonal],
        ],
        {
          tone: layer / layerCount,
          weight: 0.7 + genome.weight * 1.9,
          alpha: 0.5 + rng.next() * 0.35,
          accent: layer === layerCount - 1 && index % 17 === 0,
          layer,
        },
      );
      index += 1;
    }
    yield (layer + 1) / layerCount;
  }
}

export const LAYERED_ENGINES: EngineDef[] = [
  {
    key: 'strata',
    label: 'Strata',
    description:
      'The image laid down in horizontal bands, like sediment or a stack of exposures. Older layers show through the newer ones.',
    run: strata,
  },
  {
    key: 'weave',
    label: 'Weave',
    description:
      'Warp and weft crossing over and under each other. The picture is a cloth, and its density is the tightness of the thread.',
    run: weave,
  },
  {
    key: 'moire',
    label: 'Moiré',
    description:
      'Line grids laid over one another at almost the same angle, until the interference between them becomes the subject.',
    run: moire,
  },
];
