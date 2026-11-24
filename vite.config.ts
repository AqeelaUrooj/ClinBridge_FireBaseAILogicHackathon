/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // Everything the app needs offline is bundled: JS, CSS, Inter, Material Symbols, seed data.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,jpg,webp,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      manifest: {
        name: mode === 'judge' ? 'ClinBridge Practice' : 'ClinBridge',
        short_name: 'ClinBridge',
        description: 'Offline nursing documentation during hospital EHR downtime',
        theme_color: '#1c2536',
        background_color: '#f8f9fb',
        display: 'standalone',
        // Staff open the installed app to chart: it starts at sign-in, as before. `id` keeps it the same installed app.
        id: '/',
        start_url: '/sign-in',
        scope: '/',
        icons: [192, 512].map((size) => ({
          src: `/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any',
        })),
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Tests must use Firebase AI's BROWSER build (the Node build has no on-device adapter at all).
    alias: { '@firebase/ai': fileURLToPath(new URL('./node_modules/@firebase/ai/dist/esm/index.esm.js', import.meta.url)) },
    server: { deps: { inline: ['firebase', /@firebase\/ai/] } },
  },
}));
