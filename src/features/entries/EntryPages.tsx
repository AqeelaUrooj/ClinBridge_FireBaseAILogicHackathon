import { Fragment, createContext, useContext, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { createEntry, getEntry, listPatientEntries, markEnteredInError, versionChain, type EntryWithChild } from '../../db/repos/entries';
import type { IntakeOutput, LabEvent, MedAdmin, Note, VitalSign } from '../../db/schema';
import { ioLabel, labLabel, noteLabel } from '../../lib/charting';
import { IoEditor, LabEditor, NoteEditor, ioToForm, labToForm, noteToForm } from '../charting/editors';
import { isNurse, useApp, useSession } from '../../state/app';
import { VITAL_RULES, type VitalKey } from '../../lib/vitals';
import { dateTimeLabel } from '../../lib/time';
import { Breadcrumbs, Button, ButtonLink, Card, Dialog, EmptyState, Icon } from '../../components/ui';
import { PatientFrame, useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { StatusBadge, SourceBadge, TYPE_LABEL, entrySummary, isRetired } from './entryView';
import { VitalsEditor, vitalsToForm } from '../vitals/VitalsEditor';
import { MedEditor } from '../meds/MedEditor';
import { PhotoView } from '../capture/PhotoView';
import { MedValues } from '../meds/MedsPages';
import { VersionCompare, VersionLog, diffRows, reasonOf } from './VersionView';
import { currentRate, medFormFromOrder, orderGroup, type MedEvent } from '../../lib/meds';

const EntryCtx = createContext<EntryWithChild | null>(null);
export const useCurrentEntry = () => {
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
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(9rem,30%)),1fr))] gap-space-sm">
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

function OtherValues({ type, child }: { type: string; child: unknown }) {
  const rows: [string, string][] = [];
  if (type === 'intake_output') {
    const io = child as IntakeOutput;
    rows.push(['In or out', io.direction === 'in' ? 'In' : 'Out'], ['Kind', ioLabel(io.direction, io.category)], ['Amount', `${io.volume_ml} mL`]);
    if (io.method) rows.push(['How measured', io.method]);
    if (io.start_time && io.end_time) rows.push(['Period', `${io.start_time.slice(11, 16)} – ${io.end_time.slice(11, 16)}`]);
  } else if (type === 'note') {
    const n = child as Note;
    rows.push(['Type', noteLabel(n.category)]);
    if (n.score_name) rows.push(['Score', `${n.score_name}: ${n.score_value ?? '—'}`]);
    rows.push(['Note', n.text]);
  } else if (type === 'lab_event') {
    const l = child as LabEvent;
    rows.push(['Test', l.test_name], ['Status', labLabel(l.status)]);
    if (l.value_num != null || l.value_text) rows.push(['Result', `${l.value_num ?? l.value_text} ${l.unit ?? ''}`]);
    if (l.specimen_time) rows.push(['Sample taken', dateTimeLabel(l.specimen_time)]);
    if (l.status === 'critical') rows.push(['Told', l.called_to ?? '—'], ['Read back', l.read_back ? 'Yes' : 'No']);
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-1 font-body-md rounded-lg bg-surface-container-low p-space-md">
      {rows.map(([k, v]) => <Fragment key={k}><dt className="text-secondary">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></Fragment>)}
    </dl>
  );
}

