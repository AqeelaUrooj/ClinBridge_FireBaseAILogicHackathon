import { InstallPractice } from '../../components/InstallPractice';
import { judgeDemo } from '../../judgeDemo';
import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Practitioner } from '../../db/schema';
import { verifyPin } from '../../lib/crypto';
import { AUTO_LOCK_MS, useApp, useSession } from '../../state/app';
import { PRACTICE_PIN } from '../../db/seed';
import { PHASE_LABEL } from '../../lib/phase';
import { dateTimeLabel, hm, sinceText } from '../../lib/time';
import { Badge, Button, Icon } from '../../components/ui';
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

const roleLabel = (r: Practitioner['role']) => (r === 'admin' ? 'Admin' : r);

/** Is there a network on this laptop? Only what the browser says; signing in never needs it. */
function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

/** Facts about this laptop for the sign-in and lock screens. Counts only: never a patient, a value or a name of a patient. */
function useLaptop() {
  const { db, ready, vault, deviceId } = useApp();
  return useLiveQuery(async () => {
    if (!ready || vault === 'locked') return null;
    try {
      const [device, patients, records] = await Promise.all([db.device.get(deviceId), db.patient.count(), db.entry.count()]);
      return { label: device?.label, unit: device?.unit, patients, records };
    } catch { return null; } // records locked while reading
  }, [db, ready, vault, deviceId]);
}

const BOX = 'rounded-lg bg-surface-container-low p-space-md';

function StatusBox() {
  const { phase, event, clock } = useApp();
  const now = clock.nowIso();
  if (phase === 'down') {
    return (
      <div role="note" aria-label="Hospital system" className="rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-md flex items-start gap-space-sm text-[#5c400c]">
        <Icon name="warning" /><div><p className="font-label-uppercase text-label-uppercase uppercase font-bold">{PHASE_LABEL[phase]}</p><p className="font-body-lg text-body-lg font-bold">{event ? `${sinceText(event.declared_at, now)} since ${hm(event.declared_at)}` : ''}</p><p className="font-body-sm text-body-sm">The hospital system is down. Records are kept on this laptop.</p></div>
      </div>
    );
  }
  return (
    <div role="note" aria-label="Hospital system" className={`${BOX} flex items-start gap-space-sm`}>
      <Icon name={phase === 'online' ? 'cloud_done' : 'check_circle'} className="text-sync-green" /><div><p className="font-label-uppercase text-label-uppercase uppercase font-bold text-primary">{PHASE_LABEL[phase]}</p><p className="font-body-md text-body-md text-on-surface-variant">{phase === 'online' && event?.network_cleared_at ? `Network cleared at ${hm(event.network_cleared_at)}. Downtime ${event.ended_at ? `ended ${hm(event.ended_at)}` : `started ${hm(event.declared_at)}, not ended yet`}.` : 'No downtime is declared on this laptop.'}</p></div>
    </div>
  );
}

const Small = ({ icon, label, value, note }: { icon: string; label: string; value: string; note: string }) => (
  <div className="min-w-0 rounded-lg bg-surface-container-low p-space-sm"><p className="flex items-center gap-1 font-label-uppercase text-label-uppercase uppercase text-secondary"><Icon name={icon} className="text-[16px]" />{label}</p><p className="font-body-md text-body-md font-bold text-primary [overflow-wrap:anywhere]">{value}</p><p className="font-body-sm text-body-sm text-on-surface-variant">{note}</p></div>
);

function Frame({ children }: { children: ReactNode }) {
  const { dataset } = useApp();
  return (
    <div style={{ ['--header-h' as string]: dataset === 'practice' ? '68px' : '44px' }}>
      <ModeBanner />
      <main className="min-h-screen bg-background px-space-md md:px-space-lg flex flex-col items-center" style={{ paddingTop: 'calc(var(--header-h) + 20px)', paddingBottom: 24 }}>{children}</main>
    </div>
  );
}

