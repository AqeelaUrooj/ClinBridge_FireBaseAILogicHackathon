import { test, expect, type Page } from '@playwright/test';
import { NOT_REAL, expectFits, openAdmin } from './adminHelpers';
import { pdfPageTexts } from './pdfText';

/** Patient list (Stitch "Patient snapshot management"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();
const open = async (page: Page) => { await openAdmin(page, '/admin/snapshot'); await expect(page.getByRole('list', { name: 'Patients' })).toBeVisible(); };
const rows = (page: Page) => page.getByRole('list', { name: 'Patients' }).getByRole('listitem');

test('real source, age and counts; ten patients; no rollback, distribution, acuity or diagnosis', async ({ page }) => {
  await open(page);
  const main = page.getByRole('main');
  for (const t of ['List 10 h 20 min old', 'snap-2026-11-14-0300', 'Hospital EHR downtime report (fictional)', 'This browser, encrypted (AES-256-GCM)', '2 marked severe', 'All 27 of the list', '9 labs, 52 vital signs and fluids', 'The fake list came with the app']) await expect(main).toContainText(t);
  await expect(rows(page)).toHaveCount(10);
  await expect(rows(page).first()).toContainText('4B');
  await expect(rows(page).filter({ hasText: 'Peter Novak' })).toContainText('DK-004563');
  await expect(rows(page).filter({ hasText: 'Peter Novak' })).toContainText('Droplet isolation');
  await expect(rows(page).filter({ hasText: 'Tom Hale' })).toContainText('Shellfish (Throat swelling), severe');
  await expect(main).not.toContainText(NOT_REAL);
  await expect(main).not.toContainText(/rollback|restore this|acuity|simulate|retention|diagnosis|inspect fhir/i);
});

test('search and filter change the rows; an empty result says so', async ({ page }) => {
  await open(page);
  await page.getByLabel('Search the patient list').fill('penicillin');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Sam Rivera');
  await page.getByLabel('Search the patient list').fill('');
  await page.getByLabel('Show', { exact: true }).selectOption('severe');
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Show', { exact: true }).selectOption('isolation');
  await expect(page.getByText('Showing 2 of 10')).toBeVisible();
  await page.getByLabel('Search the patient list').fill('zzz');
  await expect(page.getByText('No patients here')).toBeVisible();
});

test('Check the list compares the stored rows and says what it cannot know', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Check the list' }).click();
  const box = page.getByRole('region', { name: 'List check' });
  await expect(box.getByRole('status')).toContainText(/Checked at 13:2\d: no line of 11 is wrong\./);
  await expect(box).toContainText('27 here, 27 in the list');
  await expect(box).toContainText('cannot tell whether the hospital');
});

test('a list with a lost row is found', async ({ page }) => {
  await page.route(/\/assets\/downtimekit-seed-[^/]+\.js$/, async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    expect(body).toMatch(/"?active_order"?:27/);
    await route.fulfill({ response: res, body: body.replace(/("?active_order"?):27/g, '$1:28'), headers: { ...res.headers(), 'content-type': 'text/javascript' } });
  });
  await open(page);
  await page.getByRole('button', { name: 'Check the list' }).click();
  await expect(page.getByRole('region', { name: 'List check' })).toContainText('27 here, 28 in the list');
  await expect(page.getByRole('region', { name: 'List check' }).getByRole('status')).toContainText('1 of 11 lines do not fit');
});

test('a patient opens only through the patient check', async ({ page }) => {
  await open(page);
  await page.getByRole('link', { name: 'Open Peter Novak' }).click();
  await expect(page.getByRole('dialog', { name: 'Is this the right patient?' })).toContainText('Peter Novak');
});

test('Practice cannot load a file; a nurse cannot open the page', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Practice uses its own fake patient list')).toBeVisible();
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load a new list' })).toHaveCount(0);
  await openAdmin(page, '/admin/snapshot', /Daniel Okafor/);
  await expect(page.getByText('Admins only.')).toBeVisible();
});

test('paper holds the rows shown with MRN on each line', async ({ page }) => {
  await open(page);
  const all = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
  expect(all.split('dk-00').length - 1).toBe(10);
  for (const t of ['Patient list', 'printed by Kim Ellis', 'Fake practice data, not a clinical record', 'Peter Novak']) expect(all).toContain(squash(t));
  for (const t of ['Check the list', 'Load a new', 'Search']) expect(all).not.toContain(squash(t));
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: the patient list fits; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    await page.getByRole('button', { name: 'Check the list' }).click();
    await expect(page.getByRole('region', { name: 'List check' })).toBeVisible();
    await expectFits(page, width);
  });
}
