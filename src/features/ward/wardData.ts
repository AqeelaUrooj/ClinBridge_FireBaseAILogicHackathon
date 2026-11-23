/**
 * Read-only facts for the ward board and the patient summary, derived from the saved records.
 * No clinical interpretation: no NEWS2, no thresholds, no timing windows. "Due" means a scheduled time today that
 * has no record yet (the same rule as the medicines page); it never means overdue.
 */
import type { DowntimeDB } from '../../db/db';
import type { ActiveOrder, Entry, IntakeOutput, LabEvent, MedAdmin, VitalSign } from '../../db/schema';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import { isHighAlert, isMedOrder, orderDose, orderGroup, slotStatuses } from '../../lib/meds';
import { ioTotals } from '../../lib/charting';
import { formatDose } from '../../lib/dose';
import { loadPatient, type PatientBundle } from '../patient/patientData';

export interface Measure { label: string; value: string; unit?: string; time: string; tone?: 'red' }
export interface DueDose { order: ActiveOrder; time: string; highAlert: boolean }
export interface MedRecord { entryId: string; drug: string; dose: string; event: string; time: string; performerId: string; reason: string | null; differsFromOrder: string | null }
export interface CriticalLab { entryId: string; test: string; value: string; resultTime: string | null; calledTo: string | null; readBack: boolean | null }

export interface PatientFacts extends PatientBundle {
  orders: ActiveOrder[];
  entries: EntryWithChild[];
  drafts: Entry[];
  critical: CriticalLab | null;
  /** Up to four headline values for the collapsed ward card. */
  tiles: Measure[];
  /** The other latest vital signs, for the expanded card. */
  more: Measure[];
  due: DueDose[];
  given: MedRecord[];
  holds: MedRecord[];
  careOrders: ActiveOrder[];
  io: { totalIn: number; totalOut: number; balance: number; count: number };
  lastObs: string | null;
}

const isLive = (e: Entry) => e.status === 'confirmed' || e.status === 'draft';

/** Recorded dose that is not the ordered dose (same comparison the medicine form warns about). Null when equal or not comparable. */
export function doseDifference(m: MedAdmin): string | null {
  if (m.event !== 'administered' || m.dose_given == null || m.dose_due == null) return null;
  if (m.dose_given === m.dose_due && (m.dose_given_unit ?? '') === (m.dose_due_unit ?? '')) return null;
  return `Recorded ${formatDose(m.dose_given)} ${m.dose_given_unit ?? ''} · order says ${formatDose(m.dose_due)} ${m.dose_due_unit ?? ''}`.replace(/\s+/g, ' ').trim();
}

/** Latest confirmed value of each measure, each with its own measurement time (values may come from different records). */
export function latestMeasures(entries: EntryWithChild[]): Record<string, Measure> {
  const out: Record<string, Measure> = {};
  const vitals = entries.filter((x) => x.entry.type === 'vital_sign' && x.entry.status === 'confirmed' && x.child);
  for (const { entry, child } of [...vitals].sort((a, b) => b.entry.care_time.localeCompare(a.entry.care_time))) {
    const v = child as VitalSign, time = entry.care_time;
    const put = (k: string, label: string, value: string | null, unit?: string) => { if (value != null && !out[k]) out[k] = { label, value, unit, time }; };
    put('bp', 'NIBP', v.bp_systolic != null ? `${v.bp_systolic}/${v.bp_diastolic ?? '?'}` : null);
    put('hr', 'HR', v.heart_rate != null ? String(v.heart_rate) : null, 'bpm');
    put('spo2', 'SpO₂', v.spo2 != null ? String(v.spo2) : null, '%');
    put('temp', 'Temp', v.temp_c != null ? String(v.temp_c) : null, '°C');
    put('rr', 'Resp', v.resp_rate != null ? String(v.resp_rate) : null, '/min');
    put('pain', 'Pain', v.pain_0_10 != null ? `${v.pain_0_10} / 10` : null);
    put('bgl', 'Blood sugar', v.glucose_mgdl != null ? String(v.glucose_mgdl) : null, 'mg/dL');
    put('o2', 'O₂ therapy', v.o2_flow_lpm != null ? String(v.o2_flow_lpm) : v.o2_device || null, v.o2_flow_lpm != null ? 'L/min' : undefined);
    put('avpu', 'Awake?', v.consciousness || null);
  }
  return out;
}

/**
 * Headline tiles, at most four, in a fixed order: critical lab, then what is special about this patient's records
 * (oxygen therapy, blood sugar, fluids today), then the usual vital signs. Display order only, not a priority score.
 */
