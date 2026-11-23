import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isUnusual, type VitalKey } from '../../lib/vitals';
import { dayLabel, hm } from '../../lib/time';
import { EmptyState, Icon } from '../../components/ui';
import { SourceBadge, StatusBadge } from '../entries/entryView';
import type { FlowRow } from './flowsheetData';

/** The flowsheet table. Below the xl width each row becomes a card that lists only what was recorded. */
export const seg = (on: boolean) => `min-h-9 px-3 rounded font-body-sm text-body-sm font-semibold transition-colors ${on ? 'bg-primary-container text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container'}`;

type TableTab = 'standard' | 'oxygen' | 'awake';
interface Col { label: string; value: (r: FlowRow) => unknown; cell: (r: FlowRow) => ReactNode }

const Dash = () => <span className="text-outline"><span aria-hidden>—</span><span className="sr-only">not recorded</span></span>;

function Value({ bad, children }: { bad: boolean; children: ReactNode }) {
  if (!bad) return <span className="whitespace-nowrap">{children}</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-downtime-amber-bg border border-downtime-amber-border px-1.5 py-0.5 whitespace-nowrap">
      <Icon name="warning" className="text-[14px] text-[#7a5410]" /><span>{children}</span><span className="sr-only"> Unusual</span>
    </span>
  );
}

const num = (label: string, k: VitalKey, unit: string): Col => ({
  label, value: (r) => r.values[k],
  cell: (r) => <Value bad={r.kind !== 'baseline' && isUnusual(k, r.values[k])}><strong className="text-primary">{r.values[k]}</strong> <span className="text-secondary">{unit}</span></Value>,
});
const words = (label: string, value: (r: FlowRow) => string | null | undefined): Col => ({ label, value, cell: (r) => <span className="text-primary font-semibold">{value(r)}</span> });

const COLS = {
  temp: num('Temp', 'temp_c', '°C'), hr: num('Pulse', 'heart_rate', '/min'), rr: num('Breathing', 'resp_rate', '/min'), spo2: num('SpO₂', 'spo2', '%'),
  bgl: num('Blood sugar', 'glucose_mgdl', 'mg/dL'), flow: num('Oxygen flow', 'o2_flow_lpm', 'L/min'),
  bp: {
    label: 'BP (mmHg)', value: (r) => r.values.bp_systolic,
    cell: (r) => <Value bad={r.kind !== 'baseline' && (isUnusual('bp_systolic', r.values.bp_systolic) || isUnusual('bp_diastolic', r.values.bp_diastolic))}><strong className="text-primary">{r.values.bp_systolic}/{r.values.bp_diastolic ?? '?'}</strong></Value>,
  },
  pain: { label: 'Pain', value: (r) => r.values.pain_0_10, cell: (r) => <span className="rounded bg-surface-container px-1.5 py-0.5 font-semibold text-primary whitespace-nowrap">{r.values.pain_0_10} / 10</span> },
  awake: words('Awake?', (r) => r.values.consciousness),
  o2: words('Oxygen given by', (r) => r.values.o2_device),
} satisfies Record<string, Col>;
type ColId = keyof typeof COLS;

const TABS: { id: TableTab; label: string; cols: ColId[]; note?: string }[] = [
  { id: 'standard', label: 'Standard', cols: ['temp', 'hr', 'bp', 'rr', 'spo2', 'bgl', 'pain', 'awake'] },
  { id: 'oxygen', label: 'Oxygen', cols: ['spo2', 'o2', 'flow', 'rr', 'hr'] },
  { id: 'awake', label: 'Awake / pain', cols: ['awake', 'pain', 'hr', 'bp'], note: 'ClinBridge records Awake? (four options) and pain 0–10. The Glasgow Coma Scale (GCS) is not recorded here.' },
];

const th = 'px-space-sm py-2.5 text-left font-label-uppercase text-[11px] text-on-surface-variant font-bold uppercase whitespace-nowrap';
const td = 'font-body-sm text-body-sm max-xl:grid max-xl:grid-cols-[84px_minmax(0,1fr)] max-xl:items-center max-xl:gap-2 max-xl:py-1 xl:px-space-sm xl:py-space-sm xl:align-middle';

function Cell({ label, className = '', children, col }: { label: string; className?: string; children: ReactNode; col?: string }) {
  return <td role="cell" data-col={col} className={`${td} ${className}`}><span aria-hidden className="xl:hidden text-[12px] text-secondary">{label}</span><span className="min-w-0">{children}</span></td>;
}

