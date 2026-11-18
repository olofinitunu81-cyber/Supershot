// Builds SUPERSHOT as ONE self-contained HTML file that plays offline against bots:
// the game server runs inside the page. Output: dist-single/supershot.html
import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-single');
const shim = (f) => join(root, 'client/src/local/shims', f);
const alias = {
  name: 'offline-alias',
  setup(b) {
    b.onResolve({ filter: /^node:crypto$/ }, () => ({ path: shim('crypto.js') }));
    b.onResolve({ filter: /^node:util$/ }, () => ({ path: shim('util.js') }));
    b.onResolve({ filter: /^(node:(http|fs|path|url|zlib|sqlite)|ws)$/ }, () => ({ path: shim('node.js') }));
    b.onResolve({ filter: /^\.\/db\.js$/ }, (a) => (a.importer.includes(`${join('server', 'index.js')}`) ? { path: join(root, 'client/src/local/db.js') } : undefined));
  },
};
const t0 = Date.now();
const common = {
  bundle: true, target: ['es2022', 'chrome100', 'firefox100', 'safari16'], minify: true, legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}', 'process.argv': '[]' }, plugins: [alias], logLevel: 'error',
};
const wk = await esbuild.build({ ...common, entryPoints: [join(root, 'client/src/local/worker.js')], format: 'iife', write: false });
const workerSrc = wk.outputFiles[0].text;
const res = await esbuild.build({
  entryPoints: { app: join(root, 'client/src/local/main-local.js') },
  bundle: true, format: 'esm', write: false, outdir: out,
  target: ['es2022', 'chrome100', 'firefox100', 'safari16'],
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.png': 'dataurl', '.svg': 'text' },
  jsx: 'automatic', jsxImportSource: 'preact', minify: true, legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}', 'process.argv': '[]', __WORKER_SRC__: JSON.stringify(workerSrc) },
  plugins: [alias], logLevel: 'warning',
});
const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const cssFile = res.outputFiles.find((f) => f.path.endsWith('.css'));
const css = cssFile ? cssFile.text.replace(/<\/style/gi, '<\\/style') : '';
const body = `<title>SUPERSHOT</title>
<meta name="description" content="SUPERSHOT: a fast first-person arena shooter. This single-file edition runs entirely in your browser against bots.">
<style>${css}</style>
<style>html,body{margin:0;height:100%;background:#07060f;overflow:hidden}#boot{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#19e6ff;font:800 italic 28px system-ui,sans-serif;letter-spacing:.2em}</style>
<canvas id="game"></canvas>
<div id="ui"></div>
<div id="boot">SUPERSHOT</div>
<noscript>SUPERSHOT needs JavaScript and WebGL.</noscript>
<script type="module">${js}</script>
`;
mkdirSync(out, { recursive: true });
// full document for double-click play; fragment for hosting inside a page skeleton
writeFileSync(join(out, 'supershot.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}</body>\n</html>\n`);
writeFileSync(join(out, 'page.html'), body);
console.log(`single-file build in ${Date.now() - t0}ms → dist-single/supershot.html ${(js.length / 1024 / 1024).toFixed(2)} MB js (server worker ${(workerSrc.length / 1024).toFixed(0)} KB) + ${(css.length / 1024).toFixed(0)} KB css`);
