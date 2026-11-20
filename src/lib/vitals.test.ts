import { describe, expect, it } from 'vitest';
import { isOutsideNormal, validateVitals } from './vitals';

describe('vital sign validation', () => {
  it('accepts a normal full set', () => {
    const r = validateVitals({ bp_systolic: '120', bp_diastolic: '80', heart_rate: '72', temp_c: '36.8', spo2: '98', resp_rate: '16', pain_0_10: '0' });
    expect(r.ok).toBe(true);
    expect(r.values.bp_systolic).toBe(120);
    expect(r.values.temp_c).toBe(36.8);
  });
  it('rejects impossible values and text', () => {
    expect(validateVitals({ heart_rate: '18' }).errors.heart_rate).toMatch(/20–250/);
    expect(validateVitals({ heart_rate: 'abc' }).errors.heart_rate).toBe('Numbers only');
    expect(validateVitals({ spo2: '97.5' }).errors.spo2).toBe('Whole number only');
    expect(validateVitals({ pain_0_10: '11' }).ok).toBe(false);
  });
  it('needs both BP numbers, bottom lower than top', () => {
    expect(validateVitals({ bp_systolic: '120' }).errors.bp_diastolic).toBeDefined();
    expect(validateVitals({ bp_systolic: '80', bp_diastolic: '90' }).errors.bp_diastolic).toMatch(/lower/);
  });
  it('needs at least one measurement', () => {
    expect(validateVitals({}).errors.form).toBeDefined();
  });
  it('flags but does not block out-of-normal values', () => {
    const r = validateVitals({ heart_rate: '130' });
    expect(r.ok).toBe(true);
    expect(isOutsideNormal('heart_rate', 130)).toBe(true);
  });
});
