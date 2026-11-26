import { test, expect, type Page } from '@playwright/test';
import { NOT_REAL, expectFits, openAdmin } from './adminHelpers';
import { pdfPageTexts } from './pdfText';
import { unlockIfNeeded } from './helpers';

/** Staff and laptops (Stitch "Staff roster", "Workstation nodes"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();
const row = (page: Page, name: string) => page.getByRole('list', { name: 'Staff' }).getByRole('listitem').filter({ hasText: name });
const openStaff = async (page: Page) => { await openAdmin(page, '/admin/staff'); await expect(page.getByRole('list', { name: 'Staff' }).getByRole('listitem')).toHaveCount(8); }; // 7 + the fictional Admission Staff account

test.describe('Staff', () => {
  test('roles, records and PIN state from the stored list; no badge, temporary PIN, duty or bed claim', async ({ page }) => {
    await openStaff(page);
    await expect(row(page, 'Sara Whitfield')).toContainText('Cannot be the second nurse (prototype rule)');
    await expect(row(page, 'Daniel Okafor')).toContainText('17');
    await expect(row(page, 'Tara Nguyen')).toContainText('Switched off');
    await expect(row(page, 'Kim Ellis')).toContainText('Cannot chart');
    const main = page.getByRole('main');
    for (const t of ['5 nurses, 1 admin, 1 admission', '1 switched off', 'Salted hash only', 'There is no temporary PIN, recovery PIN or badge', 'RN (prototype, not approved)']) await expect(main).toContainText(t);
    const text = (await main.innerText()).replace('There is no temporary PIN, recovery PIN or badge', '');
    expect(text).not.toMatch(NOT_REAL);
    expect(text).not.toMatch(/#\d{4}|shift lead|charge nurse|biometric|provision|2-hour|pbkdf2\$/i);
  });

  test('search', async ({ page }) => {
    await openStaff(page);
    await page.getByLabel('Search staff').fill('lpn');
    await expect(page.getByRole('list', { name: 'Staff' }).getByRole('listitem')).toHaveCount(1);
    await page.getByLabel('Search staff').fill('zzz');
    await expect(page.getByText('Nobody here')).toBeVisible();
  });

  test('a new PIN works and the old one stops; the change log says so', async ({ page }) => {
    await openStaff(page);
    await page.getByRole('button', { name: 'New PIN for Daniel Okafor' }).click();
    const box = page.getByRole('group', { name: 'New PIN, Daniel Okafor' });
    await box.getByLabel('New PIN', { exact: true }).fill('12');
    await box.getByRole('button', { name: 'Save PIN' }).click();
    await expect(page.getByRole('alert')).toContainText('PIN must be 4 digits');
    await box.getByLabel('New PIN', { exact: true }).fill('9753');
    await box.getByRole('button', { name: 'Save PIN' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'New PIN saved for Daniel Okafor' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('Newest: Staff PIN reset');
    await page.goto('/sign-in');
    await unlockIfNeeded(page);
    await page.getByRole('button', { name: /Daniel Okafor/ }).click();
    for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Wrong PIN');
    for (const d of '9753') await page.getByRole('button', { name: d, exact: true }).click();
    await expect(page).toHaveURL(/\/ward$/);
  });

  test('switching off removes the person from sign-in; your own account and the last admin stay', async ({ page }) => {
    await openStaff(page);
    await page.getByRole('button', { name: 'Switch off Kim Ellis' }).click();
    await expect(page.getByRole('alert')).toContainText('cannot switch off your own account');
    await page.getByRole('button', { name: 'Switch off Ana Reyes' }).click();
    await expect(row(page, 'Ana Reyes')).toContainText('Switched off');
    await page.goto('/sign-in');
    await unlockIfNeeded(page);
    await expect(page.getByRole('button', { name: /Maria Alvarez/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Ana Reyes/ })).toHaveCount(0);
  });

  test('New person moves to the form', async ({ page }) => {
    await openStaff(page);
    await page.getByRole('button', { name: 'New person' }).click();
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  });

  test('paper has the list and no controls', async ({ page }) => {
    await openStaff(page);
    const all = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
    for (const t of ['Staff on this laptop', 'printed by Kim Ellis', 'Fake practice data, not a clinical record', 'Tara Nguyen', 'Switched off']) expect(all).toContain(squash(t));
    for (const t of ['New PIN', 'Switch on', 'Print staff list', 'Forgotten PIN']) expect(all).not.toContain(squash(t));
  });
});

test.describe('Laptops', () => {
  test('each laptop from its stored row; nothing is claimed as live, connected or charged', async ({ page }) => {
    await openAdmin(page, '/admin/devices');
    const cards = page.getByRole('list', { name: 'Laptops' }).getByRole('listitem');
    await expect(cards).toHaveCount(2);
    for (const t of ['DT-4W-01', 'This laptop', '02:55, 14 Nov 2026', '1 to 47']) await expect(cards.nth(0)).toContainText(t);
    for (const t of ['DT-4W-02', 'Other laptop, not seen live', '21:10, 11 Nov 2026', '64 h 10 min ago']) await expect(cards.nth(1)).toContainText(t);
    const main = page.getByRole('main');
    await expect(main).toContainText('No link between laptops');
    await expect(main).not.toContainText(NOT_REAL);
    await expect(main).not.toContainText(/\bonline\b|master|deauthorize|pcap|gossip|NVMe|replicat/i);
    await expect(page.getByRole('list', { name: 'Newest records' }).getByRole('listitem')).toHaveCount(6);
    await expect(page.locator('body')).not.toContainText(/Novak|Rivera|Ortiz|Santos|DK-00/);
  });

  test('Lock this screen locks; enrollment only in Real records', async ({ page }) => {
    await openAdmin(page, '/admin/devices');
    await expect(page.getByText('Works only in Real records')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make enrollment file' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Lock this screen' }).click();
    await expect(page.getByRole('heading', { name: 'Screen locked' })).toBeVisible();
  });
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: staff and laptops fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openStaff(page);
    await page.getByRole('button', { name: 'New PIN for Daniel Okafor' }).click();
    await expectFits(page, width);
    await page.evaluate(() => { history.pushState({}, '', '/admin/devices'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByRole('list', { name: 'Laptops' })).toBeVisible();
    await expectFits(page, width);
  });
}
