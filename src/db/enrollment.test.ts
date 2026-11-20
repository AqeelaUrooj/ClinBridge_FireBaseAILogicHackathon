import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { DowntimeDB } from './db';
import { verifyChain } from './audit';
import { clearVaultMode, setVaultMode } from './encryption';
import { createVault, readVaultRow } from './vault';
import { addStaff, firstTimeSetup, resetStaffPin, setStaffActive } from './repos/admin';
import { activateStaff, completeEnrollment, createEnrollmentPackage, enrollmentFingerprint, EnrollmentFileError, isPendingActivation, openEnrollmentPackage } from './enrollment';
import { liveClock } from '../lib/time';
import { fromB64u, toB64u } from '../lib/vaultCrypto';
import { verifyPin } from '../lib/crypto';

const FAST = 1000;
const clock = liveClock();
const UNIT_1 = 'violet harbour lantern seventeen';
const UNIT_2 = 'amber tunnel falcon forty';
const ENROLL = 'saffron ladder comet nine';
const dbs: DowntimeDB[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) {
    clearVaultMode(db.name);
    db.close();
  }
});

async function liveDb(): Promise<DowntimeDB> {
  const db = new DowntimeDB('live', `enr-${crypto.randomUUID()}`);
  dbs.push(db);
  setVaultMode(db.name, { mode: 'pending' });
  await db.open();
  return db;
}

/** Laptop 1: set up, an admin, two nurses (one switched off). */
async function laptop1() {
  const db = await liveDb();
  await createVault(db, UNIT_1, { iterations: FAST });
  const admin = await firstTimeSetup(db, clock, { name: 'Ana Admin', initials: 'AA', pin: '8642', deviceLabel: 'Laptop 1', unit: '4 West' });
  const deviceId = (await db.device.toArray())[0]!.id;
  const actor = { userId: admin.id, deviceId };
  const nurse = await addStaff(db, clock, actor, { name: 'Nina Nurse', initials: 'NN', role: 'RN', pin: '1357' });
  const off = await addStaff(db, clock, actor, { name: 'Olly Off', initials: 'OO', role: 'LPN', pin: '2468' });
  await setStaffActive(db, clock, actor, off.id, false);
  return { db, admin, actor, deviceId, nurse, off };
}

describe('enrollment file (laptop 1)', () => {
  it('holds staff identities and roles only: no PIN hash, no records, no key, no passphrase', async () => {
    const l1 = await laptop1();
    const r = await createEnrollmentPackage(l1.db, clock, l1.actor, ENROLL, { iterations: FAST });
    expect(r.staffCount).toBe(3);
    expect(r.fingerprint).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
    for (const needle of ['Nina Nurse', 'pbkdf2$', 'pin_hash', 'cb1$', 'wrapped_key', UNIT_1, ENROLL]) expect(r.fileText).not.toContain(needle);
    const content = await openEnrollmentPackage(r.fileText, ENROLL, clock.nowIso());
    expect(content.staff.map((s) => s.name).sort()).toEqual(['Ana Admin', 'Nina Nurse', 'Olly Off']);
    expect(JSON.stringify(content)).not.toMatch(/pin_hash|pbkdf2|wrapped|entry|patient/);
    expect(content.source_device.id).toBe(l1.deviceId);
    const last = await l1.db.audit_log.orderBy('seq').last();
    expect(last?.action).toBe('enrollment_created');
  });

  it('only an active admin can make one; weak passphrase and the unit passphrase are refused', async () => {
    const l1 = await laptop1();
    await expect(createEnrollmentPackage(l1.db, clock, { userId: l1.nurse.id, deviceId: l1.deviceId }, ENROLL, { iterations: FAST })).rejects.toThrow(/Only an admin/);
    await expect(createEnrollmentPackage(l1.db, clock, l1.actor, 'password1234', { iterations: FAST })).rejects.toThrow(/common password/);
    await expect(createEnrollmentPackage(l1.db, clock, l1.actor, UNIT_1, { iterations: FAST })).rejects.toThrow(/different passphrase/);
  });
});

