import { describe, expect, it } from 'vitest';
import seed from '../../data/downtimekit-seed.json';
import { checkStoredList, type StoredList } from './listCheck';

const s = seed as unknown as Record<string, unknown[]>;
const list = (): StoredList => structuredClone({ snapshot: s.snapshot![0], patient: s.patient, encounter: s.encounter, allergy: s.allergy, active_order: s.active_order, snapshot_result: s.snapshot_result }) as StoredList;
const row = (l: StoredList, label: string) => checkStoredList(l).find((r) => r.label === label)!;

describe('check of the stored patient list', () => {
  it('the practice list is complete', () => {
    expect(checkStoredList(list()).every((r) => r.ok === true)).toBe(true);
    expect(row(list(), 'Orders').detail).toBe('27 here, 27 in the list');
  });
  it('a missing row and an unknown total are told apart', () => {
    const l = list(); l.active_order.pop();
    expect(row(l, 'Orders')).toMatchObject({ ok: false, detail: '26 here, 27 in the list' });
    const m = list(); m.snapshot!.row_counts = null;
    expect(row(m, 'Orders').ok).toBeNull();
  });
  it('finds rows that point to nobody', () => {
    const l = list(); l.allergy[0]!.patient_id = 'pt-99'; l.active_order[0]!.encounter_id = 'enc-99'; l.snapshot_result[0]!.patient_id = 'pt-99'; l.encounter[0]!.patient_id = 'pt-99';
    for (const k of ['Stay has a patient', 'Allergy has a patient', 'Order has a stay', 'Result has a patient']) expect(row(l, k)).toMatchObject({ ok: false, detail: '1 without one' });
  });
  it('a patient with no allergy line is shown, not called safe; a repeated MRN is found', () => {
    const l = list(); l.allergy = l.allergy.filter((a) => a.patient_id !== 'pt-01');
    expect(row(l, 'Allergies recorded')).toMatchObject({ ok: null, detail: '1 patients have no allergy line at all' });
    const m = list(); m.patient[1]!.mrn = m.patient[0]!.mrn;
    expect(row(m, 'MRN used once').ok).toBe(false);
  });
});
