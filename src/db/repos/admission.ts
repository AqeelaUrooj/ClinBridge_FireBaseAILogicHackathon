import Dexie from 'dexie';
import type { DowntimeDB } from '../db';
import type { ActiveOrder, Allergy, AllergyStatus, AuditLog, Encounter, EncounterLocation, Entry, IdentityStatus, Note, Patient, Practitioner } from '../schema';
import { buildAuditRow } from '../audit';
import { guardStorage } from '../errors';
import { isPendingActivation } from '../enrollment';
import { PRACTICE_PIN } from '../seed';
import { EntryWriteError, listPatientEntries, type Actor } from './entries';
import {
  ADMISSION_POLICY, ADMISSION_REASONS, ADMISSION_TYPES, ALLERGY_REACTIONS, DISCHARGE_DESTINATIONS, DISCHARGE_REASONS, FICTIONAL_FAMILY,
  FICTIONAL_GIVEN, IDENTITY_REVIEW_NOTES, LOCAL_ID_PREFIX, PRACTICE_ALLERGENS, PRACTICE_ORDER_SCENARIOS, TRANSFER_REASONS, practiceBeds,
  type AdmissionAction, type PracticeScenario, ALLERGY_STATUS_LABEL,
} from '../../config/admissionPolicy';
import { currentEncounter, isActiveStay, isLocallyRegistered, locationLabel } from '../../lib/admission';
import { derivePhase, type Phase } from '../../lib/phase';
import { isHighAlert, isMedOrder, orderGroup, slotStatuses } from '../../lib/meds';
import { hashPin } from '../../lib/crypto';
import type { LifecycleCategory } from '../../lib/charting';
import type { Clock } from '../../lib/time';

/**
 * Admission lifecycle (26 Nov 2026): registration, bed assignment, transfer, discharge, identity review.
 * PRACTICE ONLY in this version, checked here and not only on screen. Every action:
 *  - re-reads the signed-in account (active, role) from the database, so a stale session cannot act;
 *  - writes its rows, one lifecycle note (an ordinary append-only record) and its audit rows in ONE transaction;
 *  - re-checks the temporary identifier and the bed INSIDE that transaction. IndexedDB runs read-write transactions
 *    on the same tables one after another, also across browser tabs, so two registrations can never take the same
 *    identifier or bed. A changed audit head (another write in between) makes the whole attempt start again.
 * No network, no AI. The rules are prototype policy (config/admissionPolicy.ts), not approved clinical policy.
 */

export const PRACTICE_ADMISSION_STAFF: Omit<Practitioner, 'pin_hash'> = { id: 'pr-marquez', name: 'Leila Marquez', initials: 'LM', role: 'admission', active: true };

export { LIFECYCLE_NOTE, isLifecycleNote, type LifecycleCategory } from '../../lib/charting';

class Retry extends Error {}

const uid = () => crypto.randomUUID();

async function phaseOf(db: DowntimeDB): Promise<Phase> {
  return derivePhase(await db.downtime_event.toArray());
}

/** The authorization check of every action. Returns the account and, for an admin, the written override reason. */
async function requireActor(db: DowntimeDB, actor: Actor, action: AdmissionAction, overrideReason?: string): Promise<{ who: Practitioner; override: string | null }> {
  if (db.dataset !== 'practice') {
    throw new EntryWriteError('Registration, transfer and discharge work with fictional Practice patients only in this version. Real records keep the hospital patient list.');
  }
  const who = await db.practitioner.get(actor.userId);
  if (!who || !who.active || isPendingActivation(who)) throw new EntryWriteError('Sign in again: this account is not active.');
  if ((ADMISSION_POLICY.roles[action] as readonly string[]).includes(who.role)) {
    if (action === 'register_provisional' && !(ADMISSION_POLICY.provisionalPhases as readonly Phase[]).includes(await phaseOf(db))) {
      throw new EntryWriteError('A nurse registers a provisional patient only while the hospital system is down. Admission staff register patients otherwise.');
    }
    return { who, override: null };
  }
  if (who.role === 'admin' && ADMISSION_POLICY.adminOverride.includes(action)) {
    const reason = overrideReason?.trim();
    if (!reason) throw new EntryWriteError('An admin records this only as an override, with a written reason.');
    return { who, override: reason };
  }
  throw new EntryWriteError('Your role cannot do this.');
}

/** Audit rows built before the transaction (hashing is asynchronous and would close an IndexedDB transaction). */
async function chain(db: DowntimeDB, clock: Clock, actor: Actor, items: [action: string, entity: string, after: unknown, before?: unknown][]) {
  const last = await db.audit_log.orderBy('seq').last();
  const rows: AuditLog[] = [];
  for (const [action, entity, after, before] of items) {
    rows.push(await buildAuditRow({ last: rows[rows.length - 1] ?? last, time: clock.nowIso(), userId: actor.userId, deviceId: actor.deviceId, action, entity, after, before }));
  }
  return { rows, headSeq: last?.seq ?? 0 };
}

