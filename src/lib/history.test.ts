import { describe, expect, it } from 'vitest';
import type { Entry, EntryStatus, EntryType } from '../db/schema';
import type { EntryWithChild } from '../db/repos/entries';
import { careTeam, filterHistory, historyCounts, integritySummary, recordedSequence, type HistoryQuery } from './history';

let n = 0;
function item(type: EntryType, care: string, opts: Partial<Entry> & { status?: EntryStatus; text?: string } = {}): EntryWithChild {
  n++;
  const entry: Entry = {
    id: opts.id ?? `e-${n}`, type, patient_id: 'pt-1', encounter_id: 'enc-1',
    care_time: `2026-11-14T${care}:00-05:00`, entry_time: opts.entry_time ?? `2026-11-14T${care}:30-05:00`,
    counter: n, device_id: 'dev-01', performer_id: opts.performer_id ?? 'pr-okafor',
    raw_input_kind: opts.raw_input_kind ?? 'typed', raw_input_ref: '', status: opts.status ?? 'confirmed',
    inference_source: opts.inference_source ?? null, supersedes_id: opts.supersedes_id ?? null,
  };
  return { entry, child: { text: opts.text ?? type } as never };
}

const q = (over: Partial<HistoryQuery> = {}): HistoryQuery => ({ filter: 'all', order: 'newest', search: '', showRetired: false, ...over });
const text = (x: EntryWithChild) => `${x.entry.type} ${(x.child as unknown as { text: string }).text}`;

describe('patient history logic', () => {
  const old = item('vital_sign', '04:00', { status: 'corrected', id: 'v-old' });
  const fixed = item('vital_sign', '04:00', { supersedes_id: 'v-old', id: 'v-new' });
  const items = [
    item('med_admin', '10:00', { text: 'Azithromycin 500 mg' }),
    item('note', '08:58', { text: 'Phoned Dr Castellano', performer_id: 'pr-park' }),
    old, fixed,
    item('lab_event', '06:05', { status: 'draft', raw_input_kind: 'photo', inference_source: 'in_cloud' }),
    item('intake_output', '07:00'),
    item('note', '05:00', { status: 'entered-in-error', text: 'wrong patient' }),
  ];

  it('counts current records per tab; a fix and a mistake never count twice', () => {
    expect(historyCounts(items)).toEqual({ all: 5, vital_sign: 1, med_admin: 1, note: 1, lab_event: 1, intake_output: 1 });
  });

  it('filters by type, hides old versions and mistakes unless asked', () => {
    expect(filterHistory(items, q({ filter: 'vital_sign' }), text).map((x) => x.entry.id)).toEqual(['v-new']);
    expect(filterHistory(items, q({ filter: 'vital_sign', showRetired: true }), text).map((x) => x.entry.id).sort()).toEqual(['v-new', 'v-old']);
    expect(filterHistory(items, q(), text)).toHaveLength(5);
    expect(filterHistory(items, q({ showRetired: true }), text)).toHaveLength(7);
  });

  it('orders by care time (newest or oldest first), not by insertion order', () => {
    const newest = filterHistory(items, q(), text).map((x) => x.entry.care_time.slice(11, 16));
    expect(newest).toEqual(['10:00', '08:58', '07:00', '06:05', '04:00']);
    const oldest = filterHistory(items, q({ order: 'oldest' }), text).map((x) => x.entry.care_time.slice(11, 16));
    expect(oldest).toEqual(['04:00', '06:05', '07:00', '08:58', '10:00']);
  });

  it('breaks care-time ties by entry time (when it was typed)', () => {
    const a = item('note', '09:00', { entry_time: '2026-11-14T09:10:00-05:00', id: 'late' });
    const b = item('note', '09:00', { entry_time: '2026-11-14T09:01:00-05:00', id: 'early' });
    expect(filterHistory([a, b], q({ order: 'oldest' }), text).map((x) => x.entry.id)).toEqual(['early', 'late']);
  });

  it('searches case-insensitively in the text given', () => {
    expect(filterHistory(items, q({ search: 'azithro' }), text).map((x) => x.entry.type)).toEqual(['med_admin']);
    expect(filterHistory(items, q({ search: 'CASTELLANO' }), text)).toHaveLength(1);
    expect(filterHistory(items, q({ search: 'nothing like this' }), text)).toHaveLength(0);
  });

  it('integrity summary reports facts only', () => {
    expect(integritySummary(items)).toEqual({ current: 5, confirmed: 4, pendingConfirmation: 1, oldVersions: 1, mistakes: 1, fromPhoto: 1, aiProposed: 1 });
  });

  it('care team counts current records per person, most first', () => {
    expect(careTeam(items)).toEqual([{ performerId: 'pr-okafor', entries: 4 }, { performerId: 'pr-park', entries: 1 }]);
  });

  it('recorded sequence is in time order and skips retired records', () => {
    expect(recordedSequence(items).map((s) => s.time.slice(11, 16))).toEqual(['04:00', '06:05', '07:00', '08:58', '10:00']);
  });
});
