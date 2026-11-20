import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import type { MedAdmin } from '../../db/schema';
import { useApp } from '../../state/app';
import { formatDose } from '../../lib/dose';
import { dateTimeLabel } from '../../lib/time';
import { Breadcrumbs, Card, Icon } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { EntryRow } from '../entries/entryView';
import { BodyFigure, type FigureMarker, type MarkerKind } from './BodyFigure';
import { REGIONS, regionById, siteRegion, type View } from './regions';

const markerKind = (m: MedAdmin): MarkerKind => ((m.site ?? '').includes('IV line') || m.route === 'IV' ? 'iv' : 'injection');
type ViewChoice = View | 'both';

export function BodyMapPage() {
  const { patient } = useCurrentPatient();
  const { db } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ViewChoice>(() => (typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'both' : 'front'));
  const meds = useLiveQuery(async () => (await listPatientEntries(db, patient.id))
    .filter((x) => x.entry.type === 'med_admin' && x.entry.status === 'confirmed' && (x.child as MedAdmin | undefined)?.site), [db, patient.id]);

  const marked: { item: EntryWithChild; regionId: string; kind: MarkerKind }[] = [];
  const unmapped: EntryWithChild[] = [];
  for (const item of meds ?? []) {
    const m = item.child as MedAdmin;
    const r = siteRegion(m.site);
    if (r) marked.push({ item, regionId: r.id, kind: markerKind(m) });
    else unmapped.push(item);
  }
  const figureMarkers: FigureMarker[] = marked.map((m) => ({ regionId: m.regionId, kind: m.kind, key: m.item.entry.id }));
  const recentInjections = marked.filter((m) => m.kind === 'injection').slice(0, 3);
  const sel = selected ? regionById(selected) : undefined;
  const inSel = marked.filter((m) => m.regionId === selected);
  const base = `/patients/${patient.id}`;

  function choose(id: string) {
    setSelected(id);
    const r = regionById(id);
    if (r && view !== 'both' && !r.zones[view]) setView(r.primary);
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'History', to: `${base}/timeline` }, { label: 'Body map' }]} />
      <div className="flex flex-wrap items-center justify-between gap-space-md">
        <h1 className="font-headline-lg text-headline-lg text-primary">Body map</h1>
        <div className="flex flex-wrap items-center gap-space-md">
          <div className="flex items-center bg-surface-container-low rounded-lg p-0.5 border border-card-border" role="group" aria-label="Which view">
            {(['front', 'back', 'both'] as const).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
                className={`min-h-10 px-4 rounded font-body-md ${view === v ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant'}`}>
                {v === 'front' ? 'Front' : v === 'back' ? 'Back' : 'Both'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 font-body-md">
            <span className="text-secondary">Body area</span>
            <select value={selected ?? ''} onChange={(e) => e.target.value && choose(e.target.value)} className="h-10 rounded-lg border border-card-border bg-surface-container-lowest px-2" aria-label="Choose body area from a list">
              <option value="">Choose…</option>
              {REGIONS.map((r) => {
                const n = marked.filter((m) => m.regionId === r.id).length;
                return <option key={r.id} value={r.id}>{r.label}{n ? ` (${n})` : ''}</option>;
              })}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-space-lg items-start">
        <Card className="bg-[#FBF8F2]">
          <div className={`grid gap-space-md ${view === 'both' ? 'grid-cols-2' : 'grid-cols-1'} max-w-[720px] mx-auto`}>
            {(view === 'both' ? (['front', 'back'] as const) : [view]).map((v) => (
              <figure key={v} className="flex flex-col items-center gap-1 w-full max-w-[340px] mx-auto">
                <figcaption id={`bm-${v}`} className="font-label-uppercase text-label-uppercase text-secondary uppercase">{v === 'front' ? 'Front' : 'Back'}</figcaption>
                <BodyFigure view={v} markers={figureMarkers} selected={selected} onSelect={choose} titleId={`bm-${v}`} />
              </figure>
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-space-lg mt-space-sm font-body-sm text-on-surface-variant" aria-label="Marker key">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-primary-container" />Injection</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-secondary" />IV line</span>
            <span className="flex items-center gap-1 opacity-60"><span className="w-3 h-3 rounded-full border border-secondary" />Pain, skin: need notes linked to a body area (pending)</span>
          </div>
        </Card>

        <div className="flex flex-col gap-space-md">
          <Card>
            <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm" aria-live="polite">{sel ? sel.label : 'Tap a body area'}</h2>
            {sel ? (inSel.length ? inSel.map((m) => <EntryRow key={m.item.entry.id} item={m.item} />) : <p className="text-secondary">Nothing recorded here.</p>)
              : <p className="text-secondary">Left and right are the patient’s own left and right. You can also pick from the list above.</p>}
          </Card>
          <Card>
            <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm flex items-center gap-2"><MedIllustration name="medication/syringe" size={28} />Recent injection sites</h2>
            {recentInjections.length ? (
              <ul className="flex flex-col gap-1" data-testid="recent-injections">
                {recentInjections.map((m) => {
                  const ma = m.item.child as MedAdmin;
                  return <li key={m.item.entry.id} className="font-body-md"><strong className="text-primary">{regionById(m.regionId)!.label}</strong> · {ma.drug_name} · {dateTimeLabel(m.item.entry.care_time)}</li>;
                })}
              </ul>
            ) : <p className="text-secondary">None recorded.</p>}
            <p className="font-body-sm text-secondary mt-space-sm">For reference only. Not a recommendation for the next site.</p>
          </Card>
          <Card>
            <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">All marked sites</h2>
            {marked.length === 0 && unmapped.length === 0 ? <p className="text-secondary">No sites recorded.</p> : (
              <ul className="flex flex-col gap-1">
                {marked.map((m) => {
                  const ma = m.item.child as MedAdmin;
                  return (
                    <li key={m.item.entry.id} className="flex flex-wrap items-center gap-x-2 font-body-md">
                      <Icon name={m.kind === 'iv' ? 'water_drop' : 'vaccines'} className="text-secondary text-[18px]" />
                      <button className="underline decoration-dotted text-primary whitespace-nowrap" onClick={() => choose(m.regionId)}>{regionById(m.regionId)!.label}</button>
                      <span className="text-on-surface-variant">· {ma.drug_name}{ma.dose_given != null ? ` ${formatDose(ma.dose_given)} ${ma.dose_given_unit ?? ''}` : ''} · {dateTimeLabel(m.item.entry.care_time)}</span>
                    </li>
                  );
                })}
                {unmapped.map((x) => <li key={x.entry.id} className="font-body-md text-on-surface-variant">Site not on the map: “{(x.child as MedAdmin).site}”</li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
