// Bundle report: how much a first visit downloads (compressed with gzip, as servers send it),
// and proof that Three.js (no longer used since the design refresh) never comes back.
//
// Run after `vite build` (use `npm run build:report`). Writes dist/bundle-report.md and exits
// with an error if a rule is broken, so CI fails too.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const APP_SHELL_BUDGET_KB = 200; // PRD NFR-1: app shell JS <= ~200 KB gzipped

const chunks = JSON.parse(readFileSync(join(DIST, 'bundle-report.json'), 'utf8'));
const byFile = new Map(chunks.map((c) => [c.file, c]));

const gzipKb = (file) => gzipSync(readFileSync(join(DIST, file))).length / 1024;
const rawKb = (file) => readFileSync(join(DIST, file)).length / 1024;

/** A chunk plus everything it statically imports (what the browser must download together). */
function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const imported of byFile.get(file)?.imports ?? []) closure(imported, seen);
  return seen;
}

function chunkFor(sourceSuffix) {
  const chunk = chunks.find((c) => c.facade?.endsWith(sourceSuffix));
  if (!chunk) throw new Error(`No chunk found for ${sourceSuffix}`);
  return chunk.file;
}

const union = (...sets) => new Set(sets.flatMap((s) => [...s]));
const containsLibrary = (files, lib) =>
  [...files].filter((f) => byFile.get(f).modules.some((m) => m.includes(`/node_modules/${lib}/`)));
const sum = (files) => [...files].reduce((total, f) => total + gzipKb(f), 0);

const entry = chunks.find((c) => c.isEntry).file;
const entrySet = closure(entry);
const appShell = union(entrySet, closure(chunkFor('src/app/appRoutes.tsx')));
const landing = union(entrySet, closure(chunkFor('src/features/landing/LandingPage.tsx')));

const motionAll = closure(chunkFor('src/lib/motionFeatures.ts'));
const motionEngine = new Set([...motionAll].filter((f) => !appShell.has(f)));

// socket.io-client (live alerts) is downloaded only after logging in.
const liveAll = new Set(
  chunks
    .filter((c) => c.modules.some((m) => m.includes('/node_modules/socket.io-client/')))
    .flatMap((c) => [...closure(c.file)]),
);
const live = new Set([...liveAll].filter((f) => !appShell.has(f)));

const cssFiles = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.css'));
const cssKb = cssFiles.reduce((t, f) => t + gzipKb(`assets/${f}`), 0);
const fontFiles = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.woff2'));
// The design refresh's two fonts (Latin letters): Figtree for text, Bricolage Grotesque for
// headings. The other letter styles in Settings download only when someone picks one.
const brandFonts = fontFiles.filter((f) => /^(figtree|bricolage)/.test(f));
const fontKb = brandFonts.reduce((t, f) => t + rawKb(`assets/${f}`), 0);

const rows = [
  ['App shell (first visit to /worker/alerts)', appShell],
  ['Animation engine, extra (app only, loaded right after the first paint)', motionEngine],
  ['Live connection for new alerts, extra (loaded after logging in)', live],
  ['Landing page (first visit to /)', landing],
];

const problems = [];
const threeInApp = containsLibrary(appShell, 'three');
const threeInLanding = containsLibrary(landing, 'three');
const gsapInApp = containsLibrary(appShell, 'gsap');
const socketInApp = containsLibrary(appShell, 'socket.io-client');
if (socketInApp.length)
  problems.push(`socket.io-client found in the app shell: ${socketInApp.join(', ')}`);
if (!live.size) problems.push('socket.io-client chunk not found (report is wrong?)');
if (threeInApp.length) problems.push(`Three.js found in the app bundle: ${threeInApp.join(', ')}`);
if (threeInLanding.length)
  problems.push(
    `Three.js found in the landing page's first download: ${threeInLanding.join(', ')}`,
  );
if (gsapInApp.length) problems.push(`GSAP found in the app bundle: ${gsapInApp.join(', ')}`);
const appShellKb = sum(appShell);
if (appShellKb > APP_SHELL_BUDGET_KB)
  problems.push(
    `App shell JS is ${appShellKb.toFixed(1)} KB, over the ${APP_SHELL_BUDGET_KB} KB budget`,
  );

const kb = (n) => `${n.toFixed(1)} KB`;
const lines = [
  '# Bundle report',
  '',
  'Sizes are gzip-compressed (what actually travels over the network).',
  '',
  '| What | JavaScript | Files |',
  '| --- | ---: | --- |',
  ...rows.map(([label, files]) => `| ${label} | ${kb(sum(files))} | ${[...files].join('<br>')} |`),
  '',
  `Shared by every page: CSS ${kb(cssKb)} and the two brand fonts ${kb(fontKb)} (Figtree and Bricolage Grotesque, woff2, already compressed).`,
  '',
  '## Checks',
  '',
  `- App shell JavaScript budget (<= ${APP_SHELL_BUDGET_KB} KB): ${appShellKb <= APP_SHELL_BUDGET_KB ? 'PASS' : 'FAIL'} (${kb(appShellKb)})`,
  `- Three.js in the app bundle: ${threeInApp.length ? 'FAIL (found)' : 'PASS (not present)'}`,
  `- Three.js in the landing page's first download: ${threeInLanding.length ? 'FAIL (found)' : 'PASS (not present)'}`,
  `- GSAP in the app bundle: ${gsapInApp.length ? 'FAIL (found)' : 'PASS (not present)'}`,
  `- Live connection (socket.io-client) kept out of the app shell: ${socketInApp.length ? 'FAIL (found)' : 'PASS'}`,
  '',
];
const report = lines.join('\n');
writeFileSync(join(DIST, 'bundle-report.md'), report);
console.log(report);
if (!existsSync(join(DIST, 'index.html'))) problems.push('dist/index.html missing');

if (problems.length) {
  console.error('\nBundle rules broken:\n- ' + problems.join('\n- '));
  process.exit(1);
}
