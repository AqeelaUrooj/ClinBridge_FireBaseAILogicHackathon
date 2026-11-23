import { describe, expect, it } from 'vitest';
import type { EntryWithChild } from '../../db/repos/entries';
import type { Entry, MedAdmin } from '../../db/schema';
import { medicationSites } from './medicationSites';

function record(entryOverrides: Partial<Entry> = {}, medicationOverrides: Partial<MedAdmin> = {}): EntryWithChild {
  const entry: Entry = {
    id: 'practice-entry', type: 'med_admin', patient_id: 'practice-patient', encounter_id: 'practice-encounter',
    care_time: '2026-11-14T08:00:00+00:00', entry_time: '2026-11-14T08:01:00+00:00',
    counter: 1, device_id: 'practice-device', performer_id: 'practice-nurse',
    raw_input_kind: 'typed', raw_input_ref: '', status: 'confirmed', ...entryOverrides,
  };
  const child: MedAdmin = {
    id: 'practice-medication', entry_id: entry.id, drug_name: 'Practice medicine', event: 'administered',
    site: 'Left forearm IV line', ...medicationOverrides,
  };
  return { entry, child };
}

const derive = (...records: EntryWithChild[]) => medicationSites('practice-patient', records);

describe('documented medication sites', () => {
  it('highlights exactly the mapped region and retains its underlying entry', () => {
    const saved = record();
    const { administrations } = derive(saved);
    expect([...administrations.keys()]).toEqual(['LEFT_FOREARM']);
    expect(administrations.get('LEFT_FOREARM')?.records.map(({ item }) => item.entry.id)).toEqual([saved.entry.id]);
  });

  it('groups multiple administrations and sorts them by the actual documented time', () => {
    const older = record({ id: 'older', care_time: '2026-11-14T09:00:00+02:00' });
    const newer = record({ id: 'newer', care_time: '2026-11-14T08:00:00+00:00' });
    const { administrations } = derive(older, newer);
    expect(administrations.size).toBe(1);
    const summary = administrations.get('LEFT_FOREARM');
    expect(summary?.records).toHaveLength(2);
    expect(summary?.records.map(({ item }) => item.entry.id)).toEqual(['newer', 'older']);
    expect(summary?.mostRecentCareTime).toBe(newer.entry.care_time);
  });

  it('keeps an administration when its documented time is unavailable', () => {
    const summary = derive(record({ care_time: '' })).administrations.get('LEFT_FOREARM');
    expect(summary?.records).toHaveLength(1);
    expect(summary?.mostRecentCareTime).toBeUndefined();
  });

  it.each(['draft', 'entered-in-error', 'corrected'] as const)('excludes %s records', (status) => {
    expect(derive(record({ status })).administrations.size).toBe(0);
  });

  it.each(['held', 'refused', 'rate_changed'])('keeps the existing pin for %s but excludes it from administration history', (event) => {
    const { marked, administrations } = derive(record({}, { event }));
    expect(marked).toHaveLength(1);
    expect(administrations.size).toBe(0);
  });

  it('counts only the confirmed replacement at its corrected site', () => {
    const old = record({ id: 'old', status: 'corrected' });
    const fixed = record({ id: 'fixed', supersedes_id: 'old' }, { site: 'Right hand IV line' });
    const { administrations } = derive(old, fixed);
    expect([...administrations.keys()]).toEqual(['RIGHT_HAND']);
    expect(administrations.get('RIGHT_HAND')?.records.map(({ item }) => item.entry.id)).toEqual(['fixed']);
    expect(derive(old, { ...fixed, entry: { ...fixed.entry, status: 'entered-in-error' } }).administrations.size).toBe(0);
  });

  it('requires a matching saved medication event, so a scheduled dose alone is excluded', () => {
    const scheduled = record({ scheduled_time: '2026-11-14T08:00:00+00:00' });
    expect(derive({ entry: scheduled.entry, child: undefined }).administrations.size).toBe(0);
    expect(derive(record({}, { entry_id: 'different-entry' })).administrations.size).toBe(0);
    expect(derive(record({ type: 'note' })).administrations.size).toBe(0);
  });

  it('isolates patients even when a live result still holds records from the previous patient', () => {
    const sites = derive(record({ patient_id: 'other-practice-patient' }));
    expect(sites.marked).toEqual([]);
    expect(sites.unmapped).toEqual([]);
    expect(sites.administrations.size).toBe(0);
  });

  it.each([null, '', '   '])('excludes missing sites (%j)', (site) => {
    const sites = derive(record({}, { site }));
    expect(sites.administrations.size).toBe(0);
    expect(sites.unmapped).toEqual([]);
  });

  it('lists unmapped sites without guessing a region', () => {
    const sites = derive(record({}, { site: 'Perineum' }));
    expect(sites.unmapped.map(({ site }) => site)).toEqual(['Perineum']);
    expect(sites.administrations.size).toBe(0);
  });
});
