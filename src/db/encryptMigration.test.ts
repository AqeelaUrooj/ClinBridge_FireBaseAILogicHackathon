import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from './db';
import { canonicalJson, verifyChain } from './audit';
import { backupDb, readAll } from './backup';
import { clearVaultMode, isEncryptedRow, PLAIN_TABLES, setVaultMode, VaultLockedError } from './encryption';
import { MigrationVerifyError, migrateToEncrypted, verifyAgainstCheckpoint } from './encryptMigration';
import { detectVault, rawPlainRowCount, readVaultRow, unlockVault } from './vault';
import { importPracticeSeed } from './seed';
import { practiceClock } from '../lib/time';
import { clearPhotos, getPhoto, rawPhotos, savePhoto, verifyPhoto } from './photos';
import { WrongSecretError } from '../lib/vaultCrypto';
import { PUBLIC_PRACTICE_PASSPHRASE } from '../config/securityPolicy';

const FAST = 1000;
const clock = practiceClock();
const dbs: DowntimeDB[] = [];

afterEach(async () => {
  await clearPhotos('practice');
  for (const db of dbs.splice(0)) {
    clearVaultMode(db.name);
    db.close();
  }
});

/** A Practice database written the old way (plain), as it exists in browsers that used earlier builds. */
async function plainPractice(): Promise<{ db: DowntimeDB; before: Record<string, string> }> {
  const db = new DowntimeDB('practice', `mig-${crypto.randomUUID()}`);
  dbs.push(db);
  await importPracticeSeed(db); // no vault mode registered -> plain, like a pre-encryption build
  const raw = await readAll(db.backendDB());
  const before = Object.fromEntries(Object.entries(raw).map(([t, rows]) => [t, canon(rows as Record<string, unknown>[])]));
  setVaultMode(db.name, { mode: 'pending' });
  return { db, before };
}

const canon = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((r) => canonicalJson(r)).join('\n');

async function logicalSnapshot(db: DowntimeDB): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of db.tables) out[t.name] = canon((await t.toArray()) as Record<string, unknown>[]);
  return out;
}

async function checkpointsFor(name: string) {
  const b = backupDb();
  try {
    return (await b.backups.where('db_name').equals(name).toArray()).filter((x) => x.kind === 'pre-encryption');
  } finally {
    b.close();
  }
}

/** Simulate a browser restart: forget the key and the database object, open again. */
async function restart(db: DowntimeDB): Promise<DowntimeDB> {
  db.close();
  clearVaultMode(db.name);
  const again = new DowntimeDB('practice', db.name);
  dbs.push(again);
  setVaultMode(again.name, { mode: 'pending' });
  await again.open();
  return again;
}

