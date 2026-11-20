import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from './db';
import { canonicalJson, verifyChain } from './audit';
import { backupDb } from './backup';
import { clearVaultMode, setVaultMode } from './encryption';
import { migrateToEncrypted } from './encryptMigration';
import { openBackupFile } from './encryptedBackup';
import { CLEANUP_CONFIRM_TEXT, executeCleanup, plainSafetyCopies, prepareCleanup } from './plainCleanup';
import { createVault, detectVault, rawFormatCounts } from './vault';
import { importPracticeSeed } from './seed';
import { firstTimeSetup } from './repos/admin';
import { clearPhotos } from './photos';
import { liveClock, practiceClock } from '../lib/time';
import { PUBLIC_PRACTICE_PASSPHRASE } from '../config/securityPolicy';

const FAST = 1000;
const clock = practiceClock();
const admin = { userId: 'pr-ellis', deviceId: 'dev-01' };
const BACKUP = 'quartz orchard bicycle eleven';
const dbs: DowntimeDB[] = [];

afterEach(async () => {
  for (const db of dbs.splice(0)) {
    await clearPhotos(db);
    clearVaultMode(db.name);
    db.close();
  }
});

const canon = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((r) => canonicalJson(r)).join('\n');

/** Synthetic Practice database that was plain, then migrated: leaves a plain pre-encryption checkpoint. */
async function migratedPractice(opts: { interrupt?: boolean } = {}): Promise<DowntimeDB> {
  const db = new DowntimeDB('practice', `cl-${crypto.randomUUID()}`);
  dbs.push(db);
  await importPracticeSeed(db);
  setVaultMode(db.name, { mode: 'pending' });
  await detectVault(db);
  const run = migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST, ...(opts.interrupt ? { interruptAfterTable: 'entry' } : {}) });
  if (opts.interrupt) await expect(run).rejects.toThrow(); else await run;
  return db;
}

async function snapshot(db: DowntimeDB) {
  const out: Record<string, string> = {};
  for (const t of db.tables) if (t.name !== 'audit_log' && t.name !== 'key_store') out[t.name] = canon((await t.toArray()) as Record<string, unknown>[]);
  return out;
}

describe('plain safety-copy cleanup (synthetic data)', () => {
  it('all six checks pass; fresh backup opens; temporary restore database is removed; then only plain copies are deleted', async () => {
    const db = await migratedPractice();
    const before = await snapshot(db);
    expect((await plainSafetyCopies(db)).map((c) => c.kind)).toEqual(['pre-encryption']);

    const prep = await prepareCleanup(db, { clock, actor: admin, backupPassphrase: BACKUP, iterations: FAST });
    expect(prep.steps.map((s) => [s.name, s.ok])).toEqual([
      ['Encrypted database', true], ['Change log', true], ['Fresh encrypted backup', true],
      ['Backup opens and matches', true], ['Restore test', true], ['Final integrity check', true],
    ]);
    expect(prep.ok).toBe(true);
    expect(prep.candidates.length).toBe(1);
    await expect(openBackupFile(prep.backupFile!, BACKUP, 'practice')).resolves.toBeTruthy();
    const dbNames = (await indexedDB.databases()).map((d) => d.name ?? '');
    expect(dbNames.some((n) => n.includes('restore-test'))).toBe(false);

    await expect(executeCleanup(db, prep.token!, 'yes', { clock, actor: admin })).rejects.toThrow(/Type REMOVE PLAIN COPIES/);
    await expect(executeCleanup(db, prep.token!, CLEANUP_CONFIRM_TEXT, { clock, actor: { userId: 'pr-okafor', deviceId: 'dev-01' } })).rejects.toThrow(/Only an admin/);
    const r = await executeCleanup(db, prep.token!, CLEANUP_CONFIRM_TEXT, { clock, actor: admin });
    expect(r.removed).toBe(1);
    expect(await plainSafetyCopies(db)).toEqual([]);
    expect(await snapshot(db)).toEqual(before); // clinical data untouched
    const audit = await db.audit_log.orderBy('seq').toArray();
    expect(audit.at(-1)?.action).toBe('plain_copies_removed');
    expect((await verifyChain(audit)).ok).toBe(true);
    await expect(executeCleanup(db, prep.token!, CLEANUP_CONFIRM_TEXT, { clock, actor: admin })).rejects.toThrow(/Run the checks again/); // token is single use
  });

  it('refuses at step 1 while a migration is unfinished; nothing is removed and no backup is made', async () => {
    const db = await migratedPractice({ interrupt: true });
    const copies = await plainSafetyCopies(db);
    const auditBefore = await db.audit_log.count();
    const prep = await prepareCleanup(db, { clock, actor: admin, backupPassphrase: BACKUP, iterations: FAST });
    expect(prep.ok).toBe(false);
    expect(prep.steps.at(-1)).toMatchObject({ name: 'Encrypted database', ok: false });
    expect(prep.token).toBeUndefined();
    expect(await plainSafetyCopies(db)).toEqual(copies);
    expect(await db.audit_log.count()).toBe(auditBefore);
  });

  it('refuses a weak backup passphrase at step 3', async () => {
    const db = await migratedPractice();
    const prep = await prepareCleanup(db, { clock, actor: admin, backupPassphrase: 'password1234', iterations: FAST });
    expect(prep.ok).toBe(false);
    expect(prep.steps.at(-1)).toMatchObject({ name: 'Fresh encrypted backup', ok: false });
  });

  it('a made-up or expired token is refused', async () => {
    const db = await migratedPractice();
    await expect(executeCleanup(db, 'not-a-token', CLEANUP_CONFIRM_TEXT, { clock, actor: admin })).rejects.toThrow(/Run the checks again/);
    expect((await plainSafetyCopies(db)).length).toBe(1);
  });

  it('Real records: checks may run, but deletion is refused without separate approval; the copy stays', async () => {
    const live = new DowntimeDB('live', `cl-live-${crypto.randomUUID()}`);
    dbs.push(live);
    setVaultMode(live.name, { mode: 'pending' });
    await live.open();
    await createVault(live, 'violet harbour lantern seventeen', { iterations: FAST });
    const a = await firstTimeSetup(live, liveClock(), { name: 'Ana Admin', initials: 'AA', pin: '8642', deviceLabel: 'L1', unit: 'U' });
    const actor = { userId: a.id, deviceId: (await live.device.toArray())[0]!.id };
    const b = backupDb();
    await b.backups.add({ db_name: live.name, from_version: 1, to_version: 2, taken_at: '2026-11-01T00:00:00Z', tables: { patient: [{ id: 'p1', mrn: 'M', family_name: 'Synthetic' }] } });
    b.close();
    const prep = await prepareCleanup(live, { clock: liveClock(), actor, backupPassphrase: BACKUP, iterations: FAST });
    expect(prep.ok).toBe(true);
    await expect(executeCleanup(live, prep.token!, CLEANUP_CONFIRM_TEXT, { clock: liveClock(), actor })).rejects.toThrow(/needs separate explicit approval/);
    expect((await plainSafetyCopies(live)).length).toBe(1);
    expect((await rawFormatCounts(live)).plain).toBe(0);
  });
});
