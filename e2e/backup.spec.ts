import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Encrypted backup (P-04, B1) on Real records with synthetic values only:
 * laptop A: setup -> add a staff member -> make encrypted backup file;
 * laptop B (fresh browser): setup -> restore from that file with its own new unit passphrase -> staff are back.
 */
const UNIT_A = 'violet harbour lantern seventeen';
const UNIT_B = 'amber tunnel falcon forty';
const BACKUP = 'quartz orchard bicycle eleven';

async function setupStart(page: Page) {
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

test('encrypted backup on one laptop, restored on a fresh one with its own passphrase', async ({ browser }) => {
  const a = await browser.newContext({ acceptDownloads: true });
  const pa = await a.newPage();
  await setupStart(pa);
  await pa.getByLabel('Admin name').fill('Backup Admin');
  await pa.getByLabel('Initials').fill('BA');
  await pa.getByLabel('4-digit PIN').fill('8642');
  await pa.getByLabel('Laptop name').fill('Laptop A');
  await pa.getByLabel('Unit', { exact: true }).fill('Test unit');
  await pa.getByLabel('Unit passphrase', { exact: true }).fill(UNIT_A);
  await pa.getByLabel('Unit passphrase again').fill(UNIT_A);
  await pa.getByRole('button', { name: 'Next: recovery key' }).click();
  await confirmCode(pa, 'Create admin and encrypt');
  await pa.getByRole('button', { name: /Backup Admin/ }).click();
  for (const d of '8642') await pa.getByRole('button', { name: d, exact: true }).click();
  await pa.getByRole('link', { name: 'Staff', exact: true }).click();
  await pa.getByLabel('Name').fill('Restored Nurse');
  await pa.getByLabel('Initials').fill('RN');
  await pa.getByLabel('PIN', { exact: true }).fill('1357');
  await pa.getByRole('button', { name: 'Add' }).click();
  await expect(pa.getByText('Restored Nurse')).toBeVisible();

  await pa.getByRole('link', { name: 'Backup', exact: true }).click();
  await pa.getByLabel('Backup passphrase', { exact: true }).fill(UNIT_A);
  await pa.getByLabel('Backup passphrase again').fill(UNIT_A);
  await pa.getByRole('button', { name: 'Make encrypted backup' }).click();
  await expect(pa.getByRole('alert')).toContainText('different passphrase from the unit passphrase');
  await pa.getByLabel('Backup passphrase', { exact: true }).fill(BACKUP);
  await pa.getByLabel('Backup passphrase again').fill(BACKUP);
  const dl = pa.waitForEvent('download');
  await pa.getByRole('button', { name: 'Make encrypted backup' }).click();
  const file = await dl;
  const path = join(mkdtempSync(join(tmpdir(), 'cb-backup-')), file.suggestedFilename());
  await file.saveAs(path); // keep it after laptop A's browser closes
  const text = readFileSync(path, 'utf8');
  expect(text).toContain('"format":"clinbridge-backup"');
  for (const needle of ['Restored Nurse', 'Backup Admin', 'pbkdf2$', 'cb1$', UNIT_A, BACKUP]) expect(text).not.toContain(needle);
  await expect(pa.getByText(/Backup file made/)).toBeVisible();
  await a.close();

  const b = await browser.newContext();
  const pb = await b.newPage();
  await setupStart(pb);
  await pb.getByRole('radio', { name: 'Restore from encrypted backup' }).click();
  await pb.getByLabel('Backup file').setInputFiles(path);
  await pb.getByLabel('Backup passphrase').fill('wrong words for this file');
  await pb.getByLabel('Unit passphrase', { exact: true }).fill(UNIT_B);
  await pb.getByLabel('Unit passphrase again').fill(UNIT_B);
  await pb.getByRole('button', { name: 'Next: recovery key' }).click();
  await confirmCode(pb, 'Restore and encrypt');
  await expect(pb.getByRole('alert')).toContainText('Wrong backup passphrase');
  // nothing was created: the right passphrase works on the same screen
  await pb.getByRole('button', { name: 'Back' }).click();
  await pb.getByLabel('Backup passphrase').fill(BACKUP);
  await pb.getByRole('button', { name: 'Next: recovery key' }).click();
  await confirmCode(pb, 'Restore and encrypt');
  await expect(pb.getByRole('button', { name: /Restored Nurse/ })).toBeVisible();
  await expect(pb.getByRole('button', { name: /Backup Admin/ })).toBeVisible();

  // laptop B has its own passphrase: A's does not open it
  await pb.reload();
  await pb.getByLabel('Unit passphrase').fill(UNIT_A);
  await pb.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(pb.getByRole('alert')).toContainText('not right');
  await pb.getByLabel('Unit passphrase').fill(UNIT_B);
  await pb.getByRole('button', { name: 'Unlock', exact: true }).click();
  await pb.getByRole('button', { name: /Restored Nurse/ }).click();
  for (const d of '1357') await pb.getByRole('button', { name: d, exact: true }).click();
  await expect(pb).toHaveURL(/\/ward$/);
  await b.close();
});
