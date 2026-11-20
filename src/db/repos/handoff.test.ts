import { beforeEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db';
import { importPracticeSeed } from '../seed';
import { verifyChain } from '../audit';
import { createHandoff, listHandoffs } from './handoff';
import { practiceClock } from '../../lib/time';

let db: DowntimeDB;
const clock = practiceClock();
const actor = { userId: 'pr-okafor', deviceId: 'dev-01' };
const base = { patientId: 'pt-09', shift: 'Handover 13:20', situation: 'S', background: 'B', assessment: 'A', openItems: ['Recheck oxygen', ' '], sourceEntryIds: ['e-005'] };

beforeEach(async () => { db = new DowntimeDB('practice', `ho-${crypto.randomUUID()}`); await importPracticeSeed(db); });

describe('handover', () => {
  it('saves a new row with an audit row; earlier handovers untouched; blank open items dropped', async () => {
    const before = await db.handoff.toArray();
    const h = await createHandoff(db, clock, actor, base);
    expect(h.open_items).toEqual(['Recheck oxygen']);
    expect(await db.handoff.count()).toBe(before.length + 1);
    for (const old of before) expect(await db.handoff.get(old.id)).toEqual(old);
    const list = await listHandoffs(db, 'pt-09');
    expect(list[0]!.handoff.id).toBe(h.id);
    expect(list[0]!.savedAt).toBeTruthy();
    expect((await verifyChain(await db.audit_log.orderBy('seq').toArray())).ok).toBe(true);
  });
  it('links only confirmed records of the same patient, and needs S, B, A', async () => {
    await expect(createHandoff(db, clock, actor, { ...base, sourceEntryIds: ['e-001x'] })).rejects.toThrow(/not found/);
    await expect(createHandoff(db, clock, actor, { ...base, sourceEntryIds: ['e-029'] })).rejects.toThrow(/another patient/);
    await expect(createHandoff(db, clock, actor, { ...base, patientId: 'pt-06', sourceEntryIds: ['e-040'] })).rejects.toThrow(/confirmed/);
    await expect(createHandoff(db, clock, actor, { ...base, assessment: '  ' })).rejects.toThrow(/assessment/);
  });
});
