// Application shell: state, render scheduling, exports, and the headless hooks
// dev/shoot.mjs drives.

import { DEFAULTS, GROUPS, STYLE_PRESETS, pageSize, resolvedInscription } from './params.js';
import { Panel, encodeState, decodeState, randomSeed } from './ui.js';
import { SkullRenderer } from './gl/renderer.js';
import { composePlate, regroupLayers, planPlate, applyStylePreset } from './art/compose.js';
import { optimiseOrder, computeStats, formatDuration } from './plot/optimize.js';
import { toSvg, toGcode, toHpgl, downloadText } from './plot/exporters.js';
import { Preview } from './preview.js';

const el = (id) => document.getElementById(id);

const state = { ...DEFAULTS };
let renderer = null;
let preview = null;
let panel = null;
let current = null;          // { drawing, layers, stats }
let renderToken = 0;
let busy = false;
let queued = null;
let liveTimer = null;
let lastError = null;

/* ---------------------------------------------------------------- status --- */

function setStatus(text, progress = null) {
  el('status-text').textContent = text;
  const bar = el('progress-bar');
  if (progress === null) {
    bar.style.opacity = '0';
  } else {
    bar.style.opacity = '1';
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`;
  }
}

function setError(message) {
  const box = el('error-box');
  if (!message) { box.hidden = true; box.textContent = ''; return; }
  box.hidden = false;
  box.textContent = message;
}

/* ---------------------------------------------------------------- render --- */

/**
 * Renders are serialised. A request arriving mid-render replaces any other
 * waiting request (there is no value in drawing a superseded draft) but still
 * resolves once a render that reflects it has finished, so callers -- the
 * headless harness in particular -- can await a real result.
 */
function renderPlate(opts = {}) {
  if (busy) {
    if (!queued) queued = { opts, waiters: [] };
    else queued.opts = opts;
    return new Promise((resolve) => queued.waiters.push(resolve));
  }
  busy = true;
  return _renderPlate(opts).finally(() => {
    busy = false;
    if (queued) {
      const { opts: next, waiters } = queued;
      queued = null;
      renderPlate(next).then(() => waiters.forEach((w) => w()));
    }
  });
}

async function _renderPlate({ quick = false } = {}) {
  const token = ++renderToken;
  setError(null);
  lastError = null;

  try {
    const params = { ...state };
    if (quick) {
      // Draft pass: coarser raster, no stipple, cheap ordering.
      params.renderScale = Math.min(params.renderScale, 0.55);
      params.twoOpt = 0;
      params.stippleWeight = Math.min(params.stippleWeight, 0.4);
    }

    const drawing = await composePlate({
      renderer,
      params,
      onStage: (label, frac) => {
        if (token === renderToken) setStatus(label + '…', frac);
      },
    });
    if (token !== renderToken) return;

    drawing.stamp = token;
    setStatus('Ordering strokes…', 0.9);
    let layers = regroupLayers(drawing, state.layerSplit);
    if (state.optimize) {
      layers = layers.map((l) => ({ ...l, paths: optimiseOrder(l.paths, state.twoOpt || 1) }));
    }
    const stats = computeStats(layers, state);

    current = { drawing, layers, stats, quick };
    preview.setDrawing(drawing, layers);
    updateStats(stats, drawing);
    setStatus(quick ? 'Draft — press Render for the full plate' : 'Ready', null);
  } catch (err) {
    console.error(err);
    lastError = err;
    setError(`${err && err.message ? err.message : err}\n\n${(err && err.stack) || ''}`);
    setStatus('Failed', null);
  }
}

function scheduleLive() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => renderPlate({ quick: true }), 260);
}

function updateStats(stats, drawing) {
  const page = pageSize(state);
  el('stat-page').textContent = `${page.w.toFixed(0)} × ${page.h.toFixed(0)} mm`;
  el('stat-raster').textContent = `${drawing.fields.width} × ${drawing.fields.height} px`;
  const targets = el('stat-targets');
  targets.textContent = drawing.fields.targetConfig || '—';
  // A fallback configuration is worth noticing: two-pass modes march the scene
  // twice, and half-float slightly coarsens the engraving.
  const fallback = renderer.configIndex > 0;
  targets.title = fallback
    ? 'Fallback render targets — your GPU refused the preferred configuration.'
    : '';
  targets.style.color = fallback ? 'var(--gold)' : '';
  el('stat-strokes').textContent = stats.strokes.toLocaleString();
  el('stat-points').textContent = stats.points.toLocaleString();
  el('stat-draw').textContent = `${(stats.drawMm / 1000).toFixed(1)} m`;
  el('stat-travel').textContent = `${(stats.travelMm / 1000).toFixed(1)} m`;
  el('stat-time').textContent = formatDuration(stats.seconds);
  const list = el('layer-list');
  list.innerHTML = '';
  for (const l of current ? current.layers : []) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${l.name}</span><em>${l.paths.length.toLocaleString()}</em>`;
    list.appendChild(li);
  }
}

/* ---------------------------------------------------------------- export --- */

function baseName() {
  const seed = String(state.seed).replace(/[^a-z0-9_-]+/gi, '-');
  return `memento-mori-${seed}`;
}

