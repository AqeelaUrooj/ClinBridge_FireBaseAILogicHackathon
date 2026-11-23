import { useState, type ReactNode } from 'react';
import { dayLabel, hm } from '../../lib/time';
import { useWidth } from '../../components/useWidth';
import type { VitalKey } from '../../lib/vitals';
import type { FlowRow, InsulinDose } from './flowsheetData';

/**
 * Two charts of saved readings (plain SVG). Time runs left to right at real spacing. Only confirmed readings are joined;
 * hospital-list readings are squares and drafts are hollow, both on their own. No target band or limit line is drawn.
 * Every value is also in the flowsheet table on the same page, and each reading can be pointed at or reached with Tab.
 */
const INK = '#1C2536', SLATE = '#4A6078', MUTED = '#5A6E85', GRID = '#E1E4EA', BAND = '#CFE2FA', BASE = '#75777D', DRAFT = '#00658B';
const H = 236, PL = 40, PR = 18, PT = 30, PB = 30;

interface Pt { row: FlowRow; x: number }
interface Scale { x: (ms: number) => number; y: (v: number) => number; ticks: number[]; W: number }

const at = (row: FlowRow, k: VitalKey) => (typeof row.values[k] === 'number' ? (row.values[k] as number) : null);

function makeScale(W: number, times: number[], values: number[], step: number): Scale {
  const t0 = Math.min(...times), t1 = Math.max(...times);
  let lo = Math.floor(Math.min(...values) / step) * step, hi = Math.ceil(Math.max(...values) / step) * step;
  if (lo === hi) { lo = Math.max(0, lo - step); hi += step; }
  const ticks: number[] = [];
  const jump = Math.max(step, Math.ceil((hi - lo) / step / 4) * step);
  for (let v = lo; v <= hi; v += jump) ticks.push(v);
  const inner = W - PL - PR - 40;
  return {
    W, ticks,
    x: (ms) => (t1 === t0 ? PL + 20 + inner / 2 : PL + 20 + ((ms - t0) / (t1 - t0)) * inner),
    y: (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB),
  };
}

/** Time labels that do not touch each other; the first and last are always kept. The day is written when it changes. */
function axisLabels(pts: { x: number; time: string }[], manyDays: boolean) {
  const dated = pts.map((p, i) => ({ ...p, text: manyDays && (i === 0 || p.time.slice(0, 10) !== pts[i - 1]!.time.slice(0, 10)) ? `${hm(p.time)} ${dayLabel(p.time).slice(0, -5)}` : hm(p.time) }));
  const half = (t: string) => t.length * 3.1 + 5;
  const out: typeof dated = [];
  const last = dated[dated.length - 1];
  for (const p of dated) {
    const prev = out[out.length - 1];
    if (prev && p.x - prev.x < half(prev.text) + half(p.text)) continue;
    if (last && p !== last && last.x - p.x < half(p.text) + half(last.text)) continue;
    out.push(p);
  }
  return out;
}

const statusText = (r: FlowRow) => (r.kind === 'baseline' ? 'hospital list before the outage' : r.kind === 'draft' ? 'draft, not confirmed' : 'confirmed');

