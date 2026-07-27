/**
 * SVG export for pen plotters.
 *
 * This serializes the same marks the painter drew, so what plots is what was
 * on screen — minus the things a pen physically cannot do. Four of those
 * matter, and each is handled here rather than left to Inkscape:
 *
 *  - A pen cannot fill. Any region still marked as filled becomes hatching.
 *  - A pen cannot draw off the paper. Marks bleed past the canvas edge by
 *    design, so everything is clipped to the page before export.
 *  - A pen cannot draw a million points. Paths are simplified, and specks
 *    below a visible length are dropped.
 *  - A pen has one colour at a time. Marks are grouped into Inkscape layers
 *    so each pen is a separate, individually plottable layer.
 */

import { hatchPolygon, simplify, type Mark, type Point } from './geometry';
import type { Palette } from './color';

export type PaperKey = 'a5' | 'a4' | 'a3' | 'letter' | 'square200';

export const PAPERS: Record<PaperKey, { label: string; width: number; height: number }> = {
  a5: { label: 'A5 · 148×210mm', width: 148, height: 210 },
  a4: { label: 'A4 · 210×297mm', width: 210, height: 297 },
  a3: { label: 'A3 · 297×420mm', width: 297, height: 420 },
  letter: { label: 'Letter · 216×279mm', width: 215.9, height: 279.4 },
  square200: { label: 'Square · 200×200mm', width: 200, height: 200 },
};

export interface PlotOptions {
  paper: PaperKey;
  /** Millimetres of unplotted border on every side. */
  margin: number;
  /** Nominal pen width, used only for the preview stroke in Inkscape. */
  penWidth: number;
  /** Split pens into separate Inkscape layers. */
  separatePens: boolean;
  /** Simplification tolerance in source pixels. Higher means fewer points. */
  tolerance: number;
}

export const DEFAULT_PLOT_OPTIONS: PlotOptions = {
  paper: 'a4',
  margin: 12,
  penWidth: 0.3,
  separatePens: true,
  tolerance: 0.7,
};

export interface PlotStats {
  paths: number;
  points: number;
  /** Total pen-down distance in metres. */
  drawLength: number;
  /** Rough plotting time in minutes. */
  estimatedMinutes: number;
  pens: number;
  /** Marks discarded for being below the visible threshold. */
  dropped: number;
}

export interface PlotResult {
  svg: string;
  stats: PlotStats;
}

// --- clipping -------------------------------------------------------------

const INSIDE = 0;
const LEFT = 1;
const RIGHT = 2;
const BOTTOM = 4;
const TOP = 8;

function outCode(x: number, y: number, w: number, h: number): number {
  let code = INSIDE;
  if (x < 0) code |= LEFT;
  else if (x > w) code |= RIGHT;
  if (y < 0) code |= TOP;
  else if (y > h) code |= BOTTOM;
  return code;
}

/** Cohen–Sutherland clip of one segment. Returns null when fully outside. */
function clipSegment(a: Point, b: Point, w: number, h: number): [Point, Point] | null {
  let [x0, y0] = a;
  let [x1, y1] = b;
  let code0 = outCode(x0, y0, w, h);
  let code1 = outCode(x1, y1, w, h);

  for (let guard = 0; guard < 8; guard += 1) {
    if ((code0 | code1) === 0) return [[x0, y0], [x1, y1]];
    if ((code0 & code1) !== 0) return null;

    const code = code0 !== 0 ? code0 : code1;
    let x = 0;
    let y = 0;
    if (code & BOTTOM) {
      x = x0 + ((x1 - x0) * (h - y0)) / (y1 - y0);
      y = h;
    } else if (code & TOP) {
      x = x0 + ((x1 - x0) * (0 - y0)) / (y1 - y0);
      y = 0;
    } else if (code & RIGHT) {
      y = y0 + ((y1 - y0) * (w - x0)) / (x1 - x0);
      x = w;
    } else {
      y = y0 + ((y1 - y0) * (0 - x0)) / (x1 - x0);
      x = 0;
    }

    if (code === code0) {
      x0 = x;
      y0 = y;
      code0 = outCode(x0, y0, w, h);
    } else {
      x1 = x;
      y1 = y;
      code1 = outCode(x1, y1, w, h);
    }
  }
  return null;
}

/** Clips a polyline to the canvas, splitting it wherever it leaves and returns. */
function clipPolyline(points: Point[], w: number, h: number): Point[][] {
  const out: Point[][] = [];
  let run: Point[] = [];

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const clipped = clipSegment(a, b, w, h);
    if (!clipped) {
      if (run.length > 1) out.push(run);
      run = [];
      continue;
    }
    const [ca, cb] = clipped;
    if (run.length === 0) {
      run.push(ca, cb);
    } else {
      const last = run[run.length - 1] as Point;
      // A jump means the line left the page and came back elsewhere.
      if (Math.abs(last[0] - ca[0]) > 1e-6 || Math.abs(last[1] - ca[1]) > 1e-6) {
        if (run.length > 1) out.push(run);
        run = [ca, cb];
      } else {
        run.push(cb);
      }
    }
  }
  if (run.length > 1) out.push(run);
  return out;
}

// --- export ---------------------------------------------------------------

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&apos;',
  );
}

function polylineLength(points: Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return sum;
}

