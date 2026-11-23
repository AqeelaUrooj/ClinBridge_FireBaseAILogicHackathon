import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useSession } from '../../state/app';
import { createEncryptedBackup } from '../../db/encryptedBackup';
import { photoDb } from '../../db/photos';
import { SECURITY_POLICY } from '../../config/securityPolicy';
import { dateTimeLabel, hm, sinceText } from '../../lib/time';
import { Badge, Button, ButtonLink, Icon } from '../../components/ui';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';
import { PassphraseHelp } from '../auth/UnlockVault';
import { CleanupCard } from './CleanupUi';
import { Block, Counts, Err, Facts, Head, Tile, msg } from './adminUi';

/** Backup (Stitch "FHIR data sync, backup, recovery", backup part). Encrypted file, P-04 decision B1. */
export function BackupPage() {
  const { db, clock, deviceId, dataset, phase } = useApp();
  const { user } = useSession();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = useLiveQuery(async () => {
    const [entries, patients, staff, log] = await Promise.all([db.entry.toArray(), db.patient.count(), db.practitioner.toArray(), db.audit_log.toArray()]);
    return { entries, patients, staff, backups: log.filter((r) => r.action === 'backup_created'), restored: log.filter((r) => r.action === 'backup_restored'), rows: log.length, newest: entries.reduce<string | null>((m, e) => (!m || e.entry_time > m ? e.entry_time : m), null) };
  }, [db]);
  const photos = useLiveQuery(() => photoDb(db).photos.count(), [db, done]);
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
  if (!data) return <p role="status">Loading…</p>;
  const now = clock.nowIso();
  const last = data.backups[data.backups.length - 1];
  const since = last ? data.entries.filter((e) => e.entry_time > last.time).length : data.entries.length;
  const name = (id: string) => data.staff.find((p) => p.id === id)?.name ?? id;
  return (
    <div className="flex flex-col gap-space-md">
      <Head label="Backup" title="Backup"
        badges={<><Badge tone={last ? 'green' : 'amber'} icon={last ? 'backup' : 'warning'}>{last ? `Newest backup ${sinceText(last.time, now)} ago` : 'No backup in the change log'}</Badge><Badge icon="lock">AES-256-GCM</Badge></>}
        text="Records are kept in this browser only. If the browser data is cleared or the laptop is lost, only a backup can bring them back."
        actions={<><ButtonLink variant="secondary" to="/admin/audit"><Icon name="receipt_long" />Backups in the change log</ButtonLink>{phase === 'online' && <ButtonLink variant="secondary" to="/export"><Icon name="account_tree" />FHIR file for the EHR team</ButtonLink>}</>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        <Tile label="Newest backup" icon="backup" value={last ? hm(last.time) : '—'} unit={last ? dateTimeLabel(last.time).split(', ')[1] : 'none yet'} foot={last ? `By ${name(last.user_id)}` : 'Make one below'} />
        <Tile label="Not in a backup" icon="pending_actions" value={since} unit="records" foot={last ? 'Saved after the newest backup' : 'No backup was made here'} tone={since ? 'amber' : undefined} />
        <Tile label="Photos" icon="photo_camera" value={photos ?? '—'} unit="on this laptop" foot="Paper photos go into the backup too" />
        <Tile label="Change log" icon="receipt_long" value={data.rows} unit="rows" foot="In the backup, so it can be checked after a restore" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-space-md items-start">
        <Block title="Encrypted backup file" icon="lock" badge={<Badge>{SECURITY_POLICY.approved ? 'Approved settings' : 'Prototype settings'}</Badge>}>
          <p className="font-body-md text-body-md text-on-surface-variant">Makes one file with every record and photo on this laptop, encrypted (AES-256-GCM) with a <strong>backup passphrase</strong> that you choose now. It must be different from the unit passphrase. The laptop&apos;s keys are never in the file.</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">The browser saves the file where its downloads go. ClinBridge cannot see or protect that folder: move the file to storage your hospital approves, and keep the backup passphrase apart from the file. To restore, use first-time setup on an empty laptop (Real records).</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-space-md">
            <label className="flex flex-col gap-1"><span className={labelCls}>Backup passphrase</span>
              <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} className={fieldCls()} aria-label="Backup passphrase" autoComplete="new-password" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Backup passphrase again</span>
              <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} className={fieldCls()} aria-label="Backup passphrase again" autoComplete="new-password" /></label>
          </div>
          <PassphraseHelp />
          <Button className="w-full sm:w-auto sm:self-start" disabled={busy || !p1} onClick={() => void make()}><Icon name="download" />{busy ? 'Encrypting…' : 'Make encrypted backup'}</Button>
          {done && <p role="status" className="text-sync-green">Backup file made. Fingerprint recorded in the change log: <span className="font-code-tabular break-all">{done}</span></p>}
          <Err e={error} />
        </Block>
        <div className="min-w-0 flex flex-col gap-space-md">
          <Block title="What is in the file" icon="inventory_2">
            <Counts items={[['Records', data.entries.length], ['Patients', data.patients], ['Staff', data.staff.length], ['Photos', photos ?? '—']]} />
            <Facts rows={[['Newest record', data.newest ? dateTimeLabel(data.newest) : 'None'], ['Passphrase to key', `PBKDF2, ${SECURITY_POLICY.pbkdf2Iterations.toLocaleString('en-US')} rounds`], ["This laptop's keys", 'Not in the file'], ['Restored here', data.restored.length ? dateTimeLabel(data.restored[data.restored.length - 1]!.time) : 'Never']]} />
          </Block>
          <Block title="Backups made here" icon="history">
            <ul aria-label="Backups made" className="flex flex-col gap-2">
              {data.backups.slice(-5).reverse().map((b) => <li key={b.id} className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md flex flex-wrap justify-between gap-2"><span className="font-code-tabular">{dateTimeLabel(b.time)}</span><span className="text-on-surface-variant">{name(b.user_id)}</span></li>)}
              {data.backups.length === 0 && <li className="font-body-md text-body-md text-secondary">None yet.</li>}
            </ul>
            <p className="font-body-sm text-body-sm text-secondary">ClinBridge knows that a file was made, not where it is now.</p>
          </Block>
        </div>
      </div>
      <CleanupCard />
    </div>
  );
}
