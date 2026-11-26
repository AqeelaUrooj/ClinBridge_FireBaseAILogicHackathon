import { useEffect, useRef, useState } from 'react';
import { isLocallyRegistered } from '../../lib/admission';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { useApp, useSession, isNurse, readCloudContext } from '../../state/app';
import { Badge, Button, ButtonLink, Card, EmptyState, Icon, PageTitle } from '../../components/ui';
import { cloudDecision } from '../../lib/cloud';
import { CloudRevokedError } from '../../lib/cloudGate';
import { diffProposals, proposeVitalsInCloud, proposeVitalsOnDevice, type AiRaw, type VitalsProposal } from '../../lib/ai/service';
import { proposalRecord, reportPrompt, syntheticNote } from '../../lib/ai/proposal';
import { compareRows, knownCount, noteKnown, sameCount, type Known, type Verdict } from '../../lib/ai/compare';
import { VITAL_RULES, type VitalKey } from '../../lib/vitals';
import { hm } from '../../lib/time';
import { createEntry } from '../../db/repos/entries';
import type { Entry, VitalSign } from '../../db/schema';
import { Block, Facts, Head, PANEL, saveJson } from '../admin/adminUi';
import { fullName } from '../patient/patientData';
import { LABEL } from '../reports/ink';
import { TEMPLATES, templateById, type TemplateId } from '../reports/templates';
import { Viewer } from '../reports/Viewer';
import { ProposalTable, SourceLabel } from './AiPages';
import { cloudMsg, msg } from './messages';
import { useReportPicture, type ReportPicture } from './useReportPicture';

type Kind = 'image' | 'text';
type Side = { busy: boolean; result?: { proposal: VitalsProposal; raw: AiRaw }; error?: string };
interface Source { id: string; name: string; mrn: string; bed: string; records: { entry: Entry; v: VitalSign }[] }

const VERDICT: Record<Exclude<Verdict, null>, { tone: 'green' | 'red' | 'amber'; label: string }> = { same: { tone: 'green', label: 'Same' }, different: { tone: 'red', label: 'Different' }, missing: { tone: 'amber', label: 'Not read' }, extra: { tone: 'red', label: 'Not in the input' } };
const SELECT = 'h-12 w-full rounded-lg border border-card-border px-space-md bg-surface-container-lowest';
const FIELDS: [string, string][] = [...Object.entries(VITAL_RULES).map(([k, r]): [string, string] => [k, r.label]), ['consciousness', 'Awake?']];
const listed = (k: Known) => [...Object.entries(k.values).map(([key, n]) => `${VITAL_RULES[key as VitalKey].label} ${n}`), ...(k.consciousness ? [`Awake? ${k.consciousness}`] : [])].join(', ');

/** /drill/compare. Practice only: in Real records nothing is loaded and nothing is drawn. */
export function PracticeComparePage() {
  const { dataset } = useApp();
  if (dataset !== 'practice') return <EmptyState icon="science" text="Device vs Cloud compare runs on Practice (fictional) data only." />;
  return <Compare />;
}

function useSources(): Source[] | undefined {
  const { db } = useApp();
  return useLiveQuery(async () => {
    const [patients, encounters, entries, vitals] = await Promise.all([
      db.patient.toArray(), db.encounter.toArray(),
      db.entry.where('status').equals('confirmed').filter((e) => e.type === 'vital_sign').toArray(), db.vital_sign.toArray(),
    ]);
    const child = new Map(vitals.map((v) => [v.entry_id, v]));
    // Only the reviewed Practice list: patients registered on this laptop are never benchmark inputs and never go to the cloud from here.
    return patients.filter((p) => !isLocallyRegistered(p)).sort((a, b) => a.id.localeCompare(b.id)).map((p): Source => ({
      id: p.id, name: fullName(p), mrn: p.mrn, bed: encounters.find((e) => e.patient_id === p.id)?.bed ?? '',
      records: entries.filter((e) => e.patient_id === p.id && child.has(e.id)).sort((a, b) => b.care_time.localeCompare(a.care_time)).map((entry) => ({ entry, v: child.get(entry.id)! })),
    }));
  }, [db]);
}

