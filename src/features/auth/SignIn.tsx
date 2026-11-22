import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Practitioner } from '../../db/schema';
import { verifyPin } from '../../lib/crypto';
import { useApp, useSession } from '../../state/app';
import { PRACTICE_PIN } from '../../db/seed';
import { Button, Icon } from '../../components/ui';
import { PinPad } from './PinPad';
import { isPendingActivation } from '../../db/enrollment';
import { ModeBanner } from '../../components/AppShell';

const MAX_TRIES = 5;
const LOCKOUT_MS = 60_000;

export function usePinCheck(target: Practitioner | null, onSuccess: (p: Practitioner) => void) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const blocked = Date.now() < blockedUntil;

  const submit = async (value: string) => {
    if (!target || busy || blocked) return;
    setBusy(true);
    const ok = await verifyPin(value, target.pin_hash);
    setBusy(false);
    setPin('');
    if (ok) {
      setTries(0);
      setError(null);
      onSuccess(target);
      return;
    }
    const n = tries + 1;
    setTries(n);
    if (n >= MAX_TRIES) {
      setBlockedUntil(Date.now() + LOCKOUT_MS);
      setTries(0);
      setError('Too many wrong tries. Wait 1 minute.');
      window.setTimeout(() => setError(null), LOCKOUT_MS);
    } else setError(`Wrong PIN · ${MAX_TRIES - n} tries left`);
  };
  return { pin, setPin, submit, error, disabled: busy || blocked };
}

