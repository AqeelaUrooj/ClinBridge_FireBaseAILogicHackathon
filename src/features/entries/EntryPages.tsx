import { createContext, useContext, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { createEntry, getEntry, listPatientEntries, markEnteredInError, versionChain, type EntryWithChild } from '../../db/repos/entries';
import type { MedAdmin, VitalSign } from '../../db/schema';
import { legacyReason } from '../../db/db';
import { isNurse, useApp, useSession } from '../../state/app';
import { VITAL_RULES, type VitalKey } from '../../lib/vitals';
import { dateTimeLabel } from '../../lib/time';
import { Breadcrumbs, Button, ButtonLink, Card, Dialog, EmptyState, Icon } from '../../components/ui';
import { PatientFrame, useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { StatusBadge, SourceBadge, TYPE_LABEL, entrySummary, isRetired } from './entryView';
import { VitalsEditor, vitalsToForm } from '../vitals/VitalsEditor';
import { MedEditor } from '../meds/MedEditor';
import { MedValues } from '../meds/MedsPages';
import { currentRate, medFormFromOrder, orderGroup, type MedEvent } from '../../lib/meds';

const EntryCtx = createContext<EntryWithChild | null>(null);
const useCurrentEntry = () => {
  const v = useContext(EntryCtx);
  if (!v) throw new Error('useCurrentEntry outside entry route');
  return v;
};

/** /entries/:entry/* — loads the entry, then runs the same patient check as patient pages. */
export function EntryLayout() {
  const { entry: id } = useParams();
  const { db } = useApp();
  const item = useLiveQuery(async () => (id ? (await getEntry(db, id)) ?? null : null), [db, id]);
  if (item === undefined) return <p role="status" className="text-secondary">Loading…</p>;
  if (item === null) return <EmptyState icon="search_off" text="This record was not found." action={<ButtonLink to="/ward" variant="secondary">Back to My patients</ButtonLink>} />;
  return (
    <PatientFrame patientId={item.entry.patient_id}>
      <EntryCtx.Provider value={item}><Outlet /></EntryCtx.Provider>
    </PatientFrame>
  );
}

function useNames() {
  const { db } = useApp();
  return useLiveQuery(async () => new Map((await db.practitioner.toArray()).map((p) => [p.id, p.name])), [db]) ?? new Map<string, string>();
}

function Crumbs({ last }: { last: string }) {
  const { patient } = useCurrentPatient();
  const { entry } = useCurrentEntry();
  return <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: `/patients/${patient.id}` }, { label: 'History', to: `/patients/${patient.id}/timeline` }, ...(last === 'Details' ? [{ label: 'Details' }] : [{ label: 'Details', to: `/entries/${entry.id}` }, { label: last }])]} />;
}

function VitalsValues({ v }: { v: VitalSign }) {
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-3 gap-space-sm">
      {(Object.keys(VITAL_RULES) as VitalKey[]).filter((k) => v[k] != null).map((k) => (
        <div key={k} className="rounded-lg bg-surface-container-low p-space-md">
          <dt className="font-label-uppercase text-label-uppercase text-secondary uppercase">{VITAL_RULES[k].label}</dt>
          <dd className="font-code-tabular text-[20px] font-bold text-primary">{v[k]} <span className="text-body-sm font-normal text-secondary">{VITAL_RULES[k].unit}</span></dd>
        </div>
      ))}
      {v.o2_device && <div className="rounded-lg bg-surface-container-low p-space-md"><dt className="font-label-uppercase text-label-uppercase text-secondary uppercase">Oxygen given by</dt><dd className="text-primary">{v.o2_device}</dd></div>}
      {v.consciousness && <div className="rounded-lg bg-surface-container-low p-space-md"><dt className="font-label-uppercase text-label-uppercase text-secondary uppercase">Awake?</dt><dd className="text-primary">{v.consciousness}</dd></div>}
    </dl>
  );
}

