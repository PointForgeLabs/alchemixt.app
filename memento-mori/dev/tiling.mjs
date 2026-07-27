#!/usr/bin/env node
// Verifies the tiled render path against the untiled one.
//
// Some drivers refuse a framebuffer far narrower than the limits they advertise
// (Intel Iris Xe via ANGLE/D3D11 rejects 1365 wide with multiple float targets
// while accepting 64), so the renderer bisects for a usable tile width and
// renders in columns. There is no such limit here, so __MM_MAX_TILE_WIDTH forces
// the same code path and the output is compared byte for byte: any seam,
// off-by-one in the scatter stride, or wrong tile origin shows up immediately.
//
//   node dev/tiling.mjs

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

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

// 0 = no cap. The rest force progressively more columns, including widths that
// do not divide the raster evenly so the last column is a partial tile.
const CAPS = [0, 512, 300, 137, 64];
const results = [];
let failures = 0;

for (const cap of CAPS) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript((c) => { if (c) window.__MM_MAX_TILE_WIDTH = c; }, cap);
  await page.goto(`http://127.0.0.1:${port}/memento-mori/`);
  try {
    await page.waitForFunction('window.__mm && window.__mm.ready === true', { timeout: 40000 });
    const info = await page.evaluate(() => window.__mm.renderHeadless({
      page: 'a5', renderScale: 0.7, seed: 'tile-compare',
    }));
    const cfg = await page.evaluate(() => window.__mm.targetConfig());
    const svg = await page.evaluate(() => window.__mm.exportSvg());
    results.push({ cap, cfg, strokes: info.stats.strokes, svg, errs });
    console.log(`  cap=${String(cap).padStart(4)}  ${cfg.padEnd(46)} strokes=${String(info.stats.strokes).padStart(5)}` +
                (errs.length ? `  ERRORS: ${errs.join(' | ')}` : ''));
    if (errs.length) failures++;
  } catch (err) {
    console.log(`  cap=${cap}  FAILED: ${err.message.split('\n').slice(0, 4).join(' ')}`);
    failures++;
  }
  await page.close();
}

const base = results.find((r) => r.cap === 0);
if (!base) {
  console.log('  no uncapped baseline to compare against');
  failures++;
} else {
  for (const r of results) {
    if (r === base) continue;
    const identical = r.svg === base.svg;
    if (!identical) failures++;
    console.log(`  cap=${String(r.cap).padStart(4)} vs uncapped: ${identical ? 'identical' : 'DIFFERS'}` +
                (identical ? '' : `  (${r.strokes} vs ${base.strokes} strokes)`));
  }
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} problem(s)` : '\ntiled output matches untiled exactly');
process.exit(failures ? 1 : 0);
