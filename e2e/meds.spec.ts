import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

async function signInAndOpen(page: Page, patientId: string) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).toHaveURL(/\/ward$/);
  await page.getByTestId(`patient-${patientId}`).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: /Give medicine/ }).click();
  await expect(page.getByRole('heading', { name: 'Medicines' })).toBeVisible();
}

test('high-alert insulin needs a second nurse PIN before saving', async ({ page }) => {
  await signInAndOpen(page, 'pt-02'); // Lena Ortiz, synthetic
  await page.getByTestId('order-ord-04').click();
  await expect(page.getByText(/High-alert drug · a second nurse must check/)).toBeVisible();
  await page.getByRole('link', { name: 'Record dose' }).click(); // the 18:00 dose
  await page.getByLabel('Site (optional)').fill('Abdomen, right side');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

  // The second-nurse panel is on the page itself (Stitch layout), not in a dialog.
  await expect(page.getByRole('region', { name: 'Independent verification' })).toContainText('Co-sign required');
  await expect(page.getByRole('button', { name: /Daniel Okafor/ })).toHaveCount(0); // cannot check own dose
  await page.getByRole('button', { name: /Jordan Park/ }).click();
  for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText(/Wrong PIN/)).toBeVisible();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('Checked by Jordan Park')).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await expect(page.getByTestId('order-ord-04').getByText('18:00')).toBeVisible();
  await expect(page.getByTestId('order-ord-04').getByText('Due')).toHaveCount(0);
});

test('dose correction preserves distinguishable collapsed history summaries', async ({ page }, testInfo) => {
  await signInAndOpen(page, 'pt-01'); // Sam Rivera, synthetic
  await page.getByTestId('order-ord-02').click();
  await page.getByRole('link', { name: 'Record dose' }).click(); // metoprolol 21:00
  await page.getByLabel('Dose given').fill('250');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('Dose 250 mg is different from the order (25 mg)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.getByLabel('I checked this and it is right').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();

  await page.getByTestId('order-ord-02').click();
  await page.getByRole('link', { name: /metoprolol tartrate 250 mg · Given/ }).click();
  await page.getByRole('link', { name: 'Fix' }).click();
  await page.getByLabel('Dose given').fill('25');
  await page.getByLabel('Why are you fixing this?').fill('typed 250 instead of 25');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save fix' }).click();
  await expect(page.getByText('typed 250 instead of 25')).toBeVisible();
  await page.getByRole('link', { name: 'All versions' }).click();
  await expect(page.getByText('metoprolol tartrate 250 mg · Given')).toBeVisible();
  await expect(page.getByText('metoprolol tartrate 25 mg · Given')).toBeVisible();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.getByRole('checkbox').check(); // Include the superseded administration.
  await page.getByRole('searchbox').fill('metoprolol tartrate');
  const records = page.getByRole('list', { name: 'Records' });
  const original = records.getByRole('button', { name: /250 mg · Given.*Old version/ });
  const corrected = records.getByRole('button', { name: /25 mg · Given.*Confirmed/ }).first();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [row, dose] of [[original, 250], [corrected, 25]] as const) {
      await expect(row).toHaveAttribute('aria-expanded', 'false');
      const summary = row.getByText(`metoprolol tartrate ${dose} mg · Given`, { exact: true });
      const dimensions = await summary.evaluate(el => [el.scrollWidth, el.clientWidth]);
      expect(dimensions[0], `complete ${dose} mg summary at ${width}px`).toBeLessThanOrEqual(dimensions[1]! + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await original.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('screens', `history-doses-${width}.png`) });
    await corrected.focus();
    await page.keyboard.press('Enter');
    await expect(corrected).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(corrected).toHaveAttribute('aria-expanded', 'false');
  }

});

test('held dose needs a reason', async ({ page }) => {
  await signInAndOpen(page, 'pt-01');
  await page.getByTestId('order-ord-02').click();
  await page.getByRole('link', { name: 'Record dose' }).click();
  await page.getByRole('button', { name: 'Held', exact: true }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('Say why it was held')).toBeVisible();
  await page.getByLabel('Why was it held?').fill('heart rate low, doctor told');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('order-ord-02').getByText('Held')).toBeVisible();
});
