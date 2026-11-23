import type { VitalSign } from '../../db/schema';
import { VITAL_RULES, type VitalKey } from '../vitals';
import { PROPOSAL_KEYS, type VitalsProposal } from './service';

/** Field by field: what the fictional input really holds, beside what each model answered. Equality only; no score, no grade. */
export type Verdict = 'same' | 'different' | 'missing' | 'extra' | null;
export interface CompareRow { key: string; label: string; source: string | null; device: string | null; cloud: string | null; deviceVerdict: Verdict; cloudVerdict: Verdict }

/** Values that are written in the synthetic note and on the synthetic form. Blood sugar and oxygen flow are in neither. */
const IN_INPUT: VitalKey[] = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'resp_rate', 'spo2', 'temp_c', 'pain_0_10'];

export function knownValues(v: Partial<VitalSign>): Partial<Record<VitalKey, number>> {
  const bp = v.bp_systolic != null && v.bp_diastolic != null;
  return Object.fromEntries(IN_INPUT.filter((k) => v[k] != null && (bp || !k.startsWith('bp_'))).map((k) => [k, v[k] as number]));
}

const verdict = (known: string | null, got: string | null, ran: boolean): Verdict => (!ran ? null : known === got ? (known === null ? null : 'same') : got === null ? 'missing' : known === null ? 'extra' : 'different');

export function compareRows(v: Partial<VitalSign>, device?: VitalsProposal | null, cloud?: VitalsProposal | null): CompareRow[] {
  const known = knownValues(v);
  const num = (n: number | undefined) => (n === undefined ? null : String(n));
  const rows = PROPOSAL_KEYS.map((k) => ({ key: k as string, label: VITAL_RULES[k].label, source: num(known[k]), device: num(device?.values[k]), cloud: num(cloud?.values[k]) }));
  rows.push({ key: 'consciousness', label: 'Awake?', source: v.consciousness ?? null, device: device?.consciousness ?? null, cloud: cloud?.consciousness ?? null });
  return rows.filter((r) => r.source !== null || r.device !== null || r.cloud !== null)
    .map((r) => ({ ...r, deviceVerdict: verdict(r.source, r.device, !!device), cloudVerdict: verdict(r.source, r.cloud, !!cloud) }));
}

/** How many of the known values one answer repeats exactly. */
export const sameCount = (rows: CompareRow[], side: 'deviceVerdict' | 'cloudVerdict') => ({ same: rows.filter((r) => r[side] === 'same').length, known: rows.filter((r) => r.source !== null).length });
