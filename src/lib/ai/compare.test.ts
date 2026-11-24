import { describe, expect, it } from 'vitest';
import { compareRows, knownCount, noteKnown, sameCount } from './compare';
import { reportPrompt, syntheticNote } from './proposal';

const v = { bp_systolic: 124, bp_diastolic: 78, heart_rate: 88, resp_rate: 16, spo2: 98, temp_c: 37.1, pain_0_10: 0, glucose_mgdl: 120, consciousness: 'Alert' };
const answer = (values: Record<string, number>, consciousness: string | null = 'Alert') => ({ values, consciousness, dropped: [] });
const all = { bp_systolic: 124, bp_diastolic: 78, heart_rate: 88, resp_rate: 16, spo2: 98, temp_c: 37.1, pain_0_10: 0 };

describe('device and cloud answers beside the known input', () => {
  it('only values that are really written in the note are known; zero is a value', () => {
    const known = noteKnown(v);
    expect(Object.keys(known.values)).not.toContain('glucose_mgdl');
    expect(known.values.pain_0_10).toBe(0);
    for (const n of Object.values(known.values)) expect(syntheticNote(v, '08:00')).toContain(String(n));
    expect(noteKnown({ ...v, bp_diastolic: null }).values).not.toHaveProperty('bp_systolic');
    expect(knownCount(known)).toBe(8);
  });
  it('a side that did not run has no verdict', () => {
    const rows = compareRows(noteKnown(v));
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.deviceVerdict === null && r.cloudVerdict === null)).toBe(true);
    expect(sameCount(rows, 'deviceVerdict')).toEqual({ same: 0, known: 8 });
  });
  it('same, different, not read, and a value that is not in the input', () => {
    const { heart_rate, ...rest } = all;
    const rows = compareRows(noteKnown(v), answer(all), answer({ ...rest, resp_rate: 61, glucose_mgdl: 120 }, null));
    const r = (k: string) => rows.find((x) => x.key === k)!;
    expect(heart_rate).toBe(88);
    expect(r('resp_rate')).toMatchObject({ deviceVerdict: 'same', cloudVerdict: 'different', cloud: '61' });
    expect(r('heart_rate')).toMatchObject({ deviceVerdict: 'same', cloudVerdict: 'missing' });
    expect(r('glucose_mgdl')).toMatchObject({ source: null, deviceVerdict: null, cloudVerdict: 'extra', counted: false });
    expect(r('consciousness')).toMatchObject({ cloudVerdict: 'missing' });
    expect(sameCount(rows, 'deviceVerdict')).toEqual({ same: 8, known: 8 });
    expect(sameCount(rows, 'cloudVerdict')).toEqual({ same: 5, known: 8 });
  });
  it('a field that is not in the input never counts: not as a miss when it is left out, not as a hit when it is guessed', () => {
    const known = { values: { heart_rate: 72 }, consciousness: null, otherWords: null };
    const rows = compareRows(known, answer({ heart_rate: 72 }, null), answer({ heart_rate: 72, temp_c: 36.6, spo2: 95 }, 'Alert'));
    expect(rows.filter((r) => r.deviceVerdict === 'missing')).toEqual([]);
    expect(rows.filter((r) => r.counted).map((r) => r.key)).toEqual(['heart_rate']);
    expect(sameCount(rows, 'deviceVerdict')).toEqual({ same: 1, known: 1 });
    expect(sameCount(rows, 'cloudVerdict')).toEqual({ same: 1, known: 1 });
  });
  it('consciousness in other words than the four choices is shown and never compared', () => {
    const known = noteKnown({ ...v, consciousness: 'Drowsy but wakes to voice' });
    expect(knownCount(known)).toBe(7);
    const r = compareRows(known, answer(all, null), answer(all, 'Responds to voice')).find((x) => x.key === 'consciousness')!;
    expect(r).toMatchObject({ source: 'Drowsy but wakes to voice', counted: false, deviceVerdict: null, cloudVerdict: null });
  });
  it('the report instructions name one time and ask for nothing but vital signs', () => {
    const p = reportPrompt('2026-11-14T08:05:00-05:00');
    expect(p).toContain('08:05');
    expect(p).toContain('0805');
    expect(p).toMatch(/Ignore everything on the sheet that is not a vital sign/);
    expect(p).not.toMatch(/diagnos|recommend|medic/i);
  });
});