export function EntryDetail() {
  const item = useCurrentEntry();
  const { entry, child } = item;
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const names = useNames();
  const navigate = useNavigate();
  const [mistake, setMistake] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const canChange = isNurse(user) && entry.status === 'confirmed';
  const supersededBy = useLiveQuery(() => db.entry.where('supersedes_id').equals(entry.id).first(), [db, entry.id]);
  const changeReason = entry.change_reason ?? legacyReason(entry);

  return (
    <>
      <Crumbs last="Details" />
      <Card className="flex flex-col gap-space-md">
        <div className="flex items-start justify-between gap-space-md">
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary">{TYPE_LABEL[entry.type]}</h1>
            <p className={`font-body-lg ${isRetired(entry) ? 'line-through text-outline' : 'text-on-surface'}`}>{entrySummary(item)}</p>
          </div>
          <div className="flex gap-1"><SourceBadge entry={entry} /><StatusBadge entry={entry} /></div>
        </div>
        {entry.type === 'vital_sign' && child && <VitalsValues v={child as VitalSign} />}
        {entry.type === 'med_admin' && child && <MedValues m={child as MedAdmin} names={names} />}
        <dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-1 font-body-md">
          <dt className="text-secondary">Measured / given</dt><dd className="font-code-tabular">{dateTimeLabel(entry.care_time)}</dd>
          <dt className="text-secondary">Typed in</dt><dd className="font-code-tabular">{dateTimeLabel(entry.entry_time)}</dd>
          {entry.scheduled_time && <><dt className="text-secondary">Due time</dt><dd className="font-code-tabular">{dateTimeLabel(entry.scheduled_time)}</dd></>}
          <dt className="text-secondary">By</dt><dd>{names.get(entry.performer_id) ?? entry.performer_id}</dd>
          <dt className="text-secondary">Laptop · number</dt><dd className="font-code-tabular">{entry.device_id} · #{entry.counter}</dd>
          {changeReason && <><dt className="text-secondary">{entry.status === 'entered-in-error' ? 'Mistake reason' : 'Fix reason'}</dt><dd>{changeReason}</dd></>}
        </dl>
        {entry.status === 'corrected' && supersededBy && (
          <p className="rounded-lg bg-surface-container-low p-space-md flex items-center gap-2"><Icon name="info" />This is an old version.<ButtonLink variant="ghost" to={`/entries/${supersededBy.id}`}>See the new one</ButtonLink></p>
        )}
        <div className="flex flex-wrap gap-space-sm">
          {canChange && (entry.type === 'vital_sign' || entry.type === 'med_admin') && <ButtonLink to={`/entries/${entry.id}/correct`}><Icon name="edit" />Fix</ButtonLink>}
          {canChange && <Button variant="danger" onClick={() => setMistake(true)}><Icon name="block" />Wrong patient or mistake</Button>}
          {(entry.supersedes_id || entry.status === 'corrected') && <ButtonLink variant="secondary" to={`/entries/${entry.id}/history`}><Icon name="history" />All versions</ButtonLink>}
        </div>
      </Card>
      {mistake && (
        <Dialog title="Mark as a mistake?" onClose={() => setMistake(false)}>
          <p className="font-body-md text-on-surface-variant">The record stays in the history, crossed out. It is never deleted.</p>
          <label htmlFor="mreason" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Reason</label>
          <input id="mreason" value={reason} onChange={(e) => setReason(e.target.value)} data-autofocus className="h-12 rounded-lg border border-card-border px-space-md" placeholder="e.g. recorded on the wrong patient" />
          {err && <p role="alert" className="text-error">{err}</p>}
          <div className="flex gap-space-sm">
            <Button variant="danger" className="flex-1" onClick={async () => {
              setErr(null);
              try {
                if (!user) throw new Error('Sign in again.');
                await markEnteredInError(db, clock, { userId: user.id, deviceId }, entry.id, reason);
                setMistake(false);
              } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); }
            }}>Mark as mistake</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setMistake(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
      <Button variant="ghost" className="self-start" onClick={() => navigate(-1)}><Icon name="arrow_back" />Back</Button>
    </>
  );
}

export function EntryHistory() {
  const { entry } = useCurrentEntry();
  const { db } = useApp();
  const names = useNames();
  const chain = useLiveQuery(() => versionChain(db, entry.id), [db, entry.id]);
  return (
    <>
      <Crumbs last="All versions" />
      <Card>
        <h1 className="font-headline-md text-headline-md text-primary mb-space-md">All versions</h1>
        {!chain ? <p role="status">Loading…</p> : (
          <ol className="flex flex-col gap-space-sm">
            {chain.map((x, i) => (
              <li key={x.entry.id} className="rounded-lg border border-card-border p-space-md flex items-center gap-space-md">
                <span className="w-8 h-8 rounded-full bg-surface-container grid place-items-center font-bold">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={isRetired(x.entry) ? 'line-through text-outline' : 'text-primary font-semibold'}>{entrySummary(x)}</p>
                  <p className="font-body-sm text-secondary">Typed {dateTimeLabel(x.entry.entry_time)} by {names.get(x.entry.performer_id) ?? x.entry.performer_id}</p>
                </div>
                <StatusBadge entry={x.entry} />
                <ButtonLink variant="ghost" to={`/entries/${x.entry.id}`}>Open</ButtonLink>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}

export function CorrectEntry() {
  const { entry, child } = useCurrentEntry();
  const { encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const med = entry.type === 'med_admin' ? (child as MedAdmin | undefined) : undefined;
  const medCtx = useLiveQuery(async () => {
    if (!med?.order_id) return null;
    const order = await db.active_order.get(med.order_id);
    const meds = (await listPatientEntries(db, entry.patient_id)).filter((x) => x.entry.type === 'med_admin' && x.entry.id !== entry.id);
    return order ? { order, prior: med.prior_infusion_rate ?? currentRate(order, meds).rate } : null;
  }, [db, med?.order_id, entry.id, entry.patient_id]);

  if (entry.status !== 'confirmed' || !(entry.type === 'vital_sign' || entry.type === 'med_admin') || !isNurse(user)) {
    return <EmptyState icon="block" text="This record cannot be fixed here." action={<ButtonLink variant="secondary" to={`/entries/${entry.id}`}>Back</ButtonLink>} />;
  }
  const actor = () => { if (!user) throw new Error('Sign in again.'); return { userId: user.id, deviceId }; };

  if (entry.type === 'med_admin') {
    if (medCtx === undefined) return <p role="status">Loading…</p>;
    if (!medCtx || !med) return <EmptyState icon="block" text="The order for this medicine is not in the patient list, so it cannot be fixed here." />;
    const g = orderGroup(medCtx.order);
    const events: MedEvent[] = g === 'infusion' ? ['rate_changed', 'administered', 'held'] : ['administered', 'held', 'refused'];
    return (
      <>
        <Crumbs last="Fix" />
        <h1 className="font-headline-lg text-headline-lg text-primary">Fix medicine record</h1>
        <p className="font-body-md text-on-surface-variant">The old record stays in the history. Your fix is saved as a new version.</p>
        <MedEditor
          order={medCtx.order}
          initial={medFormFromOrder(medCtx.order, (events.includes(med.event as MedEvent) ? med.event : 'administered') as MedEvent, med)}
          events={events}
          priorRate={medCtx.prior}
          initialCareTime={entry.care_time}
          scheduledTime={entry.scheduled_time}
          minCareTime={encounter?.admit_time ?? undefined}
          requireChangeReason
          saveLabel="Save fix"
          onCancel={() => navigate(`/entries/${entry.id}`)}
          onSubmit={async ({ values, careTime, changeReason }) => {
            const e = await createEntry(db, clock, actor(), {
              type: 'med_admin', patientId: entry.patient_id, careTime, scheduledTime: entry.scheduled_time ?? null,
              values, supersedesId: entry.id, correctionReason: changeReason,
            });
            navigate(`/entries/${e.id}`, { replace: true });
          }}
        />
      </>
    );
  }

  return (
    <>
      <Crumbs last="Fix" />
      <h1 className="font-headline-lg text-headline-lg text-primary">Fix vitals</h1>
      <p className="font-body-md text-on-surface-variant">The old values stay in the history. Your fix is saved as a new version.</p>
      <VitalsEditor
        initial={vitalsToForm(child as VitalSign | undefined)}
        initialCareTime={entry.care_time}
        minCareTime={encounter?.admit_time ?? undefined}
        requireReason
        saveLabel="Save fix"
        onCancel={() => navigate(`/entries/${entry.id}`)}
        onSubmit={async ({ values, careTime, reason }) => {
          const e = await createEntry(db, clock, actor(), {
            type: 'vital_sign', patientId: entry.patient_id, careTime,
            values: { ...values, weight_kg: (child as VitalSign | undefined)?.weight_kg ?? null, raw_text: null },
            supersedesId: entry.id, correctionReason: reason,
          });
          navigate(`/entries/${e.id}`, { replace: true });
        }}
      />
    </>
  );
}
