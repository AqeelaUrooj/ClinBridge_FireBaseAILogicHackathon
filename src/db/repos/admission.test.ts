import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db';
import { importPracticeSeed, PRACTICE_PIN, resetPractice } from '../seed';
import { verifyChain } from '../audit';
import { openWithMigration } from '../backup';
import { practiceClock } from '../../lib/time';
import { buildBundle, validateBundle } from '../../lib/fhir';
import { currentEncounter } from '../../lib/admission';
import { checkStoredList } from '../../features/admin/listCheck';
import { loadWardFacts } from '../../features/ward/wardData';
import { loadPatient } from '../../features/patient/patientData';
import { clearNetwork, setStaffActive, startPracticeOutageDrill } from './admin';
import { confirmDraft, createEntry, markEnteredInError } from './entries';
import { createHandoff } from './handoff';
import { buildWorklist, signOffItem } from './worklist';
import { loadWardForPrint } from '../../features/print/printData';
import { prepareExport } from './export';
import { ACTIVE_CLINICAL_POLICY } from '../../config/clinicalPolicy';
import { isHighAlert } from '../../lib/meds';
import {
  PRACTICE_ADMISSION_STAFF, afterPracticeReset, dischargePatient, dischargeReview, ensurePracticeAdmissionStaff, generateIdentity, recordAllergyAssessment, registerPatient,
  reviewIdentity, transferPatient, type RegistrationInput,
} from './admission';
import type { Encounter } from '../schema';

const clock = practiceClock();
const DEV = 'dev-01';
const ADM = { userId: PRACTICE_ADMISSION_STAFF.id, deviceId: DEV };
const RN = { userId: 'pr-okafor', deviceId: DEV };
const LPN = { userId: 'pr-whitfield', deviceId: DEV };
const ADMIN = { userId: 'pr-ellis', deviceId: DEV };
let db: DowntimeDB;
let name: string;

const input = (o: Partial<RegistrationInput> = {}): RegistrationInput => ({
  kind: 'admission', identity: generateIdentity(clock.nowIso(), () => 0.3), admitTime: clock.nowIso(), admissionType: 'Emergency',
  admitReason: 'Community-acquired pneumonia (practice scenario)', bed: '9A', responsibleNurseId: 'pr-okafor', allergyStatus: 'not_assessed', allergies: [], scenario: 'none', ...o,
});
const counts = async (d = db) => ({ p: await d.patient.count(), e: await d.encounter.count(), a: await d.audit_log.count(), en: await d.entry.count(), o: await d.active_order.count() });
const downtime = () => startPracticeOutageDrill(db, clock, ADMIN);
const clear = () => clearNetwork(db, clock, ADMIN, ACTIVE_CLINICAL_POLICY.recovery.networkChecklist, PRACTICE_PIN);
const vitals = (patientId: string, actor = RN) => createEntry(db, clock, actor, { type: 'vital_sign', patientId, careTime: clock.nowIso(), values: { heart_rate: 84 } as never });

beforeEach(async () => {
  name = `adm-${crypto.randomUUID()}`;
  db = new DowntimeDB('practice', name);
  await importPracticeSeed(db);
  await ensurePracticeAdmissionStaff(db, clock, DEV);
});

describe('Practice Admission Staff account', () => {
  it('is added once, audited, and never twice; a switched-off account stays off', async () => {
    expect((await db.practitioner.get('pr-marquez'))?.role).toBe('admission');
    expect(await ensurePracticeAdmissionStaff(db, clock, DEV)).toBe(false);
    expect(await db.practitioner.where('id').equals('pr-marquez').count()).toBe(1);
    expect(await db.audit_log.filter((a) => a.action === 'practice_staff_added').count()).toBe(1);
    await setStaffActive(db, clock, ADMIN, 'pr-marquez', false);
    expect(await ensurePracticeAdmissionStaff(db, clock, DEV)).toBe(false);
    expect((await db.practitioner.get('pr-marquez'))?.active).toBe(false);
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
  });
  it('is never added to Real records', async () => {
    const live = new DowntimeDB('live', `live-${crypto.randomUUID()}`);
    expect(await ensurePracticeAdmissionStaff(live, clock, DEV)).toBe(false);
    expect(await live.practitioner.count()).toBe(0);
  });
});

