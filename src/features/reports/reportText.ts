import type { ActiveOrder, MedAdmin, VitalSign } from '../../db/schema';
import { ioLabel, labLabel, noteLabel } from '../../lib/charting';
import { formatDose } from '../../lib/dose';
import { isMedOrder } from '../../lib/meds';
import { dayLabel, hm } from '../../lib/time';
import { isNoKnownAllergy } from '../patient/patientData';
import type { Item } from '../../lib/handwriting/hand';
import type { ReportData, ReportLab, ReportVitals } from './reportData';

/** Records as short written lines. Every word comes from a record or is a fixed label; nothing is judged or added. */

export const clock = (iso: string | null | undefined) => hm(iso).replace(':', ''); // 0800, as on the paper sheets
const num = (n: number | null | undefined) => (n == null ? '' : Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : formatDose(n));
export const shortDay = (iso: string) => dayLabel(iso).replace(/ \d{4}$/, '');

export const bp = (v: Partial<VitalSign>) => (v.bp_systolic != null && v.bp_diastolic != null ? `${v.bp_systolic}/${v.bp_diastolic}` : v.bp_systolic != null ? `${v.bp_systolic}/—` : '');
export const o2 = (v: Partial<VitalSign>) => [v.o2_device, v.o2_flow_lpm != null ? `${formatDose(v.o2_flow_lpm)} L/min` : ''].filter(Boolean).join(' ');
export const hasObs = (x: ReportVitals) => x.v.heart_rate != null || x.v.bp_systolic != null || x.v.resp_rate != null || x.v.spo2 != null || x.v.temp_c != null;

/** The newest rows, oldest first. Rows from the hospital list only fill up what was not charted. */
export function lastObs(d: ReportData, n: number): ReportVitals[] {
  const charted = d.vitals.filter((x) => hasObs(x) && !x.fromList).slice(-n);
  const list = d.vitals.filter((x) => hasObs(x) && x.fromList);
  return charted.length < n ? [...list.slice(-(n - charted.length)), ...charted] : charted;
}
export const latest = (d: ReportData, has: (v: Partial<VitalSign>) => boolean): ReportVitals | undefined => [...d.vitals].reverse().find((x) => has(x.v));

export function allergyText(d: ReportData): string | null {
  const real = d.bundle.allergies.filter((a) => !isNoKnownAllergy(a));
  if (real.length) return real.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction.toLowerCase()})` : ''}`).join(', ');
  return d.bundle.allergies.length ? 'No known allergies' : null;
}

export const medDose = (m: MedAdmin) => [num(m.dose_given ?? m.dose_due), (m.dose_given != null ? m.dose_given_unit : m.dose_due_unit) ?? ''].filter(Boolean).join(' ');
export function medLine(m: MedAdmin): string {
  if (m.event === 'rate_changed') return `${m.drug_name} rate ${num(m.prior_infusion_rate)} to ${num(m.infusion_rate)} ${m.infusion_rate_unit ?? ''}`.trim();
  return [m.drug_name, medDose(m), m.route ?? ''].filter(Boolean).join(' ');
}
/** What happened besides "given". A dose that differs from the ordered one is written next to it, without a judgement. */
export function medNote(m: MedAdmin): string {
  const parts: string[] = [];
  if (m.event === 'held') parts.push('HELD');
  if (m.event === 'refused') parts.push('REFUSED');
  if (m.event === 'administered' && m.dose_given != null && m.dose_due != null && (m.dose_given !== m.dose_due || m.dose_given_unit !== m.dose_due_unit)) parts.push(`ordered ${num(m.dose_due)} ${m.dose_due_unit ?? ''}`.trim());
  if (m.site) parts.push(m.site);
  if (m.reason) parts.push(m.reason.replace(/^(held|patient refused):\s*/i, ''));
  return parts.join(', ');
}
export const orderLine = (o: ActiveOrder) => o.text;

