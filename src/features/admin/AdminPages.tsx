import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { isAdmin, useApp, useSession } from '../../state/app';
import { addStaff, firstTimeSetup, resetStaffPin, setStaffActive } from '../../db/repos/admin';
import type { Role } from '../../db/schema';
import { ACTIVE_CLINICAL_POLICY as POLICY } from '../../config/clinicalPolicy';
import { CLINICAL_WARNINGS } from '../../config/clinicalWarnings';
import { SECURITY_POLICY } from '../../config/securityPolicy';
import { dateTimeLabel } from '../../lib/time';
import { Badge, Button, Card, EmptyState, Icon, PageTitle } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';
import { PassphraseHelp, RecoveryCodeConfirm } from '../auth/UnlockVault';
import { auditVaultEvent, createVault, isUnlocked } from '../../db/vault';
import { checkPassphrase, newRecoveryCode } from '../../lib/vaultCrypto';
import { createEncryptedBackup, openBackupFile, restoreEncryptedBackup } from '../../db/encryptedBackup';
import { ActivateStaffForm, EnrollLaptopCard, JoinUnitForm } from './EnrollmentUi';
import { isPendingActivation } from '../../db/enrollment';
import { CleanupCard } from './CleanupUi';
import { Err, msg } from './adminUi';


/** Admin area: screens check the role here, and every action checks it again in the database layer. */
export function AdminLayout() {
  const { user } = useSession();
  if (!isAdmin(user)) return <EmptyState icon="lock" text="Admins only." />;
  const tabs: [string, string][] = [['/admin', 'Readiness'], ['/admin/downtime', 'Downtime'], ['/admin/snapshot', 'Patient list'], ['/admin/staff', 'Staff'], ['/admin/devices', 'Laptops'], ['/admin/audit', 'Change log'], ['/admin/backup', 'Backup'], ['/admin/settings', 'Settings']];
  return (
    <>
      <PageTitle>Admin</PageTitle>
      <nav aria-label="Admin sections" className="flex flex-wrap gap-1 border-b border-card-border">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => `min-h-11 px-4 flex items-center font-body-md border-b-2 -mb-px ${isActive ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant hover:text-primary'}`}>{label}</NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

/* ------------------------------ Staff ------------------------------ */

export function StaffPage() {
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const staff = useLiveQuery(() => db.practitioner.toArray(), [db]);
  const [form, setForm] = useState({ name: '', initials: '', role: 'RN' as Role, pin: '' });
  const [pinFor, setPinFor] = useState<{ id: string; pin: string } | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actor = { userId: user!.id, deviceId };
  const run = async (f: () => Promise<unknown>, after?: () => void) => { setError(null); try { await f(); after?.(); } catch (e) { setError(msg(e)); } };
  return (
    <div className="flex flex-col gap-space-lg">
      <Card>
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">Staff on this laptop</h2>
        <ul>{(staff ?? []).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-space-md min-h-14 border-b border-card-border last:border-0">
            <span className="w-10 h-10 rounded-full bg-secondary-fixed grid place-items-center font-bold">{p.initials}</span>
            <span className="flex-1 font-semibold">{p.name}</span>
            <Badge tone={p.role === 'admin' ? 'navy' : 'blue'}>{p.role === 'admin' ? 'Admin' : p.role}</Badge>
            {!p.active ? <Badge>Switched off</Badge> : isPendingActivation(p) ? <Badge tone="amber">Needs activation</Badge> : <Badge tone="green">Active</Badge>}
            {isPendingActivation(p)
              ? <Button variant="secondary" disabled={!p.active} onClick={() => setActivating(p.id)}>Activate</Button>
              : <Button variant="secondary" onClick={() => setPinFor({ id: p.id, pin: '' })}>New PIN</Button>}
            <Button variant={p.active ? 'danger' : 'secondary'} onClick={() => run(() => setStaffActive(db, clock, actor, p.id, !p.active))}>{p.active ? 'Switch off' : 'Switch on'}</Button>
          </li>
        ))}</ul>
        {activating && staff?.find((x) => x.id === activating) && <ActivateStaffForm person={staff.find((x) => x.id === activating)!} onDone={() => setActivating(null)} />}
        {pinFor && (
          <div className="flex items-end gap-space-sm mt-space-md">
            <label className="flex flex-col gap-1"><span className={labelCls}>New 4-digit PIN for {staff?.find((s) => s.id === pinFor.id)?.name}</span>
              <input type="password" inputMode="numeric" maxLength={4} value={pinFor.pin} onChange={(e) => setPinFor({ ...pinFor, pin: e.target.value })} className={`${fieldCls()} w-40`} aria-label="New PIN" /></label>
            <Button onClick={() => run(() => resetStaffPin(db, clock, actor, pinFor.id, pinFor.pin), () => setPinFor(null))}>Save PIN</Button>
            <Button variant="ghost" onClick={() => setPinFor(null)}>Cancel</Button>
          </div>
        )}
      </Card>
      <Card className="flex flex-col gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm text-primary">Add a person</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-space-md">
          <label className="flex flex-col gap-1"><span className={labelCls}>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldCls()} aria-label="Name" /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Initials</span><input value={form.initials} maxLength={3} onChange={(e) => setForm({ ...form, initials: e.target.value })} className={fieldCls()} aria-label="Initials" /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Role</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={fieldCls()} aria-label="Role"><option value="RN">RN</option><option value="LPN">LPN</option><option value="admin">Admin</option></select></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>4-digit PIN</span><input type="password" inputMode="numeric" maxLength={4} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className={fieldCls()} aria-label="PIN" /></label>
        </div>
        <Button className="self-start" onClick={() => run(() => addStaff(db, clock, actor, form), () => setForm({ name: '', initials: '', role: 'RN', pin: '' }))}><Icon name="person_add" />Add</Button>
        <p className="font-body-sm text-secondary">What each role may do follows the UI/UX role table. Second-checker eligibility is a prototype setting (see Settings).</p>
      </Card>
      <Err e={error} />
    </div>
  );
}

