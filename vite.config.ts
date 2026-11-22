/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // Everything the app needs offline is bundled: JS, CSS, Inter, Material Symbols, seed data.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'ClinBridge',
        short_name: 'ClinBridge',
        description: 'Offline nursing documentation during hospital EHR downtime',
        theme_color: '#1c2536',
        background_color: '#f8f9fb',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
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
});
