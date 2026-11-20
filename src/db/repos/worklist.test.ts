import { beforeEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db';
import { importPracticeSeed } from '../seed';
import { verifyChain } from '../audit';
import { practiceClock } from '../../lib/time';
import { createEntry } from './entries';
import { buildWorklist, signOffItem } from './worklist';
import { orderIntervalHours } from '../../lib/recovery';

let db: DowntimeDB;
const clock = practiceClock();
const nurse = { userId: 'pr-okafor', deviceId: 'dev-01' };
const med = (o: Partial<Record<string, unknown>>) => ({ order_id: 'ord-10', drug_name: 'acetaminophen', rxnorm_code: null, event: 'administered', dose_due: 650, dose_due_unit: 'mg', dose_given: 650, dose_given_unit: 'mg', route: 'PO', site: null, end_time: null, infusion_rate: null, infusion_rate_unit: null, prior_infusion_rate: null, reason: null, double_checked: null, double_checked_by: null, raw_text: null, ...o });
beforeEach(async () => { db = new DowntimeDB('practice', `wl-${crypto.randomUUID()}`); await importPracticeSeed(db); });

describe('recovery worklist (rules only)', () => {
  it('reads the interval from the order text only', () => {
    expect(orderIntervalHours({ frequency: 'every 6 hours as needed' } as never)).toBe(6);
    expect(orderIntervalHours({ frequency: 'twice daily' } as never)).toBeNull();
  });
  it('adds items for new downtime records with duplicate, missing-field and time-conflict flags; leaves existing items alone', async () => {
    const before = await db.worklist_item.toArray();
    const dup = await createEntry(db, clock, nurse, { type: 'med_admin', patientId: 'pt-04', careTime: '2026-11-14T09:30:00-05:00', values: med({}) as never }); // 07:25 dose was 2.1 h earlier; order says every 6 h
    const noRoute = await createEntry(db, clock, nurse, { type: 'med_admin', patientId: 'pt-04', careTime: '2026-11-14T06:30:00-05:00', values: med({ order_id: 'ord-11', drug_name: 'ceFAZolin', dose_given: 1, dose_given_unit: 'g', route: null }) as never });
    const future = await createEntry(db, clock, nurse, { type: 'note', patientId: 'pt-09', careTime: '2026-11-14T15:00:00-05:00', values: { category: 'assessment', text: 'x', score_name: null, score_value: null } });
    const added = await buildWorklist(db, clock, nurse);
    expect(added).toBeGreaterThanOrEqual(3);
    const items = await db.worklist_item.toArray();
    for (const old of before) expect(items.find((i) => i.id === old.id)).toEqual(old);
    const flagsOf = (id: string) => items.find((i) => i.entry_id === id)!.flags;
    expect(flagsOf(dup.id)).toContain('duplicate');
    expect(flagsOf(noRoute.id)).toContain('missing_field');
    expect(flagsOf(future.id)).toContain('time_conflict');
    expect(items.find((i) => i.entry_id === dup.id)!.priority).toBeGreaterThan(items.find((i) => i.entry_id === future.id)!.priority);
    expect(await buildWorklist(db, clock, nurse)).toBe(0); // idempotent
  });
  it('sign-off is recorded once, refused for drafts, audited', async () => {
    const item = (await db.worklist_item.toArray()).find((w) => !w.signed_off_at)!;
    await signOffItem(db, clock, nurse, item.id);
    expect((await db.worklist_item.get(item.id))!.signed_off_by).toBe('pr-okafor');
    await expect(signOffItem(db, clock, nurse, item.id)).rejects.toThrow(/Already/);
    const draftItem = (await db.worklist_item.toArray()).find((w) => w.entry_id === 'e-048');
    if (draftItem && !draftItem.signed_off_at) await expect(signOffItem(db, clock, nurse, draftItem.id)).rejects.toThrow(/draft/);
    expect((await verifyChain(await db.audit_log.orderBy('seq').toArray())).ok).toBe(true);
  });
});
