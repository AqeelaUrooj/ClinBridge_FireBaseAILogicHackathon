import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { DowntimeDB, V1_STORES } from './db';
import { TABLE_NAMES } from './schema';
import { importPracticeSeed } from './seed';
import { verifyChain } from './audit';
import { backupBeforeUpgrade, backupDb, openWithMigration, restoreSafetyCopy } from './backup';
import { createEntry, confirmDraft } from './repos/entries';
import { createHandoff } from './repos/handoff';
import { buildWorklist } from './repos/worklist';
import { prepareExport, recordExport } from './repos/export';
import { practiceClock, toIsoWithOffset, type Clock } from '../lib/time';
import { flagEntry } from '../lib/recovery';

let db: DowntimeDB;
const clock = practiceClock();
const nurse = { userId: 'pr-okafor', deviceId: 'dev-01' };
const vit = { temp_c: 36.8, heart_rate: 80, resp_rate: 16, bp_systolic: 120, bp_diastolic: 80, spo2: 97, o2_device: null, o2_flow_lpm: null, pain_0_10: 0, glucose_mgdl: null, consciousness: null, weight_kg: null, raw_text: null };
const snapshotAll = async (d: Dexie) => Object.fromEntries(await Promise.all(TABLE_NAMES.map(async (t) => [t, await d.table(t).toArray()])));
const quota = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));

beforeEach(async () => { db = new DowntimeDB('practice', `rel-${crypto.randomUUID()}`); await importPracticeSeed(db); });

describe('interrupted IndexedDB transactions', () => {
  it('a failure while writing the child row leaves no entry, no audit row and no counter gap', async () => {
    const before = await snapshotAll(db);
    const table = db.table('vital_sign');
    const realAdd = table.add.bind(table);
    table.add = (() => Promise.reject(new Error('disk hiccup'))) as unknown as typeof table.add;
    await expect(createEntry(db, clock, nurse, { type: 'vital_sign', patientId: 'pt-01', careTime: clock.nowIso(), values: vit })).rejects.toThrow();
    expect(await snapshotAll(db)).toEqual(before);
    table.add = realAdd;
    const e = await createEntry(db, clock, nurse, { type: 'vital_sign', patientId: 'pt-01', careTime: clock.nowIso(), values: vit });
    const maxBefore = Math.max(...(before.entry as { device_id: string; counter: number }[]).filter((x) => x.device_id === 'dev-01').map((x) => x.counter));
    expect(e.counter).toBe(maxBefore + 1);
    expect((await verifyChain(await db.audit_log.orderBy('seq').toArray())).ok).toBe(true);
  });
  it('a correction that fails half-way does not mark the old version as corrected', async () => {
    const first = await createEntry(db, clock, nurse, { type: 'vital_sign', patientId: 'pt-01', careTime: clock.nowIso(), values: vit });
    const audit = db.audit_log;
    const realBulk = audit.bulkAdd.bind(audit);
    audit.bulkAdd = (() => Promise.reject(new Error('aborted'))) as unknown as typeof audit.bulkAdd;
    await expect(createEntry(db, clock, nurse, { type: 'vital_sign', patientId: 'pt-01', careTime: first.care_time, values: { ...vit, heart_rate: 90 }, supersedesId: first.id, correctionReason: 'typo' })).rejects.toThrow();
    audit.bulkAdd = realBulk;
    expect((await db.entry.get(first.id))!.status).toBe('confirmed');
    expect(await db.entry.where('supersedes_id').equals(first.id).count()).toBe(0);
  });
  it('a failed draft confirmation keeps the draft as a draft; a failed handover save adds nothing', async () => {
    const t = db.table('vital_sign');
    const realPut = t.put.bind(t);
    t.put = (() => Promise.reject(new Error('aborted'))) as unknown as typeof t.put;
    await expect(confirmDraft(db, clock, nurse, 'e-048', 'vital_sign', vit)).rejects.toThrow();
    t.put = realPut;
    expect((await db.entry.get('e-048'))!.status).toBe('draft');
    const h = db.handoff;
    const realAdd = h.add.bind(h);
    const n = await h.count();
    h.add = (() => Promise.reject(new Error('aborted'))) as unknown as typeof h.add;
    await expect(createHandoff(db, clock, nurse, { patientId: 'pt-09', shift: 's', situation: 's', background: 'b', assessment: 'a', openItems: [], sourceEntryIds: [] })).rejects.toThrow();
    h.add = realAdd;
    expect(await h.count()).toBe(n);
    expect((await verifyChain(await db.audit_log.orderBy('seq').toArray())).ok).toBe(true);
  });
});

describe('storage quota exhaustion', () => {
  it('a full disk gives a plain message, saves nothing, and the next save works when space is back', async () => {
    const before = await db.entry.count();
    const realAdd = db.entry.add.bind(db.entry);
    db.entry.add = quota as unknown as typeof db.entry.add;
    await expect(createEntry(db, clock, nurse, { type: 'vital_sign', patientId: 'pt-01', careTime: clock.nowIso(), values: vit })).rejects.toThrow(/storage is full/i);
    db.entry.add = realAdd;
    expect(await db.entry.count()).toBe(before);
    await createEntry(db, clock, nurse, { type: 'vital_sign', patientId: 'pt-01', careTime: clock.nowIso(), values: vit });
    expect(await db.entry.count()).toBe(before + 1);
  });
});

