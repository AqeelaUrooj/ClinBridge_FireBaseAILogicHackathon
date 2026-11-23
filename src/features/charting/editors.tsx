import type { ActiveOrder, IntakeOutput, LabEvent, Note } from '../../db/schema';
import { useApp } from '../../state/app';
import { fromLocalInput, hm, toLocalInput } from '../../lib/time';
import {
  IO_IN, IO_METHODS, IO_OUT, LAB_STATUSES, NOTE_CATEGORIES, ioLabel, labLabel, noteLabel,
  validateIo, validateLab, validateNote, type IoForm, type LabForm, type NoteForm,
} from '../../lib/charting';
import { stepVolume } from './ioData';
import { Field, TwoStepEditor, fieldCls, labelCls } from './TwoStepEditor';

type Common<V> = {
  initialCareTime?: string;
  minCareTime?: string;
  requireChangeReason?: boolean;
  sourceCheck?: boolean;
  saveLabel: string;
  cancelLabel?: string;
  onSubmit: (s: { values: V; careTime: string; changeReason?: string }) => Promise<void>;
  onCancel: () => void;
};

function Choice({ name, value, options, onChange, error }: { name: string; value: string; options: readonly { v: string; label: string }[]; onChange: (v: string) => void; error?: string }) {
  return (
    <fieldset>
      <legend className={`${labelCls} mb-1`}>{name}</legend>
      <div className="flex flex-wrap gap-space-sm">
        {options.map((o) => (
          <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}
            className={`min-h-11 px-space-md rounded-lg border font-body-md ${value === o.v ? 'bg-primary-container text-on-primary border-primary-container' : 'border-card-border bg-surface-container-lowest'}`}>{o.label}</button>
        ))}
      </div>
      {error && <span className="text-error font-body-sm">{error}</span>}
    </fieldset>
  );
}

/* ------------------------------ Fluids ------------------------------ */

function Step({ dir, value, onStep }: { dir: 1 | -1; value: string; onStep: (v: string) => void }) {
  const next = stepVolume(value, dir);
  return (
    <button type="button" disabled={next == null} onClick={() => next && onStep(next)}
      className="h-full w-12 shrink-0 grid place-items-center text-[20px] font-bold text-primary bg-surface-container-low hover:bg-surface-container disabled:text-outline disabled:cursor-not-allowed">
      <span aria-hidden>{dir < 0 ? '−' : '+'}</span><span className="sr-only">{dir < 0 ? '50 mL less' : '50 mL more'}</span>
    </button>
  );
}

export const ioToForm = (io?: IntakeOutput): IoForm => ({
  direction: io?.direction ?? '', category: io?.category ?? '', volume: io ? String(io.volume_ml) : '',
  method: io?.method ?? '', start: io?.start_time ? toLocalInput(io.start_time) : '', end: io?.end_time ? toLocalInput(io.end_time) : '', orderId: io?.order_id ?? '',
});

