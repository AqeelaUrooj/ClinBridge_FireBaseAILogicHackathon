import type { VitalSign } from '../db/schema';
import { CLINICAL_WARNINGS } from '../config/clinicalWarnings';

/**
 * Vital-sign validation, in two separate layers:
 *
 * 1. STRUCTURAL rules (block saving). Only things that are true by definition, not clinical judgement:
 *    a number, the right data type (whole number vs decimal), no negatives, a field-sized value (max 4 digits
 *    before the decimal point), the edges of a defined scale (oxygen saturation is a 0–100 percentage,
 *    pain is a 0–10 scale), both blood-pressure numbers together, oxygen flow needs a delivery method,
 *    and at least one measurement.
 *
 * 2. CLINICAL warnings (never block). Ranges come from src/config/clinicalWarnings.ts and are NOT clinically
 *    approved. A value outside a range, or a bottom BP not lower than the top, is shown as a warning and the
 *    nurse must tick that they re-checked it.
 *
 * No early-warning score (e.g. NEWS2) is calculated. That needs an approved algorithm and clinical validation.
 */
export type VitalKey = 'bp_systolic' | 'bp_diastolic' | 'heart_rate' | 'resp_rate' | 'temp_c' | 'spo2' | 'pain_0_10' | 'glucose_mgdl' | 'o2_flow_lpm';

export interface VitalRule {
  key: VitalKey;
  label: string;
  unit: string;
  /** Whole numbers only (data type), else up to `decimals` places. */
  integer: boolean;
  decimals: number;
  /** Edges of a defined scale only (percentage, 0–10 score). Not clinical limits. */
  scale?: [number, number];
}

export const VITAL_RULES: Record<VitalKey, VitalRule> = {
  bp_systolic: { key: 'bp_systolic', label: 'Top blood pressure', unit: 'mmHg', integer: true, decimals: 0 },
  bp_diastolic: { key: 'bp_diastolic', label: 'Bottom blood pressure', unit: 'mmHg', integer: true, decimals: 0 },
  heart_rate: { key: 'heart_rate', label: 'Pulse', unit: '/min', integer: true, decimals: 0 },
  resp_rate: { key: 'resp_rate', label: 'Breathing', unit: '/min', integer: true, decimals: 0 },
  temp_c: { key: 'temp_c', label: 'Temperature', unit: '°C', integer: false, decimals: 1 },
  spo2: { key: 'spo2', label: 'Oxygen level', unit: '%', integer: true, decimals: 0, scale: [0, 100] },
  pain_0_10: { key: 'pain_0_10', label: 'Pain', unit: '/10', integer: true, decimals: 0, scale: [0, 10] },
  glucose_mgdl: { key: 'glucose_mgdl', label: 'Blood sugar', unit: 'mg/dL', integer: false, decimals: 1 },
  o2_flow_lpm: { key: 'o2_flow_lpm', label: 'Oxygen flow', unit: 'L/min', integer: false, decimals: 1 },
};

/** The four documented consciousness options (AVPU: Alert, Voice, Pain, Unresponsive). */
export const CONSCIOUSNESS_OPTIONS = ['Alert', 'Responds to voice', 'Responds to pain', 'Unresponsive'] as const;

export type VitalsForm = Partial<Record<VitalKey, string>> & { o2_device?: string; consciousness?: string };
export type VitalsValues = Omit<VitalSign, 'id' | 'entry_id' | 'raw_text' | 'weight_kg'>;

export interface VitalsWarning { key: VitalKey | 'bp_order'; text: string }

export interface VitalsValidation {
  ok: boolean;
  values: VitalsValues;
  errors: Partial<Record<VitalKey | 'form' | 'consciousness', string>>;
  warnings: VitalsWarning[];
}

const MEASURE_KEYS: VitalKey[] = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'resp_rate', 'temp_c', 'spo2', 'pain_0_10', 'glucose_mgdl'];
const NUMBER = /^\d{1,4}(\.\d+)?$/;

