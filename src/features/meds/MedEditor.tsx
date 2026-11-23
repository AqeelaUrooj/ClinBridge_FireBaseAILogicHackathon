import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ActiveOrder, MedAdmin, Practitioner } from '../../db/schema';
import { useApp, useSession } from '../../state/app';
import { DOSE_UNITS, RATE_UNITS, ROUTES, ROUTE_LABEL, SITE_WORDS } from '../../config/medicationPolicy';
import { ACTIVE_CLINICAL_POLICY } from '../../config/clinicalPolicy';
import { EVENT_LABEL, orderDose, validateMed, type MedEvent, type MedForm } from '../../lib/meds';
import { formatDose } from '../../lib/dose';
import { dateTimeLabel, fromLocalInput, hm, toLocalInput } from '../../lib/time';
import { Button, Card, Dialog, Icon, SectionLabel } from '../../components/ui';
import { PinPad } from '../auth/PinPad';
import { SourceCheck } from '../capture/SourceCheck';
import { usePinCheck } from '../auth/SignIn';
import { ChangeLogFooter, DrugCard, PreparationCard, StepBar, type MedWide } from './MedRecordLayout';

export interface MedSubmit { values: Omit<MedAdmin, 'id' | 'entry_id'>; careTime: string; changeReason?: string }

/** Red bar for high-alert drugs. Never hidden (UI/UX: safety beats tidiness). */
export function HighAlertBar() {
  return (
    <div role="note" className="rounded-lg bg-clinical-red text-white px-space-md py-space-sm flex items-center gap-2 font-body-md font-semibold">
      <Icon name="warning" filled />High-alert drug · a second nurse must check · they sign with their own PIN
    </div>
  );
}

const CHECKS = [
  ['Patient', 'Right patient: name, date of birth and MRN on the wristband.'],
  ['Medicine and strength', 'Drug, strength and amount against the order and the container.'],
  ['Dose and route', 'Dose, route and time in this record.'],
] as const;

/** Kept in the editor, not in the dialog or panel: closing it or going back must not clear the wrong-PIN lockout. */
function useSecondCheck(onDone: (p: Practitioner) => void) {
  const [who, setWho] = useState<Practitioner | null>(null);
  return { who, setWho, check: usePinCheck(who, onDone) };
}

