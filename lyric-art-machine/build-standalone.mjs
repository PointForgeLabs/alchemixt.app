/**
 * Builds a single self-contained HTML file that runs straight from disk.
 *
 * Bundled from the same `src/` the dev build uses, so the standalone file can
 * never drift from the real source. Output is a classic (non-module) script:
 * browsers refuse to load ES modules over file://, and this file's whole point
 * is being opened with a double-click.
 */

import * as esbuild from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(root, 'interpretive-art-machine.html');

const bundle = await esbuild.build({
  stdin: {
    // Skips main.ts because that file imports CSS; the styles are inlined below.
    contents: `import { mountApp } from './src/ui/app';\nmountApp();`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'none',
  write: false,
});

const js = bundle.outputFiles[0].text;
const css = await readFile(resolve(root, 'src/styles.css'), 'utf8');
const html = await readFile(resolve(root, 'index.html'), 'utf8');

// `</script>` inside a string literal would close the tag early.
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const standalone = html
  .replace('<link rel="stylesheet" href="/src/styles.css" />', `<style>\n${css}\n    </style>`)
  .replace(
    '<script type="module" src="/src/main.ts"></script>',
    `<script>\n${safeJs}\n    </script>`,
  )
  .replace(
    '</title>',
    `</title>\n    <!-- Self-contained build. Open directly in a browser; nothing to install. -->`,
  );

if (standalone.includes('/src/main.ts') || standalone.includes('/src/styles.css')) {
  throw new Error('Standalone build still references external files.');
}

await writeFile(OUT, standalone, 'utf8');
console.log(`Wrote ${OUT} (${(standalone.length / 1024).toFixed(1)} KB)`);
