import { PUBLIC_DEMO } from '../../config/publicDemo';
import { useState } from 'react';
import { useApp } from '../../state/app';
import { Button, Icon } from '../../components/ui';
import { ModeBanner } from '../../components/AppShell';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';
import { checkPassphrase, WrongSecretError } from '../../lib/vaultCrypto';
import { PUBLIC_PRACTICE_PASSPHRASE, PUBLIC_PRACTICE_RECOVERY_CODE } from '../../config/securityPolicy';

/**
 * Unlock screen for encrypted records (P-04). Shown after every refresh, browser restart, "Lock records" or
 * the vault idle lock. The unit passphrase is held only in this form's state and dropped after the attempt.
 */

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PassphraseHelp() {
  return (
    <ul className="list-disc pl-5 font-body-sm text-body-sm text-secondary">
      <li>Use 4 or more random words, e.g. three unrelated nouns and a number.</li>
      <li>Do not write it on the laptop or a sticky note near it.</li>
      <li>It is shared by the unit, so change it when someone leaves (Admin, with the current passphrase or the recovery key).</li>
      <li>Hospital IT policy has the final say on passphrase rules.</li>
    </ul>
  );
}

/** Shows a recovery code once and asks for its last group back, proving it was written down. */
export function RecoveryCodeConfirm({ code, onConfirmed, confirmLabel = 'I have written it down' }: { code: string; onConfirmed: () => void; confirmLabel?: string }) {
  const [typed, setTyped] = useState('');
  const last = code.split('-').at(-1) ?? '';
  const ok = typed.trim().toUpperCase() === last;
  return (
    <div className="flex flex-col gap-space-md">
      <div role="note" className="rounded-lg border-2 border-clinical-red-border bg-clinical-red-bg p-space-md">
        <p className="font-semibold text-clinical-red">Recovery key: shown only now</p>
        <p data-testid="recovery-code" className="mt-2 font-mono text-[22px] tracking-wider break-all select-all">{code}</p>
        <p className="mt-2 text-body-sm">Write it on paper and give it to the person your hospital names (for example the unit manager or IT). Keep it away from the laptop. Without it and without the passphrase, the records on this laptop cannot be read. ClinBridge does not keep a copy.</p>
      </div>
      <label className="flex flex-col gap-1 max-w-xs">
        <span className={labelCls}>Type the last group to confirm</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} className={fieldCls()} aria-label="Last group of the recovery key" autoComplete="off" />
      </label>
      <Button className="self-start" disabled={!ok} onClick={onConfirmed}>{confirmLabel}</Button>
    </div>
  );
}