function lifecycleEntry(actor: Actor, patientId: string, encounterId: string, careTime: string, now: string, category: LifecycleCategory, text: string): { entry: Omit<Entry, 'counter'>; note: Note } {
  const id = `e-${uid()}`;
  const values = { category, text, score_name: null, score_value: null };
  return {
    entry: {
      id, type: 'note', patient_id: patientId, encounter_id: encounterId, care_time: careTime, entry_time: now, scheduled_time: null,
      device_id: actor.deviceId, performer_id: actor.userId, enterer_id: null, raw_input_kind: 'typed', raw_input_ref: `typed:${id}`,
      ai_proposal: null, inference_source: null, confirmed: values, confirmed_by: actor.userId, confirmed_at: now, status: 'confirmed',
      supersedes_id: null, photo_check: null, change_reason: null,
    },
    note: { id: `not-${uid()}`, entry_id: id, ...values },
  };
}

/** Next counter of this laptop's records, read inside the transaction (the same rule as every other record). */
async function nextCounter(db: DowntimeDB, deviceId: string): Promise<number> {
  const all = await db.entry.where('[device_id+counter]').between([deviceId, Dexie.minKey], [deviceId, Dexie.maxKey]).last();
  return (all?.counter ?? 0) + 1;
}

const auditEntryRows = (e: Omit<Entry, 'counter'>): [string, string, unknown][] => [['entry_saved_raw', `entry/${e.id}`, `raw:${e.raw_input_ref}`], ['entry_confirmed', `entry/${e.id}`, e.confirmed ?? {}]];

/** Runs attempts until one commits; a moved audit head or a taken identifier starts a fresh attempt. */
async function attempt<T>(work: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try { return await guardStorage(work, (m) => new EntryWriteError(m)); } catch (e) { if (!(e instanceof Retry)) throw e; }
  }
  throw new EntryWriteError('Another change was saved at the same moment several times. Try again.');
}

async function unitName(db: DowntimeDB): Promise<string> {
  const snap = await db.snapshot.orderBy('taken_at').last();
  return snap?.unit ?? (await db.device.toArray())[0]?.unit ?? 'Practice unit';
}

/** Active stays in a bed of this unit, except one stay (the patient being moved). */
const bedTaken = (stays: Encounter[], unit: string, bed: string, exceptId?: string) => stays.some((e) => e.id !== exceptId && isActiveStay(e) && e.unit === unit && e.bed === bed);

/** Beds of the Practice unit and who is in them now. */
export async function bedBoard(db: DowntimeDB): Promise<{ unit: string; beds: { room: string; bed: string; patientId: string | null }[] }> {
  const unit = await unitName(db);
  const stays = (await db.encounter.toArray()).filter((e) => isActiveStay(e) && e.unit === unit);
  return { unit, beds: practiceBeds().map((b) => ({ ...b, patientId: stays.find((e) => e.bed === b.bed)?.patient_id ?? null })) };
}

/* ------------------------------ Identities and identifiers ------------------------------ */

export interface Identity { given: string; family: string; birthDate: string; sex: Patient['sex'] }

/** A new fictional identity from the Practice lists. Age 19 to 92 on the given day. */
export function generateIdentity(nowIso: string, rand: () => number = Math.random): Identity {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length) % xs.length]!;
  const [given, sex] = pick(FICTIONAL_GIVEN);
  const year = Number(nowIso.slice(0, 4)) - (19 + Math.floor(rand() * 74));
  const month = 1 + Math.floor(rand() * 12), day = 1 + Math.floor(rand() * 28);
  return { given, family: pick(FICTIONAL_FAMILY), birthDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, sex };
}

function checkIdentity(i: Identity, nowIso: string) {
  const g = FICTIONAL_GIVEN.find(([n]) => n === i.given);
  if (!g || !(FICTIONAL_FAMILY as readonly string[]).includes(i.family) || g[1] !== i.sex) throw new EntryWriteError('Use a generated fictional identity. The public Practice demo does not take typed names.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.birthDate) || Number.isNaN(Date.parse(i.birthDate)) || i.birthDate > nowIso.slice(0, 10) || Number(nowIso.slice(0, 4)) - Number(i.birthDate.slice(0, 4)) > 110) {
    throw new EntryWriteError('The date of birth is not valid.');
  }
}

/** Temporary local identifiers in use, read from the plain identifier index (no record is opened). */
async function nextLocalId(db: DowntimeDB): Promise<string> {
  const ids = (await db.patient.orderBy('mrn').keys()) as string[];
  const max = ids.filter((m) => m.startsWith(LOCAL_ID_PREFIX)).map((m) => Number(m.slice(LOCAL_ID_PREFIX.length))).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
  return `${LOCAL_ID_PREFIX}${String(max + 1).padStart(6, '0')}`;
}

