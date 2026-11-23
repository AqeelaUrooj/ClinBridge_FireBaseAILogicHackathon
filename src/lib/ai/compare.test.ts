import { describe, expect, it } from 'vitest';
import { compareRows, knownValues, sameCount } from './compare';
import { syntheticNote } from './proposal';

const v = { bp_systolic: 124, bp_diastolic: 78, heart_rate: 88, resp_rate: 16, spo2: 98, temp_c: 37.1, pain_0_10: 0, glucose_mgdl: 120, consciousness: 'Alert' };
const answer = (values: Record<string, number>, consciousness: string | null = 'Alert') => ({ values, consciousness, dropped: [] });
const all = { bp_systolic: 124, bp_diastolic: 78, heart_rate: 88, resp_rate: 16, spo2: 98, temp_c: 37.1, pain_0_10: 0 };

describe('device and cloud answers beside the known input', () => {
  it('only values that are really written in the input are known; zero is a value', () => {
    expect(Object.keys(knownValues(v))).not.toContain('glucose_mgdl');
    expect(knownValues(v).pain_0_10).toBe(0);
    for (const n of Object.values(knownValues(v))) expect(syntheticNote(v, '08:00')).toContain(String(n));
    expect(knownValues({ ...v, bp_diastolic: null })).not.toHaveProperty('bp_systolic');
  });
  it('a side that did not run has no verdict', () => {
    const rows = compareRows(v);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.deviceVerdict === null && r.cloudVerdict === null)).toBe(true);
    expect(sameCount(rows, 'deviceVerdict')).toEqual({ same: 0, known: 8 });
  });
  it('same, different, not read, and a value that is not in the input', () => {
    const { heart_rate, ...rest } = all;
    const rows = compareRows(v, answer(all), answer({ ...rest, resp_rate: 61, glucose_mgdl: 120 }, null));
    const r = (k: string) => rows.find((x) => x.key === k)!;
    expect(heart_rate).toBe(88);
    expect(r('resp_rate')).toMatchObject({ deviceVerdict: 'same', cloudVerdict: 'different', cloud: '61' });
    expect(r('heart_rate')).toMatchObject({ deviceVerdict: 'same', cloudVerdict: 'missing' });
    expect(r('glucose_mgdl')).toMatchObject({ source: null, deviceVerdict: null, cloudVerdict: 'extra' });
    expect(r('consciousness')).toMatchObject({ cloudVerdict: 'missing' });
    expect(sameCount(rows, 'deviceVerdict')).toEqual({ same: 8, known: 8 });
    expect(sameCount(rows, 'cloudVerdict')).toEqual({ same: 5, known: 8 });
  });
});
