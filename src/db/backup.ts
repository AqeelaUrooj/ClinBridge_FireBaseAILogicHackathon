import Dexie from 'dexie';
import { buildAuditRow } from './audit';
import { DB_VERSION, pendingMigrationNotes, type DowntimeDB } from './db';
import type { Clock } from '../lib/time';

/**
 * Safety copy before a schema upgrade.
 * If the database on this laptop is older than the code's schema, every table is copied into a separate
 * IndexedDB database (downtimekit-backups) BEFORE Dexie runs the upgrade. Nothing is sent anywhere.
 * Dexie stores version N as IndexedDB version N × 10.
 */
export interface SchemaBackup {
  id?: number;
  db_name: string;
  from_version: number;
  to_version: number;
  taken_at: string;
  tables: Record<string, unknown[]>;
}

class BackupDB extends Dexie {
  backups!: Dexie.Table<SchemaBackup, number>;
  constructor() {
    super('downtimekit-backups');
    this.version(1).stores({ backups: '++id, db_name, taken_at' });
  }
}

export const backupDb = () => new BackupDB();

function rawOpen(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAll(db: IDBDatabase): Promise<Record<string, unknown[]>> {
  const names = Array.from(db.objectStoreNames);
  if (names.length === 0) return Promise.resolve({});
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readonly');
    const out: Record<string, unknown[]> = {};
    for (const n of names) {
      const req = tx.objectStore(n).getAll();
      req.onsuccess = () => { out[n] = req.result; };
    }
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}

/** Returns the backup id if one was made, else null (new database or already current). */
export async function backupBeforeUpgrade(name: string, nowIso: string): Promise<number | null> {
  if (!(await Dexie.exists(name))) return null;
  const raw = await rawOpen(name);
  try {
    const fromVersion = Math.floor(raw.version / 10);
    if (fromVersion >= DB_VERSION || fromVersion < 1) return null;
    const tables = await readAll(raw);
    const b = backupDb();
    try {
      return await b.backups.add({ db_name: name, from_version: fromVersion, to_version: DB_VERSION, taken_at: nowIso, tables });
    } finally {
      b.close();
    }
  } finally {
    raw.close();
  }
}

/** Open with backup first, then write one audit row describing the migration (if one ran). */
export async function openWithMigration(db: DowntimeDB, clock: Clock, deviceId: string): Promise<{ backupId: number | null; migrated: boolean }> {
  const backupId = await backupBeforeUpgrade(db.name, clock.nowIso());
  await db.open();
  const note = pendingMigrationNotes.get(db.name);
  if (!note) return { backupId, migrated: false };
  pendingMigrationNotes.delete(db.name);
  if ((await db.audit_log.count()) > 0) {
    const last = await db.audit_log.orderBy('seq').last();
    const row = await buildAuditRow({
      last, time: clock.nowIso(), userId: 'system', deviceId, action: 'schema_migrated', entity: 'database',
      after: { to_version: note.toVersion, reasons_copied: note.reasonsCopied, backup_id: backupId },
    });
    await db.audit_log.add(row);
  }
  return { backupId, migrated: true };
}

/**
 * Restore a safety copy into an EMPTY database (never over existing records). Used to prove backups are
 * usable; not exposed in the app until the backup/encryption decision (P-04) is made.
 */
export async function restoreSafetyCopy(copy: SchemaBackup, target: DowntimeDB): Promise<void> {
  const counts = await Promise.all(target.tables.map((t) => t.count()));
  if (counts.some((c) => c > 0)) throw new Error('Target database is not empty. Restore only into an empty database.');
  await target.transaction('rw', target.tables, async () => {
    for (const [name, rows] of Object.entries(copy.tables)) {
      if (!target.tables.some((t) => t.name === name)) continue;
      await target.table(name).bulkAdd(rows as object[]);
    }
  });
}
