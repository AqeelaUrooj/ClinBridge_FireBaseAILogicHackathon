import type { Allergy, Encounter, Patient, PatientOrigin, IdentityStatus, Practitioner, Role } from '../db/schema';
import { ADMISSION_POLICY, ALLERGY_STATUS_LABEL, type AdmissionAction } from '../config/admissionPolicy';
import type { Phase } from './phase';

/* ------------------------------ Stays ------------------------------ */

export const isActiveStay = (e: Encounter | undefined | null) => !!e && (e.status ?? 'active') !== 'discharged';

/**
 * The stay a patient's records belong to now: the active stay (newest admission if, by mistake, there are two),
 * otherwise the newest discharged stay (read only). Never "whichever id sorts first".
 */
export function currentEncounter(stays: Encounter[]): Encounter | undefined {
  const newest = (a: Encounter, b: Encounter) => Date.parse(b.admit_time) - Date.parse(a.admit_time) || b.id.localeCompare(a.id);
  const active = stays.filter((e) => isActiveStay(e)).sort(newest);
  return active[0] ?? [...stays].sort(newest)[0];
}

/** One stay per patient (the current one), for pages that look stays up by patient id. */
export function staysByPatient(stays: Encounter[]): Map<string, Encounter> {
  const groups = new Map<string, Encounter[]>();
  for (const e of stays) groups.set(e.patient_id, [...(groups.get(e.patient_id) ?? []), e]);
  return new Map([...groups].map(([id, list]) => [id, currentEncounter(list)!]));
}

export const locationLabel = (e: Pick<Encounter, 'unit' | 'bed' | 'room'> | undefined | null) =>
  e ? `${e.unit}${e.room ? `, room ${e.room}` : ''}${e.bed ? `, bed ${e.bed}` : ''}` : 'No location';

/* ------------------------------ Patient origin and identity ------------------------------ */

export const isLocallyRegistered = (p: Pick<Patient, 'origin'>) => p.origin === 'admission_registered' || p.origin === 'nurse_provisional';
export const isProvisional = (p: Pick<Patient, 'origin'>) => p.origin === 'nurse_provisional';
export const identityStatus = (p: Pick<Patient, 'identity_status'>): IdentityStatus => p.identity_status ?? 'not_required';
export const needsReconciliation = (p: Pick<Patient, 'identity_status'>) => identityStatus(p) === 'pending_verification' || identityStatus(p) === 'under_review';

export const ORIGIN_LABEL: Record<PatientOrigin, string> = {
  hospital_list: 'Hospital patient list',
  practice_seed: 'Practice patient list',
  admission_registered: 'Registered here by admissions',
  nurse_provisional: 'Provisional, registered by a nurse during downtime',
};
export const originLabel = (p: Pick<Patient, 'origin'>) => (p.origin ? ORIGIN_LABEL[p.origin] : 'Patient list');

export const IDENTITY_LABEL: Record<IdentityStatus, string> = {
  not_required: 'No reconciliation needed',
  pending_verification: 'Identity: reconciliation pending',
  under_review: 'Identity: under review',
  reconciled: 'Identity: reconciled',
};

/** "MRN" only for a hospital-assigned number; a temporary local identifier is never called an MRN. */
export const idLabel = (p: Pick<Patient, 'identifier_kind'>) => (p.identifier_kind === 'local_temporary' ? 'Temporary ID' : 'MRN');

/* ------------------------------ Allergies ------------------------------ */

const NO_KNOWN = /^no known/i;

/**
 * One wording for the allergy state everywhere. Real allergies are named by the caller (red). Otherwise:
 * a "No known allergies" row or status → no known allergies; an explicit status → its words; nothing → not recorded.
 */
export function allergyState(p: Pick<Patient, 'allergy_status'>, allergies: Allergy[]): { real: Allergy[]; text: string; tone: 'red' | 'amber' | 'plain' } {
  const real = allergies.filter((a) => !NO_KNOWN.test(a.substance));
  if (real.length) return { real, text: real.map((a) => a.substance).join(', '), tone: 'red' };
  if (allergies.length || p.allergy_status === 'none_known') return { real, text: ALLERGY_STATUS_LABEL.none_known, tone: 'plain' };
  if (p.allergy_status === 'unknown' || p.allergy_status === 'not_assessed') return { real, text: ALLERGY_STATUS_LABEL[p.allergy_status], tone: 'amber' };
  return { real, text: 'Allergies not recorded', tone: 'plain' };
}

/* ------------------------------ Who may do what ------------------------------ */

export const ROLE_LABEL: Record<Role, string> = { RN: 'RN', LPN: 'LPN', admin: 'Admin', admission: 'Admission staff' };
export const roleLabel = (r: Role) => ROLE_LABEL[r] ?? r;
export const isAdmissionStaff = (p: Practitioner | null | undefined) => p?.role === 'admission';

/** Where a person lands after sign-in. */
export const homeFor = (p: Practitioner | null | undefined) => (p?.role === 'admin' ? '/admin' : p?.role === 'admission' ? '/admission' : '/ward');

/** Screen-level answer only (what to show). The repository checks again against the stored account. */
export function mayDo(p: Practitioner | null | undefined, action: AdmissionAction, phase?: Phase): { ok: boolean; override: boolean; reason?: string } {
  if (!p || !p.active) return { ok: false, override: false, reason: 'Sign in again.' };
  if ((ADMISSION_POLICY.roles[action] as readonly Role[]).includes(p.role)) {
    if (action === 'register_provisional' && phase && !(ADMISSION_POLICY.provisionalPhases as readonly Phase[]).includes(phase)) {
      return { ok: false, override: false, reason: 'A nurse registers a provisional patient only while the hospital system is down.' };
    }
    return { ok: true, override: false };
  }
  if (p.role === 'admin' && ADMISSION_POLICY.adminOverride.includes(action)) return { ok: true, override: true };
  return { ok: false, override: false, reason: 'Your role cannot do this.' };
}
