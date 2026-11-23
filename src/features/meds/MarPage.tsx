import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { ActiveOrder, MedAdmin } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { isNurse, useApp, useSession } from '../../state/app';
import { ROUTE_LABEL } from '../../config/medicationPolicy';
import { currentRate, isHighAlert, isMedOrder, lastGiven, orderDose, orderGroup, orderHistory, slotStatuses, type OrderGroup, type Slot } from '../../lib/meds';
import { formatDose } from '../../lib/dose';
import { dateTimeLabel, hm } from '../../lib/time';
import { Badge, Button, ButtonLink, Card, EmptyState, Icon } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { useCurrentPatient } from '../patient/PatientLayout';
import { PatientTabs } from '../patient/PatientTabs';
import { entrySummary, isRetired, SourceBadge, StatusBadge } from '../entries/entryView';
import { doseDifference, type Measure } from '../ward/wardData';
import { HighAlertBar } from './MedEditor';
import { filterOrders, marHours, type MarTab } from './marData';
import { orderArt, useMedData } from './MedsPages';

/**
 * Medication record (MAR), after the Stitch "Medication Administration Record" screen: patient tabs, filter tabs with
 * search, hour strip, grouped order cards and an order-detail panel. /meds and /meds/:order share this page; below the
 * xl width the list and the detail are separate pages.
 * Not shown, because nothing approved or real is behind it: hold limits, MAP, indications, daily maximums, pump
 * status, AI "typical dose", match confidence.
 */
const SLOT_STYLE: Record<Slot['status'], { tone: 'green' | 'amber' | 'neutral' | 'blue' | 'red'; label: string; icon: string }> = {
  given: { tone: 'green', label: 'Given', icon: 'check_circle' },
  due: { tone: 'amber', label: 'Due', icon: 'schedule' },
  held: { tone: 'neutral', label: 'Held', icon: 'pause' },
  refused: { tone: 'neutral', label: 'Refused', icon: 'block' },
  draft: { tone: 'blue', label: 'Check this', icon: 'rule' },
  overdue: { tone: 'red', label: 'Overdue', icon: 'alarm' },
};

function SlotChip({ slot }: { slot: Slot }) {
  const s = SLOT_STYLE[slot.status];
  return <Badge tone={s.tone} icon={s.icon}><span className="font-code-tabular">{hm(slot.time)}</span> {s.label}</Badge>;
}

const GROUP: Record<OrderGroup, { title: string; tab: string; icon: string }> = {
  scheduled: { title: 'Scheduled medications (routine)', tab: 'Scheduled (routine)', icon: 'alarm' },
  prn: { title: 'As needed (PRN) medications', tab: 'PRN (as needed)', icon: 'medical_services' },
  infusion: { title: 'Continuous infusions', tab: 'Continuous infusions', icon: 'water_drop' },
};
const GROUPS: OrderGroup[] = ['scheduled', 'prn', 'infusion'];
const tag = 'px-2 py-0.5 rounded bg-surface-container-high font-code-tabular text-[11px]';
const kicker = 'font-label-uppercase text-[10px] leading-[13px] text-on-surface-variant font-bold uppercase block';
const small = 'relative z-10 min-h-9 px-3 rounded font-body-sm text-body-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors';

const routeText = (o: ActiveOrder) => `${o.route ?? '—'} (${ROUTE_LABEL[o.route ?? ''] ?? '—'})`;
const who = (names: Map<string, string>, id: string) => names.get(id) ?? id;

/** Latest confirmed record of this order whose dose is not the ordered dose. */
const wrongDose = (history: EntryWithChild[]) => history
  .filter((x) => x.entry.status === 'confirmed' && x.child)
  .map((x) => ({ x, diff: doseDifference(x.child as MedAdmin) }))
  .find((d) => d.diff);

function DoseNotice({ entry, diff }: { entry: EntryWithChild; diff: string }) {
  return (
    <div role="note" className="relative z-10 rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-sm flex flex-wrap items-center gap-2">
      <Icon name="warning" className="text-[#7a5410] text-[18px]" />
      <span className="flex-1 min-w-[180px] font-body-sm text-body-sm text-[#6b4a0e]"><strong className="block uppercase text-[10px] tracking-wider">Dose differs from the order</strong>{diff}. Check the record against the paper.</span>
      <Link to={`/entries/${entry.entry.id}`} aria-label={`Check dose record from ${hm(entry.entry.care_time)}`} className={`${small} bg-surface-container-lowest border border-downtime-amber-border text-[#6b4a0e]`}>Check dose</Link>
    </div>
  );
}

