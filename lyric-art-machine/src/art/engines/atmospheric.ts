/**
 * Atmospheric engines — light in a volume.
 *
 * These lean on the scene's glow list and on many overlapping low-alpha marks,
 * which under a luminous treatment accumulate into depth rather than stacking
 * flat. Each has a subject: a centre, a horizon, a curtain. That is what
 * separates them from the field engines, which make texture everywhere and a
 * picture of nothing in particular.
 */

import { arcPoints, circlePoints, push, type Point } from '../geometry';
import type { EngineDef, EngineEnv } from './types';

/** Hanging curtains of light, drifting and folding. */
function* aurora(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  const curtains = Math.round(3 + genome.density * 7);

  for (let c = 0; c < curtains; c += 1) {
    const originX = rng.range(-width * 0.1, width * 1.1);
    const baseY = height * rng.range(-0.05, 0.35);
    const drop = height * rng.range(0.4, 0.95);
    const spread = unit * rng.range(0.08, 0.3);
    const strands = Math.round(40 + genome.density * 160);
    const tone = rng.next();

    // A soft mass behind each curtain so the light has somewhere to sit.
    for (let g = 0; g < 4; g += 1) {
      scene.glows.push({
        x: originX + rng.gaussian(0, spread * 0.7),
        y: baseY + drop * rng.range(0.15, 0.8),
        radius: spread * rng.range(1.4, 3),
        tone,
        accent: rng.next() > 0.8,
        strength: 0.035 + rng.next() * 0.075,
      });
    }

    for (let s = 0; s < strands; s += 1) {
      // Strands cluster toward the curtain's spine rather than spreading evenly.
      const offset = rng.gaussian(0, spread * 0.55);
      const x0 = originX + offset;
      const loudness = arcAt(x0 / width);

      // Every strand must begin at its own height. Sharing one baseY puts a
      // hundred strands on a single line, and the curtain acquires a razor
      // straight top edge — which, where two curtains overlap, reads as a
      // rectangle of raised brightness rather than as light.
      const startY = baseY + drop * rng.range(-0.08, 0.42);
      const length = drop * rng.range(0.35, 1) * loudness;
      const steps = Math.max(6, Math.round(length / (unit * 0.02)));

      const points: Point[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const y = startY + length * t;
        // The fold: a slow lateral wave that deepens down the curtain.
        const fold = Math.sin(t * Math.PI * 1.6 + c * 1.3) * spread * 0.5 * t;
        const drift = (noise(x0 * 0.002 + c, y * 0.0016) - 0.5) * unit * 0.09 * genome.turbulence;
        points.push([x0 + fold + drift, y]);
      }

      // Fade with distance from the spine, so the curtain has no vertical edge
      // either — its sides dissolve instead of stopping.
      const falloff = Math.exp(-Math.pow(offset / (spread * 0.85), 2));

      push(scene, points, {
        tone: Math.min(1, tone + rng.range(-0.15, 0.15)),
        weight: rng.range(0.3, 2.2) * (0.4 + genome.weight),
        // Low alpha is deliberate: the light comes from accumulation.
        alpha: (0.05 + rng.next() * 0.2) * loudness * falloff,
        accent: rng.next() > 0.93,
        layer: rng.next() > 0.93 ? 1 : 0,
      });
    }
    yield (c + 1) / curtains;
  }
}

