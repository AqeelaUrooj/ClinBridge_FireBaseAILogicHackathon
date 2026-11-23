import { useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { listPatientEntries } from '../../db/repos/entries';
import type { Note } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { formatDose } from '../../lib/dose';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { Badge, Button, ButtonLink, Card, Icon } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { useCurrentPatient } from '../patient/PatientLayout';
import { PatientTabs } from '../patient/PatientTabs';
import { fullName } from '../patient/patientData';
import { EntryRow } from '../entries/entryView';
import { latestMeasures } from '../ward/wardData';
import { BodyFigure, type FigureMarker } from './BodyFigure';
import { administrationCountLabel, medicationSites, showLayers, type Layer } from './medicationSites';
import { REGIONS, regionById, type View } from './regions';

/**
 * Body map, after the Stitch "Interactive Patient Body Map" screen: figure with view and layer switches, selected area,
 * IV lines, skin and risk notes, paper photos. Sites come only from medicine records. Not shown, because nothing
 * approved or recorded is behind it: next-site advice, rotation protocol, line insertion and flush times, phlebitis
 * and Braden scores, skin and pain pins, site photos (P-03 is not approved).
 */
type ViewChoice = View | 'both';
const LAYERS: { id: Layer; label: string; dot: string; on: string }[] = [
  { id: 'injection', label: 'Injections', dot: 'bg-[#1C2536]', on: 'bg-primary-container text-on-primary border-primary-container' },
  { id: 'iv', label: 'IV lines', dot: 'bg-[#4A6078]', on: 'bg-secondary-fixed text-on-secondary-fixed border-[#4A6078]' },
];
const VIEWS: { id: ViewChoice; label: string; icon: string }[] = [{ id: 'front', label: 'Front', icon: 'person' }, { id: 'back', label: 'Back', icon: 'accessibility' }, { id: 'both', label: 'Both', icon: 'group' }];
const startView = (): ViewChoice => (typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'both' : 'front');
const kicker = 'font-label-uppercase text-[11px] leading-[14px] text-secondary font-bold uppercase';

function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 pb-space-sm mb-space-sm border-b border-card-border"><h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2">{children}</h2>{aside}</div>;
}

