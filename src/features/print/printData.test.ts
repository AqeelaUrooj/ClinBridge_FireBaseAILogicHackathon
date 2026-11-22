import { beforeEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from '../../db/db';
import { importPracticeSeed } from '../../db/seed';
import { createHandoff } from '../../db/repos/handoff';
import { practiceClock } from '../../lib/time';
import { loadPrintData, loadWardForPrint } from './printData';

let db: DowntimeDB;
const clock = practiceClock();
const NOW = '2026-11-14T13:20:00-05:00';
beforeEach(async () => { db = new DowntimeDB('practice', `print-${crypto.randomUUID()}`); await importPracticeSeed(db); });

describe('printable forms: data comes only from the records', () => {
  it('MAR lists only this patient\'s active medicine orders, with today\'s scheduled times and what was recorded', async () => {
    const d = (await loadPrintData(db, 'pt-01', NOW))!;
    expect(d.bundle.patient.id).toBe('pt-01');
    // Nursing, lab and diet orders are not medicines: never on the MAR.
    expect(d.orders.map((o) => o.order.drug_name)).toEqual(['amLODIPine', 'metoprolol tartrate']);
    expect(d.orders.every((o) => o.order.encounter_id === d.bundle.encounter!.id)).toBe(true);
    const meto = d.orders.find((o) => o.order.drug_name === 'metoprolol tartrate')!;
    expect(meto.slots.map((s) => s.time.slice(11, 16))).toEqual(['09:00', '21:00']);
    // Every slot status comes from a real entry, or is plain "due" with no entry.
    for (const o of d.orders) for (const s of o.slots) expect(s.status === 'due' ? s.entry : s.entry?.patient_id).toBe(s.status === 'due' ? undefined : 'pt-01');
  });

  it('a medicine order that is no longer active is left off the sheet', async () => {
    const enc = (await db.encounter.where('patient_id').equals('pt-01').first())!;
    const amlo = (await db.active_order.where('encounter_id').equals(enc.id).toArray()).find((o) => o.drug_name === 'amLODIPine')!;
    await db.active_order.update(amlo.id, { status: 'discontinued' });
    const d = (await loadPrintData(db, 'pt-01', NOW))!;
    expect(d.orders.map((o) => o.order.drug_name)).toEqual(['metoprolol tartrate']);
  });

  it('recent vitals are confirmed records only, newest first, at most three', async () => {
    const d = (await loadPrintData(db, 'pt-09', NOW))!;
    expect(d.recentVitals.length).toBeLessThanOrEqual(3);
    const ids = d.recentVitals.map((r) => r.entryId);
    for (const id of ids) expect((await db.entry.get(id))?.status).toBe('confirmed');
    const times = d.recentVitals.map((r) => r.time);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('SBAR uses the newest saved handover; a patient without one gets none (blank sheet, nothing invented)', async () => {
    expect((await loadPrintData(db, 'pt-01', NOW))!.handoff).toBeUndefined();
    await createHandoff(db, clock, { userId: 'pr-okafor', deviceId: 'dev-01' }, { patientId: 'pt-09', shift: 'Day handover', situation: 'S text', background: 'B text', assessment: 'A text', openItems: ['Recheck oxygen'], sourceEntryIds: [] });
    const d = (await loadPrintData(db, 'pt-09', NOW))!;
    expect(d.handoff?.handoff.situation).toBe('S text');
    expect(d.handoff?.author).toBe('Daniel Okafor');
    expect(d.handoff?.savedAt).toBeTruthy();
  });

  it('I/O totals are today\'s confirmed records only', async () => {
    const d = (await loadPrintData(db, 'pt-01', NOW))!;
    expect(d.ioToday.day).toBe('2026-11-14');
    expect(d.ioToday.balance).toBe(d.ioToday.totalIn - d.ioToday.totalOut);
  });

  it('an unknown patient gives nothing to print', async () => {
    expect(await loadPrintData(db, 'pt-nope', NOW)).toBeNull();
  });

  it('the packet builder lists every patient in the dataset, sorted by bed', async () => {
    const ward = await loadWardForPrint(db);
    expect(ward).toHaveLength(await db.patient.count());
    const beds = ward.map((b) => b.encounter?.bed ?? '');
    expect([...beds].sort()).toEqual(beds);
  });

  it('loading print data writes nothing', async () => {
    const before = await db.audit_log.count();
    await loadPrintData(db, 'pt-09', NOW);
    await loadWardForPrint(db);
    expect(await db.audit_log.count()).toBe(before);
  });
});
