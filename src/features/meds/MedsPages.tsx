import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createEntry, listPatientEntries } from '../../db/repos/entries';
import type { ActiveOrder, MedAdmin } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { ROUTE_LABEL } from '../../config/medicationPolicy';
import {
  currentRate, isHighAlert, isMedOrder, lastGiven, medFormFromOrder, orderDose, orderGroup, orderHistory, slotStatuses,
  type MedEvent, type OrderGroup, type Slot,
} from '../../lib/meds';
import { formatDose } from '../../lib/dose';
import { hm } from '../../lib/time';
import { Badge, Breadcrumbs, ButtonLink, Card, EmptyState, Icon } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { EntryRow } from '../entries/entryView';
import { HighAlertBar, MedEditor } from './MedEditor';
import { MedIllustration, type MedicalAsset } from '../../components/MedIllustration';

const GROUP_LABEL: Record<OrderGroup, string> = { scheduled: 'Scheduled', prn: 'As needed', infusion: 'Drips (infusions)' };

function useMedData(encounterId: string | undefined, patientId: string) {
  const { db } = useApp();
  return useLiveQuery(async () => {
    const orders = encounterId ? await db.active_order.where('encounter_id').equals(encounterId).toArray() : [];
    const meds = (await listPatientEntries(db, patientId)).filter((x) => x.entry.type === 'med_admin');
    return { orders, meds };
  }, [db, encounterId, patientId]);
}

