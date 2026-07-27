/**
 * The vector layer every engine writes into.
 *
 * Engines never touch a canvas. They emit marks — polylines and regions — and
 * the painter decides how those become pixels. That separation is what makes
 * plotter output real: SVG export serializes exactly the geometry that made the
 * picture, rather than tracing a bitmap after the fact.
 *
 * Raster-only flourishes (glows, washes) live in a separate list, so the
 * plotter can ignore them without the screen losing anything.
 */

export type Point = [number, number];

export interface Mark {
  points: Point[];
  closed: boolean;
  /** A region rather than a line. Treatments choose how to realize it. */
  fill: boolean;
  /** 0..1 — position within the palette's mark colors. */
  tone: number;
  /** Relative stroke weight; the painter scales this to canvas units. */
  weight: number;
  alpha: number;
  /** Use the palette's accent color instead of a mark color. */
  accent: boolean;
  /** Pen / color separation index, used when plotting in multiple pens. */
  layer: number;
}

/** Soft radial light. Screen only — a pen cannot draw a glow. */
export interface Glow {
  x: number;
  y: number;
  radius: number;
  tone: number;
  accent: boolean;
  strength: number;
}

export interface Scene {
  marks: Mark[];
  glows: Glow[];
}

export function createScene(): Scene {
  return { marks: [], glows: [] };
}

export interface MarkOptions {
  closed?: boolean;
  fill?: boolean;
  tone?: number;
  weight?: number;
  alpha?: number;
  accent?: boolean;
  layer?: number;
}

export function mark(points: Point[], options: MarkOptions = {}): Mark {
  return {
    points,
    closed: options.closed ?? false,
    fill: options.fill ?? false,
    tone: options.tone ?? 0.5,
    weight: options.weight ?? 1,
    alpha: options.alpha ?? 1,
    accent: options.accent ?? false,
    layer: options.layer ?? 0,
  };
}

export function push(scene: Scene, points: Point[], options: MarkOptions = {}): void {
  // Two points are the minimum that can draw anything.
  if (points.length < 2) return;
  scene.marks.push(mark(points, options));
}

/** Circle as a polyline, so it lives in the same world as everything else. */
export function circlePoints(cx: number, cy: number, r: number, segments = 48): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return points;
}

export function arcPoints(
  cx: number,
  cy: number,
  r: number,
  start: number,
  sweep: number,
  segments = 40,
): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = start + (i / segments) * sweep;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return points;
}

/** Axis-aligned rectangle as a closed polygon. */
export function rectPoints(x: number, y: number, w: number, h: number): Point[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

export function centroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

export function boundsOf(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Fills a polygon with parallel lines at an arbitrary angle.
 *
 * Works by rotating the polygon so the hatch direction is horizontal, running
 * ordinary scanlines, then rotating the resulting segments back. This is the
 * core of every plottable "fill" — a pen can only ever approximate tone with
 * line density.
 */
export function hatchPolygon(
  polygon: Point[],
  angle: number,
  spacing: number,
): Point[][] {
  if (polygon.length < 3 || spacing <= 0) return [];

  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rotated: Point[] = polygon.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);

  const { minY, maxY } = boundsOf(rotated);
  const lines: Point[][] = [];
  const backCos = Math.cos(angle);
  const backSin = Math.sin(angle);

  // A pathological spacing/size combination could otherwise emit millions of lines.
  const maxLines = 4000;
  let emitted = 0;

  for (let y = minY + spacing * 0.5; y < maxY && emitted < maxLines; y += spacing) {
    const crossings: number[] = [];
    for (let i = 0; i < rotated.length; i += 1) {
      const a = rotated[i] as Point;
      const b = rotated[(i + 1) % rotated.length] as Point;
      const ay = a[1];
      const by = b[1];
      if (ay === by) continue;
      if ((y >= ay && y < by) || (y >= by && y < ay)) {
        const t = (y - ay) / (by - ay);
        crossings.push(a[0] + (b[0] - a[0]) * t);
      }
    }
    if (crossings.length < 2) continue;
    crossings.sort((p, q) => p - q);

    // Even-odd pairing: inside the polygon between alternating crossings.
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const x1 = crossings[i] as number;
      const x2 = crossings[i + 1] as number;
      if (x2 - x1 < 1e-6) continue;
      lines.push([
        [x1 * backCos - y * backSin, x1 * backSin + y * backCos],
        [x2 * backCos - y * backSin, x2 * backSin + y * backCos],
      ]);
      emitted += 1;
    }
  }

  return lines;
}

/** True when a point sits inside a polygon (ray casting). */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i] as Point;
    const b = polygon[j] as Point;
    if ((a[1] > py) !== (b[1] > py)) {
      const x = ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0];
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

/**
 * Ramer-Douglas-Peucker simplification.
 *
 * Screen rendering can afford every point an engine produced; a plotter cannot.
 * A flow-field piece can easily hold a million points, which would make a
 * gigantic SVG and a drawing that takes hours and looks no different.
 */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3 || tolerance <= 0) return points;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const range = stack.pop() as [number, number];
    const [first, last] = range;
    if (last <= first + 1) continue;

    const a = points[first] as Point;
    const b = points[last] as Point;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;

    let worst = 0;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const p = points[i] as Point;
      let distance: number;
      if (lengthSquared === 0) {
        distance = Math.hypot(p[0] - a[0], p[1] - a[1]);
      } else {
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
        distance = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
      }
      if (distance > worst) {
        worst = distance;
        worstIndex = i;
      }
    }

    if (worst > tolerance && worstIndex > 0) {
      keep[worstIndex] = 1;
      stack.push([first, worstIndex], [worstIndex, last]);
    }
  }

  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (keep[i]) out.push(points[i] as Point);
  }
  return out;
}

/** Displaces points along a smooth wobble — the hand-drawn look. */
export function jitterPoints(
  points: Point[],
  amount: number,
  noise: (x: number, y: number) => number,
  phase = 0,
): Point[] {
  if (amount <= 0) return points;
  return points.map(([x, y]) => {
    const nx = noise(x * 0.01 + phase, y * 0.01) - 0.5;
    const ny = noise(x * 0.01, y * 0.01 + phase + 31.7) - 0.5;
    return [x + nx * amount, y + ny * amount] as Point;
  });
}

/** Total ink length, used to warn about plots that would take all day. */
export function totalLength(marks: Mark[]): number {
  let sum = 0;
  for (const m of marks) {
    for (let i = 1; i < m.points.length; i += 1) {
      const a = m.points[i - 1] as Point;
      const b = m.points[i] as Point;
      sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    if (m.closed && m.points.length > 2) {
      const a = m.points[m.points.length - 1] as Point;
      const b = m.points[0] as Point;
      sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  return sum;
}