const at = (x: { time: string; fromList: boolean }) => `@ ${hm(x.time)}${x.fromList ? ', hospital list' : ''}`;
const item = (t: string, o: Omit<Item, 't'> = {}): Item => ({ t, ...o });

export function neuro(d: ReportData): Item[] {
  return d.vitals.filter((x) => x.v.consciousness).slice(-2).map((x) => item(`${x.v.consciousness} ${at(x)}`));
}
export function pain(d: ReportData) {
  return d.vitals.filter((x) => x.v.pain_0_10 != null).map((x) => ({ time: x.time, score: x.v.pain_0_10! }));
}
export function cardiac(d: ReportData): Item[] {
  const x = latest(d, (v) => v.heart_rate != null || v.bp_systolic != null);
  return x ? [item([x.v.heart_rate != null ? `HR ${x.v.heart_rate}` : '', bp(x.v) ? `BP ${bp(x.v)}` : ''].filter(Boolean).join(', '), { calm: true }), item(at(x))] : [];
}
export function resp(d: ReportData): Item[] {
  const x = latest(d, (v) => v.resp_rate != null || v.spo2 != null);
  if (!x) return [];
  const values = [x.v.resp_rate != null ? `RR ${x.v.resp_rate}` : '', x.v.spo2 != null ? `SpO2 ${x.v.spo2}%` : ''].filter(Boolean).join(', ');
  return [item(values, { calm: true }), ...(o2(x.v) ? [item(`on ${o2(x.v)}`)] : []), item(at(x))];
}
const ioLine = (x: { time: string; x: { direction: 'in' | 'out'; category: string; volume_ml: number; method?: string | null } }) =>
  item(`${ioLabel(x.x.direction, x.x.category).replace(/ \(.*\)$/, '')} ${num(x.x.volume_ml)} mL @ ${hm(x.time)}${x.x.method === 'Estimated' ? ' (est.)' : ''}`);
export const gi = (d: ReportData) => d.io.filter((x) => ['oral', 'tube', 'emesis', 'ng'].includes(x.x.category)).map(ioLine);
export const gu = (d: ReportData) => d.io.filter((x) => x.x.category === 'urine').map(ioLine);
export const ioAll = (d: ReportData) => d.io.map(ioLine);

const scoreNotes = (d: ReportData, re: RegExp) => d.notes.filter((x) => re.test(x.n.score_name ?? ''));
const scored = (x: ReportData['notes'][number]) => item(`${x.n.score_name!.split(' ')[0]} ${num(x.n.score_value)}: ${x.n.text}`);
export const skinNotes = (d: ReportData) => scoreNotes(d, /^braden/i).map(scored);
export const safetyNotes = (d: ReportData) => scoreNotes(d, /^morse/i).map(scored);
export function otherNotes(d: ReportData, o: { all?: boolean } = {}): Item[] {
  return d.notes.filter((x) => o.all || !/^(braden|morse)/i.test(x.n.score_name ?? '')).map((x) => item(`${hm(x.time)} ${noteLabel(x.n.category)}: ${x.n.text}`, { mark: 'dash' }));
}

