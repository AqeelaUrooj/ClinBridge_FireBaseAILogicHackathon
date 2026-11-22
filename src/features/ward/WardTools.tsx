import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import type { DowntimeDB } from '../../db/db';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import type { ActiveOrder, IntakeOutput, MedAdmin, VitalSign } from '../../db/schema';
import { useApp } from '../../state/app';
import { isMedOrder, orderGroup, slotStatuses, type Slot } from '../../lib/meds';
import { ioTotals } from '../../lib/charting';
import { isUnusual, type VitalKey } from '../../lib/vitals';
import { dayLabel, hm } from '../../lib/time';
import { Badge, Card, EmptyState, Icon, PageTitle } from '../../components/ui';
import { fullName, loadPatient, type PatientBundle } from '../patient/patientData';

/**
 * Ward-level Clinical Tools (sidebar "CLINICAL TOOLS" when no patient is open).
 * Read-only overviews of the real records; every row opens that patient's own page,
 * which runs the patient check (name, born, MRN) before anything is shown or recorded.
 */

interface WardRow extends PatientBundle {
  items: EntryWithChild[];
  orders: ActiveOrder[];
}

async function loadWardRows(db: DowntimeDB): Promise<WardRow[]> {
  const patients = await db.patient.toArray();
  const rows = await Promise.all(patients.map(async (p) => {
    const b = (await loadPatient(db, p.id))!;
    const items = await listPatientEntries(db, p.id);
    const orders = b.encounter ? await db.active_order.where('encounter_id').equals(b.encounter.id).toArray() : [];
    return { ...b, items, orders };
  }));
  return rows.sort((a, b) => (a.encounter?.bed ?? '').localeCompare(b.encounter?.bed ?? ''));
}

function useWardRows() {
  const { db } = useApp();
  return useLiveQuery(() => loadWardRows(db), [db]);
}

function PatientCell({ r }: { r: PatientBundle }) {
  return (
    <span className="flex items-center gap-space-sm min-w-0">
      <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary font-code-tabular text-code-tabular font-bold whitespace-nowrap">Bed {r.encounter?.bed ?? '—'}</span>
      <span className="font-semibold text-primary truncate">{fullName(r.patient)}</span>
    </span>
  );
}

const ToolNote = ({ children }: { children: ReactNode }) => <p className="font-body-sm text-secondary">{children}</p>;

const current = (items: EntryWithChild[]) => items.filter((x) => x.entry.status !== 'corrected' && x.entry.status !== 'entered-in-error');

/* -------------------------- Medication schedule -------------------------- */

const SLOT_TONE: Record<Slot['status'], 'green' | 'amber' | 'neutral' | 'blue' | 'red'> = { given: 'green', due: 'amber', held: 'neutral', refused: 'neutral', draft: 'blue', overdue: 'red' };
const SLOT_LABEL: Record<Slot['status'], string> = { given: 'Given', due: 'Due', held: 'Held', refused: 'Refused', draft: 'Check this', overdue: 'Overdue' };

