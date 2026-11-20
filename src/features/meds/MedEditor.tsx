import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ActiveOrder, MedAdmin, Practitioner } from '../../db/schema';
import { useApp, useSession } from '../../state/app';
import { DOSE_UNITS, RATE_UNITS, ROUTES, ROUTE_LABEL, SECOND_CHECKER_ROLES, SITE_WORDS } from '../../config/medicationPolicy';
import { EVENT_LABEL, orderDose, validateMed, type MedEvent, type MedForm } from '../../lib/meds';
import { formatDose } from '../../lib/dose';
import { dateTimeLabel, fromLocalInput, hm, toLocalInput } from '../../lib/time';
import { Button, Card, Dialog, Icon, SectionLabel } from '../../components/ui';
import { PinPad } from '../auth/PinPad';
import { usePinCheck } from '../auth/SignIn';

export interface MedSubmit { values: Omit<MedAdmin, 'id' | 'entry_id'>; careTime: string; changeReason?: string }

/** Red bar for high-alert drugs. Never hidden (UI/UX: safety beats tidiness). */
export function HighAlertBar() {
  return (
    <div role="note" className="rounded-lg bg-clinical-red text-white px-space-md py-space-sm flex items-center gap-2 font-body-md font-semibold">
      <Icon name="warning" filled />High-alert drug · a second nurse must check · they sign with their own PIN
    </div>
  );
}

function SecondCheckDialog({ onDone, onCancel }: { onDone: (p: Practitioner) => void; onCancel: () => void }) {
  const { db } = useApp();
  const { user } = useSession();
  const staff = useLiveQuery(() => db.practitioner.toArray(), [db]);
  const eligible = (staff ?? []).filter((p) => p.active && p.id !== user?.id && SECOND_CHECKER_ROLES.includes(p.role));
  const [who, setWho] = useState<Practitioner | null>(null);
  const check = usePinCheck(who, onDone);
  return (
    <Dialog title="Second nurse check" onClose={onCancel}>
      {!who ? (
        <>
          <p className="text-on-surface-variant">A different nurse checks the drug, dose and patient, then enters their own PIN.</p>
          <div className="grid grid-cols-2 gap-space-sm">
            {eligible.map((p) => (
              <button key={p.id} onClick={() => setWho(p)} className="min-h-14 rounded-lg border border-card-border px-3 text-left hover:bg-surface-container-low">
                <span className="block font-semibold text-primary">{p.name}</span><span className="text-body-sm text-secondary">{p.role}</span>
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
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
    </Dialog>
  );
}

const field = (err?: string) => `h-12 rounded-lg border px-space-md bg-surface-container-lowest ${err ? 'border-error' : 'border-card-border'}`;

export function MedEditor({ order, initial, events, priorRate, initialCareTime, scheduledTime, minCareTime, requireChangeReason, saveLabel, onSubmit, onCancel }: {
  order: ActiveOrder;
  initial: MedForm;
  events: MedEvent[];
  priorRate: number | null;
  initialCareTime?: string;
  scheduledTime?: string | null;
  minCareTime?: string;
  requireChangeReason?: boolean;
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
  const [checker, setChecker] = useState<Practitioner | null>(null);
  const [askCheck, setAskCheck] = useState(false);
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
    if (Object.keys(e).length === 0) { setTicked(false); setChecker(null); setStep('review'); }
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

  const canSave = !saving && (v.warnings.length === 0 || ticked) && (!v.needsSecondCheck || !!checker);

  if (step === 'review') {
    const val = v.values;
    return (
      <Card className="flex flex-col gap-space-md">
        <h2 className="font-headline-md text-headline-md text-primary">Check before saving</h2>
        {v.needsSecondCheck && <HighAlertBar />}
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
        {v.needsSecondCheck && (
          checker
            ? <p className="flex items-center gap-2 text-sync-green font-semibold"><Icon name="verified_user" filled />Checked by {checker.name}</p>
            : <Button variant="danger" className="self-start" onClick={() => setAskCheck(true)}><Icon name="group" />Second nurse check</Button>
        )}
        {saveError && <p role="alert" className="text-error flex items-center gap-1"><Icon name="error" />{saveError}</p>}
        <div className="flex gap-space-sm">
          <Button onClick={save} disabled={!canSave}><Icon name="save" />{saving ? 'Saving…' : saveLabel}</Button>
          <Button variant="secondary" onClick={() => setStep('fill')} disabled={saving}>Go back</Button>
        </div>
        {askCheck && <SecondCheckDialog onCancel={() => setAskCheck(false)} onDone={(p) => { setChecker(p); setAskCheck(false); }} />}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-space-md">
      {v.needsSecondCheck && <HighAlertBar />}
      <fieldset>
        <legend className="font-label-uppercase text-label-uppercase text-secondary uppercase mb-1">What happened?</legend>
        <div className="flex flex-wrap gap-space-sm">
          {events.map((ev) => (
            <button key={ev} type="button" aria-pressed={form.event === ev} onClick={() => setForm({ ...form, event: ev })}
              className={`min-h-11 px-space-md rounded-lg border font-body-md ${form.event === ev ? 'bg-primary-container text-on-primary border-primary-container' : 'border-card-border bg-surface-container-lowest'}`}>{EVENT_LABEL[ev]}</button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        <div className="flex flex-col gap-1">
          <label htmlFor="care" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Time</label>
          <input id="care" type="datetime-local" value={care} onChange={(e) => setCare(e.target.value)} aria-invalid={!!errors.care} className={field(errors.care)} />
          {errors.care && <span className="text-error font-body-sm">{errors.care}</span>}
        </div>
      </div>

      {form.event === 'administered' && (
        <>
          <SectionLabel>Dose</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
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
            <div className="flex flex-col gap-1 md:w-1/2">
              <label htmlFor="site" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Site (optional)</label>
              <input id="site" list="site-words" value={form.site} onChange={set('site')} className={field()} placeholder="e.g. Abdomen, left side" />
              <datalist id="site-words">{SITE_WORDS.map((s) => <option key={s} value={s} />)}</datalist>
              <span className="font-body-sm text-secondary">Left and right mean the patient’s left and right.</span>
            </div>
          )}
        </>
      )}

      {form.event === 'rate_changed' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
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
}
