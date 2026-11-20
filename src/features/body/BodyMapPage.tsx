import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import type { MedAdmin } from '../../db/schema';
import { useApp } from '../../state/app';
import { formatDose } from '../../lib/dose';
import { dateTimeLabel } from '../../lib/time';
import { Breadcrumbs, Card, Icon } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { EntryRow } from '../entries/entryView';
import frontArt from './art/front.svg?raw';
import backArt from './art/back.svg?raw';
import { REGIONS, centre, siteRegion, type Region, type Shape, type View } from './regions';

type MarkerKind = 'injection' | 'iv';
interface Marker { region: Region; kind: MarkerKind; item: EntryWithChild }

const markerKind = (m: MedAdmin): MarkerKind => ((m.site ?? '').includes('IV line') || m.route === 'IV' ? 'iv' : 'injection');

function ShapeEl({ s, ...rest }: { s: Shape } & React.SVGProps<SVGElement>) {
  if (s.kind === 'rect') return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={4} {...(rest as React.SVGProps<SVGRectElement>)} />;
  if (s.kind === 'ellipse') return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...(rest as React.SVGProps<SVGEllipseElement>)} />;
  return <polygon points={s.points.map((p) => p.join(',')).join(' ')} {...(rest as React.SVGProps<SVGPolygonElement>)} />;
}

function Figure({ view, art, markers, selected, onSelect }: { view: View; art: string; markers: Marker[]; selected: string | null; onSelect: (id: string) => void }) {
  const regions = REGIONS.filter((r) => r.view === view);
  // Patient's left/right labels: front view mirrors the viewer.
  const [leftLabel, rightLabel] = view === 'front' ? ["Patient's R", "Patient's L"] : ["Patient's L", "Patient's R"];
  return (
    <figure className="flex flex-col items-center gap-space-sm">
      <figcaption className="font-label-uppercase text-label-uppercase text-secondary uppercase">{view === 'front' ? 'Front' : 'Back'}</figcaption>
      <div className="relative w-[280px] h-[588px]">
        {/* Supplied Stitch artwork, bundled with the app (works offline). */}
        <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: art }} />
        <svg viewBox="0 0 200 420" className="absolute inset-0 w-full h-full" role="group" aria-label={`${view} view body areas`}>
          <text x="6" y="14" fontSize="8" fill="#4A6078" fontFamily="Inter" fontWeight="700">{leftLabel}</text>
          <text x="194" y="14" fontSize="8" fill="#4A6078" fontFamily="Inter" fontWeight="700" textAnchor="end">{rightLabel}</text>
          {regions.map((r) => {
            const count = markers.filter((m) => m.region.id === r.id).length;
            const isSel = selected === r.id;
            return (
              <g key={r.id} role="button" tabIndex={0} aria-pressed={isSel} aria-label={`${r.label}${count ? `, ${count} marked` : ''}`}
                data-region={r.id} className="cursor-pointer outline-none group"
                onClick={() => onSelect(r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }}>
                <ShapeEl s={r.shape} fill={isSel ? '#4A6078' : '#4A6078'} fillOpacity={isSel ? 0.22 : 0}
                  stroke="#1C2536" strokeOpacity={isSel ? 0.9 : 0} strokeWidth={1.2}
                  className="transition-[fill-opacity,stroke-opacity] group-hover:[fill-opacity:0.12] group-focus-visible:[stroke-opacity:1] group-focus-visible:[fill-opacity:0.15]" />
              </g>
            );
          })}
          {regions.map((r) => {
            const ms = markers.filter((m) => m.region.id === r.id);
            if (!ms.length) return null;
            const [cx, cy] = centre(r.shape);
            const iv = ms.some((m) => m.kind === 'iv');
            return (
              <g key={`m-${r.id}`} pointerEvents="none" aria-hidden="true">
                <circle cx={cx} cy={cy} r={6} fill={iv ? '#4A6078' : '#277453'} stroke="#fff" strokeWidth={1.5} />
                {ms.length > 1 && <text x={cx} y={cy + 2.6} fontSize="7" textAnchor="middle" fill="#fff" fontFamily="Inter" fontWeight="700">{ms.length}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}

export function BodyMapPage() {
  const { patient } = useCurrentPatient();
  const { db } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const meds = useLiveQuery(async () => (await listPatientEntries(db, patient.id))
    .filter((x) => x.entry.type === 'med_admin' && x.entry.status === 'confirmed' && (x.child as MedAdmin | undefined)?.site), [db, patient.id]);
  const markers: Marker[] = [];
  const unmapped: EntryWithChild[] = [];
  for (const item of meds ?? []) {
    const m = item.child as MedAdmin;
    const region = siteRegion(m.site);
    if (region) markers.push({ region, kind: markerKind(m), item });
    else unmapped.push(item);
  }
  const base = `/patients/${patient.id}`;
  const sel = REGIONS.find((r) => r.id === selected);
  const inSel = markers.filter((m) => m.region.id === selected);

  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'History', to: `${base}/timeline` }, { label: 'Body map' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">Body map</h1>
      <div className="grid grid-cols-1 xl:grid-cols-[auto_1fr] gap-space-lg items-start">
        <Card className="flex gap-space-md justify-center">
          <Figure view="front" art={frontArt} markers={markers} selected={selected} onSelect={setSelected} />
          <Figure view="back" art={backArt} markers={markers} selected={selected} onSelect={setSelected} />
        </Card>
        <div className="flex flex-col gap-space-md">
          <Card>
            <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">{sel ? sel.label : 'Tap a body area'}</h2>
            {sel ? (inSel.length ? inSel.map((m) => <EntryRow key={m.item.entry.id} item={m.item} />) : <p className="text-secondary">Nothing marked here.</p>)
              : <p className="text-secondary">Left and right are the patient’s own left and right.</p>}
          </Card>
          <Card>
            <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">All marked sites</h2>
            <div className="flex gap-space-md mb-space-sm font-body-sm text-secondary">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-sync-green" />Injection</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-secondary" />IV line</span>
            </div>
            {markers.length === 0 && unmapped.length === 0 ? <p className="text-secondary">No sites recorded.</p> : (
              <ul className="flex flex-col gap-1">
                {markers.map((m) => {
                  const ma = m.item.child as MedAdmin;
                  return (
                    <li key={m.item.entry.id} className="flex flex-wrap items-center gap-x-2 font-body-md">
                      <Icon name={m.kind === 'iv' ? 'water_drop' : 'vaccines'} className="text-secondary text-[18px]" />
                      <button className="underline decoration-dotted text-primary whitespace-nowrap" onClick={() => setSelected(m.region.id)}>{m.region.label}</button>
                      <span className="text-on-surface-variant">· {ma.drug_name}{ma.dose_given != null ? ` ${formatDose(ma.dose_given)} ${ma.dose_given_unit ?? ''}` : ''} · {dateTimeLabel(m.item.entry.care_time)}</span>
                    </li>
                  );
                })}
                {unmapped.map((x) => (
                  <li key={x.entry.id} className="font-body-md text-on-surface-variant">Site not on the map: “{(x.child as MedAdmin).site}”</li>
                ))}
              </ul>
            )}
          </Card>
          <p className="font-body-sm text-secondary">Skin and pain markers will appear once notes can be linked to a body area (waiting on the final region list).</p>
        </div>
      </div>
    </>
  );
}
