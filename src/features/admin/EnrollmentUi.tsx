import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useSession } from '../../state/app';
import { Button, Card, Icon } from '../../components/ui';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';
import { PassphraseHelp, RecoveryCodeConfirm } from '../auth/UnlockVault';
import {
  activateStaff, completeEnrollment, createEnrollmentPackage, enrollmentFingerprint, openEnrollmentPackage, type EnrollmentContent,
} from '../../db/enrollment';
import { auditVaultEvent, createVault, isUnlocked } from '../../db/vault';
import { checkPassphrase, newRecoveryCode } from '../../lib/vaultCrypto';
import { SECURITY_POLICY } from '../../config/securityPolicy';
import type { Practitioner } from '../../db/schema';

/**
 * Second-laptop enrollment, F1 (P-05). Laptop 1: Admin → Laptops → "Enroll another laptop".
 * Laptop 2: first-time setup → "Join this unit". Staff activation: Admin → Staff → "Activate".
 */

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const Err = ({ e }: { e: string | null }) => (e ? <p role="alert" className="text-error font-semibold">{e}</p> : null);

function Fingerprint({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-card-border bg-surface-container-low p-space-md">
      <p className={labelCls}>{label}</p>
      <p data-testid="enrollment-fingerprint" className="font-mono text-[24px] tracking-wider">{value}</p>
    </div>
  );
}

