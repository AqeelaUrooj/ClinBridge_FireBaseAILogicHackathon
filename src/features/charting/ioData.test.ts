import { describe, expect, it } from 'vitest';
import type { Entry, SnapshotResult } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { dayRows, dayTotals, hospitalTotals, hourly, otherRows, signedMl, stepVolume } from './ioData';

const io = (id: string, time: string, direction: 'in' | 'out', volume_ml: number, over: Partial<Entry> = {}) => ({
  entry: {
    id, type: 'intake_output', patient_id: 'p1', encounter_id: 'e1', care_time: `2026-11-14T${time}:00-05:00`, entry_time: `2026-11-14T${time}:00-05:00`, counter: 1,
    device_id: 'd', performer_id: 'n', raw_input_kind: 'typed', raw_input_ref: '', status: 'confirmed', ...over,
  },
  child: { id: `c-${id}`, entry_id: id, direction, category: direction === 'in' ? 'oral' : 'urine', volume_ml },
}) as unknown as EntryWithChild;
const DAY = '2026-11-14';
const items = [
  io('a', '05:10', 'out', 350), io('b', '09:30', 'in', 240), io('c', '10:15', 'out', 420),
  io('draft', '11:00', 'in', 999, { status: 'draft' }), io('old', '08:00', 'in', 500, { status: 'corrected' }), io('bad', '08:10', 'in', 700, { status: 'entered-in-error' }),
  io('yesterday', '09:00', 'in', 111, { care_time: '2026-11-13T09:00:00-05:00' }), io('other', '09:00', 'in', 222, { patient_id: 'p2' }),
];

describe('intake and output page data', () => {
  it('lists today’s confirmed and draft records, newest first, and counts confirmed only', () => {
    const rows = dayRows(items, 'p1', DAY);
    expect(rows.map((r) => r.item.entry.id)).toEqual(['draft', 'c', 'b', 'a']);
    expect(dayTotals(rows)).toEqual({ totalIn: 240, totalOut: 770, balance: -530 });
  });

  it('keeps every other record of this patient in the second list, and none of another patient', () => {
    expect(otherRows(items, 'p1', DAY).map((x) => x.entry.id)).toEqual(['old', 'bad', 'yesterday']);
  });

  it('sums by hour with a running balance that ends at the day balance', () => {
    const h = hourly(dayRows(items, 'p1', DAY));
    expect(h).toHaveLength(24);
    expect(h[5]).toMatchObject({ totalOut: 350, running: -350, records: 1 });
    expect(h[9]).toMatchObject({ totalIn: 240, running: -110 });
    expect(h[11]).toMatchObject({ totalIn: 0, records: 0 }); // the draft is not counted
    expect(h[23]!.running).toBe(-530);
  });

  it('shows the hospital 24-hour totals only as a pair, in mL, from the same time', () => {
    const r = (code: string, value_num: number, over: Partial<SnapshotResult> = {}): SnapshotResult => ({ id: code, patient_id: 'p1', kind: 'io', code, name: code, value_num, unit: 'mL', time: '2026-11-14T00:00:00-05:00', ...over });
    expect(hospitalTotals([r('9262-7', 1850), r('8985-4', 1420)], 'p1')).toMatchObject({ totalIn: 1420, totalOut: 1850, balance: -430 });
    expect(hospitalTotals([r('9262-7', 1850)], 'p1')).toBeNull();
    expect(hospitalTotals([r('9262-7', 1850), r('8985-4', 1420, { time: '2026-11-13T00:00:00-05:00' })], 'p1')).toBeNull();
    expect(hospitalTotals([r('9262-7', 1850), r('8985-4', 1.42, { unit: 'L' })], 'p1')).toBeNull();
    expect(hospitalTotals([r('9262-7', 1850), r('8985-4', 1420, { patient_id: 'p2' })], 'p1')).toBeNull();
  });

  it('writes signed amounts and steps a typed amount by 50 mL without ever starting one', () => {
    expect([signedMl(-530), signedMl(0), signedMl(800)]).toEqual(['−530', '0', '+800']);
    expect(stepVolume('200', 1)).toBe('250');
    expect(stepVolume('200', -1)).toBe('150');
    for (const v of ['', 'abc', '-5', '1.5']) expect(stepVolume(v, 1)).toBeNull();
    expect(stepVolume('50', -1)).toBeNull();
    expect(stepVolume('99999', 1)).toBeNull();
  });
});
