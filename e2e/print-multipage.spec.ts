import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/**
 * Multi-page paper forms. The bundled seed is fictional, but no patient has enough orders or a long enough
 * handover to fill more than one page. For this test only, the browser receives the same seed plus extra
 * FICTIONAL rows, every one labelled "LAYOUT TEST":
 *   - 28 extra medicine orders for Sam Rivera (pt-01) and 26 for Lena Ortiz (pt-02);
 *   - one long handover each for Sam Rivera and Lena Ortiz.
 * Nothing is added to the committed seed file, and the rows exist only in this test's browser profile.
 * Each PDF is then read page by page to check every page carries the right patient's identifiers and no other.
 */

// The service worker would serve the seed from its offline cache, where the test cannot add the layout rows.
// Offline behaviour is covered separately in print.spec.ts.
test.use({ serviceWorkers: 'block' });

const PATIENTS = {
  'pt-01': { enc: 'enc-01', name: 'RIVERA, Sam', mrn: 'DK-004512', orders: 28 },
  'pt-02': { enc: 'enc-02', name: 'ORTIZ, Lena', mrn: 'DK-004518', orders: 26 },
} as const;

function layoutOrders() {
  return Object.entries(PATIENTS).flatMap(([pid, p]) => Array.from({ length: p.orders }, (_, i) => ({
    id: `ord-layout-${pid}-${i + 1}`, encounter_id: p.enc, type: 'med',
    text: `LAYOUT TEST medicine ${i + 1} (fictional), 10 mg by mouth four times daily`, drug_name: `Layout test medicine ${i + 1}`,
    rxnorm_code: null, dose: 10, dose_unit: 'mg', route: 'PO', route_snomed: null, frequency: 'four times daily',
    scheduled_times: ['06:00', '12:00', '18:00', '23:00'], prn: false, start: '2026-11-13T08:00:00-05:00', stop: null,
    status: 'active', status_time: '2026-11-13T08:00:00-05:00', ordered_by: 'Dr. Layout Test (fictional)',
  })));
}

function layoutHandovers() {
  const para = (label: string) => Array.from({ length: 9 }, (_, i) => `LAYOUT TEST ${label} line ${i + 1}: fictional handover text that is long enough to wrap across the full width of the sheet so the section grows.`).join(' ');
  return Object.keys(PATIENTS).map((pid) => ({
    id: `ho-layout-${pid}`, patient_id: pid, shift: 'LAYOUT TEST long handover (fictional)',
    situation: para('situation'), background: para('background'), assessment: para('assessment'),
    open_items: Array.from({ length: 14 }, (_, i) => `LAYOUT TEST open item ${i + 1} (fictional)`), source_entry_ids: [], created_by: 'pr-okafor',
  }));
}

async function serveLayoutSeed(page: Page) {
  await page.route(/\/assets\/downtimekit-seed-[^/]+\.js$/, async (route) => {
    const res = await route.fetch();
    let body = await res.text();
    const o = /active_order:([A-Za-z_$][\w$]*),snapshot_result:/;
    const h = /handoff:([A-Za-z_$][\w$]*),audit_log:/;
    expect(body).toMatch(o);
    expect(body).toMatch(h);
    body = body.replace(o, (_m, v) => `active_order:${v}.concat(${JSON.stringify(layoutOrders())}),snapshot_result:`);
    body = body.replace(h, (_m, v) => `handoff:${v}.concat(${JSON.stringify(layoutHandovers())}),audit_log:`);
    await route.fulfill({ response: res, body, headers: { ...res.headers(), 'content-type': 'text/javascript' } });
  });
}

async function signIn(page: Page, path: string) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
}

/** PDF text can split or join words differently from the screen: compare with all whitespace removed. */
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

/** Every page must show exactly one patient's name and MRN: the expected one. */
function expectEveryPage(pages: string[], expected: keyof typeof PATIENTS) {
  const want = PATIENTS[expected];
  pages.forEach((t, i) => {
    const flat = squash(t);
    expect(flat, `page ${i + 1} name`).toContain(squash(want.name));
    expect(flat, `page ${i + 1} MRN`).toContain(squash(want.mrn));
    expect(flat, `page ${i + 1} practice label`).toContain(squash('PRACTICE · FICTIONAL PATIENT'));
    for (const [id, other] of Object.entries(PATIENTS)) {
      if (id === expected) continue;
      expect(flat, `page ${i + 1} must not show ${other.mrn}`).not.toContain(squash(other.mrn));
      expect(flat, `page ${i + 1} must not show ${other.name}`).not.toContain(squash(other.name));
    }
  });
}

