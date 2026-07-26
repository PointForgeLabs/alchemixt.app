// Composes a finished plate: renders the skull, extracts every line pass, lays
// out the ornament and lettering, and returns a layered drawing in page
// millimetres ready for the plotter exporters.

import { Rng, makeValueNoise2D } from '../rng.js';
import { pageSize, resolvedInscription, STYLE_PRESETS } from '../params.js';
import {
  simplify, smoothMoving, chainPaths, dropShort, clipPathsToRing, rectRing,
  closeRing, polylineLength, decimate,
} from '../geom.js';
import { buildInk, sample, erodedDistance, blur } from './fields.js';
import { traceIsolines, buildValid } from './isolines.js';
import { extractContours, extractSilhouette } from './edges.js';
import { extractSutures, extractCracks } from './features.js';
import { modulatePath, makeDuty, jitterPath, offsetPath, parallelLines } from './hatch.js';
import { stipplePoints, dotsToStrokes } from './stipple.js';
import { layoutText, measureText, arcText } from './strokefont.js';
import {
  buildFrame, vignetteRing, buildBotanical, buildHourglass, buildCrossbones,
  buildWings, buildRosette, buildRegistration,
} from './ornament.js';

// The raster is always this much wider than tall; the skull box follows it so
// pixels map to paper with a single uniform scale.
const RASTER_ASPECT = 0.78;
const MAX_RASTER_PIXELS = 4.2e6;
const MODEL_FRAMING_MM = 250;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Resolve a style preset over the raw parameters. */
export function applyStylePreset(p) {
  if (p.stylePreset === 'custom') return p;
  const preset = STYLE_PRESETS[p.stylePreset];
  return preset ? { ...p, ...preset } : p;
}

/** Numeric seed for the shader, derived from the seed string. */
function seedNumber(seed) {
  const r = new Rng(`${seed}:shader`);
  return Math.floor(r.next() * 4096);
}

/**
 * Work out the page, the frame, the picture box and the raster resolution before
 * anything is rendered, so the UI can show the plate size immediately.
 */
export function planPlate(params) {
  const p = applyStylePreset(params);
  const page = pageSize(p);
  const m = clamp(p.margin, 0, Math.min(page.w, page.h) / 2 - 5);
  const outer = { x0: m, y0: m, x1: page.w - m, y1: page.h - m };
  const rng = new Rng(`${p.seed}:frame`);
  const { paths: framePaths, inner } = buildFrame(outer, p.frame, rng);

  const innerW = inner.x1 - inner.x0;
  const innerH = inner.y1 - inner.y0;

  // Reserve room at the foot for the lettering.
  const text = resolvedInscription(p);
  const sub = (p.subscript || '').trim();
  let textBand = 0;
  if (text) textBand += p.textSize * 2.1;
  if (sub) textBand += p.textSize * 1.5;
  if (p.textArc) textBand *= 1.25;

  const artH = Math.max(innerH * 0.3, innerH - textBand);
  let boxH = p.skullScale * artH * 1.32;
  let boxW = boxH * RASTER_ASPECT;
  if (boxW > innerW) { boxW = innerW; boxH = boxW / RASTER_ASPECT; }

  const cx = inner.x0 + innerW / 2 + p.skullOffsetX * innerW;
  const cy = inner.y0 + artH / 2 + p.skullOffsetY * innerH;
  const box = { x0: cx - boxW / 2, y0: cy - boxH / 2, x1: cx + boxW / 2, y1: cy + boxH / 2 };

  // Raster density: aim for roughly 3.4 pixels per engraved line pitch, which is
  // the point at which marching squares resolves the lines cleanly.
  let dpmm = clamp(3.4 / Math.max(p.lineSpacing, 0.05), 2.4, 12) * p.renderScale;
  let rw = Math.round(boxW * dpmm);
  let rh = Math.round(boxH * dpmm);
  if (rw * rh > MAX_RASTER_PIXELS) {
    const k = Math.sqrt(MAX_RASTER_PIXELS / (rw * rh));
    rw = Math.round(rw * k); rh = Math.round(rh * k);
    dpmm *= k;
  }

  return {
    p, page, outer, inner, box, framePaths, dpmm,
    raster: { w: Math.max(32, rw), h: Math.max(32, rh) },
    artH, textBand,
    // Paper millimetres per model millimetre.
    modelScale: boxH / MODEL_FRAMING_MM,
  };
}

