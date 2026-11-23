import { describe, expect, it } from 'vitest';
import type { ActiveOrder, Entry, MedAdmin } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { linkedRecords, medLines } from './handoffData';

const T = (hm: string) => `2026-11-14T${hm}:00-05:00`;
const entry = (id: string, time: string, over: Partial<Entry> = {}): EntryWithChild => ({
  entry: { id, type: 'vital_sign', patient_id: 'p1', encounter_id: 'e1', care_time: T(time), entry_time: T(time), counter: 1, device_id: 'd', performer_id: 'n', raw_input_kind: 'typed', raw_input_ref: '', status: 'confirmed', ...over },
  child: undefined,
});
const med = (id: string, time: string, child: Partial<MedAdmin>, over: Partial<Entry> = {}) => ({ ...entry(id, time, { type: 'med_admin', ...over }), child: { id: `c${id}`, entry_id: id, order_id: 'o1', drug_name: 'x', event: 'administered', ...child } as MedAdmin });
const order = (over: Partial<ActiveOrder> = {}): ActiveOrder => ({ id: 'o1', encounter_id: 'e1', type: 'med', text: 'azithromycin 500 mg', dose: 500, dose_unit: 'mg', frequency: 'daily', scheduled_times: ['10:00', '18:00'], status: 'active', ...over });

describe('records linked to a saved handover', () => {
  it('a fixed record is shown as changed, with its newest version', () => {
    const all = [entry('a', '04:00', { status: 'corrected' }), entry('b', '04:00', { supersedes_id: 'a', status: 'corrected' }), entry('c', '04:00', { supersedes_id: 'b' })];
    const [r] = linkedRecords(['a'], all, 'p1');
    expect(r).toMatchObject({ id: 'a', changed: true });
    expect(r!.newest!.entry.id).toBe('c');
  });
  it('a mistake is changed and has no newer version; an untouched record is not changed', () => {
    const [x, y] = linkedRecords(['ok', 'bad'], [entry('ok', '03:00'), entry('bad', '05:00', { status: 'entered-in-error' })], 'p1');
    expect(x).toMatchObject({ id: 'ok', changed: false, newest: null });
    expect(y).toMatchObject({ id: 'bad', changed: true, newest: null });
  });
  it('never shows a record of another patient, and says when one is missing', () => {
    const r = linkedRecords(['other', 'gone', 'mine'], [entry('other', '01:00', { patient_id: 'p2' }), entry('mine', '02:00')], 'p1');
    expect(r.map((x) => [x.id, !!x.item])).toEqual([['mine', true], ['other', false], ['gone', false]]);
  });
  it('survives a loop in the version links', () => {
    const r = linkedRecords(['a'], [entry('a', '01:00', { supersedes_id: 'b' }), entry('b', '01:00', { supersedes_id: 'a' })], 'p1');
    expect(r).toHaveLength(1);
  });
});

describe('medicine lines', () => {
  it('says what is recorded for each time today, without judging it', () => {
    expect(medLines([order()], [med('m', '10:05', { dose_given: 500, dose_given_unit: 'mg' }, { scheduled_time: T('10:00') })], T('19:00'))[0]!.notes).toEqual(['Last given 10:05: 500 mg', 'Today 10:00 given, 18:00 not recorded']);
  });
  it('a draft is not a given dose', () => {
    expect(medLines([order()], [med('m', '10:05', { dose_given: 500, dose_given_unit: 'mg' }, { scheduled_time: T('10:00'), status: 'draft' })], T('11:00'))[0]!.notes).toEqual(['No dose recorded on this laptop', 'Today 10:00 draft, not confirmed, 18:00 not recorded']);
  });
  it('an infusion shows its last record, never a rate that was only ordered', () => {
    const o = order({ frequency: 'continuous infusion', scheduled_times: null, dose: 1000, dose_unit: 'units/h' });
    expect(medLines([o], [], T('06:00'))[0]!.notes).toEqual(['No rate or dose recorded on this laptop']);
    expect(medLines([o], [med('h', '06:30', { event: 'held' }), med('r', '05:50', { event: 'rate_changed', infusion_rate: 1150, infusion_rate_unit: 'units/h' })], T('07:00'))[0]!.notes).toEqual(['Last record 06:30: Held']);
    expect(medLines([o], [med('r', '05:50', { event: 'rate_changed', infusion_rate: 1150, infusion_rate_unit: 'units/h' })], T('07:00'))[0]!.notes[0]).toMatch(/^Last record 05:50: Rate changed to 1,?150 units\/h$/);
  });
  it('leaves out stopped orders and orders that are not medicines', () => {
    expect(medLines([order({ status: 'stopped' }), order({ stop: T('08:00') }), order({ type: 'nursing' })], [], T('09:00'))).toEqual([]);
  });
});
