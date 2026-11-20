import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp, useSession } from '../../state/app';
import { buildWorklist, signOffItem } from '../../db/repos/worklist';
import { getEntry, listPatientEntries, versionChain } from '../../db/repos/entries';
import { prepareExport, recordExport } from '../../db/repos/export';
import type { VitalSign, WorklistFlag } from '../../db/schema';
import { FLAG_TEXT, flagEntry } from '../../lib/recovery';
import { dateTimeLabel } from '../../lib/time';
import { Badge, Breadcrumbs, Button, ButtonLink, Card, EmptyState, Icon, PageTitle } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { SecondLookCard } from '../ai/AiPages';
import { EntryRow, StatusBadge, entrySummary } from '../entries/entryView';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const FLAG_TONE: Record<WorklistFlag, 'red' | 'amber' | 'blue' | 'neutral'> = { duplicate: 'red', time_conflict: 'amber', missing_field: 'amber', recheck: 'red', not_recorded: 'neutral' };

function NotYet() {
  return <EmptyState icon="cloud_off" text="Recovery starts after an admin clears the network (Admin → Downtime → Back online)." />;
}

export function RecoveryListPage() {
  const { db, clock, deviceId, phase } = useApp();
  const { user } = useSession();
  const [filter, setFilter] = useState<'open' | WorklistFlag | 'all'>('open');
  const [note, setNote] = useState<string | null>(null);
  const rows = useLiveQuery(async () => {
    const items = await db.worklist_item.toArray();
    const patients = new Map((await db.patient.toArray()).map((p) => [p.id, p]));
    const beds = new Map((await db.encounter.toArray()).map((e) => [e.patient_id, e.bed ?? '']));
    const entries = new Map((await db.entry.bulkGet(items.map((i) => i.entry_id))).filter(Boolean).map((e) => [e!.id, e!]));
    return items.map((i) => ({ i, p: patients.get(i.patient_id), bed: beds.get(i.patient_id), e: entries.get(i.entry_id) }))
      .sort((a, b) => Number(!!a.i.signed_off_at) - Number(!!b.i.signed_off_at) || b.i.priority - a.i.priority || a.i.id.localeCompare(b.i.id));
  }, [db]);
  if (phase !== 'online') return <><PageTitle>To check (recovery)</PageTitle><NotYet /></>;
  const done = (rows ?? []).filter((r) => r.i.signed_off_at).length;
  const total = rows?.length ?? 0;
  const shown = (rows ?? []).filter((r) => filter === 'all' || (filter === 'open' ? !r.i.signed_off_at : r.i.flags.includes(filter)));
  return (
    <>
      <PageTitle actions={<ButtonLink variant="secondary" to="/export"><Icon name="download" />Export</ButtonLink>}>To check (recovery)</PageTitle>
      <Card className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between gap-space-md flex-wrap">
          <p className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><MedIllustration name="workflows/checklist" size={28} />{done} of {total} signed off</p>
          <Button variant="secondary" onClick={async () => { setNote(null); try { const n = await buildWorklist(db, clock, { userId: user!.id, deviceId }); setNote(n ? `${n} new items added.` : 'No new records to add.'); } catch (e) { setNote(msg(e)); } }}><Icon name="playlist_add" />Add new downtime records</Button>
        </div>
        <div className="h-2 rounded-full bg-surface-container overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Signed off"><div className="h-full bg-sync-green" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        {note && <p role="status" className="font-body-sm text-on-surface-variant">{note}</p>}
        <p className="font-body-sm text-secondary">Rules only (no cloud): possible duplicates, missing fields, time conflicts. Queue order is a prototype setting, not a clinical score.</p>
      </Card>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter">
        {(['open', 'duplicate', 'missing_field', 'time_conflict', 'recheck', 'all'] as const).map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-10 px-3 rounded-lg border font-body-md ${filter === f ? 'bg-primary-container text-on-primary border-primary-container' : 'border-card-border bg-surface-container-lowest'}`}>
            {f === 'open' ? 'Not signed off' : f === 'all' ? 'All' : FLAG_TEXT[f]}
          </button>
        ))}
      </div>
      <Card>
        {shown.length === 0 ? <EmptyState text="Nothing here" /> : (
          <ul>{shown.map(({ i, p, bed, e }) => (
            <li key={i.id}>
              <Link to={`/recovery/${i.id}`} className="flex flex-wrap items-center gap-space-md min-h-[56px] border-b border-card-border last:border-0 hover:bg-surface-container-low px-space-sm rounded" data-testid={`wl-${i.entry_id}`}>
                <span className="w-16 font-bold text-primary">Bed {bed}</span>
                <span className="w-36 truncate font-semibold">{p ? `${p.given_name} ${p.family_name}` : i.patient_id}</span>
                <span className="w-20 text-secondary">{i.category}</span>
                <span className="flex-1 min-w-0 truncate">{e ? `${e.care_time.slice(11, 16)} · ${e.type.replace('_', ' ')}` : i.entry_id}</span>
                <span className="flex gap-1">{i.flags.map((f) => <Badge key={f} tone={FLAG_TONE[f]}>{FLAG_TEXT[f]}</Badge>)}</span>
                {i.signed_off_at ? <Badge tone="green" icon="check">Signed off</Badge> : <Badge icon="schedule">Open</Badge>}
              </Link>
            </li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}

export function RecoveryItemPage() {
  const { item: id } = useParams();
  const { db, clock, deviceId, phase } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const data = useLiveQuery(async () => {
    const item = await db.worklist_item.get(id!);
    if (!item) return null;
    const main = await getEntry(db, item.entry_id);
    const all = (await listPatientEntries(db, item.patient_id)).filter((x) => x.entry.status === 'confirmed');
    const orders = new Map((await db.active_order.toArray()).map((o) => [o.id, o]));
    const why = main ? flagEntry(main, all, orders) : null;
    const related = why ? (await Promise.all(why.related.map((r) => getEntry(db, r)))).filter(Boolean) : [];
    const chain = main ? await versionChain(db, main.entry.id) : [];
    const patient = await db.patient.get(item.patient_id);
    const signer = item.signed_off_by ? await db.practitioner.get(item.signed_off_by) : undefined;
    return { item, main, why, related, chain, patient, signer };
  }, [db, id]);
  if (phase !== 'online') return <NotYet />;
  if (data === undefined) return <p role="status">Loading…</p>;
  if (data === null) return <EmptyState icon="search_off" text="Worklist item not found." />;
  const { item, main, why, related, chain, patient, signer } = data;
  const newest = chain[chain.length - 1];
  return (
    <>
      <Breadcrumbs items={[{ label: 'To check', to: '/recovery' }, { label: patient ? `${patient.given_name} ${patient.family_name}` : item.patient_id }]} />
      <Card className="flex flex-col gap-space-md">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-headline-md text-headline-md text-primary flex-1">{main ? entrySummary(main) : item.entry_id}</h1>
          {item.flags.map((f) => <Badge key={f} tone={FLAG_TONE[f]}>{FLAG_TEXT[f]}</Badge>)}
          {main && <StatusBadge entry={main.entry} />}
        </div>
        {why && why.reasons.length > 0 && <ul className="list-disc pl-6 font-body-md">{why.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
        {item.flags.length > 0 && why && why.reasons.length === 0 && <p className="font-body-sm text-secondary">Flagged in the practice data set; the rules no longer find a problem (for example after a fix).</p>}
        {item.second_look_status && <p className="font-body-sm">Cloud second look (practice data, simulated): <strong>{item.second_look_status}</strong>{item.mismatch_fields?.length ? ` · different: ${item.mismatch_fields.join(', ')}` : ''}</p>}
        {main && <><h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase">Record</h2><EntryRow item={main} /></>}
        {related.length > 0 && <><h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase">Compare with</h2>{related.map((r) => <EntryRow key={r!.entry.id} item={r!} />)}</>}
        {chain.length > 1 && <><h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase">All versions</h2>{chain.map((c) => <EntryRow key={c.entry.id} item={c} />)}</>}
        <div className="flex flex-wrap gap-space-sm">
          {newest && newest.entry.status === 'confirmed' && <ButtonLink variant="secondary" to={`/entries/${newest.entry.id}`}><Icon name="edit" />Open to fix or mark as mistake</ButtonLink>}
          {main?.entry.status === 'draft' && <ButtonLink variant="secondary" to={`/capture/${main.entry.id}/confirm`}><Icon name="fact_check" />Check and confirm draft</ButtonLink>}
          {item.signed_off_at
            ? <Badge tone="green" icon="check">Signed off by {signer?.name ?? item.signed_off_by} · {dateTimeLabel(item.signed_off_at)}</Badge>
            : <Button onClick={async () => { setError(null); try { await signOffItem(db, clock, { userId: user!.id, deviceId }, item.id); navigate('/recovery'); } catch (e) { setError(msg(e)); } }}><Icon name="task_alt" />Checked — sign off</Button>}
        </div>
        {error && <p role="alert" className="text-error">{error}</p>}
        <p className="font-body-sm text-secondary">Sign off means a person checked this record against the paper and fixed it if needed. Fixes are new versions; nothing is deleted.</p>
      </Card>
      {newest && <SecondLookCard entry={newest.entry} child={newest.child as VitalSign | undefined} />}
    </>
  );
}

export function ExportPage() {
  const { db, clock, deviceId, phase } = useApp();
  const { user } = useSession();
  const [state, setState] = useState<Awaited<ReturnType<typeof prepareExport>> | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  if (phase !== 'online') return <><PageTitle>Export</PageTitle><NotYet /></>;
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
  return (
    <>
      <PageTitle>Export (FHIR R4)</PageTitle>
      <Card className="flex flex-col gap-space-md">
        <p className="text-on-surface-variant">Makes one FHIR R4 file (a Bundle) of the downtime records for the hospital EHR team. <strong>It does not send anything to the EHR.</strong> Drafts and AI proposals are never included.</p>
        <Button className="self-start" onClick={async () => { setError(null); setHash(null); try { setState(await prepareExport(db, clock)); } catch (e) { setError(msg(e)); } }}><Icon name="build" />Prepare export file</Button>
        {state && (
          <>
            <ul className="font-body-md list-disc pl-6" data-testid="export-summary">
              <li>{state.resourceCount} resources in the file</li>
              <li>{state.errors.length === 0 ? 'Structure check passed' : `${state.errors.length} structure problems`}</li>
              <li>{state.drafts} drafts not included{state.drafts ? ' (confirm them first if they belong in the record)' : ''}</li>
              <li>{state.openItems} worklist items not signed off</li>
            </ul>
            {state.errors.length > 0 && <pre className="bg-clinical-red-bg p-space-sm rounded text-body-sm overflow-auto max-h-60">{state.errors.slice(0, 30).join('\n')}</pre>}
            {state.openItems > 0 && <p className="text-[#7a5410] font-body-md flex items-center gap-2"><Icon name="warning" />Some items are not signed off yet. You can still make a file, but the export should normally wait.</p>}
            <div role="note" className="rounded-lg border-2 border-clinical-red-border bg-clinical-red-bg p-space-md flex flex-col gap-space-sm">
              <p className="font-semibold text-clinical-red flex items-center gap-2"><Icon name="warning" />Sensitive: this file is NOT encrypted</p>
              <p className="font-body-md">It holds patient names, medicines and notes in plain text, because the EHR team&apos;s system must read it. The browser saves it in its downloads folder; ClinBridge cannot protect that folder. Hand it only to the authorised EHR team, by a route your hospital approves, then delete the local copy.</p>
              <label className="flex items-start gap-2 font-body-md"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-label="I understand this file is sensitive and not encrypted" className="mt-1 w-5 h-5" />I understand this file is sensitive and not encrypted.</label>
            </div>
            <Button className="self-start" disabled={state.errors.length > 0 || !ack} onClick={download}><Icon name="download" />Download file</Button>
          </>
        )}
        {hash && <p role="status" className="text-sync-green font-body-md">File saved. Fingerprint (SHA-256) recorded in the change log: <span className="font-code-tabular break-all">{hash}</span></p>}
        {error && <p role="alert" className="text-error">{error}</p>}
      </Card>
    </>
  );
}