/** The recorded values of one entry (same display as the details page). Used by the expandable history cards. */
export function EntryValues({ item, names }: { item: EntryWithChild; names: Map<string, string> }) {
  const { entry, child } = item;
  if (!child) return null;
  if (entry.type === 'vital_sign') return <VitalsValues v={child as VitalSign} />;
  if (entry.type === 'med_admin') return <MedValues m={child as MedAdmin} names={names} />;
  return <OtherValues type={entry.type} child={child} />;
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
  const chain = useLiveQuery(() => versionChain(db, entry.id), [db, entry.id]);
  const at = chain?.findIndex((x) => x.entry.id === entry.id) ?? -1;
  // The newest version is compared with the one before it; an old version with the one that replaced it.
  const pair = chain && chain.length > 1 && at >= 0 ? (at < chain.length - 1 ? [chain[at]!, chain[at + 1]!] : [chain[at - 1]!, chain[at]!]) : null;
  const supersededBy = chain && at >= 0 && at < chain.length - 1 ? chain[at + 1]!.entry : undefined;
  const changeReason = reasonOf(item);
  const who = (id: string) => names.get(id) ?? id;

  return (
    <>
      <div className="print:hidden"><Crumbs last="Details" /></div>
      <Card className="flex flex-col gap-space-md print:border-black">
        <div className="flex flex-wrap items-start justify-between gap-space-md">
          <div className="flex-1 min-w-[min(100%,16rem)]">
            <h1 className="font-headline-lg text-headline-lg text-primary flex flex-wrap items-center gap-x-3 gap-y-1">{TYPE_LABEL[entry.type]}<span className="px-2 py-0.5 rounded bg-surface-container font-code-tabular text-[15px] text-on-surface-variant">#{entry.id.slice(0, 8)}</span></h1>
            <p className={`font-body-lg [overflow-wrap:anywhere] ${isRetired(entry) ? 'line-through text-outline' : 'text-on-surface'}`}>{entrySummary(item)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2"><SourceBadge entry={entry} /><StatusBadge entry={entry} /><Button variant="secondary" className="print:hidden" onClick={() => window.print()}><Icon name="print" />Print record</Button></div>
        </div>
        {entry.status === 'corrected' && supersededBy && (
          <p className="rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-md flex flex-wrap items-center gap-2 text-[#6b4a0e]"><Icon name="info" />This is an old version.<ButtonLink variant="ghost" className="print:hidden" to={`/entries/${supersededBy.id}`}>See the new one</ButtonLink></p>
        )}
        {!pair && entry.type === 'vital_sign' && child && <VitalsValues v={child as VitalSign} />}
        {!pair && entry.type === 'med_admin' && child && <MedValues m={child as MedAdmin} names={names} />}
        {!pair && entry.type !== 'med_admin' && entry.type !== 'vital_sign' && child && <OtherValues type={entry.type} child={child} />}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-lg gap-y-1 font-body-md">
          <dt className="text-secondary">Measured / given</dt><dd className="font-code-tabular">{dateTimeLabel(entry.care_time)}</dd>
          <dt className="text-secondary">Typed in</dt><dd className="font-code-tabular">{dateTimeLabel(entry.entry_time)}</dd>
          {entry.scheduled_time && <><dt className="text-secondary">Due time</dt><dd className="font-code-tabular">{dateTimeLabel(entry.scheduled_time)}</dd></>}
          <dt className="text-secondary">By</dt><dd>{who(entry.performer_id)}</dd>
          {entry.confirmed_by && entry.confirmed_at && <><dt className="text-secondary">Checked and saved by</dt><dd>{who(entry.confirmed_by)}, <span className="font-code-tabular">{dateTimeLabel(entry.confirmed_at)}</span></dd></>}
          <dt className="text-secondary">Laptop · number</dt><dd className="font-code-tabular">{entry.device_id} · #{entry.counter}</dd>
          {changeReason && !pair && <><dt className="text-secondary">{entry.status === 'entered-in-error' ? 'Mistake reason' : 'Fix reason'}</dt><dd>{changeReason}</dd></>}
        </dl>
        {entry.raw_input_kind === 'photo' && (
          <details className="rounded-lg border border-card-border p-space-sm print:hidden">
            <summary className="cursor-pointer font-body-md text-primary">Source photo</summary>
            <div className="mt-space-sm"><PhotoView refId={entry.raw_input_ref} /></div>
          </details>
        )}
        <div className="flex flex-wrap gap-space-sm print:hidden">
          {entry.status === 'draft' && isNurse(user) && <ButtonLink to={`/capture/${entry.id}/confirm`}><Icon name="fact_check" />Check and confirm</ButtonLink>}
          {canChange && <ButtonLink to={`/entries/${entry.id}/correct`}><Icon name="edit" />Fix</ButtonLink>}
          {canChange && <Button variant="danger" onClick={() => setMistake(true)}><Icon name="block" />Wrong patient or mistake</Button>}
          {(entry.supersedes_id || entry.status === 'corrected') && <ButtonLink variant="secondary" to={`/entries/${entry.id}/history`}><Icon name="history" />All versions</ButtonLink>}
        </div>
      </Card>
      {pair && <VersionCompare before={pair[0]!} after={pair[1]!} names={names} />}
      {chain && <VersionLog chain={chain} names={names} />}
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
      <Button variant="ghost" className="self-start print:hidden" onClick={() => navigate(-1)}><Icon name="arrow_back" />Back</Button>
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
      <div className="print:hidden"><Crumbs last="All versions" /></div>
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-primary">All versions</h1>
        <Button variant="secondary" className="print:hidden" onClick={() => window.print()}><Icon name="print" />Print versions</Button>
      </div>
      {!chain ? <p role="status">Loading…</p> : (
        <ol aria-label="Versions" className="flex flex-col gap-space-sm">
          {chain.map((x, i) => {
            const rows = i > 0 ? diffRows(chain[i - 1]!, x, names) : [];
            return (
              <li key={x.entry.id} className="break-inside-avoid bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-md flex flex-wrap items-start gap-space-md">
                <span className="w-9 h-9 rounded-full bg-primary-container text-white grid place-items-center font-bold shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-[14rem]">
                  <p className={`[overflow-wrap:anywhere] ${isRetired(x.entry) ? 'line-through text-outline' : 'text-primary font-semibold'}`}>{entrySummary(x)}</p>
                  <p className="font-body-sm text-body-sm text-secondary">Typed {dateTimeLabel(x.entry.entry_time)} by {names.get(x.entry.performer_id) ?? x.entry.performer_id}</p>
                  {i > 0 && (
                    <div className="mt-2 rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md flex flex-col gap-1">
                      {rows.map((r) => <p key={r.key} className="[overflow-wrap:anywhere]"><span className="text-secondary">{r.label}: </span><s className="text-clinical-red">{r.before}</s> <span aria-hidden>→</span><span className="sr-only"> is now </span> <strong className="text-primary">{r.after}</strong></p>)}
                      <p><span className="text-secondary">{x.entry.status === 'entered-in-error' ? 'Mistake: ' : 'Why: '}</span>{reasonOf(x) ?? 'No reason stored'}</p>
                    </div>
                  )}
                </div>
                <StatusBadge entry={x.entry} />
                <ButtonLink variant="ghost" className="print:hidden" to={`/entries/${x.entry.id}`}>Open</ButtonLink>
              </li>
            );
          })}
        </ol>
      )}
      {chain && <VersionLog chain={chain} names={names} />}
    </>
  );
}

/** The record as it is now beside the form that fixes it. */
function FixFrame({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  const item = useCurrentEntry();
  const names = useNames();
  return (
    <>
      <Crumbs last="Fix" />
      <h1 className="font-headline-lg text-headline-lg text-primary">{title}</h1>
      <p className="font-body-md text-body-md text-on-surface-variant -mt-space-sm">{sub}</p>
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-space-md items-start">
        <section aria-label="Record now" className="min-w-0 bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-md flex flex-col gap-space-sm xl:sticky xl:top-[calc(var(--header-h)+16px)]">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-headline-sm text-headline-sm text-primary">Record now</h2><span className="font-code-tabular text-body-sm text-secondary">#{item.entry.id.slice(0, 8)}</span></div>
          <EntryValues item={item} names={names} />
          <p className="font-body-sm text-body-sm text-secondary">{dateTimeLabel(item.entry.care_time)} · {names.get(item.entry.performer_id) ?? item.entry.performer_id}</p>
          {item.entry.raw_input_kind === 'photo' && <details className="rounded-lg border border-card-border p-space-sm"><summary className="cursor-pointer font-body-md text-primary">Source photo</summary><div className="mt-space-sm"><PhotoView refId={item.entry.raw_input_ref} /></div></details>}
        </section>
        <div className="min-w-0">{children}</div>
      </div>
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

  const orders = useLiveQuery(async () => (encounter ? db.active_order.where('encounter_id').equals(encounter.id).toArray() : []), [db, encounter?.id]);
  if (entry.status !== 'confirmed' || !isNurse(user)) {
    return <EmptyState icon="block" text="This record cannot be fixed here." action={<ButtonLink variant="secondary" to={`/entries/${entry.id}`}>Back</ButtonLink>} />;
  }
  const actor = () => { if (!user) throw new Error('Sign in again.'); return { userId: user.id, deviceId }; };

  const fix = { initialCareTime: entry.care_time, minCareTime: encounter?.admit_time ?? undefined, requireChangeReason: true, saveLabel: 'Save fix', onCancel: () => navigate(`/entries/${entry.id}`) };
  const saveFix = async (type: 'intake_output' | 'note' | 'lab_event', values: never, careTime: string, changeReason?: string) => {
    const e = await createEntry(db, clock, actor(), { type, patientId: entry.patient_id, careTime, values, supersedesId: entry.id, correctionReason: changeReason });
    navigate(`/entries/${e.id}`, { replace: true });
  };
  if (entry.type === 'intake_output' || entry.type === 'note' || entry.type === 'lab_event') {
    if (!orders) return <p role="status">Loading…</p>;
    const title = entry.type === 'intake_output' ? 'Fix fluid record' : entry.type === 'note' ? 'Fix note' : 'Fix lab record';
    return (
      <FixFrame title={title} sub="The old record stays in the history. Your fix is saved as a new version.">
        {entry.type === 'intake_output' && <IoEditor {...fix} initial={ioToForm(child as IntakeOutput)} ivOrders={orders.filter((o) => o.type === 'iv')}
          onSubmit={({ values, careTime, changeReason }) => saveFix('intake_output', values as never, careTime, changeReason)} />}
        {entry.type === 'note' && <NoteEditor {...fix} initial={noteToForm(child as Note)}
          onSubmit={({ values, careTime, changeReason }) => saveFix('note', values as never, careTime, changeReason)} />}
        {entry.type === 'lab_event' && <LabEditor {...fix} initial={labToForm(child as LabEvent)} labOrders={orders.filter((o) => o.type === 'lab')}
          onSubmit={({ values, careTime, changeReason }) => {
            const old = child as LabEvent;
            return saveFix('lab_event', { ...values, order_time: old.order_time ?? null, specimen_source: old.specimen_source ?? null, result_time: values.status === 'resulted' || values.status === 'critical' ? careTime : null } as never, careTime, changeReason);
          }} />}
      </FixFrame>
    );
  }

  if (entry.type === 'med_admin') {
    if (medCtx === undefined) return <p role="status">Loading…</p>;
    if (!medCtx || !med) return <EmptyState icon="block" text="The order for this medicine is not in the patient list, so it cannot be fixed here." />;
    const g = orderGroup(medCtx.order);
    const events: MedEvent[] = g === 'infusion' ? ['rate_changed', 'administered', 'held'] : ['administered', 'held', 'refused'];
    return (
      <FixFrame title="Fix medicine record" sub="The old record stays in the history. Your fix is saved as a new version.">
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
      </FixFrame>
    );
  }

  return (
    <FixFrame title="Fix vitals" sub="The old values stay in the history. Your fix is saved as a new version.">
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
    </FixFrame>
  );
}
