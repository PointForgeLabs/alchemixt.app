// Single source of truth for every knob. The control panel, the URL state and
// the render pipeline all read this schema, so adding a parameter in one place
// makes it appear in the UI, in the permalink and in the exported metadata.

export const PAGES = {
  a6:      { label: 'A6  105 × 148 mm',      w: 105,  h: 148 },
  a5:      { label: 'A5  148 × 210 mm',      w: 148,  h: 210 },
  a4:      { label: 'A4  210 × 297 mm',      w: 210,  h: 297 },
  a3:      { label: 'A3  297 × 420 mm',      w: 297,  h: 420 },
  a2:      { label: 'A2  420 × 594 mm',      w: 420,  h: 594 },
  letter:  { label: 'Letter  8.5 × 11 in',   w: 215.9, h: 279.4 },
  legal:   { label: 'Legal  8.5 × 14 in',    w: 215.9, h: 355.6 },
  tabloid: { label: 'Tabloid  11 × 17 in',   w: 279.4, h: 431.8 },
  in5x7:   { label: 'Print  5 × 7 in',       w: 127,  h: 177.8 },
  in8x10:  { label: 'Print  8 × 10 in',      w: 203.2, h: 254 },
  in11x14: { label: 'Print  11 × 14 in',     w: 279.4, h: 355.6 },
  in12x16: { label: 'Print  12 × 16 in',     w: 304.8, h: 406.4 },
  in18x24: { label: 'Print  18 × 24 in',     w: 457.2, h: 609.6 },
  square:  { label: 'Square  200 × 200 mm',  w: 200,  h: 200 },
  custom:  { label: 'Custom…',               w: 210,  h: 297 },
};

export const INSCRIPTIONS = [
  'MEMENTO MORI',
  'SIC TRANSIT GLORIA MUNDI',
  'RESPICE FINEM',
  'HODIE MIHI CRAS TIBI',
  'VANITAS VANITATUM',
  'TEMPUS FUGIT',
  'OMNIA MORS AEQUAT',
  'PULVIS ET UMBRA SUMUS',
  'ARS LONGA VITA BREVIS',
  'NASCENTES MORIMUR',
  'QUOD FUI ES QUOD SUM ERIS',
  'ET IN ARCADIA EGO',
];

/* ------------------------------------------------------------- schema ---- */

const R = (key, label, min, max, step, def, extra = {}) =>
  ({ key, label, type: 'range', min, max, step, def, ...extra });
const S = (key, label, options, def, extra = {}) =>
  ({ key, label, type: 'select', options, def, ...extra });
const B = (key, label, def, extra = {}) => ({ key, label, type: 'toggle', def, ...extra });
const T = (key, label, def, extra = {}) => ({ key, label, type: 'text', def, ...extra });

