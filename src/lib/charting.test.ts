import { describe, expect, it } from 'vitest';
import { ioTotals, validateIo, validateLab, validateNote } from './charting';
import { fromLocalInput } from './time';

const parse = (l: string) => fromLocalInput(l, -300);
const now = Date.parse('2026-11-14T13:20:00-05:00');
const io = { direction: 'in' as const, category: 'oral', volume: '240', method: 'Measured', start: '', end: '', orderId: '' };

describe('fluids', () => {
  it('accepts a normal record and blocks structural problems only', () => {
    expect(validateIo(io, parse, now).ok).toBe(true);
    expect(validateIo({ ...io, volume: '0' }, parse, now).errors.volume).toBeDefined();
    expect(validateIo({ ...io, volume: '12.5' }, parse, now).errors.volume).toBeDefined();
    expect(validateIo({ ...io, category: 'urine' }, parse, now).errors.category).toBeDefined(); // urine is an output
    expect(validateIo({ ...io, start: '2026-11-14T09:00' }, parse, now).errors.end).toMatch(/both/);
    expect(validateIo({ ...io, start: '2026-11-14T09:00', end: '2026-11-14T08:00' }, parse, now).errors.end).toMatch(/before/);
    expect(validateIo({ ...io, volume: '9000' }, parse, now).ok).toBe(true); // large but possible: no clinical limit
  });
  it('totals are plain sums', () => {
    expect(ioTotals([{ direction: 'in', volume_ml: 240 }, { direction: 'out', volume_ml: 420 }, { direction: 'in', volume_ml: 400 }] as never)).toEqual({ totalIn: 640, totalOut: 420, balance: 220 });
  });
});

describe('notes', () => {
  it('needs a type and text; risk score needs a name and whole number, never judged', () => {
    expect(validateNote({ category: '', text: '', scoreName: '', scoreValue: '' }).errors).toMatchObject({ category: expect.any(String), text: expect.any(String) });
    const r = validateNote({ category: 'risk_score', text: 'Heels red', scoreName: 'Braden', scoreValue: '13' });
    expect(r.ok).toBe(true);
    expect(r.values.score_value).toBe(13);
    expect(validateNote({ category: 'risk_score', text: 'x', scoreName: '', scoreValue: 'high' }).errors).toMatchObject({ scoreName: expect.any(String), scoreValue: expect.any(String) });
    expect(validateNote({ category: 'assessment', text: 'ok', scoreName: 'ignored', scoreValue: '5' }).values.score_name).toBeNull();
  });
});

describe('labs', () => {
  const lab = { testName: 'Potassium', orderId: '', status: 'critical', specimenTime: '', value: '6.2', unit: 'mmol/L', calledTo: '', readBack: false };
  it('critical result: missing who-was-told and read-back warn but never block', () => {
    const r = validateLab(lab, parse, now);
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(2);
    expect(r.values.value_num).toBe(6.2);
    expect(validateLab({ ...lab, calledTo: 'Dr. Whitaker', readBack: true }, parse, now).warnings).toHaveLength(0);
  });
  it('a result needs a value; text results are kept as text', () => {
    expect(validateLab({ ...lab, status: 'resulted', value: '' }, parse, now).errors.value).toBeDefined();
    expect(validateLab({ ...lab, status: 'resulted', value: 'Negative' }, parse, now).values.value_text).toBe('Negative');
    expect(validateLab({ ...lab, status: 'collected', value: '' }, parse, now).ok).toBe(true);
  });
});
