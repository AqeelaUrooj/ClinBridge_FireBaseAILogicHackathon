import { useState } from 'react';
import { useWidth } from '../../components/useWidth';
import { signedMl, type IoHour } from './ioData';

/**
 * Today hour by hour: intake above the zero line, output below it, and the running balance, all in mL on one scale.
 * Confirmed records only. The same amounts are in the two ledgers under the chart. No limit or target is drawn.
 */
const IN = '#3B82C4', OUT = '#C9820A', INK = '#1C2536', MUTED = '#5A6E85', GRID = '#E1E4EA';
const H = 250, PL = 46, PR = 14, PT = 26, PB = 28;

function niceStep(span: number): number {
  for (const s of [50, 100, 200, 250, 500, 1000, 2000, 5000]) if (span / s <= 5) return s;
  return 10_000;
}

export function IoChart({ hours, nowIso }: { hours: IoHour[]; nowIso: string }) {
  const { ref, width: W } = useWidth(900);
  const [active, setActive] = useState<number | null>(null);
  const used = hours.filter((h) => h.records > 0);
  if (!used.length) return <div ref={ref}><p className="font-body-sm text-body-sm text-secondary py-space-lg">No confirmed fluid records today.</p></div>;

  const nowHour = Number(nowIso.slice(11, 13)), nowMin = Number(nowIso.slice(14, 16));
  const first = used[0]!.hour;
  const line = hours.filter((h) => h.hour >= first && h.hour <= Math.max(nowHour, used[used.length - 1]!.hour));
  const top = Math.max(0, ...used.map((h) => h.totalIn), ...line.map((h) => h.running));
  const low = Math.min(0, ...used.map((h) => -h.totalOut), ...line.map((h) => h.running));
  const step = niceStep(top - low);
  const hi = Math.ceil(top / step) * step, lo = Math.floor(low / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const colW = (W - PL - PR) / 24;
  const x = (hour: number) => PL + colW * hour;
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const barW = Math.min(24, colW - 2);
  const every = colW >= 40 ? 1 : colW >= 22 ? 2 : colW >= 14 ? 3 : 6;
  const cur = active == null ? null : hours[active]!;
  const bar = (h: IoHour, v: number) => ({ x: x(h.hour) + colW / 2 - barW / 2, y: Math.min(y(0), y(v)), width: barW, height: Math.abs(y(v) - y(0)) });
  const read = (h: IoHour) => [h.totalIn ? `In ${h.totalIn} mL` : null, h.totalOut ? `Out ${h.totalOut} mL` : null, `Running balance ${signedMl(h.running)} mL`].filter((t): t is string => !!t);
  const label = `Fluids by hour: ${used.map((h) => `${h.label} ${read(h).join(', ')}`).join('; ')}.`;
  const nowX = x(nowHour) + (colW * nowMin) / 60;

  return (
    <figure className="flex flex-col gap-2" data-testid="io-chart">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 font-body-sm text-[12px] text-on-surface-variant">
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="w-3 h-3 rounded-sm" style={{ background: IN }} />Intake (mL)</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="w-3 h-3 rounded-sm" style={{ background: OUT }} />Output (mL)</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="w-4 h-0.5" style={{ background: INK }} />Running balance (mL)</li>
      </ul>
      <div ref={ref} className="relative rounded-lg bg-surface-container-low">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke={t === 0 ? MUTED : GRID} strokeWidth="1" />
              <text x={PL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={MUTED} fontFamily="Inter">{t < 0 ? `−${-t}` : t}</text>
            </g>
          ))}
          <line x1={nowX} x2={nowX} y1={PT - 8} y2={H - PB} stroke={INK} strokeWidth="1.5" strokeDasharray="3 3" data-now="" />
          <text x={nowX + (nowHour > 20 ? -5 : 5)} y={PT - 10} textAnchor={nowHour > 20 ? 'end' : 'start'} fontSize="11" fontWeight="700" fill={INK} fontFamily="Inter">Now {nowIso.slice(11, 16)}</text>
          {used.map((h) => (
            <g key={h.hour} opacity={active == null || active === h.hour ? 1 : 0.55}>
              {h.totalIn > 0 && <rect {...bar(h, h.totalIn)} rx="3" fill={IN} data-bar="in" data-hour={h.hour} />}
              {h.totalOut > 0 && <rect {...bar(h, -h.totalOut)} rx="3" fill={OUT} data-bar="out" data-hour={h.hour} />}
            </g>
          ))}
          <polyline fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" points={line.map((h) => `${h.hour === nowHour && h.records === 0 ? nowX : x(h.hour) + colW / 2},${y(h.running)}`).join(' ')} />
          {used.map((h) => <circle key={h.hour} cx={x(h.hour) + colW / 2} cy={y(h.running)} r="4.5" fill={INK} stroke="#fff" strokeWidth="1.5" data-balance={h.running} />)}
          {used.length <= 8 && used.map((h) => (
            <g key={h.hour} fontSize="11" fontWeight="600" fill={INK} fontFamily="Inter" textAnchor="middle" stroke="#F3F4F6" strokeWidth="3" paintOrder="stroke">
              {h.totalIn > 0 && <text x={x(h.hour) + colW / 2} y={y(h.totalIn) - 8}>{h.totalIn}</text>}
              {h.totalOut > 0 && <text x={x(h.hour) + colW / 2} y={y(-h.totalOut) + 17}>{h.totalOut}</text>}
            </g>
          ))}
          {hours.filter((h) => h.hour % every === 0).map((h) => (
            <text key={h.hour} x={x(h.hour) + colW / 2} y={H - 9} textAnchor="middle" fontSize="11" fontWeight={h.hour === nowHour ? 700 : 400} fill={h.hour === nowHour ? INK : MUTED} fontFamily="Inter">{colW >= 40 ? h.label : h.label.slice(0, 2)}</text>
          ))}
        </svg>
        {used.map((h) => (
          <button key={h.hour} type="button" onMouseEnter={() => setActive(h.hour)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(h.hour)} onBlur={() => setActive(null)} onClick={() => setActive(h.hour)}
            className="absolute rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" style={{ left: x(h.hour) + colW / 2 - Math.max(colW, 24) / 2, width: Math.max(colW, 24), top: PT, height: H - PT - PB }}>
            <span className="sr-only">Fluids in the hour from {h.label}: {read(h).join(', ')}</span>
          </button>
        ))}
        {cur && (
          <div aria-hidden className="pointer-events-none absolute z-10 rounded-lg bg-primary-container text-on-primary px-2.5 py-1.5 font-body-sm text-[12px] leading-[17px] shadow-md w-max"
            style={x(cur.hour) > W / 2 ? { right: W - x(cur.hour) + 6, top: PT } : { left: x(cur.hour) + colW + 6, top: PT }}>
            {read(cur).map((t) => <span key={t} className="block font-semibold">{t}</span>)}
            <span className="block opacity-80">Hour from {cur.label}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
