import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { NOT_REAL, expectFits, openAdmin } from './adminHelpers';

/** Readiness (Stitch "Readiness, storage telemetry"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });

test.describe('Readiness', () => {
  test('real facts of this laptop; nothing about hardware, mesh, batteries or timing', async ({ page }) => {
    await openAdmin(page, '/admin');
    const main = page.getByRole('main');
    for (const t of ['Readiness and storage', 'DT-4W-01', 'Downtime open 9 h 40 min', 'Works offline', 'AES-256-GCM', 'snap-2026-11-14-0300', '10 h 20 min', 'ClinBridge cannot see them', 'Prototype, not approved']) await expect(main).toContainText(t);
    await expect(page.getByRole('region', { name: 'Patient list on this laptop' })).toContainText(/Patients\s*10/);
    await expect(page.getByRole('region', { name: 'Laptops in this unit' }).getByRole('listitem')).toHaveCount(2);
    await expect(main).not.toContainText(NOT_REAL);
  });

  test('the number of fine checks is the number of fine rows; Check again reads again', async ({ page }) => {
    await openAdmin(page, '/admin');
    const list = page.getByRole('list', { name: 'Checks' });
    await expect(list.getByRole('listitem')).toHaveCount(10);
    const fine = await list.getByRole('img', { name: 'Fine' }).count();
    await expect(page.getByRole('main')).toContainText(`${fine} of 10 checks are fine`);
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Checked again at 13:2\d: \d+ fine/ })).toBeVisible();
  });

  test('losing the network changes the tile and is not called a problem', async ({ page, context }) => {
    await openAdmin(page, '/admin');
    await context.setOffline(true);
    const row = page.getByRole('list', { name: 'Checks' }).getByRole('listitem').filter({ hasText: 'Network: offline' });
    await expect(row).toContainText('Offline work is fine');
    await expect(row.getByRole('img', { name: 'Look' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('not connected');
  });

  test('the saved file holds the checks and no patient or staff name', async ({ page }) => {
    await openAdmin(page, '/admin');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save checks (JSON)' }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/^clinbridge-readiness-2026-11-14-13-2\d\.json$/);
    const text = readFileSync(await file.path(), 'utf8');
    expect(JSON.parse(text).checks).toHaveLength(10);
    expect(text).not.toMatch(/Novak|Rivera|Ortiz|Santos|Chen|Ellis|Okafor|Park|Whitfield|DK-00|pr-/);
  });

  test('links lead to the pages they name', async ({ page }) => {
    await openAdmin(page, '/admin');
    for (const [name, path] of [['Open patient list', '/admin/snapshot'], ['Open laptops', '/admin/devices'], ['Open change log', '/admin/audit'], ['Encrypted backup', '/admin/backup'], [/Recovery worklist/, '/recovery']] as const) {
      await page.getByRole('main').getByRole('link', { name }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await page.goBack();
    }
  });

  for (const width of [1440, 1280, 1024, 768, 390, 360]) {
    test(`${width}px: readiness fits; nothing is cut off`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openAdmin(page, '/admin');
      await expect(page.getByRole('list', { name: 'Checks' })).toBeVisible();
      await expectFits(page, width);
    });
  }
});