/** Paper-space bounds of the rendered silhouette. */
function maskBoundsToPaper(fields, plan) {
  const { width: w, height: h, mask } = fields;
  let x0 = w, y0 = h, x1 = 0, y1 = 0, any = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      any = true;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!any) return { ...plan.box };
  const toX = (x) => plan.box.x0 + x / plan.dpmm;
  const toY = (y) => plan.box.y0 + y / plan.dpmm;
  return { x0: toX(x0), y0: toY(y0), x1: toX(x1), y1: toY(y1) };
}

/* ----------------------------------------------------------- the compose --- */

export async function composePlate({ renderer, params, onStage = () => {} }) {
  const plan = planPlate(params);
  const p = plan.p;
  const rng = new Rng(`${p.seed}:art`);
  const noise2 = makeValueNoise2D(`${p.seed}:jitter`);

  onStage('Rendering the skull', 0.02);
  const fields = await renderer.render({
    width: plan.raster.w,
    height: plan.raster.h,
    params: {
      ...p,
      framingMm: MODEL_FRAMING_MM,
      targetY: -14,
      seedNum: seedNumber(p.seed),
    },
    bandRows: 64,
    onProgress: (f) => onStage('Rendering the skull', 0.02 + f * 0.4),
  });

  const { width: rw, height: rh } = fields;
  onStage('Reading tones', 0.44);
  const ink = buildInk(fields, p);
  const inkSmooth = blur(ink, rw, rh, 1);
  const inkAt = (x, y) => sample(inkSmooth, rw, rh, x, y);
  const eroded = erodedDistance(fields.mask, rw, rh);

  const pitchPx = Math.max(1.4, p.lineSpacing * plan.dpmm);
  const penPx = Math.max(0.4, p.penWidth * plan.dpmm);
  // Field delta is in model millimetres of surface arc length.
  const delta = p.lineSpacing / Math.max(plan.modelScale, 1e-4);
  const minSpacingPx = Math.max(2.0, pitchPx * 0.62);
  const softness = p.dashSoftness;
  const dashPeriod = pitchPx * 2.6;

  /* ---- pass 1: contour and silhouette -------------------------------- */
  onStage('Cutting contours', 0.48);
  const silhouette = extractSilhouette(fields);
  const contours = extractContours(fields, { sensitivity: p.contourThreshold, minLenPx: pitchPx * 1.6 });

  let contourPaths = [];
  if (p.contourWeight > 0.01) {
    for (const c of contours) contourPaths.push(c);
  }
  for (const s of silhouette) contourPaths.push(s);
  // Extra weight on the outline: a plotter cannot swell a line, so it is walked
  // again a fraction of a pen-width to each side.
  if (p.silhouette > 0.05) {
    const passes = Math.round(p.silhouette);
    for (let k = 1; k <= passes; k++) {
      const d = penPx * 0.55 * k;
      for (const s of silhouette) {
        contourPaths.push(offsetPath(s, d));
        if (k <= passes - 1) contourPaths.push(offsetPath(s, -d));
      }
    }
  }

  /* ---- pass 2: surface markings --------------------------------------- */
  onStage('Scribing sutures', 0.54);
  const markPaths = [
    ...extractSutures(fields, { amount: p.sutures, seed: seedNumber(p.seed) + 3 }),
    ...extractCracks(fields, { amount: p.cracks, seed: seedNumber(p.seed) + 11 }),
  ];

  /* ---- passes 3-6: engraving and hatching ----------------------------- */
  const validAll = buildValid(fields, { inset: penPx * 0.5, erodedDist: eroded });

  const tonePass = (lines, duty, phaseOf, jitterAmp, seedOff) => {
    const out = [];
    for (const item of lines) {
      let pts = item.pts || item;
      if (pts.length < 2) continue;
      if (jitterAmp > 0.001) {
        pts = jitterPath(pts, jitterAmp, noise2, 0.045, seedOff + (item.level ?? item.index ?? 0) * 0.13);
      }
      const runs = modulatePath(pts, {
        inkAt, duty, period: dashPeriod,
        phase: phaseOf(item), step: Math.max(0.75, pitchPx * 0.34),
        minRun: Math.max(penPx * 0.9, 0.6),
        wobble: (s) => noise2(s * 0.02 + seedOff, seedOff) * 0.16,
      });
      for (const r of runs) out.push(r);
    }
    return out;
  };

  const golden = 0.618033988;

  /**
   * Each pass owns a window of the tonal range. A pass weight scales how much of
   * its period it fills and nudges the window earlier or later -- it must not
   * stretch the window itself, or a weight below one pushes the whole pass past
   * the darkest tone on the plate and it silently never draws.
   */
  const passDuty = (lo, hi, weight) => {
    const w = Math.min(weight, 1.4);
    const shift = (1 - w) * 0.10;
    const base = makeDuty(lo + shift, hi + shift, softness);
    return (inkVal) => Math.min(1, base(inkVal) * w);
  };

  const engravePaths = [];
  if (p.engraveWeight > 0.01) {
    onStage('Engraving the form', 0.58);
    const traced = traceIsolines({
      field: fields.formV, valid: validAll, depth: fields.depth, region: fields.region,
      width: rw, height: rh, delta, phase: 0, minSpacingPx,
    });
    engravePaths.push(...tonePass(traced, passDuty(0.02, 0.46, p.engraveWeight),
                                 (t) => (t.level * golden) % 1, p.jitter * penPx * 0.5, 1.7));
  }

  const crossPaths = [];
  if (p.crossWeight > 0.01) {
    onStage('Cross-hatching', 0.66);
    const traced = traceIsolines({
      field: fields.formU, valid: validAll, depth: fields.depth, region: fields.region,
      width: rw, height: rh, delta: delta * 1.35, phase: delta * 0.5, minSpacingPx: minSpacingPx * 1.2,
    });
    crossPaths.push(...tonePass(traced, passDuty(0.36, 0.74, p.crossWeight),
                                (t) => (t.level * golden + 0.37) % 1, p.jitter * penPx * 0.45, 5.3));
  }

  const rect = { x0: 0, y0: 0, x1: rw, y1: rh };
  const hatchPaths = [];
  if (p.hatchWeight > 0.01) {
    onStage('Laying shadow hatch', 0.72);
    const lines = parallelLines(rect, p.hatchAngle, pitchPx * 1.15, { resample: pitchPx * 0.8 });
    hatchPaths.push(...tonePass(lines, passDuty(0.62, 0.90, p.hatchWeight),
                                (t) => (t.index * golden + 0.11) % 1, p.jitter * penPx * 0.35, 9.1));
  }

  const deepPaths = [];
  if (p.hatchWeight > 0.25) {
    const lines = parallelLines(rect, p.hatchAngle + 74, pitchPx * 1.3, { resample: pitchPx * 0.8 });
    deepPaths.push(...tonePass(lines, passDuty(0.82, 0.99, p.hatchWeight * 0.85),
                               (t) => (t.index * golden + 0.71) % 1, p.jitter * penPx * 0.3, 13.7));
  }

  /* ---- pass 7: stipple ------------------------------------------------ */
  const stipplePaths = [];
  if (p.stippleWeight > 0.01) {
    onStage('Stippling', 0.78);
    const inside = (x, y) => {
      const xi = Math.round(x), yi = Math.round(y);
      return xi >= 0 && yi >= 0 && xi < rw && yi < rh && eroded[yi * rw + xi] >= penPx * 0.5;
    };
    const dots = stipplePoints({
      ink: inkSmooth, width: rw, height: rh, inside,
      spacingPx: Math.max(1.3, pitchPx * 0.82 / Math.max(p.stippleWeight, 0.2)),
      maxDots: Math.round(26000 * clamp(p.stippleWeight, 0, 1.4)),
      rng: rng.fork('stipple'), gamma: 1.15,
    });
    // A dot is drawn as a very short stroke, so it has to be long enough to
    // survive the minimum-stroke filter or the whole layer silently vanishes.
    const dotLenPx = Math.max(penPx * 0.8, (p.minSegment + 0.06) * plan.dpmm);
    stipplePaths.push(...dotsToStrokes(dots, dotLenPx, rng.fork('dots')));
  }

  /* ---- pixel space -> page millimetres -------------------------------- */
  onStage('Placing on the page', 0.84);
  const toPaper = (paths) => paths.map((path) =>
    path.map(([x, y]) => [plan.box.x0 + x / plan.dpmm, plan.box.y0 + y / plan.dpmm]));

  const artLayers = [
    { id: 'contour', name: 'Contour', paths: toPaper(contourPaths), tone: 'dark' },
    { id: 'marks', name: 'Sutures & cracks', paths: toPaper(markPaths), tone: 'dark' },
    { id: 'engrave', name: 'Engraving', paths: toPaper(engravePaths), tone: 'mid' },
    { id: 'cross', name: 'Cross-hatch', paths: toPaper(crossPaths), tone: 'mid' },
    { id: 'hatch', name: 'Shadow hatch', paths: toPaper(hatchPaths), tone: 'light' },
    { id: 'deep', name: 'Deep hatch', paths: toPaper(deepPaths), tone: 'light' },
    { id: 'stipple', name: 'Stipple', paths: toPaper(stipplePaths), tone: 'light' },
  ];

  /* ---- ornament and lettering ----------------------------------------- */
  // The frame is kept apart from the motifs: it is the one thing that must not
  // be clipped to the picture area or hidden behind the skull.
  const framePaths = [...plan.framePaths];
  const motifPaths = [];
  const inner = plan.inner;

  // Where the skull actually ends on paper, measured rather than guessed: the
  // silhouette moves with every pose parameter, and ornament placed on an
  // assumed band collides with the jaw as soon as the head is tipped.
  const skullBox = maskBoundsToPaper(fields, plan);
  const textTop = inner.y1 - plan.textBand * 1.15;

  // Longest traced outline = the outer silhouette, in paper millimetres.
  let skullRing = null;
  if (silhouette.length) {
    const longest = silhouette.reduce(
      (best, q) => (polylineLength(q) > polylineLength(best) ? q : best), silhouette[0]);
    if (longest.length >= 4) skullRing = toPaper([longest])[0];
  }

  if (p.botanical !== 'none') {
    // Fits into the gap between the jaw and the lettering. An arrangement rises
    // about 0.62 of its reach above the springing point, but the leaves on the
    // lower side of each stem hang about 0.24 below it -- budget for both or the
    // bottom row lands on top of the inscription.
    const gap = Math.max(8, textTop - skullBox.y1);
    const reach = Math.min((inner.x1 - inner.x0) * 0.36, gap / 0.86);
    motifPaths.push(...buildBotanical(p.botanical, {
      cx: (skullBox.x0 + skullBox.x1) / 2,
      cy: textTop - reach * 0.24,
      reach,
    }, rng.fork('bot')));
  }
  if (p.crossbones) {
    motifPaths.push(...buildCrossbones(
      (skullBox.x0 + skullBox.x1) / 2, skullBox.y1 - (skullBox.y1 - skullBox.y0) * 0.13,
      (inner.x1 - inner.x0) * 0.92, rng.fork('bones')));
  }
  if (p.wings) {
    motifPaths.push(...buildWings(
      (skullBox.x0 + skullBox.x1) / 2, skullBox.y0 + (skullBox.y1 - skullBox.y0) * 0.26,
      (inner.x1 - inner.x0) * 0.99, rng.fork('wings')));
  }
  if (p.hourglass) {
    const hh = Math.min((skullBox.y1 - skullBox.y0) * 0.28, (inner.x1 - inner.x0) * 0.19);
    motifPaths.push(...buildHourglass(
      inner.x0 + hh * 0.62, Math.min(skullBox.y1, textTop - hh * 0.6), hh, rng));
  }
  if (p.rosette) {
    const r = Math.min(plan.artH, inner.x1 - inner.x0) * 0.055;
    motifPaths.push(...buildRosette(
      (inner.x0 + inner.x1) / 2, Math.min(inner.y0 + r * 1.4, skullBox.y0 - r * 1.3), r));
  }
  if (p.registration) framePaths.push(...buildRegistration(plan.outer, 5));

  const textPaths = [];
  const inscription = resolvedInscription(p);
  let baseline = inner.y1 - p.textSize * 0.9;
  const sub = (p.subscript || '').trim();
  if (sub) {
    const lay = layoutText(sub, { size: p.textSize * 0.62, tracking: p.textTracking * 1.4 });
    const x = (inner.x0 + inner.x1) / 2 - lay.width / 2;
    for (const path of lay.paths) textPaths.push(path.map(([px, py]) => [x + px, baseline + py]));
    baseline -= p.textSize * 1.5;
  }
  if (inscription) {
    const lay = layoutText(inscription, { size: p.textSize, tracking: p.textTracking });
    const shaped = p.textArc
      ? arcText(lay, p.textArc, (inner.x1 - inner.x0) * 0.9 / Math.max(Math.abs(p.textArc), 0.08))
      : lay.paths;
    const x = (inner.x0 + inner.x1) / 2 - lay.width / 2;
    for (const path of shaped) textPaths.push(path.map(([px, py]) => [x + px, baseline + py]));
  }

  /* ---- clipping, cleanup, layering ------------------------------------ */
  const vignette = vignetteRing(p.vignette, plan.box);
  const innerRing = closeRing(rectRing(inner.x0, inner.y0, inner.x1, inner.y1));

  const finishArt = (paths) => {
    let out = paths;
    if (vignette) out = clipPathsToRing(out, vignette, true);
    out = clipPathsToRing(out, innerRing, true);
    if (p.simplifyTol > 0) out = out.map((q) => simplify(q, p.simplifyTol));
    if (p.optimize) out = chainPaths(out, p.chainTol);
    out = dropShort(out, p.minSegment);
    return decimate(out, Math.max(p.simplifyTol * 0.5, 0.02));
  };

  const layers = [];
  for (const L of artLayers) {
    const paths = finishArt(L.paths);
    if (paths.length) layers.push({ ...L, paths });
  }

  // Motifs read as being *behind* the skull, so they are cut away wherever the
  // silhouette covers them -- a wing or a crossbone drawn straight over the
  // cranium looks pasted on.
  let ornament = motifPaths.map((q) => simplify(q, Math.min(p.simplifyTol, 0.06)));
  ornament = clipPathsToRing(ornament, innerRing, true);
  if (skullRing) ornament = clipPathsToRing(ornament, skullRing, false);
  ornament = ornament.concat(framePaths.map((q) => simplify(q, Math.min(p.simplifyTol, 0.06))));
  ornament = dropShort(chainPaths(ornament, 0.05), 0.3);
  if (ornament.length) {
    layers.push({ id: 'ornament', name: 'Ornament', paths: ornament, tone: 'dark' });
  }
  if (textPaths.length) {
    layers.push({
      id: 'lettering', name: 'Lettering',
      paths: dropShort(chainPaths(textPaths, 0.04), 0.2), tone: 'dark',
    });
  }

  return {
    widthMm: plan.page.w,
    heightMm: plan.page.h,
    layers,
    plan,
    fields,
    ink: inkSmooth,
    params: p,
  };
}

/** Regroup layers according to the pen-splitting preference. */
export function regroupLayers(drawing, mode) {
  if (mode === 'pass') return drawing.layers;
  if (mode === 'single') {
    return [{
      id: 'all', name: 'All', tone: 'dark',
      paths: drawing.layers.flatMap((l) => l.paths),
    }];
  }
  const buckets = { dark: [], mid: [], light: [] };
  for (const l of drawing.layers) buckets[l.tone || 'dark'].push(...l.paths);
  return [
    { id: 'tone-dark', name: 'Pen 1 — line & detail', tone: 'dark', paths: buckets.dark },
    { id: 'tone-mid', name: 'Pen 2 — engraving', tone: 'mid', paths: buckets.mid },
    { id: 'tone-light', name: 'Pen 3 — shading', tone: 'light', paths: buckets.light },
  ].filter((l) => l.paths.length);
}
