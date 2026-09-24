import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

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

export default defineConfig({
  plugins: [react(), tailwindcss(), bundleReport()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
