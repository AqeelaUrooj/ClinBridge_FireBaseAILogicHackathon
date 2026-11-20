import type { DowntimeEvent } from '../db/schema';

/**
 * Operating phase is derived from the downtime_event table (no extra settings field needed):
 *  - no open event              → ready   (shown as "Normal")
 *  - declared, not cleared      → down    (shown as "System down")
 *  - network cleared, not ended → online  (shown as "Back online")
 * The dataset (practice | live) is separate: Practice can walk through every phase on fake data.
 */
export type Phase = 'ready' | 'down' | 'online';

export function currentEvent(events: DowntimeEvent[]): DowntimeEvent | undefined {
  return [...events].filter((e) => !e.ended_at).sort((a, b) => b.declared_at.localeCompare(a.declared_at))[0];
}

export function derivePhase(events: DowntimeEvent[]): Phase {
  const ev = currentEvent(events);
  if (!ev) return 'ready';
  return ev.network_cleared_at ? 'online' : 'down';
}

export const PHASE_LABEL: Record<Phase, string> = {
  ready: 'Normal',
  down: 'System down',
  online: 'Back online',
};
