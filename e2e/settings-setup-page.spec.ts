import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { NOT_REAL, expectFits, openAdmin } from './adminHelpers';
import { pdfPageTexts } from './pdfText';
import { unlockIfNeeded } from './helpers';

/** Settings and the frame around first-time setup (Stitch "Administration settings", "First-time setup wizard"). Fictional data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

test('settings are read only and every value is marked not approved', async ({ page }) => {
  await openAdmin(page, '/admin/settings');
  const main = page.getByRole('main');
  for (const t of ['Read only', 'Prototype, for fake patients only', 'HYDROmorphone', 'Second nurse PIN', 'None: doses show Due only', '36.1 to 37.8', 'Medicine > Lab > Vitals > Fluids > Note > Other', 'EHR team says back-entry', 'This list is partial']) await expect(main).toContainText(t);
  await expect(main.getByText('Not approved', { exact: true })).toHaveCount(5);
  await expect(main.getByText('Approved', { exact: true })).toHaveCount(0);
  await expect(main.locator('input, select, textarea')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Save system|Commit|Cancel|Apply)/ })).toHaveCount(0);
  await expect(main).not.toContainText(NOT_REAL);
  await expect(main).not.toContainText(/telemetry|chime|key rotation|ceremony|signed by|code blue|tier \d/i);
});

test('the groups filter the cards; a role opens to what it may do', async ({ page }) => {
  await openAdmin(page, '/admin/settings');
  const g = page.getByRole('group', { name: 'Settings group' });
  await g.getByRole('button', { name: 'Vital-sign ranges' }).click();
  await expect(page.getByRole('region', { name: 'Vital-sign warning ranges' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'High-alert medicines' })).toHaveCount(0);
  await g.getByRole('button', { name: 'Roles' }).click();
  const sara = page.getByRole('list', { name: 'Roles' }).locator('> li').filter({ hasText: 'Sara Whitfield' });
  await sara.locator('summary').click();
  await expect(sara.getByText('Cannot be the second nurse')).toBeVisible();
});

test('the saved file holds the settings and nothing about people', async ({ page }) => {
  await openAdmin(page, '/admin/settings');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save settings (JSON)' }).click();
  const text = readFileSync(await (await dl).path(), 'utf8');
  const j = JSON.parse(text);
  expect(j.clinical_policy.status).toBe('synthetic-prototype');
  expect(j.vital_sign_warnings.review.approved).toBe(false);
  expect(j.security.approved).toBe(false);
  expect(text).not.toMatch(/Ellis|Okafor|Novak|DK-00|pr-|passphrase"/);
});

test('paper has every group and no controls', async ({ page }) => {
  await openAdmin(page, '/admin/settings');
  await expect(page.getByRole('list', { name: 'Roles' })).toBeVisible();
  const all = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
  for (const t of ['printed by Kim Ellis', 'Fake practice data, not a clinical record', 'High-alert medicines', 'Vital-sign warning ranges', 'Not approved', 'Recovery queue order']) expect(all).toContain(squash(t));
  for (const t of ['Save settings', 'Open staff', 'Check this laptop']) expect(all).not.toContain(squash(t));
});

async function openSetup(page: Page) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('radio', { name: /Real records/ }).click();
  await page.getByRole('button', { name: 'Open first-time setup' }).click();
  await expect(page.getByRole('heading', { name: 'First-time setup' })).toBeVisible();
}

test('setup shows its steps and real browser facts; the form and its checks are as before', async ({ page }) => {
  await openSetup(page);
  const main = page.getByRole('main');
  await expect(page.getByRole('list', { name: 'Steps' }).getByRole('listitem')).toHaveCount(4);
  await expect(page.locator('[aria-current="step"]')).toHaveCount(2);
  for (const t of ['Not a hardware test', 'not approved for real patients', 'AES-256-GCM, prototype settings']) await expect(main).toContainText(t);
  await expect(main).not.toContainText(NOT_REAL);
  await expect(main).not.toContainText(/72 hours|\bPASS\b|helpdesk|smartcard|latency/i);
  await page.getByRole('button', { name: 'Next: recovery key' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a name and 1 to 3 initials');
  await expect(page.locator('[aria-current="step"]')).toHaveCount(2);
  await page.getByRole('radio', { name: /Restore from encrypted backup/ }).click();
  await expect(page.getByRole('list', { name: 'Steps' })).toContainText('Backup file');
  await page.getByRole('radio', { name: /Join this unit/ }).click();
  await expect(page.getByRole('list', { name: 'Steps' })).toContainText('Enrollment file');
  await page.getByRole('link', { name: 'Back to sign-in' }).click();
  await expect(page).toHaveURL(/sign-in/);
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: settings and setup fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openAdmin(page, '/admin/settings');
    await expect(page.getByRole('list', { name: 'Roles' })).toBeVisible();
    await expectFits(page, width);
    await openSetup(page);
    await expectFits(page, width);
  });
}