/* ------------------------------ Registration ------------------------------ */

export interface AllergyInput { substance: string; reaction: string; severity: 'mild' | 'moderate' | 'severe' }
export interface RegistrationInput {
  kind: 'admission' | 'provisional';
  identity: Identity;
  admitTime: string;
  admissionType: string;
  admitReason: string;
  bed: string;
  responsibleNurseId: string | null;
  allergyStatus: AllergyStatus;
  allergies: AllergyInput[];
  scenario: PracticeScenario;
  overrideReason?: string;
}

export interface RegistrationErrors { [field: string]: string }

/** Field checks that need no database (shared by the form and the repository). */
export function validateRegistration(i: RegistrationInput, nowIso: string): RegistrationErrors {
  const e: RegistrationErrors = {};
  const t = Date.parse(i.admitTime), now = Date.parse(nowIso);
  if (Number.isNaN(t)) e.admitTime = 'Enter the admission date and time.';
  else if (t > now + 60_000) e.admitTime = 'The admission time cannot be in the future.';
  else if (t < now - ADMISSION_POLICY.maxAdmitBackHours * 3_600_000) e.admitTime = `The admission time must be within the last ${ADMISSION_POLICY.maxAdmitBackHours} hours.`;
  if (!(ADMISSION_TYPES as readonly string[]).includes(i.admissionType)) e.admissionType = 'Pick the admission type.';
  if (!(ADMISSION_REASONS as readonly string[]).includes(i.admitReason)) e.admitReason = 'Pick a Practice admission reason.';
  if (!practiceBeds().some((b) => b.bed === i.bed)) e.bed = 'Pick a free bed.';
  if (!(['documented', 'none_known', 'unknown', 'not_assessed'] as AllergyStatus[]).includes(i.allergyStatus)) e.allergyStatus = 'Pick the allergy status.';
  else if (i.allergyStatus === 'documented' && !i.allergies.length) e.allergyStatus = 'Add at least one allergy, or pick another status.';
  else if (i.allergyStatus !== 'documented' && i.allergies.length) e.allergyStatus = 'Allergies can be listed only with "Allergies documented".';
  const seen = new Set<string>();
  for (const a of i.allergies) {
    if (!(PRACTICE_ALLERGENS as readonly string[]).includes(a.substance) || !(ALLERGY_REACTIONS as readonly string[]).includes(a.reaction) || !['mild', 'moderate', 'severe'].includes(a.severity)) e.allergies = 'Pick each allergy, reaction and severity from the lists.';
    if (seen.has(a.substance)) e.allergies = `${a.substance} is listed twice.`;
    seen.add(a.substance);
  }
  if (!(i.scenario in PRACTICE_ORDER_SCENARIOS)) e.scenario = 'Pick a medication option.';
  return e;
}

export interface RegistrationResult { patient: Patient; encounter: Encounter; ordersAdded: number }

