import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useApp, useSession } from '../../state/app';
import type { Allergy, AllergyStatus, Encounter, Note, Patient } from '../../db/schema';
import {
  ADMISSION_POLICY, ADMISSION_REASONS, ADMISSION_TYPES, ALLERGY_REACTIONS, ALLERGY_STATUS_LABEL, DISCHARGE_DESTINATIONS, DISCHARGE_REASONS,
  IDENTITY_REVIEW_NOTES, PRACTICE_ALLERGENS, PRACTICE_ORDER_SCENARIOS, TRANSFER_REASONS, type PracticeScenario,
} from '../../config/admissionPolicy';
import {
  bedBoard, dischargePatient, dischargeReview, generateIdentity, recordAllergyAssessment, registerPatient, reviewIdentity, transferPatient,
  validateRegistration, type AllergyInput, type DischargeReview, type Identity, type RegistrationInput, type RegistrationResult,
} from '../../db/repos/admission';
import { listPatientEntries } from '../../db/repos/entries';
import {
  IDENTITY_LABEL, allergyState, currentEncounter, idLabel, identityStatus, isActiveStay, isLocallyRegistered, isProvisional, locationLabel,
  mayDo, needsReconciliation, originLabel, roleLabel, staysByPatient,
} from '../../lib/admission';
import { LIFECYCLE_NOTE, isLifecycleNote } from '../../lib/charting';
import { PHASE_LABEL } from '../../lib/phase';
import { auditLabel } from '../../lib/auditLabels';
import { ageOn, dateTimeLabel, dayLabel, fromLocalInput, toLocalInput } from '../../lib/time';
import { Badge, Button, ButtonLink, EmptyState, Icon, PageTitle } from '../../components/ui';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';
import { Block, Err, Facts, Head, PANEL, Tile, msg } from '../admin/adminUi';
import { fullName, sexLabel } from '../patient/patientData';
import { PatientTabs } from '../patient/PatientTabs';

/**
 * Admissions (26 Nov 2026): the Admission Staff dashboard, registration, and the stay page (transfer, discharge,
 * identity review, allergy assessment). Fictional Practice patients only. Screens ask mayDo() to decide what to show;
 * the repository (db/repos/admission.ts) checks the stored account again for every action.
 */

const LIFECYCLE_ACTIONS = /^(patient_registered|patient_registered_provisional|bed_assigned|patient_transferred|patient_discharged|identity_reviewed|allergy_status_recorded|practice_orders_added|admin_override)$/;

export function PracticeOnly({ children }: { children: ReactNode }) {
  const { dataset } = useApp();
  if (dataset !== 'practice') return <EmptyState icon="info" text="Registration, transfer and discharge work with fictional Practice patients only in this version. Real records keep the hospital patient list." />;
  return <>{children}</>;
}

/** Admission Staff and admins (oversight). Everyone else is sent to their own start page by the route guard. */
export function AdmissionLayout() {
  const { user } = useSession();
  if (user?.role !== 'admission' && user?.role !== 'admin') return <EmptyState icon="lock" text="Admission staff and admins only." />;
  const tabs: [string, string][] = [['/admission', 'Dashboard'], ['/admission/register', 'Register patient']];
  return (
    <PracticeOnly>
      <PageTitle>Admissions</PageTitle>
      <nav aria-label="Admission sections" className="flex flex-wrap gap-1 border-b border-card-border">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => `min-h-11 px-4 flex items-center font-body-md border-b-2 -mb-px ${isActive ? 'border-primary text-primary font-semibold' : 'border-transparent text-secondary hover:text-primary'}`}>{label}</NavLink>
        ))}
      </nav>
      <Outlet />
    </PracticeOnly>
  );
}

interface Row { p: Patient; e: Encounter | undefined; allergies: Allergy[] }
type Filter = 'active' | 'local' | 'provisional' | 'pending' | 'discharged';
const FILTER_LABEL: Record<Filter, string> = { active: 'Active', local: 'Registered here', provisional: 'Provisional', pending: 'Pending reconciliation', discharged: 'Discharged' };
const inFilter = (r: Row, f: Filter) => {
  const active = isActiveStay(r.e);
  if (f === 'discharged') return !active;
  if (!active) return false;
  return f === 'active' || (f === 'local' ? isLocallyRegistered(r.p) : f === 'provisional' ? isProvisional(r.p) : needsReconciliation(r.p));
};

function useRoster() {
  const { db } = useApp();
  return useLiveQuery(async () => {
    const [patients, stays, allergies, staff, board, log] = await Promise.all([
      db.patient.toArray(), db.encounter.toArray(), db.allergy.toArray(), db.practitioner.toArray(), bedBoard(db), db.audit_log.orderBy('seq').reverse().limit(400).toArray(),
    ]);
    const byPatient = staysByPatient(stays);
    const rows: Row[] = patients.map((p) => ({ p, e: byPatient.get(p.id), allergies: allergies.filter((a) => a.patient_id === p.id && a.status === 'active') }));
    return { rows, staff, board, names: new Map(staff.map((s) => [s.id, s.name])), activity: log.filter((a) => LIFECYCLE_ACTIONS.test(a.action)).slice(0, 12) };
  }, [db]);
}

const OriginBadges = ({ p, e }: { p: Patient; e?: Encounter }) => (
  <span className="flex flex-wrap gap-1">
    {isProvisional(p) ? <Badge tone="amber" icon="person_alert">Provisional</Badge> : isLocallyRegistered(p) ? <Badge tone="blue" icon="person_add">Registered here</Badge> : null}
    {needsReconciliation(p) && <Badge tone="amber" icon="badge">{identityStatus(p) === 'under_review' ? 'Identity under review' : 'Reconciliation pending'}</Badge>}
    {identityStatus(p) === 'reconciled' && <Badge tone="green" icon="verified">Reconciled</Badge>}
    {e && !isActiveStay(e) && <Badge icon="logout">Discharged {dateTimeLabel(e.discharge_time)}</Badge>}
    {e && (e.location_history?.length ?? 0) > 1 && <Badge icon="move_down">Transferred</Badge>}
  </span>
);

