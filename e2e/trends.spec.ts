import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/** SpO₂ trend on the patient history and vitals pages: real saved records only. Fictional Practice data. */

async function openPeterHistory(page: Page) {
  await page.goto('/patients/pt-09/timeline');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
}

test('history SpO₂ card: confirmed readings in time order, pre-outage reading kept apart, no target or score', async ({ page }, info) => {
  await openPeterHistory(page);
  const card = page.getByRole('region', { name: 'Oxygen level (SpO₂) trend' });
  await expect(card).toBeVisible();
  const summary = card.getByTestId('spo2-summary');
  await expect(summary).toContainText('94% at 04:55');
  await expect(summary).toContainText('90% at 04:20');
  await expect(summary).toContainText('+4 points');
  const chart = card.getByTestId('spo2-trend');
  await expect(chart.locator('circle[data-kind="confirmed"]')).toHaveCount(2);
  await expect(chart.locator('rect[data-kind="baseline"]')).toHaveCount(1); // 00:05 hospital list, 91%
  const rows = chart.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('00:05');
  await expect(rows.nth(0)).toContainText('Before outage (hospital list)');
  await expect(rows.nth(1)).toContainText('90%');
  await expect(rows.nth(2)).toContainText('94%');
  await expect(rows.nth(2)).toContainText('4 L/min');
  await expect(chart.getByRole('img')).toHaveAttribute('aria-label', /90% at 04:20; 94% at 04:55/);
  await expect(card).not.toContainText(/NEWS2/);
  await expect(chart.locator('svg line')).toHaveCount(1); // the time axis only: no target line or band
  await expect(chart.locator('svg rect')).toHaveCount(1); // the one pre-outage marker, no shaded range
  for (const [w, h, name] of [[1440, 1000, 'desktop'], [1024, 768, 'small-desktop'], [390, 844, 'phone']] as const) {
    await page.setViewportSize({ width: w, height: h });
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`screens/history-spo2-${name}.png`) });
  }
});

test('a fixed reading replaces the old one in the trend; the old version is left out', async ({ page }) => {
  await openPeterHistory(page);
  // Fix the 04:55 reading (94 → 95) through the normal correction flow.
  await page.getByRole('main').getByRole('button', { name: /Pulse 100 · O₂ 94%/ }).click(); // history card expands
  await page.getByRole('main').getByRole('link', { name: 'Fix' }).first().click();
  await page.getByLabel('Oxygen level').fill('95');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByLabel('Why are you fixing this?').fill('typed oxygen level wrong');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByLabel('I re-checked these values and they are right').check(); // existing warning step, unchanged
  await page.getByRole('button', { name: 'Save fix' }).click();
  await expect(page.getByText('Fix reason')).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Peter Novak' }).first().click();
  await page.getByRole('link', { name: 'View details' }).click();
  const chart = page.getByTestId('spo2-trend');
  await expect(chart.locator('circle[data-kind="confirmed"]')).toHaveCount(2);
  await expect(chart.locator('tbody')).toContainText('95%');
  await expect(chart.locator('tbody')).not.toContainText('94%');
  await expect(page.getByTestId('spo2-summary')).toContainText('95% at 04:55');
});
