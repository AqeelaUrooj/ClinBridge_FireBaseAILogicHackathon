import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import { verifyChain } from '../../db/audit';
import { isNurse, useApp, useSession } from '../../state/app';
import { dateTimeLabel, hm } from '../../lib/time';
import {
  HISTORY_FILTERS, careTeam, filterHistory, historyCounts, integritySummary, isRetiredStatus, recordedSequence,
  type HistoryFilter, type HistoryOrder,
} from '../../lib/history';
import { Badge, Breadcrumbs, ButtonLink, Card, EmptyState, Icon } from '../../components/ui';
import { EntryValues } from '../entries/EntryPages';
import { SourceBadge, StatusBadge, TYPE_ICON, TYPE_LABEL, entrySummary } from '../entries/entryView';
import { useCurrentPatient } from './PatientLayout';
import { fullName } from './patientData';

/**
 * Patient history (Stitch "Patient History & Clinical Timeline", minimal with expandable cards).
 * Filters, counts and order come from the real records (src/lib/history.ts). The integrity panel shows
 * only what the records prove; there is no bedside-verification or countersignature step in DowntimeKit.
 */
export function Timeline() {
  const { patient } = useCurrentPatient();
  const { db, event, clock } = useApp();
  const { user } = useSession();
  const entries = useLiveQuery(() => listPatientEntries(db, patient.id), [db, patient.id]);
  const names = useLiveQuery(async () => new Map((await db.practitioner.toArray()).map((p) => [p.id, p.name])), [db]) ?? new Map<string, string>();
  const baseline = useLiveQuery(async () => (await db.snapshot_result.where('patient_id').equals(patient.id).toArray()).sort((a, b) => b.time.localeCompare(a.time)), [db, patient.id]);
  const chain = useLiveQuery(async () => verifyChain(await db.audit_log.orderBy('seq').toArray()), [db]);

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
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'History' }]} />
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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
        <div className="xl:col-span-8 flex flex-col gap-space-md">
          <Card className="flex flex-col gap-space-sm print:hidden" aria-label="History filters">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Record type">
              {HISTORY_FILTERS.map((f) => (
                <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
                  className={`min-h-9 px-3 rounded font-body-md font-semibold border ${filter === f.key ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-lowest text-on-surface-variant border-card-border hover:bg-surface-container-low'}`}>
                  {f.label}{entries !== undefined && <> <span className="font-code-tabular">({counts[f.key]})</span></>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-space-sm">
              <label className="flex-1 min-w-[220px] flex items-center gap-2 h-10 rounded-lg border border-card-border px-space-sm bg-surface-container-lowest">
                <Icon name="search" className="text-secondary" />
                <span className="sr-only">Search history</span>
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search history (drug, value, nurse…)" className="flex-1 bg-transparent outline-none font-body-md" />
              </label>
              <div className="flex rounded-lg border border-card-border overflow-hidden" role="group" aria-label="Order">
                {(['newest', 'oldest'] as HistoryOrder[]).map((o) => (
                  <button key={o} type="button" aria-pressed={order === o} onClick={() => setOrder(o)}
                    className={`h-10 px-3 font-body-md font-semibold ${order === o ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'}`}>
                    {o === 'newest' ? 'Newest first' : 'Oldest first'}
                  </button>
                ))}
              </div>
              <button type="button" className="h-10 px-3 rounded-lg border border-card-border font-body-md font-semibold text-primary hover:bg-surface-container-low"
                onClick={() => setOpen(new Set(visible.map((x) => x.entry.id)))}>Expand all</button>
              <button type="button" className="h-10 px-3 rounded-lg border border-card-border font-body-md font-semibold text-primary hover:bg-surface-container-low"
                onClick={() => setOpen(new Set())}>Collapse all</button>
            </div>
            {retiredCount > 0 && (
              <label className="flex items-center gap-2 font-body-md text-on-surface-variant">
                <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} className="w-5 h-5" />
                Show old versions and mistakes ({retiredCount}), crossed out
              </label>
            )}
          </Card>

          {entries === undefined ? <p role="status">Loading…</p> : visible.length === 0 ? (
            <EmptyState text={all.length === 0 ? 'Nothing recorded yet' : 'No records match these filters'} />
          ) : (
            <ol className="flex flex-col gap-space-sm" aria-label="Records">
              {visible.map((x) => {
                const { entry } = x;
                const isOpen = open.has(entry.id);
                const retired = isRetiredStatus(entry.status);
                const lateBy = Math.round((Date.parse(entry.entry_time) - Date.parse(entry.care_time)) / 60_000);
                return (
                  <li key={entry.id} className={`bg-surface-container-lowest rounded-xl border ${entry.status === 'draft' ? 'border-downtime-amber-border' : 'border-card-border'}`} data-testid={`history-${entry.id}`}>
                    <button type="button" aria-expanded={isOpen} aria-controls={`body-${entry.id}`} onClick={() => toggle(entry.id)}
                      className="w-full flex items-center gap-space-md min-h-[60px] px-space-md py-space-sm text-left hover:bg-surface-container-low rounded-xl">
                      <span className="w-12 font-code-tabular text-[13px] font-bold text-primary">{hm(entry.care_time)}</span>
                      <span className="w-9 h-9 rounded-lg bg-surface-container-low grid place-items-center text-secondary shrink-0"><Icon name={TYPE_ICON[entry.type]} className="text-[20px]" /></span>
                      <span className="flex-1 min-w-0">
                        <span className={`block truncate font-body-lg text-body-lg ${retired ? 'line-through text-outline' : 'text-on-surface'}`}>{entrySummary(x)}</span>
                        <span className="block font-body-sm text-body-sm text-secondary">{TYPE_LABEL[entry.type]} · {names.get(entry.performer_id) ?? entry.performer_id}{entry.raw_input_kind === 'photo' ? ' · from paper photo' : ''}</span>
                      </span>
                      <SourceBadge entry={entry} />
                      <StatusBadge entry={entry} />
                      <Icon name={isOpen ? 'expand_less' : 'expand_more'} className="text-outline" />
                    </button>
                    {isOpen && (
                      <div id={`body-${entry.id}`} className="px-space-md pb-space-md flex flex-col gap-space-sm">
                        <EntryValues item={x} names={names} />
                        <dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-1 font-body-md">
                          <dt className="text-secondary">Measured / given</dt><dd className="font-code-tabular">{dateTimeLabel(entry.care_time)}</dd>
                          <dt className="text-secondary">Typed in</dt><dd className="font-code-tabular">{dateTimeLabel(entry.entry_time)}{lateBy >= 5 ? ` (${lateBy} min later)` : ''}</dd>
                          <dt className="text-secondary">Laptop · number</dt><dd className="font-code-tabular">{entry.device_id} · #{entry.counter}</dd>
                          {entry.change_reason && <><dt className="text-secondary">{entry.status === 'entered-in-error' ? 'Mistake reason' : 'Fix reason'}</dt><dd>{entry.change_reason}</dd></>}
                        </dl>
                        <div className="flex flex-wrap gap-space-sm print:hidden">
                          <ButtonLink variant="secondary" to={`/entries/${entry.id}`}><Icon name="open_in_new" />Open details</ButtonLink>
                          {entry.status === 'draft' && isNurse(user) && <ButtonLink to={`/capture/${entry.id}/confirm`}><Icon name="fact_check" />Check and confirm</ButtonLink>}
                          {entry.status === 'confirmed' && isNurse(user) && <ButtonLink variant="secondary" to={`/entries/${entry.id}/correct`}><Icon name="edit" />Fix</ButtonLink>}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {filter === 'all' && !search && baseline && baseline.length > 0 && (
            <Card aria-label="Hospital patient list before the outage">
              <h2 className="font-headline-sm text-headline-sm text-primary">Hospital patient list (before the outage)</h2>
              <p className="font-body-sm text-secondary mb-space-sm">Read only. Copied from the hospital system when the patient list was taken; not entered on this laptop.</p>
              <ul className="flex flex-col">
                {baseline.map((r) => (
                  <li key={r.id} className="flex items-center gap-space-md min-h-[44px] border-b border-card-border last:border-0 px-space-sm">
                    <span className="w-28 font-code-tabular text-[13px] text-secondary">{dateTimeLabel(r.time).replace(/, \d+ \w+ \d+$/, '')}</span>
                    <span className="flex-1">{r.name}</span>
                    <span className="font-code-tabular font-semibold">{r.value_num ?? r.value_text ?? '—'} {r.unit ?? ''}</span>
                    {r.abnormal_flag && r.abnormal_flag !== 'normal' && <Badge tone={r.abnormal_flag === 'critical' ? 'red' : 'amber'}>{r.abnormal_flag}</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <aside className="xl:col-span-4 flex flex-col gap-space-md" aria-label="Charting integrity">
          <Card className="flex flex-col gap-space-sm">
            <h2 className="font-headline-sm text-headline-sm text-primary">Charting integrity</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 font-body-md">
              <dt>Confirmed records</dt><dd className="font-code-tabular font-semibold">{integrity.confirmed}</dd>
              <dt>Confirmation pending (drafts)</dt><dd className={`font-code-tabular font-semibold ${integrity.pendingConfirmation ? 'text-[#7a5410]' : ''}`}>{integrity.pendingConfirmation}</dd>
              <dt>Fixed (old versions kept)</dt><dd className="font-code-tabular">{integrity.oldVersions}</dd>
              <dt>Marked as mistake</dt><dd className="font-code-tabular">{integrity.mistakes}</dd>
              <dt>Typed from a paper photo</dt><dd className="font-code-tabular">{integrity.fromPhoto}</dd>
              <dt>Started from an AI or simulated proposal</dt><dd className="font-code-tabular">{integrity.aiProposed}</dd>
            </dl>
            <p className={`font-body-md flex items-center gap-1 ${chain ? (chain.ok ? 'text-sync-green' : 'text-error font-semibold') : 'text-secondary'}`}>
              <Icon name={chain ? (chain.ok ? 'verified' : 'gpp_bad') : 'hourglass_empty'} />
              {chain ? (chain.ok ? `Change log intact: ${chain.verified} of ${chain.total} rows verified` : `Change log broken at row ${chain.brokenAtSeq}`) : 'Checking change log…'}
            </p>
            <p className="font-body-sm text-secondary">Every record here was saved by a signed-in nurse with their PIN. DowntimeKit has no bedside-verification or doctor-countersignature step, so neither is shown.</p>
            {sequence.length > 0 && (
              <div>
                <span className="font-label-uppercase text-label-uppercase text-secondary uppercase">Recorded sequence</span>
                <ol className="mt-1 flex flex-wrap gap-1">
                  {sequence.map((s) => <li key={s.id}><Badge icon={TYPE_ICON[s.type]}><span className="font-code-tabular">{hm(s.time)}</span></Badge></li>)}
                </ol>
              </div>
            )}
          </Card>
          <Card className="flex flex-col gap-space-sm">
            <h2 className="font-headline-sm text-headline-sm text-primary">Care team (current records)</h2>
            {team.length === 0 ? <p className="text-secondary font-body-md">No one has recorded anything yet.</p> : (
              <ul className="flex flex-col gap-1">
                {team.map((t) => (
                  <li key={t.performerId} className="flex items-center justify-between font-body-md">
                    <span>{names.get(t.performerId) ?? t.performerId}</span>
                    <span className="font-code-tabular text-secondary">{t.entries} record{t.entries === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="flex flex-col gap-space-sm print:hidden">
            <h2 className="font-headline-sm text-headline-sm text-primary">Actions</h2>
            {isNurse(user) && <ButtonLink to={`${base}/notes/new`}><Icon name="edit_note" />Add a note (any past time)</ButtonLink>}
            <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg font-body-md font-semibold border border-outline-variant text-primary hover:bg-surface-container-low"><Icon name="print" />Print history</button>
            <Link to={`${base}/capture`} className="font-body-md text-secondary underline">Photo of paper</Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
