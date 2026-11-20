import type { DowntimeDB } from '../db';
import type { WorklistItem } from '../schema';
import { buildAuditRow } from '../audit';
import type { Clock } from '../../lib/time';
import { currentEvent } from '../../lib/phase';
import { CATEGORY, flagEntry, inDowntime, queuePriority } from '../../lib/recovery';
import { EntryWriteError, getEntry, listPatientEntries, type Actor } from './entries';

/**
 * Recovery worklist (worklist_item table). Allowed only after network clearance (Back online).
 * - build: adds an item for every confirmed downtime record that has none yet (existing items untouched)
 * - signOff: a nurse/admin confirms the item was checked and reconciled; never deletes anything
 */
async function requirePhaseOnline(db: DowntimeDB) {
  const ev = currentEvent(await db.downtime_event.toArray());
  if (!ev?.network_cleared_at) throw new EntryWriteError('Recovery starts after an admin clears the network (Back online).');
  return ev;
}

export async function buildWorklist(db: DowntimeDB, clock: Clock, actor: Actor): Promise<number> {
  const ev = await requirePhaseOnline(db);
  const existing = new Set((await db.worklist_item.toArray()).map((w) => w.entry_id));
  const orders = new Map((await db.active_order.toArray()).map((o) => [o.id, o]));
  const patients = await db.patient.toArray();
  const created: WorklistItem[] = [];
  for (const p of patients) {
    const all = (await listPatientEntries(db, p.id)).filter((x) => x.entry.status === 'confirmed');
    for (const item of all) {
      if (existing.has(item.entry.id) || !inDowntime(item.entry, ev)) continue;
      const f = flagEntry(item, all, orders);
      created.push({
        id: `wl-${crypto.randomUUID().slice(0, 8)}`, entry_id: item.entry.id, patient_id: p.id, category: CATEGORY[item.entry.type],
        priority: queuePriority(item.entry.type, f.flags), flags: f.flags, billable: null, assigned_to: null,
        signed_off_by: null, signed_off_at: null, exported_at: null, second_look_status: null, second_look_reading: null, mismatch_fields: null,
      });
    }
  }
  if (!created.length) return 0;
  const last = await db.audit_log.orderBy('seq').last();
  const row = await buildAuditRow({ last, time: clock.nowIso(), userId: actor.userId, deviceId: actor.deviceId, action: 'worklist_built', entity: 'worklist', after: { added: created.length, method: 'rules-only' } });
  await db.transaction('rw', [db.worklist_item, db.audit_log], async () => {
    const head = await db.audit_log.orderBy('seq').last();
    if ((head?.seq ?? 0) !== (last?.seq ?? 0)) throw new EntryWriteError('Another change was saved at the same moment. Try again.');
    await db.worklist_item.bulkAdd(created);
    await db.audit_log.add(row);
  });
  return created.length;
}

export async function signOffItem(db: DowntimeDB, clock: Clock, actor: Actor, itemId: string): Promise<void> {
  await requirePhaseOnline(db);
  const who = await db.practitioner.get(actor.userId);
  if (!who?.active) throw new EntryWriteError('Sign in again.');
  const item = await db.worklist_item.get(itemId);
  if (!item) throw new EntryWriteError('Worklist item not found.');
  if (item.signed_off_at) throw new EntryWriteError('Already signed off.');
  const entry = await getEntry(db, item.entry_id);
  if (entry?.entry.status === 'draft') throw new EntryWriteError('Confirm the draft before signing off.');
  const now = clock.nowIso();
  const last = await db.audit_log.orderBy('seq').last();
  const row = await buildAuditRow({ last, time: now, userId: actor.userId, deviceId: actor.deviceId, action: 'worklist_signed_off', entity: `worklist_item/${itemId}`, after: { signed_off_by: actor.userId, entry_status: entry?.entry.status ?? 'missing' } });
  await db.transaction('rw', [db.worklist_item, db.audit_log], async () => {
    const head = await db.audit_log.orderBy('seq').last();
    if ((head?.seq ?? 0) !== (last?.seq ?? 0)) throw new EntryWriteError('Another change was saved at the same moment. Try again.');
    const cur = await db.worklist_item.get(itemId);
    if (cur?.signed_off_at) throw new EntryWriteError('Already signed off.');
    await db.worklist_item.update(itemId, { signed_off_by: actor.userId, signed_off_at: now });
    await db.audit_log.add(row);
  });
}
