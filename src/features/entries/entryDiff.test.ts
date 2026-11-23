import { describe, expect, it } from 'vitest';
import { entryDiff } from './entryDiff';

describe('what changed between two versions', () => {
  it('swapped pulse and breathing: two rows, nothing else', () => {
    const same = { bp_systolic: 124, bp_diastolic: 78, temp_c: 37.1, spo2: 98, pain_0_10: 1, consciousness: 'Alert' };
    expect(entryDiff('vital_sign', { ...same, heart_rate: 18, resp_rate: 78 }, { ...same, heart_rate: 78, resp_rate: 18 })).toEqual([
      { key: 'heart_rate', label: 'Pulse', before: '18 /min', after: '78 /min' }, { key: 'resp_rate', label: 'Breathing', before: '78 /min', after: '18 /min' },
    ]);
  });
  it('a value that appears or disappears is a change; zero is a value', () => {
    expect(entryDiff('vital_sign', { pain_0_10: 0 }, { pain_0_10: null })).toEqual([{ key: 'pain_0_10', label: 'Pain', before: '0 /10', after: '—' }]);
    expect(entryDiff('vital_sign', {}, { pain_0_10: 0 })).toMatchObject([{ before: '—', after: '0 /10' }]);
  });
  it('medicine: a dose or its unit, with no trailing zero, and the second nurse by name', () => {
    expect(entryDiff('med_admin', { dose_given: 50, dose_given_unit: 'mg' }, { dose_given: 5, dose_given_unit: 'mg' })).toMatchObject([{ label: 'Dose given', before: '50 mg', after: '5 mg' }]);
    expect(entryDiff('med_admin', { dose_given: 5, dose_given_unit: 'mg' }, { dose_given: 5, dose_given_unit: 'mL' })).toMatchObject([{ before: '5 mg', after: '5 mL' }]);
    expect(entryDiff('med_admin', {}, { double_checked_by: 'pr-park' }, new Map([['pr-park', 'Jordan Park']]))).toMatchObject([{ after: 'Jordan Park' }]);
  });
  it('fluids, notes and labs', () => {
    expect(entryDiff('intake_output', { direction: 'out', category: 'urine', volume_ml: 350 }, { direction: 'out', category: 'urine', volume_ml: 530 })).toMatchObject([{ label: 'Amount', before: '350 mL', after: '530 mL' }]);
    expect(entryDiff('note', { category: 'other', text: 'a' }, { category: 'other', text: 'b' })).toMatchObject([{ label: 'Note', before: 'a', after: 'b' }]);
    expect(entryDiff('lab_event', { status: 'critical', value_num: 6.2, unit: 'mmol/L', read_back: false }, { status: 'critical', value_num: 6.2, unit: 'mmol/L', read_back: true })).toEqual([{ key: 'read_back', label: 'Read back', before: 'No', after: 'Yes' }]);
  });
  it('the same values give no rows', () => {
    expect(entryDiff('note', { category: 'other', text: 'a' }, { category: 'other', text: 'a' })).toEqual([]);
    expect(entryDiff('med_admin', null, undefined)).toEqual([]);
  });
});
