import Dexie from 'dexie';
import { canonicalJson, verifyChain, buildAuditRow } from './audit';
import { backupDb } from './backup';
import { DowntimeDB } from './db';
import { clearVaultMode, getVaultMode, PLAIN_TABLES, setVaultMode } from './encryption';
import { createEncryptedBackup, openBackupFile, restoreEncryptedBackup } from './encryptedBackup';
import { photoDb, rawPhotos } from './photos';
import { createVault, rawFormatCounts, readVaultRow } from './vault';
import { EntryWriteError } from './repos/entries';
import { encodeRecovery, randomBytes, sha256 } from '../lib/vaultCrypto';
import { PUBLIC_PRACTICE_PASSPHRASE } from '../config/securityPolicy';
import type { Clock } from '../lib/time';

/**
 * Removing plain safety copies (P-04 stage 10). Implemented and tested on SYNTHETIC data only.
 * Executing it on Real records is refused unless `approvedRealCleanup` is passed, and no screen passes it:
 * that needs separate, explicit owner approval.
 *
 * prepareCleanup() runs every precondition and changes nothing in the clinical database:
 *   1. the database is a complete, verified encrypted vault (no plain or old-format rows, photos sealed)
 *   2. audit chain valid
 *   3. a FRESH encrypted backup is made (handed to the admin to keep)
 *   4. that backup opens with its passphrase and its contents match the database table by table
 *   5. restore test: the backup is restored into a temporary database with its own key, compared, then removed
 *   6. final integrity check
 * It returns the list of plain copies it would remove and a short-lived token.
 * executeCleanup() needs that token, an admin, and the typed confirmation, and removes ONLY unencrypted safety
 * copies of this database from downtimekit-backups. Deleting from browser storage is not secure erasure.
 */

export const CLEANUP_CONFIRM_TEXT = 'REMOVE PLAIN COPIES';
export const ERASURE_WARNING =
  'Removing these copies deletes them from the browser’s storage. It does not guarantee the data is physically erased from the disk (browsers and SSDs can keep old blocks), and it cannot reach files that were already downloaded. Keep full-disk encryption on.';
const TOKEN_TTL_MS = 10 * 60_000;

export interface CleanupStep { name: string; ok: boolean; detail: string }
export interface CleanupCandidate { id: number; kind: string; taken_at: string }
export interface CleanupPreparation {
  ok: boolean;
  steps: CleanupStep[];
  candidates: CleanupCandidate[];
  backupFile?: string;
  backupFingerprint?: string;
  token?: string;
}

const tokens = new Map<string, { db: string; ids: number[]; fingerprint: string; expires: number }>();
type Actor = { userId: string; deviceId: string };

