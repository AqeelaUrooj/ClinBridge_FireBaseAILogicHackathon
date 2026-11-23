import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import type { Note } from '../../db/schema';
import { listHandoffs } from '../../db/repos/handoff';
import { isNurse, useApp, useSession } from '../../state/app';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { Button, ButtonLink, Card, Icon } from '../../components/ui';
import { MedIllustration, type MedicalAsset } from '../../components/MedIllustration';
import { BodyFigure, type FigureMarker } from '../body/BodyFigure';
import { medicationSites } from '../body/medicationSites';
import { SourceBadge, StatusBadge, TYPE_LABEL, entrySummary, isRetired } from '../entries/entryView';
import { doseLine, latestMeasures, loadFacts } from '../ward/wardData';
import { useCurrentPatient } from './PatientLayout';

/**
 * Patient summary, after the Stitch "Patient Summary & Bedside Overview": four action cards, then today's doses and
 * recent entries on the left and body sites, paper sheets and handover on the right. Facts only: no NEWS2, no OCR
 * confidence, no "verified" or custody sign-off (ClinBridge records none of those).
 */
const chip = 'px-2 py-0.5 rounded bg-surface-container-lowest font-code-tabular text-body-sm font-semibold text-primary';

function ActionCard({ kicker, title, art, badge, badgeTone = 'plain', children, to, action, actionIcon, secondTo, secondIcon, secondLabel, disabledReason }: {
  kicker: string; title: string; art: MedicalAsset; badge?: string; badgeTone?: 'plain' | 'due' | 'ok'; children: ReactNode;
  to: string; action: string; actionIcon: string; secondTo: string; secondIcon: string; secondLabel: string; disabledReason?: string;
}) {
  const tone = badgeTone === 'due' ? 'bg-secondary-fixed text-on-secondary-fixed' : badgeTone === 'ok' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-surface-container text-on-surface';
  return (
    <section aria-label={title} className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-card-border flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-2 pb-space-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-11 h-11 rounded-lg bg-[#FBF8F2] ring-1 ring-card-border grid place-items-center shrink-0"><MedIllustration name={art} size={32} /></span>
            <span className="min-w-0">
              <span className="font-label-uppercase text-label-uppercase text-secondary uppercase block">{kicker}</span>
              <h2 className="font-headline-sm text-headline-sm text-primary">{title}</h2>
            </span>
          </div>
          {badge && <span className={`px-2 py-0.5 rounded font-label-badge text-[11px] font-bold shrink-0 ${tone}`}>{badge}</span>}
        </div>
        <div className="mt-space-sm bg-surface-container-low p-2.5 rounded-lg min-h-[64px]">{children}</div>
      </div>
      <div className="pt-space-md flex items-center gap-2">
        {disabledReason ? <span className="flex-1 min-h-11 grid place-items-center rounded-lg bg-surface-container text-secondary font-body-sm text-body-sm">{disabledReason}</span>
          : <ButtonLink to={to} className="flex-1 !px-3"><Icon name={actionIcon} className="text-[18px]" />{action}</ButtonLink>}
        <Link to={secondTo} aria-label={secondLabel} title={secondLabel} className="min-h-11 w-11 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface grid place-items-center"><Icon name={secondIcon} className="text-[18px]" /></Link>
      </div>
    </section>
  );
}

function PanelTitle({ icon, children, aside }: { icon: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pb-space-sm">
      <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name={icon} className="text-[20px]" />{children}</h2>
      {aside}
    </div>
  );
}

/** Plain time difference, e.g. "in 2 h 15 min". Past times say only that nothing is recorded: no overdue rule is approved. */
function whenText(nowIso: string, iso: string): string {
  const min = Math.round((Date.parse(iso) - Date.parse(nowIso)) / 60_000);
  if (min < 0) return 'not recorded';
  return min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

export function PatientSummary() {
  const { patient } = useCurrentPatient();
  const { db, clock } = useApp();
  const { user, lock } = useSession();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const nowIso = clock.nowIso();
    const [facts, handoffs, staff] = await Promise.all([loadFacts(db, patient.id, nowIso), listHandoffs(db, patient.id), db.practitioner.toArray()]);
    return facts ? { facts, nowIso, handoff: handoffs[0] ?? null, names: new Map(staff.map((s) => [s.id, s.name])) } : null;
  }, [db, clock, patient.id]);
  const base = `/patients/${patient.id}`;
  if (!data || data.facts.patient.id !== patient.id) return <p role="status" className="text-secondary">Loading…</p>;

  const { facts, nowIso, handoff, names } = data;
  const nurse = isNurse(user);
  const nurseOnly = nurse ? undefined : 'Nurses only';
  const m = latestMeasures(facts.entries);
  const live = facts.entries.filter((x) => !isRetired(x.entry));
  const recent = live.slice(0, 3);
  const next = facts.due[0];
  const lastGiven = facts.given[0];
  const photo = live.find((x) => x.entry.raw_input_kind === 'photo');
  const { marked, administrations } = medicationSites(patient.id, facts.entries);
  const markers: FigureMarker[] = marked.map((k) => ({ regionId: k.regionId, kind: k.kind, key: k.item.entry.id }));
  const h = handoff?.handoff;
  const differs = facts.given.filter((g) => g.differsFromOrder);

  return (
    <>
      {facts.critical && (
        <div role="note" className="rounded-xl bg-error-container text-on-error-container border border-error/30 p-space-md flex flex-wrap items-center gap-space-sm">
          <Icon name="notification_important" className="text-error text-[20px]" />
          <span className="flex-1 min-w-[220px] font-body-md text-body-md"><strong>Critical lab: {facts.critical.test} {facts.critical.value}.</strong> {facts.critical.calledTo ?? 'Nobody recorded as told yet'}. Read-back {facts.critical.readBack ? 'recorded' : 'not recorded'}.</span>
          <ButtonLink variant="secondary" to={`${base}/labs`}><Icon name="biotech" />Labs</ButtonLink>
        </div>
      )}
      {differs.map((d) => (
        <div key={d.entryId} role="note" className="rounded-xl bg-downtime-amber-bg border border-downtime-amber-border p-space-md flex flex-wrap items-center gap-space-sm">
          <Icon name="warning" className="text-[#7a5410] text-[20px]" />
          <span className="flex-1 min-w-[220px] font-body-md text-body-md text-[#6b4a0e]"><strong>{d.drug}: {d.differsFromOrder}.</strong> Check the record against the paper.</span>
          <ButtonLink variant="secondary" to={`/entries/${d.entryId}`}>Open record</ButtonLink>
        </div>
      ))}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-space-md">
        <ActionCard kicker="Medicine" title="Record dose" art="medication/capsule" badge={next ? `DUE ${hm(next.time)}` : undefined} badgeTone="due" disabledReason={nurseOnly}
          to={`${base}/meds`} action="Give medicine" actionIcon="check_circle" secondTo={`${base}/orders`} secondIcon="list_alt" secondLabel="All orders">
          {next ? <><span className="font-body-md text-body-md font-semibold text-primary block">{doseLine(next.order)}</span><span className="font-body-sm text-body-sm text-on-surface-variant block">{next.order.frequency ?? ''}{next.highAlert ? ' · high-alert: second nurse checks' : ''}</span></>
            : <span className="font-body-md text-body-md text-on-surface-variant block">No unrecorded scheduled doses today</span>}
          {lastGiven && <span className="font-body-sm text-body-sm text-secondary block mt-0.5">Last given: {lastGiven.drug} {lastGiven.dose} at {hm(lastGiven.time)}</span>}
        </ActionCard>
        <ActionCard kicker="Observation" title="Vital signs" art="vitals/heart" badge={facts.lastObs ? `LAST ${hm(facts.lastObs)}` : undefined} disabledReason={nurseOnly}
          to={`${base}/vitals/record`} action="Record vitals" actionIcon="add" secondTo={`${base}/vitals`} secondIcon="trending_up" secondLabel="Vital signs flowsheet">
          {m.spo2 || m.temp || m.bp || m.hr ? (
            <div className="grid grid-cols-2 gap-2">
              {[m.spo2 ?? m.bp, m.temp ?? m.hr].filter((x) => !!x).map((x) => (
                <span key={x!.label}><span className="font-vital-display text-[22px] leading-tight font-bold text-primary">{x!.value}<span className="font-body-sm text-[11px] font-normal text-secondary"> {x!.unit ?? ''} {x!.label}</span></span><span className="font-code-tabular text-[11px] text-on-surface-variant block">{hm(x!.time)}</span></span>
              ))}
              <span className="col-span-2 font-code-tabular text-[11px] text-on-surface-variant">{[m.o2 && `O₂ ${m.o2.value} ${m.o2.unit ?? ''}`, m.hr && `HR ${m.hr.value}`, m.rr && `Resp ${m.rr.value}`, m.bp && `BP ${m.bp.value}`].filter(Boolean).join(' • ')}</span>
            </div>
          ) : <span className="font-body-sm text-body-sm text-secondary">No vitals yet</span>}
        </ActionCard>
        <ActionCard kicker="Intake / output" title="Fluid I / O" art="medication/iv-bag" badge={facts.io.count ? `${facts.io.balance > 0 ? '+' : ''}${facts.io.balance} mL` : undefined} badgeTone="ok" disabledReason={nurseOnly}
          to={`${base}/io`} action="Log Fluids" actionIcon="opacity" secondTo={`${base}/io/record`} secondIcon="add" secondLabel="Add a fluid record">
          <div className="grid grid-cols-2 gap-2 text-center">
            {([['Intake today', facts.io.totalIn], ['Output today', facts.io.totalOut]] as const).map(([l, n]) => (
              <span key={l} className="p-1 rounded bg-surface-container-lowest"><span className="font-label-uppercase text-[10px] text-on-surface-variant block uppercase">{l}</span><span className="font-code-tabular text-body-md font-bold text-primary">{facts.io.count ? `${n} mL` : '—'}</span></span>
            ))}
          </div>
        </ActionCard>
        <ActionCard kicker="Communication" title="Notes and SBAR" art="workflows/checklist" badge={handoff?.savedAt ? `SAVED ${hm(handoff.savedAt)}` : undefined} disabledReason={nurseOnly}
          to={`${base}/notes`} action="Add Note" actionIcon="edit_note" secondTo={`/print/sbar/${patient.id}`} secondIcon="print" secondLabel="Paper SBAR slip">
          {h ? <><span className="font-body-sm text-body-sm font-semibold text-primary block">{h.shift}</span><span className="font-body-sm text-[12px] text-on-surface-variant line-clamp-2">{h.situation}</span></>
            : <span className="font-body-sm text-body-sm text-secondary">No handover saved yet</span>}
        </ActionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          <Card aria-label="Doses and care orders">
            <PanelTitle icon="alarm_on" aside={<span className="font-code-tabular text-[11px] text-secondary font-semibold uppercase">{dayLabel(nowIso)} · now {hm(nowIso)}</span>}>Active regimen and care orders</PanelTitle>
            <div className="flex flex-col gap-2">
              {facts.due.slice(0, 4).map((d, i) => (
                <div key={`${d.order.id}-${d.time}`} className={`flex items-start gap-space-sm p-space-sm rounded-lg relative overflow-hidden ${i === 0 ? 'bg-surface-container-high' : 'bg-surface-container-low'}`}>
                  {i === 0 && <span className="w-1.5 absolute top-0 bottom-0 left-0 bg-primary" aria-hidden />}
                  <span className="min-w-[64px] pl-1 font-code-tabular text-right"><span className="font-bold text-body-md text-primary block">{hm(d.time)}</span><span className="font-label-uppercase text-[10px] text-secondary font-bold uppercase block">{whenText(nowIso, d.time)}</span></span>
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center justify-between gap-1"><span className="font-body-md text-body-md font-bold text-primary">{doseLine(d.order)}</span><span className="px-2 rounded bg-surface-container-lowest text-primary font-label-badge text-[10px]">Order {d.order.id}</span></span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant block mt-0.5">{d.order.text}{d.highAlert ? ' · High-alert: a second nurse checks with their own PIN.' : ''}</span>
                  </span>
                  {nurse && <Link to={`${base}/meds/${d.order.id}/record?slot=${encodeURIComponent(d.time)}`} aria-label={`Start ${d.order.drug_name ?? 'dose'} due ${hm(d.time)}`} className="min-h-9 px-2.5 rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-1 shrink-0 self-center">Start<Icon name="arrow_forward" className="text-[14px]" /></Link>}
                </div>
              ))}
              {facts.due.length === 0 && <p className="p-space-sm rounded-lg bg-surface-container-low font-body-md text-body-md text-on-surface-variant">No unrecorded scheduled doses today.</p>}
              {facts.careOrders.map((o) => (
                <div key={o.id} className="flex items-start gap-space-sm p-space-sm rounded-lg bg-surface-container-low">
                  <span className="min-w-[64px] font-code-tabular text-right"><span className="font-bold text-body-md text-secondary block">{o.type.toUpperCase().slice(0, 7)}</span><span className="font-label-uppercase text-[10px] text-secondary uppercase block">standing</span></span>
                  <span className="flex-1 font-body-md text-body-md font-semibold text-primary">{o.text}</span>
                  <span className="px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-label-badge text-[10px] self-center">Active order</span>
                </div>
              ))}
            </div>
          </Card>

          <Card aria-label="Recent bedside entries">
            <PanelTitle icon="history_edu" aside={<ButtonLink to={`${base}/timeline`} variant="secondary">View details<Icon name="chevron_right" /></ButtonLink>}>Recent bedside entries</PanelTitle>
            {recent.length === 0 ? <p className="text-secondary font-body-md text-body-md">Nothing recorded yet.</p> : (
              <div className="flex flex-col gap-2">
                {recent.map((x) => {
                  const note = x.entry.type === 'note' ? (x.child as Note | undefined) : undefined;
                  const parts = x.entry.type === 'vital_sign' ? entrySummary(x).split(' · ') : [];
                  return (
                    <Link key={x.entry.id} to={`/entries/${x.entry.id}`} className="p-3 rounded-lg bg-surface-container-low hover:bg-surface-container flex flex-col gap-1.5">
                      <span className="flex flex-wrap items-center justify-between gap-x-2">
                        <span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${x.entry.status === 'draft' ? 'bg-downtime-amber' : 'bg-primary'}`} aria-hidden />
                          <span className="font-code-tabular text-body-sm font-bold text-primary">{hm(x.entry.care_time)}</span>
                          {hm(x.entry.entry_time) !== hm(x.entry.care_time) && <span className="font-body-sm text-body-sm text-secondary">(typed in {hm(x.entry.entry_time)})</span>}
                        </span>
                        <span className="font-code-tabular text-[11px] text-on-surface-variant">{names.get(x.entry.performer_id) ?? x.entry.performer_id}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-label-badge text-[10px] font-bold">{TYPE_LABEL[x.entry.type]}{x.entry.raw_input_kind === 'photo' ? ' · paper photo' : ''}</span>
                        {parts.length ? parts.map((t) => <span key={t} className={chip}>{t}</span>) : <span className="font-body-md text-body-md font-semibold text-primary">{note ? '' : entrySummary(x)}</span>}
                        <SourceBadge entry={x.entry} /><StatusBadge entry={x.entry} />
                      </span>
                      {note && <span className="font-body-sm text-body-sm text-on-surface-variant line-clamp-3">{note.text}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-space-md">
          <Card aria-label="Body sites and lines">
            <PanelTitle icon="accessibility_new" aside={<Link to={`${base}/body`} className="font-label-uppercase text-[11px] text-primary hover:underline font-bold min-h-9 inline-flex items-center">OPEN FULL MAP</Link>}>Body sites and lines</PanelTitle>
            <div className="bg-surface-container-low rounded-lg p-3 flex gap-3 items-center">
              <div className="w-24 bg-[#fbf9f5] rounded-lg p-1 shrink-0 pointer-events-none" aria-hidden ref={(el) => { if (el) el.inert = true; }}>
                <BodyFigure view="front" markers={markers} administrations={administrations} selected={null} onSelect={() => undefined} />
              </div>
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                {marked.length === 0 ? <p className="font-body-sm text-body-sm text-secondary">No medicine sites recorded.</p> : marked.slice(0, 3).map((k) => (
                  <Link key={k.item.entry.id} to={`/entries/${k.item.entry.id}`} className="bg-surface-container-lowest p-2 rounded block hover:bg-surface-container">
                    <span className="flex items-center justify-between gap-2"><span className="font-body-sm text-body-sm font-bold text-primary">{k.site}</span><span className="font-code-tabular text-[11px] text-secondary">{hm(k.item.entry.care_time)}</span></span>
                    <span className="font-body-sm text-[12px] text-on-surface-variant block">{k.kind === 'iv' ? 'IV line' : 'Injection'} · {k.medication.drug_name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </Card>

          <Card aria-label="Paper sheets">
            <PanelTitle icon="document_scanner">Paper observation sheet</PanelTitle>
            <div className="p-3 rounded-lg bg-surface-container-low flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-12 h-14 bg-surface-container-highest rounded grid place-items-center shrink-0"><MedIllustration name="workflows/paper-photo" size={34} /></span>
                {photo ? <span className="min-w-0"><span className="font-body-md text-body-md font-bold text-primary block">{TYPE_LABEL[photo.entry.type]} sheet, {hm(photo.entry.care_time)}</span><span className="font-body-sm text-body-sm text-on-surface-variant block">Photo kept on this laptop · {photo.entry.status === 'draft' ? 'not confirmed yet' : 'confirmed by a nurse'}</span></span>
                  : <span className="font-body-md text-body-md text-on-surface-variant">No paper photos for this patient yet</span>}
              </span>
              <span className="flex flex-wrap gap-2">
                {photo && <ButtonLink variant="secondary" to={`/entries/${photo.entry.id}`}><Icon name="visibility" />Inspect</ButtonLink>}
                {nurse && <ButtonLink to={`${base}/capture`}><Icon name="photo_camera" />Photo of paper</ButtonLink>}
              </span>
            </div>
          </Card>

          <Card aria-label="Shift handover">
            <PanelTitle icon="co_present" aside={handoff?.savedAt ? <span className="font-code-tabular text-[11px] text-secondary">Saved {dateTimeLabel(handoff.savedAt)}</span> : undefined}>Shift handover</PanelTitle>
            {h ? (
              <div className="flex flex-col gap-2">
                <div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between gap-2 font-code-tabular text-body-sm"><span className="text-on-surface-variant">Written by</span><span className="font-bold text-primary">{names.get(h.created_by) ?? h.created_by}</span></div>
                <div className="p-2.5 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant"><strong className="text-primary">{h.shift}.</strong> {h.assessment}{h.open_items.length ? <ul className="list-disc pl-5 mt-1">{h.open_items.map((t) => <li key={t}>{t}</li>)}</ul> : null}</div>
              </div>
            ) : <p className="font-body-md text-body-md text-secondary">No handover saved for this patient.</p>}
            <ButtonLink variant="secondary" className="w-full mt-space-sm" to={`${base}/handoff`}><Icon name="assignment" />View full handover</ButtonLink>
          </Card>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-space-sm" aria-label="Paper downtime forms">
        <h2 className="font-headline-sm text-headline-sm text-primary mr-auto flex items-center gap-2"><Icon name="print" />Paper forms for this patient</h2>
        <ButtonLink variant="secondary" to={`/print/mar/${patient.id}`}>Medication record (DT-MAR-01)</ButtonLink>
        <ButtonLink variant="secondary" to={`/print/vit/${patient.id}`}>Vitals, neuro and I/O (DT-VIT-02)</ButtonLink>
        <ButtonLink variant="secondary" to={`/print/sbar/${patient.id}`}>SBAR handover (DT-SBAR-03)</ButtonLink>
        <Button onClick={() => { lock(); navigate('/lock'); }}><Icon name="lock" />Quick lock</Button>
      </Card>
    </>
  );
}
