/**
 * Clock and time formatting.
 * Practice runs on a scenario clock anchored to the synthetic outage (14 Nov 2026, 13:20, UTC-05:00)
 * so new practice entries line up with the seed story. Live mode uses the laptop's real clock.
 */
export interface Clock {
  now(): number;
  nowIso(): string;
  offsetMinutes: number;
}

export const PRACTICE_ANCHOR = '2026-11-14T13:20:00-05:00';
export const PRACTICE_OFFSET_MIN = -300;

export function toIsoWithOffset(ms: number, offsetMinutes: number): string {
  const local = new Date(ms + offsetMinutes * 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return local.toISOString().slice(0, 19) + off;
}

export function practiceClock(bootMs = Date.now()): Clock {
  const anchor = Date.parse(PRACTICE_ANCHOR);
  const now = () => anchor + (Date.now() - bootMs);
  return { now, nowIso: () => toIsoWithOffset(now(), PRACTICE_OFFSET_MIN), offsetMinutes: PRACTICE_OFFSET_MIN };
}

export function liveClock(): Clock {
  const offsetMinutes = -new Date().getTimezoneOffset();
  return { now: () => Date.now(), nowIso: () => toIsoWithOffset(Date.now(), offsetMinutes), offsetMinutes };
}

/** "14:05" — 24-hour clock, read straight from the stored local time. */
export const hm = (iso?: string | null): string => (iso ? iso.slice(11, 16) : '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "14 Nov 2026" — written-out month, never 01/02 style. */
export const dayLabel = (iso?: string | null): string =>
  iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '';

export const dateTimeLabel = (iso?: string | null): string => (iso ? `${hm(iso)}, ${dayLabel(iso)}` : '');

export function ageOn(birthDate: string, atIso: string): number {
  const by = Number(birthDate.slice(0, 4)), bm = Number(birthDate.slice(5, 7)), bd = Number(birthDate.slice(8, 10));
  const y = Number(atIso.slice(0, 4)), m = Number(atIso.slice(5, 7)), d = Number(atIso.slice(8, 10));
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Value for <input type="datetime-local"> from an ISO string in the clock's offset. */
export const toLocalInput = (iso: string): string => iso.slice(0, 16);

/** Back from datetime-local to ISO with the clock's offset. */
export function fromLocalInput(value: string, offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${value}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
