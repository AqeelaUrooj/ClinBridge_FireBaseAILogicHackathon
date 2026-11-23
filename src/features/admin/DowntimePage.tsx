import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useSession } from '../../state/app';
import type { DowntimeEvent } from '../../db/schema';
import { clearNetwork, declareDowntime, endDowntime, startPracticeOutageDrill } from '../../db/repos/admin';
import { ACTIVE_CLINICAL_POLICY as POLICY } from '../../config/clinicalPolicy';
import { PHASE_LABEL } from '../../lib/phase';
import { dateTimeLabel, dayLabel, hm, sinceText } from '../../lib/time';
import { Badge, Button, ButtonLink, Icon } from '../../components/ui';
import { PinPad } from '../auth/PinPad';
import { Block, Err, Head, PANEL, PaperHead, Tile, msg } from './adminUi';

const within = (t: string, ev: DowntimeEvent) => t >= ev.declared_at && (!ev.ended_at || t <= ev.ended_at);

/** Downtime (Stitch "Downtime operations, incident lifecycle" and "Network clearance gate"). Every action is checked again in the database layer. */
export function DowntimePage() {
  const { db, clock, deviceId, phase, event, dataset, snapshot } = useApp();
  const { user } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const data = useLiveQuery(async () => {
    const [staff, events, entries, work, log, patients, handoffs] = await Promise.all([db.practitioner.toArray(), db.downtime_event.orderBy('declared_at').reverse().toArray(), db.entry.toArray(), db.worklist_item.toArray(), db.audit_log.toArray(), db.patient.count(), db.handoff.count()]);
    return { names: new Map(staff.map((p) => [p.id, p.name])), events, entries, work, log, patients, handoffs };
  }, [db]);
  const actor = { userId: user!.id, deviceId };
  const run = async (f: () => Promise<unknown>) => { setBusy(true); setError(null); try { await f(); return true; } catch (e) { setError(msg(e)); return false; } finally { setBusy(false); } };
  if (!data) return <p role="status">Loading…</p>;
  const { names, events, entries, work, log, patients, handoffs } = data;
  const now = clock.nowIso();
  const who = (id?: string | null) => (id ? names.get(id) ?? id : '—');
  const mine = event ? entries.filter((e) => within(e.entry_time, event)) : [];
  const lastHour = mine.filter((e) => Date.parse(now) - Date.parse(e.entry_time) <= 3_600_000).length;
  const drafts = entries.filter((e) => e.status === 'draft').length;
  const photos = mine.filter((e) => e.raw_input_kind === 'photo').length;
  const signed = work.filter((w) => w.signed_off_at).length;
  const newest = mine.reduce<string | null>((m, e) => (!m || e.entry_time > m ? e.entry_time : m), null);
  const handovers = event ? log.filter((r) => r.action === 'handoff_saved' && within(r.time, event)) : [];
  // Handovers that came with the practice data have no save time in the change log.
  const untimed = handoffs - log.filter((r) => r.action === 'handoff_saved').length;
  const exports = event ? log.filter((r) => r.action === 'fhir_export' && within(r.time, event)) : [];

  return (
    <div className="flex flex-col gap-space-md">
      <PaperHead title="Downtime" by={user?.name} at={dateTimeLabel(now)} practice={dataset === 'practice'} />
      <Head label="Downtime status" title={`Now: ${PHASE_LABEL[phase]}`}
        badges={<><Badge tone={phase === 'down' ? 'amber' : phase === 'online' ? 'green' : 'neutral'} icon={phase === 'down' ? 'power_off' : phase === 'online' ? 'cloud_done' : 'check_circle'}>{phase === 'down' ? 'Cloud blocked' : phase === 'online' ? 'Network cleared' : 'No downtime open'}</Badge>{event && <Badge>{event.id}</Badge>}{event && <Badge icon="timer">Open {sinceText(event.declared_at, now)}</Badge>}</>}
        text={phase === 'ready' ? 'Declare a downtime when the main EHR is down. Nurses then chart here; cloud is blocked.'
          : phase === 'down' ? <>System down since {dateTimeLabel(event!.declared_at)} (declared by <strong className="text-primary">{who(event!.declared_by)}</strong>).</>
            : <>Back online since {dateTimeLabel(event!.network_cleared_at)} (cleared by <strong className="text-primary">{who(event!.cleared_by)}</strong>). Finish the worklist, export, then end the downtime.</>}
        actions={<>
          <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print this page</Button>
          {phase === 'ready' && <Button variant="danger" disabled={busy} onClick={() => run(() => declareDowntime(db, clock, actor))}><Icon name="power_off" />Declare System down</Button>}
          {phase === 'online' && <Button disabled={busy} onClick={() => run(() => endDowntime(db, clock, actor))}><Icon name="task_alt" />End downtime</Button>}
        </>}>
        {phase !== 'down' && <Err e={error} />}
      </Head>

      {phase === 'down' && event && <ClearanceGate key={event.id} busy={busy} error={error} onClear={(ticked, pin) => run(() => clearNetwork(db, clock, actor, ticked, pin))} name={user!.name} initials={user!.initials} event={event} now={now} records={mine.length} />}

      {event && (
        <section aria-label="What happened so far" className={`${PANEL} flex flex-col gap-space-sm`}>
          <h3 className="font-label-uppercase text-label-uppercase uppercase text-secondary">What happened so far</h3>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10.5rem),1fr))] gap-space-sm">
            <Step time={snapshot?.taken_at} icon="database" title="Patient list taken" text={snapshot ? `${patients} patients, from ${snapshot.source_system}` : 'No patient list'} />
            <Step time={event.declared_at} icon="campaign" title="System down" text={`Declared by ${who(event.declared_by)}`} />
            <Step time={handovers.length ? handovers.map((h) => h.time).sort()[handovers.length - 1] : null} icon="swap_horiz" title="Handovers" text={handovers.length ? `${handovers.length} saved, newest at this time` : untimed > 0 ? `${untimed} on this laptop, save time not recorded` : 'None saved yet'} />
            <Step time={newest} icon="edit_note" title="Charting on this laptop" text={mine.length ? `${mine.length} records, newest at this time` : 'No records yet'} now={phase === 'down'} />
            <Step time={event.network_cleared_at} icon="cloud_done" title="Back online" text={event.network_cleared_at ? `Cleared by ${who(event.cleared_by)}` : 'Waits for network clearance'} now={phase === 'online'} later={!event.network_cleared_at} />
            <Step time={event.ended_at} icon="task_alt" title="Downtime ended" text="After the worklist is finished" later />
          </ol>
        </section>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        <Tile label="Records in this downtime" icon="receipt_long" value={mine.length} unit="records" foot={`${lastHour} in the last hour`} />
        <Tile label="Patients on the list" icon="bed" value={patients} unit="patients" foot={snapshot ? `List of ${dateTimeLabel(snapshot.taken_at)}` : 'No list'} />
        <Tile label="Drafts" icon="rate_review" value={drafts} unit="to check" foot="A nurse must check each one" tone={drafts ? 'amber' : undefined} />
        <Tile label="From paper photos" icon="photo_camera" value={photos} unit="records" foot="Typed or proposed, then checked by a person" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-space-md items-start">
        <Block title="Steps back to the hospital system" icon="checklist" text="ClinBridge does not send anything. The hospital EHR team loads the file.">
          <ol className="flex flex-col gap-2">
            <Stage n={1} title="Check every draft" text="Nurses check each one against the paper." badge={drafts ? <Badge tone="amber">{drafts} waiting</Badge> : <Badge tone="green">None waiting</Badge>} to="/alerts" link="Drafts" />
            <Stage n={2} title="Network clearance" text="Checklist and the admin's PIN. Opens Back online." badge={event?.network_cleared_at ? <Badge tone="green">Cleared {hm(event.network_cleared_at)}</Badge> : <Badge tone="neutral">{event ? 'Waiting' : 'No downtime open'}</Badge>} />
            <Stage n={3} title="Recovery worklist" text="A person checks each record against the paper." badge={<Badge tone={work.length && signed === work.length ? 'green' : 'neutral'}>{signed} of {work.length} signed off</Badge>} to="/recovery" link="Worklist" />
            <Stage n={4} title="FHIR file for the EHR team" text="One file with the confirmed records. It is not encrypted." badge={<Badge tone={exports.length ? 'green' : 'neutral'}>{exports.length ? `${exports.length} made` : 'Not made'}</Badge>} to="/export" link="Export" />
            <Stage n={5} title="End the downtime" text="Only when every worklist item is signed off." badge={<Badge>{event ? 'Open' : 'No downtime open'}</Badge>} />
          </ol>
        </Block>
        <div className="flex flex-col gap-space-md print:hidden">
          <Block title="On this laptop" icon="laptop_windows" text="These work with no network.">
            <ButtonLink variant="secondary" to="/admin/backup"><Icon name="lock" />Encrypted backup</ButtonLink>
            <ButtonLink variant="secondary" to="/spooler"><Icon name="print" />Print paper packets</ButtonLink>
            <ButtonLink variant="secondary" to="/admin"><Icon name="monitor_heart" />Readiness</ButtonLink>
          </Block>
          {dataset === 'practice' && phase !== 'down' && (
            <Block title="Practice drill" icon="school" badge={<Badge tone="blue">Practice only</Badge>} text="Start a new outage on the fictional ward: the current practice downtime is closed (marked as a drill) and System down is declared.">
              <Button variant="danger" disabled={busy} onClick={() => run(() => startPracticeOutageDrill(db, clock, actor))}><Icon name="power_off" />Start a practice outage</Button>
            </Block>
          )}
        </div>
      </div>

      <section aria-label="History" className={`${PANEL} flex flex-col gap-space-sm`}>
        <h3 className="font-headline-sm text-headline-sm text-primary">History</h3>
        <div aria-hidden className="hidden xl:grid print:grid print:grid-cols-6 grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,.8fr)_minmax(0,.8fr)_minmax(0,1.4fr)_9.5rem] gap-space-sm px-space-sm py-2 rounded-lg bg-surface-container-low font-label-uppercase text-label-uppercase text-secondary uppercase"><span>Event</span><span>System down</span><span>How long</span><span>Records</span><span>Network cleared</span><span>State</span></div>
        {events.length === 0 ? <p className="text-secondary">No downtime was declared on this laptop.</p> : (
          <ul aria-label="Downtimes">
            {events.map((h) => {
              const drill = log.some((r) => r.action === 'practice_drill_closed' && r.entity === `downtime_event/${h.id}`);
              return (
                <li key={h.id} className="break-inside-avoid grid grid-cols-[7rem_minmax(0,1fr)] xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,.8fr)_minmax(0,.8fr)_minmax(0,1.4fr)_9.5rem] print:grid-cols-6 gap-x-space-sm gap-y-1 px-space-sm py-space-sm border-b border-card-border last:border-0 font-body-md text-body-md">
                  <Cell label="Event"><strong className="text-primary [overflow-wrap:anywhere]">{h.id}</strong></Cell>
                  <Cell label="System down">{dateTimeLabel(h.declared_at)} <span className="block text-body-sm text-secondary">{who(h.declared_by)}</span></Cell>
                  <Cell label="How long">{sinceText(h.declared_at, h.ended_at ?? now)}</Cell>
                  <Cell label="Records">{entries.filter((e) => within(e.entry_time, h)).length}</Cell>
                  <Cell label="Network cleared">{h.network_cleared_at ? <>{hm(h.network_cleared_at)}, {dayLabel(h.network_cleared_at)} <span className="block text-body-sm text-secondary">{who(h.cleared_by)}</span></> : 'Not cleared'}</Cell>
                  <Cell label="State">{!h.ended_at ? <Badge tone={h.network_cleared_at ? 'green' : 'amber'}>{h.network_cleared_at ? 'Open, back online' : 'Open, system down'}</Badge> : drill ? <Badge>Closed by a drill</Badge> : <Badge tone="navy">Ended {hm(h.ended_at)}</Badge>}</Cell>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <><span className="xl:hidden print:hidden text-body-sm text-secondary">{label}</span><span className="min-w-0">{children}</span></>
);

function Step({ time, icon, title, text, now, later }: { time?: string | null; icon: string; title: string; text: string; now?: boolean; later?: boolean }) {
  return (
    <li className={`min-w-0 rounded-lg p-space-sm flex flex-col gap-1 ${now ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container-low'} ${later ? 'opacity-70' : ''}`}>
      <span className="flex items-center justify-between gap-2 font-code-tabular font-bold text-primary"><span>{time ? hm(time) : '—'}{now ? ' · now' : ''}</span><Icon name={icon} className="text-[20px] text-secondary" /></span>
      <span className="font-body-md text-body-md font-semibold text-primary">{title}</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{text}</span>
    </li>
  );
}

function Stage({ n, title, text, badge, to, link }: { n: number; title: string; text: string; badge: ReactNode; to?: string; link?: string }) {
  return (
    <li className="rounded-lg bg-surface-container-low p-space-sm flex flex-wrap items-center gap-space-sm">
      <span aria-hidden className="w-9 h-9 rounded-full bg-surface-container-highest text-primary grid place-items-center font-bold shrink-0">{n}</span>
      <span className="min-w-0 flex-1 basis-[12rem]"><span className="block font-body-md text-body-md font-semibold text-primary">{title}</span><span className="block font-body-sm text-body-sm text-on-surface-variant">{text}</span></span>
      {badge}
      {to && <ButtonLink variant="secondary" className="print:hidden" to={to}>{link}</ButtonLink>}
    </li>
  );
}

/** Network clearance (Stitch "Network clearance gate"). People tick what they were told; ClinBridge tests nothing on the network. */
function ClearanceGate({ busy, error, onClear, name, initials, event, now, records }: { busy: boolean; error: string | null; onClear: (ticked: string[], pin: string) => Promise<boolean>; name: string; initials: string; event: DowntimeEvent; now: string; records: number }) {
  const [ticked, setTicked] = useState<string[]>([]);
  const [pin, setPin] = useState('');
  const list = POLICY.recovery.networkChecklist;
  const ready = ticked.length === list.length && pin.length === 4;
  return (
    <section aria-label="Network clearance" className="flex flex-col gap-space-md print:hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-space-md items-stretch">
        <Block title="Before Back online (network clearance)" icon="fact_check" badge={<Badge tone={ticked.length === list.length ? 'green' : 'blue'}>{ticked.length} of {list.length} ticked</Badge>} text="Tick only what the named team told you. ClinBridge does not test the network and cannot see the hospital system.">
          <ul className="flex flex-col gap-2">
            {list.map((c, i) => (
              <li key={c}>
                <label className="flex items-center gap-space-sm rounded-lg bg-surface-container-low p-space-md min-h-14 cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 shrink-0" checked={ticked.includes(c)} onChange={(e) => setTicked(e.target.checked ? [...ticked, c] : ticked.filter((x) => x !== c))} aria-label={c} />
                  <span className="font-body-md text-body-md font-semibold text-primary">{i + 1}. {c}</span>
                </label>
              </li>
            ))}
          </ul>
          <dl className="mt-auto grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2">
            {([['Event', event.id], ['System down', dateTimeLabel(event.declared_at)], ['How long', sinceText(event.declared_at, now)], ['Records in it', String(records)]] as [string, string][]).map(([k, v]) => <div key={k} className="rounded-lg bg-surface-container-low p-space-sm"><dt className="font-body-sm text-body-sm text-secondary">{k}</dt><dd className="font-body-md text-body-md font-semibold text-primary [overflow-wrap:anywhere]">{v}</dd></div>)}
          </dl>
          <p className="font-body-sm text-body-sm text-secondary">Checklist wording is a prototype setting, not approved hospital policy.</p>
        </Block>
        <Block title="Admin authorization" icon="key" badge={<Badge tone="navy">Your PIN again</Badge>}>
          <div className="rounded-lg bg-surface-container-low p-space-sm flex items-center gap-space-sm"><span aria-hidden className="w-12 h-12 rounded-lg bg-primary-container text-on-primary grid place-items-center font-bold">{initials}</span><span><span className="block font-headline-sm text-headline-sm text-primary">{name}</span><span className="block font-body-sm text-body-sm text-secondary">Admin, signed in now</span></span></div>
          <div role="group" aria-label="Your PIN again"><PinPad wide value={pin} onChange={setPin} onSubmit={() => undefined} disabled={busy} error={error} /></div>
          <p className="rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-sm font-body-sm text-body-sm text-[#5c400c] flex items-start gap-2"><Icon name="warning" className="shrink-0" />This opens Back online on this laptop: the recovery worklist and the export file become available. It is written in the change log and is not undone here.</p>
          <Button className="w-full" disabled={busy || !ready} onClick={async () => { const p = pin; setPin(''); if (await onClear(ticked, p)) setTicked([]); }}><Icon name="wifi" />Clear network — Back online</Button>
          <p className="font-body-sm text-body-sm text-secondary text-center">{ready ? 'Ready.' : `Needs ${list.length} ticks and your PIN.`}</p>
        </Block>
      </div>
      <div className={`${PANEL} flex flex-wrap items-center justify-between gap-space-md`}>
        <p className="min-w-0 flex-1 basis-[16rem] font-body-md text-body-md text-on-surface-variant"><strong className="text-primary block">Next: recovery worklist</strong>After clearance every record of this downtime is listed and checked by a person.</p>
        <ButtonLink variant="secondary" to="/recovery">Recovery worklist<Icon name="arrow_forward" /></ButtonLink>
      </div>
    </section>
  );
}
