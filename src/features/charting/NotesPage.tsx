import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation } from 'react-router-dom';
import { createEntry, listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import type { Note } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { NOTE_CATEGORIES, noteLabel } from '../../lib/charting';
import { isRetiredStatus } from '../../lib/history';
import { isHighAlert } from '../../lib/meds';
import { dateTimeLabel, hm } from '../../lib/time';
import { Badge, Breadcrumbs, Button, ButtonLink, EmptyState, Icon } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { PatientTabs } from '../patient/PatientTabs';
import { fullName } from '../patient/patientData';
import { SourceBadge, StatusBadge, TYPE_LABEL } from '../entries/entryView';
import { NoteEditor, noteToForm } from './editors';

const PANEL = 'bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-md';
const ICON: Record<string, string> = { assessment: 'stethoscope', intervention: 'healing', communication: 'forum', risk_score: 'personal_injury', restraint_check: 'back_hand', other: 'description' };
const PLAIN = 'inline-flex items-center gap-1 min-h-11 px-3 rounded-lg border border-card-border bg-surface-container-lowest font-body-md text-body-md font-semibold text-primary hover:bg-surface-container-low';

/** One note. Closed: what kind, the first words and the score as written. Open, and always on paper: every word. */
function NoteCard({ item, open, onToggle, names, base, nurse }: { item: EntryWithChild; open: boolean; onToggle: () => void; names: Map<string, string>; base: string; nurse: boolean }) {
  const { entry } = item;
  const n = item.child as Note;
  const retired = isRetiredStatus(entry.status);
  const who = (id: string) => names.get(id) ?? id;
  const title = n.score_name ? n.score_name.replace(/\s*\(.*\)$/, '') : noteLabel(n.category);
  return (
    <li className={`break-inside-avoid bg-surface-container-lowest rounded-xl shadow-sm ${entry.status === 'draft' ? 'border-2 border-downtime-amber-border' : 'border border-card-border'}`} data-testid={`note-${entry.id}`}>
      <button type="button" aria-expanded={open} aria-controls={`note-body-${entry.id}`} onClick={onToggle} className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:flex items-center gap-2 sm:gap-space-md p-space-md text-left hover:bg-surface-container-low rounded-xl">
        <span className="w-10 h-10 rounded-lg hidden sm:grid place-items-center shrink-0 bg-surface-container text-primary"><Icon name={ICON[n.category] ?? 'description'} /></span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="px-2 py-0.5 rounded bg-surface-container font-label-uppercase text-label-uppercase text-on-surface-variant uppercase">{noteLabel(n.category)}</span>
            <span className="font-code-tabular text-[12px] text-secondary">#{entry.id.slice(0, 8)}</span>
            {n.score_value != null && <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-label-badge text-label-badge">Score {n.score_value}</span>}
          </span>
          <span className={`block font-body-lg text-body-lg font-semibold ${retired ? 'line-through text-outline' : 'text-primary'}`}>{title}</span>
          {!open && <span className={`block font-body-sm text-body-sm line-clamp-2 print:hidden ${retired ? 'line-through text-outline' : 'text-on-surface-variant'}`}>{n.text}</span>}
          <span className="flex sm:hidden flex-wrap gap-1 mt-1"><SourceBadge entry={entry} /><StatusBadge entry={entry} /></span>
          <span className="sm:hidden font-code-tabular text-body-sm text-secondary">{hm(entry.care_time)}</span>
        </span>
        <span className="hidden sm:flex flex-col items-end gap-1 shrink-0"><span className="font-code-tabular font-bold text-primary">{hm(entry.care_time)}</span><span className="flex gap-1"><SourceBadge entry={entry} /><StatusBadge entry={entry} /></span></span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-outline shrink-0 print:hidden" />
      </button>
      <div id={`note-body-${entry.id}`} className={`mx-space-md pb-space-md pt-space-md border-t border-card-border flex-col gap-space-sm ${open ? 'flex' : 'hidden print:flex'}`}>
        {n.score_name && (
          <div className="rounded-lg bg-surface-container-low p-space-sm flex flex-wrap items-baseline gap-x-space-sm">
            <span className="font-body-md text-body-md text-secondary">{n.score_name}</span><span className="font-code-tabular text-[28px] leading-none font-bold text-primary">{n.score_value ?? '—'}</span>
            <span className="basis-full font-body-sm text-body-sm text-secondary">The score as the nurse wrote it. The app does not work out or judge the score.</span>
          </div>
        )}
        <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] font-body-lg text-body-lg ${retired ? 'line-through text-outline' : 'text-on-surface'}`}>{n.text}</p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-lg gap-y-1 font-body-md text-body-md rounded-lg bg-surface-container-low p-space-sm">
          <dt className="text-secondary">Written by</dt><dd className="font-semibold">{who(entry.performer_id)}</dd>
          <dt className="text-secondary">Care time</dt><dd className="font-code-tabular">{dateTimeLabel(entry.care_time)}</dd>
          <dt className="text-secondary">Typed in</dt><dd className="font-code-tabular">{dateTimeLabel(entry.entry_time)}</dd>
          {entry.change_reason && <><dt className="text-secondary">{entry.status === 'entered-in-error' ? 'Mistake reason' : 'Fix reason'}</dt><dd>{entry.change_reason}</dd></>}
        </dl>
        <div className="flex flex-wrap gap-space-sm print:hidden">
          {entry.status === 'draft' && nurse && <ButtonLink to={`/capture/${entry.id}/confirm`}><Icon name="fact_check" />Check and confirm</ButtonLink>}
          <ButtonLink variant="secondary" to={`/entries/${entry.id}`}><Icon name="open_in_new" />Open details</ButtonLink>
          {entry.status === 'confirmed' && nurse && <ButtonLink variant="secondary" to={`/entries/${entry.id}/correct`}><Icon name="edit" />Fix</ButtonLink>}
          <ButtonLink variant="secondary" to={`${base}/timeline`}><Icon name="history" />History</ButtonLink>
        </div>
      </div>
    </li>
  );
}

/** Notes as cards with a writing panel beside them (Stitch "Nursing notes", minimal with expandable cards). */
export function NotesPage() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const location = useLocation();
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showRetired, setShowRetired] = useState(false);
  const [written, setWritten] = useState(0);
  const [justSaved, setJustSaved] = useState(false);
  const base = `/patients/${patient.id}`;
  const nurse = isNurse(user);
  const data = useLiveQuery(async () => {
    const [entries, staff, orders] = await Promise.all([
      listPatientEntries(db, patient.id), db.practitioner.toArray(),
      encounter ? db.active_order.where('encounter_id').equals(encounter.id).toArray() : Promise.resolve([]),
    ]);
    return { entries, names: new Map(staff.map((p) => [p.id, p.name])), orders: orders.filter((o) => o.status === 'active') };
  }, [db, patient.id, encounter?.id]);

  const notes = (data?.entries ?? []).filter((x) => x.entry.type === 'note' && x.child);
  const live = notes.filter((x) => !isRetiredStatus(x.entry.status));
  const retired = notes.length - live.length;
  const pool = showRetired ? notes : live;
  const shown = pool.filter((x) => tab === 'all' || (x.child as Note).category === tab);
  const count = (k: string) => (k === 'all' ? live.length : live.filter((x) => (x.child as Note).category === k).length);
  const tabs = [{ v: 'all', label: 'All notes' }, ...NOTE_CATEGORIES.filter((c) => count(c.v) > 0 || c.v === tab)];
  const alerts = (data?.orders ?? []).filter((o) => isHighAlert(o.drug_name));
  const care = (data?.orders ?? []).filter((o) => o.type === 'nursing' || o.type === 'lab');
  const photos = (data?.entries ?? []).filter((x) => x.entry.raw_input_kind === 'photo' && !isRetiredStatus(x.entry.status));
  const saved = justSaved || !!(location.state as { saved?: string } | null)?.saved;

  return (
    <>
      <div className="print:hidden"><Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Notes' }]} /></div>
      {saved && <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2 print:hidden"><Icon name="check_circle" filled />Saved on this laptop.</p>}
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-primary">Notes</h1>
        <div className="flex flex-wrap gap-space-sm print:hidden">
          <button type="button" className={PLAIN} onClick={() => setOpen(new Set(shown.map((x) => x.entry.id)))}><Icon name="unfold_more" className="text-[18px]" />Expand all</button>
          <button type="button" className={PLAIN} onClick={() => setOpen(new Set())}><Icon name="unfold_less" className="text-[18px]" />Collapse all</button>
          <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print notes</Button>
          {nurse && <ButtonLink to={`${base}/notes/new`}><Icon name="note_add" />New note</ButtonLink>}
        </div>
      </div>
      <div className="print:hidden"><PatientTabs patientId={patient.id} /></div>
      {alerts.length > 0 && (
        <div className="rounded-xl bg-surface-container-low border border-card-border p-space-md flex flex-wrap items-center gap-space-sm print:hidden">
          <span className="w-10 h-10 rounded-lg bg-primary-container text-white grid place-items-center shrink-0"><Icon name="syringe" /></span>
          <div className="flex-1 min-w-[12rem]">
            <p className="font-label-uppercase text-label-uppercase text-secondary uppercase flex items-center gap-2">High-alert order on the patient list</p>
            {alerts.map((o) => <p key={o.id} className="font-body-md text-body-md font-semibold text-primary">{o.text}</p>)}
          </div>
          <ButtonLink variant="secondary" to={`${base}/meds`}>Open MAR</ButtonLink>
        </div>
      )}
      <div role="group" aria-label="Note type" className={`${PANEL} !p-1.5 flex flex-wrap gap-1 print:hidden`}>
        {tabs.map((t) => (
          <button key={t.v} type="button" aria-pressed={tab === t.v} onClick={() => setTab(t.v)} className={`min-h-11 px-3 rounded-lg font-body-md text-body-md font-semibold ${tab === t.v ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}>{t.label}{data && ` (${count(t.v)})`}</button>
        ))}
        {retired > 0 && (
          <label className="ml-auto flex items-center gap-2 min-h-11 px-2 font-body-md text-body-md text-on-surface-variant"><input type="checkbox" className="w-5 h-5" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />Show old versions and mistakes ({retired})</label>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-space-md items-start print:block">
        <div className="min-w-0">
          {!data ? <p role="status">Loading…</p> : shown.length === 0 ? <div className={PANEL}><EmptyState text={notes.length === 0 ? 'No notes yet' : 'No notes of this type'} /></div> : (
            <ol aria-label="Notes" className="flex flex-col gap-space-sm print:block print:space-y-2">
              {shown.map((x) => <NoteCard key={x.entry.id} item={x} names={data.names} base={base} nurse={nurse} open={open.has(x.entry.id)}
                onToggle={() => setOpen((s) => { const n = new Set(s); if (n.has(x.entry.id)) n.delete(x.entry.id); else n.add(x.entry.id); return n; })} />)}
            </ol>
          )}
        </div>
        <div className="min-w-0 flex flex-col gap-space-md print:hidden">
          {nurse && (
            <section aria-label="Write a note" className="flex flex-col gap-space-sm">
              <div className={`${PANEL} flex flex-col gap-1`}>
                <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="edit_note" />Write a note</h2>
                <p className="font-body-sm text-body-sm text-secondary">Saved under {user?.name} after you review it. Nothing is written for you.</p>
              </div>
              <NoteEditor key={`${patient.id}-${written}`} initial={noteToForm()} minCareTime={encounter?.admit_time} saveLabel="Save note"
                onCancel={() => setWritten((n) => n + 1)} cancelLabel="Clear"
                onSubmit={async ({ values, careTime }) => {
                  await createEntry(db, clock, { userId: user!.id, deviceId }, { type: 'note', patientId: patient.id, careTime, values });
                  setJustSaved(true); setTab('all'); setWritten((n) => n + 1);
                }} />
              <div className={`${PANEL} flex flex-wrap items-center justify-between gap-2`}>
                <span className="flex items-center gap-2 font-body-md text-body-md text-on-surface"><Icon name="photo_camera" />Note on paper?</span>
                <ButtonLink variant="secondary" to={`${base}/capture`}>Photo of paper</ButtonLink>
              </div>
            </section>
          )}
          <section aria-label="Nursing and lab orders" className={`${PANEL} flex flex-col gap-space-sm`}>
            <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="assignment" />Nursing and lab orders</h2>
            {care.length === 0 ? <p className="font-body-md text-body-md text-secondary">None on the patient list.</p> : (
              <ul className="flex flex-col gap-1.5">{care.map((o) => <li key={o.id} className="rounded-lg bg-surface-container-low p-space-sm"><span className="block font-body-md text-body-md font-semibold text-primary">{o.text}</span>{o.scheduled_times?.length ? <span className="block font-body-sm text-body-sm text-on-surface-variant">Times on the order: {o.scheduled_times.join(', ')}</span> : null}</li>)}</ul>
            )}
            <p className="font-body-sm text-body-sm text-secondary">From the patient list. ClinBridge runs no timers.</p>
            <Link to={`${base}/orders`} className="self-start font-body-md text-body-md font-semibold text-primary underline">All orders</Link>
          </section>
          <section aria-label="Paper photos" className={`${PANEL} flex flex-col gap-space-sm`}>
            <div className="flex items-center justify-between gap-2"><h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="document_scanner" />Paper photos</h2><Badge>{photos.length}</Badge></div>
            {photos.length === 0 ? <p className="font-body-md text-body-md text-secondary">No record of this patient came from a paper photo.</p> : (
              <ul className="flex flex-col gap-1.5">{photos.map((x) => (
                <li key={x.entry.id}><Link to={`/entries/${x.entry.id}`} className="flex items-center gap-2 min-h-11 rounded-lg bg-surface-container-low hover:bg-surface-container p-space-sm"><Icon name="image" /><span className="flex-1 min-w-0"><span className="block font-body-md text-body-md font-semibold text-primary">{TYPE_LABEL[x.entry.type]} sheet</span><span className="block font-body-sm text-body-sm text-secondary">{hm(x.entry.care_time)} · {data?.names.get(x.entry.performer_id) ?? x.entry.performer_id}</span></span><Icon name="chevron_right" /></Link></li>
              ))}</ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