export function BodyMapPage() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, dataset } = useApp();
  const { user } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<ViewChoice>(startView);
  const [hidden, setHidden] = useState<Set<Layer>>(new Set());
  const snapshot = useLiveQuery(async () => ({
    patientId: patient.id, records: await listPatientEntries(db, patient.id), names: new Map((await db.practitioner.toArray()).map((p) => [p.id, `${p.name}, ${p.role}`])),
  }), [db, patient.id]);
  const records = snapshot?.patientId === patient.id ? snapshot.records : undefined;
  const { marked, unmapped, administrations } = useMemo(() => medicationSites(patient.id, records ?? []), [patient.id, records]);
  const shown = useMemo(() => showLayers({ marked, administrations }, hidden), [marked, administrations, hidden]);
  const figureMarkers: FigureMarker[] = shown.marked.map((m) => ({ regionId: m.regionId, kind: m.kind, key: m.item.entry.id }));
  const recentInjections = marked.filter((m) => m.kind === 'injection' && m.medication.event === 'administered').slice(0, 3);
  const lines = marked.filter((m) => m.kind === 'iv');
  const lineAreas = [...new Set(lines.map((m) => m.regionId))];
  const riskNotes = (records ?? []).filter((x) => x.entry.type === 'note' && x.entry.status === 'confirmed' && (x.child as Note | undefined)?.category === 'risk_score');
  const photos = [...marked, ...unmapped].filter((m) => m.item.entry.raw_input_kind === 'photo');
  const pain = records ? latestMeasures(records).pain : undefined;
  const sel = selected ? regionById(selected) : undefined;
  const inSel = sel ? administrations.get(sel.id) : undefined;
  const base = `/patients/${patient.id}`;
  const nurse = isNurse(user);
  const who = (id: string) => snapshot?.names.get(id) ?? id;
  const count = (l: Layer) => marked.filter((m) => m.kind === l).length;
  const hiddenNames = LAYERS.filter((l) => hidden.has(l.id)).map((l) => l.label);
  const last = marked[0];

  function choose(id: string) {
    setSelected(id);
    const r = regionById(id);
    if (r && view !== 'both' && !r.zones[view]) setView(r.primary);
  }
  const toggle = (l: Layer) => setHidden((h) => { const n = new Set(h); if (n.has(l)) n.delete(l); else n.add(l); return n; });
  const reset = () => { setSelected(null); setView(startView()); setHidden(new Set()); };
  const changed = selected != null || hidden.size > 0 || view !== startView();

  return (
    <>
      <div className="print:hidden"><PatientTabs patientId={patient.id} /></div>
      {/* On paper this is a table whose header row repeats, so the patient identifiers are on every printed page. */}
      <div className="contents print:table print:w-full">
        <div className="hidden print:table-header-group break-inside-avoid">
          <div className="print:table-row"><div className="print:table-cell border-b border-black pb-1 text-[10pt]" data-print-header="">
            <strong>{fullName(patient)}</strong> · Born {dayLabel(patient.birth_date)} · MRN {patient.mrn}{encounter?.bed ? ` · Bed ${encounter.bed}` : ''} · Body map{dataset === 'practice' ? ' · Fake practice data, not a clinical record' : ''}
          </div></div>
        </div>
        <div className="contents print:table-row-group"><div className="contents print:table-row"><div className="contents print:table-cell">
      <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary">Body map</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">{marked.length + unmapped.length} site record{marked.length + unmapped.length === 1 ? '' : 's'} from medicines{last ? <> · newest {dateTimeLabel(last.item.entry.care_time)} by {who(last.item.entry.performer_id)}</> : null}</p>
        </div>
        <div className="flex flex-wrap gap-space-sm print:hidden">
          <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print this map</Button>
          <ButtonLink variant="secondary" to={`${base}/handoff`}><Icon name="assignment" />Handover</ButtonLink>
        </div>
      </div>

      {/* Small screens: figure, then the selected area, then photos. Wide screens: photos sit under the figure. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] xl:grid-rows-[auto_1fr] gap-space-md items-start print:block">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <Card className="shadow-sm" aria-label="Figure">
            <div className="flex flex-wrap items-center justify-between gap-space-sm print:hidden">
              <div className="flex items-center bg-surface-container-low rounded-lg p-0.5 border border-card-border" role="group" aria-label="Which view">
                {VIEWS.map((v) => (
                  <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}
                    className={`min-h-10 px-3 rounded font-body-md text-body-md font-semibold inline-flex items-center gap-1.5 ${view === v.id ? 'bg-primary-container text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container'}`}>
                    <Icon name={v.icon} className="hidden sm:inline text-[17px]" />{v.label}
                  </button>
                ))}
              </div>
              <label className="flex w-full min-w-0 max-w-full flex-col items-start gap-1 font-body-md sm:w-auto sm:flex-row sm:items-center sm:gap-2">
                <span className="shrink-0 font-body-sm text-body-sm text-secondary">Body area</span>
                <select value={selected ?? ''} onChange={(e) => (e.target.value ? choose(e.target.value) : setSelected(null))} className="w-full min-h-11 min-w-0 rounded-lg border border-card-border bg-surface-container-lowest px-2 text-sm sm:w-[230px]" aria-label="Choose body area from a list">
                  <option value="">Choose…</option>
                  {REGIONS.map((r) => {
                    const n = administrations.get(r.id)?.records.length ?? 0;
                    return <option key={r.id} value={r.id}>{r.label}{n ? ` — ${administrationCountLabel(n)}` : ''}</option>;
                  })}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 py-space-sm print:hidden" role="group" aria-label="Layers on the figure">
              <span className={kicker}>Layers:</span>
              {LAYERS.map((l) => (
                <button key={l.id} type="button" aria-pressed={!hidden.has(l.id)} onClick={() => toggle(l.id)}
                  className={`min-h-9 px-3 rounded-full border font-body-sm text-body-sm font-semibold inline-flex items-center gap-1.5 ${hidden.has(l.id) ? 'bg-surface-container-lowest text-on-surface-variant border-card-border line-through' : l.on}`}>
                  <span aria-hidden className={`w-2 h-2 rounded-full ring-1 ring-white ${l.dot}`} />{l.label} ({count(l.id)})
                </button>
              ))}
              <span className="font-body-sm text-[12px] text-secondary">Skin and pain layers are not available: only medicine records keep a body site.</span>
            </div>
            {hiddenNames.length > 0 && <p role="status" className="rounded-lg bg-downtime-amber-bg border border-downtime-amber-border px-space-sm py-2 mb-space-sm font-body-sm text-body-sm text-[#6b4a0e]"><strong>Hidden on the figure: {hiddenNames.join(' and ')}.</strong> The records are still listed beside it.</p>}

            <div className="rounded-lg border border-[#E8DFCF] p-space-sm bg-[#FBF8F2]" style={{ backgroundImage: 'radial-gradient(#E9E0D0 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
              <div className={`grid gap-space-md ${view === 'both' ? 'grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))]' : 'grid-cols-1'} max-w-[720px] mx-auto`}>
                {(view === 'both' ? (['front', 'back'] as const) : [view]).map((v) => (
                  <figure key={v} className="flex flex-col items-center gap-1 w-full max-w-[340px] mx-auto">
                    <figcaption id={`bm-${v}`} className="font-label-uppercase text-label-uppercase text-secondary uppercase">{v === 'front' ? 'Front' : 'Back'}</figcaption>
                    <BodyFigure view={v} markers={figureMarkers} administrations={shown.administrations} selected={selected} onSelect={choose} titleId={`bm-${v}`}
                      emptyText={hidden.size ? 'No shown administration at this site. A layer is hidden' : undefined} />
                  </figure>
                ))}
              </div>
              <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-space-sm rounded-lg bg-surface-container-lowest/90 border border-[#E8DFCF] px-space-sm py-2 font-body-sm text-body-sm text-on-surface-variant [print-color-adjust:exact]" aria-label="Body map legend">
                <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-admin" />Documented administration site</li>
                <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-injection" />Injection marker</li>
                <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-iv" />IV marker</li>
                <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-selected" />Selected body area</li>
                <li className="flex items-center gap-1"><span aria-hidden="true" className="bm-key bm-key-empty" />{hidden.size ? 'No shown administration at this site' : 'No recorded administration at this site'}</li>
              </ul>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-space-sm">
              <span className="flex-1 min-w-[200px] font-body-sm text-body-sm text-on-surface-variant">Left and right are the patient’s own left and right.</span>
              <Button variant="secondary" className="print:hidden" onClick={reset} disabled={!changed}><Icon name="rotate_right" />Reset view</Button>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-space-md min-w-0 xl:col-start-2 xl:row-start-1 xl:row-span-2 print:mt-4">
          <Card aria-label="Selected body area details" className={`shadow-sm border-l-4 !border-l-primary ${sel ? '' : 'print:hidden'}`}>
            <span className={kicker}>Selected body area</span>
            <div className="flex flex-wrap items-start justify-between gap-2 pb-space-sm mb-space-sm border-b border-card-border">
              <h2 className="font-headline-md text-headline-md text-primary">{sel ? sel.label : 'Tap a body area'}</h2>
              {inSel && <Badge tone="navy">{inSel.records.length} on record</Badge>}
            </div>
            <p className="font-body-md text-body-md text-secondary" role="status">
              {!sel ? 'You can also pick an area from the list above the figure.'
                : !records ? 'Loading documented administrations…'
                  : inSel ? administrationCountLabel(inSel.records.length)
                  : 'No confirmed medication administrations are recorded at this body area.'}
            </p>
            {inSel && (
              <ul className="divide-y divide-card-border">
                {inSel.records.map(({ item, medication }) => (
                  <li key={item.entry.id} className="pb-2">
                    <EntryRow item={item} wrapSummary />
                    <p className="px-space-sm font-body-sm text-body-sm text-secondary">
                      {[medication.route, dateTimeLabel(item.entry.care_time), who(item.entry.performer_id), item.entry.supersedes_id ? 'Corrected version' : null].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-lg bg-surface-container-low p-space-sm mt-space-sm">
              <h3 className={`${kicker} flex items-center gap-2`}><MedIllustration name="medication/syringe" size={22} />Recent injection sites</h3>
              {recentInjections.length ? (
                <ul className="flex flex-col gap-1 mt-1" data-testid="recent-injections">
                  {recentInjections.map((m) => (
                    <li key={m.item.entry.id} className="font-body-sm text-body-sm"><strong className="text-primary">{regionById(m.regionId)!.label}</strong> · {m.medication.drug_name} · {dateTimeLabel(m.item.entry.care_time)}</li>
                  ))}
                </ul>
              ) : <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">None recorded.</p>}
              <p className="font-body-sm text-[12px] text-secondary mt-1">For reference only. Not a recommendation for the next site.</p>
            </div>
          </Card>

          <Card aria-label="All marked sites" className="shadow-sm">
            <PanelTitle><Icon name="pin_drop" className="text-[20px] text-secondary" />All marked sites</PanelTitle>
            {marked.length === 0 && unmapped.length === 0 ? <p className="font-body-sm text-body-sm text-secondary">No sites recorded.</p> : (
              <ul className="flex flex-col gap-1.5">
                {marked.map((m) => (
                  <li key={m.item.entry.id} className="break-inside-avoid">
                    <button type="button" aria-pressed={selected === m.regionId} onClick={() => choose(m.regionId)} className={`w-full text-left min-h-11 rounded-lg px-space-sm py-2 flex items-start gap-2 hover:ring-1 hover:ring-secondary ${selected === m.regionId ? 'bg-secondary-fixed' : 'bg-surface-container-low'}`}>
                      <Icon name={m.kind === 'iv' ? 'water_drop' : 'vaccines'} className="text-secondary text-[18px]" />
                      <span className="min-w-0"><span className="block font-body-md text-body-md font-semibold text-primary">{regionById(m.regionId)!.label}</span>
                        <span className="block font-body-sm text-body-sm text-on-surface-variant">{m.medication.drug_name}{m.medication.dose_given != null ? ` ${formatDose(m.medication.dose_given)} ${m.medication.dose_given_unit ?? ''}` : ''} · {dateTimeLabel(m.item.entry.care_time)}</span></span>
                    </button>
                  </li>
                ))}
                {unmapped.map(({ item, site }) => <li key={item.entry.id} className="rounded-lg bg-surface-container-low px-space-sm py-2 font-body-sm text-body-sm text-on-surface-variant">Unmapped documented site: “{site}”</li>)}
              </ul>
            )}
          </Card>

          <Card aria-label="IV lines on record" className="shadow-sm">
            <PanelTitle aside={<Badge>{lineAreas.length} area{lineAreas.length === 1 ? '' : 's'}</Badge>}><Icon name="line_weight" className="text-[20px] text-secondary" />IV lines on record</PanelTitle>
            {lineAreas.length === 0 ? <p className="font-body-sm text-body-sm text-secondary">No IV line is named on a medicine record.</p> : (
              <ul className="flex flex-col gap-1.5">
                {lineAreas.map((id) => {
                  const here = lines.filter((m) => m.regionId === id), m = here[0]!;
                  return (
                    <li key={id} className="rounded-lg bg-surface-container-low p-space-sm">
                      <span className="flex items-center gap-2 font-body-md text-body-md font-semibold text-primary"><span aria-hidden className="w-2.5 h-2.5 rounded-full bg-[#4A6078]" />{m.site}</span>
                      <span className="block font-body-sm text-body-sm text-on-surface-variant">Newest record: {m.medication.drug_name}, {dateTimeLabel(m.item.entry.care_time)} by {who(m.item.entry.performer_id)} · {here.length} record{here.length === 1 ? '' : 's'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="font-body-sm text-[12px] text-secondary mt-space-sm">Insertion time, size, dressing and flushes are not recorded here.{nurse && <> <Link to={`${base}/notes/new`} className="underline font-semibold">Write a site check in a note</Link>.</>}</p>
          </Card>

          <Card aria-label="Skin, risk and pain records" className="shadow-sm">
            <PanelTitle aside={<Badge>No score calculated</Badge>}><Icon name="shield" className="text-[20px] text-secondary" />Skin, risk and pain records</PanelTitle>
            <ul className="flex flex-col gap-1.5">
              {riskNotes.slice(0, 3).map((x) => {
                const n = x.child as Note;
                return (
                  <li key={x.entry.id}><Link to={`/entries/${x.entry.id}`} className="block rounded-lg bg-surface-container-low p-space-sm hover:ring-1 hover:ring-secondary">
                    <span className="block font-body-md text-body-md font-semibold text-primary">{n.score_name ? `${n.score_name}${n.score_value != null ? ` ${n.score_value}` : ''}` : 'Risk note'} · {hm(x.entry.care_time)}</span>
                    <span className="block font-body-sm text-body-sm text-on-surface-variant">{n.text}</span>
                  </Link></li>
                );
              })}
              {riskNotes.length === 0 && <li className="font-body-sm text-body-sm text-secondary">No risk notes.</li>}
              <li className="rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm text-on-surface-variant">{pain ? <><strong className="text-primary">Pain {pain.value}</strong> at {hm(pain.time)}. The vitals record does not say where.</> : 'No pain value recorded.'}</li>
            </ul>
          </Card>

          {nurse && (
            <section aria-label="Record at a body area" className="rounded-xl bg-primary-container text-on-primary p-space-md shadow-sm flex flex-col gap-space-sm print:hidden">
              <h2 className="font-headline-sm text-headline-sm flex items-center gap-2"><Icon name="add_location_alt" className="text-[20px]" />Record at a body area</h2>
              <p className="font-body-sm text-body-sm text-primary-fixed">A site is saved with a medicine: open the order and choose the site on its form. Skin, pain and line pins cannot be saved yet (proposal P-03 is not approved).</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Link to={`${base}/meds`} className="min-h-11 rounded-lg bg-surface-container-lowest text-primary font-body-md text-body-md font-semibold inline-flex items-center justify-center gap-2"><Icon name="medication" />Open medicines</Link>
                <Link to={`${base}/notes/new`} className="min-h-11 rounded-lg bg-primary text-on-primary font-body-md text-body-md font-semibold inline-flex items-center justify-center gap-2"><Icon name="edit_note" />Write a note</Link>
              </div>
            </section>
          )}
        </div>

        <div className="min-w-0 xl:col-start-1 xl:row-start-2">
          <Card className="shadow-sm print:hidden" aria-label="Paper photos for these sites">
            <PanelTitle aside={nurse ? <ButtonLink variant="secondary" to={`${base}/capture`}><Icon name="add_a_photo" />Photo of paper</ButtonLink> : undefined}><Icon name="photo_camera" className="text-[20px] text-secondary" />Paper photos for these sites</PanelTitle>
            {photos.length ? photos.map((m) => (
              <Link key={m.item.entry.id} to={`/entries/${m.item.entry.id}`} className="flex items-center gap-space-sm min-h-[60px] rounded-lg px-space-sm py-2 bg-surface-container-low hover:ring-1 hover:ring-secondary mb-1.5">
                <MedIllustration name="workflows/paper-photo" size={40} />
                <span className="min-w-0"><span className="block font-body-md text-body-md font-semibold text-primary">{m.medication.drug_name} · {m.site}</span><span className="block font-body-sm text-body-sm text-on-surface-variant">Medicine sheet, {dateTimeLabel(m.item.entry.care_time)} · {who(m.item.entry.performer_id)}</span></span>
                <Icon name="chevron_right" className="ml-auto text-outline" />
              </Link>
            )) : <p className="font-body-sm text-body-sm text-on-surface-variant">No site on this map came from a paper photo.</p>}
            <p className="font-body-sm text-[12px] text-secondary mt-space-sm">Photos are of paper sheets. Photos of the patient’s skin or lines are not kept in ClinBridge.</p>
          </Card>
        </div>
      </div>
      <p className="hidden print:block font-body-sm text-body-sm">Printed by {user?.name} · {dateTimeLabel(clock.nowIso())}</p>
        </div></div></div>
      </div>
    </>
  );
}