export function AdmissionDashboard() {
  const { phase, dataset } = useApp();
  const { user } = useSession();
  const data = useRoster();
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  if (!data) return <p role="status">Loading…</p>;
  const { rows, board, names, activity } = data;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => inFilter(r, filter) && (!needle || [fullName(r.p), r.p.mrn, r.e?.bed].some((t) => t?.toLowerCase().includes(needle))))
    .sort((a, b) => (a.e?.bed ?? '~').localeCompare(b.e?.bed ?? '~', 'en', { numeric: true }));
  const count = (f: Filter) => rows.filter((r) => inFilter(r, f)).length;
  const free = board.beds.filter((b) => !b.patientId);
  const can = mayDo(user, 'register_patient', phase);
  const byId = new Map(rows.map((r) => [r.p.id, r]));
  return (
    <div className="flex flex-col gap-space-md">
      <Head label="Admissions" title="Admissions and beds"
        badges={<><Badge icon="domain">{board.unit}</Badge><Badge tone={phase === 'down' ? 'amber' : 'neutral'}>{PHASE_LABEL[phase]}</Badge>{dataset === 'practice' && <Badge tone="blue" icon="school">Practice: fictional patients</Badge>}</>}
        text="Register fictional Practice patients, assign beds, record transfers and discharges. ClinBridge is not the hospital's registration system: every patient registered here keeps a temporary ID until admissions match it with the hospital record."
        actions={can.ok ? <ButtonLink to="/admission/register"><Icon name="person_add" />Register Practice Patient</ButtonLink> : undefined} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-space-md">
        <Tile label="Active patients" icon="airline_seat_flat" value={count('active')} />
        <Tile label="Registered here" icon="person_add" value={count('local')} foot="Temporary IDs" />
        <Tile label="Provisional" icon="person_alert" value={count('provisional')} foot="Nurse, during downtime" tone={count('provisional') ? 'amber' : undefined} />
        <Tile label="Pending reconciliation" icon="badge" value={count('pending')} tone={count('pending') ? 'amber' : undefined} />
        <Tile label="Free beds" icon="bed" value={free.length} unit={`of ${board.beds.length}`} />
      </div>

      <section aria-label="Patients" className={`${PANEL} flex flex-col gap-space-sm`}>
        <div className="flex flex-wrap items-center gap-space-sm">
          <div className="flex-1 min-w-[12rem]"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" placeholder="Name, temporary ID, MRN or bed" className={fieldCls()} /></div>
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-9 px-3 rounded-lg font-body-sm text-body-sm ${filter === f ? 'bg-primary text-on-primary font-semibold' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>
                {FILTER_LABEL[f]} ({count(f)})
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? <EmptyState text="No patients here" /> : (
          <ul aria-label="Patient list" className="flex flex-col">
            {shown.map(({ p, e, allergies }) => {
              const a = allergyState(p, allergies);
              return (
                <li key={p.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] md:grid-cols-[3.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-space-sm gap-y-1 items-center py-2 border-b border-card-border last:border-0">
                  <span className="justify-self-start min-w-9 px-1.5 py-1 rounded bg-surface-container text-center font-code-tabular font-bold text-primary"><span className="sr-only">Bed </span>{isActiveStay(e) ? e?.bed ?? '—' : '—'}</span>
                  <span className="min-w-0"><span className="block font-semibold text-primary">{fullName(p)}</span><span className="block font-code-tabular text-body-sm text-secondary">{idLabel(p)} {p.mrn} · born {dayLabel(p.birth_date)}</span></span>
                  <span className="col-start-2 md:col-start-auto"><OriginBadges p={p} e={e} /></span>
                  <span className={`col-start-2 md:col-start-auto font-body-sm text-body-sm ${a.tone === 'red' ? 'text-clinical-red font-semibold' : a.tone === 'amber' ? 'text-[#7a5410] font-semibold' : 'text-secondary'}`}>{a.real.length ? `Allergy: ${a.text}` : a.text}</span>
                  <ButtonLink variant="secondary" className="col-start-2 md:col-start-auto justify-self-start" to={`/admission/patients/${p.id}`} aria-label={`Admission record of ${fullName(p)}`}>Open</ButtonLink>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-md items-start">
        <Block title="Bed availability" icon="bed" text={`${board.unit}. A bed is free when no active stay is in it. Discharged patients do not hold a bed.`}>
          <ul aria-label="Beds" className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
            {board.beds.map((b) => {
              const r = b.patientId ? byId.get(b.patientId) : undefined;
              return (
                <li key={b.bed} className={`rounded-lg border p-2 font-body-sm text-body-sm ${r ? 'bg-surface-container-low border-card-border' : 'bg-tertiary-fixed/40 border-tertiary-fixed'}`}>
                  <span className="block font-code-tabular font-bold text-primary">{b.bed}</span>
                  <span className="block text-secondary [overflow-wrap:anywhere]">{r ? fullName(r.p) : 'Free'}</span>
                </li>
              );
            })}
          </ul>
        </Block>
        <Block title="Recent admission activity" icon="history" text="From the tamper-evident change log on this laptop.">
          {activity.length === 0 ? <p className="text-secondary">Nothing recorded yet.</p> : (
            <ul className="flex flex-col gap-1">
              {activity.map((a) => {
                const pid = /^patient\//.test(a.entity) ? a.entity.slice(8) : rows.find((r) => `encounter/${r.e?.id}` === a.entity)?.p.id;
                const r = pid ? byId.get(pid) : undefined;
                return <li key={a.id} className="rounded-lg bg-surface-container-low px-space-sm py-1.5 font-body-sm text-body-sm flex flex-wrap justify-between gap-x-space-sm"><span><strong className="text-primary">{auditLabel(a.action)}</strong>{r ? ` · ${fullName(r.p)}` : ''}</span><span className="text-secondary">{names.get(a.user_id) ?? a.user_id}, {dateTimeLabel(a.time)}</span></li>;
              })}
            </ul>
          )}
        </Block>
      </div>
      <p className="font-body-sm text-body-sm text-secondary">{ADMISSION_POLICY.note}</p>
    </div>
  );
}

/* ------------------------------ Registration ------------------------------ */

export function RegisterPatientPage() {
  const { user } = useSession();
  const kind = user?.role === 'RN' ? 'provisional' : 'admission';
  return <PracticeOnly><RegistrationFlow kind={kind} /></PracticeOnly>;
}

function Select({ label, value, onChange, options, error, placeholder = 'Choose' }: { label: string; value: string; onChange: (v: string) => void; options: readonly (string | [string, string])[]; error?: string; placeholder?: string }) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <label className="flex flex-col gap-1 min-w-0" htmlFor={id}><span className={labelCls}>{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls(error)} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}>
        <option value="">{placeholder}</option>
        {options.map((o) => { const [v, l] = typeof o === 'string' ? [o, o] : o; return <option key={v} value={v}>{l}</option>; })}
      </select>
      {error && <span id={`${id}-err`} className="text-error font-body-sm text-body-sm">{error}</span>}
    </label>
  );
}

function AllergyRows({ items, onChange }: { items: AllergyInput[]; onChange: (x: AllergyInput[]) => void }) {
  const set = (i: number, patch: Partial<AllergyInput>) => onChange(items.map((a, k) => (k === i ? { ...a, ...patch } : a)));
  return (
    <div className="flex flex-col gap-space-sm">
      {items.map((a, i) => (
        <fieldset key={i} className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1fr_auto] gap-space-sm items-end rounded-lg bg-surface-container-low p-space-sm">
          <legend className="sr-only">Allergy {i + 1}</legend>
          <Select label={`Allergy ${i + 1}`} value={a.substance} onChange={(v) => set(i, { substance: v })} options={PRACTICE_ALLERGENS} />
          <Select label="Reaction" value={a.reaction} onChange={(v) => set(i, { reaction: v })} options={ALLERGY_REACTIONS} />
          <Select label="Severity" value={a.severity} onChange={(v) => set(i, { severity: v as AllergyInput['severity'] })} options={[['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']]} />
          <Button variant="ghost" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label={`Remove allergy ${i + 1}`}><Icon name="delete" /></Button>
        </fieldset>
      ))}
      <Button variant="secondary" className="self-start" onClick={() => onChange([...items, { substance: '', reaction: '', severity: 'moderate' }])}><Icon name="add" />Add an allergy</Button>
    </div>
  );
}

function AllergyStatusChoice({ value, onChange, allowNotAssessed = true }: { value: AllergyStatus | ''; onChange: (v: AllergyStatus) => void; allowNotAssessed?: boolean }) {
  const options = (Object.keys(ALLERGY_STATUS_LABEL) as AllergyStatus[]).filter((s) => allowNotAssessed || s !== 'not_assessed');
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className={labelCls}>Allergy status</legend>
      <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((s) => (
          <label key={s} className={`min-h-11 rounded-lg border px-space-sm flex items-center gap-2 cursor-pointer ${value === s ? 'border-primary bg-surface-container-low font-semibold' : 'border-card-border'}`}>
            <input type="radio" name="allergy-status" value={s} checked={value === s} onChange={() => onChange(s)} />{ALLERGY_STATUS_LABEL[s]}
          </label>
        ))}
      </div>
      <p className="font-body-sm text-body-sm text-secondary">An empty list is never read as "no known allergies". ClinBridge does not guess allergies.</p>
    </fieldset>
  );
}

