import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate } from 'react-router-dom';
import { createEntry, listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import type { VitalSign } from '../../db/schema';
import { useApp, useSession } from '../../state/app';
import { VITAL_RULES, isUnusual, type VitalKey } from '../../lib/vitals';
import { hm, dayLabel } from '../../lib/time';
import { Badge, Breadcrumbs, ButtonLink, Card, EmptyState, Icon, SectionLabel } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { EntryRow } from '../entries/entryView';
import { VitalsEditor } from './VitalsEditor';

const CARDS: VitalKey[] = ['bp_systolic', 'heart_rate', 'spo2', 'temp_c', 'resp_rate'];

function useVitals(patientId: string) {
  const { db } = useApp();
  return useLiveQuery(async () => (await listPatientEntries(db, patientId)).filter((x) => x.entry.type === 'vital_sign'), [db, patientId]);
}

/** Small line chart of one measure over the confirmed readings. Plain SVG, no library. */
function Trend({ items, k }: { items: EntryWithChild[]; k: VitalKey }) {
  const pts = items
    .filter((x) => x.entry.status === 'confirmed' && (x.child as VitalSign | undefined)?.[k] != null)
    .map((x) => ({ t: Date.parse(x.entry.care_time), v: (x.child as VitalSign)[k] as number, label: hm(x.entry.care_time) }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return <p className="font-body-sm text-secondary">Need two readings for a trend.</p>;
  const W = 520, H = 120, P = 24;
  const t0 = pts[0]!.t, t1 = pts[pts.length - 1]!.t;
  const vs = pts.map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = hi - lo || 1;
  const x = (t: number) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P);
  const r = VITAL_RULES[k];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px]" role="img" aria-label={`${r.label} trend: ${pts.map((p) => `${p.v} at ${p.label}`).join(', ')}`}>
        <polyline fill="none" stroke="#4A6078" strokeWidth="2" points={pts.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} />
        {pts.map((p) => (
          <g key={p.t}>
            <circle cx={x(p.t)} cy={y(p.v)} r="4" fill={isUnusual(k, p.v) ? '#C18A28' : '#1C2536'} />
            <text x={x(p.t)} y={y(p.v) - 8} textAnchor="middle" fontSize="11" fill="#1C2536" fontFamily="Inter">{p.v}</text>
            <text x={x(p.t)} y={H - 4} textAnchor="middle" fontSize="10" fill="#5A6E85" fontFamily="Inter">{p.label}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export function VitalsPage() {
  const { patient } = useCurrentPatient();
  const items = useVitals(patient.id);
  const location = useLocation();
  const savedId = (location.state as { saved?: string } | null)?.saved;
  const latest = items?.find((x) => x.entry.status === 'confirmed');
  const lv = latest?.child as VitalSign | undefined;
  const base = `/patients/${patient.id}`;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Vitals' }]} />
      {savedId && <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2 font-body-md"><Icon name="check_circle" filled />Saved on this laptop.</p>}
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg text-headline-lg text-primary">Vitals</h1>
        <ButtonLink to={`${base}/vitals/record`}><Icon name="add" />Record vitals</ButtonLink>
      </div>
      {items === undefined ? <p role="status">Loading…</p> : !latest ? <EmptyState text="No vitals yet" /> : (
        <>
          <div>
            <SectionLabel>Latest · {hm(latest.entry.care_time)}, {dayLabel(latest.entry.care_time)}</SectionLabel>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-space-md mt-space-sm">
              {CARDS.map((k) => {
                const r = VITAL_RULES[k];
                const n = lv?.[k];
                const out = isUnusual(k, n);
                return (
                  <div key={k} className={`rounded-xl border p-space-md bg-surface-container-lowest ${out ? 'border-downtime-amber-border' : 'border-card-border'}`}>
                    <span className="font-label-uppercase text-label-uppercase text-secondary uppercase">{k === 'bp_systolic' ? 'Blood pressure' : r.label}</span>
                    <span className="block font-code-tabular text-[26px] font-bold text-primary">
                      {n == null ? '—' : k === 'bp_systolic' ? `${n}/${lv?.bp_diastolic ?? '?'}` : n}
                      <span className="text-body-sm font-normal text-secondary"> {n == null ? '' : r.unit}</span>
                    </span>
                    {out && <Badge tone="amber" icon="warning">Unusual</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="font-body-sm text-secondary -mt-space-sm">“Unusual” uses draft ranges that are not clinically approved yet.</p>
          <Card>
            <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">Pulse over time</h2>
            <Trend items={items} k="heart_rate" />
          </Card>
          <Card>
            <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">All vitals</h2>
            {items.map((x) => <EntryRow key={x.entry.id} item={x} />)}
          </Card>
        </>
      )}
    </>
  );
}

export function RecordVitals() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const base = `/patients/${patient.id}`;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Vitals', to: `${base}/vitals` }, { label: 'Record' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">Record vitals</h1>
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
