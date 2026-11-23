import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded, unlockPractice } from './helpers';

async function signIn(page: Page, who: RegExp) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
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
  await page.getByRole('link', { name: 'Downtime', exact: true }).click();
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
  await page.getByRole('complementary').getByRole('link', { name: 'Recovery Gate & Worklist' }).click();
  await expect(page.getByText(/^\d+ of 45 signed off$/)).toBeVisible();
  const before = Number((await page.getByText(/ of 45 signed off/).textContent())!.split(' ')[0]);
  await page.getByRole('button', { name: 'Possible duplicate' }).click();
  await page.getByTestId('wl-e-018').click(); // Grace Bell, acetaminophen 07:25 after 05:40
  await expect(page.getByRole('region', { name: 'Record to check' }).getByText(/the order says every 6 hours/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Compare with' })).toBeVisible();
  await page.getByRole('radio', { name: 'The record matches the paper' }).check();
  await page.getByRole('button', { name: 'Checked — sign off' }).click();
  await expect(page.getByText(`${before + 1} of 45 signed off`)).toBeVisible();

  await page.getByRole('link', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Prepare export file' }).click();
  await expect(page.getByTestId('export-summary')).toContainText('Structure check passed');
  await expect(page.getByTestId('export-summary')).toContainText('drafts not included');
  await expect(page.getByText('Sensitive: this file is NOT encrypted')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download file' })).toBeDisabled();
  await page.getByLabel('I understand this file is sensitive and not encrypted').check();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download file' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^SENSITIVE-clinbridge-fhir-/);
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  const bundle = JSON.parse(text);
  expect(bundle.resourceType).toBe('Bundle');
  expect(bundle.type).toBe('collection');
  expect(bundle.entry.some((e: { resource: { resourceType: string } }) => e.resource.resourceType === 'Provenance')).toBe(true);
  await expect(page.getByText(/Fingerprint \(SHA-256\) recorded/)).toBeVisible();
});

test('first-time setup is reachable before anyone exists and only for Real records', async ({ page }) => {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('radio', { name: /Real records/ }).click();
  await page.getByRole('button', { name: 'Open first-time setup' }).click();
  await expect(page.getByRole('heading', { name: 'First-time setup' })).toBeVisible();
  await page.getByLabel('Admin name').fill('Test Admin');
  await page.getByLabel('Initials').fill('TA');
  await page.getByLabel('4-digit PIN').fill('8642');
  await page.getByLabel('Laptop name').fill('Test laptop');
  await page.getByLabel('Unit', { exact: true }).fill('Test unit');
  // Unit passphrase: weak one refused, strong one accepted (synthetic test value)
  await page.getByLabel('Unit passphrase', { exact: true }).fill('password1234');
  await page.getByLabel('Unit passphrase again').fill('password1234');
  await page.getByRole('button', { name: 'Next: recovery key' }).click();
  await expect(page.getByText(/common password/)).toBeVisible();
  const pass = 'violet harbour lantern seventeen';
  await page.getByLabel('Unit passphrase', { exact: true }).fill(pass);
  await page.getByLabel('Unit passphrase again').fill(pass);
  await page.getByRole('button', { name: 'Next: recovery key' }).click();
  // Recovery key shown once; must type its last group back
  const code = (await page.getByTestId('recovery-code').textContent())!.trim();
  expect(code).toMatch(/^([A-HJ-NP-Z2-9]{4}-){7}[A-HJ-NP-Z2-9]{4}$/);
  await expect(page.getByRole('button', { name: 'Create admin and encrypt' })).toBeDisabled();
  await page.getByLabel('Last group of the recovery key').fill(code.split('-').at(-1)!);
  await page.getByRole('button', { name: 'Create admin and encrypt' }).click();
  await expect(page.getByRole('button', { name: /Test Admin/ })).toBeVisible();

  // Stored encrypted: the admin's name and PIN hash are not readable in IndexedDB; key_store has no secret
  const raw = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const req = indexedDB.open('downtimekit-live');
    req.onsuccess = () => {
      const tx = req.result.transaction(['practitioner', 'key_store'], 'readonly');
      const out: unknown[] = [];
      tx.objectStore('practitioner').getAll().onsuccess = (e) => out.push((e.target as IDBRequest).result);
      tx.objectStore('key_store').getAll().onsuccess = (e) => out.push((e.target as IDBRequest).result);
      tx.oncomplete = () => { req.result.close(); resolve(JSON.stringify(out)); };
    };
    req.onerror = () => reject(req.error);
  }));
  expect(raw).not.toContain('Test Admin');
  expect(raw).not.toContain('pbkdf2$');
  expect(raw).not.toContain(pass);
  expect(raw).not.toContain(code.replace(/-/g, ''));
  expect(raw).toContain('cb1$pbkdf2-sha256$600000$');

  // Reload: Real records locked; the practice passphrase is refused; the unit passphrase opens them
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unlock records on this laptop' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use practice passphrase' })).toHaveCount(0);
  await page.getByLabel('Unit passphrase').fill('practice only fake patients');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not right');
  await page.getByLabel('Unit passphrase').fill(pass);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('button', { name: /Test Admin/ })).toBeVisible();

  // Forgotten passphrase: recovery key + new passphrase -> NEW recovery key; old key stops working
  await page.reload();
  await page.getByRole('button', { name: 'Forgot the passphrase? Use the recovery key' }).click();
  await page.getByLabel('Recovery key').fill(code.toLowerCase());
  const pass2 = 'copper meadow window ninety';
  await page.getByLabel('New unit passphrase', { exact: true }).fill(pass2);
  await page.getByLabel('New unit passphrase again').fill(pass2);
  await page.getByRole('button', { name: 'Recover and unlock' }).click();
  const code2 = (await page.getByTestId('recovery-code').textContent())!.trim();
  expect(code2).not.toBe(code);
  await page.getByLabel('Last group of the recovery key').fill(code2.split('-').at(-1)!);
  await page.getByRole('button', { name: 'Done, open the records' }).click();
  await expect(page.getByRole('button', { name: /Test Admin/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Forgot the passphrase? Use the recovery key' }).click();
  await page.getByLabel('Recovery key').fill(code);
  await page.getByLabel('New unit passphrase', { exact: true }).fill(pass);
  await page.getByLabel('New unit passphrase again').fill(pass);
  await page.getByRole('button', { name: 'Recover and unlock' }).click();
  await expect(page.getByRole('alert')).toContainText('recovery key is not right');
  await page.getByRole('button', { name: 'Back to passphrase' }).click();
  await page.getByLabel('Unit passphrase').fill(pass2);
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page.getByRole('button', { name: /Test Admin/ })).toBeVisible();
});

test('recovery and FHIR export work with the network off (rules only, no cloud)', async ({ page, context }) => {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  await page.reload();
  await unlockPractice(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await unlockPractice(page);
  await page.getByRole('button', { name: /Kim Ellis/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByText('Network: offline')).toBeVisible();
  await page.getByRole('complementary').getByRole('link', { name: 'Recovery Gate & Worklist' }).click();
  await page.getByRole('button', { name: 'Add new downtime records' }).click();
  await expect(page.getByText(/new items added|No new records to add/)).toBeVisible();
  await page.getByRole('link', { name: 'Export' }).click();
  await page.getByRole('button', { name: 'Prepare export file' }).click();
  await expect(page.getByTestId('export-summary')).toContainText('Structure check passed');
  await context.setOffline(false);
});