/** Laptop 1 (Real records, admin). */
export function EnrollLaptopCard() {
  const { db, clock, deviceId, dataset } = useApp();
  const { user } = useSession();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ fingerprint: string; expiresAt: string; staffCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (dataset !== 'live') return null;
  const make = async () => {
    setError(null);
    if (p1 !== p2) return setError('The two enrollment passphrases are not the same.');
    setBusy(true);
    try {
      const r = await createEnrollmentPackage(db, clock, { userId: user!.id, deviceId }, p1);
      const url = URL.createObjectURL(new Blob([r.fileText], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `clinbridge-enrollment-${clock.nowIso().slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click();
      URL.revokeObjectURL(url);
      setDone(r);
    } catch (e) {
      setError(msg(e));
    } finally {
      setP1('');
      setP2('');
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-col gap-space-md">
      <h2 className="font-headline-sm text-headline-sm text-primary">Enroll another laptop</h2>
      <p className="text-on-surface-variant">Makes an encrypted file with this unit&apos;s staff list (names, roles, on/off). <strong>No PINs, no patient records and no keys</strong> are in it. The new laptop gets its own unit passphrase, recovery key and laptop id, and every person except the admin setting it up is activated there in person.</p>
      <p className="text-on-surface-variant font-body-sm">Choose a one-time enrollment passphrase (not the unit passphrase). Give the file and the passphrase to the admin of the new laptop <strong>in person</strong>. The file stops working {SECURITY_POLICY.enrollmentValidHours} hours after it is made (prototype value, not approved).</p>
      {!done ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <label className="flex flex-col gap-1"><span className={labelCls}>Enrollment passphrase</span>
              <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} className={fieldCls()} aria-label="Enrollment passphrase" autoComplete="new-password" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Enrollment passphrase again</span>
              <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} className={fieldCls()} aria-label="Enrollment passphrase again" autoComplete="new-password" /></label>
          </div>
          <PassphraseHelp />
          <Button className="self-start" disabled={busy || !p1} onClick={() => void make()}><Icon name="download" />{busy ? 'Encrypting…' : 'Make enrollment file'}</Button>
        </>
      ) : (
        <div role="status" className="flex flex-col gap-space-sm">
          <p className="text-sync-green font-semibold">Enrollment file made ({done.staffCount} people). It expires {done.expiresAt.slice(0, 16).replace('T', ' ')} UTC.</p>
          <Fingerprint value={done.fingerprint} label="Fingerprint: the new laptop must show exactly this" />
          <p className="font-body-sm text-on-surface-variant">Compare it with the new laptop&apos;s screen together. If it differs, do not use the file. Where the browser saved the file is up to you: delete it once the new laptop is set up.</p>
          <Button variant="secondary" className="self-start" onClick={() => setDone(null)}>Make another</Button>
        </div>
      )}
      <Err e={error} />
    </Card>
  );
}

/** Laptop 2: first-time setup → "Join this unit". */
export function JoinUnitForm() {
  const { db, clock, vaultCreated } = useApp();
  const navigate = useNavigate();
  const [text, setText] = useState<string | null>(null);
  const [fp, setFp] = useState<string | null>(null);
  const [fpOk, setFpOk] = useState(false);
  const [ePass, setEPass] = useState('');
  const [pkg, setPkg] = useState<EnrollmentContent | null>(null);
  const [f, setF] = useState({ adminId: '', pin: '', label: '', pass1: '', pass2: '' });
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    setError(null); setPkg(null); setFpOk(false); setFp(null); setText(null);
    if (!file) return;
    try {
      const t = await file.text();
      setFp(await enrollmentFingerprint(t));
      setText(t);
    } catch (e) { setError(msg(e)); }
  };
  const open = async () => {
    setError(null);
    setBusy(true);
    try { setPkg(await openEnrollmentPackage(text!, ePass, clock.nowIso())); } catch (e) { setError(msg(e)); } finally { setEPass(''); setBusy(false); }
  };
  const next = () => {
    setError(null);
    if (!f.adminId) return setError('Pick yourself from the admins in the file.');
    if (!/^\d{4}$/.test(f.pin)) return setError('PIN must be 4 digits.');
    if (!f.label.trim()) return setError('Enter this laptop’s name.');
    if (f.pass1 !== f.pass2) return setError('The two unit passphrases are not the same.');
    const s = checkPassphrase(f.pass1);
    if (!s.ok) return setError(s.problems.join(' '));
    setCode(newRecoveryCode());
  };
  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!isUnlocked(db)) await createVault(db, f.pass1, { recoveryCode: code! });
      const r = await completeEnrollment(db, clock, pkg!, fp!, { adminStaffId: f.adminId, pin: f.pin, deviceLabel: f.label });
      await auditVaultEvent(db, clock, r.deviceId, 'vault_created', { dataset: 'live', by: r.admin.id, via: 'enrollment' });
      vaultCreated();
      navigate('/sign-in');
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const admins = (pkg?.staff ?? []).filter((s) => s.role === 'admin' && s.active);
  return (
    <div className="flex flex-col gap-space-md">
      {code ? (
        <>
          <RecoveryCodeConfirm code={code} onConfirmed={() => void finish()} confirmLabel={busy ? 'Setting up…' : 'Join and encrypt'} />
          <Button variant="ghost" className="self-start" disabled={busy} onClick={() => setCode(null)}>Back</Button>
        </>
      ) : !pkg ? (
        <>
          <p className="text-on-surface-variant">Use the enrollment file from an admin on another laptop of this unit. It brings the staff list only; this laptop gets its own passphrase, recovery key and laptop id. Patient lists are loaded separately (Admin → Patient list).</p>
          <label className="flex flex-col gap-1"><span className={labelCls}>Enrollment file</span>
            <input type="file" accept="application/json,.json" aria-label="Enrollment file" onChange={(e) => void pick(e.target.files?.[0])} /></label>
          {fp && (
            <>
              <Fingerprint value={fp} label="Fingerprint of this file" />
              <label className="flex items-start gap-2"><input type="checkbox" checked={fpOk} onChange={(e) => setFpOk(e.target.checked)} className="mt-1 w-5 h-5" aria-label="The fingerprint matches the other laptop" />The other admin showed me exactly the same fingerprint, in person.</label>
              <label className="flex flex-col gap-1 max-w-md"><span className={labelCls}>Enrollment passphrase</span>
                <input type="password" value={ePass} onChange={(e) => setEPass(e.target.value)} className={fieldCls()} aria-label="Enrollment passphrase" autoComplete="off" /></label>
              <Button className="self-start" disabled={!fpOk || !ePass || busy} onClick={() => void open()}>{busy ? 'Opening…' : 'Open file'}</Button>
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-on-surface-variant">File from <strong>{pkg.created_by.name}</strong> on {pkg.source_device.label} ({pkg.unit}), {pkg.staff.length} people. Everyone except you will show &ldquo;Needs activation&rdquo; until an admin checks them in person.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <label className="flex flex-col gap-1"><span className={labelCls}>Who are you?</span>
              <select value={f.adminId} onChange={(e) => setF({ ...f, adminId: e.target.value })} className={fieldCls()} aria-label="Who are you">
                <option value="">Pick an admin</option>{admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Your new 4-digit PIN on this laptop</span>
              <input type="password" inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} className={fieldCls()} aria-label="Your new PIN" autoComplete="off" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>This laptop&apos;s name</span>
              <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} className={fieldCls()} aria-label="This laptop's name" /></label>
          </div>
          <h3 className="font-headline-sm text-primary">This laptop&apos;s unit passphrase</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <label className="flex flex-col gap-1"><span className={labelCls}>Unit passphrase</span>
              <input type="password" value={f.pass1} onChange={(e) => setF({ ...f, pass1: e.target.value })} className={fieldCls()} aria-label="Unit passphrase" autoComplete="new-password" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Unit passphrase again</span>
              <input type="password" value={f.pass2} onChange={(e) => setF({ ...f, pass2: e.target.value })} className={fieldCls()} aria-label="Unit passphrase again" autoComplete="new-password" /></label>
          </div>
          <PassphraseHelp />
          <Button className="self-start" onClick={next}>Next: recovery key</Button>
        </>
      )}
      <Err e={error} />
    </div>
  );
}

/** Admin → Staff: activation of an account that came from an enrollment file. */
export function ActivateStaffForm({ person, onDone }: { person: Practitioner; onDone: () => void }) {
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const [checked, setChecked] = useState(false);
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setError(null);
    if (p1 !== p2) return setError('The two PINs are not the same.');
    try { await activateStaff(db, clock, { userId: user!.id, deviceId }, person.id, p1, checked); onDone(); } catch (e) { setError(msg(e)); } finally { setP1(''); setP2(''); }
  };
  return (
    <div className="flex flex-col gap-space-sm mt-space-md rounded-lg border border-card-border p-space-md" aria-label={`Activate ${person.name}`} role="group">
      <p className="font-semibold text-primary">Activate {person.name}</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 w-5 h-5" aria-label="I checked this person's identity in person" />I checked this person&apos;s identity in person (for example their staff badge).</label>
      <p className="font-body-sm text-secondary">Hand the laptop to {person.name}: they type their own new PIN.</p>
      <div className="flex flex-wrap items-end gap-space-sm">
        <label className="flex flex-col gap-1"><span className={labelCls}>New 4-digit PIN</span>
          <input type="password" inputMode="numeric" maxLength={4} value={p1} onChange={(e) => setP1(e.target.value)} className={`${fieldCls()} w-40`} aria-label="Their new PIN" /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>PIN again</span>
          <input type="password" inputMode="numeric" maxLength={4} value={p2} onChange={(e) => setP2(e.target.value)} className={`${fieldCls()} w-40`} aria-label="Their new PIN again" /></label>
        <Button disabled={!checked || !p1} onClick={() => void go()}>Activate</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      <Err e={error} />
    </div>
  );
}
