/**
 * Data for the printable downtime forms (DT-MAR-01, DT-VIT-02, DT-SBAR-03), read from the existing tables only.
 * Nothing here writes, and nothing is invented: a value that is not in the records is left out (the form then
 * shows an empty box for the nurse to write in).
 */
import type { DowntimeDB } from '../../db/db';
import type { ActiveOrder, Handoff, IntakeOutput, VitalSign } from '../../db/schema';
import { listPatientEntries } from '../../db/repos/entries';
import { listHandoffs } from '../../db/repos/handoff';
import { isHighAlert, isMedOrder, orderGroup, slotStatuses, type OrderGroup, type Slot } from '../../lib/meds';
import { ioTotals } from '../../lib/charting';
import { loadPatient, type PatientBundle } from '../patient/patientData';

export type FormKind = 'mar' | 'vit' | 'sbar';

export const FORMS: Record<FormKind, { code: string; title: string; short: string }> = {
  mar: { code: 'DT-MAR-01', title: 'Bedside medication administration record', short: 'Medication record (MAR)' },
  vit: { code: 'DT-VIT-02', title: 'Vitals, neurological observations and fluid balance', short: 'Vitals, neuro and I/O' },
  sbar: { code: 'DT-SBAR-03', title: 'SBAR handover and verbal orders (paper)', short: 'SBAR handover' },
};
export const FORM_ORDER: FormKind[] = ['mar', 'vit', 'sbar'];
export const isFormKind = (v: string | undefined): v is FormKind => v === 'mar' || v === 'vit' || v === 'sbar';

export interface PrintOrder {
  order: ActiveOrder;
  group: OrderGroup;
  highAlert: boolean;
  /** Today's scheduled times with what ClinBridge has recorded for each (Due = nothing recorded yet). */
  slots: Slot[];
}

export interface PrintData {
  bundle: PatientBundle;
  orders: PrintOrder[];
  /** Up to 3 latest confirmed vital-sign records, newest first. */
  recentVitals: { entryId: string; time: string; v: VitalSign }[];
  /** Today's confirmed intake/output (calendar day of the clock), plain sums. */
  ioToday: { day: string; count: number; totalIn: number; totalOut: number; balance: number };
  /** Newest saved handover, if any. */
  handoff?: { handoff: Handoff; savedAt: string | null; author: string | null };
}

const GROUP_RANK: Record<OrderGroup, number> = { scheduled: 0, infusion: 1, prn: 2 };

export async function loadPrintData(db: DowntimeDB, patientId: string, nowIso: string): Promise<PrintData | null> {
  const bundle = await loadPatient(db, patientId);
  if (!bundle) return null;
  const enc = bundle.encounter;
  const [orderRows, entries, handoffs] = await Promise.all([
    enc ? db.active_order.where('encounter_id').equals(enc.id).toArray() : Promise.resolve([] as ActiveOrder[]),
    listPatientEntries(db, patientId),
    listHandoffs(db, patientId),
  ]);
  const meds = entries.filter((x) => x.entry.type === 'med_admin');
  const orders = orderRows
    .filter((o) => isMedOrder(o) && o.status === 'active')
    .map((o) => ({ order: o, group: orderGroup(o), highAlert: isHighAlert(o.drug_name), slots: slotStatuses(o, nowIso, meds) }))
    .sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || (a.order.drug_name ?? a.order.text).localeCompare(b.order.drug_name ?? b.order.text));

  const recentVitals = entries
    .filter((x) => x.entry.type === 'vital_sign' && x.entry.status === 'confirmed' && x.child)
    .slice(0, 3)
    .map((x) => ({ entryId: x.entry.id, time: x.entry.care_time, v: x.child as VitalSign }));

  const day = nowIso.slice(0, 10);
  const ios = entries
    .filter((x) => x.entry.type === 'intake_output' && x.entry.status === 'confirmed' && x.entry.care_time.slice(0, 10) === day && x.child)
    .map((x) => x.child as IntakeOutput);
  const t = ioTotals(ios);

  let handoff: PrintData['handoff'];
  const latest = handoffs[0];
  if (latest) {
    const who = await db.practitioner.get(latest.handoff.created_by);
    handoff = { handoff: latest.handoff, savedAt: latest.savedAt, author: who?.name ?? null };
  }
  return { bundle, orders, recentVitals, ioToday: { day, count: ios.length, ...t }, handoff };
}

/** Ward list for the packet builder: every patient in this dataset, by bed. */
export async function loadWardForPrint(db: DowntimeDB): Promise<PatientBundle[]> {
  const ids = (await db.patient.toArray()).map((p) => p.id);
  const all = (await Promise.all(ids.map((id) => loadPatient(db, id)))).filter((x): x is PatientBundle => !!x);
  return all.sort((a, b) => (a.encounter?.bed ?? '').localeCompare(b.encounter?.bed ?? '') || a.patient.family_name.localeCompare(b.patient.family_name));
}