export function IoEditor({ initial, ivOrders, ...rest }: Common<Omit<IntakeOutput, 'id' | 'entry_id'>> & { initial: IoForm; ivOrders: ActiveOrder[] }) {
  const { clock } = useApp();
  const parse = (l: string) => fromLocalInput(l, clock.offsetMinutes);
  return (
    <TwoStepEditor<IoForm, Omit<IntakeOutput, 'id' | 'entry_id'>>
      {...rest}
      initial={initial}
      validate={(f) => validateIo(f, parse, clock.now())}
      renderFill={(f, set, e) => (
        <>
          <Choice name="In or out?" value={f.direction} options={[{ v: 'in', label: 'In (patient took in)' }, { v: 'out', label: 'Out (patient passed out)' }]} onChange={(v) => set({ direction: v as 'in' | 'out', category: '' })} error={e.direction} />
          {f.direction && <Choice name="What kind?" value={f.category} options={f.direction === 'in' ? IO_IN : IO_OUT} onChange={(v) => set({ category: v })} error={e.category} />}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(13rem,30%)),1fr))] gap-space-md">
            <Field id="vol" label="Amount (mL)" error={e.volume}>
              <div className={`flex items-center h-12 rounded-lg border overflow-hidden bg-surface-container-lowest focus-within:ring-2 focus-within:ring-secondary ${e.volume ? 'border-error' : 'border-card-border'}`}>
                <Step dir={-1} value={f.volume} onStep={(v) => set({ volume: v })} />
                <input id="vol" inputMode="numeric" value={f.volume} onChange={(ev) => set({ volume: ev.target.value })} aria-invalid={!!e.volume} className="flex-1 min-w-0 h-full bg-transparent px-2 text-center outline-none font-code-tabular text-[20px] font-semibold text-primary" />
                <Step dir={1} value={f.volume} onStep={(v) => set({ volume: v })} />
              </div>
            </Field>
            <Field id="method" label="How measured (optional)" error={e.method}>
              <select id="method" value={f.method} onChange={(ev) => set({ method: ev.target.value })} className={fieldCls(e.method)}>
                <option value="">—</option>{IO_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            {f.direction === 'in' && (f.category === 'iv' || f.category === 'ivpb') && ivOrders.length > 0 && (
              <Field id="ord" label="IV order (optional)">
                <select id="ord" value={f.orderId} onChange={(ev) => set({ orderId: ev.target.value })} className={fieldCls()}>
                  <option value="">—</option>{ivOrders.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
                </select>
              </Field>
            )}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(15rem,30%)),1fr))] gap-space-md">
            <Field id="pstart" label="Period start (optional)"><input id="pstart" type="datetime-local" value={f.start} onChange={(ev) => set({ start: ev.target.value })} className={`${fieldCls()} font-code-tabular`} /></Field>
            <Field id="pend" label="Period end (optional)" error={e.end}><input id="pend" type="datetime-local" value={f.end} onChange={(ev) => set({ end: ev.target.value })} aria-invalid={!!e.end} className={`${fieldCls(e.end)} font-code-tabular`} /></Field>
          </div>
        </>
      )}
      renderReview={(v) => [
        ['In or out', v.direction === 'in' ? 'In' : 'Out'],
        ['Kind', ioLabel(v.direction, v.category)],
        ['Amount', <span key="a" className="font-code-tabular font-bold text-[22px]">{v.volume_ml} mL</span>],
        ...(v.method ? [['How measured', v.method] as [string, string]] : []),
        ...(v.start_time && v.end_time ? [['Period', `${hm(v.start_time)} – ${hm(v.end_time)}`] as [string, string]] : []),
      ]}
    />
  );
}

/* ------------------------------ Notes ------------------------------ */

export const noteToForm = (n?: Note): NoteForm => ({ category: n?.category ?? '', text: n?.text ?? '', scoreName: n?.score_name ?? '', scoreValue: n?.score_value != null ? String(n.score_value) : '' });

export function NoteEditor({ initial, ...rest }: Common<Omit<Note, 'id' | 'entry_id'>> & { initial: NoteForm }) {
  return (
    <TwoStepEditor<NoteForm, Omit<Note, 'id' | 'entry_id'>>
      {...rest}
      initial={initial}
      validate={validateNote}
      renderFill={(f, set, e) => (
        <>
          <Choice name="Type of note" value={f.category} options={NOTE_CATEGORIES} onChange={(v) => set({ category: v })} error={e.category} />
          {f.category === 'risk_score' && (
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-space-md">
              <Field id="sname" label="Score name (as on the paper form)" error={e.scoreName}>
                <input id="sname" value={f.scoreName} onChange={(ev) => set({ scoreName: ev.target.value })} aria-invalid={!!e.scoreName} className={fieldCls(e.scoreName)} placeholder="e.g. Braden" />
              </Field>
              <Field id="sval" label="Score" error={e.scoreValue}>
                <input id="sval" inputMode="numeric" value={f.scoreValue} onChange={(ev) => set({ scoreValue: ev.target.value })} aria-invalid={!!e.scoreValue} className={`${fieldCls(e.scoreValue)} font-code-tabular`} />
              </Field>
            </div>
          )}
          <Field id="ntext" label="Note" error={e.text}>
            <textarea id="ntext" rows={5} value={f.text} onChange={(ev) => set({ text: ev.target.value })} aria-invalid={!!e.text}
              className={`rounded-lg border p-space-md bg-surface-container-lowest w-full font-body-lg ${e.text ? 'border-error' : 'border-card-border'}`} />
          </Field>
          {f.category === 'risk_score' && <p className="font-body-sm text-secondary">The app stores the score you enter. It does not work out or judge the score.</p>}
        </>
      )}
      renderReview={(v) => [
        ['Type', noteLabel(v.category)],
        ...(v.score_name ? [['Score', `${v.score_name}: ${v.score_value}`] as [string, string]] : []),
        ['Note', v.text],
      ]}
    />
  );
}

