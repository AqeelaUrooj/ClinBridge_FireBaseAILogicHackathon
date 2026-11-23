import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createEntry, listPatientEntries } from '../../db/repos/entries';
import type { ActiveOrder, MedAdmin } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { ROUTE_LABEL } from '../../config/medicationPolicy';
import {
  currentRate, isHighAlert, isMedOrder, lastGiven, medFormFromOrder, orderGroup, orderHistory, slotStatuses, type MedEvent,
} from '../../lib/meds';
import { formatDose } from '../../lib/dose';
import { dateTimeLabel, hm } from '../../lib/time';
import { Badge, Breadcrumbs, ButtonLink, Card, EmptyState, Icon } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName, isNoKnownAllergy } from '../patient/patientData';
import { latestMeasures } from '../ward/wardData';
import { MedEditor } from './MedEditor';
import { elapsed } from './marData';
import type { RefFact } from './MedRecordLayout';
import type { MedicalAsset } from '../../components/MedIllustration';

/** Medicine records plus the latest vital signs (each with its own time) for one patient. Read only. */
export function useMedData(encounterId: string | undefined, patientId: string) {
  const { db } = useApp();
  return useLiveQuery(async () => {
    const orders = encounterId ? await db.active_order.where('encounter_id').equals(encounterId).toArray() : [];
    const entries = await listPatientEntries(db, patientId);
    return { orders, meds: entries.filter((x) => x.entry.type === 'med_admin'), measures: latestMeasures(entries) };
  }, [db, encounterId, patientId]);
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

function useOrder() {
  const { order: orderId } = useParams();
  const { patient, encounter } = useCurrentPatient();
  const data = useMedData(encounter?.id, patient.id);
  const order = data?.orders.find((o) => o.id === orderId);
  return { data, order, orderId };
}

export function RecordMed() {
  const { patient, encounter, allergies } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, order } = useOrder();
  const extra = useLiveQuery(async () => ({ names: new Map((await db.practitioner.toArray()).map((p) => [p.id, p.name])), logRows: await db.audit_log.count(), device: (await db.device.get(deviceId))?.label }), [db, deviceId]);
  const base = `/patients/${patient.id}`;
  if (!data || !extra) return <p role="status">Loading…</p>;
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
  const now = clock.nowIso();
  const last = lastGiven(order, data.meds);
  const lastDose = last?.child as MedAdmin | undefined;
  const ago = last && elapsed(last.entry.care_time, now);
  const drafts = orderHistory(order, data.meds).filter((x) => x.entry.status === 'draft');
  const real = allergies.filter((a) => !isNoKnownAllergy(a));
  const { pain, rr } = data.measures;
  const facts: RefFact[] = [
    real.length
      ? { text: `Allergy: ${real.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction}${a.severity ? `, ${a.severity}` : ''})` : ''}`).join('; ')}`, source: 'Patient list', tone: 'red' }
      : { text: allergies.length ? 'No known allergies' : 'Allergies not recorded', source: 'Patient list' },
    last
      ? { text: `Last dose of this order: ${formatDose(lastDose?.dose_given)} ${lastDose?.dose_given_unit ?? ''} at ${dateTimeLabel(last.entry.care_time)}${ago ? `, ${ago} ago` : ''}, by ${extra.names.get(last.entry.performer_id) ?? last.entry.performer_id}`, source: 'Recorded' }
      : { text: 'No dose of this order is recorded yet', source: 'Records' },
    ...drafts.map((d): RefFact => ({ text: `A record for this order at ${hm(d.entry.care_time)} is waiting to be checked`, source: 'Draft', tone: 'amber' })),
    { text: rr ? `Latest breathing rate: ${rr.value} /min at ${dateTimeLabel(rr.time)}` : 'No breathing rate recorded', source: rr ? 'Recorded' : 'Records' },
  ];
  const wide = {
    art: orderArt(order), high: isHighAlert(order.drug_name), dueLabel: validSlot ? `DUE ${hm(validSlot)}` : undefined, facts,
    tiles: [
      { label: 'Route', value: order.route ?? '—', note: ROUTE_LABEL[order.route ?? ''] },
      { label: 'How often', value: order.frequency ?? '—' },
      { label: 'Latest pain score', value: pain ? pain.value : 'Not recorded', note: pain ? hm(pain.time) : undefined },
      { label: 'Last site', value: recentSites[0]?.site ?? 'Not recorded', note: recentSites[0] ? hm(recentSites[0].time) : undefined },
    ],
    recorder: user ? `${user.name}, ${user.role}` : '', deviceId: extra.device ?? deviceId, logRows: extra.logRows,
  };
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Medicines', to: `${base}/meds` }, { label: order.drug_name ?? 'Order', to: `${base}/meds/${order.id}` }, { label: 'Record' }]} />
      <MedEditor
        order={order}
        initial={medFormFromOrder(order, startEvent)}
        events={events}
        priorRate={prior}
        recentSites={recentSites}
        wide={wide}
        scheduledTime={validSlot}
        minCareTime={encounter?.admit_time}
        saveLabel="Save dose record"
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

