#!/usr/bin/env node
// Forces a real WebGL context loss mid-render and checks the app recovers.
//
// A lost context makes checkFramebufferStatus return FRAMEBUFFER_UNSUPPORTED for
// every check at every size and format -- indistinguishable from an unsupported
// configuration unless isContextLost() is consulted. This test pulls the context
// out from under a render via WEBGL_lose_context and asserts that the app
// diagnoses it correctly, rebuilds the renderer, and still produces a plate.
//
//   node dev/contextloss.mjs

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
page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message.split('\n')[0]}`));
await page.goto(`http://127.0.0.1:${port}/memento-mori/`);
await page.waitForFunction('window.__mm && window.__mm.ready === true', { timeout: 40000 });
await page.waitForFunction('window.__mm.hasPlate && window.__mm.hasPlate()', { timeout: 300000 });

let failures = 0;

// 1. A lost context must be reported as such, not as an unsupported format.
const diagnosis = await page.evaluate(() => {
  const gl = window.__mm.glContext();
  gl.getExtension('WEBGL_lose_context').loseContext();
  try {
    window.__mm.probeTargets(1365, 64);
    return 'no error';
  } catch (err) {
    return err.message.split('\n')[0];
  }
});
const diagnosedCorrectly = /context was lost|driver reset/i.test(diagnosis);
if (!diagnosedCorrectly) failures++;
console.log(`  lost-context diagnosis: "${diagnosis}"  ${diagnosedCorrectly ? 'ok' : 'WRONG — reads as a format problem'}`);

// 2. The app must recover on the next render.
const recovered = await page.evaluate(async () => {
  try {
    const info = await window.__mm.renderHeadless({ page: 'a6', renderScale: 0.4 });
    return { ok: info.stats.strokes > 0, strokes: info.stats.strokes };
  } catch (err) {
    return { ok: false, error: err.message.split('\n')[0] };
  }
});
if (!recovered.ok) failures++;
console.log(`  recovery after loss: ${recovered.ok ? `ok, ${recovered.strokes} strokes` : `FAILED — ${recovered.error}`}`);

await browser.close();
server.close();
console.log(failures ? `\n${failures} problem(s)` : '\ncontext loss is diagnosed and recovered from');
process.exit(failures ? 1 : 0);
