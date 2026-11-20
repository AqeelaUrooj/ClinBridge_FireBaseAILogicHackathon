import type { DowntimeDB } from '../db';
import type { Practitioner, Role } from '../schema';
import { buildAuditRow } from '../audit';
import { hashPin, isValidPinFormat, verifyPin } from '../../lib/crypto';
import type { Clock } from '../../lib/time';
import { TABLE_NAMES } from '../schema';
import { EntryWriteError, type Actor } from './entries';
import { ACTIVE_CLINICAL_POLICY } from '../../config/clinicalPolicy';

/**
 * Admin actions. Every action checks that the actor is an active admin (not only the screen), writes
 * an audit row, and changes nothing clinical. Uses only fields of the final 19-table schema.
 */
async function requireAdmin(db: DowntimeDB, actor: Actor): Promise<Practitioner> {
  const p = await db.practitioner.get(actor.userId);
  if (!p || !p.active || p.role !== 'admin') throw new EntryWriteError('Only an admin can do this.');
  return p;
}

async function audit(db: DowntimeDB, clock: Clock, actor: Actor, action: string, entity: string, after: unknown, before?: unknown) {
  const last = await db.audit_log.orderBy('seq').last();
  return buildAuditRow({ last, time: clock.nowIso(), userId: actor.userId, deviceId: actor.deviceId, action, entity, after, before });
}

/** Write rows + one audit row atomically, refusing if another write moved the audit head meanwhile. */
async function commit(db: DowntimeDB, row: Awaited<ReturnType<typeof audit>>, work: () => Promise<unknown>) {
  await db.transaction('rw', db.tables, async () => {
    const head = await db.audit_log.orderBy('seq').last();
    if ((head?.seq ?? 0) !== row.seq - 1) throw new EntryWriteError('Another change was saved at the same moment. Try again.');
    await work();
    await db.audit_log.add(row);
  });
}

/* ------------------------------ Staff ------------------------------ */

export async function addStaff(db: DowntimeDB, clock: Clock, actor: Actor, s: { name: string; initials: string; role: Role; pin: string }): Promise<Practitioner> {
  await requireAdmin(db, actor);
  const name = s.name.trim(), initials = s.initials.trim().toUpperCase();
  if (!name) throw new EntryWriteError('Enter a name.');
  if (!/^[A-Z]{1,3}$/.test(initials)) throw new EntryWriteError('Initials: 1 to 3 letters.');
  if (!(['RN', 'LPN', 'admin'] as Role[]).includes(s.role)) throw new EntryWriteError('Pick a role.');
  if (!isValidPinFormat(s.pin)) throw new EntryWriteError('PIN must be 4 digits.');
  const p: Practitioner = { id: `pr-${crypto.randomUUID().slice(0, 8)}`, name, initials, role: s.role, pin_hash: await hashPin(s.pin), active: true };
  const row = await audit(db, clock, actor, 'staff_added', `practitioner/${p.id}`, { name, initials, role: s.role, active: true });
  await commit(db, row, () => db.practitioner.add(p));
  return p;
}

export async function setStaffActive(db: DowntimeDB, clock: Clock, actor: Actor, id: string, active: boolean): Promise<void> {
  const admin = await requireAdmin(db, actor);
  if (id === admin.id && !active) throw new EntryWriteError('You cannot switch off your own account.');
  const p = await db.practitioner.get(id);
  if (!p) throw new EntryWriteError('Staff member not found.');
  if (!active && p.role === 'admin' && (await db.practitioner.filter((x) => x.role === 'admin' && x.active).count()) <= 1) {
    throw new EntryWriteError('At least one active admin must remain.');
  }
  const row = await audit(db, clock, actor, active ? 'staff_reactivated' : 'staff_deactivated', `practitioner/${id}`, { active }, { active: p.active });
  await commit(db, row, () => db.practitioner.update(id, { active }));
}

