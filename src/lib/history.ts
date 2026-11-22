/**
 * Patient history (timeline) logic: filter tabs with counts, search, newest/oldest ordering,
 * and an integrity summary built only from evidence the records actually hold.
 * Pure functions so they can be unit-tested; the page only renders what these return.
 */
import type { Entry, EntryStatus, EntryType } from '../db/schema';
import type { EntryWithChild } from '../db/repos/entries';

export type HistoryFilter = 'all' | 'vital_sign' | 'med_admin' | 'note' | 'lab_event' | 'intake_output';

export const HISTORY_FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all', label: 'All entries' },
  { key: 'vital_sign', label: 'Vitals' },
  { key: 'med_admin', label: 'Medications' },
  { key: 'note', label: 'Clinical notes' },
  { key: 'lab_event', label: 'Lab / bloodwork' },
  { key: 'intake_output', label: 'Fluids (I/O)' },
];

export type HistoryOrder = 'newest' | 'oldest';

/** Old versions (replaced by a fix) and records marked as a mistake. They stay in the history, crossed out. */
export const isRetiredStatus = (s: EntryStatus) => s === 'corrected' || s === 'entered-in-error';

/** Counts per tab over current records only (confirmed + drafts), so a fix never counts twice. */
export function historyCounts(items: EntryWithChild[]): Record<HistoryFilter, number> {
  const counts: Record<HistoryFilter, number> = { all: 0, vital_sign: 0, med_admin: 0, note: 0, lab_event: 0, intake_output: 0 };
  for (const { entry } of items) {
    if (isRetiredStatus(entry.status)) continue;
    counts.all++;
    counts[entry.type as Exclude<HistoryFilter, 'all'>]++;
  }
  return counts;
}

export interface HistoryQuery {
  filter: HistoryFilter;
  order: HistoryOrder;
  /** Free text: matched against the summary, the author's name and the record type. Case-insensitive. */
  search: string;
  showRetired: boolean;
}

/** Clinical order: by care time (when it happened), then by entry time (when it was typed). */
export function compareClinical(a: Entry, b: Entry): number {
  return a.care_time.localeCompare(b.care_time) || a.entry_time.localeCompare(b.entry_time) || a.counter - b.counter;
}

export function filterHistory(
  items: EntryWithChild[],
  q: HistoryQuery,
  text: (item: EntryWithChild) => string,
): EntryWithChild[] {
  const needle = q.search.trim().toLowerCase();
  const out = items.filter(({ entry }) => {
    if (!q.showRetired && isRetiredStatus(entry.status)) return false;
    if (q.filter !== 'all' && entry.type !== q.filter) return false;
    return true;
  }).filter((item) => !needle || text(item).toLowerCase().includes(needle));
  out.sort((a, b) => (q.order === 'oldest' ? compareClinical(a.entry, b.entry) : compareClinical(b.entry, a.entry)));
  return out;
}

export interface IntegritySummary {
  current: number;
  confirmed: number;
  /** Drafts: proposed (photo/AI) or saved to check later; not yet confirmed by a nurse. */
  pendingConfirmation: number;
  oldVersions: number;
  mistakes: number;
  fromPhoto: number;
  aiProposed: number;
}

/** Facts only: nothing here claims bedside verification, countersignature or completeness. */
export function integritySummary(items: EntryWithChild[]): IntegritySummary {
  const s: IntegritySummary = { current: 0, confirmed: 0, pendingConfirmation: 0, oldVersions: 0, mistakes: 0, fromPhoto: 0, aiProposed: 0 };
  for (const { entry } of items) {
    if (entry.status === 'corrected') { s.oldVersions++; continue; }
    if (entry.status === 'entered-in-error') { s.mistakes++; continue; }
    s.current++;
    if (entry.status === 'draft') s.pendingConfirmation++;
    if (entry.status === 'confirmed') s.confirmed++;
    if (entry.raw_input_kind === 'photo') s.fromPhoto++;
    if (entry.inference_source || entry.ai_proposal) s.aiProposed++;
  }
  return s;
}

/** People who recorded current entries, most entries first. */
export function careTeam(items: EntryWithChild[]): { performerId: string; entries: number }[] {
  const m = new Map<string, number>();
  for (const { entry } of items) {
    if (isRetiredStatus(entry.status)) continue;
    m.set(entry.performer_id, (m.get(entry.performer_id) ?? 0) + 1);
  }
  return [...m.entries()].map(([performerId, entries]) => ({ performerId, entries })).sort((a, b) => b.entries - a.entries || a.performerId.localeCompare(b.performerId));
}

/** The record types present, in time order, for the "recorded sequence" strip. */
export function recordedSequence(items: EntryWithChild[]): { id: string; type: EntryType; time: string }[] {
  return items.filter(({ entry }) => !isRetiredStatus(entry.status))
    .map(({ entry }) => entry)
    .sort(compareClinical)
    .map((e) => ({ id: e.id, type: e.type, time: e.care_time }));
}
