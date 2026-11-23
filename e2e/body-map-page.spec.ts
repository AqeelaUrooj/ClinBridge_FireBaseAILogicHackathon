import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** Body map page parts added after the Stitch design (the figure itself is tested in body-map.spec.ts). Fictional Practice data only. */
async function open(page: Page, path: string, who = /Daniel Okafor/) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
}
const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

test('layers hide marks on the figure only, say so, and Reset brings everything back', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, '/patients/pt-02/body');
  const layers = page.getByRole('group', { name: 'Layers on the figure' });
  const injections = layers.getByRole('button', { name: 'Injections (2)' });
  await expect(injections).toHaveAttribute('aria-pressed', 'true');
  await expect(layers.getByRole('button', { name: 'IV lines (0)' })).toBeVisible();
  const reset = page.getByRole('button', { name: 'Reset view' });
  await expect(reset).toBeDisabled();
  await expect(page.locator('[data-marker="injection"]')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('screens/body-1440.png'), fullPage: true });

  await injections.click();
  await expect(injections).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-marker="injection"]')).toHaveCount(0);
  await expect(page.locator('[data-has-admin="true"]')).toHaveCount(0);
  await expect(page.getByText('Hidden on the figure: Injections.')).toBeVisible();
  // Hidden is never read out as "none", and the records stay in the lists.
  await expect(page.locator('svg[data-view="front"]').getByRole('button', { name: 'Abdomen, left side' })).toHaveAccessibleDescription('No shown administration at this site. A layer is hidden');
  await expect(card(page, 'All marked sites').getByRole('listitem')).toHaveCount(2);
  await card(page, 'All marked sites').getByRole('button', { name: /Abdomen, left side/ }).click();
  await expect(card(page, 'Selected body area details').getByRole('status')).toHaveText('1 documented administration');
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await reset.click();
  await expect(page.locator('[data-marker="injection"]')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Tap a body area' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Both', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(reset).toBeDisabled();
  await expect(page.getByRole('main')).not.toContainText(/recommended at|rotation|phlebitis|patent|lipohypertrophy|due change/i);
});

test('lines, risk notes, pain and photos come from saved records; links go to this patient', async ({ page }) => {
  await open(page, '/patients/pt-07/body');
  await expect(card(page, 'IV lines on record')).toContainText('Left forearm IV line');
  await expect(card(page, 'IV lines on record')).toContainText('Newest record: HYDROmorphone, 04:30, 14 Nov 2026 by Maria Alvarez, RN');
  await expect(card(page, 'IV lines on record')).toContainText('Insertion time, size, dressing and flushes are not recorded here.');
  await expect(card(page, 'Skin, risk and pain records')).toContainText('No pain value recorded.');
  await expect(card(page, 'Paper photos for these sites')).toContainText('No site on this map came from a paper photo.');
  const base = '/patients/pt-07';
  for (const [name, path] of [['Open medicines', '/meds'], ['Write a note', '/notes/new'], ['Write a site check in a note', '/notes/new'], ['Photo of paper', '/capture'], ['Handover', '/handoff']] as const) {
    await page.getByRole('main').getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${base}${path}$`));
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Body map', exact: true })).toBeVisible();
  }

  await page.getByRole('complementary', { name: 'Main menu' }).getByRole('link', { name: /My Patients/ }).click();
  await page.getByTestId('patient-pt-05').click(); // Tom Hale: two risk notes, no sites
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'OPEN FULL MAP' }).click();
  const skin = card(page, 'Skin, risk and pain records');
  await expect(skin).toContainText('Heels red but skin not broken');
  await expect(skin).toContainText('Pain 2 / 10 at 12:00. The vitals record does not say where.');
  await expect(skin).toContainText('No score calculated');
  await skin.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/entries\//);

  await page.getByRole('complementary', { name: 'Main menu' }).getByRole('link', { name: /My Patients/ }).click();
  await page.getByTestId('patient-pt-04').click(); // Grace Bell: a site that came from a paper photo
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'OPEN FULL MAP' }).click();
  await card(page, 'Paper photos for these sites').getByRole('link', { name: /ceFAZolin · Right hand IV line/ }).click();
  await expect(page).toHaveURL(/\/entries\/e-016$/);
});

test('printing keeps the patient identifiers and the records, and leaves the controls out', async ({ page }, info) => {
  await page.addInitScript(() => {
    (window as unknown as { __prints: number }).__prints = 0;
    window.print = () => { (window as unknown as { __prints: number }).__prints++; };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, '/patients/pt-02/body');
  await expect(page.locator('[data-marker="injection"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Print this map' }).click();
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  // The shared patient print header, once.
  await expect(page.locator('[data-print-identity]')).toHaveCount(1);
  await expect(page.locator('[data-print-identity]')).toContainText('Lena Ortiz · Born 30 Jul 1972 · MRN DK-004518 · Bed 4C');
  await expect(page.getByText('Printed by Daniel Okafor')).toHaveCount(1);
  await expect(card(page, 'All marked sites')).toBeVisible();
  for (const name of ['Print this map', 'Reset view', 'Front', 'Both']) await expect(page.getByRole('button', { name, exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Open medicines' })).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Patient pages' })).toBeHidden();
  await page.screenshot({ path: info.outputPath('screens/body-print.png'), fullPage: true });
  // A real PDF: the identifiers and the practice mark are on every page, and the records are on one of them.
  const pages = (await pdfPageTexts(await page.pdf({ format: 'A4', preferCSSPageSize: true }))).map((t) => t.replace(/\s+/g, ''));
  expect(pages.length).toBeLessThanOrEqual(2);
  for (const t of pages) {
    for (const id of ['LenaOrtiz', 'MRNDK-004518', 'Fakepracticedata']) expect(t).toContain(id);
    expect(t).not.toContain('Openmedicines');
  }
  expect(pages.join('')).toContain('insulinlispro4units');
});

test('an administrator sees the map but no record links', async ({ page }) => {
  await open(page, '/patients/pt-02/body', /Kim Ellis/);
  await expect(page.locator('[data-has-admin="true"]').first()).toBeVisible();
  await expect(card(page, 'Record at a body area')).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'Photo of paper' })).toHaveCount(0);
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`no sideways scrolling at ${width}; the selected area follows the figure on small screens`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, '/patients/pt-02/body');
    await expect(page.locator('[data-marker="injection"]')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const y = async (name: string) => (await card(page, name).boundingBox())!.y;
    if (width < 1280) expect(await y('Selected body area details')).toBeLessThan(await y('Paper photos for these sites'));
    else expect((await card(page, 'Selected body area details').boundingBox())!.x).toBeGreaterThan((await card(page, 'Figure').boundingBox())!.x);
    await page.screenshot({ path: info.outputPath(`screens/body-${width}.png`), fullPage: true });
  });
}
