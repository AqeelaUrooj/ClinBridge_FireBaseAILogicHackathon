import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/** Sidebar groups from the Stitch design (PRIMARY OPERATIONS / CLINICAL TOOLS / SYSTEM ADMIN), by role. */

async function signIn(page: Page, who: RegExp) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
}

const menu = (page: Page) => page.getByRole('complementary', { name: 'Main menu' });

test('nurse menu: primary operations and clinical tools work; no admin links; admin pages stay blocked', async ({ page }) => {
  await signIn(page, /Daniel Okafor/);
  const m = menu(page);
  await expect(m.getByRole('group', { name: 'Primary operations' })).toBeVisible();
  await expect(m.getByRole('group', { name: 'Clinical tools' })).toBeVisible();
  await expect(m.getByRole('group', { name: 'System admin' })).toHaveCount(0);
  await expect(m.getByRole('link', { name: /My Patients/ })).toContainText('10');

  await m.getByRole('link', { name: 'Medication Schedule' }).click();
  await expect(page.getByRole('heading', { name: 'Medication schedule' })).toBeVisible();
  await expect(page.getByRole('region', { name: /Medicines for Sam Rivera/ })).toContainText('amLODIPine');

  await m.getByRole('link', { name: 'Vitals Flowsheet' }).click();
  await expect(page.getByRole('heading', { name: 'Vitals flowsheet' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Sam Rivera/ })).toContainText('134/80');

  await m.getByRole('link', { name: 'Fluid Balance (I/O)' }).click();
  await expect(page.getByRole('heading', { name: 'Fluid balance (I/O)' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Rosa Santos/ })).toContainText('-530');

  await m.getByRole('link', { name: 'Lab Results' }).click();
  await expect(page.getByRole('heading', { name: 'Labs' })).toBeVisible();

  await m.getByRole('link', { name: 'Body Map' }).click();
  await expect(page.getByRole('heading', { name: 'Body map' })).toBeVisible();
  await page.getByRole('link', { name: /Lena Ortiz/ }).click();
  await expect(page.getByRole('heading', { name: 'Is this the right patient?' })).toBeVisible(); // patient check still runs

  await page.goto('/sign-in'); // (reload re-locks; sign in again for the next checks)
  await signIn(page, /Daniel Okafor/);
  await menu(page).getByRole('link', { name: 'Add Note / Form' }).click();
  await expect(page.getByRole('heading', { name: 'Add Note / Form' })).toBeVisible();
  await page.getByLabel('Forms for Peter Novak').getByRole('link', { name: 'Note' }).click();
  await expect(page.getByRole('heading', { name: 'Is this the right patient?' })).toBeVisible();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByRole('heading', { name: 'New note' })).toBeVisible();

  // In a patient, the clinical tools open that patient's pages.
  await expect(menu(page).getByRole('link', { name: 'Medication Schedule' })).toHaveAttribute('href', '/patients/pt-09/meds');

  await menu(page).getByRole('link', { name: /Alerts & Orders/ }).click();
  await expect(page.getByRole('heading', { name: 'Alerts & Orders' })).toBeVisible();
  await expect(page.getByText('Critical lab results')).toBeVisible();
  await expect(page.getByRole('link', { name: /Arjun Mehta · Potassium/ })).toBeVisible();
});

test('admin menu: system admin group; every link has a working page', async ({ page }) => {
  await signIn(page, /Kim Ellis/);
  const m = menu(page);
  await expect(m.getByRole('group', { name: 'System admin' })).toBeVisible();
  await expect(m.getByRole('group', { name: 'Clinical tools' })).toHaveCount(0);
  for (const [link, check] of [
    ['Readiness & Storage', page.getByRole('heading', { name: 'This laptop' })],
    ['Downtime Management', page.getByText(/^Now: /)],
    ['Recovery Gate & Worklist', page.getByRole('heading', { name: /To check/ })],
    ['Audit Log', page.getByText(/rows verified|log rows/).first()],
  ] as const) {
    await m.getByRole('link', { name: link }).click();
    await expect(check).toBeVisible();
  }
});

test('patient history: filter tabs with counts, search, order, expand/collapse, integrity facts', async ({ page }) => {
  await signIn(page, /Daniel Okafor/);
  await page.getByTestId('patient-pt-03').click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'View details' }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();

  const filters = page.getByRole('group', { name: 'Record type' });
  const all = filters.getByRole('button', { name: /All entries/ });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveText(/All entries \(\d+\)/); // counts appear only once the records have loaded
  await expect(page.getByRole('list', { name: 'Records' }).locator(':scope > li').first()).toBeVisible();
  const total = Number((await all.textContent())!.match(/\((\d+)\)/)![1]);
  const parts = await Promise.all(['Vitals', 'Medications', 'Clinical notes', 'Lab / bloodwork', 'Fluids (I/O)'].map(async (n) =>
    Number((await filters.getByRole('button', { name: new RegExp(`^${n.replace(/[()/]/g, '\\$&')}`) }).textContent())!.match(/\((\d+)\)/)![1])));
  expect(parts.reduce((a, b) => a + b, 0)).toBe(total); // tab counts add up

  const records = page.getByRole('list', { name: 'Records' }).locator(':scope > li');
  await expect(records).toHaveCount(total);

  await filters.getByRole('button', { name: /^Lab \/ bloodwork/ }).click();
  await expect(records.first()).toContainText('Potassium');
  await filters.getByRole('button', { name: /All entries/ }).click();

  await page.getByRole('button', { name: 'Oldest first' }).click();
  const firstOld = await records.first().getByRole('button').first().textContent();
  await page.getByRole('button', { name: 'Newest first' }).click();
  const firstNew = await records.first().getByRole('button').first().textContent();
  expect(firstOld).not.toBe(firstNew);

  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.locator('ol[aria-label="Records"] [aria-expanded="true"]')).toHaveCount(total);
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.locator('ol[aria-label="Records"] [aria-expanded="true"]')).toHaveCount(0);

  await records.first().getByRole('button').first().click();
  await expect(records.first().getByRole('link', { name: 'Open details' })).toBeVisible();

  await page.getByRole('searchbox').fill('potassium');
  const hits = await records.count();
  expect(hits).toBeGreaterThan(0);
  expect(hits).toBeLessThan(total);
  for (let i = 0; i < hits; i++) await expect(records.nth(i)).toContainText(/potassium/i);
  await page.getByRole('searchbox').fill('');

  const panel = page.getByRole('complementary', { name: 'Charting integrity' });
  await expect(panel).toContainText(/Change log intact: \d+ of \d+ rows verified/);
  await expect(panel).toContainText('no bedside-verification or doctor-countersignature step');
  await expect(panel).not.toContainText(/Bedside verified|Countersigned|All records signed/i);
  // Attribution only: no claim that every record was personally saved with a nurse's PIN.
  const note = panel.getByTestId('integrity-note');
  await expect(note).toContainText('attributed to');
  await expect(note).toContainText('does not show who was at the bedside');
  await expect(panel).not.toContainText(/with (their|a) PIN|signed-in nurse/i);
});
