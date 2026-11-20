import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

async function openBodyMap(page: Page, patientId: string) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).toHaveURL(/\/ward$/);
  await page.getByTestId(`patient-${patientId}`).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'View details' }).click();
  await page.getByRole('link', { name: 'Body map' }).click();
  await expect(page.getByRole('heading', { name: 'Body map' })).toBeVisible();
}

const ALL = ['HEAD', 'CHEST', 'ABDOMEN_LEFT', 'ABDOMEN_RIGHT', 'UPPER_BACK', 'LOWER_BACK', 'BUTTOCKS',
  ...['UPPER_ARM', 'FOREARM', 'HAND', 'THIGH', 'LOWER_LEG', 'FOOT', 'HEEL'].flatMap((p) => [`LEFT_${p}`, `RIGHT_${p}`])];

test.describe('body map', () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test('front/back switching and all 21 regions selectable with the mouse', async ({ page }) => {
    await openBodyMap(page, 'pt-02');
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    await expect(page.locator('svg[data-view="back"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('svg[data-view="front"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Both', exact: true }).click();
    expect(ALL).toHaveLength(21);
    for (const id of ALL) {
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

  test('keyboard selection, list selection, markers and linked records', async ({ page }) => {
    await openBodyMap(page, 'pt-02'); // Lena Ortiz: insulin at abdomen left 08:00 and right 12:00
    const abd = page.locator('svg[data-view="front"] [data-region="ABDOMEN_LEFT"]');
    await abd.focus();
    await page.keyboard.press('Enter');
    await expect(abd).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Abdomen, left side' })).toBeVisible();
    await expect(page.locator('svg[data-view="front"] [data-marker="injection"]')).toHaveCount(2);
    await page.getByRole('link', { name: /insulin lispro 4 units · Given/ }).click();
    await expect(page).toHaveURL(/\/entries\/e-022$/);
    await page.goBack();
    await page.getByLabel('Choose body area from a list').selectOption('RIGHT_HEEL');
    await expect(page.locator('svg[data-view="back"] [data-region="RIGHT_HEEL"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('recent-injections')).toContainText('Abdomen, right side');
    await expect(page.getByTestId('recent-injections')).toContainText('Abdomen, left side');
  });

  test('IV markers come from med_admin.site only', async ({ page }) => {
    await openBodyMap(page, 'pt-07'); // Daniel Okoye: HYDROmorphone via left forearm IV line
    await expect(page.locator('svg[data-view="front"] [data-marker="iv"]')).toHaveCount(1);
    await expect(page.locator('[data-marker="injection"]')).toHaveCount(0);
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