describe('staged migration on synthetic Practice data', () => {
  it('detects a plain database and refuses to read it until migrated (Practice is not left in plain mode)', async () => {
    const { db } = await plainPractice();
    expect(await detectVault(db)).toBe('plain-data');
    await expect(db.patient.toArray()).rejects.toBeInstanceOf(VaultLockedError);
  });

  it('checkpoint -> vault -> encrypt -> verify: every row encrypted and identical to the original; chain valid', async () => {
    const { db, before } = await plainPractice();
    await detectVault(db);
    const report = await migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST });
    expect(report.verified).toBe(true);
    expect(report.resumed).toBe(false);
    expect(report.counts.patient).toBe(10);
    expect(report.counts.audit_log).toBe(153);

    // on disk: nothing plain except key_store
    expect(await rawPlainRowCount(db)).toBe(0);
    const raw = await readAll(db.backendDB());
    for (const [t, rows] of Object.entries(raw)) if (!PLAIN_TABLES.has(t)) for (const r of rows) expect(isEncryptedRow(r)).toBe(true);

    // logical content unchanged (audit_log gains exactly the vault_encrypted row)
    const after = await logicalSnapshot(db);
    for (const [t, text] of Object.entries(before)) {
      if (t === 'audit_log' || t === 'key_store') continue;
      expect(after[t]).toBe(text);
    }
    const audit = await db.audit_log.orderBy('seq').toArray();
    expect(audit.length).toBe(154);
    expect(audit.at(-1)?.action).toBe('vault_encrypted');
    expect((await verifyChain(audit)).ok).toBe(true);

    // checkpoint is kept (cleanup needs separate approval)
    const cps = await checkpointsFor(db.name);
    expect(cps.length).toBe(1);
    expect(cps[0]!.table_hashes?.patient).toBeTruthy();
  });

  it('a failure before any record changes (vault creation refused) leaves the database plain and complete', async () => {
    const { db, before } = await plainPractice();
    await expect(migrateToEncrypted(db, { passphrase: 'not the practice words', clock, deviceId: 'dev-01', iterations: FAST })).rejects.toThrow(/published practice passphrase/);
    expect(await readVaultRow(db)).toBeUndefined();
    const raw = await readAll(db.backendDB());
    for (const [t, rows] of Object.entries(raw)) expect(canon(rows as Record<string, unknown>[])).toBe(before[t]);
  });

  it('interrupted half-way: still readable; after a restart and unlock the next run finishes and verifies', async () => {
    const { db, before } = await plainPractice();
    await detectVault(db);
    await expect(migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST, interruptAfterTable: 'entry' })).rejects.toThrow(/Simulated interruption/);

    // mixed state on disk
    const plainLeft = await rawPlainRowCount(db);
    expect(plainLeft).toBeGreaterThan(0);
    const raw = await readAll(db.backendDB());
    expect((raw.entry as unknown[]).every(isEncryptedRow)).toBe(true);

    // restart: locked; wrong passphrase refused; right one unlocks and allows the plain remainder
    const again = await restart(db);
    expect(await detectVault(again)).toBe('locked');
    await expect(unlockVault(again, { passphrase: 'wrong words for this vault' })).rejects.toBeInstanceOf(WrongSecretError);
    expect(await rawPlainRowCount(again)).toBe(plainLeft); // nothing changed by the failed unlock
    await unlockVault(again, { passphrase: PUBLIC_PRACTICE_PASSPHRASE });
    expect((await again.patient.toArray()).length).toBe(10); // readable mid-migration

    const report = await migrateToEncrypted(again, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST });
    expect(report.resumed).toBe(true);
    expect(await rawPlainRowCount(again)).toBe(0);
    const after = await logicalSnapshot(again);
    for (const [t, text] of Object.entries(before)) if (t !== 'audit_log' && t !== 'key_store') expect(after[t]).toBe(text);
    expect((await checkpointsFor(again.name)).length).toBe(1); // resume reuses the original checkpoint
  });

  it('resuming without unlocking is refused', async () => {
    const { db } = await plainPractice();
    await detectVault(db);
    await expect(migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST, interruptAfterTable: 'patient' })).rejects.toThrow();
    const again = await restart(db);
    await detectVault(again);
    await expect(migrateToEncrypted(again, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST })).rejects.toThrow(/Unlock the vault first/);
  });

  it('the verify step catches a row that does not match the checkpoint', async () => {
    const { db } = await plainPractice();
    await detectVault(db);
    await migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST });
    const cp0 = (await checkpointsFor(db.name))[0]!;
    // include the vault_encrypted audit row so only the table under test differs
    const cp: typeof cp0 = { ...cp0, tables: { ...cp0.tables, audit_log: await db.audit_log.toArray() } };
    await expect(verifyAgainstCheckpoint(db, cp)).resolves.toBeTruthy();
    const altered = { ...cp, tables: { ...cp.tables, patient: (cp.tables.patient as Record<string, unknown>[]).map((p, i) => (i === 0 ? { ...p, family_name: 'Changed' } : p)) } };
    await expect(verifyAgainstCheckpoint(db, altered)).rejects.toThrow(/row pt-01 in "patient" does not match/);
    await expect(verifyAgainstCheckpoint(db, altered)).rejects.toBeInstanceOf(MigrationVerifyError);
    const missing = { ...cp, tables: { ...cp.tables, note: [] } };
    await expect(verifyAgainstCheckpoint(db, missing)).rejects.toThrow(/"note" has 4 rows, checkpoint has 0/);
  });

  it('where plain copies remain afterwards: only the checkpoint and older safety copies in downtimekit-backups', async () => {
    const { db } = await plainPractice();
    await detectVault(db);
    await migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST });
    const names = (await indexedDB.databases()).map((d) => d.name!).filter((n) => n === db.name || n === 'downtimekit-backups');
    expect(names.sort()).toEqual(['downtimekit-backups', db.name].sort());
    expect(await rawPlainRowCount(db)).toBe(0);
    const cp = (await checkpointsFor(db.name))[0]!;
    expect(JSON.stringify(cp.tables.patient)).toMatch(/family_name/); // known plain copy, kept until cleanup is approved
  });
});

