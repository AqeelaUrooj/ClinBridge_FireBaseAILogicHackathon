import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page, who: RegExp) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
}
const go = (page: Page, path: string) => page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);

test('admin: readiness, staff, change log, settings marked not approved; nurses are kept out', async ({ page }) => {
  await signIn(page, /Kim Ellis/);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Works offline')).toBeVisible();
  await expect(page.getByText(/rows verified/).first()).toBeVisible();
  await page.getByRole('link', { name: 'Staff' }).click();
  await page.getByLabel('Name').fill('Lee Ward');
  await page.getByLabel('Initials').fill('LW');
  await page.getByLabel('PIN', { exact: true }).fill('1357');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Lee Ward')).toBeVisible();
  await page.getByRole('link', { name: 'Change log' }).click();
  await page.getByLabel('Filter by action').selectOption('staff_added');
  await expect(page.getByRole('cell', { name: 'staff_added' })).toHaveCount(1);
  await expect(page.getByText(/All \d+ rows verified/)).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('Not approved').first()).toBeVisible();
  await expect(page.getByText('Approved', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Downtime' }).click();
  await page.getByRole('button', { name: 'End downtime' }).click();
  await expect(page.getByRole('alert')).toContainText('not signed off');

  await signIn(page, /Daniel Okafor/);
  await expect(page).toHaveURL(/\/ward$/);
  await go(page, '/admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Admins only.')).toBeVisible();
});

test('recovery: worklist, possible duplicate explained, sign off; FHIR export validated and downloaded', async ({ page }) => {
  await signIn(page, /Kim Ellis/);
  await page.getByRole('complementary').getByRole('link', { name: 'To check' }).click();
  await expect(page.getByText(/^\d+ of 45 signed off$/)).toBeVisible();
  const before = Number((await page.getByText(/ of 45 signed off/).textContent())!.split(' ')[0]);
  await page.getByRole('button', { name: 'Possible duplicate' }).click();
  await page.getByTestId('wl-e-018').click(); // Grace Bell, acetaminophen 07:25 after 05:40
  await expect(page.getByText(/the order says every 6 hours/)).toBeVisible();
  await expect(page.getByText('Compare with')).toBeVisible();
  await page.getByRole('button', { name: 'Checked — sign off' }).click();
  await expect(page.getByText(`${before + 1} of 45 signed off`)).toBeVisible();

  await page.getByRole('link', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Prepare export file' }).click();
  await expect(page.getByTestId('export-summary')).toContainText('Structure check passed');
  await expect(page.getByTestId('export-summary')).toContainText('drafts not included');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download file' }).click();
  const file = await dl;
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  const bundle = JSON.parse(text);
  expect(bundle.resourceType).toBe('Bundle');
  expect(bundle.type).toBe('collection');
  expect(bundle.entry.some((e: { resource: { resourceType: string } }) => e.resource.resourceType === 'Provenance')).toBe(true);
  await expect(page.getByText(/Fingerprint \(SHA-256\) recorded/)).toBeVisible();
});

test('first-time setup is reachable before anyone exists and only for Real records', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('radio', { name: /Real records/ }).click();
  await page.getByRole('button', { name: 'Open first-time setup' }).click();
  await expect(page.getByRole('heading', { name: 'First-time setup' })).toBeVisible();
  await page.getByLabel('Admin name').fill('Test Admin');
  await page.getByLabel('Initials').fill('TA');
  await page.getByLabel('4-digit PIN').fill('8642');
  await page.getByLabel('Laptop name').fill('Test laptop');
  await page.getByLabel('Unit').fill('Test unit');
  await page.getByRole('button', { name: 'Create admin' }).click();
  await expect(page.getByRole('button', { name: /Test Admin/ })).toBeVisible();
});

test('recovery and FHIR export work with the network off (rules only, no cloud)', async ({ page, context }) => {
  await page.goto('/sign-in');
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /Kim Ellis/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('Network: offline')).toBeVisible();
  await page.getByRole('complementary').getByRole('link', { name: 'To check' }).click();
  await page.getByRole('button', { name: 'Add new downtime records' }).click();
  await expect(page.getByText(/new items added|No new records to add/)).toBeVisible();
  await page.getByRole('link', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Prepare export file' }).click();
  await expect(page.getByTestId('export-summary')).toContainText('Structure check passed');
  await context.setOffline(false);
});
