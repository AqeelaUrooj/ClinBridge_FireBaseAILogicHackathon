import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:4173';
const launch = (dir: string, offline = false) => chromium.launchPersistentContext(dir, {
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), viewport: { width: 1366, height: 768 }, offline,
});

async function signInOpenVitals(page: Page) {
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByTestId('patient-pt-01').click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: /Vitals/ }).first().click();
}

test('abrupt closure mid-form saves nothing; a saved record survives a full browser restart, reopened offline', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'clinbridge-profile-'));
  try {
    // 1. First run online: app installs its offline copy.
    let ctx = await launch(dir);
    let page = await ctx.newPage();
    await page.goto(`${BASE}/sign-in`);
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await signInOpenVitals(page);
    // Saved record
    await page.getByRole('link', { name: 'Record vitals' }).click();
    await page.getByLabel('Pulse').fill('83');
    await page.getByRole('button', { name: 'Review' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved on this laptop.')).toBeVisible();
    // Half-filled form, then the browser is killed without saving
    await page.getByRole('link', { name: 'Record vitals' }).click();
    await page.getByLabel('Pulse').fill('199');
    await page.getByRole('button', { name: 'Review' }).click();
    await ctx.close(); // abrupt: Save never pressed

    // 2. Browser restarted with NO network.
    ctx = await launch(dir, true);
    page = await ctx.newPage();
    await page.goto(`${BASE}/sign-in`);
    await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
    await signInOpenVitals(page);
    await expect(page.getByText(/Pulse 83/).first()).toBeVisible();
    await expect(page.getByText(/Pulse 199/)).toHaveCount(0);
    const offline = await page.evaluate(() => navigator.onLine);
    expect(offline).toBe(false);
    await ctx.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
