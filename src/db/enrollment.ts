import { buildAuditRow, canonicalJson } from './audit';
import type { DowntimeDB } from './db';
import type { Practitioner, Role } from './schema';
import { guardStorage } from './errors';
import { EntryWriteError } from './repos/entries';
import { assertNotUnitPassphrase, isUnlocked } from './vault';
import { checkPassphrase, encodeRecovery, fromB64u, keyFromPassphrase, randomBytes, toB64u } from '../lib/vaultCrypto';
import { hashPin, isValidPinFormat } from '../lib/crypto';
import { SECURITY_POLICY } from '../config/securityPolicy';
import type { Clock } from '../lib/time';

/**
 * Second-laptop enrollment, option F1 (approved 20 Nov 2026). See docs/proposals/P-05-second-laptop-enrollment.md.
 *
 * Laptop 1 (admin): makes an ENCRYPTED enrollment file with a one-time enrollment passphrase.
 *   Inside: staff identities, roles, active flags, unit, who made it, expiry. NOT inside: PIN hashes or any
 *   credential, clinical records, laptop 1's data key or recovery key.
 * Laptop 2 (an admin in the package, in person): compares the file fingerprint with laptop 1's screen, opens
 *   the file, sets up its OWN vault (new data key + recovery key), gets a NEW device id, and sets their own PIN.
 *   Everyone else arrives as "Needs activation": an admin checks the person's identity in person, then the
 *   person types a new PIN on laptop 2 (audited as credential_activated).
 *
 * Authenticity: AES-GCM with the enrollment passphrase proves only that the file was made by someone who knew
 * that passphrase and was not changed since. It does NOT prove who that was. The identity check is the in-person
 * handover of the passphrase plus the fingerprint comparison; and the importing admin gains nothing that
 * first-time setup on an empty laptop would not already give them, while every other account still needs an
 * in-person activation on laptop 2.
 */

export const ENROLLMENT_FORMAT = 'clinbridge-enrollment';
const PENDING_PREFIX = 'pending$enrollment$';

export interface EnrollmentHeader {
  format: typeof ENROLLMENT_FORMAT;
  version: 1;
  created_at: string;
  expires_at: string;
  kdf: { alg: 'PBKDF2-SHA-256'; iterations: number; salt: string };
  cipher: { alg: 'AES-256-GCM'; iv: string };
  fingerprint: string;
}

export interface EnrollmentStaff { id: string; name: string; initials: string; role: Role; active: boolean }

export interface EnrollmentContent {
  kind: typeof ENROLLMENT_FORMAT;
  enrollment_id: string;
  created_at: string;
  expires_at: string;
  created_by: { id: string; name: string };
  source_device: { id: string; label: string; unit: string };
  unit: string;
  staff: EnrollmentStaff[];
}

export class EnrollmentFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrollmentFileError';
  }
}

type Actor = { userId: string; deviceId: string };

export const isPendingActivation = (p: Pick<Practitioner, 'pin_hash'>) => p.pin_hash.startsWith(PENDING_PREFIX);

const aadOf = (h: Omit<EnrollmentHeader, 'fingerprint'>) => new TextEncoder().encode(canonicalJson(h as unknown as Record<string, unknown>));

/** Short code people compare between the two screens: first 80 bits of SHA-256(header + ciphertext), base-32. */
async function fingerprintOf(head: Omit<EnrollmentHeader, 'fingerprint'>, ct: Uint8Array): Promise<string> {
  const a = aadOf(head);
  const all = new Uint8Array(a.length + ct.length);
  all.set(a);
  all.set(ct, a.length);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', all));
  return encodeRecovery(d.slice(0, 20)).split('-').slice(0, 4).join('-');
}

async function requireAdmin(db: DowntimeDB, actor: Actor): Promise<Practitioner> {
  const p = await db.practitioner.get(actor.userId);
  if (!p || !p.active || p.role !== 'admin') throw new EntryWriteError('Only an admin can do this.');
  return p;
}

async function appendAudit(db: DowntimeDB, clock: Clock, actor: Actor, action: string, entity: string, after: unknown, work?: () => Promise<unknown>) {
  const last = await db.audit_log.orderBy('seq').last();
  const row = await buildAuditRow({ last, time: clock.nowIso(), userId: actor.userId, deviceId: actor.deviceId, action, entity, after });
  await guardStorage(() => db.transaction('rw', db.tables, async () => {
    const head = await db.audit_log.orderBy('seq').last();
    if ((head?.seq ?? 0) !== row.seq - 1) throw new EntryWriteError('Another change was saved at the same moment. Try again.');
    if (work) await work();
    await db.audit_log.add(row);
  }), (m) => new EntryWriteError(m));
}