export function UnlockVault() {
  const { dataset, setDataset, unlock, recover, finishRecovery } = useApp();
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [pass, setPass] = useState('');
  const [code, setCode] = useState('');
  const [next1, setNext1] = useState('');
  const [next2, setNext2] = useState('');
  const [newCode, setNewCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const practice = dataset === 'practice';

  const tryUnlock = async (p: string) => {
    setBusy(true);
    setError(null);
    try {
      await unlock({ passphrase: p });
    } catch (e) {
      setError(e instanceof WrongSecretError ? 'That passphrase is not right. Check capitals and spaces.' : msg(e));
    } finally {
      setPass('');
      setBusy(false);
    }
  };

  const tryRecover = async () => {
    setError(null);
    if (next1 !== next2) return setError('The two new passphrases are not the same.');
    if (!practice) {
      const s = checkPassphrase(next1);
      if (!s.ok) return setError(s.problems.join(' '));
    }
    setBusy(true);
    try {
      const c = await recover(code, practice ? PUBLIC_PRACTICE_PASSPHRASE : next1);
      if (practice) finishRecovery();
      else setNewCode(c);
    } catch (e) {
      setError(e instanceof WrongSecretError ? 'That recovery key is not right. Check the written copy.' : msg(e));
    } finally {
      setCode('');
      setNext1('');
      setNext2('');
      setBusy(false);
    }
  };

  return (
    <div style={{ ['--header-h' as string]: practice ? '68px' : '44px' }}>
      <ModeBanner />
      <main className="min-h-screen bg-background grid place-items-center px-space-lg" style={{ paddingTop: 'calc(var(--header-h) + 24px)', paddingBottom: 24 }}>
        <section className="w-full max-w-[560px] bg-surface-container-lowest rounded-xl border border-card-border p-space-xl flex flex-col gap-space-lg" aria-labelledby="unlock-title">
          <div className="flex items-center gap-2">
            <Icon name="lock" className="text-primary" />
            <h1 id="unlock-title" className="font-headline-lg text-headline-lg text-primary">Unlock records on this laptop</h1>
          </div>
          {!PUBLIC_DEMO && <div className="grid grid-cols-2 gap-space-sm" role="radiogroup" aria-label="Which records">
            {(['practice', 'live'] as const).map((d) => (
              <button key={d} role="radio" aria-checked={dataset === d} onClick={() => { setError(null); setDataset(d); }}
                className={`min-h-12 rounded-lg border px-3 text-left ${dataset === d ? 'border-primary bg-surface-container-low' : 'border-card-border bg-surface-container-lowest'}`}>
                <span className="block font-headline-sm text-headline-sm text-primary">{d === 'practice' ? 'Practice' : 'Real records'}</span>
              </button>
            ))}
          </div>}

          {newCode ? (
            <RecoveryCodeConfirm code={newCode} onConfirmed={() => { setNewCode(null); finishRecovery(); }} confirmLabel="Done, open the records" />
          ) : mode === 'passphrase' ? (
            <form className="flex flex-col gap-space-md" onSubmit={(e) => { e.preventDefault(); void tryUnlock(pass); }}>
              <p className="text-on-surface-variant">The records are encrypted. Type the unit passphrase once; after that each person signs in with their own PIN.</p>
              {practice && (
                <div className="rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-sm text-[#5c400c]">
                  <p className="flex items-start gap-2"><Icon name="info" className="text-[18px]" />Practice passphrase (public, fake data only, gives no secrecy): <strong>{PUBLIC_PRACTICE_PASSPHRASE}</strong></p>
                  <Button type="button" variant="secondary" className="mt-2" disabled={busy} onClick={() => void tryUnlock(PUBLIC_PRACTICE_PASSPHRASE)}>Use practice passphrase</Button>
                </div>
              )}
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Unit passphrase</span>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className={fieldCls(error ?? undefined)} aria-label="Unit passphrase" autoComplete="off" autoFocus />
              </label>
              <Button type="submit" disabled={busy || !pass}>{busy ? 'Unlocking…' : 'Unlock'}</Button>
              {error && <p role="alert" className="text-error font-semibold">{error}</p>}
              <Button type="button" variant="ghost" className="self-start" onClick={() => { setError(null); setMode('recovery'); }}>Forgot the passphrase? Use the recovery key</Button>
              <p className="font-body-sm text-body-sm text-secondary">Can’t unlock? Use the paper downtime forms and tell the charge nurse or IT.</p>
            </form>
          ) : (
            <form className="flex flex-col gap-space-md" onSubmit={(e) => { e.preventDefault(); void tryRecover(); }}>
              <p className="text-on-surface-variant">Type the written recovery key and choose a new unit passphrase. You will get a <strong>new</strong> recovery key; the old one stops working.</p>
              {practice && <p className="text-body-sm text-secondary">Practice recovery key (public): {PUBLIC_PRACTICE_RECOVERY_CODE}. Practice keeps its published passphrase.</p>}
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Recovery key</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} className={fieldCls()} aria-label="Recovery key" autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" />
              </label>
              {!practice && (
                <>
                  <label className="flex flex-col gap-1"><span className={labelCls}>New unit passphrase</span>
                    <input type="password" value={next1} onChange={(e) => setNext1(e.target.value)} className={fieldCls()} aria-label="New unit passphrase" autoComplete="new-password" /></label>
                  <label className="flex flex-col gap-1"><span className={labelCls}>New unit passphrase again</span>
                    <input type="password" value={next2} onChange={(e) => setNext2(e.target.value)} className={fieldCls()} aria-label="New unit passphrase again" autoComplete="new-password" /></label>
                  <PassphraseHelp />
                </>
              )}
              <Button type="submit" disabled={busy || !code}>{busy ? 'Checking…' : 'Recover and unlock'}</Button>
              {error && <p role="alert" className="text-error font-semibold">{error}</p>}
              <Button type="button" variant="ghost" className="self-start" onClick={() => { setError(null); setMode('passphrase'); }}>Back to passphrase</Button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
