import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1366, height: 768 },
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  webServer: [
    { command: 'npm run preview', port: 4173, reuseExistingServer: true },
    // AI tests: a separate build with FAKE Firebase values (.env.e2e-ai) and a mocked Prompt API in the page.
    { command: 'npm run preview:e2e-ai', port: 4174, reuseExistingServer: true, timeout: 180_000 },
  ],
});
