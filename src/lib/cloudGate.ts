import type { Dataset } from '../db/db';
import type { Phase } from './phase';
import { cloudDecision, CloudBlockedError, type CloudPurpose } from './cloud';

/**
 * Cloud gate: the cloud guard (lib/cloud.ts) re-applied for the WHOLE life of a cloud request, not just at the start.
 *
 *  1. Before anything: the caller's snapshot, the latest phase the app published, and a fresh read of the phase from
 *     the database (readLive) must all allow the purpose. Any "no" → CloudBlockedError; nothing is sent.
 *  2. Immediately before the request goes out (after model / App Check setup and image encoding): checked again.
 *  3. While the request is running: when the app publishes a phase change (publishCloudContext) that no longer allows
 *     the purpose (e.g. System down was declared, or the dataset switched), the request's AbortController is aborted.
 *  4. When a response arrives: checked again (including a fresh database read). If authorisation was revoked at any
 *     point, the response is thrown away (CloudRevokedError) and never returned to the UI.
 *
 * Limit (cannot be prevented in a browser): once the HTTPS request has been transmitted, the request body has left
 * the laptop. Aborting only stops ClinBridge waiting for and using the answer; the server may still process it.
 * See docs/AI_INTEGRATION.md "Cloud request during a mode change".
 */

export interface CloudContext {
  dataset: Dataset;
  phase: Phase;
}

export class CloudRevokedError extends CloudBlockedError {
  constructor(reason: string) {
    super(`Cloud answer discarded: ${reason}`);
    this.name = 'CloudRevokedError';
  }
}

interface InFlight {
  purpose: CloudPurpose;
  controller: AbortController;
  revoked: string | null;
}

let latest: CloudContext | null = null;
const inflight = new Set<InFlight>();

/** Called by the app shell every time the dataset or phase changes. Aborts cloud requests that are no longer allowed. */
export function publishCloudContext(ctx: CloudContext): void {
  latest = ctx;
  for (const f of inflight) {
    if (f.revoked) continue;
    const d = cloudDecision({ ...ctx, purpose: f.purpose });
    if (!d.allowed) {
      f.revoked = d.reason;
      f.controller.abort(new CloudRevokedError(d.reason));
    }
  }
}

export function inflightCloudRequests(): number {
  return inflight.size;
}

/** Test hook. */
export function resetCloudGateForTests(): void {
  latest = null;
  for (const f of inflight) f.controller.abort();
  inflight.clear();
}

export interface GateOptions extends CloudContext {
  purpose: CloudPurpose;
  /** Fresh read of the authoritative phase (the downtime_event table). Failing to read counts as "not allowed". */
  readLive?: () => Promise<CloudContext>;
}

async function check(o: GateOptions, revoked: boolean): Promise<void> {
  const contexts: CloudContext[] = [{ dataset: o.dataset, phase: o.phase }];
  if (latest) contexts.push(latest);
  if (o.readLive) {
    try {
      contexts.push(await o.readLive());
    } catch {
      const reason = 'Could not confirm the current phase from this laptop, so cloud stays off.';
      throw revoked ? new CloudRevokedError(reason) : new CloudBlockedError(reason);
    }
  }
  for (const c of contexts) {
    const d = cloudDecision({ ...c, purpose: o.purpose });
    if (!d.allowed) throw revoked ? new CloudRevokedError(d.reason) : new CloudBlockedError(d.reason);
  }
}

/**
 * Runs one cloud request under the gate. `send` receives the AbortSignal to pass to the SDK and a `recheck` to call
 * immediately before the request is transmitted.
 */
export async function runGuardedCloud<T>(o: GateOptions, send: (signal: AbortSignal, recheck: () => Promise<void>) => Promise<T>): Promise<T> {
  await check(o, false);
  const f: InFlight = { purpose: o.purpose, controller: new AbortController(), revoked: null };
  inflight.add(f);
  try {
    const out = await send(f.controller.signal, async () => {
      if (f.revoked) throw new CloudBlockedError(f.revoked);
      await check(o, false);
      if (f.revoked) throw new CloudBlockedError(f.revoked);
    });
    if (f.revoked) throw new CloudRevokedError(f.revoked);
    await check(o, true);
    if (f.revoked) throw new CloudRevokedError(f.revoked);
    return out;
  } catch (e) {
    if (f.revoked && !(e instanceof CloudBlockedError)) throw new CloudRevokedError(f.revoked);
    throw e;
  } finally {
    inflight.delete(f);
  }
}
