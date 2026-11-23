import { describe, expect, it } from 'vitest';
import type { Entry, SnapshotResult } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { hospitalLabs, inLabTab, labRows, listRange } from './labData';

const T = (hm: string) => `2026-11-14T${hm}:00-05:00`;
const rec = (id: string, time: string, type: Entry['type'], child: Record<string, unknown>, over: Partial<Entry> = {}) => ({
  entry: { id, type, patient_id: 'p1', care_time: T(time), entry_time: T(time), status: 'confirmed', ...over } as Entry, child: { id: `c${id}`, entry_id: id, ...child },
}) as unknown as EntryWithChild;

describe('lab rows', () => {
  const rows = labRows([
    rec('a', '06:00', 'lab_event', { test_name: 'BMP', status: 'collected' }), rec('b', '08:20', 'lab_event', { test_name: 'Potassium', status: 'critical', value_num: 6.2, unit: 'mmol/L' }),
    rec('c', '12:00', 'lab_event', { test_name: 'aPTT', status: 'pending' }), rec('d', '11:00', 'lab_event', { test_name: 'Culture', status: 'resulted', value_text: 'no growth' }),
    rec('e', '11:30', 'vital_sign', { glucose_mgdl: 196 }), rec('f', '11:40', 'vital_sign', { heart_rate: 80 }),
    rec('old', '13:00', 'lab_event', { test_name: 'BMP', status: 'resulted', value_num: 1 }, { status: 'corrected' }), rec('bad', '13:00', 'lab_event', { test_name: 'BMP', status: 'critical', value_num: 9 }, { status: 'entered-in-error' }),
  ]);
  it('puts the critical result first, then newest first, and leaves out old versions, mistakes and vitals without blood sugar', () => {
    expect(rows.map((r) => r.entry.id)).toEqual(['b', 'c', 'e', 'd', 'a']);
  });
  it('shows values as stored; a record without a result has none', () => {
    expect(Object.fromEntries(rows.map((r) => [r.entry.id, r.value]))).toEqual({ a: null, b: '6.2 mmol/L', c: null, d: 'no growth', e: '196 mg/dL' });
  });
  it('tabs: every lab record is in exactly one status tab', () => {
    const n = (t: Parameters<typeof inLabTab>[1]) => rows.filter((r) => inLabTab(r, t)).length;
    expect([n('all'), n('critical'), n('collected'), n('pending'), n('resulted'), n('glucose')]).toEqual([5, 1, 1, 1, 1, 1]);
  });
  it('a zero result is a result', () => {
    expect(labRows([rec('z', '01:00', 'lab_event', { test_name: 'x', status: 'resulted', value_num: 0, unit: 'g' })])[0]!.value).toBe('0 g');
  });
});

describe('hospital list', () => {
  const r = (over: Partial<SnapshotResult>): SnapshotResult => ({ id: 'i', patient_id: 'p', kind: 'lab', name: 'Potassium', time: T('03:00'), ...over });
  it('keeps labs only, newest first, with the range as printed there', () => {
    expect(hospitalLabs([r({ id: 'old', time: T('01:00') }), r({ id: 'v', kind: 'vital' }), r({ id: 'new' })]).map((x) => x.id)).toEqual(['new', 'old']);
    expect(listRange(r({ range_low: 3.5, range_high: 5.1 }))).toBe('3.5 – 5.1');
    expect(listRange(r({ range_low: 0, range_high: 5 }))).toBe('0 – 5');
    expect(listRange(r({ range_low: 3.5 }))).toBeNull();
  });
});
