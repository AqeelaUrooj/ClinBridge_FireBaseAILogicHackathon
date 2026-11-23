import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createEntry, listPatientEntries } from '../../db/repos/entries';
import { isNurse, useApp, useSession } from '../../state/app';
import { VITAL_RULES, isUnusual, type VitalKey } from '../../lib/vitals';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { Badge, ButtonLink, Card, EmptyState, Icon } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { PatientTabs } from '../patient/PatientTabs';
import { fullName } from '../patient/patientData';
import { VitalsEditor } from './VitalsEditor';
import { TrendChart } from '../../components/TrendChart';
import { SPO2_LOINC, vitalSeries, withBaseline } from '../../lib/vitalTrend';
import { MedIllustration, type MedicalAsset } from '../../components/MedIllustration';
import { Flowsheet, seg } from './Flowsheet';
import { GlucoseChart, PulsePressureChart } from './VitalsCharts';
import { flowRows, insulinDoses, tile, type FlowRow } from './flowsheetData';

/**
 * Vitals flowsheet, after the Stitch "Vital Signs Flowsheet & Charts" screen: latest-value tiles, two charts and one
 * table. Not shown, because nothing approved or recorded is behind it: NEWS2, mean pressure, target bands, "normal"
 * labels, next check time, cuff position, heart rhythm, GCS, a verified mark per row.
 */
const TILES: { k: VitalKey; label: string; art: MedicalAsset }[] = [
  { k: 'bp_systolic', label: 'Blood pressure', art: 'vitals/bp-monitor' }, { k: 'heart_rate', label: 'Pulse', art: 'vitals/heart' },
  { k: 'spo2', label: 'Oxygen level', art: 'vitals/pulse-oximeter' }, { k: 'temp_c', label: 'Temp', art: 'vitals/thermometer' },
  { k: 'resp_rate', label: 'Breathing', art: 'vitals/lungs' }, { k: 'glucose_mgdl', label: 'Blood sugar', art: 'vitals/glucose-meter' },
];

const signed = (n: number) => (n > 0 ? `+${n}` : n === 0 ? 'same' : `−${Math.abs(n)}`);

