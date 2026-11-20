import { test, expect } from '@playwright/test';

test('handover: write from confirmed records, review, save, view history, print layout', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('complementary').getByRole('link', { name: 'Handover' }).click(); // sidebar → ward handover
  await expect(page.getByText('Peter Novak')).toBeVisible();
  await page.getByRole('link', { name: 'My patients' }).click();
  await page.getByTestId('patient-pt-09').click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'View details' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Handover' }).click();
  await expect(page.getByText('No handovers yet').or(page.getByText('Night to day'))).toBeVisible();
  await page.getByRole('link', { name: 'New handover' }).click();
  await page.getByLabel('Situation').fill('Chest infection, oxygen needs stable.');
  await page.getByRole('button', { name: 'Insert patient facts' }).click();
  await expect(page.getByLabel('Background')).toHaveValue(/Isolation/);
  await page.getByRole('button', { name: 'Add line' }).first().click(); // copies newest confirmed record and links it
  await expect(page.getByLabel('Assessment')).not.toHaveValue('');
  await page.getByLabel('Open item 1', { exact: true }).fill('Recheck temperature at 16:00');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'Check before saving' })).toBeVisible();
  await page.getByRole('button', { name: 'I reviewed it — save' }).click();
  await expect(page.getByText('Handover saved on this laptop.')).toBeVisible();
  await page.getByRole('link', { name: /Handover 13:2/ }).first().click();
  await expect(page.getByText('Recheck temperature at 16:00')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-running-header')).toBeVisible();
  await expect(page.locator('.print-running-header')).toContainText('MRN');
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
});

test('handover: Review is blocked until Situation, Background and Assessment are written', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByTestId('patient-pt-01').click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'View details' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Handover' }).click();
  await page.getByRole('link', { name: 'New handover' }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('Write the situation')).toBeVisible();
  await expect(page.getByText('Write the assessment')).toBeVisible();
});
