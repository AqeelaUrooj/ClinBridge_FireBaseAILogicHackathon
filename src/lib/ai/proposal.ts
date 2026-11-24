import type { Entry, VitalSign } from '../../db/schema';
import { hm } from '../time';
import type { AiRaw, VitalsProposal } from './service';

/**
 * What is stored in entry.ai_proposal for a REAL model proposal: the values plus an `_ai` block saying which
 * engine produced it. Practice seed proposals have no `_ai` block: they are simulated and shown as such.
 */
export interface AiMeta { engine: 'firebase-ai-logic'; sdk: string; mode: 'only_on_device' | 'only_in_cloud'; source: 'on_device' | 'in_cloud'; ms: number; at: string; dropped: string[] }

export function proposalRecord(p: VitalsProposal, raw: AiRaw, atIso: string): Record<string, unknown> {
  const meta: AiMeta = { engine: 'firebase-ai-logic', sdk: 'firebase@13.4.0', mode: raw.source === 'on_device' ? 'only_on_device' : 'only_in_cloud', source: raw.source, ms: raw.ms, at: atIso, dropped: p.dropped };
  return { ...p.values, consciousness: p.consciousness, _ai: meta };
}

export function aiMeta(e: Pick<Entry, 'ai_proposal'>): AiMeta | null {
  const m = (e.ai_proposal as { _ai?: AiMeta } | null | undefined)?._ai;
  return m && m.engine === 'firebase-ai-logic' ? m : null;
}

/**
 * Instructions for a drawn report picture, the same for both models. A sheet holds several sets of vital signs; only the
 * last one is asked for, so that every answer has one right place on the sheet.
 */
export const reportPrompt = (time: string) =>
  `This picture is a handwritten nursing report. Read only the vital signs written for ${hm(time)} (it may be written ${hm(time).replace(':', '')}), the last set on the sheet. ` +
  'Use null for a value that is not written for that time or is crossed out. Ignore everything on the sheet that is not a vital sign.';

/** Synthetic narrative written from known values (Practice compare input). Clearly fictional. */
export function syntheticNote(v: Partial<VitalSign>, time: string): string {
  const bits = [
    v.bp_systolic != null && v.bp_diastolic != null ? `BP ${v.bp_systolic} over ${v.bp_diastolic}` : null,
    v.heart_rate != null ? `pulse ${v.heart_rate}` : null,
    v.resp_rate != null ? `resps ${v.resp_rate}` : null,
    v.spo2 != null ? `sats ${v.spo2}%${v.o2_device ? ` on ${v.o2_device}` : ''}` : null,
    v.temp_c != null ? `temp ${v.temp_c}` : null,
    v.pain_0_10 != null ? `pain ${v.pain_0_10}/10` : null,
    v.consciousness ? `${v.consciousness.toLowerCase()}` : null,
  ].filter(Boolean);
  return `PRACTICE ONLY, fictional patient. ${time} obs: ${bits.join(', ')}.`;
}