export function headlineTiles(m: Record<string, Measure>, critical: CriticalLab | null, io: PatientFacts['io'], ioTime: string | null): { tiles: Measure[]; more: Measure[] } {
  const special: Measure[] = [];
  if (critical) special.push({ label: critical.test, value: critical.value, time: critical.resultTime ?? '', tone: 'red' });
  if (m.o2) special.push(m.o2);
  if (m.bgl) special.push(m.bgl);
  if (io.count && ioTime) special.push({ label: 'Intake', value: String(io.totalIn), unit: 'mL', time: ioTime }, { label: 'Output', value: String(io.totalOut), unit: 'mL', time: ioTime });
  const usual = [m.bp, m.hr, m.spo2, m.temp, m.pain, m.rr, m.avpu].filter((x): x is Measure => !!x);
  const head = special.slice(0, 2);
  const tiles = [...head, ...usual].slice(0, 4);
  const more = [...special, ...usual].filter((x) => !tiles.includes(x));
  return { tiles, more };
}

export async function loadFacts(db: DowntimeDB, patientId: string, nowIso: string): Promise<PatientFacts | null> {
  const bundle = await loadPatient(db, patientId);
  if (!bundle) return null;
  const [entries, allOrders] = await Promise.all([
    listPatientEntries(db, patientId),
    bundle.encounter ? db.active_order.where('encounter_id').equals(bundle.encounter.id).toArray() : Promise.resolve([] as ActiveOrder[]),
  ]);
  const orders = allOrders.filter((o) => o.status === 'active');
  const today = nowIso.slice(0, 10);
  const meds = entries.filter((x) => x.entry.type === 'med_admin');
  const due = orders
    .filter((o) => isMedOrder(o) && orderGroup(o) === 'scheduled')
    .flatMap((o) => slotStatuses(o, nowIso, meds).filter((s) => s.status === 'due' || s.status === 'overdue').map((s) => ({ order: o, time: s.time, highAlert: isHighAlert(o.drug_name) })))
    .sort((a, b) => a.time.localeCompare(b.time));
  const medRecords: MedRecord[] = meds
    .filter((x) => x.entry.status === 'confirmed' && x.child && x.entry.care_time.slice(0, 10) === today)
    .map((x) => {
      const c = x.child as MedAdmin;
      return {
        entryId: x.entry.id, drug: c.drug_name, dose: c.dose_given != null ? `${formatDose(c.dose_given)} ${c.dose_given_unit ?? ''}`.trim() : '',
        event: c.event, time: x.entry.care_time, performerId: x.entry.performer_id, reason: c.reason ?? null, differsFromOrder: doseDifference(c),
      };
    });
  const labItem = entries.find((x) => x.entry.type === 'lab_event' && isLive(x.entry) && (x.child as LabEvent | undefined)?.status === 'critical');
  const lab = labItem?.child as LabEvent | undefined;
  const critical: CriticalLab | null = lab ? {
    entryId: labItem!.entry.id, test: lab.test_name, value: `${lab.value_num ?? lab.value_text ?? '—'}${lab.unit ? ` ${lab.unit}` : ''}`,
    resultTime: lab.result_time ?? null, calledTo: lab.called_to ?? null, readBack: lab.read_back ?? null,
  } : null;
  const ioItems = entries.filter((x) => x.entry.type === 'intake_output' && x.entry.status === 'confirmed' && x.entry.care_time.slice(0, 10) === today && x.child);
  const io = { ...ioTotals(ioItems.map((x) => x.child as IntakeOutput)), count: ioItems.length };
  const { tiles, more } = headlineTiles(latestMeasures(entries), critical, io, ioItems[0]?.entry.care_time ?? null);
  const lastVital = entries.find((x) => x.entry.type === 'vital_sign' && x.entry.status === 'confirmed');
  return {
    ...bundle, orders, entries, drafts: entries.filter((x) => x.entry.status === 'draft').map((x) => x.entry), critical, tiles, more, due,
    given: medRecords.filter((r) => r.event === 'administered' || r.event === 'rate_changed'),
    holds: medRecords.filter((r) => r.event === 'held' || r.event === 'refused'),
    careOrders: orders.filter((o) => !isMedOrder(o)), io, lastObs: lastVital?.entry.care_time ?? null,
  };
}

export async function loadWardFacts(db: DowntimeDB, nowIso: string): Promise<PatientFacts[]> {
  const ids = (await db.patient.toArray()).map((p) => p.id);
  return (await Promise.all(ids.map((id) => loadFacts(db, id, nowIso)))).filter((x): x is PatientFacts => !!x);
}

export type WardSort = 'bed' | 'name' | 'oldest-obs';
export function sortWard(rows: PatientFacts[], by: WardSort): PatientFacts[] {
  const bed = (a: PatientFacts, b: PatientFacts) => (a.encounter?.bed ?? '').localeCompare(b.encounter?.bed ?? '');
  return [...rows].sort((a, b) => {
    if (by === 'name') return a.patient.family_name.localeCompare(b.patient.family_name) || bed(a, b);
    if (by === 'oldest-obs') return (a.lastObs ?? '').localeCompare(b.lastObs ?? '') || bed(a, b);
    return bed(a, b);
  });
}

export const doseLine = (o: ActiveOrder) => [o.drug_name ?? o.text, orderDose(o), o.route].filter(Boolean).join(' ');
