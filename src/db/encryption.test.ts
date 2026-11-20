import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from './db';
import { clearVaultMode, IntegrityError, isEncryptedRow, setVaultMode, VaultLockedError, indexFieldsFromSpec } from './encryption';
import { createVault, detectVault, lockVault, rawPlainRowCount, readVaultRow, recoverVault, unlockVault } from './vault';
import { importPracticeSeed, resetPractice, loadSeedJson } from './seed';
import { createEntry } from './repos/entries';
import { verifyChain } from './audit';
import { WrongSecretError } from '../lib/vaultCrypto';
import { PUBLIC_PRACTICE_PASSPHRASE, PUBLIC_PRACTICE_RECOVERY_CODE } from '../config/securityPolicy';
import { practiceClock } from '../lib/time';

const FAST = 1000;
const clock = practiceClock();
const actor = { userId: 'pr-okafor', deviceId: 'dev-01' };
let n = 0;
const dbs: DowntimeDB[] = [];

function freshPractice(): DowntimeDB {
  const db = new DowntimeDB('practice', `enc-test-${++n}-${Math.random()}`);
  setVaultMode(db.name, { mode: 'pending' });
  dbs.push(db);
  return db;
}

async function rawRows(name: string, table: string): Promise<Record<string, unknown>[]> {
  const raw = new Dexie(name);
  await raw.open();
  try {
    return (await raw.table(table).toArray()) as Record<string, unknown>[];
  } finally {
    raw.close();
  }
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    clearVaultMode(db.name);
    db.close();
  }
});

async function seededVault(): Promise<DowntimeDB> {
  const db = freshPractice();
  await db.open();
  await createVault(db, PUBLIC_PRACTICE_PASSPHRASE, { iterations: FAST });
  await importPracticeSeed(db);
  return db;
}

describe('index fields', () => {
  it('parses Dexie specs incl. unique, multi-entry and compound indexes', () => {
    expect(indexFieldsFromSpec('id, &entry_id, order_id')).toEqual(['id', 'entry_id', 'order_id']);
    expect(indexFieldsFromSpec('id, patient_id, care_time, status, supersedes_id, [device_id+counter]')).toEqual(['id', 'patient_id', 'care_time', 'status', 'supersedes_id', 'device_id', 'counter']);
    expect(indexFieldsFromSpec('++id, db_name')).toEqual(['id', 'db_name']);
  });
});

describe('encrypted storage (Practice, same code path as Real)', () => {
  it('stores clinical values encrypted on disk; only index fields stay readable', async () => {
    const db = await seededVault();
    const patients = await rawRows(db.name, 'patient');
    expect(patients.length).toBe(10);
    for (const p of patients) {
      expect(isEncryptedRow(p)).toBe(true);
      expect(Object.keys(p).sort()).toEqual(['_enc', 'id', 'mrn']); // MRN is an index field (documented limit)
      expect(JSON.stringify(p)).not.toMatch(/family_name|given_name|birth_date/);
    }
    const staff = await rawRows(db.name, 'practitioner');
    for (const s of staff) expect(s.pin_hash).toBeUndefined(); // PIN hashes are inside the ciphertext
    const vitals = await rawRows(db.name, 'vital_sign');
    for (const v of vitals) expect(Object.keys(v).sort()).toEqual(['_enc', 'entry_id', 'id']);
    expect(await rawPlainRowCount(db)).toBe(0);
  });

  it('the app reads plain values back; queries on index fields work; audit chain verifies', async () => {
    const db = await seededVault();
    const p = await db.patient.get('pt-01');
    expect(p?.family_name).toBeTruthy();
    expect((await db.encounter.where('patient_id').equals('pt-01').first())?.patient_id).toBe('pt-01');
    expect((await db.entry.orderBy('care_time').reverse().first())?.care_time).toBeTruthy();
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
  });

  it('a nurse save through the normal repository is encrypted, and the chain stays valid', async () => {
    const db = await seededVault();
    const vitals = { temp_c: 36.9, heart_rate: 83, resp_rate: 16, bp_systolic: 128, bp_diastolic: 78, spo2: 97, o2_device: null, o2_flow_lpm: null, pain_0_10: 1, glucose_mgdl: null, consciousness: 'Alert', weight_kg: null, raw_text: null };
    const e = await createEntry(db, clock, actor, { patientId: 'pt-01', type: 'vital_sign', careTime: clock.nowIso(), values: vitals } as never);
    const raw = (await rawRows(db.name, 'vital_sign')).find((v) => v.entry_id === e.id)!;
    expect(isEncryptedRow(raw)).toBe(true);
    expect(raw.heart_rate).toBeUndefined();
    expect((await db.vital_sign.where('entry_id').equals(e.id).first())?.heart_rate).toBe(83);
    const rawEntry = (await rawRows(db.name, 'entry')).find((x) => x.id === e.id)!;
    expect(rawEntry.performer_id).toBeUndefined();
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
  });

  it('key_store holds only wrapped keys, never the passphrase or recovery code', async () => {
    const db = await seededVault();
    const ks = await rawRows(db.name, 'key_store');
    expect(ks.length).toBe(1); // the seed's fake placeholder is not imported
    const text = JSON.stringify(ks);
    expect(text).not.toContain(PUBLIC_PRACTICE_PASSPHRASE);
    expect(text).not.toContain(PUBLIC_PRACTICE_RECOVERY_CODE.replace(/-/g, ''));
    expect(ks[0]!.wrapped_key_pin).toMatch(/^cb1\$pbkdf2-sha256\$1000\$/);
  });
});