export function Flowsheet({ rows, names }: { rows: FlowRow[]; names: Map<string, string> }) {
  const [tab, setTab] = useState<TableTab>('standard');
  const [old, setOld] = useState(false);
  const t = TABS.find((x) => x.id === tab)!;
  const retired = rows.filter((r) => r.kind === 'retired').length;
  const shown = rows.filter((r) => old || r.kind !== 'retired');
  const saved = rows.filter((r) => r.kind === 'confirmed').length, drafts = rows.filter((r) => r.kind === 'draft').length;
  const newestDay = rows[0]?.time.slice(0, 10);
  return (
    <section aria-label="Vitals flowsheet" className="min-w-0 max-w-full rounded-xl border border-card-border overflow-hidden bg-surface-container-lowest shadow-sm">
      <div className="bg-surface-container-low p-space-md flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-sm">
          <span className="w-9 h-9 rounded bg-primary text-on-primary grid place-items-center shrink-0"><Icon name="table_rows" className="text-[18px]" /></span>
          <div>
            <h2 className="font-headline-sm text-headline-sm text-primary">All vitals</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Newest first · {saved} confirmed{drafts ? ` · ${drafts} draft${drafts === 1 ? '' : 's'}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Flowsheet columns" className="flex flex-wrap bg-surface-container-lowest rounded-lg border border-card-border p-0.5">
            {TABS.map((x) => <button key={x.id} type="button" aria-pressed={tab === x.id} onClick={() => setTab(x.id)} className={seg(tab === x.id)}>{x.label}</button>)}
          </div>
          <button type="button" aria-pressed={old} onClick={() => setOld(!old)} disabled={retired === 0} title={retired === 0 ? 'No old versions or mistakes for this patient' : undefined}
            className={`min-h-9 px-3 rounded-lg border border-card-border text-on-surface font-body-sm text-body-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${old ? 'bg-secondary-fixed' : 'bg-surface-container-lowest'}`}>
            <Icon name="tune" className="text-[16px]" />Old versions and mistakes ({retired})
          </button>
        </div>
      </div>
      {t.note && <p className="px-space-md py-2 font-body-sm text-body-sm text-secondary border-b border-card-border">{t.note}</p>}
      <div className="overflow-x-auto">
        <table className="w-full max-xl:block" role="table" aria-label="Vitals by time">
          <thead className="bg-surface-container max-xl:sr-only" role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col" className={th}>Time</th>
              {t.cols.map((c) => <th key={c} role="columnheader" scope="col" className={th}>{COLS[c].label}</th>)}
              <th role="columnheader" scope="col" className={th}>Recorded by and source</th>
              <th role="columnheader" scope="col" className={th}><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="max-xl:block" role="rowgroup">
            {shown.map((r, i) => (
              <tr key={r.id} role="row" data-kind={r.kind} className={`border-t border-card-border max-xl:grid sm:max-xl:grid-cols-2 max-xl:gap-x-space-md max-xl:px-space-md max-xl:py-space-sm ${r.kind === 'retired' ? 'opacity-70' : ''} ${r.kind === 'baseline' ? 'bg-surface-container-low' : i === 0 ? 'bg-[#F1F6FE]' : ''}`}>
                <Cell label="Time" className="max-xl:col-span-full">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <Icon name={r.kind === 'baseline' ? 'cloud_download' : r.kind === 'draft' ? 'rule' : 'schedule'} className="text-[15px] text-secondary" />
                    <strong className="font-code-tabular text-primary">{hm(r.time)}</strong>
                    {r.time.slice(0, 10) !== newestDay && <span className="text-[12px] text-secondary">{dayLabel(r.time)}</span>}
                  </span>
                </Cell>
                {t.cols.map((c) => {
                  const v = COLS[c].value(r), has = v != null && v !== '';
                  return <Cell key={c} col={c} label={COLS[c].label} className={has ? (r.kind === 'retired' ? 'line-through' : '') : 'max-xl:!hidden'}>{has ? COLS[c].cell(r) : <Dash />}</Cell>;
                })}
                <Cell label="Recorded by">
                  <span className="block font-semibold text-primary">{r.item ? names.get(r.item.entry.performer_id) ?? r.item.entry.performer_id : 'Hospital patient list'}</span>
                  <span className="flex flex-wrap items-center gap-1 mt-0.5">
                    <span className="text-[12px] text-secondary">{r.item ? (r.item.entry.raw_input_kind === 'photo' ? 'From a paper photo' : 'Typed') : 'Before the outage'}</span>
                    {r.item && <><SourceBadge entry={r.item.entry} /><StatusBadge entry={r.item.entry} /></>}
                  </span>
                </Cell>
                <Cell label="">
                  {r.item ? <Link to={`/entries/${r.id}`} aria-label={`Open vitals from ${hm(r.time)}`} className="min-h-9 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-body-sm text-body-sm font-semibold inline-flex items-center gap-1">Open<Icon name="chevron_right" className="text-[16px]" /></Link>
                    : <span className="inline-flex items-center gap-1 text-[12px] text-secondary whitespace-nowrap"><Icon name="lock" className="text-[15px]" />Read only</span>}
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <EmptyState text="No vitals yet" />}
    </section>
  );
}