export async function resetStaffPin(db: DowntimeDB, clock: Clock, actor: Actor, id: string, pin: string): Promise<void> {
  await requireAdmin(db, actor);
  if (!isValidPinFormat(pin)) throw new EntryWriteError('PIN must be 4 digits.');
  if (!(await db.practitioner.get(id))) throw new EntryWriteError('Staff member not found.');
  const pin_hash = await hashPin(pin);
  const row = await audit(db, clock, actor, 'staff_pin_reset', `practitioner/${id}`, { pin_reset: true }); // never the PIN or hash
  await commit(db, row, () => db.practitioner.update(id, { pin_hash }));
}

/* ------------------------------ Downtime lifecycle ------------------------------ */

export async function declareDowntime(db: DowntimeDB, clock: Clock, actor: Actor): Promise<string> {
  await requireAdmin(db, actor);
  if ((await db.downtime_event.filter((e) => !e.ended_at).count()) > 0) throw new EntryWriteError('A downtime is already open.');
  const now = clock.nowIso();
  const id = `dt-${now.slice(0, 16).replace(/[:T]/g, '-')}-${crypto.randomUUID().slice(0, 4)}`;
  const row = await audit(db, clock, actor, 'downtime_declared', `downtime_event/${id}`, { declared_at: now });
  await commit(db, row, () => db.downtime_event.add({ id, declared_at: now, declared_by: actor.userId, network_cleared_at: null, cleared_by: null, ended_at: null }));
  return id;
}

/**
 * Network clearance = the authorised switch to Back online (cloud allowed for recovery only).
 * Needs every checklist item ticked AND the admin's own PIN again (documented gate: checklist + PIN).
 */
export async function clearNetwork(db: DowntimeDB, clock: Clock, actor: Actor, ticked: string[], pin: string): Promise<void> {
  const admin = await requireAdmin(db, actor);
  const missing = ACTIVE_CLINICAL_POLICY.recovery.networkChecklist.filter((c) => !ticked.includes(c));
  if (missing.length) throw new EntryWriteError('Tick every checklist item first.');
  if (!(await verifyPin(pin, admin.pin_hash))) throw new EntryWriteError('PIN is not right.');
  const ev = (await db.downtime_event.filter((e) => !e.ended_at).toArray())[0];
  if (!ev) throw new EntryWriteError('No downtime is open.');
  if (ev.network_cleared_at) throw new EntryWriteError('The network was already cleared.');
  const now = clock.nowIso();
  const row = await audit(db, clock, actor, 'network_cleared', `downtime_event/${ev.id}`, { network_cleared_at: now, checklist: ticked }, { network_cleared_at: null });
  await commit(db, row, () => db.downtime_event.update(ev.id, { network_cleared_at: now, cleared_by: actor.userId }));
}

/** End the downtime only when every worklist item is signed off (UI/UX: "end only when the worklist is finished"). */
export async function endDowntime(db: DowntimeDB, clock: Clock, actor: Actor): Promise<void> {
  await requireAdmin(db, actor);
  const ev = (await db.downtime_event.filter((e) => !e.ended_at).toArray())[0];
  if (!ev) throw new EntryWriteError('No downtime is open.');
  if (!ev.network_cleared_at) throw new EntryWriteError('Clear the network (Back online) before ending.');
  const open = await db.worklist_item.filter((w) => !w.signed_off_at).count();
  if (open > 0) throw new EntryWriteError(`${open} worklist items are not signed off yet.`);
  const now = clock.nowIso();
  const row = await audit(db, clock, actor, 'downtime_ended', `downtime_event/${ev.id}`, { ended_at: now }, { ended_at: null });
  await commit(db, row, () => db.downtime_event.update(ev.id, { ended_at: now }));
}

/* ------------------------------ Snapshot import (Real records only) ------------------------------ */

const SNAPSHOT_TABLES = ['snapshot', 'patient', 'encounter', 'allergy', 'active_order', 'snapshot_result'] as const;

export interface SnapshotCheck { ok: boolean; errors: string[]; counts: Record<string, number> }

