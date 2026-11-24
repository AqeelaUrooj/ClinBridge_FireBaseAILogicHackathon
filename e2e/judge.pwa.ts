import { test as base, expect, chromium, type BrowserContext } from '@playwright/test';
import { unlockIfNeeded, unlockPractice } from './helpers';

const test = base.extend<{ judgeContext: BrowserContext }>({
  judgeContext: async ({ baseURL, channel, launchOptions, viewport }, runWithContext) => {
    const context = await chromium.launchPersistentContext('', {
      ...launchOptions, baseURL, channel, viewport,
    });
    try {
      await runWithContext(context);
    } finally {
      await context.close();
    }
  },
});

test('judge build is installable in the browser and opens Practice routes offline', async ({ judgeContext: context, request }, info) => {
  const [page] = context.pages();
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'ClinBridge Practice', id: '/', start_url: '/sign-in', scope: '/', display: 'standalone' });
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((entry: { sizes: string }) => entry.sizes === `${size}x${size}`);
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    const png = await response.body();
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size, size]);
  }

  await page.goto('/');
  const launch = page.getByRole('link', { name: 'Launch Practice Demo' }).first();
  await expect(launch).toHaveAttribute('href', '/sign-in');
  await page.evaluate(() => localStorage.setItem('dtk.dataset', 'live'));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15_000 }).toBe(true);
  await page.screenshot({ path: info.outputPath('screens', 'landing.png') });
  await launch.click();
  await expect(page).toHaveURL('/sign-in');
  await expect(page.getByText('Practice is ready for offline use.')).toBeVisible({ timeout: 15_000 });

  const cdp = await context.newCDPSession(page);
  await expect.poll(async () => (await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  await page.screenshot({ path: info.outputPath('screens', 'install-sign-in.png') });
  await expect(page.getByRole('radio', { name: /Real records/ })).toHaveCount(0);
  await page.goto('/setup');
  await unlockIfNeeded(page);
  await expect(page).toHaveURL('/sign-in');

  await context.setOffline(true);
  await page.goto('/ward');
  await unlockPractice(page);
  await expect(page).toHaveURL('/sign-in');
  await page.reload();
  await unlockPractice(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const digit of '2468') await page.getByRole('button', { name: digit, exact: true }).click();
  await expect(page).toHaveURL('/ward');
  await expect(page.getByTestId('patient-pt-08')).toBeVisible();
  await page.screenshot({ path: info.outputPath('screens', 'offline-ward.png') });
  const databases = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  expect(databases.some((name) => name?.includes('live'))).toBe(false);
});
