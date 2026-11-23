import { beforeEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from '../../db/db';
import type { Entry, MedAdmin, VitalSign } from '../../db/schema';
import { importPracticeSeed } from '../../db/seed';
import { doseDifference, headlineTiles, latestMeasures, loadFacts, loadWardFacts, sortWard } from './wardData';

const NOW = '2026-11-14T13:20:00-05:00';
let db: DowntimeDB;
beforeEach(async () => { db = new DowntimeDB('practice', `ward-${crypto.randomUUID()}`); await importPracticeSeed(db); });

const vital = (id: string, care: string, v: Partial<VitalSign>, status: Entry['status'] = 'confirmed') => ({
  entry: { id, type: 'vital_sign', status, care_time: `2026-11-14T${care}:00-05:00` } as Entry, child: { id, entry_id: id, ...v } as VitalSign,
});

describe('ward and summary facts', () => {
  it('each headline value keeps its own measurement time; a newer partial record does not blank the others', () => {
    const m = latestMeasures([vital('a', '04:05', { bp_systolic: 128, bp_diastolic: 80, spo2: 98 }), vital('b', '11:30', { glucose_mgdl: 196 })]);
    expect([m.bp?.value, m.bp?.time.slice(11, 16)]).toEqual(['128/80', '04:05']);
    expect([m.bgl?.value, m.bgl?.time.slice(11, 16)]).toEqual(['196', '11:30']);
  });

  it('drafts, old versions and mistakes never appear as a current value', () => {
    const m = latestMeasures([vital('a', '04:00', { spo2: 97 }), vital('b', '05:00', { spo2: 80 }, 'draft'), vital('c', '06:00', { spo2: 70 }, 'corrected'), vital('d', '07:00', { spo2: 60 }, 'entered-in-error')]);
    expect(m.spo2?.value).toBe('97');
  });

  it('shows at most four tiles, a critical lab first, and never a score', async () => {
    const arjun = (await loadFacts(db, 'pt-03', NOW))!;
    expect(arjun.tiles.length).toBeLessThanOrEqual(4);
    expect(arjun.tiles[0]).toMatchObject({ label: 'Potassium', value: '6.2 mmol/L', tone: 'red' });
    expect(arjun.critical).toMatchObject({ calledTo: 'Dr. A. Whitaker, told by phone at 08:55', readBack: true });
    for (const r of await loadWardFacts(db, NOW)) expect(JSON.stringify([r.tiles, r.more])).not.toMatch(/news2|score|acuity/i);
  });

  it('says plainly when a recorded dose is not the ordered dose (50 mg against a 5 mg order)', async () => {
    const sam = (await loadFacts(db, 'pt-01', NOW))!;
    expect(sam.given.find((g) => g.drug === 'amLODIPine')?.differsFromOrder).toBe('Recorded 50 mg · order says 5 mg');
    expect(sam.given.find((g) => g.drug === 'metoprolol tartrate')?.differsFromOrder).toBeNull();
    expect(doseDifference({ event: 'held', dose_given: null, dose_due: 5 } as MedAdmin)).toBeNull();
    expect(doseDifference({ event: 'administered', dose_given: 5, dose_given_unit: 'mL', dose_due: 5, dose_due_unit: 'mg' } as MedAdmin)).toMatch(/5 mL · order says 5 mg/);
  });

  it('due = scheduled today with no record; every due dose belongs to the same patient', async () => {
    for (const r of await loadWardFacts(db, NOW)) {
      for (const d of r.due) {
        expect(d.order.encounter_id).toBe(r.encounter!.id);
        expect(d.time.slice(0, 10)).toBe('2026-11-14');
        const rec = r.entries.find((x) => x.entry.scheduled_time === d.time && (x.child as MedAdmin | undefined)?.order_id === d.order.id && (x.entry.status === 'confirmed' || x.entry.status === 'draft'));
        expect(rec).toBeUndefined();
      }
    }
  });

  it('never mixes patients, and reading writes nothing', async () => {
    const before = await db.audit_log.count();
    const rows = await loadWardFacts(db, NOW);
    expect(rows).toHaveLength(10);
    for (const r of rows) for (const x of r.entries) expect(x.entry.patient_id).toBe(r.patient.id);
    expect(await db.audit_log.count()).toBe(before);
    expect(await loadFacts(db, 'pt-nope', NOW)).toBeNull();
  });

  it('sorts by bed, name or oldest observation without dropping anyone', async () => {
    const rows = await loadWardFacts(db, NOW);
    expect(sortWard(rows, 'bed').map((r) => r.encounter!.bed)).toEqual(['4B', '4C', '5A', '5C', '6A', '6B', '7A', '7B', '8A', '8B']);
    expect(sortWard(rows, 'name')[0]!.patient.family_name).toBe('Bell');
    expect(sortWard(rows, 'oldest-obs')).toHaveLength(10);
  });

  it('tiles fall back to nothing when nothing is recorded', () => {
    expect(headlineTiles({}, null, { totalIn: 0, totalOut: 0, balance: 0, count: 0 }, null)).toEqual({ tiles: [], more: [] });
  });
});
