import { useState } from 'react';
import type { VitalSign } from '../../db/schema';
import { useApp } from '../../state/app';
import { CONSCIOUSNESS_OPTIONS, VITAL_RULES, isOutsideNormal, validateVitals, type VitalKey, type VitalsForm, type VitalsValues } from '../../lib/vitals';
import { dateTimeLabel, fromLocalInput, toLocalInput } from '../../lib/time';
import { Badge, Button, Card, Icon, SectionLabel } from '../../components/ui';

/**
 * Shared vitals form for "Record vitals" and "Fix" (correction).
 * Two steps: fill → review. Nothing is written until the nurse presses Save on the review step.
 * Care time (when it was measured) is separate from entry time (when it was typed): late entries are honest.
 */
export interface VitalsSubmit { values: VitalsValues; careTime: string; reason?: string }

const MAIN: VitalKey[] = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'spo2', 'temp_c', 'resp_rate'];
const MORE: VitalKey[] = ['pain_0_10', 'glucose_mgdl', 'o2_flow_lpm'];

function Field({ k, form, setForm, error }: { k: VitalKey; form: VitalsForm; setForm: (f: VitalsForm) => void; error?: string }) {
  const r = VITAL_RULES[k];
  const id = `v-${k}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-label-uppercase text-label-uppercase text-secondary uppercase">{r.label}</label>
      <div className={`flex items-center h-12 rounded-lg border bg-surface-container-lowest focus-within:ring-2 focus-within:ring-secondary ${error ? 'border-error' : 'border-card-border'}`}>
        <input
          id={id} inputMode={r.integer ? 'numeric' : 'decimal'} autoComplete="off"
          className="flex-1 min-w-0 h-full bg-transparent px-space-md font-code-tabular text-[20px] font-semibold text-primary outline-none"
          value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
        />
        <span className="px-space-md text-secondary font-body-sm">{r.unit}</span>
      </div>
      {error && <span id={`${id}-err`} className="text-error font-body-sm text-body-sm flex items-center gap-1"><Icon name="error" className="text-[16px]" />{error}</span>}
    </div>
  );
}

export function VitalsEditor({ initial, initialCareTime, minCareTime, requireReason, saveLabel, onSubmit, onCancel }: {
  initial?: VitalsForm;
  initialCareTime?: string;
  minCareTime?: string;
  requireReason?: boolean;
  saveLabel: string;
  onSubmit: (s: VitalsSubmit) => Promise<void>;
  onCancel: () => void;
}) {
  const { clock } = useApp();
  const [form, setForm] = useState<VitalsForm>(initial ?? {});
  const [care, setCare] = useState(toLocalInput(initialCareTime ?? clock.nowIso()));
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'fill' | 'review'>('fill');
  const [showMore, setShowMore] = useState(MORE.some((k) => initial?.[k]) || !!initial?.o2_device || !!initial?.consciousness);
  const [errors, setErrors] = useState<ReturnType<typeof validateVitals>['errors'] & { care?: string; reason?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const v = validateVitals(form);
  const careIso = fromLocalInput(care, clock.offsetMinutes);

  function next() {
    const e: typeof errors = { ...v.errors };
    if (!care || Number.isNaN(Date.parse(careIso))) e.care = 'Enter when it was measured';
    else if (Date.parse(careIso) > clock.now() + 60_000) e.care = 'Time cannot be in the future';
    else if (minCareTime && Date.parse(careIso) < Date.parse(minCareTime)) e.care = 'Time is before this patient was admitted';
    if (requireReason && !reason.trim()) e.reason = 'Say why you are fixing this';
    setErrors(e);
    if (Object.keys(e).length === 0) setStep('review');
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
    const shown = (Object.keys(VITAL_RULES) as VitalKey[]).filter((k) => v.values[k] != null);
    return (
      <Card className="flex flex-col gap-space-md">
        <h2 className="font-headline-md text-headline-md text-primary">Check before saving</h2>
        <p className="font-body-md text-on-surface-variant">Measured at <strong className="text-primary">{dateTimeLabel(careIso)}</strong></p>
        <dl className="grid grid-cols-2 lg:grid-cols-3 gap-space-sm">
          {shown.map((k) => {
            const r = VITAL_RULES[k];
            const n = v.values[k] as number;
            const out = isOutsideNormal(k, n);
            return (
              <div key={k} className={`rounded-lg border p-space-md ${out ? 'border-downtime-amber-border bg-downtime-amber-bg' : 'border-card-border bg-surface-container-low'}`}>
                <dt className="font-label-uppercase text-label-uppercase text-secondary uppercase">{r.label}</dt>
                <dd className="font-code-tabular text-[22px] font-bold text-primary">{n} <span className="text-body-sm font-normal text-secondary">{r.unit}</span></dd>
                {out && <Badge tone="amber" icon="warning">Outside usual range</Badge>}
              </div>
            );
          })}
          {v.values.o2_device && <div className="rounded-lg border border-card-border bg-surface-container-low p-space-md"><dt className="font-label-uppercase text-label-uppercase text-secondary uppercase">Oxygen given by</dt><dd className="font-body-lg text-primary">{v.values.o2_device}</dd></div>}
          {v.values.consciousness && <div className="rounded-lg border border-card-border bg-surface-container-low p-space-md"><dt className="font-label-uppercase text-label-uppercase text-secondary uppercase">Awake?</dt><dd className="font-body-lg text-primary">{v.values.consciousness}</dd></div>}
        </dl>
        {requireReason && <p className="font-body-md"><span className="text-secondary">Reason for fix: </span>{reason}</p>}
        {saveError && <p role="alert" className="text-error font-body-md flex items-center gap-1"><Icon name="error" />{saveError}</p>}
        <div className="flex gap-space-sm">
          <Button onClick={save} disabled={saving}><Icon name="save" />{saving ? 'Saving…' : saveLabel}</Button>
          <Button variant="secondary" onClick={() => setStep('fill')} disabled={saving}>Go back</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-space-md">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-space-md items-start">
        <div className="flex flex-col gap-1">
          <label htmlFor="care" className="font-label-uppercase text-label-uppercase text-secondary uppercase">When measured</label>
          <input id="care" type="datetime-local" value={care} onChange={(e) => setCare(e.target.value)} aria-invalid={!!errors.care}
            className={`h-12 rounded-lg border px-space-md font-code-tabular bg-surface-container-lowest ${errors.care ? 'border-error' : 'border-card-border'}`} />
          {errors.care && <span className="text-error font-body-sm">{errors.care}</span>}
        </div>
        {errors.form && <p role="alert" className="self-end text-error font-body-md">{errors.form}</p>}
      </div>
      <SectionLabel>Main</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-space-md">
        {MAIN.map((k) => <Field key={k} k={k} form={form} setForm={setForm} error={errors[k]} />)}
      </div>
      {showMore ? (
        <>
          <SectionLabel>More</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-space-md">
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
              {CONSCIOUSNESS_OPTIONS.map((o) => (
                <button key={o} type="button" aria-pressed={form.consciousness === o}
                  onClick={() => setForm({ ...form, consciousness: form.consciousness === o ? '' : o })}
                  className={`min-h-11 px-space-md rounded-lg border font-body-md ${form.consciousness === o ? 'bg-primary-container text-on-primary border-primary-container' : 'border-card-border bg-surface-container-lowest'}`}>{o}</button>
              ))}
            </div>
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
