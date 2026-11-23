import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectFits, openAdmin } from './adminHelpers';

/**
 * Device vs Cloud drill (Stitch "Device vs cloud comparison"). Fictional Practice data only. The on-device answer in
 * these tests is a MOCK of the Chrome Prompt API, never a real model; no cloud request is made.
 */
test.use({ serviceWorkers: 'block', baseURL: 'http://localhost:4174' }); // the build with FAKE Firebase values, as in ai.spec.ts
// Sam Rivera 04:00 holds 136/82, 76, 16, 97, 36.7, 0, Alert. The mock changes breathing, leaves out pain and adds blood sugar.
const MOCK = '{"bp_systolic":136,"bp_diastolic":82,"heart_rate":76,"resp_rate":61,"temp_c":36.7,"spo2":97,"glucose_mgdl":110,"consciousness":"Alert"}';
async function mock(page: Page) {
  await page.addInitScript((answer) => {
    (window as unknown as { LanguageModel: unknown }).LanguageModel = { availability: async () => 'available', create: async () => ({ prompt: async () => answer, promptStreaming: () => new ReadableStream(), destroy: () => {} }) };
  }, MOCK);
}
const open = async (page: Page) => { await openAdmin(page, '/drill/compare'); await expect(page.getByRole('heading', { name: 'One input, two models' })).toBeVisible(); };
const row = (page: Page, name: string) => page.getByRole('region', { name: 'Field by field' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });

test('nothing ran: no number, no match, no benchmark, nothing to save', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'Run on-device model' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Run cloud model' })).toBeDisabled();
  await page.getByLabel('Fictional source record').selectOption({ index: 1 });
  await expect(page.getByTestId('compare-input')).toContainText('BP 136 over 82');
  await expect(row(page, 'Pulse')).toContainText('76');
  await expect(row(page, 'Pulse')).toContainText('Not run');
  await expect(page.getByRole('button', { name: 'Save answers (JSON)' })).toBeDisabled();
  const main = page.getByRole('main');
  await expect(main.getByText('Same', { exact: true })).toHaveCount(0);
  await expect(main).not.toContainText(/gemma|\bnpu\b|throttle|confidence|legibility|grade|validated safe|4\.4x|\bping\b|air-gap|simulate network/i);
  await expect(main).not.toContainText(/\d+ ms\b|of 8 known values/);
});

test('samples and the list choose the same source; the drawn form is marked fictional by name', async ({ page }) => {
  await open(page);
  const samples = page.getByRole('list', { name: 'Sources' }).getByRole('button');
  await expect(samples).toHaveCount(3);
  await samples.nth(1).click();
  await expect(samples.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Fictional source record').locator('option:checked')).toContainText('Lena Ortiz');
  await page.getByRole('radio', { name: 'Synthetic paper form (image)' }).click();
  await expect(page.getByRole('img', { name: 'Synthetic practice paper vitals form' })).toBeVisible();
});

test('an answer (MOCK model) is checked field by field: same, different, not read, not in the input', async ({ page }) => {
  await mock(page);
  const external: string[] = [];
  page.on('request', (r) => { if (!/^(https?:\/\/localhost|data:|blob:)/.test(r.url())) external.push(r.url()); });
  await open(page);
  await page.getByLabel('Fictional source record').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Run on-device model' }).click();
  const card = page.getByRole('region', { name: 'On-device model' });
  await expect(card.getByText(/On this laptop · ONLY_ON_DEVICE/)).toBeVisible();
  await expect(card).toContainText('6 of 8 known values repeated exactly');
  await expect(row(page, 'Pulse')).toContainText('Same');
  await expect(row(page, 'Breathing')).toContainText('61');
  await expect(row(page, 'Breathing')).toContainText('Different');
  await expect(row(page, 'Pain')).toContainText('Not read');
  await expect(row(page, 'Blood sugar')).toContainText('Not in the input');
  await expect(page.getByRole('region', { name: 'Cloud model' })).toContainText('Not run');
  await expect(page.getByRole('region', { name: 'Differences' })).toHaveCount(0);
  expect(external).toEqual([]);

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save answers (JSON)' }).click();
  const j = JSON.parse(readFileSync(await (await dl).path(), 'utf8'));
  expect(j.cloud).toBe('not run');
  expect(j.on_device.ran_at).toBe('on_device');
  expect(j.note).toContain('Fictional input');

  await page.getByLabel('Fictional source record').selectOption({ index: 2 }); // another input: the old answer must go
  await expect(card.getByText(/ONLY_ON_DEVICE/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save answers (JSON)' })).toBeDisabled();
});

test('System down blocks the cloud side and says so', async ({ page }) => {
  await openAdmin(page, '/admin/downtime');
  await page.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(page.getByText('SYSTEM DOWN').first()).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/drill/compare'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByLabel('Fictional source record').selectOption({ index: 1 });
  await expect(page.getByRole('button', { name: 'Run cloud model' })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Cloud model' })).toContainText('Cloud blocked: System down');
  await expect(page.getByRole('region', { name: 'Practice drill' })).toContainText('Blocked');
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: the drill fits with an answer (MOCK model); nothing is cut off`, async ({ page }) => {
    await mock(page);
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    await page.getByLabel('Fictional source record').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Run on-device model' }).click();
    await expect(row(page, 'Blood sugar')).toBeVisible();
    await expectFits(page, width);
  });
}