export function WardMedSchedulePage() {
  const rows = useWardRows();
  const { clock } = useApp();
  const now = clock.nowIso();
  return (
    <>
      <PageTitle>Medication schedule</PageTitle>
      <ToolNote>Today ({dayLabel(now)}), scheduled doses from the patient list orders. Due / Given / Held come from the saved records; there is no Overdue rule until the hospital sets one. Open a patient to record a dose.</ToolNote>
      {!rows ? <p role="status">Loading…</p> : rows.length === 0 ? <EmptyState text="No patients in the patient list" /> : rows.map((r) => {
        const meds = r.items.filter((x) => x.entry.type === 'med_admin');
        const sched = r.orders.filter(isMedOrder).filter((o) => orderGroup(o) === 'scheduled');
        const other = r.orders.filter(isMedOrder).filter((o) => orderGroup(o) !== 'scheduled').length;
        return (
          <Card key={r.patient.id} aria-label={`Medicines for ${fullName(r.patient)}`}>
            <div className="flex items-center justify-between gap-space-sm mb-space-sm">
              <PatientCell r={r} />
              <Link to={`/patients/${r.patient.id}/meds`} className="font-body-md font-semibold text-secondary underline whitespace-nowrap">Open medicines</Link>
            </div>
            {sched.length === 0 ? <p className="font-body-md text-secondary">No scheduled medicine orders{other ? ` (${other} as-needed or drip)` : ''}.</p> : (
              <ul className="flex flex-col">
                {sched.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-space-sm min-h-[44px] border-b border-card-border last:border-0">
                    <span className="flex-1 min-w-[180px] font-body-md">{o.drug_name ?? o.text} <span className="text-secondary">· {o.route} · {o.frequency}</span></span>
                    <span className="flex flex-wrap gap-1">{slotStatuses(o, now, meds).map((s) => <Badge key={s.time} tone={SLOT_TONE[s.status]}><span className="font-code-tabular">{hm(s.time)}</span> {SLOT_LABEL[s.status]}</Badge>)}</span>
                  </li>
                ))}
                {other > 0 && <li className="pt-space-sm font-body-sm text-secondary">+ {other} as-needed or drip order{other === 1 ? '' : 's'} (see Open medicines)</li>}
              </ul>
            )}
          </Card>
        );
      })}
    </>
  );
}

/* ---------------------------- Vitals flowsheet ---------------------------- */

const VCOLS: { key: VitalKey; label: string }[] = [
  { key: 'temp_c', label: 'Temp' }, { key: 'heart_rate', label: 'Pulse' }, { key: 'resp_rate', label: 'Breathing' }, { key: 'spo2', label: 'Oxygen %' }, { key: 'pain_0_10', label: 'Pain' },
];

