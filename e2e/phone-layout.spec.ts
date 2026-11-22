import { test, expect, type Page, type Locator } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/**
 * Phone width (390 × 844) on every screen added in PR #14: no sideways scrolling of the page, and the main
 * buttons are fully on screen and usable. Wide tables and paper sheets may scroll inside their own box.
 * Fictional Practice data only.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __printCalls: number }).__printCalls = 0;
    window.print = () => { (window as unknown as { __printCalls: number }).__printCalls++; };
  });
}

async function signIn(page: Page, path: string) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
}

/** The page itself never scrolls sideways. */
async function expectNoPageOverflow(page: Page, where: string) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, `${where}: page wider than the screen`).toBeLessThanOrEqual(client);
}

/** Fully inside the screen horizontally, so it can be seen and pressed. */
async function expectOnScreen(l: Locator, where: string) {
  await l.scrollIntoViewIfNeeded();
  const box = await l.boundingBox();
  expect(box, `${where}: not rendered`).not.toBeNull();
  expect(box!.x, `${where}: cut off on the left`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${where}: cut off on the right`).toBeLessThanOrEqual(390);
  await expect(l).toBeEnabled();
}

async function expectOnScreenText(l: Locator, where: string) {
  await expect(l).toBeVisible();
  const box = await l.boundingBox();
  expect(box!.x + box!.width, `${where}: cut off on the right`).toBeLessThanOrEqual(390);
}

test('phone width: single paper forms, packet builder (all steps), SpO₂ card and vitals trend', async ({ page }, info) => {
  await stubPrint(page);
  await signIn(page, '/print/mar/pt-01');
  await expectOnScreen(page.getByRole('button', { name: 'Yes, open' }), 'patient check');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  for (const kind of ['mar', 'vit', 'sbar'] as const) {
    if (kind !== 'mar') await page.getByRole('link', { name: new RegExp(kind === 'vit' ? 'DT-VIT-02' : 'DT-SBAR-03') }).click();
    await expect(page.locator(`.print-sheet[data-form="${kind}"]`)).toBeVisible();
    await expectNoPageOverflow(page, `form ${kind}`);
    await expectOnScreen(page.getByRole('button', { name: 'Print this sheet' }), `form ${kind} print button`);
    await page.screenshot({ path: info.outputPath(`screens/phone-print-${kind}.png`), fullPage: true });
  }

  // Packet builder, every step.
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('complementary', { name: 'Main menu' }).getByRole('link', { name: /My Patients/ }).click();
  await page.getByRole('link', { name: 'Paper form packets' }).click();
  await expect(page.getByRole('heading', { name: 'Paper form packets' })).toBeVisible();
  await expectNoPageOverflow(page, 'packets: choose');
  await expectOnScreen(page.getByLabel('Select all 10 patients'), 'select all');
  await page.getByLabel('Select Sam Rivera, bed 4B').check();
  await page.getByLabel('Select Peter Novak, bed 8A').check();
  await expectOnScreen(page.getByRole('button', { name: 'Check the list' }), 'check the list');
  await page.screenshot({ path: info.outputPath('screens/phone-packets-choose.png'), fullPage: true });
  await page.getByRole('button', { name: 'Check the list' }).click();
  await expectNoPageOverflow(page, 'packets: check');
  // Every identifier is visible on a phone without sideways scrolling (stacked under the name).
  for (const id of ['DK-004512', 'DK-004563', '12 Mar 1959', '9 Dec 1963']) await expectOnScreenText(page.getByTestId('spooler-review').getByText(id).first(), id);
  await page.screenshot({ path: info.outputPath('screens/phone-packets-check.png'), fullPage: true });
  await expectOnScreen(page.getByRole('button', { name: 'The list is right: show the preview' }), 'show preview');
  await page.getByRole('button', { name: 'The list is right: show the preview' }).click();
  await expect(page.getByTestId('spooler-preview').locator('.print-sheet')).toHaveCount(6);
  await expectNoPageOverflow(page, 'packets: preview');
  await expectOnScreen(page.getByRole('button', { name: 'Print the packet' }), 'print packet');
  await page.getByRole('button', { name: 'Print the packet' }).click();
  await expectOnScreen(page.getByRole('button', { name: 'Open the print dialog' }), 'confirm print');
  await expectOnScreen(page.getByRole('button', { name: 'Cancel' }), 'cancel print');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.screenshot({ path: info.outputPath('screens/phone-packets-preview.png'), fullPage: true });
  expect(await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)).toBe(0);

  // SpO₂ card on history and the vitals trend.
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('complementary', { name: 'Main menu' }).getByRole('link', { name: /My Patients/ }).click();
  await page.getByText('Peter Novak').first().click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'View details' }).click();
  await expect(page.getByTestId('spo2-trend')).toBeVisible();
  await expectNoPageOverflow(page, 'history');
  await expectOnScreen(page.getByRole('region', { name: 'Oxygen level (SpO₂) trend' }).getByRole('link', { name: 'Vitals' }), 'SpO₂ card Vitals link');
  await page.getByRole('region', { name: 'Oxygen level (SpO₂) trend' }).getByRole('link', { name: 'Vitals' }).click();
  await expect(page.getByTestId('vitals-spo2-trend')).toBeVisible();
  await expectNoPageOverflow(page, 'vitals');
  await expectOnScreen(page.getByRole('link', { name: /Paper vitals & I\/O sheet/ }), 'vitals paper sheet link');
  await page.screenshot({ path: info.outputPath('screens/phone-vitals.png'), fullPage: true });
});
