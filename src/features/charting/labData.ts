/** Rows for the lab pages, from saved records and the hospital patient list. Copies what is stored; judges nothing. */
import type { Entry, LabEvent, SnapshotResult, VitalSign } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';

export type LabTab = 'all' | 'critical' | 'collected' | 'pending' | 'resulted' | 'glucose' | 'list';
export const LAB_TABS: { v: LabTab; label: string }[] = [
  { v: 'all', label: 'All lab records' }, { v: 'critical', label: 'Critical' }, { v: 'collected', label: 'Sample taken' },
  { v: 'pending', label: 'Waiting for sample' }, { v: 'resulted', label: 'Result back' }, { v: 'glucose', label: 'Bedside blood sugar' }, { v: 'list', label: 'Hospital list' },
];

export interface LabRow { entry: Entry; kind: 'lab' | 'glucose'; lab?: LabEvent; test: string; value: string | null; num: number | null }

const live = (e: Entry) => e.status === 'confirmed' || e.status === 'draft';

/** Lab records and bedside blood sugars that count now: old versions and mistakes are left out. Newest first, critical on top. */
export function labRows(items: EntryWithChild[]): LabRow[] {
  const rows: LabRow[] = [];
  for (const { entry, child } of items) {
    if (!child || !live(entry)) continue;
    if (entry.type === 'lab_event') {
      const l = child as LabEvent;
      rows.push({ entry, kind: 'lab', lab: l, test: l.test_name, num: l.value_num ?? null, value: l.value_num != null ? `${l.value_num} ${l.unit ?? ''}`.trim() : l.value_text ? `${l.value_text} ${l.unit ?? ''}`.trim() : null });
    } else if (entry.type === 'vital_sign' && (child as VitalSign).glucose_mgdl != null) {
      const g = (child as VitalSign).glucose_mgdl!;
      rows.push({ entry, kind: 'glucose', test: 'Bedside blood sugar', num: g, value: `${g} mg/dL` });
    }
  }
  return rows.sort((a, b) => Number(isCritical(b)) - Number(isCritical(a)) || b.entry.care_time.localeCompare(a.entry.care_time));
}

export const isCritical = (r: LabRow) => r.lab?.status === 'critical';
export const inLabTab = (r: LabRow, tab: LabTab) => (tab === 'all' ? true : tab === 'glucose' ? r.kind === 'glucose' : r.kind === 'lab' && r.lab!.status === tab);

/** Lab results on the hospital list taken before the outage, newest first. */
export const hospitalLabs = (results: SnapshotResult[]) => results.filter((r) => r.kind === 'lab').sort((a, b) => b.time.localeCompare(a.time) || a.name.localeCompare(b.name));

/** The range printed on the hospital list, as it stands there. Null when the list has none. */
export const listRange = (r: SnapshotResult): string | null => (r.range_low != null && r.range_high != null ? `${r.range_low} – ${r.range_high}` : null);
