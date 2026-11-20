import { useId } from 'react';
import { BACK_DETAIL, BACK_DIVIDERS, BACK_ELLIPSES, FRONT_DETAIL, FRONT_DIVIDERS, FRONT_ELLIPSES, SHAPES, SILHOUETTE } from './anatomy';
import { regionsInView, type View } from './regions';

/** Theme 2 palette for the illustration only (the app's own colours are unchanged). */
const INK = '#4E5D70';
const LINE = '#8E9BAC';
const DIVIDER = '#B3BDC9';

export type MarkerKind = 'injection' | 'iv';
export interface FigureMarker { regionId: string; kind: MarkerKind; key: string }

/** Teardrop pin, tip at (0,0). */
const PIN = 'M 0,0 C -2.2,-4.2 -6,-7.4 -6,-11.6 A 6 6 0 1 1 6,-11.6 C 6,-7.4 2.2,-4.2 0,0 Z';

export function BodyFigure({ view, markers, selected, onSelect, titleId }: {
  view: View;
  markers: FigureMarker[];
  selected: string | null;
  onSelect: (id: string) => void;
  titleId?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const regions = regionsInView(view);
  // Arms/legs first so the torso regions win where the artwork draws the torso on top.
  const ordered = [...regions].sort((a, b) => rank(a.id) - rank(b.id));
  const detail = view === 'front' ? FRONT_DETAIL : BACK_DETAIL;
  const ellipses = view === 'front' ? FRONT_ELLIPSES : BACK_ELLIPSES;
  const dividers = view === 'front' ? FRONT_DIVIDERS : BACK_DIVIDERS;
  const [leftLabel, rightLabel] = view === 'front' ? ['Patient’s right', 'Patient’s left'] : ['Patient’s left', 'Patient’s right'];
  const sel = regions.find((r) => r.id === selected);
  const selZone = sel?.zones[view];

  // Markers are drawn in the region's primary view only, clustered around the anchor.
  const byRegion = new Map<string, FigureMarker[]>();
  for (const m of markers) {
    const r = regions.find((x) => x.id === m.regionId);
    if (!r || r.primary !== view) continue;
    byRegion.set(m.regionId, [...(byRegion.get(m.regionId) ?? []), m]);
  }

  return (
    <svg viewBox="0 0 240 560" className="w-full h-auto select-none" role="group" aria-labelledby={titleId} data-view={view}>
      <defs>
        <linearGradient id={`${uid}-skin`} gradientUnits="userSpaceOnUse" x1="70" y1="20" x2="190" y2="540">
          <stop offset="0" stopColor="#FBF7EF" />
          <stop offset="0.5" stopColor="#F4EDE1" />
          <stop offset="1" stopColor="#ECE3D4" />
        </linearGradient>
        {SILHOUETTE.map((k) => <clipPath key={k} id={`${uid}-self-${k}`}><path d={SHAPES[k]} /></clipPath>)}
        {regions.map((r) => (
          <clipPath key={r.id} id={`${uid}-clip-${r.id}`}>
            {r.zones[view]!.clip.map((k) => <path key={k} d={SHAPES[k]} />)}
          </clipPath>
        ))}
      </defs>

      {/* 1. Artwork (decorative) */}
      <g aria-hidden="true" data-layer="art">
        <ellipse cx="120" cy="541" rx="58" ry="5.5" fill="#E4DCCD" opacity="0.7" />
        {SILHOUETTE.map((k) => <path key={`o-${k}`} d={SHAPES[k]} fill="none" stroke={INK} strokeWidth="3.2" strokeLinejoin="round" />)}
        {/* Fill then soft inner edge per part, in draw order, so hidden overlaps never show through. */}
        {SILHOUETTE.map((k) => (
          <g key={`f-${k}`}>
            <path d={SHAPES[k]} fill={`url(#${uid}-skin)`} />
            <path d={SHAPES[k]} fill="none" stroke="#DCCFBA" strokeWidth="5" opacity="0.5" clipPath={`url(#${uid}-self-${k})`} />
          </g>
        ))}
        <g fill="none" stroke={LINE} strokeWidth="0.95" strokeLinecap="round" opacity="0.85">
          {detail.map((d, i) => <path key={i} d={d} />)}
          {ellipses.map((e, i) => <ellipse key={i} {...e} />)}
        </g>
        <g fill="none" stroke={DIVIDER} strokeWidth="0.8" strokeDasharray="2 2.4" strokeLinecap="round">
          {dividers.map((d, i) => <path key={i} d={d} />)}
        </g>
      </g>

      {/* 2. Interactive regions */}
      <g data-layer="regions">
        {ordered.map((r) => {
          const z = r.zones[view]!;
          return (
            <path
              key={r.id}
              d={`M ${z.band.map((p) => p.join(',')).join(' L ')} Z`}
              clipPath={`url(#${uid}-clip-${r.id})`}
              className="bm-region"
              role="button"
              tabIndex={0}
              aria-label={r.label}
              aria-pressed={selected === r.id}
              data-region={r.id}
              onClick={() => onSelect(r.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }}
            >
              <title>{r.label}</title>
            </path>
          );
        })}
      </g>

      {/* 3. Clinical markers (from records only) */}
      <g data-layer="markers" pointerEvents="none" aria-hidden="true">
        {[...byRegion].map(([id, ms]) => {
          const z = regions.find((r) => r.id === id)!.zones[view]!;
          return ms.slice(0, 4).map((m, i) => {
            const dx = (i - (Math.min(ms.length, 4) - 1) / 2) * 9;
            return (
              <g key={m.key} transform={`translate(${z.anchor[0] + dx},${z.anchor[1] + 6})`} data-marker={m.kind}>
                <path d={PIN} fill={m.kind === 'iv' ? '#4A6078' : '#1C2536'} stroke="#FFFFFF" strokeWidth="1.2" />
                <circle cx="0" cy="-11.6" r="2.4" fill="#FFFFFF" />
              </g>
            );
          });
        })}
      </g>

      {/* 4. Labels */}
      <g aria-hidden="true" fontFamily="Inter" fontWeight="700" fontSize="8.5" fill="#4A6078">
        <text x="8" y="14">{leftLabel}</text>
        <text x="232" y="14" textAnchor="end">{rightLabel}</text>
      </g>
      {sel && selZone && (
        <g aria-hidden="true" pointerEvents="none" data-layer="label">
          <rect x={clampX(selZone.anchor[0]) - labelW(sel.label) / 2} y={selZone.anchor[1] - 34} width={labelW(sel.label)} height="15" rx="4" fill="#1C2536" opacity="0.92" />
          <text x={clampX(selZone.anchor[0])} y={selZone.anchor[1] - 23.5} textAnchor="middle" fontFamily="Inter" fontSize="8.5" fontWeight="600" fill="#FFFFFF">{sel.label}</text>
        </g>
      )}
    </svg>
  );
}

const labelW = (t: string) => t.length * 4.9 + 12;
const clampX = (x: number) => Math.max(52, Math.min(188, x));
const rank = (id: string) => (/ARM|FOREARM|HAND|THIGH|LEG|FOOT|HEEL/.test(id) ? 0 : 1);
