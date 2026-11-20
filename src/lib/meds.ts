import type { ActiveOrder, Entry, MedAdmin } from '../db/schema';
import type { EntryWithChild } from '../db/repos/entries';
import { DOSE_UNITS, RATE_UNITS, ROUTES } from '../config/medicationPolicy';
import { ACTIVE_CLINICAL_POLICY, type ClinicalPolicy, type HighAlertEntry } from '../config/clinicalPolicy';
import { formatDose } from './dose';

/**
 * Medication rules. Structural checks block; differences from the order are warnings the nurse must tick.
 * High-alert doses cannot be saved without a second, different nurse's PIN (documented rule).
 * No dose-range checking, no interaction checking: those need clinical content that is not approved.
 */

export type MedEvent = 'administered' | 'held' | 'refused' | 'rate_changed';
export const EVENT_LABEL: Record<MedEvent, string> = { administered: 'Given', held: 'Held', refused: 'Refused', rate_changed: 'Rate changed' };

/** The high-alert entry for this drug in the active policy, if any. Not being listed does NOT mean a drug is low risk. */
export function highAlertEntry(drug: string | null | undefined, policy: ClinicalPolicy = ACTIVE_CLINICAL_POLICY): HighAlertEntry | undefined {
  if (!drug) return undefined;
  const d = drug.toLowerCase();
  return policy.highAlert.entries.find((e) => e.match.some((m) => d.includes(m.toLowerCase())));
}
export const isHighAlert = (drug: string | null | undefined, policy?: ClinicalPolicy): boolean => !!highAlertEntry(drug, policy);

/** Does this event on this drug need a second nurse under the active policy? */
export function needsSecondNurse(drug: string | null | undefined, event: string, policy: ClinicalPolicy = ACTIVE_CLINICAL_POLICY): boolean {
  const e = highAlertEntry(drug, policy);
  return !!e && e.verification === 'second_nurse_pin' && (e.events as string[]).includes(event);
}

export type OrderGroup = 'scheduled' | 'prn' | 'infusion';
export function orderGroup(o: ActiveOrder): OrderGroup {
  if ((o.frequency ?? '').toLowerCase().includes('continuous')) return 'infusion';
  if (o.prn) return 'prn';
  return 'scheduled';
}

export const isMedOrder = (o: ActiveOrder) => o.type === 'med' || o.type === 'iv';

/** Order dose in plain text, e.g. "0.5 mg" — never a trailing zero. */
export const orderDose = (o: ActiveOrder) => (o.dose != null ? `${formatDose(o.dose)} ${o.dose_unit ?? ''}`.trim() : '');

/** Scheduled times for one day as ISO strings with the clock's offset. dayIso = any ISO on that day. */
export function slotsForDay(o: ActiveOrder, dayIso: string): string[] {
  const day = dayIso.slice(0, 10), off = dayIso.slice(19);
  return (o.scheduled_times ?? []).map((t) => `${day}T${t}:00${off}`);
}

export type SlotStatus = 'due' | 'overdue' | 'given' | 'held' | 'refused' | 'draft';
export interface Slot { time: string; status: SlotStatus; entry?: Entry }

/** The approved timing window for this order, if the active policy has one. None today (no approved policy). */
export function timingWindow(o: ActiveOrder, policy: ClinicalPolicy = ACTIVE_CLINICAL_POLICY) {
  if (!policy.medicationTiming.approved) return undefined;
  const drug = (o.drug_name ?? '').toLowerCase(), freq = (o.frequency ?? '').toLowerCase();
  return policy.medicationTiming.windows.find((w) => {
    const { drugMatch, frequency } = w.appliesTo;
    if (!drugMatch?.length && !frequency?.length) return false;
    return (!drugMatch?.length || drugMatch.some((m) => drug.includes(m.toLowerCase())))
      && (!frequency?.length || frequency.some((f) => freq === f.toLowerCase()));
  });
}

/**
 * Status of each scheduled time = the live (not corrected / not mistake) entry recorded for that time.
 * Unrecorded times are Due. Overdue appears ONLY when an approved timing window covers this order.
 * nowIso doubles as "which day".
 */
export function slotStatuses(o: ActiveOrder, nowIso: string, meds: EntryWithChild[], policy: ClinicalPolicy = ACTIVE_CLINICAL_POLICY): Slot[] {
  const win = timingWindow(o, policy);
  return slotsForDay(o, nowIso).map((time) => {
    const hit = meds.find((x) => (x.child as MedAdmin | undefined)?.order_id === o.id && x.entry.scheduled_time === time && (x.entry.status === 'confirmed' || x.entry.status === 'draft'));
    if (!hit) return { time, status: win && Date.parse(nowIso) > Date.parse(time) + win.lateMinutes * 60_000 ? 'overdue' : 'due' };
    if (hit.entry.status === 'draft') return { time, status: 'draft', entry: hit.entry };
    const ev = (hit.child as MedAdmin).event;
    return { time, status: ev === 'held' ? 'held' : ev === 'refused' ? 'refused' : 'given', entry: hit.entry };
  });
}

/** Live administrations for one order, newest first. */
export const orderHistory = (o: ActiveOrder, meds: EntryWithChild[]) =>
  meds.filter((x) => (x.child as MedAdmin | undefined)?.order_id === o.id);

