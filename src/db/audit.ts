import type { AuditLog } from './schema';

/**
 * Sequential hash chain (Implementation Plan, audit_log; Worst-case C3).
 * Each row stores prev_row_hash = SHA-256 of the previous row serialised as below.
 * The serialisation matches Python's json.dumps(row, sort_keys=True), which produced the seed chain,
 * so the seed's 153 rows verify in the browser.
 *
 * Limit: this is local tamper *evidence*, not tamper *proof*. Someone with full access to the
 * device could rewrite the whole chain. It shows accidental or partial edits; it does not stop a
 * determined attacker. See KNOWN_LIMITATIONS.md.
 */
export function canonicalJson(row: Record<string, unknown>): string {
  return '{' + Object.keys(row).sort().map((k) => JSON.stringify(k) + ': ' + jsonValue(row[k])).join(', ') + '}';
}

function jsonValue(v: unknown): string {
  if (v === undefined) return 'null';
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) return canonicalJson(v as Record<string, unknown>);
  if (Array.isArray(v)) return '[' + v.map(jsonValue).join(', ') + ']';
  return JSON.stringify(v);
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const GENESIS_HASH = '0'.repeat(64);

export async function rowHash(row: AuditLog): Promise<string> {
  return sha256Hex(canonicalJson(row as unknown as Record<string, unknown>));
}

export interface ChainResult {
  total: number;
  verified: number;
  ok: boolean;
  brokenAtSeq: number | null;
}

/** Walk the chain in seq order and report the first row whose prev_row_hash does not match. */
export async function verifyChain(rows: AuditLog[]): Promise<ChainResult> {
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS_HASH;
  let verified = 0;
  for (const row of sorted) {
    if (row.prev_row_hash !== prev) {
      return { total: sorted.length, verified, ok: false, brokenAtSeq: row.seq };
    }
    verified++;
    prev = await rowHash(row);
  }
  return { total: sorted.length, verified, ok: true, brokenAtSeq: null };
}

/** Build the next audit row (hashes computed outside any IndexedDB transaction). */
export async function buildAuditRow(params: {
  last: AuditLog | undefined;
  time: string;
  userId: string;
  deviceId: string;
  action: string;
  entity: string;
  before?: unknown;
  after: unknown;
}): Promise<AuditLog> {
  const seq = (params.last?.seq ?? 0) + 1;
  const prev = params.last ? await rowHash(params.last) : GENESIS_HASH;
  const toText = (v: unknown) => (typeof v === 'string' ? v : canonicalJson((v ?? {}) as Record<string, unknown>));
  return {
    id: `au-${String(seq).padStart(4, '0')}`,
    seq,
    time: params.time,
    user_id: params.userId,
    device_id: params.deviceId,
    action: params.action,
    entity: params.entity,
    before_hash: params.before === undefined ? null : await sha256Hex(toText(params.before)),
    after_hash: await sha256Hex(toText(params.after)),
    prev_row_hash: prev,
  };
}
