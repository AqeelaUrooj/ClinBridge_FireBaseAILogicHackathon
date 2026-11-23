/**
 * What a saved handover points at, as it is now. The saved text is never changed.
 */
import type { ActiveOrder, MedAdmin } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { EVENT_LABEL, isMedOrder, lastGiven, orderGroup, orderHistory, slotStatuses, type MedEvent, type SlotStatus } from '../../lib/meds';
import { formatDose } from '../../lib/dose';
import { hm } from '../../lib/time';

export interface LinkedRecord {
  id: string;
  /** Null: not on this laptop, or of another patient. Never shown as a record. */
  item: EntryWithChild | null;
  /** The record was fixed or marked as a mistake after it was linked. */
  changed: boolean;
  /** The newest version, when it was fixed. */
  newest: EntryWithChild | null;
}

export function linkedRecords(ids: string[], all: EntryWithChild[], patientId: string): LinkedRecord[] {
  const own = all.filter((x) => x.entry.patient_id === patientId);
  const byId = new Map(own.map((x) => [x.entry.id, x]));
  const next = new Map(own.filter((x) => x.entry.supersedes_id).map((x) => [x.entry.supersedes_id!, x]));
  return ids.map((id) => {
    const item = byId.get(id) ?? null;
    let newest = item, seen = 0;
    while (newest && next.has(newest.entry.id) && seen++ < 100) newest = next.get(newest.entry.id)!;
    return { id, item, changed: !!item && item.entry.status !== 'confirmed', newest: newest && newest !== item ? newest : null };
  }).sort((a, b) => Number(!a.item) - Number(!b.item) || (a.item?.entry.care_time ?? '').localeCompare(b.item?.entry.care_time ?? ''));
}

export interface MedLine { id: string; text: string; notes: string[] }
const SLOT: Record<SlotStatus, string> = { due: 'not recorded', overdue: 'not recorded', given: 'given', held: 'held', refused: 'refused', draft: 'draft, not confirmed' };

/** Active medicine orders with what is recorded for them. Plain facts: no overdue wording, no advice. */
export function medLines(orders: ActiveOrder[], all: EntryWithChild[], nowIso: string): MedLine[] {
  const meds = all.filter((x) => x.entry.type === 'med_admin');
  const live = meds.filter((x) => x.entry.status === 'confirmed');
  return orders.filter((o) => isMedOrder(o) && o.status === 'active' && (!o.stop || o.stop > nowIso)).map((o) => {
    const notes: string[] = [];
    if (orderGroup(o) === 'infusion') {
      const last = orderHistory(o, live)[0];
      const m = last?.child as MedAdmin | undefined;
      if (!last || !m) notes.push('No rate or dose recorded on this laptop');
      else notes.push(`Last record ${hm(last.entry.care_time)}: ${EVENT_LABEL[m.event as MedEvent] ?? m.event}${m.infusion_rate != null ? ` to ${formatDose(m.infusion_rate)} ${m.infusion_rate_unit ?? ''}`.trimEnd() : ''}`);
    } else {
      const last = lastGiven(o, live);
      const m = last?.child as MedAdmin | undefined;
      notes.push(last && m ? `Last given ${hm(last.entry.care_time)}: ${formatDose(m.dose_given)} ${m.dose_given_unit ?? ''}`.trimEnd() : 'No dose recorded on this laptop');
      const slots = slotStatuses(o, nowIso, meds);
      if (slots.length) notes.push(`Today ${slots.map((s) => `${hm(s.time)} ${SLOT[s.status]}`).join(', ')}`);
      else if (o.prn) notes.push('As needed');
    }
    return { id: o.id, text: o.text, notes };
  });
}