/** Volumetric clouds with stars caught inside them. */
function* nebula(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  // Cloud masses, clustered around a few centres so the picture has weather
  // rather than uniform fog.
  const cores = 2 + Math.round(genome.gravity * 4);
  const centres: Point[] = [];
  for (let i = 0; i < cores; i += 1) {
    centres.push([rng.range(width * 0.15, width * 0.85), rng.range(height * 0.15, height * 0.85)]);
  }

  const puffs = Math.round(24 + genome.density * 90);
  for (let i = 0; i < puffs; i += 1) {
    const centre = centres[rng.int(0, centres.length - 1)] as Point;
    const spreadRadius = unit * rng.range(0.05, 0.4);
    scene.glows.push({
      x: centre[0] + rng.gaussian(0, unit * 0.16),
      y: centre[1] + rng.gaussian(0, unit * 0.16),
      radius: spreadRadius,
      tone: rng.next(),
      accent: rng.next() > 0.88,
      strength: 0.04 + rng.next() * 0.12,
    });
    if (i % 20 === 0) yield (i / puffs) * 0.3;
  }

  // Filaments threading the cloud — structure inside the softness.
  const filaments = Math.round(30 + genome.density * 200);
  for (let i = 0; i < filaments; i += 1) {
    const centre = centres[rng.int(0, centres.length - 1)] as Point;
    let x = centre[0] + rng.gaussian(0, unit * 0.22);
    let y = centre[1] + rng.gaussian(0, unit * 0.22);
    const steps = Math.round(12 + rng.next() * 40);
    const step = unit * 0.008;
    const points: Point[] = [[x, y]];
    for (let s = 0; s < steps; s += 1) {
      const angle = noise(x * 0.0016, y * 0.0016) * Math.PI * 4;
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      points.push([x, y]);
    }
    push(scene, points, {
      tone: rng.next(),
      weight: rng.range(0.3, 1.6) * (0.4 + genome.weight),
      alpha: 0.06 + rng.next() * 0.22,
      accent: rng.next() > 0.94,
      layer: 0,
    });
    if (i % 40 === 0) yield 0.3 + (i / filaments) * 0.35;
  }

  // Stars, brightest where the cloud is thickest.
  const stars = Math.round(120 + genome.density * 600);
  for (let i = 0; i < stars; i += 1) {
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    const bias = noise(x * 0.002, y * 0.002) * arcAt(x / width);
    if (rng.next() > bias * 1.2) continue;

    const brightness = rng.next();
    const size = unit * 0.0011 * rng.range(0.4, 3) * (1 + genome.weight);
    push(scene, circlePoints(x, y, size, 10), {
      closed: true,
      fill: true,
      tone: brightness,
      weight: 0.5,
      alpha: 0.3 + brightness * 0.6,
      accent: brightness > 0.94,
      layer: brightness > 0.94 ? 1 : 0,
    });
    if (brightness > 0.94) {
      scene.glows.push({
        x, y, radius: size * 16, tone: 0.1, accent: true, strength: 0.3,
      });
    }
    if (i % 120 === 0) yield 0.65 + (i / stars) * 0.35;
  }
}

/** A rose window — n-fold symmetry around a lit centre. */
function* rose(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome } = env;

  const cx = width / 2 + rng.gaussian(0, unit * 0.02);
  const cy = height / 2 + rng.gaussian(0, unit * 0.02);
  const outer = Math.min(width, height) * 0.46;

  // Petal count is the picture's whole character, so it is quantized to
  // something that reads as designed rather than arbitrary.
  const petals = [6, 8, 10, 12, 16, 20][Math.floor(genome.symmetry * 5.99)] ?? 12;

  scene.glows.push({
    x: cx, y: cy, radius: outer * 0.45, tone: 0.1, accent: true, strength: 0.85,
  });

  const rings = Math.round(3 + genome.density * 7);
  for (let ring = 0; ring < rings; ring += 1) {
    const t = (ring + 1) / rings;
    const inner = outer * (t - 1 / rings) * 0.95;
    const edge = outer * t;
    const count = petals * (ring % 2 === 0 ? 1 : 2);

    for (let p = 0; p < count; p += 1) {
      const angle = (p / count) * Math.PI * 2 + ring * 0.12;
      const halfWidth = (Math.PI / count) * rng.range(0.55, 0.92);

      // Each petal is a closed lens shape built from two arcs.
      const points: Point[] = [
        ...arcPoints(cx, cy, Math.max(inner, outer * 0.06), angle - halfWidth, halfWidth * 2, 12),
        ...arcPoints(cx, cy, edge, angle + halfWidth, -halfWidth * 2, 12),
      ];
      push(scene, points, {
        closed: true,
        fill: rng.next() < 0.45,
        tone: (ring / rings + rng.range(-0.1, 0.1) + 1) % 1,
        weight: 0.6 + genome.weight * 2,
        alpha: 0.25 + rng.next() * 0.45,
        accent: p % Math.max(2, Math.round(count / 4)) === 0,
        layer: p % Math.max(2, Math.round(count / 4)) === 0 ? 1 : 0,
      });
    }

    // Ring boundary.
    push(scene, circlePoints(cx, cy, edge, 96), {
      closed: true,
      tone: 0.85,
      weight: 0.8 + genome.weight * 2.4,
      alpha: 0.5,
      accent: ring === rings - 1,
      layer: 1,
    });
    yield 0.15 + (ring / rings) * 0.7;
  }

  // Tracery spokes, wandering slightly so the window looks made rather than plotted.
  for (let p = 0; p < petals * 2; p += 1) {
    const angle = (p / (petals * 2)) * Math.PI * 2;
    const points: Point[] = [];
    for (let s = 0; s <= 20; s += 1) {
      const r = outer * 0.06 + (outer * 0.98 - outer * 0.06) * (s / 20);
      const wobble = (noise(Math.cos(angle) * r * 0.01, Math.sin(angle) * r * 0.01) - 0.5)
        * genome.turbulence * 0.25;
      points.push([cx + Math.cos(angle + wobble) * r, cy + Math.sin(angle + wobble) * r]);
    }
    push(scene, points, {
      tone: 0.7,
      weight: 0.6 + genome.weight * 1.8,
      alpha: 0.35 + rng.next() * 0.35,
      accent: p % 4 === 0,
      layer: 0,
    });
  }
  yield 1;
}

