import Dexie from 'dexie';
import { buildAuditRow } from './audit';
import { getVaultMode, isEncryptedRow, isLegacyRow, PLAIN_TABLES, setVaultMode } from './encryption';
import { canonicalJson } from './audit';
import type { DowntimeDB } from './db';
import type { KeyStore } from './schema';
import type { Clock } from '../lib/time';
import {
  checkPassphrase, createVaultKeys, isVaultString, rewrapAfterRecovery, unlockWithPassphrase, unlockWithRecovery,
} from '../lib/vaultCrypto';
import { PUBLIC_PRACTICE_PASSPHRASE, PUBLIC_PRACTICE_RECOVERY_CODE, SECURITY_POLICY } from '../config/securityPolicy';

/**
 * Vault lifecycle for one dataset database (P-04): create, unlock, lock, recover.
 * The unit passphrase and recovery code are never stored; only the wrapped data key is (key_store row "vault").
 */

export const VAULT_ROW_ID = 'vault';

export type VaultState =
  | 'empty'      // new database, no vault yet (first-time setup creates one)
  | 'plain-data' // has records but no vault: written before encryption existed
  | 'locked'
  | 'unlocked';

/**
 * Read the vault row straight from IndexedDB WITHOUT opening the Dexie database. Opening may run a schema
 * upgrade, and an upgrade of an encrypted database needs the key first; so boot peeks, unlocks, then opens.
 */
export async function peekVault(name: string): Promise<{ exists: boolean; row?: KeyStore; hasRecords: boolean }> {
  if (!(await Dexie.exists(name))) return { exists: false, hasRecords: false };
  const idb = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    const names = Array.from(idb.objectStoreNames);
    if (!names.length) return { exists: true, hasRecords: false };
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(names, 'readonly');
      let row: KeyStore | undefined;
      let records = 0;
      for (const n of names) {
        if (n === 'key_store') {
          const r = tx.objectStore(n).getAll();
          r.onsuccess = () => { row = (r.result as KeyStore[]).find((k) => k.id === VAULT_ROW_ID && isVaultString(k.wrapped_key_pin)); };
        } else {
          const c = tx.objectStore(n).count();
          c.onsuccess = () => { records += c.result; };
        }
      }
      tx.oncomplete = () => resolve({ exists: true, row, hasRecords: records > 0 });
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    idb.close();
  }
}

/** Unlock from a peeked row (database not open yet). Wrong secret -> WrongSecretError, mode unchanged. */
export async function unlockFromRow(dbName: string, row: KeyStore, secret: UnlockSecret): Promise<void> {
  const key = 'passphrase' in secret ? await unlockWithPassphrase(row, secret.passphrase) : await unlockWithRecovery(row, secret.recovery);
  setVaultMode(dbName, { mode: 'unlocked', key, allowPlain: false });
}

/** After open: allow plain rows only while a migration is unfinished, v1 rows only until they are resealed. */
export async function refreshPlainAllowance(db: DowntimeDB): Promise<{ plain: number; legacy: number }> {
  const m = getVaultMode(db.name);
  const c = await rawFormatCounts(db);
  if (m?.mode === 'unlocked') setVaultMode(db.name, { ...m, allowPlain: c.plain > 0, allowLegacy: c.legacy > 0 });
  return c;
}

/**
 * Format upgrade v1 -> v2 for data that is ALREADY encrypted (same key, same content; no plain data involved).
 * Each table: read (v1 still accepted), compare, write back (sealed as v2), check the content is unchanged and
 * no v1 row is left. Photos the same way, each checked against its capture hash. Then v1 is refused.
 */
export async function resealLegacyRows(db: DowntimeDB, audit?: { clock: Clock; deviceId: string }): Promise<{ rows: number; photos: number }> {
  const m = getVaultMode(db.name);
  if (m?.mode !== 'unlocked') throw new Error('Unlock the records first.');
  const before = await rawFormatCounts(db);
  const { encryptLegacyPhotos } = await import('./photos');
  let rows = 0;
  if (before.legacy > 0) {
    setVaultMode(db.name, { ...m, allowLegacy: true });
    for (const t of db.tables) {
      if (PLAIN_TABLES.has(t.name)) continue;
      const snapBefore = canon((await t.toArray()) as Record<string, unknown>[]);
      await db.transaction('rw', t, async () => {
        const all = await t.toArray();
        if (all.length) await t.bulkPut(all);
      });
      const snapAfter = canon((await t.toArray()) as Record<string, unknown>[]);
      if (snapAfter !== snapBefore) throw new Error(`Format upgrade check failed for "${t.name}". Old copies were not removed; tell IT.`);
    }
    rows = before.legacy;
  }
  const photos = await encryptLegacyPhotos(db);
  const after = await rawFormatCounts(db);
  if (after.legacy > 0) throw new Error('Some records are still in the old format. Try unlocking again.');
  setVaultMode(db.name, { ...(getVaultMode(db.name) as { mode: 'unlocked'; key: CryptoKey; allowPlain: boolean }), allowLegacy: false });
  if (audit && (rows > 0 || photos > 0)) await appendAudit(db, audit.clock, audit.deviceId, 'vault_format_upgraded', { from: 1, to: 2, rows, photos });
  return { rows, photos };
}

