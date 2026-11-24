import { createContext, useContext, useId, type ReactNode } from 'react';
import { stack } from '../../lib/handwriting/fonts';
import { arrowPath, boxPath, fit, rand, ringPath, scribblePath, starPath, strokeLine, tickPath, type Item, type Line, type Pen } from '../../lib/handwriting/hand';
import { BACK_DETAIL, FRONT_DETAIL, SHAPES, SILHOUETTE } from '../body/anatomy';

export const LABEL = 'PRACTICE — SYNTHETIC REPORT — NOT A MEDICAL RECORD';

/* ------------------------------ Pen ------------------------------ */

const InkCtx = createContext<{ pen: Pen; seed: string } | null>(null);
export const Ink = ({ pen, seed, children }: { pen: Pen; seed: string; children: ReactNode }) => <InkCtx.Provider value={{ pen, seed }}>{children}</InkCtx.Provider>;
function useInk() {
  const v = useContext(InkCtx);
  if (!v) throw new Error('Handwriting outside <Ink>');
  return v;
}

function HandLine({ line, x, y, pen }: { line: Line; x: number; y: number; pen: Pen }) {
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${line.tilt.toFixed(2)})${pen.slant ? ` skewX(${-pen.slant})` : ''}`}>
      {line.words.map((w, i) => (
        <text key={i} transform={`translate(${w.x.toFixed(1)} ${w.y.toFixed(1)}) rotate(${w.turn.toFixed(1)}) skewX(${(-w.lean).toFixed(1)}) scale(${w.wide.toFixed(3)} 1)`} dx={w.dx} dy={w.dy} rotate={w.rotate} fontFamily={stack(w.family)} fontSize={w.px.toFixed(1)}
          fill={pen.ink} stroke={pen.ink} strokeWidth={w.stroke.toFixed(2)} opacity={w.opacity.toFixed(2)}>{`${w.t} `}</text>
      ))}
    </g>
  );
}

export function Stroke({ d, w = 1.7, o = 0.9 }: { d: string; w?: number; o?: number }) {
  const { pen } = useInk();
  return <path d={d} fill="none" stroke={pen.ink} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" opacity={o} />;
}
const useRand = (key: string) => rand(`${useInk().seed}|${key}`);
export const Tick = ({ x, y, s = 16 }: { x: number; y: number; s?: number }) => <Stroke d={tickPath(x, y, s, useRand(`t${x},${y}`))} w={1.9} />;
export const Arrow = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => <Stroke d={arrowPath(x1, y1, x2, y2, useRand(`a${x1},${y1}`))} />;
export const Ring = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => <Stroke d={ringPath(x, y, w, h, useRand(`r${x},${y}`))} w={1.6} o={0.85} />;
export const Cross = ({ x, y, s = 14 }: { x: number; y: number; s?: number }) => {
  const r = useRand(`x${x},${y}`);
  return <Stroke d={`${strokeLine(x - s / 2, y - s / 2, x + s / 2, y + s / 2, r)} ${strokeLine(x + s / 2, y - s / 2, x - s / 2, y + s / 2, r)}`} w={2.2} />;
};

/** Handwriting in a box. `slips`: here and there a crossed-out slip of the pen between words (no letters, no numbers). */
export function Fill({ x, y, w, h, items, size, min, lead, indent, slips = false, middle = false, tag }: {
  x: number; y: number; w: number; h: number; items: Item[]; size: number; min?: number; lead?: number; indent?: number; slips?: boolean; middle?: boolean; tag?: string;
}) {
  const { pen, seed } = useInk();
  if (!items.length) return <NotRecorded x={x + 3} y={middle ? y + h / 2 + 4.5 : y + Math.min(h - 4, size * 0.95)} />;
  const key = `${seed}|${Math.round(x)},${Math.round(y)}`;
  const f = fit(items, pen, { x, y, w, h }, { size, min, lead, seed: key, indent });
  const top = middle ? Math.max(0, (h - f.lines.length * f.step) / 2) + f.size * 0.05 : 0;
  const r = rand(`${key}|marks`);
  return (
    <g data-field={tag} transform={top ? `translate(0 ${top.toFixed(1)})` : undefined}>
      {f.lines.map((p, i) => {
        const s = p.size, mx = p.x - s * 0.62, my = p.y - s * 0.3;
        // Only in running text, never beside a number, a name or a dose.
        const slip = slips && !p.item.calm && p.last && p.line.w < w - s * 5 && !/\d/.test(p.item.t.slice(-14)) && r() < 0.42;
        return (
          <g key={i}>
            {p.first && p.item.mark === 'star' && <Stroke d={starPath(mx, my, s * 0.5, r)} w={1.6} />}
            {p.first && p.item.mark === 'dot' && <circle cx={mx} cy={my} r={s * 0.12} fill={pen.ink} />}
            {p.first && p.item.mark === 'dash' && <Stroke d={strokeLine(mx - s * 0.2, my, mx + s * 0.25, my, r, 0.8)} />}
            {p.first && p.item.mark === 'box' && <Stroke d={boxPath(mx - s * 0.32, my - s * 0.32, s * 0.6, r)} w={1.4} />}
            {p.first && p.item.mark === 'arrow' && <Stroke d={arrowPath(mx - s * 0.45, my, mx + s * 0.3, my, r)} />}
            <HandLine line={p.line} x={p.x} y={p.y} pen={pen} />
            {p.item.under && <Stroke d={strokeLine(p.x, p.y + s * 0.2, p.x + p.line.w, p.y + s * 0.2, r)} w={1.6} />}
            {p.item.ring && p.first && <Stroke d={ringPath(p.x - s * 0.5, p.y - s * 1.05, p.line.w + s, s * 1.55, r)} w={1.6} o={0.8} />}
            {slip && <Stroke d={scribblePath(p.x + p.line.w + s * 0.4, p.y - s * 0.5, s * (1.6 + r() * 1.4), s * 0.42, r)} w={2} />}
          </g>
        );
      })}
      {(f.dropped > 0 || f.cut) && (
        <text x={x + w} y={y + h + 1} textAnchor="end" fontFamily="Inter, sans-serif" fontSize={9.5} fill="#5b6270">
          {f.dropped > 0 ? `+ ${f.dropped} more in ClinBridge` : 'continues in ClinBridge'}
        </text>
      )}
    </g>
  );
}

/** One written value. It shrinks, or wraps when there is room, but is never shortened. */
export function Value({ x, y, w, h = 30, t, size, calm = true, middle = true, tag, under, ring }: { x: number; y: number; w: number; h?: number; t: string | null | undefined; size: number; calm?: boolean; middle?: boolean; tag?: string; under?: boolean; ring?: boolean }) {
  return <Fill x={x} y={y} w={w} h={h} items={t ? [{ t, calm, under, ring }] : []} size={size} min={7} lead={1.02} middle={middle} tag={tag} />;
}

/** A replaced value of a fixed record: crossed out once so it can still be read, next to the value that counts. */
export function Struck({ x, y, t, size }: { x: number; y: number; t: string; size: number }) {
  const { pen, seed } = useInk();
  const f = fit([{ t, calm: true }], pen, { x, y, w: 200, h: size * 1.3 }, { size, seed: `${seed}|was${x},${y}` });
  const p = f.lines[0];
  if (!p) return null;
  return <g data-was={t}><HandLine line={p.line} x={p.x} y={p.y} pen={pen} /><Stroke d={strokeLine(p.x - 3, p.y - size * 0.3, p.x + p.line.w + 4, p.y - size * 0.38, rand(`${seed}|st${x},${y}`))} w={2} /></g>;
}

/* ------------------------------ Printed sheet ------------------------------ */

const INK = '#15181d';
export function Print({ x, y, t, size = 17, bold = false, anchor = 'start', fill = INK, italic = false, spacing }: { x: number; y: number; t: string; size?: number; bold?: boolean; anchor?: 'start' | 'middle' | 'end'; fill?: string; italic?: boolean; spacing?: number }) {
  return <text x={x} y={y} fontFamily="Inter, 'Segoe UI', Arial, sans-serif" fontSize={size} fontWeight={bold ? 700 : 400} fontStyle={italic ? 'italic' : undefined} textAnchor={anchor} fill={fill} letterSpacing={spacing}>{t}</text>;
}
/** Printed, not handwritten: the program says that there is no entry. */
export const NotRecorded = ({ x, y, t = 'Not recorded' }: { x: number; y: number; t?: string }) => <Print x={x} y={y} t={t} size={13} italic fill="#80858f" />;
export const Box = ({ x, y, w, h, s = 1.5, fill = 'none', r = 0, c = INK }: { x: number; y: number; w: number; h: number; s?: number; fill?: string; r?: number; c?: string }) => <rect x={x} y={y} width={w} height={h} fill={fill} stroke={s ? c : 'none'} strokeWidth={s} rx={r} />;
export const H = ({ x, y, w, s = 1.3, c = INK }: { x: number; y: number; w: number; s?: number; c?: string }) => <line x1={x} y1={y} x2={x + w} y2={y} stroke={c} strokeWidth={s} />;
export const V = ({ x, y, h, s = 1.3, c = INK }: { x: number; y: number; h: number; s?: number; c?: string }) => <line x1={x} y1={y} x2={x} y2={y + h} stroke={c} strokeWidth={s} />;
export const Check = ({ x, y, s = 15 }: { x: number; y: number; s?: number }) => <rect x={x} y={y} width={s} height={s} fill="#fff" fillOpacity={0.6} stroke={INK} strokeWidth={1.4} />;

/** On every sheet, every picture file and every printed page. */
export function SyntheticLabel({ x, y, w, size = 15 }: { x: number; y: number; w: number; size?: number }) {
  return (
    <g data-testid="synthetic-label">
      <rect x={x} y={y} width={w} height={size * 1.75} rx={3} fill="#fff" fillOpacity={0.75} stroke="#a3261b" strokeWidth={1.6} />
      <text x={x + w / 2} y={y + size * 1.22} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight={700} fontSize={size} fill="#a3261b" letterSpacing={0.6}>{LABEL}</text>
    </g>
  );
}

/** Front or back figure in pen. `marks` are sites from the patient's own medicine records. */
export function Figure({ x, y, h, view, color, sw = 2 }: { x: number; y: number; h: number; view: 'front' | 'back'; color: string; sw?: number }) {
  const k = h / 530;
  const clip = useId().replace(/:/g, '');
  return (
    <g transform={`translate(${x} ${y}) scale(${k.toFixed(4)}) translate(-40 -15)`} data-figure={view}>
      <defs><clipPath id={clip}><rect x={0} y={0} width={240} height={560} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        {/* All parts with a line, then all parts without: only the outer edge stays. */}
        <g fill="none" stroke={color} strokeWidth={(sw * 2) / k} strokeLinejoin="round">{SILHOUETTE.map((s) => <path key={s} d={SHAPES[s]} />)}</g>
        <g fill="#f6f5f1">{SILHOUETTE.map((s) => <path key={s} d={SHAPES[s]} />)}</g>
        <g fill="none" stroke={color} strokeWidth={(sw * 0.45) / k} opacity={0.7}>{(view === 'front' ? FRONT_DETAIL : BACK_DETAIL).map((d, i) => <path key={i} d={d} />)}</g>
      </g>
    </g>
  );
}
/** Where a point of the figure's own drawing lands on the sheet. */
export const onFigure = (x: number, y: number, h: number, [px, py]: readonly [number, number]): [number, number] => [x + (px - 40) * (h / 530), y + (py - 15) * (h / 530)];

/* ------------------------------ Paper ------------------------------ */

export type Look = 'photo' | 'print';
export type Desk = 'scan' | 'clean' | 'wood' | 'bedside';

/** `photo`: the sheet as a scan or photo. `print`: clean white paper, so a real printer does not print a picture of paper. */
export function Paper({ w, h, look, desk, seed, title, desc, children }: { w: number; h: number; look: Look; desk: Desk; seed: string; title: string; desc: string; children: ReactNode }) {
  const id = useId().replace(/:/g, '');
  const n = Math.floor(rand(seed)() * 900);
  const photo = look === 'photo';
  const flat = desk === 'scan' || desk === 'clean';
  const m = !photo ? 0 : flat ? 12 : desk === 'wood' ? 34 : 130;
  const top = photo && desk === 'bedside' ? 240 : m, bottom = photo && desk === 'bedside' ? 70 : m;
  const W = w + 2 * m, HH = h + top + bottom;
  const tilt = !photo ? 0 : (rand(`${seed}tilt`)() - 0.5) * (desk === 'clean' ? 0.15 : flat ? 0.5 : 1.8);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${HH}`} role="img" aria-label={title} data-report="" data-look={look} className="block w-full h-auto" preserveAspectRatio="xMidYMin meet">
      <title>{title}</title>
      <desc>{desc}</desc>
      {photo && (
        <defs>
          <filter id={`${id}p`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.006 0.008" numOctaves={6} seed={n} result="n" />
            <feDiffuseLighting in="n" lightingColor="#fffefb" surfaceScale={desk === 'wood' ? 5 : desk === 'bedside' ? 3 : 1.5} diffuseConstant={1.08}><feDistantLight azimuth={55} elevation={62} /></feDiffuseLighting>
          </filter>
          <filter id={`${id}g`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves={2} seed={n + 7} /><feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.24  0 0 0 0 0.22  0 0 0 -0.9 0.5" /></filter>
          <filter id={`${id}w`} x="-2%" y="-2%" width="104%" height="104%"><feTurbulence type="fractalNoise" baseFrequency="0.0022 0.003" numOctaves={2} seed={n + 3} result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale={desk === 'clean' ? 4 : desk === 'scan' ? 13 : desk === 'wood' ? 26 : 12} xChannelSelector="R" yChannelSelector="G" /></filter>
          <filter id={`${id}i`} x="-1%" y="-1%" width="102%" height="102%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={n + 11} result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale={1.5} xChannelSelector="R" yChannelSelector="B" /></filter>
          <filter id={`${id}d`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.0035 0.09" numOctaves={4} seed={n + 5} /><feColorMatrix values="0.30 0 0 0 0.36  0.24 0 0 0 0.24  0.19 0 0 0 0.15  0 0 0 0 1" /></filter>
          <filter id={`${id}b`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation={9} /></filter>
          <filter id={`${id}s`} x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation={10} /></filter>
          <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity={0.16} /><stop offset="0.55" stopColor="#fff" stopOpacity={0} /><stop offset="1" stopColor="#1a1408" stopOpacity={0.16} /></linearGradient>
          <clipPath id={`${id}c`}><rect x={0} y={0} width={W} height={HH} /></clipPath>
        </defs>
      )}
      {!photo && <rect x={0} y={0} width={w} height={h} fill="#fff" />}
      <g clipPath={photo ? `url(#${id}c)` : undefined}>
        {photo && flat && <rect width={W} height={HH} fill={desk === 'clean' ? '#fafafa' : '#d9d7d1'} />}
        {photo && !flat && <rect width={W} height={HH} filter={`url(#${id}d)`} />}
        {photo && desk === 'bedside' && <Bedside w={W} h={HH} top={top} id={id} />}
        <g transform={photo ? `rotate(${tilt.toFixed(2)} ${W / 2} ${HH / 2}) translate(${m} ${top})` : undefined}>
          {photo && !flat && <rect x={10} y={16} width={w} height={h} fill="#1d1206" opacity={0.5} filter={`url(#${id}s)`} />}
          <g filter={photo ? `url(#${id}w)` : undefined}>
            {photo && <rect x={0} y={0} width={w} height={h} rx={desk === 'bedside' ? 9 : 2} fill={desk === 'clean' ? '#fff' : desk === 'bedside' ? '#f6f4ee' : '#f4f3f0'} />}
            {photo && desk !== 'clean' && <rect x={0} y={0} width={w} height={h} rx={desk === 'bedside' ? 9 : 2} filter={`url(#${id}p)`} style={{ mixBlendMode: 'multiply' }} opacity={0.85} />}
            <g filter={photo ? `url(#${id}i)` : undefined}>{children}</g>
            {photo && <rect x={0} y={0} width={w} height={h} filter={`url(#${id}g)`} opacity={desk === 'clean' ? 0.05 : 0.2} />}
          </g>
        </g>
        {photo && desk !== 'clean' && <rect width={W} height={HH} fill={`url(#${id}l)`} />}
      </g>
    </svg>
  );
}

/** The out-of-focus bedside around the pocket notepad. Plain shapes, no brand and no person. */
function Bedside({ w, h, top, id }: { w: number; h: number; top: number; id: string }) {
  const edge = top * 0.72;
  return (
    <g>
      <g filter={`url(#${id}b)`}>
        <rect x={-30} y={-30} width={w + 60} height={edge + 40} fill="#b7ab9a" />
        <rect x={-30} y={-30} width={w * 0.24} height={edge + 60} fill="#93a1a6" />
        <rect x={w * 0.3} y={edge * 0.1} width={w * 0.75} height={26} fill="#6e6357" />
        <path d={`M${w * 0.26},${edge + 30} C${w * 0.27},${edge * 0.4} ${w * 0.34},${edge * 0.36} ${w * 0.48},${edge * 0.35} L${w * 0.82},${edge * 0.35} C${w * 0.92},${edge * 0.36} ${w * 0.95},${edge * 0.5} ${w * 0.95},${edge + 30}`} fill="none" stroke="#e6e0d3" strokeWidth={44} />
        <path d={`M-20,${edge * 0.75} C${w * 0.1},${edge * 0.55} ${w * 0.19},${edge * 0.6} ${w * 0.2},${edge + 30}`} fill="none" stroke="#e6e0d3" strokeWidth={36} />
      </g>
      <g filter={`url(#${id}s)`} opacity={0.9}>
        <ellipse cx={w - 78} cy={top + 250} rx={72} ry={22} fill="#e9eef0" opacity={0.75} /><path d={`M${w - 148},${top + 60} L${w - 130},${top + 255} L${w - 26},${top + 255} L${w - 8},${top + 60} Z`} fill="#dde4e6" opacity={0.65} /><path d={`M${w - 70},${top - 90} L${w - 92},${top + 220}`} stroke="#f6f6f4" strokeWidth={11} />
      </g>
      <g><circle cx={w - 84} cy={top + 470} r={64} fill="#f2ece0" /><circle cx={w - 84} cy={top + 470} r={64} fill="none" stroke="#cfc6b4" strokeWidth={3} /><circle cx={w - 84} cy={top + 470} r={29} fill="#8b6a45" /></g>
      <path d={`M${w - 168},${h - 470} L${w - 46},${h - 190}`} stroke="#22345f" strokeWidth={17} strokeLinecap="round" /><path d={`M${w - 56},${h - 212} L${w - 40},${h - 176}`} stroke="#b9bcc2" strokeWidth={10} strokeLinecap="round" />
      <g fill="#f3f3ee" stroke="#c9cbc4" strokeWidth={2}><path d={`M22,${top + 330} l128,-28 l24,92 l-130,30 z`} /><path d={`M40,${top + 470} l122,18 l-18,96 l-122,-20 z`} /></g>
    </g>
  );
}
