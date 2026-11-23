import { useEffect, useState, type ReactNode } from 'react';
import type { VitalSign } from '../../db/schema';
import { useApp } from '../../state/app';
import { CONSCIOUSNESS_OPTIONS, VITAL_RULES, isUnusual, validateVitals, type VitalKey, type VitalsForm, type VitalsValues } from '../../lib/vitals';
import { dateTimeLabel, fromLocalInput, toLocalInput } from '../../lib/time';
import { Badge, Button, Card, Icon, SectionLabel } from '../../components/ui';
import { MedIllustration, type MedicalAsset } from '../../components/MedIllustration';
import { SourceCheck } from '../capture/SourceCheck';

/**
 * Shared vitals form for "Record vitals" and "Fix" (correction).
 * Two steps: fill → review. Nothing is written until the nurse presses Save on the review step.
 * Care time (when it was measured) is separate from entry time (when it was typed): late entries are honest.
 */
export interface VitalsSubmit { values: VitalsValues; careTime: string; reason?: string }

const FIELD_ART: Partial<Record<VitalKey, MedicalAsset>> = {
  bp_systolic: 'vitals/bp-monitor', bp_diastolic: 'vitals/bp-monitor', heart_rate: 'vitals/heart', spo2: 'vitals/pulse-oximeter',
  temp_c: 'vitals/thermometer', resp_rate: 'vitals/lungs', glucose_mgdl: 'vitals/glucose-meter',
};
/** Step of the − and + buttons. They change a typed number only: an empty box stays empty, so no value is ever suggested. */
const STEP: Partial<Record<VitalKey, number>> = { temp_c: 0.1, glucose_mgdl: 5, o2_flow_lpm: 0.5 };

export function stepValue(k: VitalKey, current: string | undefined, dir: 1 | -1): string | null {
  const raw = (current ?? '').trim();
  if (!/^\d{1,4}(\.\d+)?$/.test(raw)) return null;
  const n = Math.round((Number(raw) + dir * (STEP[k] ?? 1)) * 10) / 10;
  const [lo, hi] = VITAL_RULES[k].scale ?? [0, 9999];
  return n < lo || n > hi ? null : String(n);
}

/** Columns follow the space the form really has, so a number never loses digits in a narrow pane. At most three. */
const GRID = 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(15rem,30%)),1fr))] gap-space-md';

const MAIN: VitalKey[] = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'spo2', 'temp_c', 'resp_rate'];
const MORE: VitalKey[] = ['pain_0_10', 'glucose_mgdl', 'o2_flow_lpm'];

function Field({ k, form, setForm, error }: { k: VitalKey; form: VitalsForm; setForm: (f: VitalsForm) => void; error?: string }) {
  const r = VITAL_RULES[k];
  const id = `v-${k}`;
  const step = (dir: 1 | -1) => { const v = stepValue(k, form[k], dir); if (v != null) setForm({ ...form, [k]: v }); };
  const stepBtn = (dir: 1 | -1) => (
    <button type="button" onClick={() => step(dir)} disabled={stepValue(k, form[k], dir) == null}
      className="h-full w-11 shrink-0 grid place-items-center text-[20px] font-bold text-primary bg-surface-container-low hover:bg-surface-container disabled:text-outline disabled:cursor-not-allowed">
      <span aria-hidden>{dir < 0 ? '−' : '+'}</span><span className="sr-only">{r.label}: {dir < 0 ? 'lower' : 'raise'}</span>
    </button>
  );
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-label-uppercase text-label-uppercase text-secondary uppercase flex items-center gap-1.5">
        {FIELD_ART[k] && <MedIllustration name={FIELD_ART[k]!} size={20} />}{r.label}
      </label>
      <div className={`flex items-center h-12 rounded-lg border overflow-hidden bg-surface-container-lowest focus-within:ring-2 focus-within:ring-secondary ${error ? 'border-error' : 'border-card-border'}`}>
        {stepBtn(-1)}
        <input
          id={id} inputMode={r.integer ? 'numeric' : 'decimal'} autoComplete="off"
          className="flex-1 min-w-0 h-full bg-transparent px-2 text-center font-code-tabular text-[20px] font-semibold text-primary outline-none"
          value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
        />
        <span className="pr-2 text-secondary font-body-sm whitespace-nowrap">{r.unit}</span>
        {stepBtn(1)}
      </div>
      {error && <span id={`${id}-err`} className="text-error font-body-sm text-body-sm flex items-center gap-1"><Icon name="error" className="text-[16px]" />{error}</span>}
    </div>
  );
}