describe('who may register', () => {
  it('admission staff register; the record is fictional, temporary, pending reconciliation and audited', async () => {
    const before = await counts();
    const r = await registerPatient(db, clock, ADM, input());
    expect(r.patient).toMatchObject({ mrn: 'PX-000001', identifier_kind: 'local_temporary', origin: 'admission_registered', identity_status: 'pending_verification', allergy_status: 'not_assessed' });
    expect(r.encounter).toMatchObject({ status: 'active', bed: '9A', room: '9', admit_reason: 'Community-acquired pneumonia (practice scenario)', responsible_nurse_id: 'pr-okafor' });
    const after = await counts();
    expect(after).toMatchObject({ p: before.p + 1, e: before.e + 1, en: before.en + 1 });
    const log = (await db.audit_log.orderBy('seq').toArray()).slice(before.a).map((a) => a.action);
    expect(log).toEqual(['patient_registered', 'bed_assigned', 'entry_saved_raw', 'entry_confirmed']);
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
    const note = (await db.note.toArray()).find((n) => n.category === 'admission')!;
    expect(note.text).toContain('Temporary ID PX-000001; not a hospital MRN');
  });
  it('a nurse registers provisionally only during System Down; LPN, admin without a reason and inactive staff are refused', async () => {
    await expect(registerPatient(db, clock, RN, input({ kind: 'provisional' }))).rejects.toThrow(/only while the hospital system is down/);
    await downtime();
    const r = await registerPatient(db, clock, RN, input({ kind: 'provisional' }));
    expect(r.patient.origin).toBe('nurse_provisional');
    expect((await db.audit_log.orderBy('seq').last())?.action).toBe('entry_confirmed');
    expect(await db.audit_log.filter((a) => a.action === 'patient_registered_provisional').count()).toBe(1);
    await expect(registerPatient(db, clock, LPN, input({ kind: 'provisional', bed: '9B' }))).rejects.toThrow(/role cannot/);
    await expect(registerPatient(db, clock, RN, input({ kind: 'admission', bed: '9B' }))).rejects.toThrow(/role cannot/);
    await expect(registerPatient(db, clock, ADMIN, input({ bed: '9B' }))).rejects.toThrow(/override, with a written reason/);
    await setStaffActive(db, clock, ADMIN, 'pr-marquez', false); // a session that was open before the account was switched off
    await expect(registerPatient(db, clock, ADM, input({ bed: '9B' }))).rejects.toThrow(/not active/);
    await expect(registerPatient(db, clock, { userId: 'nobody', deviceId: DEV }, input({ bed: '9B' }))).rejects.toThrow(/not active/);
    const o = await registerPatient(db, clock, ADMIN, input({ bed: '9B', overrideReason: 'Admissions office closed during the drill' }));
    expect(o.patient.origin).toBe('admission_registered');
    expect(await db.audit_log.filter((a) => a.action === 'admin_override').count()).toBe(1);
  });
  it('Real records refuse registration in the repository itself', async () => {
    const live = new DowntimeDB('live', `live-${crypto.randomUUID()}`);
    await expect(registerPatient(live, clock, ADM, input())).rejects.toThrow(/fictional Practice patients only/);
  });
  it('only generated fictional identities are accepted; required fields are checked', async () => {
    await expect(registerPatient(db, clock, ADM, input({ identity: { given: 'John', family: 'Smith', birthDate: '1970-01-01', sex: 'male' } }))).rejects.toThrow(/generated fictional identity/);
    await expect(registerPatient(db, clock, ADM, input({ admitReason: 'typed text' }))).rejects.toThrow(/admission reason/);
    await expect(registerPatient(db, clock, ADM, input({ bed: '99Z' }))).rejects.toThrow(/free bed/);
    await expect(registerPatient(db, clock, ADM, input({ admitTime: new Date(clock.now() + 3_600_000).toISOString() }))).rejects.toThrow(/future/);
    await expect(registerPatient(db, clock, ADM, input({ allergyStatus: 'documented' }))).rejects.toThrow(/at least one allergy/);
    await expect(registerPatient(db, clock, ADM, input({ responsibleNurseId: 'pr-whitfield' }))).rejects.toThrow(/active RN/);
  });
});

