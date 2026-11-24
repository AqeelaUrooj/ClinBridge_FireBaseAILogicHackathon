import type { DowntimeDB } from '../../db/db';
import type { ActiveOrder, Handoff, IntakeOutput, LabEvent, MedAdmin, Note, SnapshotResult, VitalSign } from '../../db/schema';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import { listHandoffs } from '../../db/repos/handoff';
import { ioTotals } from '../../lib/charting';
import { isMedOrder } from '../../lib/meds';
import { ageOn } from '../../lib/time';
import { loadPatient, type PatientBundle } from '../patient/patientData';
import { medicationSites } from '../body/medicationSites';

/**
 * What a synthetic Practice report may say: one patient's records, read from the existing tables by PATIENT ID.
 * Reads only. Drafts, records marked as a mistake and retired versions are left out. Nothing is invented: what is not
 * recorded stays empty and the sheet says "Not recorded".
 */
export interface ReportVitals {
  time: string;
  v: Partial<VitalSign>;
  /** Copied from the hospital's patient list before the downtime, not charted here. */
  fromList: boolean;
  /** Fixed record: the old values of the version it replaces. */
  was?: Partial<VitalSign>;
}
export interface ReportMed { time: string; m: MedAdmin }
export interface ReportLab { name: string; value: string; unit: string; flag: 'low' | 'high' | 'critical' | null; time: string; fromList: boolean }
export interface ReportData {
  bundle: PatientBundle;
  nowIso: string;
  age: number;
  orders: ActiveOrder[];
  /** Oldest first. */
  vitals: ReportVitals[];
  meds: ReportMed[];
  io: { time: string; x: IntakeOutput }[];
  ioTotals: { totalIn: number; totalOut: number; balance: number };
  notes: { time: string; n: Note }[];
  /** Newest value of each test. */
  labs: ReportLab[];
  labEvents: { time: string; l: LabEvent }[];
  sites: ReturnType<typeof medicationSites>;
  handoff?: { h: Handoff; savedAt: string | null };
}

export class PracticeOnlyError extends Error {
  constructor() {
    super('Synthetic reports are for Practice data only.');
    this.name = 'PracticeOnlyError';
  }
}

/** The vital signs the hospital list gives as single rows, by their code. */
const LIST_VITAL: Record<string, keyof VitalSign> = {
  '8310-5': 'temp_c', '8867-4': 'heart_rate', '9279-1': 'resp_rate', '8480-6': 'bp_systolic', '8462-4': 'bp_diastolic', '2708-6': 'spo2', '59408-5': 'spo2',
};

function listVitals(rows: SnapshotResult[]): ReportVitals[] {
  const byTime = new Map<string, Partial<VitalSign>>();
  for (const r of rows) {
    const key = r.kind === 'vital' && r.code ? LIST_VITAL[r.code] : undefined;
    if (!key || r.value_num == null) continue;
    byTime.set(r.time, { ...byTime.get(r.time), [key]: r.value_num });
  }
  return [...byTime].map(([time, v]) => ({ time, v, fromList: true }));
}

const byTime = <T extends { time: string }>(a: T, b: T) => a.time.localeCompare(b.time);

function labValues(rows: SnapshotResult[], events: { time: string; l: LabEvent }[]): ReportLab[] {
  const all: ReportLab[] = rows.filter((r) => r.kind === 'lab' && (r.value_num != null || r.value_text)).map((r) => ({
    name: r.name, value: r.value_num != null ? String(r.value_num) : r.value_text!, unit: r.unit ?? '', time: r.time, fromList: true,
    flag: r.abnormal_flag === 'low' || r.abnormal_flag === 'high' || r.abnormal_flag === 'critical' ? r.abnormal_flag : null,
  }));
  for (const { time, l } of events) {
    if (l.value_num == null && !l.value_text) continue;
    all.push({ name: l.test_name, value: l.value_num != null ? String(l.value_num) : l.value_text!, unit: l.unit ?? '', time: l.result_time ?? time, fromList: false, flag: l.status === 'critical' ? 'critical' : null });
  }
  const newest = new Map<string, ReportLab>();
  for (const x of all.sort(byTime)) newest.set(x.name.toLowerCase(), x);
  return [...newest.values()];
}

export async function loadReportData(db: DowntimeDB, patientId: string, nowIso: string): Promise<ReportData | null> {
  // Checked here as well as on the page, so no other caller can draw a look-alike sheet from Real records.
  if (db.dataset !== 'practice') throw new PracticeOnlyError();
  const bundle = await loadPatient(db, patientId);
  if (!bundle) return null;
  const enc = bundle.encounter;
  const [orders, results, entries, handoffs] = await Promise.all([
    enc ? db.active_order.where('encounter_id').equals(enc.id).toArray() : Promise.resolve([] as ActiveOrder[]),
    db.snapshot_result.where('patient_id').equals(patientId).toArray(),
    listPatientEntries(db, patientId),
    listHandoffs(db, patientId),
  ]);
  const byId = new Map(entries.map((x) => [x.entry.id, x]));
  const now = entries.filter((x) => x.entry.patient_id === patientId && x.entry.status === 'confirmed' && x.child);
  const of = <T>(type: string) => now.filter((x) => x.entry.type === type).map((x) => ({ time: x.entry.care_time, x, child: x.child as T }));
  const replaced = (x: EntryWithChild) => (x.entry.supersedes_id ? byId.get(x.entry.supersedes_id) : undefined);

  const vitals: ReportVitals[] = [
    ...listVitals(results),
    ...of<VitalSign>('vital_sign').map(({ time, x, child }) => ({ time, v: child, fromList: false, ...(replaced(x)?.child ? { was: replaced(x)!.child as VitalSign } : {}) })),
  ].sort(byTime);
  const io = of<IntakeOutput>('intake_output').map(({ time, child }) => ({ time, x: child })).sort(byTime);
  const labEvents = of<LabEvent>('lab_event').map(({ time, child }) => ({ time, l: child })).sort(byTime);
  const latest = handoffs[0];
  return {
    bundle, nowIso, age: ageOn(bundle.patient.birth_date, nowIso),
    orders: orders.filter((o) => o.status === 'active').sort((a, b) => Number(isMedOrder(b)) - Number(isMedOrder(a)) || a.text.localeCompare(b.text)),
    vitals,
    meds: of<MedAdmin>('med_admin').map(({ time, child }) => ({ time, m: child })).sort(byTime),
    io, ioTotals: ioTotals(io.map((i) => i.x)),
    notes: of<Note>('note').map(({ time, child }) => ({ time, n: child })).sort(byTime),
    labs: labValues(results, labEvents), labEvents,
    sites: medicationSites(patientId, entries),
    ...(latest ? { handoff: { h: latest.handoff, savedAt: latest.savedAt } } : {}),
  };
}