export const GROUPS = [
  {
    id: 'composition',
    title: 'Plate & composition',
    controls: [
      { key: 'seed', label: 'Seed', type: 'seed', def: 'ossuary-01' },
      S('page', 'Paper', Object.entries(PAGES).map(([v, p]) => ({ v, label: p.label })), 'a3'),
      S('orientation', 'Orientation', [
        { v: 'portrait', label: 'Portrait' }, { v: 'landscape', label: 'Landscape' },
      ], 'portrait'),
      R('customW', 'Custom width', 40, 1200, 1, 210, { unit: 'mm', showIf: (p) => p.page === 'custom' }),
      R('customH', 'Custom height', 40, 1200, 1, 297, { unit: 'mm', showIf: (p) => p.page === 'custom' }),
      R('margin', 'Margin', 0, 80, 0.5, 18, { unit: 'mm' }),
      S('layout', 'Layout', [
        { v: 'plate', label: 'Engraved plate' },
        { v: 'gravestone', label: 'Gravestone arch' },
        { v: 'medallion', label: 'Oval medallion' },
        { v: 'bare', label: 'Bare — skull only' },
      ], 'plate'),
      S('frame', 'Frame', [
        { v: 'none', label: 'None' },
        { v: 'hairline', label: 'Hairline' },
        { v: 'double', label: 'Double rule' },
        { v: 'deco', label: 'Ruled with corner flourishes' },
        { v: 'shaded', label: 'Double rule, hatched border' },
      ], 'double'),
      S('vignette', 'Vignette', [
        { v: 'none', label: 'None' },
        { v: 'oval', label: 'Oval' },
        { v: 'circle', label: 'Circle' },
        { v: 'arch', label: 'Arch' },
        { v: 'feathered', label: 'Feathered edge' },
      ], 'none'),
      R('skullScale', 'Skull size', 0.35, 1.15, 0.005, 0.76, { hint: 'Fraction of the plate height' }),
      R('skullOffsetX', 'Skull offset X', -0.4, 0.4, 0.005, 0, {}),
      R('skullOffsetY', 'Skull offset Y', -0.4, 0.4, 0.005, -0.03, {}),
    ],
  },
  {
    id: 'skull',
    title: 'Cranium',
    controls: [
      R('yaw', 'Yaw', -180, 180, 1, -22, { unit: '°' }),
      R('pitch', 'Pitch', -60, 60, 1, 8, { unit: '°' }),
      R('roll', 'Roll', -30, 30, 1, -3, { unit: '°' }),
      R('perspective', 'Perspective', 0, 1, 0.01, 0.35, { hint: '0 = near-orthographic' }),
      R('craniumW', 'Cranial breadth', 0.82, 1.18, 0.005, 1),
      R('craniumH', 'Cranial height', 0.85, 1.2, 0.005, 1),
      R('craniumL', 'Cranial length', 0.85, 1.15, 0.005, 1),
      R('brow', 'Brow ridge', 0.3, 1.7, 0.01, 1),
      R('cheek', 'Zygomatic flare', 0.85, 1.15, 0.005, 1),
      R('orbitSize', 'Orbit size', 0.85, 1.15, 0.005, 1),
      R('orbitDepth', 'Orbit depth', 0, 1.6, 0.01, 1.15),
      R('nasalW', 'Nasal breadth', 0.7, 1.3, 0.01, 1),
      R('nasalH', 'Nasal height', 0.85, 1.15, 0.005, 1),
      B('jawPresent', 'Mandible', true),
      R('jawWidth', 'Jaw breadth', 0.85, 1.15, 0.005, 1),
      R('jawDrop', 'Jaw open', 0, 26, 0.5, 3, { unit: '°' }),
      R('teethWear', 'Tooth wear', 0, 1, 0.01, 0.25),
      R('teethMissing', 'Teeth lost', 0, 0.6, 0.01, 0.12),
      R('erosion', 'Erosion & pitting', 0, 1, 0.01, 0.22),
      R('asymmetry', 'Asymmetry', 0, 1, 0.01, 0.35),
      R('sutures', 'Cranial sutures', 0, 1, 0.01, 0.8),
      R('cracks', 'Cracks', 0, 1, 0.01, 0.3),
    ],
  },
  {
    id: 'light',
    title: 'Light',
    controls: [
      R('lightAzimuth', 'Key azimuth', -180, 180, 1, -38, { unit: '°' }),
      R('lightElevation', 'Key elevation', -60, 85, 1, 34, { unit: '°' }),
      R('lightSoft', 'Key softness', 0, 4, 0.05, 1.1),
      R('shadow', 'Cast shadow', 0, 1, 0.01, 0.72),
      R('fill', 'Sky fill', 0, 0.7, 0.01, 0.30),
      R('rim', 'Rim light', 0, 0.5, 0.01, 0.08),
      R('ao', 'Occlusion', 0, 1, 0.01, 0.9),
      R('cavity', 'Cavity shading', 0, 1.4, 0.01, 0.50),
      R('exposure', 'Exposure', 0.4, 2, 0.01, 1.02),
      R('contrast', 'Contrast', 0.5, 2.4, 0.01, 1.10),
      R('gamma', 'Gamma', 0.5, 2, 0.01, 0.95),
    ],
  },
  {
    id: 'line',
    title: 'Line work',
    controls: [
      S('stylePreset', 'Style', [
        { v: 'copperplate', label: 'Copperplate engraving' },
        { v: 'etching', label: 'Etching — free cross-hatch' },
        { v: 'woodcut', label: 'Woodcut — bold, few tones' },
        { v: 'stipple', label: 'Stipple' },
        { v: 'contour', label: 'Pure contour' },
        { v: 'technical', label: 'Technical — straight hatch' },
        { v: 'custom', label: 'Custom' },
      ], 'copperplate'),
      R('penWidth', 'Pen width', 0.03, 1.2, 0.01, 0.25, { unit: 'mm' }),
      R('lineSpacing', 'Engraving pitch', 0.25, 4, 0.01, 0.62, { unit: 'mm', hint: 'Gap between adjacent engraved lines' }),
      R('engraveWeight', 'Engraving', 0, 1.4, 0.01, 1, { hint: 'Form-following primary lines' }),
      R('crossWeight', 'Cross-hatch', 0, 1.4, 0.01, 0.9),
      R('hatchWeight', 'Shadow hatch', 0, 1.4, 0.01, 0.55),
      R('hatchAngle', 'Shadow hatch angle', -90, 90, 1, 34, { unit: '°' }),
      R('stippleWeight', 'Stipple', 0, 1.4, 0.01, 0),
      R('toneFloor', 'Darkest tone', 0, 0.5, 0.01, 0.03),
      R('toneCeil', 'Lightest tone', 0.4, 1.2, 0.01, 0.9),
      R('toneGamma', 'Tone response', 0.4, 2.5, 0.01, 1),
      R('dashSoftness', 'Line fade', 0, 1, 0.01, 0.62, { hint: 'Break lines into tapering dashes as tone lightens' }),
      R('contourWeight', 'Contours', 0, 1.6, 0.01, 1),
      R('contourThreshold', 'Contour sensitivity', 0.05, 1, 0.01, 0.34),
      R('silhouette', 'Silhouette weight', 0, 3, 0.05, 1.4, { hint: 'Extra passes around the outline' }),
      R('jitter', 'Hand jitter', 0, 1.5, 0.01, 0.35),
      R('simplifyTol', 'Simplify', 0, 0.4, 0.005, 0.045, { unit: 'mm' }),
      R('minSegment', 'Drop strokes under', 0, 3, 0.05, 0.5, { unit: 'mm' }),
    ],
  },
  {
    id: 'ornament',
    title: 'Ornament & lettering',
    controls: [
      S('inscription', 'Inscription', [
        ...INSCRIPTIONS.map((v) => ({ v, label: v })),
        { v: '__none', label: '— none —' },
        { v: '__custom', label: 'Custom…' },
      ], 'MEMENTO MORI'),
      T('inscriptionCustom', 'Custom inscription', 'MEMENTO MORI', { showIf: (p) => p.inscription === '__custom' }),
      T('subscript', 'Second line', '', { hint: 'Dates, a name, anything' }),
      R('textSize', 'Lettering size', 2, 22, 0.1, 7, { unit: 'mm' }),
      R('textTracking', 'Tracking', 0, 1.2, 0.01, 0.34),
      R('textArc', 'Arc lettering', -1, 1, 0.01, 0),
      S('botanical', 'Botanical', [
        { v: 'none', label: 'None' },
        { v: 'laurel', label: 'Laurel' },
        { v: 'wheat', label: 'Wheat' },
        { v: 'rose', label: 'Wilting rose' },
        { v: 'ivy', label: 'Ivy' },
        { v: 'palm', label: 'Crossed palms' },
      ], 'laurel'),
      B('hourglass', 'Hourglass', false),
      B('wings', 'Winged skull', false),
      B('rosette', 'Rosette', false),
      B('crossbones', 'Crossed bones', false),
    ],
  },
  {
    id: 'plot',
    title: 'Plotter output',
    controls: [
      R('renderScale', 'Render detail', 0.5, 2.2, 0.05, 1, { hint: 'Raster resolution feeding the line extractor' }),
      B('optimize', 'Optimise pen travel', true),
      R('chainTol', 'Weld endpoints within', 0, 0.8, 0.01, 0.15, { unit: 'mm' }),
      R('twoOpt', 'Reorder effort', 0, 3, 1, 1, { hint: 'Higher spends longer shortening pen-up travel' }),
      S('layerSplit', 'Layers', [
        { v: 'pass', label: 'One layer per pass' },
        { v: 'single', label: 'Single layer' },
        { v: 'tone', label: 'Split by tone (multi-pen)' },
      ], 'pass'),
      B('registration', 'Registration marks', false),
      R('plotSpeed', 'Plot speed', 20, 400, 5, 120, { unit: 'mm/s', hint: 'Only used for the time estimate' }),
      R('penUpSpeed', 'Pen-up speed', 40, 800, 10, 260, { unit: 'mm/s' }),
      R('penLiftMs', 'Pen lift', 0, 400, 5, 90, { unit: 'ms' }),
    ],
  },
];

