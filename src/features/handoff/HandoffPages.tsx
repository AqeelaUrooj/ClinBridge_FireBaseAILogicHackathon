import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import { createHandoff, listHandoffs, validateHandoff } from '../../db/repos/handoff';
import { isNurse, useApp, useSession } from '../../state/app';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { Breadcrumbs, Button, ButtonLink, Card, EmptyState, Icon, PageTitle } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { EntryRow, TYPE_LABEL, entrySummary } from '../entries/entryView';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';

function useNames() {
  const { db } = useApp();
  return useLiveQuery(async () => new Map((await db.practitioner.toArray()).map((p) => [p.id, p.name])), [db]) ?? new Map<string, string>();
}

/* ------------------------------ Patient handover list ------------------------------ */

export function PatientHandoffPage() {
  const { patient } = useCurrentPatient();
  const { db } = useApp();
  const { user } = useSession();
  const names = useNames();
  const location = useLocation();
  const items = useLiveQuery(() => listHandoffs(db, patient.id), [db, patient.id]);
  const base = `/patients/${patient.id}`;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Handover' }]} />
      {(location.state as { saved?: string } | null)?.saved && <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2"><Icon name="check_circle" filled />Handover saved on this laptop.</p>}
      <div className="flex items-center justify-between">
        <h1 className="font-headline-lg text-headline-lg text-primary flex items-center gap-3"><MedIllustration name="workflows/handover" size={36} />Handover</h1>
        {isNurse(user) && <ButtonLink to={`${base}/handoff/new`}><Icon name="add" />New handover</ButtonLink>}
      </div>
      <Card>
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">History</h2>
        {!items ? <p role="status">Loading…</p> : items.length === 0 ? <EmptyState text="No handovers yet" /> : (
          <ul className="flex flex-col">
            {items.map(({ handoff: h, savedAt }) => (
              <li key={h.id}>
                <Link to={`${base}/handoff/${h.id}`} className="flex items-center gap-space-md min-h-[60px] border-b border-card-border last:border-0 hover:bg-surface-container-low px-space-sm rounded">
                  <span className="w-28 font-code-tabular text-body-sm text-primary">{savedAt ? dateTimeLabel(savedAt) : '—'}</span>
                  <span className="flex-1 min-w-0 truncate font-body-lg">{h.shift}</span>
                  <span className="text-body-sm text-secondary">{names.get(h.created_by) ?? h.created_by} · {h.source_entry_ids.length} linked</span>
                  <Icon name="chevron_right" className="text-outline" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/* ------------------------------ New handover ------------------------------ */

export function NewHandoffPage() {
  const { patient, encounter, allergies } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const base = `/patients/${patient.id}`;
  const entries = useLiveQuery(async () => (await listPatientEntries(db, patient.id)).filter((x) => x.entry.status === 'confirmed'), [db, patient.id]);
  const [shift, setShift] = useState(`Handover ${hm(clock.nowIso())}, ${dayLabel(clock.nowIso())}`);
  const [situation, setSituation] = useState('');
  const [background, setBackground] = useState('');
  const [assessment, setAssessment] = useState('');
  const [openItems, setOpenItems] = useState<string[]>(['']);
  const [linked, setLinked] = useState<string[]>([]);
  const [step, setStep] = useState<'write' | 'review'>('write');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isNurse(user)) return <EmptyState icon="block" text="Only nurses can write a handover." />;

  // Facts from the patient list, inserted only when the nurse presses the button.
  const facts = [
    encounter?.code_status && `Code status: ${encounter.code_status}`,
    encounter?.isolation && `Isolation: ${encounter.isolation}`,
    allergies.length ? `Allergies: ${allergies.map((a) => a.substance).join(', ')}` : 'Allergies: not recorded',
    encounter?.admit_time && `Admitted ${dayLabel(encounter.admit_time)}`,
  ].filter(Boolean).join('. ');

  const toggle = (id: string) => setLinked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const insertLine = (x: EntryWithChild) => {
    setAssessment((a) => `${a}${a && !a.endsWith('\n') ? '\n' : ''}${hm(x.entry.care_time)} ${TYPE_LABEL[x.entry.type]}: ${entrySummary(x)}`);
    if (!linked.includes(x.entry.id)) setLinked((l) => [...l, x.entry.id]);
  };
  const input = { patientId: patient.id, shift, situation, background, assessment, openItems, sourceEntryIds: linked };

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const h = await createHandoff(db, clock, { userId: user!.id, deviceId }, input);
      navigate(`${base}/handoff`, { state: { saved: h.id } });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  const block = (id: string, label: string, value: string, set: (v: string) => void, extra?: React.ReactNode) => (
    <Card className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="font-headline-sm text-headline-sm text-primary">{label}</label>
        {extra}
      </div>
      <textarea id={id} rows={4} value={value} onChange={(e) => set(e.target.value)} aria-invalid={!!errors[id]}
        className={`rounded-lg border p-space-md bg-surface-container-lowest w-full font-body-lg ${errors[id] ? 'border-error' : 'border-card-border'}`} />
      {errors[id] && <span className="text-error font-body-sm">{errors[id]}</span>}
    </Card>
  );

  if (step === 'review') {
    const chosen = (entries ?? []).filter((x) => linked.includes(x.entry.id));
    return (
      <>
        <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Handover', to: `${base}/handoff` }, { label: 'Check' }]} />
        <h1 className="font-headline-lg text-headline-lg text-primary">Check before saving</h1>
        <HandoffBody shift={shift} situation={situation} background={background} assessment={assessment} openItems={openItems.filter((x) => x.trim())} sources={chosen} />
        {saveError && <p role="alert" className="text-error">{saveError}</p>}
        <div className="flex gap-space-sm">
          <Button onClick={save} disabled={saving}><Icon name="save" />{saving ? 'Saving…' : 'I reviewed it — save'}</Button>
          <Button variant="secondary" onClick={() => setStep('write')}>Go back</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Handover', to: `${base}/handoff` }, { label: 'New' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">New handover</h1>
      <p className="font-body-sm text-secondary -mt-space-sm">Draft — only on this screen until you review and save it. Written by you; no AI is used.</p>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-space-lg items-start">
        <div className="flex flex-col gap-space-md">
          <div className="md:w-2/3 flex flex-col gap-1">
            <label htmlFor="shift" className={labelCls}>Which handover</label>
            <input id="shift" value={shift} onChange={(e) => setShift(e.target.value)} aria-invalid={!!errors.shift} className={fieldCls(errors.shift)} />
            {errors.shift && <span className="text-error font-body-sm">{errors.shift}</span>}
          </div>
          {block('situation', 'Situation', situation, setSituation)}
          {block('background', 'Background', background, setBackground,
            <Button variant="ghost" onClick={() => setBackground((b) => (b ? `${b}\n${facts}` : facts))}><Icon name="add" />Insert patient facts</Button>)}
          {block('assessment', 'Assessment', assessment, setAssessment)}
          <Card className="flex flex-col gap-space-sm">
            <h2 className="font-headline-sm text-headline-sm text-primary">Open items</h2>
            {openItems.map((it, i) => (
              <div key={i} className="flex gap-space-sm">
                <input aria-label={`Open item ${i + 1}`} value={it} onChange={(e) => setOpenItems(openItems.map((x, k) => (k === i ? e.target.value : x)))} className={fieldCls()} />
                <Button variant="ghost" aria-label={`Remove open item ${i + 1}`} onClick={() => setOpenItems(openItems.length > 1 ? openItems.filter((_, k) => k !== i) : [''])}><Icon name="close" /></Button>
              </div>
            ))}
            <Button variant="secondary" className="self-start" onClick={() => setOpenItems([...openItems, ''])}><Icon name="add" />Add open item</Button>
          </Card>
          <div className="flex gap-space-sm">
            <Button onClick={() => { const e = validateHandoff(input); setErrors(e); if (!Object.keys(e).length) setStep('review'); }}>Review<Icon name="arrow_forward" /></Button>
            <Button variant="secondary" onClick={() => navigate(`${base}/handoff`)}>Cancel</Button>
          </div>
        </div>
        <Card className="flex flex-col gap-space-sm xl:sticky xl:top-[calc(var(--header-h)+16px)]">
          <h2 className="font-headline-sm text-headline-sm text-primary">Confirmed records</h2>
          <p className="font-body-sm text-secondary">Tick to link a record. “Add line” copies it into the assessment and links it. Drafts and old versions are not shown.</p>
          <ul className="flex flex-col max-h-[60vh] overflow-auto">
            {(entries ?? []).map((x) => (
              <li key={x.entry.id} className="flex items-center gap-2 min-h-12 border-b border-card-border last:border-0">
                <input type="checkbox" className="w-5 h-5 shrink-0" checked={linked.includes(x.entry.id)} onChange={() => toggle(x.entry.id)} aria-label={`Link ${hm(x.entry.care_time)} ${entrySummary(x)}`} />
                <span className="w-11 font-code-tabular text-body-sm font-bold text-primary">{hm(x.entry.care_time)}</span>
                <span className="flex-1 min-w-0 truncate font-body-md">{entrySummary(x)}</span>
                <Button variant="ghost" className="shrink-0" onClick={() => insertLine(x)}>Add line</Button>
              </li>
            ))}
            {entries && entries.length === 0 && <li className="text-secondary">No confirmed records.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

/* ------------------------------ View + print ------------------------------ */

function HandoffBody({ shift, situation, background, assessment, openItems, sources }: { shift: string; situation: string; background: string; assessment: string; openItems: string[]; sources: EntryWithChild[] }) {
  const sec = (t: string, v: React.ReactNode) => (
    <Card as="section" className="flex flex-col gap-1 break-inside-avoid print:border-black print:shadow-none">
      <h2 className="font-label-uppercase text-label-uppercase text-secondary uppercase print:text-black">{t}</h2>
      <div className="font-body-lg text-on-surface whitespace-pre-wrap print:text-black">{v}</div>
    </Card>
  );
  return (
    <div className="flex flex-col gap-space-md">
      <p className="font-headline-sm text-headline-sm text-primary print:text-black">{shift}</p>
      {sec('Situation', situation)}
      {sec('Background', background)}
      {sec('Assessment', assessment)}
      {sec('Open items', openItems.length ? <ul className="list-disc pl-6">{openItems.map((x, i) => <li key={i}>{x}</li>)}</ul> : 'None')}
      {sec('Linked confirmed records', sources.length ? (
        <>
          <div className="print:hidden">{sources.map((x) => <EntryRow key={x.entry.id} item={x} />)}</div>
          <ul className="hidden print:block">{sources.map((x) => <li key={x.entry.id}>{dateTimeLabel(x.entry.care_time)} · {entrySummary(x)} ({x.entry.id})</li>)}</ul>
        </>
      ) : 'None linked')}
    </div>
  );
}

export function HandoffViewPage() {
  const { hid } = useParams();
  const { patient } = useCurrentPatient();
  const { db, clock } = useApp();
  const { user } = useSession();
  const names = useNames();
  const data = useLiveQuery(async () => {
    const list = await listHandoffs(db, patient.id);
    const item = list.find((x) => x.handoff.id === hid);
    if (!item) return null;
    const all = await listPatientEntries(db, patient.id);
    return { ...item, sources: all.filter((x) => item.handoff.source_entry_ids.includes(x.entry.id)) };
  }, [db, patient.id, hid]);
  const base = `/patients/${patient.id}`;
  if (data === undefined) return <p role="status">Loading…</p>;
  if (data === null) return <EmptyState icon="search_off" text="Handover not found." action={<ButtonLink variant="secondary" to={`${base}/handoff`}>Back</ButtonLink>} />;
  const h = data.handoff;
  return (
    <>
      <div className="print:hidden">
        <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Handover', to: `${base}/handoff` }, { label: h.shift }]} />
      </div>
      <div className="flex items-center justify-between print:hidden">
        <h1 className="font-headline-lg text-headline-lg text-primary">Handover</h1>
        <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print</Button>
      </div>
      {/* Print header: patient identifiers on every printed page */}
      <div className="hidden print:block print-running-header">
        <strong>{fullName(patient)}</strong> · Born {dayLabel(patient.birth_date)} · MRN {patient.mrn} · Handover
      </div>
      <p className="font-body-sm text-secondary print:text-black">Written by {names.get(h.created_by) ?? h.created_by}{data.savedAt ? ` · saved ${dateTimeLabel(data.savedAt)}` : ''} · {h.id}</p>
      <HandoffBody shift={h.shift} situation={h.situation} background={h.background} assessment={h.assessment} openItems={h.open_items} sources={data.sources} />
      <div className="hidden print:block print-running-footer">
        Printed by {user?.name} · {dateTimeLabel(clock.nowIso())} · laptop DT-4W-01 · Fake practice data, not a clinical record
      </div>
    </>
  );
}

/* ------------------------------ Ward handover ------------------------------ */

export function WardHandoverPage() {
  const { db } = useApp();
  const rows = useLiveQuery(async () => {
    const patients = await db.patient.toArray();
    const encs = new Map((await db.encounter.toArray()).map((e) => [e.patient_id, e]));
    const out = [];
    for (const p of patients) {
      const list = await listHandoffs(db, p.id);
      out.push({ p, bed: encs.get(p.id)?.bed ?? '', latest: list[0] ?? null, count: list.length });
    }
    return out.sort((a, b) => a.bed.localeCompare(b.bed));
  }, [db]);
  return (
    <>
      <PageTitle>Handover</PageTitle>
      <Card>
        {!rows ? <p role="status">Loading…</p> : (
          <ul className="flex flex-col">
            {rows.map(({ p, bed, latest, count }) => (
              <li key={p.id} className="flex items-center gap-space-md min-h-[60px] border-b border-card-border last:border-0 px-space-sm">
                <span className="w-16 font-bold text-primary">Bed {bed}</span>
                <span className="w-44 font-semibold">{fullName(p)}</span>
                <span className="flex-1 text-on-surface-variant truncate">{latest ? `${latest.handoff.shift}${latest.savedAt ? ` · ${dateTimeLabel(latest.savedAt)}` : ''}` : 'No handover yet'}</span>
                <span className="text-body-sm text-secondary">{count} saved</span>
                <ButtonLink variant="secondary" to={`/patients/${p.id}/handoff`}>Open</ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="font-body-sm text-secondary">Opening a patient asks you to check the patient first.</p>
    </>
  );
}
