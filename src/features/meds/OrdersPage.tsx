import { useState, type ReactNode } from 'react';
import { allergyState } from '../../lib/admission';
import { useLiveQuery } from 'dexie-react-hooks';
import { listPatientEntries } from '../../db/repos/entries';
import type { ActiveOrder, MedAdmin } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { ROUTE_LABEL } from '../../config/medicationPolicy';
import { isHighAlert, isMedOrder, orderDose, orderGroup } from '../../lib/meds';
import { dateTimeLabel } from '../../lib/time';
import { Badge, Breadcrumbs, Button, ButtonLink, EmptyState, Icon } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { useCurrentPatient } from '../patient/PatientLayout';
import { PatientTabs } from '../patient/PatientTabs';
import { fullName, isNoKnownAllergy } from '../patient/patientData';
import { medLines } from '../handoff/handoffData';
import { doseDifference } from '../ward/wardData';
import { orderArt } from './MedsPages';

const PANEL = 'bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-md';
type Tab = 'all' | 'meds' | 'nursing' | 'lab' | 'diet' | 'stopped';
const TABS: { v: Tab; label: string }[] = [
  { v: 'all', label: 'All orders' }, { v: 'meds', label: 'Medicines and IV' }, { v: 'nursing', label: 'Nursing' }, { v: 'lab', label: 'Lab and scans' }, { v: 'diet', label: 'Diet' }, { v: 'stopped', label: 'Stopped' },
];
const TYPE: Record<string, { label: string; icon: string }> = {
  med: { label: 'Medicine', icon: 'medication' }, iv: { label: 'IV fluid', icon: 'water_drop' }, nursing: { label: 'Nursing', icon: 'assignment_ind' }, lab: { label: 'Lab test', icon: 'science' }, diet: { label: 'Diet', icon: 'restaurant' }, imaging: { label: 'Scan', icon: 'radiology' },
};
const active = (o: ActiveOrder) => o.status === 'active';

export function inOrderTab(o: ActiveOrder, tab: Tab): boolean {
  if (tab === 'stopped') return !active(o);
  if (!active(o)) return false;
  return tab === 'all' || (tab === 'meds' ? isMedOrder(o) : tab === 'lab' ? o.type === 'lab' || o.type === 'imaging' : o.type === tab);
}
/** How the order runs, in the order's own terms. */
export function orderKind(o: ActiveOrder): string {
  if (!active(o)) return `Not active: ${o.status}`;
  if (!isMedOrder(o)) return 'Active';
  return { scheduled: 'Active, at set times', prn: 'Active, as needed', infusion: 'Active, continuous' }[orderGroup(o)];
}

