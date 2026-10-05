// Runs after `vite build` (see package.json "build"; ADR 0010). Writes the landing, log-in and
// sign-up pages as ready-made HTML, so a phone on a slow connection can show them before the
// app's JavaScript has arrived:
//   dist/index.html      the landing page (/)
//   dist/login.html      /login
//   dist/register.html   /register
//   dist/app.html        the plain page every other address gets (vercel.json); the app draws it
// The page code is built for Node first (`vite build --ssr`, into dist-ssr/).
// On "Fast 3G" every request costs at least 562 ms, so these pages also carry their styles
// inside the page (no separate stylesheet to wait for), and the app's code moves into
// <template id="kf-app">, which the small script in index.html starts once the page is drawn.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const ssr = join(root, 'dist-ssr');

// The page code expects a browser (it reads the address and saved settings when it starts).
// An empty page at a neutral address gives the defaults: English, the device's own colours.
const { window } = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://kaziforce.local/',
  pretendToBeVisual: true, // animation timers, which the animation library asks for on load
});
// Screen-size questions (asked by the animation library): "no" to all, like a plain phone.
window.matchMedia = (media) => ({
  matches: false,
  media,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
});
for (const key of [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'location',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'matchMedia',
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true });
}

const { PAGES, renderPage } = await import(pathToFileURL(join(ssr, 'prerender.js')).href);

const template = readFileSync(join(dist, 'index.html'), 'utf8');
const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

if (!template.includes('<div id="root"></div>') || !template.includes('<title>KaziForce</title>')) {
  throw new Error('prerender: dist/index.html does not look as expected');
}
writeFileSync(join(dist, 'app.html'), template);

const appTags = template.match(
  /<script type="module"[^>]*><\/script>|<link rel="modulepreload"[^>]*>/g,
);
const stylesheet = template.match(/<link rel="stylesheet"[^>]*href="\/(assets\/[^"]+\.css)"[^>]*>/);
const fontPreload = template.match(/<link rel="preload"[^>]*as="font"[^>]*>/);
if (!appTags?.length || !stylesheet) throw new Error('prerender: app files not found');
const css = readFileSync(join(dist, stylesheet[1]), 'utf8');

/** The plain page, with its styles inside it and the app's code started after drawing. */
let fastTemplate = template.replace(stylesheet[0], () => `<style>${css}</style>`);
// The font is found at once in the styles above, so it needs no separate early request.
if (fontPreload) fastTemplate = fastTemplate.replace(fontPreload[0], '');
for (const tag of appTags) fastTemplate = fastTemplate.replace(tag, '');
fastTemplate = fastTemplate.replace(
  '</body>',
  () => `  <template id="kf-app">${appTags.join('')}</template>
  </body>`,
);

for (const page of PAGES) {
  const { html, title } = renderPage(page);
  const out = fastTemplate
    // Tells the small script at the top of the page which address this copy was made for.
    .replace('<head>', `<head>\n    <meta name="kf-prerendered" content="${page.path}" />`)
    .replace('<title>KaziForce</title>', `<title>${escapeHtml(title)}</title>`)
    .replace(
      '<div id="root"></div>',
      () => `<div id="root"><div data-prerendered>${html}</div></div>`,
    );
  writeFileSync(join(dist, page.file), out);
  console.log(
    `prerender: ${page.path} -> dist/${page.file} (${(out.length / 1024).toFixed(1)} KB)`,
  );
}

rmSync(ssr, { recursive: true, force: true });
window.close(); // stops the animation timers, so the build can finish
process.exit(0);
