import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db/db';
import { importPracticeSeed, PRACTICE_PIN } from '../db/seed';
import { practiceClock } from './time';
import { prepareExport } from '../db/repos/export';
import { createEntry } from '../db/repos/entries';
import { clearNetwork, startPracticeOutageDrill } from '../db/repos/admin';
import { ensurePracticeAdmissionStaff, generateIdentity, registerPatient, reviewIdentity, transferPatient, dischargePatient, PRACTICE_ADMISSION_STAFF } from '../db/repos/admission';
import { ACTIVE_CLINICAL_POLICY } from '../config/clinicalPolicy';

/**
 * Writes a synthetic export WITH the admission lifecycle to $FHIR_OUT_LIFECYCLE, for the official HL7 validator:
 * one patient registered by admissions, charted, transferred and discharged; one provisional patient registered by a
 * nurse during System Down, transferred, identity under review. Fictional Practice data only.
 */
describe.skipIf(!process.env.FHIR_OUT_LIFECYCLE)('write synthetic lifecycle FHIR export for the HL7 validator', () => {
  it('writes the bundle', async () => {
    const db = new DowntimeDB('practice', `fhir-life-${crypto.randomUUID()}`);
    await importPracticeSeed(db);
    const clock = practiceClock(Date.now());
    await ensurePracticeAdmissionStaff(db, clock, 'dev-01');
    const adm = { userId: PRACTICE_ADMISSION_STAFF.id, deviceId: 'dev-01' }, rn = { userId: 'pr-okafor', deviceId: 'dev-01' }, admin = { userId: 'pr-ellis', deviceId: 'dev-01' };
    const base = { admitTime: clock.nowIso(), admissionType: 'Emergency', admitReason: 'Community-acquired pneumonia (practice scenario)', responsibleNurseId: 'pr-okafor', scenario: 'basic' as const };
    const a = await registerPatient(db, clock, adm, { ...base, kind: 'admission', identity: generateIdentity(clock.nowIso(), () => 0.2), bed: '9A', allergyStatus: 'documented', allergies: [{ substance: 'Penicillin', reaction: 'Rash', severity: 'moderate' }] });
    await createEntry(db, clock, rn, { type: 'vital_sign', patientId: a.patient.id, careTime: clock.nowIso(), values: { heart_rate: 88, bp_systolic: 128, bp_diastolic: 76 } as never });
    await transferPatient(db, clock, adm, { patientId: a.patient.id, bed: '10B', time: clock.nowIso(), reason: 'Bed change on the unit (practice)' });
    await dischargePatient(db, clock, adm, { patientId: a.patient.id, time: clock.nowIso(), destination: 'Home with community nursing', reason: 'Discharged as planned (practice)', acknowledgeOutstanding: true });
    await startPracticeOutageDrill(db, clock, admin);
    const b = await registerPatient(db, clock, rn, { ...base, kind: 'provisional', identity: generateIdentity(clock.nowIso(), () => 0.7), bed: '11A', allergyStatus: 'unknown', allergies: [], scenario: 'none' });
    await createEntry(db, clock, rn, { type: 'vital_sign', patientId: b.patient.id, careTime: clock.nowIso(), values: { heart_rate: 104, spo2: 93 } as never });
    await transferPatient(db, clock, rn, { patientId: b.patient.id, bed: '11B', time: clock.nowIso(), reason: 'Isolation room needed (practice)' });
    await reviewIdentity(db, clock, rn, { patientId: b.patient.id, status: 'under_review', note: 'Sent to admissions for matching with the hospital record (practice)' });
    await clearNetwork(db, clock, admin, ACTIVE_CLINICAL_POLICY.recovery.networkChecklist, PRACTICE_PIN);
    const { json, errors } = await prepareExport(db, clock);
    expect(errors).toEqual([]);
    writeFileSync(process.env.FHIR_OUT_LIFECYCLE!, json);
  });
});