for (const format of ['A4', 'Letter'] as const) {
  test(`multi-page MAR and SBAR (${format}): the right identifiers on every page, nothing cut off`, async ({ page }, info) => {
    await serveLayoutSeed(page);
    await signIn(page, '/print/mar/pt-01');
    await page.getByRole('button', { name: 'Yes, open' }).click();
    const mar = page.locator('.print-sheet[data-form="mar"]');
    await expect(mar.getByTestId('mar-orders').locator('tbody > tr')).toHaveCount(30); // 2 seed + 28 layout-test orders

    const marPdf = await page.pdf({ format, printBackground: true, path: info.outputPath(`mar-${format}.pdf`) });
    await info.attach(`mar-${format}.pdf`, { body: marPdf, contentType: 'application/pdf' });
    const marPages = await pdfPageTexts(marPdf);
    expect(marPages.length, 'MAR pages').toBeGreaterThan(1);
    // Page 1 is not wasted: the order table starts on it (a long table may continue, it is not pushed to page 2).
    expect(squash(marPages[0]!)).toContain(squash('Active medicine orders'));
    expect(squash(marPages[0]!)).toContain(squash('amLODIPine'));
    expectEveryPage(marPages, 'pt-01');
    // Nothing is cut off: the first and last order rows and the footer are all in the PDF.
    const marAll = squash(marPages.join(''));
    for (const s of ['amLODIPine', 'metoprolol tartrate', 'LAYOUT TEST medicine 1 (fictional)', 'Layout test medicine 28', 'Confidential patient information', 'Initials key']) expect(marAll).toContain(squash(s));

    await page.getByRole('link', { name: /SBAR handover \(DT-SBAR-03\)/ }).click();
    const sbar = page.locator('.print-sheet[data-form="sbar"]');
    await expect(sbar).toContainText('LAYOUT TEST open item 14');
    const sbarPdf = await page.pdf({ format, printBackground: true, path: info.outputPath(`sbar-${format}.pdf`) });
    await info.attach(`sbar-${format}.pdf`, { body: sbarPdf, contentType: 'application/pdf' });
    const sbarPages = await pdfPageTexts(sbarPdf);
    expect(sbarPages.length, 'SBAR pages').toBeGreaterThan(1);
    expectEveryPage(sbarPages, 'pt-01');
    const sbarAll = squash(sbarPages.join(''));
    for (const s of ['LAYOUT TEST situation line 1:', 'LAYOUT TEST assessment line 9:', 'LAYOUT TEST open item 14', 'Prescriber signature', 'Incoming nurse', 'Confidential patient information']) expect(sbarAll).toContain(squash(s));
  });
}

test('two-patient packet PDF (A4): every page belongs to one patient, patients never share a page', async ({ page }, info) => {
  await serveLayoutSeed(page);
  await signIn(page, '/sign-in');
  await page.getByRole('link', { name: 'Paper form packets' }).click();
  await page.getByRole('checkbox', { name: /Vitals, neuro and I\/O/ }).uncheck();
  await page.getByLabel('Select Sam Rivera, bed 4B').check();
  await page.getByLabel('Select Lena Ortiz, bed 4C').check();
  await page.getByRole('button', { name: 'Check the list' }).click();
  await page.getByRole('button', { name: 'The list is right: show the preview' }).click();
  await expect(page.getByTestId('spooler-preview').locator('.print-sheet')).toHaveCount(4);
  const pdf = await page.pdf({ format: 'A4', printBackground: true, path: info.outputPath('packet-A4.pdf') });
  await info.attach('packet-A4.pdf', { body: pdf, contentType: 'application/pdf' });
  const pages = await pdfPageTexts(pdf);
  expect(pages.length).toBeGreaterThanOrEqual(4);
  const owner = pages.map((t, i) => {
    const flat = squash(t);
    const hits = Object.entries(PATIENTS).filter(([, p]) => flat.includes(squash(p.mrn))).map(([id]) => id);
    expect(hits, `page ${i + 1} shows exactly one patient`).toHaveLength(1);
    return hits[0];
  });
  // Pages run patient by patient: all of Sam Rivera's, then all of Lena Ortiz's.
  const firstLena = owner.indexOf('pt-02');
  expect(firstLena).toBeGreaterThan(0);
  expect(owner.slice(0, firstLena).every((o) => o === 'pt-01')).toBe(true);
  expect(owner.slice(firstLena).every((o) => o === 'pt-02')).toBe(true);
});
