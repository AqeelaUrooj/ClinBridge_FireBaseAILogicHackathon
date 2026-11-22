import { describe, expect, it } from 'vitest';
import type { Entry, EntryStatus, VitalSign } from '../db/schema';
import type { EntryWithChild } from '../db/repos/entries';
import { SPO2_LOINC, vitalSeries, withBaseline } from './vitalTrend';
import type { SnapshotResult } from '../db/schema';

let n = 0;
function v(care: string, vals: Partial<VitalSign>, opts: { status?: EntryStatus; patient?: string; id?: string; type?: Entry['type'] } = {}): EntryWithChild {
  n++;
  const id = opts.id ?? `e-${n}`;
  const entry: Entry = {
    id, type: opts.type ?? 'vital_sign', patient_id: opts.patient ?? 'pt-1', encounter_id: 'enc-1',
    care_time: `2026-11-14T${care}:00-05:00`, entry_time: `2026-11-14T${care}:30-05:00`, counter: n, device_id: 'dev-01',
    performer_id: 'pr-a', raw_input_kind: 'typed', raw_input_ref: '', status: opts.status ?? 'confirmed', inference_source: null, supersedes_id: null,
  };
  return { entry, child: { id: `v-${n}`, entry_id: id, ...vals } as VitalSign };
}

describe('vitalSeries (SpO₂ trend data)', () => {
  it('uses confirmed readings in care-time order, not insertion order, with irregular gaps kept as real times', () => {
    const s = vitalSeries([v('04:55', { spo2: 94 }), v('00:05', { spo2: 91 }), v('04:20', { spo2: 90 })], 'pt-1', 'spo2');
    expect(s.confirmed.map((p) => [p.time.slice(11, 16), p.value])).toEqual([['00:05', 91], ['04:20', 90], ['04:55', 94]]);
    expect(s.confirmed[1]!.ms - s.confirmed[0]!.ms).toBe((4 * 60 + 15) * 60_000);
    expect(s.latest?.value).toBe(94);
    expect([s.lowest?.value, s.lowest?.time.slice(11, 16)]).toEqual([90, '04:20']);
    expect(s.highest?.value).toBe(94);
  });

  it('leaves out old versions and mistakes; keeps drafts separate from the confirmed line', () => {
    const s = vitalSeries([
      v('01:00', { spo2: 80 }, { status: 'corrected' }),
      v('01:00', { spo2: 95 }),
      v('02:00', { spo2: 70 }, { status: 'entered-in-error' }),
      v('03:00', { spo2: 93 }, { status: 'draft' }),
    ], 'pt-1', 'spo2');
    expect(s.confirmed.map((p) => p.value)).toEqual([95]);
    expect(s.drafts.map((p) => [p.value, p.status])).toEqual([[93, 'draft']]);
    expect(s.lowest?.value).toBe(95); // drafts never change the confirmed summary
  });

  it('counts readings without the value instead of inventing one', () => {
    const s = vitalSeries([v('01:00', { heart_rate: 80 }), v('02:00', { spo2: null }), v('03:00', { spo2: 97 })], 'pt-1', 'spo2');
    expect(s.confirmed).toHaveLength(1);
    expect(s.missing).toBe(2);
  });

  it('never mixes in another patient or another record type', () => {
    const s = vitalSeries([v('01:00', { spo2: 99 }, { patient: 'pt-2' }), v('02:00', { spo2: 88 }, { type: 'note' }), v('03:00', { spo2: 96 })], 'pt-1', 'spo2');
    expect(s.confirmed.map((p) => p.value)).toEqual([96]);
    expect(s.missing).toBe(0);
  });

  it('carries the oxygen device and flow as display context for SpO₂', () => {
    const s = vitalSeries([v('01:00', { spo2: 94, o2_device: 'Nasal tube', o2_flow_lpm: 4 })], 'pt-1', 'spo2');
    expect(s.confirmed[0]!.note).toBe('Nasal tube · 4 L/min');
  });

  it('adds the pre-outage hospital-list reading apart from the confirmed line, matched by LOINC code only', () => {
    const rows: SnapshotResult[] = [
      { id: 'sr-1', patient_id: 'pt-1', kind: 'vital', code: '59408-5', name: 'Oxygen saturation', value_num: 91, unit: '%', time: '2026-11-14T00:05:00-05:00' },
      { id: 'sr-2', patient_id: 'pt-1', kind: 'vital', code: '8867-4', name: 'Heart rate', value_num: 102, unit: '/min', time: '2026-11-14T00:05:00-05:00' },
      { id: 'sr-3', patient_id: 'pt-2', kind: 'vital', code: '59408-5', name: 'Oxygen saturation', value_num: 99, unit: '%', time: '2026-11-14T00:05:00-05:00' },
    ];
    const s = withBaseline(vitalSeries([v('04:20', { spo2: 90 })], 'pt-1', 'spo2'), rows, 'pt-1', SPO2_LOINC);
    expect(s.baseline.map((p) => [p.value, p.status])).toEqual([[91, 'baseline']]);
    expect([s.lowest?.value, s.latest?.value, s.confirmed.length]).toEqual([90, 90, 1]);
  });

  it('is empty when there are no readings', () => {
    const s = vitalSeries([], 'pt-1', 'spo2');
    expect([s.confirmed.length, s.drafts.length, s.missing, s.latest]).toEqual([0, 0, 0, undefined]);
  });
});
