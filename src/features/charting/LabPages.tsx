import { useState, type ReactNode } from 'react';
import { isActiveStay, staysByPatient } from '../../lib/admission';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { createEntry, getEntry, listPatientEntries } from '../../db/repos/entries';
import type { LabEvent, Patient, SnapshotResult } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { labLabel } from '../../lib/charting';
import { isUnusual } from '../../lib/vitals';
import { dateTimeLabel, dayLabel, hm, toLocalInput } from '../../lib/time';
import { Badge, Breadcrumbs, Button, ButtonLink, EmptyState, Icon } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { PatientTabs } from '../patient/PatientTabs';
import { fullName } from '../patient/patientData';
import { LabEditor, labToForm } from './editors';
import { LAB_TABS, hospitalLabs, inLabTab, isCritical, labRows, listRange, type LabRow, type LabTab } from './labData';

const PANEL = 'bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-md';
const STATUS_TONE: Record<string, 'red' | 'green' | 'amber' | 'neutral'> = { critical: 'red', resulted: 'green', pending: 'amber', collected: 'neutral' };
const STATUS_ICON: Record<string, string> = { critical: 'emergency', resulted: 'check', pending: 'schedule', collected: 'science' };
interface Who { patient: Patient; bed?: string | null }

/** One critical result: who it is, the value, and the four facts stored about the phone call. */
function CriticalCard({ r, who, names }: { r: LabRow; who?: Who; names: Map<string, string> }) {
  const l = r.lab!;
  const fact = (k: string, v: ReactNode, missing?: boolean) => <div><dt className="font-label-uppercase text-label-uppercase text-secondary uppercase">{k}</dt><dd className={`font-body-md text-body-md font-semibold ${missing ? 'text-clinical-red' : 'text-primary'} [overflow-wrap:anywhere]`}>{v}</dd></div>;
  return (
    <section aria-label={`Critical result: ${l.test_name}`} className="rounded-xl bg-error-container border border-clinical-red-border p-space-md flex flex-col gap-space-sm break-inside-avoid">
      <div className="flex flex-wrap items-center gap-space-md">
        <span className="w-11 h-11 rounded-lg bg-error text-on-error grid place-items-center shrink-0"><Icon name="emergency" /></span>
        <div className="flex-1 min-w-[14rem]">
          <p className="font-label-uppercase text-label-uppercase text-clinical-red uppercase font-bold">Critical result phoned by the lab{r.entry.status === 'draft' ? ' · draft, not confirmed' : ''}</p>
          {who && <p className="flex flex-wrap items-center gap-2"><strong className="font-headline-sm text-headline-sm text-on-error-container">{fullName(who.patient)}</strong><Badge tone="navy">Bed {who.bed ?? '—'}</Badge><span className="font-code-tabular text-body-sm text-on-error-container">MRN {who.patient.mrn}</span></p>}
          <p className="font-body-lg text-body-lg font-bold text-clinical-red">{l.test_name} {r.value ?? '—'}</p>
        </div>
        <ButtonLink variant="danger" className="print:hidden" to={`/entries/${r.entry.id}`}><Icon name="open_in_new" />Open record</ButtonLink>
      </div>
      <dl className="rounded-lg bg-surface-container-lowest p-space-sm grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-sm">
        {fact('Recorded by', <>{names.get(r.entry.performer_id) ?? r.entry.performer_id}, {hm(l.result_time ?? r.entry.care_time)}</>)}
        {fact('Read back', l.read_back ? 'Recorded' : 'Not recorded', !l.read_back)}
        {fact('Who was told', l.called_to ?? 'Not recorded', !l.called_to)}
        {fact('Sample taken', l.specimen_time ? dateTimeLabel(l.specimen_time) : 'Not recorded')}
      </dl>
    </section>
  );
}