/** How a value compares with the proposal stored with the record. Says only what the two hold; no confidence figure. */
export function proposalNote(proposal: Record<string, unknown>, keys: string[], now: string): { text: string; differs: boolean } {
  const said = keys.map((k) => proposal[k]);
  if (said.every((x) => x == null)) return { text: 'Not in the proposal', differs: false };
  const unclear = Array.isArray(proposal.unclear) && keys.some((k) => (proposal.unclear as unknown[]).includes(k));
  const then = said.map((x) => (x == null ? '—' : String(x))).join(' / ');
  const same = then === now;
  return { text: `${same ? 'Same as the proposal' : `Proposal said ${then}`}${unclear ? '. Marked unclear in the proposal' : ''}`, differs: !same || unclear };
}

/** One value on the check step: the value in large type, what to check, and a pencil that goes back to that box. */
function ReviewRow({ label, art, icon, value, unit, unusual, note, differs, onEdit }: {
  label: string; art?: MedicalAsset; icon?: string; value: ReactNode; unit?: string; unusual?: boolean; note?: string; differs?: boolean; onEdit: () => void;
}) {
  return (
    <div className={`rounded-lg border p-space-md flex flex-col gap-1 ${unusual ? 'border-downtime-amber-border bg-downtime-amber-bg' : 'border-card-border bg-surface-container-low'}`}>
      <dt className="flex items-center gap-2">
        <span className="w-7 h-7 shrink-0 grid place-items-center">{art ? <MedIllustration name={art} size={26} /> : <Icon name={icon ?? 'edit_note'} className="text-secondary" />}</span>
        <span className="flex-1 min-w-0 text-[16px] leading-tight font-semibold text-primary">{label}</span>
        <button type="button" onClick={onEdit} className="w-11 h-11 -my-2 -mr-2 shrink-0 grid place-items-center rounded-lg text-primary hover:bg-surface-container">
          <Icon name="edit" className="text-[20px]" /><span className="sr-only">Edit {label}</span>
        </button>
      </dt>
      <dd className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <span className="font-code-tabular text-[26px] leading-tight font-bold text-primary [overflow-wrap:anywhere]">{value}{unit && <span className="text-body-sm font-normal text-secondary"> {unit}</span>}</span>
        {unusual && <Badge tone="amber" icon="warning">Unusual — check</Badge>}
      </dd>
      {note && <dd className={`font-body-sm text-body-sm ${differs ? 'text-[#7a5410] font-semibold' : 'text-secondary'}`}>{note}</dd>}
    </div>
  );
}

