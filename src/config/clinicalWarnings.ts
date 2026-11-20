import type { VitalKey } from '../lib/vitals';

/**
 * Clinical warning ranges for vital signs.
 *
 * STATUS: NOT CLINICALLY APPROVED. These are engineering placeholders so the warning UI can be built and tested.
 * They never block saving. A value outside its range only shows "Unusual value — check it" and asks the nurse
 * to tick that they re-checked it. A qualified clinical reviewer must replace or approve these numbers
 * (DECISIONS.md D-17) and fill in `review` below.
 *
 * To change a range: edit `ranges`. To turn a warning off: remove that key.
 */
export interface ClinicalWarningConfig {
  review: { approved: boolean; approvedBy: string | null; approvedOn: string | null; note: string };
  ranges: Partial<Record<VitalKey, [low: number, high: number]>>;
}

export const CLINICAL_WARNINGS: ClinicalWarningConfig = {
  review: {
    approved: false,
    approvedBy: null,
    approvedOn: null,
    note: 'Placeholder ranges for development. Awaiting clinical review.',
  },
  ranges: {
    bp_systolic: [90, 140],
    bp_diastolic: [60, 90],
    heart_rate: [60, 100],
    resp_rate: [12, 20],
    temp_c: [36.1, 37.8],
    spo2: [92, 100],
    glucose_mgdl: [70, 180],
  },
};
