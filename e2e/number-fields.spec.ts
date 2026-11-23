import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/** A typed number must always be readable in full: no digit may be cut off in any form at any supported width. */
test.use({ serviceWorkers: 'block' });

async function go(page: Page, path: string) {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  const yes = page.getByRole('button', { name: 'Yes, open' });
  const field = page.locator('main input[inputmode]').first();
  const values = page.getByRole('button', { name: 'Edit values' }); // a draft opens on its values
  await expect(yes.or(field).or(values).first()).toBeVisible();
  if (await yes.isVisible()) await yes.click();
  await expect(field.or(values).first()).toBeVisible();
  if (await values.isVisible()) await values.click();
  await expect(field).toBeVisible();
}

const LONG: Record<string, string> = { 'v-temp_c': '38.4', 'v-o2_flow_lpm': '12.5', 'v-glucose_mgdl': '196.5', vol: '12500' };

test('numbers are never cut off in the vitals, fluids and confirm forms', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).toHaveURL(/\/ward$/);
  for (const path of ['/capture/e-048/confirm', '/patients/pt-09/vitals/record', '/entries/e-005/correct', '/patients/pt-08/io/record', '/entries/e-010/correct', '/capture/e-049/confirm']) {
    await go(page, path);
    const more = page.getByRole('button', { name: /^More \(pain/ });
    if (await more.count()) await more.click();
    const inputs = page.locator('main input[inputmode]');
    for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).fill(LONG[(await inputs.nth(i).getAttribute('id')) ?? ''] ?? '188');
    for (const width of [1920, 1440, 1366, 1280, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      const cut = await inputs.evaluateAll((els) => (els as HTMLInputElement[]).filter((e) => e.scrollWidth > e.clientWidth).map((e) => `${e.id} "${e.value}" in ${e.clientWidth}px`));
      expect(cut, `${path} at ${width}px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${path} at ${width}px: no sideways scroll`).toBe(true);
    }
  }
});
