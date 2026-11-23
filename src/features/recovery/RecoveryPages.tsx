import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isAdmin, useApp, useSession } from '../../state/app';
import { verifyChain } from '../../db/audit';
import { prepareExport, recordExport } from '../../db/repos/export';
import type { EntryType } from '../../db/schema';
import { dateTimeLabel, hm, sinceText } from '../../lib/time';
import { Badge, Button, ButtonLink, Icon, PageTitle } from '../../components/ui';
import { TYPE_ICON, TYPE_LABEL } from '../entries/entryView';
import { Block, Facts, Head, Tile } from '../admin/adminUi';
import { RecoveryClosed } from './RecoveryWorklist';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

const KINDS: EntryType[] = ['med_admin', 'vital_sign', 'intake_output', 'lab_event', 'note'];

/** Export (Stitch "FHIR data sync, backup, recovery"). Makes a file. There is no connection to a hospital system, so nothing is sent or synced. */
export function ExportPage() {
  const { db, clock, deviceId, phase, event } = useApp();
  const { user } = useSession();
  const [state, setState] = useState<Awaited<ReturnType<typeof prepareExport>> | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const data = useLiveQuery(async () => {
    const [entries, work, log, staff] = await Promise.all([db.entry.toArray(), db.worklist_item.toArray(), db.audit_log.orderBy('seq').toArray(), db.practitioner.toArray()]);
    return { entries, work, log, names: new Map(staff.map((p) => [p.id, p])), chain: await verifyChain(log) };
  }, [db]);
  if (phase !== 'online') return <><PageTitle>Export</PageTitle><RecoveryClosed /></>;
  async function download() {
    if (!state) return;
    setError(null);
    try {
      const h = await recordExport(db, clock, { userId: user!.id, deviceId }, state.json);
      setHash(h);
      const url = URL.createObjectURL(new Blob([state.json], { type: 'application/fhir+json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `SENSITIVE-clinbridge-fhir-${clock.nowIso().slice(0, 16).replace(/[:T]/g, '-')}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(msg(e)); }
  }
  if (!data) return <><PageTitle>Export (FHIR R4)</PageTitle><p role="status">Loading…</p></>;
  const { entries, work, log, names, chain } = data;
  const now = clock.nowIso();
  const inFile = entries.filter((e) => e.status !== 'draft');
  const signed = work.filter((w) => w.signed_off_at);
  const made = log.filter((r) => r.action === 'fhir_export');
  const backups = log.filter((r) => r.action === 'backup_created');
  const last = (l: typeof log) => l[l.length - 1];
  const signers = [...new Set(signed.map((w) => w.signed_off_by!))].map((id) => ({ id, n: signed.filter((w) => w.signed_off_by === id).length, at: signed.filter((w) => w.signed_off_by === id).map((w) => w.signed_off_at!).sort().pop()! })).sort((a, b) => b.n - a.n);
  const types = state ? Object.entries((state.bundle.entry as { resource: { resourceType: string } }[]).reduce<Record<string, number>>((m, e) => ({ ...m, [e.resource.resourceType]: (m[e.resource.resourceType] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]) : [];
  return (
    <>
      <PageTitle>Export (FHIR R4)</PageTitle>
      <Head label="Export" title="One file for the EHR team"
        badges={<><Badge tone="green" icon="cloud_done">Network cleared {event?.network_cleared_at ? hm(event.network_cleared_at) : ''}</Badge>{event && <Badge>{event.id}</Badge>}{event && <Badge icon="timer">Open {sinceText(event.declared_at, now)}</Badge>}</>}
        text={<>Makes one FHIR R4 file (a Bundle) of the downtime records for the hospital EHR team. <strong>It does not send anything to the EHR.</strong> Drafts and AI proposals are never included.</>}
        actions={<><ButtonLink variant="secondary" to="/recovery"><Icon name="checklist" />Recovery worklist</ButtonLink></>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        <Tile label="Signed off" icon="fact_check" value={signed.length} unit={`of ${work.length} worklist items`} foot={work.length - signed.length ? `${work.length - signed.length} still open` : 'Worklist finished'} bar={work.length ? signed.length / work.length : null} tone={work.length - signed.length ? 'amber' : undefined} />
        <Tile label="Records for the file" icon="inventory_2" value={inFile.length} unit="records" foot={`${entries.length - inFile.length} drafts left out`} />
        <Tile label="Change log" icon="verified_user" value={chain.ok ? 0 : 1} unit="broken links" foot={`${chain.verified} of ${chain.total} rows verified`} tone={chain.ok ? undefined : 'red'} />
        <Tile label="Files made" icon="download" value={made.length} unit={made.length === 1 ? 'file' : 'files'} foot={made.length ? `Newest ${dateTimeLabel(last(made)!.time)}, by ${names.get(last(made)!.user_id)?.name ?? last(made)!.user_id}` : 'None yet'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-space-md items-start">
        <div className="min-w-0 flex flex-col gap-space-md">
          <Block title="What goes into the file" icon="account_tree" badge={<Badge>{inFile.length} records</Badge>}>
            <ul aria-label="Kinds of records" className="flex flex-col">
              {KINDS.map((k) => {
                const of = inFile.filter((e) => e.type === k);
                const fixed = of.filter((e) => e.status === 'corrected').length, err = of.filter((e) => e.status === 'entered-in-error').length, drafts = entries.filter((e) => e.type === k && e.status === 'draft').length;
                return <li key={k} className="grid grid-cols-[2rem_minmax(0,1fr)_3rem] sm:grid-cols-[2rem_minmax(0,1fr)_3rem_minmax(0,1.6fr)] gap-x-space-sm items-center py-space-sm border-b border-card-border last:border-0 font-body-md text-body-md"><Icon name={TYPE_ICON[k]} className="text-primary" /><strong className="text-primary">{TYPE_LABEL[k]}</strong><span className="font-code-tabular font-bold text-right">{of.length}</span><span className="col-start-2 col-span-2 sm:col-start-auto sm:col-span-1 text-body-sm text-on-surface-variant">{[fixed && `${fixed} older version${fixed === 1 ? '' : 's'}, marked corrected`, err && `${err} marked as a mistake`, drafts && `${drafts} draft${drafts === 1 ? '' : 's'} left out`].filter(Boolean).join(' · ') || 'All confirmed'}</span></li>;
              })}
            </ul>
            <p className="font-body-sm text-body-sm text-secondary">The patient list, orders, allergies and staff names that the records point to are in the file too.</p>
          </Block>

          <Block title="Make the file" icon="build" badge={<Badge tone={state ? (state.errors.length ? 'red' : 'green') : 'neutral'}>{state ? (state.errors.length ? 'Problems found' : 'Prepared') : 'Not prepared'}</Badge>}>
            <Button className="self-start" onClick={async () => { setError(null); setHash(null); try { setState(await prepareExport(db, clock)); } catch (e) { setError(msg(e)); } }}><Icon name="build" />Prepare export file</Button>
            {state && (
              <>
                <ul className="rounded-lg bg-surface-container-low p-space-sm pl-7 font-body-md list-disc" data-testid="export-summary">
                  <li>{state.resourceCount} resources in the file</li>
                  <li>{state.errors.length === 0 ? 'Structure check passed' : `${state.errors.length} structure problems`}</li>
                  <li>{state.drafts} drafts not included{state.drafts ? ' (confirm them first if they belong in the record)' : ''}</li>
                  <li>{state.openItems} worklist items not signed off</li>
                </ul>
                <dl aria-label="Resources in the file" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-2">{types.map(([t, n]) => <div key={t} className="rounded-lg bg-surface-container-low p-space-sm flex items-center justify-between gap-2"><dt className="min-w-0 font-body-sm text-body-sm [overflow-wrap:anywhere]">{t}</dt><dd className="font-code-tabular font-bold text-primary">{n}</dd></div>)}</dl>
                <p className="font-body-sm text-body-sm text-secondary">HL7 FHIR 4.0.1 · {(new Blob([state.json]).size / 1e6).toFixed(2)} MB of JSON. The check here is of the structure only; the EHR team decides whether the hospital system takes it.</p>
                {state.errors.length > 0 && <pre className="bg-clinical-red-bg p-space-sm rounded text-body-sm overflow-auto max-h-60">{state.errors.slice(0, 30).join('\n')}</pre>}
                {state.openItems > 0 && <p className="text-[#7a5410] font-body-md flex items-center gap-2"><Icon name="warning" />Some items are not signed off yet. You can still make a file, but the export should normally wait.</p>}
                <div role="note" className="rounded-lg border-2 border-clinical-red-border bg-clinical-red-bg p-space-md flex flex-col gap-space-sm">
                  <p className="font-semibold text-clinical-red flex items-center gap-2"><Icon name="warning" />Sensitive: this file is NOT encrypted</p>
                  <p className="font-body-md">It holds patient names, medicines and notes in plain text, because the EHR team&apos;s system must read it. The browser saves it in its downloads folder; ClinBridge cannot protect that folder. Hand it only to the authorised EHR team, by a route your hospital approves, then delete the local copy.</p>
                  <label className="flex items-start gap-2 font-body-md"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-label="I understand this file is sensitive and not encrypted" className="mt-1 w-5 h-5" />I understand this file is sensitive and not encrypted.</label>
                </div>
                <Button className="w-full" disabled={state.errors.length > 0 || !ack} onClick={download}><Icon name="download" />Download file</Button>
              </>
            )}
            {hash && <p role="status" className="text-sync-green font-body-md">File saved. Fingerprint (SHA-256) recorded in the change log: <span className="font-code-tabular break-all">{hash}</span></p>}
            {error && <p role="alert" className="text-error">{error}</p>}
          </Block>
        </div>

        <div className="min-w-0 flex flex-col gap-space-md">
          <Block title="Encrypted backup" icon="lock" badge={<Badge>{backups.length} made</Badge>} text="A copy of every record and photo for this unit, encrypted with its own passphrase. It is not the EHR file.">
            <Facts rows={[['Newest', backups.length ? dateTimeLabel(last(backups)!.time) : 'None yet'], ['By', backups.length ? names.get(last(backups)!.user_id)?.name ?? last(backups)!.user_id : '—'], ['Encryption', 'AES-256-GCM']]} />
            {isAdmin(user) ? <ButtonLink variant="secondary" to="/admin/backup"><Icon name="download" />Open backup</ButtonLink> : <p className="font-body-sm text-body-sm text-secondary">An admin makes the backup.</p>}
          </Block>
          <Block title="Who signed off" icon="task_alt" text="People who checked worklist items with their own sign-in.">
            <ul aria-label="Who signed off" className="flex flex-col gap-2">
              {signers.map((x) => <li key={x.id} className="rounded-lg bg-surface-container-low p-space-sm flex items-center gap-space-sm"><span aria-hidden className="w-9 h-9 rounded-full bg-primary-container text-on-primary grid place-items-center font-bold shrink-0">{names.get(x.id)?.initials ?? '?'}</span><span className="min-w-0 flex-1"><span className="block font-body-md text-body-md font-semibold text-primary [overflow-wrap:anywhere]">{names.get(x.id)?.name ?? x.id}</span><span className="block font-body-sm text-body-sm text-on-surface-variant">newest {dateTimeLabel(x.at)}</span></span><span className="font-code-tabular font-bold text-primary">{x.n}</span></li>)}
              {signers.length === 0 && <li className="text-secondary">Nobody yet.</li>}
            </ul>
          </Block>
          <div role="note" className="rounded-xl bg-surface-container p-space-md font-body-md text-body-md text-on-surface-variant flex items-start gap-2"><Icon name="info" className="shrink-0" />ClinBridge has no connection to a hospital system and does not know when the EHR team has loaded the file. The records stay on this laptop.</div>
        </div>
      </div>
    </>
  );
}
