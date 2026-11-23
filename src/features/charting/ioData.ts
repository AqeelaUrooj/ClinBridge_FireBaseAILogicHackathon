/**
 * Rows and sums for the intake and output page, from saved records and the hospital patient list.
 * Plain sums only: no limit, no "remaining" amount, no urine rate, no judgement of the balance.
 */
import type { IntakeOutput, SnapshotResult } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { ioTotals } from '../../lib/charting';

export interface IoRow { item: EntryWithChild; io: IntakeOutput; time: string; confirmed: boolean }

/** Today's confirmed and draft records, newest first. Old versions and mistakes are left out. */
export function dayRows(items: EntryWithChild[], patientId: string, day: string): IoRow[] {
  return items
    .filter((x) => x.entry.patient_id === patientId && x.entry.type === 'intake_output' && x.child && x.entry.care_time.slice(0, 10) === day && (x.entry.status === 'confirmed' || x.entry.status === 'draft'))
    .map((item) => ({ item, io: item.child as IntakeOutput, time: item.entry.care_time, confirmed: item.entry.status === 'confirmed' }))
    .sort((a, b) => b.time.localeCompare(a.time));
}

/** Everything that is not in today's ledgers: other days, replaced versions, mistakes. */
export const otherRows = (items: EntryWithChild[], patientId: string, day: string): EntryWithChild[] => {
  const today = new Set(dayRows(items, patientId, day).map((r) => r.item.entry.id));
  return items.filter((x) => x.entry.patient_id === patientId && x.entry.type === 'intake_output' && !today.has(x.entry.id));
};

export const dayTotals = (rows: IoRow[]) => ioTotals(rows.filter((r) => r.confirmed).map((r) => r.io));

export interface IoHour { hour: number; label: string; totalIn: number; totalOut: number; /** Running balance at the end of this hour. */ running: number; records: number }

/** Confirmed amounts by the hour of their recorded time, 00 to 23, with the running balance. */
export function hourly(rows: IoRow[]): IoHour[] {
  let running = 0;
  return Array.from({ length: 24 }, (_, hour) => {
    const here = rows.filter((r) => r.confirmed && Number(r.time.slice(11, 13)) === hour);
    const t = ioTotals(here.map((r) => r.io));
    running += t.balance;
    return { hour, label: `${String(hour).padStart(2, '0')}:00`, totalIn: t.totalIn, totalOut: t.totalOut, running, records: here.length };
  });
}

/** 24-hour totals on the hospital list (LOINC 8985-4 in, 9262-7 out). Only shown as a pair from the same time, in mL. */
export function hospitalTotals(results: SnapshotResult[], patientId: string): { totalIn: number; totalOut: number; balance: number; time: string } | null {
  const pick = (code: string) => results
    .filter((r) => r.patient_id === patientId && r.kind === 'io' && r.code === code && r.unit === 'mL' && typeof r.value_num === 'number')
    .sort((a, b) => b.time.localeCompare(a.time))[0];
  const i = pick('8985-4'), o = pick('9262-7');
  if (!i || !o || i.time !== o.time) return null;
  return { totalIn: i.value_num!, totalOut: o.value_num!, balance: i.value_num! - o.value_num!, time: i.time };
}

/** "+200", "−530", "0" with a real minus sign. */
export const signedMl = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** The − and + buttons change a typed amount by 50 mL. An empty box stays empty, so no amount is ever suggested. */
export function stepVolume(current: string, dir: 1 | -1): string | null {
  if (!/^\d{1,5}$/.test(current.trim())) return null;
  const n = Number(current) + dir * 50;
  return n <= 0 || n > 99_999 ? null : String(n);
}
