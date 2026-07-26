#!/usr/bin/env node
// Renders the same plate under every render-target configuration and compares
// the results. This is the only way to test the fallback paths: the GPU (or
// SwiftShader) normally accepts the first configuration, so two-pass and
// half-float modes would otherwise never run.
//
//   node dev/targets.mjs

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

const results = [];
let failures = 0;
for (const index of [0, 1, 2, 3]) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript((i) => { window.__MM_TARGETS = i; }, index);
  await page.goto(`http://127.0.0.1:${port}/memento-mori/`);
  try {
    await page.waitForFunction('window.__mm && window.__mm.ready === true', { timeout: 40000 });
    // Same seed for every configuration -- the point is to compare identical
    // input through different render targets.
    const info = await page.evaluate(() => window.__mm.renderHeadless({
      page: 'a6', renderScale: 0.4, seed: 'target-compare',
    }));
    const cfg = await page.evaluate(() => window.__mm.targetConfig());
    const svg = await page.evaluate(() => window.__mm.exportSvg());
    results.push({ index, cfg, strokes: info.stats.strokes, draw: info.stats.drawMm, svg });
    console.log(`  ${String(index)}  ${cfg.padEnd(24)} strokes=${String(info.stats.strokes).padStart(5)}` +
                `  draw=${(info.stats.drawMm / 1000).toFixed(2)}m` +
                (errs.length ? `  ERRORS: ${errs.join(' | ')}` : ''));
    if (errs.length) failures++;
  } catch (err) {
    console.log(`  ${index}  FAILED: ${err.message.split('\n').slice(0, 3).join(' ')}`);
    failures++;
  }
  await page.close();
}

// Every configuration renders the same seed, so 32-bit paths must agree exactly
// and the half-float paths should be close. A wildly different stroke count means
// a field is landing in the wrong place.
const base = results.find((r) => r.index === 0);
if (base) {
  for (const r of results) {
    if (r === base) continue;
    const exact = r.svg === base.svg;
    const drift = Math.abs(r.strokes - base.strokes) / Math.max(base.strokes, 1);
    const ok = r.cfg.includes('32F') ? exact : drift < 0.25;
    if (!ok) failures++;
    console.log(`  vs config 0: ${r.cfg.padEnd(24)} identical=${exact} strokeDrift=${(drift * 100).toFixed(1)}%` +
                (ok ? '' : '  <-- UNEXPECTED'));
  }
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} problem(s)` : '\nall target configurations agree');
process.exit(failures ? 1 : 0);
