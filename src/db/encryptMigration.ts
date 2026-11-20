import { canonicalJson, verifyChain } from './audit';
import { backupDb, readAll, type SchemaBackup } from './backup';
import { decryptRow, getVaultMode, indexFieldsFromSpec, isEncryptedRow, PLAIN_TABLES, setVaultMode } from './encryption';
import { V1_STORES, DB_VERSION, type DowntimeDB } from './db';
import { buildAuditRow } from './audit';
import { createVault, readVaultRow, rawPlainRowCount } from './vault';
import { sha256 } from '../lib/vaultCrypto';
import type { Clock } from '../lib/time';
import { encryptPlainPhotos, getPhoto, rawPhotos, verifyPhoto } from './photos';

/**
 * Staged in-place encryption of a database that holds plain records (P-04 decision D1, conditional).
 *
 *   1. checkpoint: raw copy of every table into downtimekit-backups (kind "pre-encryption"), read back and
 *      compared (row counts + SHA-256 per table). Fails -> nothing changed.
 *   2. vault: key_store row created (or the existing one is used when resuming).
 *   3. encrypt table by table. Re-runnable: a half-done database stays readable and the next run finishes it.
 *   4. verify against the checkpoint: every row encrypted, every row decrypts to the original, audit chain valid.
 *   5. audit row "vault_encrypted" (counts only).
 *
 * NOT done here: deleting the checkpoint or older plain safety copies. That cleanup needs separate owner approval.
 * Real records: refused unless `approvedRealMigration` is passed; no screen passes it (needs explicit approval).
 */

export interface MigrationOptions {
  passphrase: string;
  clock: Clock;
  deviceId: string;
  approvedRealMigration?: boolean;
  iterations?: number;
  /** Test hook: throw right after this table has been encrypted and committed (simulates a crash). */
  interruptAfterTable?: string;
}

export interface MigrationReport {
  checkpointId: number;
  resumed: boolean;
  counts: Record<string, number>;
  photosEncrypted: number;
  verified: true;
}

export class MigrationVerifyError extends Error {
  constructor(message: string) {
    super(`Encryption check failed: ${message}. Nothing was deleted; the checkpoint copy is kept.`);
    this.name = 'MigrationVerifyError';
  }
}

const FIELDS = Object.fromEntries(Object.entries(V1_STORES).map(([t, s]) => [t, indexFieldsFromSpec(s)]));

async function tableHashes(tables: Record<string, unknown[]>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, rows] of Object.entries(tables)) {
    const sorted = [...(rows as Record<string, unknown>[])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    out[name] = await sha256(sorted.map((r) => canonicalJson(r)).join('\n'));
  }
  return out;
}

async function findCheckpoint(dbName: string): Promise<SchemaBackup | undefined> {
  const b = backupDb();
  try {
    const all = await b.backups.where('db_name').equals(dbName).toArray();
    return all.filter((x) => x.kind === 'pre-encryption').sort((a, b2) => (b2.id ?? 0) - (a.id ?? 0))[0];
  } finally {
    b.close();
  }
}

/** Step 1. Raw copy + read-back check. */
export async function writeCheckpoint(db: DowntimeDB, nowIso: string): Promise<number> {
  const tables = await readAll(db.backendDB());
  const hashes = await tableHashes(tables);
  const b = backupDb();
  try {
    const id = await b.backups.add({ db_name: db.name, from_version: DB_VERSION, to_version: DB_VERSION, taken_at: nowIso, tables, kind: 'pre-encryption', table_hashes: hashes });
    const back = await b.backups.get(id);
    if (!back) throw new MigrationVerifyError('checkpoint could not be read back');
    const again = await tableHashes(back.tables);
    for (const [name, h] of Object.entries(hashes)) {
      if (again[name] !== h || (back.tables[name]?.length ?? -1) !== (tables[name]?.length ?? 0)) {
        await b.backups.delete(id); // only the faulty new copy; the database itself is untouched
        throw new MigrationVerifyError(`checkpoint copy of "${name}" does not match`);
      }
    }
    return id;
  } finally {
    b.close();
  }
}

