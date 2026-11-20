import Dexie from 'dexie';
import type { Dataset, DowntimeDB } from './db';
import { getVaultMode, IntegrityError, requireKey } from './encryption';
import { openBytes, openJson, sealBytes, sealJson, isSealed, type Sealed } from '../lib/vaultCrypto';
import { canonicalJson } from './audit';
import { buildAuditRow } from './audit';
import { guardStorage } from './errors';
import type { Clock } from '../lib/time';

/**
 * Local photo store for paper-form photos (the source the nurse transcribes from).
 * The 19-table schema keeps only the reference (entry.raw_input_ref, e.g. "vault/raw/<id>.jpg"); the image
 * itself lives here, in a separate IndexedDB database per dataset. Nothing is uploaded anywhere.
 * Saved BEFORE any clinical record is created, with an audit row, so the source exists even if the nurse
 * stops halfway.
 * Encrypted at rest (P-04) when the dataset has a vault: `ref`, `patient_id`, `saved_at` stay plain (indexes);
 * the image bytes and its type/size/hash are AES-256-GCM, sealed before the write (outside any transaction).
 */
export interface StoredPhoto {
  ref: string;
  blob: Blob;
  type: string;
  size: number;
  sha256: string;
  saved_at: string;
  patient_id: string;
}

/** Stored form when encrypted. */
interface SealedPhoto {
  ref: string;
  patient_id: string;
  saved_at: string;
  _enc: Sealed;   // { type, size, sha256 }
  _bytes: Sealed; // image bytes
}

type PhotoRow = StoredPhoto | SealedPhoto;
const isSealedPhoto = (r: PhotoRow): r is SealedPhoto => isSealed((r as SealedPhoto)._enc) && isSealed((r as SealedPhoto)._bytes);

/** Key lookup: the photo store uses its clinical database's vault key. */
type PhotoSource = Dataset | DowntimeDB;
const dbNameOf = (src: PhotoSource) => (typeof src === 'string' ? `downtimekit-${src}` : src.name);
const keyFor = (src: PhotoSource) => requireKey(dbNameOf(src));

/** Associated data. v2 binds the plain index fields too, so editing ref/patient_id/saved_at is detected. */
const photoAad = (s: { ref: string; patient_id: string; saved_at: string }, part: 'meta' | 'bytes', v: 1 | 2) =>
  v === 2 ? `cb2|photos|${canonicalJson({ ref: s.ref, patient_id: s.patient_id, saved_at: s.saved_at })}|${part}` : `photos|${s.ref}|${part}`;

export async function sealPhoto(key: CryptoKey, p: StoredPhoto): Promise<SealedPhoto> {
  const bytes = new Uint8Array(await new Response(p.blob).arrayBuffer());
  return {
    ref: p.ref, patient_id: p.patient_id, saved_at: p.saved_at,
    _enc: await sealJson(key, { type: p.type, size: p.size, sha256: p.sha256 }, photoAad(p, 'meta', 2), 2),
    _bytes: await sealBytes(key, bytes, photoAad(p, 'bytes', 2), 2),
  };
}

export async function openPhoto(key: CryptoKey, s: SealedPhoto): Promise<StoredPhoto> {
  const meta = await openJson<{ type: string; size: number; sha256: string }>(key, s._enc, photoAad(s, 'meta', s._enc.v));
  const bytes = await openBytes(key, s._bytes, photoAad(s, 'bytes', s._bytes.v));
  return { ref: s.ref, patient_id: s.patient_id, saved_at: s.saved_at, ...meta, blob: new Blob([bytes], { type: meta.type }) };
}

class PhotoDB extends Dexie {
  photos!: Dexie.Table<PhotoRow, string>;
  constructor(clinicalDbName: string) {
    super(`${clinicalDbName}-photos`); // app: downtimekit-practice-photos / downtimekit-live-photos (unchanged names)
    this.version(1).stores({ photos: 'ref, patient_id, saved_at' });
  }
}

const open = new Map<string, PhotoDB>();
/** One photo store per clinical database (so a scratch database used for a restore test has its own). */
export const photoDb = (src: PhotoSource): PhotoDB => {
  const name = dbNameOf(src);
  let p = open.get(name);
  if (!p) { p = new PhotoDB(name); open.set(name, p); }
  return p;
};

