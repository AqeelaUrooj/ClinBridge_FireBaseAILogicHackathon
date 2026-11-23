import { test, expect } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/**
 * Plain safety-copy cleanup on SYNTHETIC Practice data. A plain copy is planted the way an older build left it
 * (a v1->v2 safety copy in downtimekit-backups), then removed through the guarded workflow.
 */
test('cleanup: six checks, fresh backup downloaded, typed confirmation, only the plain copy removed', async ({ page }) => {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('downtimekit-backups', 10);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
      s.createIndex('db_name', 'db_name');
      s.createIndex('taken_at', 'taken_at');
    };
    req.onsuccess = () => {
      const tx = req.result.transaction('backups', 'readwrite');
      tx.objectStore('backups').add({ db_name: 'downtimekit-practice', from_version: 1, to_version: 2, taken_at: '2026-11-01T00:00:00Z', tables: { patient: [{ id: 'pt-x', mrn: 'SYN', family_name: 'Synthetic' }] } });
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  }));

  await page.getByRole('button', { name: /Kim Ellis/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('link', { name: 'Backup', exact: true }).click();
  await expect(page.getByText('1 unencrypted safety copy of these records on this laptop.')).toBeVisible();
  await page.getByLabel('Backup passphrase for the fresh backup').fill('quartz orchard bicycle eleven');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Run checks' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^clinbridge-practice-backup-before-cleanup-/);
  const checks = page.getByRole('list', { name: 'Cleanup checks' });
  for (const name of ['Encrypted database', 'Change log', 'Fresh encrypted backup', 'Backup opens and matches', 'Restore test', 'Final integrity check']) {
    await expect(checks.getByText(`${name}:`)).toBeVisible();
  }
  await expect(page.getByText('This cannot be undone')).toBeVisible();
  await expect(page.getByText(/does not guarantee the data is physically erased/)).toBeVisible();
  const remove = page.getByRole('button', { name: 'Remove 1 plain copy' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Type the confirmation').fill('REMOVE PLAIN COPIES');
  await remove.click();
  await expect(page.getByText(/Removed 1 plain copy/)).toBeVisible();
  await expect(page.getByText('There are no unencrypted safety copies of these records on this laptop.')).toBeVisible();
  // temporary restore-test database is gone
  const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(names.some((n) => n?.includes('restore-test'))).toBe(false);
});
