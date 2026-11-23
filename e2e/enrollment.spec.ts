import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Second-laptop enrollment, F1, synthetic values only. Laptop A makes an encrypted enrollment file; laptop B
 * (fresh browser) compares the fingerprint, joins with its own passphrase; the nurse is activated in person.
 */
const UNIT_A = 'violet harbour lantern seventeen';
const UNIT_B = 'amber tunnel falcon forty';
const ENROLL = 'saffron ladder comet nine';

async function openSetup(page: Page) {
  await page.goto('/sign-in');
  await page.getByRole('radio', { name: /Real records/ }).click();
  await page.getByRole('button', { name: 'Open first-time setup' }).click();
  await expect(page.getByRole('heading', { name: 'First-time setup' })).toBeVisible();
}
async function confirmCode(page: Page, button: string) {
  const code = (await page.getByTestId('recovery-code').textContent())!.trim();
  await page.getByLabel('Last group of the recovery key').fill(code.split('-').at(-1)!);
  await page.getByRole('button', { name: button }).click();
}
async function pin(page: Page, who: RegExp, digits: string) {
  await page.getByRole('button', { name: who }).click();
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
}

test('enroll a second laptop: fingerprint check, own passphrase, nurse activated in person', async ({ browser }) => {
  const a = await browser.newContext({ acceptDownloads: true });
  const pa = await a.newPage();
  await openSetup(pa);
  await pa.getByLabel('Admin name').fill('Ana Admin');
  await pa.getByLabel('Initials').fill('AA');
  await pa.getByLabel('4-digit PIN').fill('8642');
  await pa.getByLabel('Laptop name').fill('Laptop A');
  await pa.getByLabel('Unit', { exact: true }).fill('4 West');
  await pa.getByLabel('Unit passphrase', { exact: true }).fill(UNIT_A);
  await pa.getByLabel('Unit passphrase again').fill(UNIT_A);
  await pa.getByRole('button', { name: 'Next: recovery key' }).click();
  await confirmCode(pa, 'Create admin and encrypt');
  await pin(pa, /Ana Admin/, '8642');
  await pa.getByRole('link', { name: 'Staff', exact: true }).click();
  await pa.getByLabel('Name').fill('Nina Nurse');
  await pa.getByLabel('Initials').fill('NN');
  await pa.getByLabel('PIN', { exact: true }).fill('1357');
  await pa.getByRole('button', { name: 'Add' }).click();
  await expect(pa.getByText('Nina Nurse')).toBeVisible();

  await pa.getByRole('link', { name: 'Laptops', exact: true }).click();
  await pa.getByLabel('Enrollment passphrase', { exact: true }).fill(ENROLL);
  await pa.getByLabel('Enrollment passphrase again').fill(ENROLL);
  const dl = pa.waitForEvent('download');
  await pa.getByRole('button', { name: 'Make enrollment file' }).click();
  const file = await dl;
  const path = join(mkdtempSync(join(tmpdir(), 'cb-enroll-')), file.suggestedFilename());
  await file.saveAs(path);
  const fpA = (await pa.getByTestId('enrollment-fingerprint').textContent())!.trim();
  expect(fpA).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  await a.close();

  const b = await browser.newContext();
  const pb = await b.newPage();
  await openSetup(pb);
  await pb.getByRole('radio', { name: 'Join this unit (enrollment file)' }).click();
  await pb.getByLabel('Enrollment file').setInputFiles(path);
  await expect(pb.getByTestId('enrollment-fingerprint')).toHaveText(fpA);
  await pb.getByLabel('Enrollment passphrase').fill(ENROLL);
  await expect(pb.getByRole('button', { name: 'Open file' })).toBeDisabled(); // fingerprint not confirmed yet
  await pb.getByLabel('The fingerprint matches the other laptop').check();
  await pb.getByLabel('Enrollment passphrase').fill('wrong words for this file');
  await pb.getByRole('button', { name: 'Open file' }).click();
  await expect(pb.getByRole('alert')).toContainText('Wrong enrollment passphrase');
  await pb.getByLabel('Enrollment passphrase').fill(ENROLL);
  await pb.getByRole('button', { name: 'Open file' }).click();
  await expect(pb.getByText(/File from Ana Admin on Laptop A/)).toBeVisible();
  await pb.getByLabel('Who are you').selectOption({ label: 'Ana Admin' });
  await pb.getByLabel('Your new PIN').fill('9753');
  await pb.getByLabel("This laptop's name").fill('Laptop B');
  await pb.getByLabel('Unit passphrase', { exact: true }).fill(UNIT_B);
  await pb.getByLabel('Unit passphrase again').fill(UNIT_B);
  await pb.getByRole('button', { name: 'Next: recovery key' }).click();
  await confirmCode(pb, 'Join and encrypt');

  // Nurse cannot sign in yet; the admin's laptop-A PIN does not work here, the new one does
  await expect(pb.getByRole('button', { name: /Nina Nurse/ })).toBeDisabled();
  await expect(pb.getByText('Needs activation by an admin')).toBeVisible();
  await pin(pb, /Ana Admin/, '8642');
  await expect(pb.getByText(/Wrong PIN/)).toBeVisible();
  for (const d of '9753') await pb.getByRole('button', { name: d, exact: true }).click();
  await expect(pb).toHaveURL(/\/admin$/);

  await pb.getByRole('link', { name: 'Staff', exact: true }).click();
  await expect(pb.getByText('Needs activation')).toBeVisible();
  await pb.getByRole('button', { name: 'Activate' }).click();
  await pb.getByLabel('Their new PIN', { exact: true }).fill('4826');
  await pb.getByLabel('Their new PIN again').fill('4826');
  const activate = pb.getByRole('group', { name: 'Activate Nina Nurse' }).getByRole('button', { name: 'Activate' });
  await expect(activate).toBeDisabled(); // identity check not ticked
  await pb.getByLabel("I checked this person's identity in person").check();
  await activate.click();
  await expect(pb.getByText('Needs activation')).toHaveCount(0);

  await pb.getByRole('link', { name: 'Change log', exact: true }).click();
  await pb.getByLabel('Filter by action').selectOption('credential_activated');
  await expect(pb.getByRole('list', { name: 'Rows' }).getByRole('listitem')).toHaveCount(1);
  await expect(pb.getByRole('list', { name: 'Rows' })).toContainText('Staff sign-in activated');

  await pb.goto('/sign-in');
  await pb.getByLabel('Unit passphrase').fill(UNIT_B);
  await pb.getByRole('button', { name: 'Unlock', exact: true }).click();
  await pin(pb, /Nina Nurse/, '4826');
  await expect(pb).toHaveURL(/\/ward$/);
  await b.close();
});
