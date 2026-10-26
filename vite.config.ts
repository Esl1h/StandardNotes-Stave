import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Scripts may only come from the plugin's own origin: no inline code, no
// eval, no remote scripts. Styles, fonts and images stay open, because the
// host injects its theme stylesheet from wherever the app keeps themes.
const CONTENT_SECURITY_POLICY = [
  "script-src 'self'",
  "connect-src 'self'",
  // alphaTab's player worker runs from a blob of its code, fetched from
  // 'self' (docs/adr/0015). Only code already running in the page can make
  // such a blob.
  'worker-src blob:',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Built pages only: the dev server injects inline scripts of its own.
const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
      injectTo: 'head-prepend',
    },
  ],
});

// The alphaTab files the plugin loads at runtime, each with its license.
// Only these: the other formats of the font (eot, otf, svg, woff) and the
// sf2 SoundFont are 3.6 MB that no supported browser asks for.
const ALPHATAB_DIST = 'node_modules/@coderline/alphatab/dist/';
const ALPHATAB_ASSETS: Record<string, string> = {
  'font/Bravura.woff2': 'font/Bravura.woff2',
  'font/Bravura-OFL.txt': 'font/Bravura-OFL.txt',
  'soundfont/sonivox.sf3': 'soundfont/sonivox.sf3',
  'soundfont/sonivox-LICENSE.txt': 'soundfont/LICENSE',
};

const alphaTabAssets = (): Plugin => ({
  name: 'alphatab-assets',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const source = ALPHATAB_ASSETS[(req.url ?? '').replace(/^\/|\?.*$/g, '')];
      if (!source) return next();
      res.end(readFileSync(ALPHATAB_DIST + source));
    });
  },
  generateBundle() {
    for (const [fileName, source] of Object.entries(ALPHATAB_ASSETS)) {
      this.emitFile({ type: 'asset', fileName, source: readFileSync(ALPHATAB_DIST + source) });
    }
  },
});

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), contentSecurityPolicy(), alphaTabAssets()],
  // alphaTab's player thread (src/engines/alphatex): one minified classic
  // script with no imports, so it can run as a worker from a blob in the
  // opaque origin of the Standard Notes iframe, where module workers from
  // blobs fail (docs/adr/0015). alphaTab reads import.meta.url there only
  // to start other workers, which a worker never does.
  worker: {
    format: 'iife',
    rolldownOptions: {
      transform: { define: { 'import.meta.url': 'undefined' } },
      output: { minify: true },
    },
  },
  build: {
    outDir: 'build',
    // Lists every bundled dependency with its license text, shipped in the
    // zip and on Pages next to the code it covers.
    license: { fileName: 'THIRD_PARTY_LICENSES.md' },
  },
  server: {
    // Standard Notes needs CORS when served for dev installs too.
    cors: true,
  },
  preview: {
    port: 3000,
    // The Standard Notes app downloads dev extensions over HTTP and
    // needs permissive CORS to fetch them.
    cors: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    // e2e/ specs belong to Playwright, not to Vitest.
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/engines/**', 'src/components/**'],
      exclude: [
        'src/**/*.test.*',
        // alphaTab only runs in a browser; e2e/alphatex.spec.js covers it.
        'src/engines/alphatex/renderer.ts',
        'src/engines/alphatex/player-thread.ts',
      ],
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
});