const canon = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((r) => canonicalJson(r)).join('\n');

export const auditVaultEvent = (db: DowntimeDB, clock: Clock, deviceId: string, action: string, after: Record<string, unknown>) => appendAudit(db, clock, deviceId, action, after);

export async function readVaultRow(db: DowntimeDB): Promise<KeyStore | undefined> {
  const rows = await db.key_store.toArray();
  return rows.find((r) => r.id === VAULT_ROW_ID && isVaultString(r.wrapped_key_pin));
}

/** Raw IndexedDB scan (no middleware): rows not encrypted, and rows still in the v1 format. */
export async function rawFormatCounts(db: DowntimeDB): Promise<{ plain: number; legacy: number }> {
  const idb = db.backendDB();
  const names = Array.from(idb.objectStoreNames).filter((n) => !PLAIN_TABLES.has(n));
  if (!names.length) return { plain: 0, legacy: 0 };
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(names, 'readonly');
    let plain = 0;
    let legacy = 0;
    for (const n of names) {
      const req = tx.objectStore(n).getAll();
      req.onsuccess = () => {
        for (const row of req.result as unknown[]) {
          if (!isEncryptedRow(row)) plain++;
          else if (isLegacyRow(row)) legacy++;
        }
      };
    }
    tx.oncomplete = () => resolve({ plain, legacy });
    tx.onerror = () => reject(tx.error);
  });
}

export async function rawPlainRowCount(db: DowntimeDB): Promise<number> {
  return (await rawFormatCounts(db)).plain;
}

async function hasAnyRecords(db: DowntimeDB): Promise<boolean> {
  for (const t of db.tables) {
    if (PLAIN_TABLES.has(t.name)) continue;
    if ((await t.count()) > 0) return true;
  }
  return false;
}

/** Work out the state after open, and set the middleware mode to match (fail closed). */
export async function detectVault(db: DowntimeDB): Promise<VaultState> {
  const row = await readVaultRow(db);
  const current = getVaultMode(db.name);
  if (row) {
    if (current?.mode === 'unlocked') return 'unlocked';
    setVaultMode(db.name, { mode: 'locked' });
    return 'locked';
  }
  if (await hasAnyRecords(db)) {
    // Only Real records that predate encryption get here (Practice is migrated by bootPractice).
    if (db.dataset === 'live') setVaultMode(db.name, { mode: 'plain' });
    return 'plain-data';
  }
  setVaultMode(db.name, { mode: 'pending' });
  return 'empty';
}

function guardSecretsForDataset(db: DowntimeDB, passphrase: string, recoveryCode?: string) {
  if (db.dataset === 'live') {
    if (passphrase.normalize('NFC') === PUBLIC_PRACTICE_PASSPHRASE) throw new Error('That is the public practice passphrase. Real records need their own.');
    const norm = (c: string) => c.toUpperCase().replace(/[\s-]/g, '');
    if (recoveryCode !== undefined && norm(recoveryCode) === norm(PUBLIC_PRACTICE_RECOVERY_CODE)) throw new Error('Real records always get a new random recovery key.');
    const s = checkPassphrase(passphrase);
    if (!s.ok) throw new Error(s.problems.join(' '));
  } else if (passphrase !== PUBLIC_PRACTICE_PASSPHRASE || (recoveryCode ?? PUBLIC_PRACTICE_RECOVERY_CODE) !== PUBLIC_PRACTICE_RECOVERY_CODE) {
    throw new Error('Practice uses the published practice passphrase only.');
  }
}

async function appendAudit(db: DowntimeDB, clock: Clock, deviceId: string, action: string, after: Record<string, unknown>) {
  const last = await db.audit_log.orderBy('seq').last();
  const row = await buildAuditRow({ last, time: clock.nowIso(), userId: 'system', deviceId, action, entity: 'vault', after });
  await db.transaction('rw', db.audit_log, async () => {
    const head = await db.audit_log.orderBy('seq').last();
    if ((head?.seq ?? 0) !== (last?.seq ?? 0)) throw new Error('Another change was saved at the same moment. Try again.');
    await db.audit_log.add(row);
  });
}