describe('lock, unlock, refresh', () => {
  it('locked: every read and write of clinical tables is refused; counts of key_store still work', async () => {
    const db = await seededVault();
    lockVault(db);
    await db.open();
    await expect(db.patient.get('pt-01')).rejects.toBeInstanceOf(VaultLockedError);
    await expect(db.patient.toArray()).rejects.toBeInstanceOf(VaultLockedError);
    await expect(db.patient.put({ id: 'x', mrn: 'm' } as never)).rejects.toBeInstanceOf(VaultLockedError);
    expect(await db.key_store.count()).toBe(1);
  });

  it('a reload (new database object, nothing in memory) starts locked; the right passphrase unlocks', async () => {
    const db = await seededVault();
    const name = db.name;
    db.close();
    clearVaultMode(name);
    const again = new DowntimeDB('practice', name);
    dbs.push(again);
    setVaultMode(name, { mode: 'pending' });
    await again.open();
    expect(await detectVault(again)).toBe('locked');
    await expect(again.patient.toArray()).rejects.toBeInstanceOf(VaultLockedError);
    await expect(unlockVault(again, { passphrase: 'wrong words entirely here' })).rejects.toBeInstanceOf(WrongSecretError);
    await expect(again.patient.toArray()).rejects.toBeInstanceOf(VaultLockedError);
    await unlockVault(again, { passphrase: PUBLIC_PRACTICE_PASSPHRASE }, { clock, deviceId: 'dev-01' });
    expect((await again.patient.toArray()).length).toBe(10);
    expect((await again.audit_log.orderBy('seq').last())?.action).toBe('vault_unlocked');
  });

  it('recovery code unlocks; recovery with a new passphrase issues a new code and voids the old one', async () => {
    const db = freshPractice();
    await db.open();
    await createVault(db, PUBLIC_PRACTICE_PASSPHRASE, { iterations: FAST });
    await importPracticeSeed(db);
    lockVault(db);
    await db.open();
    await unlockVault(db, { recovery: PUBLIC_PRACTICE_RECOVERY_CODE });
    expect((await db.patient.toArray()).length).toBe(10);
    const before = await readVaultRow(db);
    const code = await recoverVault(db, PUBLIC_PRACTICE_RECOVERY_CODE, PUBLIC_PRACTICE_PASSPHRASE);
    expect(code).toBe(PUBLIC_PRACTICE_RECOVERY_CODE); // Practice keeps its published code
    const after = await readVaultRow(db);
    expect(after?.rotated_at).toBeTruthy();
    expect(after?.wrapped_key_pin).not.toBe(before?.wrapped_key_pin);
    expect((await db.patient.toArray()).length).toBe(10);
  });

  it('a missing recovery code and wrong passphrase leave the data unreadable (by design)', async () => {
    const db = await seededVault();
    lockVault(db);
    await db.open();
    await expect(unlockVault(db, { recovery: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH' })).rejects.toBeInstanceOf(WrongSecretError);
    await expect(db.patient.count()).resolves.toBe(10); // counts are not secret; values stay locked
    await expect(db.patient.toArray()).rejects.toBeInstanceOf(VaultLockedError);
  });
});

describe('tampering', () => {
  it('a plain row slipped into an encrypted database is refused (IntegrityError)', async () => {
    const db = await seededVault();
    db.close();
    const raw = new Dexie(db.name);
    await raw.open();
    await raw.table('patient').put({ id: 'pt-99', mrn: 'X', family_name: 'Injected', given_name: 'Fake' });
    raw.close();
    await db.open();
    await expect(db.patient.toArray()).rejects.toBeInstanceOf(IntegrityError);
  });

  it('ciphertext copied from one row onto another fails to decrypt', async () => {
    const db = await seededVault();
    db.close();
    const raw = new Dexie(db.name);
    await raw.open();
    const a = (await raw.table('patient').get('pt-01')) as Record<string, unknown>;
    const b = (await raw.table('patient').get('pt-02')) as Record<string, unknown>;
    await raw.table('patient').put({ ...b, _enc: a._enc });
    raw.close();
    await db.open();
    await expect(db.patient.get('pt-02')).rejects.toThrow(/could not be decrypted/);
    expect((await db.patient.get('pt-01'))?.id).toBe('pt-01');
  });
});

describe('datasets stay apart', () => {
  it('Real records refuse the public practice passphrase and a weak passphrase', async () => {
    const live = new DowntimeDB('live', `enc-live-${Math.random()}`);
    dbs.push(live);
    await live.open();
    await expect(createVault(live, PUBLIC_PRACTICE_PASSPHRASE, { iterations: FAST })).rejects.toThrow(/public practice passphrase/);
    await expect(createVault(live, 'short', { iterations: FAST })).rejects.toThrow(/12 characters/);
    await expect(createVault(live, 'violet harbour lantern seventeen', { iterations: FAST, recoveryCode: PUBLIC_PRACTICE_RECOVERY_CODE })).rejects.toThrow(/random recovery key/);
    await expect(createVault(live, 'violet harbour lantern seventeen', { iterations: FAST, recoveryCode: PUBLIC_PRACTICE_RECOVERY_CODE.toLowerCase() })).rejects.toThrow();
    const code = await createVault(live, 'violet harbour lantern seventeen', { iterations: FAST });
    expect(code).not.toBe(PUBLIC_PRACTICE_RECOVERY_CODE);
    await expect(unlockVault(live, { passphrase: PUBLIC_PRACTICE_PASSPHRASE })).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('Practice refuses any passphrase other than the published one', async () => {
    const db = freshPractice();
    await db.open();
    await expect(createVault(db, 'violet harbour lantern seventeen', { iterations: FAST })).rejects.toThrow(/published practice passphrase/);
  });

  it('a Practice key cannot read Real records ciphertext (independent data keys)', async () => {
    const prac = await seededVault();
    const live = new DowntimeDB('live', `enc-live-${Math.random()}`);
    dbs.push(live);
    await live.open();
    await createVault(live, 'violet harbour lantern seventeen', { iterations: FAST });
    await live.patient.add({ id: 'pt-01', mrn: 'L-1', family_name: 'Real', given_name: 'Person' } as never);
    live.close();
    const raw = new Dexie(live.name);
    await raw.open();
    const row = await raw.table('patient').get('pt-01');
    raw.close();
    prac.close();
    const r2 = new Dexie(prac.name);
    await r2.open();
    await r2.table('patient').put(row);
    r2.close();
    await prac.open();
    await expect(prac.patient.get('pt-01')).rejects.toThrow(/could not be decrypted/);
  });
});

describe('practice reset keeps the vault', () => {
  it('reset reloads the seed encrypted with the same vault', async () => {
    const db = await seededVault();
    const ks = await readVaultRow(db);
    await resetPractice(db);
    expect((await readVaultRow(db))?.wrapped_key_pin).toBe(ks?.wrapped_key_pin);
    expect(await rawPlainRowCount(db)).toBe(0);
    expect((await db.patient.toArray()).length).toBe(10);
    expect(Object.keys(await loadSeedJson())).toContain('key_store');
  });
});