export async function registerPatient(db: DowntimeDB, clock: Clock, actor: Actor, input: RegistrationInput): Promise<RegistrationResult> {
  const action: AdmissionAction = input.kind === 'provisional' ? 'register_provisional' : 'register_patient';
  const { who, override } = await requireActor(db, actor, action, input.overrideReason);
  if (input.kind === 'provisional' && who.role === 'admin') throw new EntryWriteError('Provisional registration is a nurse’s downtime step. An admin records an admissions registration instead.');
  const now = clock.nowIso();
  checkIdentity(input.identity, now);
  const errors = validateRegistration(input, now);
  if (Object.keys(errors).length) throw new EntryWriteError(Object.values(errors)[0]!);
  if (input.responsibleNurseId) {
    const nurse = await db.practitioner.get(input.responsibleNurseId);
    if (!nurse || !nurse.active || nurse.role !== 'RN') throw new EntryWriteError('The responsible nurse must be an active RN.');
  }
  const sources = await Promise.all(PRACTICE_ORDER_SCENARIOS[input.scenario].sourceOrderIds.map((id) => db.active_order.get(id)));
  if (sources.some((o) => !o)) throw new EntryWriteError('The Practice medication scenario is not available on this laptop (reset Practice to restore it).');
  if (sources.some((o) => isHighAlert(o!.drug_name))) throw new EntryWriteError('A Practice scenario never adds a high-alert medicine.');
  const unit = await unitName(db);
  const room = practiceBeds().find((b) => b.bed === input.bed)!.room;
  const provisional = input.kind === 'provisional';

  return attempt(async () => {
    const tempId = await nextLocalId(db);
    const patient: Patient = {
      id: `pt-${uid().slice(0, 8)}`, mrn: tempId, family_name: input.identity.family, given_name: input.identity.given, birth_date: input.identity.birthDate,
      sex: input.identity.sex, wristband_barcode: null, origin: provisional ? 'nurse_provisional' : 'admission_registered', identifier_kind: 'local_temporary',
      identity_status: 'pending_verification', allergy_status: input.allergyStatus,
    };
    const location: EncounterLocation = { unit, room, bed: input.bed, from: input.admitTime, to: null };
    const encounter: Encounter = {
      id: `enc-${uid().slice(0, 8)}`, patient_id: patient.id, visit_number: `LOCAL-${tempId}`, unit, bed: input.bed, room, admit_time: input.admitTime,
      attending: null, code_status: null, diet: null, isolation: null, height_cm: null, weight_kg: null, status: 'active', admission_type: input.admissionType,
      admit_reason: input.admitReason, responsible_nurse_id: input.responsibleNurseId, location_history: [location], discharge_time: null, discharge_destination: null, discharge_reason: null,
    };
    const allergies: Allergy[] = input.allergyStatus === 'documented'
      ? input.allergies.map((a) => ({ id: `al-${uid().slice(0, 8)}`, patient_id: patient.id, substance: a.substance, reaction: a.reaction, severity: a.severity, status: 'active' }))
      : input.allergyStatus === 'none_known' ? [{ id: `al-${uid().slice(0, 8)}`, patient_id: patient.id, substance: 'No known allergies', reaction: null, severity: null, status: 'active' }] : [];
    const orders: ActiveOrder[] = sources.map((o) => ({ ...o!, id: `ord-${uid().slice(0, 8)}`, encounter_id: encounter.id, start: input.admitTime, stop: null, status: 'active', status_time: now, ordered_by: 'Practice scenario (fictional, not a prescription)' }));
    const text = [
      `${provisional ? 'Provisional registration during downtime' : 'Registered by admissions'} (Practice, fictional patient).`,
      `Temporary ID ${tempId}; not a hospital MRN. Identity reconciliation pending.`,
      `Admitted ${input.admissionType.toLowerCase()} to ${locationLabel(encounter)}.`,
      `Reason: ${input.admitReason}.`,
      `${ALLERGY_STATUS_LABEL[input.allergyStatus]}${allergies.length && input.allergyStatus === 'documented' ? `: ${allergies.map((a) => a.substance).join(', ')}` : ''}.`,
      orders.length ? `${PRACTICE_ORDER_SCENARIOS[input.scenario].label} added (fictional, not a prescription).` : 'No medication orders.',
      ...(override ? [`Admin override: ${override}`] : []),
    ].join(' ');
    const { entry, note } = lifecycleEntry(actor, patient.id, encounter.id, input.admitTime, now, 'admission', text);
    const { rows, headSeq } = await chain(db, clock, actor, [
      [provisional ? 'patient_registered_provisional' : 'patient_registered', `patient/${patient.id}`, { temporary_id: tempId, origin: patient.origin, identity_status: patient.identity_status, allergy_status: patient.allergy_status }],
      ['bed_assigned', `encounter/${encounter.id}`, { unit, room, bed: input.bed, from: input.admitTime }],
      ...(orders.length ? [['practice_orders_added', `encounter/${encounter.id}`, { scenario: input.scenario, orders: orders.map((o) => o.id) }] as [string, string, unknown]] : []),
      ...(override ? [['admin_override', `patient/${patient.id}`, { action, reason: override }] as [string, string, unknown]] : []),
      ...auditEntryRows(entry),
    ]);
    await db.transaction('rw', [db.patient, db.encounter, db.allergy, db.active_order, db.entry, db.note, db.audit_log], async () => {
      if (((await db.audit_log.orderBy('seq').last())?.seq ?? 0) !== headSeq) throw new Retry();
      if ((await db.patient.where('mrn').equals(tempId).count()) > 0) throw new Retry();
      if (bedTaken(await db.encounter.toArray(), unit, input.bed)) throw new EntryWriteError(`Bed ${input.bed} was taken a moment ago. Pick another bed.`);
      await db.patient.add(patient);
      await db.encounter.add(encounter);
      if (allergies.length) await db.allergy.bulkAdd(allergies);
      if (orders.length) await db.active_order.bulkAdd(orders);
      await db.entry.add({ ...entry, counter: await nextCounter(db, actor.deviceId) });
      await db.note.add(note);
      await db.audit_log.bulkAdd(rows);
    });
    return { patient, encounter, ordersAdded: orders.length };
  });
}

/* ------------------------------ Transfer ------------------------------ */

/** `fromBed`: the bed the person saw on screen. If the patient is no longer there, the transfer is refused (no silent double move). */
export interface TransferInput { patientId: string; bed: string; time: string; reason: string; fromBed?: string; overrideReason?: string }

function historyOf(e: Encounter): EncounterLocation[] {
  return e.location_history?.length ? e.location_history.map((l) => ({ ...l })) : [{ unit: e.unit, room: e.room ?? null, bed: e.bed ?? '', from: e.admit_time, to: null }];
}

