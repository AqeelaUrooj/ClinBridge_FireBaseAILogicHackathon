import type { Role } from '../db/schema';

/**
 * CLINICAL POLICY — the hospital-specific rules the app follows.
 *
 * Only ONE policy is active: ACTIVE_CLINICAL_POLICY. Right now it is the SYNTHETIC PROTOTYPE policy below.
 * It is NOT approved for real patients. Each section says where its values came from.
 *
 * To go live, a hospital must supply its own approved policy (planned: admin Settings, UI/UX S27) with
 * `status: 'institution-approved'`, who approved it and when. The prototype values must never be presented
 * as approved clinical policy. Only rule TYPES the app already supports can be configured; adding a new
 * kind of rule needs a code change and approval.
 */

export type PolicyStatus = 'synthetic-prototype' | 'institution-approved';
export type MedEventName = 'administered' | 'held' | 'refused' | 'rate_changed';

/** The only verification rule type the app supports today (documented: a second, different nurse signs with their own PIN). */
export type VerificationRule = 'second_nurse_pin';

export interface HighAlertEntry {
  id: string;
  label: string;
  /** Case-insensitive name fragments matched against the drug name on the order. */
  match: string[];
  verification: VerificationRule;
  /** Which recorded events need the verification. */
  events: MedEventName[];
}

export interface TimingWindow {
  /** Which orders the window applies to (all listed conditions must match). Empty = never matches. */
  appliesTo: { drugMatch?: string[]; frequency?: string[] };
  /** Minutes after the scheduled time before a dose shows as Overdue. */
  lateMinutes: number;
}

export interface ClinicalPolicy {
  status: PolicyStatus;
  approvedBy: string | null;
  approvedOn: string | null;
  note: string;
  highAlert: {
    approved: boolean;
    /** False means the list is known to be partial; the UI must not imply other drugs are safe. */
    listIsComplete: boolean;
    source: string;
    entries: HighAlertEntry[];
  };
  secondChecker: {
    approved: boolean;
    roles: Role[];
    note: string;
  };
  medicationTiming: {
    approved: boolean;
    /** No windows = no Overdue status at all; scheduled doses only show Due. */
    windows: TimingWindow[];
    note: string;
  };
}

export const PROTOTYPE_POLICY: ClinicalPolicy = {
  status: 'synthetic-prototype',
  approvedBy: null,
  approvedOn: null,
  note: 'Synthetic prototype settings for fake patients only. Not approved clinical policy.',
  highAlert: {
    approved: false,
    listIsComplete: false,
    source: 'Project UI/UX document, master prompt rule 4 (example list, not a validated high-alert list).',
    entries: [
      { id: 'insulin', label: 'Insulin', match: ['insulin'], verification: 'second_nurse_pin', events: ['administered', 'rate_changed'] },
      { id: 'heparin', label: 'Heparin', match: ['heparin'], verification: 'second_nurse_pin', events: ['administered', 'rate_changed'] },
      { id: 'hydromorphone', label: 'HYDROmorphone', match: ['hydromorphone'], verification: 'second_nurse_pin', events: ['administered', 'rate_changed'] },
      { id: 'potassium-chloride', label: 'Potassium chloride', match: ['potassium chloride'], verification: 'second_nurse_pin', events: ['administered', 'rate_changed'] },
    ],
  },
  secondChecker: {
    approved: false,
    roles: ['RN'],
    note: 'Temporary conservative prototype setting. Who may be a second checker must be approved against local policy, staff credentials and regulations.',
  },
  medicationTiming: {
    approved: false,
    windows: [],
    note: 'No approved medication-timing policy. Doses show Due at their scheduled time; no Overdue status.',
  },
};

export const ACTIVE_CLINICAL_POLICY: ClinicalPolicy = PROTOTYPE_POLICY;
