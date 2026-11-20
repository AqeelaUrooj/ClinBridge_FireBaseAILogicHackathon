import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from './db';
import { canonicalJson, verifyChain } from './audit';
import { clearVaultMode, setVaultMode } from './encryption';
import { createVault } from './vault';
import { importPracticeSeed } from './seed';
import { clearPhotos, getPhoto, rawPhotos, savePhoto, verifyPhoto } from './photos';
import { BackupDamagedError, createEncryptedBackup, openBackupFile, restoreEncryptedBackup, WrongBackupPassphraseError } from './encryptedBackup';
import { practiceClock } from '../lib/time';
import { fromB64u, toB64u } from '../lib/vaultCrypto';
import { PUBLIC_PRACTICE_PASSPHRASE } from '../config/securityPolicy';

const FAST = 1000;
const clock = practiceClock();
const actor = { userId: 'pr-ellis', deviceId: 'dev-01' };
const BACKUP_PASS = 'quartz orchard bicycle eleven';
const dbs: DowntimeDB[] = [];

afterEach(async () => {
  for (const db of dbs.splice(0)) {
    await clearPhotos(db);
    clearVaultMode(db.name);
    db.close();
  }
});

async function practiceVault(seed = true): Promise<DowntimeDB> {
  const db = new DowntimeDB('practice', `bk-${crypto.randomUUID()}`);
  dbs.push(db);
  setVaultMode(db.name, { mode: 'pending' });
  await db.open();
  await createVault(db, PUBLIC_PRACTICE_PASSPHRASE, { iterations: FAST });
  if (seed) await importPracticeSeed(db);
  return db;
}

const canon = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((r) => canonicalJson(r)).join('\n');

describe('encrypted backup file', () => {
  it('contains no readable clinical data, no PIN hashes, no key_store, no secrets', async () => {
    const db = await practiceVault();
    const { fileText, header } = await createEncryptedBackup(db, BACKUP_PASS, { clock, actor, iterations: FAST });
    expect(header.format).toBe('clinbridge-backup');
    expect(header.kdf).toMatchObject({ alg: 'PBKDF2-SHA-256', iterations: FAST });
    expect(header.cipher.alg).toBe('AES-256-GCM');
    const patient = await db.patient.get('pt-01');
    for (const needle of [patient!.family_name, 'pbkdf2$', 'cb1$', 'wrapped_key', PUBLIC_PRACTICE_PASSPHRASE, BACKUP_PASS, 'Penicillin']) expect(fileText).not.toContain(needle);
    expect((await db.audit_log.orderBy('seq').last())?.action).toBe('backup_created');
  });

  it('each backup gets a fresh salt and nonce', async () => {
    const db = await practiceVault();
    const a = await createEncryptedBackup(db, BACKUP_PASS, { clock, actor, iterations: FAST });
    const b = await createEncryptedBackup(db, BACKUP_PASS, { clock, actor, iterations: FAST });
    expect(a.header.kdf.salt).not.toBe(b.header.kdf.salt);
    expect(a.header.cipher.iv).not.toBe(b.header.cipher.iv);
  });

  it('refuses a weak backup passphrase', async () => {
    const db = await practiceVault();
    await expect(createEncryptedBackup(db, 'password1234', { clock, actor, iterations: FAST })).rejects.toThrow(/common password/);
  });

  it('refuses the unit passphrase as backup passphrase (Real records)', async () => {
    const live = new DowntimeDB('live', `bk-live-${crypto.randomUUID()}`);
    dbs.push(live);
    await live.open();
    await createVault(live, 'violet harbour lantern seventeen', { iterations: FAST });
    await expect(createEncryptedBackup(live, 'violet harbour lantern seventeen', { clock, actor, iterations: FAST })).rejects.toThrow(/different passphrase/);
  });
});