export async function transferPatient(db: DowntimeDB, clock: Clock, actor: Actor, input: TransferInput): Promise<Encounter> {
  const { override } = await requireActor(db, actor, 'transfer', input.overrideReason);
  if (!(TRANSFER_REASONS as readonly string[]).includes(input.reason)) throw new EntryWriteError('Pick a transfer reason.');
  const dest = practiceBeds().find((b) => b.bed === input.bed);
  if (!dest) throw new EntryWriteError('Pick a bed of this unit.');
  const seen = input.fromBed ?? currentEncounter(await db.encounter.where('patient_id').equals(input.patientId).toArray())?.bed;
  return attempt(async () => {
    const now = clock.nowIso();
    const enc = currentEncounter(await db.encounter.where('patient_id').equals(input.patientId).toArray());
    if (!enc || !isActiveStay(enc)) throw new EntryWriteError('This patient has no active stay to transfer.');
    if (enc.bed !== seen) throw new EntryWriteError('This patient was moved a moment ago. Reload and check before moving again.');
    if (enc.bed === input.bed) throw new EntryWriteError('The patient is already in this bed.');
    const history = historyOf(enc);
    const from = history[history.length - 1]!;
    const t = Date.parse(input.time);
    if (Number.isNaN(t) || t > Date.parse(now) + 60_000) throw new EntryWriteError('The transfer time cannot be in the future.');
    if (t < Date.parse(from.from)) throw new EntryWriteError('The transfer time is before the patient came to the current bed.');
    history[history.length - 1] = { ...from, to: input.time };
    history.push({ unit: enc.unit, room: dest.room, bed: dest.bed, from: input.time, to: null });
    const updated: Encounter = { ...enc, bed: dest.bed, room: dest.room, location_history: history };
    const text = `Transfer recorded (Practice): from ${locationLabel({ unit: from.unit, room: from.room, bed: from.bed })} to ${locationLabel(updated)}. Reason: ${input.reason}. Recording a transfer is not the clinical decision to move the patient.${override ? ` Admin override: ${override}` : ''}`;
    const { entry, note } = lifecycleEntry(actor, input.patientId, enc.id, input.time, now, 'transfer', text);
    const { rows, headSeq } = await chain(db, clock, actor, [
      ['patient_transferred', `encounter/${enc.id}`, { from: { room: from.room, bed: from.bed }, to: { room: dest.room, bed: dest.bed }, time: input.time, reason: input.reason }, { bed: enc.bed }],
      ...(override ? [['admin_override', `encounter/${enc.id}`, { action: 'transfer', reason: override }] as [string, string, unknown]] : []),
      ...auditEntryRows(entry),
    ]);
    await db.transaction('rw', [db.encounter, db.entry, db.note, db.audit_log], async () => {
      if (((await db.audit_log.orderBy('seq').last())?.seq ?? 0) !== headSeq) throw new Retry();
      const stays = await db.encounter.toArray();
      const cur = stays.find((e) => e.id === enc.id);
      if (!cur || !isActiveStay(cur) || cur.bed !== enc.bed) throw new EntryWriteError('This patient was moved or discharged a moment ago. Reload and check.');
      if (bedTaken(stays, enc.unit, dest.bed, enc.id)) throw new EntryWriteError(`Bed ${dest.bed} was taken a moment ago. Pick another bed.`);
      await db.encounter.put(updated);
      await db.entry.add({ ...entry, counter: await nextCounter(db, actor.deviceId) });
      await db.note.add(note);
      await db.audit_log.bulkAdd(rows);
    });
    return updated;
  });
}

/* ------------------------------ Discharge ------------------------------ */

export interface DischargeReview {
  drafts: number;
  /** Scheduled doses up to the discharge time with no record (the medicines page's "due" rule). */
  outstandingDoses: { drug: string; time: string }[];
  openWorklistItems: number;
}

export async function dischargeReview(db: DowntimeDB, patientId: string, atIso: string): Promise<DischargeReview> {
  const enc = currentEncounter(await db.encounter.where('patient_id').equals(patientId).toArray());
  const entries = await listPatientEntries(db, patientId);
  const meds = entries.filter((x) => x.entry.type === 'med_admin');
  const orders = enc ? (await db.active_order.where('encounter_id').equals(enc.id).toArray()).filter((o) => o.status === 'active' && isMedOrder(o) && orderGroup(o) === 'scheduled') : [];
  const outstandingDoses = orders.flatMap((o) => slotStatuses(o, atIso, meds).filter((s) => (s.status === 'due' || s.status === 'overdue') && s.time <= atIso).map((s) => ({ drug: o.drug_name ?? o.text, time: s.time })));
  return {
    drafts: entries.filter((x) => x.entry.status === 'draft').length,
    outstandingDoses: outstandingDoses.sort((a, b) => a.time.localeCompare(b.time)),
    openWorklistItems: await db.worklist_item.where('patient_id').equals(patientId).filter((w) => !w.signed_off_at).count(),
  };
}

