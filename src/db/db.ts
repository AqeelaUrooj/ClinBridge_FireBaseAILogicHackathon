import Dexie, { type Table } from 'dexie';
import { encryptionMiddleware, setVaultMode } from './encryption';
import { PUBLIC_DEMO } from '../config/publicDemo';
import type {
  ActiveOrder, Allergy, AuditLog, Device, DowntimeEvent, Encounter, Entry, Handoff, IntakeOutput,
  KeyStore, LabEvent, MedAdmin, Note, Patient, Practitioner, Snapshot, SnapshotResult, VitalSign, WorklistItem,
} from './schema';

/**
 * Two separate IndexedDB databases keep Practice data apart from real clinical records:
 *  - downtimekit-practice: loaded from the synthetic seed file, can be reset any time
 *  - downtimekit-live:     starts empty; filled only by first-time setup + snapshot import
 * Laravel analogy: one Dexie class = one database connection; each Table is like an Eloquent model's table.
 */
export type Dataset = 'practice' | 'live';

/** Index definitions of DB version 1 (the final 19-table schema). Exported so migration tests can build a v1 database. */
export const V1_STORES: Record<string, string> = {
  snapshot: 'id, taken_at',
  patient: 'id, mrn',
  encounter: 'id, patient_id',
  allergy: 'id, patient_id',
  active_order: 'id, encounter_id',
  snapshot_result: 'id, patient_id, time',
  practitioner: 'id',
  device: 'id',
  downtime_event: 'id, declared_at',
  entry: 'id, patient_id, encounter_id, care_time, status, supersedes_id, [device_id+counter]',
  vital_sign: 'id, &entry_id',
  med_admin: 'id, &entry_id, order_id',
  intake_output: 'id, &entry_id',
  note: 'id, &entry_id',
  lab_event: 'id, &entry_id, order_id',
  worklist_item: 'id, entry_id, patient_id, priority',
  handoff: 'id, patient_id',
  audit_log: 'id, &seq',
  key_store: 'id',
};
export const DB_VERSION = 3;

/** Reason stored the pre-v2 way (inside entry.confirmed) during development. Read-only helper. */
export function legacyReason(e: Pick<Entry, 'confirmed'>): string | null {
  const c = (e.confirmed ?? null) as { correction?: { reason?: unknown }; entered_in_error?: { reason?: unknown } } | null;
  const r = c?.correction?.reason ?? c?.entered_in_error?.reason;
  return typeof r === 'string' && r.trim() ? r.trim() : null;
}

/** Filled by an upgrade; read once after open to write the audit row (Web Crypto cannot run inside an upgrade). */
export const pendingMigrationNotes = new Map<string, { toVersion: number; reasonsCopied: number }>();

export class DowntimeDB extends Dexie {
  snapshot!: Table<Snapshot, string>;
  patient!: Table<Patient, string>;
  encounter!: Table<Encounter, string>;
  allergy!: Table<Allergy, string>;
  active_order!: Table<ActiveOrder, string>;
  snapshot_result!: Table<SnapshotResult, string>;
  practitioner!: Table<Practitioner, string>;
  device!: Table<Device, string>;
  downtime_event!: Table<DowntimeEvent, string>;
  entry!: Table<Entry, string>;
  vital_sign!: Table<VitalSign, string>;
  med_admin!: Table<MedAdmin, string>;
  intake_output!: Table<IntakeOutput, string>;
  note!: Table<Note, string>;
  lab_event!: Table<LabEvent, string>;
  worklist_item!: Table<WorklistItem, string>;
  handoff!: Table<Handoff, string>;
  audit_log!: Table<AuditLog, string>;
  key_store!: Table<KeyStore, string>;

  constructor(public readonly dataset: Dataset, name = `downtimekit-${dataset}`) {
    super(name);
    if (PUBLIC_DEMO && dataset !== 'practice') throw new Error('The public demo has fictional Practice records only.');
    // Version 1 = final 19-table schema. Never edit a released version; add a new one for each migration.
    this.version(1).stores(V1_STORES);
    // Version 2 (P-02, approved): adds optional entry.change_reason. No new table, no index change, still 19 tables.
    // Additive and lossless: copies any reason captured during development (kept inside entry.confirmed before v2)
    // into change_reason and leaves the original entry values untouched.
    this.version(2).stores({}).upgrade(async (tx) => {
      let copied = 0;
      await tx.table('entry').toCollection().modify((e: Entry) => {
        if (e.change_reason) return;
        const legacy = legacyReason(e);
        e.change_reason = legacy;
        if (legacy) copied++;
      });
      pendingMigrationNotes.set(this.name, { toVersion: 2, reasonsCopied: copied });
    });
    // Version 3 (admission lifecycle, approved 26 Nov 2026): optional patient and stay fields, Admission Staff role.
    // No new table, no index change, no row is rewritten. Dexie 4 still opens a database that a NEWER build upgraded,
    // so from this version on openWithMigration (backup.ts) refuses a database whose version is above DB_VERSION.
    // Builds before version 3 do not have that check: never roll the website back to one (docs/ADMISSION_ARCHITECTURE.md).
    this.version(3).stores({}).upgrade(() => {
      const fromV2 = pendingMigrationNotes.get(this.name); // a v1 database runs both upgrades in one open
      pendingMigrationNotes.set(this.name, { toVersion: 3, reasonsCopied: fromV2?.reasonsCopied ?? 0 });
    });
    // Encryption at rest (P-04): index fields stay plain, the rest of each row is AES-256-GCM. See encryption.ts.
    this.use(encryptionMiddleware(this.name, V1_STORES));
  }
}

const open = new Map<string, DowntimeDB>();

export function getDb(dataset: Dataset): DowntimeDB {
  let db = open.get(dataset);
  if (!db) {
    db = new DowntimeDB(dataset);
    // Fail closed: nothing can be read or written until boot has checked the vault (vault.ts detectVault).
    setVaultMode(db.name, { mode: 'pending' });
    open.set(dataset, db);
  }
  return db;
}

/** Ask the browser not to evict our data under storage pressure (worst case A6). */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not available in this browser */
  }
  return null;
}
