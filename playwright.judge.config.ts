import { defineConfig } from '@playwright/test';

/** Browser tests of the public judge build: npm run build:judge && npm run test:judge. Served with the hosting headers. */
export default defineConfig({
  testDir: './e2e-judge',
  outputDir: 'test-results/judge',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4285',
    viewport: { width: 1366, height: 768 },
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  webServer: [
    // Own ports, and never a server that is already running: it could be another checkout.
    { command: 'npx vite preview --mode judge --port 4285 --strictPort', port: 4285, reuseExistingServer: false },
    // The same build with FAKE Firebase values, in its own folder: only for e2e-judge/ai.spec.ts, never published.
    {
      command: 'npx vite build --mode judge --outDir dist-judge-ai && npx vite preview --mode judge --outDir dist-judge-ai --port 4286 --strictPort',
      port: 4286, reuseExistingServer: false, timeout: 180_000,
      env: { VITE_FIREBASE_API_KEY: 'e2e-fake-not-a-real-key', VITE_FIREBASE_PROJECT_ID: 'e2e-fake-project', VITE_FIREBASE_APP_ID: '1:000000000000:web:e2efake', VITE_FIREBASE_APPCHECK_SITE_KEY: 'e2e-fake-site-key' },
    },
  ],
});
