#!/usr/bin/env node
// Bundles the app into one self-contained HTML file that runs from file:// —
// ES modules are blocked by CORS when opened straight off disk, so the module
// graph is flattened into a tiny synchronous registry and the CSS is inlined.
//
//   node dev/bundle.mjs [outfile]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const outFile = process.argv[2] || path.join(here, 'out', 'memento-mori.html');

const ENTRY = 'js/main.js';

/* ------------------------------------------------------ module transform --- */

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gms;

function resolveSpec(fromId, spec) {
  const dir = path.dirname(fromId);
  const resolved = path.normalize(path.join(dir, spec)).split(path.sep).join('/');
  return resolved;
}

/** Rewrite one ES module into a registry factory body. */
function transform(id, src) {
  const exported = new Set();

  // import { a, b as c } from './x.js'  ->  const { a, b: c } = __req('x.js')
  let out = src.replace(IMPORT_RE, (_m, names, spec) => {
    const bindings = names
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const m = /^(\S+)\s+as\s+(\S+)$/.exec(s);
        return m ? `${m[1]}: ${m[2]}` : s;
      });
    return `const { ${bindings.join(', ')} } = __req('${resolveSpec(id, spec)}');`;
  });

  if (/^\s*import\s/m.test(out)) {
    throw new Error(`${id}: unhandled import form:\n` +
      out.split('\n').filter((l) => /^\s*import\s/.test(l)).join('\n'));
  }

  // Strip the `export` keyword and record what each declaration publishes.
  out = out.replace(/^export\s+(?!default)/gm, (m, offset) => {
    const rest = out.slice(offset + m.length);
    let n = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(rest)
         || /^class\s+([A-Za-z_$][\w$]*)/.exec(rest)
         || /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(rest);
    if (n) { exported.add(n[1]); return ''; }
    const list = /^\{([^}]*)\}\s*;?/.exec(rest);
    if (list) {
      for (const part of list[1].split(',')) {
        const t = part.trim();
        if (!t) continue;
        const asName = /^(\S+)\s+as\s+(\S+)$/.exec(t);
        exported.add(asName ? asName[2] : t);
      }
      return '/* re-export */ void ';
    }
    throw new Error(`${id}: cannot classify export near: ${rest.slice(0, 60)}`);
  });

  const publish = [...exported].map((n) => `  exports.${n} = ${n};`).join('\n');
  return `__def('${id}', function (exports, __req) {\n${out}\n${publish}\n});`;
}

/* ----------------------------------------------------------- module graph --- */

const modules = new Map();

function load(id) {
  if (modules.has(id)) return;
  const file = path.join(appRoot, id);
  if (!fs.existsSync(file)) throw new Error(`missing module: ${id}`);
  const src = fs.readFileSync(file, 'utf8');
  modules.set(id, transform(id, src));
  for (const m of src.matchAll(IMPORT_RE)) load(resolveSpec(id, m[2]));
}
load(ENTRY);

/* ------------------------------------------------------------------ shell --- */

const RUNTIME = `
// Minimal synchronous module registry, standing in for ES module resolution.
var __mods = {};
function __def(id, factory) { __mods[id] = { factory: factory, exports: null }; }
function __req(id) {
  var m = __mods[id];
  if (!m) throw new Error('missing module: ' + id);
  if (!m.exports) { m.exports = {}; m.factory(m.exports, __req); }
  return m.exports;
}
`;

let html = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'css', 'app.css'), 'utf8');

html = html
  .replace('<link rel="stylesheet" href="./css/app.css" />', `<style>\n${css}\n  </style>`)
  // Absolute site paths cannot resolve from disk, and there is no site to
  // navigate back to in a standalone file.
  .replace(/^\s*<link rel="icon"[^>]*>\n/m, '')
  .replace(/^\s*<link rel="canonical"[^>]*>\n/m, '')
  .replace(/\s*<a class="home"[\s\S]*?<\/a>\n/, '\n')
  // The webfonts are UI chrome only -- the plate is lettered with the built-in
  // single-stroke font. A file you downloaded should not need the network to
  // open, so drop them and let the CSS fall back to Georgia / system-ui /
  // ui-monospace.
  .replace(/^\s*<link rel="preconnect"[^>]*>\n/gm, '')
  .replace(/^\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>\n/gm, '')
  .replace(
    '<script type="module" src="./js/main.js"></script>',
    `<script>\n${RUNTIME}\n${[...modules.values()].join('\n\n')}\n\n__req('${ENTRY}');\n</script>`
  );

if (html.includes('type="module"') || html.includes('src="./js/')) {
  throw new Error('shell still references external scripts');
}
// Nothing may reach the network: the file has to open with the machine offline.
const remote = [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]*)"/g)].map((m) => m[1]);
if (remote.length) {
  throw new Error(`shell still fetches from the network:\n  ${remote.join('\n  ')}`);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`${outFile}  (${(html.length / 1024).toFixed(0)} KB, ${modules.size} modules)`);