function VitalTile({ k, label, art, rows }: { k: VitalKey; label: string; art: MedicalAsset; rows: FlowRow[] }) {
  const { latest, before, change } = tile(rows, k);
  const out = !!latest && (isUnusual(k, latest.n) || (k === 'bp_systolic' && isUnusual('bp_diastolic', latest.row.values.bp_diastolic)));
  return (
    <section aria-label={`Latest ${label.toLowerCase()}`} className={`min-w-0 rounded-xl border p-space-sm bg-surface-container-lowest shadow-sm flex flex-col gap-2 ${out ? 'border-downtime-amber-border' : 'border-card-border'}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1.5 min-w-0"><MedIllustration name={art} size={24} /><span className="font-label-uppercase text-[11px] leading-[14px] text-secondary font-bold uppercase">{label}</span></span>
        <span className="font-code-tabular text-[12px] text-on-surface-variant">{latest ? hm(latest.time) : ''}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1 my-auto py-1">
        <span className="font-code-tabular text-[30px] leading-none font-bold text-primary tracking-tight">{latest ? latest.value : '—'}</span>
        {latest && <span className="font-body-sm text-body-sm text-secondary">{VITAL_RULES[k].unit}</span>}
        {out && <Badge tone="amber" icon="warning">Unusual</Badge>}
      </div>
      <div className="rounded bg-surface-container-low px-2 py-1.5 min-h-[52px] font-body-sm text-[12px] leading-[17px] text-on-surface-variant">
        {latest && (
          <span className="flex items-center justify-between gap-1 text-primary font-semibold">
            <span>{latest.time.slice(0, 10) === rows[0]!.time.slice(0, 10) ? 'Confirmed' : dayLabel(latest.time)}</span>
            {change != null && <span className="font-code-tabular" title="Change from the value before">{signed(change)}</span>}
          </span>
        )}
        <span className="block">{before ? `Before: ${before.value} at ${hm(before.time)}${before.row.kind === 'baseline' ? ' (hospital list)' : ''}` : latest ? 'No earlier value' : 'Not recorded yet'}</span>
      </div>
    </section>
  );
}

function AwakePainTile({ rows }: { rows: FlowRow[] }) {
  const awake = rows.find((r) => r.kind === 'confirmed' && r.values.consciousness);
  const pain = tile(rows, 'pain_0_10').latest;
  return (
    <section aria-label="Latest awake and pain" className="min-w-0 col-span-2 sm:col-span-3 lg:col-span-2 xl:col-span-1 rounded-xl p-space-sm bg-primary-container text-on-primary shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1">
        <span className="font-label-uppercase text-[11px] leading-[14px] font-bold uppercase text-primary-fixed">Awake and pain</span>
        <span className="font-code-tabular text-[12px] text-primary-fixed">{awake ? hm(awake.time) : ''}</span>
      </div>
      <span className="my-auto py-1 font-headline-sm text-[22px] leading-[26px] font-bold break-words">{awake ? awake.values.consciousness : 'Not recorded'}</span>
      <div className="rounded bg-primary px-2 py-1.5 min-h-[52px] font-body-sm text-[12px] leading-[17px]">
        <span className="block font-semibold">{pain ? `Pain ${pain.value} / 10 at ${hm(pain.time)}` : 'Pain not recorded'}</span>
        <span className="block text-primary-fixed">No score is calculated</span>
      </div>
    </section>
  );
}

export function VitalsPage() {
  const { patient, encounter } = useCurrentPatient();
  const { db } = useApp();
  const { user } = useSession();
  const data = useLiveQuery(async () => {
    const [items, results, staff, orders] = await Promise.all([
      listPatientEntries(db, patient.id), db.snapshot_result.where('patient_id').equals(patient.id).toArray(), db.practitioner.toArray(),
      encounter ? db.active_order.where('encounter_id').equals(encounter.id).toArray() : Promise.resolve([]),
    ]);
    return { patientId: patient.id, items, results, names: new Map(staff.map((p) => [p.id, `${p.name}, ${p.role}`])), careOrders: orders.filter((o) => o.type === 'nursing' && o.status === 'active') };
  }, [db, patient.id, encounter?.id]);
  const [second, setSecond] = useState<'sugar' | 'oxygen' | null>(null);
  const location = useLocation();
  const savedId = (location.state as { saved?: string } | null)?.saved;
  const base = `/patients/${patient.id}`;
  if (!data || data.patientId !== patient.id) return <p role="status">Loading…</p>;

  const vitals = data.items.filter((x) => x.entry.type === 'vital_sign');
  const rows = flowRows(vitals, data.results, patient.id);
  const doses = insulinDoses(data.items, patient.id);
  const last = rows.find((r) => r.kind === 'confirmed');
  const drafts = rows.filter((r) => r.kind === 'draft');
  const anySugar = rows.some((r) => r.kind !== 'retired' && r.values.glucose_mgdl != null);
  const chart = second ?? (anySugar ? 'sugar' : 'oxygen');
  const chartName = chart === 'sugar' ? 'Blood sugar over time' : 'Oxygen level (SpO₂) over time';
  const chartCard = 'shadow-sm flex flex-col gap-space-sm min-w-0';
  return (
    <>
      <PatientTabs patientId={patient.id} />
      {savedId && <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2 font-body-md"><Icon name="check_circle" filled />Saved on this laptop.</p>}
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary">Vitals</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-body-md text-body-md text-on-surface-variant">
            <Icon name="history_toggle_off" className="hidden sm:inline text-[18px] text-secondary" />
            {last ? <span>Last recorded: <strong className="text-primary">{dateTimeLabel(last.time)}</strong> by <strong className="text-primary">{data.names.get(last.item!.entry.performer_id) ?? last.item!.entry.performer_id}</strong></span> : <span>No confirmed vitals on this laptop yet</span>}
            <Badge>Kept on this laptop</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-space-sm">
          {isNurse(user) ? <ButtonLink to={`${base}/vitals/record`}><Icon name="add_circle" />Record vitals</ButtonLink> : <span className="min-h-11 px-4 rounded-lg bg-surface-container text-secondary font-body-sm text-body-sm grid place-items-center">Only nurses can record vitals</span>}
          <ButtonLink variant="secondary" to={`/print/vit/${patient.id}`}><Icon name="print" />Paper vitals &amp; I/O sheet</ButtonLink>
        </div>
      </div>

      {drafts.length > 0 && (
        <div role="note" className="rounded-xl bg-downtime-amber-bg border border-downtime-amber-border p-space-md flex flex-wrap items-center gap-space-sm">
          <Icon name="rule" className="text-[#7a5410] text-[20px]" />
          <span className="flex-1 min-w-[220px] font-body-md text-body-md text-[#6b4a0e]"><strong>{drafts.length === 1 ? 'One vitals draft is' : `${drafts.length} vitals drafts are`} not confirmed.</strong> Drafts are left out of the tiles and the chart lines.</span>
          {drafts.map((d) => <ButtonLink key={d.id} variant="secondary" to={`/entries/${d.id}`}>Check draft {hm(d.time)}</ButtonLink>)}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-space-sm">
        {TILES.map((t) => <VitalTile key={t.k} {...t} rows={rows} />)}
        <AwakePainTile rows={rows} />
      </div>
      <p className="font-body-sm text-body-sm text-secondary -mt-space-sm">Each tile shows the newest confirmed value with its own time. “Unusual” uses draft ranges that are not clinically approved yet.</p>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-md items-stretch">
        <Card aria-label="Pulse and blood pressure over time" className={`${chartCard} xl:col-span-7`}>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="timeline" className="text-[20px] text-secondary" />Pulse and blood pressure over time</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Both use the same number scale. Point at or tap a reading to see its values.</p>
          </div>
          <PulsePressureChart rows={rows} />
        </Card>
        <Card aria-label={chartName} className={`${chartCard} xl:col-span-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name={chart === 'sugar' ? 'bloodtype' : 'air'} className="text-[20px] text-secondary" />{chartName}</h2>
            <div role="group" aria-label="Second chart" className="flex bg-surface-container-low rounded-lg border border-card-border p-0.5">
              <button type="button" aria-pressed={chart === 'sugar'} onClick={() => setSecond('sugar')} className={seg(chart === 'sugar')}>Blood sugar</button>
              <button type="button" aria-pressed={chart === 'oxygen'} onClick={() => setSecond('oxygen')} className={seg(chart === 'oxygen')}>Oxygen</button>
            </div>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant -mt-2">{chart === 'sugar' ? 'With recorded insulin doses. No target range is drawn.' : 'No target range is drawn.'}</p>
          {chart === 'sugar' ? <GlucoseChart rows={rows} doses={doses} />
            : <TrendChart series={withBaseline(vitalSeries(vitals, patient.id, 'spo2'), data.results, patient.id, SPO2_LOINC)} label="SpO₂" unit="%" testId="vitals-spo2-trend" />}
        </Card>
      </div>

      <Flowsheet rows={rows} names={data.names} />
      <div className="rounded-xl bg-surface-container-low border border-card-border px-space-md py-space-sm flex flex-wrap items-center justify-between gap-2 font-body-sm text-body-sm text-on-surface-variant">
        <Link to={`${base}/timeline`} className="min-h-9 inline-flex items-center gap-1.5 font-semibold text-primary underline"><Icon name="history" className="text-[16px]" />View the full history</Link>
        <span>{data.careOrders.length ? <>Care orders on the patient list: <strong className="text-primary">{data.careOrders.map((o) => o.text).join(' · ')}</strong></> : 'No care orders on the patient list'}</span>
      </div>
    </>
  );
}

export function RecordVitals() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const base = `/patients/${patient.id}`;
  if (!isNurse(user)) return <EmptyState icon="block" text="Only nurses can add records." />;
  return (
    <>
      <PatientTabs patientId={patient.id} />
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="w-11 h-11 rounded-lg bg-primary text-on-primary grid place-items-center shrink-0"><Icon name="add_task" className="text-[22px]" /></span>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-primary">Record vitals</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">{fullName(patient)}{encounter?.bed ? ` · Bed ${encounter.bed}` : ''} · recorded by {user?.name}</p>
          </div>
        </div>
        <ButtonLink variant="secondary" to={`${base}/vitals`}><Icon name="close" />Close</ButtonLink>
      </div>
      <VitalsEditor
        saveLabel="Save"
        minCareTime={encounter?.admit_time ?? undefined}
        onCancel={() => navigate(`${base}/vitals`)}
        onSubmit={async ({ values, careTime }) => {
          if (!user) throw new Error('Sign in again.');
          const e = await createEntry(db, clock, { userId: user.id, deviceId }, { type: 'vital_sign', patientId: patient.id, careTime, values: { ...values, weight_kg: null, raw_text: null } });
          navigate(`${base}/vitals`, { state: { saved: e.id } });
        }}
      />
    </>
  );
}
