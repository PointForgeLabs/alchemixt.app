#!/usr/bin/env node
// Drives the single-file bundle over a real file:// URL -- the only thing the
// user actually opens. A bundle can pass every module test and still be broken
// off disk: no server means no CORS-eligible module loading, no fetch, and a
// different origin for anything the page tries to reach.
//
// Also runs the degrading-driver simulation here rather than only against the
// module build, because the allocate-once invariant is what the bundle has to
// carry and a bundling mistake could plausibly duplicate the renderer.
//
//   node dev/standalone.mjs [bundle.html]

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
const bundle = path.resolve(process.argv[2] || path.join(here, 'out', 'memento-mori.html'));
if (!fs.existsSync(bundle)) {
  console.error(`no bundle at ${bundle} -- run: node dev/bundle.mjs dev/out/memento-mori.html`);
  process.exit(1);
}
const url = pathToFileURL(bundle).href;

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

let failures = 0;
const ok = (pass, msg) => { if (!pass) failures++; console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${msg}`); };

async function open(init) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 } });
  // Hermetic: the shell asks for a webfont, and file:// has no network here.
  await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
  if (init) await page.addInitScript(init);
  await page.goto(url);
  await page.waitForFunction('window.__mm && window.__mm.ready !== undefined', { timeout: 40000 });
  return { page, errs };
}

/* --------------------------------------------------- 1. it opens and draws --- */

console.log('=== healthy driver ===');
{
  const { page, errs } = await open();
  ok(await page.evaluate(() => window.__mm.ready === true),
     `boots from file:// (${await page.evaluate(() => window.__mm.error || 'no error')})`);

  const gpu = await page.evaluate(() => window.__mm.gpu());
  console.log(`  renderer: ${gpu.renderer}`);
  await page.evaluate(() => window.__mm.markBuildBaseline());

  const sizes = [
    { page: 'a6', renderScale: 0.4 },
    { page: 'a5', renderScale: 0.4 },
    { page: 'square150', renderScale: 0.5 },
    { page: 'a6', renderScale: 0.6 },
  ];
  let strokes = 0;
  for (const s of sizes) {
    const info = await page.evaluate((o) => window.__mm.renderHeadless(o), { ...s, seed: 'standalone' });
    strokes = info.stats.strokes;
  }
  ok(strokes > 500, `renders line work (${strokes} strokes on the last plate)`);

  // The invariant the audit produced: allocation happens once, at construction.
  const builds = await page.evaluate(() => window.__mm.buildCount());
  ok(builds.after === builds.baseline,
     `render targets allocated once: ${builds.baseline} at boot, ${builds.after} after ${sizes.length} renders`);

  const alloc = await page.evaluate(() => window.__mm.allocation());
  const cfg = await page.evaluate(() => window.__mm.targetConfig());
  console.log(`  allocated ${alloc.w}x${alloc.h}, config ${cfg}, tile budget ${await page.evaluate(() => window.__mm.tileBudget())}`);

  const canvas = await page.evaluate(() => {
    const gl = window.__mm.glContext();
    return { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight, lost: gl.isContextLost() };
  });
  ok(canvas.w === 8 && canvas.h === 8 && !canvas.lost,
     `canvas untouched and context healthy (${canvas.w}x${canvas.h}, lost=${canvas.lost})`);

  const svg = await page.evaluate(() => window.__mm.exportSvg());
  ok(svg.startsWith('<?xml') && svg.includes('inkscape:label="1-Contour"') && svg.includes('mm"'),
     `SVG export is well formed and layered (${(svg.length / 1024).toFixed(0)} KB)`);
  const gcode = await page.evaluate(() => window.__mm.exportGcode());
  ok(gcode.includes('G21') && gcode.includes('G90'), 'G-code export carries its preamble');

  ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  await page.screenshot({ path: path.join(here, 'out', 'standalone.png') });
  await page.close();
}

/* ------------------------------------------- 2. the driver that degrades --- */
// Reproduces the user's signature: allocation works at boot, then every
// allocation is refused. Allocate-once means the render path never asks again,
// so this must now be a non-event rather than a fatal error.

console.log('\n=== driver that stops allocating after boot ===');
{
  const { page, errs } = await open();
  ok(await page.evaluate(() => window.__mm.ready === true),
     `still boots (${await page.evaluate(() => window.__mm.error || 'no error')})`);
  await page.evaluate(() => window.__mm.markBuildBaseline());
  // Switched on only now, once construction has finished: the fault under test
  // is a driver that allocates happily at boot and refuses everything
  // afterwards. Setting it before boot would poison the startup probe instead,
  // which is a different (and correctly fatal) failure.
  await page.evaluate(() => { window.__MM_CAP_AFTER = { builds: 0, width: 0 }; });

  let last = null, thrown = null;
  try {
    for (const s of [{ page: 'a6', renderScale: 0.4 }, { page: 'a4', renderScale: 0.35 }]) {
      last = await page.evaluate((o) => window.__mm.renderHeadless(o), { ...s, seed: 'degraded' });
    }
  } catch (err) { thrown = err.message.split('\n')[0]; }

  ok(!thrown, `renders anyway with allocation refused${thrown ? `: ${thrown}` : ''}`);
  ok(last && last.stats.strokes > 500, `line work still produced (${last ? last.stats.strokes : 0} strokes)`);
  const builds = await page.evaluate(() => window.__mm.buildCount());
  ok(builds.after === builds.baseline, `never re-allocated (${builds.baseline} -> ${builds.after})`);
  ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  await page.screenshot({ path: path.join(here, 'out', 'standalone-degraded.png') });
  await page.close();
}

/* ------------------------------------------------- 3. narrow tiles only --- */
// The other half of the report: the driver refuses wide allocations outright.
// The ladder has to find something narrow at construction and keep working.

console.log('\n=== driver that refuses anything wider than 32px ===');
{
  const { page, errs } = await open(() => { window.__MM_MAX_TILE_WIDTH = 32; });
  ok(await page.evaluate(() => window.__mm.ready === true),
     `boots on a narrow-only driver (${await page.evaluate(() => window.__mm.error || 'no error')})`);
  const alloc = await page.evaluate(() => window.__mm.allocation());
  ok(alloc && alloc.w <= 32, `allocated within the cap (${alloc ? `${alloc.w}x${alloc.h}` : 'none'})`);
  const info = await page.evaluate(() => window.__mm.renderHeadless({ page: 'a6', renderScale: 0.35, seed: 'narrow' }));
  ok(info.stats.strokes > 500, `renders in narrow columns (${info.stats.strokes} strokes)`);
  ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} problem(s)` : '\nstandalone bundle works from file://');
process.exit(failures ? 1 : 0);