function OrderCard({ o, meds, nowIso, base, names, nurse, selected }: { o: ActiveOrder; meds: EntryWithChild[]; nowIso: string; base: string; names: Map<string, string>; nurse: boolean; selected: boolean }) {
  const g = orderGroup(o);
  const high = isHighAlert(o.drug_name);
  const art = orderArt(o);
  const slots = g === 'scheduled' ? slotStatuses(o, nowIso, meds) : [];
  const open = slots.filter((s) => s.status === 'due' || s.status === 'overdue');
  const lg = lastGiven(o, meds);
  const history = orderHistory(o, meds);
  const draft = history.find((x) => x.entry.status === 'draft');
  const diff = wrongDose(history);
  const rate = g === 'infusion' ? currentRate(o, meds) : null;
  const lastSlot = [...slots].reverse().find((s) => s.entry);
  const name = o.drug_name ?? o.text;
  return (
    <article data-testid={`order-${o.id}`} aria-label={name}
      className={`relative bg-surface-container-lowest rounded-xl border p-space-md shadow-sm hover:border-secondary ${selected ? 'xl:ring-2 xl:ring-primary' : ''} ${high ? 'border-clinical-red-border border-l-4 border-l-clinical-red' : 'border-card-border'}`}>
      <div className="flex flex-col sm:flex-row items-start justify-between gap-space-sm">
        <div className="flex items-start gap-space-md min-w-0">
          <span className={`w-14 h-14 rounded-xl grid place-items-center bg-[#FBF8F2] shrink-0 ${high ? 'ring-2 ring-clinical-red' : 'ring-1 ring-card-border'}`}>
            {art ? <MedIllustration name={art} size={38} /> : <Icon name="medication" className="text-[24px] text-secondary" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`${base}/meds/${o.id}`} aria-current={selected ? 'true' : undefined} className="font-headline-sm text-headline-sm text-primary font-bold hover:underline after:absolute after:inset-0 after:content-['']">{name}</Link>
              <span className="font-headline-sm text-headline-sm text-secondary font-semibold">{g === 'infusion' ? `${formatDose(rate?.rate)} ${rate?.unit ?? ''}` : orderDose(o)}</span>
              <span className={`${tag} text-primary font-bold`}>{routeText(o)}</span>
              {o.frequency && <span className={`${tag} text-on-surface-variant`}>{o.frequency}</span>}
              {high && <Badge tone="red" icon="warning">High-alert</Badge>}
              {o.status !== 'active' && <Badge icon="block">Order {o.status}</Badge>}
            </div>
            <p className="text-on-surface-variant font-body-sm text-body-sm mt-0.5">Order ID: <span className="font-code-tabular font-semibold text-primary">{o.id}</span>{o.ordered_by ? ` • ${o.ordered_by}` : ''}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {slots.map((s) => <span key={s.time} className="flex flex-wrap items-center gap-1.5"><SlotChip slot={s} />{s.entry && <span className="font-body-sm text-[12px] text-on-surface-variant">by {who(names, s.entry.performer_id)}</span>}</span>)}
              {g === 'prn' && <span className="font-body-sm text-body-sm text-on-surface-variant">Last given: <strong className="text-primary">{lg ? `${hm(lg.entry.care_time)} by ${who(names, lg.entry.performer_id)}` : 'not given yet'}</strong></span>}
              {g === 'infusion' && <span className="font-body-sm text-body-sm text-on-surface-variant">{history[0] ? `Rate last recorded ${hm(history[0].entry.care_time)} by ${who(names, history[0].entry.performer_id)}` : 'Starting rate from the order; no rate recorded yet'}</span>}
              {draft && g !== 'scheduled' && <Badge tone="blue" icon="rule">Check this</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-row sm:flex-col items-stretch gap-1.5 shrink-0 w-full sm:w-auto">
          {nurse && open[0] && <Link to={`${base}/meds/${o.id}/record?slot=${encodeURIComponent(open[0].time)}`} aria-label={`Start ${name} for ${hm(open[0].time)}`} className={`${small} bg-primary text-on-primary hover:bg-primary-container`}><Icon name="edit_note" className="text-[16px]" />Start</Link>}
          {nurse && g === 'prn' && <Link to={`${base}/meds/${o.id}/record`} aria-label={`Record PRN dose of ${name}`} className={`${small} bg-primary text-on-primary hover:bg-primary-container`}><Icon name="add" className="text-[16px]" />Record PRN</Link>}
          {nurse && g === 'infusion' && <Link to={`${base}/meds/${o.id}/record?event=rate_changed`} aria-label={`New rate for ${name}`} className={`${small} bg-surface-container-high text-primary hover:bg-surface-variant`}><Icon name="tune" className="text-[16px]" />New rate</Link>}
          {lastSlot?.entry && <Link to={`/entries/${lastSlot.entry.id}`} aria-label={`View record of ${name}`} className={`${small} bg-surface-container-high text-primary hover:bg-surface-variant`}>View record</Link>}
        </div>
      </div>
      {diff && <div className="mt-space-sm"><DoseNotice entry={diff.x} diff={diff.diff!} /></div>}
    </article>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className={kicker}>{label}</dt><dd className="font-body-sm text-body-sm text-primary font-semibold">{children}</dd></div>;
}

function Panel({ o, meds, nowIso, base, names, nurse, patientId, vitals }: { o: ActiveOrder; vitals: Record<string, Measure>; meds: EntryWithChild[]; nowIso: string; base: string; names: Map<string, string>; nurse: boolean; patientId: string }) {
  const { snapshot } = useApp();
  const g = orderGroup(o);
  const high = isHighAlert(o.drug_name);
  const history = orderHistory(o, meds);
  const slots = g === 'scheduled' ? slotStatuses(o, nowIso, meds) : [];
  const open = slots.filter((s) => s.status === 'due' || s.status === 'overdue');
  const photo = history.find((x) => x.entry.raw_input_kind === 'photo');
  const diff = wrongDose(history);
  const rec = `${base}/meds/${o.id}/record`;
  return (
    <div className="flex flex-col gap-space-md">
      <Link to={`${base}/meds`} className="xl:hidden min-h-11 font-body-md text-body-md font-semibold text-primary inline-flex items-center gap-1"><Icon name="arrow_back" className="text-[18px]" />Back to the medication list</Link>
      {high && <HighAlertBar />}
      <Card aria-label={`Order details ${o.id}`} className="flex flex-col gap-space-md shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Icon name="assignment_turned_in" className="text-primary text-[20px]" />
            <div>
              <h2 className="font-headline-sm text-headline-sm text-primary font-bold">Order details: {o.id}</h2>
              <span className={kicker}>Patient list, read only</span>
            </div>
          </div>
          <span className={`${tag} text-primary font-bold uppercase`}>{GROUP[g].tab}</span>
        </div>

        <div className="bg-surface-container-low p-space-sm rounded-lg">
          <span className={kicker}>Prescribed regimen</span>
          <p className="font-body-lg text-body-lg text-primary font-bold">{o.text}</p>
          <dl className="grid grid-cols-2 gap-2 mt-space-sm">
            <Fact label="Dose and route">{orderDose(o) || '—'} · {routeText(o)}</Fact>
            <Fact label="How often">{o.frequency ?? '—'}</Fact>
            <Fact label="Ordered by">{o.ordered_by ?? '—'}</Fact>
            <Fact label="Order placed">{o.start ? dateTimeLabel(o.start) : 'Not recorded'}</Fact>
            <Fact label="Order status">{o.status}</Fact>
            <Fact label="Source">{snapshot ? `Patient list ${hm(snapshot.taken_at)}` : 'Patient list'}</Fact>
          </dl>
        </div>

        {diff && <DoseNotice entry={diff.x} diff={diff.diff!} />}

        <div>
          <span className={`${kicker} !text-primary !text-[11px] mb-1`}>Paper evidence</span>
          {photo ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-surface-container-low p-space-sm rounded-lg">
              <Link to={`/entries/${photo.entry.id}`} aria-label={`Paper photo record from ${hm(photo.entry.care_time)}`} className="bg-surface-container-lowest rounded p-2 min-h-[104px] flex flex-col justify-between hover:ring-1 hover:ring-secondary">
                <span className="flex justify-between items-start"><span className={kicker}>Paper sheet, {hm(photo.entry.care_time)}</span><Icon name="photo_camera" className="text-[15px] text-outline" /></span>
                <span className="self-center"><MedIllustration name="workflows/paper-photo" size={40} /></span>
                <span className="font-code-tabular text-[10px] text-secondary">{who(names, photo.entry.performer_id)} · open record</span>
              </Link>
              <div className="flex flex-col gap-1 min-h-[104px] bg-surface-container-lowest rounded p-2">
                <span className={kicker}>Line on the paper</span>
                <span className="font-body-sm text-body-sm text-on-surface">{(photo.child as MedAdmin | undefined)?.raw_text ?? 'No line text kept for this photo'}</span>
                <span className="mt-auto flex flex-wrap gap-1"><SourceBadge entry={photo.entry} /><Badge tone={photo.entry.status === 'draft' ? 'amber' : 'green'}>{photo.entry.status === 'draft' ? 'Not confirmed' : 'Confirmed by a nurse'}</Badge></span>
              </div>
            </div>
          ) : <p className="bg-surface-container-low p-space-sm rounded-lg font-body-sm text-body-sm text-on-surface-variant">No paper photo for this order.</p>}
        </div>

        <div className="p-space-sm rounded-lg bg-surface-container-low">
          <div className="flex items-center justify-between gap-2 mb-1.5"><span className={kicker}>Latest vital signs</span><span className="font-body-sm text-[11px] text-secondary">For reference only</span></div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([['Blood pressure', vitals.bp], ['Heart rate', vitals.hr], ['Breathing rate', vitals.rr]] as const).map(([l, m]) => (
              <div key={l} className="bg-surface-container-lowest p-1.5 rounded"><span className={kicker}>{l}</span><span className="font-code-tabular text-[13px] font-bold text-primary block">{m ? `${m.value}${m.unit ? ` ${m.unit}` : ''}` : '—'}</span><span className="font-code-tabular text-[10px] text-secondary">{m ? hm(m.time) : 'not recorded'}</span></div>
            ))}
          </div>
        </div>

        {g === 'scheduled' && (
          <div>
            <span className={`${kicker} !text-primary !text-[11px] mb-1`}>Today</span>
            <ul className="flex flex-wrap gap-2">{slots.map((s) => (
              <li key={s.time} className="flex items-center gap-1"><SlotChip slot={s} />{s.entry && <Link to={`/entries/${s.entry.id}`} className="min-h-9 px-2 rounded font-body-sm text-body-sm font-semibold text-secondary hover:bg-surface-container-low inline-flex items-center" aria-label={`Open the ${hm(s.time)} record`}>Open</Link>}</li>
            ))}</ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {nurse && open.map((s, i) => <ButtonLink key={s.time} variant={i === 0 ? 'primary' : 'secondary'} to={`${rec}?slot=${encodeURIComponent(s.time)}`} className="w-full"><Icon name="add_task" />{i === 0 ? 'Record dose' : 'Record'} · {hm(s.time)}</ButtonLink>)}
          {nurse && g === 'prn' && <ButtonLink to={rec} className="w-full"><Icon name="add" />Give now</ButtonLink>}
          {nurse && g === 'infusion' && <><ButtonLink to={`${rec}?event=rate_changed`} className="w-full"><Icon name="tune" />Change rate</ButtonLink><ButtonLink variant="secondary" to={rec} className="w-full">Record start</ButtonLink></>}
          {g === 'scheduled' && open.length === 0 && <p className="min-h-11 rounded-lg bg-surface-container grid place-items-center font-body-sm text-body-sm text-secondary">Every scheduled time today has a record</p>}
          {!nurse && <p className="min-h-11 rounded-lg bg-surface-container grid place-items-center font-body-sm text-body-sm text-secondary">Only nurses can record medicines</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled aria-describedby="flag-why"><Icon name="flag" />Flag time conflict</Button>
            <ButtonLink variant="secondary" to={`/print/mar/${patientId}`}><Icon name="print" />Print MAR schedule</ButtonLink>
          </div>
          <p id="flag-why" className="font-body-sm text-[12px] text-secondary">Time conflicts cannot be flagged: no medicine timing rule has been approved. Write a note instead.</p>
        </div>
      </Card>

      <Card aria-label="Order history">
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">History</h2>
        {history.length ? history.map((x) => (
          <Link key={x.entry.id} to={`/entries/${x.entry.id}`} className="flex items-start gap-space-sm min-h-11 py-2 border-b border-card-border last:border-0 hover:bg-surface-container-low rounded">
            <span className="w-12 shrink-0 font-code-tabular text-[13px] font-bold text-primary">{hm(x.entry.care_time)}</span>
            <span className="flex-1 min-w-0">
              <span className={`block break-words font-body-md text-body-md ${isRetired(x.entry) ? 'line-through text-outline' : 'text-on-surface font-semibold'}`}>{entrySummary(x)}</span>
              <span className="flex flex-wrap gap-1 mt-1"><SourceBadge entry={x.entry} /><StatusBadge entry={x.entry} /></span>
            </span>
            <Icon name="chevron_right" className="text-outline shrink-0" />
          </Link>
        )) : <EmptyState text="Nothing recorded for this order" />}
      </Card>

      <section aria-label="Downtime protocol" className="bg-surface-container-low rounded-xl p-space-md border border-card-border">
        <h2 className="font-headline-sm text-[13px] font-bold text-primary flex items-center gap-2 mb-1"><Icon name="policy" className="text-[18px]" />Downtime medicine records</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">A high-alert medicine is saved only after a second nurse enters their own PIN. Which medicines count as high-alert is a prototype setting, not approved hospital policy. Keep the paper sheet until the hospital system is back.</p>
      </section>
    </div>
  );
}

export function MarPage() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock } = useApp();
  const { user } = useSession();
  const { order: orderId } = useParams();
  const data = useMedData(encounter?.id, patient.id);
  const names = useLiveQuery(async () => new Map((await db.practitioner.toArray()).map((s) => [s.id, `${s.name}, ${s.role}`])), [db]);
  const location = useLocation();
  const saved = (location.state as { saved?: string } | null)?.saved;
  const [tab, setTab] = useState<MarTab>('all');
  const [q, setQ] = useState('');
  const base = `/patients/${patient.id}`;
  const nowIso = clock.nowIso();
  if (!data || !names) return <p role="status">Loading…</p>;

  const orders = data.orders.filter(isMedOrder);
  const shown = filterOrders(orders, tab, q);
  const chosen = orderId ? orders.find((o) => o.id === orderId) : GROUPS.flatMap((g) => shown.filter((o) => orderGroup(o) === g))[0];
  const allSlots = orders.filter((o) => o.status === 'active' && orderGroup(o) === 'scheduled').flatMap((o) => slotStatuses(o, nowIso, data.meds));
  const hours = marHours(nowIso, allSlots);
  const openSlots = allSlots.filter((s) => s.status === 'due' || s.status === 'overdue');
  const outside = [...new Set(openSlots.filter((s) => !hours.some((h) => h.hour === Number(s.time.slice(11, 13)))).map((s) => hm(s.time)))].sort();
  const nextOpen = openSlots.map((s) => s.time).filter((t) => t >= nowIso).sort()[0];
  const tabs: [MarTab, string, string][] = [['all', 'All orders', 'medication'], ...GROUPS.map((g) => [g, GROUP[g].tab, GROUP[g].icon] as [MarTab, string, string]), ['stopped', 'Stopped or on hold', 'block']];
  const common = { meds: data.meds, nowIso, base, names, nurse: isNurse(user) };

  return (
    <>
      <PatientTabs patientId={patient.id} />
      {saved && <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2"><Icon name="check_circle" filled />Saved on this laptop.</p>}

      <section aria-label="Find orders" className={`bg-surface-container-lowest rounded-xl border border-card-border p-space-sm flex-col gap-space-sm ${orderId ? 'hidden xl:flex' : 'flex'}`}>
        <div className="flex flex-wrap items-center justify-between gap-space-sm px-1">
          <h1 className="font-headline-md text-headline-md text-primary">Medicines <span className="text-secondary font-semibold text-body-lg">(MAR)</span></h1>
          <div className="flex flex-wrap items-center gap-space-sm w-full md:w-auto">
            <label className="relative flex-1 min-w-[180px] md:w-60">
              <span className="sr-only">Search orders</span>
              <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[16px]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search orders, route…" className="w-full min-h-9 pl-8 pr-3 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <button type="button" disabled aria-describedby="nonmar-why" className="min-h-9 px-3 rounded-lg bg-primary-container text-on-primary font-label-badge text-label-badge flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"><Icon name="add_circle" className="text-[16px]" />Record non-MAR med</button>
            <Link to={`${base}/orders`} className="min-h-9 px-3 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-label-badge text-label-badge flex items-center gap-1.5"><Icon name="list_alt" className="text-[15px]" />All orders from the patient list</Link>
          </div>
        </div>
          <div role="group" aria-label="Order type" className="flex flex-wrap items-center gap-1">
            {tabs.map(([t, label, icon]) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}
                className={`min-h-9 px-3 rounded-lg font-label-badge text-label-badge flex items-center gap-1.5 transition-colors ${tab === t ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant'}`}>
                <Icon name={icon} className="text-[15px]" />{label}<span className={`px-1.5 rounded-full font-code-tabular text-[10px] font-bold ${tab === t ? 'bg-white/20' : 'bg-surface-container-high text-primary'}`}>{filterOrders(orders, t, '').length}</span>
              </button>
            ))}
          </div>
        <p id="nonmar-why" className="font-body-sm text-[12px] text-secondary px-1">A medicine without an order cannot be recorded here yet. <Link to={`${base}/notes`} className="underline font-semibold">Write a note</Link> instead.</p>
      </section>

      <section aria-label="Today's hours" className={`bg-surface-container-lowest rounded-xl border border-card-border p-space-sm ${orderId ? 'hidden xl:block' : ''}`}>
        <div className="overflow-x-auto"><ol className="grid grid-cols-11 gap-1 min-w-[620px] bg-surface-container-low p-1.5 rounded-lg text-center">
          {hours.map((h) => (
            <li key={h.hour} aria-current={h.now ? 'time' : undefined} className={`relative py-1 rounded font-code-tabular text-[11px] ${h.now ? 'bg-primary text-on-primary font-bold shadow-sm' : 'bg-surface-container text-on-surface-variant'}`}>
              {h.label}
              <span className="sr-only">{h.now ? ', now' : ''}{h.open ? `, ${h.open} not recorded` : ''}{h.recorded ? `, ${h.recorded} recorded` : ''}</span>
              <span aria-hidden className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">{h.recorded > 0 && <span className="w-1.5 h-1.5 rounded-full bg-sync-green" />}{h.open > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />}</span>
            </li>
          ))}
        </ol></div>
        <p className="font-body-sm text-[12px] text-secondary px-1 pt-2 flex flex-wrap gap-x-4">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sync-green" aria-hidden />recorded</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" aria-hidden />scheduled, no record yet</span>
          {outside.length > 0 && <span>Also scheduled today without a record: <span className="font-code-tabular font-semibold">{outside.join(', ')}</span></span>}
        </p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-md items-start">
        <div className={`xl:col-span-7 flex-col gap-space-md ${orderId ? 'hidden xl:flex' : 'flex'}`}>
          {orders.length === 0 ? <EmptyState text="No medicine orders in the patient list" /> : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-space-sm py-space-xl"><Icon name="search_off" className="text-[36px] text-slate-control" /><p className="text-on-surface-variant">{tab === 'stopped' && !q ? 'No stopped or held orders in the patient list.' : 'No orders match.'}</p><Button variant="secondary" onClick={() => { setTab('all'); setQ(''); }}>Show all orders</Button></div>
          ) : GROUPS.map((g) => {
            const list = shown.filter((o) => orderGroup(o) === g);
            if (!list.length) return null;
            const n = list.flatMap((o) => (g === 'scheduled' ? slotStatuses(o, nowIso, data.meds) : [])).filter((s) => s.status === 'due' || s.status === 'overdue').length;
            return (
              <section key={g} aria-labelledby={`g-${g}`} className="flex flex-col gap-space-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <span className="flex items-center gap-2"><h2 id={`g-${g}`} className="font-label-uppercase text-label-uppercase text-primary font-bold uppercase">{GROUP[g].title}</h2>{n > 0 && <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-code-tabular text-[10px] font-bold">{n} not recorded today</span>}</span>
                  {g === 'scheduled' && nextOpen && <span className="font-body-sm text-body-sm text-on-surface-variant">Next scheduled time: {hm(nextOpen)}</span>}
                </div>
                {list.map((o) => <OrderCard key={o.id} o={o} {...common} selected={o.id === chosen?.id} />)}
              </section>
            );
          })}
        </div>
        <div className={`xl:col-span-5 ${orderId ? '' : 'hidden xl:block'}`}>
          {chosen ? <Panel key={chosen.id} o={chosen} vitals={data.measures} {...common} patientId={patient.id} />
            : orderId ? <EmptyState icon="search_off" text="This medicine order was not found." action={<ButtonLink variant="secondary" to={`${base}/meds`}>Back to medicines</ButtonLink>} /> : null}
        </div>
      </div>
    </>
  );
}