/** Pick a different nurse, who then enters their own PIN. Who may check comes from the active policy. */
function SecondCheckBody({ second: { who, setWho, check } }: { second: ReturnType<typeof useSecondCheck> }) {
  const { db } = useApp();
  const { user } = useSession();
  const staff = useLiveQuery(() => db.practitioner.toArray(), [db]);
  const eligible = (staff ?? []).filter((p) => p.active && p.id !== user?.id && ACTIVE_CLINICAL_POLICY.secondChecker.roles.includes(p.role));
  return (
    <>
      {!who ? (
        <>
          <p className="font-body-md text-body-md text-on-surface-variant">A different nurse checks the drug, dose and patient, then enters their own PIN.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
            {eligible.map((p) => (
              <button key={p.id} type="button" onClick={() => setWho(p)} className="min-h-14 rounded-lg border border-card-border bg-surface-container-lowest px-3 text-left hover:bg-surface-container-low flex items-center gap-2">
                <span aria-hidden className="w-8 h-8 rounded-full bg-primary-container text-on-primary grid place-items-center font-bold text-xs shrink-0">{p.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                <span><span className="block font-body-md text-body-md font-semibold text-primary">{p.name}</span><span className="block font-body-sm text-body-sm text-secondary">{p.role}</span></span>
              </button>
            ))}
          </div>
          {staff && eligible.length === 0 && <p role="alert" className="text-error">No other nurse who can check is set up on this laptop.</p>}
        </>
      ) : (
        <>
          <p className="text-on-surface-variant">{who.name}, enter your PIN.</p>
          <PinPad value={check.pin} onChange={check.setPin} onSubmit={check.submit} disabled={check.disabled} error={check.error} />
          <Button variant="ghost" onClick={() => setWho(null)}>Pick a different nurse</Button>
        </>
      )}
      {ACTIVE_CLINICAL_POLICY.status !== 'institution-approved' && (
        <p className="font-body-sm text-body-sm text-secondary">Who can check: {ACTIVE_CLINICAL_POLICY.secondChecker.roles.join(', ')}. Prototype setting, not approved hospital policy.</p>
      )}
    </>
  );
}

function SecondCheckDialog({ second, onCancel }: { second: ReturnType<typeof useSecondCheck>; onCancel: () => void }) {
  return (
    <Dialog title="Second nurse check" onClose={onCancel}>
      <SecondCheckBody second={second} />
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
    </Dialog>
  );
}

/** What the second nurse looks at. Plain text on purpose: ClinBridge records the PIN check, not separate ticks. */
function SecondNurseChecks() {
  return (
    <ol aria-label="What the second nurse checks" className="flex flex-col gap-space-sm">
      {CHECKS.map(([t, d], i) => (
        <li key={t} className="p-space-sm rounded-lg bg-surface-container-low">
          <span className="font-body-md text-body-md font-semibold text-on-surface block">{i + 1}. {t}</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">{d}</span>
        </li>
      ))}
    </ol>
  );
}

const field = (err?: string) => `h-12 rounded-lg border px-space-md bg-surface-container-lowest ${err ? 'border-error' : 'border-card-border'}`;

export function MedEditor({ order, initial, events, priorRate, recentSites = [], wide, initialCareTime, scheduledTime, minCareTime, requireChangeReason, sourceCheck, saveLabel, onSubmit, onCancel }: {
  order: ActiveOrder;
  initial: MedForm;
  events: MedEvent[];
  priorRate: number | null;
  /** Last few sites for this order (documented: helps rotate injection sites). Display only. */
  recentSites?: { site: string; time: string }[];
  /** Full-page layout with step bar, drug card and the second-nurse panel beside the form (record page only). */
  wide?: MedWide;
  initialCareTime?: string;
  scheduledTime?: string | null;
  minCareTime?: string;
  requireChangeReason?: boolean;
  /** Ask for the "I checked every value against the paper" tick before saving. */
  sourceCheck?: boolean;
  saveLabel: string;
  onSubmit: (s: MedSubmit) => Promise<void>;
  onCancel: () => void;
}) {
  const { clock } = useApp();
  const [form, setForm] = useState<MedForm>(initial);
  const [care, setCare] = useState(toLocalInput(initialCareTime ?? clock.nowIso()));
  const [changeReason, setChangeReason] = useState('');
  const [step, setStep] = useState<'fill' | 'review'>('fill');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ticked, setTicked] = useState(false);
  const [sourceChecked, setSourceChecked] = useState(false);
  const [checker, setChecker] = useState<Practitioner | null>(null);
  const [askCheck, setAskCheck] = useState(false);
  const second = useSecondCheck((p) => { setChecker(p); setAskCheck(false); });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const v = validateMed(form, order, priorRate);
  const careIso = fromLocalInput(care, clock.offsetMinutes);
  const set = (k: keyof MedForm) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  function next() {
    const e: Record<string, string> = { ...(v.errors as Record<string, string>) };
    if (!care || Number.isNaN(Date.parse(careIso))) e.care = 'Enter the time';
    else if (Date.parse(careIso) > clock.now() + 60_000) e.care = 'Time cannot be in the future';
    else if (minCareTime && Date.parse(careIso) < Date.parse(minCareTime)) e.care = 'Time is before this patient was admitted';
    if (requireChangeReason && !changeReason.trim()) e.changeReason = 'Say why you are fixing this';
    setErrors(e);
    if (Object.keys(e).length === 0) { setTicked(false); setSourceChecked(false); setChecker(null); second.setWho(null); second.check.setPin(''); setStep('review'); }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const values = { ...v.values, double_checked: v.needsSecondCheck ? true : null, double_checked_by: v.needsSecondCheck ? checker?.id ?? null : null };
      if (v.needsSecondCheck && !values.double_checked_by) throw new Error('A second nurse must check this drug.');
      await onSubmit({ values, careTime: careIso, changeReason: requireChangeReason ? changeReason.trim() : undefined });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  const doseText = v.values.infusion_rate != null ? `${formatDose(v.values.infusion_rate)} ${v.values.infusion_rate_unit ?? ''}` : v.values.dose_given != null ? `${formatDose(v.values.dose_given)} ${v.values.dose_given_unit ?? ''}` : '';
  const rowCls = wide ? 'grid grid-cols-1 sm:grid-cols-2 gap-space-md' : 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(12rem,30%)),1fr))] gap-space-md';
  const canSave = !saving && (v.warnings.length === 0 || ticked) && (!v.needsSecondCheck || !!checker) && (!sourceCheck || sourceChecked);

  if (step === 'review') {
    const val = v.values;
    const summary = (
      <>
        <dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-space-sm font-body-lg">
          <dt className="text-secondary">Drug</dt><dd className="font-semibold text-primary">{val.drug_name}</dd>
          <dt className="text-secondary">What happened</dt><dd className="font-semibold text-primary">{EVENT_LABEL[form.event]}</dd>
          {val.dose_given != null && <><dt className="text-secondary">Dose given</dt><dd className="font-code-tabular font-bold text-primary text-[22px]">{formatDose(val.dose_given)} {val.dose_given_unit}</dd></>}
          {form.event === 'administered' && <><dt className="text-secondary">Ordered</dt><dd className="font-code-tabular">{orderDose(order)}</dd></>}
          {val.route && form.event === 'administered' && <><dt className="text-secondary">Route</dt><dd>{val.route} ({ROUTE_LABEL[val.route] ?? ''})</dd></>}
          {val.site && <><dt className="text-secondary">Site</dt><dd>{val.site}</dd></>}
          {val.infusion_rate != null && <><dt className="text-secondary">New rate</dt><dd className="font-code-tabular font-bold text-primary text-[22px]">{formatDose(val.infusion_rate)} {val.infusion_rate_unit}<span className="text-body-sm font-normal text-secondary"> (was {formatDose(priorRate)})</span></dd></>}
          {val.reason && <><dt className="text-secondary">Reason</dt><dd>{val.reason}</dd></>}
          <dt className="text-secondary">Time</dt><dd className="font-code-tabular">{dateTimeLabel(careIso)}{scheduledTime ? ` · due ${hm(scheduledTime)}` : ''}</dd>
          {requireChangeReason && <><dt className="text-secondary">Fix reason</dt><dd>{changeReason}</dd></>}
        </dl>
        {v.warnings.length > 0 && (
          <div className="rounded-lg border border-downtime-amber-border bg-downtime-amber-bg p-space-md flex flex-col gap-space-sm" role="alert">
            <p className="font-headline-sm text-headline-sm text-[#7a5410] flex items-center gap-2"><Icon name="warning" />Check this</p>
            <ul className="list-disc pl-6">{v.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            <label className="flex items-center gap-2 min-h-11 font-semibold cursor-pointer">
              <input type="checkbox" className="w-5 h-5" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />I checked this and it is right
            </label>
          </div>
        )}
      </>
    );
    const buttons = (
      <>
        {sourceCheck && <SourceCheck checked={sourceChecked} onChange={setSourceChecked} />}
        {saveError && <p role="alert" className="text-error flex items-center gap-1"><Icon name="error" />{saveError}</p>}
        <div className={wide ? 'flex flex-col gap-2' : 'flex gap-space-sm'}>
          <Button onClick={save} disabled={!canSave}><Icon name={wide ? 'how_to_reg' : 'save'} />{saving ? 'Saving…' : saveLabel}</Button>
          <Button variant="secondary" onClick={() => setStep('fill')} disabled={saving}>Go back</Button>
          {wide && <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel, nothing is recorded</Button>}
        </div>
      </>
    );
    if (wide) {
      return (
        <div className="flex flex-col gap-space-md">
          {v.needsSecondCheck && <HighAlertBar />}
          <StepBar current="review" second={v.needsSecondCheck} checked={!!checker} />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start">
            <div className="lg:col-span-7 flex flex-col gap-space-md">
              <DrugCard order={order} wide={wide}>
                <div className="mt-space-md flex flex-col gap-space-md">
                  <h2 className="font-headline-sm text-headline-sm text-primary">Check before saving</h2>
                  {summary}
                </div>
              </DrugCard>
              {v.needsSecondCheck && <PreparationCard recorder={wide.recorder} doseText={doseText} />}
            </div>
            <section aria-label={v.needsSecondCheck ? 'Independent verification' : 'Save'} className="lg:col-span-5 bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm flex flex-col gap-space-md">
              {v.needsSecondCheck ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-label-uppercase text-label-uppercase text-on-surface uppercase flex items-center gap-1"><Icon name="verified_user" className="text-secondary text-[20px]" />Independent verification</h2>
                    <span className={`px-2 py-0.5 rounded font-label-badge text-label-badge font-bold ${checker ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-error-container text-on-error-container'}`}>{checker ? 'Co-signed' : 'Co-sign required'}</span>
                  </div>
                  <SecondNurseChecks />
                  <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-space-sm">
                    {checker ? <p className="flex items-center gap-2 text-sync-green font-semibold"><Icon name="verified_user" filled />Checked by {checker.name}</p> : <SecondCheckBody second={second} />}
                  </div>
                  <p className="font-body-sm text-[12px] text-secondary">PIN only. ClinBridge has no badge or wristband reader.</p>
                </>
              ) : <p className="font-body-md text-body-md text-on-surface-variant">No second nurse is asked for on this record. Read it once more, then save.</p>}
              {buttons}
            </section>
          </div>
          <ChangeLogFooter wide={wide} second={v.needsSecondCheck} />
        </div>
      );
    }
    return (
      <Card className="flex flex-col gap-space-md">
        <h2 className="font-headline-md text-headline-md text-primary">Check before saving</h2>
        {v.needsSecondCheck && <HighAlertBar />}
        {summary}
        {v.needsSecondCheck && (
          checker
            ? <p className="flex items-center gap-2 text-sync-green font-semibold"><Icon name="verified_user" filled />Checked by {checker.name}</p>
            : <Button variant="danger" className="self-start" onClick={() => setAskCheck(true)}><Icon name="group" />Second nurse check</Button>
        )}
        {buttons}
        {askCheck && <SecondCheckDialog second={second} onCancel={() => setAskCheck(false)} />}
      </Card>
    );
  }

  const formCard = (
    <Card className="flex flex-col gap-space-md">
      {v.needsSecondCheck && !wide && <HighAlertBar />}
      <fieldset>
        <legend className="font-label-uppercase text-label-uppercase text-secondary uppercase mb-1">What happened?</legend>
        <div className="flex flex-wrap gap-space-sm">
          {events.map((ev) => (
            <button key={ev} type="button" aria-pressed={form.event === ev} onClick={() => setForm({ ...form, event: ev })}
              className={`min-h-11 px-space-md rounded-lg border font-body-md ${form.event === ev ? 'bg-primary-container text-on-primary border-primary-container' : 'border-card-border bg-surface-container-lowest'}`}>{EVENT_LABEL[ev]}</button>
          ))}
        </div>
      </fieldset>

      <div className={rowCls}>
        <div className="flex flex-col gap-1">
          <label htmlFor="care" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Time</label>
          <input id="care" type="datetime-local" value={care} onChange={(e) => setCare(e.target.value)} aria-invalid={!!errors.care} className={field(errors.care)} />
          {errors.care && <span className="text-error font-body-sm">{errors.care}</span>}
        </div>
      </div>

      {form.event === 'administered' && (
        <>
          <SectionLabel>Dose</SectionLabel>
          <div className={rowCls}>
            <div className="flex flex-col gap-1">
              <label htmlFor="dose" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Dose given</label>
              <input id="dose" inputMode="decimal" value={form.dose} onChange={set('dose')} aria-invalid={!!errors.dose} className={`${field(errors.dose)} font-code-tabular text-[20px] font-semibold`} />
              {errors.dose && <span className="text-error font-body-sm">{errors.dose}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="unit" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Unit</label>
              <select id="unit" value={form.unit} onChange={set('unit')} aria-invalid={!!errors.unit} className={field(errors.unit)}>
                <option value="">Pick…</option>{DOSE_UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
              {errors.unit && <span className="text-error font-body-sm">{errors.unit}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="route" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Route (how given)</label>
              <select id="route" value={form.route} onChange={set('route')} aria-invalid={!!errors.route} className={field(errors.route)}>
                <option value="">Pick…</option>{ROUTES.map((r) => <option key={r} value={r}>{r} — {ROUTE_LABEL[r]}</option>)}
              </select>
              {errors.route && <span className="text-error font-body-sm">{errors.route}</span>}
            </div>
          </div>
          {['IV', 'SC', 'IM'].includes(form.route) && (
            <div className={wide ? 'flex flex-col gap-1' : 'flex flex-col gap-1 w-full max-w-md'}>
              <label htmlFor="site" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Site (optional)</label>
              <input id="site" list="site-words" value={form.site} onChange={set('site')} className={field()} placeholder="e.g. Abdomen, left side" />
              <datalist id="site-words">{SITE_WORDS.map((s) => <option key={s} value={s} />)}</datalist>
              {recentSites.length > 0 && (
                <span className="font-body-sm text-on-surface-variant">Last sites: {recentSites.map((r) => `${r.site} (${hm(r.time)})`).join(' · ')}</span>
              )}
              <span className="font-body-sm text-secondary">Left and right mean the patient’s left and right.</span>
            </div>
          )}
        </>
      )}

      {form.event === 'rate_changed' && (
        <div className={rowCls}>
          <div className="flex flex-col gap-1">
            <span className="font-label-uppercase text-label-uppercase text-secondary uppercase">Current rate</span>
            <span className="h-12 flex items-center font-code-tabular text-[20px] text-primary">{priorRate != null ? formatDose(priorRate) : '—'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="rate" className="font-label-uppercase text-label-uppercase text-secondary uppercase">New rate</label>
            <input id="rate" inputMode="decimal" value={form.rate} onChange={set('rate')} aria-invalid={!!errors.rate} className={`${field(errors.rate)} font-code-tabular text-[20px] font-semibold`} />
            {errors.rate && <span className="text-error font-body-sm">{errors.rate}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="rateUnit" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Unit</label>
            <select id="rateUnit" value={form.rateUnit} onChange={set('rateUnit')} aria-invalid={!!errors.rateUnit} className={field(errors.rateUnit)}>
              <option value="">Pick…</option>{RATE_UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
            {errors.rateUnit && <span className="text-error font-body-sm">{errors.rateUnit}</span>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="mreason" className="font-label-uppercase text-label-uppercase text-secondary uppercase">
          {form.event === 'held' ? 'Why was it held?' : form.event === 'refused' ? 'What did the patient say?' : 'Note (optional)'}
        </label>
        <input id="mreason" value={form.reason} onChange={set('reason')} aria-invalid={!!errors.reason} className={field(errors.reason)} />
        {errors.reason && <span className="text-error font-body-sm">{errors.reason}</span>}
      </div>

      {requireChangeReason && (
        <div className="flex flex-col gap-1">
          <label htmlFor="changeReason" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Why are you fixing this?</label>
          <input id="changeReason" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} aria-invalid={!!errors.changeReason} className={field(errors.changeReason)} placeholder="e.g. typed 50 instead of 5" />
          {errors.changeReason && <span className="text-error font-body-sm">{errors.changeReason}</span>}
        </div>
      )}

      <div className="flex gap-space-sm">
        <Button onClick={next}>Review<Icon name="arrow_forward" /></Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>

    </Card>
  );
  if (!wide) return formCard;
  return (
    <div className="flex flex-col gap-space-md">
      {v.needsSecondCheck && <HighAlertBar />}
      <StepBar current="fill" second={v.needsSecondCheck} checked={false} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start">
        <div className="lg:col-span-7"><DrugCard order={order} wide={wide} /></div>
        <div className="lg:col-span-5 lg:row-span-2 flex flex-col gap-space-md">
          {formCard}
          {v.needsSecondCheck && (
            <section aria-label="Independent verification" className="bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm flex flex-col gap-space-sm">
              <h2 className="font-label-uppercase text-label-uppercase text-on-surface uppercase flex items-center gap-1"><Icon name="verified_user" className="text-secondary text-[20px]" />Independent verification</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">After Review, another nurse checks this record and enters their own PIN here. Saving stays off until then.</p>
              <SecondNurseChecks />
            </section>
          )}
        </div>
        {v.needsSecondCheck && <div className="lg:col-span-7"><PreparationCard recorder={wide.recorder} doseText={doseText} /></div>}
      </div>
      <ChangeLogFooter wide={wide} second={v.needsSecondCheck} />
    </div>
  );
}
