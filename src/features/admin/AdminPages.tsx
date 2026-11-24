import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { isAdmin, useApp, useSession } from '../../state/app';
import { firstTimeSetup } from '../../db/repos/admin';
import { Button, EmptyState, PageTitle } from '../../components/ui';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';
import { PassphraseHelp, RecoveryCodeConfirm } from '../auth/UnlockVault';
import { auditVaultEvent, createVault, isUnlocked } from '../../db/vault';
import { checkPassphrase, newRecoveryCode } from '../../lib/vaultCrypto';
import { openBackupFile, restoreEncryptedBackup } from '../../db/encryptedBackup';
import { JoinUnitForm } from './EnrollmentUi';
import { Err, msg } from './adminUi';
import { SetupFrame } from './SetupFrame';


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
    <SetupFrame step={code ? 3 : 1} kind={join ? 'join' : restore ? 'restore' : 'new'}>
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
    </SetupFrame>
  );
}
