import { test, expect, type Page } from '@playwright/test';
import { NOT_REAL, expectFits, openAdmin } from './adminHelpers';
import { pdfPageTexts } from './pdfText';

/** Downtime and network clearance (Stitch "Downtime operations", "Network clearance gate"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();
const gate = (page: Page) => page.getByRole('region', { name: 'Network clearance', exact: true });
const digits = async (page: Page, d: string) => { for (const x of d) await gate(page).getByRole('button', { name: x, exact: true }).click(); };
async function drill(page: Page) {
  await openAdmin(page, '/admin/downtime');
  await page.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(page.getByRole('heading', { name: 'Now: System down' })).toBeVisible();
}
const ITEMS = ['IT / security team says', 'EHR team says', 'Downtime lead approved'];
const tickAll = async (page: Page) => { for (const t of ITEMS) await gate(page).getByRole('checkbox', { name: new RegExp(t) }).check(); };

test('back online: who and when, real counts, steps and history; no mesh, countdown, root cause or hospital link', async ({ page }) => {
  await openAdmin(page, '/admin/downtime');
  const main = page.getByRole('main');
  for (const t of ['Now: Back online', 'dt-2026-11-14', 'Open 9 h 40 min', 'cleared by Kim Ellis', 'Declared by Kim Ellis', '49 records, newest at this time', '3 on this laptop, save time not recorded', '11 of 45 signed off', 'Cleared 12:40', '2 waiting', '1 made', 'ClinBridge does not send anything']) await expect(main).toContainText(t);
  await expect(page.getByRole('list', { name: 'Downtimes' }).getByRole('listitem')).toHaveCount(1);
  await expect(main).not.toContainText(NOT_REAL);
  await expect(main).not.toContainText(/remaining|estimated|target recovery|root cause|code grey|fiber|checksum/i);
  await expect(gate(page)).toHaveCount(0);
});

test('End downtime is refused while the worklist is open', async ({ page }) => {
  await openAdmin(page, '/admin/downtime');
  await page.getByRole('button', { name: 'End downtime' }).click();
  await expect(page.getByRole('alert')).toContainText('34 worklist items are not signed off yet');
  await expect(page.getByRole('heading', { name: 'Now: Back online' })).toBeVisible();
});

test('a practice outage closes the old one as a drill and opens the gate', async ({ page }) => {
  await drill(page);
  const rows = page.getByRole('list', { name: 'Downtimes' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Open, system down');
  await expect(rows.nth(1)).toContainText('Closed by a drill');
  await expect(rows.nth(1)).toContainText('49');
  await expect(gate(page)).toContainText('0 of 3 ticked');
  await expect(gate(page)).toContainText('ClinBridge does not test the network');
  await expect(gate(page)).not.toContainText(/HTTP 200|probe|CISO|verified|air-gap|6-digit/i);
  await expect(page.getByRole('button', { name: 'Start a practice outage' })).toHaveCount(0);
});

test('the gate needs every tick and the PIN; the fourth digit does not clear by itself', async ({ page }) => {
  await drill(page);
  const clear = gate(page).getByRole('button', { name: /Clear network/ });
  await expect(clear).toBeDisabled();
  await digits(page, '2468');
  await expect(clear).toBeDisabled();
  await tickAll(page);
  await expect(gate(page)).toContainText('3 of 3 ticked');
  await expect(clear).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Now: System down' })).toBeVisible();
  await gate(page).getByRole('checkbox', { name: /EHR team says/ }).uncheck();
  await expect(clear).toBeDisabled();
});

test('a wrong PIN is refused and cleared; the right PIN opens Back online and is logged', async ({ page }) => {
  await drill(page);
  await tickAll(page);
  await digits(page, '1111');
  await gate(page).getByRole('button', { name: /Clear network/ }).click();
  await expect(gate(page).getByRole('alert')).toContainText('PIN is not right');
  await expect(gate(page).getByLabel('0 of 4 digits entered')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Now: System down' })).toBeVisible();
  await digits(page, '2468');
  await gate(page).getByRole('button', { name: /Clear network/ }).click();
  await expect(page.getByRole('heading', { name: 'Now: Back online' })).toBeVisible();
  await expect(gate(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'Change log' }).first().click();
  await page.getByLabel('Filter by action').selectOption({ label: 'Network cleared' });
  await expect(page.getByRole('list', { name: 'Rows' }).getByRole('listitem')).toHaveCount(2);
});

test('a nurse sees no downtime controls', async ({ page }) => {
  await openAdmin(page, '/admin/downtime', /Daniel Okafor/);
  await expect(page.getByText('Admins only.')).toBeVisible();
  await expect(page.getByRole('button', { name: /outage|Clear network|End downtime/ })).toHaveCount(0);
});

test('paper has the event, the steps and the history, without controls', async ({ page }) => {
  await openAdmin(page, '/admin/downtime');
  await expect(page.getByRole('list', { name: 'Downtimes' })).toBeVisible();
  const all = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
  for (const t of ['printed by Kim Ellis', 'Fake practice data, not a clinical record', 'Now: Back online', 'dt-2026-11-14', '11 of 45 signed off', 'Open, back online']) expect(all).toContain(squash(t));
  for (const t of ['Start a practice outage', 'Print this page', 'Encrypted backup']) expect(all).not.toContain(squash(t));
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: downtime and gate fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openAdmin(page, '/admin/downtime');
    await expect(page.getByRole('list', { name: 'Downtimes' })).toBeVisible();
    await expectFits(page, width);
    await page.getByRole('button', { name: 'Start a practice outage' }).click();
    await expect(gate(page)).toBeVisible();
    await expectFits(page, width);
  });
}