export interface DischargeInput { patientId: string; time: string; destination: string; reason: string; acknowledgeOutstanding: boolean; overrideReason?: string }

export async function dischargePatient(db: DowntimeDB, clock: Clock, actor: Actor, input: DischargeInput): Promise<Encounter> {
  const { override } = await requireActor(db, actor, 'discharge', input.overrideReason);
  if (!(DISCHARGE_DESTINATIONS as readonly string[]).includes(input.destination)) throw new EntryWriteError('Pick the discharge destination.');
  if (!(DISCHARGE_REASONS as readonly string[]).includes(input.reason)) throw new EntryWriteError('Pick a Practice discharge reason.');
  return attempt(async () => {
    const now = clock.nowIso();
    const enc = currentEncounter(await db.encounter.where('patient_id').equals(input.patientId).toArray());
    if (!enc || !isActiveStay(enc)) throw new EntryWriteError('This patient has no active stay to discharge.');
    const t = Date.parse(input.time);
    if (Number.isNaN(t) || t > Date.parse(now) + 60_000) throw new EntryWriteError('The discharge time cannot be in the future.');
    const history = historyOf(enc);
    const here = history[history.length - 1]!;
    if (t < Date.parse(here.from)) throw new EntryWriteError('The discharge time is before the patient came to the current bed.');
    const live = (await listPatientEntries(db, input.patientId)).filter((x) => x.entry.status === 'confirmed');
    if (live.some((x) => Date.parse(x.entry.care_time) > t)) throw new EntryWriteError('A record has a care time after this discharge time. Check the time.');
    const review = await dischargeReview(db, input.patientId, input.time);
    if (review.drafts) throw new EntryWriteError(`${review.drafts} draft record${review.drafts > 1 ? 's are' : ' is'} waiting for a nurse to check. Confirm every draft before discharge, so no record is left behind.`);
    const outstanding = review.outstandingDoses.length + review.openWorklistItems;
    if (outstanding && !input.acknowledgeOutstanding) throw new EntryWriteError('Review the outstanding items and tick the acknowledgement first.');
    history[history.length - 1] = { ...here, to: input.time };
    const updated: Encounter = { ...enc, status: 'discharged', discharge_time: input.time, discharge_destination: input.destination, discharge_reason: input.reason, location_history: history };
    // The stay's orders end with it: no "due" dose of a discharged patient on any ward list or paper packet.
    const stayOrders = (await db.active_order.where('encounter_id').equals(enc.id).toArray()).filter((o) => o.status === 'active');
    const reviewed = [
      review.outstandingDoses.length ? `${review.outstandingDoses.length} scheduled dose(s) without a record (${review.outstandingDoses.map((d) => `${d.drug} ${d.time.slice(11, 16)}`).join(', ')})` : '',
      review.openWorklistItems ? `${review.openWorklistItems} recovery item(s) not signed off` : '',
    ].filter(Boolean);
    const text = `Discharge recorded (Practice): ${input.destination}. Reason: ${input.reason}. Left ${locationLabel({ unit: here.unit, room: here.room, bed: here.bed })}.${reviewed.length ? ` Reviewed before discharge: ${reviewed.join('; ')}. This acknowledgement is not an instruction to omit treatment.` : ''} Recording a discharge is not the clinical decision to discharge.${override ? ` Admin override: ${override}` : ''}`;
    const { entry, note } = lifecycleEntry(actor, input.patientId, enc.id, input.time, now, 'discharge', text);
    const { rows, headSeq } = await chain(db, clock, actor, [
      ['patient_discharged', `encounter/${enc.id}`, { time: input.time, destination: input.destination, reason: input.reason, acknowledged: reviewed, orders_completed: stayOrders.map((o) => o.id) }, { status: enc.status ?? 'active' }],
      ...(override ? [['admin_override', `encounter/${enc.id}`, { action: 'discharge', reason: override }] as [string, string, unknown]] : []),
      ...auditEntryRows(entry),
    ]);
    await db.transaction('rw', [db.encounter, db.entry, db.note, db.audit_log, db.active_order], async () => {
      if (((await db.audit_log.orderBy('seq').last())?.seq ?? 0) !== headSeq) throw new Retry();
      const cur = await db.encounter.get(enc.id);
      if (!cur || !isActiveStay(cur) || cur.bed !== enc.bed) throw new EntryWriteError('This patient was moved or discharged a moment ago. Reload and check.');
      if ((await db.entry.where('patient_id').equals(input.patientId).filter((e) => e.status === 'draft').count()) > 0) throw new EntryWriteError('A draft record was added a moment ago. Confirm it before discharge.');
      await db.encounter.put(updated);
      for (const o of stayOrders) await db.active_order.put({ ...o, status: 'completed', status_time: input.time });
      await db.entry.add({ ...entry, counter: await nextCounter(db, actor.deviceId) });
      await db.note.add(note);
      await db.audit_log.bulkAdd(rows);
    });
    return updated;
  });
}