describe('photos', () => {
  it('plain photos are encrypted by the migration, each checked against its capture-time hash', async () => {
    const { db } = await plainPractice();
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4])], { type: 'image/png' });
    // saved the old way (no vault yet -> plain)
    clearVaultMode(db.name);
    const saved = await savePhoto(db, clock, { userId: 'pr-okafor', deviceId: 'dev-01' }, 'pt-08', png);
    setVaultMode(db.name, { mode: 'pending' });
    expect('blob' in (await rawPhotos('practice'))[0]!).toBe(true);
    await detectVault(db);
    const r = await migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST });
    expect(r.photosEncrypted).toBe(1);
    const raw = (await rawPhotos('practice'))[0] as unknown as Record<string, unknown>;
    expect(raw.blob).toBeUndefined();
    expect(raw.sha256).toBeUndefined();
    expect(Object.keys(raw).sort()).toEqual(['_bytes', '_enc', 'patient_id', 'ref', 'saved_at']);
    const back = await getPhoto(db, saved.ref);
    expect(back?.sha256).toBe(saved.sha256);
    expect(await verifyPhoto(back!)).toBe(true);
  });

  it('a photo saved while the vault is unlocked is encrypted straight away and unreadable once locked', async () => {
    const { db } = await plainPractice();
    await detectVault(db);
    await migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: 'dev-01', iterations: FAST });
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 9, 9, 9])], { type: 'image/png' });
    const p = await savePhoto(db, clock, { userId: 'pr-okafor', deviceId: 'dev-01' }, 'pt-02', png);
    expect('_bytes' in (await rawPhotos('practice'))[0]!).toBe(true);
    expect(await verifyPhoto((await getPhoto(db, p.ref))!)).toBe(true);
    setVaultMode(db.name, { mode: 'locked' });
    await expect(getPhoto(db, p.ref)).rejects.toThrow(/locked/);
  });
});

describe('Real records', () => {
  it('migration is refused without explicit approval, and nothing changes', async () => {
    const live = new DowntimeDB('live', `mig-live-${crypto.randomUUID()}`);
    dbs.push(live);
    await live.patient.add({ id: 'pt-1', mrn: 'M1', family_name: 'Test', given_name: 'Synthetic' } as never);
    setVaultMode(live.name, { mode: 'pending' });
    expect(await detectVault(live)).toBe('plain-data'); // and the app keeps it readable in plain mode
    expect((await live.patient.get('pt-1'))?.family_name).toBe('Test');
    await expect(migrateToEncrypted(live, { passphrase: 'violet harbour lantern seventeen', clock, deviceId: 'd', iterations: FAST })).rejects.toThrow(/needs explicit approval/);
    expect(await readVaultRow(live)).toBeUndefined();
    expect((await checkpointsFor(live.name)).length).toBe(0);
  });
});

describe('raw store check helper', () => {
  it('counts plain rows straight from IndexedDB, bypassing decryption', async () => {
    const { db } = await plainPractice();
    const n = await rawPlainRowCount(db);
    const raw = new Dexie(db.name);
    await raw.open();
    let total = 0;
    for (const t of raw.tables) if (t.name !== 'key_store') total += await t.count();
    raw.close();
    expect(n).toBe(total);
  });
});
