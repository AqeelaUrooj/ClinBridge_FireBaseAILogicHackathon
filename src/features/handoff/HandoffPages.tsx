import { useState } from 'react';
import { isActiveStay, staysByPatient } from '../../lib/admission';
import { allergyState } from '../../lib/admission';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { listPatientEntries, type EntryWithChild } from '../../db/repos/entries';
import { createHandoff, listHandoffs, validateHandoff } from '../../db/repos/handoff';
import { isNurse, useApp, useSession } from '../../state/app';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { Breadcrumbs, Button, ButtonLink, Card, EmptyState, Icon, PageTitle } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { TYPE_ICON, TYPE_LABEL, entrySummary } from '../entries/entryView';
import { HandoverScreen, LetterCard, LinkedTrail, SavedText, cardTitle, useHandovers } from './HandoffView';
import { linkedRecords } from './handoffData';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';

/* ------------------------------ Patient handover: the newest, or the one in the address ------------------------------ */

export function PatientHandoffPage() {
  const { patient } = useCurrentPatient();
  const data = useHandovers();
  const location = useLocation();
  const base = `/patients/${patient.id}`;
  if (!data) return <p role="status">Loading…</p>;
  const saved = (location.state as { saved?: string } | null)?.saved;
  return (
    <>
      <div className="print:hidden"><Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Handover' }]} /></div>
      <HandoverScreen data={data} current={data.list[0] ?? null}
        banner={saved && <p role="status" className="rounded-lg bg-tertiary-fixed text-on-tertiary-fixed-variant px-space-md py-space-sm flex items-center gap-2 print:hidden"><Icon name="check_circle" filled />Handover saved on this laptop.</p>} />
    </>
  );
}