/**
 * Converts rendered marks into a plotter-ready SVG.
 *
 * `title` is written into the document metadata so a stack of plots stays
 * identifiable after export.
 */
export function toPlotterSvg(
  marks: Mark[],
  sourceWidth: number,
  sourceHeight: number,
  palette: Palette,
  options: PlotOptions,
  title: string,
): PlotResult {
  const paper = PAPERS[options.paper];

  // Match the paper's orientation to the artwork so a landscape piece isn't
  // squeezed onto a portrait sheet.
  const sourceLandscape = sourceWidth > sourceHeight;
  const paperLandscape = paper.width > paper.height;
  const pageWidth = sourceLandscape === paperLandscape ? paper.width : paper.height;
  const pageHeight = sourceLandscape === paperLandscape ? paper.height : paper.width;

  const drawWidth = Math.max(1, pageWidth - options.margin * 2);
  const drawHeight = Math.max(1, pageHeight - options.margin * 2);

  // Uniform scale, centred — never distort the composition to fill the sheet.
  const scale = Math.min(drawWidth / sourceWidth, drawHeight / sourceHeight);
  const offsetX = options.margin + (drawWidth - sourceWidth * scale) / 2;
  const offsetY = options.margin + (drawHeight - sourceHeight * scale) / 2;

  // Anything shorter than this is a speck the pen would just blot.
  const minLengthMm = 0.4;
  const minLengthPx = minLengthMm / scale;

  const byPen = new Map<number, Point[][]>();
  let dropped = 0;
  let totalPoints = 0;
  let totalLengthPx = 0;

  const addPath = (pen: number, points: Point[]): void => {
    const length = polylineLength(points);
    if (points.length < 2 || length < minLengthPx) {
      dropped += 1;
      return;
    }
    const bucket = byPen.get(pen) ?? [];
    bucket.push(points);
    byPen.set(pen, bucket);
    totalPoints += points.length;
    totalLengthPx += length;
  };

  for (const m of marks) {
    const pen = options.separatePens ? m.layer : 0;

    // Regions still marked as filled have to become line work.
    if (m.fill && m.closed && m.points.length >= 3) {
      const spacing = Math.max(minLengthPx * 3, (options.penWidth * 2.2) / scale);
      for (const line of hatchPolygon(m.points, Math.PI / 4, spacing)) {
        for (const piece of clipPolyline(line, sourceWidth, sourceHeight)) {
          addPath(pen, piece);
        }
      }
      // Keep the outline so the shape still reads.
      const outline = m.closed ? [...m.points, m.points[0] as Point] : m.points;
      for (const piece of clipPolyline(outline, sourceWidth, sourceHeight)) {
        addPath(pen, simplify(piece, options.tolerance));
      }
      continue;
    }

    const raw = m.closed && m.points.length > 2 ? [...m.points, m.points[0] as Point] : m.points;
    for (const piece of clipPolyline(raw, sourceWidth, sourceHeight)) {
      addPath(pen, simplify(piece, options.tolerance));
    }
  }

  const format = (n: number): string => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  };

  const body: string[] = [];
  const pens = [...byPen.keys()].sort((a, b) => a - b);

  for (const pen of pens) {
    const paths = byPen.get(pen) as Point[][];
    const color = pen === 0
      ? (palette.marks[Math.floor(palette.marks.length / 2)] ?? '#222222')
      : palette.accent;

    body.push(
      `  <g inkscape:groupmode="layer" inkscape:label="Pen ${pen + 1}" id="pen-${pen + 1}" ` +
        `fill="none" stroke="${escapeXml(color)}" stroke-width="${options.penWidth}" ` +
        'stroke-linecap="round" stroke-linejoin="round">',
    );
    for (const points of paths) {
      const d = points
        .map(([x, y], index) => {
          const px = format(offsetX + x * scale);
          const py = format(offsetY + y * scale);
          return `${index === 0 ? 'M' : 'L'}${px} ${py}`;
        })
        .join(' ');
      body.push(`    <path d="${d}"/>`);
    }
    body.push('  </g>');
  }

  const drawLengthMm = totalLengthPx * scale;
  // ~45 mm/s pen-down is a fair average for a desktop plotter, plus a rough
  // allowance for pen-up travel between paths. An estimate, not a promise.
  const estimatedMinutes = (drawLengthMm / 45 + byPen.size * 0.5 + totalPoints * 0.0004) / 60
    + (drawLengthMm / 45) * 0.35 / 60;

  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ` +
      `width="${format(pageWidth)}mm" height="${format(pageHeight)}mm" ` +
      `viewBox="0 0 ${format(pageWidth)} ${format(pageHeight)}" version="1.1">`,
    `  <title>${escapeXml(title)}</title>`,
    `  <desc>Generated by the Interpretive Art Machine. Units are millimetres; ` +
      `one SVG user unit is one millimetre.</desc>`,
    ...body,
    '</svg>',
    '',
  ].join('\n');

  return {
    svg,
    stats: {
      paths: totalPoints > 0 ? [...byPen.values()].reduce((n, p) => n + p.length, 0) : 0,
      points: totalPoints,
      drawLength: drawLengthMm / 1000,
      estimatedMinutes,
      pens: byPen.size,
      dropped,
    },
  };
}
