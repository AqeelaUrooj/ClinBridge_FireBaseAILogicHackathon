/** What changed between two versions of a record, field by field. Compares stored values only. */
import type { EntryType } from '../../db/schema';
import { ioLabel, labLabel, noteLabel } from '../../lib/charting';
import { formatDose } from '../../lib/dose';
import { VITAL_RULES, type VitalKey } from '../../lib/vitals';

export interface DiffRow { key: string; label: string; before: string; after: string }
type Obj = Record<string, unknown>;
type FieldDef = [key: string, label: string, show: (o: Obj) => string | null];

const str = (v: unknown) => (v == null || v === '' ? null : String(v));
const hhmm = (v: unknown) => (typeof v === 'string' && v.length >= 16 ? v.slice(11, 16) : null);
const EVENT: Record<string, string> = { administered: 'Given', held: 'Held', refused: 'Refused', rate_changed: 'Rate changed' };
const amount = (v: unknown, unit: unknown) => (v == null ? null : `${formatDose(v as number)} ${unit ?? ''}`.trim());

const FIELDS: Record<EntryType, FieldDef[]> = {
  vital_sign: [
    ...(Object.keys(VITAL_RULES) as VitalKey[]).map((k): FieldDef => [k, VITAL_RULES[k].label, (o) => (o[k] == null ? null : `${String(o[k])} ${VITAL_RULES[k].unit}`)]),
    ['o2_device', 'Oxygen given by', (o) => str(o.o2_device)], ['consciousness', 'Awake?', (o) => str(o.consciousness)], ['weight_kg', 'Weight', (o) => (o.weight_kg == null ? null : `${String(o.weight_kg)} kg`)],
  ],
  med_admin: [
    ['drug_name', 'Drug', (o) => str(o.drug_name)], ['event', 'What happened', (o) => EVENT[String(o.event)] ?? str(o.event)], ['dose_given', 'Dose given', (o) => amount(o.dose_given, o.dose_given_unit)],
    ['route', 'Route', (o) => str(o.route)], ['site', 'Site', (o) => str(o.site)], ['infusion_rate', 'Rate', (o) => amount(o.infusion_rate, o.infusion_rate_unit)], ['reason', 'Reason / note', (o) => str(o.reason)], ['double_checked_by', 'Second nurse', (o) => str(o.double_checked_by)],
  ],
  intake_output: [
    ['direction', 'In or out', (o) => (o.direction === 'in' ? 'In' : o.direction === 'out' ? 'Out' : null)], ['category', 'Kind', (o) => (o.category ? ioLabel(o.direction as 'in' | 'out', String(o.category)) : null)], ['volume_ml', 'Amount', (o) => (o.volume_ml == null ? null : `${String(o.volume_ml)} mL`)],
    ['method', 'How measured', (o) => str(o.method)], ['start_time', 'Period start', (o) => hhmm(o.start_time)], ['end_time', 'Period end', (o) => hhmm(o.end_time)],
  ],
  note: [['category', 'Type', (o) => (o.category ? noteLabel(String(o.category)) : null)], ['score', 'Score', (o) => (o.score_name ? `${String(o.score_name)}: ${o.score_value ?? '—'}` : null)], ['text', 'Note', (o) => str(o.text)]],
  lab_event: [
    ['test_name', 'Test', (o) => str(o.test_name)], ['status', 'Status', (o) => (o.status ? labLabel(String(o.status)) : null)], ['value', 'Result', (o) => (o.value_num == null && !o.value_text ? null : `${String(o.value_num ?? o.value_text)} ${o.unit ?? ''}`.trim())],
    ['specimen_time', 'Sample taken', (o) => hhmm(o.specimen_time)], ['called_to', 'Who was told', (o) => str(o.called_to)], ['read_back', 'Read back', (o) => (o.read_back == null ? null : o.read_back ? 'Yes' : 'No')],
  ],
};

export function entryDiff(type: EntryType, before: unknown, after: unknown, names: Map<string, string> = new Map()): DiffRow[] {
  const a = (before ?? {}) as Obj, b = (after ?? {}) as Obj;
  const shown = (key: string, v: string | null) => (v == null ? '—' : key === 'double_checked_by' ? names.get(v) ?? v : v);
  return FIELDS[type].map(([key, label, show]) => ({ key, label, before: shown(key, show(a)), after: shown(key, show(b)) })).filter((r) => r.before !== r.after);
}

/** Every stored value of one version, in order. Empty fields are left out. */
export function entryFields(type: EntryType, child: unknown, names: Map<string, string> = new Map()): { key: string; label: string; value: string }[] {
  const o = (child ?? {}) as Obj;
  return FIELDS[type].flatMap(([key, label, show]) => { const v = show(o); return v == null ? [] : [{ key, label, value: key === 'double_checked_by' ? names.get(v) ?? v : v }]; });
}
