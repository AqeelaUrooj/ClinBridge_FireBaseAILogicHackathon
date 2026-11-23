/**
 * Rows for the vitals flowsheet, from saved records and the hospital patient list taken before the outage.
 * Copies values only. No scores, no mean pressure, no target bands, no "stable" or "normal" wording.
 */
import type { MedAdmin, SnapshotResult, VitalSign } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import type { VitalKey } from '../../lib/vitals';
import { formatDose } from '../../lib/dose';

export type RowKind = 'confirmed' | 'draft' | 'retired' | 'baseline';
export type RowValues = Partial<Omit<VitalSign, 'id' | 'entry_id'>>;

export interface FlowRow {
  id: string;
  time: string;
  ms: number;
  kind: RowKind;
  values: RowValues;
  item?: EntryWithChild;
}

/** Hospital list results that are the same measure as ours. A result in another unit is left out, never converted. */
const BASELINE: Record<string, { key: VitalKey; unit: string; kind: SnapshotResult['kind'] }> = {
  '8310-5': { key: 'temp_c', unit: 'Cel', kind: 'vital' },
  '8867-4': { key: 'heart_rate', unit: '/min', kind: 'vital' },
  '9279-1': { key: 'resp_rate', unit: '/min', kind: 'vital' },
  '8480-6': { key: 'bp_systolic', unit: 'mm[Hg]', kind: 'vital' },
  '8462-4': { key: 'bp_diastolic', unit: 'mm[Hg]', kind: 'vital' },
  '59408-5': { key: 'spo2', unit: '%', kind: 'vital' },
  '2708-6': { key: 'spo2', unit: '%', kind: 'vital' },
  '41653-7': { key: 'glucose_mgdl', unit: 'mg/dL', kind: 'lab' }, // bedside (capillary) glucose
};

export function baselineRows(results: SnapshotResult[], patientId: string): FlowRow[] {
  const byTime = new Map<string, FlowRow>();
  for (const r of results) {
    const m = r.code ? BASELINE[r.code] : undefined;
    if (!m || r.patient_id !== patientId || r.kind !== m.kind || r.unit !== m.unit || typeof r.value_num !== 'number') continue;
    const row = byTime.get(r.time) ?? { id: `baseline-${r.time}`, time: r.time, ms: Date.parse(r.time), kind: 'baseline' as const, values: {} };
    row.values[m.key] = r.value_num;
    byTime.set(r.time, row);
  }
  return [...byTime.values()];
}

/** Newest first. Records of any other patient or type are dropped. */
export function flowRows(items: EntryWithChild[], results: SnapshotResult[], patientId: string): FlowRow[] {
  const rows: FlowRow[] = items
    .filter((x) => x.entry.patient_id === patientId && x.entry.type === 'vital_sign')
    .map((item) => {
      const s = item.entry.status;
      const kind: RowKind = s === 'confirmed' ? 'confirmed' : s === 'draft' ? 'draft' : 'retired';
      return { id: item.entry.id, time: item.entry.care_time, ms: Date.parse(item.entry.care_time), kind, values: (item.child ?? {}) as RowValues, item };
    });
  return [...rows, ...baselineRows(results, patientId)].sort((a, b) => b.ms - a.ms || a.id.localeCompare(b.id));
}

export interface TileReading { value: string; time: string; n: number; row: FlowRow }
export interface Tile { latest: TileReading | null; before: TileReading | null; change: number | null }

const show = (row: FlowRow, key: VitalKey): TileReading | null => {
  const n = row.values[key];
  if (typeof n !== 'number') return null;
  return { value: key === 'bp_systolic' ? `${n}/${row.values.bp_diastolic ?? '?'}` : String(n), time: row.time, n, row };
};

/**
 * Latest confirmed value of one measure with its own time, and the reading before it (confirmed or from the hospital list).
 * `change` is plain subtraction, only for single numbers (never blood pressure).
 */
export function tile(rows: FlowRow[], key: VitalKey): Tile {
  const readings = rows.filter((r) => r.kind === 'confirmed' || r.kind === 'baseline').map((r) => show(r, key)).filter((x): x is TileReading => !!x);
  const i = readings.findIndex((r) => r.row.kind === 'confirmed');
  if (i < 0) return { latest: null, before: readings[0] ?? null, change: null };
  const latest = readings[i]!;
  const before = readings[i + 1] ?? null;
  const change = before && key !== 'bp_systolic' ? Math.round((latest.n - before.n) * 10) / 10 : null;
  return { latest, before, change };
}

export interface InsulinDose { entryId: string; time: string; ms: number; text: string; drug: string }

/** Confirmed insulin doses, as recorded. Shown beside blood sugar for reading together; no effect is inferred. */
export function insulinDoses(items: EntryWithChild[], patientId: string): InsulinDose[] {
  return items
    .filter((x) => x.entry.patient_id === patientId && x.entry.type === 'med_admin' && x.entry.status === 'confirmed' && x.child)
    .map((x) => ({ e: x.entry, m: x.child as MedAdmin }))
    .filter(({ m }) => m.event === 'administered' && /insulin/i.test(m.drug_name))
    .map(({ e, m }) => ({ entryId: e.id, time: e.care_time, ms: Date.parse(e.care_time), drug: m.drug_name, text: m.dose_given != null ? `${formatDose(m.dose_given)} ${m.dose_given_unit ?? ''}`.trim() : 'dose not recorded' }))
    .sort((a, b) => a.ms - b.ms);
}