export function WardVitalsPage() {
  const rows = useWardRows();
  return (
    <>
      <PageTitle>Vitals flowsheet</PageTitle>
      <ToolNote>Latest confirmed vitals per patient. "Unusual" uses draft warning ranges that are not clinically approved; they never block saving. No early-warning score is calculated.</ToolNote>
      <Card>
        {!rows ? <p role="status">Loading…</p> : rows.length === 0 ? <EmptyState text="No patients in the patient list" /> : (
          <div className="overflow-x-auto">
            <table className="w-full font-body-md">
              <thead>
                <tr className="text-left font-label-uppercase text-label-uppercase text-secondary uppercase">
                  <th className="py-2 pr-space-md">Patient</th><th className="py-2 pr-space-md">Time</th><th className="py-2 pr-space-md">BP</th>
                  {VCOLS.map((c) => <th key={c.key} className="py-2 pr-space-md">{c.label}</th>)}
                  <th className="py-2"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const last = current(r.items).filter((x) => x.entry.type === 'vital_sign' && x.entry.status === 'confirmed')
                    .sort((a, b) => b.entry.care_time.localeCompare(a.entry.care_time))[0];
                  const v = last?.child as VitalSign | undefined;
                  const cell = (k: VitalKey) => {
                    const val = v?.[k] as number | null | undefined;
                    if (val == null) return <span className="text-outline">—</span>;
                    return <span className={`font-code-tabular font-semibold ${isUnusual(k, val) ? 'text-clinical-red' : 'text-primary'}`}>{val}{isUnusual(k, val) ? <span className="sr-only"> (unusual)</span> : null}</span>;
                  };
                  return (
                    <tr key={r.patient.id} className="border-t border-card-border">
                      <td className="py-2 pr-space-md"><PatientCell r={r} /></td>
                      <td className="py-2 pr-space-md font-code-tabular">{last ? hm(last.entry.care_time) : <span className="text-outline">No vitals yet</span>}</td>
                      <td className="py-2 pr-space-md">{v?.bp_systolic != null ? <span className={`font-code-tabular font-semibold ${isUnusual('bp_systolic', v.bp_systolic) || isUnusual('bp_diastolic', v.bp_diastolic) ? 'text-clinical-red' : 'text-primary'}`}>{v.bp_systolic}/{v.bp_diastolic ?? '—'}</span> : <span className="text-outline">—</span>}</td>
                      {VCOLS.map((c) => <td key={c.key} className="py-2 pr-space-md">{cell(c.key)}</td>)}
                      <td className="py-2"><Link to={`/patients/${r.patient.id}/vitals`} className="font-semibold text-secondary underline">Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/* ------------------------------ Fluid balance ------------------------------ */

export function WardFluidsPage() {
  const rows = useWardRows();
  const { clock } = useApp();
  const today = clock.nowIso().slice(0, 10);
  return (
    <>
      <PageTitle>Fluid balance (I/O)</PageTitle>
      <ToolNote>Totals for {dayLabel(clock.nowIso())} from 00:00, confirmed records only (same rule as each patient's Fluids page).</ToolNote>
      <Card>
        {!rows ? <p role="status">Loading…</p> : rows.length === 0 ? <EmptyState text="No patients in the patient list" /> : (
          <table className="w-full font-body-md">
            <thead>
              <tr className="text-left font-label-uppercase text-label-uppercase text-secondary uppercase">
                <th className="py-2 pr-space-md">Patient</th><th className="py-2 pr-space-md text-right">In (mL)</th><th className="py-2 pr-space-md text-right">Out (mL)</th><th className="py-2 pr-space-md text-right">Balance</th><th className="py-2 pr-space-md">Last record</th><th className="py-2"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ios = r.items.filter((x) => x.entry.type === 'intake_output' && x.entry.status === 'confirmed');
                const todays = ios.filter((x) => x.entry.care_time.slice(0, 10) === today).map((x) => x.child as IntakeOutput).filter(Boolean);
                const t = ioTotals(todays);
                const last = ios.sort((a, b) => b.entry.care_time.localeCompare(a.entry.care_time))[0];
                return (
                  <tr key={r.patient.id} className="border-t border-card-border">
                    <td className="py-2 pr-space-md"><PatientCell r={r} /></td>
                    <td className="py-2 pr-space-md text-right font-code-tabular">{t.totalIn}</td>
                    <td className="py-2 pr-space-md text-right font-code-tabular">{t.totalOut}</td>
                    <td className="py-2 pr-space-md text-right font-code-tabular font-bold text-primary">{t.balance > 0 ? '+' : ''}{t.balance}</td>
                    <td className="py-2 pr-space-md font-code-tabular">{last ? hm(last.entry.care_time) : <span className="text-outline">None</span>}</td>
                    <td className="py-2"><Link to={`/patients/${r.patient.id}/io`} className="font-semibold text-secondary underline">Open</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

/* --------------------------------- Body map -------------------------------- */

export function WardBodyMapPage() {
  const rows = useWardRows();
  return (
    <>
      <PageTitle>Body map</PageTitle>
      <ToolNote>Pick a patient. Sites come from recorded medicine sites (e.g. IV and injection sites); the patient check runs before the map opens.</ToolNote>
      <Card>
        {!rows ? <p role="status">Loading…</p> : rows.length === 0 ? <EmptyState text="No patients in the patient list" /> : (
          <ul className="flex flex-col">
            {rows.map((r) => {
              const sites = current(r.items).filter((x) => x.entry.type === 'med_admin' && (x.child as MedAdmin | undefined)?.site).length;
              return (
                <li key={r.patient.id}>
                  <Link to={`/patients/${r.patient.id}/body`} className="flex items-center justify-between gap-space-md min-h-[52px] border-b border-card-border last:border-0 px-space-sm hover:bg-surface-container-low rounded">
                    <PatientCell r={r} />
                    <span className="flex items-center gap-space-sm font-body-md text-secondary">{sites} recorded site{sites === 1 ? '' : 's'}<Icon name="chevron_right" className="text-outline" /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
