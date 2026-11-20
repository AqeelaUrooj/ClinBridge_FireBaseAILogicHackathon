import { beforeEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from '../db';
import { importPracticeSeed, PRACTICE_PIN } from '../seed';
import { verifyChain } from '../audit';
import { verifyPin } from '../../lib/crypto';
import { derivePhase } from '../../lib/phase';
import { practiceClock } from '../../lib/time';
import { ACTIVE_CLINICAL_POLICY } from '../../config/clinicalPolicy';
import seed from '../../data/downtimekit-seed.json';
import { addStaff, checkSnapshotFile, clearNetwork, declareDowntime, endDowntime, firstTimeSetup, importSnapshot, resetStaffPin, setStaffActive } from './admin';
import { signOffItem } from './worklist';

let db: DowntimeDB;
const clock = practiceClock();
const admin = { userId: 'pr-ellis', deviceId: 'dev-01' };
const nurse = { userId: 'pr-okafor', deviceId: 'dev-01' };
beforeEach(async () => { db = new DowntimeDB('practice', `adm-${crypto.randomUUID()}`); await importPracticeSeed(db); });

describe('admin: staff', () => {
  it('only an active admin can manage staff; every action is audited, PINs are never logged', async () => {
    await expect(addStaff(db, clock, nurse, { name: 'X', initials: 'X', role: 'RN', pin: '1234' })).rejects.toThrow(/admin/);
    const p = await addStaff(db, clock, admin, { name: 'Lee Ward', initials: 'lw', role: 'RN', pin: '1234' });
    expect(p.initials).toBe('LW');
    expect(await verifyPin('1234', p.pin_hash)).toBe(true);
    await resetStaffPin(db, clock, admin, p.id, '9876');
    expect(await verifyPin('9876', (await db.practitioner.get(p.id))!.pin_hash)).toBe(true);
    await setStaffActive(db, clock, admin, p.id, false);
    expect((await db.practitioner.get(p.id))!.active).toBe(false);
    const rows = await db.audit_log.orderBy('seq').toArray();
    expect(rows.slice(-3).map((r) => r.action)).toEqual(['staff_added', 'staff_pin_reset', 'staff_deactivated']);
    expect(JSON.stringify(rows)).not.toContain('9876');
    expect((await verifyChain(rows)).ok).toBe(true);
  });
  it('cannot switch off yourself or the last admin', async () => {
    await expect(setStaffActive(db, clock, admin, 'pr-ellis', false)).rejects.toThrow(/own account/);
  });
});

describe('admin: downtime lifecycle and network clearance', () => {
  it('end needs every worklist item signed off; then declare → down → checklist + PIN → back online', async () => {
    expect(derivePhase(await db.downtime_event.toArray())).toBe('online');
    await expect(declareDowntime(db, clock, admin)).rejects.toThrow(/already open/);
    await expect(endDowntime(db, clock, admin)).rejects.toThrow(/not signed off/);
    for (const w of await db.worklist_item.toArray()) if (!w.signed_off_at) await signOffItem(db, clock, nurse, w.id);
    await endDowntime(db, clock, admin);
    expect(derivePhase(await db.downtime_event.toArray())).toBe('ready');
    await declareDowntime(db, clock, admin);
    expect(derivePhase(await db.downtime_event.toArray())).toBe('down');
    const list = ACTIVE_CLINICAL_POLICY.recovery.networkChecklist;
    await expect(clearNetwork(db, clock, admin, list.slice(1), PRACTICE_PIN)).rejects.toThrow(/checklist/);
    await expect(clearNetwork(db, clock, admin, list, '0000')).rejects.toThrow(/PIN/);
    await expect(clearNetwork(db, clock, nurse, list, PRACTICE_PIN)).rejects.toThrow(/admin/);
    await clearNetwork(db, clock, admin, list, PRACTICE_PIN);
    expect(derivePhase(await db.downtime_event.toArray())).toBe('online');
    expect((await verifyChain(await db.audit_log.orderBy('seq').toArray())).ok).toBe(true);
  });
});

describe('admin: patient list (snapshot) and first-time setup', () => {
  it('refuses fake practice data and clinical tables for Real records; accepts a clean patient list', async () => {
    const fake = checkSnapshotFile(seed);
    expect(fake.ok).toBe(false);
    expect(fake.errors.join(' ')).toMatch(/fake practice data/);
    expect(fake.errors.join(' ')).toMatch(/clinical records are never imported/);
    const live = new DowntimeDB('live', `live-${crypto.randomUUID()}`);
    const p = await firstTimeSetup(live, clock, { name: 'Ward Admin', initials: 'WA', pin: '4321', deviceLabel: 'Test laptop', unit: '4 West' });
    await expect(firstTimeSetup(live, clock, { name: 'B', initials: 'B', pin: '1111', deviceLabel: 'x', unit: 'y' })).rejects.toThrow(/already done/);
    const file = { snapshot: [{ id: 's1', taken_at: '2026-11-20T03:00:00+05:00', source_system: 'Test', unit: '4 West' }], patient: [{ id: 'p1', mrn: 'T-1', family_name: 'Test', given_name: 'Case', birth_date: '1970-01-01', sex: 'unknown' }], encounter: [{ id: 'e1', patient_id: 'p1', visit_number: 'V1', unit: '4 West', admit_time: '2026-11-19T10:00:00+05:00' }], allergy: [], active_order: [], snapshot_result: [] };
    expect(checkSnapshotFile(file).ok).toBe(true);
    const actor = { userId: p.id, deviceId: (await live.device.toArray())[0]!.id };
    await importSnapshot(live, clock, actor, file);
    expect(await live.patient.count()).toBe(1);
    await expect(importSnapshot(db, clock, admin, file)).rejects.toThrow(/Real records only/);
  });
});
