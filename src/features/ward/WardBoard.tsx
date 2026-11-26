import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { isNurse, useApp, useSession } from '../../state/app';
import { ageOn, hm } from '../../lib/time';
import { ButtonLink, Icon } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { VerifyPatientDialog } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { allergyState, idLabel, isActiveStay, isLocallyRegistered, isProvisional, mayDo, needsReconciliation } from '../../lib/admission';
import { OriginBadges } from '../admission/AdmissionPages';
import { Badge } from '../../components/ui';
import { orderArt } from '../meds/MedsPages';
import { doseLine, loadWardFacts, sortWard, type Measure, type PatientFacts, type WardSort } from './wardData';

/**
 * Ward board, after the Stitch "Ward Board / My Patients (minimal, expandable cards)" screen: ward header with
 * search, filters, sort and expand all; four summary tiles; two columns of expandable patient cards; footer bar.
 * Everything shown is read from the saved records (wardData.ts). Not shown, because nothing approved or real is
 * behind it: NEWS2, acuity, shift times, "bedside verified", printer status. Opening any patient page still goes
 * through the patient check.
 */
type Filter = 'all' | 'due' | 'critical' | 'drafts' | 'local' | 'provisional' | 'pending' | 'discharged';
// "All" is every patient with an active stay; discharged patients are only under their own filter (read only).
const FILTER_LABEL: Record<Filter, string> = { all: 'All', due: 'Due meds', critical: 'Critical lab', drafts: 'Drafts', local: 'Registered here', provisional: 'Provisional', pending: 'Pending reconciliation', discharged: 'Discharged' };

const matches = (r: PatientFacts, f: Filter) => {
  if (f === 'discharged') return !isActiveStay(r.encounter);
  if (!isActiveStay(r.encounter)) return false;
  return f === 'all' || (f === 'due' ? r.due.length > 0 : f === 'critical' ? !!r.critical : f === 'drafts' ? r.drafts.length > 0
    : f === 'local' ? isLocallyRegistered(r.patient) : f === 'provisional' ? isProvisional(r.patient) : needsReconciliation(r.patient));
};
/** Extra filters appear only when there is something to show, so the board stays as it was for the patient list alone. */
const OPTIONAL: Filter[] = ['local', 'provisional', 'pending', 'discharged'];
const sexLetter = (s: string) => (s === 'male' ? 'M' : s === 'female' ? 'F' : '');

function Tile({ m, className = '' }: { m: Measure; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="font-label-uppercase text-[10px] leading-[13px] text-secondary block uppercase break-words">{m.label}</span>
      <span className={`font-code-tabular text-body-md font-bold block ${m.tone === 'red' ? 'text-error' : 'text-primary'}`}>
        {m.value}{m.unit && <span className="text-[10px] font-normal text-secondary"> {m.unit}</span>}
      </span>
      {m.time && <span className="font-code-tabular text-[10px] leading-[12px] text-secondary block">{hm(m.time)}</span>}
    </div>
  );
}

