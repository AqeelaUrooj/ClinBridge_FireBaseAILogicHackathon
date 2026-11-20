import { describe, expect, it } from 'vitest';
import seed from '../data/downtimekit-seed.json';
import { buildAuditRow, canonicalJson, verifyChain } from './audit';
import type { AuditLog } from './schema';

describe('audit hash chain', () => {
  it('serialises like Python json.dumps(sort_keys=True)', () => {
    expect(canonicalJson({ b: 1, a: 'x', c: null })).toBe('{"a": "x", "b": 1, "c": null}');
  });

  it('verifies every row of the synthetic seed chain', async () => {
    const rows = (seed as { audit_log: AuditLog[] }).audit_log;
    const r = await verifyChain(rows);
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(rows.length);
    expect(rows.length).toBe(153);
  });

  it('continues the chain and detects a tampered row', async () => {
    const rows = [...(seed as { audit_log: AuditLog[] }).audit_log];
    const next = await buildAuditRow({ last: rows[rows.length - 1], time: '2026-11-14T13:30:00-05:00', userId: 'pr-okafor', deviceId: 'dev-01', action: 'test', entity: 'entry/x', after: { a: 1 } });
    rows.push(next);
    expect((await verifyChain(rows)).ok).toBe(true);
    const tampered = rows.map((r) => (r.seq === 10 ? { ...r, action: 'changed' } : r));
    const bad = await verifyChain(tampered);
    expect(bad.ok).toBe(false);
    expect(bad.brokenAtSeq).toBe(11);
  });
});
