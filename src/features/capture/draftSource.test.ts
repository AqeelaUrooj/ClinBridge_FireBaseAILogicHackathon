import { describe, expect, it } from 'vitest';
import { keepDraftSource } from './draftSource';
import { proposalNote } from '../vitals/VitalsEditor';

describe('confirming a draft keeps what the form cannot show', () => {
  it('keeps the weight and the words copied from the paper', () => {
    expect(keepDraftSource('vital_sign', { heart_rate: 80, weight_kg: null, raw_text: null }, { weight_kg: 71.5, raw_text: 'HR 80' })).toEqual({ heart_rate: 80, weight_kg: 71.5, raw_text: 'HR 80' });
    expect(keepDraftSource('med_admin', { dose_given: 5, raw_text: null }, { dose_given: 50, raw_text: 'amlodipine 5.0 mg' })).toEqual({ dose_given: 5, raw_text: 'amlodipine 5.0 mg' });
  });
  it('adds nothing when the draft has none, and leaves other records alone', () => {
    expect(keepDraftSource('vital_sign', { heart_rate: 80 }, {})).toEqual({ heart_rate: 80, weight_kg: null, raw_text: null });
    expect(keepDraftSource('note', { text: 'a' }, { text: 'b' })).toEqual({ text: 'a' });
    expect(keepDraftSource('vital_sign', { heart_rate: 80 }, undefined)).toEqual({ heart_rate: 80 });
  });
});

describe('a value beside the stored proposal', () => {
  it('says only whether it is the same', () => {
    expect(proposalNote({ heart_rate: 84 }, ['heart_rate'], '84')).toEqual({ text: 'Same as the proposal', differs: false });
    expect(proposalNote({ heart_rate: 84 }, ['heart_rate'], '48')).toEqual({ text: 'Proposal said 84', differs: true });
    expect(proposalNote({ heart_rate: 84 }, ['spo2'], '93')).toEqual({ text: 'Not in the proposal', differs: false });
    expect(proposalNote({ bp_systolic: 146, bp_diastolic: 88 }, ['bp_systolic', 'bp_diastolic'], '146 / 88').differs).toBe(false);
    expect(proposalNote({ bp_systolic: 146, bp_diastolic: null }, ['bp_systolic', 'bp_diastolic'], '146 / 88')).toEqual({ text: 'Proposal said 146 / —', differs: true });
  });
  it('repeats what the proposal marked as unclear', () => {
    expect(proposalNote({ temp_c: 37.6, unclear: ['temp_c'] }, ['temp_c'], '37.6')).toEqual({ text: 'Same as the proposal. Marked unclear in the proposal', differs: true });
  });
});