export function SignIn() {
  const { db, dataset, setDataset, ready, bootError } = useApp();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const staff = useLiveQuery(() => (ready ? db.practitioner.filter((p) => p.active).toArray() : []), [db, ready], []);
  const [selected, setSelected] = useState<Practitioner | null>(null);
  const from = (location.state as { from?: string } | null)?.from;
  const pin = usePinCheck(selected, (p) => {
    signIn(p);
    navigate(from && from !== '/sign-in' ? from : p.role === 'admin' ? '/admin' : '/ward', { replace: true });
  });

  return (
    <div style={{ ['--header-h' as string]: dataset === 'practice' ? '68px' : '44px' }}>
      <ModeBanner />
      <main className="min-h-screen bg-background grid place-items-center px-space-lg" style={{ paddingTop: 'calc(var(--header-h) + 24px)', paddingBottom: 24 }}>
        <div className="w-full max-w-[920px] grid md:grid-cols-[1fr_1.2fr] gap-space-lg">
          <section className="bg-surface-container-lowest rounded-xl border border-card-border p-space-xl flex flex-col gap-space-lg">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded bg-primary-container text-on-primary grid place-items-center"><Icon name="emergency_home" /></div>
              <div>
                <span className="block font-headline-md text-headline-md text-primary">ClinBridge</span>
                <span className="block font-body-sm text-body-sm text-secondary">Charting when the hospital system is down</span>
              </div>
            </div>
            <div className="flex flex-col gap-space-sm">
              <span className="font-label-uppercase text-label-uppercase text-slate-muted">WHICH RECORDS</span>
              <div className="grid grid-cols-2 gap-space-sm" role="radiogroup" aria-label="Which records">
                {(['practice', 'live'] as const).map((d) => (
                  <button key={d} role="radio" aria-checked={dataset === d} onClick={() => { setSelected(null); setDataset(d); }}
                    className={`min-h-14 rounded-lg border px-3 text-left ${dataset === d ? 'border-primary bg-surface-container-low' : 'border-card-border bg-surface-container-lowest'}`}>
                    <span className="block font-headline-sm text-headline-sm text-primary">{d === 'practice' ? 'Practice' : 'Real records'}</span>
                    <span className="block font-body-sm text-body-sm text-secondary">{d === 'practice' ? 'Fake patients for training' : 'This ward’s patient list'}</span>
                  </button>
                ))}
              </div>
            </div>
            {dataset === 'practice' && (
              <p className="flex items-start gap-2 rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-sm font-body-md text-body-md text-[#5c400c]">
                <Icon name="info" className="text-[18px]" />Practice PIN for every person: {PRACTICE_PIN}
              </p>
            )}
            {bootError && <p role="alert" className="text-error font-semibold">Could not open the records: {bootError}</p>}
          </section>

          <section className="bg-surface-container-lowest rounded-xl border border-card-border p-space-xl flex flex-col gap-space-lg" aria-labelledby="signin-title">
            <h1 id="signin-title" className="font-headline-lg text-headline-lg text-primary">{selected ? 'Enter your PIN' : 'Who are you?'}</h1>
            {!ready ? (
              <p role="status" className="text-secondary">Opening records on this laptop…</p>
            ) : staff.length === 0 ? (
              <div className="flex flex-col gap-space-sm">
                <p className="font-body-lg text-body-lg">This laptop is not set up for real records yet.</p>
                <p className="text-secondary">An admin must run first-time setup and import the patient list.</p>
                <Button variant="secondary" onClick={() => navigate('/setup')}>Open first-time setup</Button>
              </div>
            ) : selected ? (
              <>
                <div className="flex items-center gap-space-sm">
                  <span className="w-10 h-10 rounded-full bg-secondary-fixed text-on-secondary-fixed grid place-items-center font-bold">{selected.initials}</span>
                  <span className="font-headline-sm text-headline-sm text-primary">{selected.name}</span>
                  <Button variant="ghost" onClick={() => { setSelected(null); pin.setPin(''); }}>Not you?</Button>
                </div>
                <PinPad value={pin.pin} onChange={pin.setPin} onSubmit={pin.submit} disabled={pin.disabled} error={pin.error} />
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-sm">
                  {staff.map((s) => (
                    <button key={s.id} onClick={() => setSelected(s)} disabled={isPendingActivation(s)} className="min-h-16 flex items-center gap-2 rounded-lg border border-card-border bg-surface-container-lowest hover:bg-surface-container-low px-3 text-left disabled:opacity-60 disabled:cursor-not-allowed">
                      <span className="w-9 h-9 rounded-full bg-secondary-fixed text-on-secondary-fixed grid place-items-center font-bold shrink-0">{s.initials}</span>
                      <span className="leading-tight">
                        <span className="block font-body-lg text-body-lg text-primary">{s.name}</span>
                        <span className="block font-body-sm text-body-sm text-secondary">{s.role === 'admin' ? 'Admin' : s.role}{isPendingActivation(s) ? ' · Needs activation by an admin' : ''}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="font-body-sm text-body-sm text-secondary">Forgot your PIN? Ask an admin.</p>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export function LockScreen() {
  const { dataset } = useApp();
  const { user, unlock, signOut } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const back = (location.state as { from?: string } | null)?.from ?? (user?.role === 'admin' ? '/admin' : '/ward');
  const pin = usePinCheck(user, () => { unlock(); navigate(back, { replace: true }); });
  if (!user) {
    return (
      <main className="min-h-screen grid place-items-center">
        <Button onClick={() => navigate('/sign-in')}>Sign in</Button>
      </main>
    );
  }
  return (
    <div style={{ ['--header-h' as string]: dataset === 'practice' ? '68px' : '44px' }}>
      <ModeBanner />
      <main className="min-h-screen bg-background grid place-items-center px-space-lg" style={{ paddingTop: 'var(--header-h)' }}>
        <section className="bg-surface-container-lowest rounded-xl border border-card-border p-space-xl flex flex-col gap-space-lg items-center w-full max-w-sm" aria-labelledby="lock-title">
          <Icon name="lock" className="text-[32px] text-primary" />
          <h1 id="lock-title" className="font-headline-lg text-headline-lg text-primary">Screen locked</h1>
          <p className="text-secondary">{user.name} · enter your PIN</p>
          <PinPad value={pin.pin} onChange={pin.setPin} onSubmit={pin.submit} disabled={pin.disabled} error={pin.error} />
          <Button variant="ghost" onClick={() => { signOut(); navigate('/sign-in'); }}>Switch user</Button>
        </section>
      </main>
    </div>
  );
}
