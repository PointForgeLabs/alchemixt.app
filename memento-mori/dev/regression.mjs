#!/usr/bin/env node
// Reproduces the reported failure signature: render-target allocation that
// succeeds at first and is refused afterwards, so a tile size that demonstrably
// worked stops working part-way through a render. The renderer must fall back to
// a size that still allocates and finish the plate rather than giving up.
//
//   node dev/regression.mjs

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

// builds: how many allocations succeed before the driver starts refusing;
// width: what it will still accept afterwards.
const CASES = [
  { builds: 20, width: 64, label: 'refuses >64 once rendering is under way' },
  { builds: 20, width: 32, label: 'refuses >32 once rendering is under way' },
  { builds: 25, width: 16, label: 'refuses >16 once rendering is under way' },
];

let failures = 0;
for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.split('\n')[0]));
  await page.addInitScript((cfg) => { window.__MM_CAP_AFTER = cfg; }, c);
  await page.goto(`http://127.0.0.1:${port}/memento-mori/`);
  let out;
  try {
    await page.waitForFunction('window.__mm && window.__mm.ready === true', { timeout: 40000 });
    out = await page.evaluate(async () => {
      try {
        const info = await window.__mm.renderHeadless({ page: 'a6', renderScale: 0.5 });
        return { ok: info.stats.strokes > 0, strokes: info.stats.strokes, cfg: window.__mm.targetConfig() };
      } catch (err) {
        return { ok: false, error: err.message.split('\n')[0] };
      }
    });
  } catch (err) {
    out = { ok: false, error: err.message.split('\n')[0] };
  }
  if (!out.ok) failures++;
  console.log(`  ${out.ok ? 'ok  ' : 'FAIL'}  ${c.label.padEnd(44)} ` +
              (out.ok ? `${out.strokes} strokes via ${out.cfg}` : out.error));
  await page.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} case(s) still give up` : '\nrecovers from allocations that stop working mid-render');
process.exit(failures ? 1 : 0);