/* ------------------------------ Devices, audit, settings ------------------------------ */

export function DevicesPage() {
  const { db, deviceId } = useApp();
  const devices = useLiveQuery(() => db.device.toArray(), [db]);
  const counts = useLiveQuery(async () => { const m = new Map<string, number>(); (await db.entry.toArray()).forEach((e) => m.set(e.device_id, (m.get(e.device_id) ?? 0) + 1)); return m; }, [db]);
  return (
    <div className="flex flex-col gap-space-lg">
    <Card>
      <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">Laptops</h2>
      <ul>{(devices ?? []).map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-space-md min-h-14 border-b border-card-border last:border-0">
          <MedIllustration name="workflows/device" size={26} />
          <span className="flex-1"><strong className="text-primary">{d.label}</strong> <span className="text-secondary">· {d.id} · {d.unit}</span></span>
          <span className="font-body-sm text-on-surface-variant">Last clock check {dateTimeLabel(d.last_clock_sync)}</span>
          <span className="font-body-sm text-on-surface-variant">{counts?.get(d.id) ?? 0} records</span>
          {d.id === deviceId && <Badge tone="navy">This laptop</Badge>}
        </li>
      ))}</ul>
      <p className="font-body-sm text-secondary mt-space-sm">Each record keeps its laptop and a counter, so clock problems can be found in Recovery.</p>
    </Card>
    <EnrollLaptopCard />
    </div>
  );
}

