import { describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db';
import { importPracticeSeed } from '../seed';
import { startPracticeOutageDrill } from './admin';
import { derivePhase } from '../../lib/phase';
import { verifyChain } from '../audit';
import { practiceClock } from '../../lib/time';

describe('practice outage drill', () => {
  it('closes the seed downtime as a drill and declares System down; audited; Practice only', async () => {
    const db = new DowntimeDB('practice', `drill-${crypto.randomUUID()}`);
    await importPracticeSeed(db);
    expect(derivePhase(await db.downtime_event.toArray())).toBe('online');
    await startPracticeOutageDrill(db, practiceClock(), { userId: 'pr-ellis', deviceId: 'dev-01' });
    expect(derivePhase(await db.downtime_event.toArray())).toBe('down');
    const actions = (await db.audit_log.orderBy('seq').toArray()).slice(-2).map((a) => a.action);
    expect(actions).toEqual(['practice_drill_closed', 'downtime_declared']);
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
    await expect(startPracticeOutageDrill(db, practiceClock(), { userId: 'pr-okafor', deviceId: 'dev-01' })).rejects.toThrow(/Only an admin/);
    const live = new DowntimeDB('live', `drill-live-${crypto.randomUUID()}`);
    await expect(startPracticeOutageDrill(live, practiceClock(), { userId: 'x', deviceId: 'd' })).rejects.toThrow(/Practice data only/);
  });
});