/** Receding bands of haze — depth by atmosphere alone. */
function* veil(env: EngineEnv): Generator<number, void, unknown> {
  const { width, height, unit, scene, rng, noise, genome, arcAt } = env;

  const horizon = height * rng.range(0.38, 0.66);

  // The light sits on the horizon, which is what makes the recession read.
  for (let g = 0; g < 5; g += 1) {
    scene.glows.push({
      x: width * rng.range(0.3, 0.7),
      y: horizon + rng.gaussian(0, unit * 0.03),
      radius: unit * rng.range(0.25, 0.7),
      tone: 0.15,
      accent: g === 0,
      strength: 0.1 + rng.next() * 0.18,
    });
  }

  const bands = Math.round(10 + genome.density * 40);
  for (let b = 0; b < bands; b += 1) {
    const t = b / bands;
    // Bands bunch toward the horizon — the visual signature of distance.
    const distance = Math.pow(t, 1.8);
    const y = horizon + (b % 2 === 0 ? -1 : 1) * distance * height * 0.55;
    const loudness = arcAt(t);

    const strokes = Math.round(6 + genome.density * 26);
    for (let s = 0; s < strokes; s += 1) {
      const yy = y + rng.gaussian(0, unit * 0.012 * (1 + distance * 3));
      const segments = Math.max(12, Math.round(width / (unit * 0.03)));
      const points: Point[] = [];
      for (let i = 0; i <= segments; i += 1) {
        const x = (i / segments) * width;
        const sag = (noise(x * 0.0012, yy * 0.003 + b) - 0.5) * unit * 0.05 * genome.turbulence;
        points.push([x, yy + sag]);
      }
      push(scene, points, {
        tone: 1 - distance,
        // Far bands are lighter and thinner: aerial perspective.
        weight: (0.3 + (1 - distance) * 2.4) * (0.4 + genome.weight),
        alpha: (0.05 + (1 - distance) * 0.3) * loudness,
        accent: rng.next() > 0.96,
        layer: 0,
      });
    }
    yield (b + 1) / bands;
  }
}

export const ATMOSPHERIC_ENGINES: EngineDef[] = [
  {
    key: 'aurora',
    label: 'Aurora',
    description:
      'Curtains of light hung from the top of the picture, folding as they fall. Built from thousands of faint strands that only become bright where they overlap.',
    run: aurora,
  },
  {
    key: 'nebula',
    label: 'Nebula',
    description:
      'Volumetric cloud lit from within, threaded with filaments and studded with stars. Depth without a single hard edge.',
    run: nebula,
  },
  {
    key: 'rose',
    label: 'Rose Window',
    description:
      'Radial symmetry around a burning centre — petals, rings, and tracery, ordered the way a window is ordered.',
    run: rose,
  },
  {
    key: 'veil',
    label: 'Veil',
    description:
      'Bands of haze receding toward a horizon, thinning and paling with distance. The subject is the air itself.',
    run: veil,
  },
];
