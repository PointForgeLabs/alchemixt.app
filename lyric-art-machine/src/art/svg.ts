/**
 * SVG export.
 *
 * There are two genuinely different jobs here, and trying to serve both with
 * one file served neither:
 *
 *  - **Artwork** — a faithful vector copy of what is on screen, for opening in
 *    Inkscape and taking apart by hand. Keeps the ground, per-mark colour, mark
 *    opacity, and renders glows as radial gradients.
 *  - **Plot** — what a pen can honestly draw. No ground, no glows, no opacity,
 *    fills converted to hatching, one colour per pen layer.
 *
 * Both clip to the page, simplify paths, and drop marks too faint or too small
 * to matter. A mark at 4% alpha is invisible on screen; exporting it as a
 * full-strength line is not fidelity, it is noise — and it was turning a
 * luminous piece into a solid thicket.
 */

import { hatchPolygon, simplify, type Mark, type Point } from './geometry';
import { colorFor } from './painter';
import type { Glow, Scene } from './geometry';
import type { Palette } from './color';

export type PaperKey = 'a5' | 'a4' | 'a3' | 'letter' | 'square200';
export type SvgMode = 'artwork' | 'plot';

export const PAPERS: Record<PaperKey, { label: string; width: number; height: number }> = {
  a5: { label: 'A5 · 148×210mm', width: 148, height: 210 },
  a4: { label: 'A4 · 210×297mm', width: 210, height: 297 },
  a3: { label: 'A3 · 297×420mm', width: 297, height: 420 },
  letter: { label: 'Letter · 216×279mm', width: 215.9, height: 279.4 },
  square200: { label: 'Square · 200×200mm', width: 200, height: 200 },
};

export interface PlotOptions {
  mode: SvgMode;
  paper: PaperKey;
  /** Millimetres of unplotted border on every side. */
  margin: number;
  /** Nominal pen width, used for the preview stroke. */
  penWidth: number;
  /** Split pens into separate Inkscape layers. */
  separatePens: boolean;
  /** Simplification tolerance in source pixels. Higher means fewer points. */
  tolerance: number;
  /**
   * Plot mode only: marks fainter than this are skipped. A pen draws at full
   * strength or not at all, so a piece built from thousands of near-invisible
   * strands would otherwise plot as a solid block — and take hours doing it.
   */
  minAlpha?: number;
  /**
   * Plot mode only: a ceiling on total pen-down distance, in metres. Some
   * compositions are simply a great deal of line — hundreds of full-width
   * strokes, none of them faint — so culling by opacity alone cannot bound
   * them. When the budget is exceeded the faintest marks are dropped first,
   * which thins the picture the way squinting at it would.
   */
  maxLength?: number;
}

