import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/**
 * Patient identity on paper: every printed page of every patient screen carries the name, date of birth and MRN of
 * that patient, and of no other patient. Each check reads a real PDF page by page. Fictional Practice data only.
 * For the long handover only, the browser receives the seed plus two FICTIONAL handovers labelled "LAYOUT TEST"
 * (nothing is added to the committed seed).
 */
test.use({ serviceWorkers: 'block' });

const MRNS = ['DK-004512', 'DK-004518', 'DK-004541', 'DK-004563'];
const PETER = { name: 'Peter Novak', born: '9 Dec 1963', mrn: 'DK-004563', bed: '8A' };
const TOM = { name: 'Tom Hale', born: '17 May 1944', mrn: 'DK-004541', bed: '6A' };
const SAM = { name: 'Sam Rivera', born: '12 Mar 1959', mrn: 'DK-004512', bed: '4B' };
type Who = typeof PETER;

/** PDF text can split or join words differently from the screen: compare with all whitespace removed. */
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

async function signIn(page: Page, path: string) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
}

/** Same app session, another page of the same patient. */
async function goTo(page: Page, path: string) {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
}

async function expectIdentityOnEveryPage(page: Page, who: Who, where: string, format: 'A4' | 'Letter' = 'A4') {
  const pages = (await pdfPageTexts(await page.pdf({ format }))).map(squash);
  expect(pages.length, `${where}: pages`).toBeGreaterThan(0);
  pages.forEach((t, i) => {
    const at = `${where}, ${format} page ${i + 1} of ${pages.length}`;
    for (const s of [who.name, `Born ${who.born}`, `MRN ${who.mrn}`, `Bed ${who.bed}`, 'Printed by Daniel Okafor', 'Fake practice data, not a clinical record']) expect(t, `${at}: ${s}`).toContain(squash(s));
    for (const other of MRNS.filter((m) => m !== who.mrn)) expect(t, `${at}: must not show ${other}`).not.toContain(squash(other));
  });
  return pages;
}

for (const format of ['A4', 'Letter'] as const) {
  test(`history (${format}): identifiers on every page, also when all records are open`, async ({ page }) => {
    await signIn(page, '/patients/pt-09/timeline');
    await page.getByRole('button', { name: 'Yes, open' }).click();
    await expect(page.getByTestId('spo2-trend')).toBeVisible();
    await page.getByRole('button', { name: 'Expand all' }).click();
    const pages = await expectIdentityOnEveryPage(page, PETER, 'history', format);
    expect(pages.length).toBeGreaterThan(1);
    const all = pages.join('');
    for (const s of ['History', 'azithromycin', 'Charting integrity']) expect(all).toContain(squash(s));
    for (const s of ['Expand all', 'Print history', 'Open details']) expect(all).not.toContain(squash(s)); // controls stay off the paper
  });

  test(`handover (${format}): identifiers on every page of a long handover, and the whole text is there`, async ({ page }) => {
    const para = (label: string) => Array.from({ length: 16 }, (_, i) => `LAYOUT TEST ${label} line ${i + 1}: fictional handover text that is long enough to wrap across the full width of the page so the section grows.`).join('\n');
    const rows = [{
      id: 'ho-layout', patient_id: 'pt-01', shift: 'LAYOUT TEST long handover (fictional)', situation: para('situation'), background: para('background'), assessment: para('assessment'),
      open_items: Array.from({ length: 20 }, (_, i) => `LAYOUT TEST open item ${i + 1} (fictional)`), source_entry_ids: [], created_by: 'pr-okafor',
    }];
    await page.route(/\/assets\/downtimekit-seed-[^/]+\.js$/, async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      const h = /handoff:([A-Za-z_$][\w$]*),audit_log:/;
      expect(body).toMatch(h);
      await route.fulfill({ response: res, body: body.replace(h, (_m, v) => `handoff:${v}.concat(${JSON.stringify(rows)}),audit_log:`), headers: { ...res.headers(), 'content-type': 'text/javascript' } });
    });
    await signIn(page, '/patients/pt-01/handoff/ho-layout');
    await page.getByRole('button', { name: 'Yes, open' }).click();
    await expect(page.getByText('LAYOUT TEST open item 20')).toBeVisible();
    const pages = await expectIdentityOnEveryPage(page, SAM, 'handover', format);
    expect(pages.length).toBeGreaterThan(1);
    const all = pages.join('');
    for (const s of ['Handover', 'LAYOUT TEST situation line 1:', 'LAYOUT TEST assessment line 16:', 'LAYOUT TEST open item 20']) expect(all).toContain(squash(s));
  });
}

test('every patient page carries the identifiers when printed with the browser (Ctrl+P)', async ({ page }) => {
  await signIn(page, '/patients/pt-05');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  const base = '/patients/pt-05';
  for (const path of ['', '/timeline', '/meds', '/vitals', '/vitals/record', '/io', '/io/record', '/notes', '/notes/new', '/labs', '/orders', '/body', '/capture', '/handoff', '/handoff/ho-02', '/handoff/new']) {
    await goTo(page, base + path);
    await expect(page).toHaveURL(new RegExp(`${base}${path}$`));
    await expect(page.getByRole('region', { name: 'Patient', exact: true })).toContainText('Tom Hale');
    await page.waitForTimeout(400);
    await expectIdentityOnEveryPage(page, TOM, path || 'summary');
  }
  // A single record and its versions open from the history.
  await goTo(page, `${base}/timeline`);
  await page.getByRole('list', { name: 'Records' }).getByRole('button').first().click();
  await page.getByRole('link', { name: 'Open details' }).first().click();
  await expect(page).toHaveURL(/\/entries\//);
  const entry = new URL(page.url()).pathname;
  for (const path of ['', '/history', '/correct']) {
    await goTo(page, entry + path);
    await expect(page).toHaveURL(new RegExp(`${entry}${path}$`));
    await expect(page.getByRole('region', { name: 'Patient', exact: true })).toContainText('Tom Hale');
    await page.waitForTimeout(400);
    await expectIdentityOnEveryPage(page, TOM, `entry${path}`);
  }
});

test('the header follows the patient, shows the time of printing, and is not on the screen or on the paper forms', async ({ page }) => {
  await signIn(page, '/patients/pt-05/timeline');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  const head = page.locator('[data-print-identity]');
  await expect(head).toBeHidden(); // screen
  await expect(head).toHaveText(/Tom Hale · Born 17 May 1944 · MRN DK-004541 · Bed 6A/);
  await expect(head).toContainText('laptop DT-4W-01');

  await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 47 * 60_000; window.dispatchEvent(new Event('beforeprint')); });
  await expect(head).toContainText(/Printed by Daniel Okafor · 14:0\d, 14 Nov 2026/);

  await goTo(page, '/patients/pt-09/timeline');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(head).toHaveCount(1);
  await expect(head).toContainText('Peter Novak');
  await expect(head).not.toContainText('Tom Hale');

  await goTo(page, '/print/mar/pt-09');
  await expect(page.locator('.print-sheet')).toBeVisible();
  await expect(head).toHaveCount(0); // the paper form has its own repeating strip
});
