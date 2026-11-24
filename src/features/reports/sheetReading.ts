import type { VitalSign } from '../../db/schema';
import { awakeKnown, knownCount, type Known } from '../../lib/ai/compare';
import { formatDose } from '../../lib/dose';
import { hm } from '../../lib/time';
import type { VitalKey } from '../../lib/vitals';
import type { ReportData, ReportVitals } from './reportData';
import { bp, clock, glucose, lastObs, latest, o2, pain } from './reportText';
import type { TemplateId } from './templates';

/** One set of vital signs written on a sheet: the last one. */
export interface SheetReading extends Known {
  time: string;
  /** Copied from the hospital's patient list, not charted in ClinBridge. */
  fromList: boolean;
}

/** A value, where the sheet writes it (CSS selector) and the exact text that must stand there. */
interface Spot { key: VitalKey | 'consciousness'; value: number | string; where: string; text: string }

const OBS_ROWS: Record<Exclude<TemplateId, 'pocket'>, number> = { assessment: 4, shift: 5, worksheet: 3 }; // as drawn by the sheets

/** The set of vital signs that stands last on this design. */
function lastSet(d: ReportData, template: TemplateId): ReportVitals | undefined {
  return template === 'pocket' ? latest(d, (v) => v.heart_rate != null || v.bp_systolic != null) : lastObs(d, OBS_ROWS[template]).at(-1);
}

const field = (tag: string) => `[data-field="${tag}"]`;

function spots(d: ReportData, template: TemplateId, { v, time }: ReportVitals): Spot[] {
  const out: Spot[] = [];
  const add = (key: VitalKey, where: string, text: string, from: Partial<VitalSign> = v) => { const n = from[key]; if (n != null) out.push({ key, value: n, where, text }); };
  const pressure = (where: string, text: string) => { if (v.bp_systolic != null) { add('bp_systolic', where, text); add('bp_diastolic', where, text); } };
  const awake = (where: string, text: string) => { if (v.consciousness) out.push({ key: 'consciousness', value: v.consciousness, where, text }); };
  const sugar = (where: string, shown: number, write: (value: string) => string) => {
    const x = glucose(d).slice(-shown).filter((g) => g.time === time && g.unit === 'mg/dL').at(-1);
    if (x && Number.isFinite(Number(x.value))) out.push({ key: 'glucose_mgdl', value: Number(x.value), where, text: write(x.value) });
  };
  const temp = v.temp_c != null ? formatDose(v.temp_c) : '—';
  const row = `[data-reading="${time}"]`;

  if (template === 'assessment') {
    pressure(row, bp(v));
    add('heart_rate', row, `HR ${v.heart_rate}`);
    add('temp_c', row, `T ${temp}°C`);
    const r = latest(d, (x) => x.resp_rate != null || x.spo2 != null); // the Respiratory box has a time of its own
    if (r?.time === time) {
      add('resp_rate', field('Respiratory:'), `RR ${r.v.resp_rate}`, r.v);
      add('spo2', field('Respiratory:'), `SpO2 ${r.v.spo2}%`, r.v);
      add('o2_flow_lpm', field('Respiratory:'), `on ${o2(r.v)}`, r.v);
    }
    awake(field('Neuro:'), `${v.consciousness} @ ${hm(time)}`);
    sugar(field('ACCU:'), 3, (x) => `${hm(time)} – ${x} mg/dL`);
  }
  if (template === 'shift') {
    pressure(row, bp(v));
    add('heart_rate', row, String(v.heart_rate));
    add('resp_rate', row, String(v.resp_rate));
    add('spo2', row, `${v.spo2}%`);
    add('temp_c', row, temp);
    add('o2_flow_lpm', row, o2(v));
    const p = pain(d).slice(-4).filter((x) => x.time === time).at(-1);
    if (p) out.push({ key: 'pain_0_10', value: p.score, where: `[data-pain="${time}"]`, text: `${p.score}/10` });
    awake(field('Neuro:'), `${v.consciousness} @ ${hm(time)}`);
  }
  if (template === 'worksheet') {
    const three = `${temp} / ${v.heart_rate ?? '—'} / ${v.resp_rate ?? '—'}`;
    pressure(row, bp(v));
    add('temp_c', row, three);
    add('heart_rate', row, three);
    add('resp_rate', row, three);
    add('spo2', row, `${v.spo2}%`);
    add('o2_flow_lpm', row, `${v.spo2}% ${o2(v)}`);
    add('pain_0_10', row, `${v.pain_0_10} /10`);
    awake(field('Neuro:'), `${v.consciousness} @ ${hm(time)}`);
    sugar(field('CBG:'), 2, (x) => `${clock(time)}: ${x}`);
  }
  if (template === 'pocket') {
    pressure(field('obs'), `BP ${bp(v)}`);
    add('heart_rate', field('obs'), `HR ${v.heart_rate}`);
    add('resp_rate', field('obs'), `RR ${v.resp_rate}`);
    add('temp_c', field('obs2'), `Temp ${temp}°C`);
    add('spo2', field('obs2'), `SpO2 ${v.spo2}%`);
    add('o2_flow_lpm', field('obs2'), `on ${o2(v)}`);
    awake(field('body'), String(v.consciousness));
    add('pain_0_10', field('body'), `pain ${v.pain_0_10}/10`);
    sugar(field('body'), 1, (x) => `glucose ${x} mg/dL @ ${clock(time)}`);
  }
  return out;
}

/** The words of one place on the drawn sheet, in order. Crossed-out old values do not count. */
function wordsAt(svg: Element, where: string): string {
  const el = Array.from(svg.querySelectorAll(where)).at(-1);
  if (!el) return '';
  return Array.from(el.querySelectorAll('text')).filter((t) => !t.closest('[data-was]')).map((t) => t.textContent ?? '').join(' ');
}
const plain = (s: string) => ` ${s.replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim()} `;

/**
 * What a model can be compared with: the last set of vital signs of the sheet, and of it only the values that are
 * really drawn in THIS picture. A value that is in the records but not on the sheet is not part of the comparison.
 * null: the sheet shows no vital signs.
 */
export function sheetReading(svg: Element, d: ReportData, template: TemplateId): SheetReading | null {
  const set = lastSet(d, template);
  if (!set) return null;
  const values: Known['values'] = {};
  let awake: string | null = null;
  for (const s of spots(d, template, set)) {
    if (!plain(wordsAt(svg, s.where)).includes(plain(s.text))) continue;
    if (s.key === 'consciousness') awake = String(s.value);
    else values[s.key] = s.value as number;
  }
  const known: Known = { values, ...awakeKnown(awake) };
  return knownCount(known) ? { time: set.time, fromList: set.fromList, ...known } : null;
}
