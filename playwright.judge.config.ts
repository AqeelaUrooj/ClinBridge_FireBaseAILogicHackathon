import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'judge.pwa.ts',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4175',
    viewport: { width: 1366, height: 900 },
    channel: process.env.CHROME_PATH ? undefined : 'chromium',
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  webServer: { command: 'npm run preview -- --outDir dist-judge --port 4175 --strictPort', port: 4175 },
});
