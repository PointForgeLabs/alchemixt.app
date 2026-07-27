#!/usr/bin/env node
// Guards the invariant that broke five builds in a row.
//
// The renderer draws only to framebuffer objects and reads them back; the canvas
// exists solely to own the GL context. Resizing it makes ANGLE reallocate the
// D3D11 swap chain, and on some Intel drivers that leaves the context unable to
// complete ANY framebuffer afterwards while isContextLost() still reports false
// -- so allocations that succeeded at startup begin failing with
// FRAMEBUFFER_UNSUPPORTED at every size and format.
//
// This asserts the drawing buffer is never touched, and that framebuffer
// allocation still works after repeated renders at several different sizes.
//
//   node dev/canvasstate.mjs

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
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
await page.goto(`http://127.0.0.1:${port}/memento-mori/`);
await page.waitForFunction('window.__mm && window.__mm.ready === true', { timeout: 40000 });
await page.waitForFunction('window.__mm.hasPlate && window.__mm.hasPlate()', { timeout: 300000 });

let failures = 0;

// Several renders at different raster sizes, each forcing fresh allocation.
const sizes = [
  { page: 'a6', renderScale: 0.4 },
  { page: 'a5', renderScale: 0.5 },
  { page: 'a6', renderScale: 0.7 },
  { page: 'a5', renderScale: 0.4 },
];
const baseline = await page.evaluate(() => window.__mm.markBuildBaseline());
for (const s of sizes) {
  const r = await page.evaluate(async (o) => {
    try {
      const info = await window.__mm.renderHeadless(o);
      const c = window.__mm.glContext().canvas;
      return { ok: info.stats.strokes > 0, strokes: info.stats.strokes, cw: c.width, ch: c.height };
    } catch (err) {
      const c = window.__mm.glContext().canvas;
      return { ok: false, error: err.message.split('\n')[0], cw: c.width, ch: c.height };
    }
  }, s);
  // The drawing buffer must still be untouched.
  const untouched = r.cw === 8 && r.ch === 8;
  if (!r.ok || !untouched) failures++;
  console.log(`  ${r.ok && untouched ? 'ok  ' : 'FAIL'}  ${s.page}@${s.renderScale}  ` +
              `strokes=${r.ok ? r.strokes : '—'}  drawingBuffer=${r.cw}x${r.ch}` +
              (untouched ? '' : '  <-- CANVAS WAS RESIZED') + (r.ok ? '' : `  ${r.error}`));
}

// The invariant that matters most: nothing is reallocated after startup.
// Reallocating render targets mid-session is what failed on Intel Iris Xe, so the
// renderer claims them once and addresses sub-rectangles of that one buffer
// thereafter. This asserts the GL-object count never moves.
const allocs = await page.evaluate(() => window.__mm.buildCount());
if (allocs.after !== allocs.baseline) failures++;
console.log(`  ${allocs.after === allocs.baseline ? 'ok  ' : 'FAIL'}  ` +
            `render targets allocated once: ${allocs.baseline} at boot, ` +
            `${allocs.after} after ${allocs.renders} renders` +
            (allocs.after === allocs.baseline ? '' : '  <-- REALLOCATED'));

// And allocation must still be healthy after all that.
const live = await page.evaluate(() => {
  const before = window.__mm.gpu().probeResult;
  const now = window.__mm.reprobe();
  const bad = Object.entries(now).filter(([, v]) => v !== 'ok').map(([k, v]) => `${k}:${v}`);
  return { beforeOk: Object.values(before).every((v) => v === 'ok'), bad };
});
if (live.bad.length) failures++;
console.log(`  ${live.bad.length ? 'FAIL' : 'ok  '}  64x64 still allocates after repeated renders` +
            (live.bad.length ? `  refused: ${live.bad.join(' ')}` : ''));

if (errs.length) { failures++; console.log(`  page errors: ${errs.join(' | ')}`); }

await browser.close();
server.close();
console.log(failures ? `\n${failures} problem(s)` : '\ncontext stays healthy across renders; drawing buffer untouched');
process.exit(failures ? 1 : 0);
