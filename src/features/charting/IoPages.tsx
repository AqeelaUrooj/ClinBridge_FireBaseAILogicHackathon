import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { createEntry, listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import type { ActiveOrder, LabEvent, Note, SnapshotResult, VitalSign } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { ioLabel } from '../../lib/charting';
import { currentRate, orderHistory } from '../../lib/meds';
import { formatDose } from '../../lib/dose';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { Badge, Button, ButtonLink, Card, EmptyState, Icon } from '../../components/ui';
import { MedIllustration, type MedicalAsset } from '../../components/MedIllustration';
import { useCurrentPatient } from '../patient/PatientLayout';
import { PatientTabs } from '../patient/PatientTabs';
import { fullName } from '../patient/patientData';
import { medicationSites } from '../body/medicationSites';
import { regionById } from '../body/regions';
import { EntryRow, SourceBadge, StatusBadge } from '../entries/entryView';
import { IoEditor, ioToForm } from './editors';
import { IoChart } from './IoChart';
import { dayRows, dayTotals, hospitalTotals, hourly, otherRows, signedMl, type IoRow } from './ioData';

/**
 * Intake and output, after the Stitch "Fluid Intake & Output" screen: four cards, hourly chart, intake ledger and
 * output ledger. Not shown, because nothing approved or recorded is behind it: targets, amount left of a limit,
 * urine rate per kg, "diuretic responsive" wording, preset amounts, flag alerts.
 */
const kicker = 'font-label-uppercase text-[11px] leading-[14px] text-secondary font-bold uppercase';

function FactCard({ title, icon, badge, children, foot }: { title: string; icon: string; badge?: string; children: ReactNode; foot: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0 rounded-xl border border-card-border bg-surface-container-lowest shadow-sm p-space-md flex flex-col gap-space-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2"><Icon name={icon} className="text-[20px] text-secondary" /><h2 className={kicker}>{title}</h2></span>
        {badge && <Badge>{badge}</Badge>}
      </div>
      <div className="my-auto">{children}</div>
      <div className="rounded bg-surface-container-low px-2 py-1.5 min-h-[52px] font-body-sm text-[12px] leading-[17px] text-on-surface-variant">{foot}</div>
    </section>
  );
}

const Big = ({ value, unit }: { value: string | number; unit?: string }) => (
  <span className="whitespace-nowrap"><span className="font-code-tabular text-[34px] leading-none font-bold text-primary tracking-tight">{value}</span>{unit && <span className="font-body-sm text-body-sm text-secondary"> {unit}</span>}</span>
);

function Ledger({ dir, rows, total, names, base, nurse, art }: { dir: 'in' | 'out'; rows: IoRow[]; total: number; names: Map<string, string>; base: string; nurse: boolean; art: MedicalAsset | null }) {
  const title = dir === 'in' ? 'Intake ledger' : 'Output ledger';
  const list = rows.filter((r) => r.io.direction === dir);
  const confirmed = list.filter((r) => r.confirmed);
  const kinds = [...new Set(confirmed.map((r) => r.io.category))].map((c) => `${ioLabel(dir, c)} ${confirmed.filter((r) => r.io.category === c).reduce((a, r) => a + r.io.volume_ml, 0)} mL`);
  const head = `${kicker} hidden sm:block`;
  return (
    <section aria-label={title} className="min-w-0 rounded-xl border border-card-border bg-surface-container-lowest shadow-sm p-space-md flex flex-col gap-space-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-space-sm min-w-0">
          <span className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${dir === 'in' ? 'bg-secondary-fixed' : 'bg-downtime-amber-bg'}`}>{art ? <MedIllustration name={art} size={28} /> : <Icon name={dir === 'in' ? 'water_full' : 'eject'} className="text-[20px] text-primary" />}</span>
          <div className="min-w-0">
            <h2 className="font-headline-sm text-headline-sm text-primary">{title}</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{dir === 'in' ? 'By mouth, tube feeds and IV fluids' : 'Urine, vomit, NG tube and drains'}</p>
          </div>
        </div>
        <span className="text-right shrink-0"><span className="block font-code-tabular text-[20px] font-bold text-primary whitespace-nowrap">{total} mL</span><span className={kicker}>Today</span></span>
      </div>
      {kinds.length > 0 && <p className="rounded bg-surface-container-low px-space-sm py-2 font-body-sm text-body-sm text-on-surface">{kinds.join(' · ')}</p>}
      {list.length > 0 && <div aria-hidden className="grid grid-cols-[52px_minmax(0,1fr)_auto] sm:grid-cols-[56px_minmax(0,1fr)_86px_minmax(0,120px)] gap-2 px-space-sm"><span className={head}>Time</span><span className={head}>Kind</span><span className={`${head} text-right`}>Amount</span><span className={`${head} text-right`}>Recorded by</span></div>}
      <ul className="flex flex-col gap-1.5">
        {list.map(({ item, io, time, confirmed: ok }) => (
          <li key={item.entry.id}>
            <Link to={`/entries/${item.entry.id}`} data-status={item.entry.status} className={`grid grid-cols-[52px_minmax(0,1fr)_auto] sm:grid-cols-[56px_minmax(0,1fr)_86px_minmax(0,120px)] gap-2 items-center rounded-lg px-space-sm py-2 min-h-[56px] hover:ring-1 hover:ring-secondary ${ok ? 'bg-surface-container-low' : 'bg-downtime-amber-bg border border-downtime-amber-border'}`}>
              <span className="font-code-tabular font-bold text-primary">{hm(time)}</span>
              <span className="min-w-0">
                <span className="block font-body-md text-body-md font-semibold text-primary">{ioLabel(dir, io.category)}</span>
                <span className="block font-body-sm text-[12px] text-on-surface-variant">{[io.method, io.start_time && io.end_time ? `${hm(io.start_time)} to ${hm(io.end_time)}` : null, item.entry.raw_input_kind === 'photo' ? 'From a paper photo' : null].filter(Boolean).join(' · ') || 'How measured: not recorded'}</span>
                <span className="flex flex-wrap gap-1 mt-0.5"><SourceBadge entry={item.entry} />{!ok && <StatusBadge entry={item.entry} />}</span>
                <span className="sm:hidden block font-body-sm text-[12px] text-on-surface-variant">{names.get(item.entry.performer_id) ?? item.entry.performer_id}</span>
              </span>
              <span className="text-right font-code-tabular text-[17px] font-bold text-primary whitespace-nowrap">{io.volume_ml} mL{!ok && <span className="block text-[11px] font-semibold text-[#6b4a0e]">not counted</span>}</span>
              <span className="hidden sm:block text-right font-body-sm text-[12px] text-on-surface-variant">{names.get(item.entry.performer_id) ?? item.entry.performer_id}</span>
            </Link>
          </li>
        ))}
      </ul>
      {list.length === 0 && <EmptyState icon="water_drop" text={dir === 'in' ? 'No intake recorded today' : 'No output recorded today'} />}
      <div className="mt-auto pt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="font-body-sm text-body-sm text-on-surface-variant">{confirmed.length} confirmed {dir === 'in' ? 'intake' : 'output'} record{confirmed.length === 1 ? '' : 's'} today</span>
        {nurse && <ButtonLink variant="secondary" to={`${base}/io/record?dir=${dir}`}><Icon name="add" />{dir === 'in' ? 'Add intake' : 'Add output'}</ButtonLink>}
      </div>
    </section>
  );
}

const flagText: Record<string, string> = { low: ' (low)', high: ' (high)', critical: ' (critical)' };

function labLines(items: EntryWithChild[], results: SnapshotResult[], patientId: string): { key: string; text: string; when: string }[] {
  const own = items.filter((x) => x.entry.type === 'lab_event' && x.entry.status === 'confirmed' && x.child).map((x) => {
    const l = x.child as LabEvent;
    return { key: x.entry.id, text: `${l.test_name} ${l.value_num ?? l.value_text ?? l.status}${l.unit ? ` ${l.unit}` : ''}`, when: x.entry.care_time };
  });
  const hospital = results.filter((r) => r.patient_id === patientId && r.kind === 'lab').map((r) => ({
    key: r.id, text: `${r.name} ${r.value_num ?? r.value_text ?? '—'}${r.unit ? ` ${r.unit}` : ''}${flagText[r.abnormal_flag ?? ''] ?? ''} · hospital list`, when: r.time,
  }));
  return [...own, ...hospital].sort((a, b) => b.when.localeCompare(a.when)).slice(0, 3);
}

function IvCard({ orders, items, patientId }: { orders: ActiveOrder[]; items: EntryWithChild[]; patientId: string }) {
  const meds = items.filter((x) => x.entry.type === 'med_admin');
  const iv = orders.filter((o) => o.type === 'iv' && o.status === 'active');
  const line = medicationSites(patientId, items).marked.find((m) => m.kind === 'iv');
  const o = iv[0];
  const rate = o ? currentRate(o, meds) : null;
  const rec = o ? orderHistory(o, meds).find((x) => x.entry.status === 'confirmed') : undefined;
  return (
    <FactCard title="IV fluids" icon="vaccines" badge={iv.length ? `${iv.length} order${iv.length === 1 ? '' : 's'}` : undefined}
      foot={<><span className="block">{o ? (rec ? `Rate last recorded ${hm(rec.entry.care_time)}` : 'Rate from the order; none recorded yet') : 'From the patient list'}</span><span className="block">{line ? `Last IV line on a medicine record: ${regionById(line.regionId)!.label}, ${hm(line.item.entry.care_time)}` : 'No IV line on a medicine record'}</span></>}>
      {o ? <><Big value={rate?.rate != null ? formatDose(rate.rate) : '—'} unit={rate?.unit ?? undefined} /><span className="block mt-1 font-body-sm text-body-sm text-on-surface">{o.text}</span>{iv.length > 1 && <span className="block font-body-sm text-[12px] text-secondary">and {iv.length - 1} more on the MAR</span>}</>
        : <span className="font-headline-sm text-headline-sm text-primary">No IV fluid order</span>}
    </FactCard>
  );
}

export function IoPage() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock } = useApp();
  const { user } = useSession();
  const location = useLocation();
  const data = useLiveQuery(async () => {
    const [items, results, staff, orders] = await Promise.all([
      listPatientEntries(db, patient.id), db.snapshot_result.where('patient_id').equals(patient.id).toArray(), db.practitioner.toArray(),
      encounter ? db.active_order.where('encounter_id').equals(encounter.id).toArray() : Promise.resolve([] as ActiveOrder[]),
    ]);
    return { patientId: patient.id, items, results, orders: orders.filter((o) => o.status === 'active'), names: new Map(staff.map((p) => [p.id, `${p.name}, ${p.role}`])) };
  }, [db, patient.id, encounter?.id]);
  const base = `/patients/${patient.id}`;
  if (!data || data.patientId !== patient.id) return <p role="status">Loading…</p>;

  const nowIso = clock.nowIso(), today = nowIso.slice(0, 10);
  const nurse = isNurse(user);
  const rows = dayRows(data.items, patient.id, today);
  const t = dayTotals(rows);
  const last = rows.find((r) => r.confirmed);
  const drafts = rows.filter((r) => !r.confirmed);
  const before = hospitalTotals(data.results, patient.id);
  const older = otherRows(data.items, patient.id, today);
  const care = data.orders.filter((o) => o.type === 'nursing' || o.type === 'diet');
  const weight = data.items.find((x) => x.entry.type === 'vital_sign' && x.entry.status === 'confirmed' && (x.child as VitalSign | undefined)?.weight_kg != null);
  const note = data.items.find((x) => x.entry.type === 'note' && x.entry.status === 'confirmed');
  const labs = labLines(data.items, data.results, patient.id);
  const saved = (location.state as { saved?: string } | null)?.saved;
  return (
    <>
      <PatientTabs patientId={patient.id} />
      {saved && <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2"><Icon name="check_circle" filled />Saved on this laptop.</p>}
      <div className="flex flex-col gap-space-sm">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary">Fluids (in and out)</h1>
          <p className="flex flex-wrap items-center gap-2 font-body-md text-body-md text-on-surface-variant">
            <Badge icon="history">{`Today, ${dayLabel(nowIso)}, from 00:00`}</Badge>
            {last ? <span>Last record: <strong className="text-primary">{hm(last.time)}</strong> by <strong className="text-primary">{data.names.get(last.item.entry.performer_id) ?? last.item.entry.performer_id}</strong></span> : <span>No confirmed record today</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          {nurse ? <ButtonLink to={`${base}/io/record`}><Icon name="add_circle" />Add fluid</ButtonLink> : <span className="min-h-11 px-4 rounded-lg bg-surface-container text-secondary font-body-sm text-body-sm grid place-items-center">Only nurses can add fluids</span>}
          <ButtonLink variant="secondary" to={`/print/vit/${patient.id}`}><Icon name="print" />Paper vitals &amp; I/O sheet</ButtonLink>
          <Button variant="secondary" disabled aria-describedby="flag-io-why"><Icon name="flag" />Flag alert</Button>
          <span id="flag-io-why" className="font-body-sm text-[12px] text-secondary">No fluid alert limit is approved, so nothing is flagged. <Link to={`${base}/notes/new`} className="underline font-semibold">Write a note</Link> instead. Totals update as records are saved.</span>
        </div>
      </div>

      {drafts.length > 0 && (
        <div role="note" className="rounded-xl bg-downtime-amber-bg border border-downtime-amber-border p-space-md flex flex-wrap items-center gap-space-sm">
          <Icon name="rule" className="text-[#7a5410] text-[20px]" />
          <span className="flex-1 min-w-[220px] font-body-md text-body-md text-[#6b4a0e]"><strong>{drafts.length} fluid draft{drafts.length === 1 ? ' is' : 's are'} not confirmed</strong> and not counted in the totals or the chart.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        <FactCard title="Fluid balance today" icon="balance" badge="In − out"
          foot={<>
            <span className="flex flex-wrap gap-x-3"><span>In: <strong className="text-primary">{t.totalIn} mL</strong></span><span>Out: <strong className="text-primary">{t.totalOut} mL</strong></span></span>
            <span className="block">{before ? `24 h before the outage (hospital list): in ${before.totalIn}, out ${before.totalOut}, balance ${signedMl(before.balance)} mL` : 'No 24 h totals on the hospital list'}</span>
          </>}>
          <Big value={signedMl(t.balance)} unit="mL" />
          <span className="block mt-1 font-body-sm text-body-sm text-on-surface-variant">Confirmed records only</span>
        </FactCard>
        <FactCard title="Fluid instructions" icon="local_drink" badge="Patient list"
          foot={<><span className="block">In today: <strong className="text-primary">{t.totalIn} mL</strong></span><span className="block">ClinBridge does not work out what is left of a limit.</span></>}>
          <ul className="flex flex-col gap-1 font-body-md text-body-md text-primary font-semibold">
            {encounter?.diet && <li>Diet: {encounter.diet}</li>}
            {care.map((o) => <li key={o.id}>{o.text}</li>)}
            {!encounter?.diet && care.length === 0 && <li className="text-secondary font-normal">None on the patient list</li>}
          </ul>
        </FactCard>
        <IvCard orders={data.orders} items={data.items} patientId={patient.id} />
        <FactCard title="Daily weight" icon="scale" foot={weight ? 'Measured with a vitals record' : <>The vitals form has no weight box yet. <Link to={`${base}/notes/new`} className="underline font-semibold">Write it in a note</Link>.</>}>
          {weight ? <><Big value={(weight.child as VitalSign).weight_kg!} unit="kg" /><span className="block mt-1 font-body-sm text-body-sm text-on-surface-variant">{dateTimeLabel(weight.entry.care_time)}</span></> : <span className="font-headline-sm text-headline-sm text-primary">Not recorded</span>}
        </FactCard>
      </div>

      <Card aria-label="Fluids by hour" className="shadow-sm flex flex-col gap-space-sm min-w-0">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="bar_chart" className="text-[20px] text-secondary" />Fluids by hour and running balance</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Each amount sits in the hour of its recorded time. An IV amount covers the period on its record. Point at or tap an hour to see it.</p>
        </div>
        <IoChart hours={hourly(rows)} nowIso={nowIso} />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-md items-stretch">
        <Ledger dir="in" rows={rows} total={t.totalIn} names={data.names} base={base} nurse={nurse} art={rows.some((r) => r.io.direction === 'in' && r.io.category === 'iv') ? 'medication/iv-bag' : null} />
        <Ledger dir="out" rows={rows} total={t.totalOut} names={data.names} base={base} nurse={nurse} art={null} />
      </div>

      {older.length > 0 && (
        <Card aria-label="Other fluid records">
          <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">Other days, old versions and mistakes</h2>
          {older.map((x) => <EntryRow key={x.entry.id} item={x} />)}
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md rounded-xl border border-card-border bg-surface-container-lowest p-space-md">
        <section aria-label="Latest note" className="flex gap-space-sm min-w-0">
          <span className="w-9 h-9 rounded-lg bg-surface-container grid place-items-center shrink-0"><Icon name="description" className="text-[18px]" /></span>
          <div className="min-w-0"><h2 className="font-headline-sm text-[14px] font-bold text-primary">Latest note</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant break-words">{note ? <>{(note.child as Note).text} <span className="whitespace-nowrap">({hm(note.entry.care_time)})</span></> : 'No notes yet'}</p>
            <Link to={`${base}/notes`} className="font-body-sm text-body-sm font-semibold text-secondary underline">All notes</Link></div>
        </section>
        <section aria-label="Latest labs" className="flex gap-space-sm min-w-0">
          <span className="w-9 h-9 rounded-lg bg-surface-container grid place-items-center shrink-0"><Icon name="biotech" className="text-[18px]" /></span>
          <div className="min-w-0"><h2 className="font-headline-sm text-[14px] font-bold text-primary">Latest labs</h2>
            {labs.length ? <ul className="font-body-sm text-body-sm text-on-surface-variant">{labs.map((l) => <li key={l.key}>{l.text} · {dateTimeLabel(l.when)}</li>)}</ul> : <p className="font-body-sm text-body-sm text-on-surface-variant">No labs</p>}
            <Link to={`${base}/labs`} className="font-body-sm text-body-sm font-semibold text-secondary underline">All labs</Link></div>
        </section>
        <section aria-label="Where this is kept" className="rounded-lg bg-surface-container-low p-space-sm flex flex-col gap-2 justify-between">
          <p className="font-body-sm text-body-sm text-on-surface flex items-center gap-2"><Icon name="lock" className="text-[18px] text-secondary" /><span><strong>Kept on this laptop.</strong> Every save is written to the change log.</span></p>
          <ButtonLink variant="secondary" to={`${base}/timeline`}><Icon name="history" />Full history</ButtonLink>
        </section>
      </div>
    </>
  );
}

export function RecordIo() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ivOrders = useLiveQuery(async () => (encounter ? (await db.active_order.where('encounter_id').equals(encounter.id).toArray()).filter((o) => o.type === 'iv') : []), [db, encounter?.id]);
  const base = `/patients/${patient.id}`;
  const dir = params.get('dir');
  if (!isNurse(user)) return <EmptyState icon="block" text="Only nurses can add records." />;
  if (!ivOrders) return <p role="status">Loading…</p>;
  return (
    <>
      <PatientTabs patientId={patient.id} />
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="w-11 h-11 rounded-lg bg-primary text-on-primary grid place-items-center shrink-0"><Icon name="water_drop" className="text-[22px]" /></span>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary">Add fluid</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">{fullName(patient)}{encounter?.bed ? ` · Bed ${encounter.bed}` : ''} · recorded by {user!.name}</p>
          </div>
        </div>
        <ButtonLink variant="secondary" to={`${base}/io`}><Icon name="close" />Close</ButtonLink>
      </div>
      <IoEditor initial={{ ...ioToForm(), direction: dir === 'in' || dir === 'out' ? dir : '' }} ivOrders={ivOrders} minCareTime={encounter?.admit_time} saveLabel="Save"
        onCancel={() => navigate(`${base}/io`)}
        onSubmit={async ({ values, careTime }) => {
          const e = await createEntry(db, clock, { userId: user!.id, deviceId }, { type: 'intake_output', patientId: patient.id, careTime, values });
          navigate(`${base}/io`, { state: { saved: e.id } });
        }} />
    </>
  );
}