/* ------------------------------ Labs ------------------------------ */

export const labToForm = (l?: LabEvent, order?: ActiveOrder): LabForm => ({
  testName: l?.test_name ?? order?.text ?? '', orderId: l?.order_id ?? order?.id ?? '', status: l?.status ?? '',
  specimenTime: l?.specimen_time ? toLocalInput(l.specimen_time) : '', value: l?.value_num != null ? String(l.value_num) : l?.value_text ?? '',
  unit: l?.unit ?? '', calledTo: l?.called_to ?? '', readBack: !!l?.read_back,
});

export function LabEditor({ initial, labOrders, ...rest }: Common<Omit<LabEvent, 'id' | 'entry_id'>> & { initial: LabForm; labOrders: ActiveOrder[] }) {
  const { clock } = useApp();
  const parse = (l: string) => fromLocalInput(l, clock.offsetMinutes);
  return (
    <TwoStepEditor<LabForm, Omit<LabEvent, 'id' | 'entry_id'>>
      {...rest}
      initial={initial}
      validate={(f) => validateLab(f, parse, clock.now())}
      renderFill={(f, set, e) => (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <Field id="lorder" label="Lab order (optional)">
              <select id="lorder" value={f.orderId} onChange={(ev) => { const o = labOrders.find((x) => x.id === ev.target.value); set({ orderId: ev.target.value, testName: o ? o.text : f.testName }); }} className={fieldCls()}>
                <option value="">—</option>{labOrders.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
              </select>
            </Field>
            <Field id="ltest" label="Test" error={e.testName}>
              <input id="ltest" value={f.testName} onChange={(ev) => set({ testName: ev.target.value })} aria-invalid={!!e.testName} className={fieldCls(e.testName)} />
            </Field>
          </div>
          <Choice name="Status" value={f.status} options={LAB_STATUSES} onChange={(v) => set({ status: v })} error={e.status} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <Field id="lspec" label="Sample taken at (optional)" error={e.specimenTime}>
              <input id="lspec" type="datetime-local" value={f.specimenTime} onChange={(ev) => set({ specimenTime: ev.target.value })} className={`${fieldCls(e.specimenTime)} font-code-tabular`} />
            </Field>
            {(f.status === 'resulted' || f.status === 'critical') && (
              <>
                <Field id="lval" label="Result (as given by the lab)" error={e.value}>
                  <input id="lval" value={f.value} onChange={(ev) => set({ value: ev.target.value })} aria-invalid={!!e.value} className={`${fieldCls(e.value)} font-code-tabular text-[20px] font-semibold`} />
                </Field>
                <Field id="lunit" label="Unit"><input id="lunit" value={f.unit} onChange={(ev) => set({ unit: ev.target.value })} className={fieldCls()} placeholder="e.g. mmol/L" /></Field>
              </>
            )}
          </div>
          {f.status === 'critical' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md items-end">
              <Field id="lcalled" label="Who was told (doctor / team)"><input id="lcalled" value={f.calledTo} onChange={(ev) => set({ calledTo: ev.target.value })} className={fieldCls()} /></Field>
              <label className="flex items-center gap-2 min-h-12 font-body-md cursor-pointer">
                <input type="checkbox" className="w-5 h-5" checked={f.readBack} onChange={(ev) => set({ readBack: ev.target.checked })} />Result was read back (repeated back to confirm)
              </label>
            </div>
          )}
        </>
      )}
      renderReview={(v) => [
        ['Test', v.test_name],
        ['Status', labLabel(v.status)],
        ...(v.value_num != null || v.value_text ? [['Result', <span key="r" className="font-code-tabular font-bold text-[22px]">{v.value_num ?? v.value_text} {v.unit ?? ''}</span>] as [string, React.ReactNode]] : []),
        ...(v.specimen_time ? [['Sample taken', hm(v.specimen_time)] as [string, string]] : []),
        ...(v.status === 'critical' ? [['Told', v.called_to ?? '—'] as [string, string], ['Read back', v.read_back ? 'Yes' : 'No'] as [string, string]] : []),
      ]}
    />
  );
}