describe('failed migrations', () => {
  it('an upgrade that throws leaves the old database and data untouched, and a later good upgrade works', async () => {
    const name = `mig-fail-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(V1_STORES);
    await v1.open();
    await v1.table('entry').add({ id: 'e-x', patient_id: 'p', encounter_id: 'n', care_time: '2026-11-14T10:00:00-05:00', status: 'confirmed', device_id: 'dev-01', counter: 1, confirmed: { correction: { reason: 'kept' } } });
    v1.close();
    class Broken extends Dexie {
      constructor() { super(name); this.version(1).stores(V1_STORES); this.version(2).stores({}).upgrade(() => { throw new Error('upgrade bug'); }); }
    }
    const broken = new Broken();
    await expect(broken.open()).rejects.toThrow();
    broken.close();
    const check = new Dexie(name);
    await check.open();
    expect(check.verno).toBe(1);
    expect(await check.table('entry').get('e-x')).toBeTruthy();
    check.close();
    const good = new DowntimeDB('practice', name);
    const res = await openWithMigration(good, clock, 'dev-01');
    expect(res.migrated).toBe(true);
    expect((await good.entry.get('e-x'))!.change_reason).toBe('kept');
    good.close();
  });
});

describe('backup and restore', () => {
  it('the pre-upgrade safety copy restores into an empty database with every row and a valid audit chain', async () => {
    const name = `bk-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(V1_STORES);
    await v1.open();
    const src = await snapshotAll(db);
    await v1.transaction('rw', v1.tables, async () => { for (const t of TABLE_NAMES) await v1.table(t).bulkAdd(src[t] as object[]); });
    v1.close();
    const id = await backupBeforeUpgrade(name, clock.nowIso());
    expect(id).not.toBeNull();
    const b = backupDb();
    const copy = (await b.backups.get(id!))!;
    b.close();
    const target = new DowntimeDB('practice', `restore-${crypto.randomUUID()}`);
    await target.open();
    await restoreSafetyCopy(copy, target);
    for (const t of TABLE_NAMES) expect(await target.table(t).count(), t).toBe((src[t] as unknown[]).length);
    expect((await verifyChain(await target.audit_log.orderBy('seq').toArray())).ok).toBe(true);
    await expect(restoreSafetyCopy(copy, target)).rejects.toThrow(/not empty/);
  });
});

describe('incorrect device clock', () => {
  it('a clock moved backwards keeps the counter increasing and recovery flags the time conflict', async () => {
    const back: Clock = { ...clock, now: () => clock.now() - 2 * 3_600_000, nowIso: () => toIsoWithOffset(clock.now() - 2 * 3_600_000, clock.offsetMinutes) };
    const a = await createEntry(db, clock, nurse, { type: 'note', patientId: 'pt-09', careTime: clock.nowIso(), values: { category: 'other', text: 'a', score_name: null, score_value: null } });
    const b = await createEntry(db, back, nurse, { type: 'note', patientId: 'pt-09', careTime: back.nowIso(), values: { category: 'other', text: 'b', score_name: null, score_value: null } });
    expect(b.counter).toBe(a.counter + 1);
    expect(b.entry_time < a.entry_time).toBe(true);
    const all = (await db.entry.toArray()).filter((e) => e.status === 'confirmed').map((entry) => ({ entry, child: undefined }));
    const f = flagEntry({ entry: b, child: undefined }, all, new Map());
    expect(f.flags).toContain('time_conflict');
  });
});

describe('duplicate recovery entries', () => {
  it('two worklist builds at the same moment never create two items for one record', async () => {
    await createEntry(db, clock, nurse, { type: 'note', patientId: 'pt-09', careTime: '2026-11-14T09:00:00-05:00', values: { category: 'other', text: 'x', score_name: null, score_value: null } });
    await Promise.allSettled([buildWorklist(db, clock, nurse), buildWorklist(db, clock, nurse), buildWorklist(db, clock, nurse)]);
    const items = await db.worklist_item.toArray();
    expect(new Set(items.map((i) => i.entry_id)).size).toBe(items.length);
  });
});

describe('interrupted export', () => {
  it('if recording the export fails, no item is marked exported and no audit row is written', async () => {
    const w = (await db.worklist_item.toArray()).find((x) => !x.signed_off_at)!;
    await db.worklist_item.update(w.id, { signed_off_at: clock.nowIso(), signed_off_by: 'pr-okafor' });
    const { json } = await prepareExport(db, clock);
    const seqBefore = (await db.audit_log.orderBy('seq').last())!.seq;
    const realAdd = db.audit_log.add.bind(db.audit_log);
    db.audit_log.add = (() => Promise.reject(new Error('closed'))) as unknown as typeof db.audit_log.add;
    await expect(recordExport(db, clock, nurse, json)).rejects.toThrow();
    db.audit_log.add = realAdd;
    expect((await db.worklist_item.get(w.id))!.exported_at).toBeFalsy();
    expect((await db.audit_log.orderBy('seq').last())!.seq).toBe(seqBefore);
    await recordExport(db, clock, nurse, json);
    expect((await db.worklist_item.get(w.id))!.exported_at).toBeTruthy();
  });
});
