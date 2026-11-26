import { useEffect, useState, type ReactNode } from 'react';
import { IDENTITY_LABEL, currentEncounter, idLabel, identityStatus, isLocallyRegistered, locationLabel, needsReconciliation, originLabel } from '../../lib/admission';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { isAdmin, isNurse, useApp, useSession } from '../../state/app';
import { buildWorklist, signOffItem } from '../../db/repos/worklist';
import { getEntry, listPatientEntries, versionChain, type EntryWithChild } from '../../db/repos/entries';
import type { Encounter, MedAdmin, Patient, VitalSign, WorklistFlag, WorklistItem } from '../../db/schema';
import { FLAG_TEXT, flagEntry, type FlagResult } from '../../lib/recovery';
import { formatDose } from '../../lib/dose';
import { orderDose } from '../../lib/meds';
import { ageOn, dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { VITAL_RULES, type VitalKey } from '../../lib/vitals';
import { Badge, Button, ButtonLink, EmptyState, Icon, PageTitle } from '../../components/ui';
import { SecondLookCard } from '../ai/AiPages';
import { PhotoView } from '../capture/PhotoView';
import { EntryValues } from '../entries/EntryPages';
import { EntryRow, StatusBadge, TYPE_LABEL, entrySummary } from '../entries/entryView';
import { fullName, sexLabel } from '../patient/patientData';
import { doseDifference } from '../ward/wardData';
import { baselineRows } from '../vitals/flowsheetData';
import { CATEGORY_LABEL, WORK_FILTERS, inFilter, lookRows, newestVersion, progress, type LookRow, type WorkFilter } from './recoveryData';

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const FLAG_TONE: Record<WorklistFlag, 'red' | 'amber' | 'blue' | 'neutral'> = { duplicate: 'red', time_conflict: 'amber', missing_field: 'amber', recheck: 'red', not_recorded: 'neutral' };
const PANEL = 'bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-md';

export function RecoveryClosed() {
  return <EmptyState icon="cloud_off" text="Recovery starts after an admin clears the network (Admin → Downtime → Back online)." />;
}

interface Row { i: WorklistItem; p?: Patient; enc?: Encounter; x?: EntryWithChild; why: FlagResult | null; look: LookRow[] }
/** The newest saved version of a worklist record, and the first line that says why it is on the list. */
const firstReason = (r: Row) => {
  const d = r.look.find((l) => l.differs);
  return r.why?.reasons[0] ?? (d ? `${d.label}: record says ${d.record}, second look read ${d.reading}.` : null);
};

/* ------------------------------ List ------------------------------ */

function WorkRow({ r, current, names, nowIso }: { r: Row; current: boolean; names: Map<string, string>; nowIso: string }) {
  const { i, p, enc, x } = r;
  const reason = firstReason(r);
  const doseNote = x?.entry.type === 'med_admin' && x.child ? doseDifference(x.child as MedAdmin) : null;
  const red = !i.signed_off_at && i.flags.some((f) => FLAG_TONE[f] === 'red');
  return (
    <li className="break-inside-avoid">
      <Link to={`/recovery/${i.id}`} aria-current={current ? 'page' : undefined} data-testid={`wl-${i.entry_id}`}
        className={`block rounded-xl border p-space-md shadow-sm print:shadow-none ${current ? 'border-2 border-primary bg-surface-container-low' : red ? 'border-clinical-red-border bg-surface-container-lowest hover:bg-surface-container-low' : 'border-card-border bg-surface-container-lowest hover:bg-surface-container-low'}`}>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-0.5 rounded bg-surface-container font-label-badge text-label-badge text-on-surface-variant">Queue {i.priority}</span>
          <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-label-badge text-label-badge">BED {enc?.bed ?? '—'}</span>
          {i.flags.map((f) => <Badge key={f} tone={FLAG_TONE[f]}>{FLAG_TEXT[f]}</Badge>)}
          <span className="ml-auto">{i.signed_off_at ? <Badge tone="green" icon="check">Signed off</Badge> : <Badge icon="schedule">Open</Badge>}</span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="font-body-lg text-body-lg font-bold text-primary">{p ? `${fullName(p)}, ${ageOn(p.birth_date, nowIso)}` : i.patient_id}</span>
          <span className="font-code-tabular text-body-sm text-secondary">{p ? idLabel(p) : 'MRN'} {p?.mrn ?? '—'}</span>
        </span>
        <span className="block font-body-md text-body-md text-on-surface [overflow-wrap:anywhere]"><strong className="font-code-tabular">{x ? hm(x.entry.care_time) : ''}</strong> {x ? entrySummary(x) : i.entry_id}</span>
        {reason && <span className={`mt-1 block font-body-sm text-body-sm font-semibold ${red ? 'text-clinical-red' : 'text-[#7a5410]'}`}>{reason}</span>}
        {doseNote && <span className="mt-1 block font-body-sm text-body-sm font-semibold text-[#7a5410]">{doseNote}</span>}
        <span className="mt-1 flex flex-wrap justify-between gap-x-2 font-body-sm text-body-sm text-secondary">
          <span>{CATEGORY_LABEL[i.category] ?? i.category} · {x ? names.get(x.entry.performer_id) ?? x.entry.performer_id : ''}</span>
          {i.signed_off_at ? <span>{names.get(i.signed_off_by ?? '') ?? i.signed_off_by}, {hm(i.signed_off_at)}</span> : i.assigned_to ? <span>For {names.get(i.assigned_to) ?? i.assigned_to}</span> : null}
        </span>
      </Link>
    </li>
  );
}

interface Ctx { next: (afterId: string) => string | null }

/** Recovery worklist: list on the left, one record on the right (Stitch "Recovery worklist"). Small screens show one at a time. */
export function RecoveryLayout() {
  const { item: currentId } = useParams();
  const { db, clock, deviceId, phase, event, dataset } = useApp();
  const { user } = useSession();
  const [filter, setFilter] = useState<WorkFilter>('open');
  const [note, setNote] = useState<string | null>(null);
  const data = useLiveQuery(async () => {
    const items = await db.worklist_item.toArray();
    const patients = new Map((await db.patient.toArray()).map((p) => [p.id, p]));
    const encs = new Map((await db.encounter.toArray()).map((e) => [e.patient_id, e]));
    const orders = new Map((await db.active_order.toArray()).map((o) => [o.id, o]));
    const names = new Map((await db.practitioner.toArray()).map((s) => [s.id, s.name]));
    const all = new Map<string, EntryWithChild[]>();
    for (const id of new Set(items.map((i) => i.patient_id))) all.set(id, await listPatientEntries(db, id));
    const rows: Row[] = items.map((i) => {
      const mine = all.get(i.patient_id) ?? [];
      const x = newestVersion(i.entry_id, mine);
      return {
        i, p: patients.get(i.patient_id), enc: encs.get(i.patient_id), x,
        why: x?.entry.status === 'confirmed' && i.flags.length ? flagEntry(x, mine.filter((e) => e.entry.status === 'confirmed'), orders) : null,
        look: x && i.second_look_status === 'mismatch' ? lookRows(x.entry.type, x.child, i.second_look_reading) : [],
      };
    }).sort((a, b) => Number(!!a.i.signed_off_at) - Number(!!b.i.signed_off_at) || b.i.priority - a.i.priority || a.i.id.localeCompare(b.i.id));
    return { rows, names };
  }, [db]);
  useEffect(() => { if (currentId) window.scrollTo(0, 0); }, [currentId]);
  if (phase !== 'online') return <><PageTitle>Recovery worklist</PageTitle><RecoveryClosed /></>;
  if (!data) return <p role="status">Loading…</p>;
  const { rows, names } = data;
  const items = rows.map((r) => r.i);
  const pr = progress(items);
  const shown = rows.filter((r) => inFilter(r.i, filter));
  const pct = (n: number) => (pr.total ? `${(n / pr.total) * 100}%` : '0%');
  const tabLabel = (f: WorkFilter) => `${f === 'open' ? 'Not signed off' : f === 'all' ? 'All' : FLAG_TEXT[f]} (${items.filter((i) => inFilter(i, f)).length})`;
  const ctx: Ctx = { next: (after) => rows.find((r) => !r.i.signed_off_at && r.i.id !== after)?.i.id ?? null };
  return (
    <>
      <p className="hidden print:block border-b border-black pb-1 text-[9pt]"><strong>Recovery worklist, {tabLabel(filter)}</strong> · printed by {user?.name} · {dateTimeLabel(clock.nowIso())}{dataset === 'practice' ? ' · Fake practice data, not a clinical record' : ''}</p>
      <section aria-label="Recovery status" className={`${PANEL} flex flex-col gap-space-sm print:hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="flex flex-wrap items-center gap-x-space-md gap-y-1">
            <h1 className="font-headline-md text-headline-md text-primary">Recovery worklist</h1>
            <span className="px-2 py-1 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-badge text-label-badge font-bold flex items-center gap-1"><Icon name="cloud_done" className="text-[16px]" />Network cleared, recovery open</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">Downtime {event ? `${hm(event.declared_at)} – ${event.ended_at ? hm(event.ended_at) : 'not ended'}` : '—'} · cleared {hm(event?.network_cleared_at)}{event?.cleared_by ? ` by ${names.get(event.cleared_by) ?? event.cleared_by}` : ''}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin(user) && <ButtonLink variant="secondary" to="/admin/backup"><Icon name="lock" />Encrypted backup</ButtonLink>}
            <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print worklist</Button>
            <ButtonLink variant="secondary" to="/export"><Icon name="download" />Export</ButtonLink>
            <Button variant="secondary" onClick={async () => { setNote(null); try { const n = await buildWorklist(db, clock, { userId: user!.id, deviceId }); setNote(n ? `${n} new items added.` : 'No new records to add.'); } catch (e) { setNote(msg(e)); } }}><Icon name="playlist_add" />Add new downtime records</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-space-md gap-y-1 font-body-md text-body-md">
          <p className="font-bold text-primary">{`${pr.done} of ${pr.total} signed off`}</p>
          <ul className="flex flex-wrap gap-x-space-md gap-y-1 font-body-sm text-body-sm text-on-surface-variant">
            {([['bg-sync-green', `${pr.done} done`], ['bg-clinical-red', `${pr.flagged} open with a flag`], ['bg-secondary-fixed-dim', `${pr.plain} open, no flag`]] as const).map(([c, t]) => <li key={t} className="flex items-center gap-1.5"><span aria-hidden className={`w-3 h-3 rounded-sm ${c}`} />{t}</li>)}
          </ul>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={pr.total} aria-valuenow={pr.done} aria-label="Signed off" className="h-2.5 rounded-full overflow-hidden bg-surface-container flex gap-[2px]">
          <span className="h-full bg-sync-green" style={{ width: pct(pr.done) }} /><span className="h-full bg-clinical-red" style={{ width: pct(pr.flagged) }} /><span className="h-full bg-secondary-fixed-dim" style={{ width: pct(pr.plain) }} />
        </div>
        {note && <p role="status" className="font-body-md text-body-md text-on-surface-variant">{note}</p>}
        <p className="font-body-sm text-body-sm text-secondary">Rules only (no cloud): possible duplicates, missing fields, time conflicts. Queue order is a prototype setting, not a clinical score.</p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-space-md items-start print:block">
        <section aria-label="Worklist" className={`min-w-0 flex-col gap-space-sm xl:sticky xl:top-[calc(var(--header-h)+16px)] print:flex print:static ${currentId ? 'hidden xl:flex' : 'flex'}`}>
          <div role="group" aria-label="Filter" className={`${PANEL} !p-1.5 flex flex-wrap gap-1 print:hidden`}>
            {WORK_FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-10 px-2.5 rounded-lg font-body-sm text-body-sm font-semibold ${filter === f ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}>{tabLabel(f)}</button>
            ))}
          </div>
          {shown.length === 0 ? <div className={PANEL}><EmptyState text="Nothing here" /></div> : (
            <ul className="flex flex-col gap-2 xl:max-h-[calc(100vh-var(--header-h)-140px)] xl:overflow-y-auto xl:pr-1 print:max-h-none print:overflow-visible">
              {shown.map((r) => <WorkRow key={r.i.id} r={r} current={r.i.id === currentId} names={names} nowIso={clock.nowIso()} />)}
            </ul>
          )}
        </section>
        <div className={`min-w-0 print:hidden ${currentId ? '' : 'hidden xl:block'}`}><Outlet context={ctx} /></div>
      </div>
    </>
  );
}

export function RecoveryNothingOpen() {
  return <div className={PANEL}><EmptyState icon="fact_check" text="Open a record from the list to check it against the paper." /></div>;
}

/* ------------------------------ One record ------------------------------ */

function Column({ n, icon, title, aside, children }: { n: number; icon: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className={`min-w-0 ${PANEL} flex flex-col gap-space-sm`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-label-uppercase text-label-uppercase text-on-surface uppercase flex items-center gap-1.5"><Icon name={icon} className="text-[20px] text-secondary" />{n}. {title}</h2>{aside}</div>
      {children}
    </section>
  );
}
const Fact = ({ k, children }: { k: string; children: ReactNode }) => <><dt className="text-secondary">{k}</dt><dd className="font-semibold text-primary [overflow-wrap:anywhere]">{children}</dd></>;
const FACTS = 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-sm gap-y-1 font-body-md text-body-md';

function Choice({ name, checked, onChange, title, text }: { name: string; checked: boolean; onChange: () => void; title: string; text: string }) {
  return (
    <label className={`flex items-start gap-space-sm rounded-lg p-space-md cursor-pointer border-2 ${checked ? 'border-primary bg-surface-container-lowest' : 'border-transparent bg-surface-container-low'}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="w-5 h-5 mt-0.5 shrink-0" aria-label={title} />
      <span><span className="block font-body-lg text-body-lg font-bold text-primary">{title}</span><span className="block font-body-sm text-body-sm text-on-surface-variant">{text}</span></span>
    </label>
  );
}

export function RecoveryItemPage() {
  const { item: id } = useParams();
  const { next } = useOutletContext<Ctx>();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'right' | 'wrong' | null>(null);
  const [paper, setPaper] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setChoice(null); setError(null); setPaper(false); setBusy(false); }, [id]);
  const data = useLiveQuery(async () => {
    const item = await db.worklist_item.get(id!);
    if (!item) return null;
    const main = await getEntry(db, item.entry_id);
    const every = await listPatientEntries(db, item.patient_id);
    const orders = new Map((await db.active_order.toArray()).map((o) => [o.id, o]));
    const now = newestVersion(item.entry_id, every);
    const why = now?.entry.status === 'confirmed' ? flagEntry(now, every.filter((x) => x.entry.status === 'confirmed'), orders) : null;
    const related = why ? (await Promise.all(why.related.map((r) => getEntry(db, r)))).filter((x): x is EntryWithChild => !!x) : [];
    const chain = main ? await versionChain(db, main.entry.id) : [];
    const patient = await db.patient.get(item.patient_id);
    const encounter = currentEncounter(await db.encounter.where('patient_id').equals(item.patient_id).toArray());
    const results = await db.snapshot_result.where('patient_id').equals(item.patient_id).toArray();
    const names = new Map((await db.practitioner.toArray()).map((s) => [s.id, s.name]));
    return { item, main, now, why, related, chain, patient, encounter, results, names, orders };
  }, [db, id]);
  if (data === undefined || (data && data.item.id !== id)) return <p role="status">Loading…</p>;
  if (data === null) return <div className={PANEL}><EmptyState icon="search_off" text="Worklist item not found." action={<ButtonLink variant="secondary" to="/recovery">Back to the list</ButtonLink>} /></div>;
  const { item, main, now, why, related, chain, patient: p, encounter: enc, results, names, orders } = data;
  const x = now ?? main; // the newest version is the record now
  const med = x?.entry.type === 'med_admin' ? (x.child as MedAdmin | undefined) : undefined;
  const order = med?.order_id ? orders.get(med.order_id) : undefined;
  const dose = med ? doseDifference(med) : null;
  const look = x ? lookRows(x.entry.type, x.child, item.second_look_reading) : [];
  const differs = look.filter((l) => l.differs);
  const before = x?.entry.type === 'vital_sign' ? baselineRows(results, item.patient_id).sort((a, b) => b.ms - a.ms)[0] : undefined;
  const raw = (x?.child as { raw_text?: string | null } | undefined)?.raw_text ?? (main?.child as { raw_text?: string | null } | undefined)?.raw_text;
  const fixed = !!(main && x && main.entry.id !== x.entry.id);
  const draft = main?.entry.status === 'draft';
  const nextId = next(item.id);
  const who = (pid: string | null | undefined) => (pid ? names.get(pid) ?? pid : '—');
  const identity = p && needsReconciliation(p) && item.flags.includes('recheck') ? ['Identity not reconciled yet: admissions match this patient with the hospital record first.'] : [];
  const alerts = [...identity, ...(why?.reasons ?? []), ...(dose ? [`${med!.drug_name}: ${dose}.`] : []), ...differs.map((d) => `${d.label}: the record says ${d.record}, the second look read ${d.reading}.`)];
  async function signOff() {
    setError(null); setBusy(true);
    try { await signOffItem(db, clock, { userId: user!.id, deviceId }, item.id); } catch (e) { setError(msg(e)); }
    setBusy(false);
  }
  return (
    <div className="flex flex-col gap-space-md">
      <Link to="/recovery" className="xl:hidden self-start inline-flex items-center gap-1 min-h-11 font-body-md text-body-md font-semibold text-primary"><Icon name="arrow_back" />Back to the list</Link>
      <section aria-label="Record to check" className={`${PANEL} flex flex-col gap-space-sm`}>
        <div className="flex flex-wrap items-center gap-space-md">
          <span className="px-3 py-2 rounded-lg bg-primary-container text-white text-center"><span className="block font-label-badge text-label-badge opacity-80">BED</span><span className="block font-headline-md text-headline-md font-bold">{enc?.bed ?? '—'}</span></span>
          <div className="flex-1 min-w-[12rem]">
            <p className="flex flex-wrap items-center gap-2"><strong className="font-headline-md text-headline-md text-primary">{p ? fullName(p) : item.patient_id}</strong><Badge tone="blue">{p ? idLabel(p) : 'MRN'} {p?.mrn ?? '—'}</Badge>{p && <Badge>{ageOn(p.birth_date, clock.nowIso())}y {sexLabel(p.sex)}</Badge>}</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{[`Born ${dayLabel(p?.birth_date)}`, enc?.unit, enc?.attending, enc?.admit_time ? `admitted ${dayLabel(enc.admit_time)}` : ''].filter(Boolean).join(' · ')}</p>
          </div>
          <span className="flex flex-wrap gap-1">{item.flags.map((f) => <Badge key={f} tone={FLAG_TONE[f]}>{FLAG_TEXT[f]}</Badge>)}{x && <StatusBadge entry={x.entry} />}</span>
        </div>
        <h1 className="font-headline-sm text-headline-sm text-primary [overflow-wrap:anywhere]">{x ? `${TYPE_LABEL[x.entry.type]}: ${entrySummary(x)}` : item.entry_id}</h1>
        {alerts.length > 0 && !item.signed_off_at && (
          <div role="note" aria-label="Why this record is on the list" className={`rounded-lg p-space-md flex items-start gap-space-sm ${item.flags.some((f) => FLAG_TONE[f] === 'red') ? 'bg-error-container text-on-error-container' : 'bg-downtime-amber-bg text-[#6b4a0e] border border-downtime-amber-border'}`}>
            <Icon name="report" /><ul className="flex flex-col gap-1 font-body-md text-body-md">{alerts.map((a) => <li key={a} className="font-semibold">{a}</li>)}<li>Check the record against the paper. Nothing here says which value is right.</li></ul>
          </div>
        )}
        {alerts.length === 0 && item.flags.length > 0 && <p className="font-body-sm text-body-sm text-secondary">Flagged in the practice data set; the rules no longer find a problem (for example after a fix).</p>}
        {fixed && <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-1"><Icon name="history" className="text-[20px]" />This record was fixed. The newest version is shown.</p>}
        {p && isLocallyRegistered(p) && (
          <div role="note" aria-label="Identity reconciliation" className="rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-md flex flex-col gap-1 font-body-md text-body-md text-[#5c400c]">
            <strong>Registered on this laptop: {originLabel(p)}</strong>
            <span>Temporary ID {p.mrn} (not a hospital MRN) · admitted {dateTimeLabel(enc?.admit_time)} · {locationLabel(enc)} · {IDENTITY_LABEL[identityStatus(p)]}{enc?.responsible_nurse_id ? ` · responsible nurse ${who(enc.responsible_nurse_id)}` : ''}</span>
            <span>Admissions match this patient with the hospital record by their own procedure. ClinBridge never merges patients, never decides that two records are the same person, and has not sent anything to the EHR.</span>
            <ButtonLink variant="secondary" className="self-start" to={user?.role === 'admin' ? `/admission/patients/${p.id}` : `/patients/${p.id}/stay`}><Icon name="badge" />Open identity reconciliation</ButtonLink>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md items-start">
        <Column n={1} icon="document_scanner" title="Paper source" aside={<Badge>{x?.entry.raw_input_kind === 'photo' ? 'Photo' : 'Typed'}</Badge>}>
          {raw ? (
            <div className="rounded-lg bg-[#fdfbf3] border border-card-border p-space-md"><span className="block font-label-uppercase text-label-uppercase text-secondary uppercase">Words copied from the paper</span><span className="block font-code-tabular text-[17px] font-bold text-primary [overflow-wrap:anywhere]">{raw}</span></div>
          ) : <p className="rounded-lg bg-surface-container-low p-space-md font-body-md text-body-md text-on-surface-variant">{x?.entry.raw_input_kind === 'photo' ? 'No words were copied from the paper for this record.' : 'Typed at the laptop. There is no paper photo.'}</p>}
          {x?.entry.raw_input_kind === 'photo' && (
            <>
              <dl className={FACTS}><Fact k="File">{x.entry.raw_input_ref}</Fact>{x.entry.photo_check && <Fact k="Photo check">{x.entry.photo_check.readable ? 'No problem found' : `${x.entry.photo_check.problem.replace('_', ' ')}${x.entry.photo_check.overridden ? ', nurse carried on' : ''}`}</Fact>}</dl>
              <Button variant="secondary" aria-expanded={paper} onClick={() => setPaper(!paper)}><Icon name="zoom_in" />{paper ? 'Hide paper' : 'Inspect paper'}</Button>
              {paper && <PhotoView refId={x.entry.raw_input_ref} />}
            </>
          )}
        </Column>

        <Column n={2} icon="edit_note" title="Downtime record" aside={x && <span className="font-code-tabular text-body-sm text-secondary">{x.entry.id.slice(0, 8)}</span>}>
          {!x ? <p>The record is not on this laptop.</p> : (
            <>
              {med && med.dose_given != null && (
                <div className={`rounded-lg p-space-md text-center ${dose || differs.length ? 'bg-error-container text-on-error-container' : 'bg-surface-container-low text-primary'}`}>
                  <span className="block font-label-uppercase text-label-uppercase uppercase">Dose recorded</span>
                  <span className="block font-code-tabular text-[34px] leading-tight font-bold">{formatDose(med.dose_given)} {med.dose_given_unit}</span>
                  <span className="block font-body-sm text-body-sm">{med.route ?? 'Route missing'} · {hm(x.entry.care_time)}</span>
                </div>
              )}
              <EntryValues item={x} names={names} />
              <dl className={FACTS}><Fact k="Recorded by">{who(x.entry.performer_id)}</Fact><Fact k="Care time">{dateTimeLabel(x.entry.care_time)}</Fact><Fact k="Typed in">{dateTimeLabel(x.entry.entry_time)}</Fact><Fact k="Laptop">{x.entry.device_id} · #{x.entry.counter}</Fact></dl>
            </>
          )}
        </Column>

        <Column n={3} icon="compare" title="Order and other sources">
          {med && (order ? (
            <div className={`rounded-lg p-space-md ${dose ? 'bg-downtime-amber-bg border border-downtime-amber-border' : 'bg-surface-container-low'}`}>
              <span className="block font-label-uppercase text-label-uppercase text-secondary uppercase">Order on the patient list</span>
              <span className="block font-body-lg text-body-lg font-bold text-primary [overflow-wrap:anywhere]">{order.text}</span>
              <dl className={`${FACTS} mt-1`}><Fact k="Dose">{orderDose(order) || '—'}</Fact><Fact k="Route">{order.route ?? '—'}</Fact><Fact k="How often">{order.frequency ?? '—'}</Fact><Fact k="Ordered by">{order.ordered_by ?? '—'}</Fact></dl>
            </div>
          ) : <p className="font-body-md text-body-md text-secondary">This record has no order on the patient list.</p>)}
          {before && (
            <div className="rounded-lg bg-surface-container-low p-space-md"><span className="block font-label-uppercase text-label-uppercase text-secondary uppercase">Hospital list, {dateTimeLabel(before.time)}</span>
              <dl className={`${FACTS} mt-1`}>{(Object.keys(VITAL_RULES) as VitalKey[]).filter((k) => before.values[k] != null).map((k) => <Fact key={k} k={VITAL_RULES[k].label}>{String(before.values[k])} {VITAL_RULES[k].unit}</Fact>)}</dl></div>
          )}
          {item.second_look_status && (
            <div className={`rounded-lg p-space-md ${differs.length ? 'bg-downtime-amber-bg border border-downtime-amber-border' : 'bg-surface-container-low'}`}>
              <span className="block font-label-uppercase text-label-uppercase text-secondary uppercase">Second look</span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Cloud second look (practice data, simulated): <strong>{item.second_look_status.replace('_', ' ')}</strong>. Not a model answer.</p>
              {look.length > 0 && (
                <table className="mt-1 w-full font-body-sm text-body-sm text-left"><caption className="sr-only">Record and second look, field by field</caption><thead className="text-secondary"><tr><th scope="col" className="pr-2">Field</th><th scope="col" className="pr-2">Record</th><th scope="col">Second look</th></tr></thead>
                  <tbody>{look.map((l) => <tr key={l.key} className={`border-t border-card-border ${l.differs ? 'font-bold text-clinical-red' : 'text-on-surface'}`}><th scope="row" className="pr-2 py-1 font-normal">{l.label}</th><td className="pr-2 py-1 font-code-tabular">{l.record}</td><td className="py-1 font-code-tabular">{l.reading}{l.differs && <span className="sr-only"> (different)</span>}</td></tr>)}</tbody></table>
              )}
            </div>
          )}
          {!med && !before && !item.second_look_status && <p className="font-body-md text-body-md text-secondary">No order, hospital value or second look is stored for this kind of record. Compare it with the paper.</p>}
        </Column>
      </div>

      {related.length > 0 && <section className={PANEL}><h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase">Compare with</h2>{related.map((r) => <EntryRow key={r.entry.id} item={r} wrapSummary />)}</section>}
      {chain.length > 1 && <section className={PANEL}><h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase">All versions</h2>{chain.map((c) => <EntryRow key={c.entry.id} item={c} wrapSummary />)}</section>}

      <section aria-label="Decision" className={`${PANEL} flex flex-col gap-space-md`}>
        <div>
          <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="fact_check" />Decision</h2>
          <p className="font-body-sm text-body-sm text-secondary">Sign off means a person checked this record against the paper and fixed it if needed. Fixes are new versions; nothing is deleted.</p>
        </div>
        {item.signed_off_at ? (
          <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed p-space-md flex items-center gap-2 font-body-md text-body-md font-semibold"><Icon name="verified" />Signed off by {who(item.signed_off_by)} · {dateTimeLabel(item.signed_off_at)}</p>
        ) : draft ? (
          <p className="font-body-md text-body-md text-on-surface-variant">This record is a draft. It must be confirmed before it can be signed off.</p>
        ) : (
          <>
            <div role="radiogroup" aria-label="Decision" className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
              <Choice name="decision" checked={choice === 'right'} onChange={() => setChoice('right')} title="The record matches the paper" text="I compared this record with the paper. It can be signed off." />
              <Choice name="decision" checked={choice === 'wrong'} onChange={() => setChoice('wrong')} title="The record is wrong" text="It must be fixed, or marked as a mistake, with a reason. Then come back and sign off." />
            </div>
            <div className="rounded-lg bg-surface-container-low p-space-md flex flex-wrap items-center justify-between gap-space-md">
              <dl className="flex flex-wrap gap-x-space-lg gap-y-1 font-body-md text-body-md"><div><dt className="font-body-sm text-body-sm text-secondary">Recorded by</dt><dd className="font-semibold text-primary">{who(x?.entry.performer_id)}</dd></div><div><dt className="font-body-sm text-body-sm text-secondary">Signing off now</dt><dd className="font-semibold text-primary">{user?.name ?? '—'}</dd></div></dl>
              {choice === 'wrong' ? (
                isNurse(user) && x && x.entry.status === 'confirmed' ? <ButtonLink to={`/entries/${x.entry.id}`}><Icon name="edit" />Open to fix or mark as mistake</ButtonLink> : <p className="font-body-md text-body-md text-on-surface-variant">A nurse fixes records. Ask the nurse who recorded it.</p>
              ) : (
                <Button disabled={choice !== 'right' || busy} onClick={() => void signOff()}><Icon name="task_alt" />{busy ? 'Saving…' : 'Checked — sign off'}</Button>
              )}
            </div>
          </>
        )}
        {draft && isNurse(user) && <ButtonLink variant="secondary" className="self-start" to={`/capture/${main!.entry.id}/confirm`}><Icon name="fact_check" />Check and confirm draft</ButtonLink>}
        {error && <p role="alert" className="text-error">{error}</p>}
      </section>

      {x && <SecondLookCard entry={x.entry} child={x.child as VitalSign | undefined} />}
      <div className={`${PANEL} flex flex-wrap items-center justify-between gap-space-sm font-body-sm text-body-sm text-on-surface-variant`}>
        <span className="flex items-center gap-1"><Icon name="lock" className="text-[18px]" />Each sign-off is written to the change log on this laptop. Nothing is sent to the hospital system.</span>
        {nextId && <ButtonLink variant="secondary" to={`/recovery/${nextId}`}>Next open record<Icon name="arrow_forward" /></ButtonLink>}
      </div>
    </div>
  );
}
