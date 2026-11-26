import { useMemo, useState } from 'react';
import { allergyState } from '../../lib/admission';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useSession } from '../../state/app';
import { dateTimeLabel, dayLabel } from '../../lib/time';
import { isHighAlert, isMedOrder } from '../../lib/meds';
import { Badge, Breadcrumbs, Button, ButtonLink, Card, Dialog, EmptyState, Icon } from '../../components/ui';
import { PatientFrame } from '../patient/PatientLayout';
import { fullName, isNoKnownAllergy, type PatientBundle } from '../patient/patientData';
import { FormSheet, type SheetContext } from './PrintForms';
import { FORMS, FORM_ORDER, isFormKind, loadPrintData, loadWardForPrint, type FormKind, type PrintData } from './printData';

/** Opens the browser's print dialog. Only ever called from a button the user pressed (never on page load). */
function openPrintDialog() {
  window.print();
}

function useSheetContext(): SheetContext {
  const { clock, dataset, snapshot } = useApp();
  const { user } = useSession();
  return { nowIso: clock.nowIso(), printedBy: user?.name ?? 'unknown', practice: dataset === 'practice', snapshotAt: snapshot?.taken_at ?? null };
}

function PrintNotice() {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-downtime-amber-bg border border-downtime-amber-border px-space-md py-space-sm font-body-md" role="note">
      <Icon name="privacy_tip" className="text-[20px] mt-0.5" />
      <span>Printed sheets show patient information: print only what you need and keep them with the patient's paper record. Printing uses this browser's print dialog. ClinBridge does not send anything to a printer and cannot tell whether the pages printed.</span>
    </p>
  );
}

/** What can be said about the printing itself: the browser's dialog decides. */
function PrintFacts({ items }: { items: [icon: string, label: string, value: string][] }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-space-sm">
      {items.map(([icon, label, value]) => <div key={label} className="min-w-0 rounded-lg bg-surface-container-lowest border border-card-border p-space-sm"><dt className="flex items-center gap-1 font-label-uppercase text-label-uppercase uppercase text-secondary"><Icon name={icon} className="text-[18px]" />{label}</dt><dd className="font-body-md text-body-md font-semibold text-primary [overflow-wrap:anywhere]">{value}</dd></div>)}
    </dl>
  );
}

/* ------------------------------ One form for one patient: /print/:kind/:id ------------------------------ */

function SingleForm({ kind, patientId }: { kind: FormKind; patientId: string }) {
  const { db, clock } = useApp();
  const ctx = useSheetContext();
  const data = useLiveQuery(() => loadPrintData(db, patientId, clock.nowIso()), [db, patientId, clock]);
  const f = FORMS[kind];
  if (data === undefined) return <p role="status" className="text-secondary">Preparing the sheet…</p>;
  if (data === null) return <EmptyState icon="person_off" text="This patient is not in the patient list." />;
  const p = data.bundle.patient;
  const base = `/patients/${p.id}`;
  return (
    <>
      <div className="print:hidden flex flex-col gap-space-md">
        <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(p), to: base }, { label: `Paper form ${f.code}` }]} />
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h1 className="font-headline-lg text-headline-lg text-primary">{f.short} · paper form {f.code}</h1>
          <div className="flex flex-wrap gap-space-sm">
            <Button onClick={openPrintDialog}><Icon name="print" />Print this sheet</Button>
            <ButtonLink variant="secondary" to={base}>Back to patient</ButtonLink>
          </div>
        </div>
        <PrintNotice />
        <PrintFacts items={[['print', 'Printer', 'Chosen in the print dialog'], ['layers', 'Paper', 'Letter or A4'], ['check_circle', 'Filled in for', `Bed ${data.bundle.encounter?.bed ?? '—'}, ${fullName(p)}`], ['schedule', 'Filled in at', dateTimeLabel(ctx.nowIso)]]} />
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <nav aria-label="Other paper forms for this patient" className="flex flex-wrap gap-1 rounded-lg bg-surface-container p-1">
            {FORM_ORDER.map((k) => <Link key={k} to={`/print/${k}/${p.id}`} aria-current={k === kind ? 'page' : undefined} className={`min-h-11 px-3 rounded-lg inline-flex items-center gap-2 font-body-md text-body-md font-semibold ${k === kind ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-high'}`}><Icon name={k === 'mar' ? 'medication' : k === 'vit' ? 'vital_signs' : 'assignment_return'} className="text-[20px]" />{FORMS[k].short} ({FORMS[k].code})</Link>)}
          </nav>
          <ButtonLink variant="secondary" to="/spooler"><Icon name="folder_copy" />Forms for more patients</ButtonLink>
        </div>
      </div>
      <div className="print-preview mt-space-md print:mt-0">
        <FormSheet kind={kind} d={data} ctx={ctx} />
      </div>
    </>
  );
}

