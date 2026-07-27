#!/usr/bin/env node
// Robustness checks. Drives the app through awkward parameter combinations and
// asserts that each one still produces a plate whose geometry lands on the page.
// Renders small on purpose -- this is about not breaking, not about looking good.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

async function loadPlaywright() {
  try { return (await import('playwright')).chromium; } catch {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const mod = await import(pathToFileURL(path.join(root, 'playwright', 'index.js')).href);
    return mod.chromium || mod.default?.chromium;
  }
}
const chromium = await loadPlaywright();

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

const CASES = [
  ['custom tiny page', { page: 'custom', customW: 80, customH: 80, margin: 2, textSize: 4 }],
  ['zero margin, no frame', { margin: 0, frame: 'none', vignette: 'none' }],
  ['no inscription at all', { inscription: '__none', subscript: '', botanical: 'none' }],
  ['oval vignette', { vignette: 'oval', frame: 'deco' }],
  ['arch vignette', { vignette: 'arch', frame: 'hairline' }],
  ['circle vignette', { vignette: 'circle', skullScale: 1.1 }],
  ['landscape', { orientation: 'landscape', page: 'a5' }],
  ['back of the head', { yaw: 178, pitch: -10 }],
  ['looking up', { pitch: -48, yaw: 0 }],
  ['jaw wide open', { jawDrop: 26, teethMissing: 0.55 }],
  ['no mandible, no teeth', { jawPresent: false, teethMissing: 0.6 }],
  ['extremes low', {
    craniumW: 0.82, craniumH: 0.85, craniumL: 0.85, brow: 0.3, cheek: 0.85,
    orbitSize: 0.85, orbitDepth: 0, nasalW: 0.7, nasalH: 0.85, jawWidth: 0.85,
    erosion: 0, asymmetry: 0, sutures: 0, cracks: 0,
  }],
  ['extremes high', {
    craniumW: 1.18, craniumH: 1.2, craniumL: 1.15, brow: 1.7, cheek: 1.15,
    orbitSize: 1.15, orbitDepth: 1.6, nasalW: 1.3, nasalH: 1.15, jawWidth: 1.15,
    erosion: 1, asymmetry: 1, sutures: 1, cracks: 1,
  }],
  ['coarse pitch, fat pen', { lineSpacing: 4, penWidth: 1.2, minSegment: 3 }],
  ['fine pitch, fine pen', { lineSpacing: 0.25, penWidth: 0.03, renderScale: 0.5 }],
  ['everything on', {
    wings: true, crossbones: true, hourglass: true, rosette: true, registration: true,
    botanical: 'palm', subscript: 'MMXXVI', textArc: 0.4, stippleWeight: 0.6,
  }],
  ['long custom inscription', {
    inscription: '__custom',
    inscriptionCustom: 'Quod fui es, quod sum eris. 1642–1719 & co. (iii)',
  }],
  ['tone split, max opt', { layerSplit: 'tone', twoOpt: 3 }],
  ['single layer, no opt', { layerSplit: 'single', optimize: false }],
];

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${port}/memento-mori/`);
await page.waitForFunction('window.__mm && window.__mm.ready === true', { timeout: 40000 });

let failures = 0;
try {
  for (const [name, overrides] of CASES) {
    const before = errors.length;
    let result;
    try {
      result = await page.evaluate(async (o) => {
        // Reset to defaults so cases cannot leak into each other.
        const { DEFAULTS } = await import('./js/params.js');
        Object.assign(window.__mm.state, DEFAULTS, { page: 'a6', renderScale: 0.4 }, o);
        const info = await window.__mm.renderHeadless({});
        const svg = window.__mm.exportSvg();
        const d = window.__mm.bounds();
        return { stats: info.stats, svgLen: svg.length, bounds: d, svgOk: svg.includes('</svg>') };
      }, overrides);
    } catch (err) {
      console.log(`  FAIL  ${name}: ${err.message.split('\n')[0]}`);
      failures++;
      continue;
    }
    const b = result.bounds;
    const onPage = b.count === 0 ||
      (b.x0 >= -0.6 && b.y0 >= -0.6 && b.x1 <= b.pageW + 0.6 && b.y1 <= b.pageH + 0.6);
    const ok = result.svgOk && result.stats.strokes > 0 && onPage &&
      errors.length === before && Number.isFinite(result.stats.drawMm);
    if (!ok) failures++;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(24)} ` +
      `strokes=${String(result.stats.strokes).padStart(5)} ` +
      `bbox=[${b.x0.toFixed(1)},${b.y0.toFixed(1)} ${b.x1.toFixed(1)},${b.y1.toFixed(1)}] ` +
      `page=${b.pageW}x${b.pageH}` +
      (errors.length > before ? `  errors: ${errors.slice(before).join(' | ')}` : '') +
      (onPage ? '' : '  OFF PAGE')
    );
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failures ? `\n${failures} failing case(s)` : '\nall cases passed');
process.exit(failures ? 1 : 0);