export function HandoffViewPage() {
  const { hid } = useParams();
  const { patient } = useCurrentPatient();
  const data = useHandovers();
  const base = `/patients/${patient.id}`;
  if (!data) return <p role="status">Loading…</p>;
  const current = data.list.find((x) => x.handoff.id === hid);
  if (!current) return <EmptyState icon="search_off" text="Handover not found." action={<ButtonLink variant="secondary" to={`${base}/handoff`}>Back</ButtonLink>} />;
  return (
    <>
      <div className="print:hidden"><Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Handover', to: `${base}/handoff` }, { label: current.handoff.shift }]} /></div>
      <HandoverScreen data={data} current={current} />
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
    allergies.length ? `Allergies: ${allergies.map((a) => a.substance).join(', ')}` : `Allergies: ${allergyState(patient, allergies).text.toLowerCase()}`,
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

  const block = (id: string, letter: string, label: string, value: string, set: (v: string) => void, extra?: React.ReactNode) => (
    <LetterCard letter={letter} title={<label htmlFor={id} className={cardTitle}>{label}</label>} aside={extra}>
      <textarea id={id} rows={4} value={value} onChange={(e) => set(e.target.value)} aria-invalid={!!errors[id]}
        className={`rounded-lg border p-space-md bg-surface-container-lowest w-full font-body-lg ${errors[id] ? 'border-error' : 'border-card-border'}`} />
      {errors[id] && <span className="text-error font-body-sm">{errors[id]}</span>}
    </LetterCard>
  );

  if (step === 'review') {
    return (
      <>
        <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Handover', to: `${base}/handoff` }, { label: 'Check' }]} />
        <h1 className="font-headline-lg text-headline-lg text-primary">Check before saving</h1>
        <p className="font-headline-sm text-headline-sm text-primary">{shift}</p>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-space-md items-start">
          <div className="min-w-0 flex flex-col gap-space-md"><SavedText situation={situation} background={background} assessment={assessment} openItems={openItems.filter((x) => x.trim())} /></div>
          <LinkedTrail records={linkedRecords(linked, entries ?? [], patient.id)} />
        </div>
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
      <p className="font-body-sm text-body-sm text-secondary -mt-space-sm">Draft — only on this screen until you review and save it. Written by you; no AI is used.</p>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-space-md items-start">
        <div className="min-w-0 flex flex-col gap-space-md">
          <div className="md:w-2/3 flex flex-col gap-1">
            <label htmlFor="shift" className={labelCls}>Which handover</label>
            <input id="shift" value={shift} onChange={(e) => setShift(e.target.value)} aria-invalid={!!errors.shift} className={fieldCls(errors.shift)} />
            {errors.shift && <span className="text-error font-body-sm">{errors.shift}</span>}
          </div>
          {block('situation', 'S', 'Situation', situation, setSituation)}
          {block('background', 'B', 'Background', background, setBackground,
            <Button variant="ghost" onClick={() => setBackground((b) => (b ? `${b}\n${facts}` : facts))}><Icon name="add" />Insert patient facts</Button>)}
          {block('assessment', 'A', 'Assessment', assessment, setAssessment)}
          <LetterCard letter="R" title={<h2 className={cardTitle}>Recommendation, open items</h2>}>
            {openItems.map((it, i) => (
              <div key={i} className="flex gap-space-sm">
                <input aria-label={`Open item ${i + 1}`} value={it} onChange={(e) => setOpenItems(openItems.map((x, k) => (k === i ? e.target.value : x)))} className={fieldCls()} />
                <Button variant="ghost" aria-label={`Remove open item ${i + 1}`} onClick={() => setOpenItems(openItems.length > 1 ? openItems.filter((_, k) => k !== i) : [''])}><Icon name="close" /></Button>
              </div>
            ))}
            <Button variant="secondary" className="self-start" onClick={() => setOpenItems([...openItems, ''])}><Icon name="add" />Add open item</Button>
          </LetterCard>
          <div className="flex gap-space-sm">
            <Button onClick={() => { const e = validateHandoff(input); setErrors(e); if (!Object.keys(e).length) setStep('review'); }}>Review<Icon name="arrow_forward" /></Button>
            <Button variant="secondary" onClick={() => navigate(`${base}/handoff`)}>Cancel</Button>
          </div>
        </div>
        <Card className="flex flex-col gap-space-sm xl:sticky xl:top-[calc(var(--header-h)+16px)]">
          <h2 className="font-headline-sm text-headline-sm text-primary">Confirmed records</h2>
          <p className="font-body-sm text-secondary">Tick to link a record. “Add line” copies it into the assessment and links it. Drafts and old versions are not shown.</p>
          <ul className="flex flex-col gap-1.5 max-h-[60vh] overflow-auto">
            {(entries ?? []).map((x) => (
              <li key={x.entry.id} className={`flex items-start gap-2 rounded-lg p-2 ${linked.includes(x.entry.id) ? 'bg-secondary-fixed/50' : 'bg-surface-container-low'}`}>
                <label className="flex flex-1 min-w-0 items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="w-5 h-5 mt-0.5 shrink-0" checked={linked.includes(x.entry.id)} onChange={() => toggle(x.entry.id)} aria-label={`Link ${hm(x.entry.care_time)} ${entrySummary(x)}`} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-body-sm text-body-sm text-secondary"><Icon name={TYPE_ICON[x.entry.type]} className="text-[16px]" /><strong className="font-code-tabular text-primary">{hm(x.entry.care_time)}</strong> {TYPE_LABEL[x.entry.type]}</span>
                    <span className="block font-body-md text-body-md [overflow-wrap:anywhere]">{entrySummary(x)}</span>
                  </span>
                </label>
                <Button variant="ghost" className="shrink-0 px-2" onClick={() => insertLine(x)}>Add line</Button>
              </li>
            ))}
            {entries && entries.length === 0 && <li className="text-secondary">No confirmed records.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}

/* ------------------------------ Ward handover ------------------------------ */

export function WardHandoverPage() {
  const { db } = useApp();
  const rows = useLiveQuery(async () => {
    const encs = staysByPatient(await db.encounter.toArray());
    const patients = (await db.patient.toArray()).filter((p) => isActiveStay(encs.get(p.id)));
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
