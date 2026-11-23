/**
 * Read-only helpers for the medication record (MAR) and the two-nurse page. Clock facts and filters only:
 * nothing here decides whether a dose is safe, late or allowed.
 */
import type { ActiveOrder } from '../../db/schema';
import { orderDose, orderGroup, type OrderGroup, type Slot } from '../../lib/meds';
import { ROUTE_LABEL } from '../../config/medicationPolicy';

export type MarTab = 'all' | OrderGroup | 'stopped';

export function filterOrders(orders: ActiveOrder[], tab: MarTab, query: string): ActiveOrder[] {
  const q = query.trim().toLowerCase();
  return orders.filter((o) => {
    if (tab === 'stopped' ? o.status === 'active' : tab !== 'all' && (o.status !== 'active' || orderGroup(o) !== tab)) return false;
    if (!q) return true;
    return [o.drug_name, o.text, o.id, o.route, ROUTE_LABEL[o.route ?? ''], o.frequency, o.ordered_by, orderDose(o)]
      .some((t) => (t ?? '').toLowerCase().includes(q));
  });
}

export interface MarHour { hour: number; label: string; now: boolean; recorded: number; open: number }

/** Eleven hours around the current hour (kept inside the day), with how many scheduled times fall in each. */
export function marHours(nowIso: string, slots: Slot[], count = 11): MarHour[] {
  const h = Number(nowIso.slice(11, 13));
  const start = Math.max(0, Math.min(24 - count, h - Math.floor(count / 2)));
  return Array.from({ length: count }, (_, i) => {
    const hour = start + i;
    const here = slots.filter((s) => Number(s.time.slice(11, 13)) === hour);
    const open = here.filter((s) => s.status === 'due' || s.status === 'overdue').length;
    return { hour, label: `${String(hour).padStart(2, '0')}:00`, now: hour === h, recorded: here.length - open, open };
  });
}

/** Plain elapsed time between two moments, e.g. "8 h 50 min". Null when the first is not earlier. */
export function elapsed(fromIso: string, toIso: string): string | null {
  const min = Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return null;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}
