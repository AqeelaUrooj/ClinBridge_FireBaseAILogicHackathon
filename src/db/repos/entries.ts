import Dexie from 'dexie';
import type { DowntimeDB } from '../db';
import type { AuditLog, ChildByType, Entry, EntryType, InferenceSource, MedAdmin, PhotoCheck } from '../schema';
import { needsSecondNurse } from '../../lib/meds';
import { ACTIVE_CLINICAL_POLICY } from '../../config/clinicalPolicy';
import { buildAuditRow } from '../audit';
import { guardStorage } from '../errors';
import type { Clock } from '../../lib/time';

/**
 * Append-only clinical entries (Implementation Plan: save-first rule, append-only log).
 * Laravel analogy: this is the repository / service class; components never write tables directly.
 *
 * Rules enforced here:
 *  - an entry and its child row are written together, in one transaction, with their audit rows
 *  - values are never edited in place; a correction is a NEW entry with supersedes_id
 *  - the only change ever made to an old entry is its status (confirmed → corrected / entered-in-error)
 */

export class EntryWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntryWriteError';
  }
}

export interface Actor {
  userId: string;
  deviceId: string;
}

export interface NewEntryInput<T extends EntryType> {
  type: T;
  patientId: string;
  careTime: string;
  values: Omit<ChildByType[T], 'id' | 'entry_id'>;
  rawInputKind?: 'typed' | 'photo';
  rawInputRef?: string;
  aiProposal?: Record<string, unknown> | null;
  inferenceSource?: InferenceSource | null;
  photoCheck?: PhotoCheck | null;
  status?: 'confirmed' | 'draft';
  scheduledTime?: string | null;
  supersedesId?: string | null;
  /** Required when supersedesId is set. Saved in entry.change_reason on the new version. */
  correctionReason?: string;
}

// Serialise writes in this tab so audit rows always chain in order.
let queue: Promise<unknown> = Promise.resolve();
function serial<R>(fn: () => Promise<R>): Promise<R> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

async function lastAudit(db: DowntimeDB): Promise<AuditLog | undefined> {
  return db.audit_log.orderBy('seq').last();
}

function childTable(db: DowntimeDB, type: EntryType) {
  return db.table(type) as Dexie.Table<ChildByType[EntryType], string>;
}

/** Documented rule: a dose needing verification under the active policy cannot be confirmed without a second, different, eligible nurse. */
async function checkHighAlert(db: DowntimeDB, actor: Actor, m: Omit<MedAdmin, 'id' | 'entry_id'>): Promise<void> {
  if (!needsSecondNurse(m.drug_name, m.event)) return;
  if (!m.double_checked || !m.double_checked_by) throw new EntryWriteError('A second nurse must check this high-alert drug.');
  if (m.double_checked_by === actor.userId) throw new EntryWriteError('The second check must be done by a different nurse.');
  const p = await db.practitioner.get(m.double_checked_by);
  if (!p || !p.active || !ACTIVE_CLINICAL_POLICY.secondChecker.roles.includes(p.role)) throw new EntryWriteError('This person cannot be the second checker.');
}

