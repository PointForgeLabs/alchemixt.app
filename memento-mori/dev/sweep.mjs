#!/usr/bin/env node
// Renders a batch of variants in one browser session and writes a contact sheet
// plus the individual PNGs. Used to check that every style preset, frame and
// vignette actually produces something plottable.
//
//   node dev/sweep.mjs presets
//   node dev/sweep.mjs ui

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

const mode = process.argv[2] || 'presets';
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

const VARIANTS = {
  presets: [
    ['copperplate', { stylePreset: 'copperplate' }],
    ['etching', { stylePreset: 'etching' }],
    ['woodcut', { stylePreset: 'woodcut' }],
    ['stipple', { stylePreset: 'stipple' }],
    ['contour', { stylePreset: 'contour' }],
    ['technical', { stylePreset: 'technical' }],
  ],
  stipple: [
    ['stipple', { stylePreset: 'stipple' }],
  ],
  motifs: [
    ['bones', { frame: 'double', crossbones: true, botanical: 'none' }],
    ['wings', { frame: 'hairline', wings: true, botanical: 'none', inscription: 'RESPICE FINEM' }],
  ],
  layouts: [
    ['deco-oval', { frame: 'deco', vignette: 'oval', botanical: 'wheat' }],
    ['arch-stone', { frame: 'hairline', vignette: 'arch', botanical: 'ivy', inscription: 'HODIE MIHI CRAS TIBI' }],
    ['shaded-wings', { frame: 'shaded', wings: true, botanical: 'none', inscription: 'RESPICE FINEM' }],
    ['bones', { frame: 'double', crossbones: true, botanical: 'none', hourglass: true }],
    ['rose-profile', { yaw: -78, pitch: 2, botanical: 'rose', inscription: 'TEMPUS FUGIT' }],
    ['bare-jawless', { frame: 'none', jawPresent: false, botanical: 'none', inscription: '__none', skullScale: 0.95 }],
  ],
};

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/memento-mori/`);
await page.waitForFunction('window.__mm && window.__mm.ready === true', { timeout: 40000 });

try {
  if (mode === 'ui') {
    await page.waitForFunction('window.__mm.hasPlate && window.__mm.hasPlate()', { timeout: 180000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, 'ui.png') });
    console.log(path.join(outDir, 'ui.png'));
  } else {
    const base = { page: 'a5', renderScale: 0.5, margin: 12 };
    for (const [name, overrides] of VARIANTS[mode]) {
      const info = await page.evaluate((o) => window.__mm.renderHeadless(o), { ...base, ...overrides });
      const counts = await page.evaluate(() => window.__mm.layerCounts());
      const file = path.join(outDir, `${mode}-${name}.png`);
      await page.locator('#preview-wrap').screenshot({ path: file });
      console.log(`${name.padEnd(14)} strokes=${String(info.stats.strokes).padStart(6)} ` +
                  `draw=${(info.stats.drawMm / 1000).toFixed(1)}m  ${JSON.stringify(counts)}`);
    }
  }
} finally {
  await browser.close();
  server.close();
}
