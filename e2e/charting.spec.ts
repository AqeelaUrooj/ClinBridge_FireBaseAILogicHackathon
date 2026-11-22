import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

async function open(page: Page, patientId: string) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).toHaveURL(/\/ward$/);
  await page.getByTestId(`patient-${patientId}`).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
}

test('fluids: add intake, totals update', async ({ page }) => {
  await open(page, 'pt-08'); // Rosa Santos, synthetic
  await page.getByRole('link', { name: /Fluids/ }).first().click();
  const card = (label: string) => page.locator('div.rounded-xl', { has: page.getByText(label, { exact: true }) });
  await expect(card('In')).toHaveText(/In\s*240\s*mL/);
  await expect(card('Balance (in − out)')).toHaveText(/-530\s*mL/); // 240 in, 770 out (350 + 420)
  await page.getByRole('link', { name: 'Add fluid' }).click();
  await page.getByRole('button', { name: /^In/ }).click();
  await page.getByRole('button', { name: 'By mouth' }).click();
  await page.getByLabel('Amount (mL)').fill('200');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await expect(card('In')).toHaveText(/In\s*440\s*mL/);
  await expect(card('Out')).toHaveText(/Out\s*770\s*mL/);
  await expect(card('Balance (in − out)')).toHaveText(/-330\s*mL/); // 440 − 770
});

test('notes: write a note, then fix it with a reason', async ({ page }) => {
  await open(page, 'pt-09');
  await page.getByRole('main').getByRole('link', { name: /Note/ }).first().click();
  await page.getByRole('link', { name: 'New note' }).click();
  await page.getByRole('button', { name: 'Assessment' }).click();
  await page.getByLabel('Note').fill('Breathing easier, speaking full sentences.');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: /Breathing easier/ }).click();
  await page.getByRole('link', { name: 'Fix' }).click();
  await page.getByLabel('Note').fill('Breathing easier, speaking full sentences. Oxygen 2 L/min.');
  await page.getByLabel('Why are you fixing this?').fill('added oxygen flow');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save fix' }).click();
  await expect(page.getByText('added oxygen flow')).toBeVisible();
  await page.getByRole('link', { name: 'All versions' }).click();
  await expect(page.getByText('Old version')).toBeVisible();
});

test('labs: critical result warns if read-back missing, then shows on ward labs', async ({ page }) => {
  await open(page, 'pt-05');
  await page.getByRole('link', { name: 'View details' }).click();
  await page.getByRole('link', { name: 'Labs' }).click();
  await page.getByRole('link', { name: 'Record lab' }).click();
  await page.getByLabel('Test').fill('aPTT (clotting time)');
  await page.getByRole('button', { name: /Critical result/ }).click();
  await page.getByLabel('Result (as given by the lab)').fill('121');
  await page.getByLabel('Unit').fill('s');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('Read-back is not ticked')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.getByRole('button', { name: 'Go back' }).click();
  await page.getByLabel('Who was told (doctor / team)').fill('Dr. Lindqvist');
  await page.getByLabel(/read back/).check();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await page.getByRole('link', { name: 'More' }).click();
  await page.getByRole('link', { name: 'Ward labs' }).click();
  await expect(page.getByText(/aPTT \(clotting time\) · 121 s/)).toBeVisible();
});
