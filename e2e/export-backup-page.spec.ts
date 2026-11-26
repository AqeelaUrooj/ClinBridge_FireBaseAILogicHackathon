import { test, expect, type Page } from '@playwright/test';
import { NOT_REAL, expectFits, openAdmin } from './adminHelpers';

/** Export and backup (Stitch "FHIR data sync, backup, recovery"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const openExport = async (page: Page, who = /Kim Ellis/) => { await openAdmin(page, '/export', who); await expect(page.getByRole('heading', { name: 'One file for the EHR team' })).toBeVisible(); };

test('export: real counts, who signed off, and no claim of a sync, gateway, certificate or attestation', async ({ page }) => {
  await openExport(page);
  const main = page.getByRole('main');
  for (const t of ['Network cleared 12:40', 'of 45 worklist items', '34 still open', '2 drafts left out', 'Newest 13:20, 14 Nov 2026, by Kim Ellis', 'It does not send anything to the EHR', 'does not know when the EHR team has loaded the file']) await expect(main).toContainText(t);
  const kinds = page.getByRole('list', { name: 'Kinds of records' }).getByRole('listitem');
  const counts = (await kinds.allInnerTexts()).map((t) => Number(t.match(/\n(\d+)\n/)?.[1]));
  expect(counts.reduce((a, b) => a + b, 0)).toBe(47);
  await expect(kinds.filter({ hasText: 'Vitals' })).toContainText('1 older version, marked corrected · 1 marked as a mistake · 1 draft left out');
  const who = page.getByRole('list', { name: 'Who signed off' }).getByRole('listitem');
  await expect(who).toHaveCount(2);
  await expect(who.first()).toContainText('Daniel Okafor');
  await expect(main).not.toContainText(NOT_REAL);
  await expect(main).not.toContainText(/authoritative|mTLS|gateway|100%|attest|custod|dry-run|transmit|archive mode|validated/i);
});

test('export: the resources shown are the resources in the file', async ({ page }) => {
  await openExport(page);
  await page.getByRole('button', { name: 'Prepare export file' }).click();
  await expect(page.getByTestId('export-summary')).toContainText('302 resources in the file'); // 301 + the fictional Admission Staff account (Practitioner)
  const n = (await page.locator('dl[aria-label="Resources in the file"] dd').allInnerTexts()).map(Number);
  expect(n.reduce((a, b) => a + b, 0)).toBe(302);
  await page.getByLabel('I understand this file is sensitive and not encrypted').check();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download file' }).click();
  await dl;
  await expect(page.getByRole('main')).toContainText(/2\s*files/);
});

test('export: a nurse is not sent to the admin backup; closed while the system is down', async ({ page }) => {
  await openExport(page, /Daniel Okafor/);
  await expect(page.getByText('An admin makes the backup.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open backup' })).toHaveCount(0);
  await openAdmin(page, '/admin/downtime');
  await page.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(page.getByText('SYSTEM DOWN').first()).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/export'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByText('Recovery starts after an admin clears the network')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare export file' })).toHaveCount(0);
});

test('backup: counts before and after a real backup; the fingerprint and the list follow', async ({ page }) => {
  await openAdmin(page, '/admin/backup');
  const main = page.getByRole('main');
  for (const t of ['No backup in the change log', 'No backup was made here', "This laptop's keys", 'not where it is now']) await expect(main).toContainText(t);
  await expect(main).toContainText(/49\s*records/);
  await expect(main).not.toContainText(NOT_REAL);
  await expect(main).not.toContainText(/usb|sandisk|mount|LUKS|mandat|forensic|write-safe/i);
  await page.getByLabel('Backup passphrase', { exact: true }).fill('quartz orchard bicycle eleven');
  await page.getByLabel('Backup passphrase again').fill('quartz orchard bicycle twelve');
  await page.getByRole('button', { name: 'Make encrypted backup' }).click();
  await expect(page.getByRole('alert')).toContainText('not the same');
  await page.getByLabel('Backup passphrase again').fill('quartz orchard bicycle eleven');
  const dl = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Make encrypted backup' }).click();
  await dl;
  await expect(page.getByText(/Backup file made/)).toBeVisible();
  await expect(main).toContainText('Newest backup 0 min ago');
  await expect(main).toContainText(/Not in a backup\s*pending_actions\s*0/i);
  await expect(page.getByRole('list', { name: 'Backups made' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByLabel('Backup passphrase', { exact: true })).toHaveValue('');
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: export and backup fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openExport(page);
    await page.getByRole('button', { name: 'Prepare export file' }).click();
    await expect(page.getByTestId('export-summary')).toBeVisible();
    await expectFits(page, width);
    await page.evaluate(() => { history.pushState({}, '', '/admin/backup'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByRole('list', { name: 'Backups made' })).toBeVisible();
    await expectFits(page, width);
  });
}