function RegistrationFlow({ kind }: { kind: 'admission' | 'provisional' }) {
  const { db, clock, deviceId, phase } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const action = kind === 'provisional' ? 'register_provisional' : 'register_patient';
  const allowed = mayDo(user, action, phase);
  const [identity, setIdentity] = useState<Identity>(() => generateIdentity(clock.nowIso()));
  const [admit, setAdmit] = useState(toLocalInput(clock.nowIso()));
  const [f, setF] = useState({ admissionType: kind === 'provisional' ? 'Emergency' : '', admitReason: '', bed: '', nurse: kind === 'provisional' ? user?.id ?? '' : '', allergyStatus: 'not_assessed' as AllergyStatus | '', scenario: 'none' as PracticeScenario, override: '' });
  const [allergies, setAllergies] = useState<AllergyInput[]>([]);
  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<RegistrationResult | null>(null);
  const extra = useLiveQuery(async () => ({ board: await bedBoard(db), nurses: (await db.practitioner.toArray()).filter((p) => p.active && p.role === 'RN') }), [db]);
  if (!allowed.ok) return <EmptyState icon="lock" text={allowed.reason ?? 'Your role cannot register patients.'} action={<ButtonLink variant="secondary" to={kind === 'provisional' ? '/ward' : '/admission'}>Back</ButtonLink>} />;
  if (!extra) return <p role="status">Loading…</p>;
  const freeBeds = extra.board.beds.filter((b) => !b.patientId).map((b): [string, string] => [b.bed, `Room ${b.room}, bed ${b.bed}`]);
  const input: RegistrationInput = {
    kind, identity, admitTime: fromLocalInput(admit, clock.offsetMinutes), admissionType: f.admissionType, admitReason: f.admitReason, bed: f.bed,
    responsibleNurseId: f.nurse || null, allergyStatus: (f.allergyStatus || 'not_assessed') as AllergyStatus, allergies: f.allergyStatus === 'documented' ? allergies : [], scenario: f.scenario,
    overrideReason: allowed.override ? f.override : undefined,
  };
  const next = () => {
    const e = validateRegistration(input, clock.nowIso());
    if (!f.allergyStatus) e.allergyStatus = 'Pick the allergy status.';
    if (allowed.override && !f.override.trim()) e.override = 'Write why an admin records this registration.';
    setErrors(e);
    if (!Object.keys(e).length) { setError(null); setStep('review'); }
  };
  const save = async () => {
    setBusy(true); setError(null);
    try { setSaved(await registerPatient(db, clock, { userId: user!.id, deviceId }, input)); setStep('done'); } catch (e) { setError(msg(e)); setStep('form'); } finally { setBusy(false); }
  };
  const restart = () => { setIdentity(generateIdentity(clock.nowIso())); setAdmit(toLocalInput(clock.nowIso())); setF({ ...f, admitReason: '', bed: '', allergyStatus: 'not_assessed', scenario: 'none', override: '' }); setAllergies([]); setSaved(null); setStep('form'); };
  const title = kind === 'provisional' ? 'Add Provisional Practice Patient' : 'Register Practice Patient';

  if (step === 'done' && saved) {
    return (
      <section aria-label="Registered" className={`${PANEL} flex flex-col gap-space-md`}>
        <p role="status" className="font-headline-sm text-headline-sm text-sync-green flex items-center gap-2"><Icon name="check_circle" />{fullName(saved.patient)} is registered. Temporary ID {saved.patient.mrn}, bed {saved.encounter.bed}.</p>
        <p className="font-body-md text-body-md text-on-surface-variant">{kind === 'provisional' ? 'The identity stays provisional until admissions match it with the hospital record after the downtime.' : 'Nurses still check name, date of birth and temporary ID before opening the chart.'}{saved.ordersAdded ? ` ${saved.ordersAdded} fictional practice orders were added.` : ''}</p>
        <div className="flex flex-wrap gap-space-sm">
          {kind === 'provisional'
            ? <><ButtonLink to={`/patients/${saved.patient.id}`}><Icon name="clinical_notes" />Open nursing record</ButtonLink><ButtonLink variant="secondary" to="/ward">Back to My patients</ButtonLink></>
            : <><ButtonLink to={`/admission/patients/${saved.patient.id}`}><Icon name="assignment_ind" />View admission details</ButtonLink><ButtonLink variant="secondary" to="/admission">Back to the patient list</ButtonLink></>}
          <Button variant="secondary" onClick={restart}><Icon name="person_add" />Register another patient</Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-space-md">
      <Head label={title} title={title}
        badges={<><Badge tone="blue" icon="school">Practice: fictional patient</Badge>{kind === 'provisional' && <Badge tone="amber" icon="power_off">{PHASE_LABEL[phase]}</Badge>}{allowed.override && <Badge tone="amber" icon="admin_panel_settings">Admin override</Badge>}</>}
        text={kind === 'provisional'
          ? 'The hospital system is down and this patient is not on the patient list. Register a provisional local record so nursing documentation can continue. Admissions match it with the hospital record after the downtime; until then it carries a temporary ID, never an MRN.'
          : 'Registration on this laptop during the Practice drill. The patient gets a temporary local ID; it is not a hospital MRN.'} />
      <Err e={error} />
      {step === 'form' ? (
        <section aria-label="Registration form" className={`${PANEL} flex flex-col gap-space-lg`}>
          <fieldset className="flex flex-col gap-space-sm">
            <legend className="font-headline-sm text-headline-sm text-primary">Fictional identity</legend>
            <div className="rounded-lg bg-surface-container-low p-space-md flex flex-wrap items-center justify-between gap-space-md">
              <dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-1 font-body-md text-body-md">
                <dt className="text-secondary">Name</dt><dd className="font-semibold text-primary">{identity.given} {identity.family}</dd>
                <dt className="text-secondary">Born</dt><dd className="font-code-tabular">{dayLabel(identity.birthDate)} ({ageOn(identity.birthDate, clock.nowIso())} years)</dd>
                <dt className="text-secondary">Sex</dt><dd>{sexLabel(identity.sex)}</dd>
                <dt className="text-secondary">Temporary ID</dt><dd>Given when saved (PX-…). Not a hospital MRN.</dd>
              </dl>
              <Button variant="secondary" onClick={() => setIdentity(generateIdentity(clock.nowIso()))}><Icon name="casino" />Generate another fictional identity</Button>
            </div>
            <p className="font-body-sm text-body-sm text-secondary">Generated, invented names only. The public Practice demo takes no typed names, so real patient details are not entered here by mistake. This does not prevent every misuse.</p>
          </fieldset>
          <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <legend className="font-headline-sm text-headline-sm text-primary mb-space-sm">Admission</legend>
            <label className="flex flex-col gap-1" htmlFor="f-admit"><span className={labelCls}>Admission date and time</span>
              <input id="f-admit" type="datetime-local" value={admit} onChange={(e) => setAdmit(e.target.value)} className={fieldCls(errors.admitTime)} aria-invalid={!!errors.admitTime} />
              {errors.admitTime && <span className="text-error font-body-sm text-body-sm">{errors.admitTime}</span>}</label>
            <Select label="Admission type" value={f.admissionType} onChange={(v) => setF({ ...f, admissionType: v })} options={ADMISSION_TYPES} error={errors.admissionType} />
            <Select label="Admission reason (practice list)" value={f.admitReason} onChange={(v) => setF({ ...f, admitReason: v })} options={ADMISSION_REASONS} error={errors.admitReason} />
            <Select label={`Bed on ${extra.board.unit}`} value={f.bed} onChange={(v) => setF({ ...f, bed: v })} options={freeBeds} error={errors.bed} placeholder={freeBeds.length ? 'Choose a free bed' : 'No free bed'} />
            <Select label="Responsible nurse" value={f.nurse} onChange={(v) => setF({ ...f, nurse: v })} options={extra.nurses.map((n): [string, string] => [n.id, n.name])} placeholder="Not assigned yet" />
            <Select label="Medication orders" value={f.scenario} onChange={(v) => setF({ ...f, scenario: (v || 'none') as PracticeScenario })} options={(Object.keys(PRACTICE_ORDER_SCENARIOS) as PracticeScenario[]).filter((k) => k !== 'none').map((k): [string, string] => [k, PRACTICE_ORDER_SCENARIOS[k].label])} placeholder={PRACTICE_ORDER_SCENARIOS.none.label} />
            <p className="md:col-span-2 font-body-sm text-body-sm text-secondary">A Practice scenario copies reviewed orders of the fictional patient list, never a high-alert medicine. It is not a prescription and not a treatment suggestion. Real orders come only from authorized prescribers.</p>
          </fieldset>
          <div className="flex flex-col gap-space-sm">
            <AllergyStatusChoice value={f.allergyStatus} onChange={(v) => setF({ ...f, allergyStatus: v })} />
            {errors.allergyStatus && <p className="text-error font-body-sm text-body-sm">{errors.allergyStatus}</p>}
            {f.allergyStatus === 'documented' && <AllergyRows items={allergies} onChange={setAllergies} />}
            {errors.allergies && <p className="text-error font-body-sm text-body-sm">{errors.allergies}</p>}
          </div>
          {allowed.override && (
            <label className="flex flex-col gap-1" htmlFor="f-override"><span className={labelCls}>Admin override: why do you record this?</span>
              <input id="f-override" value={f.override} onChange={(e) => setF({ ...f, override: e.target.value })} className={fieldCls(errors.override)} maxLength={160} />
              {errors.override && <span className="text-error font-body-sm text-body-sm">{errors.override}</span>}</label>
          )}
          <div className="flex flex-wrap gap-space-sm">
            <Button onClick={next}><Icon name="fact_check" />Review registration</Button>
            <Button variant="secondary" onClick={() => navigate(kind === 'provisional' ? '/ward' : '/admission')}>Cancel</Button>
          </div>
        </section>
      ) : (
        <section aria-label="Check before saving" className={`${PANEL} flex flex-col gap-space-md`}>
          <h3 className="font-headline-sm text-headline-sm text-primary">Check before saving</h3>
          <Facts rows={[
            ['Fictional patient', `${identity.given} ${identity.family}, born ${dayLabel(identity.birthDate)}, ${sexLabel(identity.sex)}`],
            ['Temporary ID', 'Next free PX number, given when saved. Not a hospital MRN.'],
            ['Registration', kind === 'provisional' ? 'Provisional, by a nurse during downtime' : 'By admissions'],
            ['Ward and bed', `${extra.board.unit}, bed ${f.bed}`],
            ['Admitted', `${dateTimeLabel(input.admitTime)} · ${f.admissionType}`],
            ['Reason', f.admitReason],
            ['Responsible nurse', extra.nurses.find((n) => n.id === f.nurse)?.name ?? 'Not assigned yet'],
            ['Allergy status', input.allergyStatus === 'documented' ? `${ALLERGY_STATUS_LABEL.documented}: ${allergies.map((a) => `${a.substance} (${a.reaction}, ${a.severity})`).join('; ')}` : ALLERGY_STATUS_LABEL[input.allergyStatus]],
            ['Medication orders', PRACTICE_ORDER_SCENARIOS[f.scenario].label],
            ['Identity reconciliation', 'Pending: admissions match this record with the hospital record later'],
          ]} />
          <p className="font-body-md text-body-md text-on-surface-variant">Saving does not verify the patient for nursing care: the name, date of birth and temporary ID are checked again before the chart opens.</p>
          <div className="flex flex-wrap gap-space-sm">
            <Button onClick={() => void save()} disabled={busy}><Icon name="save" />{busy ? 'Saving…' : 'Save registration'}</Button>
            <Button variant="secondary" onClick={() => setStep('form')} disabled={busy}>Back to the form</Button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ------------------------------ Stay page (transfer, discharge, identity, allergies) ------------------------------ */

/** /patients/:id/stay: the same stay page for nurses, after the patient check. */
export function PatientStayPage() {
  const { id } = useParams();
  return <PracticeOnly><div className="print:hidden"><PatientTabs patientId={id!} /></div><StayPanel patientId={id!} context="nursing" /></PracticeOnly>;
}

export function AdmissionPatientPage() {
  const { id } = useParams();
  return <PracticeOnly><StayPanel patientId={id!} context="admission" /></PracticeOnly>;
}

type Panel = null | 'transfer' | 'discharge' | 'identity' | 'allergy';

export function StayPanel({ patientId, context }: { patientId: string; context: 'admission' | 'nursing' }) {
  const { db, clock, deviceId, phase, dataset } = useApp();
  const { user } = useSession();
  const [open, setOpen] = useState<Panel>(null);
  const [note, setNote] = useState<string | null>(null);
  const data = useLiveQuery(async () => {
    const p = await db.patient.get(patientId);
    if (!p) return null;
    const [stays, allergies, staff, entries] = await Promise.all([db.encounter.where('patient_id').equals(patientId).toArray(), db.allergy.where('patient_id').equals(patientId).toArray(), db.practitioner.toArray(), listPatientEntries(db, patientId)]);
    const events = entries.filter((x) => x.entry.type === 'note' && x.entry.status === 'confirmed' && isLifecycleNote((x.child as Note | undefined)?.category)).sort((a, b) => a.entry.care_time.localeCompare(b.entry.care_time) || a.entry.counter - b.entry.counter);
    return { p, e: currentEncounter(stays), allergies: allergies.filter((a) => a.status === 'active'), staff, names: new Map(staff.map((s) => [s.id, `${s.name}, ${roleLabel(s.role)}`])), events };
  }, [db, patientId]);
  if (data === undefined) return <p role="status">Loading…</p>;
  if (data === null) return <EmptyState icon="person_off" text="Patient not found." />;
  const { p, e, allergies, names, events } = data;
  const actor = { userId: user!.id, deviceId };
  const active = isActiveStay(e);
  const a = allergyState(p, allergies);
  const t = mayDo(user, 'transfer', phase), d = mayDo(user, 'discharge', phase), r = mayDo(user, 'identity_review', phase), al = mayDo(user, 'allergy_assessment', phase);
  const done = (text: string) => { setOpen(null); setNote(text); };
  const history = e?.location_history?.length ? e.location_history : e ? [{ unit: e.unit, room: e.room ?? null, bed: e.bed ?? '—', from: e.admit_time, to: e.discharge_time ?? null }] : [];
  return (
    <div className="flex flex-col gap-space-md">
      {context === 'admission' && <nav aria-label="Path" className="font-body-md text-secondary"><Link to="/admission" className="hover:underline">Admissions</Link> › {fullName(p)}</nav>}
      <Head label="Admission record" title={context === 'admission' ? fullName(p) : 'Stay and admission'}
        badges={<><OriginBadges p={p} e={e} />{dataset === 'practice' && <Badge tone="blue" icon="school">Fictional</Badge>}</>}
        text={context === 'admission' ? 'Admission information only. Nursing records are not shown to admission staff.' : 'Admission, location history, transfer, discharge and identity reconciliation for this stay.'}>
        {note && <p role="status" className="text-sync-green font-semibold">{note}</p>}
      </Head>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-md items-start">
        <Block title="Identity" icon="badge">
          <Facts rows={[
            ['Name', fullName(p)], ['Born', `${dayLabel(p.birth_date)} (${ageOn(p.birth_date, clock.nowIso())} years)`], ['Sex', sexLabel(p.sex)],
            [idLabel(p), p.mrn], ['Origin', originLabel(p)], ['Reconciliation', IDENTITY_LABEL[identityStatus(p)]],
          ]} />
          {p.identifier_kind === 'local_temporary' && <p className="font-body-sm text-body-sm text-secondary">The temporary ID was made on this laptop. It is not a hospital MRN. ClinBridge never matches identities by itself and never marks one reconciled when the network returns.</p>}
        </Block>
        <Block title="Stay" icon="bed">
          <Facts rows={[
            ['Status', active ? 'Active admission' : `Discharged ${dateTimeLabel(e?.discharge_time)}`],
            ['Location', active ? locationLabel(e) : 'No bed (discharged)'], ['Admitted', `${dateTimeLabel(e?.admit_time)}${e?.admission_type ? ` · ${e.admission_type}` : ''}`],
            ['Reason', e?.admit_reason ?? 'Not on the patient list'], ['Responsible nurse', e?.responsible_nurse_id ? names.get(e.responsible_nurse_id) ?? e.responsible_nurse_id : 'Not assigned'],
            ['Allergy status', a.real.length ? `Allergy: ${a.text}` : a.text],
            ...(!active ? [['Destination', e?.discharge_destination ?? '—'] as [string, string], ['Discharge reason', e?.discharge_reason ?? '—'] as [string, string]] : []),
          ]} />
        </Block>
      </div>
      <Block title="Location history" icon="move_down" text="Every bed of this stay, oldest first. Earlier locations are kept, never overwritten.">
        <ol className="flex flex-col gap-1">{history.map((l, i) => <li key={i} className="rounded-lg bg-surface-container-low px-space-sm py-1.5 font-body-md text-body-md flex flex-wrap justify-between gap-x-space-sm"><span>{locationLabel(l)}</span><span className="font-code-tabular text-secondary">{dateTimeLabel(l.from)} → {l.to ? dateTimeLabel(l.to) : active && i === history.length - 1 ? 'now' : '—'}</span></li>)}</ol>
      </Block>
      <Block title="Admission history" icon="history" text="Admission, transfer, discharge, identity and allergy records of this patient. Each is an append-only record in the change log.">
        {events.length === 0 ? <p className="text-secondary">This patient came from the patient list; no admission record was written on this laptop.</p> : (
          <ol className="flex flex-col gap-2">{events.map((x) => { const n = x.child as Note; return (
            <li key={x.entry.id} className="rounded-lg border border-card-border p-space-sm"><p className="flex flex-wrap justify-between gap-x-space-sm"><strong className="text-primary">{isLifecycleNote(n.category) ? LIFECYCLE_NOTE[n.category] : n.category}</strong><span className="font-code-tabular text-body-sm text-secondary">{dateTimeLabel(x.entry.care_time)} · {names.get(x.entry.performer_id) ?? x.entry.performer_id}</span></p><p className="font-body-md text-body-md text-on-surface-variant mt-1">{n.text}</p></li>
          ); })}</ol>
        )}
      </Block>
      <section aria-label="Actions" className={`${PANEL} flex flex-col gap-space-sm`}>
        <div className="flex flex-wrap gap-space-sm">
          {active && t.ok && <Button variant={open === 'transfer' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'transfer' ? null : 'transfer')}><Icon name="move_down" />Record a transfer</Button>}
          {active && d.ok && <Button variant={open === 'discharge' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'discharge' ? null : 'discharge')}><Icon name="logout" />Record a discharge</Button>}
          {needsReconciliation(p) && r.ok && <Button variant={open === 'identity' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'identity' ? null : 'identity')}><Icon name="badge" />Identity reconciliation</Button>}
          {active && isLocallyRegistered(p) && (p.allergy_status === 'unknown' || p.allergy_status === 'not_assessed') && al.ok && <Button variant={open === 'allergy' ? 'primary' : 'secondary'} onClick={() => setOpen(open === 'allergy' ? null : 'allergy')}><Icon name="warning" />Record allergy assessment</Button>}
          {context === 'admission' && user?.role === 'admin' && <span className="font-body-sm text-body-sm text-secondary self-center">Admin: actions are recorded as overrides with a reason.</span>}
          {!active && <span className="font-body-md text-body-md text-secondary self-center">Discharged: the records stay readable; new charting on this stay is closed.</span>}
        </div>
        {open === 'transfer' && e && <TransferForm patient={p} stay={e} override={t.override} onDone={done} actor={actor} />}
        {open === 'discharge' && e && <DischargeForm patient={p} stay={e} override={d.override} onDone={done} actor={actor} />}
        {open === 'identity' && <IdentityForm patient={p} override={r.override} onDone={done} actor={actor} />}
        {open === 'allergy' && <AllergyForm patient={p} onDone={done} actor={actor} />}
      </section>
    </div>
  );
}

interface FormProps { patient: Patient; override?: boolean; onDone: (text: string) => void; actor: { userId: string; deviceId: string } }

function OverrideField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <label className="flex flex-col gap-1"><span className={labelCls}>Admin override: why do you record this?</span><input value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls()} maxLength={160} aria-label="Override reason" /></label>;
}

