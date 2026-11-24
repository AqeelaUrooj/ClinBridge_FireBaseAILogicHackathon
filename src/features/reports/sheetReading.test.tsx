import { beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { DowntimeDB } from '../../db/db';
import { importPracticeSeed } from '../../db/seed';
import { hm } from '../../lib/time';
import { loadReportData, type ReportData } from './reportData';
import { sheetReading } from './sheetReading';
import { HandwrittenNursingReport, TEMPLATES, type TemplateId } from './templates';

const NOW = '2026-11-14T13:20:00-05:00';
let db: DowntimeDB, all: ReportData[];
beforeAll(async () => {
  db = new DowntimeDB('practice', `reading-${crypto.randomUUID()}`);
  await importPracticeSeed(db);
  all = await Promise.all((await db.patient.toArray()).map(async (p) => (await loadReportData(db, p.id, NOW))!));
});
const draw = (d: ReportData, t: TemplateId) => {
  const svg = render(<HandwrittenNursingReport d={d} template={t} look="photo" />).container.querySelector('svg')!.cloneNode(true) as SVGSVGElement;
  cleanup();
  return svg;
};
const read = (id: string, t: TemplateId, change?: (d: ReportData) => ReportData) => {
  const d = all.find((x) => x.bundle.patient.id === id)!, used = change ? change(d) : d;
  return sheetReading(draw(used, t), used, t);
};
const charted = { bp_systolic: 114, bp_diastolic: 66, heart_rate: 72, resp_rate: 18, spo2: 95, temp_c: 36.6, o2_flow_lpm: 2 };

describe('what a model is compared with is only what the drawn sheet really says', () => {
  it('Tom Hale: the same 12:00 set on all four designs; a field that a design does not print is not compared', () => {
    const at = { time: '2026-11-14T12:00:00-05:00', fromList: false, consciousness: 'Alert', otherWords: null };
    expect(read('pt-05', 'assessment')).toEqual({ ...at, values: charted }); // this design has no pain score
    expect(read('pt-05', 'shift')).toEqual({ ...at, values: { ...charted, pain_0_10: 2 } });
    expect(read('pt-05', 'worksheet')).toEqual({ ...at, values: { ...charted, pain_0_10: 2 } });
    expect(read('pt-05', 'pocket')).toEqual({ ...at, values: { ...charted, pain_0_10: 2 } });
  });

  it('every patient in every design: the values are that patient’s newest set, nothing from an older one', () => {
    for (const d of all) {
      for (const t of TEMPLATES) {
        const r = sheetReading(draw(d, t.id), d, t.id)!, at = `${d.bundle.patient.id} ${t.id}`;
        const set = d.vitals.filter((x) => x.time === r.time).map((x) => x.v);
        expect(set.length, at).toBeGreaterThan(0);
        expect(r.time, at).toBe(d.vitals.filter((x) => x.v.heart_rate != null).at(-1)!.time);
        expect(Object.keys(r.values).length, at).toBeGreaterThanOrEqual(3);
        for (const [k, n] of Object.entries(r.values)) expect(set.some((v) => v[k as 'spo2'] === n), `${at} ${k} ${n}`).toBe(true);
      }
    }
  });

  it('a partial set stays partial: 04:55 has no blood pressure and no temperature, and 04:20 is not used instead', () => {
    for (const t of TEMPLATES) expect(read('pt-09', t.id), t.id).toEqual({ time: '2026-11-14T04:55:00-05:00', fromList: false, consciousness: null, otherWords: null, values: { heart_rate: 100, resp_rate: 22, spo2: 94, o2_flow_lpm: 4 } });
  });

  it('a set from the hospital list says so', () => {
    expect(read('pt-10', 'pocket')).toMatchObject({ time: '2026-11-14T00:05:00-05:00', fromList: true, values: { heart_rate: 80, bp_systolic: 110, bp_diastolic: 68, spo2: 99, temp_c: 37 } });
  });

  it('blood sugar counts only when it is written for the same time', () => {
    expect(read('pt-02', 'assessment')!.values).not.toHaveProperty('glucose_mgdl'); // 11:30 on the sheet, vital signs 04:05
    const same = (d: ReportData): ReportData => ({ ...d, vitals: d.vitals.map((x) => (x.time.includes('T04:05') ? { ...x, v: { ...x.v, glucose_mgdl: 131 } } : x)).filter((x) => x.v.glucose_mgdl == null || x.v.glucose_mgdl === 131), labs: [] });
    for (const t of ['assessment', 'worksheet', 'pocket'] as const) expect(read('pt-02', t, same)!.values.glucose_mgdl, t).toBe(131);
    expect(read('pt-02', 'shift', same)!.values).not.toHaveProperty('glucose_mgdl'); // this design has no blood sugar
  });

  it('a value that is in the records but not in the drawn picture is left out', () => {
    for (const t of TEMPLATES) {
      const d = all.find((x) => x.bundle.patient.id === 'pt-05')!, svg = draw(d, t.id);
      const before = sheetReading(svg, d, t.id)!;
      expect(before.values.spo2).toBe(95);
      for (const el of Array.from(svg.querySelectorAll('text'))) if (/95%/.test(el.textContent!)) el.textContent = '';
      expect(sheetReading(svg, d, t.id)!.values, t.id).not.toHaveProperty('spo2');
      svg.querySelectorAll('text').forEach((el) => { el.textContent = ''; });
      expect(sheetReading(svg, d, t.id), t.id).toBeNull();
    }
  });

  it('a crossed-out old value is not the answer', () => {
    const d = all.find((x) => x.vitals.some((y) => y.was))!, row = d.vitals.find((x) => x.was)!;
    const changed = { ...d, vitals: d.vitals.map((x) => (x === row ? { ...x, was: { ...x.was, heart_rate: 181 } } : x)) };
    const svg = draw(changed, 'shift');
    expect(svg.querySelector('[data-was="181"]')).not.toBeNull();
    expect(sheetReading(svg, changed, 'shift')!.values.heart_rate).toBe(row.v.heart_rate);
    svg.querySelectorAll(`[data-reading="${row.time}"] text`).forEach((el) => { if (!el.closest('[data-was]')) el.textContent = ''; });
    expect(sheetReading(svg, { ...changed, vitals: changed.vitals.map((x) => (x.time === row.time ? { ...x, v: { ...x.v, heart_rate: 181 } } : x)) }, 'shift')?.values ?? {}).not.toHaveProperty('heart_rate');
  });

  it('consciousness in other words is shown but not compared', () => {
    const r = read('pt-05', 'worksheet', (d) => ({ ...d, vitals: d.vitals.filter((x) => hm(x.time) !== '12:00') }))!;
    expect(r).toMatchObject({ time: '2026-11-14T04:15:00-05:00', consciousness: null, otherWords: 'Drowsy but wakes to voice' });
  });

  it('no vital signs: nothing to compare', () => {
    for (const t of TEMPLATES) expect(read('pt-10', t.id, (d) => ({ ...d, vitals: [] })), t.id).toBeNull();
  });
});
