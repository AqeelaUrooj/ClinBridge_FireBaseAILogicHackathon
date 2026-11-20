import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from './db';
import { canonicalJson, verifyChain } from './audit';
import { backupDb, restoreSafetyCopy } from './backup';
import { clearVaultMode, setVaultMode } from './encryption';
import { migrateToEncrypted } from './encryptMigration';
import { createEncryptedBackup, restoreEncryptedBackup } from './encryptedBackup';
import { addStaff, firstTimeSetup } from './repos/admin';
import { createEntry } from './repos/entries';
import { createVault, detectVault, rawFormatCounts, unlockVault } from './vault';
import { clearPhotos } from './photos';
import { liveClock } from '../lib/time';
import { WrongSecretError } from '../lib/vaultCrypto';

/**
 * Evidence for the Real-records migration proposal (docs/proposals/P-06-real-records-migration.md).
 * SYNTHETIC values only. `approvedRealMigration: true` is passed here, in tests, and nowhere in the app.
 */
const FAST = 1000;
const clock = liveClock();
const UNIT = 'violet harbour lantern seventeen';
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
async function snap(db: DowntimeDB) {
  const o: Record<string, string> = {};
  for (const t of db.tables) if (t.name !== 'key_store' && t.name !== 'audit_log') o[t.name] = canon((await t.toArray()) as Record<string, unknown>[]);
  return o;
}

/** A Real-records database as an older (pre-encryption) build left it: plain, with staff, a patient and records. */
async function plainLive(): Promise<DowntimeDB> {
  const db = new DowntimeDB('live', `rm-${crypto.randomUUID()}`);
  dbs.push(db); // not registered -> plain, like an older build
  const admin = await firstTimeSetup(db, clock, { name: 'Ana Admin', initials: 'AA', pin: '8642', deviceLabel: 'L1', unit: '4 West' });
  const dev = (await db.device.toArray())[0]!.id;
  await addStaff(db, clock, { userId: admin.id, deviceId: dev }, { name: 'Nina Nurse', initials: 'NN', role: 'RN', pin: '1357' });
  await db.patient.add({ id: 'pt-s1', mrn: 'SYN-001', family_name: 'Synthetic', given_name: 'Test', sex: 'female', birth_date: '1970-01-01' } as never);
  await db.encounter.add({ id: 'enc-s1', patient_id: 'pt-s1', unit: '4 West', bed: '1', admit_time: clock.nowIso(), status: 'in-progress' } as never);
  const vitals = { temp_c: 37, heart_rate: 72, resp_rate: 14, bp_systolic: 120, bp_diastolic: 80, spo2: 98, o2_device: null, o2_flow_lpm: null, pain_0_10: 0, glucose_mgdl: null, consciousness: 'Alert', weight_kg: null, raw_text: null };
  for (let i = 0; i < 5; i++) await createEntry(db, clock, { userId: admin.id, deviceId: dev }, { patientId: 'pt-s1', type: 'vital_sign', careTime: clock.nowIso(), values: { ...vitals, heart_rate: 70 + i } } as never);
  setVaultMode(db.name, { mode: 'pending' });
  expect(await detectVault(db)).toBe('plain-data');
  return db;
}

async function freshLiveVault(): Promise<DowntimeDB> {
  const db = new DowntimeDB('live', `rm-new-${crypto.randomUUID()}`);
  dbs.push(db);
  setVaultMode(db.name, { mode: 'pending' });
  await db.open();
  await createVault(db, 'amber tunnel falcon forty', { iterations: FAST });
  return db;
}

describe('Real-records migration evidence (synthetic)', () => {
  it('without approval: refused and nothing changes (the app never passes approval)', async () => {
    const db = await plainLive();
    const before = await snap(db);
    await expect(migrateToEncrypted(db, { passphrase: UNIT, clock, deviceId: 'd', iterations: FAST })).rejects.toThrow(/explicit approval/);
    expect(await snap(db)).toEqual(before);
    expect((await rawFormatCounts(db)).plain).toBeGreaterThan(0);
  });

  it('backup first, then migrate: encrypted, verified, identical; the pre-migration backup restores to the same content', async () => {
    const db = await plainLive();
    const before = await snap(db);
    const backup = await createEncryptedBackup(db, BACKUP, { clock, actor: { userId: 'system', deviceId: 'd' }, iterations: FAST });
    const r = await migrateToEncrypted(db, { passphrase: UNIT, clock, deviceId: 'd', iterations: FAST, approvedRealMigration: true });
    expect(r.verified).toBe(true);
    expect(await rawFormatCounts(db)).toEqual({ plain: 0, legacy: 0 });
    expect(await snap(db)).toEqual(before);
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
    // rollback path A: encrypted backup into a fresh laptop vault
    const other = await freshLiveVault();
    await restoreEncryptedBackup(other, backup.fileText, BACKUP, { clock, deviceId: 'd2' });
    expect(await snap(other)).toEqual(before);
  });

  it('rollback path B: the pre-encryption checkpoint restores the original plain data into an empty database', async () => {
    const db = await plainLive();
    const before = await snap(db);
    await migrateToEncrypted(db, { passphrase: UNIT, clock, deviceId: 'd', iterations: FAST, approvedRealMigration: true });
    const b = backupDb();
    const cp = (await b.backups.where('db_name').equals(db.name).toArray()).find((x) => x.kind === 'pre-encryption')!;
    b.close();
    const target = new DowntimeDB('live', `rm-rb-${crypto.randomUUID()}`);
    dbs.push(target); // unregistered -> plain, like the original
    await restoreSafetyCopy(cp, target);
    expect(await snap(target)).toEqual(before);
    expect((await verifyChain(await target.audit_log.toArray())).ok).toBe(true);
  });

  it('interrupted, restarted, wrong passphrase refused, resumed: verified with identical content', async () => {
    const db = await plainLive();
    const before = await snap(db);
    await expect(migrateToEncrypted(db, { passphrase: UNIT, clock, deviceId: 'd', iterations: FAST, approvedRealMigration: true, interruptAfterTable: 'practitioner' })).rejects.toThrow(/Simulated interruption/);
    const mixed = await rawFormatCounts(db);
    expect(mixed.plain).toBeGreaterThan(0);
    db.close();
    clearVaultMode(db.name);
    const again = new DowntimeDB('live', db.name);
    dbs.push(again);
    setVaultMode(again.name, { mode: 'pending' });
    await again.open();
    expect(await detectVault(again)).toBe('locked');
    await expect(unlockVault(again, { passphrase: 'wrong words for this vault' })).rejects.toBeInstanceOf(WrongSecretError);
    await unlockVault(again, { passphrase: UNIT });
    expect(await snap(again)).toEqual(before); // readable mid-way
    const r = await migrateToEncrypted(again, { passphrase: UNIT, clock, deviceId: 'd', iterations: FAST, approvedRealMigration: true });
    expect(r.resumed).toBe(true);
    expect(await rawFormatCounts(again)).toEqual({ plain: 0, legacy: 0 });
    expect(await snap(again)).toEqual(before);
  });
});
