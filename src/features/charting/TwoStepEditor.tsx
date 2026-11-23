import { Fragment, useState, type ReactNode } from 'react';
import { useApp } from '../../state/app';
import { dateTimeLabel, fromLocalInput, toLocalInput } from '../../lib/time';
import { Button, Card, Icon } from '../../components/ui';
import { SourceCheck } from '../capture/SourceCheck';

/**
 * Shared "fill → check → save" form used by fluids, notes and labs (vitals and medicines have their own).
 * Nothing is written until Save on the review step. Warnings never block but must be ticked.
 */
export interface Checked<V> { ok: boolean; errors: Record<string, string | undefined>; warnings?: string[]; values: V }

export const fieldCls = (err?: string) => `h-12 rounded-lg border px-space-md bg-surface-container-lowest w-full ${err ? 'border-error' : 'border-card-border'}`;
export const labelCls = 'font-label-uppercase text-label-uppercase text-secondary uppercase';

export function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
      {error && <span className="text-error font-body-sm" id={`${id}-err`}>{error}</span>}
    </div>
  );
}

export function TwoStepEditor<F, V>({ initial, validate, renderFill, renderReview, timeLabel = 'Time', initialCareTime, minCareTime, requireChangeReason, sourceCheck, saveLabel, cancelLabel = 'Cancel', onSubmit, onCancel }: {
  initial: F;
  validate: (f: F) => Checked<V>;
  renderFill: (f: F, set: (patch: Partial<F>) => void, errors: Record<string, string | undefined>) => ReactNode;
  renderReview: (v: V) => [string, ReactNode][];
  timeLabel?: string;
  initialCareTime?: string;
  minCareTime?: string;
  requireChangeReason?: boolean;
  /** Ask for the "I checked every value against the paper" tick before saving. */
  sourceCheck?: boolean;
  saveLabel: string;
  cancelLabel?: string;
  onSubmit: (s: { values: V; careTime: string; changeReason?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { clock } = useApp();
  const [form, setForm] = useState<F>(initial);
  const [care, setCare] = useState(toLocalInput(initialCareTime ?? clock.nowIso()));
  const [changeReason, setChangeReason] = useState('');
  const [step, setStep] = useState<'fill' | 'review'>('fill');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [ticked, setTicked] = useState(false);
  const [sourceChecked, setSourceChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const careIso = fromLocalInput(care, clock.offsetMinutes);
  const checked = validate(form);
  const warnings = checked.warnings ?? [];

  function next() {
    const e: Record<string, string | undefined> = Object.fromEntries(Object.entries(checked.errors).filter(([, v]) => v));
    if (!care || Number.isNaN(Date.parse(careIso))) e.care = 'Enter the time';
    else if (Date.parse(careIso) > clock.now() + 60_000) e.care = 'Time cannot be in the future';
    else if (minCareTime && Date.parse(careIso) < Date.parse(minCareTime)) e.care = 'Time is before this patient was admitted';
    if (requireChangeReason && !changeReason.trim()) e.changeReason = 'Say why you are fixing this';
    setErrors(e);
    if (Object.keys(e).length === 0) { setTicked(false); setSourceChecked(false); setStep('review'); }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit({ values: checked.values, careTime: careIso, changeReason: requireChangeReason ? changeReason.trim() : undefined });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save.');
      setSaving(false);
    }
  }

  if (step === 'review') {
    return (
      <Card className="flex flex-col gap-space-md">
        <h2 className="font-headline-md text-headline-md text-primary">Check before saving</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-space-sm font-body-lg">
          {renderReview(checked.values).map(([k, v]) => <Fragment key={k}><dt className="text-secondary">{k}</dt><dd className="text-primary whitespace-pre-wrap">{v}</dd></Fragment>)}
          <dt className="text-secondary">{timeLabel}</dt><dd className="font-code-tabular">{dateTimeLabel(careIso)}</dd>
          {requireChangeReason && <><dt className="text-secondary">Fix reason</dt><dd>{changeReason}</dd></>}
        </dl>
        {warnings.length > 0 && (
          <div className="rounded-lg border border-downtime-amber-border bg-downtime-amber-bg p-space-md flex flex-col gap-space-sm" role="alert">
            <p className="font-headline-sm text-headline-sm text-[#7a5410] flex items-center gap-2"><Icon name="warning" />Check this</p>
            <ul className="list-disc pl-6">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            <label className="flex items-center gap-2 min-h-11 font-semibold cursor-pointer">
              <input type="checkbox" className="w-5 h-5" checked={ticked} onChange={(e) => setTicked(e.target.checked)} />I checked this and want to save
            </label>
          </div>
        )}
        {sourceCheck && <SourceCheck checked={sourceChecked} onChange={setSourceChecked} />}
        {saveError && <p role="alert" className="text-error flex items-center gap-1"><Icon name="error" />{saveError}</p>}
        <div className="flex gap-space-sm">
          <Button onClick={save} disabled={saving || (warnings.length > 0 && !ticked) || (sourceCheck && !sourceChecked)}><Icon name="save" />{saving ? 'Saving…' : saveLabel}</Button>
          <Button variant="secondary" onClick={() => setStep('fill')} disabled={saving}>Go back</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-space-md">
      <div className="w-full max-w-72">
        <Field id="care" label={timeLabel} error={errors.care}>
          <input id="care" type="datetime-local" value={care} onChange={(e) => setCare(e.target.value)} aria-invalid={!!errors.care} className={`${fieldCls(errors.care)} font-code-tabular`} />
        </Field>
      </div>
      {renderFill(form, (patch) => setForm({ ...form, ...patch }), errors)}
      {requireChangeReason && (
        <Field id="changeReason" label="Why are you fixing this?" error={errors.changeReason}>
          <input id="changeReason" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} aria-invalid={!!errors.changeReason} className={fieldCls(errors.changeReason)} />
        </Field>
      )}
      <div className="flex gap-space-sm">
        <Button onClick={next}>Review<Icon name="arrow_forward" /></Button>
        <Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
      </div>
    </Card>
  );
}