function Frame({ pts, scale, label, children, readout, height = H }: { pts: Pt[]; scale: Scale; label: string; children: ReactNode; readout: (r: FlowRow) => string[]; height?: number }) {
  const [active, setActive] = useState<string | null>(null);
  const cur = pts.find((p) => p.row.id === active);
  const manyDays = new Set(pts.map((p) => p.row.time.slice(0, 10))).size > 1;
  const when = (iso: string) => (manyDays ? `${hm(iso)}, ${dayLabel(iso)}` : hm(iso));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${scale.W} ${height}`} width={scale.W} height={height} className="block max-w-full" role="img" aria-label={label}>
        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={scale.W - PR} y1={scale.y(t)} y2={scale.y(t)} stroke={GRID} strokeWidth="1" data-grid="" />
            <text x={PL - 8} y={scale.y(t) + 3.5} textAnchor="end" fontSize="11" fill={MUTED} fontFamily="Inter">{t}</text>
          </g>
        ))}
        {cur && <line x1={cur.x} x2={cur.x} y1={PT - 12} y2={H - PB} stroke={SLATE} strokeWidth="1" />}
        {children}
        {axisLabels(pts.map((p) => ({ x: p.x, time: p.row.time })), manyDays).map((p) => (
          <text key={p.time} x={p.x} y={H - 10} textAnchor="middle" fontSize="11" fill={MUTED} fontFamily="Inter">{p.text}</text>
        ))}
      </svg>
      {pts.map((p) => (
        <button key={p.row.id} type="button" onMouseEnter={() => setActive(p.row.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(p.row.id)} onBlur={() => setActive(null)} onClick={() => setActive(p.row.id)}
          className="absolute rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" style={{ left: p.x - 14, width: 28, top: PT - 14, height: H - PT - PB + 14 }}>
          <span className="sr-only">Reading at {when(p.row.time)}: {readout(p.row).join(', ')} ({statusText(p.row)})</span>
        </button>
      ))}
      {cur && (
        <div aria-hidden className="pointer-events-none absolute z-10 rounded-lg bg-primary-container text-on-primary px-2.5 py-1.5 font-body-sm text-[12px] leading-[17px] shadow-md w-max max-w-[190px]"
          style={cur.x > scale.W / 2 ? { right: scale.W - cur.x + 12, top: PT } : { left: cur.x + 12, top: PT }}>
          {readout(cur.row).map((l) => <span key={l} className="block font-semibold">{l}</span>)}
          <span className="block opacity-80">{when(cur.row.time)} · {statusText(cur.row)}</span>
        </div>
      )}
    </div>
  );
}

const key = 'inline-flex items-center gap-1.5 font-body-sm text-[12px] text-on-surface-variant';
const Key = ({ children, text }: { children: ReactNode; text: string }) => <li className={key}><svg width="18" height="12" aria-hidden>{children}</svg>{text}</li>;
const BaseKey = () => <Key text="Hospital list before the outage"><rect x="5" y="2" width="8" height="8" fill={BASE} /></Key>;
const DraftKey = () => <Key text="Draft, not confirmed"><circle cx="9" cy="6" r="4" fill="#fff" stroke={DRAFT} strokeWidth="2" /></Key>;

function Dot({ kind, x, y }: { kind: FlowRow['kind']; x: number; y: number }) {
  if (kind === 'baseline') return <rect x={x - 4} y={y - 4} width="8" height="8" fill={BASE} stroke="#fff" strokeWidth="1.5" data-kind="baseline" />;
  if (kind === 'draft') return <circle cx={x} cy={y} r="4" fill="#fff" stroke={DRAFT} strokeWidth="2" data-kind="draft" />;
  return <circle cx={x} cy={y} r="4.5" fill={INK} stroke="#fff" strokeWidth="1.5" data-kind="confirmed" />;
}

/** Pulse line with blood pressure (bottom to top) behind it. Both are drawn on one number scale. */
export function PulsePressureChart({ rows }: { rows: FlowRow[] }) {
  const { ref, width } = useWidth(640);
  const use = [...rows].reverse().filter((r) => r.kind !== 'retired' && (at(r, 'heart_rate') != null || (at(r, 'bp_systolic') != null && at(r, 'bp_diastolic') != null)));
  if (!use.length) return <div ref={ref}><p className="font-body-sm text-body-sm text-secondary py-space-lg">No pulse or blood pressure saved for this patient yet.</p></div>;
  const values = use.flatMap((r) => [at(r, 'heart_rate'), at(r, 'bp_systolic'), at(r, 'bp_diastolic')].filter((v): v is number => v != null));
  const s = makeScale(width, use.map((r) => r.ms), values, 20);
  const pts = use.map((row) => ({ row, x: s.x(row.ms) }));
  const bp = pts.filter((p) => at(p.row, 'bp_systolic') != null && at(p.row, 'bp_diastolic') != null);
  const bpLine = bp.filter((p) => p.row.kind === 'confirmed');
  const hr = pts.filter((p) => at(p.row, 'heart_rate') != null);
  const hrLine = hr.filter((p) => p.row.kind === 'confirmed');
  const labelled = (p: Pt, list: Pt[]) => list.length <= 5 || p === list[0] || p === list[list.length - 1];
  const read = (r: FlowRow) => [at(r, 'heart_rate') != null ? `Pulse ${at(r, 'heart_rate')} /min` : null, at(r, 'bp_systolic') != null ? `BP ${at(r, 'bp_systolic')}/${at(r, 'bp_diastolic') ?? '?'} mmHg` : null].filter((x): x is string => !!x);
  const poly = (k: VitalKey) => bpLine.map((p) => `${p.x},${s.y(at(p.row, k)!)}`);
  return (
    <figure className="flex flex-col gap-1 my-auto" data-testid="pulse-bp-chart">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <Key text="Pulse (/min)"><line x1="0" x2="18" y1="6" y2="6" stroke={INK} strokeWidth="2" /><circle cx="9" cy="6" r="3.5" fill={INK} /></Key>
        <Key text="Blood pressure, bottom to top (mmHg)"><rect x="1" y="1" width="16" height="10" rx="2" fill={BAND} stroke={SLATE} /></Key>
        {use.some((r) => r.kind === 'baseline') && <BaseKey />}
        {use.some((r) => r.kind === 'draft') && <DraftKey />}
      </ul>
      <div ref={ref}>
        <Frame pts={pts} scale={s} readout={read} label={`Pulse and blood pressure: ${use.map((r) => `${read(r).join(', ')} at ${hm(r.time)} (${statusText(r)})`).join('; ')}.`}>
          {bpLine.length > 1 && <polygon points={[...poly('bp_systolic'), ...poly('bp_diastolic').reverse()].join(' ')} fill={BAND} opacity="0.75" />}
          {bpLine.length > 1 && (['bp_systolic', 'bp_diastolic'] as const).map((k) => <polyline key={k} points={poly(k).join(' ')} fill="none" stroke={SLATE} strokeWidth="1.5" />)}
          {bp.map((p) => {
            const top = s.y(at(p.row, 'bp_systolic')!), bottom = s.y(at(p.row, 'bp_diastolic')!);
            const c = p.row.kind === 'baseline' ? BASE : p.row.kind === 'draft' ? DRAFT : SLATE;
            return (
              <g key={p.row.id} data-bp={p.row.kind}>
                <path d={`M ${p.x - 7},${top} H ${p.x + 7} M ${p.x},${top} V ${bottom} M ${p.x - 7},${bottom} H ${p.x + 7}`} stroke={c} strokeWidth="2" strokeDasharray={p.row.kind === 'confirmed' ? undefined : '4 3'} fill="none" />
                {labelled(p, bp) && <text x={p.x} y={top - 7} textAnchor="middle" fontSize="11" fill={SLATE} fontFamily="Inter" fontWeight="600">{at(p.row, 'bp_systolic')}/{at(p.row, 'bp_diastolic')}</text>}
              </g>
            );
          })}
          {hrLine.length > 1 && <polyline points={hrLine.map((p) => `${p.x},${s.y(at(p.row, 'heart_rate')!)}`).join(' ')} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />}
          {hr.map((p) => (
            <g key={p.row.id}>
              <Dot kind={p.row.kind} x={p.x} y={s.y(at(p.row, 'heart_rate')!)} />
              {labelled(p, hr) && <text x={p.x + 8} y={s.y(at(p.row, 'heart_rate')!) - 6} fontSize="12" fontWeight="700" fill={INK} fontFamily="Inter" stroke="#fff" strokeWidth="3" paintOrder="stroke">{at(p.row, 'heart_rate')}</text>}
            </g>
          ))}
        </Frame>
      </div>
    </figure>
  );
}

/** Blood sugar line with recorded insulin doses as marks on the same time line. */
export function GlucoseChart({ rows, doses }: { rows: FlowRow[]; doses: InsulinDose[] }) {
  const { ref, width } = useWidth(420);
  const use = [...rows].reverse().filter((r) => r.kind !== 'retired' && at(r, 'glucose_mgdl') != null);
  if (!use.length) return <div ref={ref}><p className="font-body-sm text-body-sm text-secondary py-space-lg">No blood sugar readings saved for this patient yet.</p></div>;
  const s = makeScale(width, [...use.map((r) => r.ms), ...doses.map((d) => d.ms)], use.map((r) => at(r, 'glucose_mgdl')!), 50);
  const pts = use.map((row) => ({ row, x: s.x(row.ms) }));
  const line = pts.filter((p) => p.row.kind === 'confirmed');
  const read = (r: FlowRow) => [`Blood sugar ${at(r, 'glucose_mgdl')} mg/dL`];
  const flagW = (d: InsulinDose) => Math.max(64, d.text.length * 6.4 + 46);
  return (
    <figure className="flex flex-col gap-1" data-testid="glucose-chart">
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <Key text="Blood sugar (mg/dL)"><line x1="0" x2="18" y1="6" y2="6" stroke={INK} strokeWidth="2" /><circle cx="9" cy="6" r="3.5" fill={INK} /></Key>
        {doses.length > 0 && <Key text="Insulin dose recorded"><line x1="9" x2="9" y1="0" y2="12" stroke={SLATE} strokeWidth="2" strokeDasharray="3 2" /></Key>}
        {use.some((r) => r.kind === 'baseline') && <BaseKey />}
        {use.some((r) => r.kind === 'draft') && <DraftKey />}
      </ul>
      <div ref={ref}>
        <Frame pts={pts} scale={s} readout={read} label={`Blood sugar: ${use.map((r) => `${at(r, 'glucose_mgdl')} mg/dL at ${hm(r.time)} (${statusText(r)})`).join('; ')}.${doses.length ? ` Insulin recorded: ${doses.map((d) => `${d.drug} ${d.text} at ${hm(d.time)}`).join('; ')}.` : ''}`}>
          {doses.map((d, i) => {
            const x = s.x(d.ms), w = flagW(d), fx = Math.max(PL, Math.min(s.W - PR - w, x - w / 2)), fy = H - PB - 20 - (i % 2) * 22;
            return (
              <g key={d.entryId} data-dose={d.entryId}>
                <line x1={x} x2={x} y1={PT - 12} y2={H - PB} stroke={SLATE} strokeWidth="1.5" strokeDasharray="3 3" />
                <rect x={fx} y={fy} width={w} height="18" rx="4" fill={SLATE} />
                <text x={fx + w / 2} y={fy + 12.5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#fff" fontFamily="Inter">{d.text} · {hm(d.time)}</text>
              </g>
            );
          })}
          {line.length > 1 && <polyline points={line.map((p) => `${p.x},${s.y(at(p.row, 'glucose_mgdl')!)}`).join(' ')} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />}
          {pts.map((p) => (
            <g key={p.row.id}>
              <Dot kind={p.row.kind} x={p.x} y={s.y(at(p.row, 'glucose_mgdl')!)} />
              {(pts.length <= 6 || p === pts[0] || p === pts[pts.length - 1]) && <text x={p.x} y={s.y(at(p.row, 'glucose_mgdl')!) - 9} textAnchor="middle" fontSize="12" fontWeight="700" fill={INK} fontFamily="Inter" stroke="#fff" strokeWidth="3" paintOrder="stroke">{at(p.row, 'glucose_mgdl')}</text>}
            </g>
          ))}
        </Frame>
      </div>
    </figure>
  );
}
