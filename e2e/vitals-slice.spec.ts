import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 2 vertical slice, end to end, on fake practice data only:
 * sign in → My patients → check patient → summary → record vitals → review → save
 * → reload (still there) → history → fix with reason → old version kept.
 */

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).toHaveURL(/\/ward$/);
}

async function openSam(page: Page) {
  await page.getByTestId('patient-pt-01').click();
  await expect(page.getByRole('dialog', { name: 'Is this the right patient?' })).toBeVisible();
  await page.getByRole('button', { name: 'Yes, open' }).click();
}

test('record vitals, survive reload, then fix them', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('PRACTICE · FAKE PATIENTS ONLY')).toBeVisible();
  await openSam(page);
  await expect(page).toHaveURL(/\/patients\/pt-01$/);

  await page.getByRole('link', { name: /Vitals/ }).first().click();
  await page.getByRole('link', { name: 'Record vitals' }).click();

  // Structural check blocks: text is not a number.
  await page.getByLabel('Pulse').fill('7a');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText(/Numbers only/)).toBeVisible();

  // Clinical warning never blocks, but needs a tick before Save.
  await page.getByLabel('Pulse').fill('160');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('Pulse 160 /min is unusual')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.getByLabel('I re-checked these values and they are right').check();
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  await page.getByRole('button', { name: 'Go back' }).click();

  await page.getByLabel('Top blood pressure').fill('128');
  await page.getByLabel('Bottom blood pressure').fill('82');
  await page.getByLabel('Pulse').fill('77');
  await page.getByLabel('Oxygen level').fill('97');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'Check before saving' })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await expect(page.getByText('BP 128/82 · Pulse 77 · O₂ 97%')).toBeVisible();

  // Reload: IndexedDB keeps it. The session is in memory, so we sign in again.
  await page.reload();
  await signIn(page);
  await openSam(page);
  await page.getByRole('link', { name: 'View details' }).click();
  await page.getByRole('link', { name: /BP 128\/82 · Pulse 77/ }).click();

  await page.getByRole('link', { name: 'Fix' }).click();
  await page.getByLabel('Pulse').fill('74');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('Say why you are fixing this')).toBeVisible();
  await page.getByLabel('Why are you fixing this?').fill('typed pulse wrong');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save fix' }).click();

  await expect(page.getByText('Fix reason')).toBeVisible();
  await page.getByRole('link', { name: 'All versions' }).click();
  await expect(page.getByText('Old version')).toBeVisible();
  await expect(page.getByText('BP 128/82 · Pulse 77 · O₂ 97%')).toBeVisible();
  await expect(page.getByText('BP 128/82 · Pulse 74 · O₂ 97%')).toBeVisible();
});

test('wrong PIN is refused and locks after 5 tries', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: /Jordan Park/ }).click();
  for (let i = 1; i <= 5; i++) {
    for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click();
    if (i < 5) await expect(page.getByText(`Wrong PIN · ${5 - i} tries left`)).toBeVisible();
  }
  await expect(page.getByText('Too many wrong tries. Wait 1 minute.')).toBeVisible();
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled();
});

test('app opens offline after first load', async ({ page, context }) => {
  await page.goto('/sign-in');
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  await page.reload(); // let the service worker take control
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
  await context.setOffline(false);
});