export const DEFAULT_PLOT_OPTIONS: PlotOptions = {
  mode: 'artwork',
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
  /** Marks discarded for being too faint or too small to matter. */
  dropped: number;
  glows: number;
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

interface EmittedPath {
  points: Point[];
  color: string;
  opacity: number;
  width: number;
  pen: number;
  /** The source mark's alpha, kept so budget culling can drop the faintest. */
  sourceAlpha: number;
  length: number;
}

export function toPlotterSvg(
  marks: Mark[],
  sourceWidth: number,
  sourceHeight: number,
  palette: Palette,
  options: PlotOptions,
  title: string,
  scene?: Scene,
): PlotResult {
  const paper = PAPERS[options.paper];
  const artwork = options.mode === 'artwork';

  const sourceLandscape = sourceWidth > sourceHeight;
  const paperLandscape = paper.width > paper.height;
  const pageWidth = sourceLandscape === paperLandscape ? paper.width : paper.height;
  const pageHeight = sourceLandscape === paperLandscape ? paper.height : paper.width;

  const drawWidth = Math.max(1, pageWidth - options.margin * 2);
  const drawHeight = Math.max(1, pageHeight - options.margin * 2);

  const scale = Math.min(drawWidth / sourceWidth, drawHeight / sourceHeight);
  const offsetX = options.margin + (drawWidth - sourceWidth * scale) / 2;
  const offsetY = options.margin + (drawHeight - sourceHeight * scale) / 2;

  const minLengthMm = 0.4;
  const minLengthPx = minLengthMm / scale;

  // Faint marks are the main reason a luminous piece exported as a solid mass:
  // three thousand strands at 5% alpha are a glow on screen and a scribble on
  // paper. Plotting is stricter, because a pen has no opacity at all.
  const minAlpha = artwork ? 0.02 : (options.minAlpha ?? 0.08);

  const paths: EmittedPath[] = [];
  let dropped = 0;
  let totalPoints = 0;
  let totalLengthPx = 0;
  const pensSeen = new Set<number>();

  const add = (points: Point[], m: Mark): void => {
    const length = polylineLength(points);
    if (points.length < 2 || length < minLengthPx) {
      dropped += 1;
      return;
    }
    const pen = options.separatePens ? m.layer : 0;
    pensSeen.add(pen);
    paths.push({
      points,
      color: artwork ? colorFor(palette, m) : pen === 0
        ? (palette.marks[Math.floor(palette.marks.length / 2)] ?? '#222222')
        : palette.accent,
      opacity: artwork ? Math.max(0.02, Math.min(1, m.alpha)) : 1,
      width: artwork
        ? Math.max(0.08, m.weight * 0.28 * (options.penWidth / 0.3))
        : options.penWidth,
      pen,
      sourceAlpha: m.alpha,
      length,
    });
    totalPoints += points.length;
    totalLengthPx += length;
  };

  for (const m of marks) {
    if (m.alpha < minAlpha) {
      dropped += 1;
      continue;
    }

    // In artwork mode a filled region stays filled; only the pen needs hatching.
    if (m.fill && m.closed && m.points.length >= 3 && !artwork) {
      const spacing = Math.max(minLengthPx * 3, (options.penWidth * 2.2) / scale);
      for (const line of hatchPolygon(m.points, Math.PI / 4, spacing)) {
        for (const piece of clipPolyline(line, sourceWidth, sourceHeight)) add(piece, m);
      }
      const outline = [...m.points, m.points[0] as Point];
      for (const piece of clipPolyline(outline, sourceWidth, sourceHeight)) {
        add(simplify(piece, options.tolerance), m);
      }
      continue;
    }

    const raw = m.closed && m.points.length > 2 ? [...m.points, m.points[0] as Point] : m.points;
    for (const piece of clipPolyline(raw, sourceWidth, sourceHeight)) {
      add(simplify(piece, options.tolerance), m);
    }
  }

  // Budget cull: drop the faintest marks until the plot fits the length ceiling.
  if (!artwork && options.maxLength && options.maxLength > 0) {
    const budgetPx = (options.maxLength * 1000) / scale;
    if (totalLengthPx > budgetPx) {
      const order = paths
        .map((p, index) => ({ index, alpha: p.sourceAlpha }))
        .sort((a, b) => a.alpha - b.alpha);
      const doomed = new Set<number>();
      let remaining = totalLengthPx;
      for (const entry of order) {
        if (remaining <= budgetPx) break;
        doomed.add(entry.index);
        remaining -= (paths[entry.index] as EmittedPath).length;
      }
      if (doomed.size > 0) {
        const kept = paths.filter((_, index) => !doomed.has(index));
        dropped += doomed.size;
        totalLengthPx = remaining;
        totalPoints = kept.reduce((n, p) => n + p.points.length, 0);
        paths.length = 0;
        paths.push(...kept);
        pensSeen.clear();
        for (const p of kept) pensSeen.add(p.pen);
      }
    }
  }

  const format = (n: number): string => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  };
  const px = (x: number): string => format(offsetX + x * scale);
  const py = (y: number): string => format(offsetY + y * scale);

  const body: string[] = [];
  const defs: string[] = [];
  let glowCount = 0;

  // --- ground and glows: artwork only ---
  if (artwork) {
    body.push(
      `  <g inkscape:groupmode="layer" inkscape:label="Ground" id="ground">`,
      `    <rect x="0" y="0" width="${format(pageWidth)}" height="${format(pageHeight)}" ` +
        `fill="${escapeXml(palette.ground)}"/>`,
      '  </g>',
    );

    const glows: Glow[] = scene?.glows ?? [];
    if (glows.length > 0) {
      body.push(
        `  <g inkscape:groupmode="layer" inkscape:label="Glow (screen only)" id="glow" ` +
          `style="mix-blend-mode:${palette.nocturne ? 'screen' : 'normal'}">`,
      );
      glows.forEach((glow, index) => {
        // A pen cannot draw these, but Inkscape can, and without them an
        // atmospheric piece exports with a hole where its subject was.
        const id = `glow-${index}`;
        const color = glow.accent
          ? palette.accent
          : (palette.marks[
              Math.min(palette.marks.length - 1, Math.floor(glow.tone * palette.marks.length))
            ] as string);
        defs.push(
          `    <radialGradient id="${id}">` +
            `<stop offset="0" stop-color="${escapeXml(color)}" stop-opacity="${format(Math.min(1, glow.strength))}"/>` +
            `<stop offset="1" stop-color="${escapeXml(color)}" stop-opacity="0"/>` +
            '</radialGradient>',
        );
        body.push(
          `    <circle cx="${px(glow.x)}" cy="${py(glow.y)}" r="${format(glow.radius * scale)}" ` +
            `fill="url(#${id})"/>`,
        );
        glowCount += 1;
      });
      body.push('  </g>');
    }
  }

  // --- marks, grouped into pen layers ---
  const pens = [...pensSeen].sort((a, b) => a - b);
  for (const pen of pens) {
    const inLayer = paths.filter((p) => p.pen === pen);
    if (inLayer.length === 0) continue;

    body.push(
      `  <g inkscape:groupmode="layer" inkscape:label="Pen ${pen + 1}" id="pen-${pen + 1}" ` +
        'fill="none" stroke-linecap="round" stroke-linejoin="round">',
    );
    for (const path of inLayer) {
      const d = path.points
        .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${px(x)} ${py(y)}`)
        .join(' ');
      const opacity = path.opacity < 0.999 ? ` stroke-opacity="${format(path.opacity)}"` : '';
      body.push(
        `    <path d="${d}" stroke="${escapeXml(path.color)}" ` +
          `stroke-width="${format(path.width)}"${opacity}/>`,
      );
    }
    body.push('  </g>');
  }

  const drawLengthMm = totalLengthPx * scale;
  const estimatedMinutes = (drawLengthMm / 45) * 1.35 / 60 + pens.length * 0.5 / 60;

  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ' +
      `width="${format(pageWidth)}mm" height="${format(pageHeight)}mm" ` +
      `viewBox="0 0 ${format(pageWidth)} ${format(pageHeight)}" version="1.1">`,
    `  <title>${escapeXml(title)}</title>`,
    `  <desc>Generated by the Interpretive Art Machine (${options.mode} export). ` +
      'Units are millimetres; one SVG user unit is one millimetre.</desc>',
    ...(defs.length > 0 ? ['  <defs>', ...defs, '  </defs>'] : []),
    ...body,
    '</svg>',
    '',
  ].join('\n');

  return {
    svg,
    stats: {
      paths: paths.length,
      points: totalPoints,
      drawLength: drawLengthMm / 1000,
      estimatedMinutes,
      pens: pens.length,
      dropped,
      glows: glowCount,
    },
  };
}