function StatTile({ label, value, note, icon, tone = 'plain', testId }: { label: string; value: number | string; note?: string; icon: string; tone?: 'plain' | 'blue' | 'red'; testId: string }) {
  const red = tone === 'red';
  return (
    <div data-testid={testId} className={`rounded-xl py-space-sm px-space-md flex items-center justify-between gap-2 shadow-sm border ${red ? 'bg-error-container border-error/30' : 'bg-surface-container-lowest border-outline-variant/30'}`}>
      <div className="min-w-0">
        <span className={`font-label-uppercase text-label-uppercase block uppercase ${red ? 'text-on-error-container' : 'text-secondary'}`}>{label}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={`font-vital-display text-vital-display leading-none ${red ? 'text-error' : 'text-primary'}`}>{value}</span>
          {note && <span className={`font-code-tabular text-[11px] font-semibold ${red ? 'text-on-error-container' : 'text-secondary'}`}>{note}</span>}
        </span>
      </div>
      <span className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${red ? 'bg-on-error-container text-error-container' : tone === 'blue' ? 'bg-secondary-container text-primary' : 'bg-surface-container-low text-primary'}`}>
        <Icon name={icon} className="text-[20px]" />
      </span>
    </div>
  );
}

const SMALL = 'min-h-9 px-2.5 rounded text-body-sm flex items-center gap-1 transition-colors';

function PatientCard({ r, open, nowIso, names, nurse, onToggle, onOpen }: {
  r: PatientFacts; open: boolean; nowIso: string; names: Map<string, string>; nurse: boolean; onToggle: () => void; onOpen: (path: string) => void;
}) {
  const { patient: p, encounter: e } = r;
  const base = `/patients/${p.id}`;
  const crit = r.critical;
  const al = allergyState(p, r.allergies);
  const real = al.real;
  const next = r.due[0];
  const differs = r.given.filter((g) => g.differsFromOrder);
  const art = next ? orderArt(next.order) : null;
  const bodyId = `ward-${p.id}`;
  const edge = crit ? 'border-error/30' : 'border-outline-variant/30';
  const row = `flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-body-sm px-2.5 py-1.5 rounded border`;
  return (
    <article aria-label={`Bed ${e?.bed ?? '?'}, ${fullName(p)}`} data-testid={`ward-card-${p.id}`}
      className={`bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col border border-outline-variant/40 hover:border-outline-variant ${crit ? 'border-l-4 border-l-error' : ''}`}>
      <div className="p-space-md cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2 pb-2">
          <div className="flex items-center gap-space-sm min-w-0">
            <span className={`w-9 h-9 rounded grid place-items-center font-code-tabular text-[13px] font-bold shrink-0 ${crit ? 'bg-error text-on-error' : 'bg-primary-container text-on-primary'}`}>
              <span className="sr-only">Bed </span>{e?.bed ?? '—'}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2">
                <button type="button" data-testid={`patient-${p.id}`} onClick={(ev) => { ev.stopPropagation(); onOpen(base); }}
                  className="font-headline-sm text-headline-sm text-primary font-bold hover:underline flex items-center gap-1 min-h-7 text-left">
                  {fullName(p)}<Icon name="open_in_new" className="text-[15px]" />
                </button>
                <span className="font-body-sm text-body-sm text-secondary">{ageOn(p.birth_date, nowIso)}{sexLetter(p.sex)}</span>
                {e?.code_status && <span className="px-1.5 py-0.5 rounded bg-surface-container font-code-tabular text-[10px] text-on-surface-variant font-bold uppercase">{e.code_status}</span>}
              </div>
              <p className="font-code-tabular text-code-tabular text-secondary flex flex-wrap gap-x-1.5"><span className="whitespace-nowrap">{idLabel(p)}: {p.mrn}</span>{e?.attending && <span>• {e.attending}</span>}</p>
              {(isLocallyRegistered(p) || !isActiveStay(e)) && <div className="mt-1"><OriginBadges p={p} e={e} /></div>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 max-w-[45%]">
            {real.length > 0 ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-error-container text-on-error-container font-label-uppercase text-[10px] font-bold text-right">
                <Icon name="warning" className="text-[13px]" /><span className="sr-only">Allergy: </span>{real.map((a) => a.substance).join(', ')}
              </span>
            ) : (
              <span className={`px-2 py-0.5 rounded font-label-uppercase text-[10px] font-bold ${al.tone === 'amber' ? 'bg-downtime-amber-bg text-[#7a5410] border border-downtime-amber-border' : 'bg-surface-container text-secondary'}`}>{al.text}</span>
            )}
            {crit && <span className="px-2 py-0.5 rounded bg-error text-on-error font-code-tabular text-[11px] font-bold">Critical lab</span>}
            {e?.isolation && <span className="px-2 py-0.5 rounded bg-downtime-amber-bg text-[#7a5410] border border-downtime-amber-border font-label-uppercase text-[10px] font-bold uppercase">{e.isolation} isolation</span>}
            {r.drafts.length > 0 && <span className="px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-code-tabular text-[10px] font-bold">{r.drafts.length} to check</span>}
          </div>
        </div>

        <div className={`grid grid-cols-4 gap-1.5 py-1.5 px-2.5 rounded border text-center ${crit ? 'bg-error-container/20 border-error/30' : 'bg-surface-container-low border-outline-variant/20'}`}>
          {r.tiles.length ? r.tiles.map((m, i) => <Tile key={m.label} m={m} className={i === 0 ? 'text-left pl-1' : i === 3 ? 'text-right pr-1' : ''} />)
            : <span className="col-span-4 text-left font-body-sm text-body-sm text-secondary py-1.5">No confirmed observations yet</span>}
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {crit ? (
              <><Icon name="notification_important" className="text-error text-[16px] shrink-0" /><span className="text-body-sm font-bold text-error">Critical lab: {crit.test} {crit.value}</span></>
            ) : differs.length ? (
              <><Icon name="warning" className="text-[#7a5410] text-[16px] shrink-0" /><span className="text-body-sm font-bold text-[#7a5410]">{differs[0]!.drug}: {differs[0]!.differsFromOrder}</span></>
            ) : next ? (
              <>
                {art ? <MedIllustration name={art} size={18} /> : <Icon name="schedule" className="text-secondary text-[16px] shrink-0" />}
                <span className="text-body-sm font-medium text-primary">{doseLine(next.order)}</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-code-tabular text-[10px] font-bold shrink-0">DUE {hm(next.time)}</span>
              </>
            ) : (
              <><Icon name="check" className="text-secondary text-[16px] shrink-0" /><span className="text-body-sm text-secondary">No unrecorded scheduled doses today</span></>
            )}
          </div>
          <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={(ev) => { ev.stopPropagation(); onToggle(); }}
            aria-label={`${open ? 'Show less' : 'Show details'} for ${fullName(p)}`}
            className="flex items-center gap-1 min-h-9 text-secondary hover:text-primary font-body-sm text-[12px] font-medium shrink-0 pl-2">
            <span className="hidden sm:inline">{open ? 'Show less' : 'Show details'}</span>
            <Icon name="expand_more" className={`text-[18px] transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div id={bodyId} className={`border-t p-space-md flex flex-col gap-space-md ${crit ? 'border-error/30 bg-error-container/10' : 'border-outline-variant/30 bg-surface-container-low/40'}`}>
          {crit && (
            <div className="bg-error-container text-on-error-container p-2.5 rounded flex items-start gap-2 border border-error/20 font-body-sm text-body-sm" role="note">
              <Icon name="notification_important" className="text-error text-[18px] shrink-0 mt-0.5" />
              <span><strong>CRITICAL LAB{crit.resultTime ? ` (${hm(crit.resultTime)})` : ''}:</strong> {crit.test} {crit.value}. {crit.calledTo ? `${crit.calledTo}. ` : 'Nobody recorded as told yet. '}Read-back {crit.readBack ? 'recorded' : 'not recorded'}.</span>
            </div>
          )}
          {r.more.length > 0 && (
            <div>
              <span className="font-label-uppercase text-[10px] text-secondary block mb-1 uppercase">Other latest observations</span>
              <div className={`grid grid-cols-3 gap-2 bg-surface-container-lowest p-2.5 rounded border text-center ${edge}`}>{r.more.slice(0, 6).map((m) => <Tile key={m.label} m={m} />)}</div>
            </div>
          )}
          {(r.due.length > 0 || r.given.length > 0) && (
            <div>
              <span className="font-label-uppercase text-[10px] text-secondary block mb-1 uppercase">Scheduled and recent medicines</span>
              <div className="flex flex-col gap-1.5">
                {r.due.map((d) => (
                  <div key={`${d.order.id}-${d.time}`} className={`${row} bg-surface-container-lowest border-outline-variant/30`}>
                    <span className="text-primary font-medium flex items-center gap-1">{doseLine(d.order)}{d.highAlert && <span className="px-1.5 rounded bg-error-container text-on-error-container font-label-uppercase text-[10px] font-bold">HIGH-ALERT</span>}</span>
                    <span className="px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-code-tabular text-[10px] font-bold">DUE {hm(d.time)}</span>
                  </div>
                ))}
                {r.given.slice(0, 4).map((g) => (
                  <div key={g.entryId} className={`${row} ${g.differsFromOrder ? 'bg-downtime-amber-bg border-downtime-amber-border' : 'bg-surface-container-lowest border-outline-variant/30'}`}>
                    <span className="text-on-surface-variant">{g.drug} {g.dose}{g.differsFromOrder && <strong className="block text-[#7a5410]">{g.differsFromOrder}</strong>}</span>
                    <span className="font-code-tabular text-[11px] text-secondary">{g.event === 'rate_changed' ? 'Rate changed' : 'Given'} {hm(g.time)} ({names.get(g.performerId) ?? g.performerId})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {r.holds.length > 0 && (
            <div>
              <span className="font-label-uppercase text-[10px] text-secondary block mb-1 uppercase">Held or refused today</span>
              <div className="flex flex-col gap-1.5">{r.holds.map((h) => (
                <div key={h.entryId} className={`${row} bg-error-container/30 border-error/20`}>
                  <span className="text-error font-bold flex items-center gap-1.5"><Icon name="pause_circle" className="text-[15px]" />{h.event === 'held' ? 'Held' : 'Refused'}: {h.drug}</span>
                  <span className="font-code-tabular text-[11px] text-on-error-container">{hm(h.time)}{h.reason ? ` · ${h.reason}` : ''}</span>
                </div>
              ))}</div>
            </div>
          )}
          {(r.careOrders.length > 0 || e?.diet) && (
            <div className="p-2.5 bg-surface-container-lowest rounded border border-outline-variant/30 font-body-sm text-body-sm text-on-surface-variant">
              <span className="font-label-uppercase text-[10px] text-primary font-bold block mb-0.5 uppercase">Care orders (patient list)</span>
              {[...r.careOrders.map((o) => o.text), ...(e?.diet ? [`Diet: ${e.diet}`] : [])].join(' · ')}
            </div>
          )}
          <div className="pt-1 flex items-center justify-between gap-1 flex-wrap">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => onOpen(base)} className={`${SMALL} bg-primary text-on-primary hover:bg-primary-container font-semibold`}><Icon name="visibility" className="text-[14px]" />Open record</button>
              {crit && <button type="button" onClick={() => onOpen(`${base}/labs`)} className={`${SMALL} bg-error text-on-error font-semibold`}><Icon name="biotech" className="text-[14px]" />Labs</button>}
              <button type="button" onClick={() => onOpen(`${base}/vitals`)} className={`${SMALL} bg-surface-container-high hover:bg-surface-variant text-primary font-medium border border-outline-variant/30`}><Icon name="ecg_heart" className="text-[14px]" />Vitals</button>
              {nurse && <button type="button" onClick={() => onOpen(`${base}/meds`)} className={`${SMALL} bg-secondary-container hover:bg-secondary-fixed text-on-secondary-container font-semibold`}><Icon name="medication" className="text-[14px]" />Give med</button>}
              {nurse && r.drafts[0] && <button type="button" onClick={() => onOpen(`/capture/${r.drafts[0]!.id}/confirm`)} className={`${SMALL} bg-surface-container-lowest hover:bg-surface-container-low text-secondary border border-outline-variant/30`}><Icon name="receipt_long" className="text-[15px]" />Check draft</button>}
              <button type="button" onClick={() => onOpen(`${base}/body`)} aria-label="Body map" className={`${SMALL} bg-surface-container-lowest hover:bg-surface-container-low text-secondary border border-outline-variant/30`}><Icon name="accessibility_new" className="text-[15px]" /></button>
            </div>
            <button type="button" onClick={onToggle} className="min-h-9 text-secondary hover:text-primary text-[12px] font-semibold flex items-center gap-0.5">Show less<Icon name="expand_less" className="text-[16px]" /></button>
          </div>
        </div>
      )}
    </article>
  );
}

function useStorageUsed(): string | null {
  const [used, setUsed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void navigator.storage?.estimate?.().then((s) => { if (live && s.usage != null) setUsed(`${(s.usage / 1_048_576).toFixed(1)} MB`); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return used;
}

export function WardBoard() {
  const { db, clock, snapshot, phase, dataset } = useApp();
  const { user, verifyPatient } = useSession();
  const navigate = useNavigate();
  const [read, setRead] = useState(0);
  const data = useLiveQuery(async () => {
    const nowIso = clock.nowIso();
    const [rows, staff] = await Promise.all([loadWardFacts(db, nowIso), db.practitioner.toArray()]);
    return { rows, nowIso, names: new Map(staff.map((s) => [s.id, s.name])) };
  }, [db, clock, read]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<WardSort>('bed');
  // Until the nurse opens or closes a card, patients with a critical lab start expanded (as in the design).
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [pending, setPending] = useState<{ row: PatientFacts; path: string } | null>(null);
  const used = useStorageUsed();

  const all = data?.rows;
  const rows = all?.filter((r) => isActiveStay(r.encounter)); // census, tiles and counts: active stays only
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sortWard((all ?? []).filter((r) => matches(r, filter)
      && (!s || fullName(r.patient).toLowerCase().includes(s) || r.patient.mrn.toLowerCase().includes(s) || (r.encounter?.bed ?? '').toLowerCase().includes(s))), sort);
  }, [all, q, filter, sort]);

  const count = (f: Filter) => (all ?? []).filter((r) => matches(r, f)).length;
  const provisional = mayDo(user, 'register_provisional', phase);
  const dues = (rows ?? []).flatMap((r) => r.due);
  const nextDue = [...dues].map((d) => d.time).filter((t) => data && t >= data.nowIso).sort()[0];
  const crits = (rows ?? []).filter((r) => r.critical);
  const drafts = (rows ?? []).reduce((n, r) => n + r.drafts.length, 0);
  const open = chosen ?? new Set(crits.map((r) => r.patient.id));
  const allOpen = shown.length > 0 && shown.every((r) => open.has(r.patient.id));
  const toggle = (id: string) => { const n = new Set(open); if (n.has(id)) n.delete(id); else n.add(id); setChosen(n); };

  return (
    <div className="flex flex-col w-full">
      <section aria-label="Ward" className="w-full bg-surface-container-lowest rounded-xl p-space-md mb-space-md shadow-sm border border-outline-variant/40 flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded bg-primary-container grid place-items-center text-on-primary shrink-0"><Icon name="medical_services" className="text-[20px]" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-headline-sm text-headline-sm text-primary tracking-tight"><span className="sr-only">My patients: </span>{snapshot?.unit ?? 'Ward'}</h1>
              <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary font-code-tabular text-[11px] font-bold">{rows?.length ?? '…'} CENSUS</span>
              {snapshot && <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-uppercase text-label-uppercase">Patient list {hm(snapshot.taken_at)}</span>}
            </div>
            <p className="font-body-sm text-body-sm text-secondary">Ward census overview • saved on this laptop{data ? ` • read ${hm(data.nowIso)}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search by name, MRN or bed</span>
            <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bed, name, MRN…"
              className="w-full min-h-9 pl-8 pr-3 bg-surface-container-low text-on-surface font-body-md text-body-md rounded border border-transparent focus:bg-surface-container-lowest focus:border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
          <div role="group" aria-label="Filter" className="flex flex-wrap items-center bg-surface-container-low rounded p-0.5 border border-outline-variant/30">
            {(Object.keys(FILTER_LABEL) as Filter[]).filter((f) => !OPTIONAL.includes(f) || f === filter || count(f) > 0).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={`min-h-8 px-2.5 rounded font-body-sm text-body-sm whitespace-nowrap ${filter === f ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}>
                {FILTER_LABEL[f]} ({rows ? count(f) : '…'})
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 min-h-9 bg-surface-container-low px-2 rounded text-secondary border border-outline-variant/30">
            <Icon name="sort" className="text-[15px]" /><span className="font-label-uppercase text-label-uppercase uppercase">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as WardSort)} aria-label="Sort patients" className="bg-transparent font-code-tabular text-code-tabular font-semibold text-primary min-h-8">
              <option value="bed">Bed order</option><option value="name">Name</option><option value="oldest-obs">Oldest observation first</option>
            </select>
          </label>
          <button type="button" aria-pressed={allOpen} onClick={() => setChosen(allOpen ? new Set() : new Set(shown.map((r) => r.patient.id)))}
            className={`${SMALL} bg-surface-container-high hover:bg-surface-variant text-primary font-semibold border border-outline-variant/40`}>
            <Icon name={allOpen ? 'unfold_less' : 'unfold_more'} className="text-[16px]" />{allOpen ? 'Collapse all' : 'Expand all'}
          </button>
          <button type="button" onClick={() => setRead((n) => n + 1)} className={`${SMALL} bg-secondary-container hover:bg-secondary-fixed text-on-secondary-container font-semibold`}>
            <Icon name="sync" className="text-[15px]" />Refresh census
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-sm mb-space-md">
        <StatTile testId="stat-census" label="Active census" value={rows?.length ?? '…'} icon="airline_seat_flat" />
        <StatTile testId="stat-due" label="Doses due today" value={rows ? dues.length : '…'} note={nextDue ? `next ${hm(nextDue)}` : undefined} icon="medication" tone="blue" />
        <StatTile testId="stat-critical" label="Critical lab alert" value={rows ? crits.length : '…'} note={crits[0]?.critical ? `${crits[0].critical.test} ${crits[0].critical.value} (Bed ${crits[0].encounter?.bed})` : undefined} icon="warning" tone={crits.length ? 'red' : 'plain'} />
        <StatTile testId="stat-drafts" label="Draft records" value={rows ? drafts : '…'} note={drafts ? 'waiting for a nurse' : undefined} icon="photo_camera" />
      </div>

      {!data ? <p role="status" className="text-secondary">Loading patient list…</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md items-start">
          {shown.map((r) => (
            <PatientCard key={r.patient.id} r={r} open={open.has(r.patient.id)} nowIso={data.nowIso} names={data.names} nurse={isNurse(user)}
              onToggle={() => toggle(r.patient.id)} onOpen={(path) => setPending({ row: r, path })} />
          ))}
          {shown.length === 0 && (
            <div className="lg:col-span-2 flex flex-col items-center gap-space-sm py-space-xl text-on-surface-variant">
              <Icon name="search_off" className="text-[36px] text-slate-control" /><p>No patients match.</p>
              <button type="button" className={`${SMALL} bg-surface-container-high text-primary font-semibold`} onClick={() => { setQ(''); setFilter('all'); }}>Reset filters</button>
            </div>
          )}
        </div>
      )}

      <footer className="mt-space-md bg-surface-container-lowest rounded-xl p-space-sm px-space-md shadow-sm border border-outline-variant/30 flex flex-wrap items-center justify-between gap-space-sm">
        <span className="font-body-sm text-body-sm text-secondary flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary" aria-hidden />{used ? `Storage used on this laptop: ${used}` : 'Saved on this laptop'}</span>
        <span className="flex flex-wrap gap-space-sm">
          <ButtonLink variant="secondary" to="/spooler"><Icon name="print" />Paper form packets</ButtonLink>
          <ButtonLink to="/handover"><Icon name="assignment" />Prepare SBAR handover</ButtonLink>
          {user?.role === 'RN' && dataset === 'practice' && (provisional.ok
            ? <ButtonLink to="/ward/register"><Icon name="person_add" />Add Provisional Practice Patient</ButtonLink>
            : <span className="flex items-center gap-1 font-body-sm text-body-sm text-secondary" title={provisional.reason}><Badge icon="person_add">Provisional patients: during System Down only</Badge></span>)}
        </span>
      </footer>

      {pending && (
        <VerifyPatientDialog data={pending.row} onCancel={() => setPending(null)}
          onConfirm={() => { verifyPatient(pending.row.patient.id); navigate(pending.path); }} />
      )}
    </div>
  );
}