/** Checks a patient-list file before import. Fake (practice) data is refused for Real records. */
export function checkSnapshotFile(json: unknown): SnapshotCheck {
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  if (!json || typeof json !== 'object') return { ok: false, errors: ['Not a JSON object.'], counts };
  const o = json as Record<string, unknown>;
  const meta = o._meta as { warning?: string } | undefined;
  if (meta?.warning && /fake|synthetic/i.test(meta.warning)) errors.push('This file is marked as fake practice data. It cannot be loaded into Real records.');
  for (const t of SNAPSHOT_TABLES) {
    if (!Array.isArray(o[t])) { errors.push(`Missing table "${t}".`); continue; }
    counts[t] = (o[t] as unknown[]).length;
  }
  for (const k of Object.keys(o)) if (k !== '_meta' && !(SNAPSHOT_TABLES as readonly string[]).includes(k)) {
    errors.push(`"${k}" is not part of a patient list${(TABLE_NAMES as readonly string[]).includes(k) ? ' (clinical records are never imported)' : ''}.`);
  }
  if ((counts.snapshot ?? 0) !== 1) errors.push('The file must contain exactly one snapshot row.');
  const ids = (t: string) => new Set(((o[t] as { id?: string }[]) ?? []).map((r) => r.id));
  const patients = ids('patient');
  for (const r of (o.encounter as { patient_id?: string }[]) ?? []) if (!patients.has(r.patient_id)) { errors.push('An encounter points to a patient that is not in the file.'); break; }
  for (const r of (o.allergy as { patient_id?: string }[]) ?? []) if (!patients.has(r.patient_id)) { errors.push('An allergy points to a patient that is not in the file.'); break; }
  return { ok: errors.length === 0, errors, counts };
}

export async function importSnapshot(db: DowntimeDB, clock: Clock, actor: Actor, json: unknown): Promise<SnapshotCheck> {
  await requireAdmin(db, actor);
  if (db.dataset !== 'live') throw new EntryWriteError('Patient lists are imported into Real records only. Practice uses its own fake data.');
  const check = checkSnapshotFile(json);
  if (!check.ok) throw new EntryWriteError(check.errors[0]!);
  const o = json as Record<string, unknown[]>;
  const snap = o.snapshot![0] as { id: string };
  const row = await audit(db, clock, actor, 'snapshot_imported', `snapshot/${snap.id}`, { counts: check.counts });
  await commit(db, row, async () => {
    for (const t of SNAPSHOT_TABLES) await db.table(t).bulkPut(o[t]!);
  });
  return check;
}

/* ------------------------------ First-time setup (Real records) ------------------------------ */

/** Creates the first admin and registers this laptop. Allowed only while Real records has no staff at all. */
export async function firstTimeSetup(db: DowntimeDB, clock: Clock, s: { name: string; initials: string; pin: string; deviceLabel: string; unit: string }): Promise<Practitioner> {
  if (db.dataset !== 'live') throw new EntryWriteError('Setup is only for Real records.');
  if ((await db.practitioner.count()) > 0) throw new EntryWriteError('Setup is already done. An admin can add staff.');
  const name = s.name.trim(), initials = s.initials.trim().toUpperCase();
  if (!name || !/^[A-Z]{1,3}$/.test(initials)) throw new EntryWriteError('Enter a name and 1 to 3 initials.');
  if (!isValidPinFormat(s.pin)) throw new EntryWriteError('PIN must be 4 digits.');
  if (!s.deviceLabel.trim() || !s.unit.trim()) throw new EntryWriteError('Enter the laptop name and the unit.');
  const p: Practitioner = { id: `pr-${crypto.randomUUID().slice(0, 8)}`, name, initials, role: 'admin', pin_hash: await hashPin(s.pin), active: true };
  const device = { id: `dev-${crypto.randomUUID().slice(0, 6)}`, label: s.deviceLabel.trim(), unit: s.unit.trim(), last_clock_sync: clock.nowIso(), model_status: 'unknown' };
  const actor = { userId: p.id, deviceId: device.id };
  const row = await audit(db, clock, actor, 'first_time_setup', `practitioner/${p.id}`, { admin: { name, initials }, device: { id: device.id, label: device.label, unit: device.unit } });
  await commit(db, row, async () => { await db.practitioner.add(p); await db.device.add(device); });
  return p;
}