/** IV lines: the sites named in this patient's own medicine records. */
export function ivLines(d: ReportData): Item[] {
  const sites = new Map<string, string>();
  for (const { time, m } of d.meds) if (m.site && /IV line/i.test(m.site)) sites.set(m.site, time);
  return [
    ...[...sites].map(([s, t]) => item(`${s} — used ${hm(t)}`)),
    ...d.orders.filter((o) => o.type === 'iv' && o.frequency !== 'continuous infusion').map((o) => item(o.text)),
    ...drips(d),
  ];
}
/** Running infusions: newest recorded rate, otherwise the order. */
export function drips(d: ReportData): Item[] {
  return d.orders.filter((o) => o.frequency === 'continuous infusion').map((o) => {
    const change = [...d.meds].reverse().find((x) => x.m.order_id === o.id && x.m.infusion_rate != null);
    return item(change ? `${o.drug_name} ${num(change.m.infusion_rate)} ${change.m.infusion_rate_unit ?? ''} since ${hm(change.time)}` : `${o.text} (order)`, { calm: true });
  });
}
export const givenMeds = (d: ReportData) => d.meds.map(({ time, m }) => item([`${hm(time)} ${medLine(m)}`, medNote(m)].filter(Boolean).join(' — '), { mark: 'star', calm: true }));
export const medOrders = (d: ReportData) => d.orders.filter(isMedOrder).map((o) => item(o.text, { calm: true, mark: 'dash' }));
export const sizeLine = (d: ReportData) => [d.bundle.encounter?.height_cm != null ? `Ht ${formatDose(d.bundle.encounter.height_cm)} cm` : '', d.bundle.encounter?.weight_kg != null ? `Wt ${formatDose(d.bundle.encounter.weight_kg)} kg` : ''].filter(Boolean).join(', ');
export function plan(d: ReportData): Item[] {
  return [
    ...d.orders.filter((o) => o.type === 'nursing' || o.type === 'diet').map((o) => item(o.text, { mark: 'star' })),
    ...(d.handoff?.h.open_items ?? []).map((t) => item(t, { mark: 'star' })),
  ];
}
export function tests(d: ReportData): Item[] {
  return d.orders.filter((o) => o.type === 'lab' || o.type === 'imaging').map((o) => {
    const e = d.labEvents.filter((x) => x.l.order_id === o.id).at(-1);
    return item(`${o.text}${e ? ` — ${labLabel(e.l.status).toLowerCase()} ${hm(e.time)}` : ''}`, { mark: 'star' });
  });
}
export const pendingLabs = (d: ReportData) => d.labEvents.filter((x) => x.l.value_num == null && !x.l.value_text).map((x) => item(`${x.l.test_name} ${labLabel(x.l.status).toLowerCase()} ${hm(x.time)}`));

/** Printed lab boxes and the recorded test each one stands for. */
export const LAB_BOX: Record<string, RegExp> = {
  Hgb: /^h(a)?emoglobin$/i, Hct: /^h(a)?ematocrit$/i, WBC: /^white blood cells$|^wbc$/i, Plt: /^platelets?$/i, Na: /^sodium$/i, K: /^potassium$/i, Mg: /^magnesium$/i,
  Phos: /^phosph/i, Cr: /^creatinine$/i, BUN: /^(blood )?urea|^bun$/i, 'PT/INR': /^(pt|inr)\b/i, Troponin: /^troponin/i, Cl: /^chloride$/i, CO2: /^(co2|bicarbonate)/i, Gluc: /^(bedside )?glucose$/i,
  Ca: /^calcium$/i, TP: /^total protein/i, Alb: /^albumin$/i, AST: /^ast\b/i, ALT: /^alt\b/i, LDH: /^ldh\b/i, AP: /^alkaline/i, Bili: /^(total )?bilirubin/i, PTT: /^a?ptt\b/i, PT: /^pt\b/i, INR: /^inr\b/i,
};
export const labFor = (d: ReportData, box: string): ReportLab | undefined => d.labs.find((l) => LAB_BOX[box]!.test(l.name));
export const otherLabs = (d: ReportData, boxes: string[]) => d.labs.filter((l) => !boxes.some((b) => LAB_BOX[b]!.test(l.name)));
export const glucose = (d: ReportData) => [
  ...d.labs.filter((l) => l.fromList && LAB_BOX.Gluc!.test(l.name)).map((l) => ({ time: l.time, value: l.value, unit: l.unit })),
  ...d.vitals.filter((x) => x.v.glucose_mgdl != null).map((x) => ({ time: x.time, value: String(x.v.glucose_mgdl), unit: 'mg/dL' })),
].sort((a, b) => a.time.localeCompare(b.time));

export function handoverText(d: ReportData): Item[] {
  const h = d.handoff?.h;
  if (!h) return [];
  return [item(h.situation), item(h.background), item(h.assessment)].filter((x) => x.t.trim());
}
