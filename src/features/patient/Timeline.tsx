import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import { verifyChain } from '../../db/audit';
import { isNurse, useApp, useSession } from '../../state/app';
import { hm } from '../../lib/time';
import {
  HISTORY_FILTERS, careTeam, filterHistory, historyCounts, integritySummary, isRetiredStatus, recordedSequence,
  type HistoryFilter, type HistoryOrder,
} from '../../lib/history';
import { Breadcrumbs, ButtonLink, Card, EmptyState, Icon } from '../../components/ui';
import { TYPE_ICON, TYPE_LABEL, entrySummary } from '../entries/entryView';
import { ActionRow, BaselineCard, HistoryCard } from './HistoryCard';
import { PatientTabs } from './PatientTabs';
import { useCurrentPatient } from './PatientLayout';
import { fullName } from './patientData';
import { TrendChart } from '../../components/TrendChart';
import { SPO2_LOINC, vitalSeries, withBaseline } from '../../lib/vitalTrend';

const BASELINE = 'hospital-list';
const PLAIN = 'inline-flex items-center gap-1 min-h-11 px-3 rounded-lg border border-card-border bg-surface-container-lowest font-body-md text-body-md font-semibold text-primary hover:bg-surface-container-low';

/**
 * Patient history (Stitch "Patient History & Clinical Timeline", minimal with expandable cards).
 * Filters, counts and order come from the real records (src/lib/history.ts). The integrity panel shows
 * only what the records prove; there is no bedside-verification or countersignature step in ClinBridge.
 */
