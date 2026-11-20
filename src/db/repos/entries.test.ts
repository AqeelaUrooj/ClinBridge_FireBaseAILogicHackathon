import { beforeEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db';
import { importPracticeSeed, PRACTICE_PIN } from '../seed';
import { verifyChain } from '../audit';
import { createEntry, getEntry, listPatientEntries, markEnteredInError, versionChain } from './entries';
import { practiceClock } from '../../lib/time';
import { verifyPin } from '../../lib/crypto';

let db: DowntimeDB;
const clock = practiceClock();
const actor = { userId: 'pr-okafor', deviceId: 'dev-01' };
const vitals = { temp_c: 36.9, heart_rate: 80, resp_rate: 16, bp_systolic: 128, bp_diastolic: 78, spo2: 97, o2_device: null, o2_flow_lpm: null, pain_0_10: 1, glucose_mgdl: null, consciousness: 'Alert', weight_kg: null, raw_text: null };

beforeEach(async () => {
  db = new DowntimeDB('practice', `test-${crypto.randomUUID()}`);
  await importPracticeSeed(db);
});

describe('practice seed import', () => {
  it('loads all 19 tables and drops non-schema fields', async () => {
    expect(await db.patient.count()).toBe(10);
    expect(await db.audit_log.count()).toBe(153);
    const order = await db.active_order.get('ord-01');
    expect(order && 'route_snomed' in order).toBe(false);
    const ev = await db.downtime_event.toArray();
    expect(ev[0] && 'note' in ev[0]).toBe(false);
  });
  it('gives practice staff a real hash of the practice PIN', async () => {
    const p = await db.practitioner.get('pr-park');
    expect(await verifyPin(PRACTICE_PIN, p!.pin_hash)).toBe(true);
    expect(await verifyPin('1111', p!.pin_hash)).toBe(false);
  });
  it('refuses to load fake data into the live dataset', async () => {
    const live = new DowntimeDB('live', `test-live-${crypto.randomUUID()}`);
    await expect(importPracticeSeed(live)).rejects.toThrow(/Practice/);
  });
});

describe('append-only entries', () => {
  it('saves an entry, its child row and chained audit rows together', async () => {
    const e = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-01', careTime: clock.nowIso(), values: vitals });
    expect(e.status).toBe('confirmed');
    expect(e.encounter_id).toBe('enc-01');
    expect(e.care_time).not.toBeUndefined();
    const got = await getEntry(db, e.id);
    expect((got!.child as { heart_rate: number }).heart_rate).toBe(80);
    const chain = await verifyChain(await db.audit_log.toArray());
    expect(chain.ok).toBe(true);
    expect(chain.total).toBe(155);
  });

  it('keeps care time and entry time separate', async () => {
    const e = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-01', careTime: '2026-11-14T12:00:00-05:00', values: vitals });
    expect(e.care_time).toBe('2026-11-14T12:00:00-05:00');
    expect(e.entry_time).not.toBe(e.care_time);
  });

  it('correction creates a new version and preserves the original values', async () => {
    const first = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-06', careTime: clock.nowIso(), values: { ...vitals, heart_rate: 18 } });
    const fixed = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-06', careTime: first.care_time, values: { ...vitals, heart_rate: 78 }, supersedesId: first.id, correctionReason: 'Typing mistake' });
    const old = await getEntry(db, first.id);
    expect(old!.entry.status).toBe('corrected');
    expect((old!.child as { heart_rate: number }).heart_rate).toBe(18);
    expect((old!.entry.confirmed as { heart_rate: number }).heart_rate).toBe(18);
    expect(fixed.supersedes_id).toBe(first.id);
    const versions = await versionChain(db, first.id);
    expect(versions.map((v) => v.entry.id)).toEqual([first.id, fixed.id]);
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
  });

  it('refuses to correct a record twice or across patients', async () => {
    const first = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-06', careTime: clock.nowIso(), values: vitals });
    await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-06', careTime: first.care_time, values: vitals, supersedesId: first.id, correctionReason: 'x' });
    await expect(createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-06', careTime: first.care_time, values: vitals, supersedesId: first.id, correctionReason: 'x' })).rejects.toThrow(/confirmed/);
    const other = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-01', careTime: clock.nowIso(), values: vitals });
    await expect(createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-02', careTime: clock.nowIso(), values: vitals, supersedesId: other.id, correctionReason: 'x' })).rejects.toThrow(/same patient/);
  });

  it('marks a record as entered in error without deleting it', async () => {
    const e = await createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-10', careTime: clock.nowIso(), values: vitals });
    await markEnteredInError(db, clock, actor, e.id, 'Wrong patient');
    const got = await getEntry(db, e.id);
    expect(got!.entry.status).toBe('entered-in-error');
    expect((got!.child as { heart_rate: number }).heart_rate).toBe(80);
  });

  it('serialises parallel writes so the audit chain stays intact', async () => {
    await Promise.all([1, 2, 3, 4, 5].map((i) => createEntry(db, clock, actor, { type: 'vital_sign', patientId: 'pt-01', careTime: clock.nowIso(), values: { ...vitals, heart_rate: 70 + i } })));
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
    const list = await listPatientEntries(db, 'pt-01');
    const counters = list.map((x) => x.entry.counter);
    expect(new Set(counters).size).toBe(counters.length);
  });
});
