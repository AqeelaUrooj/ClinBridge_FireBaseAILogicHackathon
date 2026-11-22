/**
 * One vital-sign measure over time, from the patient's saved records only.
 * - Confirmed readings make the line. Drafts (not yet confirmed by a nurse) are returned separately so the
 *   chart can show them as hollow points, never joined into the line.
 * - Old versions (replaced by a fix) and records marked as a mistake are left out.
 * - Records with no value for the measure are counted, not invented.
 * Pure function: no clinical interpretation, no thresholds, no scores.
 */
import type { SnapshotResult, VitalSign } from '../db/schema';
import type { EntryWithChild } from '../db/repos/entries';
import type { VitalKey } from './vitals';

export interface TrendPoint {
  entryId: string;
  /** When it was measured (care time), ISO with offset. */
  time: string;
  ms: number;
  value: number;
  /** baseline = from the hospital patient list taken before the outage (not entered on this laptop). */
  status: 'confirmed' | 'draft' | 'baseline';
  /** Extra context recorded with the reading (e.g. oxygen device and flow for SpO₂). Display only. */
  note?: string;
}

export interface TrendSeries {
  confirmed: TrendPoint[];
  drafts: TrendPoint[];
  /** Readings from the pre-outage hospital patient list. Shown apart: never joined to the line or used in the summary. */
  baseline: TrendPoint[];
  /** Current (confirmed or draft) vital-sign records of this patient with no value for this measure. */
  missing: number;
  latest?: TrendPoint;
  lowest?: TrendPoint;
  highest?: TrendPoint;
}

function o2Note(v: VitalSign): string | undefined {
  const parts = [v.o2_device || null, v.o2_flow_lpm != null ? `${v.o2_flow_lpm} L/min` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

export function vitalSeries(items: EntryWithChild[], patientId: string, key: VitalKey): TrendSeries {
  const confirmed: TrendPoint[] = [];
  const drafts: TrendPoint[] = [];
  let missing = 0;
  for (const { entry, child } of items) {
    // Defensive: never mix another patient's records into this chart.
    if (entry.patient_id !== patientId || entry.type !== 'vital_sign') continue;
    if (entry.status !== 'confirmed' && entry.status !== 'draft') continue;
    const v = child as VitalSign | undefined;
    const value = v?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) { missing++; continue; }
    const point: TrendPoint = {
      entryId: entry.id, time: entry.care_time, ms: Date.parse(entry.care_time), value, status: entry.status,
      note: key === 'spo2' && v ? o2Note(v) : undefined,
    };
    (entry.status === 'confirmed' ? confirmed : drafts).push(point);
  }
  const byTime = (a: TrendPoint, b: TrendPoint) => a.ms - b.ms || a.entryId.localeCompare(b.entryId);
  confirmed.sort(byTime);
  drafts.sort(byTime);
  const latest = confirmed[confirmed.length - 1];
  let lowest: TrendPoint | undefined, highest: TrendPoint | undefined;
  for (const p of confirmed) {
    if (!lowest || p.value < lowest.value) lowest = p;
    if (!highest || p.value > highest.value) highest = p;
  }
  return { confirmed, drafts, baseline: [], missing, latest, lowest, highest };
}

/** LOINC codes for oxygen saturation in the patient list (pulse oximetry; arterial). */
export const SPO2_LOINC = ['59408-5', '2708-6'];

/** Adds pre-outage readings of one measure from the hospital patient list (matched by LOINC code only). */
export function withBaseline(series: TrendSeries, rows: SnapshotResult[], patientId: string, codes: string[]): TrendSeries {
  const baseline = rows
    .filter((r) => r.patient_id === patientId && r.kind === 'vital' && !!r.code && codes.includes(r.code) && typeof r.value_num === 'number')
    .map((r): TrendPoint => ({ entryId: r.id, time: r.time, ms: Date.parse(r.time), value: r.value_num as number, status: 'baseline' }))
    .sort((a, b) => a.ms - b.ms);
  return { ...series, baseline };
}
