import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listPatientEntries } from '../../db/repos/entries';
import { useApp } from '../../state/app';
import { formatDose } from '../../lib/dose';
import { dateTimeLabel } from '../../lib/time';
import { Breadcrumbs, Card, Icon } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { EntryRow } from '../entries/entryView';
import { BodyFigure, type FigureMarker } from './BodyFigure';
import { administrationCountLabel, medicationSites } from './medicationSites';
import { REGIONS, regionById, type View } from './regions';

type ViewChoice = View | 'both';

export function BodyMapPage() {
  const { patient } = useCurrentPatient();
  const { db } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ViewChoice>(() => (typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'both' : 'front'));
  const snapshot = useLiveQuery(async () => ({
    patientId: patient.id, records: await listPatientEntries(db, patient.id),
  }), [db, patient.id]);
  const records = snapshot?.patientId === patient.id ? snapshot.records : undefined;
  const { marked, unmapped, administrations } = useMemo(
    () => medicationSites(patient.id, records ?? []), [patient.id, records],
  );
  const figureMarkers: FigureMarker[] = marked.map((m) => ({ regionId: m.regionId, kind: m.kind, key: m.item.entry.id }));
  const recentInjections = marked.filter((m) => m.kind === 'injection' && m.medication.event === 'administered').slice(0, 3);
  const sel = selected ? regionById(selected) : undefined;
  const inSel = sel ? administrations.get(sel.id) : undefined;
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
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-space-md">
          <div className="flex items-center bg-surface-container-low rounded-lg p-0.5 border border-card-border" role="group" aria-label="Which view">
            {(['front', 'back', 'both'] as const).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}
                className={`min-h-10 px-4 rounded font-body-md ${view === v ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant'}`}>
                {v === 'front' ? 'Front' : v === 'back' ? 'Back' : 'Both'}
              </button>
            ))}
          </div>
          <label className="flex w-full min-w-0 max-w-full flex-col items-start gap-2 font-body-md sm:w-auto sm:flex-row sm:items-center">
            <span className="shrink-0 text-secondary">Body area</span>
            <select value={selected ?? ''} onChange={(e) => e.target.value && choose(e.target.value)} className="w-full min-h-11 min-w-0 rounded-lg border border-card-border bg-surface-container-lowest px-2 text-sm sm:w-auto sm:text-base" aria-label="Choose body area from a list">
              <option value="">Choose…</option>
              {REGIONS.map((r) => {
                const n = administrations.get(r.id)?.records.length ?? 0;
                return <option key={r.id} value={r.id}>{r.label}{n ? ` — ${administrationCountLabel(n)}` : ''}</option>;
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
                <BodyFigure view={v} markers={figureMarkers} administrations={administrations} selected={selected} onSelect={choose} titleId={`bm-${v}`} />
              </figure>
            ))}
          </div>
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-space-sm font-body-sm text-on-surface-variant" aria-label="Body map legend">
            <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-admin" />Documented administration site</li>
            <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-injection" />Injection marker</li>
            <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-iv" />IV marker</li>
            <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-selected" />Selected body area</li>
            <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-empty" />No recorded administration at this site</li>
          </ul>
        </Card>

        <div className="flex flex-col gap-space-md">
          <Card aria-label="Selected body area details">
            <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">{sel ? sel.label : 'Tap a body area'}</h2>
            <p className="text-secondary" role="status">
              {!sel ? 'Left and right are the patient’s own left and right. You can also pick from the list above.'
                : !records ? 'Loading documented administrations…'
                  : inSel ? administrationCountLabel(inSel.records.length)
                  : 'No confirmed medication administrations are recorded at this body area.'}
            </p>
            {inSel && (
              <ul className="divide-y divide-card-border">
                {inSel.records.map(({ item, medication }) => (
                  <li key={item.entry.id} className="pb-2">
                    <EntryRow item={item} wrapSummary />
                    <p className="px-space-sm font-body-sm text-secondary">
                      {[medication.route, dateTimeLabel(item.entry.care_time), item.entry.supersedes_id ? 'Corrected version' : null].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm flex items-center gap-2"><MedIllustration name="medication/syringe" size={28} />Recent injection sites</h2>
            {recentInjections.length ? (
              <ul className="flex flex-col gap-1" data-testid="recent-injections">
                {recentInjections.map((m) => {
                  const ma = m.medication;
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
                  const ma = m.medication;
                  return (
                    <li key={m.item.entry.id} className="flex flex-wrap items-center gap-x-2 font-body-md">
                      <Icon name={m.kind === 'iv' ? 'water_drop' : 'vaccines'} className="text-secondary text-[18px]" />
                      <button className="underline decoration-dotted text-primary whitespace-nowrap" onClick={() => choose(m.regionId)}>{regionById(m.regionId)!.label}</button>
                      <span className="text-on-surface-variant">· {ma.drug_name}{ma.dose_given != null ? ` ${formatDose(ma.dose_given)} ${ma.dose_given_unit ?? ''}` : ''} · {dateTimeLabel(m.item.entry.care_time)}</span>
                    </li>
                  );
                })}
                {unmapped.map(({ item, site }) => <li key={item.entry.id} className="font-body-md text-on-surface-variant">Unmapped documented site: “{site}”</li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
