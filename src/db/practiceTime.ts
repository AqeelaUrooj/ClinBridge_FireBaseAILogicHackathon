import type { DowntimeDB } from './db';

/**
 * Latest time already written in these records (change log and downtime events), in ms since epoch; 0 if none.
 * Used to move the Practice clock forward after a reload so new times never come before saved ones.
 */
export async function latestRecordedTime(db: DowntimeDB): Promise<number> {
  let max = 0;
  const take = (iso?: string | null) => {
    const t = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(t) && t > max) max = t;
  };
  take((await db.audit_log.orderBy('seq').last())?.time);
  for (const ev of await db.downtime_event.toArray()) {
    take(ev.declared_at);
    take(ev.network_cleared_at);
    take(ev.ended_at);
  }
  return max;
}