export function lastGiven(o: ActiveOrder, meds: EntryWithChild[]): EntryWithChild | undefined {
  return orderHistory(o, meds).find((x) => x.entry.status === 'confirmed' && (x.child as MedAdmin).event === 'administered');
}

/** Current infusion rate: latest confirmed rate change, else the ordered starting rate. */
export function currentRate(o: ActiveOrder, meds: EntryWithChild[]): { rate: number | null; unit: string | null } {
  const rc = orderHistory(o, meds).find((x) => x.entry.status === 'confirmed' && (x.child as MedAdmin).event === 'rate_changed');
  if (rc) { const m = rc.child as MedAdmin; return { rate: m.infusion_rate ?? null, unit: m.infusion_rate_unit ?? null }; }
  return { rate: o.dose ?? null, unit: o.dose_unit ?? null };
}

/* ------------------------------ form validation ------------------------------ */

export interface MedForm {
  event: MedEvent;
  dose: string;
  unit: string;
  route: string;
  site: string;
  rate: string;
  rateUnit: string;
  reason: string;
}

export interface MedValidation {
  ok: boolean;
  errors: Partial<Record<keyof MedForm, string>>;
  warnings: string[];
  needsSecondCheck: boolean;
  values: Omit<MedAdmin, 'id' | 'entry_id'>;
}

const POSITIVE = /^\d{1,5}(\.\d{1,3})?$/;

export function validateMed(form: MedForm, order: ActiveOrder, priorRate: number | null): MedValidation {
  const errors: MedValidation['errors'] = {};
  const warnings: string[] = [];
  const values: Omit<MedAdmin, 'id' | 'entry_id'> = {
    order_id: order.id, drug_name: order.drug_name ?? order.text, rxnorm_code: order.rxnorm_code ?? null,
    event: form.event, dose_due: order.dose ?? null, dose_due_unit: order.dose_unit ?? null,
    dose_given: null, dose_given_unit: null, route: null, site: form.site.trim() || null, end_time: null,
    infusion_rate: null, infusion_rate_unit: null, prior_infusion_rate: null,
    reason: form.reason.trim() || null, double_checked: null, double_checked_by: null, raw_text: null,
  };

  if (form.event === 'administered') {
    const raw = form.dose.trim();
    if (!raw) errors.dose = 'Enter the dose given';
    else if (!POSITIVE.test(raw) || Number(raw) <= 0) errors.dose = 'A number above 0';
    else values.dose_given = Number(raw);
    if (!(DOSE_UNITS as readonly string[]).includes(form.unit)) errors.unit = 'Pick a unit';
    else values.dose_given_unit = form.unit;
    if (!(ROUTES as readonly string[]).includes(form.route)) errors.route = 'Pick how it was given';
    else values.route = form.route;
    if (values.dose_given != null && order.dose != null && values.dose_given !== order.dose) {
      warnings.push(`Dose ${formatDose(values.dose_given)} ${form.unit} is different from the order (${orderDose(order)})`);
    }
    if (values.dose_given_unit && order.dose_unit && values.dose_given_unit !== order.dose_unit) {
      warnings.push(`Unit ${values.dose_given_unit} is different from the order (${order.dose_unit})`);
    }
    if (values.route && order.route && values.route !== order.route) {
      warnings.push(`Route ${values.route} is different from the order (${order.route})`);
    }
  }

  if (form.event === 'held' || form.event === 'refused') {
    if (!values.reason) errors.reason = form.event === 'held' ? 'Say why it was held' : 'Say what the patient said';
    values.route = order.route ?? null;
  }

  if (form.event === 'rate_changed') {
    const raw = form.rate.trim();
    if (!raw) errors.rate = 'Enter the new rate';
    else if (!POSITIVE.test(raw)) errors.rate = 'A number (0 or more)';
    else values.infusion_rate = Number(raw);
    if (!(RATE_UNITS as readonly string[]).includes(form.rateUnit)) errors.rateUnit = 'Pick a unit';
    else values.infusion_rate_unit = form.rateUnit;
    values.prior_infusion_rate = priorRate;
    values.route = order.route ?? null;
    if (values.infusion_rate != null && priorRate != null && values.infusion_rate === priorRate) warnings.push('New rate is the same as the current rate');
  }

  const needsSecondCheck = needsSecondNurse(values.drug_name, form.event);
  return { ok: Object.keys(errors).length === 0, errors, warnings, needsSecondCheck, values };
}

export function medFormFromOrder(order: ActiveOrder, event: MedEvent, prior?: MedAdmin): MedForm {
  return {
    event,
    dose: prior?.dose_given != null ? formatDose(prior.dose_given) : order.dose != null && orderGroup(order) !== 'infusion' ? formatDose(order.dose) : '',
    unit: prior?.dose_given_unit ?? (orderGroup(order) !== 'infusion' ? order.dose_unit ?? '' : ''),
    route: prior?.route ?? order.route ?? '',
    site: prior?.site ?? '',
    rate: prior?.infusion_rate != null ? formatDose(prior.infusion_rate) : '',
    rateUnit: prior?.infusion_rate_unit ?? (orderGroup(order) === 'infusion' ? order.dose_unit ?? '' : ''),
    reason: prior?.reason ?? '',
  };
}
