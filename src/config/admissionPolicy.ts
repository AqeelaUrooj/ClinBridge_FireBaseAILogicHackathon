import type { AllergyStatus, Role } from '../db/schema';
import type { Phase } from '../lib/phase';

/**
 * Admission lifecycle settings (26 Nov 2026). PROTOTYPE, NOT APPROVED: who may register, move and discharge
 * patients is a hospital policy. Every list below is fictional Practice content for the public demo.
 */
export type AdmissionAction = 'register_patient' | 'register_provisional' | 'transfer' | 'discharge' | 'identity_review' | 'allergy_assessment';

export const ADMISSION_POLICY = {
  approved: false,
  note: 'Prototype role and permission settings for fictional Practice patients. Needs approval by the hospital (admissions, nursing, IT) before any real use.',
  /** Who may do what. Admin is never listed here: an admin may only act as an audited override with a written reason. */
  roles: {
    register_patient: ['admission'],
    register_provisional: ['RN'],
    transfer: ['admission', 'RN'],
    discharge: ['admission', 'RN'],
    identity_review: ['admission', 'RN'],
    allergy_assessment: ['admission', 'RN'],
  } satisfies Record<AdmissionAction, Role[]>,
  /** Actions an admin may record as an override (reason required, audited). */
  adminOverride: ['register_patient', 'transfer', 'discharge', 'identity_review'] as AdmissionAction[],
  /** A nurse registers a provisional patient only while the hospital system is down. */
  provisionalPhases: ['down'] as Phase[],
  /** "Reconciled" is recorded only when the hospital system can be checked again. */
  reconcilePhases: ['ready', 'online'] as Phase[],
  /** Oldest admission time accepted (hours before now). */
  maxAdmitBackHours: 72,
} as const;

/** Practice beds of the unit: rooms 4 to 11, beds A to C. The seed patients occupy ten of them. */
export const PRACTICE_ROOMS = ['4', '5', '6', '7', '8', '9', '10', '11'];
export const PRACTICE_BED_LETTERS = ['A', 'B', 'C'];
export const practiceBeds = () => PRACTICE_ROOMS.flatMap((room) => PRACTICE_BED_LETTERS.map((l) => ({ room, bed: `${room}${l}` })));

export const ADMISSION_TYPES = ['Emergency', 'Planned', 'Transfer from another hospital (practice)'] as const;

/** Structured Practice reasons. No free text: nobody types a real history into the public demo. */
export const ADMISSION_REASONS = [
  'Community-acquired pneumonia (practice scenario)',
  'Fall at home, hip pain (practice scenario)',
  'Worsening shortness of breath (practice scenario)',
  'Cellulitis of the leg (practice scenario)',
  'Abdominal pain for observation (practice scenario)',
  'Planned surgery, after recovery room (practice scenario)',
] as const;

export const TRANSFER_REASONS = [
  'Bed change on the unit (practice)',
  'Closer to the nurses’ station (practice)',
  'Isolation room needed (practice)',
] as const;

export const DISCHARGE_DESTINATIONS = ['Home', 'Home with community nursing', 'Rehabilitation facility', 'Another hospital (practice)'] as const;
export const DISCHARGE_REASONS = ['Discharged as planned (practice)', 'Transferred to another care setting (practice)', 'Left before the planned discharge (practice)'] as const;

export const IDENTITY_REVIEW_NOTES = [
  'Wristband and identity checked with the patient (practice)',
  'Sent to admissions for matching with the hospital record (practice)',
  'Matched to a hospital record by admissions (practice)',
] as const;

export const ALLERGY_STATUS_LABEL: Record<AllergyStatus, string> = {
  documented: 'Allergies documented',
  none_known: 'No known allergies',
  unknown: 'Allergy status unknown',
  not_assessed: 'Allergies not yet assessed',
};

/** Allergy choices for fictional patients: the substances already used in the reviewed Practice seed. */
export const PRACTICE_ALLERGENS = ['Penicillin', 'Sulfa antibiotics', 'Latex', 'Codeine', 'Shellfish', 'Morphine', 'Aspirin', 'Iodine contrast dye'] as const;
export const ALLERGY_REACTIONS = ['Rash', 'Hives', 'Swelling', 'Nausea', 'Breathing difficulty', 'Not known'] as const;

/**
 * Generated fictional identities. Names are invented combinations; the repository accepts only names from these
 * lists in Practice, so a free-typed real name cannot be saved through the app (this does not stop every misuse).
 */
export const FICTIONAL_GIVEN = [
  ['Avery', 'female'], ['Rowan', 'male'], ['Elena', 'female'], ['Marcus', 'male'], ['Priya', 'female'], ['Tobias', 'male'],
  ['Ingrid', 'female'], ['Kofi', 'male'], ['Leah', 'female'], ['Mateo', 'male'], ['Hana', 'female'], ['Victor', 'male'],
] as const;
export const FICTIONAL_FAMILY = ['Calloway', 'Fernhill', 'Brightwater', 'Okonjo', 'Lindqvist-Ray', 'Marlowe', 'Westbrook', 'Ashdown', 'Delacroix-Hart', 'Penrose', 'Quillan', 'Thorne'] as const;

/**
 * Optional fictional medication scenario: copies of reviewed orders from the Practice seed, none of them on the
 * high-alert list. Never added unless chosen. Not a treatment suggestion for anyone.
 */
export const PRACTICE_ORDER_SCENARIOS = {
  none: { label: 'No medication orders', sourceOrderIds: [] as string[] },
  basic: { label: 'Practice scenario A: pain and nausea as needed, vital signs', sourceOrderIds: ['ord-10', 'ord-16', 'ord-03'] },
  scheduled: { label: 'Practice scenario B: two scheduled tablets and pain as needed', sourceOrderIds: ['ord-01', 'ord-15', 'ord-10'] },
} as const;
export type PracticeScenario = keyof typeof PRACTICE_ORDER_SCENARIOS;

/** Prefix of temporary local identifiers. Never presented as a hospital MRN. */
export const LOCAL_ID_PREFIX = 'PX-';
