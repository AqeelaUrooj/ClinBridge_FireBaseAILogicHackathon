import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { DowntimeDB, DB_VERSION, V1_STORES } from './db';
import { TABLE_NAMES, type Entry } from './schema';
import { backupDb, openWithMigration } from './backup';
import { verifyChain } from './audit';
import { importPracticeSeed } from './seed';
import { createEntry, markEnteredInError } from './repos/entries';
import { practiceClock } from '../lib/time';

const clock = practiceClock();

/** Build a version-1 database exactly as development builds created it, including legacy reasons in `confirmed`. */
async function makeV1(name: string) {
  const seeded = new DowntimeDB('practice', `${name}-src`);
  await importPracticeSeed(seeded);
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLE_NAMES) tables[t] = await seeded.table(t).toArray();
  seeded.close();

  const v1 = new Dexie(name);
  v1.version(1).stores(V1_STORES);
  await v1.open();
  await v1.transaction('rw', v1.tables, async () => {
    for (const t of TABLE_NAMES) await v1.table(t).bulkAdd(tables[t]!);
    // A correction and a mistake written the old (pre-v2) way.
    await v1.table('entry').update('e-041', { confirmed: { ...(tables.entry as Entry[]).find((e) => e.id === 'e-041')!.confirmed, correction: { reason: 'Pulse and breathing swapped' } } });
    await v1.table('entry').update('e-042', { confirmed: { glucose_mgdl: 231, entered_in_error: { reason: 'Wrong patient' } } });
  });
  const before = { entries: (await v1.table('entry').toArray()) as Entry[], audit: await v1.table('audit_log').count() };
  v1.close();
  return before;
}

describe('DB v2 migration: entry.change_reason (P-02)', () => {
  it('keeps the final 19-table schema', () => {
    expect(TABLE_NAMES).toHaveLength(19);
    expect(DB_VERSION).toBe(3);
  });

  it('backs up, copies every legacy reason, changes nothing else, and keeps the audit chain valid', async () => {
    const name = `mig-${crypto.randomUUID()}`;
    const before = await makeV1(name);

    const db = new DowntimeDB('practice', name);
    const res = await openWithMigration(db, clock, 'dev-01');
    expect(res.migrated).toBe(true);
    expect(res.backupId).not.toBeNull();
    expect(db.verno).toBe(3); // v1 → v2 (reasons) → v3 (admission lifecycle) in one open

    const after = await db.entry.toArray();
    expect(after).toHaveLength(before.entries.length);
    expect(after.find((e) => e.id === 'e-041')!.change_reason).toBe('Pulse and breathing swapped');
    expect(after.find((e) => e.id === 'e-042')!.change_reason).toBe('Wrong patient');

    // Nothing else changed: every original field is identical, and the original confirmed values are untouched.
    for (const old of before.entries) {
      const { change_reason, ...rest } = after.find((e) => e.id === old.id)!;
      expect(rest).toEqual(old);
      if (!['e-041', 'e-042'].includes(old.id)) expect(change_reason).toBeNull();
    }
    // History kept: old version still corrected and linked.
    expect(after.find((e) => e.id === 'e-040')!.status).toBe('corrected');
    expect(after.find((e) => e.id === 'e-041')!.supersedes_id).toBe('e-040');

    // One audit row added, chain still verifies.
    const audit = await db.audit_log.orderBy('seq').toArray();
    expect(audit).toHaveLength(before.audit + 1);
    expect(audit.at(-1)!.action).toBe('schema_migrated');
    expect((await verifyChain(audit)).ok).toBe(true);

    // The backup holds the full v1 data, including the legacy reasons.
    const b = backupDb();
    const backup = await b.backups.get(res.backupId!);
    b.close();
    expect(backup!.from_version).toBe(1);
    expect(backup!.tables.entry).toHaveLength(before.entries.length);
    expect(JSON.stringify(backup!.tables.entry)).toContain('Pulse and breathing swapped');
    db.close();
  });

  it('v2 → v3 (admission lifecycle): backup first, no row changed, one audit row, chain valid; old patients read as active list patients', async () => {
    const name = `mig3-${crypto.randomUUID()}`;
    const seeded = new DowntimeDB('practice', `${name}-src`);
    await importPracticeSeed(seeded);
    const tables: Record<string, unknown[]> = {};
    for (const t of TABLE_NAMES) tables[t] = await seeded.table(t).toArray();
    seeded.close();
    const v2 = new Dexie(name);
    v2.version(2).stores(V1_STORES);
    await v2.open();
    await v2.transaction('rw', v2.tables, async () => { for (const t of TABLE_NAMES) await v2.table(t).bulkAdd(tables[t]!); });
    v2.close();
    const db = new DowntimeDB('practice', name);
    const res = await openWithMigration(db, clock, 'dev-01');
    expect(res.migrated).toBe(true);
    expect(res.backupId).not.toBeNull();
    for (const t of TABLE_NAMES) expect(await db.table(t).toArray(), t).toEqual(t === 'audit_log' ? [...tables[t]!, expect.objectContaining({ action: 'schema_migrated' })] : tables[t]);
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
    expect((await db.encounter.toArray()).every((e) => e.status === undefined)).toBe(true); // absent = active stay from the list
    db.close();
  });

  it('a new database needs no backup and no migration row', async () => {
    const db = new DowntimeDB('practice', `fresh-${crypto.randomUUID()}`);
    const res = await openWithMigration(db, clock, 'dev-01');
    expect(res).toEqual({ backupId: null, migrated: false });
    db.close();
  });

  it('after v2, fixes and mistakes write change_reason and require it', async () => {
    const db = new DowntimeDB('practice', `v2-${crypto.randomUUID()}`);
    await importPracticeSeed(db);
    const actor = { userId: 'pr-okafor', deviceId: 'dev-01' };
    const vit = { temp_c: 37, heart_rate: 80, resp_rate: 16, bp_systolic: 120, bp_diastolic: 80, spo2: 97, o2_device: null, o2_flow_lpm: null, pain_0_10: 0, glucose_mgdl: null, consciousness: null, weight_kg: null, raw_text: null };
    const first = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-01', careTime: clock.nowIso(), values: vit });
    await expect(createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-01', careTime: first.care_time, values: vit, supersedesId: first.id })).rejects.toThrow(/reason/);
    const fixed = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-01', careTime: first.care_time, values: { ...vit, heart_rate: 82 }, supersedesId: first.id, correctionReason: ' typo ' });
    expect(fixed.change_reason).toBe('typo');
    expect(fixed.confirmed).not.toHaveProperty('correction');
    expect((await db.entry.get(first.id))!.change_reason).toBeNull(); // original not overwritten
    await markEnteredInError(db, clock, actor, fixed.id, 'wrong patient');
    expect((await db.entry.get(fixed.id))!.change_reason).toBe('wrong patient');
    db.close();
  });
});