/* ------------------------------------------------------------ presets ---- */

export const STYLE_PRESETS = {
  copperplate: {
    lineSpacing: 0.62, engraveWeight: 1, crossWeight: 0.9, hatchWeight: 0.55,
    stippleWeight: 0, dashSoftness: 0.62, contourWeight: 1, silhouette: 1.4,
    jitter: 0.35, toneGamma: 1, hatchAngle: 34,
  },
  etching: {
    lineSpacing: 0.72, engraveWeight: 0.45, crossWeight: 1.15, hatchWeight: 1.15,
    stippleWeight: 0.15, dashSoftness: 0.8, contourWeight: 0.85, silhouette: 0.8,
    jitter: 0.9, toneGamma: 1.1, hatchAngle: 42,
  },
  woodcut: {
    lineSpacing: 1.35, engraveWeight: 1.2, crossWeight: 0.35, hatchWeight: 0.5,
    stippleWeight: 0, dashSoftness: 0.25, contourWeight: 1.5, silhouette: 2.6,
    jitter: 0.2, toneGamma: 0.7, hatchAngle: 28,
  },
  stipple: {
    lineSpacing: 0.9, engraveWeight: 0, crossWeight: 0, hatchWeight: 0,
    stippleWeight: 1.2, dashSoftness: 0.5, contourWeight: 0.9, silhouette: 1,
    jitter: 0.3, toneGamma: 1.15, hatchAngle: 34,
  },
  contour: {
    lineSpacing: 1.1, engraveWeight: 0, crossWeight: 0, hatchWeight: 0,
    stippleWeight: 0, dashSoftness: 0, contourWeight: 1.5, silhouette: 1.8,
    jitter: 0.25, toneGamma: 1, hatchAngle: 34,
  },
  technical: {
    lineSpacing: 0.55, engraveWeight: 0, crossWeight: 0.6, hatchWeight: 1.3,
    stippleWeight: 0, dashSoftness: 0.15, contourWeight: 1.1, silhouette: 1,
    jitter: 0, toneGamma: 1, hatchAngle: 45,
  },
};

/* ----------------------------------------------------------- defaults ---- */

export const ALL_CONTROLS = GROUPS.flatMap((g) => g.controls);

export const DEFAULTS = Object.freeze(
  ALL_CONTROLS.reduce((acc, c) => { acc[c.key] = c.def; return acc; }, {
    // Derived at render time, kept here so the renderer can be driven directly.
    framingMm: 250,
    targetY: -14,
    seedNum: 1,
  })
);

export function controlByKey(key) {
  return ALL_CONTROLS.find((c) => c.key === key);
}

/** Page size in mm after orientation and custom overrides. */
export function pageSize(p) {
  const base = PAGES[p.page] || PAGES.a3;
  let w = p.page === 'custom' ? p.customW : base.w;
  let h = p.page === 'custom' ? p.customH : base.h;
  if (p.orientation === 'landscape') [w, h] = [h, w];
  return { w, h };
}

export function resolvedInscription(p) {
  if (p.inscription === '__none') return '';
  if (p.inscription === '__custom') return p.inscriptionCustom || '';
  return p.inscription;
}
