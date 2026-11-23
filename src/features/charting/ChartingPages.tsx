import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createEntry, listPatientEntries } from '../../db/repos/entries';
import type { LabEvent } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { labLabel } from '../../lib/charting';
import { hm } from '../../lib/time';
import { Badge, Breadcrumbs, ButtonLink, Card, EmptyState, Icon, PageTitle } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { EntryRow } from '../entries/entryView';
import { LabEditor, NoteEditor, labToForm, noteToForm } from './editors';

function useTyped(patientId: string, type: 'note' | 'lab_event') {
  const { db } = useApp();
  return useLiveQuery(async () => (await listPatientEntries(db, patientId)).filter((x) => x.entry.type === type), [db, patientId, type]);
}

function Saved() {
  const location = useLocation();
  if (!(location.state as { saved?: string } | null)?.saved) return null;
  return <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2"><Icon name="check_circle" filled />Saved on this laptop.</p>;
}

const NurseOnly = () => <EmptyState icon="block" text="Only nurses can add records." />;

/* ------------------------------ Notes ------------------------------ */

export function RecordNote() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const base = `/patients/${patient.id}`;
  if (!isNurse(user)) return <NurseOnly />;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Notes', to: `${base}/notes` }, { label: 'New' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">New note</h1>
      <NoteEditor initial={noteToForm()} minCareTime={encounter?.admit_time} saveLabel="Save"
        onCancel={() => navigate(`${base}/notes`)}
        onSubmit={async ({ values, careTime }) => {
          const e = await createEntry(db, clock, { userId: user!.id, deviceId }, { type: 'note', patientId: patient.id, careTime, values });
          navigate(`${base}/notes`, { state: { saved: e.id } });
        }} />
    </>
  );
}

/* ------------------------------ Labs ------------------------------ */

export function PatientLabsPage() {
  const { patient } = useCurrentPatient();
  const items = useTyped(patient.id, 'lab_event');
  const base = `/patients/${patient.id}`;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Labs' }]} />
      <Saved />
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg text-headline-lg text-primary">Labs</h1>
        <ButtonLink to={`${base}/labs/record`}><Icon name="add" />Record lab</ButtonLink>
      </div>
      <Card>
        {!items ? <p role="status">Loading…</p> : items.length ? items.map((x) => <EntryRow key={x.entry.id} item={x} />) : <EmptyState text="No lab records" />}
      </Card>
    </>
  );
}

export function RecordLab() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const labOrders = useLiveQuery(async () => (encounter ? (await db.active_order.where('encounter_id').equals(encounter.id).toArray()).filter((o) => o.type === 'lab') : []), [db, encounter?.id]);
  const base = `/patients/${patient.id}`;
  if (!isNurse(user)) return <NurseOnly />;
  if (!labOrders) return <p role="status">Loading…</p>;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Labs', to: `${base}/labs` }, { label: 'Record' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">Record lab</h1>
      <LabEditor initial={labToForm()} labOrders={labOrders} minCareTime={encounter?.admit_time} saveLabel="Save"
        onCancel={() => navigate(`${base}/labs`)}
        onSubmit={async ({ values, careTime }) => {
          const order = labOrders.find((o) => o.id === values.order_id);
          const full = { ...values, order_time: order?.start ?? null, result_time: values.status === 'resulted' || values.status === 'critical' ? careTime : null };
          const e = await createEntry(db, clock, { userId: user!.id, deviceId }, { type: 'lab_event', patientId: patient.id, careTime, values: full });
          navigate(`${base}/labs`, { state: { saved: e.id } });
        }} />
    </>
  );
}

/** Ward-wide labs: newest status per entry, critical first. Read only. */
export function WardLabsPage() {
  const { db } = useApp();
  const rows = useLiveQuery(async () => {
    const entries = (await db.entry.where('status').anyOf('confirmed', 'draft').toArray()).filter((e) => e.type === 'lab_event');
    const labs = await db.lab_event.where('entry_id').anyOf(entries.map((e) => e.id)).toArray();
    const patients = new Map((await db.patient.toArray()).map((p) => [p.id, p]));
    const encs = new Map((await db.encounter.toArray()).map((x) => [x.patient_id, x]));
    return entries.map((e) => ({ e, l: labs.find((l) => l.entry_id === e.id) as LabEvent, p: patients.get(e.patient_id), bed: encs.get(e.patient_id)?.bed }))
      .filter((r) => r.l)
      .sort((a, b) => Number(b.l.status === 'critical') - Number(a.l.status === 'critical') || b.e.care_time.localeCompare(a.e.care_time));
  }, [db]);
  return (
    <>
      <PageTitle>Labs</PageTitle>
      <Card>
        {!rows ? <p role="status">Loading…</p> : rows.length === 0 ? <EmptyState text="No lab records" /> : (
          <ul className="flex flex-col">
            {rows.map(({ e, l, p, bed }) => (
              <li key={e.id}>
                <Link to={`/entries/${e.id}`} className="flex items-center gap-space-md min-h-[56px] border-b border-card-border last:border-0 hover:bg-surface-container-low px-space-sm rounded">
                  <span className="w-14 font-code-tabular font-bold text-primary">{hm(e.care_time)}</span>
                  <Badge>{bed ? `Bed ${bed}` : '—'}</Badge>
                  <span className="w-40 truncate font-semibold">{p ? `${p.given_name} ${p.family_name}` : e.patient_id}</span>
                  <span className="flex-1 truncate">{l.test_name}{l.value_num != null ? ` · ${l.value_num} ${l.unit ?? ''}` : l.value_text ? ` · ${l.value_text}` : ''}</span>
                  <Badge tone={l.status === 'critical' ? 'red' : l.status === 'resulted' ? 'green' : 'neutral'} icon={l.status === 'critical' ? 'emergency' : undefined}>{labLabel(l.status)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
