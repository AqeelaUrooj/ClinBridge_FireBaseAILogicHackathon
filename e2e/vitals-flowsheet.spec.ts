import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/** Vitals flowsheet, rebuilt after the Stitch design. Every control is used here. Fictional Practice data only. */
async function open(page: Page, path: string, who = /Daniel Okafor/) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
}
const latest = (page: Page, name: string) => page.getByRole('region', { name: `Latest ${name}` });
const sheet = (page: Page) => page.getByRole('region', { name: 'Vitals flowsheet' });
const rows = (page: Page) => sheet(page).locator('tbody tr');

test('tiles keep their own times; charts, table and hospital-list rows show saved values only', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/patients/pt-02/vitals');
  await expect(page.getByRole('heading', { level: 1, name: 'Vitals' })).toBeVisible();
  await expect(page.getByText('Last recorded:')).toContainText('11:30, 14 Nov 2026 by Daniel Okafor, RN');
  // The newest record (11:30) holds only blood sugar. The other tiles keep the 04:05 values.
  for (const [name, value, time] of [['blood pressure', '128/80', '04:05'], ['pulse', '86', '04:05'], ['oxygen level', '98', '04:05'], ['temp', '36.9', '04:05'], ['breathing', '18', '04:05'], ['blood sugar', '196', '11:30']] as const) {
    await expect(latest(page, name)).toContainText(value);
    await expect(latest(page, name)).toContainText(time);
  }
  await expect(latest(page, 'blood sugar')).toContainText('−52');
  await expect(latest(page, 'blood sugar')).toContainText('Before: 248 at 07:30');
  await expect(latest(page, 'blood pressure')).toContainText('Before: 126/78 at 00:05 (hospital list)');
  await expect(latest(page, 'awake and pain')).toContainText('Alert');
  await expect(latest(page, 'awake and pain')).toContainText('Pain 2 / 10 at 04:05');
  await expect(page.getByRole('main')).not.toContainText(/NEWS2|mean arterial|low risk|normotensive|target band|stable/i);

  // Charts: confirmed readings, hospital-list squares, recorded insulin doses. No band or limit is drawn.
  const pulse = page.getByTestId('pulse-bp-chart');
  await expect(pulse.locator('circle[data-kind="confirmed"]')).toHaveCount(1);
  await expect(pulse.locator('rect[data-kind="baseline"]')).toHaveCount(1);
  await expect(pulse.getByRole('img')).toHaveAttribute('aria-label', /Pulse 86 \/min, BP 128\/80 mmHg at 04:05 \(confirmed\)/);
  const sugar = page.getByTestId('glucose-chart');
  await expect(sugar.locator('circle[data-kind="confirmed"]')).toHaveCount(2);
  await expect(sugar.locator('[data-dose]')).toHaveCount(2);
  await expect(sugar.getByRole('img')).toHaveAttribute('aria-label', /insulin lispro 4 units at 08:00; insulin lispro 4 units at 12:00/);
  // A reading shows its values on hover and on keyboard focus.
  await pulse.getByRole('button', { name: /Reading at 04:05/ }).hover();
  await expect(pulse.getByText('BP 128/80 mmHg', { exact: true })).toBeVisible();
  await sugar.getByRole('button', { name: /Reading at 07:30/ }).focus();
  await expect(sugar.getByText('Blood sugar 248 mg/dL', { exact: true })).toBeVisible();
  // Second chart switch.
  await page.getByRole('button', { name: 'Oxygen', exact: true }).first().click();
  await expect(page.getByTestId('vitals-spo2-trend')).toBeVisible();
  await page.getByRole('group', { name: 'Second chart' }).getByRole('button', { name: 'Blood sugar' }).click();
  await expect(sugar).toBeVisible();

  // Table: newest first, three saved records and two hospital-list rows that cannot be opened.
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).nth(0)).toContainText('11:30');
  await expect(rows(page).nth(0).locator('[data-col="bgl"]')).toContainText('196');
  await expect(rows(page).nth(0).locator('[data-col="bgl"]')).toContainText('Unusual');
  await expect(rows(page).nth(2)).toContainText('Simulated proposal');
  await expect(rows(page).nth(3)).toHaveAttribute('data-kind', 'baseline');
  await expect(rows(page).nth(3)).toContainText('Read only');
  await expect(rows(page).nth(3).getByRole('link')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('screens/vitals-1440.png'), fullPage: true });

  const cols = sheet(page).getByRole('group', { name: 'Flowsheet columns' });
  await cols.getByRole('button', { name: 'Oxygen' }).click();
  await expect(sheet(page).getByRole('columnheader', { name: 'Oxygen given by' })).toBeVisible();
  await expect(sheet(page).getByRole('columnheader', { name: 'Blood sugar' })).toHaveCount(0);
  await cols.getByRole('button', { name: 'Awake / pain' }).click();
  await expect(sheet(page)).toContainText('The Glasgow Coma Scale (GCS) is not recorded here.');
  await cols.getByRole('button', { name: 'Standard' }).click();
  await expect(sheet(page).getByRole('button', { name: /Old versions and mistakes \(0\)/ })).toBeDisabled();

  await sheet(page).getByRole('link', { name: 'Open vitals from 11:30' }).click();
  await expect(page).toHaveURL(/\/entries\//);
  await page.goBack();
  await page.getByRole('link', { name: 'View the full history' }).click();
  await expect(page).toHaveURL(/\/patients\/pt-02\/timeline$/);
  await page.goBack();
  await page.getByRole('link', { name: /Paper vitals & I\/O sheet/ }).click();
  await expect(page).toHaveURL(/\/print\/vit\/pt-02$/);
});