describe('opening the file (laptop 2)', () => {
  it('fingerprint shown before the passphrase matches laptop 1; damaged, edited, expired and wrong-passphrase files are refused', async () => {
    const l1 = await laptop1();
    const r = await createEnrollmentPackage(l1.db, clock, l1.actor, ENROLL, { iterations: FAST, validHours: 24 });
    expect(await enrollmentFingerprint(r.fileText)).toBe(r.fingerprint);
    const f = JSON.parse(r.fileText);
    const ct = fromB64u(f.ciphertext);
    ct[3] = ct[3]! ^ 1;
    const damaged = JSON.stringify({ ...f, ciphertext: toB64u(ct) });
    expect(await enrollmentFingerprint(damaged)).not.toBe(r.fingerprint); // the people comparing screens would see it
    await expect(openEnrollmentPackage(damaged, ENROLL, clock.nowIso())).rejects.toThrow(/damaged or was changed/);
    const longer = JSON.stringify({ ...f, header: { ...f.header, expires_at: '2099-01-01T00:00:00Z' } });
    await expect(openEnrollmentPackage(longer, ENROLL, clock.nowIso())).rejects.toThrow(/damaged or was changed/);
    const later = new Date(Date.parse(clock.nowIso()) + 25 * 3_600_000).toISOString();
    await expect(openEnrollmentPackage(r.fileText, ENROLL, later)).rejects.toThrow(/expired/);
    await expect(openEnrollmentPackage(r.fileText, 'other words entirely here', clock.nowIso())).rejects.toThrow(/Wrong enrollment passphrase/);
    await expect(openEnrollmentPackage('{"x":1}', ENROLL, clock.nowIso())).rejects.toBeInstanceOf(EnrollmentFileError);
  });
});

