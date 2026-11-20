import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useSession } from '../../state/app';
import { Button, Card, Icon } from '../../components/ui';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';
import { CLEANUP_CONFIRM_TEXT, ERASURE_WARNING, executeCleanup, plainSafetyCopies, prepareCleanup, type CleanupPreparation } from '../../db/plainCleanup';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Admin → Backup: remove plain safety copies (P-04 stage 10). Practice only; Real records need separate approval. */
export function CleanupCard() {
  const { db, clock, deviceId, dataset } = useApp();
  const { user } = useSession();
  const copies = useLiveQuery(() => plainSafetyCopies(db), [db]);
  const [pass, setPass] = useState('');
  const [prep, setPrep] = useState<CleanupPreparation | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actor = { userId: user!.id, deviceId };
  const real = dataset === 'live';

  const run = async () => {
    setBusy(true); setError(null); setPrep(null); setDone(null);
    try {
      const p = await prepareCleanup(db, { clock, actor, backupPassphrase: pass });
      setPrep(p);
      if (p.backupFile) {
        const url = URL.createObjectURL(new Blob([p.backupFile], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = `clinbridge-${dataset}-backup-before-cleanup-${clock.nowIso().slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) { setError(msg(e)); } finally { setPass(''); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError(null);
    try { const r = await executeCleanup(db, prep!.token!, confirm, { clock, actor }); setDone(r.removed); setPrep(null); } catch (e) { setError(msg(e)); } finally { setConfirm(''); setBusy(false); }
  };

  return (
    <Card className="flex flex-col gap-space-md">
      <h2 className="font-headline-sm text-headline-sm text-primary">Remove plain safety copies</h2>
      <p className="text-on-surface-variant">{copies === undefined ? 'Checking…' : copies.length === 0 ? 'There are no unencrypted safety copies of these records on this laptop.' : `${copies.length} unencrypted safety ${copies.length === 1 ? 'copy' : 'copies'} of these records on this laptop.`}</p>
      {real && <p className="font-semibold text-[#7a5410]"><Icon name="gpp_maybe" /> Real records: the checks can run, but removing the copies is an irreversible step that needs separate approval. The Remove button stays off.</p>}
      <p className="font-body-sm text-on-surface-variant">Before anything is removed, the app checks that every record is encrypted and the change log is intact, makes a <strong>fresh encrypted backup</strong> (saved by your browser), opens it, restores it into a temporary database to prove it works, and checks everything again.</p>
      <div className="flex flex-wrap items-end gap-space-sm">
        <label className="flex flex-col gap-1"><span className={labelCls}>Backup passphrase for the fresh backup</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className={`${fieldCls()} w-80`} aria-label="Backup passphrase for the fresh backup" autoComplete="new-password" /></label>
        <Button variant="secondary" disabled={busy || !pass || !copies?.length} onClick={() => void run()}><Icon name="fact_check" />{busy && !prep ? 'Checking…' : 'Run checks'}</Button>
      </div>
      {prep && (
        <div className="flex flex-col gap-space-sm">
          <ul aria-label="Cleanup checks" className="flex flex-col gap-1">
            {prep.steps.map((s) => (
              <li key={s.name} className="flex items-start gap-2"><Icon name={s.ok ? 'check_circle' : 'cancel'} className={s.ok ? 'text-sync-green' : 'text-error'} /><span><strong>{s.name}:</strong> {s.detail}</span></li>
            ))}
          </ul>
          {prep.ok && (
            <>
              <div role="note" className="rounded-lg border-2 border-clinical-red-border bg-clinical-red-bg p-space-md">
                <p className="font-semibold text-clinical-red">This cannot be undone</p>
                <p className="font-body-md">{ERASURE_WARNING}</p>
              </div>
              <label className="flex flex-col gap-1 max-w-md"><span className={labelCls}>Type {CLEANUP_CONFIRM_TEXT}</span>
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={fieldCls()} aria-label="Type the confirmation" autoComplete="off" disabled={real} /></label>
              <Button variant="danger" className="self-start" disabled={real || busy || confirm.trim() !== CLEANUP_CONFIRM_TEXT} onClick={() => void remove()}><Icon name="delete_forever" />Remove {prep.candidates.length} plain {prep.candidates.length === 1 ? 'copy' : 'copies'}</Button>
            </>
          )}
        </div>
      )}
      {done !== null && <p role="status" className="text-sync-green">Removed {done} plain {done === 1 ? 'copy' : 'copies'} from this browser&apos;s storage. Recorded in the change log.</p>}
      {error && <p role="alert" className="text-error font-semibold">{error}</p>}
    </Card>
  );
}
