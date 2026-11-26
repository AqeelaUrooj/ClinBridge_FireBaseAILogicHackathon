import type { IntakeOutput, LabEvent, Note } from '../db/schema';

/**
 * Fluids (intake/output), nursing notes and lab events.
 * Lists come from the Data & Database Plan (I&O columns of the bedside sheet, note categories, lab statuses).
 * Only structural checks block. Nothing here scores, interprets or flags values clinically.
 */

/* ------------------------------ Fluids ------------------------------ */

export const IO_IN = [
  { v: 'oral', label: 'By mouth' }, { v: 'tube', label: 'Tube feed' }, { v: 'iv', label: 'IV fluid' },
  { v: 'ivpb', label: 'IV piggyback (small IV bag)' }, { v: 'other', label: 'Other' },
] as const;
export const IO_OUT = [
  { v: 'urine', label: 'Urine' }, { v: 'emesis', label: 'Vomit' }, { v: 'ng', label: 'NG tube (nose-to-stomach)' },
  { v: 'drain', label: 'Drain' }, { v: 'other', label: 'Other' },
] as const;
/** Methods already used in the synthetic data. */
export const IO_METHODS = ['Measured', 'Estimated', 'Pump reading'] as const;

export const ioLabel = (dir: 'in' | 'out', cat: string) =>
  ((dir === 'in' ? IO_IN : IO_OUT) as readonly { v: string; label: string }[]).find((c) => c.v === cat)?.label ?? cat;

export interface IoForm { direction: 'in' | 'out' | ''; category: string; volume: string; method: string; start: string; end: string; orderId: string }

export function validateIo(f: IoForm, parse: (local: string) => string, nowMs: number) {
  const errors: Partial<Record<keyof IoForm, string>> = {};
  if (f.direction !== 'in' && f.direction !== 'out') errors.direction = 'Pick In or Out';
  const cats = (f.direction === 'out' ? IO_OUT : IO_IN) as readonly { v: string }[];
  if (!cats.some((c) => c.v === f.category)) errors.category = 'Pick what kind';
  const v = f.volume.trim();
  if (!/^\d{1,5}$/.test(v) || Number(v) <= 0) errors.volume = 'Whole number of mL above 0';
  const startIso = f.start ? parse(f.start) : null, endIso = f.end ? parse(f.end) : null;
  if ((startIso == null) !== (endIso == null)) errors.end = 'Give both start and end, or neither';
  if (startIso && endIso && Date.parse(endIso) < Date.parse(startIso)) errors.end = 'End is before start';
  if (endIso && Date.parse(endIso) > nowMs + 60_000) errors.end = 'Cannot be in the future';
  if (f.method && !(IO_METHODS as readonly string[]).includes(f.method)) errors.method = 'Pick a method';
  const values: Omit<IntakeOutput, 'id' | 'entry_id'> = {
    direction: (f.direction || 'in') as 'in' | 'out', category: f.category, volume_ml: Number(v) || 0,
    method: f.method || null, start_time: startIso, end_time: endIso, rate: null, rate_unit: null, order_id: f.orderId || null,
  };
  return { ok: Object.keys(errors).length === 0, errors, values };
}

/** Totals of confirmed entries. Plain sums; no clinical interpretation. */
export function ioTotals(rows: IntakeOutput[]) {
  const totalIn = rows.filter((r) => r.direction === 'in').reduce((a, r) => a + r.volume_ml, 0);
  const totalOut = rows.filter((r) => r.direction === 'out').reduce((a, r) => a + r.volume_ml, 0);
  return { totalIn, totalOut, balance: totalIn - totalOut };
}

/* ------------------------------ Notes ------------------------------ */

export const NOTE_CATEGORIES = [
  { v: 'assessment', label: 'Assessment' }, { v: 'intervention', label: 'Care given' }, { v: 'communication', label: 'Talked to doctor / team' },
  { v: 'risk_score', label: 'Risk score' }, { v: 'restraint_check', label: 'Restraint check' }, { v: 'other', label: 'Other' },
] as const;
/**
 * Notes written by the admission lifecycle (registration, transfer, discharge, identity, allergy assessment). They are
 * ordinary append-only records, but never chosen in the note form and never fixed or crossed out through it.
 */
