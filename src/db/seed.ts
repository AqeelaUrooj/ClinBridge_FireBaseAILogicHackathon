import type { DowntimeDB } from './db';
import { TABLE_NAMES, type TableName } from './schema';
import { hashPin } from '../lib/crypto';

/** Practice-only PIN for every synthetic staff member. Never used for the live dataset. */
export const PRACTICE_PIN = '2468';

/**
 * Fields the seed file carries that are NOT in the final schema. They are dropped on import so the
 * database matches section 8 exactly (see DECISIONS.md D-07).
 */
const NON_SCHEMA_FIELDS: Partial<Record<TableName, string[]>> = {
  active_order: ['route_snomed'],
  med_admin: ['route_snomed'],
  downtime_event: ['note'],
};

type SeedFile = Record<string, unknown> & { _meta?: unknown };

export async function loadSeedJson(): Promise<SeedFile> {
  const mod = await import('../data/downtimekit-seed.json');
  return (mod.default ?? mod) as SeedFile;
}

export interface SeedReport {
  imported: boolean;
  counts: Record<string, number>;
}

/** Load the synthetic seed into an empty Practice database. Does nothing if data is already there. */
export async function importPracticeSeed(db: DowntimeDB, seed?: SeedFile): Promise<SeedReport> {
  if (db.dataset !== 'practice') throw new Error('The synthetic seed may only be loaded into the Practice dataset.');
  const existing = await db.patient.count();
  if (existing > 0) return { imported: false, counts: {} };
  const data = seed ?? (await loadSeedJson());

  const prepared: Partial<Record<TableName, Record<string, unknown>[]>> = {};
  for (const name of TABLE_NAMES) {
    const rows = (data[name] as Record<string, unknown>[] | undefined) ?? [];
    const drop = NON_SCHEMA_FIELDS[name] ?? [];
    prepared[name] = rows.map((r) => {
      const copy = { ...r };
      for (const f of drop) delete copy[f];
      return copy;
    });
  }
  // Seed pin hashes are placeholders; give every practice user a real hash of the practice PIN.
  prepared.practitioner = await Promise.all(
    (prepared.practitioner ?? []).map(async (p) => ({ ...p, pin_hash: await hashPin(PRACTICE_PIN, 60_000) })),
  );

  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of TABLE_NAMES) {
      const rows = prepared[name] ?? [];
      if (rows.length) await db.table(name).bulkAdd(rows);
    }
  });
  const counts = Object.fromEntries(TABLE_NAMES.map((n) => [n, prepared[n]?.length ?? 0]));
  return { imported: true, counts };
}

/** Wipe the Practice dataset and load the seed again. */
export async function resetPractice(db: DowntimeDB): Promise<SeedReport> {
  if (db.dataset !== 'practice') throw new Error('Only the Practice dataset can be reset.');
  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of TABLE_NAMES) await db.table(name).clear();
  });
  return importPracticeSeed(db);
}