export async function createEntry<T extends EntryType>(
  db: DowntimeDB, clock: Clock, actor: Actor, input: NewEntryInput<T>,
): Promise<Entry> {
  return guardStorage(() => serial(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const encounter = await db.encounter.where('patient_id').equals(input.patientId).first();
      if (!encounter) throw new EntryWriteError('This patient has no encounter in the patient list.');
      const old = input.supersedesId ? await db.entry.get(input.supersedesId) : undefined;
      if (input.supersedesId) {
        if (!old) throw new EntryWriteError('The record being corrected was not found.');
        if (old.status !== 'confirmed') throw new EntryWriteError('Only a confirmed record can be corrected.');
        if (old.patient_id !== input.patientId) throw new EntryWriteError('A correction must stay with the same patient.');
        if (old.type !== input.type) throw new EntryWriteError('A correction must be the same kind of record.');
        if (!input.correctionReason?.trim()) throw new EntryWriteError('A reason is required to fix a record.');
      }

      if (input.type === 'med_admin' && (input.status ?? 'confirmed') === 'confirmed') await checkHighAlert(db, actor, input.values as Omit<MedAdmin, 'id' | 'entry_id'>);
      const now = clock.nowIso();
      const id = newId('e');
      const status = input.status ?? 'confirmed';
      const confirmed: Record<string, unknown> | null =
        status === 'confirmed'
          ? { ...(input.values as Record<string, unknown>) }
          : null;

      const entryBase: Omit<Entry, 'counter'> = {
        id,
        type: input.type,
        patient_id: input.patientId,
        encounter_id: encounter.id,
        care_time: input.careTime,
        entry_time: now,
        scheduled_time: input.scheduledTime ?? null,
        device_id: actor.deviceId,
        performer_id: actor.userId,
        enterer_id: null,
        raw_input_kind: input.rawInputKind ?? 'typed',
        raw_input_ref: input.rawInputRef ?? `typed:${id}`,
        ai_proposal: input.aiProposal ?? null,
        inference_source: input.inferenceSource ?? null,
        confirmed,
        confirmed_by: status === 'confirmed' ? actor.userId : null,
        confirmed_at: status === 'confirmed' ? now : null,
        status,
        supersedes_id: input.supersedesId ?? null,
        photo_check: input.photoCheck ?? null,
        change_reason: input.supersedesId ? input.correctionReason!.trim() : null,
      };
      const child = { ...(input.values as object), id: newId(input.type.replace('_', '').slice(0, 3)), entry_id: id } as ChildByType[T];

      // Hashes are computed before the transaction (IndexedDB transactions close on non-DB awaits).
      const last = await lastAudit(db);
      const rows: AuditLog[] = [];
      const push = async (action: string, entity: string, after: unknown, before?: unknown) => {
        rows.push(await buildAuditRow({ last: rows[rows.length - 1] ?? last, time: now, userId: actor.userId, deviceId: actor.deviceId, action, entity, after, before }));
      };
      await push('entry_saved_raw', `entry/${id}`, `raw:${entryBase.raw_input_ref}`);
      if (status === 'confirmed') await push('entry_confirmed', `entry/${id}`, confirmed ?? {}, input.aiProposal ?? undefined);
      if (old) await push('entry_corrected', `entry/${old.id}`, { status: 'corrected', superseded_by: id, change_reason: entryBase.change_reason }, { status: old.status });

      try {
        let saved: Entry | undefined;
        await db.transaction('rw', [db.entry, childTable(db, input.type), db.audit_log], async () => {
          const head = await db.audit_log.orderBy('seq').last();
          if ((head?.seq ?? 0) !== (last?.seq ?? 0)) throw new Dexie.AbortError('audit head moved');
          const top = await db.entry
            .where('[device_id+counter]')
            .between([actor.deviceId, Dexie.minKey], [actor.deviceId, Dexie.maxKey])
            .last();
          saved = { ...entryBase, counter: (top?.counter ?? 0) + 1 };
          await db.entry.add(saved);
          await childTable(db, input.type).add(child);
          if (old) {
            const current = await db.entry.get(old.id);
            if (!current || current.status !== 'confirmed') throw new EntryWriteError('This record was already changed. Reload and try again.');
            await db.entry.update(old.id, { status: 'corrected' });
          }
          await db.audit_log.bulkAdd(rows);
        });
        return saved!;
      } catch (err) {
        if (err instanceof Dexie.AbortError && attempt < 2) continue;
        throw err;
      }
    }
    throw new EntryWriteError('Could not save after several tries. Please try again.');
  }), (m) => new EntryWriteError(m));
}

/** Mark an entry as entered in error. Values stay; the record is shown crossed out. */
export async function markEnteredInError(db: DowntimeDB, clock: Clock, actor: Actor, entryId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new EntryWriteError('A reason is required.');
  return guardStorage(() => serial(async () => {
    const entry = await db.entry.get(entryId);
    if (!entry) throw new EntryWriteError('Record not found.');
    if (entry.status !== 'confirmed') throw new EntryWriteError('Only a confirmed record can be marked as a mistake.');
    const now = clock.nowIso();
    const last = await lastAudit(db);
    const row = await buildAuditRow({ last, time: now, userId: actor.userId, deviceId: actor.deviceId, action: 'entered_in_error', entity: `entry/${entryId}`, before: { status: entry.status }, after: { status: 'entered-in-error', change_reason: reason.trim() } });
    await db.transaction('rw', [db.entry, db.audit_log], async () => {
      const head = await db.audit_log.orderBy('seq').last();
      if ((head?.seq ?? 0) !== (last?.seq ?? 0)) throw new EntryWriteError('Another change was saved at the same moment. Try again.');
      const current = await db.entry.get(entryId);
      if (!current || current.status !== 'confirmed') throw new EntryWriteError('This record was already changed.');
      await db.entry.update(entryId, { status: 'entered-in-error', change_reason: reason.trim() });
      await db.audit_log.add(row);
    });
  }), (m) => new EntryWriteError(m));
}

