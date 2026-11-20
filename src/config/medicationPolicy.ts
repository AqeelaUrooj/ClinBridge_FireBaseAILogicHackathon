import type { Role } from '../db/schema';

/**
 * Medication settings. Planned to be editable by an admin in Settings (UI/UX S27); a file for now.
 * Every value here comes from the project documents. Items marked POLICY are hospital-policy choices that
 * need confirmation (DECISIONS.md).
 */

/** High-alert drugs (UI/UX doc §19 rule 4: insulin, heparin, HYDROmorphone, potassium chloride). Matched by name, case-insensitive. */
export const HIGH_ALERT_DRUGS = ['insulin', 'heparin', 'hydromorphone', 'potassium chloride'];

/**
 * POLICY (D-19): who may be the second checker. Master prompt says RN; UI/UX §6 says LPN "by hospital policy".
 * Default is the stricter RN-only until the hospital confirms.
 */
export const SECOND_CHECKER_ROLES: Role[] = ['RN'];

/** Fixed lists from the Implementation Plan form schema (stops free-text units and routes). */
export const DOSE_UNITS = ['mg', 'mcg', 'g', 'mL', 'units', 'mmol', 'tablet'] as const;
export const ROUTES = ['PO', 'IV', 'IM', 'SC', 'SL', 'PR', 'INH', 'TOP'] as const;
/** Infusion rate units used by the orders in the synthetic seed. */
export const RATE_UNITS = ['units/h', 'mL/h'] as const;

/** Plain-word labels for routes (shown with the code). */
export const ROUTE_LABEL: Record<string, string> = {
  PO: 'by mouth', IV: 'into a vein', IM: 'into a muscle', SC: 'under the skin', SL: 'under the tongue',
  PR: 'rectal', INH: 'inhaled', TOP: 'on the skin',
};

/** Standard site words already used in the data. Becomes a body-map tap once P-01 is decided. */
export const SITE_WORDS = [
  'Abdomen, left side', 'Abdomen, right side',
  'Left forearm IV line', 'Right forearm IV line', 'Left hand IV line', 'Right hand IV line',
];
