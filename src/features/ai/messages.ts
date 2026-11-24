import { CloudBlockedError } from '../../lib/cloud';
import { CloudRevokedError } from '../../lib/cloudGate';

export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const cloudMsg = (e: unknown) => (e instanceof CloudRevokedError ? `${e.message} Nothing from that request is shown or saved.` : e instanceof CloudBlockedError ? `Cloud blocked: ${e.message}` : msg(e));
