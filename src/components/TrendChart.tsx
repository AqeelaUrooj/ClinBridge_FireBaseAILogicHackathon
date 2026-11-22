import type { TrendSeries } from '../lib/vitalTrend';
import { hm, dayLabel } from '../lib/time';

/**
 * Small line chart of one measure (plain SVG, no chart library).
 * - x = real measurement time, so uneven gaps between readings stay visible.
 * - Solid points joined by the line = confirmed readings. Hollow points = drafts (not confirmed), never joined.
 * - The values are also listed in a table, so nothing depends on reading the chart or on colour.
 * No thresholds, target bands or scores are drawn.
 */
export function TrendChart({ series, label, unit, testId }: { series: TrendSeries; label: string; unit: string; testId?: string }) {
  const all = [...series.baseline, ...series.confirmed, ...series.drafts];
  if (!all.length) return <p className="font-body-sm text-secondary" data-testid={testId}>No {label} readings saved for this patient yet.</p>;
  const W = 300, H = 96, PX = 14, PT = 16, PB = 18;
  const t0 = Math.min(...all.map((p) => p.ms)), t1 = Math.max(...all.map((p) => p.ms));
  const vs = all.map((p) => p.value);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const pad = Math.max(1, (hi - lo) * 0.15);
  const vLo = lo - pad, vHi = hi + pad;
  const x = (ms: number) => (t1 === t0 ? W / 2 : PX + ((ms - t0) / (t1 - t0)) * (W - 2 * PX));
  const y = (v: number) => PT + (1 - (v - vLo) / (vHi - vLo)) * (H - PT - PB);
  const days = new Set(all.map((p) => p.time.slice(0, 10))).size;
  const when = (iso: string) => (days > 1 ? `${hm(iso)} ${dayLabel(iso)}` : hm(iso));
  const rows = [...all].sort((a, b) => a.ms - b.ms);
  const tag = (p: (typeof rows)[number]) => (p.status === 'draft' ? ' (draft, not confirmed)' : p.status === 'baseline' ? ' (hospital list before the outage)' : '');
  const desc = `${label} readings: ${rows.map((p) => `${p.value}${unit} at ${when(p.time)}${tag(p)}`).join('; ')}.`;
  return (
    <figure className="flex flex-col gap-2" data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[96px]" role="img" aria-label={desc}>
        <line x1={PX} x2={W - PX} y1={H - PB} y2={H - PB} stroke="#C5C6CD" strokeWidth="1" />
        {series.confirmed.length > 1 && (
          <polyline fill="none" stroke="#4A6078" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
            points={series.confirmed.map((p) => `${x(p.ms)},${y(p.value)}`).join(' ')} />
        )}
        {series.confirmed.map((p) => <circle key={p.entryId} cx={x(p.ms)} cy={y(p.value)} r="3.5" fill="#1C2536" data-kind="confirmed" />)}
        {series.drafts.map((p) => <circle key={p.entryId} cx={x(p.ms)} cy={y(p.value)} r="4" fill="#fff" stroke="#00658B" strokeWidth="2" data-kind="draft" />)}
        {series.baseline.map((p) => <rect key={p.entryId} x={x(p.ms) - 3.5} y={y(p.value) - 3.5} width="7" height="7" fill="#75777D" data-kind="baseline" />)}
        <text x={PX} y={H - 4} fontSize="9" fill="#5A6E85" fontFamily="Inter">{when(rows[0]!.time)}</text>
        {rows.length > 1 && <text x={W - PX} y={H - 4} fontSize="9" fill="#5A6E85" fontFamily="Inter" textAnchor="end">{when(rows[rows.length - 1]!.time)}</text>}
        <text x={PX} y={10} fontSize="9" fill="#5A6E85" fontFamily="Inter">{hi}{unit}</text>
        {hi !== lo && <text x={W - PX} y={10} fontSize="9" fill="#5A6E85" fontFamily="Inter" textAnchor="end">low {lo}{unit}</text>}
      </svg>
      <figcaption className="font-body-sm text-secondary flex flex-wrap gap-x-3">
        <span><span aria-hidden>●</span> confirmed</span>
        {series.drafts.length > 0 && <span><span aria-hidden>○</span> draft (not confirmed, not part of the line)</span>}
        {series.baseline.length > 0 && <span><span aria-hidden>■</span> hospital list before the outage</span>}
        {series.missing > 0 && <span>{series.missing} vital-sign record{series.missing === 1 ? '' : 's'} without {label}</span>}
      </figcaption>
      <div className="max-h-40 overflow-y-auto border border-card-border rounded">
        <table className="w-full font-body-sm text-left">
          <caption className="sr-only">{label} values by measurement time</caption>
          <thead className="bg-surface-container-low text-secondary"><tr><th scope="col" className="px-2 py-1 font-semibold">Measured</th><th scope="col" className="px-2 py-1 font-semibold">{label}</th><th scope="col" className="px-2 py-1 font-semibold">Status</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.entryId} className="border-t border-card-border">
                <td className="px-2 py-1 font-code-tabular">{when(p.time)}</td>
                <td className="px-2 py-1 font-code-tabular font-semibold">{p.value}{unit}{p.note ? <span className="font-normal text-secondary"> · {p.note}</span> : null}</td>
                <td className="px-2 py-1">{p.status === 'draft' ? 'Draft' : p.status === 'baseline' ? 'Before outage (hospital list)' : 'Confirmed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