test('drafts stay out of the tiles and lines; old versions are shown only on request', async ({ page }) => {
  await open(page, '/patients/pt-08/vitals'); // Rosa Santos: one unconfirmed vitals draft
  await expect(page.getByRole('note').filter({ hasText: 'One vitals draft is not confirmed' })).toBeVisible();
  await expect(latest(page, 'pulse')).toContainText('—');
  await expect(latest(page, 'pulse')).toContainText('Before: 82 at 00:05 (hospital list)');
  const chart = page.getByTestId('pulse-bp-chart');
  await expect(chart.locator('circle[data-kind="draft"]')).toHaveCount(1);
  await expect(chart.locator('circle[data-kind="confirmed"]')).toHaveCount(0);
  await expect(chart.locator('polyline')).toHaveCount(0);
  await page.getByRole('link', { name: 'Check draft 12:10' }).click();
  await expect(page).toHaveURL(/\/entries\//);

  await page.getByRole('complementary', { name: 'Main menu' }).getByRole('link', { name: /My Patients/ }).click();
  await page.getByTestId('patient-pt-06').click(); // Mei Chen: one corrected record
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'Vital signs flowsheet' }).click();
  await expect(page).toHaveURL(/\/patients\/pt-06\/vitals$/);
  await expect(sheet(page).locator('tr[data-kind="retired"]')).toHaveCount(0);
  await expect(latest(page, 'pulse')).toContainText('78');
  await sheet(page).getByRole('button', { name: /Old versions and mistakes \(1\)/ }).click();
  await expect(sheet(page).locator('tr[data-kind="retired"]')).toHaveCount(1);
  await expect(sheet(page).locator('tr[data-kind="retired"]')).toContainText('Old version');
  await sheet(page).getByRole('button', { name: /Old versions and mistakes \(1\)/ }).click();
  await expect(sheet(page).locator('tr[data-kind="retired"]')).toHaveCount(0);
});

test('record form: − and + need a typed number; Close and Cancel write nothing; a saved value reaches tile and table', async ({ page }) => {
  await open(page, '/patients/pt-01/vitals');
  await page.getByRole('link', { name: 'Record vitals' }).click();
  await expect(page.getByRole('heading', { name: 'Record vitals' })).toBeVisible();
  const raise = page.getByRole('button', { name: 'Pulse: raise' }), lower = page.getByRole('button', { name: 'Pulse: lower' });
  await expect(raise).toBeDisabled();
  await expect(lower).toBeDisabled();
  await expect(page.getByLabel('Pulse')).toHaveValue('');
  await page.getByLabel('Pulse').fill('80');
  await raise.click();
  await raise.click();
  await lower.click();
  await expect(page.getByLabel('Pulse')).toHaveValue('81');
  await page.getByRole('link', { name: 'Close' }).click();
  await expect(latest(page, 'pulse')).toContainText('74');
  await page.getByRole('link', { name: 'Record vitals' }).click();
  await expect(page.getByLabel('Pulse')).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole('link', { name: 'Record vitals' }).click();
  await page.getByLabel('Pulse').fill('80');
  await raise.click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await expect(latest(page, 'pulse')).toContainText('81');
  await expect(latest(page, 'pulse')).toContainText('+7');
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).first().locator('[data-col="hr"]')).toContainText('81');
});

test('an administrator can read the flowsheet but not record', async ({ page }) => {
  await open(page, '/patients/pt-01/vitals', /Kim Ellis/);
  await expect(page.getByText('Only nurses can record vitals')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Record vitals' })).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`no sideways scrolling and no cut-off values at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, '/patients/pt-09/vitals');
    await expect(sheet(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const inner = sheet(page).locator('div.overflow-x-auto');
    expect(await inner.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await expect(rows(page).first().getByRole('link', { name: 'Open vitals from 04:55' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`screens/vitals-${width}.png`), fullPage: true });
  });
}