export function Timeline() {
  const { patient } = useCurrentPatient();
  const { db, event, clock } = useApp();
  const { user } = useSession();
  const entries = useLiveQuery(() => listPatientEntries(db, patient.id), [db, patient.id]);
  const staff = useLiveQuery(() => db.practitioner.toArray(), [db]);
  const names = useMemo(() => new Map((staff ?? []).map((p) => [p.id, p.name])), [staff]);
  const work = useLiveQuery(async () => new Map((await db.worklist_item.where('patient_id').equals(patient.id).toArray()).map((w) => [w.entry_id, w])), [db, patient.id]);
  const baseline = useLiveQuery(async () => (await db.snapshot_result.where('patient_id').equals(patient.id).toArray()).sort((a, b) => b.time.localeCompare(a.time)), [db, patient.id]);
  const chain = useLiveQuery(async () => verifyChain(await db.audit_log.orderBy('seq').toArray()), [db]);
  const spo2 = useMemo(() => withBaseline(vitalSeries(entries ?? [], patient.id, 'spo2'), baseline ?? [], patient.id, SPO2_LOINC), [entries, baseline, patient.id]);

  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [order, setOrder] = useState<HistoryOrder>('newest');
  const [search, setSearch] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const all = entries ?? [];
  const text = (x: EntryWithChild) => `${TYPE_LABEL[x.entry.type]} ${entrySummary(x)} ${names.get(x.entry.performer_id) ?? ''}`;
  const visible = useMemo(() => filterHistory(all, { filter, order, search, showRetired }, text),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, filter, order, search, showRetired, names]);
  const counts = historyCounts(all);
  const retiredCount = all.filter((x) => isRetiredStatus(x.entry.status)).length;
  const integrity = integritySummary(all);
  const team = careTeam(all);
  const sequence = recordedSequence(all);
  const base = `/patients/${patient.id}`;
  const nurse = isNurse(user);
  const showBaseline = filter === 'all' && !search && !!baseline && baseline.length > 0;
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <div className="print:hidden"><Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'History' }]} /></div>
      <div className="flex flex-wrap items-end justify-between gap-space-sm">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary">History</h1>
          <p className="font-body-md text-secondary">
            {event ? <>Downtime {hm(event.declared_at)} – {event.ended_at ? hm(event.ended_at) : `now (${hm(clock.nowIso())})`} · </> : null}
            {counts.all} current record{counts.all === 1 ? '' : 's'}{integrity.pendingConfirmation ? ` · ${integrity.pendingConfirmation} to check` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-space-sm print:hidden">
          <ButtonLink variant="secondary" to={`${base}/handoff`}><Icon name="swap_horiz" />Handover</ButtonLink>
          <ButtonLink variant="secondary" to={`${base}/body`}><Icon name="accessibility_new" />Body map</ButtonLink>
          <ButtonLink variant="secondary" to={`${base}/labs`}><Icon name="science" />Labs</ButtonLink>
          <ButtonLink variant="secondary" to={`${base}/orders`}><Icon name="list_alt" />Orders</ButtonLink>
        </div>
      </div>

      <div className="print:hidden"><PatientTabs patientId={patient.id} /></div>

      <section aria-label="History filters" className="bg-surface-container-lowest rounded-xl border border-card-border p-space-sm shadow-sm flex flex-wrap items-center gap-space-sm print:hidden">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Record type">
          {HISTORY_FILTERS.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
              className={`min-h-11 px-3 rounded-lg font-body-md text-body-md font-semibold ${filter === f.key ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
              {f.label}{entries !== undefined && <> <span className="font-code-tabular">({counts[f.key]})</span></>}
            </button>
          ))}
        </div>
        <span className="flex flex-wrap gap-1">
          <button type="button" className={PLAIN} onClick={() => setOpen(new Set([...visible.map((x) => x.entry.id), BASELINE]))}><Icon name="unfold_more" className="text-[18px]" />Expand all</button>
          <button type="button" className={PLAIN} onClick={() => setOpen(new Set())}><Icon name="unfold_less" className="text-[18px]" />Collapse all</button>
        </span>
        <span className="flex flex-wrap flex-1 items-center justify-end gap-space-sm">
          <label className="flex-1 min-w-[min(100%,15rem)] max-w-md flex items-center gap-2 h-11 rounded-lg border border-card-border px-space-sm bg-surface-container-lowest">
            <Icon name="search" className="text-secondary" />
            <span className="sr-only">Search history</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search history" className="flex-1 min-w-0 bg-transparent outline-none font-body-md text-body-md" />
          </label>
          <span className="flex rounded-lg bg-surface-container-low overflow-hidden" role="group" aria-label="Order">
            {(['newest', 'oldest'] as HistoryOrder[]).map((o) => (
              <button key={o} type="button" aria-pressed={order === o} onClick={() => setOrder(o)}
                className={`h-11 px-3 font-body-md text-body-md font-semibold ${order === o ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                {o === 'newest' ? 'Newest first' : 'Oldest first'}
              </button>
            ))}
          </span>
        </span>
        {retiredCount > 0 && (
          <label className="basis-full flex items-center gap-2 min-h-9 font-body-md text-body-md text-on-surface-variant">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} className="w-5 h-5" />
            Show old versions and mistakes ({retiredCount}), crossed out
          </label>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-md items-start">
        <div className="xl:col-span-8 min-w-0 flex flex-col gap-space-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-space-md gap-y-1">
            <h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase flex items-center gap-2"><span aria-hidden className="w-2.5 h-2.5 rounded-full bg-primary" />Records on this laptop, by time of care</h2>
            {entries !== undefined && <p className="font-body-sm text-body-sm text-secondary">{integrity.confirmed} confirmed · {integrity.pendingConfirmation} to check</p>}
          </div>
          {entries === undefined ? <p role="status">Loading…</p> : visible.length === 0 ? (
            <EmptyState text={all.length === 0 ? 'Nothing recorded yet' : 'No records match these filters'} />
          ) : (
            <ol className="flex flex-col gap-space-sm" aria-label="Records">
              {visible.map((x) => <HistoryCard key={x.entry.id} item={x} open={open.has(x.entry.id)} onToggle={() => toggle(x.entry.id)} names={names} work={work?.get(x.entry.id)} base={base} nurse={nurse} />)}
            </ol>
          )}
          {showBaseline && <BaselineCard results={baseline} open={open.has(BASELINE)} onToggle={() => toggle(BASELINE)} />}
        </div>

        <aside className="xl:col-span-4 min-w-0 flex flex-col gap-space-md" aria-label="Charting integrity">
          <section className="rounded-xl bg-primary-container text-white p-space-md shadow-sm flex flex-col gap-space-sm print:bg-white print:text-black print:border print:border-black">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-headline-sm text-headline-sm flex items-center gap-2"><Icon name="verified_user" />Charting integrity</h2>
              <span className={`px-2 py-0.5 rounded font-label-badge text-label-badge font-bold ${!chain ? 'bg-white/15' : chain.ok ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-error text-on-error'}`}>{!chain ? 'Checking…' : chain.ok ? 'Log intact' : 'Log broken'}</span>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 font-body-md text-body-md">
              <dt>Confirmed records</dt><dd className="font-code-tabular font-bold">{integrity.confirmed}</dd>
              <dt>Confirmation pending (drafts)</dt><dd className="font-code-tabular font-bold">{integrity.pendingConfirmation}</dd>
              <dt>Fixed (old versions kept)</dt><dd className="font-code-tabular">{integrity.oldVersions}</dd>
              <dt>Marked as mistake</dt><dd className="font-code-tabular">{integrity.mistakes}</dd>
              <dt>Typed from a paper photo</dt><dd className="font-code-tabular">{integrity.fromPhoto}</dd>
              <dt>Started from an AI or simulated proposal</dt><dd className="font-code-tabular">{integrity.aiProposed}</dd>
            </dl>
            {sequence.length > 0 && (
              <div>
                <h3 className="font-label-uppercase text-label-uppercase uppercase opacity-80">Recorded sequence</h3>
                <ol className="mt-1 flex flex-wrap gap-1">
                  {sequence.map((s) => <li key={s.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/15 font-code-tabular text-[12px] font-semibold print:border print:border-black"><Icon name={TYPE_ICON[s.type]} className="text-[14px]" />{hm(s.time)}</li>)}
                </ol>
              </div>
            )}
            <p className="font-body-md text-body-md flex items-center gap-1 font-semibold">
              <Icon name={chain ? (chain.ok ? 'verified' : 'gpp_bad') : 'hourglass_empty'} />
              {chain ? (chain.ok ? `Change log intact: ${chain.verified} of ${chain.total} rows verified` : `Change log broken at row ${chain.brokenAtSeq}`) : 'Checking change log…'}
            </p>
            <p className="font-body-sm text-body-sm opacity-90" data-testid="integrity-note">Each record shows the staff member it is attributed to and when it was typed in, as stored with the record. The change-log check shows only that the log's hash chain is unbroken; it does not show who was at the bedside. ClinBridge has no bedside-verification or doctor-countersignature step, so neither is shown.</p>
          </section>

          <Card className="flex flex-col gap-space-sm shadow-sm print:hidden" aria-label="History actions">
            <h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase">Actions</h2>
            {nurse && <ActionRow dark to={`${base}/notes/new`} icon="post_add" label="Add a note (any past time)" />}
            {nurse && <ActionRow to={`${base}/capture`} icon="photo_camera" label="Photo of paper" />}
            <button type="button" onClick={() => window.print()} className="flex items-center gap-space-sm min-h-11 px-space-md rounded-lg bg-surface-container-low text-primary hover:bg-surface-container font-body-md text-body-md font-semibold text-left">
              <Icon name="print" /><span className="flex-1">Print history</span><span className="font-body-sm text-body-sm font-normal text-secondary">or save as PDF</span>
            </button>
          </Card>

          <Card className="flex flex-col gap-space-sm shadow-sm" aria-label="Care team">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase">Care team (current records)</h2>
              {team.length > 0 && <span className="font-body-sm text-body-sm text-secondary">{team.length} {team.length === 1 ? 'person' : 'people'}</span>}
            </div>
            {team.length === 0 ? <p className="text-secondary font-body-md">No one has recorded anything yet.</p> : (
              <ul className="flex flex-col gap-1.5">
                {team.map((t) => {
                  const p = staff?.find((x) => x.id === t.performerId);
                  return (
                    <li key={t.performerId} className="flex items-center gap-space-sm rounded-lg bg-surface-container-low p-2">
                      <span aria-hidden className="w-10 h-10 shrink-0 rounded-lg bg-primary-container text-white grid place-items-center font-bold">{p?.initials ?? '?'}</span>
                      <span className="flex-1 min-w-0"><span className="block font-body-md text-body-md font-semibold text-primary">{p?.name ?? t.performerId}</span><span className="block font-body-sm text-body-sm text-secondary">{p?.role ?? ''}</span></span>
                      <span className="px-2 py-0.5 rounded bg-surface-container font-label-badge text-label-badge text-on-surface-variant">{t.entries} record{t.entries === 1 ? '' : 's'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-space-sm shadow-sm" aria-label="Oxygen level (SpO₂) trend">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase">Oxygen level (SpO₂)</h2>
              <ButtonLink variant="secondary" className="print:hidden" to={`${base}/vitals`}>Vitals</ButtonLink>
            </div>
            {entries === undefined ? <p role="status" className="text-secondary">Loading…</p> : (
              <>
                {spo2.latest && (
                  <dl className="flex flex-wrap items-end gap-x-space-md gap-y-1 font-body-md text-body-md" data-testid="spo2-summary">
                    <div><dt className="font-body-sm text-body-sm text-secondary">Latest confirmed</dt><dd className="font-code-tabular font-bold text-primary"><span className="text-[32px] leading-none">{spo2.latest.value}%</span> <span className="font-normal text-body-md text-secondary">at {hm(spo2.latest.time)}</span></dd></div>
                    {spo2.lowest && spo2.confirmed.length > 1 && <div><dt className="font-body-sm text-body-sm text-secondary">Lowest confirmed</dt><dd className="font-code-tabular font-semibold">{spo2.lowest.value}% <span className="font-normal text-secondary">at {hm(spo2.lowest.time)}</span></dd></div>}
                    {spo2.lowest && spo2.confirmed.length > 1 && spo2.latest.value !== spo2.lowest.value && <div><dt className="font-body-sm text-body-sm text-secondary">Latest vs lowest</dt><dd className="font-code-tabular font-semibold">{spo2.latest.value > spo2.lowest.value ? '+' : ''}{spo2.latest.value - spo2.lowest.value} points</dd></div>}
                  </dl>
                )}
                <TrendChart series={spo2} label="SpO₂" unit="%" testId="spo2-trend" />
                <p className="font-body-sm text-body-sm text-secondary">Line: confirmed vital-sign records on this laptop (old versions and mistakes left out). Square: the hospital patient list before the outage. No target line or score is shown.</p>
              </>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
