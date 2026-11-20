/**
 * Medication data lists (units, routes, site words) from the project documents.
 * These describe data formats, not clinical policy.
 */

// High-alert drugs, second-checker roles and timing windows live in clinicalPolicy.ts (hospital policy, needs approval).

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