/* ------------------------------ Laptop 1 ------------------------------ */

export async function createEnrollmentPackage(
  db: DowntimeDB, clock: Clock, actor: Actor, passphrase: string, opts: { iterations?: number; validHours?: number } = {},
): Promise<{ fileText: string; fingerprint: string; enrollmentId: string; expiresAt: string; staffCount: number }> {
  if (db.dataset !== 'live') throw new EntryWriteError('Enrollment is only for Real records.');
  const admin = await requireAdmin(db, actor);
  const s = checkPassphrase(passphrase);
  if (!s.ok) throw new EntryWriteError(s.problems.join(' '));
  await assertNotUnitPassphrase(db, passphrase);
  const device = await db.device.get(actor.deviceId);
  if (!device) throw new EntryWriteError('This laptop is not registered.');

  const created = clock.nowIso();
  const expires = new Date(Date.parse(created) + (opts.validHours ?? SECURITY_POLICY.enrollmentValidHours) * 3_600_000).toISOString();
  const staff = (await db.practitioner.toArray()).map(({ id, name, initials, role, active }) => ({ id, name, initials, role, active })); // no pin_hash
  const content: EnrollmentContent = {
    kind: ENROLLMENT_FORMAT, enrollment_id: `enr-${crypto.randomUUID()}`, created_at: created, expires_at: expires,
    created_by: { id: admin.id, name: admin.name }, source_device: { id: device.id, label: device.label, unit: device.unit }, unit: device.unit, staff,
  };
  const iterations = opts.iterations ?? SECURITY_POLICY.pbkdf2Iterations;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const head: Omit<EnrollmentHeader, 'fingerprint'> = {
    format: ENROLLMENT_FORMAT, version: 1, created_at: created, expires_at: expires,
    kdf: { alg: 'PBKDF2-SHA-256', iterations, salt: toB64u(salt) }, cipher: { alg: 'AES-256-GCM', iv: toB64u(iv) },
  };
  const key = await keyFromPassphrase(passphrase, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadOf(head) }, key, new TextEncoder().encode(JSON.stringify(content))));
  const fingerprint = await fingerprintOf(head, ct);
  const fileText = JSON.stringify({ header: { ...head, fingerprint }, ciphertext: toB64u(ct) });
  await appendAudit(db, clock, actor, 'enrollment_created', `enrollment/${content.enrollment_id}`, { enrollment_id: content.enrollment_id, fingerprint, expires_at: expires, staff_count: staff.length });
  return { fileText, fingerprint, enrollmentId: content.enrollment_id, expiresAt: expires, staffCount: staff.length };
}

/* ------------------------------ Laptop 2 ------------------------------ */

function parse(fileText: string): { header: EnrollmentHeader; ct: Uint8Array } {
  let f: { header?: EnrollmentHeader; ciphertext?: string };
  try {
    f = JSON.parse(fileText);
  } catch {
    throw new EnrollmentFileError('This is not a ClinBridge enrollment file.');
  }
  const h = f.header;
  if (!h || h.format !== ENROLLMENT_FORMAT || h.version !== 1 || typeof f.ciphertext !== 'string') throw new EnrollmentFileError('This is not a ClinBridge enrollment file.');
  return { header: h, ct: fromB64u(f.ciphertext) };
}

/** Fingerprint computed from the file itself (shown BEFORE the passphrase, to compare with laptop 1). */
export async function enrollmentFingerprint(fileText: string): Promise<string> {
  const { header, ct } = parse(fileText);
  const { fingerprint: _f, ...head } = header;
  void _f;
  return fingerprintOf(head, ct);
}