export function PrintFormPage() {
  const { kind, id } = useParams();
  if (!isFormKind(kind)) return <EmptyState icon="search_off" text="There is no paper form with that name." action={<ButtonLink variant="secondary" to="/ward">Back to My patients</ButtonLink>} />;
  // Same two-identifier patient check as every patient page, before any patient data is shown.
  return <PatientFrame patientId={id} ownPrintHeader><SingleForm kind={kind} patientId={id!} /></PatientFrame>;
}

/* ------------------------------ Packet builder: /spooler ------------------------------ */

type Step = 'select' | 'review' | 'preview';

function allergyShort(b: PatientBundle): string {
  const real = b.allergies.filter((a) => !isNoKnownAllergy(a));
  return real.length ? real.map((a) => a.substance).join(', ') : allergyState(b.patient, b.allergies).text;
}

/** Narrow screens: born date, MRN and allergies under the name, so every identifier is visible without sideways scrolling. */
function IdLines({ b }: { b: PatientBundle }) {
  return (
    <span className="sm:hidden block font-body-sm font-normal text-on-surface-variant">
      Born <span className="font-code-tabular">{dayLabel(b.patient.birth_date)}</span> · MRN <span className="font-code-tabular">{b.patient.mrn}</span>
      <span className="block">Allergies: {allergyShort(b)}</span>
    </span>
  );
}