export interface EntryWithChild<T extends EntryType = EntryType> {
  entry: Entry;
  child: ChildByType[T] | undefined;
}

export async function getEntry(db: DowntimeDB, id: string): Promise<EntryWithChild | undefined> {
  const entry = await db.entry.get(id);
  if (!entry) return undefined;
  const child = await childTable(db, entry.type).where('entry_id').equals(id).first();
  return { entry, child };
}

export async function listPatientEntries(db: DowntimeDB, patientId: string): Promise<EntryWithChild[]> {
  const entries = await db.entry.where('patient_id').equals(patientId).toArray();
  entries.sort((a, b) => b.care_time.localeCompare(a.care_time) || b.entry_time.localeCompare(a.entry_time));
  return Promise.all(entries.map(async (entry) => ({ entry, child: await childTable(db, entry.type).where('entry_id').equals(entry.id).first() })));
}

/** All versions of a record, oldest first: walk back via supersedes_id, then forward to the newest. */
export async function versionChain(db: DowntimeDB, id: string): Promise<EntryWithChild[]> {
  const chain: Entry[] = [];
  let cur = await db.entry.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.supersedes_id ? await db.entry.get(cur.supersedes_id) : undefined;
  }
  let tip = chain[chain.length - 1];
  while (tip) {
    const next = await db.entry.where('supersedes_id').equals(tip.id).first();
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    chain.push(next);
    tip = next;
  }
  return Promise.all(chain.map(async (entry) => ({ entry, child: await childTable(db, entry.type).where('entry_id').equals(entry.id).first() })));
}

/**
 * Confirm a draft (e.g. typed from a photo, or proposed by AI): the nurse's checked values become the record.
 * The draft's ai_proposal and raw input stay on the entry; the audit row keeps what was proposed vs confirmed.
 * Only drafts can be confirmed; confirmed records change only through a correction.
 */
export async function confirmDraft<T extends EntryType>(
  db: DowntimeDB, clock: Clock, actor: Actor, entryId: string, type: T, values: Omit<ChildByType[T], 'id' | 'entry_id'>, careTime?: string,
): Promise<Entry> {
  if (type === 'med_admin') await checkHighAlert(db, actor, values as Omit<MedAdmin, 'id' | 'entry_id'>);
  return guardStorage(() => serial(async () => {
    const entry = await db.entry.get(entryId);
    if (!entry) throw new EntryWriteError('Record not found.');
    if (entry.status !== 'draft') throw new EntryWriteError('Only a draft can be confirmed here.');
    if (entry.type !== type) throw new EntryWriteError('Wrong kind of record.');
    const child = await childTable(db, type).where('entry_id').equals(entryId).first();
    const now = clock.nowIso();
    const confirmed = { ...(values as Record<string, unknown>) };
    const last = await lastAudit(db);
    const row = await buildAuditRow({ last, time: now, userId: actor.userId, deviceId: actor.deviceId, action: 'entry_confirmed', entity: `entry/${entryId}`, before: entry.ai_proposal ?? child ?? {}, after: confirmed });
    const updated: Entry = { ...entry, status: 'confirmed', confirmed, confirmed_by: actor.userId, confirmed_at: now, care_time: careTime ?? entry.care_time };
    await db.transaction('rw', [db.entry, childTable(db, type), db.audit_log], async () => {
      const head = await db.audit_log.orderBy('seq').last();
      if ((head?.seq ?? 0) !== (last?.seq ?? 0)) throw new EntryWriteError('Another change was saved at the same moment. Try again.');
      const current = await db.entry.get(entryId);
      if (!current || current.status !== 'draft') throw new EntryWriteError('This draft was already handled.');
      await db.entry.put(updated);
      if (child) await childTable(db, type).put({ ...(values as object), id: (child as { id: string }).id, entry_id: entryId } as ChildByType[T]);
      else await childTable(db, type).add({ ...(values as object), id: newId(type.replace('_', '').slice(0, 3)), entry_id: entryId } as ChildByType[T]);
      await db.audit_log.add(row);
    });
    return updated;
  }), (m) => new EntryWriteError(m));
}