export async function openEnrollmentPackage(fileText: string, passphrase: string, nowIso: string): Promise<EnrollmentContent> {
  const { header, ct } = parse(fileText);
  const { fingerprint, ...head } = header;
  if ((await fingerprintOf(head, ct)) !== fingerprint) throw new EnrollmentFileError('The enrollment file is damaged or was changed. Ask for a new one.');
  if (Date.parse(nowIso) > Date.parse(header.expires_at)) {
    throw new EnrollmentFileError(`This enrollment file expired at ${header.expires_at}. Ask the admin of the other laptop for a new one. (If this laptop's clock is wrong, fix the clock first.)`);
  }
  const key = await keyFromPassphrase(passphrase, fromB64u(header.kdf.salt), header.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(fromB64u(header.cipher.iv)), additionalData: aadOf(head) }, key, new Uint8Array(ct));
  } catch {
    throw new EnrollmentFileError('Wrong enrollment passphrase. Nothing was set up.');
  }
  const c = JSON.parse(new TextDecoder().decode(plain)) as EnrollmentContent;
  if (c.kind !== ENROLLMENT_FORMAT || !Array.isArray(c.staff) || !c.enrollment_id) throw new EnrollmentFileError('The enrollment file content is not valid.');
  if (c.staff.some((s) => 'pin_hash' in s)) throw new EnrollmentFileError('The enrollment file carries credentials. It is refused.');
  return c;
}

/**
 * Set up laptop 2 from an opened package. Caller must already have created THIS laptop's own vault
 * (createVault) so everything below is encrypted with laptop 2's key. One transaction: all or nothing.
 */
export async function completeEnrollment(
  db: DowntimeDB, clock: Clock, pkg: EnrollmentContent, fingerprint: string, s: { adminStaffId: string; pin: string; deviceLabel: string },
): Promise<{ admin: Practitioner; deviceId: string; pending: number }> {
  if (db.dataset !== 'live') throw new EntryWriteError('Enrollment is only for Real records.');
  if (!isUnlocked(db)) throw new EntryWriteError('Set up this laptop’s own unit passphrase first.');
  if ((await db.practitioner.count()) > 0 || (await db.device.count()) > 0) throw new EntryWriteError('This laptop is already set up. An enrollment file can only set up an empty laptop.');
  const me = pkg.staff.find((x) => x.id === s.adminStaffId);
  if (!me || me.role !== 'admin' || !me.active) throw new EntryWriteError('Pick yourself from the admins in the file.');
  if (!isValidPinFormat(s.pin)) throw new EntryWriteError('PIN must be 4 digits.');
  if (!s.deviceLabel.trim()) throw new EntryWriteError('Enter this laptop’s name.');

  const deviceId = `dev-${crypto.randomUUID().slice(0, 8)}`; // made HERE, never taken from the file: always unique
  const myHash = await hashPin(s.pin);
  const staff: Practitioner[] = pkg.staff.map((x) => ({
    id: x.id, name: x.name, initials: x.initials, role: x.role, active: x.active,
    pin_hash: x.id === me.id ? myHash : `${PENDING_PREFIX}${pkg.enrollment_id}`,
  }));
  const device = { id: deviceId, label: s.deviceLabel.trim(), unit: pkg.unit, last_clock_sync: clock.nowIso(), model_status: 'unknown' };
  const pending = staff.filter(isPendingActivation).length;
  await appendAudit(db, clock, { userId: me.id, deviceId }, 'enrollment_completed', `enrollment/${pkg.enrollment_id}`, {
    enrollment_id: pkg.enrollment_id, fingerprint, created_by: pkg.created_by.id, source_device: pkg.source_device.id, staff_count: staff.length, pending_activation: pending,
  }, async () => {
    await db.practitioner.bulkAdd(staff);
    await db.device.add(device);
  });
  return { admin: staff.find((x) => x.id === me.id)!, deviceId, pending };
}

/** F1: an admin has checked this person's identity IN PERSON; the person now sets a new PIN on this laptop. */
export async function activateStaff(db: DowntimeDB, clock: Clock, actor: Actor, staffId: string, pin: string, identityCheckedInPerson: boolean): Promise<void> {
  const admin = await requireAdmin(db, actor);
  if (!identityCheckedInPerson) throw new EntryWriteError('Check the person’s identity in person first (for example their staff badge).');
  const p = await db.practitioner.get(staffId);
  if (!p) throw new EntryWriteError('Staff member not found.');
  if (!isPendingActivation(p)) throw new EntryWriteError('This account is already active on this laptop. Use New PIN to change a PIN.');
  if (!p.active) throw new EntryWriteError('This account is switched off. Switch it on first.');
  if (!isValidPinFormat(pin)) throw new EntryWriteError('PIN must be 4 digits.');
  const pin_hash = await hashPin(pin);
  await appendAudit(db, clock, actor, 'credential_activated', `practitioner/${staffId}`, { staff_id: staffId, verified_by: admin.id, method: 'in-person identity check' }, () => db.practitioner.update(staffId, { pin_hash }));
}