function Compare() {
  const { db, clock, dataset, phase, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const sources = useSources();
  const [patientId, setPatientId] = useState('');
  const [kind, setKind] = useState<Kind>('image');
  const [template, setTemplate] = useState<TemplateId>('assessment');
  const [recordId, setRecordId] = useState('');
  const [dev, setDev] = useState<Side>({ busy: false });
  const [cld, setCld] = useState<Side>({ busy: false });
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0); // bumps when the input changes: an answer for an older input is ignored
  const patient = sources?.find((s) => s.id === patientId);
  const record = patient?.records.find((r) => r.entry.id === recordId) ?? patient?.records[0];
  const note = record ? syntheticNote(record.v, hm(record.entry.care_time)) : '';
  const { picture, error: drawError, retry } = useReportPicture(patientId, template, kind === 'image');
  const cloud = cloudDecision({ dataset, phase, purpose: 'compare' });
  const design = templateById(template)!;

  // Cloud no longer allowed (System down declared, dataset switched): drop any cloud answer already on screen.
  useEffect(() => { if (!cloud.allowed) setCld({ busy: false }); }, [cloud.allowed]);

  // Another patient, design, kind of input or record: every answer on screen belongs to the old input and goes.
  const inputKey = `${kind}|${patientId}|${kind === 'image' ? template : record?.entry.id ?? ''}`;
  const [shownFor, setShownFor] = useState(inputKey);
  useEffect(() => {
    gen.current += 1;
    setDev({ busy: false }); setCld({ busy: false }); setError(null); setShownFor(inputKey);
  }, [inputKey]);
  const fresh = shownFor === inputKey;
  const device: Side = fresh ? dev : { busy: false };
  const online: Side = fresh && cloud.allowed ? cld : fresh ? { ...cld, result: undefined } : { busy: false };

  const known: Known | null = kind === 'image' ? picture?.reading ?? null : record ? noteKnown(record.v) : null;
  const ready = kind === 'image' ? !!picture?.reading : !!record;
  const waiting = !patient ? 'Pick a fictional patient first.'
    : kind === 'text' ? (record ? '' : 'No vital signs are charted for this patient, so there is no typed note.')
      : drawError ? 'The report picture could not be drawn.' : !picture ? 'The report picture is being drawn.' : !picture.reading ? 'This report shows no vital signs, so there is nothing to compare.' : '';

  /** One input for both models: the same picture file or the same note, with the same instructions. */
  const input = () => (kind === 'image' && picture?.reading ? { prompt: reportPrompt(picture.reading.time), image: picture.blob } : { prompt: note });
  const runDev = async () => {
    const g = gen.current; setDev({ busy: true });
    try { const result = await proposeVitalsOnDevice({ dataset, phase }, input()); if (g === gen.current) setDev({ busy: false, result }); }
    catch (e) { if (g === gen.current) setDev({ busy: false, error: msg(e) }); }
  };
  const runCloud = async () => {
    const g = gen.current; setCld({ busy: true });
    try { const result = await proposeVitalsInCloud({ dataset, phase, readLive: () => readCloudContext(db, dataset) }, 'compare', input()); if (g === gen.current) setCld({ busy: false, result }); }
    catch (e) { if (g === gen.current) setCld({ busy: false, error: cloudMsg(e) }); }
  };
  const diffs = device.result && online.result ? diffProposals(device.result.proposal, online.result.proposal) : null;

  /**
   * Typed note only. A report picture is drawn by the program: an entry can only say "typed" or "photo", and a drawn
   * picture saved as "photo" could later be taken for a photo of real paper.
   */
  const saveDraft = async (side: { proposal: VitalsProposal; raw: AiRaw }) => {
    setError(null);
    try {
      if (!record || kind !== 'text') return;
      if (side.raw.source === 'in_cloud') {
        const live = await readCloudContext(db, dataset);
        const d = cloudDecision({ ...live, purpose: 'compare' });
        if (!d.allowed) { setCld({ busy: false }); throw new CloudRevokedError(d.reason); }
      }
      const values = { temp_c: null, heart_rate: null, resp_rate: null, bp_systolic: null, bp_diastolic: null, spo2: null, o2_device: null, o2_flow_lpm: null, pain_0_10: null, glucose_mgdl: null, consciousness: null, weight_kg: null, raw_text: note, ...side.proposal.values, ...(side.proposal.consciousness ? { consciousness: side.proposal.consciousness } : {}) };
      const e = await createEntry(db, clock, { userId: user!.id, deviceId }, {
        type: 'vital_sign', patientId: record.entry.patient_id, careTime: record.entry.care_time, values: values as never, status: 'draft',
        rawInputKind: 'typed', aiProposal: proposalRecord(side.proposal, side.raw, clock.nowIso()), inferenceSource: side.raw.source,
      });
      navigate(`/capture/${e.id}/confirm`);
    } catch (e) { setError(cloudMsg(e)); }
  };

  const rows = known ? compareRows(known, device.result?.proposal, online.result?.proposal) : [];
  const ran = !!device.result || !!online.result;
  const prompt = typeof (globalThis as { LanguageModel?: unknown }).LanguageModel !== 'undefined';
  const answer = (s: Side) => (s.result ? { ran_at: s.result.raw.source, ms: s.result.raw.ms, proposal: s.result.proposal } : 'not run');
  const save = () => known && saveJson(`clinbridge-practice-compare-${clock.nowIso().slice(0, 16).replace(/[:T]/g, '-')}.json`, {
    made_at: clock.nowIso(), note: 'Practice drill. Fictional input. Only answers that really ran are in this file; neither is assumed correct.', input: kind, patient_id: patientId,
    ...(kind === 'image' && picture ? {
      synthetic: LABEL, report: { design: picture.template, drawn_at: picture.drawnAt, sha256: picture.sha256, type: picture.blob.type, bytes: picture.blob.size, width: picture.width, height: picture.height },
      compared_set: { time: picture.reading!.time, from_hospital_list: picture.reading!.fromList }, instructions: reportPrompt(picture.reading!.time),
    } : { source_record: record?.entry.id }),
    known_values: { ...known.values, consciousness: known.consciousness },
    on_device: answer(device), cloud: answer(online),
  });

  const result = (x: Verdict) => (x ? <Badge tone={x === 'extra' && kind === 'image' ? 'amber' : VERDICT[x].tone}>{x === 'extra' && kind === 'image' ? 'Not in this set' : VERDICT[x].label}</Badge> : null);
  const sideCard = (title: string, icon: string, where: string, s: Side, run: () => void, enabled: boolean, why: string, side: 'deviceVerdict' | 'cloudVerdict') => {
    const n = sameCount(rows, side);
    return (
      <Block title={title} icon={icon} badge={<Badge tone={s.result ? 'green' : s.error ? 'amber' : 'neutral'}>{s.busy ? 'Running' : s.result ? 'Ran' : s.error ? 'No answer' : 'Not run'}</Badge>} text={where}>
        {!s.result && <Button variant="secondary" className="self-start" disabled={!ready || s.busy || !enabled} onClick={run}><Icon name="play_arrow" />{s.busy ? 'Running…' : `Run ${title.toLowerCase()}`}</Button>}
        {waiting && <p className="font-body-sm text-body-sm text-secondary">{waiting}</p>}
        {!enabled && <p className="font-body-sm text-body-sm text-secondary">{why}</p>}
        {s.error && <p role="alert" className="text-[#7a5410]">{s.error}</p>}
        {s.result && <><SourceLabel raw={s.result.raw} /><p className="font-body-md text-body-md"><strong className="font-code-tabular text-[24px] text-primary">{n.same} of {n.known}</strong> known values repeated exactly</p><ProposalTable p={s.result.proposal} />
          {kind === 'text' && isNurse(user) && <Button variant="secondary" className="self-start" onClick={() => void saveDraft(s.result!)}>Review this one as a draft</Button>}
          {kind === 'image' && <p className="font-body-sm text-body-sm text-secondary">No draft from a drawn report: it must not become a paper source. The typed note can be reviewed as a draft.</p>}</>}
      </Block>
    );
  };
  const tile = (icon: string, label: string, value: string, text: string) => (
    <div className="min-w-0 rounded-lg bg-surface-container-low p-space-sm flex items-start gap-space-sm"><Icon name={icon} className="text-primary" /><div className="min-w-0"><p className="font-label-uppercase text-label-uppercase uppercase text-secondary">{label}</p><p className="font-body-md text-body-md font-semibold text-primary [overflow-wrap:anywhere]">{value}</p><p className="font-body-sm text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{text}</p></div></div>
  );
  const pickPatient = (id: string) => { setPatientId(id); setRecordId(''); };

  const BADGE = kind === 'image' ? 'block sm:inline xl:block 2xl:inline' : 'block sm:inline';
  const answers = (
    <>
      {known && (
        <section aria-label="Field by field" className={`${PANEL} flex flex-col gap-space-sm`}>
          <div><h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="rule" />Field by field</h2><p className="font-body-sm text-body-sm text-on-surface-variant">What is written in the input beside each answer. One drill is not a test of a model and says nothing about real paper.{kind === 'image' && ' An answer for a value that is not written in the compared set is shown but not counted.'}</p></div>
          <div className="overflow-x-auto"><table className="w-full font-body-md text-body-md"><thead><tr className="text-left bg-surface-container-low font-label-uppercase text-label-uppercase uppercase text-secondary"><th className="p-2">Field</th><th className="p-2">{kind === 'image' && picture?.reading ? `On the sheet, ${hm(picture.reading.time)}` : 'In the input'}</th><th className="p-2">On-device</th><th className="p-2">Cloud</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-card-border align-top"><th scope="row" className="p-2 text-left font-semibold text-primary">{r.label}</th><td className="p-2 font-code-tabular">{r.source ?? '—'}{r.source !== null && !r.counted && <span className="block font-body-sm text-body-sm text-secondary">other words than the choices, not compared</span>}</td><td className="p-2"><span className="font-code-tabular">{r.device ?? (device.result ? '—' : 'Not run')}</span> <span className={BADGE}>{result(r.deviceVerdict)}</span></td><td className="p-2"><span className="font-code-tabular">{r.cloud ?? (online.result ? '—' : 'Not run')}</span> <span className={BADGE}>{result(r.cloudVerdict)}</span></td></tr>)}</tbody></table></div>
        </section>
      )}
      {diffs && (
        <Card aria-label="Differences">
          <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">Differences</h2>
          {diffs.length === 0 ? <p>Both proposals are the same. That does not make them correct.</p> : (
            <table className="w-full font-body-md"><thead><tr className="text-left text-secondary"><th>Field</th><th>On-device</th><th>Cloud</th></tr></thead>
              <tbody>{diffs.map((d) => <tr key={d.key} className="border-t border-card-border"><td>{d.label}</td><td className="font-code-tabular">{d.a}</td><td className="font-code-tabular">{d.b}</td></tr>)}</tbody></table>
          )}
        </Card>
      )}
    </>
  );

  return (
    <>
      <PageTitle>Device vs Cloud (Practice only)</PageTitle>
      <Head label="Practice drill" title="One input, two models"
        badges={<><Badge tone="blue" icon="school">Practice drill</Badge><Badge>Fictional patients only</Badge></>}
        text="Runs the same fictional input through the on-device model and, only when you press it, the cloud model, using Firebase AI Logic. Each answer shows where it really ran. Neither is assumed correct; a nurse checks before anything is saved."
        actions={<><ButtonLink variant="secondary" to="/ai"><Icon name="neurology" />AI check</ButtonLink><Button variant="secondary" disabled={!ran} onClick={save}><Icon name="download" />Save answers (JSON)</Button></>}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-2">
          {tile('memory', 'On-device', prompt ? 'Prompt API found' : 'Not available here', 'Whether the model runs: AI check')}
          {tile('cloud', 'Cloud', cloud.allowed ? 'Allowed for this drill' : 'Blocked', cloud.allowed ? 'Runs only when you press it' : cloud.reason)}
          {tile('science', 'Records', 'Practice, fictional', 'Real records are refused')}
          {tile('fact_check', 'Known values', known ? String(knownCount(known)) : '—', known ? 'Written in the input' : 'Pick a source first')}
        </div>
      </Head>

      <section aria-label="Choose the input" className={`${PANEL} flex flex-col gap-space-md`}>
        <div className="flex flex-wrap gap-space-md items-end">
          <label className="flex flex-col gap-1 w-full sm:w-72"><span className="font-label-uppercase text-label-uppercase text-secondary">Fictional patient</span>
            <select value={patientId} onChange={(e) => pickPatient(e.target.value)} className={SELECT} aria-label="Fictional patient">
              <option value="">Pick one</option>{(sources ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.bed && ` · ${s.bed}`}</option>)}
            </select></label>
          <div role="radiogroup" aria-label="Input type" className="flex flex-wrap gap-space-sm">
            <Button variant={kind === 'image' ? 'primary' : 'secondary'} role="radio" aria-checked={kind === 'image'} onClick={() => setKind('image')}>Handwritten report (image)</Button>
            <Button variant={kind === 'text' ? 'primary' : 'secondary'} role="radio" aria-checked={kind === 'text'} onClick={() => setKind('text')}>Synthetic note (text)</Button>
          </div>
          {kind === 'text' && patient && patient.records.length > 0 && (
            <label className="flex flex-col gap-1 w-full sm:w-60"><span className="font-label-uppercase text-label-uppercase text-secondary">Record for the note</span>
              <select value={record?.entry.id ?? ''} onChange={(e) => setRecordId(e.target.value)} className={SELECT} aria-label="Record for the note">
                {patient.records.map((r) => <option key={r.entry.id} value={r.entry.id}>Vital signs {hm(r.entry.care_time)}</option>)}
              </select></label>
          )}
        </div>
        {kind === 'image' && (
          <div role="radiogroup" aria-label="Report design" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-space-sm">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={t.id === template} onClick={() => setTemplate(t.id)}
                className={`w-full text-left rounded-lg p-space-sm border-2 min-h-11 ${t.id === template ? 'border-primary bg-surface-container' : 'border-transparent bg-surface-container-low hover:bg-surface-container'}`}>
                <span className="flex items-center justify-between gap-2 font-body-md text-body-md font-semibold text-primary">{t.name}{t.id === template && <Badge tone="navy">Chosen</Badge>}</span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">{t.about}</span>
              </button>
            ))}
          </div>
        )}
        <ul aria-label="Sources" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-space-sm">
          {(sources ?? []).slice(0, 3).map((s, i) => (
            <li key={s.id}><button type="button" aria-pressed={patientId === s.id} onClick={() => pickPatient(s.id)} className={`w-full text-left rounded-lg p-space-sm border-2 ${patientId === s.id ? 'border-primary bg-surface-container' : 'border-transparent bg-surface-container-low hover:bg-surface-container'}`}><span className="flex items-center justify-between gap-2 font-label-uppercase text-label-uppercase uppercase text-secondary">Sample {i + 1}{patientId === s.id && <Badge tone="navy">Chosen</Badge>}</span><span className="block font-body-md text-body-md font-semibold text-primary">{s.name}</span><span className="block font-body-sm text-body-sm text-on-surface-variant">Fictional, bed {s.bed || '—'}, {s.records.length} charted {s.records.length === 1 ? 'set' : 'sets'} of vital signs</span></button></li>
          ))}
        </ul>
      </section>

      <div className={`grid grid-cols-1 gap-space-md items-start ${kind === 'image' ? 'xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : 'xl:grid-cols-3'}`}>
        <Block title="Source" icon="description" badge={<Badge>{kind === 'image' ? 'Drawn report' : 'Typed note'}</Badge>}>
          {!patient && <p className="font-body-md text-body-md text-secondary">Nothing chosen yet. Pick a fictional patient.</p>}
          {patient && kind === 'text' && record && <p data-testid="compare-input" className="rounded-lg bg-[#fdfbf3] border border-card-border p-space-sm font-code-tabular">{note}</p>}
          {patient && kind === 'text' && <p className="font-body-sm text-body-sm text-secondary">{known ? `The input was generated from this fictional record, so its values are known: ${listed(known)}.` : waiting}</p>}
          {patient && kind === 'image' && (
            <>
              <Facts rows={[['Selected patient', `${patient.name} · ${patient.mrn}`], ['Selected report', design.name]]} />
              <p role="note" className="flex items-start gap-2 rounded-lg bg-clinical-red-bg border border-clinical-red-border px-space-md py-space-sm font-body-sm text-body-sm"><Icon name="science" className="text-[20px] text-clinical-red" /><span><strong>{LABEL}.</strong> Drawn by the program from this fictional patient’s Practice records, the same sheet as on the patient’s handwritten report page. It is not a photo of paper and is never saved as one.</span></p>
              {!picture && !drawError && <p role="status" className="flex items-center gap-2 font-body-md text-body-md text-secondary"><Icon name="progress_activity" className="motion-safe:animate-spin" />Drawing the {design.name.toLowerCase()} of {patient.name}…</p>}
              {drawError && <div role="alert" className="flex flex-wrap items-center gap-space-sm text-clinical-red"><span>The report picture could not be drawn: {drawError}</span><Button variant="secondary" onClick={retry}><Icon name="refresh" />Try again</Button></div>}
              {picture && <Picture key={picture.key} p={picture} />}
            </>
          )}
        </Block>
        <div className={kind === 'image' ? 'min-w-0 flex flex-col gap-space-md' : 'contents'}>
          {sideCard('On-device model', 'memory', 'On this laptop only. Never falls back to the cloud.', device, () => void runDev(), true, '', 'deviceVerdict')}
          {sideCard('Cloud model', 'cloud', 'Only in the cloud, only when you press it.', online, () => void runCloud(), cloud.allowed, `Cloud blocked: ${cloud.reason}`, 'cloudVerdict')}
          {kind === 'image' && answers}
        </div>
      </div>
      {kind === 'text' && answers}

      {error && <p role="alert" className="text-error">{error}</p>}
    </>
  );
}