function exportMeta() {
  const p = applyStylePreset(state);
  return {
    generator: 'alchemixt.app/memento-mori',
    seed: state.seed,
    page: `${pageSize(state).w.toFixed(1)} x ${pageSize(state).h.toFixed(1)} mm`,
    penWidth: `${p.penWidth} mm`,
    lineSpacing: `${p.lineSpacing} mm`,
    style: p.stylePreset,
    inscription: resolvedInscription(p),
    permalink: `${location.origin}${location.pathname}#${encodeState(state)}`,
  };
}

function exportSvgText() {
  if (!current) return '';
  return toSvg(current.drawing, current.layers, {
    penWidth: state.penWidth,
    title: resolvedInscription(state) || 'Memento mori',
    meta: exportMeta(),
  });
}

/* ------------------------------------------------------------------ init --- */

function readHash() {
  if (!location.hash || location.hash.length < 2) return;
  const parsed = decodeState(location.hash.slice(1));
  if (parsed) Object.assign(state, parsed);
}

function writeHash() {
  const h = encodeState(state);
  history.replaceState(null, '', h ? `#${h}` : location.pathname);
}

function markPreset() {
  const keys = new Set();
  if (state.stylePreset !== 'custom' && STYLE_PRESETS[state.stylePreset]) {
    for (const k of Object.keys(STYLE_PRESETS[state.stylePreset])) keys.add(k);
  }
  panel.markPresetDriven(keys);
}

function onParamChange(key, { live }) {
  // Nudging a line control means the user has left the preset behind.
  const preset = STYLE_PRESETS[state.stylePreset];
  if (preset && key in preset) {
    state.stylePreset = 'custom';
    panel.refresh();
  }
  if (key === 'stylePreset' && state.stylePreset !== 'custom') {
    Object.assign(state, STYLE_PRESETS[state.stylePreset]);
    panel.refresh();
  }
  if (key === 'page' || key === 'orientation' || key === 'inscription') panel.refresh();
  markPreset();
  writeHash();
  if (live) scheduleLive(); else renderPlate({ quick: true });
}

function bindToolbar() {
  el('btn-render').addEventListener('click', () => renderPlate({ quick: false }));
  el('btn-shuffle').addEventListener('click', () => {
    state.seed = randomSeed();
    panel.refresh();
    writeHash();
    renderPlate({ quick: true });
  });
  el('btn-svg').addEventListener('click', () => {
    if (!current) return;
    downloadText(`${baseName()}.svg`, exportSvgText(), 'image/svg+xml');
  });
  el('btn-gcode').addEventListener('click', () => {
    if (!current) return;
    downloadText(`${baseName()}.gcode`, toGcode(current.drawing, current.layers), 'text/plain');
  });
  el('btn-hpgl').addEventListener('click', () => {
    if (!current) return;
    downloadText(`${baseName()}.hpgl`, toHpgl(current.drawing, current.layers), 'text/plain');
  });
  el('btn-png').addEventListener('click', () => {
    if (!current) return;
    const a = document.createElement('a');
    a.href = preview.toDataURL();
    a.download = `${baseName()}-proof.png`;
    a.click();
  });
  el('btn-link').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#${encodeState(state)}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Permalink copied', null);
    } catch {
      setStatus(url, null);
    }
  });
  el('view-mode').addEventListener('change', (e) => preview.setMode(e.target.value));
  el('show-travel').addEventListener('change', (e) => preview.setShowTravel(e.target.checked));
  el('btn-panel-toggle').addEventListener('click', () => {
    document.body.classList.toggle('panel-hidden');
    setTimeout(() => preview.render(), 60);
  });
}

async function boot() {
  readHash();
  preview = new Preview(el('preview-canvas'));
  panel = new Panel(el('panel-body'), state, onParamChange);
  markPreset();
  bindToolbar();
  window.addEventListener('resize', () => preview && preview.render());

  try {
    renderer = new SkullRenderer();
  } catch (err) {
    setError(`${err.message}`);
    setStatus('Cannot start', null);
    window.__mm = { ready: false, error: String(err.message) };
    return;
  }

  window.__mm = {
    ready: true,
    hasPlate: () => !!current,
    state,
    async renderHeadless(overrides = {}) {
      Object.assign(state, overrides);
      panel.refresh();
      lastError = null;
      await renderPlate({ quick: false });
      if (!current) {
        throw new Error(`render failed: ${lastError ? `${lastError.message}\n${lastError.stack}` : 'unknown'}`);
      }
      return { stats: current.stats, plan: { raster: current.drawing.fields.width } };
    },
    exportSvg: () => exportSvgText(),
    exportGcode: () => toGcode(current.drawing, current.layers),
    plan: () => planPlate(state),
    targetConfig: () => (renderer.config ? renderer.config.id : 'none'),
    gpu: () => renderer.debugInfo,
    bounds: () => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, count = 0;
      for (const l of current.layers) {
        for (const path of l.paths) {
          for (const [x, y] of path) {
            count++;
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
          }
        }
      }
      return {
        count, x0, y0, x1, y1,
        pageW: current.drawing.widthMm, pageH: current.drawing.heightMm,
      };
    },
    setMode: (m) => preview.setMode(m),
    layerCounts: () => current.layers.map((l) => [l.name, l.paths.length]),
  };

  await renderPlate({ quick: true });
}

boot();
