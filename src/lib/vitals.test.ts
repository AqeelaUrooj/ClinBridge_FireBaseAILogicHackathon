import { describe, expect, it } from 'vitest';
import { isUnusual, validateVitals } from './vitals';
import { CLINICAL_WARNINGS } from '../config/clinicalWarnings';

describe('vital sign validation — structural rules block', () => {
  it('accepts a normal full set with no warnings', () => {
    const r = validateVitals({ bp_systolic: '120', bp_diastolic: '80', heart_rate: '72', temp_c: '36.8', spo2: '98', resp_rate: '16', pain_0_10: '0' });
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.values.bp_systolic).toBe(120);
    expect(r.values.temp_c).toBe(36.8);
  });
  it('rejects text, negatives, wrong data type and oversized values', () => {
    expect(validateVitals({ heart_rate: 'abc' }).errors.heart_rate).toMatch(/Numbers only/);
    expect(validateVitals({ heart_rate: '-5' }).errors.heart_rate).toBe('Cannot be negative');
    expect(validateVitals({ heart_rate: '72.5' }).errors.heart_rate).toBe('Whole number only');
    expect(validateVitals({ temp_c: '36.85' }).errors.temp_c).toMatch(/1 decimal/);
    expect(validateVitals({ heart_rate: '12345' }).errors.heart_rate).toMatch(/4 digits/);
  });
  it('enforces only the edges of defined scales', () => {
    expect(validateVitals({ spo2: '101' }).errors.spo2).toBe('Must be 0–100%');
    expect(validateVitals({ pain_0_10: '11' }).errors.pain_0_10).toBe('Must be 0–10');
  });
  it('needs both BP numbers, and a delivery method for oxygen flow', () => {
    expect(validateVitals({ bp_systolic: '120' }).errors.bp_diastolic).toBeDefined();
    expect(validateVitals({ o2_flow_lpm: '2' }).errors.o2_flow_lpm).toBeDefined();
  });
  it('accepts only the four consciousness options', () => {
    expect(validateVitals({ consciousness: 'Responds to voice' }).ok).toBe(true);
    expect(validateVitals({ consciousness: 'Drowsy' }).errors.consciousness).toBeDefined();
  });
  it('needs at least one measurement', () => {
    expect(validateVitals({}).errors.form).toBeDefined();
  });
});

describe('clinical warnings — never block', () => {
  it('does not reject extreme but possible values; warns instead', () => {
    for (const hr of ['18', '130', '260', '900']) {
      const r = validateVitals({ heart_rate: hr });
      expect(r.ok).toBe(true);
      expect(r.warnings.map((w) => w.key)).toContain('heart_rate');
    }
  });
  it('warns, not blocks, when bottom BP is not lower than top', () => {
    const r = validateVitals({ bp_systolic: '80', bp_diastolic: '90' });
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.key)).toContain('bp_order');
  });
  it('ranges come from config and are marked not approved', () => {
    expect(CLINICAL_WARNINGS.review.approved).toBe(false);
    expect(isUnusual('heart_rate', 130)).toBe(true);
    expect(isUnusual('pain_0_10', 9)).toBe(false); // no range configured → no warning
  });
});
