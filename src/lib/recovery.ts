import type { ActiveOrder, DowntimeEvent, Entry, EntryType, MedAdmin, WorklistFlag } from '../db/schema';
import type { EntryWithChild } from '../db/repos/entries';
import { ACTIVE_CLINICAL_POLICY, type ClinicalPolicy } from '../config/clinicalPolicy';

/**
 * Rules-only recovery worklist (works with no cloud and no AI).
 * Every rule is either definitional or comes from the order itself; none uses an invented clinical number:
 *  - duplicate:     two live administrations of the same order for the same scheduled time, or closer together
 *                   than the order's own "every N hours" interval
 *  - time_conflict: care time later than the time it was typed (cannot happen with a correct clock), or this
 *                   laptop's counter order disagrees with its clock order (the clock was changed)
 *  - missing_field: a given dose with no route, dose or unit
 * Cloud "recheck" (second look) is added only when the cloud step is configured; not in this build.
 */
export const CATEGORY: Record<EntryType, string> = { med_admin: 'meds', lab_event: 'results', vital_sign: 'vitals', intake_output: 'io', note: 'notes' };

export const FLAG_TEXT: Record<WorklistFlag, string> = {
  duplicate: 'Possible duplicate',
  time_conflict: 'Time conflict',
  missing_field: 'Missing field',
  recheck: 'Recheck',
  not_recorded: 'Not recorded',
};

/** "every 6 hours", "every 8 hours as needed" → 6, 8. Anything else → null (no interval rule). */
export function orderIntervalHours(o: ActiveOrder | undefined): number | null {
  const m = /every\s+(\d+)\s+hours?/i.exec(o?.frequency ?? '');
  return m ? Number(m[1]) : null;
}

export interface FlagResult { flags: WorklistFlag[]; reasons: string[]; related: string[] }

export function flagEntry(item: EntryWithChild, all: EntryWithChild[], orders: Map<string, ActiveOrder>): FlagResult {
  const { entry } = item;
  const flags = new Set<WorklistFlag>();
  const reasons: string[] = [];
  const related: string[] = [];

  if (Date.parse(entry.care_time) > Date.parse(entry.entry_time) + 60_000) {
    flags.add('time_conflict');
    reasons.push('The care time is later than the time it was typed in.');
  }
  const sameDevice = all.filter((x) => x.entry.device_id === entry.device_id && x.entry.id !== entry.id);
  const clash = sameDevice.find((x) => (x.entry.counter < entry.counter) !== (x.entry.entry_time < entry.entry_time) && x.entry.entry_time !== entry.entry_time);
  if (clash) {
    flags.add('time_conflict');
    reasons.push(`Laptop ${entry.device_id}: the record order and the clock order disagree (the clock may have been changed).`);
    related.push(clash.entry.id);
  }

  if (entry.type === 'med_admin' && item.child) {
    const m = item.child as MedAdmin;
    if (m.event === 'administered') {
      const missing = [!m.route && 'route', m.dose_given == null && 'dose', !m.dose_given_unit && 'unit'].filter(Boolean);
      if (missing.length) { flags.add('missing_field'); reasons.push(`Given dose has no ${missing.join(', ')}.`); }
      const others = all.filter((x) => x.entry.id !== entry.id && x.entry.type === 'med_admin' && (x.child as MedAdmin | undefined)?.order_id === m.order_id && m.order_id && (x.child as MedAdmin).event === 'administered');
      for (const o of others) {
        const sameSlot = entry.scheduled_time && o.entry.scheduled_time === entry.scheduled_time;
        const hrs = orderIntervalHours(orders.get(m.order_id!));
        const gapH = Math.abs(Date.parse(o.entry.care_time) - Date.parse(entry.care_time)) / 3_600_000;
        if (sameSlot || (hrs != null && gapH < hrs)) {
          flags.add('duplicate');
          reasons.push(sameSlot ? 'Another dose is recorded for the same scheduled time.' : `Another dose of this order was given ${gapH.toFixed(1)} h apart; the order says every ${hrs} hours.`);
          related.push(o.entry.id);
        }
      }
    }
  }
  return { flags: [...flags], reasons, related: [...new Set(related)] };
}

/** Queue order only (higher first): category rank from the prototype policy, then number of flags. */
export function queuePriority(type: EntryType, flags: WorklistFlag[], policy: ClinicalPolicy = ACTIVE_CLINICAL_POLICY): number {
  const rank = policy.recovery.categoryRank[CATEGORY[type]] ?? policy.recovery.categoryRank.other ?? 1;
  return rank * 10 + flags.length;
}

/**
 * Entries that belong to a downtime: care time inside the event window, live (confirmed) records only.
 * Care times are typed to the minute (seconds are 0), the declaration has seconds: the window therefore starts at the
 * beginning of the declaration's minute, so a record measured in that first minute is never left out of recovery.
 */
export function inDowntime(e: Entry, ev: DowntimeEvent | undefined): boolean {
  if (!ev || e.status !== 'confirmed') return false;
  const t = Date.parse(e.care_time);
  const start = Math.floor(Date.parse(ev.declared_at) / 60_000) * 60_000;
  return t >= start && (!ev.ended_at || t <= Date.parse(ev.ended_at));
}
