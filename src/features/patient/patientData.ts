import { useLiveQuery } from 'dexie-react-hooks';
import type { DowntimeDB } from '../../db/db';
import type { Allergy, Encounter, Patient } from '../../db/schema';
import { useApp } from '../../state/app';

export interface PatientBundle {
  patient: Patient;
  encounter: Encounter | undefined;
  allergies: Allergy[];
}

export async function loadPatient(db: DowntimeDB, id: string): Promise<PatientBundle | null> {
  const patient = await db.patient.get(id);
  if (!patient) return null;
  const [encounter, allergies] = await Promise.all([
    db.encounter.where('patient_id').equals(id).first(),
    db.allergy.where('patient_id').equals(id).toArray(),
  ]);
  return { patient, encounter, allergies: allergies.filter((a) => a.status === 'active') };
}

/** undefined = still loading, null = not found. */
export function usePatient(id: string | undefined): PatientBundle | null | undefined {
  const { db } = useApp();
  return useLiveQuery(() => (id ? loadPatient(db, id) : Promise.resolve(null)), [db, id]);
}

export const fullName = (p: Patient) => `${p.given_name} ${p.family_name}`;
export const sexLabel = (s: Patient['sex']) => ({ male: 'Male', female: 'Female', other: 'Other', unknown: 'Unknown' })[s];
export const isNoKnownAllergy = (a: Allergy) => /^no known/i.test(a.substance);