export function validateVitals(form: VitalsForm): VitalsValidation {
  const errors: VitalsValidation['errors'] = {};
  const values: VitalsValues = {
    temp_c: null, heart_rate: null, resp_rate: null, bp_systolic: null, bp_diastolic: null, spo2: null,
    o2_device: form.o2_device?.trim() || null, o2_flow_lpm: null, pain_0_10: null, glucose_mgdl: null,
    consciousness: form.consciousness?.trim() || null,
  };
  for (const rule of Object.values(VITAL_RULES)) {
    const raw = (form[rule.key] ?? '').trim();
    if (raw === '') continue;
    if (raw.startsWith('-')) { errors[rule.key] = 'Cannot be negative'; continue; }
    if (!NUMBER.test(raw)) { errors[rule.key] = 'Numbers only (up to 4 digits)'; continue; }
    const n = Number(raw);
    const places = raw.includes('.') ? raw.split('.')[1]!.length : 0;
    if (rule.integer && places > 0) { errors[rule.key] = 'Whole number only'; continue; }
    if (places > rule.decimals) { errors[rule.key] = `Up to ${rule.decimals} decimal place`; continue; }
    if (rule.scale && (n < rule.scale[0] || n > rule.scale[1])) {
      errors[rule.key] = `Must be ${rule.scale[0]}–${rule.scale[1]}${rule.unit === '%' ? '%' : ''}`;
      continue;
    }
    values[rule.key] = n;
  }
  const sys = values.bp_systolic, dia = values.bp_diastolic;
  if ((sys == null) !== (dia == null) && !errors.bp_systolic && !errors.bp_diastolic) {
    errors[sys == null ? 'bp_systolic' : 'bp_diastolic'] = 'Enter both blood pressure numbers';
  }
  if (values.o2_flow_lpm != null && !values.o2_device) errors.o2_flow_lpm = 'Say how oxygen is given';
  if (values.consciousness && !(CONSCIOUSNESS_OPTIONS as readonly string[]).includes(values.consciousness)) {
    errors.consciousness = 'Pick one of the four options';
  }
  const hasMeasure = MEASURE_KEYS.some((k) => values[k] != null) || values.consciousness != null;
  if (!hasMeasure && Object.keys(errors).length === 0) errors.form = 'Enter at least one measurement';

  const warnings: VitalsWarning[] = [];
  for (const k of Object.keys(VITAL_RULES) as VitalKey[]) {
    if (isUnusual(k, values[k])) warnings.push({ key: k, text: `${VITAL_RULES[k].label} ${values[k]} ${VITAL_RULES[k].unit} is unusual` });
  }
  if (sys != null && dia != null && dia >= sys) warnings.push({ key: 'bp_order', text: 'Bottom blood pressure is not lower than the top' });

  return { ok: Object.keys(errors).length === 0, values, errors, warnings };
}

/** Outside the configured (not yet clinically approved) warning range. Display only. */
export function isUnusual(key: VitalKey, v: number | null | undefined): boolean {
  const r = CLINICAL_WARNINGS.ranges[key];
  return v != null && r != null && (v < r[0] || v > r[1]);
}

export function vitalsSummary(v: Partial<VitalSign>): string {
  const p: string[] = [];
  if (v.bp_systolic != null) p.push(`BP ${v.bp_systolic}/${v.bp_diastolic ?? '?'}`);
  if (v.heart_rate != null) p.push(`Pulse ${v.heart_rate}`);
  if (v.temp_c != null) p.push(`Temp ${v.temp_c}`);
  if (v.spo2 != null) p.push(`O₂ ${v.spo2}%`);
  if (v.glucose_mgdl != null) p.push(`Blood sugar ${v.glucose_mgdl}`);
  if (v.resp_rate != null && p.length < 3) p.push(`Breathing ${v.resp_rate}`);
  return p.slice(0, 4).join(' · ') || 'Vitals';
}
