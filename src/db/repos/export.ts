import type { DowntimeDB } from '../db';
import { buildAuditRow, sha256Hex } from '../audit';
import type { Clock } from '../../lib/time';
import { buildBundle, validateBundle } from '../../lib/fhir';
import { currentEvent } from '../../lib/phase';
import { EntryWriteError, type Actor } from './entries';

/**
 * Prepare the FHIR R4 export file. Allowed in Back online. Builds from every non-draft entry plus the
 * patient list, validates it, and records the export (audit row with the file's SHA-256; worklist items
 * marked exported). The file is downloaded by the user; nothing is transmitted.
 */
export async function prepareExport(db: DowntimeDB, clock: Clock) {
  const [patients, encounters, allergies, orders, practitioners, entries, devices] = await Promise.all([
    db.patient.toArray(), db.encounter.toArray(), db.allergy.toArray(), db.active_order.toArray(), db.practitioner.toArray(),
    db.entry.toArray(), db.device.toArray(),
  ]);
  const withChild = await Promise.all(entries.filter((e) => e.status !== 'draft').map(async (e) => ({ entry: e, child: await db.table(e.type).where('entry_id').equals(e.id).first() })));
  withChild.sort((a, b) => a.entry.care_time.localeCompare(b.entry.care_time) || a.entry.id.localeCompare(b.entry.id));
  const bundle = buildBundle({ patients, encounters, allergies, orders, practitioners, entries: withChild, exportedAt: clock.nowIso(), deviceLabels: new Map(devices.map((d) => [d.id, d.label])) });
  const errors = validateBundle(bundle);
  const json = JSON.stringify(bundle, null, 2);
  const drafts = entries.filter((e) => e.status === 'draft').length;
  const openItems = await db.worklist_item.filter((w) => !w.signed_off_at).count();
  return { bundle, json, errors, drafts, openItems, resourceCount: (bundle.entry as unknown[]).length };
}

export async function recordExport(db: DowntimeDB, clock: Clock, actor: Actor, json: string): Promise<string> {
  const ev = currentEvent(await db.downtime_event.toArray());
  if (!ev?.network_cleared_at) throw new EntryWriteError('Export is available after an admin clears the network (Back online).');
  const hash = await sha256Hex(json);
  const now = clock.nowIso();
  const last = await db.audit_log.orderBy('seq').last();
  const row = await buildAuditRow({ last, time: now, userId: actor.userId, deviceId: actor.deviceId, action: 'fhir_export', entity: 'bundle', after: { sha256: hash, bytes: json.length } });
  await db.transaction('rw', [db.worklist_item, db.audit_log], async () => {
    const head = await db.audit_log.orderBy('seq').last();
    if ((head?.seq ?? 0) !== (last?.seq ?? 0)) throw new EntryWriteError('Another change was saved at the same moment. Try again.');
    const signed = await db.worklist_item.filter((w) => !!w.signed_off_at && !w.exported_at).toArray();
    for (const w of signed) await db.worklist_item.update(w.id, { exported_at: now });
    await db.audit_log.add(row);
  });
  return hash;
}
