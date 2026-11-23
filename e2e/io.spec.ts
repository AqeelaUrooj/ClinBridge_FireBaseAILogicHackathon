import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/** Intake and output page, rebuilt after the Stitch design. Every control is used, or shown off with its reason. Fictional Practice data only. */
async function open(page: Page, path: string, who = /Daniel Okafor/) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
}
const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

test('four cards, hourly chart and two ledgers show saved records only', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/patients/pt-08/io');
  await expect(page.getByRole('heading', { level: 1, name: 'Fluids (in and out)' })).toBeVisible();
  await expect(page.getByText('Last record:')).toContainText('10:15 by Sara Whitfield, LPN');
  const balance = card(page, 'Fluid balance today');
  await expect(balance).toContainText('−530 mL');
  await expect(balance).toContainText('24 h before the outage (hospital list): in 1420, out 1850, balance −430 mL');
  await expect(card(page, 'Fluid instructions')).toContainText('Cardiac, 1500 mL fluid limit');
  await expect(card(page, 'Fluid instructions')).toContainText('Strict intake and output; daily weight');
  await expect(card(page, 'Fluid instructions')).toContainText('ClinBridge does not work out what is left of a limit.');
  await expect(card(page, 'IV fluids')).toContainText('No IV fluid order');
  await expect(card(page, 'Daily weight')).toContainText('Not recorded');
  await expect(page.getByRole('main')).not.toContainText(/1260|16 ?%|budget|diure|decongest|mL\/kg|renal|excellent|target/i);

  const chart = page.getByTestId('io-chart');
  await expect(chart.locator('rect[data-bar="in"]')).toHaveCount(1);
  await expect(chart.locator('rect[data-bar="out"]')).toHaveCount(2);
  await expect(chart.locator('circle[data-balance="-530"]')).toHaveCount(1);
  await expect(chart.getByText('Now 13:20')).toBeVisible();
  await expect(chart.getByRole('img')).toHaveAttribute('aria-label', /10:00 Out 420 mL, Running balance −530 mL/);
  await chart.getByRole('button', { name: /hour from 09:00/ }).hover();
  await expect(chart.getByText('In 240 mL', { exact: true })).toBeVisible();
  await chart.getByRole('button', { name: /hour from 05:00/ }).focus();
  await expect(chart.getByText('Out 350 mL', { exact: true })).toBeVisible();

  const intake = card(page, 'Intake ledger'), output = card(page, 'Output ledger');
  await expect(intake.getByRole('listitem')).toHaveCount(1);
  await expect(output.getByRole('listitem')).toHaveCount(2);
  await expect(output.getByRole('listitem').first()).toContainText('420 mL');
  await expect(output).toContainText('770 mL');
  await expect(output.getByText('Simulated proposal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flag alert' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Flag alert' })).toHaveAccessibleDescription(/No fluid alert limit is approved/);
  await expect(card(page, 'Latest labs')).toContainText('Potassium 3.4 mmol/L (low) · hospital list');
  await page.screenshot({ path: info.outputPath('screens/io-1440.png'), fullPage: true });

  const base = /\/patients\/pt-08/;
  for (const [name, url] of [['All notes', /\/notes$/], ['All labs', /\/labs$/], ['Full history', /\/timeline$/], ['Paper vitals & I/O sheet', /\/print\/vit\/pt-08$/], ['Write it in a note', /\/notes\/new$/]] as const) {
    await page.getByRole('main').getByRole('link', { name }).click();
    await expect(page).toHaveURL(url);
    await page.goBack();
    await expect(page).toHaveURL(base);
    await expect(balance).toBeVisible();
  }
  await output.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/entries\//);
});

test('Add intake and Add output open the form on the right side; − and + need a typed amount; leaving writes nothing', async ({ page }) => {
  await open(page, '/patients/pt-08/io');
  await card(page, 'Output ledger').getByRole('link', { name: 'Add output' }).click();
  await expect(page.getByRole('button', { name: /^Out/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Close' }).click();
  await card(page, 'Intake ledger').getByRole('link', { name: 'Add intake' }).click();
  await expect(page.getByRole('button', { name: /^In \(/ })).toHaveAttribute('aria-pressed', 'true');
  const more = page.getByRole('button', { name: '50 mL more' }), less = page.getByRole('button', { name: '50 mL less' });
  await expect(more).toBeDisabled();
  await expect(less).toBeDisabled();
  await page.getByLabel('Amount (mL)').fill('100');
  await more.click();
  await more.click();
  await less.click();
  await expect(page.getByLabel('Amount (mL)')).toHaveValue('150');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(card(page, 'Fluid balance today')).toContainText('In: 240 mL');
  await card(page, 'Intake ledger').getByRole('link', { name: 'Add intake' }).click();
  await page.getByRole('button', { name: 'By mouth' }).click();
  await page.getByLabel('Amount (mL)').fill('100');
  await more.click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await expect(card(page, 'Fluid balance today')).toContainText('−380 mL');
  await expect(card(page, 'Intake ledger').getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('io-chart').locator('rect[data-bar="in"]')).toHaveCount(2);

  // A mistake leaves the ledger and the totals, and stays listed below.
  await card(page, 'Intake ledger').getByRole('link').first().click();
  await page.getByRole('button', { name: 'Wrong patient or mistake' }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Practice check');
  await page.getByRole('button', { name: 'Mark as mistake' }).click();
  await expect(page.getByText('Practice check')).toBeVisible();
  await page.goBack();
  await expect(card(page, 'Fluid balance today')).toContainText('−530 mL');
  await expect(card(page, 'Other fluid records')).toContainText('150 mL');
});

test('IV fluid order, rate and recorded periods; empty output ledger', async ({ page }) => {
  await open(page, '/patients/pt-07/io');
  await expect(card(page, 'IV fluids')).toContainText('sodium chloride 0.9% into the vein at 100 mL/hour');
  await expect(card(page, 'IV fluids')).toContainText('Last IV line on a medicine record: Left forearm, 04:30');
  await expect(card(page, 'Fluid balance today')).toContainText('+800 mL');
  await expect(card(page, 'Intake ledger')).toContainText('Pump reading · 05:00 to 09:00');
  await expect(card(page, 'Output ledger')).toContainText('No output recorded today');
});

test('an administrator can read but not add fluids', async ({ page }) => {
  await open(page, '/patients/pt-08/io', /Kim Ellis/);
  await expect(page.getByText('Only nurses can add fluids')).toBeVisible();
  for (const name of ['Add fluid', 'Add intake', 'Add output']) await expect(page.getByRole('link', { name })).toHaveCount(0);
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`no sideways scrolling at ${width}, and the current tab is in view`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, '/patients/pt-08/io');
    await expect(card(page, 'Output ledger')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const tab = (await page.getByRole('navigation', { name: 'Patient pages' }).getByRole('link', { name: 'Intake / Output' }).boundingBox())!;
    expect(tab.x).toBeGreaterThanOrEqual(0);
    expect(tab.x + tab.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`screens/io-${width}.png`), fullPage: true });
  });
}
