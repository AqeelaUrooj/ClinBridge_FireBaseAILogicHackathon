import { describe, expect, it } from 'vitest';
import type { ActiveOrder } from '../../db/schema';
import { inOrderTab, orderKind } from './OrdersPage';

const o = (over: Partial<ActiveOrder> = {}): ActiveOrder => ({ id: 'o', encounter_id: 'e', type: 'med', text: 'x', status: 'active', ...over });

describe('order tabs', () => {
  const list = [o(), o({ type: 'iv' }), o({ type: 'nursing' }), o({ type: 'lab' }), o({ type: 'imaging' }), o({ type: 'diet' }), o({ status: 'stopped' })];
  const n = (t: Parameters<typeof inOrderTab>[1]) => list.filter((x) => inOrderTab(x, t)).length;
  it('every active order is in exactly one tab; stopped orders are only in Stopped', () => {
    expect([n('all'), n('meds'), n('nursing'), n('lab'), n('diet'), n('stopped')]).toEqual([6, 2, 1, 2, 1, 1]);
    expect(n('meds') + n('nursing') + n('lab') + n('diet')).toBe(n('all'));
  });
});

describe('how an order runs', () => {
  it('uses the order only', () => {
    expect(orderKind(o({ scheduled_times: ['09:00'] }))).toBe('Active, at set times');
    expect(orderKind(o({ prn: true }))).toBe('Active, as needed');
    expect(orderKind(o({ frequency: 'continuous infusion' }))).toBe('Active, continuous');
    expect(orderKind(o({ type: 'diet' }))).toBe('Active');
    expect(orderKind(o({ status: 'on-hold' }))).toBe('Not active: on-hold');
  });
});
