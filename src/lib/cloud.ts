import type { Dataset } from '../db/db';
import type { Phase } from './phase';

/**
 * Service-layer guard for every cloud call (Worst-case C2). Hiding buttons is not enough:
 * any code path that would send data off the laptop must call assertCloudAllowed first.
 */
export type CloudPurpose = 'second_look' | 'worklist' | 'compare';

export class CloudBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CloudBlockedError';
  }
}

export function cloudDecision(ctx: { dataset: Dataset; phase: Phase; purpose: CloudPurpose }): { allowed: boolean; reason: string } {
  if (ctx.phase === 'down') return { allowed: false, reason: 'System down: cloud is blocked until an admin clears the network.' };
  if (ctx.purpose === 'compare') {
    return ctx.dataset === 'practice'
      ? { allowed: true, reason: 'Practice data only.' }
      : { allowed: false, reason: 'Compare runs on Practice data only.' };
  }
  if (ctx.phase !== 'online') return { allowed: false, reason: 'Cloud help opens only after the network is cleared.' };
  return { allowed: true, reason: 'Network cleared by an admin.' };
}

export function assertCloudAllowed(ctx: { dataset: Dataset; phase: Phase; purpose: CloudPurpose }): void {
  const d = cloudDecision(ctx);
  if (!d.allowed) throw new CloudBlockedError(d.reason);
}