const canon = (rows: Record<string, unknown>[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((r) => canonicalJson(r)).join('\n');

async function requireAdmin(db: DowntimeDB, actor: Actor) {
  const p = await db.practitioner.get(actor.userId);
  if (!p || !p.active || p.role !== 'admin') throw new EntryWriteError('Only an admin can do this.');
  return p;
}

/** Safety copies of THIS database that are not encrypted. */
export async function plainSafetyCopies(db: DowntimeDB): Promise<CleanupCandidate[]> {
  const b = backupDb();
  try {
    const rows = await b.backups.where('db_name').equals(db.name).toArray();
    return rows
      .filter((r) => !Object.entries(r.tables).every(([t, rs]) => PLAIN_TABLES.has(t) || (rs as { _enc?: unknown }[]).every((x) => x._enc !== undefined)))
      .map((r) => ({ id: r.id!, kind: r.kind ?? 'schema-upgrade', taken_at: r.taken_at }));
  } finally {
    b.close();
  }
}

async function restoreTest(db: DowntimeDB, fileText: string, passphrase: string, clock: Clock): Promise<string> {
  const scratchName = `${db.name}-restore-test-${crypto.randomUUID().slice(0, 8)}`;
  const scratch = new DowntimeDB(db.dataset, scratchName);
  setVaultMode(scratch.name, { mode: 'pending' });
  try {
    await scratch.open();
    const tempPass = db.dataset === 'practice' ? PUBLIC_PRACTICE_PASSPHRASE : encodeRecovery(randomBytes(20)).toLowerCase(); // random, discarded
    await createVault(scratch, tempPass);
    await restoreEncryptedBackup(scratch, fileText, passphrase, { clock, deviceId: 'restore-test' });
    for (const t of db.tables) {
      if (PLAIN_TABLES.has(t.name) || t.name === 'audit_log') continue;
      const a = canon((await t.toArray()) as Record<string, unknown>[]);
      const b = canon((await scratch.table(t.name).toArray()) as Record<string, unknown>[]);
      if (a !== b) throw new Error(`table ${t.name} differs after restore`);
    }
    // backup holds N rows; source now has N + backup_created; scratch has N + backup_restored
    const srcAudit = await db.audit_log.count();
    const dstAudit = await scratch.audit_log.count();
    if (dstAudit !== srcAudit) throw new Error(`audit rows ${dstAudit}, expected ${srcAudit}`);
    if (!(await verifyChain(await scratch.audit_log.toArray())).ok) throw new Error('audit chain broken after restore');
    if ((await rawPhotos(scratch)).length !== (await rawPhotos(db)).length) throw new Error('photo count differs after restore');
    return `${dstAudit - 1} audit rows, all tables identical`;
  } finally {
    scratch.close();
    clearVaultMode(scratch.name);
    await Dexie.delete(scratch.name);
    await photoDb(scratch).delete();
  }
}

export async function prepareCleanup(db: DowntimeDB, opts: { clock: Clock; actor: Actor; backupPassphrase: string; iterations?: number }): Promise<CleanupPreparation> {
  await requireAdmin(db, opts.actor);
  const steps: CleanupStep[] = [];
  const fail = (name: string, detail: string): CleanupPreparation => ({ ok: false, steps: [...steps, { name, ok: false, detail }], candidates: [] });

  // 1. complete, verified encrypted database
  const vault = await readVaultRow(db);
  const m = getVaultMode(db.name);
  if (!vault || m?.mode !== 'unlocked') return fail('Encrypted database', 'No unlocked encrypted vault.');
  const c = await rawFormatCounts(db);
  const photos = await rawPhotos(db);
  const plainPhotos = photos.filter((p) => !('_bytes' in p)).length;
  if (c.plain || c.legacy || plainPhotos) return fail('Encrypted database', `${c.plain} plain rows, ${c.legacy} old-format rows, ${plainPhotos} plain photos.`);
  steps.push({ name: 'Encrypted database', ok: true, detail: 'Every record and photo is encrypted in the current format.' });

  // 2. audit chain
  const chain = await verifyChain(await db.audit_log.toArray());
  if (!chain.ok) return fail('Change log', `Chain broken at row ${chain.brokenAtSeq}.`);
  steps.push({ name: 'Change log', ok: true, detail: `${chain.verified} rows verified.` });

  // 3. fresh encrypted backup
  let fileText: string;
  let fingerprint: string;
  try {
    const b = await createEncryptedBackup(db, opts.backupPassphrase, { clock: opts.clock, actor: opts.actor, iterations: opts.iterations });
    fileText = b.fileText;
    fingerprint = b.header.fingerprint;
  } catch (e) {
    return fail('Fresh encrypted backup', e instanceof Error ? e.message : String(e));
  }
  steps.push({ name: 'Fresh encrypted backup', ok: true, detail: `Made now. Fingerprint ${fingerprint.slice(0, 16)}…` });

  // 4. backup opens and matches
  try {
    const { content } = await openBackupFile(fileText, opts.backupPassphrase, db.dataset);
    for (const t of db.tables) {
      if (PLAIN_TABLES.has(t.name)) continue;
      const rows = (await t.toArray()) as Record<string, unknown>[];
      const m2 = content.manifest.tables[t.name];
      if (t.name === 'audit_log') { if (!m2 || m2.count !== rows.length - 1) throw new Error('audit_log count differs'); continue; } // + backup_created row
      if (!m2 || m2.count !== rows.length || m2.sha256 !== (await sha256(canon(rows)))) throw new Error(`table ${t.name} differs`);
    }
  } catch (e) {
    return fail('Backup opens and matches', e instanceof Error ? e.message : String(e));
  }
  steps.push({ name: 'Backup opens and matches', ok: true, detail: 'Opened with the backup passphrase; every table matches.' });

  // 5. restore test
  try {
    const detail = await restoreTest(db, fileText, opts.backupPassphrase, opts.clock);
    steps.push({ name: 'Restore test', ok: true, detail: `Restored into a temporary database with its own key: ${detail}. Temporary database removed.` });
  } catch (e) {
    return fail('Restore test', e instanceof Error ? e.message : String(e));
  }

  // 6. final integrity check
  const c2 = await rawFormatCounts(db);
  const chain2 = await verifyChain(await db.audit_log.toArray());
  if (c2.plain || c2.legacy || !chain2.ok) return fail('Final integrity check', 'Database changed during the checks.');
  steps.push({ name: 'Final integrity check', ok: true, detail: 'Still fully encrypted; chain valid.' });

  const candidates = await plainSafetyCopies(db);
  const token = crypto.randomUUID();
  tokens.set(token, { db: db.name, ids: candidates.map((x) => x.id), fingerprint, expires: Date.now() + TOKEN_TTL_MS });
  return { ok: true, steps, candidates, backupFile: fileText, backupFingerprint: fingerprint, token };
}

export async function executeCleanup(
  db: DowntimeDB, token: string, confirmText: string, opts: { clock: Clock; actor: Actor; approvedRealCleanup?: boolean },
): Promise<{ removed: number }> {
  if (db.dataset === 'live' && !opts.approvedRealCleanup) throw new EntryWriteError('Removing plain copies of Real records is irreversible and needs separate explicit approval.');
  await requireAdmin(db, opts.actor);
  const t = tokens.get(token);
  if (!t || t.db !== db.name || Date.now() > t.expires) throw new EntryWriteError('Run the checks again first (they are valid for 10 minutes).');
  if (confirmText.trim() !== CLEANUP_CONFIRM_TEXT) throw new EntryWriteError(`Type ${CLEANUP_CONFIRM_TEXT} to confirm.`);
  const c = await rawFormatCounts(db);
  if (c.plain || c.legacy) throw new EntryWriteError('The database is not fully encrypted any more. Nothing was removed.');
  tokens.delete(token);
  const b = backupDb();
  let removed = 0;
  try {
    await b.backups.bulkDelete(t.ids);
    for (const id of t.ids) if (!(await b.backups.get(id))) removed++;
  } finally {
    b.close();
  }
  if (removed !== t.ids.length) throw new EntryWriteError(`Only ${removed} of ${t.ids.length} copies were removed. Tell IT.`);
  const last = await db.audit_log.orderBy('seq').last();
  const row = await buildAuditRow({ last, time: opts.clock.nowIso(), userId: opts.actor.userId, deviceId: opts.actor.deviceId, action: 'plain_copies_removed', entity: 'downtimekit-backups', after: { removed, backup_fingerprint: t.fingerprint } });
  await db.audit_log.add(row);
  return { removed };
}