export const LIFECYCLE_NOTE = {
  admission: 'Admission',
  transfer: 'Transfer',
  discharge: 'Discharge',
  identity_review: 'Identity review',
  allergy_review: 'Allergy assessment',
} as const;
export type LifecycleCategory = keyof typeof LIFECYCLE_NOTE;
export const isLifecycleNote = (category: string | undefined | null): category is LifecycleCategory => !!category && Object.prototype.hasOwnProperty.call(LIFECYCLE_NOTE, category);
export const noteLabel = (c: string) => NOTE_CATEGORIES.find((x) => x.v === c)?.label ?? (isLifecycleNote(c) ? LIFECYCLE_NOTE[c] : c);

export interface NoteForm { category: string; text: string; scoreName: string; scoreValue: string }

export function validateNote(f: NoteForm) {
  const errors: Partial<Record<keyof NoteForm, string>> = {};
  if (!NOTE_CATEGORIES.some((c) => c.v === f.category)) errors.category = 'Pick a type';
  if (!f.text.trim()) errors.text = 'Write the note';
  const sv = f.scoreValue.trim();
  if (f.category === 'risk_score') {
    if (!f.scoreName.trim()) errors.scoreName = 'Which score (as written on the form)';
    if (!/^\d{1,3}$/.test(sv)) errors.scoreValue = 'Whole number';
  }
  const values: Omit<Note, 'id' | 'entry_id'> = {
    category: f.category, text: f.text.trim(),
    score_name: f.category === 'risk_score' ? f.scoreName.trim() : null,
    score_value: f.category === 'risk_score' && /^\d{1,3}$/.test(sv) ? Number(sv) : null,
  };
  return { ok: Object.keys(errors).length === 0, errors, values };
}

/* ------------------------------ Labs ------------------------------ */

export const LAB_STATUSES = [
  { v: 'pending', label: 'Waiting for sample' }, { v: 'collected', label: 'Sample taken' },
  { v: 'resulted', label: 'Result back' }, { v: 'critical', label: 'Critical result (phoned by lab)' },
] as const;
export const labLabel = (s: string) => LAB_STATUSES.find((x) => x.v === s)?.label ?? s;

export interface LabForm { testName: string; orderId: string; status: string; specimenTime: string; value: string; unit: string; calledTo: string; readBack: boolean }

export function validateLab(f: LabForm, parse: (local: string) => string, nowMs: number) {
  const errors: Partial<Record<keyof LabForm, string>> = {};
  const warnings: string[] = [];
  if (!f.testName.trim()) errors.testName = 'Which test';
  if (!LAB_STATUSES.some((s) => s.v === f.status)) errors.status = 'Pick a status';
  const spec = f.specimenTime ? parse(f.specimenTime) : null;
  if (spec && Date.parse(spec) > nowMs + 60_000) errors.specimenTime = 'Cannot be in the future';
  const raw = f.value.trim();
  const isNum = /^\d{1,6}(\.\d{1,4})?$/.test(raw);
  if ((f.status === 'resulted' || f.status === 'critical') && !raw) errors.value = 'Enter the result as given by the lab';
  if (f.status === 'critical') {
    // Critical-result log (Data plan B3). Missing details warn; they do not block saving a result.
    if (!f.calledTo.trim()) warnings.push('Who was told about this critical result is not filled in');
    if (!f.readBack) warnings.push('Read-back is not ticked');
  }
  const values: Omit<LabEvent, 'id' | 'entry_id'> = {
    order_id: f.orderId || null, test_name: f.testName.trim(), status: f.status,
    value_num: raw && isNum ? Number(raw) : null, value_text: raw && !isNum ? raw : null, unit: f.unit.trim() || null,
    order_time: null, specimen_time: spec, specimen_source: null,
    result_time: null, // set by the page to the entry's care time when a result is recorded
    called_to: f.calledTo.trim() || null, read_back: f.status === 'critical' ? f.readBack : null,
  };
  return { ok: Object.keys(errors).length === 0, errors, warnings, values };
}
