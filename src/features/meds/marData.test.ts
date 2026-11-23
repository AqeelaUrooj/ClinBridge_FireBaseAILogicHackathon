import { describe, expect, it } from 'vitest';
import type { ActiveOrder } from '../../db/schema';
import type { Slot } from '../../lib/meds';
import { elapsed, filterOrders, marHours } from './marData';

const order = (o: Partial<ActiveOrder>): ActiveOrder => ({ id: 'o', encounter_id: 'e', type: 'med', text: '', status: 'active', ...o });
const orders = [
  order({ id: 'a', drug_name: 'amLODIPine', dose: 5, dose_unit: 'mg', route: 'PO', frequency: 'daily', scheduled_times: ['09:00'] }),
  order({ id: 'b', drug_name: 'HYDROmorphone', route: 'IV', frequency: 'every 3 hours as needed', prn: true }),
  order({ id: 'c', drug_name: 'heparin', route: 'IV', frequency: 'continuous infusion' }),
  order({ id: 'd', drug_name: 'warfarin', route: 'PO', frequency: 'daily', status: 'stopped' }),
];
const ids = (l: ActiveOrder[]) => l.map((o) => o.id).join('');

describe('MAR filters', () => {
  it('tabs split active orders; a stopped order is only under All and Stopped', () => {
    expect(ids(filterOrders(orders, 'all', ''))).toBe('abcd');
    expect(ids(filterOrders(orders, 'scheduled', ''))).toBe('a');
    expect(ids(filterOrders(orders, 'prn', ''))).toBe('b');
    expect(ids(filterOrders(orders, 'infusion', ''))).toBe('c');
    expect(ids(filterOrders(orders, 'stopped', ''))).toBe('d');
  });
  it('search looks at drug, order number, dose and route, inside the tab', () => {
    expect(ids(filterOrders(orders, 'all', 'AMLO'))).toBe('a');
    expect(ids(filterOrders(orders, 'all', '5 mg'))).toBe('a');
    expect(ids(filterOrders(orders, 'all', 'by mouth'))).toBe('ad');
    expect(ids(filterOrders(orders, 'prn', 'amlo'))).toBe('');
  });
});

describe('MAR hour strip', () => {
  const slot = (t: string, status: Slot['status']): Slot => ({ time: `2026-11-14T${t}:00-05:00`, status });
  it('is eleven hours around now and counts recorded and open times', () => {
    const h = marHours('2026-11-14T13:20:00-05:00', [slot('09:00', 'given'), slot('14:00', 'due'), slot('14:00', 'held'), slot('21:00', 'due')]);
    expect([h[0]!.label, h[10]!.label, h.length]).toEqual(['08:00', '18:00', 11]);
    expect(h.find((x) => x.now)!.label).toBe('13:00');
    expect(h.find((x) => x.hour === 14)).toMatchObject({ open: 1, recorded: 1 });
    expect(h.reduce((n, x) => n + x.open, 0)).toBe(1); // 21:00 is outside the strip; the page lists it in words
  });
  it('stays inside the day near midnight', () => {
    expect(marHours('2026-11-14T00:10:00-05:00', [])[0]!.label).toBe('00:00');
    expect(marHours('2026-11-14T23:50:00-05:00', [])[10]!.label).toBe('23:00');
  });
});

describe('elapsed time', () => {
  it('is clock arithmetic only', () => {
    expect(elapsed('2026-11-14T04:30:00-05:00', '2026-11-14T13:20:00-05:00')).toBe('8 h 50 min');
    expect(elapsed('2026-11-14T13:00:00-05:00', '2026-11-14T13:20:00-05:00')).toBe('20 min');
    expect(elapsed('2026-11-14T13:30:00-05:00', '2026-11-14T13:20:00-05:00')).toBeNull();
  });
});