/** The picture file itself (not a second drawing), what is compared in it and what is not. */
function Picture({ p }: { p: ReportPicture }) {
  const r = p.reading;
  const missing = r ? FIELDS.filter(([k]) => (k === 'consciousness' ? !r.consciousness && !r.otherWords : !(k in r.values))).map(([, label]) => label) : [];
  return (
    <>
      <Viewer svgKey={p.key} ratio={p.height / p.width}>
        <img data-testid="report-picture" data-sha256={p.sha256} src={p.url} width={p.width} height={p.height} className="block w-full h-auto" alt={`Synthetic Practice report: ${templateById(p.template)!.name} for ${p.name}, MRN ${p.mrn}. Not a medical record.`} />
      </Viewer>
      {r ? (
        <div data-testid="compared-set" className="flex flex-col gap-1 font-body-sm text-body-sm text-on-surface-variant">
          <p><strong className="text-primary">Compared: the last set of vital signs on this sheet, {hm(r.time)}{r.fromList && ' (from the hospital list)'}.</strong> {listed(r)}.{r.otherWords && ` “${r.otherWords}” is written in other words than the choices and is not compared.`}</p>
          {missing.length > 0 && <p>Not written on this sheet for {hm(r.time)}, so not compared: {missing.join(', ')}.</p>}
          <p>Background, medicines, lines, labs, skin, notes and handover on the sheet are not read and not compared: the checked workflow reads vital signs only.</p>
        </div>
      ) : (
        <p role="note" data-testid="compared-set" className="font-body-md text-body-md">This report shows no vital signs for {p.name}, so there is nothing to compare. The checked workflow reads vital signs only. Choose another patient or design.</p>
      )}
      <p className="font-body-sm text-body-sm text-secondary [overflow-wrap:anywhere]">Both models get this same picture file: {p.width} × {p.height} pixels, {p.blob.type === 'image/jpeg' ? 'JPEG' : p.blob.type}, {(p.blob.size / 1_000_000).toFixed(1)} MB, fingerprint <span className="font-code-tabular">{p.sha256.slice(0, 12)}</span>.</p>
    </>
  );
}
