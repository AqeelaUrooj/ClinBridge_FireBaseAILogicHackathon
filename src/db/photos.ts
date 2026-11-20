import Dexie from 'dexie';
import type { Dataset, DowntimeDB } from './db';
import { buildAuditRow } from './audit';
import type { Clock } from '../lib/time';

/**
 * Local photo store for paper-form photos (the source the nurse transcribes from).
 * The 19-table schema keeps only the reference (entry.raw_input_ref, e.g. "vault/raw/<id>.jpg"); the image
 * itself lives here, in a separate IndexedDB database per dataset. Nothing is uploaded anywhere.
 * Saved BEFORE any clinical record is created, with an audit row, so the source exists even if the nurse
 * stops halfway. Not encrypted yet (same as the rest of local storage; see KNOWN_LIMITATIONS).
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

class PhotoDB extends Dexie {
  photos!: Dexie.Table<StoredPhoto, string>;
  constructor(dataset: Dataset) {
    super(`downtimekit-${dataset}-photos`);
    this.version(1).stores({ photos: 'ref, patient_id, saved_at' });
  }
}

const open = new Map<Dataset, PhotoDB>();
export const photoDb = (dataset: Dataset): PhotoDB => {
  let p = open.get(dataset);
  if (!p) { p = new PhotoDB(dataset); open.set(dataset, p); }
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
  await photoDb(db.dataset).photos.add(row);
  const last = await db.audit_log.orderBy('seq').last();
  const audit = await buildAuditRow({ last, time: row.saved_at, userId: actor.userId, deviceId: actor.deviceId, action: 'photo_saved', entity: ref, after: { patient_id: patientId, sha256, size: blob.size, type: blob.type } });
  await db.audit_log.add(audit);
  return row;
}

export const getPhoto = (dataset: Dataset, ref: string) => photoDb(dataset).photos.get(ref);
export const clearPhotos = (dataset: Dataset) => photoDb(dataset).photos.clear();

/** Re-hash a stored photo and compare with the hash saved at capture time. */
export async function verifyPhoto(p: StoredPhoto): Promise<boolean> {
  return (await blobHash(p.blob)) === p.sha256;
}

