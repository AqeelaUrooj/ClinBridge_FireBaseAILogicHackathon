import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

async function signIn(page: Page) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).toHaveURL(/\/ward$/);
}

async function openVerifiedBodyMap(page: Page, patientId: string) {
  await page.getByTestId(`patient-${patientId}`).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'View details' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Body map' }).click();
  await expect(page.getByRole('heading', { name: 'Body map' })).toBeVisible();
}

async function openBodyMap(page: Page, patientId: string) {
  await signIn(page);
  await openVerifiedBodyMap(page, patientId);
}

const ORIGINAL = ['HEAD', 'CHEST', 'ABDOMEN_LEFT', 'ABDOMEN_RIGHT', 'UPPER_BACK', 'LOWER_BACK', 'BUTTOCKS',
  ...['UPPER_ARM', 'FOREARM', 'HAND', 'THIGH', 'LOWER_LEG', 'FOOT', 'HEEL'].flatMap((p) => [`LEFT_${p}`, `RIGHT_${p}`])];
const ADDITIONS = [
  { id: 'NECK', label: 'Neck', view: 'front' },
  { id: 'BACK_OF_NECK', label: 'Back of neck', view: 'back' },
  { id: 'PERINEUM', label: 'Perineum', view: 'back' },
];

test.describe('body map', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('front/back switching and all 24 regions selectable with the mouse', async ({ page }) => {
    await openBodyMap(page, 'pt-02');
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    await expect(page.locator('svg[data-view="back"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('svg[data-view="front"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Both', exact: true }).click();
    const ids = [...ORIGINAL, ...ADDITIONS.map(({ id }) => id)];
    const options = await page.getByLabel('Choose body area from a list').locator('option').evaluateAll(
      (nodes) => nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean),
    );
    expect(options.sort()).toEqual(ids.sort());
    for (const { id, view } of ADDITIONS) {
      await expect(page.locator(`svg[data-view="${view}"] [data-region="${id}"]`)).toHaveCount(1);
      await expect(page.locator(`[data-region="${id}"]`)).toHaveCount(1);
    }
    for (const id of ids) {
      const r = page.locator(`[data-region="${id}"]`).first();
      await r.click();
      await expect(r).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test("patient's left is on the viewer's right in front view and on the viewer's left in back view", async ({ page }) => {
    await openBodyMap(page, 'pt-02');
    const centreX = async (sel: string) => { const b = (await page.locator(sel).boundingBox())!; return b.x + b.width / 2; };
    const frontMid = await centreX('svg[data-view="front"]');
    const backMid = await centreX('svg[data-view="back"]');
    expect(await centreX('svg[data-view="front"] [data-region="LEFT_FOREARM"]')).toBeGreaterThan(frontMid);
    expect(await centreX('svg[data-view="front"] [data-region="ABDOMEN_LEFT"]')).toBeGreaterThan(frontMid);
    expect(await centreX('svg[data-view="back"] [data-region="LEFT_HEEL"]')).toBeLessThan(backMid);
    expect(await centreX('svg[data-view="back"] [data-region="LEFT_FOREARM"]')).toBeLessThan(backMid);
  });

  test('documented sites match the picker, keyboard selection, pins and exact records', async ({ page }, testInfo) => {
    await openBodyMap(page, 'pt-02'); // Lena Ortiz: insulin at abdomen left 08:00 and right 12:00
    const front = page.locator('svg[data-view="front"]');
    const abd = front.getByRole('button', { name: 'Abdomen, left side' });
    const picker = page.getByLabel('Choose body area from a list');
    await expect(front.locator('[data-has-admin="true"]')).toHaveCount(2);
    await expect(front.locator('[data-region="ABDOMEN_RIGHT"]')).toHaveAttribute('data-has-admin', 'true');
    await expect(front.locator('[data-region="CHEST"]')).not.toHaveAttribute('data-has-admin', 'true');
    await expect(abd).toHaveAccessibleDescription('1 documented administration');
    await expect(picker.locator('option[value="ABDOMEN_LEFT"]')).toHaveText('Abdomen, left side — 1 documented administration');
    await expect(front.locator('[data-marker="injection"]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('screens', 'front-multiple-sites.png'), fullPage: true });

    const historicalFill = await abd.evaluate((el) => getComputedStyle(el).fill);
    await page.keyboard.press('Tab');
    await abd.focus();
    await expect(abd).toBeFocused();
    await expect(abd).toHaveJSProperty('tabIndex', 0);
    expect(await abd.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('screens', 'keyboard-focus.png'), fullPage: true });

    await page.keyboard.press('Enter');
    await expect(abd).toHaveAttribute('aria-pressed', 'true');
    await expect(abd).toHaveAttribute('data-has-admin', 'true');
    await expect.poll(() => abd.evaluate((el) => getComputedStyle(el).fill)).not.toBe(historicalFill);
    const details = page.getByRole('region', { name: 'Selected body area details' });
    await expect(details.getByRole('heading', { name: 'Abdomen, left side' })).toBeVisible();
    await expect(details.getByRole('status')).toHaveText('1 documented administration');
    await expect(details.getByText(/SC · 08:00/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('screens', 'selected-administration.png'), fullPage: true });
    await page.getByRole('link', { name: /insulin lispro 4 units · Given/ }).click();
    await expect(page).toHaveURL(/\/entries\/e-022$/);
    await page.goBack();
    await page.getByLabel('Choose body area from a list').selectOption('RIGHT_HEEL');
    await expect(page.locator('svg[data-view="back"] [data-region="RIGHT_HEEL"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('recent-injections')).toContainText('Abdomen, right side');
    await expect(page.getByTestId('recent-injections')).toContainText('Abdomen, left side');
    await expect(page.getByText('No confirmed medication administrations are recorded at this body area.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('screens', 'back-unmarked-selection.png'), fullPage: true });
  });

  test('one IV administration highlights both views and retains its primary-view pin', async ({ page }, testInfo) => {
    await openBodyMap(page, 'pt-07'); // Daniel Okoye: HYDROmorphone via left forearm IV line
    await expect(page.locator('svg[data-view="front"] [data-marker="iv"]')).toHaveCount(1);
    await expect(page.locator('[data-marker="injection"]')).toHaveCount(0);
    for (const view of ['front', 'back']) {
      const sites = page.locator(`svg[data-view="${view}"] [data-has-admin="true"]`);
      await expect(sites).toHaveCount(1);
      await expect(sites).toHaveAttribute('data-region', 'LEFT_FOREARM');
    }
    await page.screenshot({ path: testInfo.outputPath('screens', 'both-views-one-site.png'), fullPage: true });
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath('screens', 'back-documented-site.png'), fullPage: true });
  });

  test('a saved mistake removes only the affected administration highlight', async ({ page }) => {
    await openBodyMap(page, 'pt-02');
    const original = page.locator('[data-region="ABDOMEN_LEFT"]');
    await expect(original).toHaveAttribute('data-has-admin', 'true');
    await original.click();
    await page.getByRole('link', { name: /insulin lispro 4 units · Given/ }).click();
    await page.getByRole('button', { name: 'Wrong patient or mistake' }).click();
    await page.getByLabel('Reason', { exact: true }).fill('Duplicate Practice documentation');
    await page.getByRole('button', { name: 'Mark as mistake' }).click();
    await expect(page.getByText('Duplicate Practice documentation')).toBeVisible();
    await page.goBack();
    await expect(page.locator('[data-region="ABDOMEN_RIGHT"]')).toHaveAttribute('data-has-admin', 'true');
    await expect(original).not.toHaveAttribute('data-has-admin', 'true');
    await original.click();
    await expect(page.getByText('No confirmed medication administrations are recorded at this body area.')).toBeVisible();
  });

  test('requires patient verification and restores only the current patient’s sites offline', async ({ page, context }) => {
    await page.goto('/patients/pt-02/body');
    await expect(page.locator('[data-has-admin]')).toHaveCount(0);
    await openBodyMap(page, 'pt-02');
    await expect(page.locator('[data-region="ABDOMEN_LEFT"][data-has-admin="true"]')).toHaveCount(1);
    await page.getByRole('complementary', { name: 'Main menu' }).getByRole('link', { name: /My Patients/ }).click();
    await page.getByTestId('patient-pt-07').click();
    await expect(page.getByRole('button', { name: 'Yes, open' })).toBeVisible();
    await expect(page.locator('[data-has-admin]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Yes, open' }).click();
    await page.getByRole('link', { name: 'View details' }).click();
    await page.getByRole('main').getByRole('link', { name: 'Body map' }).click();
    await expect(page.locator('[data-region="ABDOMEN_LEFT"][data-has-admin="true"]')).toHaveCount(0);
    await expect(page.locator('svg[data-view="front"] [data-region="LEFT_FOREARM"]')).toHaveAttribute('data-has-admin', 'true');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await signIn(page);
    await openVerifiedBodyMap(page, 'pt-07');
    await expect(page.locator('svg[data-view="front"] [data-region="LEFT_FOREARM"]')).toHaveAttribute('data-has-admin', 'true');
    await expect(page.locator('[data-region="ABDOMEN_LEFT"][data-has-admin="true"]')).toHaveCount(0);
  });

  test('regions stay aligned with the artwork when the window is resized', async ({ page }) => {
    await openBodyMap(page, 'pt-02');
    const ratio = async () => {
      const svg = (await page.locator('svg[data-view="front"]').boundingBox())!;
      const r = (await page.locator('svg[data-view="front"] [data-region="LEFT_HAND"]').boundingBox())!;
      return [(r.x - svg.x) / svg.width, (r.y - svg.y) / svg.height];
    };
    const a = await ratio();
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    const b = await ratio();
    expect(Math.abs(a[0]! - b[0]!)).toBeLessThan(0.01);
    expect(Math.abs(a[1]! - b[1]!)).toBeLessThan(0.01);
  });
});

test.describe('body map on a touch viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Both keeps the single-view target size on narrow panels and compares side by side on desktop', async ({ page }, info) => {
    await openBodyMap(page, 'pt-02');
    const picker = page.getByLabel('Choose body area from a list');
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('button', { name: 'Front', exact: true }).click();
      const front = page.locator('svg[data-view="front"]');
      const singleWidth = (await front.boundingBox())!.width;
      await page.getByRole('button', { name: 'Both', exact: true }).click();
      const first = (await front.boundingBox())!;
      const second = (await page.locator('svg[data-view="back"]').boundingBox())!;
      if (width < 1440) {
        expect(first.width).toBeCloseTo(singleWidth, 0);
        expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
      } else {
        expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
      }
      for (const { id } of ADDITIONS) {
        await picker.selectOption('HEAD');
        const target = page.locator(`[data-region="${id}"]`);
        await target.tap();
        await expect(picker).toHaveValue(id);
        await expect(target).toHaveAttribute('aria-pressed', 'true');
      }
      await expect(front.locator('[data-marker="injection"]')).toHaveCount(2);
      if (width === 390) {
        await page.screenshot({ path: info.outputPath('screens', 'both-phone.png'), fullPage: true });
      }
    }
  });

  test('new regions support list navigation, keyboard and touch', async ({ page }, testInfo) => {
    await openBodyMap(page, 'pt-02');
    const picker = page.getByLabel('Choose body area from a list');
    for (const { id, label, view } of ADDITIONS) {
      // Start in the opposite view and let the picker switch to the area’s view.
      await page.getByRole('button', { name: view === 'front' ? 'Back' : 'Front', exact: true }).click();
      await picker.selectOption(id);
      const figure = page.locator(`svg[data-view="${view}"]`);
      const target = figure.getByRole('button', { name: label, exact: true });
      await expect(target).toHaveAttribute('aria-pressed', 'true');

      await picker.selectOption('HEAD');
      await target.focus();
      await page.keyboard.press('Space');
      await expect(picker).toHaveValue(id);

      await picker.selectOption('HEAD');
      await target.tap();
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await expect(page.getByText('No confirmed medication administrations are recorded at this body area.')).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath('screens', 'perineum-phone.png'), fullPage: true });
    await picker.selectOption('ABDOMEN_RIGHT');
    const abdomen = page.locator('svg[data-view="front"] [data-region="ABDOMEN_RIGHT"]');
    await picker.selectOption('HEAD');
    await abdomen.tap();
    await expect(abdomen).toHaveAttribute('data-has-admin', 'true');
    await expect(picker).toHaveValue('ABDOMEN_RIGHT');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: testInfo.outputPath('screens', 'phone-administration.png'), fullPage: true });
  });
});