describe('completing enrollment (laptop 2)', () => {
  async function enrolled() {
    const l1 = await laptop1();
    const r = await createEnrollmentPackage(l1.db, clock, l1.actor, ENROLL, { iterations: FAST });
    const pkg = await openEnrollmentPackage(r.fileText, ENROLL, clock.nowIso());
    const db2 = await liveDb();
    await createVault(db2, UNIT_2, { iterations: FAST });
    const out = await completeEnrollment(db2, clock, pkg, r.fingerprint, { adminStaffId: l1.admin.id, pin: '9753', deviceLabel: 'Laptop 2' });
    return { l1, r, pkg, db2, out };
  }

  it('own vault and new device id; same staff ids; only the importing admin can sign in; others need activation', async () => {
    const { l1, db2, out, pkg } = await enrolled();
    expect(out.deviceId).not.toBe(l1.deviceId);
    expect(out.pending).toBe(2);
    expect((await readVaultRow(db2))?.wrapped_key_pin).not.toBe((await readVaultRow(l1.db))?.wrapped_key_pin);
    const staff = await db2.practitioner.toArray();
    expect(staff.map((s) => s.id).sort()).toEqual(pkg.staff.map((s) => s.id).sort());
    const admin2 = staff.find((s) => s.id === l1.admin.id)!;
    expect(await verifyPin('9753', admin2.pin_hash)).toBe(true);
    expect(await verifyPin('8642', admin2.pin_hash)).toBe(false); // laptop 1's PIN does not carry over
    const nurse2 = staff.find((s) => s.id === l1.nurse.id)!;
    expect(isPendingActivation(nurse2)).toBe(true);
    expect(await verifyPin('1357', nurse2.pin_hash)).toBe(false);
    expect(staff.find((s) => s.id === l1.off.id)?.active).toBe(false);
    expect(await db2.entry.count()).toBe(0);
    expect(await db2.patient.count()).toBe(0);
    const audit = await db2.audit_log.toArray();
    expect(audit.map((a) => a.action)).toEqual(['enrollment_completed']);
    expect((await verifyChain(audit)).ok).toBe(true);
    // stored encrypted with laptop 2's key
    db2.close();
    const raw = new Dexie(db2.name);
    await raw.open();
    expect(JSON.stringify(await raw.table('practitioner').toArray())).not.toContain('Nina Nurse');
    raw.close();
    await db2.open();
  });

  it('activation: admin must confirm an in-person identity check; the nurse sets a new PIN; audited; no plain PIN reset', async () => {
    const { l1, db2, out } = await enrolled();
    const actor2 = { userId: l1.admin.id, deviceId: out.deviceId };
    await expect(resetStaffPin(db2, clock, actor2, l1.nurse.id, '1111')).rejects.toThrow(/needs activation/);
    await expect(activateStaff(db2, clock, actor2, l1.nurse.id, '4826', false)).rejects.toThrow(/identity in person/);
    await expect(activateStaff(db2, clock, { userId: l1.nurse.id, deviceId: out.deviceId }, l1.nurse.id, '4826', true)).rejects.toThrow(/Only an admin/);
    await expect(activateStaff(db2, clock, actor2, l1.off.id, '4826', true)).rejects.toThrow(/switched off/);
    await activateStaff(db2, clock, actor2, l1.nurse.id, '4826', true);
    const n = (await db2.practitioner.get(l1.nurse.id))!;
    expect(isPendingActivation(n)).toBe(false);
    expect(await verifyPin('4826', n.pin_hash)).toBe(true);
    const last = (await db2.audit_log.orderBy('seq').last())!;
    expect(last.action).toBe('credential_activated');
    expect(JSON.stringify(last)).not.toContain('4826');
    await expect(activateStaff(db2, clock, actor2, l1.nurse.id, '5555', true)).rejects.toThrow(/already active/);
  });

  it('duplicate enrollment on the same laptop is refused; nothing changes', async () => {
    const { l1, r, pkg, db2 } = await enrolled();
    const before = await db2.audit_log.count();
    await expect(completeEnrollment(db2, clock, pkg, r.fingerprint, { adminStaffId: l1.admin.id, pin: '1111', deviceLabel: 'Again' })).rejects.toThrow(/already set up/);
    expect(await db2.audit_log.count()).toBe(before);
    expect(await db2.device.count()).toBe(1);
  });

  it('the same file used on a third laptop gets a different device id (copies cannot be stopped offline, only told apart)', async () => {
    const { l1, r, pkg, out } = await enrolled();
    const db3 = await liveDb();
    await createVault(db3, 'copper meadow window ninety', { iterations: FAST });
    const out3 = await completeEnrollment(db3, clock, pkg, r.fingerprint, { adminStaffId: l1.admin.id, pin: '2222', deviceLabel: 'Laptop 3' });
    expect(out3.deviceId).not.toBe(out.deviceId);
    // the enrollment id is in both laptops' audit logs, which is how a reused file is found later
    const id2 = JSON.stringify((await db3.audit_log.toArray())[0]);
    expect(id2).toContain(pkg.enrollment_id);
  });

  it('failures leave laptop 2 empty: no vault yet, a non-admin picked, a bad PIN', async () => {
    const l1 = await laptop1();
    const r = await createEnrollmentPackage(l1.db, clock, l1.actor, ENROLL, { iterations: FAST });
    const pkg = await openEnrollmentPackage(r.fileText, ENROLL, clock.nowIso());
    const db2 = await liveDb();
    await expect(completeEnrollment(db2, clock, pkg, r.fingerprint, { adminStaffId: l1.admin.id, pin: '9753', deviceLabel: 'L2' })).rejects.toThrow(/unit passphrase first/);
    await createVault(db2, UNIT_2, { iterations: FAST });
    await expect(completeEnrollment(db2, clock, pkg, r.fingerprint, { adminStaffId: l1.nurse.id, pin: '9753', deviceLabel: 'L2' })).rejects.toThrow(/admins in the file/);
    await expect(completeEnrollment(db2, clock, pkg, r.fingerprint, { adminStaffId: l1.admin.id, pin: '97', deviceLabel: 'L2' })).rejects.toThrow(/4 digits/);
    expect(await db2.practitioner.count()).toBe(0);
    expect(await db2.device.count()).toBe(0);
    expect(await db2.audit_log.count()).toBe(0);
  });
});