export function SpoolerPage() {
  const { db, clock, dataset } = useApp();
  const ctx = useSheetContext();
  const ward = useLiveQuery(() => loadWardForPrint(db), [db]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [forms, setForms] = useState<Set<FormKind>>(new Set(FORM_ORDER));
  const [step, setStep] = useState<Step>('select');
  const [confirming, setConfirming] = useState(false);
  const [order, setOrder] = useState<'patient' | 'form'>('patient');
  const meds = useLiveQuery(async () => {
    const m = new Map<string, { n: number; high: string[] }>();
    for (const o of (await db.active_order.toArray()).filter(isMedOrder)) { const x = m.get(o.encounter_id) ?? { n: 0, high: [] }; x.n += 1; if (o.drug_name && isHighAlert(o.drug_name) && !x.high.includes(o.drug_name)) x.high.push(o.drug_name); m.set(o.encounter_id, x); }
    return m;
  }, [db]);

  const chosen = useMemo(() => (ward ?? []).filter((b) => selected.has(b.patient.id)), [ward, selected]);
  const formList = FORM_ORDER.filter((k) => forms.has(k));
  const ids = chosen.map((b) => b.patient.id).join(',');
  const packet = useLiveQuery(
    async () => (step === 'preview' ? (await Promise.all(chosen.map((b) => loadPrintData(db, b.patient.id, clock.nowIso())))).filter((x): x is PrintData => !!x) : null),
    [db, clock, step, ids],
  );

  if (ward === undefined) return <p role="status" className="text-secondary">Loading the patient list…</p>;
  const total = ward.length;
  const allOn = total > 0 && selected.size === total;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleForm = (k: FormKind) => setForms((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // Number of FORMS (patients × chosen forms). A long form can take more than one printed page.
  const formCount = chosen.length * formList.length;
  const formsLabel = (n: number) => `${n} form${n === 1 ? '' : 's'}`;
  const canReview = chosen.length > 0 && formList.length > 0;
  const medsOf = (b: PatientBundle) => (b.encounter ? meds?.get(b.encounter.id) : undefined);
  const sheets = (packet ?? []).flatMap((d) => formList.map((k) => ({ d, k })));
  if (order === 'form') sheets.sort((a, b) => formList.indexOf(a.k) - formList.indexOf(b.k)); // stable: patients keep their bed order

  return (
    <>
      <div className="print:hidden flex flex-col gap-space-md">
        <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: 'Paper form packets' }]} />
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <h1 className="font-headline-lg text-headline-lg text-primary">Paper form packets</h1>
          {dataset === 'practice' && <Badge tone="blue" icon="school">Practice: fictional patients</Badge>}
        </div>
        <p className="font-body-md text-on-surface-variant">Choose patients and forms, check the list, then preview and print. Each patient's forms start on a new page.</p>
        <PrintNotice />
        <PrintFacts items={[['groups', 'Selected', `${selected.size} of ${total} patients`], ['description', 'Forms', formsLabel(formCount)], ['sort', 'Order', order === 'patient' ? 'By patient, bed order' : 'By form, bed order'], ['print', 'Printer', 'Chosen in the print dialog']]} />
        <ol className="flex flex-wrap gap-space-sm font-body-sm" aria-label="Steps">
          {(['select', 'review', 'preview'] as Step[]).map((s, i) => (
            <li key={s} aria-current={step === s ? 'step' : undefined} className={`px-2 py-1 rounded ${step === s ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
              {i + 1}. {s === 'select' ? 'Choose' : s === 'review' ? 'Check the list' : 'Preview and print'}
            </li>
          ))}
        </ol>

        {step === 'select' && (
          total === 0 ? <EmptyState icon="group_off" text="There are no patients in the patient list." /> : (
            <>
              <Card className="flex flex-col gap-space-sm" aria-label="Forms to include">
                <h2 className="font-headline-sm text-headline-sm text-primary">Forms</h2>
                <div className="flex flex-wrap gap-space-md">
                  {FORM_ORDER.map((k) => (
                    <label key={k} className="flex items-center gap-2 font-body-md min-h-9">
                      <input type="checkbox" className="w-5 h-5" checked={forms.has(k)} onChange={() => toggleForm(k)} />
                      {FORMS[k].short} <span className="font-code-tabular text-secondary">{FORMS[k].code}</span>
                    </label>
                  ))}
                </div>
                {formList.length === 0 && <p role="alert" className="text-clinical-red font-body-sm">Choose at least one form.</p>}
                <div role="radiogroup" aria-label="Order of the sheets" className="flex flex-wrap items-center gap-1 pt-space-sm border-t border-card-border">
                  <span className="font-body-md text-on-surface-variant mr-1">Order of the sheets</span>
                  {([['patient', 'By patient'], ['form', 'By form']] as const).map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={order === v} onClick={() => setOrder(v)} className={`min-h-11 px-3 rounded-lg font-body-md font-semibold ${order === v ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>{label}</button>)}
                  {order === 'form' && <p className="basis-full font-body-sm text-[#7a5410]">One patient's sheets are then apart. Check the name and MRN on each sheet when you sort them.</p>}
                </div>
              </Card>
              <Card className="flex flex-col gap-space-sm" aria-label="Patients">
                <div className="flex flex-wrap items-center justify-between gap-space-sm">
                  <h2 className="font-headline-sm text-headline-sm text-primary">Patients</h2>
                  <p className="font-body-md" data-testid="spooler-count" aria-live="polite">{selected.size} of {total} patients selected · {formsLabel(formCount)}</p>
                </div>
                <label className="flex items-center gap-2 font-body-md font-semibold min-h-9 border-b border-card-border pb-2">
                  <input type="checkbox" className="w-5 h-5" checked={allOn}
                    ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allOn; }}
                    onChange={() => setSelected(allOn ? new Set() : new Set(ward.map((b) => b.patient.id)))} />
                  Select all {total} patients
                </label>
                <div className="overflow-x-auto -mx-space-sm px-space-sm">
                <table className="w-full font-body-md">
                  <caption className="sr-only">Patients in the patient list</caption>
                  <thead className="text-left text-secondary font-body-sm"><tr><th className="py-1 w-10"><span className="sr-only">Select</span></th><th className="py-1">Bed</th><th className="py-1">Patient</th><th className="hidden sm:table-cell py-1">Born</th><th className="hidden sm:table-cell py-1">MRN</th><th className="hidden sm:table-cell py-1">Allergies</th><th className="hidden lg:table-cell py-1">Medicine orders</th><th className="hidden xl:table-cell py-1">In the packet</th></tr></thead>
                  <tbody>
                    {ward.map((b) => (
                      <tr key={b.patient.id} className="border-t border-card-border">
                        <td className="py-1"><input type="checkbox" className="w-5 h-5" aria-label={`Select ${fullName(b.patient)}, bed ${b.encounter?.bed ?? 'unknown'}`} checked={selected.has(b.patient.id)} onChange={() => toggle(b.patient.id)} /></td>
                        <td className="py-1 font-code-tabular font-semibold">{b.encounter?.bed ?? '—'}</td>
                        <td className="py-1 font-semibold">{fullName(b.patient)}<IdLines b={b} /></td>
                        <td className="hidden sm:table-cell py-1 font-code-tabular">{dayLabel(b.patient.birth_date)}</td>
                        <td className="hidden sm:table-cell py-1 font-code-tabular">{b.patient.mrn}</td>
                        <td className="hidden sm:table-cell py-1">{allergyShort(b)}</td>
                        <td className="hidden lg:table-cell py-1">{medsOf(b)?.n ?? 0}{medsOf(b)?.high.length ? <span className="block font-body-sm font-semibold text-clinical-red">High-alert list: {medsOf(b)!.high.join(', ')}</span> : null}</td>
                        <td className="hidden xl:table-cell py-1">{selected.has(b.patient.id) ? <span className="flex gap-1">{formList.map((k) => <Badge key={k} tone="blue">{k.toUpperCase()}</Badge>)}</span> : <span className="text-secondary">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Card>
              <div className="flex flex-wrap gap-space-sm">
                <Button disabled={!canReview} onClick={() => setStep('review')}><Icon name="fact_check" />Check the list</Button>
                {!canReview && <p className="font-body-sm text-secondary self-center">Choose at least one patient and one form.</p>}
              </div>
            </>
          )
        )}

        {step === 'review' && (
          <Card className="flex flex-col gap-space-sm" aria-label="Check the list">
            <h2 className="font-headline-sm text-headline-sm text-primary">Check the list before printing</h2>
            <p className="font-body-md">Check each name, birth date, MRN and bed against the ward census. Each patient gets: {formList.map((k) => `${FORMS[k].short} (${FORMS[k].code})`).join(', ')}.</p>
            <div className="overflow-x-auto">
            <table className="w-full font-body-md" data-testid="spooler-review">
              <thead className="text-left text-secondary font-body-sm"><tr><th className="py-1">Bed</th><th className="py-1">Patient</th><th className="hidden sm:table-cell py-1">Born</th><th className="hidden sm:table-cell py-1">MRN</th><th className="hidden sm:table-cell py-1">Allergies</th></tr></thead>
              <tbody>{chosen.map((b) => (
                <tr key={b.patient.id} className="border-t border-card-border">
                  <td className="py-1 font-code-tabular font-semibold">{b.encounter?.bed ?? '—'}</td><td className="py-1 font-semibold">{fullName(b.patient)}<IdLines b={b} /></td>
                  <td className="hidden sm:table-cell py-1 font-code-tabular">{dayLabel(b.patient.birth_date)}</td><td className="hidden sm:table-cell py-1 font-code-tabular">{b.patient.mrn}</td><td className="hidden sm:table-cell py-1">{allergyShort(b)}</td>
                </tr>
              ))}</tbody>
            </table>
            </div>
            <p className="font-body-md font-semibold">{chosen.length} patients · {formsLabel(formCount)}. The number of printed pages depends on how long each form is and the paper size.</p>
            <div className="flex flex-wrap gap-space-sm">
              <Button onClick={() => setStep('preview')}><Icon name="preview" />The list is right: show the preview</Button>
              <Button variant="secondary" onClick={() => setStep('select')}>Back</Button>
            </div>
          </Card>
        )}

        {step === 'preview' && (
          <Card className="flex flex-wrap items-center justify-between gap-space-sm" aria-label="Print the packet">
            <p className="font-body-md"><span className="font-semibold">{chosen.length} patients · {formsLabel(formCount)}.</span> {order === 'form' ? 'Sorted by form. ' : ''}A long form can run onto a second page. Scroll to check the preview, then print.</p>
            <div className="flex flex-wrap gap-space-sm">
              <Button disabled={!packet} onClick={() => setConfirming(true)}><Icon name="print" />Print the packet</Button>
              <Button variant="secondary" onClick={() => setStep('review')}>Back</Button>
            </div>
          </Card>
        )}
      </div>

      {step === 'preview' && (
        packet == null ? <p role="status" className="text-secondary print:hidden">Preparing {formsLabel(formCount)}…</p> : (
          <div className="print-preview flex flex-col gap-space-lg mt-space-md print:mt-0 print:gap-0" data-testid="spooler-preview">
            {sheets.map(({ d, k }, i) => <FormSheet key={`${d.bundle.patient.id}-${k}`} kind={k} d={d} ctx={ctx} breakBefore={i > 0} />)}
          </div>
        )
      )}

      {confirming && (
        <Dialog title="Print the packet?" onClose={() => setConfirming(false)}>
          <p className="font-body-md">This opens the print dialog for <strong>{formsLabel(formCount)}</strong> for <strong>{chosen.length} patients</strong>{dataset === 'practice' ? ' (fictional Practice patients)' : ''}. The print dialog shows the real page count. Pick the printer there. ClinBridge cannot tell whether the pages printed.</p>
          <div className="flex gap-space-sm">
            <Button data-autofocus className="flex-1" onClick={() => { setConfirming(false); setTimeout(openPrintDialog, 0); }}><Icon name="print" />Open the print dialog</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