function useTime() {
  const { clock } = useApp();
  const [v, setV] = useState(toLocalInput(clock.nowIso()));
  return { v, setV, iso: fromLocalInput(v, clock.offsetMinutes) };
}

function TransferForm({ patient, stay, override, onDone, actor }: FormProps & { stay: Encounter }) {
  const { db, clock } = useApp();
  const time = useTime();
  const [bed, setBed] = useState(''), [reason, setReason] = useState(''), [ack, setAck] = useState(false), [ov, setOv] = useState('');
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const board = useLiveQuery(() => bedBoard(db), [db]);
  const free = (board?.beds ?? []).filter((b) => !b.patientId).map((b): [string, string] => [b.bed, `Room ${b.room}, bed ${b.bed}`]);
  const go = async () => {
    setError(null);
    if (!ack) { setError('Tick the acknowledgement first.'); return; }
    setBusy(true);
    try { const e = await transferPatient(db, clock, actor, { patientId: patient.id, bed, time: time.iso, reason, fromBed: stay.bed ?? undefined, overrideReason: override ? ov : undefined }); onDone(`Transfer recorded: now in bed ${e.bed}.`); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg bg-surface-container-low p-space-md flex flex-col gap-space-sm" role="group" aria-label="Record a transfer">
      <p className="font-body-md text-body-md">From <strong>{locationLabel(stay)}</strong> to a free bed of the unit. Transfers to other units are not part of this version.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm">
        <Select label="New bed" value={bed} onChange={setBed} options={free} placeholder={free.length ? 'Choose a free bed' : 'No free bed'} />
        <Select label="Reason" value={reason} onChange={setReason} options={TRANSFER_REASONS} />
        <label className="flex flex-col gap-1"><span className={labelCls}>Time of transfer</span><input type="datetime-local" value={time.v} onChange={(e) => time.setV(e.target.value)} className={fieldCls()} aria-label="Time of transfer" /></label>
      </div>
      {override && <OverrideField value={ov} onChange={setOv} />}
      <label className="flex items-start gap-2 font-body-md text-body-md"><input type="checkbox" className="mt-1 w-5 h-5" checked={ack} onChange={(e) => setAck(e.target.checked)} />I record a transfer that was decided by the responsible team. Recording it is not the clinical decision to move the patient.</label>
      <Err e={error} />
      <Button className="self-start" onClick={() => void go()} disabled={busy || !bed || !reason}><Icon name="move_down" />{busy ? 'Saving…' : 'Save transfer'}</Button>
    </div>
  );
}

function DischargeForm({ patient, stay, override, onDone, actor }: FormProps & { stay: Encounter }) {
  const { db, clock } = useApp();
  const time = useTime();
  const [dest, setDest] = useState(''), [reason, setReason] = useState(''), [ack, setAck] = useState(false), [decided, setDecided] = useState(false), [ov, setOv] = useState('');
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const review = useLiveQuery<DischargeReview>(() => dischargeReview(db, patient.id, time.iso), [db, patient.id, time.iso]);
  const outstanding = review ? review.outstandingDoses.length + review.openWorklistItems : 0;
  const go = async () => {
    setError(null);
    if (!decided) { setError('Tick that the discharge was decided by the responsible team.'); return; }
    setBusy(true);
    try { await dischargePatient(db, clock, actor, { patientId: patient.id, time: time.iso, destination: dest, reason, acknowledgeOutstanding: ack, overrideReason: override ? ov : undefined }); onDone('Discharge recorded. The bed is free; the records stay readable.'); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg bg-surface-container-low p-space-md flex flex-col gap-space-sm" role="group" aria-label="Record a discharge">
      <p className="font-body-md text-body-md">Leaves <strong>{locationLabel(stay)}</strong>. ClinBridge records a discharge; it never decides one.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm">
        <Select label="Destination" value={dest} onChange={setDest} options={DISCHARGE_DESTINATIONS} />
        <Select label="Reason (practice)" value={reason} onChange={setReason} options={DISCHARGE_REASONS} />
        <label className="flex flex-col gap-1"><span className={labelCls}>Time of discharge</span><input type="datetime-local" value={time.v} onChange={(e) => time.setV(e.target.value)} className={fieldCls()} aria-label="Time of discharge" /></label>
      </div>
      <section aria-label="Outstanding documentation" className="rounded-lg bg-surface-container-lowest border border-card-border p-space-sm flex flex-col gap-1 font-body-md text-body-md">
        <strong className="text-primary">Outstanding documentation</strong>
        {!review ? <span className="text-secondary">Checking…</span> : <>
          {review.drafts > 0 ? <p className="text-error font-semibold">{review.drafts} draft record{review.drafts > 1 ? 's' : ''} waiting for a nurse to check. Discharge stays blocked until every draft is confirmed, so nothing is lost.</p> : <p className="text-secondary">No draft records waiting.</p>}
          {review.outstandingDoses.length > 0 ? <p className="text-[#7a5410] font-semibold">Scheduled doses without a record: {review.outstandingDoses.map((x) => `${x.drug} ${x.time.slice(11, 16)}`).join(', ')}.</p> : <p className="text-secondary">No scheduled dose without a record.</p>}
          {review.openWorklistItems > 0 && <p className="text-[#7a5410] font-semibold">{review.openWorklistItems} recovery item{review.openWorklistItems > 1 ? 's' : ''} not signed off (they stay in the recovery worklist).</p>}
        </>}
        {outstanding > 0 && <label className="flex items-start gap-2 mt-1"><input type="checkbox" className="mt-1 w-5 h-5" checked={ack} onChange={(e) => setAck(e.target.checked)} />I reviewed these items. This acknowledgement is not an instruction to omit any treatment.</label>}
      </section>
      {override && <OverrideField value={ov} onChange={setOv} />}
      <label className="flex items-start gap-2 font-body-md text-body-md"><input type="checkbox" className="mt-1 w-5 h-5" checked={decided} onChange={(e) => setDecided(e.target.checked)} />The discharge was decided by the responsible team. I record it.</label>
      <Err e={error} />
      <Button className="self-start" variant="danger" onClick={() => void go()} disabled={busy || !dest || !reason || !review || review.drafts > 0}><Icon name="logout" />{busy ? 'Saving…' : 'Save discharge'}</Button>
    </div>
  );
}

function IdentityForm({ patient, override, onDone, actor }: FormProps) {
  const { db, clock, phase } = useApp();
  const [status, setStatus] = useState<'under_review' | 'reconciled' | ''>(''), [note, setNote] = useState(''), [ov, setOv] = useState('');
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const canReconcile = (ADMISSION_POLICY.reconcilePhases as readonly string[]).includes(phase);
  const go = async () => {
    setError(null); setBusy(true);
    try { await reviewIdentity(db, clock, actor, { patientId: patient.id, status: status as 'under_review' | 'reconciled', note, overrideReason: override ? ov : undefined }); onDone(status === 'reconciled' ? 'Recorded as reconciled.' : 'Recorded: identity under review.'); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg bg-surface-container-low p-space-md flex flex-col gap-space-sm" role="group" aria-label="Identity reconciliation">
      <p className="font-body-md text-body-md">Record what a person checked. ClinBridge does not compare names or dates of birth and never decides that two records are the same person.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
        <Select label="New status" value={status} onChange={(v) => setStatus(v as typeof status)} options={[['under_review', 'Under review'], ...(canReconcile ? [['reconciled', 'Reconciled'] as [string, string]] : [])]} />
        <Select label="What was checked" value={note} onChange={setNote} options={IDENTITY_REVIEW_NOTES} />
      </div>
      {!canReconcile && <p className="font-body-sm text-body-sm text-secondary">"Reconciled" becomes available when the hospital system can be checked again (after the network is cleared).</p>}
      {override && <OverrideField value={ov} onChange={setOv} />}
      <Err e={error} />
      <Button className="self-start" onClick={() => void go()} disabled={busy || !status || !note}><Icon name="badge" />{busy ? 'Saving…' : 'Save identity step'}</Button>
    </div>
  );
}

function AllergyForm({ patient, onDone, actor }: FormProps) {
  const { db, clock } = useApp();
  const [status, setStatus] = useState<AllergyStatus | ''>(''), [items, setItems] = useState<AllergyInput[]>([]);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const go = async () => {
    setError(null); setBusy(true);
    try { await recordAllergyAssessment(db, clock, actor, { patientId: patient.id, status: status as Exclude<AllergyStatus, 'not_assessed'>, allergies: status === 'documented' ? items : [] }); onDone('Allergy status recorded.'); } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg bg-surface-container-low p-space-md flex flex-col gap-space-sm" role="group" aria-label="Allergy assessment">
      <AllergyStatusChoice value={status} onChange={setStatus} allowNotAssessed={false} />
      {status === 'documented' && <AllergyRows items={items} onChange={setItems} />}
      <Err e={error} />
      <Button className="self-start" onClick={() => void go()} disabled={busy || !status}><Icon name="save" />{busy ? 'Saving…' : 'Save allergy status'}</Button>
    </div>
  );
}

/** For other screens: the badges of a locally registered patient. */
export { OriginBadges };
