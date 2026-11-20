import { describe, expect, it } from 'vitest';
import type { ActiveOrder, Entry, MedAdmin } from '../db/schema';
import { currentRate, isHighAlert, medFormFromOrder, orderGroup, slotStatuses, validateMed } from './meds';

const order = (o: Partial<ActiveOrder>): ActiveOrder => ({
  id: 'ord-x', encounter_id: 'enc-1', type: 'med', text: 't', drug_name: 'amLODIPine', dose: 5, dose_unit: 'mg', route: 'PO',
  frequency: 'daily', scheduled_times: ['09:00'], prn: false, status: 'active', ...o,
});
const entry = (id: string, status: Entry['status'], scheduled: string | null, m: Partial<MedAdmin>) => ({
  entry: { id, status, scheduled_time: scheduled, care_time: '2026-11-14T09:00:00-05:00' } as Entry,
  child: { id: `m-${id}`, entry_id: id, drug_name: 'x', event: 'administered', order_id: 'ord-x', ...m } as MedAdmin,
});

describe('medicine rules', () => {
  it('knows the documented high-alert drugs by name', () => {
    expect(isHighAlert('insulin lispro')).toBe(true);
    expect(isHighAlert('heparin')).toBe(true);
    expect(isHighAlert('HYDROmorphone')).toBe(true);
    expect(isHighAlert('potassium chloride')).toBe(true);
    expect(isHighAlert('amLODIPine')).toBe(false);
  });

  it('groups orders: scheduled, as needed, infusion', () => {
    expect(orderGroup(order({}))).toBe('scheduled');
    expect(orderGroup(order({ prn: true, scheduled_times: null }))).toBe('prn');
    expect(orderGroup(order({ frequency: 'continuous infusion' }))).toBe('infusion');
  });

  it('pre-fills from the order without a trailing zero', () => {
    const f = medFormFromOrder(order({ drug_name: 'HYDROmorphone', dose: 0.5 }), 'administered');
    expect(f.dose).toBe('0.5');
    expect(f.route).toBe('PO');
  });

  it('blocks missing route, missing unit and a zero dose', () => {
    const o = order({});
    const base = medFormFromOrder(o, 'administered');
    expect(validateMed({ ...base, route: '' }, o, null).errors.route).toBeDefined();
    expect(validateMed({ ...base, unit: 'mgs' }, o, null).errors.unit).toBeDefined();
    expect(validateMed({ ...base, dose: '0' }, o, null).errors.dose).toBeDefined();
  });

  it('warns (does not block) when the dose differs from the order: the 50 mg vs 5 mg case', () => {
    const o = order({});
    const r = validateMed({ ...medFormFromOrder(o, 'administered'), dose: '50' }, o, null);
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/different from the order \(5 mg\)/);
  });

  it('needs a reason for held and refused', () => {
    const o = order({});
    expect(validateMed({ ...medFormFromOrder(o, 'held') }, o, null).errors.reason).toBeDefined();
    expect(validateMed({ ...medFormFromOrder(o, 'refused'), reason: 'said no' }, o, null).ok).toBe(true);
  });

  it('requires a second nurse for high-alert doses and rate changes only', () => {
    const ins = order({ drug_name: 'insulin lispro', dose: 4, dose_unit: 'units', route: 'SC' });
    expect(validateMed(medFormFromOrder(ins, 'administered'), ins, null).needsSecondCheck).toBe(true);
    expect(validateMed({ ...medFormFromOrder(ins, 'held'), reason: 'not eating' }, ins, null).needsSecondCheck).toBe(false);
    const hep = order({ drug_name: 'heparin', dose: 1000, dose_unit: 'units/h', route: 'IV', frequency: 'continuous infusion', scheduled_times: null });
    const r = validateMed({ ...medFormFromOrder(hep, 'rate_changed'), rate: '1150' }, hep, 1000);
    expect(r.ok).toBe(true);
    expect(r.needsSecondCheck).toBe(true);
    expect(r.values.prior_infusion_rate).toBe(1000);
  });

  it('works out slot status from live entries only', () => {
    const o = order({ scheduled_times: ['09:00', '21:00'] });
    const nine = '2026-11-14T09:00:00-05:00';
    const meds = [entry('e1', 'corrected', nine, {}), entry('e2', 'confirmed', nine, { event: 'held' })];
    const s = slotStatuses(o, '2026-11-14T13:20:00-05:00', meds);
    expect(s.map((x) => x.status)).toEqual(['held', 'due']);
  });

  it('current infusion rate = latest confirmed change, else the order', () => {
    const hep = order({ dose: 1000, dose_unit: 'units/h', frequency: 'continuous infusion' });
    expect(currentRate(hep, []).rate).toBe(1000);
    expect(currentRate(hep, [entry('e3', 'confirmed', null, { event: 'rate_changed', infusion_rate: 1150, infusion_rate_unit: 'units/h' })]).rate).toBe(1150);
  });
});