/* ------------------------------ Identity reconciliation ------------------------------ */

export interface IdentityReviewInput { patientId: string; status: Exclude<IdentityStatus, 'not_required'>; note: string; overrideReason?: string }

/** A person records a reconciliation step. The app never matches identities itself and never decides "same person". */
export async function reviewIdentity(db: DowntimeDB, clock: Clock, actor: Actor, input: IdentityReviewInput): Promise<Patient> {
  const { override } = await requireActor(db, actor, 'identity_review', input.overrideReason);
  if (!(IDENTITY_REVIEW_NOTES as readonly string[]).includes(input.note)) throw new EntryWriteError('Pick what was checked.');
  if (input.status === 'reconciled') {
    if (!(ADMISSION_POLICY.reconcilePhases as readonly Phase[]).includes(await phaseOf(db))) throw new EntryWriteError('Reconciled can be recorded only when the hospital system can be checked again (after the network is cleared).');
    if (input.note !== IDENTITY_REVIEW_NOTES[2]) throw new EntryWriteError('Reconciled needs a match made by admissions with the hospital record.');
  }
  return attempt(async () => {
    const now = clock.nowIso();
    const p = await db.patient.get(input.patientId);
    if (!p) throw new EntryWriteError('Patient not found.');
    if (!isLocallyRegistered(p) || (p.identity_status ?? 'not_required') === 'not_required') throw new EntryWriteError('This patient came from the patient list; there is nothing to reconcile.');
    if (p.identity_status === 'reconciled') throw new EntryWriteError('This identity is already recorded as reconciled.');
    if (p.identity_status === input.status) throw new EntryWriteError('That is already the current status.');
    const enc = currentEncounter(await db.encounter.where('patient_id').equals(p.id).toArray());
    if (!enc) throw new EntryWriteError('This patient has no stay.');
    const updated: Patient = { ...p, identity_status: input.status };
    const text = `Identity review (Practice): ${input.note}. Status: ${input.status.replace('_', ' ')}. Temporary ID ${p.mrn}. Recorded by a person; ClinBridge does not match identities.${override ? ` Admin override: ${override}` : ''}`;
    const { entry, note } = lifecycleEntry(actor, p.id, enc.id, now, now, 'identity_review', text);
    const { rows, headSeq } = await chain(db, clock, actor, [
      ['identity_reviewed', `patient/${p.id}`, { status: input.status, note: input.note }, { status: p.identity_status }],
      ...(override ? [['admin_override', `patient/${p.id}`, { action: 'identity_review', reason: override }] as [string, string, unknown]] : []),
      ...auditEntryRows(entry),
    ]);
    await db.transaction('rw', [db.patient, db.entry, db.note, db.audit_log], async () => {
      if (((await db.audit_log.orderBy('seq').last())?.seq ?? 0) !== headSeq) throw new Retry();
      const cur = await db.patient.get(p.id);
      if (cur?.identity_status !== p.identity_status) throw new EntryWriteError('The identity status changed a moment ago. Reload and check.');
      await db.patient.put(updated);
      await db.entry.add({ ...entry, counter: await nextCounter(db, actor.deviceId) });
      await db.note.add(note);
      await db.audit_log.bulkAdd(rows);
    });
    return updated;
  });
}

/* ------------------------------ Allergy assessment ------------------------------ */

export interface AllergyAssessmentInput { patientId: string; status: Exclude<AllergyStatus, 'not_assessed'>; allergies: AllergyInput[] }

