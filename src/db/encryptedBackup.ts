import { canonicalJson, verifyChain, buildAuditRow } from './audit';
import { PLAIN_TABLES } from './encryption';
import type { DowntimeDB, Dataset } from './db';
import { photoDb, getPhoto, sealPhoto, type StoredPhoto } from './photos';
import { requireKey } from './encryption';
import { readVaultRow } from './vault';
import { checkPassphrase, fromB64u, keyFromPassphrase, randomBytes, sha256, toB64u, unlockWithPassphrase, WrongSecretError } from '../lib/vaultCrypto';
import { SECURITY_POLICY } from '../config/securityPolicy';
import type { Clock } from '../lib/time';

/**
 * Encrypted backup file (P-04 decision B1).
 *
 * File = JSON { header, ciphertext }.
 *   header: format, version, dataset, created_at, KDF (PBKDF2-SHA-256, iterations, salt), cipher (AES-256-GCM, nonce),
 *           fingerprint = SHA-256 of header (without the fingerprint) + ciphertext: tells "damaged or edited file"
 *           apart from "wrong passphrase".
 *   ciphertext: AES-256-GCM of { manifest, tables, photos } under a key derived from a separate BACKUP passphrase.
 *           The header (minus fingerprint) is also the GCM associated data, so an edited header never decrypts.
 * Never inside: key_store (wrapped keys), the unit passphrase, the recovery key, the backup passphrase.
 * Restore: only into an EMPTY database of the same dataset that has its own vault; every table hash and the audit
 * chain are checked afterwards, or the restore is rolled back.
 */

export const BACKUP_FORMAT = 'clinbridge-backup';

export interface BackupHeader {
  format: typeof BACKUP_FORMAT;
  version: 1;
  dataset: Dataset;
  created_at: string;
  kdf: { alg: 'PBKDF2-SHA-256'; iterations: number; salt: string };
  cipher: { alg: 'AES-256-GCM'; iv: string };
  fingerprint: string;
}

interface BackupPhoto { ref: string; patient_id: string; saved_at: string; type: string; size: number; sha256: string; data: string }

interface BackupContent {
  manifest: { tables: Record<string, { count: number; sha256: string }>; photos: { count: number; sha256: string } };
  tables: Record<string, Record<string, unknown>[]>;
  photos: BackupPhoto[];
}

export class BackupDamagedError extends Error {
  constructor(detail: string) {
    super(`The backup file is damaged or not complete (${detail}). Nothing was restored.`);
    this.name = 'BackupDamagedError';
  }
}

export class WrongBackupPassphraseError extends Error {
  constructor() {
    super('Wrong backup passphrase. Nothing was restored.');
    this.name = 'WrongBackupPassphraseError';
  }
}

const aadOf = (h: Omit<BackupHeader, 'fingerprint'>) => new TextEncoder().encode(canonicalJson(h as unknown as Record<string, unknown>));
const byId = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.id).localeCompare(String(b.id));
const tableHash = (rows: Record<string, unknown>[]) => sha256([...rows].sort(byId).map((r) => canonicalJson(r)).join('\n'));
const photosHash = (ps: BackupPhoto[]) => sha256([...ps].sort((a, b) => a.ref.localeCompare(b.ref)).map((p) => `${p.ref}:${p.sha256}`).join('\n'));

async function photoToB64(p: StoredPhoto): Promise<string> {
  return toB64u(new Uint8Array(await new Response(p.blob).arrayBuffer()));
}

/** The unit passphrase must not double as the backup passphrase. */
async function assertNotUnitPassphrase(db: DowntimeDB, passphrase: string) {
  const row = await readVaultRow(db);
  if (!row) return;
  try {
    await unlockWithPassphrase(row, passphrase);
  } catch (e) {
    if (e instanceof WrongSecretError) return;
    throw e;
  }
  throw new Error('Use a different passphrase from the unit passphrase, so one leaked secret does not open both.');
}