export function SignIn() {
  const { db, dataset, setDataset, ready, bootError, snapshot, clock, vault } = useApp();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnline();
  const laptop = useLaptop();
  const staff = useLiveQuery(() => (ready ? db.practitioner.filter((p) => p.active).toArray() : []), [db, ready], []);
  const [selected, setSelected] = useState<Practitioner | null>(null);
  const from = (location.state as { from?: string } | null)?.from;
  const pin = usePinCheck(selected, (p) => {
    signIn(p);
    navigate(from && from !== '/sign-in' ? from : p.role === 'admin' ? '/admin' : '/ward', { replace: true });
  });
  const choose = (p: Practitioner | null) => { setSelected(p); pin.setPin(''); };

  return (
    <Frame>
      <div className="w-full max-w-[1180px] flex flex-col gap-space-md">
        {judgeDemo && <InstallPractice />}
        <div className="rounded-lg bg-surface-container px-space-md py-2 flex flex-wrap items-center justify-between gap-2 font-body-sm text-body-sm text-on-surface-variant">
          <span className="flex flex-wrap items-center gap-2"><span className="px-2 py-1 rounded bg-primary text-on-primary font-label-badge text-label-badge flex items-center gap-1"><Icon name="laptop_windows" className="text-[16px]" />{laptop?.label ?? 'This laptop'}</span>{laptop?.unit && <span>{laptop.unit}</span>}</span>
          <Badge tone="green" icon="lock">Sign-in works with no network</Badge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-space-md items-stretch">
          <section aria-label="This laptop" className="min-w-0 bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-lg flex flex-col gap-space-md order-2 lg:order-1">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded bg-primary-container text-on-primary grid place-items-center"><Icon name="emergency_home" /></div>
              <div>
                <span className="block font-headline-md text-headline-md text-primary">ClinBridge</span>
                <span className="block font-body-sm text-body-sm text-secondary">Charting when the hospital system is down</span>
              </div>
            </div>
            {(snapshot?.unit ?? laptop?.unit) && <div className={BOX}><p className="font-body-sm text-body-sm font-semibold text-secondary">Unit on this laptop</p><p className="font-headline-md text-headline-md text-primary">{snapshot?.unit ?? laptop?.unit}</p></div>}
            <StatusBox />
            <div className={BOX}>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-label-uppercase text-label-uppercase uppercase text-secondary">Records on this laptop</p>{vault === 'unlocked' && <Badge tone="green" icon="lock">Encrypted (AES-256-GCM)</Badge>}</div>
              <p className="font-body-lg text-body-lg font-bold text-primary">{dataset === 'practice' ? 'Practice, fake patients' : 'Real records'}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{laptop ? `${laptop.patients} patients on the list` : 'No patient list yet'}{snapshot ? ` · list of ${dateTimeLabel(snapshot.taken_at)}, ${sinceText(snapshot.taken_at, clock.nowIso())} old` : ''}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Small icon={online ? 'wifi' : 'wifi_off'} label="Network" value={online ? 'Connected' : 'None'} note="Not needed here" />
              <Small icon="schedule" label="Screen lock" value={`${AUTO_LOCK_MS / 60_000} min`} note="Without use" />
              <Small icon="pin" label="Wrong PIN" value={`${MAX_TRIES} tries`} note="Then wait 1 min" />
            </div>
            {judgeDemo && <p className={BOX}>Practice demo. Use fictional patient information only.</p>}
            {!judgeDemo && <div className="flex flex-col gap-space-sm">
              <span className="font-label-uppercase text-label-uppercase text-slate-muted">WHICH RECORDS</span>
              <div className="grid grid-cols-2 gap-space-sm" role="radiogroup" aria-label="Which records">
                {(['practice', 'live'] as const).map((d) => (
                  <button key={d} role="radio" aria-checked={dataset === d} onClick={() => { choose(null); setDataset(d); }}
                    className={`min-h-14 rounded-lg border px-3 text-left ${dataset === d ? 'border-primary bg-surface-container-low' : 'border-card-border bg-surface-container-lowest'}`}>
                    <span className="block font-headline-sm text-headline-sm text-primary">{d === 'practice' ? 'Practice' : 'Real records'}</span>
                    <span className="block font-body-sm text-body-sm text-secondary">{d === 'practice' ? 'Fake patients for training' : 'This ward’s patient list'}</span>
                  </button>
                ))}
              </div>
            </div>}
            <p className={`${BOX} flex items-start gap-space-sm font-body-md text-body-md text-on-surface-variant mt-auto`}><Icon name="verified_user" />Your own PIN opens your session. What you save is kept on this laptop under your name.</p>
            {bootError && <p role="alert" className="text-error font-semibold">Could not open the records: {bootError}</p>}
          </section>

          <section className="min-w-0 bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-lg flex flex-col gap-space-md order-1 lg:order-2" aria-labelledby="signin-title">
            <div>
              <p className="font-label-uppercase text-label-uppercase uppercase text-secondary">Staff sign-in</p>
              <h1 id="signin-title" className="font-headline-lg text-headline-lg text-primary">{selected ? 'Enter your PIN' : 'Who are you?'}</h1>
            </div>
            {!ready ? (
              <p role="status" className="text-secondary">Opening records on this laptop…</p>
            ) : staff.length === 0 ? (
              judgeDemo ? <p role="alert">Practice staff are unavailable. Reload the demo to try again.</p> : <div className="flex flex-col gap-space-sm">
                <p className="font-body-lg text-body-lg">This laptop is not set up for real records yet.</p>
                <p className="text-secondary">An admin must run first-time setup and import the patient list.</p>
                <Button variant="secondary" onClick={() => navigate('/setup')}>Open first-time setup</Button>
              </div>
            ) : (
              <>
                <div className={`flex flex-wrap items-center justify-between gap-2 ${selected ? 'max-md:hidden' : ''}`}><p className="font-body-md text-body-md font-semibold text-secondary">Choose your name</p><p className="font-body-sm text-body-sm text-secondary">{staff.length} people on this laptop</p></div>
                <div className={`grid grid-cols-[repeat(auto-fill,minmax(min(100%,8.5rem),1fr))] gap-space-sm ${selected ? 'max-md:hidden' : ''}`}>
                  {staff.map((s) => (
                    <button key={s.id} type="button" aria-pressed={selected?.id === s.id} onClick={() => choose(s)} disabled={isPendingActivation(s)} className={`min-h-[92px] rounded-lg p-space-sm text-left flex flex-col gap-1 border-2 disabled:opacity-60 disabled:cursor-not-allowed ${selected?.id === s.id ? 'border-primary bg-surface-container' : 'border-transparent bg-surface-container-low hover:bg-surface-container'}`}>
                      <span className="flex items-center justify-between"><span className={`w-9 h-9 rounded-full grid place-items-center font-bold shrink-0 ${selected?.id === s.id ? 'bg-primary-container text-white' : 'bg-secondary-fixed text-on-secondary-fixed'}`}>{s.initials}</span>{selected?.id === s.id && <Icon name="check_circle" className="text-[20px] text-primary" />}</span>
                      <span className="leading-tight">
                        <span className="block font-body-md text-body-md font-semibold text-primary [overflow-wrap:anywhere]">{s.name}</span>
                        <span className="block font-body-sm text-body-sm text-secondary">{roleLabel(s.role)}{isPendingActivation(s) ? ' · Needs activation by an admin' : ''}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {selected && (
                  <div className={`${BOX} flex flex-wrap items-center gap-space-md`}>
                    <span aria-hidden className="w-14 h-14 rounded-lg bg-primary-container text-white grid place-items-center font-bold text-[20px]">{selected.initials}</span>
                    <span className="flex-1 min-w-[8rem]"><span className="block font-headline-sm text-headline-sm text-primary">{selected.name}</span><span className="block font-body-sm text-body-sm text-secondary">{roleLabel(selected.role)} · {selected.role === 'admin' ? 'can manage this laptop, cannot chart' : 'can chart'}</span></span>
                    <Button variant="ghost" onClick={() => choose(null)}>Not you?</Button>
                  </div>
                )}
                <div className="flex flex-col items-center gap-space-sm">
                  <p className="font-label-uppercase text-label-uppercase uppercase text-secondary">Your 4-digit PIN</p>
                  <PinPad wide value={pin.pin} onChange={pin.setPin} onSubmit={pin.submit} disabled={pin.disabled || !selected} error={pin.error} />
                  <p className="font-body-sm text-body-sm text-secondary text-center">{selected ? 'Tap the keys or use the keyboard. You are signed in after the fourth digit.' : 'Choose your name first. Then the keys work.'}</p>
                  {dataset === 'practice' && <p className="flex items-center gap-2 rounded-lg bg-downtime-amber-bg border border-downtime-amber-border px-space-md py-2 font-body-md text-body-md text-[#5c400c]"><Icon name="school" className="text-[18px]" />Practice PIN for every person: {PRACTICE_PIN}</p>}
                </div>
                <details className="rounded-lg bg-surface-container-low p-space-sm mt-auto">
                  <summary className="cursor-pointer min-h-8 font-body-md text-body-md text-primary flex items-center gap-2"><Icon name="help" className="text-[20px]" />Forgot your PIN? Ask an admin.</summary>
                  <p className="mt-2 font-body-md text-body-md text-on-surface-variant">An admin can give you a new PIN under Admin, Staff. Nobody can read your old PIN. ClinBridge has no emergency code that signs in without a PIN.</p>
                </details>
              </>
            )}
          </section>
        </div>
      </div>
    </Frame>
  );
}

/** Lock screen (Stitch "Terminal auto-lock"). Shows who and when, and counts. Never a patient or a value; no way around the PIN. */
export function LockScreen() {
  const { phase, event, clock, vault } = useApp();
  const { user, unlock, signOut, lockInfo } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const laptop = useLaptop();
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
    <Frame>
      <section aria-labelledby="lock-title" className="w-full max-w-[1000px] my-auto rounded-xl overflow-hidden border border-card-border shadow-lg bg-surface-container-low">
        <div className="bg-primary text-on-primary p-space-md md:px-space-lg flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md"><span className="w-10 h-10 rounded-lg bg-white/10 grid place-items-center"><Icon name="lock" /></span><div><h1 id="lock-title" className="font-headline-md text-headline-md">Screen locked</h1><p className="font-body-sm text-body-sm opacity-80">{lockInfo?.reason === 'idle' ? 'Locked because nobody used it' : 'Locked by the person signed in'}{laptop?.label ? ` · ${laptop.label}` : ''}</p></div></div>
          <span className="px-space-md py-2 rounded-lg bg-white/10 font-label-badge text-label-badge font-bold flex items-center gap-2"><span aria-hidden className={`w-2.5 h-2.5 rounded-full ${phase === 'down' ? 'bg-downtime-amber' : 'bg-tertiary-fixed'}`} />{PHASE_LABEL[phase].toUpperCase()}{phase === 'down' && event ? ` · ${sinceText(event.declared_at, clock.nowIso())}` : ''}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-space-md md:p-space-lg flex flex-col gap-space-md order-2 md:order-1">
            <div className="rounded-lg bg-surface-container-lowest border border-card-border p-space-md flex flex-col gap-space-md">
              <div className="flex items-center gap-space-md"><span aria-hidden className="w-14 h-14 rounded-xl bg-secondary-fixed text-on-secondary-fixed grid place-items-center font-bold text-[20px]">{user.initials}</span><span className="min-w-0"><span className="block font-headline-sm text-headline-sm text-primary">{user.name}</span><span className="block font-body-sm text-body-sm text-secondary">{roleLabel(user.role)}</span></span></div>
              <p className="flex flex-wrap items-center justify-between gap-2 font-body-md text-body-md text-on-surface-variant"><span className="flex items-center gap-1"><Icon name="timer" className="text-[20px]" />Locked at <strong className="font-code-tabular text-primary">{lockInfo ? hm(lockInfo.at) : '—'}</strong></span><Badge>{AUTO_LOCK_MS / 60_000} min without use locks it</Badge></p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-surface-container-lowest border border-card-border p-space-md"><p className="font-body-sm text-body-sm text-secondary">Patients on the list</p><p className="font-code-tabular text-[32px] leading-tight font-bold text-primary">{laptop?.patients ?? '—'}</p></div>
              <div className="rounded-lg bg-surface-container-lowest border border-card-border p-space-md"><p className="font-body-sm text-body-sm text-secondary">Records on this laptop</p><p className="font-code-tabular text-[32px] leading-tight font-bold text-primary">{laptop?.records ?? '—'}</p></div>
            </div>
            <p className="rounded-lg bg-surface-container-lowest border border-card-border p-space-md font-body-md text-body-md text-on-surface-variant flex items-start gap-2"><Icon name="visibility_off" />No patient is shown while the screen is locked. The patient check starts again after you unlock.</p>
            {vault === 'unlocked' && <p className="flex items-center gap-2 font-body-md text-body-md text-on-surface-variant mt-auto"><Icon name="verified_user" className="text-[20px]" />Records are encrypted on this laptop (AES-256-GCM)</p>}
          </div>
          <div className="bg-surface-container-lowest p-space-md md:p-space-lg flex flex-col items-center gap-space-md order-1 md:order-2">
            <div className="text-center"><h2 className="font-headline-md text-headline-md text-primary">Unlock</h2><p className="font-body-md text-body-md text-secondary">{user.name} · enter your PIN</p></div>
            <PinPad wide value={pin.pin} onChange={pin.setPin} onSubmit={pin.submit} disabled={pin.disabled} error={pin.error} />
            <Button variant="secondary" className="w-full max-w-[400px]" onClick={() => { signOut(); navigate('/sign-in'); }}><Icon name="switch_account" />Switch user</Button>
            <p className="font-body-sm text-body-sm text-secondary text-center">There is no way around the PIN. Typing that was not saved before the lock is not kept.</p>
          </div>
        </div>
      </section>
    </Frame>
  );
}
