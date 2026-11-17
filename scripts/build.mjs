// Bundles the client with esbuild into dist/ (hashed assets) and writes index.html.
import * as esbuild from 'esbuild';
import { mkdirSync, rmSync, readFileSync, writeFileSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

export const buildOptions = {
  entryPoints: { app: join(root, 'client/src/main.jsx') },
  bundle: true,
  format: 'esm',
  splitting: false,
  target: ['es2022', 'chrome100', 'firefox100', 'safari16'],
  outdir: join(dist, 'assets'),
  entryNames: dev ? '[name]' : '[name]-[hash]',
  assetNames: '[name]-[hash]',
  loader: { '.woff2': 'file', '.woff': 'file', '.png': 'file', '.svg': 'text' },
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  metafile: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
  logLevel: 'warning',
};

function writeHtml(meta) {
  const outs = Object.keys(meta.outputs);
  const js = outs.find((f) => /assets\/app(-[A-Z0-9]+)?\.js$/i.test(f));
  const css = outs.find((f) => /assets\/app(-[A-Z0-9]+)?\.css$/i.test(f));
  const rel = (f) => f.slice(f.indexOf('assets/'));
  let html = readFileSync(join(root, 'client/index.html'), 'utf8');
  html = html.replace('<!--CSS-->', css ? `<link rel="stylesheet" href="/${rel(css)}">` : '');
  html = html.replace('<!--JS-->', `<script type="module" src="/${rel(js)}"></script>`);
  writeFileSync(join(dist, 'index.html'), html);
}

function copyPublic() {
  const pub = join(root, 'client/public');
  if (existsSync(pub)) for (const f of readdirSync(pub)) cpSync(join(pub, f), join(dist, f), { recursive: true });
}

if (!watch) {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, 'assets'), { recursive: true });
  const t0 = Date.now();
  const result = await esbuild.build(buildOptions);
  writeHtml(result.metafile);
  copyPublic();
  const js = Object.entries(result.metafile.outputs).filter(([f]) => f.endsWith('.js'));
  console.log(`built client in ${Date.now() - t0}ms →`, js.map(([f, o]) => `${f.split('/').pop()} ${(o.bytes / 1024).toFixed(0)} KB`).join(', '));
} else {
  mkdirSync(join(dist, 'assets'), { recursive: true });
  const ctx = await esbuild.context({
    ...buildOptions,
    plugins: [{
      name: 'html',
      setup(b) {
        b.onEnd((r) => {
          if (r.errors.length) return;
          writeHtml(r.metafile);
          copyPublic();
          console.log(`[build] rebuilt ${new Date().toLocaleTimeString()}`);
        });
      },
    }],
  });
  await ctx.watch();
  console.log('[build] watching client…');
}
