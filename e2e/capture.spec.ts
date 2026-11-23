import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

async function signInOpen(page: Page, patientId: string) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).toHaveURL(/\/ward$/);
  await page.getByTestId(`patient-${patientId}`).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
}

/** Make a synthetic "paper form" picture in the browser (lines on white, no patient data). */
async function fakeFormPng(page: Page, dark = false): Promise<Buffer> {
  const dataUrl = await page.evaluate((isDark) => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 1200;
    const g = c.getContext('2d')!;
    g.fillStyle = isDark ? '#141414' : '#fafafa'; g.fillRect(0, 0, 900, 1200);
    g.strokeStyle = isDark ? '#2a2a2a' : '#222'; g.lineWidth = 3;
    for (let y = 60; y < 1200; y += 48) { g.beginPath(); g.moveTo(40, y); g.lineTo(860, y); g.stroke(); }
    for (let x = 40; x < 900; x += 205) { g.beginPath(); g.moveTo(x, 60); g.lineTo(x, 1150); g.stroke(); }
    g.fillStyle = '#222'; g.font = '32px sans-serif'; g.fillText('PRACTICE FORM 88', 60, 110);
    return c.toDataURL('image/png');
  }, dark);
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

test('paper capture works without AI: photo saved first, typed values, draft, then confirmed', async ({ page }) => {
  await signInOpen(page, 'pt-08');
  await page.getByRole('link', { name: /Photo of paper/ }).click();
  await page.getByRole('button', { name: 'Vitals sheet' }).click();
  await page.getByTestId('photo-input').setInputFiles({ name: 'form.png', mimeType: 'image/png', buffer: await fakeFormPng(page) });
  await expect(page.getByText('Photo saved on this laptop')).toBeVisible();
  await expect(page.getByText('Unchanged since saved')).toBeVisible();
  await page.getByLabel('Save as a draft to check later').check();
  await page.getByLabel('Pulse').fill('88');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page.getByText('Check this').first()).toBeVisible();
  await page.getByRole('link', { name: 'Check and confirm' }).click();
  await expect(page.getByAltText('Photo of the paper form')).toBeVisible();
  await expect(page.getByLabel('Pulse')).toHaveValue('88');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Confirmed').first()).toBeVisible();
  await page.getByText('Source photo').click();
  await expect(page.getByAltText('Photo of the paper form')).toBeVisible();
});

test('dark photo gives a hint but never blocks', async ({ page }) => {
  await signInOpen(page, 'pt-08');
  await page.getByRole('link', { name: /Photo of paper/ }).click();
  await page.getByRole('button', { name: 'Nursing note' }).click();
  await page.getByTestId('photo-input').setInputFiles({ name: 'dark.png', mimeType: 'image/png', buffer: await fakeFormPng(page, true) });
  await expect(page.getByText(/Photo looks dark/)).toBeVisible();
  await page.getByRole('button', { name: 'Assessment' }).click();
  await page.getByLabel('Note').fill('Copied from paper note.');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('definition').filter({ hasText: 'Copied from paper note.' })).toBeVisible();
});

test('practice draft with a stored proposal is labelled as simulated, not live AI', async ({ page }) => {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('complementary').getByRole('link', { name: /Alerts/ }).click();
  await page.getByRole('link', { name: /Draft vital sign/ }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByText(/simulated, not a model answer/)).toBeVisible(); // seed proposal: never shown as a real model answer
  await expect(page.getByText(/Photo file is not on this laptop/)).toBeVisible();
});
