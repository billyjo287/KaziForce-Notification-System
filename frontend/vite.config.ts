import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Content Security Policy for the built site (PRD NFR-2): scripts, fonts and images only from
 * our own address; the browser may only talk to our API. Added to index.html at build time,
 * because the API address is only known then (VITE_API_URL). Styles allow 'unsafe-inline'
 * because the dialog library adds a small <style> tag. frame-ancestors cannot be set in a
 * <meta> tag: vercel.json sends X-Frame-Options: DENY instead.
 */
function contentSecurityPolicy(apiUrl: string): Plugin {
  const api = new URL(apiUrl).origin;
  const socket = api.replace(/^http/, 'ws');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${api} ${socket}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'kaziforce-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ],
  };
}

/**
 * Starts downloading the main font (Latin subset) with the page itself, instead of after the CSS
 * has arrived and been read: one round trip less before text appears (562 ms on "Fast 3G").
 */
function preloadMainFont(): Plugin {
  return {
    name: 'kaziforce-font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (_html, ctx) => {
        const font = Object.keys(ctx.bundle ?? {}).find((file) =>
          /atkinson-hyperlegible-next-latin-wght-normal-.*\.woff2$/.test(file),
        );
        return font
          ? [
              {
                tag: 'link',
                attrs: {
                  rel: 'preload',
                  href: `/${font}`,
                  as: 'font',
                  type: 'font/woff2',
                  crossorigin: '',
                },
                injectTo: 'head',
              },
            ]
          : [];
      },
    },
  };
}

/**
 * Writes dist/bundle-report.json: every JavaScript file the build produces, which source
 * files and libraries went into it, and what it loads. scripts/bundle-report.mjs turns this
 * into the size report and checks Three.js never reaches the app bundle.
 */
function bundleReport(): Plugin {
  return {
    name: 'kaziforce-bundle-report',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle)
        .filter((item) => item.type === 'chunk')
        .map((chunk) => ({
          file: chunk.fileName,
          isEntry: chunk.isEntry,
          isDynamicEntry: chunk.isDynamicEntry,
          facade: chunk.facadeModuleId?.replace(/\\/g, '/') ?? null,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          css: [...(chunk.viteMetadata?.importedCss ?? [])],
          modules: Object.keys(chunk.modules).map((id) => id.replace(/\\/g, '/')),
        }));
      this.emitFile({
        type: 'asset',
        fileName: 'bundle-report.json',
        source: JSON.stringify(chunks, null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    bundleReport(),
    preloadMainFont(),
    contentSecurityPolicy(
      loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL ?? 'http://localhost:4000',
    ),
  ],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    // The only file over Vite's 500 KB warning is the 3D hero (Three.js, ~530 KB before
    // compression, ~130 KB downloaded), which loads on its own after the landing page, on capable
    // devices only. The real size checks are in scripts/bundle-report.mjs.
    chunkSizeWarningLimit: 560,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // axios is only needed once someone logs in: keep it out of the landing page download.
          groups: [
            { name: 'axios', test: /node_modules[/\\]axios/ },
            // The alert card and its priority badge are shared by the Alerts page (app shell) and
            // the admin pages (announcement preview, delivery logs). Kept in ONE small file
            // (not four), and only these modules: their own imports stay where they were.
            {
              name: 'alert-card',
              test: /src[/\\]features[/\\]alerts[/\\](AlertCard|PriorityBadge|priorityStyle|types)\./,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Generous per-test limit for the same reason (see src/test/setup.ts).
    testTimeout: 15_000,
  },
}));