const SLOT_STYLE: Record<Slot['status'], { tone: 'green' | 'amber' | 'neutral' | 'blue' | 'red'; label: string; icon: string }> = {
  given: { tone: 'green', label: 'Given', icon: 'check' },
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

/** Picture by how the drug is given (route), not by its form: the order does not say tablet vs liquid. Decorative only. */
export function orderArt(o: ActiveOrder): MedicalAsset | null {
  if (orderGroup(o) === 'infusion' || o.type === 'iv') return 'medication/iv-bag';
  switch (o.route) {
    case 'IV': return 'medication/vial';
    case 'SC': case 'IM': return 'medication/syringe';
    case 'PO': case 'SL': return 'medication/capsule';
    case 'TOP': return 'medication/tube';
    default: return null;
  }
}

function DrugTitle({ order }: { order: ActiveOrder }) {
  const high = isHighAlert(order.drug_name);
  return (
    <div className="flex items-center gap-space-sm">
      <span className={`w-12 h-12 rounded-full grid place-items-center bg-[#FBF8F2] ${high ? 'ring-2 ring-clinical-red' : 'ring-1 ring-card-border'}`}>
        {orderArt(order) ? <MedIllustration name={orderArt(order)!} size={34} /> : <Icon name="medication" className="text-[22px] text-secondary" />}
      </span>
      <div>
        <span className="block font-headline-sm text-headline-sm text-primary">{order.drug_name ?? order.text}</span>
        {high && <Badge tone="red" icon="warning">High-alert</Badge>}
      </div>
    </div>
  );
}

export function MedsPage() {
  const { patient, encounter } = useCurrentPatient();
  const { clock } = useApp();
  const data = useMedData(encounter?.id, patient.id);
  const location = useLocation();
  const saved = (location.state as { saved?: string } | null)?.saved;
  const base = `/patients/${patient.id}`;
  const today = clock.nowIso();
  const orders = (data?.orders ?? []).filter(isMedOrder);
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Medicines' }]} />
      {saved && <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2"><Icon name="check_circle" filled />Saved on this laptop.</p>}
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg text-headline-lg text-primary">Medicines</h1>
        <ButtonLink variant="secondary" to={`${base}/orders`}>All orders</ButtonLink>
      </div>
      {!data ? <p role="status">Loading…</p> : orders.length === 0 ? <EmptyState text="No medicine orders in the patient list" /> : (
        (['scheduled', 'prn', 'infusion'] as OrderGroup[]).map((g) => {
          const list = orders.filter((o) => orderGroup(o) === g);
          if (!list.length) return null;
          return (
            <section key={g} aria-labelledby={`g-${g}`} className="flex flex-col gap-space-sm">
              <h2 id={`g-${g}`} className="font-label-uppercase text-label-uppercase text-secondary uppercase">{GROUP_LABEL[g]}</h2>
              {list.map((o) => {
                const lg = lastGiven(o, data.meds);
                const rate = g === 'infusion' ? currentRate(o, data.meds) : null;
                return (
                  <Link key={o.id} to={`${base}/meds/${o.id}`} data-testid={`order-${o.id}`}
                    className={`bg-surface-container-lowest rounded-xl border p-space-md flex items-center gap-space-md hover:border-secondary ${isHighAlert(o.drug_name) ? 'border-clinical-red-border' : 'border-card-border'}`}>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <DrugTitle order={o} />
                      <span className="font-body-md text-on-surface-variant">
                        {g === 'infusion' ? `Now ${formatDose(rate?.rate)} ${rate?.unit ?? ''}` : orderDose(o)} · {o.route} ({ROUTE_LABEL[o.route ?? ''] ?? '—'}) · {o.frequency}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[50%]">
                      {g === 'scheduled' && slotStatuses(o, today, data.meds).map((s) => <SlotChip key={s.time} slot={s} />)}
                      {g === 'prn' && <span className="font-body-sm text-secondary">{lg ? `Last given ${hm(lg.entry.care_time)}` : 'Not given yet'}</span>}
                    </div>
                    <Icon name="chevron_right" className="text-outline" />
                  </Link>
                );
              })}
            </section>
          );
        })
      )}
    </>
  );
}

function useOrder() {
  const { order: orderId } = useParams();
  const { patient, encounter } = useCurrentPatient();
  const data = useMedData(encounter?.id, patient.id);
  const order = data?.orders.find((o) => o.id === orderId);
  return { data, order, orderId };
}

export function OrderPage() {
  const { patient } = useCurrentPatient();
  const { clock } = useApp();
  const { user } = useSession();
  const { data, order } = useOrder();
  const base = `/patients/${patient.id}`;
  if (!data) return <p role="status">Loading…</p>;
  if (!order || !isMedOrder(order)) return <EmptyState icon="search_off" text="This medicine order was not found." action={<ButtonLink variant="secondary" to={`${base}/meds`}>Back to medicines</ButtonLink>} />;
  const g = orderGroup(order);
  const history = orderHistory(order, data.meds);
  const slots = g === 'scheduled' ? slotStatuses(order, clock.nowIso(), data.meds) : [];
  const rec = `${base}/meds/${order.id}/record`;
  const nurse = isNurse(user);
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Medicines', to: `${base}/meds` }, { label: order.drug_name ?? 'Order' }]} />
      {isHighAlert(order.drug_name) && <HighAlertBar />}
      <Card className="flex flex-col gap-space-md">
        <DrugTitle order={order} />
        <p className="font-body-lg text-on-surface">{order.text}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-1 font-body-md">
          <dt className="text-secondary">Dose</dt><dd className="font-code-tabular">{orderDose(order)}</dd>
          <dt className="text-secondary">Route</dt><dd>{order.route} ({ROUTE_LABEL[order.route ?? ''] ?? '—'})</dd>
          <dt className="text-secondary">How often</dt><dd>{order.frequency}</dd>
          <dt className="text-secondary">Ordered by</dt><dd>{order.ordered_by ?? '—'}</dd>
        </dl>
        {g === 'scheduled' && (
          <div className="flex flex-col gap-space-sm">
            <h2 className="font-headline-sm text-headline-sm text-primary">Today</h2>
            {slots.map((s) => (
              <div key={s.time} className="flex items-center gap-space-md min-h-12 border-b border-card-border last:border-0">
                <span className="w-14 font-code-tabular font-bold text-primary">{hm(s.time)}</span>
                <SlotChip slot={s} />
                <span className="flex-1" />
                {(s.status === 'due' || s.status === 'overdue') && nurse && <ButtonLink to={`${rec}?slot=${encodeURIComponent(s.time)}`}><Icon name="edit_note" />Record dose</ButtonLink>}
                {s.entry && <ButtonLink variant="ghost" to={`/entries/${s.entry.id}`}>Open</ButtonLink>}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-space-sm">
          {g === 'prn' && nurse && <ButtonLink to={rec}><Icon name="add" />Give now</ButtonLink>}
          {g === 'infusion' && nurse && <ButtonLink to={`${rec}?event=rate_changed`}><Icon name="tune" />Change rate</ButtonLink>}
          {g === 'infusion' && nurse && <ButtonLink variant="secondary" to={rec}>Record start</ButtonLink>}
        </div>
      </Card>
      <Card>
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">History</h2>
        {history.length ? history.map((x) => <EntryRow key={x.entry.id} item={x} />) : <EmptyState text="Nothing recorded for this order" />}
      </Card>
    </>
  );
}

export function RecordMed() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, order } = useOrder();
  const base = `/patients/${patient.id}`;
  if (!data) return <p role="status">Loading…</p>;
  if (!order || !isMedOrder(order)) return <EmptyState icon="search_off" text="This medicine order was not found." />;
  if (!isNurse(user)) return <EmptyState icon="block" text="Only nurses can record medicines." />;
  const g = orderGroup(order);
  const slot = params.get('slot');
  const validSlot = slot && slotStatuses(order, clock.nowIso(), data.meds).some((s) => s.time === slot && (s.status === 'due' || s.status === 'overdue')) ? slot : null;
  const startEvent = (params.get('event') === 'rate_changed' && g === 'infusion' ? 'rate_changed' : 'administered') as MedEvent;
  const events: MedEvent[] = g === 'infusion' ? ['rate_changed', 'administered', 'held'] : ['administered', 'held', 'refused'];
  const prior = currentRate(order, data.meds).rate;
  const recentSites = orderHistory(order, data.meds)
    .filter((x) => x.entry.status === 'confirmed' && (x.child as MedAdmin).site)
    .slice(0, 3)
    .map((x) => ({ site: (x.child as MedAdmin).site!, time: x.entry.care_time }));
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Medicines', to: `${base}/meds` }, { label: order.drug_name ?? 'Order', to: `${base}/meds/${order.id}` }, { label: 'Record' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">{order.drug_name}{validSlot ? ` · due ${hm(validSlot)}` : ''}</h1>
      <MedEditor
        order={order}
        initial={medFormFromOrder(order, startEvent)}
        events={events}
        priorRate={prior}
        recentSites={recentSites}
        scheduledTime={validSlot}
        minCareTime={encounter?.admit_time}
        saveLabel="Save"
        onCancel={() => navigate(`${base}/meds/${order.id}`)}
        onSubmit={async ({ values, careTime }) => {
          if (!user) throw new Error('Sign in again.');
          const e = await createEntry(db, clock, { userId: user.id, deviceId }, { type: 'med_admin', patientId: patient.id, careTime, scheduledTime: validSlot, values });
          navigate(`${base}/meds`, { state: { saved: e.id } });
        }}
      />
    </>
  );
}

export function OrdersPage() {
  const { patient, encounter } = useCurrentPatient();
  const data = useMedData(encounter?.id, patient.id);
  const base = `/patients/${patient.id}`;
  const TYPES: Record<string, string> = { med: 'Medicines', iv: 'IV fluids', nursing: 'Nursing', lab: 'Lab tests', diet: 'Diet', imaging: 'Scans' };
  const groups = new Map<string, ActiveOrder[]>();
  for (const o of data?.orders ?? []) groups.set(o.type, [...(groups.get(o.type) ?? []), o]);
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Orders' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">Orders</h1>
      <p className="font-body-sm text-secondary -mt-space-sm">From the patient list taken before the outage. Read only.</p>
      {!data ? <p role="status">Loading…</p> : groups.size === 0 ? <EmptyState text="No orders" /> : [...groups].map(([t, list]) => (
        <Card key={t}>
          <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">{TYPES[t] ?? t}</h2>
          <ul className="flex flex-col">
            {list.map((o) => (
              <li key={o.id} className="flex items-center gap-space-md min-h-12 border-b border-card-border last:border-0">
                <span className="flex-1">{o.text}</span>
                {isHighAlert(o.drug_name) && <Badge tone="red" icon="warning">High-alert</Badge>}
                {isMedOrder(o) && <ButtonLink variant="ghost" to={`${base}/meds/${o.id}`}>Open</ButtonLink>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}

/** Values block for a medicine entry (used on Record details). */
export function MedValues({ m, names }: { m: MedAdmin; names: Map<string, string> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-1 font-body-md rounded-lg bg-surface-container-low p-space-md">
      <dt className="text-secondary">Drug</dt><dd className="font-semibold">{m.drug_name}</dd>
      <dt className="text-secondary">What happened</dt><dd>{m.event === 'administered' ? 'Given' : m.event === 'held' ? 'Held' : m.event === 'refused' ? 'Refused' : m.event === 'rate_changed' ? 'Rate changed' : m.event}</dd>
      {m.dose_given != null && <><dt className="text-secondary">Dose given</dt><dd className="font-code-tabular font-bold">{formatDose(m.dose_given)} {m.dose_given_unit}</dd></>}
      {m.dose_due != null && <><dt className="text-secondary">Ordered</dt><dd className="font-code-tabular">{formatDose(m.dose_due)} {m.dose_due_unit}</dd></>}
      <dt className="text-secondary">Route</dt><dd>{m.route ?? <Badge tone="amber" icon="help">Route missing</Badge>}</dd>
      {m.site && <><dt className="text-secondary">Site</dt><dd>{m.site}</dd></>}
      {m.infusion_rate != null && <><dt className="text-secondary">Rate</dt><dd className="font-code-tabular">{formatDose(m.prior_infusion_rate)} → {formatDose(m.infusion_rate)} {m.infusion_rate_unit}</dd></>}
      {m.reason && <><dt className="text-secondary">Reason / note</dt><dd>{m.reason}</dd></>}
      {m.double_checked_by && <><dt className="text-secondary">Second nurse</dt><dd className="flex items-center gap-1"><Icon name="verified_user" className="text-sync-green" />{names.get(m.double_checked_by) ?? m.double_checked_by}</dd></>}
    </dl>
  );
}