/** Completes the allergy state of a locally registered patient whose allergies were unknown or not yet assessed. */
export async function recordAllergyAssessment(db: DowntimeDB, clock: Clock, actor: Actor, input: AllergyAssessmentInput): Promise<Patient> {
  await requireActor(db, actor, 'allergy_assessment');
  const probe = validateRegistration({ kind: 'admission', identity: { given: '', family: '', birthDate: '', sex: 'unknown' }, admitTime: clock.nowIso(), admissionType: ADMISSION_TYPES[0], admitReason: ADMISSION_REASONS[0], bed: practiceBeds()[0]!.bed, responsibleNurseId: null, allergyStatus: input.status, allergies: input.allergies, scenario: 'none' }, clock.nowIso());
  if (probe.allergyStatus || probe.allergies) throw new EntryWriteError((probe.allergyStatus ?? probe.allergies)!);
  return attempt(async () => {
    const now = clock.nowIso();
    const p = await db.patient.get(input.patientId);
    if (!p) throw new EntryWriteError('Patient not found.');
    if (!isLocallyRegistered(p)) throw new EntryWriteError('Allergies of patients from the patient list come from the hospital list.');
    if (p.allergy_status === 'documented' || p.allergy_status === 'none_known') throw new EntryWriteError('The allergy status is already recorded.');
    const enc = currentEncounter(await db.encounter.where('patient_id').equals(p.id).toArray());
    if (!enc || !isActiveStay(enc)) throw new EntryWriteError('This patient has no active stay.');
    const rowsToAdd: Allergy[] = input.status === 'documented'
      ? input.allergies.map((a) => ({ id: `al-${uid().slice(0, 8)}`, patient_id: p.id, substance: a.substance, reaction: a.reaction, severity: a.severity, status: 'active' }))
      : input.status === 'none_known' ? [{ id: `al-${uid().slice(0, 8)}`, patient_id: p.id, substance: 'No known allergies', reaction: null, severity: null, status: 'active' }] : [];
    const updated: Patient = { ...p, allergy_status: input.status };
    const text = `Allergy assessment (Practice): ${ALLERGY_STATUS_LABEL[input.status]}${rowsToAdd.length && input.status === 'documented' ? `: ${rowsToAdd.map((a) => `${a.substance} (${a.reaction}, ${a.severity})`).join(', ')}` : ''}. Before: ${ALLERGY_STATUS_LABEL[p.allergy_status ?? 'not_assessed']}.`;
    const { entry, note } = lifecycleEntry(actor, p.id, enc.id, now, now, 'allergy_review', text);
    const { rows, headSeq } = await chain(db, clock, actor, [
      ['allergy_status_recorded', `patient/${p.id}`, { status: input.status, substances: rowsToAdd.map((a) => a.substance) }, { status: p.allergy_status ?? null }],
      ...auditEntryRows(entry),
    ]);
    await db.transaction('rw', [db.patient, db.allergy, db.entry, db.note, db.audit_log], async () => {
      if (((await db.audit_log.orderBy('seq').last())?.seq ?? 0) !== headSeq) throw new Retry();
      const cur = await db.patient.get(p.id);
      if (cur?.allergy_status !== p.allergy_status) throw new EntryWriteError('The allergy status changed a moment ago. Reload and check.');
      await db.patient.put(updated);
      if (rowsToAdd.length) await db.allergy.bulkAdd(rowsToAdd);
      await db.entry.add({ ...entry, counter: await nextCounter(db, actor.deviceId) });
      await db.note.add(note);
      await db.audit_log.bulkAdd(rows);
    });
    return updated;
  });
}

/* ------------------------------ Practice staff ------------------------------ */

/**
 * Adds the fictional Admission Staff account to a Practice database that does not have it yet (older installations,
 * after a reset). Idempotent: nothing happens when the account exists, also when an admin switched it off.
 */
export async function ensurePracticeAdmissionStaff(db: DowntimeDB, clock: Clock, deviceId: string): Promise<boolean> {
  if (db.dataset !== 'practice') return false;
  if (await db.practitioner.get(PRACTICE_ADMISSION_STAFF.id)) return false;
  const p: Practitioner = { ...PRACTICE_ADMISSION_STAFF, pin_hash: await hashPin(PRACTICE_PIN, 60_000) };
  return attempt(async () => {
    const { rows, headSeq } = await chain(db, clock, { userId: 'system', deviceId }, [['practice_staff_added', `practitioner/${p.id}`, { name: p.name, initials: p.initials, role: p.role, active: true, practice: true }]]);
    let added = false;
    await db.transaction('rw', [db.practitioner, db.audit_log], async () => {
      if (await db.practitioner.get(p.id)) return; // another tab added it in the meantime
      if (((await db.audit_log.orderBy('seq').last())?.seq ?? 0) !== headSeq) throw new Retry();
      await db.practitioner.add(p);
      await db.audit_log.bulkAdd(rows);
      added = true;
    });
    return added;
  });
}

/**
 * After "Reset practice" (which reloads the seed and its change log): put the fictional Admission Staff account back
 * and record the reset in the new change log. Practice only; Real records are never reset.
 */
export async function afterPracticeReset(db: DowntimeDB, clock: Clock, deviceId: string): Promise<void> {
  if (db.dataset !== 'practice') return;
  await ensurePracticeAdmissionStaff(db, clock, deviceId);
  await attempt(async () => {
    const { rows, headSeq } = await chain(db, clock, { userId: 'system', deviceId }, [['practice_reset', 'database', { practice: true, registered_patients_removed: true }]]);
    await db.transaction('rw', [db.audit_log], async () => {
      if (((await db.audit_log.orderBy('seq').last())?.seq ?? 0) !== headSeq) throw new Retry();
      await db.audit_log.bulkAdd(rows);
    });
  });
}
