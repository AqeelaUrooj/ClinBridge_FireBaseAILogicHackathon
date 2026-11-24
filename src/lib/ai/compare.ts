import type { VitalSign } from '../../db/schema';
import { CONSCIOUSNESS_OPTIONS, VITAL_RULES, type VitalKey } from '../vitals';
import { PROPOSAL_KEYS, type VitalsProposal } from './service';

/** Field by field: what the fictional input really holds, beside what each model answered. Equality only; no score, no grade. */
export type Verdict = 'same' | 'different' | 'missing' | 'extra' | null;
export interface CompareRow {
  key: string; label: string; source: string | null; device: string | null; cloud: string | null; deviceVerdict: Verdict; cloudVerdict: Verdict;
  /** Written in the input in a form the checked workflow can answer. Only these are counted. */
  counted: boolean;
}

/** What is written in the input and can be answered by the checked vital-sign workflow. Nothing else is compared. */
export interface Known {
  values: Partial<Record<VitalKey, number>>;
  consciousness: string | null;
  /** Written in other words than the four choices (for example "Drowsy but wakes to voice"): shown, never compared. */
  otherWords: string | null;
}
export const awakeKnown = (t: string | null | undefined): Pick<Known, 'consciousness' | 'otherWords'> =>
  (CONSCIOUSNESS_OPTIONS as readonly string[]).includes(t ?? '') ? { consciousness: t!, otherWords: null } : { consciousness: null, otherWords: t || null };

/** Values that are written in the typed note. Blood sugar and oxygen flow are not. */
const IN_NOTE: VitalKey[] = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'resp_rate', 'spo2', 'temp_c', 'pain_0_10'];

export function noteKnown(v: Partial<VitalSign>): Known {
  const bp = v.bp_systolic != null && v.bp_diastolic != null;
  return { values: Object.fromEntries(IN_NOTE.filter((k) => v[k] != null && (bp || !k.startsWith('bp_'))).map((k) => [k, v[k] as number])), ...awakeKnown(v.consciousness) };
}
export const knownCount = (k: Known) => Object.keys(k.values).length + (k.consciousness ? 1 : 0);

const verdict = (known: string | null, got: string | null, ran: boolean): Verdict => (!ran ? null : known === got ? (known === null ? null : 'same') : got === null ? 'missing' : known === null ? 'extra' : 'different');

export function compareRows(known: Known, device?: VitalsProposal | null, cloud?: VitalsProposal | null): CompareRow[] {
  const num = (n: number | undefined) => (n === undefined ? null : String(n));
  const rows = PROPOSAL_KEYS.map((k) => ({ key: k as string, label: VITAL_RULES[k].label, source: num(known.values[k]), device: num(device?.values[k]), cloud: num(cloud?.values[k]) }));
  const out = rows.filter((r) => r.source !== null || r.device !== null || r.cloud !== null)
    .map((r): CompareRow => ({ ...r, counted: r.source !== null, deviceVerdict: verdict(r.source, r.device, !!device), cloudVerdict: verdict(r.source, r.cloud, !!cloud) }));
  const c = { key: 'consciousness', label: 'Awake?', device: device?.consciousness ?? null, cloud: cloud?.consciousness ?? null };
  if (known.otherWords) out.push({ ...c, source: known.otherWords, counted: false, deviceVerdict: null, cloudVerdict: null });
  else if (known.consciousness || c.device || c.cloud) out.push({ ...c, source: known.consciousness, counted: !!known.consciousness, deviceVerdict: verdict(known.consciousness, c.device, !!device), cloudVerdict: verdict(known.consciousness, c.cloud, !!cloud) });
  return out;
}

/** How many of the known values one answer repeats exactly. Values that are not in the input do not count. */
export const sameCount = (rows: CompareRow[], side: 'deviceVerdict' | 'cloudVerdict') => ({ same: rows.filter((r) => r[side] === 'same').length, known: rows.filter((r) => r.counted).length });