async function blobHash(blob: Blob): Promise<string> {
  const buf = await new Response(blob).arrayBuffer();
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

export async function savePhoto(db: DowntimeDB, clock: Clock, actor: { userId: string; deviceId: string }, patientId: string, blob: Blob): Promise<StoredPhoto> {
  if (!blob.type.startsWith('image/')) throw new Error('This file is not a picture.');
  const sha256 = await blobHash(blob);
  const ref = `vault/raw/${crypto.randomUUID()}.${EXT[blob.type] ?? 'img'}`;
  const row: StoredPhoto = { ref, blob, type: blob.type, size: blob.size, sha256, saved_at: clock.nowIso(), patient_id: patientId };
  const key = keyFor(db);
  const stored: PhotoRow = key ? await sealPhoto(key, row) : row;
  await guardStorage(() => photoDb(db).photos.add(stored));
  const last = await db.audit_log.orderBy('seq').last();
  const audit = await buildAuditRow({ last, time: row.saved_at, userId: actor.userId, deviceId: actor.deviceId, action: 'photo_saved', entity: ref, after: { patient_id: patientId, sha256, size: blob.size, type: blob.type } });
  await guardStorage(() => db.audit_log.add(audit));
  return row;
}

export async function getPhoto(src: Dataset | DowntimeDB, ref: string): Promise<StoredPhoto | undefined> {
  const row = await photoDb(src).photos.get(ref);
  if (!row) return undefined;
  if (!isSealedPhoto(row)) {
    // A plain photo next to a vault is allowed only until the Practice migration has encrypted it.
    return row;
  }
  const key = keyFor(src);
  if (!key) throw new Error('This photo is encrypted but the records are not unlocked.');
  const m = getVaultMode(dbNameOf(src));
  if ((row._enc.v === 1 || row._bytes.v === 1) && !(m?.mode === 'unlocked' && m.allowLegacy)) throw new IntegrityError('photos');
  try {
    return await openPhoto(key, row);
  } catch {
    throw new IntegrityError('photos', `Photo ${row.ref} failed its integrity check (changed outside ClinBridge or damaged). Tell IT.`);
  }
}

export const clearPhotos = (src: PhotoSource) => photoDb(src).photos.clear();

/** Raw rows (no decryption), for migration and checks. */
export const rawPhotos = (src: PhotoSource) => photoDb(src).photos.toArray();

/**
 * P-04 migration step for photos: seal each plain photo, decrypt the sealed copy and compare its hash with
 * the hash saved at capture time BEFORE replacing the plain row. Returns how many were encrypted.
 */
export async function encryptPlainPhotos(db: DowntimeDB): Promise<number> {
  const key = keyFor(db);
  if (!key) throw new Error('Unlock the records before encrypting photos.');
  let done = 0;
  for (const row of await rawPhotos(db)) {
    if (isSealedPhoto(row)) continue;
    const sealed = await sealPhoto(key, row);
    const check = await openPhoto(key, sealed);
    if (!(await verifyPhoto(check))) throw new Error(`Photo ${row.ref} did not match its saved hash after encryption. It was left as it was.`);
    await photoDb(db).photos.put(sealed);
    done++;
  }
  return done;
}

/** Re-hash a stored photo and compare with the hash saved at capture time. */
export async function verifyPhoto(p: StoredPhoto): Promise<boolean> {
  return (await blobHash(p.blob)) === p.sha256;
}


/** v1 -> v2 format upgrade for already-sealed photos; each is hash-checked before it replaces the old row. */
export async function encryptLegacyPhotos(db: DowntimeDB): Promise<number> {
  const key = keyFor(db);
  if (!key) return 0;
  let done = 0;
  for (const row of await rawPhotos(db)) {
    if (!isSealedPhoto(row) || (row._enc.v === 2 && row._bytes.v === 2)) continue;
    const open = await openPhoto(key, row);
    if (!(await verifyPhoto(open))) throw new Error(`Photo ${row.ref} did not match its saved hash. It was left as it was.`);
    const sealed = await sealPhoto(key, open);
    if (!(await verifyPhoto(await openPhoto(key, sealed)))) throw new Error(`Photo ${row.ref} check failed after upgrade. It was left as it was.`);
    await photoDb(db).photos.put(sealed);
    done++;
  }
  return done;
}
