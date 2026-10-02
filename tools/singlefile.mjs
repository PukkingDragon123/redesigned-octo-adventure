// Build the game and inline everything (JS, CSS, fonts) into one HTML file.
// node tools/singlefile.mjs out.html
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const out = process.argv[2] || 'dist-single/index.html';
const dist = 'dist';
execSync('npx vite build --logLevel error', { stdio: 'inherit' });
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const mime = (f) => (f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.woff') ? 'font/woff' : f.endsWith('.ttf') ? 'font/ttf' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream');
const dataURI = (file) => `data:${mime(file)};base64,${fs.readFileSync(file).toString('base64')}`;
const inlineUrls = (css, baseDir) => css.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => {
  if (u.startsWith('data:') || u.startsWith('http') || u.startsWith('#')) return m;
  const f = path.join(baseDir, u.replace(/^\.\//, '').split('?')[0]);
  return fs.existsSync(f) ? `url(${dataURI(f)})` : m;
});
// stylesheets
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (m, href) => {
  const f = path.join(dist, href.replace(/^\.\//, ''));
  return `<style>${inlineUrls(fs.readFileSync(f, 'utf8'), path.dirname(f))}</style>`;
});
// inline <style> blocks in index.html (boot screen fonts)
html = html.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => `<style>${inlineUrls(css, dist)}</style>`);
// module scripts
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (m, src) => {
  const f = path.join(dist, src.replace(/^\.\//, ''));
  let js = fs.readFileSync(f, 'utf8');
  // fonts/images referenced from JS-imported CSS get emitted as asset URLs; inline them too
  js = js.replace(/"\.\/assets\/([^"]+\.(woff2|ttf|png))"/g, (mm, a) => `"${dataURI(path.join(dist, 'assets', a))}"`);
  return `<script type="module">${js.replace(/<\/script>/g, '<\\/script>')}</script>`;
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
