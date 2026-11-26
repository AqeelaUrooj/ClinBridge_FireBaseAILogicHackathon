import type { DowntimeDB } from '../db';
import type { Handoff } from '../schema';
import { buildAuditRow } from '../audit';
import { guardStorage } from '../errors';
import type { Clock } from '../../lib/time';
import { EntryWriteError, type Actor } from './entries';
import { currentEncounter, isActiveStay } from '../../lib/admission';

/**
 * Shift handover notes (handoff table, final schema: no time or status fields).
 * - Built only from CONFIRMED entries of the same patient (Data plan B6): checked here.
 * - Append-only: each save is a new row; earlier handovers are never changed.
 * - The draft exists only on screen; saving = the nurse has reviewed it.
 * - The save time comes from the audit row ('handoff_saved').
 */
export interface HandoffInput {
  patientId: string;
  shift: string;
  situation: string;
  background: string;
  assessment: string;
  openItems: string[];
  sourceEntryIds: string[];
}

export function validateHandoff(i: HandoffInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!i.shift.trim()) e.shift = 'Say which handover this is';
  if (!i.situation.trim()) e.situation = 'Write the situation';
  if (!i.background.trim()) e.background = 'Write the background';
  if (!i.assessment.trim()) e.assessment = 'Write the assessment';
  return e;
}

export async function createHandoff(db: DowntimeDB, clock: Clock, actor: Actor, i: HandoffInput): Promise<Handoff> {
  const errors = validateHandoff(i);
  if (Object.keys(errors).length) throw new EntryWriteError(Object.values(errors)[0]!);
  if ((await db.practitioner.get(actor.userId))?.role === 'admission') throw new EntryWriteError('Admission staff do not write nursing handovers.');
  const stay = currentEncounter(await db.encounter.where('patient_id').equals(i.patientId).toArray());
  if (stay && !isActiveStay(stay)) throw new EntryWriteError('This patient was discharged. A new handover is not written for a closed stay.');
  const ids = [...new Set(i.sourceEntryIds)];
  const sources = await db.entry.bulkGet(ids);
  sources.forEach((s, k) => {
    if (!s) throw new EntryWriteError(`Linked record ${ids[k]} was not found.`);
    if (s.patient_id !== i.patientId) throw new EntryWriteError('A linked record belongs to another patient.');
    if (s.status !== 'confirmed') throw new EntryWriteError('Only confirmed records can be linked to a handover.');
  });
  const row: Handoff = {
    id: `ho-${crypto.randomUUID()}`,
    patient_id: i.patientId,
    shift: i.shift.trim(),
    situation: i.situation.trim(),
    background: i.background.trim(),
    assessment: i.assessment.trim(),
    open_items: i.openItems.map((x) => x.trim()).filter(Boolean),
    source_entry_ids: ids,
    created_by: actor.userId,
  };
  const now = clock.nowIso();
  const last = await db.audit_log.orderBy('seq').last();
  const audit = await buildAuditRow({ last, time: now, userId: actor.userId, deviceId: actor.deviceId, action: 'handoff_saved', entity: `handoff/${row.id}`, after: row });
  await guardStorage(() => db.transaction('rw', [db.handoff, db.audit_log, db.encounter], async () => {
    const head = await db.audit_log.orderBy('seq').last();
    if ((head?.seq ?? 0) !== (last?.seq ?? 0)) throw new EntryWriteError('Another change was saved at the same moment. Try again.');
    if (stay && !isActiveStay(await db.encounter.get(stay.id))) throw new EntryWriteError('This patient was discharged a moment ago. A new handover is not written for a closed stay.');
    await db.handoff.add(row);
    await db.audit_log.add(audit);
  }), (m) => new EntryWriteError(m));
  return row;
}

export interface HandoffWithTime { handoff: Handoff; savedAt: string | null }

/** Newest first. Seed handovers have no audit row; they sort last and show the shift text only. */
export async function listHandoffs(db: DowntimeDB, patientId: string): Promise<HandoffWithTime[]> {
  const rows = await db.handoff.where('patient_id').equals(patientId).toArray();
  const audits = await db.audit_log.filter((a) => a.action === 'handoff_saved').toArray();
  const t = new Map(audits.map((a) => [a.entity.replace('handoff/', ''), a.time]));
  return rows.map((h) => ({ handoff: h, savedAt: t.get(h.id) ?? null }))
    .sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
}
