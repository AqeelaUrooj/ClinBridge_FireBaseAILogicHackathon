import type { ReactNode } from 'react';
import { allergyState } from '../../lib/admission';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import type { ActiveOrder, Practitioner, SnapshotResult } from '../../db/schema';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import { listHandoffs, type HandoffWithTime } from '../../db/repos/handoff';
import { isNurse, useApp, useSession } from '../../state/app';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { VITAL_RULES, isUnusual, type VitalKey } from '../../lib/vitals';
import { SPO2_LOINC, vitalSeries, withBaseline } from '../../lib/vitalTrend';
import { Badge, Button, ButtonLink, EmptyState, Icon } from '../../components/ui';
import { TrendChart } from '../../components/TrendChart';
import { useCurrentPatient } from '../patient/PatientLayout';
import { PatientTabs } from '../patient/PatientTabs';
import { StatusBadge, TYPE_ICON, TYPE_LABEL, entrySummary } from '../entries/entryView';
import { flowRows, tile, type FlowRow } from '../vitals/flowsheetData';
import { linkedRecords, medLines, type LinkedRecord } from './handoffData';

/** One letter of SBAR, as on the Stitch handover. */
export function LetterCard({ letter, title, aside, children }: { letter: string; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm flex flex-col gap-space-sm break-inside-avoid-page print:border-black print:shadow-none print:block">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-container-low p-space-sm print:bg-white print:p-0">
        <div className="flex items-center gap-space-sm min-w-0">
          <span aria-hidden className="w-8 h-8 shrink-0 rounded bg-primary text-on-primary grid place-items-center font-bold text-[18px] print:border print:border-black print:bg-white print:text-black">{letter}</span>
          {title}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
export const cardTitle = 'font-headline-sm text-headline-sm text-primary print:text-black';
const Said = ({ children }: { children: ReactNode }) => <div className="rounded-lg bg-surface-container-low p-space-md font-body-lg text-body-lg text-on-surface whitespace-pre-wrap [overflow-wrap:anywhere] print:bg-white print:p-0 print:mt-2 print:text-black">{children}</div>;

/** The saved words of a handover. Used for the check before saving and for a saved handover. */
export function SavedText({ situation, background, assessment, openItems, afterBackground, afterAssessment }: {
  situation: string; background: string; assessment: string; openItems: string[]; afterBackground?: ReactNode; afterAssessment?: ReactNode;
}) {
  return (
    <>
      <LetterCard letter="S" title={<h2 className={cardTitle}>Situation</h2>}><Said>{situation}</Said></LetterCard>
      <LetterCard letter="B" title={<h2 className={cardTitle}>Background</h2>}><Said>{background}</Said>{afterBackground}</LetterCard>
      <LetterCard letter="A" title={<h2 className={cardTitle}>Assessment</h2>}><Said>{assessment}</Said>{afterAssessment}</LetterCard>
      <LetterCard letter="R" title={<h2 className={cardTitle}>Recommendation, open items</h2>} aside={<span className="font-label-uppercase text-label-uppercase text-secondary uppercase">{openItems.length === 1 ? '1 open item' : `${openItems.length} open items`}</span>}>
        {openItems.length ? (
          <ul className="flex flex-col gap-1.5">
            {openItems.map((x, i) => (
              <li key={i} className="flex items-start gap-space-sm rounded-lg bg-surface-container-low p-space-md font-body-lg text-body-lg [overflow-wrap:anywhere] print:bg-white print:p-1 print:text-black">
                <Icon name="chevron_right" className="text-secondary print:hidden" /><span aria-hidden className="hidden print:inline-block w-4 h-4 shrink-0 border border-black mt-0.5" />{x}
              </li>
            ))}
          </ul>
        ) : <p className="font-body-md text-body-md text-secondary print:text-black">None</p>}
      </LetterCard>
    </>
  );
}

/** Linked confirmed records. A record that was fixed or marked as a mistake later says so, on screen and on paper. */
export function LinkedTrail({ records }: { records: LinkedRecord[] }) {
  const changed = records.filter((r) => r.changed).length;
  return (
    <section aria-label="Linked records" className="min-w-0 bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm flex flex-col gap-space-sm print:border-black print:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${cardTitle} flex items-center gap-2`}><Icon name="link" className="print:hidden" />Linked confirmed records</h2>
        <span className="font-body-sm text-body-sm text-secondary print:text-black">{records.length} linked</span>
      </div>
      {changed > 0 && (
        <p role="note" className="rounded-lg border border-downtime-amber-border bg-downtime-amber-bg p-space-sm font-body-md text-body-md text-[#6b4a0e] flex items-start gap-2 print:border-black print:bg-white print:text-black">
          <Icon name="warning" className="text-[20px]" /><span><strong>{changed === 1 ? 'One linked record was' : `${changed} linked records were`} changed after this handover was written.</strong> The words of the handover were not changed. Read the new version.</span>
        </p>
      )}
      {records.length === 0 ? <p className="font-body-md text-body-md text-secondary print:text-black">None linked</p> : (
        <ul className="flex flex-col gap-1.5">
          {records.map((r) => (
            <li key={r.id} className={`rounded-lg p-space-sm flex flex-col gap-1 break-inside-avoid print:bg-white print:p-1 ${r.changed ? 'bg-downtime-amber-bg' : 'bg-surface-container-low'}`}>
              {!r.item ? <span className="font-body-md text-body-md text-secondary">Record {r.id} is not on this laptop.</span> : (
                <>
                  <span className="flex items-center justify-between gap-2 font-body-sm text-body-sm text-secondary print:text-black">
                    <span className="flex items-center gap-1 font-semibold"><Icon name={TYPE_ICON[r.item.entry.type]} className="text-[18px] print:hidden" />{TYPE_LABEL[r.item.entry.type]} · {r.item.entry.id.slice(0, 8)}</span>
                    <span className="font-code-tabular font-bold text-primary print:text-black">{dateTimeLabel(r.item.entry.care_time)}</span>
                  </span>
                  <Link to={`/entries/${r.item.entry.id}`} className={`font-body-md text-body-md font-semibold underline-offset-2 hover:underline [overflow-wrap:anywhere] print:text-black ${r.changed ? 'line-through text-on-surface-variant' : 'text-primary'}`}>{entrySummary(r.item)}</Link>
                  <span className="flex flex-wrap items-center gap-2"><StatusBadge entry={r.item.entry} />
                    {r.newest && <Link to={`/entries/${r.newest.entry.id}`} className="font-body-md text-body-md font-semibold text-primary underline [overflow-wrap:anywhere] print:text-black">Now: {entrySummary(r.newest)}</Link>}
                    {r.changed && !r.newest && <span className="font-body-md text-body-md font-semibold text-[#6b4a0e] print:text-black">Do not use: marked as a mistake</span>}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------ Facts now (never part of the saved words) ------------------------------ */

function NowBox({ at, title, children, to, link }: { at: string; title: string; children: ReactNode; to: string; link: string }) {
  return (
    <section aria-label={title} className="min-w-0 rounded-lg border border-card-border p-space-sm flex flex-col gap-2 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-label-uppercase text-label-uppercase text-secondary uppercase">{title}</h3>
        <span className="font-body-sm text-body-sm text-secondary">Now, {at}. Not part of the saved words. <Link to={to} className="font-semibold text-primary underline">{link}</Link></span>
      </div>
      {children}
    </section>
  );
}

const MEASURES: { k: VitalKey; label: string; icon: string }[] = [{ k: 'spo2', label: 'Oxygen level', icon: 'air' }, { k: 'heart_rate', label: 'Pulse', icon: 'favorite' }, { k: 'resp_rate', label: 'Breathing', icon: 'airwave' }, { k: 'temp_c', label: 'Temperature', icon: 'thermometer' }];
const show = (r: FlowRow, k: VitalKey) => (r.values[k] == null ? '—' : String(r.values[k]));

function VitalsNow({ rows, entries, results, linked, names, base, at, patientId }: { rows: FlowRow[]; entries: EntryWithChild[]; results: SnapshotResult[]; linked: Set<string>; names: Map<string, string>; base: string; at: string; patientId: string }) {
  const table = rows.filter((r) => r.kind === 'confirmed' || r.kind === 'baseline').reverse();
  const drafts = rows.filter((r) => r.kind === 'draft').length;
  return (
    <NowBox at={at} title="Vital signs" to={`${base}/vitals`} link="Open vitals">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {MEASURES.map(({ k, label, icon }) => {
          const { latest, before } = tile(rows, k);
          const out = !!latest && isUnusual(k, latest.n);
          return (
            <div key={k} className={`min-w-0 rounded-lg p-space-sm flex flex-col gap-0.5 ${out ? 'bg-downtime-amber-bg border border-downtime-amber-border' : 'bg-surface-container-low border border-transparent'}`}>
              <dt className="flex items-center justify-between gap-1 font-label-uppercase text-label-uppercase text-secondary uppercase">{label}<Icon name={icon === 'airwave' ? 'pulmonology' : icon} className="text-[18px]" /></dt>
              <dd className="font-code-tabular text-[28px] leading-tight font-bold text-primary">{latest ? latest.value : '—'}{latest && <span className="text-body-sm font-normal text-secondary"> {VITAL_RULES[k].unit}</span>}</dd>
              <dd className="font-body-sm text-body-sm text-on-surface-variant">{latest ? `${hm(latest.time)}${before ? ` · before ${before.value}` : ''}` : 'Not recorded'}</dd>
              {out && <dd><Badge tone="amber" icon="warning">Unusual</Badge></dd>}
            </div>
          );
        })}
      </dl>
      {table.length === 0 ? <p className="font-body-md text-body-md text-secondary">No vital signs recorded.</p> : (
        <div role="region" aria-label="Vital signs table, scroll for more" tabIndex={0} className="overflow-auto max-h-80 rounded-lg bg-surface-container-low">
          <table className="w-full min-w-[36rem] font-body-sm text-body-sm text-left">
            <caption className="sr-only">Newest confirmed vital signs, oldest first</caption>
            <thead className="text-secondary uppercase"><tr>{['Time', 'BP', 'Pulse', 'Breathing', 'Oxygen given', 'SpO₂', 'Temp', 'By'].map((h) => <th key={h} scope="col" className="px-2 py-2 font-label-uppercase text-label-uppercase">{h}</th>)}</tr></thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.id} className={`border-t border-card-border ${linked.has(r.id) ? 'bg-secondary-fixed/50' : ''}`}>
                  <th scope="row" className="px-2 py-2 font-code-tabular font-bold text-primary whitespace-nowrap">{hm(r.time)}</th>
                  <td className="px-2 py-2 font-code-tabular">{r.values.bp_systolic != null ? `${r.values.bp_systolic}/${r.values.bp_diastolic ?? '?'}` : '—'}</td>
                  <td className="px-2 py-2 font-code-tabular">{show(r, 'heart_rate')}</td>
                  <td className="px-2 py-2 font-code-tabular">{show(r, 'resp_rate')}</td>
                  <td className="px-2 py-2">{r.values.o2_device ? `${r.values.o2_device}${r.values.o2_flow_lpm != null ? ` ${r.values.o2_flow_lpm} L/min` : ''}` : '—'}</td>
                  <td className="px-2 py-2 font-code-tabular font-bold">{r.values.spo2 != null ? `${r.values.spo2}%` : '—'}</td>
                  <td className="px-2 py-2 font-code-tabular">{r.values.temp_c != null ? `${r.values.temp_c}°C` : '—'}</td>
                  <td className="px-2 py-2">{r.kind === 'baseline' ? 'Hospital list' : <>{names.get(r.item?.entry.performer_id ?? '') ?? '—'}{linked.has(r.id) && <span className="block font-semibold text-primary">Linked here</span>}</>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TrendChart series={withBaseline(vitalSeries(entries, patientId, 'spo2'), results, patientId, SPO2_LOINC)} label="SpO₂" unit="%" testId="handover-spo2" table={false} />
      <p className="font-body-sm text-body-sm text-secondary">Confirmed records and the hospital list only{drafts ? `; ${drafts} draft${drafts === 1 ? ' is' : 's are'} left out` : ''}. “Unusual” uses draft ranges that are not clinically approved yet. No score or target is shown.</p>
    </NowBox>
  );
}

/* ------------------------------ The screen ------------------------------ */

export function useHandovers() {
  const { patient, encounter } = useCurrentPatient();
  const { db } = useApp();
  return useLiveQuery(async () => {
    const [list, entries, staff, orders, results] = await Promise.all([
      listHandoffs(db, patient.id), listPatientEntries(db, patient.id), db.practitioner.toArray(),
      encounter ? db.active_order.where('encounter_id').equals(encounter.id).toArray() : Promise.resolve([] as ActiveOrder[]),
      db.snapshot_result.where('patient_id').equals(patient.id).toArray(),
    ]);
    return { list, entries, staff, orders, results };
  }, [db, patient.id, encounter?.id]);
}
type Loaded = NonNullable<ReturnType<typeof useHandovers>>;

function Person({ p, id, role, badge }: { p?: Practitioner; id: string; role: string; badge: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-container-low p-space-sm flex flex-col gap-1.5 print:bg-white print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-label-uppercase text-label-uppercase text-secondary uppercase print:text-black">{role}</span>{badge}</div>
      <div className="flex items-center gap-space-sm">
        <span aria-hidden className="w-10 h-10 shrink-0 rounded-lg bg-primary-container text-white grid place-items-center font-bold print:hidden">{p?.initials ?? '?'}</span>
        <span><span className="block font-body-md text-body-md font-semibold text-primary print:text-black">{p?.name ?? id}</span><span className="block font-body-sm text-body-sm text-secondary print:text-black">{p?.role ?? ''}</span></span>
      </div>
    </div>
  );
}

export function HandoverScreen({ data, current, banner }: { data: Loaded; current: HandoffWithTime | null; banner?: ReactNode }) {
  const { patient, encounter: e, allergies } = useCurrentPatient();
  const { clock, event } = useApp();
  const { user } = useSession();
  const base = `/patients/${patient.id}`;
  const names = new Map(data.staff.map((p) => [p.id, p.name]));
  const nowIso = clock.nowIso(), at = hm(nowIso);
  const h = current?.handoff;
  const linked = h ? linkedRecords(h.source_entry_ids, data.entries, patient.id) : [];
  const rows = flowRows(data.entries, data.results, patient.id);
  const meds = medLines(data.orders, data.entries, nowIso);
  const author = h ? data.staff.find((p) => p.id === h.created_by) : undefined;
  const facts: [string, string][] = [
    ['Admitted', e?.admit_time ? dayLabel(e.admit_time) : 'Not on the list'], ['Isolation', e?.isolation ?? 'None on the list'], ['Code status', e?.code_status ?? 'Not on the list'],
    ['Diet', e?.diet ?? 'Not on the list'], ['Allergies', allergies.length ? allergies.map((a) => a.substance).join(', ') : allergyState(patient, allergies).text],
  ];
  return (
    <>
      {banner}
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-primary print:text-black">SBAR handover</h1>
        <div className="flex flex-wrap gap-space-sm print:hidden">
          <ButtonLink variant="secondary" to="/ward"><Icon name="arrow_back" />Back to ward</ButtonLink>
          <ButtonLink variant="secondary" to={`/print/sbar/${patient.id}`}><Icon name="draft" />Paper SBAR sheet</ButtonLink>
          {h && <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print or save as PDF</Button>}
          {isNurse(user) && <ButtonLink to={`${base}/handoff/new`}><Icon name="add" />New handover</ButtonLink>}
        </div>
      </div>
      {h && (
        <div className="rounded-xl bg-surface-container-lowest border border-card-border shadow-sm p-space-md flex flex-wrap items-center justify-between gap-x-space-md gap-y-2 print:border-0 print:shadow-none print:p-0">
          <p className="min-w-0 font-body-md text-body-md text-on-surface print:text-black">
            <span className="flex flex-wrap items-center gap-2 font-bold text-primary print:text-black"><Icon name="sync_alt" className="text-[20px] print:hidden" />{h.shift}</span>
            <span className="text-on-surface-variant print:text-black">Written by <strong>{author?.name ?? h.created_by}</strong> · {current.savedAt ? `saved ${dateTimeLabel(current.savedAt)}` : 'save time not stored'} · {h.id}{event ? <span className="print:hidden"> · Downtime {hm(event.declared_at)} – {event.ended_at ? hm(event.ended_at) : 'now'}</span> : null}</span>
          </p>
          <span className="print:hidden"><Badge icon="lock">Saved, cannot be edited</Badge></span>
        </div>
      )}
      <div className="print:hidden"><PatientTabs patientId={patient.id} /></div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-space-md items-start print:block print:space-y-3">
        <div className="min-w-0 flex flex-col gap-space-md print:block print:space-y-3">
          {!h ? <div className="bg-surface-container-lowest rounded-xl border border-card-border"><EmptyState icon="swap_horiz" text="No handovers yet" /></div> : (
            <SavedText situation={h.situation} background={h.background} assessment={h.assessment} openItems={h.open_items}
              afterBackground={(
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm print:hidden">
                  <NowBox at={at} title="Patient list" to={`${base}/orders`} link="Open orders">
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-md gap-y-1 font-body-md text-body-md">{facts.map(([k, v]) => <div key={k} className="contents"><dt className="text-secondary">{k}</dt><dd className="font-semibold text-primary">{v}</dd></div>)}</dl>
                  </NowBox>
                  <NowBox at={at} title="Medicine orders" to={`${base}/meds`} link="Open MAR">
                    {meds.length === 0 ? <p className="font-body-md text-body-md text-secondary">No active medicine orders on the list.</p> : (
                      <ul className="flex flex-col gap-1.5">{meds.map((x) => <li key={x.id} className="rounded-lg bg-surface-container-low p-2"><span className="block font-body-md text-body-md font-semibold text-primary">{x.text}</span>{x.notes.map((n) => <span key={n} className="block font-body-sm text-body-sm text-on-surface-variant">{n}</span>)}</li>)}</ul>
                    )}
                  </NowBox>
                </div>
              )}
              afterAssessment={<VitalsNow rows={rows} entries={data.entries} results={data.results} linked={new Set(h.source_entry_ids)} names={names} base={base} at={at} patientId={patient.id} />} />
          )}
        </div>

        <div className="min-w-0 flex flex-col gap-space-md print:block print:space-y-3">
          {h && <LinkedTrail records={linked} />}
          <section aria-label="Sign-off" className="bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm flex flex-col gap-space-sm print:hidden">
            <h2 className={`${cardTitle} flex items-center gap-2`}><Icon name="assignment_turned_in" />Sign-off</h2>
            {h && <Person p={author} id={h.created_by} role="Written by" badge={current.savedAt ? <Badge tone="green" icon="check">Saved {hm(current.savedAt)}</Badge> : <Badge>Save time not stored</Badge>} />}
            <p className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface-variant"><strong className="text-primary">Incoming nurse: sign on paper.</strong> ClinBridge does not record a counter-signature or a transfer of care. Both nurses sign part 3 of the paper SBAR sheet.</p>
            <ButtonLink variant="secondary" className="w-full" to={`/print/sbar/${patient.id}`}><Icon name="draw" />Sheet to sign</ButtonLink>
          </section>
          <section aria-label="All handovers" className="bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm flex flex-col gap-space-sm print:hidden">
            <h2 className={cardTitle}>All handovers</h2>
            {data.list.length === 0 ? <p className="font-body-md text-body-md text-secondary">None saved for this patient.</p> : (
              <ul className="flex flex-col gap-1.5">
                {data.list.map(({ handoff: x, savedAt }) => (
                  <li key={x.id}>
                    <Link to={`${base}/handoff/${x.id}`} aria-current={x.id === h?.id ? 'page' : undefined} className={`flex items-center gap-2 min-h-11 rounded-lg p-space-sm ${x.id === h?.id ? 'bg-primary text-on-primary' : 'bg-surface-container-low hover:bg-surface-container'}`}>
                      <span className="flex-1 min-w-0"><span className="block font-body-md text-body-md font-semibold [overflow-wrap:anywhere]">{x.shift}</span><span className="block font-body-sm text-body-sm opacity-80">{names.get(x.created_by) ?? x.created_by} · {savedAt ? dateTimeLabel(savedAt) : 'save time not stored'} · {x.source_entry_ids.length} linked</span></span>
                      <Icon name="chevron_right" className="text-[20px]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