export function SettingsPage() {
  const item = (label: string, value: ReactNode, approved: boolean) => (
    <li className="py-space-sm border-b border-card-border last:border-0 flex flex-wrap items-start gap-space-md">
      <span className="w-56 font-semibold text-primary">{label}</span><span className="flex-1">{value}</span>
      <Badge tone={approved ? 'green' : 'amber'}>{approved ? 'Approved' : 'Not approved'}</Badge>
    </li>
  );
  return (
    <div className="flex flex-col gap-space-lg">
      <Card>
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">Clinical settings</h2>
        <p className="text-on-surface-variant mb-space-sm">{POLICY.note} They are read only here; a hospital-approved policy will replace them.</p>
        <ul>
          {item('High-alert medicines', `${POLICY.highAlert.entries.map((e) => e.label).join(', ')} · second nurse PIN for ${[...new Set(POLICY.highAlert.entries.flatMap((e) => e.events))].join(', ')}${POLICY.highAlert.listIsComplete ? '' : ' · partial list'}`, POLICY.highAlert.approved)}
          {item('Second checker', POLICY.secondChecker.roles.join(', '), POLICY.secondChecker.approved)}
          {item('Medicine timing (Overdue)', POLICY.medicationTiming.windows.length ? `${POLICY.medicationTiming.windows.length} windows` : 'None: doses show Due only', POLICY.medicationTiming.approved)}
          {item('Vital-sign warning ranges', 'Warn only, never block', CLINICAL_WARNINGS.review.approved)}
          {item('Recovery queue order', Object.entries(POLICY.recovery.categoryRank).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(' > '), POLICY.recovery.approved)}
          {item('Network clearance checklist', `${POLICY.recovery.networkChecklist.length} items + admin PIN`, POLICY.recovery.approved)}
        </ul>
      </Card>
      <Card>
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">Security settings</h2>
        <p className="text-on-surface-variant mb-space-sm">Prototype values. Hospital IT/security must review them before real use.</p>
        <ul>
          {item('Records lock after no use', `${SECURITY_POLICY.vaultIdleLockMinutes} minutes (unit passphrase needed again)`, SECURITY_POLICY.approved)}
          {item('Passphrase key derivation', `PBKDF2-SHA-256, ${SECURITY_POLICY.pbkdf2Iterations.toLocaleString('en-US')} iterations; AES-256-GCM records`, SECURITY_POLICY.approved)}
        </ul>
      </Card>
      <Card>
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">App</h2>
        <ul className="font-body-md list-disc pl-6">
          <li>Auto-lock after 5 minutes without use; 5 wrong PINs lock sign-in for 1 minute.</li>
          <li>No early-warning or risk score is calculated.</li>
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------ First-time setup (Real records) ------------------------------ */

export function SetupPage() {
  const { db, clock, dataset, vaultCreated } = useApp();
  const navigate = useNavigate();
  const staffCount = useLiveQuery(() => db.practitioner.count(), [db]);
  const [f, setF] = useState({ name: '', initials: '', pin: '', deviceLabel: '', unit: '', pass1: '', pass2: '' });
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restore, setRestore] = useState<{ file: File | null; pass: string } | null>(null);
  const [join, setJoin] = useState(false);
  if (dataset !== 'live') return <EmptyState icon="info" text="Setup is only for Real records. Practice is ready to use." />;
  if (staffCount === undefined) return <p role="status">Loading…</p>;
  if (staffCount > 0) return <EmptyState icon="task_alt" text="Setup is done. An admin can add staff in Admin → Staff." />;
  const field = (k: keyof typeof f, label: string, type = 'text') => (
    <label className="flex flex-col gap-1"><span className={labelCls}>{label}</span>
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={fieldCls()} aria-label={label} autoComplete="off" {...(k === 'pin' ? { inputMode: 'numeric' as const, maxLength: 4 } : {})} /></label>
  );

  // Step 1 checks everything BEFORE a vault exists, so a typo never leaves a half-made setup.
  const check = (): string | null => {
    if (restore) {
      if (!restore.file || !restore.pass) return 'Choose the backup file and type its backup passphrase.';
      if (f.pass1 !== f.pass2) return 'The two unit passphrases are not the same.';
      const s = checkPassphrase(f.pass1);
      return s.ok ? null : s.problems.join(' ');
    }
    if (!f.name.trim() || !/^[A-Za-z]{1,3}$/.test(f.initials.trim())) return 'Enter a name and 1 to 3 initials.';
    if (!/^\d{4}$/.test(f.pin)) return 'PIN must be 4 digits.';
    if (!f.deviceLabel.trim() || !f.unit.trim()) return 'Enter the laptop name and the unit.';
    if (f.pass1 !== f.pass2) return 'The two unit passphrases are not the same.';
    const s = checkPassphrase(f.pass1);
    return s.ok ? null : s.problems.join(' ');
  };

  const finish = async () => {
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      if (restore) {
        // Read and check the file before the vault exists, so a wrong passphrase leaves nothing behind.
        const text = await restore.file!.text();
        await openBackupFile(text, restore.pass, 'live');
        if (!isUnlocked(db)) await createVault(db, f.pass1, { recoveryCode: code });
        await restoreEncryptedBackup(db, text, restore.pass, { clock, deviceId: 'restored' });
        setRestore(null);
      } else {
        if (!isUnlocked(db)) await createVault(db, f.pass1, { recoveryCode: code });
        const admin = await firstTimeSetup(db, clock, f);
        const device = (await db.device.toArray())[0]?.id ?? 'unregistered';
        await auditVaultEvent(db, clock, device, 'vault_created', { dataset: 'live', by: admin.id });
      }
      setF({ name: '', initials: '', pin: '', deviceLabel: '', unit: '', pass1: '', pass2: '' });
      setCode(null);
      vaultCreated();
      navigate('/sign-in');
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-space-md max-w-2xl">
      <h2 className="font-headline-sm text-headline-sm text-primary">First-time setup</h2>
      {!code ? (
        <>
          <div className="flex flex-wrap gap-space-sm" role="radiogroup" aria-label="How to set up">
            <Button variant={restore || join ? 'secondary' : 'primary'} role="radio" aria-checked={!restore && !join} onClick={() => { setRestore(null); setJoin(false); }}>New setup</Button>
            <Button variant={join ? 'primary' : 'secondary'} role="radio" aria-checked={join} onClick={() => { setRestore(null); setJoin(true); }}>Join this unit (enrollment file)</Button>
            <Button variant={restore ? 'primary' : 'secondary'} role="radio" aria-checked={!!restore} onClick={() => { setJoin(false); setRestore({ file: null, pass: '' }); }}>Restore from encrypted backup</Button>
          </div>
          {join ? <JoinUnitForm /> : restore ? (
            <>
              <p className="text-on-surface-variant">Brings back every record, staff account and photo from a backup file made on a ClinBridge laptop. This laptop gets its <strong>own</strong> new unit passphrase and recovery key.</p>
              <label className="flex flex-col gap-1"><span className={labelCls}>Backup file</span>
                <input type="file" accept="application/json,.json" aria-label="Backup file" onChange={(e) => setRestore({ ...restore, file: e.target.files?.[0] ?? null })} /></label>
              <label className="flex flex-col gap-1 max-w-md"><span className={labelCls}>Backup passphrase</span>
                <input type="password" value={restore.pass} onChange={(e) => setRestore({ ...restore, pass: e.target.value })} className={fieldCls()} aria-label="Backup passphrase" autoComplete="off" /></label>
            </>
          ) : (
            <>
              <p className="text-on-surface-variant">Create the first admin, register this laptop and set the unit passphrase that encrypts the records on it. Then load the hospital patient list in Admin → Patient list.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                {field('name', 'Admin name')}{field('initials', 'Initials')}{field('pin', '4-digit PIN', 'password')}
                {field('deviceLabel', 'Laptop name')}{field('unit', 'Unit')}
              </div>
            </>
          )}
          {!join && (
            <>
              <h3 className="font-headline-sm text-primary">Unit passphrase</h3>
              <p className="text-on-surface-variant font-body-sm">Typed once after each restart or lock to open the records. PINs still say who is acting. ClinBridge never stores the passphrase.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                {field('pass1', 'Unit passphrase', 'password')}{field('pass2', 'Unit passphrase again', 'password')}
              </div>
              <PassphraseHelp />
              <Button className="self-start" onClick={() => { const e = check(); setError(e); if (!e) setCode(newRecoveryCode()); }}>Next: recovery key</Button>
            </>
          )}
        </>
      ) : (
        <>
          <RecoveryCodeConfirm code={code} onConfirmed={() => void finish()} confirmLabel={busy ? 'Setting up…' : restore ? 'Restore and encrypt' : 'Create admin and encrypt'} />
          <Button variant="ghost" className="self-start" disabled={busy} onClick={() => setCode(null)}>Back</Button>
        </>
      )}
      <Err e={error} />
    </Card>
  );
}

/** Admin → Backup: encrypted backup file (P-04 decision B1). */
export function BackupPage() {
  const { db, clock, deviceId, dataset } = useApp();
  const { user } = useSession();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const make = async () => {
    setError(null);
    setDone(null);
    if (p1 !== p2) return setError('The two backup passphrases are not the same.');
    setBusy(true);
    try {
      const { fileText, header } = await createEncryptedBackup(db, p1, { clock, actor: { userId: user!.id, deviceId } });
      const url = URL.createObjectURL(new Blob([fileText], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `clinbridge-${dataset}-backup-${clock.nowIso().slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click();
      URL.revokeObjectURL(url);
      setDone(header.fingerprint);
    } catch (e) {
      setError(msg(e));
    } finally {
      setP1('');
      setP2('');
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-space-lg max-w-2xl">
    <Card className="flex flex-col gap-space-md">
      <h2 className="font-headline-sm text-headline-sm text-primary">Encrypted backup file</h2>
      <p className="text-on-surface-variant">Makes one file with every record and photo on this laptop, encrypted (AES-256-GCM) with a <strong>backup passphrase</strong> that you choose now. It must be different from the unit passphrase. The laptop&apos;s keys are never in the file.</p>
      <p className="text-on-surface-variant font-body-sm">The browser saves the file where its downloads go. ClinBridge cannot see or protect that folder: move the file to storage your hospital approves, and keep the backup passphrase apart from the file. To restore, use first-time setup on an empty laptop (Real records).</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        <label className="flex flex-col gap-1"><span className={labelCls}>Backup passphrase</span>
          <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} className={fieldCls()} aria-label="Backup passphrase" autoComplete="new-password" /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Backup passphrase again</span>
          <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} className={fieldCls()} aria-label="Backup passphrase again" autoComplete="new-password" /></label>
      </div>
      <PassphraseHelp />
      <Button className="self-start" disabled={busy || !p1} onClick={() => void make()}><Icon name="download" />{busy ? 'Encrypting…' : 'Make encrypted backup'}</Button>
      {done && <p role="status" className="text-sync-green">Backup file made. Fingerprint recorded in the change log: <span className="font-code-tabular break-all">{done}</span></p>}
      <Err e={error} />
    </Card>
    <CleanupCard />
    </div>
  );
}