/** Lab ledger. One row per record: a table on wide screens, stacked blocks on narrow ones (same elements, nothing hidden). */
function Ledger({ rows, who, names, nurse }: { rows: LabRow[]; who?: (patientId: string) => Who | undefined; names: Map<string, string>; nurse: boolean }) {
  const cols = who ? 'xl:grid-cols-[1.3fr_1.2fr_1.1fr_1fr_1fr_1.4fr_9.5rem]' : 'xl:grid-cols-[1.5fr_1.1fr_1fr_1fr_1.4fr_9.5rem]';
  const cell = (label: string, children: ReactNode, wide?: boolean) => <div className={`min-w-0 ${wide ? 'col-span-2 xl:col-span-1' : ''}`}><span className="xl:hidden block font-label-uppercase text-label-uppercase text-secondary uppercase">{label}</span>{children}</div>;
  return (
    <>
      <div aria-hidden className={`hidden xl:grid ${cols} gap-space-sm rounded-lg bg-surface-container-low px-space-sm py-2 font-label-uppercase text-label-uppercase text-secondary uppercase`}>
        {who && <span>Bed and patient</span>}<span>Test</span><span>Status</span><span>Sample and result</span><span>Result</span><span>Told and read back</span><span>Actions</span>
      </div>
      <ul aria-label="Lab records" className="flex flex-col">
        {rows.map((r) => {
          const l = r.lab, w = who?.(r.entry.patient_id), base = `/patients/${r.entry.patient_id}`;
          const odd = r.kind === 'glucose' && r.entry.status === 'confirmed' && isUnusual('glucose_mgdl', r.num);
          return (
            <li key={r.entry.id} data-testid={`lab-${r.entry.id}`} className={`break-inside-avoid grid grid-cols-2 ${cols} gap-space-sm px-space-sm py-space-md border-b border-card-border last:border-0 xl:items-center rounded ${isCritical(r) ? 'bg-error-container/60' : r.lab?.status === 'pending' ? 'bg-downtime-amber-bg/60' : ''}`}>
              {who && cell('Patient', <span className="flex items-start gap-2"><span className="px-1.5 py-0.5 rounded bg-primary text-on-primary font-label-badge text-label-badge shrink-0">{w?.bed ?? '—'}</span><span className="min-w-0"><span className="block font-body-md text-body-md font-bold text-primary [overflow-wrap:anywhere]">{w ? fullName(w.patient) : r.entry.patient_id}</span><span className="block font-code-tabular text-body-sm text-secondary">MRN {w?.patient.mrn ?? '—'}</span></span></span>, true)}
              {cell('Test', <><span className="block font-body-md text-body-md font-semibold text-primary [overflow-wrap:anywhere]">{r.test}</span>{l?.specimen_source && <span className="block font-body-sm text-body-sm text-secondary">{l.specimen_source}</span>}</>)}
              {cell('Status', <span className="flex flex-wrap gap-1"><Badge tone={l ? STATUS_TONE[l.status] ?? 'neutral' : 'green'} icon={l ? STATUS_ICON[l.status] : 'glucose'}>{l ? (l.status === 'critical' ? 'Critical result' : labLabel(l.status)) : 'Measured'}</Badge>{r.entry.status === 'draft' && <Badge tone="amber" icon="rule">Check this</Badge>}</span>)}
              {cell('Sample and result', <span className="font-code-tabular text-body-md">{l ? <>{l.specimen_time && <span className="block">{hm(l.specimen_time)} <span className="text-secondary text-body-sm">sample</span></span>}{l.result_time && <span className="block font-bold">{hm(l.result_time)} <span className="text-secondary text-body-sm font-normal">result</span></span>}{!l.specimen_time && !l.result_time && <span className="block">{hm(r.entry.care_time)} <span className="text-secondary text-body-sm">recorded</span></span>}</> : <span className="block">{hm(r.entry.care_time)} <span className="text-secondary text-body-sm">measured</span></span>}</span>)}
              {cell('Result', r.value ? <span className={`font-code-tabular text-[20px] leading-tight font-bold [overflow-wrap:anywhere] ${isCritical(r) ? 'text-clinical-red' : 'text-primary'}`}>{r.value}{odd && <span className="block mt-1"><Badge tone="amber" icon="warning">Unusual</Badge></span>}</span> : <span className="font-body-md text-body-md text-secondary">No result yet</span>)}
              {cell('Told and read back', <span className="block font-body-sm text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{isCritical(r) ? <>{l!.called_to ?? 'Nobody recorded as told'}<span className="block">Read back {l!.read_back ? 'recorded' : 'not recorded'}</span></> : '—'}<span className="block text-secondary">By {names.get(r.entry.performer_id) ?? r.entry.performer_id}</span></span>, true)}
              <div className="flex flex-wrap xl:flex-col gap-1.5 print:hidden col-span-2 xl:col-span-1">
                <ButtonLink variant="secondary" to={`/entries/${r.entry.id}`}>Open</ButtonLink>
                {r.kind === 'glucose' && <ButtonLink variant="secondary" to={`${base}/vitals`}>Flowsheet</ButtonLink>}
                {nurse && l && (l.status === 'pending' || l.status === 'collected') && r.entry.status === 'confirmed' && <ButtonLink to={`${base}/labs/record?from=${r.entry.id}`}>Record result</ButtonLink>}
                {r.entry.status === 'draft' && nurse && <ButtonLink to={`/capture/${r.entry.id}/confirm`}>Check</ButtonLink>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function HospitalList({ results, who }: { results: SnapshotResult[]; who?: (patientId: string) => Who | undefined }) {
  if (!results.length) return <EmptyState text="No lab results on the hospital list" />;
  return (
    <ul aria-label="Hospital list lab results" className="flex flex-col">
      {results.map((r) => {
        const w = who?.(r.patient_id);
        return (
          <li key={r.id} className="break-inside-avoid flex flex-wrap items-center gap-x-space-md gap-y-1 py-2 px-space-sm border-b border-card-border last:border-0">
            {w && <span className="w-40 min-w-0"><span className="block font-semibold text-primary">{fullName(w.patient)}</span><span className="block font-code-tabular text-body-sm text-secondary">Bed {w.bed ?? '—'} · {w.patient.mrn}</span></span>}
            <span className="flex-1 min-w-[8rem] font-body-md text-body-md">{r.name}<span className="block font-code-tabular text-body-sm text-secondary">{hm(r.time)}, {dayLabel(r.time)}</span></span>
            <span className="flex items-center gap-2 font-code-tabular font-bold text-primary">{r.value_num ?? r.value_text ?? '—'} {r.unit ?? ''}{r.abnormal_flag && r.abnormal_flag !== 'normal' && <Badge tone={r.abnormal_flag === 'critical' ? 'red' : 'amber'}>{r.abnormal_flag}</Badge>}</span>
            {listRange(r) && <span className="font-body-sm text-body-sm text-secondary">Range on the list {listRange(r)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function LabTabs({ tab, setTab, rows, listCount }: { tab: LabTab; setTab: (t: LabTab) => void; rows: LabRow[]; listCount: number }) {
  const count = (t: LabTab) => (t === 'list' ? listCount : rows.filter((r) => inLabTab(r, t)).length);
  return (
    <div role="group" aria-label="Lab filter" className={`${PANEL} !p-1.5 flex flex-wrap gap-1 print:hidden`}>
      {LAB_TABS.map((t) => (
        <button key={t.v} type="button" aria-pressed={tab === t.v} onClick={() => setTab(t.v)} className={`min-h-11 px-3 rounded-lg font-body-md text-body-md font-semibold ${tab === t.v ? (t.v === 'critical' ? 'bg-error text-on-error' : 'bg-primary text-on-primary') : t.v === 'critical' && count(t.v) > 0 ? 'bg-error-container text-on-error-container' : 'text-on-surface-variant hover:bg-surface-container'}`}>{t.label} ({count(t.v)})</button>
      ))}
    </div>
  );
}

/* ------------------------------ Ward ------------------------------ */

/** Ward-wide labs (Stitch "Ward laboratory ledger"). Read only; every row opens that patient's own page, which checks the patient first. */
export function WardLabsPage() {
  const { db, clock, dataset } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<LabTab>('all');
  const [q, setQ] = useState('');
  const nurse = isNurse(user);
  const data = useLiveQuery(async () => {
    const encs = staysByPatient(await db.encounter.toArray());
    const patients = (await db.patient.toArray()).filter((p) => isActiveStay(encs.get(p.id))); // ward labs: active stays only
    const who = new Map<string, Who>(patients.map((p) => [p.id, { patient: p, bed: encs.get(p.id)?.bed }]));
    const items = (await Promise.all(patients.map((p) => listPatientEntries(db, p.id)))).flat();
    return { who, rows: labRows(items), list: hospitalLabs(await db.snapshot_result.toArray()), names: new Map((await db.practitioner.toArray()).map((s) => [s.id, s.name])) };
  }, [db]);
  if (!data) return <p role="status">Loading…</p>;
  const whoOf = (id: string) => data.who.get(id);
  const needle = q.trim().toLowerCase();
  const hit = (id: string, test: string) => { const w = whoOf(id); return !needle || `${test} ${w ? `${fullName(w.patient)} ${w.patient.mrn} bed ${w.bed ?? ''}` : ''}`.toLowerCase().includes(needle); };
  const rows = data.rows.filter((r) => inLabTab(r, tab) && hit(r.entry.patient_id, r.test));
  const list = data.list.filter((r) => hit(r.patient_id, r.name));
  const critical = data.rows.filter(isCritical);
  const beds = [...data.who.values()].sort((a, b) => (a.bed ?? '').localeCompare(b.bed ?? ''));
  const label = LAB_TABS.find((t) => t.v === tab)!.label;
  return (
    <>
      <p className="hidden print:block border-b border-black pb-1 text-[9pt]"><strong>Ward labs, {label}</strong> · printed by {user?.name} · {dateTimeLabel(clock.nowIso())}{dataset === 'practice' ? ' · Fake practice data, not a clinical record' : ''}</p>
      <div className="flex flex-wrap items-center justify-between gap-space-sm print:hidden">
        <div className="flex flex-wrap items-center gap-space-sm"><span className="w-11 h-11 rounded-lg bg-primary-container text-white grid place-items-center"><Icon name="science" /></span><h1 className="font-headline-lg text-headline-lg text-primary">Ward labs</h1><Badge>{data.who.size} patients</Badge></div>
        <div className="flex flex-wrap gap-space-sm">
          <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print list</Button>
          {nurse && (
            <label className="inline-flex items-center gap-2 min-h-11 rounded-lg bg-primary text-on-primary pl-space-md pr-1 font-body-md text-body-md font-semibold"><Icon name="add" />Record a lab for
              <select aria-label="Record a lab for" value="" onChange={(e) => { if (e.target.value) navigate(`/patients/${e.target.value}/labs/record`); }} className="min-h-9 max-w-[11rem] rounded bg-surface-container-lowest text-primary px-2"><option value="">pick a patient…</option>{beds.map((w) => <option key={w.patient.id} value={w.patient.id}>{w.bed ?? '—'} {fullName(w.patient)}</option>)}</select>
            </label>
          )}
        </div>
      </div>
      <LabTabs tab={tab} setTab={setTab} rows={data.rows} listCount={data.list.length} />
      {(tab === 'all' || tab === 'critical') && !needle && critical.map((r) => <CriticalCard key={r.entry.id} r={r} who={whoOf(r.entry.patient_id)} names={data.names} />)}
      <section aria-label="Lab ledger" className={`${PANEL} flex flex-col gap-space-sm print:border-0 print:p-0 print:shadow-none`}>
        <div className="flex flex-wrap items-center justify-between gap-space-sm print:hidden">
          <h2 className="font-headline-sm text-headline-sm text-primary">{label}</h2>
          <label className="flex-1 max-w-sm min-w-[min(100%,14rem)] flex items-center gap-2 h-11 rounded-lg border border-card-border px-space-sm bg-surface-container-lowest"><Icon name="search" className="text-secondary" /><span className="sr-only">Search labs</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Patient, MRN, bed or test" className="flex-1 min-w-0 bg-transparent outline-none font-body-md text-body-md" /></label>
        </div>
        {tab === 'list' ? <HospitalList results={list} who={whoOf} /> : rows.length === 0 ? <EmptyState text="No lab records here" /> : <Ledger rows={rows} who={whoOf} names={data.names} nurse={nurse} />}
        <p className="font-body-sm text-body-sm text-secondary">{tab === 'list' ? 'Read only. Copied from the hospital system when the patient list was taken.' : 'Records on this laptop. Results are shown as the lab gave them; ClinBridge does not judge them. “Unusual” on a bedside blood sugar is a draft range that is not clinically approved.'}</p>
      </section>
    </>
  );
}

/* ------------------------------ One patient ------------------------------ */

export function PatientLabsPage() {
  const { patient, encounter } = useCurrentPatient();
  const { db } = useApp();
  const { user } = useSession();
  const location = useLocation();
  const [tab, setTab] = useState<LabTab>('all');
  const nurse = isNurse(user);
  const base = `/patients/${patient.id}`;
  const data = useLiveQuery(async () => ({
    rows: labRows(await listPatientEntries(db, patient.id)), list: hospitalLabs(await db.snapshot_result.where('patient_id').equals(patient.id).toArray()),
    orders: encounter ? (await db.active_order.where('encounter_id').equals(encounter.id).toArray()).filter((o) => o.type === 'lab' && o.status === 'active') : [],
    names: new Map((await db.practitioner.toArray()).map((s) => [s.id, s.name])),
  }), [db, patient.id, encounter?.id]);
  if (!data) return <p role="status">Loading…</p>;
  const rows = data.rows.filter((r) => inLabTab(r, tab));
  return (
    <>
      <div className="print:hidden"><Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Labs' }]} /></div>
      {(location.state as { saved?: string } | null)?.saved && <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2 print:hidden"><Icon name="check_circle" filled />Saved on this laptop.</p>}
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <h1 className="font-headline-lg text-headline-lg text-primary">Labs</h1>
        <div className="flex flex-wrap gap-space-sm print:hidden">
          <ButtonLink variant="secondary" to="/labs">All patients</ButtonLink>
          <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print</Button>
          {nurse && <ButtonLink to={`${base}/labs/record`}><Icon name="add" />Record lab</ButtonLink>}
        </div>
      </div>
      <div className="print:hidden"><PatientTabs patientId={patient.id} /></div>
      {data.rows.filter(isCritical).map((r) => <CriticalCard key={r.entry.id} r={r} names={data.names} />)}
      <LabTabs tab={tab} setTab={setTab} rows={data.rows} listCount={data.list.length} />
      <section aria-label="Lab ledger" className={`${PANEL} flex flex-col gap-space-sm print:border-0 print:p-0 print:shadow-none`}>
        {tab === 'list' ? <HospitalList results={data.list} /> : rows.length === 0 ? <EmptyState text={data.rows.length === 0 ? 'No lab records' : 'No lab records here'} /> : <Ledger rows={rows} names={data.names} nurse={nurse} />}
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md items-start">
        <section aria-label="Lab orders" className={`${PANEL} flex flex-col gap-space-sm`}>
          <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="assignment" />Lab orders on the patient list</h2>
          {data.orders.length === 0 ? <p className="font-body-md text-body-md text-secondary">None.</p> : (
            <ul className="flex flex-col gap-1.5">{data.orders.map((o) => (
              <li key={o.id} className="rounded-lg bg-surface-container-low p-space-sm flex flex-wrap items-center justify-between gap-2"><span className="flex-1 min-w-[12rem]"><span className="block font-body-md text-body-md font-semibold text-primary">{o.text}</span>{o.scheduled_times?.length ? <span className="block font-body-sm text-body-sm text-on-surface-variant">Times on the order: {o.scheduled_times.join(', ')}</span> : null}</span>{nurse && <ButtonLink variant="secondary" className="print:hidden" to={`${base}/labs/record?order=${o.id}`}>Record for this order</ButtonLink>}</li>
            ))}</ul>
          )}
        </section>
        {tab !== 'list' && (
          <section aria-label="Hospital list" className={`${PANEL} flex flex-col gap-space-sm`}>
            <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="lock" />Hospital list (before the outage)</h2>
            <HospitalList results={data.list} />
          </section>
        )}
      </div>
    </>
  );
}

export function RecordLab() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get('order'), fromId = params.get('from');
  const start = useLiveQuery(async () => {
    const orders = encounter ? (await db.active_order.where('encounter_id').equals(encounter.id).toArray()).filter((o) => o.type === 'lab') : [];
    const before = fromId ? await getEntry(db, fromId) : undefined;
    // Only a record of this patient may fill the form, and only which test it is. Never a result.
    const lab = before && before.entry.patient_id === patient.id && before.entry.type === 'lab_event' ? (before.child as LabEvent | undefined) : undefined;
    const initial = labToForm(undefined, orders.find((o) => o.id === orderId));
    if (lab) Object.assign(initial, { testName: lab.test_name, orderId: orders.some((o) => o.id === lab.order_id) ? lab.order_id! : '', specimenTime: lab.specimen_time ? toLocalInput(lab.specimen_time) : '' });
    return { orders, initial, filled: !!lab };
  }, [db, encounter?.id, patient.id, orderId, fromId]);
  const base = `/patients/${patient.id}`;
  if (!isNurse(user)) return <EmptyState icon="block" text="Only nurses can add records." />;
  if (!start) return <p role="status">Loading…</p>;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Labs', to: `${base}/labs` }, { label: 'Record' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">Record lab</h1>
      {start.filled && <p className="font-body-md text-body-md text-on-surface-variant -mt-space-sm">The test and the sample time come from the earlier record. It stays as it is; this is saved as a new record.</p>}
      <LabEditor key={`${patient.id}-${orderId}-${fromId}`} initial={start.initial} labOrders={start.orders} minCareTime={encounter?.admit_time} saveLabel="Save"
        onCancel={() => navigate(`${base}/labs`)}
        onSubmit={async ({ values, careTime }) => {
          const order = start.orders.find((o) => o.id === values.order_id);
          const full = { ...values, order_time: order?.start ?? null, result_time: values.status === 'resulted' || values.status === 'critical' ? careTime : null };
          const e = await createEntry(db, clock, { userId: user!.id, deviceId }, { type: 'lab_event', patientId: patient.id, careTime, values: full });
          navigate(`${base}/labs`, { state: { saved: e.id } });
        }} />
    </>
  );
}
