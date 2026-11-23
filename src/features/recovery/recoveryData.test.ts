import { describe, expect, it } from 'vitest';
import type { WorklistItem } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { WORK_FILTERS, inFilter, lookRows, newestVersion, progress } from './recoveryData';

const item = (over: Partial<WorklistItem> = {}): WorklistItem => ({ id: 'w', entry_id: 'e', patient_id: 'p', category: 'meds', priority: 98, flags: [], ...over });

describe('second-look reading beside the record', () => {
  it('shows a tenfold dose difference, and no trailing zero', () => {
    const rows = lookRows('med_admin', { drug_name: 'amLODIPine', event: 'administered', dose_given: 50, dose_given_unit: 'mg', route: 'PO' }, { drug_name: 'amLODIPine', event: 'administered', dose_given: 5, dose_given_unit: 'mg', route: 'PO' });
    expect(rows.filter((r) => r.differs)).toEqual([{ key: 'dose_given', label: 'Dose given', record: '50 mg', reading: '5 mg', differs: true }]);
    expect(rows).toHaveLength(4);
  });
  it('a different unit is a difference', () => {
    expect(lookRows('med_admin', { dose_given: 5, dose_given_unit: 'mg' }, { dose_given: 5, dose_given_unit: 'mL' })[0]).toMatchObject({ record: '5 mg', reading: '5 mL', differs: true });
  });
  it('compares only what the reading holds, and a missing value is never "the same"', () => {
    const rows = lookRows('vital_sign', { bp_systolic: 116, bp_diastolic: 70, heart_rate: null }, { bp_diastolic: 76, heart_rate: 90 });
    expect(rows.map((r) => [r.key, r.record, r.reading, r.differs])).toEqual([['bp_diastolic', '70 mmHg', '76 mmHg', true], ['heart_rate', '—', '90 /min', true]]);
  });
  it('is empty when there is no reading', () => {
    expect(lookRows('note', { text: 'x' }, { text: 'y' })).toEqual([]);
    expect(lookRows('vital_sign', { spo2: 90 }, null)).toEqual([]);
  });
});

describe('the record as it is now', () => {
  const e = (id: string, supersedes_id?: string) => ({ entry: { id, supersedes_id } }) as unknown as EntryWithChild;
  it('is the newest version, also after several fixes, and the record itself when there is none', () => {
    const all = [e('a'), e('b', 'a'), e('c', 'b'), e('z')];
    expect(newestVersion('a', all)!.entry.id).toBe('c');
    expect(newestVersion('z', all)!.entry.id).toBe('z');
    expect(newestVersion('gone', all)).toBeUndefined();
  });
  it('survives a loop in the version links', () => {
    expect(newestVersion('a', [e('a', 'b'), e('b', 'a')])).toBeDefined();
  });
});

describe('worklist tabs and progress', () => {
  const items = [item({ signed_off_at: 't' }), item({ flags: ['duplicate'] }), item({ flags: ['recheck'], signed_off_at: 't' }), item()];
  it('every item is done, open with a flag, or open without one', () => {
    expect(progress(items)).toEqual({ total: 4, done: 2, flagged: 1, plain: 1 });
    expect(progress([])).toEqual({ total: 0, done: 0, flagged: 0, plain: 0 });
  });
  it('tabs', () => {
    expect(WORK_FILTERS.map((f) => items.filter((i) => inFilter(i, f)).length)).toEqual([2, 1, 0, 0, 1, 4]);
  });
});