/** Patient orders and allergies (Stitch "Patient orders & allergies"). Read only: copied from the patient list. */
export function OrdersPage() {
  const { patient, encounter: e, allergies } = useCurrentPatient();
  const { db, clock } = useApp();
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const nurse = isNurse(user);
  const base = `/patients/${patient.id}`;
  const data = useLiveQuery(async () => {
    const [orders, entries, snaps] = await Promise.all([
      e ? db.active_order.where('encounter_id').equals(e.id).toArray() : Promise.resolve([] as ActiveOrder[]), listPatientEntries(db, patient.id), db.snapshot.toArray(),
    ]);
    return { orders, entries, snap: snaps.sort((a, b) => b.taken_at.localeCompare(a.taken_at))[0] };
  }, [db, patient.id, e?.id]);
  if (!data) return <p role="status">Loading…</p>;
  const lines = new Map(medLines(data.orders, data.entries, clock.nowIso()).map((l) => [l.id, l.notes]));
  const differs = (o: ActiveOrder) => data.entries.filter((x) => x.entry.type === 'med_admin' && x.entry.status === 'confirmed' && (x.child as MedAdmin | undefined)?.order_id === o.id).map((x) => doseDifference(x.child as MedAdmin)).find(Boolean);
  const needle = q.trim().toLowerCase();
  const shown = data.orders.filter((o) => inOrderTab(o, tab) && (!needle || [o.text, o.id, o.drug_name, o.frequency, o.ordered_by, TYPE[o.type]?.label].some((t) => (t ?? '').toLowerCase().includes(needle))));
  const real = allergies.filter((a) => !isNoKnownAllergy(a));
  const nka = allergies.length > 0 && real.length === 0;
  const fact = (k: string, v: ReactNode) => <span className="whitespace-normal"><span className="text-secondary">{k}: </span><span className="font-semibold text-primary">{v}</span></span>;
  return (
    <>
      <div className="print:hidden"><Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Orders' }]} /></div>
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-primary print:text-black">Orders and allergies</h1>
        <div className="flex flex-wrap gap-space-sm print:hidden">
          <ButtonLink variant="secondary" to={`${base}/meds`}><Icon name="medication" />Open MAR</ButtonLink>
          <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print orders</Button>
        </div>
      </div>
      <div className="print:hidden"><PatientTabs patientId={patient.id} /></div>
      <p role="note" aria-label="Read only" className="rounded-xl bg-primary-container text-white p-space-md flex items-start gap-space-sm font-body-md text-body-md print:bg-white print:text-black print:border print:border-black">
        <Icon name="lock_clock" /><span><strong>Read only, from the patient list{data.snap ? ` of ${dateTimeLabel(data.snap.taken_at)}` : ''}.</strong> ClinBridge takes no new orders. A new or verbal order goes on paper, by the hospital’s own policy.</span>
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-space-md items-start print:block print:space-y-3">
        <div className="min-w-0 flex flex-col gap-space-md print:block print:space-y-3">
          <section aria-label="Allergies and precautions" className={`${PANEL} grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-space-sm break-inside-avoid print:border-black print:shadow-none`}>
            <div className={`rounded-lg p-space-md flex items-start gap-space-sm ${real.length ? 'bg-error-container text-on-error-container' : nka ? 'bg-surface-container-low' : 'bg-downtime-amber-bg'}`}>
              <Icon name={real.length ? 'warning' : nka ? 'verified_user' : 'help'} />
              <div className="min-w-0">
                <h2 className="font-headline-sm text-headline-sm">{real.length ? 'Allergies' : nka ? 'No known allergies' : patient.allergy_status === 'unknown' || patient.allergy_status === 'not_assessed' ? allergyState(patient, allergies).text : 'Allergies not recorded on the list'}</h2>
                {real.length > 0 ? <ul className="flex flex-col gap-1 mt-1">{real.map((a) => <li key={a.id} className="font-body-md text-body-md [overflow-wrap:anywhere]"><strong>{a.substance}</strong>{a.reaction ? `: ${a.reaction}` : ''}{a.severity ? ` (${a.severity})` : ''}</li>)}</ul>
                  : <p className="font-body-md text-body-md">{nka ? 'As written on the patient list.' : 'The patient list has no allergy line for this patient.'}</p>}
              </div>
            </div>
            <div className="rounded-lg bg-surface-container-low p-space-md">
              <h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase">Precautions</h2>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-sm gap-y-1 mt-1 font-body-md text-body-md"><dt className="text-secondary">Isolation</dt><dd className="font-semibold text-primary">{e?.isolation ?? 'None on the list'}</dd><dt className="text-secondary">Code</dt><dd className="font-semibold text-primary">{e?.code_status ?? 'Not on the list'}</dd><dt className="text-secondary">Diet</dt><dd className="font-semibold text-primary">{e?.diet ?? 'Not on the list'}</dd></dl>
            </div>
          </section>

          <div className={`${PANEL} !p-1.5 flex flex-wrap items-center gap-1 print:hidden`}>
            <div role="group" aria-label="Order type" className="flex flex-wrap gap-1 basis-full lg:basis-auto lg:flex-1">
              {TABS.map((t) => <button key={t.v} type="button" aria-pressed={tab === t.v} onClick={() => setTab(t.v)} className={`min-h-11 px-3 rounded-lg font-body-md text-body-md font-semibold ${tab === t.v ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container'}`}>{t.label} ({data.orders.filter((o) => inOrderTab(o, t.v)).length})</button>)}
            </div>
            <label className="basis-full lg:basis-64 flex items-center gap-2 h-11 rounded-lg bg-surface-container-low px-space-sm"><Icon name="search" className="text-secondary" /><span className="sr-only">Search orders</span><input type="search" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search orders" className="flex-1 min-w-0 bg-transparent outline-none font-body-md text-body-md" /></label>
          </div>

          {shown.length === 0 ? <div className={PANEL}><EmptyState text={data.orders.length === 0 ? 'No orders on the patient list' : 'No orders here'} /></div> : (
            <ul aria-label="Orders" className="flex flex-col gap-space-sm print:block print:space-y-2">
              {shown.map((o) => {
                const art = isMedOrder(o) ? orderArt(o) : null;
                const t = TYPE[o.type] ?? { label: o.type, icon: 'assignment' };
                const notes = lines.get(o.id), diff = isMedOrder(o) ? differs(o) : undefined;
                return (
                  <li key={o.id} data-testid={`order-${o.id}`} className={`break-inside-avoid ${PANEL} flex flex-col gap-space-sm print:border-black print:shadow-none ${active(o) ? '' : 'opacity-80'}`}>
                    <div className="flex flex-wrap items-start gap-space-md">
                      <span className="w-16 rounded-lg bg-surface-container-low p-1.5 flex flex-col items-center gap-1 shrink-0"><span className="w-9 h-9 grid place-items-center">{art ? <MedIllustration name={art} size={34} /> : <Icon name={t.icon} className="text-[26px] text-primary" />}</span><span className="font-label-badge text-[10px] leading-tight text-secondary text-center uppercase">{t.label}</span></span>
                      <div className="flex-1 min-w-[12rem] flex flex-col gap-1">
                        <p className="flex flex-wrap items-center gap-2"><span className="px-1.5 py-0.5 rounded bg-primary text-on-primary font-code-tabular text-[12px] font-semibold">{o.id}</span><Badge tone={active(o) ? 'green' : 'neutral'}>{orderKind(o)}</Badge>{isHighAlert(o.drug_name) && <Badge tone="red" icon="warning">High-alert</Badge>}</p>
                        <p className={`font-body-lg text-body-lg font-bold [overflow-wrap:anywhere] ${active(o) ? 'text-primary' : 'line-through text-outline'}`}>{o.text}</p>
                        <p className="flex flex-wrap gap-x-space-md gap-y-0.5 font-body-sm text-body-sm">
                          {o.dose != null && fact('Dose', orderDose(o))}
                          {o.route && fact('Route', `${o.route} (${ROUTE_LABEL[o.route] ?? o.route})`)}
                          {o.frequency && fact('How often', o.frequency)}
                          {o.start && fact('Start', dateTimeLabel(o.start))}
                          {o.stop && fact('Stop', dateTimeLabel(o.stop))}
                        </p>
                      </div>
                      <div className="text-left sm:text-right min-w-[8rem]">
                        {o.scheduled_times?.length ? <><p className="font-label-uppercase text-label-uppercase text-secondary uppercase">Times on the order</p><p className="font-code-tabular text-[17px] font-bold text-primary">{o.scheduled_times.join(', ')}</p></> : null}
                        {o.ordered_by && <p className="font-body-sm text-body-sm text-secondary">Ordered by {o.ordered_by}</p>}
                      </div>
                    </div>
                    {diff && <p className="rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-sm font-body-md text-body-md font-semibold text-[#6b4a0e] flex items-center gap-2"><Icon name="warning" className="text-[20px]" />{diff}</p>}
                    {(notes || (nurse && active(o) && o.type !== 'diet' && o.type !== 'imaging')) && (
                      <div className="rounded-lg bg-surface-container-low p-space-sm flex flex-wrap items-center justify-between gap-space-sm print:bg-white print:p-0">
                        <p className="flex-1 min-w-[12rem] font-body-sm text-body-sm text-on-surface-variant">{notes ? notes.map((n) => <span key={n} className="block">{n}</span>) : 'ClinBridge keeps no schedule for this order.'}</p>
                        <span className="flex flex-wrap gap-2 print:hidden">
                          {isMedOrder(o) && <ButtonLink variant="secondary" to={`${base}/meds/${o.id}`}>Open</ButtonLink>}
                          {nurse && active(o) && isMedOrder(o) && <ButtonLink to={`${base}/meds/${o.id}/record`}><Icon name="medication" />Prepare dose</ButtonLink>}
                          {nurse && active(o) && o.type === 'lab' && <ButtonLink variant="secondary" to={`${base}/labs/record?order=${o.id}`}>Record lab</ButtonLink>}
                          {nurse && active(o) && o.type === 'nursing' && <ButtonLink variant="secondary" to={`${base}/notes/new`}>Write a note</ButtonLink>}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="min-w-0 flex flex-col gap-space-md print:hidden">
          <section aria-label="Patient list" className={`${PANEL} flex flex-col gap-space-sm`}>
            <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="inventory" />Patient list</h2>
            {data.snap ? (
              <>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-sm gap-y-1 font-body-md text-body-md"><dt className="text-secondary">Taken</dt><dd className="font-semibold text-primary">{dateTimeLabel(data.snap.taken_at)}</dd><dt className="text-secondary">From</dt><dd className="font-semibold text-primary">{data.snap.source_system}</dd><dt className="text-secondary">Unit</dt><dd className="font-semibold text-primary">{data.snap.unit}</dd></dl>
                <dl className="grid grid-cols-2 gap-2">{([['active_order', 'Orders on the list'], ['patient', 'Patients'], ['allergy', 'Allergy lines'], ['snapshot_result', 'Results']] as const).map(([k, label]) => <div key={k} className="rounded-lg bg-surface-container-low p-space-sm"><dd className="font-code-tabular text-[22px] leading-tight font-bold text-primary">{data.snap!.row_counts?.[k] ?? '—'}</dd><dt className="font-body-sm text-body-sm text-secondary">{label}</dt></div>)}</dl>
                <p className="font-body-sm text-body-sm text-secondary">Counts for the whole ward, when the list was taken.</p>
              </>
            ) : <p className="font-body-md text-body-md text-secondary">No patient list on this laptop.</p>}
          </section>
          <section aria-label="Order actions" className={`${PANEL} flex flex-col gap-2`}>
            <h2 className="font-headline-sm text-headline-sm text-primary">On paper</h2>
            <ButtonLink variant="secondary" to={`/print/mar/${patient.id}`}><Icon name="print" />Paper medication record</ButtonLink>
            <ButtonLink variant="secondary" to={`/print/sbar/${patient.id}`}><Icon name="draft" />Paper verbal order form</ButtonLink>
          </section>
          <section aria-label="New allergy or order" className="rounded-xl bg-downtime-amber-bg border border-downtime-amber-border p-space-md flex flex-col gap-space-sm">
            <h2 className="font-headline-sm text-headline-sm text-[#6b4a0e] flex items-center gap-2"><Icon name="warning" />New allergy or reaction</h2>
            <p className="font-body-md text-body-md text-[#6b4a0e]">ClinBridge does not change the hospital allergy list and sends no alert. Follow the hospital’s policy, and write what happened in a note.</p>
            {nurse && <ButtonLink variant="secondary" className="self-start" to={`${base}/notes/new`}><Icon name="edit_note" />Write what happened</ButtonLink>}
          </section>
        </div>
      </div>
    </>
  );
}
