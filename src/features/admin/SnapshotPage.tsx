import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useSession } from '../../state/app';
import { checkSnapshotFile, importSnapshot } from '../../db/repos/admin';
import { ageOn, dateTimeLabel, hm, sinceText } from '../../lib/time';
import { Badge, Button, ButtonLink, EmptyState, Icon } from '../../components/ui';
import { fieldCls } from '../charting/TwoStepEditor';
import { Block, Err, Facts, Head, PANEL, PaperHead, Tile, msg } from './adminUi';
import { fullName, isNoKnownAllergy } from '../patient/patientData';
import { checkStoredList, type ListRow } from './listCheck';
import { isLocallyRegistered } from '../../lib/admission';

const GRID = 'xl:grid-cols-[3.5rem_minmax(0,1.2fr)_6.5rem_6rem_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_4.5rem_6rem]';

/** Patient list (Stitch "Patient snapshot management"). Read only: a hospital list is loaded whole, never edited here. */
export function SnapshotPage() {
  const { db, clock, deviceId, dataset, snapshot, vault } = useApp();
  const { user } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'allergy' | 'severe' | 'isolation'>('all');
  const [check, setCheck] = useState<{ rows: ListRow[]; at: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const data = useLiveQuery(async () => {
    const [patient, encounter, allergy, active_order, snapshot_result, lists, log, staff] = await Promise.all([
      db.patient.toArray(), db.encounter.toArray(), db.allergy.toArray(), db.active_order.toArray(), db.snapshot_result.toArray(), db.snapshot.toArray(), db.audit_log.toArray(), db.practitioner.toArray()]);
    return { patient, encounter, allergy, active_order, snapshot_result, lists, imports: log.filter((r) => r.action === 'snapshot_imported'), names: new Map(staff.map((p) => [p.id, p.name])) };
  }, [db]);
  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null); setReport(null); setCheck(null);
    try {
      const json = JSON.parse(await f.text());
      const c = checkSnapshotFile(json);
      if (!c.ok) { setError(c.errors.join(' ')); return; }
      await importSnapshot(db, clock, { userId: user!.id, deviceId }, json);
      setReport(`Loaded: ${Object.entries(c.counts).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
    } catch (e) { setError(msg(e)); } finally { if (file.current) file.current.value = ''; }
  }
  if (!data) return <p role="status">Loading…</p>;
  const now = clock.nowIso();
  // Locally registered patients are not part of the hospital list: counted on their own tile, left out of the list counts.
  const localIds = new Set(data.patient.filter((p) => isLocallyRegistered(p)).map((p) => p.id));
  const localStays = new Set(data.encounter.filter((e) => localIds.has(e.patient_id)).map((e) => e.id));
  const patient = data.patient.filter((p) => !localIds.has(p.id)), encounter = data.encounter.filter((e) => !localIds.has(e.patient_id));
  const allergy = data.allergy.filter((a) => !localIds.has(a.patient_id)), active_order = data.active_order.filter((o) => !localStays.has(o.encounter_id));
  const snapshot_result = data.snapshot_result.filter((r) => !localIds.has(r.patient_id));
  const want = snapshot?.row_counts ?? {};
  const foot = (t: string, n: number) => (want[t] == null ? 'Expected number not in the list' : want[t] === n ? `All ${n} of the list` : `${n} of ${want[t]} of the list`);
  const severe = allergy.filter((a) => a.severity === 'severe' && a.status === 'active' && !isNoKnownAllergy(a)).length;
  const rows = patient.map((p) => {
    const e = encounter.find((x) => x.patient_id === p.id);
    const al = allergy.filter((a) => a.patient_id === p.id && a.status === 'active');
    return { p, e, al, real: al.filter((a) => !isNoKnownAllergy(a)), orders: e ? active_order.filter((o) => o.encounter_id === e.id).length : 0 };
  }).sort((a, b) => (a.e?.bed ?? '~').localeCompare(b.e?.bed ?? '~', 'en', { numeric: true }));
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (filter === 'all' || (filter === 'allergy' ? r.real.length > 0 : filter === 'severe' ? r.real.some((a) => a.severity === 'severe') : !!r.e?.isolation))
    && (!needle || [fullName(r.p), r.p.mrn, r.e?.bed, r.e?.attending, ...r.real.map((a) => a.substance)].some((t) => t?.toLowerCase().includes(needle))));
  const bad = check?.rows.filter((r) => r.ok === false).length ?? 0;

  return (
    <div className="flex flex-col gap-space-md">
      <PaperHead title="Patient list" by={user?.name} at={dateTimeLabel(now)} practice={dataset === 'practice'} />
      <Head label="Patient list" title="Patient list"
        badges={snapshot ? <><Badge tone="green" icon="inventory_2">List {sinceText(snapshot.taken_at, now)} old</Badge><Badge icon="lock">Read only</Badge><Badge>{snapshot.id}</Badge></> : <Badge tone="amber">No patient list loaded</Badge>}
        text="The hospital list taken before the downtime. Charting adds records; it never changes this list."
        actions={<><Button variant="secondary" onClick={() => setCheck({ rows: checkStoredList({ snapshot, ...data }), at: now })}><Icon name="fact_check" />Check the list</Button><Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print rows shown</Button>{dataset === 'live' && <Button onClick={() => file.current?.click()}><Icon name="upload_file" />Load a new list</Button>}</>}>
        {report && <p role="status" className="text-sync-green">{report}</p>}
        <Err e={error} />
      </Head>

      {check && (
        <section aria-label="List check" className={`${PANEL} print:hidden`}>
          <p role="status" className="font-body-md text-body-md font-semibold text-primary flex items-center gap-2"><Icon name={bad ? 'warning' : 'check_circle'} className={bad ? 'text-downtime-amber' : 'text-sync-green'} />Checked at {hm(check.at)}: {bad ? `${bad} of ${check.rows.length} lines do not fit.` : `no line of ${check.rows.length} is wrong.`}</p>
          <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-space-lg">{check.rows.map((r) => <li key={r.label} className="flex items-start gap-2 py-1.5 border-b border-card-border font-body-md text-body-md"><Icon name={r.ok === null ? 'help' : r.ok ? 'check_circle' : 'warning'} label={r.ok === null ? 'Look' : r.ok ? 'Fine' : 'Wrong'} className={`text-[20px] ${r.ok === null ? 'text-outline' : r.ok ? 'text-sync-green' : 'text-downtime-amber'}`} /><span className="min-w-0"><strong className="text-primary">{r.label}</strong> · {r.detail}</span></li>)}</ul>
          <p className="mt-2 font-body-sm text-body-sm text-secondary">This checks counts and links on this laptop. It cannot tell whether the hospital's list itself was right.</p>
        </section>
      )}

      <section aria-label="Where it came from" className={PANEL}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-space-sm">
          {([['Taken', snapshot ? dateTimeLabel(snapshot.taken_at) : '—'], ['From', snapshot?.source_system ?? '—'], ['Unit', snapshot?.unit ?? '—'], ['Kept in', vault === 'unlocked' ? 'This browser, encrypted (AES-256-GCM)' : 'This browser']] as [string, string][]).map(([k, v]) => <dl key={k} className="rounded-lg bg-surface-container-low p-space-sm"><dt className="font-label-uppercase text-label-uppercase uppercase text-secondary">{k}</dt><dd className="font-body-lg text-body-lg font-semibold text-primary [overflow-wrap:anywhere]">{v}</dd></dl>)}
        </div>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-space-md print:hidden">
        <Tile label="Patients" icon="groups" value={patient.length} foot={foot('patient', patient.length)} />
        <Tile label="Stays" icon="bed" value={encounter.length} foot={foot('encounter', encounter.length)} />
        <Tile label="Allergies" icon="warning" value={allergy.filter((a) => !isNoKnownAllergy(a)).length} foot={<>{severe} marked severe. {foot('allergy', allergy.length)} with “No known”</>} tone={severe ? 'red' : undefined} />
        <Tile label="Orders" icon="receipt_long" value={active_order.length} foot={foot('active_order', active_order.length)} />
        <Tile label="Results" icon="science" value={snapshot_result.length} foot={`${snapshot_result.filter((r) => r.kind === 'lab').length} labs, ${snapshot_result.filter((r) => r.kind !== 'lab').length} vital signs and fluids`} />
        {localIds.size > 0 && <Tile label="Registered here" icon="person_add" value={localIds.size} foot="Not part of the list. See Admissions." />}
      </div>

      <section aria-label="Patients on the list" className={`${PANEL} flex flex-col gap-space-sm print:border-0 print:p-0 print:shadow-none`}>
        <div className="flex flex-wrap items-center gap-space-sm print:hidden">
          <div className="flex-1 min-w-[12rem]"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the patient list" placeholder="Bed, name, MRN, doctor or allergy" className={fieldCls()} /></div>
          <div className="w-full sm:w-[14rem]"><select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Show" className={fieldCls()}><option value="all">All patients</option><option value="allergy">With an allergy</option><option value="severe">With a severe allergy</option><option value="isolation">In isolation</option></select></div>
          <span role="status" className="font-body-sm text-body-sm text-secondary">Showing {shown.length} of {rows.length}</span>
        </div>
        <div aria-hidden className={`hidden xl:grid print:grid ${GRID} print:grid-cols-[2.2rem_1.2fr_5rem_5rem_1fr_1.4fr_1fr_2.6rem] gap-space-sm px-space-sm py-2 rounded-lg bg-surface-container-low font-label-uppercase text-label-uppercase text-secondary uppercase`}><span>Bed</span><span>Patient</span><span>MRN</span><span>Born</span><span>Doctor</span><span>Allergies</span><span>Flags</span><span>Orders</span><span className="print:hidden">Open</span></div>
        {shown.length === 0 ? <EmptyState text="No patients here" /> : (
          <ul aria-label="Patients">
            {shown.map(({ p, e, al, real, orders }) => (
              <li key={p.id} className={`break-inside-avoid grid grid-cols-[3.5rem_minmax(0,1fr)] ${GRID} print:grid-cols-[2.2rem_1.2fr_5rem_5rem_1fr_1.4fr_1fr_2.6rem] gap-x-space-sm gap-y-1 items-center px-space-sm py-2 border-b border-card-border last:border-0 font-body-md text-body-md`}>
                <span className="justify-self-start min-w-9 px-1.5 py-1 rounded bg-surface-container text-center font-code-tabular font-bold text-primary"><span className="sr-only">Bed </span>{e?.bed ?? '—'}</span>
                <span className="min-w-0 font-semibold text-primary [overflow-wrap:anywhere]">{fullName(p)}</span>
                <span className="col-start-2 xl:col-start-auto print:col-start-auto font-code-tabular text-body-sm whitespace-nowrap"><span className="xl:hidden print:hidden text-secondary">MRN </span>{p.mrn}</span>
                <span className="col-start-2 xl:col-start-auto print:col-start-auto text-body-sm whitespace-nowrap"><span className="xl:hidden print:hidden text-secondary">Born </span>{p.birth_date} <span className="text-secondary">({ageOn(p.birth_date, now)})</span></span>
                <span className="col-start-2 xl:col-start-auto print:col-start-auto min-w-0 text-body-sm [overflow-wrap:anywhere]">{e?.attending ?? '—'}</span>
                <span className="col-start-2 xl:col-start-auto print:col-start-auto min-w-0 flex flex-wrap gap-1">{real.length ? real.map((a) => <span key={a.id} className={`px-1.5 py-0.5 rounded text-body-sm font-semibold [overflow-wrap:anywhere] ${a.severity === 'severe' ? 'bg-error-container text-on-error-container' : 'bg-surface-container text-on-surface'}`}>{a.substance}{a.reaction ? ` (${a.reaction})` : ''}{a.severity === 'severe' ? ', severe' : ''}</span>) : <span className="text-body-sm text-secondary">{al.length ? 'No known allergies' : 'Allergies not recorded'}</span>}</span>
                <span className="col-start-2 xl:col-start-auto print:col-start-auto min-w-0 flex flex-wrap gap-1">{e?.isolation && <Badge tone="amber">{e.isolation} isolation</Badge>}{e?.code_status && e.code_status !== 'Full code' && <Badge tone="navy">{e.code_status}</Badge>}</span>
                <span className="col-start-2 xl:col-start-auto print:col-start-auto text-body-sm"><span className="xl:hidden print:hidden text-secondary">Orders </span>{orders}</span>
                <ButtonLink variant="secondary" className="col-start-2 xl:col-start-auto justify-self-start xl:justify-self-stretch !px-3 print:hidden" to={`/patients/${p.id}`} aria-label={`Open ${fullName(p)}`}>Open</ButtonLink>
              </li>
            ))}
          </ul>
        )}
        <p className="font-body-sm text-body-sm text-secondary">Opening a patient asks for the patient check first.</p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-space-md items-start print:hidden">
        <Block title="Lists loaded on this laptop" icon="history" text="Loading a list adds new rows and updates rows it brings. A patient who is not in the new file stays on this laptop. There is no way back to an older list.">
          <ul aria-label="Lists" className="flex flex-col gap-2">
            {data.lists.map((s) => <li key={s.id} className="rounded-lg bg-surface-container-low p-space-sm flex flex-wrap items-center justify-between gap-2 font-body-md text-body-md"><span className="min-w-0"><strong className="text-primary [overflow-wrap:anywhere]">{s.id}</strong><span className="block text-body-sm text-on-surface-variant">Taken {dateTimeLabel(s.taken_at)} · {s.source_system}</span></span>{s.id === snapshot?.id && <Badge tone="navy">In use</Badge>}</li>)}
            {data.lists.length === 0 && <li className="text-secondary">None yet.</li>}
          </ul>
          {data.imports.length > 0 && <Facts rows={data.imports.slice().reverse().map((r) => [dateTimeLabel(r.time), `${r.entity.replace('snapshot/', '')}, loaded by ${data.names.get(r.user_id) ?? r.user_id}`])} />}
          {data.imports.length === 0 && <p className="font-body-sm text-body-sm text-secondary">{dataset === 'practice' ? 'The fake list came with the app.' : 'No list was loaded through this page yet.'}</p>}
        </Block>
        <Block title="Load a new patient list" icon="upload_file">
          {dataset === 'live' ? (
            <>
              <p className="font-body-md text-body-md text-on-surface-variant">JSON file with the six patient-list tables only (snapshot, patient, encounter, allergy, active_order, snapshot_result). Clinical records are never imported. Files marked as fake are refused.</p>
              <label className="self-start inline-flex items-center gap-2 min-h-11 px-space-md rounded-lg border border-card-border cursor-pointer"><Icon name="upload_file" />Choose file<input ref={file} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} /></label>
              <ul className="list-disc pl-5 font-body-sm text-body-sm text-on-surface-variant"><li>The file is checked before anything is saved.</li><li>A file with a problem changes nothing.</li></ul>
            </>
          ) : <p className="font-body-md text-body-md text-secondary">Practice uses its own fake patient list. Switch to Real records to load a hospital list.</p>}
        </Block>
      </div>
    </div>
  );
}