export function VitalsEditor({ initial, initialCareTime, minCareTime, requireReason, startAtReview, sourceCheck, proposal, saveLabel, onSubmit, onCancel }: {
  initial?: VitalsForm;
  initialCareTime?: string;
  minCareTime?: string;
  requireReason?: boolean;
  /** Open on the check step when the starting values are valid (a saved draft). Every value still has its own Edit button. */
  startAtReview?: boolean;
  /** Ask for the "I checked every value against the paper" tick before saving. */
  sourceCheck?: boolean;
  /** The proposal stored with the record, to show where the values differ from it. */
  proposal?: Record<string, unknown> | null;
  saveLabel: string;
  onSubmit: (s: VitalsSubmit) => Promise<void>;
  onCancel: () => void;
}) {
  const { clock } = useApp();
  const [form, setForm] = useState<VitalsForm>(initial ?? {});
  const [care, setCare] = useState(toLocalInput(initialCareTime ?? clock.nowIso()));
  const [reason, setReason] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(MORE.some((k) => initial?.[k]) || !!initial?.o2_device || !!initial?.consciousness);
  const [errors, setErrors] = useState<ReturnType<typeof validateVitals>['errors'] & { care?: string; reason?: string }>(() => (startAtReview ? validateVitals(initial ?? {}).errors : {}));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [sourceChecked, setSourceChecked] = useState(false);
  const v = validateVitals(form);
  const careIso = fromLocalInput(care, clock.offsetMinutes);

  function problems() {
    const e: typeof errors = { ...v.errors };
    if (!care || Number.isNaN(Date.parse(careIso))) e.care = 'Enter when it was measured';
    else if (Date.parse(careIso) > clock.now() + 60_000) e.care = 'Time cannot be in the future';
    else if (minCareTime && Date.parse(careIso) < Date.parse(minCareTime)) e.care = 'Time is before this patient was admitted';
    if (requireReason && !reason.trim()) e.reason = 'Say why you are fixing this';
    return e;
  }
  const [step, setStep] = useState<'fill' | 'review'>(() => (startAtReview && Object.keys(problems()).length === 0 ? 'review' : 'fill'));

  // After "Edit <value>": the form is open again and that box has the focus.
  useEffect(() => {
    if (step !== 'fill' || !focus) return;
    document.getElementById(focus)?.focus();
    setFocus(null);
  }, [step, focus]);
  const edit = (id: string, more: boolean) => { if (more) setShowMore(true); setFocus(id); setStep('fill'); };

  function next() {
    const e = problems();
    setErrors(e);
    if (Object.keys(e).length === 0) { setChecked(false); setSourceChecked(false); setStep('review'); }
    else document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit({ values: v.values, careTime: careIso, reason: requireReason ? reason.trim() : undefined });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  if (step === 'review') {
    const shown = (Object.keys(VITAL_RULES) as VitalKey[]).filter((k) => v.values[k] != null && k !== 'bp_systolic' && k !== 'bp_diastolic');
    const { bp_systolic: sys, bp_diastolic: dia } = v.values;
    const about = (keys: string[], now: string) => {
      const n = proposal ? proposalNote(proposal, keys, now) : null;
      return n ? { note: n.text, differs: n.differs } : sourceCheck ? { note: 'Check it against the paper' } : {};
    };
    return (
      <Card className="flex flex-col gap-space-md">
        <h2 className="font-headline-md text-headline-md text-primary">Check before saving</h2>
        <p className="font-body-md text-on-surface-variant flex flex-wrap items-center gap-x-2">Measured at <strong className="text-primary">{dateTimeLabel(careIso)}</strong>
          <Button variant="ghost" className="px-2" onClick={() => edit('care', false)}><Icon name="edit" className="text-[18px]" />Edit time</Button></p>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(15rem,30%)),1fr))] gap-space-sm">
          {sys != null && dia != null && (
            <ReviewRow label="Blood pressure" art={FIELD_ART.bp_systolic} value={`${sys} / ${dia}`} unit="mmHg" unusual={isUnusual('bp_systolic', sys) || isUnusual('bp_diastolic', dia)}
              {...about(['bp_systolic', 'bp_diastolic'], `${sys} / ${dia}`)} onEdit={() => edit('v-bp_systolic', false)} />
          )}
          {shown.map((k) => (
            <ReviewRow key={k} label={VITAL_RULES[k].label} art={FIELD_ART[k]} icon={k === 'pain_0_10' ? 'sentiment_stressed' : 'air'} value={v.values[k] as number} unit={VITAL_RULES[k].unit}
              unusual={isUnusual(k, v.values[k] as number)} {...about([k], String(v.values[k]))} onEdit={() => edit(`v-${k}`, MORE.includes(k))} />
          ))}
          {v.values.o2_device && <ReviewRow label="Oxygen given by" icon="air" value={v.values.o2_device} {...about(['o2_device'], v.values.o2_device)} onEdit={() => edit('o2dev', true)} />}
          {v.values.consciousness && <ReviewRow label="Awake?" icon="visibility" value={v.values.consciousness} {...about(['consciousness'], v.values.consciousness)} onEdit={() => edit('awake', true)} />}
        </dl>
        {v.warnings.length > 0 && (
          <div className="rounded-lg border border-downtime-amber-border bg-downtime-amber-bg p-space-md flex flex-col gap-space-sm" role="alert">
            <p className="font-headline-sm text-headline-sm text-[#7a5410] flex items-center gap-2"><Icon name="warning" />Check these values</p>
            <ul className="list-disc pl-6 font-body-md">{v.warnings.map((w) => <li key={w.key}>{w.text}</li>)}</ul>
            <label className="flex items-center gap-2 min-h-11 font-body-md font-semibold cursor-pointer">
              <input type="checkbox" className="w-5 h-5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              I re-checked these values and they are right
            </label>
            <p className="font-body-sm text-secondary">Warning ranges are drafts awaiting clinical review. They never stop you saving a value you checked.</p>
          </div>
        )}
        {requireReason && <p className="font-body-md"><span className="text-secondary">Reason for fix: </span>{reason}</p>}
        {sourceCheck && <SourceCheck checked={sourceChecked} onChange={setSourceChecked} />}
        {saveError && <p role="alert" className="text-error font-body-md flex items-center gap-1"><Icon name="error" />{saveError}</p>}
        <div className="flex gap-space-sm">
          <Button onClick={save} disabled={saving || (v.warnings.length > 0 && !checked) || (sourceCheck && !sourceChecked)}><Icon name="save" />{saving ? 'Saving…' : saveLabel}</Button>
          <Button variant="secondary" onClick={() => setStep('fill')} disabled={saving}>{startAtReview ? 'Edit values' : 'Go back'}</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-space-md">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-space-md items-start">
        <div className="flex flex-col gap-1">
          <label htmlFor="care" className="font-label-uppercase text-label-uppercase text-secondary uppercase">When measured</label>
          <input id="care" type="datetime-local" value={care} onChange={(e) => setCare(e.target.value)} aria-invalid={!!errors.care}
            className={`h-12 rounded-lg border px-space-md font-code-tabular bg-surface-container-lowest ${errors.care ? 'border-error' : 'border-card-border'}`} />
          {errors.care && <span className="text-error font-body-sm">{errors.care}</span>}
        </div>
        {errors.form && <p role="alert" className="self-end text-error font-body-md">{errors.form}</p>}
      </div>
      <SectionLabel>Main</SectionLabel>
      <div className={GRID}>
        {MAIN.map((k) => <Field key={k} k={k} form={form} setForm={setForm} error={errors[k]} />)}
      </div>
      {showMore ? (
        <>
          <SectionLabel>More</SectionLabel>
          <div className={GRID}>
            {MORE.map((k) => <Field key={k} k={k} form={form} setForm={setForm} error={errors[k]} />)}
            <div className="flex flex-col gap-1">
              <label htmlFor="o2dev" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Oxygen given by</label>
              <input id="o2dev" value={form.o2_device ?? ''} onChange={(e) => setForm({ ...form, o2_device: e.target.value })} placeholder="e.g. nasal cannula"
                className="h-12 rounded-lg border border-card-border px-space-md bg-surface-container-lowest" />
            </div>
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="font-label-uppercase text-label-uppercase text-secondary uppercase mb-1">Awake? (consciousness level)</legend>
            <div className="flex flex-wrap gap-space-sm">
              {CONSCIOUSNESS_OPTIONS.map((o, i) => (
                <button key={o} id={i === 0 ? 'awake' : undefined} type="button" aria-pressed={form.consciousness === o}
                  onClick={() => setForm({ ...form, consciousness: form.consciousness === o ? '' : o })}
                  className={`min-h-11 px-space-md rounded-lg border font-body-md ${form.consciousness === o ? 'bg-primary-container text-on-primary border-primary-container' : 'border-card-border bg-surface-container-lowest'}`}>{o}</button>
              ))}
            </div>
            {errors.consciousness && <span className="text-error font-body-sm">{errors.consciousness}</span>}
          </fieldset>
        </>
      ) : (
        <Button variant="ghost" className="self-start" onClick={() => setShowMore(true)}><Icon name="add" />More (pain, blood sugar, oxygen)</Button>
      )}
      {requireReason && (
        <div className="flex flex-col gap-1">
          <label htmlFor="reason" className="font-label-uppercase text-label-uppercase text-secondary uppercase">Why are you fixing this?</label>
          <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!errors.reason}
            className={`h-12 rounded-lg border px-space-md bg-surface-container-lowest ${errors.reason ? 'border-error' : 'border-card-border'}`} placeholder="e.g. typed pulse wrong" />
          {errors.reason && <span className="text-error font-body-sm">{errors.reason}</span>}
        </div>
      )}
      <p className="font-body-sm text-body-sm text-secondary">The − and + buttons change a number you typed. Nothing is filled in for you.</p>
      <div className="flex gap-space-sm">
        <Button onClick={next}>Review<Icon name="arrow_forward" /></Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}

export const vitalsToForm = (v: VitalSign | undefined): VitalsForm => {
  if (!v) return {};
  const f: VitalsForm = {};
  for (const k of Object.keys(VITAL_RULES) as VitalKey[]) if (v[k] != null) f[k] = String(v[k]);
  if (v.o2_device) f.o2_device = v.o2_device;
  if (v.consciousness) f.consciousness = v.consciousness;
  return f;
};
