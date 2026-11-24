/// <reference types="vitest" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const root = fileURLToPath(new URL('./', import.meta.url));
const json = <T,>(file: string) => JSON.parse(readFileSync(root + file, 'utf8')) as T;

/** The public website ships other people's fonts and code: their license texts go with it. */
function thirdPartyLicenses(): Plugin {
  return {
    name: 'third-party-licenses',
    apply: 'build',
    generateBundle() {
      const names = new Set([...Object.keys(json<{ dependencies: Record<string, string> }>('package.json').dependencies), 'workbox-core', 'workbox-precaching', 'workbox-routing', 'workbox-window']);
      for (const id of this.getModuleIds()) {
        const m = /node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)(?!.*node_modules)/.exec(id);
        if (m) names.add(m[1]!.replace('\\', '/'));
      }
      const parts = [...names].sort().flatMap((name) => {
        const dir = `${root}node_modules/${name}/`;
        if (!existsSync(dir + 'package.json')) return [];
        const p = json<{ version: string; license?: string }>(`node_modules/${name}/package.json`);
        const file = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
        return [`==== ${name} ${p.version} (${p.license ?? 'see text'})\n\n${file ? readFileSync(dir + file, 'utf8').trim() : `License text: ${p.license}, ${p.license === 'Apache-2.0' ? 'the same text as ClinBridge LICENSE at the top of this file' : 'see the package'}.`}\n`];
      });
      const own = ['LICENSE', 'NOTICE'].map((f) => `==== ClinBridge ${f}\n\n${readFileSync(root + f, 'utf8').trim()}\n`);
      this.emitFile({ type: 'asset', fileName: 'third-party-licenses.txt', source: [...own, ...parts].join('\n') });
    },
  };
}

/** The headers of firebase.json for every page, so the local preview of the public demo behaves like the hosting. */
function hostingHeaders(): Record<string, string> {
  const { hosting } = json<{ hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] } }>('firebase.json');
  return Object.fromEntries((hosting.headers.find((h) => h.source === '**')?.headers ?? []).map((h) => [h.key, h.value]));
}

export default defineConfig(({ mode }) => {
  // The public website for judges: Practice only (src/config/publicDemo.ts). Its own folder, so it is never mixed up.
  const judge = mode === 'judge';
  return {
    plugins: [
      react(),
      VitePWA({
        // A new version waits until every window is closed (main.tsx): never a reload while someone is charting.
        registerType: 'prompt',
        injectRegister: false,
        workbox: {
          // Everything the app needs offline is bundled: JS, CSS, Inter, Material Symbols, seed data.
          globPatterns: ['**/*.{js,css,html,woff2,svg,png,jpg,webp,json,webmanifest}'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          clientsClaim: true, // the first visit works offline without a reload
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/__\//, /\/[^/]+\.[a-z0-9]+$/i], // Firebase's own pages, and files
        },
        manifest: {
          name: judge ? 'ClinBridge Practice' : 'ClinBridge',
          short_name: 'ClinBridge',
          description: judge ? 'Offline nursing downtime documentation demonstration with fictional patients' : 'Offline nursing documentation during hospital EHR downtime',
          lang: 'en',
          theme_color: '#1c2536',
          background_color: '#f8f9fb',
          display: 'standalone',
          // Staff open the installed app to chart: it starts at sign-in, as before. `id` keeps it the same installed app.
          id: '/',
          start_url: '/sign-in',
          scope: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
      }),
      ...(judge ? [thirdPartyLicenses()] : []),
    ],
    // The public build never takes a developer's .env.local: only hosting/.env.local, if the owner makes one for the
    // approved demo project (hosting/.env.example). Without it the public demo has no cloud AI. The App Check debug
    // switch is always empty there.
    ...(judge ? { envDir: 'hosting', build: { outDir: 'dist-judge' }, preview: { headers: hostingHeaders() }, define: { 'import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG': '""' } } : {}),
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // Tests must use Firebase AI's BROWSER build (the Node build has no on-device adapter at all).
      alias: { '@firebase/ai': fileURLToPath(new URL('./node_modules/@firebase/ai/dist/esm/index.esm.js', import.meta.url)) },
      server: { deps: { inline: ['firebase', /@firebase\/ai/] } },
    },
  };
});
