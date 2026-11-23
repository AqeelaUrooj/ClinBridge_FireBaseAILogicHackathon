import type { EntryType, MedAdmin, VitalSign } from '../../db/schema';

/**
 * The forms hold only the values a nurse can type. A draft can also hold the words copied from the paper and a weight.
 * Confirming must keep them: they are part of the record the nurse is confirming.
 */
export function keepDraftSource(type: EntryType, values: unknown, draft: unknown): unknown {
  if (!draft) return values;
  if (type === 'vital_sign') return { ...(values as object), weight_kg: (draft as VitalSign).weight_kg ?? null, raw_text: (draft as VitalSign).raw_text ?? null };
  if (type === 'med_admin') return { ...(values as object), raw_text: (draft as MedAdmin).raw_text ?? null };
  return values;
}
