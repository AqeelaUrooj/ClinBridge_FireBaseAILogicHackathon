/** Facts shown on the recovery worklist. Compares stored values only; recommends nothing. */
import type { EntryType, WorklistFlag, WorklistItem } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { formatDose } from '../../lib/dose';
import { VITAL_RULES, type VitalKey } from '../../lib/vitals';

export const CATEGORY_LABEL: Record<string, string> = { admission: 'Admission and identity', meds: 'Medicine', results: 'Lab', vitals: 'Vitals', io: 'Fluids', notes: 'Note' };

export interface LookRow { key: string; label: string; record: string; reading: string; differs: boolean }

const EVENT: Record<string, string> = { administered: 'Given', held: 'Held', refused: 'Refused', rate_changed: 'Rate changed' };
const text = (v: unknown) => (v == null || v === '' ? '—' : String(v));

/** The stored second-look reading beside the record, field by field. Fields the reading does not hold are left out. */
export function lookRows(type: EntryType, child: unknown, reading: Record<string, unknown> | null | undefined): LookRow[] {
  if (!child || !reading) return [];
  const c = child as Record<string, unknown>;
  const rows: LookRow[] = [];
  const add = (key: string, label: string, show: (o: Record<string, unknown>) => string) => {
    if (!(key in reading)) return;
    const record = show(c), other = show(reading);
    rows.push({ key, label, record, reading: other, differs: record !== other });
  };
  if (type === 'med_admin') {
    add('drug_name', 'Drug', (o) => text(o.drug_name));
    add('event', 'What happened', (o) => EVENT[String(o.event)] ?? text(o.event));
    add('dose_given', 'Dose given', (o) => (o.dose_given == null ? '—' : `${formatDose(o.dose_given as number)} ${text(o.dose_given_unit)}`));
    add('route', 'Route', (o) => text(o.route));
  } else if (type === 'vital_sign') {
    for (const k of Object.keys(VITAL_RULES) as VitalKey[]) add(k, VITAL_RULES[k].label, (o) => (o[k] == null ? '—' : `${String(o[k])} ${VITAL_RULES[k].unit}`));
    add('o2_device', 'Oxygen given by', (o) => text(o.o2_device));
    add('consciousness', 'Awake?', (o) => text(o.consciousness));
  } else if (type === 'intake_output') {
    add('direction', 'In or out', (o) => text(o.direction));
    add('category', 'Kind', (o) => text(o.category));
    add('volume_ml', 'Amount', (o) => (o.volume_ml == null ? '—' : `${String(o.volume_ml)} mL`));
  }
  return rows;
}

/** The record as it is now: the newest version of the worklist entry. The rules must look at this one, or a fixed record looks like a duplicate of its own old version. */
export function newestVersion(id: string, all: EntryWithChild[]): EntryWithChild | undefined {
  let x = all.find((e) => e.entry.id === id), seen = 0;
  for (let n = x; n && seen++ < 100;) { x = n; n = all.find((e) => e.entry.supersedes_id === x!.entry.id); }
  return x;
}

export type WorkFilter = 'open' | WorklistFlag | 'all';
export const WORK_FILTERS: WorkFilter[] = ['open', 'duplicate', 'missing_field', 'time_conflict', 'recheck', 'all'];

/** "All" holds every item. A flag tab holds every item with that flag, signed off or not, as before. */
export const inFilter = (i: WorklistItem, f: WorkFilter) => (f === 'all' ? true : f === 'open' ? !i.signed_off_at : i.flags.includes(f));

export function progress(items: WorklistItem[]) {
  const done = items.filter((i) => i.signed_off_at).length;
  const flagged = items.filter((i) => !i.signed_off_at && i.flags.length > 0).length;
  return { total: items.length, done, flagged, plain: items.length - done - flagged };
}
