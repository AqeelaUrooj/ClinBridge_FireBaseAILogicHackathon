import { buildAuditRow } from './audit';
import { getVaultMode, isEncryptedRow, PLAIN_TABLES, setVaultMode } from './encryption';
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

export async function readVaultRow(db: DowntimeDB): Promise<KeyStore | undefined> {
  const rows = await db.key_store.toArray();
  return rows.find((r) => r.id === VAULT_ROW_ID && isVaultString(r.wrapped_key_pin));
}

/** Raw IndexedDB scan (no middleware): does any non-key_store row lack encryption? */
export async function rawPlainRowCount(db: DowntimeDB): Promise<number> {
  const idb = db.backendDB();
  const names = Array.from(idb.objectStoreNames).filter((n) => !PLAIN_TABLES.has(n));
  if (!names.length) return 0;
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(names, 'readonly');
    let plain = 0;
    for (const n of names) {
      const req = tx.objectStore(n).getAll();
      req.onsuccess = () => {
        for (const row of req.result as unknown[]) if (!isEncryptedRow(row)) plain++;
      };
    }
    tx.oncomplete = () => resolve(plain);
    tx.onerror = () => reject(tx.error);
  });
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
    if (recoveryCode !== undefined) throw new Error('Real records always get a new random recovery key.');
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
  /** Practice only: the published code. Real records: omit (random). */
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
    recoveryCode: db.dataset === 'practice' ? PUBLIC_PRACTICE_RECOVERY_CODE : undefined,
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
  // Plain rows are allowed only while a migration is unfinished (it is resumed straight after unlock).
  const plain = await rawPlainRowCount(db);
  setVaultMode(db.name, { mode: 'unlocked', key, allowPlain: plain > 0 });
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
  const plain = await rawPlainRowCount(db);
  setVaultMode(db.name, { mode: 'unlocked', key: next.key, allowPlain: plain > 0 });
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