export interface CreateVaultOptions {
  /** Real records: omit (random) or pass a code from newRecoveryCode(); never the public practice code. */
  recoveryCode?: string;
  iterations?: number;
  /** Write the vault_created audit row (needs an unlocked, writable audit table). */
  audit?: { clock: Clock; deviceId: string };
}

/**
 * Create the vault for an EMPTY database (or for the migration, which checks its own preconditions).
 * Returns the recovery code to show ONCE. Leaves the vault unlocked.
 */
export async function createVault(db: DowntimeDB, passphrase: string, opts: CreateVaultOptions = {}): Promise<string> {
  guardSecretsForDataset(db, passphrase, opts.recoveryCode);
  if (await readVaultRow(db)) throw new Error('This laptop already has an encrypted vault for these records.');
  const v = await createVaultKeys(passphrase, {
    // Real records: a random code made here, or one made moments earlier by newRecoveryCode() so the setup
    // screen can show it and get it confirmed BEFORE the vault exists. Practice: the published code.
    recoveryCode: db.dataset === 'practice' ? PUBLIC_PRACTICE_RECOVERY_CODE : opts.recoveryCode,
    iterations: opts.iterations ?? SECURITY_POLICY.pbkdf2Iterations,
  });
  const nowIso = new Date().toISOString();
  await db.key_store.add({ id: VAULT_ROW_ID, ...v.keys, created_at: nowIso, rotated_at: null });
  setVaultMode(db.name, { mode: 'unlocked', key: v.key, allowPlain: false });
  if (opts.audit) await appendAudit(db, opts.audit.clock, opts.audit.deviceId, 'vault_created', { kdf: 'pbkdf2-sha256', iterations: opts.iterations ?? SECURITY_POLICY.pbkdf2Iterations });
  return v.recoveryCode;
}

export type UnlockSecret = { passphrase: string } | { recovery: string };

/** Unlock with the passphrase (normal) or the recovery code. Wrong secret -> WrongSecretError. */
export async function unlockVault(db: DowntimeDB, secret: UnlockSecret, audit?: { clock: Clock; deviceId: string }): Promise<void> {
  const row = await readVaultRow(db);
  if (!row) throw new Error('There is no encrypted vault on this laptop for these records.');
  const key = 'passphrase' in secret ? await unlockWithPassphrase(row, secret.passphrase) : await unlockWithRecovery(row, secret.recovery);
  // Plain rows are allowed only while a migration is unfinished, v1 rows only until resealLegacyRows ran.
  const c = await rawFormatCounts(db);
  setVaultMode(db.name, { mode: 'unlocked', key, allowPlain: c.plain > 0, allowLegacy: c.legacy > 0 });
  if (audit) await appendAudit(db, audit.clock, audit.deviceId, 'vault_unlocked', { method: 'passphrase' in secret ? 'passphrase' : 'recovery' });
}

/**
 * Forgotten passphrase: unlock with the recovery code, set a new passphrase, and get a NEW recovery code
 * (the old one is now void). Same data key, so no record is re-encrypted.
 */
export async function recoverVault(db: DowntimeDB, recoveryCode: string, newPassphrase: string, audit?: { clock: Clock; deviceId: string }): Promise<string> {
  const row = await readVaultRow(db);
  if (!row) throw new Error('There is no encrypted vault on this laptop for these records.');
  if (db.dataset === 'live') guardSecretsForDataset(db, newPassphrase);
  else if (newPassphrase !== PUBLIC_PRACTICE_PASSPHRASE) throw new Error('Practice uses the published practice passphrase only.');
  const next = await rewrapAfterRecovery(row, recoveryCode, newPassphrase, db.dataset === 'practice' ? { newRecoveryCode: PUBLIC_PRACTICE_RECOVERY_CODE } : {});
  await db.key_store.put({ ...row, ...next.keys, rotated_at: new Date().toISOString() });
  const c = await rawFormatCounts(db);
  setVaultMode(db.name, { mode: 'unlocked', key: next.key, allowPlain: c.plain > 0, allowLegacy: c.legacy > 0 });
  if (audit) await appendAudit(db, audit.clock, audit.deviceId, 'vault_recovered', { new_passphrase: true, new_recovery_key: true });
  return next.recoveryCode;
}

/**
 * Lock: forget the key reference and close the database (drops Dexie's in-memory caches).
 * JavaScript cannot force the browser to wipe memory immediately; see KNOWN_LIMITATIONS.
 */
export function lockVault(db: DowntimeDB): void {
  setVaultMode(db.name, { mode: 'locked' });
  db.close();
}

export function isUnlocked(db: DowntimeDB): boolean {
  return getVaultMode(db.name)?.mode === 'unlocked';
}