describe('restore', () => {
  it('restores into an empty database with ITS OWN new key; every table matches; photos match their hashes; chain valid', async () => {
    const src = await practiceVault();
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 5, 6, 7, 8])], { type: 'image/png' });
    const photo = await savePhoto(src, clock, actor, 'pt-08', png);
    const { fileText } = await createEncryptedBackup(src, BACKUP_PASS, { clock, actor, iterations: FAST });
    const before: Record<string, string> = {};
    for (const t of src.tables) if (t.name !== 'key_store') before[t.name] = canon((await t.toArray()) as Record<string, unknown>[]);

    const dst = await practiceVault(false);
    const r = await restoreEncryptedBackup(dst, fileText, BACKUP_PASS, { clock, deviceId: 'dev-02' });
    expect(r.photos).toBe(1);
    for (const t of dst.tables) {
      if (t.name === 'key_store' || t.name === 'audit_log') continue;
      expect(canon((await t.toArray()) as Record<string, unknown>[])).toBe(before[t.name]);
    }
    const audit = await dst.audit_log.orderBy('seq').toArray();
    expect(audit.at(-1)?.action).toBe('backup_restored');
    expect((await verifyChain(audit)).ok).toBe(true);
    const back = await getPhoto(dst, photo.ref);
    expect(await verifyPhoto(back!)).toBe(true);
    expect('_bytes' in (await rawPhotos(dst))[0]!).toBe(true); // re-sealed with the new key
    // the two laptops' vault rows differ: the backup did not carry the data key
    const k1 = (await src.key_store.toArray())[0]!.wrapped_key_pin;
    const k2 = (await dst.key_store.toArray())[0]!.wrapped_key_pin;
    expect(k1).not.toBe(k2);
  });

  it('wrong backup passphrase: refused, nothing written', async () => {
    const src = await practiceVault();
    const { fileText } = await createEncryptedBackup(src, BACKUP_PASS, { clock, actor, iterations: FAST });
    const dst = await practiceVault(false);
    await expect(restoreEncryptedBackup(dst, fileText, 'other words entirely here', { clock, deviceId: 'd' })).rejects.toBeInstanceOf(WrongBackupPassphraseError);
    expect(await dst.patient.count()).toBe(0);
  });

  it('a changed byte, an edited header, or a cut-off file is reported as damaged, not as a wrong passphrase', async () => {
    const src = await practiceVault();
    const { fileText } = await createEncryptedBackup(src, BACKUP_PASS, { clock, actor, iterations: FAST });
    const f = JSON.parse(fileText);
    const ct = fromB64u(f.ciphertext);
    ct[10] = ct[10]! ^ 1;
    await expect(openBackupFile(JSON.stringify({ ...f, ciphertext: toB64u(ct) }), BACKUP_PASS, 'practice')).rejects.toBeInstanceOf(BackupDamagedError);
    await expect(openBackupFile(JSON.stringify({ ...f, header: { ...f.header, created_at: '2020-01-01T00:00:00Z' } }), BACKUP_PASS, 'practice')).rejects.toBeInstanceOf(BackupDamagedError);
    await expect(openBackupFile(fileText.slice(0, fileText.length - 50), BACKUP_PASS, 'practice')).rejects.toBeInstanceOf(BackupDamagedError);
    await expect(openBackupFile('{"hello":1}', BACKUP_PASS, 'practice')).rejects.toBeInstanceOf(BackupDamagedError);
  });

  it('refuses a non-empty target and a backup from the other dataset', async () => {
    const src = await practiceVault();
    const { fileText } = await createEncryptedBackup(src, BACKUP_PASS, { clock, actor, iterations: FAST });
    await expect(restoreEncryptedBackup(src, fileText, BACKUP_PASS, { clock, deviceId: 'd' })).rejects.toThrow(/empty records/);
    const live = new DowntimeDB('live', `bk-live-${crypto.randomUUID()}`);
    dbs.push(live);
    await live.open();
    await createVault(live, 'violet harbour lantern seventeen', { iterations: FAST });
    await expect(restoreEncryptedBackup(live, fileText, BACKUP_PASS, { clock, deviceId: 'd' })).rejects.toThrow(/Practice backup/);
  });

  it('restore into a locked database is refused', async () => {
    const src = await practiceVault();
    const { fileText } = await createEncryptedBackup(src, BACKUP_PASS, { clock, actor, iterations: FAST });
    const dst = await practiceVault(false);
    setVaultMode(dst.name, { mode: 'locked' });
    await expect(restoreEncryptedBackup(dst, fileText, BACKUP_PASS, { clock, deviceId: 'd' })).rejects.toThrow(/locked/);
  });

  it('a backup whose audit chain is broken is rolled back after the check: target left empty', async () => {
    const src = await practiceVault();
    // break the source chain (outside the app), then back it up
    const row = await src.audit_log.where('seq').equals(10).first();
    await src.audit_log.put({ ...row!, action: 'edited_outside_app' });
    const { fileText } = await createEncryptedBackup(src, BACKUP_PASS, { clock, actor, iterations: FAST });
    const dst = await practiceVault(false);
    await expect(restoreEncryptedBackup(dst, fileText, BACKUP_PASS, { clock, deviceId: 'd' })).rejects.toThrow(/audit chain broken/);
    for (const t of dst.tables) if (t.name !== 'key_store') expect(await t.count()).toBe(0);
    const raw = new Dexie(dst.name);
    await raw.open();
    expect(await raw.table('key_store').count()).toBe(1); // the vault itself stays
    raw.close();
  });
});