export async function createEncryptedBackup(db: DowntimeDB, passphrase: string, opts: { clock: Clock; actor: { userId: string; deviceId: string }; iterations?: number }): Promise<{ fileText: string; header: BackupHeader; counts: Record<string, number> }> {
  const s = checkPassphrase(passphrase);
  if (!s.ok) throw new Error(s.problems.join(' '));
  await assertNotUnitPassphrase(db, passphrase);

  const tables: Record<string, Record<string, unknown>[]> = {};
  const manifestTables: BackupContent['manifest']['tables'] = {};
  for (const t of db.tables) {
    if (PLAIN_TABLES.has(t.name)) continue; // key_store never leaves the laptop
    const rows = (await t.toArray()) as Record<string, unknown>[];
    tables[t.name] = rows;
    manifestTables[t.name] = { count: rows.length, sha256: await tableHash(rows) };
  }
  const photos: BackupPhoto[] = [];
  for (const raw of await photoDb(db.dataset).photos.toArray()) {
    const p = await getPhoto(db, raw.ref);
    if (p) photos.push({ ref: p.ref, patient_id: p.patient_id, saved_at: p.saved_at, type: p.type, size: p.size, sha256: p.sha256, data: await photoToB64(p) });
  }
  const content: BackupContent = { manifest: { tables: manifestTables, photos: { count: photos.length, sha256: await photosHash(photos) } }, tables, photos };

  const iterations = opts.iterations ?? SECURITY_POLICY.pbkdf2Iterations;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const head: Omit<BackupHeader, 'fingerprint'> = {
    format: BACKUP_FORMAT, version: 1, dataset: db.dataset, created_at: opts.clock.nowIso(),
    kdf: { alg: 'PBKDF2-SHA-256', iterations, salt: toB64u(salt) }, cipher: { alg: 'AES-256-GCM', iv: toB64u(iv) },
  };
  const key = await keyFromPassphrase(passphrase, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadOf(head) }, key, new TextEncoder().encode(JSON.stringify(content))));
  const header: BackupHeader = { ...head, fingerprint: await fingerprintOf(head, ct) };
  const fileText = JSON.stringify({ header, ciphertext: toB64u(ct) });

  const counts = Object.fromEntries(Object.entries(manifestTables).map(([k, v]) => [k, v.count]));
  const last = await db.audit_log.orderBy('seq').last();
  const row = await buildAuditRow({ last, time: opts.clock.nowIso(), userId: opts.actor.userId, deviceId: opts.actor.deviceId, action: 'backup_created', entity: 'database', after: { fingerprint: header.fingerprint, counts, photos: photos.length } });
  await db.audit_log.add(row);
  return { fileText, header, counts };
}

/** Read + decrypt + check a backup file without writing anything. */
export async function openBackupFile(fileText: string, passphrase: string, expectDataset: Dataset): Promise<{ header: BackupHeader; content: BackupContent }> {
  let parsed: { header?: BackupHeader; ciphertext?: string };
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new BackupDamagedError('not readable as a ClinBridge backup');
  }
  const h = parsed.header;
  if (!h || h.format !== BACKUP_FORMAT || h.version !== 1 || typeof parsed.ciphertext !== 'string') throw new BackupDamagedError('not a ClinBridge backup file');
  if (h.dataset !== expectDataset) {
    throw new Error(h.dataset === 'practice' ? 'This is a Practice backup. It cannot be restored into Real records.' : 'This is a Real-records backup. It cannot be restored into Practice.');
  }
  const ct = fromB64u(parsed.ciphertext);
  const { fingerprint, ...head } = h;
  if ((await fingerprintOf(head, ct)) !== fingerprint) throw new BackupDamagedError('fingerprint does not match');
  const key = await keyFromPassphrase(passphrase, fromB64u(h.kdf.salt), h.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(fromB64u(h.cipher.iv)), additionalData: aadOf(head) }, key, new Uint8Array(ct));
  } catch {
    // Fingerprint matched, so header and bytes are exactly as written: the passphrase is the problem.
    throw new WrongBackupPassphraseError();
  }
  const content = JSON.parse(new TextDecoder().decode(plain)) as BackupContent;
  for (const [name, m] of Object.entries(content.manifest.tables)) {
    const rows = content.tables[name] ?? [];
    if (rows.length !== m.count || (await tableHash(rows)) !== m.sha256) throw new BackupDamagedError(`table ${name} does not match its manifest`);
  }
  if ((await photosHash(content.photos)) !== content.manifest.photos.sha256) throw new BackupDamagedError('photo list does not match its manifest');
  return { header: h, content };
}