/** Step 4. Compare the raw encrypted store with the checkpoint. */
export async function verifyAgainstCheckpoint(db: DowntimeDB, checkpoint: SchemaBackup): Promise<Record<string, number>> {
  const mode = getVaultMode(db.name);
  if (mode?.mode !== 'unlocked') throw new MigrationVerifyError('vault is not unlocked');
  const raw = await readAll(db.backendDB());
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(raw)) {
    if (PLAIN_TABLES.has(name)) continue;
    const original = (checkpoint.tables[name] ?? []) as Record<string, unknown>[];
    if (rows.length !== original.length) throw new MigrationVerifyError(`"${name}" has ${rows.length} rows, checkpoint has ${original.length}`);
    const byId = new Map(original.map((r) => [JSON.stringify(r.id), r]));
    for (const row of rows as Record<string, unknown>[]) {
      if (!isEncryptedRow(row)) throw new MigrationVerifyError(`a row in "${name}" is still plain`);
      const idx = FIELDS[name] ?? ['id'];
      const extra = Object.keys(row).filter((k) => k !== '_enc' && !idx.includes(k));
      if (extra.length) throw new MigrationVerifyError(`a row in "${name}" has unencrypted fields: ${extra.join(', ')}`);
      const plain = await decryptRow(mode.key, name, idx, row);
      const orig = byId.get(JSON.stringify(row.id));
      if (!orig || canonicalJson(plain) !== canonicalJson(orig)) throw new MigrationVerifyError(`row ${String(row.id)} in "${name}" does not match the original`);
    }
    counts[name] = rows.length;
  }
  const chain = await verifyChain(await db.audit_log.toArray());
  if (!chain.ok) throw new MigrationVerifyError(`audit chain broken at row ${chain.brokenAtSeq}`);
  return counts;
}

export async function migrateToEncrypted(db: DowntimeDB, opts: MigrationOptions): Promise<MigrationReport> {
  if (db.dataset === 'live' && !opts.approvedRealMigration) {
    throw new Error('Encrypting existing Real records is an irreversible step and needs explicit approval first.');
  }
  const existingVault = await readVaultRow(db);
  let checkpoint = await findCheckpoint(db.name);
  let resumed = false;

  if (!existingVault) {
    if ((await rawPlainRowCount(db)) === 0) throw new Error('Nothing to migrate: there are no plain records.');
    // 1. checkpoint (fresh one, always, before anything changes)
    const id = await writeCheckpoint(db, opts.clock.nowIso());
    checkpoint = await findCheckpoint(db.name);
    if (!checkpoint || checkpoint.id !== id) throw new MigrationVerifyError('checkpoint missing after write');
    // 2. vault
    await createVault(db, opts.passphrase, { iterations: opts.iterations });
    setVaultMode(db.name, { ...(getVaultMode(db.name) as { mode: 'unlocked'; key: CryptoKey; allowPlain: boolean }), allowPlain: true });
  } else {
    // Resuming an interrupted run: vault exists and must already be unlocked by the caller.
    const m = getVaultMode(db.name);
    if (m?.mode !== 'unlocked') throw new Error('Unlock the vault first, then the encryption will finish.');
    if (!checkpoint) throw new MigrationVerifyError('no checkpoint found for the unfinished encryption');
    setVaultMode(db.name, { ...m, allowPlain: true });
    resumed = true;
  }

  // 3. encrypt, table by table (reads give plain values; writing them back seals them)
  for (const t of db.tables) {
    if (PLAIN_TABLES.has(t.name)) continue;
    await db.transaction('rw', t, async () => {
      const rows = await t.toArray();
      if (rows.length) await t.bulkPut(rows);
    });
    if (opts.interruptAfterTable === t.name) throw new Error(`Simulated interruption after "${t.name}"`);
  }

  // 3b. photos: each one is checked against its capture-time hash before its plain row is replaced
  const photosEncrypted = await encryptPlainPhotos(db);

  // 4. verify, then stop accepting plain rows
  const counts = await verifyAgainstCheckpoint(db, checkpoint);
  for (const p of await rawPhotos(db.dataset)) {
    if (!('_bytes' in p)) throw new MigrationVerifyError(`photo ${p.ref} is still plain`);
    const open = await getPhoto(db, p.ref);
    if (!open || !(await verifyPhoto(open))) throw new MigrationVerifyError(`photo ${p.ref} does not match its saved hash`);
  }
  const m = getVaultMode(db.name) as { mode: 'unlocked'; key: CryptoKey; allowPlain: boolean };
  setVaultMode(db.name, { ...m, allowPlain: false });

  // 5. audit
  const last = await db.audit_log.orderBy('seq').last();
  const row = await buildAuditRow({ last, time: opts.clock.nowIso(), userId: 'system', deviceId: opts.deviceId, action: 'vault_encrypted', entity: 'database', after: { counts, photos: photosEncrypted, checkpoint_id: checkpoint.id ?? null, resumed } });
  await db.audit_log.add(row);

  return { checkpointId: checkpoint.id!, resumed, counts, photosEncrypted, verified: true };
}
