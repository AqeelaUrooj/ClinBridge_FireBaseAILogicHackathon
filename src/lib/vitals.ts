import type { VitalSign } from '../db/schema';

/**
 * Vital-sign field rules.
 * - plausible: input sanity limits. Values outside are rejected as typing errors.
 * - normal:    display-only highlight. It never blocks saving and never scores the patient.
 * Both sets are engineering placeholders and are listed in DECISIONS.md for clinical review.
 * No early-warning score (e.g. NEWS2) is computed: that is clinical decision support and is out of scope.
 */
export type VitalKey = 'bp_systolic' | 'bp_diastolic' | 'heart_rate' | 'resp_rate' | 'temp_c' | 'spo2' | 'pain_0_10' | 'glucose_mgdl' | 'o2_flow_lpm';

export interface VitalRule {
  key: VitalKey;
  label: string;
  unit: string;
  plausible: [number, number];
  normal?: [number, number];
  integer: boolean;
}

export const VITAL_RULES: Record<VitalKey, VitalRule> = {
  bp_systolic: { key: 'bp_systolic', label: 'Top blood pressure', unit: 'mmHg', plausible: [40, 300], normal: [90, 140], integer: true },
  bp_diastolic: { key: 'bp_diastolic', label: 'Bottom blood pressure', unit: 'mmHg', plausible: [20, 200], normal: [60, 90], integer: true },
  heart_rate: { key: 'heart_rate', label: 'Pulse', unit: '/min', plausible: [20, 250], normal: [60, 100], integer: true },
  resp_rate: { key: 'resp_rate', label: 'Breathing', unit: '/min', plausible: [4, 60], normal: [12, 20], integer: true },
  temp_c: { key: 'temp_c', label: 'Temperature', unit: '°C', plausible: [25, 45], normal: [36.1, 37.8], integer: false },
  spo2: { key: 'spo2', label: 'Oxygen level', unit: '%', plausible: [50, 100], normal: [92, 100], integer: true },
  pain_0_10: { key: 'pain_0_10', label: 'Pain', unit: '/10', plausible: [0, 10], integer: true },
  glucose_mgdl: { key: 'glucose_mgdl', label: 'Blood sugar', unit: 'mg/dL', plausible: [10, 1000], normal: [70, 180], integer: false },
  o2_flow_lpm: { key: 'o2_flow_lpm', label: 'Oxygen flow', unit: 'L/min', plausible: [0, 60], integer: false },
};

export const CONSCIOUSNESS_OPTIONS = ['Alert', 'Responds to voice', 'Responds to pain', 'Unresponsive'] as const;

export type VitalsForm = Partial<Record<VitalKey, string>> & { o2_device?: string; consciousness?: string };
export type VitalsValues = Omit<VitalSign, 'id' | 'entry_id' | 'raw_text' | 'weight_kg'>;

export interface VitalsValidation {
  ok: boolean;
  values: VitalsValues;
  errors: Partial<Record<VitalKey | 'form', string>>;
}

const MEASURE_KEYS: VitalKey[] = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'resp_rate', 'temp_c', 'spo2', 'pain_0_10', 'glucose_mgdl'];

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
    if (!/^-?\d+(\.\d+)?$/.test(raw)) { errors[rule.key] = 'Numbers only'; continue; }
    const n = Number(raw);
    if (rule.integer && !Number.isInteger(n)) { errors[rule.key] = 'Whole number only'; continue; }
    if (n < rule.plausible[0] || n > rule.plausible[1]) {
      errors[rule.key] = `Check this: must be ${rule.plausible[0]}–${rule.plausible[1]} ${rule.unit}`;
      continue;
    }
    values[rule.key] = n;
  }
  const sys = values.bp_systolic, dia = values.bp_diastolic;
  if ((sys == null) !== (dia == null) && !errors.bp_systolic && !errors.bp_diastolic) {
    errors[sys == null ? 'bp_systolic' : 'bp_diastolic'] = 'Enter both blood pressure numbers';
  }
  if (sys != null && dia != null && dia >= sys) errors.bp_diastolic = 'Bottom number must be lower than top number';
  if (values.o2_flow_lpm != null && !values.o2_device) errors.o2_flow_lpm = 'Say how oxygen is given';
  const hasMeasure = MEASURE_KEYS.some((k) => values[k] != null) || values.consciousness != null;
  if (!hasMeasure && Object.keys(errors).length === 0) errors.form = 'Enter at least one measurement';
  return { ok: Object.keys(errors).length === 0, values, errors };
}

export function isOutsideNormal(key: VitalKey, v: number | null | undefined): boolean {
  const r = VITAL_RULES[key].normal;
  return v != null && r != null && (v < r[0] || v > r[1]);
}

export function formToValues(v: Partial<VitalSign>): VitalsForm {
  const f: VitalsForm = {};
  for (const k of Object.keys(VITAL_RULES) as VitalKey[]) if (v[k] != null) f[k] = String(v[k]);
  if (v.o2_device) f.o2_device = v.o2_device;
  if (v.consciousness) f.consciousness = v.consciousness;
  return f;
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