export interface RestoreReport { counts: Record<string, number>; photos: number; header: BackupHeader }

export async function restoreEncryptedBackup(db: DowntimeDB, fileText: string, passphrase: string, opts: { clock: Clock; deviceId: string }): Promise<RestoreReport> {
  const { header, content } = await openBackupFile(fileText, passphrase, db.dataset);
  // Target must be empty and, if encrypted, unlocked (its own new vault).
  for (const t of db.tables) {
    if (PLAIN_TABLES.has(t.name)) continue;
    if ((await t.count()) > 0) throw new Error('Restore only into empty records. Nothing was restored.');
  }
  if ((await photoDb(db.dataset).photos.count()) > 0) throw new Error('Restore only into empty records (photos exist). Nothing was restored.');
  const key = requireKey(db.name); // throws if locked; null = plain database (allowed only for unregistered/plain mode)

  const names = Object.keys(content.tables).filter((n) => db.tables.some((t) => t.name === n) && !PLAIN_TABLES.has(n));
  await db.transaction('rw', names.map((n) => db.table(n)), async () => {
    for (const n of names) if (content.tables[n]!.length) await db.table(n).bulkAdd(content.tables[n]!);
  });

  const rollback = async () => {
    await db.transaction('rw', names.map((n) => db.table(n)), async () => { for (const n of names) await db.table(n).clear(); });
    await photoDb(db.dataset).photos.clear();
  };

  try {
    // photos: rebuilt, hash-checked, sealed with THIS laptop's key
    for (const p of content.photos) {
      const bytes = fromB64u(p.data);
      if ((await sha256Hex(bytes)) !== p.sha256) throw new BackupDamagedError(`photo ${p.ref} does not match its hash`);
      const stored: StoredPhoto = { ref: p.ref, patient_id: p.patient_id, saved_at: p.saved_at, type: p.type, size: p.size, sha256: p.sha256, blob: new Blob([new Uint8Array(bytes)], { type: p.type }) };
      await photoDb(db.dataset).photos.add(key ? await sealPhoto(key, stored) : stored);
    }
    // verify what is now stored against the manifest
    for (const n of names) {
      const rows = (await db.table(n).toArray()) as Record<string, unknown>[];
      const m = content.manifest.tables[n]!;
      if (rows.length !== m.count || (await tableHash(rows)) !== m.sha256) throw new BackupDamagedError(`restored table ${n} does not match`);
    }
    const chain = await verifyChain(await db.audit_log.toArray());
    if (!chain.ok) throw new BackupDamagedError(`audit chain broken at row ${chain.brokenAtSeq}`);
  } catch (e) {
    await rollback();
    throw e;
  }

  const last = await db.audit_log.orderBy('seq').last();
  const row = await buildAuditRow({ last, time: opts.clock.nowIso(), userId: 'system', deviceId: opts.deviceId, action: 'backup_restored', entity: 'database', after: { fingerprint: header.fingerprint, from_created_at: header.created_at } });
  await db.audit_log.add(row);
  return { counts: Object.fromEntries(names.map((n) => [n, content.tables[n]!.length])), photos: content.photos.length, header };
}

async function fingerprintOf(head: Omit<BackupHeader, 'fingerprint'>, ct: Uint8Array): Promise<string> {
  const a = aadOf(head);
  const all = new Uint8Array(a.length + ct.length);
  all.set(a);
  all.set(ct, a.length);
  return sha256(all);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
