#!/usr/bin/env node
// Headless render harness. Serves the repository, drives a page in Chromium and
// writes PNGs (probe) or SVGs (app) to disk. Useful both for tuning the anatomy
// and for batch-generating plates without touching the browser.
//
//   node dev/shoot.mjs probe out/           # G-buffer inspection sheet
//   node dev/shoot.mjs probe out/ '{"yaw":0,"pitch":0}'
//   node dev/shoot.mjs plate out/ '{"seed":"x"}'   # full line-art plate + SVG

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

// Playwright may only be installed globally in this environment.
async function loadPlaywright() {
  try {
    return (await import('playwright')).chromium;
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const url = pathToFileURL(path.join(globalRoot, 'playwright', 'index.js')).href;
    const mod = await import(url);
    return (mod.chromium || mod.default?.chromium);
  }
}
const chromium = await loadPlaywright();

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf',
};

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(root, rel);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const [mode = 'probe', outDir = path.join(here, 'out'), overridesJson = '{}'] = process.argv.slice(2);
const overrides = JSON.parse(overridesJson);
fs.mkdirSync(outDir, { recursive: true });

const { server, port } = await serve();
const browser = await chromium.launch({
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--disable-lcd-text',
  ],
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1200 } });
await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning' || /\[dev\]/.test(m.text())) {
    console.log(`  [page:${m.type()}] ${m.text()}`);
  }
});
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);

try {
  if (mode === 'probe') {
    await page.goto(`http://127.0.0.1:${port}/memento-mori/dev/probe.html`);
    await page.waitForFunction('window.__ready === true', { timeout: 20000 });
    const w = overrides.__w || 260;
    const h = overrides.__h || 340;
    delete overrides.__w; delete overrides.__h;
    const info = await page.evaluate(
      ([o, w, h]) => window.__probe(o, w, h),
      [overrides, w, h]
    );
    console.log(`  rendered ${info.w}x${info.h} in ${info.ms}ms`);
    const out = path.join(outDir, `probe-${stamp}.png`);
    await page.locator('#out').screenshot({ path: out });
    const err = await page.locator('#err').textContent();
    if (err && err.trim()) console.log(`  errors:${err}`);
    console.log(out);
  } else {
    await page.goto(`http://127.0.0.1:${port}/memento-mori/`);
    await page.waitForFunction('window.__mm && window.__mm.ready === true', { timeout: 30000 });
    const info = await page.evaluate((o) => window.__mm.renderHeadless(o), overrides);
    console.log(`  ${JSON.stringify(info.stats)}`);
    const png = path.join(outDir, `plate-${stamp}.png`);
    await page.locator('#preview-wrap').screenshot({ path: png });
    const svg = await page.evaluate(() => window.__mm.exportSvg());
    fs.writeFileSync(path.join(outDir, `plate-${stamp}.svg`), svg);
    console.log(png);
    console.log(path.join(outDir, `plate-${stamp}.svg`));
  }
} finally {
  await browser.close();
  server.close();
}
