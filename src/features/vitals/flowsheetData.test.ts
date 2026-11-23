import { describe, expect, it } from 'vitest';
import type { Entry, SnapshotResult } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { baselineRows, flowRows, insulinDoses, tile } from './flowsheetData';
import { stepValue } from './VitalsEditor';

const T = (hm: string) => `2026-11-14T${hm}:00-05:00`;
const entry = (id: string, time: string, over: Partial<Entry> = {}): Entry => ({
  id, type: 'vital_sign', patient_id: 'p1', encounter_id: 'e1', care_time: T(time), entry_time: T(time), counter: 1, device_id: 'd', performer_id: 'n',
  raw_input_kind: 'typed', raw_input_ref: '', status: 'confirmed', ...over,
});
const vital = (id: string, time: string, child: Record<string, unknown>, over: Partial<Entry> = {}) => ({ entry: entry(id, time, over), child: { id: `c-${id}`, entry_id: id, ...child } }) as unknown as EntryWithChild;
const result = (code: string, value_num: number, unit: string, over: Partial<SnapshotResult> = {}): SnapshotResult => ({ id: `${code}-${value_num}`, patient_id: 'p1', kind: 'vital', code, name: code, value_num, unit, time: T('00:05'), ...over });

describe('vitals flowsheet rows', () => {
  it('keeps each measure with its own time: a blood-sugar-only record does not hide older values', () => {
    const rows = flowRows([vital('a', '04:05', { heart_rate: 86, bp_systolic: 128, bp_diastolic: 80 }), vital('b', '11:30', { glucose_mgdl: 196 }), vital('c', '07:30', { glucose_mgdl: 248 })], [], 'p1');
    expect(rows.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(tile(rows, 'heart_rate').latest).toMatchObject({ value: '86', time: T('04:05') });
    expect(tile(rows, 'bp_systolic').latest!.value).toBe('128/80');
    expect(tile(rows, 'glucose_mgdl')).toMatchObject({ latest: { value: '196' }, before: { value: '248' }, change: -52 });
  });

  it('never uses a draft, an old version or a mistake as the latest value', () => {
    const rows = flowRows([
      vital('ok', '10:00', { heart_rate: 78 }), vital('old', '10:30', { heart_rate: 18 }, { status: 'corrected' }),
      vital('bad', '10:40', { heart_rate: 20 }, { status: 'entered-in-error' }), vital('draft', '11:00', { heart_rate: 99 }, { status: 'draft' }),
    ], [], 'p1');
    expect(rows.map((r) => r.kind)).toEqual(['draft', 'retired', 'retired', 'confirmed']);
    expect(tile(rows, 'heart_rate')).toMatchObject({ latest: { value: '78' }, before: null, change: null });
  });

  it('drops other patients and other record types', () => {
    const rows = flowRows([vital('x', '10:00', { heart_rate: 1 }, { patient_id: 'p2' }), vital('y', '10:00', {}, { type: 'note' })], [result('8867-4', 70, '/min', { patient_id: 'p2' })], 'p1');
    expect(rows).toEqual([]);
  });

  it('groups hospital-list results by time and leaves out other units, codes and kinds', () => {
    const rows = baselineRows([
      result('8480-6', 126, 'mm[Hg]'), result('8462-4', 78, 'mm[Hg]'), result('8310-5', 98.6, '[degF]'), result('2823-3', 5.4, 'mmol/L', { kind: 'lab' }),
      result('41653-7', 212, 'mg/dL', { kind: 'lab', time: '2026-11-13T18:30:00-05:00' }), result('8867-4', 60, '/min', { kind: 'lab' }),
    ], 'p1');
    expect(rows.map((r) => r.values)).toEqual([{ bp_systolic: 126, bp_diastolic: 78 }, { glucose_mgdl: 212 }]);
  });

  it('hospital-list values are only ever "before", never the latest, and blood pressure has no computed change', () => {
    const base = [result('8480-6', 126, 'mm[Hg]'), result('8462-4', 78, 'mm[Hg]'), result('8310-5', 36.6, 'Cel')];
    expect(tile(flowRows([], base, 'p1'), 'temp_c')).toMatchObject({ latest: null, before: { value: '36.6' } });
    const rows = flowRows([vital('a', '04:05', { bp_systolic: 128, bp_diastolic: 80, temp_c: 36.9 })], base, 'p1');
    expect(tile(rows, 'bp_systolic')).toMatchObject({ before: { value: '126/78' }, change: null });
    expect(tile(rows, 'temp_c').change).toBe(0.3);
  });

  it('lists only confirmed insulin doses that were given, in time order', () => {
    const med = (id: string, time: string, child: Record<string, unknown>, over: Partial<Entry> = {}) => vital(id, time, { drug_name: 'insulin lispro', event: 'administered', dose_given: 4, dose_given_unit: 'units', ...child }, { type: 'med_admin', ...over });
    const doses = insulinDoses([med('b', '12:00', {}), med('a', '08:00', {}), med('h', '09:00', { event: 'held' }), med('d', '10:00', {}, { status: 'draft' }), med('o', '11:00', { drug_name: 'ondansetron' }), med('p', '11:00', {}, { patient_id: 'p2' })], 'p1');
    expect(doses.map((d) => [d.entryId, d.text])).toEqual([['a', '4 units'], ['b', '4 units']]);
  });
});

describe('− and + buttons on the vitals form', () => {
  it('change a typed number and never start from an empty or broken box', () => {
    expect(stepValue('heart_rate', '77', 1)).toBe('78');
    expect(stepValue('temp_c', '36.9', 1)).toBe('37');
    expect(stepValue('temp_c', '36.1', -1)).toBe('36');
    expect(stepValue('glucose_mgdl', '196', -1)).toBe('191');
    for (const empty of ['', undefined, ' ', '7a', '-3']) expect(stepValue('heart_rate', empty, 1)).toBeNull();
  });
  it('stop at the edges of a defined scale and at zero', () => {
    expect(stepValue('spo2', '100', 1)).toBeNull();
    expect(stepValue('pain_0_10', '0', -1)).toBeNull();
    expect(stepValue('heart_rate', '0', -1)).toBeNull();
  });
});
