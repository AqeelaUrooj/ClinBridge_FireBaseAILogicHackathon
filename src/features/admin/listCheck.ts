/** Checks the patient list that is stored on this laptop. Compares counts and links only; changes nothing. */
import type { ActiveOrder, Allergy, Encounter, Patient, Snapshot, SnapshotResult } from '../../db/schema';

export interface StoredList { snapshot?: Snapshot | null; patient: Patient[]; encounter: Encounter[]; allergy: Allergy[]; active_order: ActiveOrder[]; snapshot_result: SnapshotResult[] }
export interface ListRow { label: string; ok: boolean | null; detail: string }

const TABLES = [['patient', 'Patients'], ['encounter', 'Stays'], ['allergy', 'Allergies'], ['active_order', 'Orders'], ['snapshot_result', 'Results']] as const;

export function checkStoredList(l: StoredList): ListRow[] {
  const out: ListRow[] = [];
  for (const [t, label] of TABLES) {
    const here = l[t].length, want = l.snapshot?.row_counts?.[t];
    out.push({ label, ok: want == null ? null : here === want, detail: want == null ? `${here} here; the list does not say how many it should have` : `${here} here, ${want} in the list` });
  }
  const patients = new Set(l.patient.map((p) => p.id)), stays = new Set(l.encounter.map((e) => e.id));
  const links = (label: string, lost: number, what: string) => out.push({ label, ok: lost === 0, detail: lost === 0 ? `Every ${what}` : `${lost} without one` });
  links('Stay has a patient', l.encounter.filter((e) => !patients.has(e.patient_id)).length, 'stay points to a patient here');
  links('Allergy has a patient', l.allergy.filter((a) => !patients.has(a.patient_id)).length, 'allergy points to a patient here');
  links('Order has a stay', l.active_order.filter((o) => !stays.has(o.encounter_id)).length, 'order points to a stay here');
  links('Result has a patient', l.snapshot_result.filter((r) => !patients.has(r.patient_id)).length, 'result points to a patient here');
  const noAllergy = l.patient.filter((p) => !l.allergy.some((a) => a.patient_id === p.id)).length;
  out.push({ label: 'Allergies recorded', ok: noAllergy === 0 ? true : null, detail: noAllergy === 0 ? 'Every patient has an allergy line or "No known allergies"' : `${noAllergy} patients have no allergy line at all` });
  const mrn = new Set(l.patient.map((p) => p.mrn));
  out.push({ label: 'MRN used once', ok: mrn.size === l.patient.length, detail: mrn.size === l.patient.length ? 'No MRN is used twice' : `${l.patient.length - mrn.size} MRN used more than once` });
  return out;
}