describe('identifiers, beds and transactions', () => {
  it('temporary IDs count up; an occupied bed is refused (seed bed and new bed)', async () => {
    expect((await registerPatient(db, clock, ADM, input())).patient.mrn).toBe('PX-000001');
    expect((await registerPatient(db, clock, ADM, input({ bed: '9B' }))).patient.mrn).toBe('PX-000002');
    await expect(registerPatient(db, clock, ADM, input({ bed: '9A' }))).rejects.toThrow(/Bed 9A was taken/);
    await expect(registerPatient(db, clock, ADM, input({ bed: '4B' }))).rejects.toThrow(/Bed 4B was taken/); // Sam Rivera
  });
  it('two tabs registering at once get different IDs, and only one gets a contested bed', async () => {
    const tab2 = new DowntimeDB('practice', name);
    const [a, b] = await Promise.all([registerPatient(db, clock, ADM, input({ bed: '10A' })), registerPatient(tab2, clock, ADM, input({ bed: '10B' }))]);
    expect(new Set([a.patient.mrn, b.patient.mrn]).size).toBe(2);
    const race = await Promise.allSettled([registerPatient(db, clock, ADM, input({ bed: '11A' })), registerPatient(tab2, clock, ADM, input({ bed: '11A' }))]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(String((race.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason)).toMatch(/Bed 11A was taken/);
    const ids = (await db.patient.toArray()).map((p) => p.mrn);
    expect(new Set(ids).size).toBe(ids.length);
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
  });
  it('a failure inside the transaction leaves no patient, stay, bed or audit row behind', async () => {
    const before = await counts();
    const realAdd = db.note.add.bind(db.note);
    db.note.add = (() => { throw new Error('disk failure (test)'); }) as never;
    await expect(registerPatient(db, clock, ADM, input())).rejects.toThrow(/disk failure/);
    db.note.add = realAdd;
    expect(await counts()).toEqual(before);
    expect((await registerPatient(db, clock, ADM, input())).encounter.bed).toBe('9A'); // the bed was never held
  });
  it('current stay: the active one wins over a newer discharged one, else the newest admission', () => {
    const e = (id: string, admit: string, status?: Encounter['status']) => ({ id, patient_id: 'p', visit_number: id, unit: 'u', admit_time: admit, status }) as Encounter;
    expect(currentEncounter([e('enc-b', '2026-11-14T08:00:00-05:00', 'discharged'), e('enc-a', '2026-11-10T08:00:00-05:00')])!.id).toBe('enc-a');
    expect(currentEncounter([e('enc-a', '2026-11-10T08:00:00-05:00', 'discharged'), e('enc-z', '2026-11-12T08:00:00-05:00', 'discharged')])!.id).toBe('enc-z');
  });
});

describe('nursing care of a registered patient', () => {
  it('shows on the ward, takes nursing records, never from admission staff', async () => {
    const { patient } = await registerPatient(db, clock, ADM, input());
    const ward = await loadWardFacts(db, clock.nowIso());
    expect(ward.map((w) => w.patient.id)).toContain(patient.id);
    await vitals(patient.id);
    await expect(vitals(patient.id, ADM)).rejects.toThrow(/Admission staff do not write nursing records/);
    await expect(createHandoff(db, clock, ADM, { patientId: patient.id, shift: 'Day', situation: 's', background: 'b', assessment: 'a', openItems: [], sourceEntryIds: [] })).rejects.toThrow(/Admission staff/);
    const lifecycle = (await db.entry.where('patient_id').equals(patient.id).toArray()).find((e) => e.type === 'note')!;
    await expect(markEnteredInError(db, clock, RN, lifecycle.id, 'test')).rejects.toThrow(/cannot be crossed out/);
  });
  it('the optional fictional medication scenario copies reviewed seed orders, never a high-alert drug; the dose saves', async () => {
    const { encounter, ordersAdded } = await registerPatient(db, clock, ADM, input({ scenario: 'basic' }));
    expect(ordersAdded).toBe(3);
    const orders = await db.active_order.where('encounter_id').equals(encounter.id).toArray();
    expect(orders.every((o) => !isHighAlert(o.drug_name) && /fictional/.test(o.ordered_by ?? ''))).toBe(true);
    const prn = orders.find((o) => o.drug_name === 'acetaminophen')!;
    await createEntry(db, clock, RN, { type: 'med_admin', patientId: encounter.patient_id, careTime: clock.nowIso(), values: { order_id: prn.id, drug_name: 'acetaminophen', rxnorm_code: null, event: 'administered', dose_due: 650, dose_due_unit: 'mg', dose_given: 650, dose_given_unit: 'mg', route: 'PO', site: null, end_time: null, infusion_rate: null, infusion_rate_unit: null, prior_infusion_rate: null, reason: 'pain', double_checked: false, double_checked_by: null, raw_text: null } as never });
    const plain = await registerPatient(db, clock, ADM, input({ bed: '9B' }));
    expect(plain.ordersAdded).toBe(0);
  });
  it('allergy states stay distinct; an unknown status can be completed later, once', async () => {
    const unknown = await registerPatient(db, clock, ADM, input({ allergyStatus: 'unknown' }));
    expect((await loadPatient(db, unknown.patient.id))!.allergies).toHaveLength(0);
    const nka = await registerPatient(db, clock, ADM, input({ bed: '9B', allergyStatus: 'none_known' }));
    expect((await loadPatient(db, nka.patient.id))!.allergies.map((a) => a.substance)).toEqual(['No known allergies']);
    const doc = await registerPatient(db, clock, ADM, input({ bed: '9C', allergyStatus: 'documented', allergies: [{ substance: 'Shellfish', reaction: 'Swelling', severity: 'severe' }] }));
    expect((await loadPatient(db, doc.patient.id))!.allergies[0]).toMatchObject({ substance: 'Shellfish', severity: 'severe' });
    await recordAllergyAssessment(db, clock, RN, { patientId: unknown.patient.id, status: 'documented', allergies: [{ substance: 'Latex', reaction: 'Rash', severity: 'mild' }] });
    expect((await db.patient.get(unknown.patient.id))!.allergy_status).toBe('documented');
    await expect(recordAllergyAssessment(db, clock, RN, { patientId: unknown.patient.id, status: 'none_known', allergies: [] })).rejects.toThrow(/already recorded/);
    await expect(recordAllergyAssessment(db, clock, LPN, { patientId: nka.patient.id, status: 'none_known', allergies: [] })).rejects.toThrow(/role cannot/);
    await expect(recordAllergyAssessment(db, clock, RN, { patientId: 'pt-01', status: 'none_known', allergies: [] })).rejects.toThrow(/hospital list/);
  });
});

describe('transfer', () => {
  it('moves the patient, frees the old bed, keeps the history and audits it', async () => {
    const { patient } = await registerPatient(db, clock, ADM, input());
    const before = await db.audit_log.count();
    const moved = await transferPatient(db, clock, RN, { patientId: patient.id, bed: '10C', time: clock.nowIso(), reason: 'Bed change on the unit (practice)' });
    expect(moved.bed).toBe('10C');
    expect(moved.location_history!.map((l) => [l.bed, !!l.to])).toEqual([['9A', true], ['10C', false]]);
    expect((await db.audit_log.orderBy('seq').toArray()).slice(before).map((a) => a.action)).toEqual(['patient_transferred', 'entry_saved_raw', 'entry_confirmed']);
    expect((await registerPatient(db, clock, ADM, input({ bed: '9A' }))).encounter.bed).toBe('9A'); // old bed free again
    await expect(transferPatient(db, clock, RN, { patientId: patient.id, bed: '4B', time: clock.nowIso(), reason: 'Bed change on the unit (practice)' })).rejects.toThrow(/Bed 4B was taken/);
    await expect(transferPatient(db, clock, LPN, { patientId: patient.id, bed: '11C', time: clock.nowIso(), reason: 'Bed change on the unit (practice)' })).rejects.toThrow(/role cannot/);
  });
  it('a seeded patient can move too; two people moving the same patient at once: one wins', async () => {
    const tab2 = new DowntimeDB('practice', name);
    const r = await Promise.allSettled([
      transferPatient(db, clock, RN, { patientId: 'pt-01', bed: '11A', time: clock.nowIso(), reason: 'Bed change on the unit (practice)' }),
      transferPatient(tab2, clock, ADM, { patientId: 'pt-01', bed: '11B', time: clock.nowIso(), reason: 'Bed change on the unit (practice)' }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const stay = currentEncounter(await db.encounter.where('patient_id').equals('pt-01').toArray())!;
    expect(stay.location_history![0]).toMatchObject({ bed: '4B', from: stay.admit_time });
    expect(['11A', '11B']).toContain(stay.bed);
  });
});

describe('discharge', () => {
  it('drafts block; outstanding doses need an acknowledgement; then the stay closes, the bed frees, records stay readable', async () => {
    const { patient } = await registerPatient(db, clock, ADM, input({ scenario: 'scheduled' }));
    const draft = await createEntry(db, clock, RN, { type: 'vital_sign', patientId: patient.id, careTime: clock.nowIso(), status: 'draft', values: { heart_rate: 90 } as never });
    const go = (ack: boolean) => dischargePatient(db, clock, ADM, { patientId: patient.id, time: clock.nowIso(), destination: 'Home', reason: 'Discharged as planned (practice)', acknowledgeOutstanding: ack });
    await expect(go(true)).rejects.toThrow(/draft record is waiting/);
    await confirmDraft(db, clock, RN, draft.id, 'vital_sign', { heart_rate: 90 } as never);
    const review = await dischargeReview(db, patient.id, clock.nowIso());
    expect(review.outstandingDoses.length).toBeGreaterThan(0); // the copied 09:00 / 06:30 tablets have no record
    await expect(go(false)).rejects.toThrow(/acknowledgement/);
    const closed = await go(true);
    expect(closed).toMatchObject({ status: 'discharged', discharge_destination: 'Home' });
    expect(closed.location_history!.at(-1)!.to).toBe(closed.discharge_time);
    await expect(vitals(patient.id)).rejects.toThrow(/discharged/);
    await expect(go(true)).rejects.toThrow(/no active stay/);
    expect((await loadWardFacts(db, clock.nowIso())).find((w) => w.patient.id === patient.id)?.encounter?.status).toBe('discharged');
    expect((await registerPatient(db, clock, ADM, input())).encounter.bed).toBe('9A');
    const note = (await db.note.toArray()).find((n) => n.category === 'discharge')!;
    expect(note.text).toContain('not an instruction to omit treatment');
    const orders = await db.active_order.where('encounter_id').equals(closed.id).toArray();
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.status === 'completed')).toBe(true); // no "due" dose of a discharged patient anywhere
    expect((await loadWardForPrint(db)).map((b) => b.patient.id)).not.toContain(patient.id);
  });
  it('a draft of a stay discharged in the meantime cannot be confirmed; admission staff cannot confirm, cross out or sign off', async () => {
    const { patient } = await registerPatient(db, clock, ADM, input());
    const draft = await createEntry(db, clock, RN, { type: 'vital_sign', patientId: patient.id, careTime: clock.nowIso(), status: 'draft', values: { heart_rate: 70 } as never });
    await expect(confirmDraft(db, clock, ADM, draft.id, 'vital_sign', { heart_rate: 70 } as never)).rejects.toThrow(/Admission staff/);
    const stay = currentEncounter(await db.encounter.where('patient_id').equals(patient.id).toArray())!;
    await db.encounter.put({ ...stay, status: 'discharged', discharge_time: clock.nowIso() }); // as if another tab discharged a moment ago
    await expect(confirmDraft(db, clock, RN, draft.id, 'vital_sign', { heart_rate: 70 } as never)).rejects.toThrow(/discharged/);
    const done = (await db.entry.where('status').equals('confirmed').toArray())[0]!;
    await expect(markEnteredInError(db, clock, ADM, done.id, 'x')).rejects.toThrow(/Admission staff/);
    await buildWorklist(db, clock, ADMIN); // the Practice seed is already Back online
    const item = (await db.worklist_item.toArray()).find((w) => !w.signed_off_at)!;
    await expect(signOffItem(db, clock, ADM, item.id)).rejects.toThrow(/Admission staff/);
  });
});

describe('recovery, identity and FHIR', () => {
  it('provisional registration during downtime: recovery lists it first, a person reconciles it after clearance', async () => {
    await downtime();
    const { patient } = await registerPatient(db, clock, RN, input({ kind: 'provisional' }));
    await vitals(patient.id);
    await expect(reviewIdentity(db, clock, RN, { patientId: patient.id, status: 'reconciled', note: 'Matched to a hospital record by admissions (practice)' })).rejects.toThrow(/after the network is cleared/);
    await reviewIdentity(db, clock, RN, { patientId: patient.id, status: 'under_review', note: 'Sent to admissions for matching with the hospital record (practice)' });
    await clear();
    expect(await buildWorklist(db, clock, ADMIN)).toBeGreaterThanOrEqual(3);
    const items = await db.worklist_item.where('patient_id').equals(patient.id).toArray();
    const adm = items.filter((i) => i.category === 'admission');
    expect(adm.length).toBeGreaterThanOrEqual(2);
    expect(adm.every((i) => i.flags.includes('recheck'))).toBe(true);
    expect(Math.max(...items.map((i) => i.priority))).toBe(adm[0]!.priority);
    expect((await db.patient.get(patient.id))!.identity_status).toBe('under_review'); // never reconciled by the network alone
    await expect(reviewIdentity(db, clock, LPN, { patientId: patient.id, status: 'reconciled', note: 'Matched to a hospital record by admissions (practice)' })).rejects.toThrow(/role cannot/);
    await expect(reviewIdentity(db, clock, ADM, { patientId: patient.id, status: 'reconciled', note: 'Wristband and identity checked with the patient (practice)' })).rejects.toThrow(/match made by admissions/);
    await reviewIdentity(db, clock, ADM, { patientId: patient.id, status: 'reconciled', note: 'Matched to a hospital record by admissions (practice)' });
    await expect(reviewIdentity(db, clock, ADM, { patientId: 'pt-02', status: 'under_review', note: 'Sent to admissions for matching with the hospital record (practice)' })).rejects.toThrow(/nothing to reconcile/);
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
  });
  it('a patient who arrived before the outage but was registered during it still reaches recovery; all their records are marked Recheck', async () => {
    const declared = Date.parse(await downtime().then(async () => (await db.downtime_event.toArray()).find((e) => !e.ended_at)!.declared_at));
    const before = new Date(declared - 2 * 3_600_000);
    const admitTime = clock.nowIso().replace(/^.{19}/, new Date(before.getTime() - 5 * 3_600_000).toISOString().slice(0, 19)); // local -05:00
    const { patient } = await registerPatient(db, clock, RN, input({ kind: 'provisional', admitTime }));
    await vitals(patient.id);
    await clear();
    await buildWorklist(db, clock, ADMIN);
    const items = await db.worklist_item.where('patient_id').equals(patient.id).toArray();
    expect(items.map((i) => i.category).sort()).toEqual(['admission', 'vitals']);
    expect(items.every((i) => i.flags.includes('recheck'))).toBe(true);
  });
  it('FHIR: temporary identifier in its own namespace, admission, transfer history, finished stay, valid references', async () => {
    const a = await registerPatient(db, clock, ADM, input({ allergyStatus: 'documented', allergies: [{ substance: 'Penicillin', reaction: 'Rash', severity: 'moderate' }] }));
    await transferPatient(db, clock, ADM, { patientId: a.patient.id, bed: '10A', time: clock.nowIso(), reason: 'Bed change on the unit (practice)' });
    await dischargePatient(db, clock, ADM, { patientId: a.patient.id, time: clock.nowIso(), destination: 'Home', reason: 'Discharged as planned (practice)', acknowledgeOutstanding: false });
    const x = await prepareExport(db, clock);
    expect(x.errors).toEqual([]);
    const res = (x.bundle.entry as { resource: Record<string, unknown> }[]).map((e) => e.resource);
    const pat = res.find((r) => r.id === a.patient.id)!;
    expect(pat.identifier).toEqual([expect.objectContaining({ use: 'temp', system: expect.stringContaining('local-temporary'), value: 'PX-000001' })]);
    expect(JSON.stringify(pat.identifier)).not.toContain('"MR"');
    expect(JSON.stringify((pat.meta as { tag: unknown[] }).tag)).toContain('registered-locally');
    const enc = res.find((r) => r.id === a.encounter.id)! as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(enc.status).toBe('finished');
    expect(enc.period.end).toBeTruthy();
    expect(enc.location.map((l: { status: string }) => l.status)).toEqual(['completed', 'completed']);
    expect(enc.hospitalization.dischargeDisposition.text).toBe('Home');
    expect(enc.participant[0].individual.reference).toBe('Practitioner/pr-okafor');
    const seeded = res.find((r) => r.id === 'enc-01') as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(seeded.status).toBe('in-progress');
    expect(JSON.stringify(res.find((r) => r.id === 'pt-01')!.identifier)).toContain('"MR"');
    expect(res.filter((r) => r.resourceType === 'DocumentReference' && JSON.stringify(r.type).includes('Stay record'))).toHaveLength(3);
    expect(validateBundle(buildBundle({ patients: [], encounters: [], allergies: [], orders: [], practitioners: [], entries: [], exportedAt: clock.nowIso(), deviceLabels: new Map() }))).toEqual([]);
  });
  it('the stored-list check counts only the hospital list; locally registered patients are listed apart', async () => {
    await registerPatient(db, clock, ADM, input());
    const [snapshot] = await db.snapshot.toArray();
    const rows = checkStoredList({ snapshot, patient: await db.patient.toArray(), encounter: await db.encounter.toArray(), allergy: await db.allergy.toArray(), active_order: await db.active_order.toArray(), snapshot_result: await db.snapshot_result.toArray() });
    expect(rows.filter((r) => r.ok === false)).toEqual([]);
    expect(rows.find((r) => r.label === 'Registered on this laptop')?.detail).toMatch(/^1 patient registered here/);
  });
});

describe('Practice reset', () => {
  it('removes registered patients, restores the ten seed patients and the Admission Staff account, and logs the reset', async () => {
    await registerPatient(db, clock, ADM, input());
    expect(await db.patient.count()).toBe(11);
    await resetPractice(db);
    await afterPracticeReset(db, clock, DEV);
    expect(await db.patient.count()).toBe(10);
    expect((await db.practitioner.get('pr-marquez'))?.role).toBe('admission');
    expect((await db.audit_log.orderBy('seq').last())?.action).toBe('practice_reset');
    expect((await verifyChain(await db.audit_log.toArray())).ok).toBe(true);
    const live = new DowntimeDB('live', `live-${crypto.randomUUID()}`);
    await expect(resetPractice(live)).rejects.toThrow(/Only the Practice dataset/);
  });
});

describe('database version guard', () => {
  it('Dexie 4 alone would open a newer database; openWithMigration refuses one saved by a newer build', async () => {
    await db.open();
    db.close();
    const future = new Dexie(name); // a later ClinBridge build that went one version further
    future.version(4).stores({ patient: 'id, mrn' });
    await future.open();
    future.close();
    const thisBuild = new DowntimeDB('practice', name);
    await expect(openWithMigration(thisBuild, clock, DEV)).rejects.toThrow(/saved by a newer ClinBridge version \(database version 4; this version knows 3\)/);
    const plainDexie = new Dexie(name); // what a build before version 3 does: no check, it simply opens
    plainDexie.version(2).stores({ patient: 'id, mrn' });
    await expect(plainDexie.open()).resolves.toBeTruthy();
    plainDexie.close();
  });
});
