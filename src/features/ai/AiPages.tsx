import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { useApp, useSession, isNurse, readCloudContext } from '../../state/app';
import { Badge, Button, Card, EmptyState, Icon, PageTitle } from '../../components/ui';
import { readAiConfig } from '../../lib/ai/config';
import { checkReadiness, type ReadinessItem } from '../../lib/ai/readiness';
import { deviceModel } from '../../lib/ai/firebase';
import { cloudDecision, CloudBlockedError } from '../../lib/cloud';
import { CloudRevokedError } from '../../lib/cloudGate';
import {
  AiUnavailableError, diffProposals, proposeVitalsInCloud, proposeVitalsOnDevice, type AiRaw, type VitalsProposal,
} from '../../lib/ai/service';
import { proposalRecord, syntheticNote } from '../../lib/ai/proposal';
import { drawSyntheticVitalsForm } from '../../lib/ai/syntheticForm';
import { VITAL_RULES, type VitalKey } from '../../lib/vitals';
import { createEntry } from '../../db/repos/entries';
import { getPhoto, savePhoto } from '../../db/photos';
import type { Entry, VitalSign } from '../../db/schema';
import { fullName } from '../patient/patientData';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const cloudMsg = (e: unknown) => (e instanceof CloudRevokedError ? `${e.message} Nothing from that request is shown or saved.` : e instanceof CloudBlockedError ? `Cloud blocked: ${e.message}` : msg(e));
const TONE: Record<ReadinessItem['status'], 'green' | 'amber' | 'red' | 'blue'> = { ok: 'green', warn: 'amber', fail: 'red', info: 'blue' };
const LABEL: Record<ReadinessItem['status'], string> = { ok: 'OK', warn: 'Check', fail: 'Not ready', info: 'Info' };

export function SourceLabel({ raw }: { raw: AiRaw }) {
  return raw.source === 'on_device'
    ? <Badge tone="navy" icon="memory">On this laptop · ONLY_ON_DEVICE · {raw.ms} ms</Badge>
    : <Badge tone="blue" icon="cloud">Cloud · ONLY_IN_CLOUD · {raw.ms} ms</Badge>;
}

function ProposalTable({ p }: { p: VitalsProposal }) {
  const keys = Object.keys(p.values) as VitalKey[];
  return (
    <div className="flex flex-col gap-1">
      {keys.length === 0 && !p.consciousness ? <p className="text-secondary">No values proposed.</p> : (
        <ul className="font-body-md">
          {keys.map((k) => <li key={k}><span className="text-secondary">{VITAL_RULES[k].label}:</span> <strong className="font-code-tabular">{p.values[k]}</strong> {VITAL_RULES[k].unit}</li>)}
          {p.consciousness && <li><span className="text-secondary">Consciousness:</span> <strong>{p.consciousness}</strong></li>}
        </ul>
      )}
      {p.dropped.length > 0 && <p className="font-body-sm text-[#7a5410]">Left out (failed basic checks): {p.dropped.join('; ')}</p>}
    </div>
  );
}

/* ------------------------------ AI check page ------------------------------ */

export function AiCheckPage() {
  const { dataset, phase } = useApp();
  const cfg = readAiConfig();
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkReadiness>> | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = () => { void checkReadiness({ cfg, dataset, phase }).then(setResult); };
  useEffect(run, [dataset, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const prepare = async () => {
    setError(null);
    setProgress(0);
    try {
      // Must run from a user click (Chrome needs user activation to download). ONLY_ON_DEVICE: no cloud.
      const model = await deviceModel(cfg, { image: true });
      await model.initializeDeviceModel((v) => setProgress(v));
      setProgress(1);
      run();
    } catch (e) {
      setError(msg(e));
      setProgress(null);
    }
  };
  const canPrepare = !!cfg.firebase && result?.text !== 'no-api' && result?.text !== 'unavailable' && phase !== 'down';

  return (
    <>
      <PageTitle>AI check (this laptop)</PageTitle>
      <Card className="flex flex-col gap-space-sm">
        <p className="text-on-surface-variant">Checked live on this laptop. AI is optional: every record can be typed by hand, and nothing an AI proposes is saved without a nurse checking it.</p>
        {!result ? <p role="status">Checking…</p> : (
          <ul aria-label="AI readiness" className="flex flex-col">
            {result.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start gap-space-md py-space-sm border-b border-card-border last:border-0">
                <span className="w-64 font-semibold text-primary">{i.label}</span>
                <span className="flex-1 font-body-md">{i.detail}</span>
                <Badge tone={TONE[i.status]}>{LABEL[i.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-space-sm items-center">
          <Button variant="secondary" onClick={run}><Icon name="refresh" />Check again</Button>
          <Button disabled={!canPrepare || (progress !== null && progress < 1)} onClick={() => void prepare()}><Icon name="download" />Prepare on-device model</Button>
          {progress !== null && <span role="status" className="font-body-md">{progress < 1 ? `Downloading ${Math.round(progress * 100)}%` : 'On-device model ready.'}</span>}
        </div>
        {phase === 'down' && <p className="font-body-sm text-secondary">During System down the model can only be used if it was prepared before. Downloads are not started now.</p>}
        {error && <p role="alert" className="text-error">{error}</p>}
      </Card>
      <Card className="flex flex-col gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm text-primary">Setting up a demo laptop</h2>
        <ol className="list-decimal pl-6 font-body-md flex flex-col gap-1">
          <li>Desktop Google Chrome 148 or later (chrome://settings/help).</li>
          <li>For paper photos: chrome://flags/#prompt-api-for-gemini-nano-multimodal-input → Enabled → restart Chrome.</li>
          <li>The build machine has Firebase config in <code>.env.local</code> (see <code>.env.example</code>). App Check site key for cloud features.</li>
          <li>With the network up, open this page and press <strong>Prepare on-device model</strong>. Wait for "ready" (several minutes; Chrome needs about 22 GB free disk).</li>
          <li>Check chrome://on-device-internals shows the model. Then the laptop can go offline.</li>
        </ol>
      </Card>
    </>
  );
}

/* ------------------------------ Paper photo: on-device proposal ------------------------------ */

/** Shown on Photo of paper (vitals sheet). On-device only, in every phase: an outage photo never goes to the cloud. */
export function OnDeviceProposalCard({ photoRef, onUse }: { photoRef: string; onUse: (p: VitalsProposal, raw: AiRaw) => void }) {
  const { db, dataset, phase } = useApp();
  const [state, setState] = useState<{ busy: boolean; result?: { proposal: VitalsProposal; raw: AiRaw }; error?: string }>({ busy: false });
  const run = async () => {
    setState({ busy: true });
    try {
      const photo = await getPhoto(db, photoRef);
      if (!photo) throw new Error('The photo is not on this laptop.');
      const result = await proposeVitalsOnDevice({ dataset, phase }, { prompt: 'Read the vital signs on this paper form.', image: photo.blob });
      setState({ busy: false, result });
    } catch (e) {
      setState({ busy: false, error: e instanceof AiUnavailableError ? e.message : `On-device AI did not work: ${msg(e)}` });
    }
  };
  return (
    <Card className="flex flex-col gap-space-sm" aria-label="On-device AI proposal">
      <h3 className="font-headline-sm text-primary flex items-center gap-2"><Icon name="memory" />Optional: on-device AI proposal</h3>
      <p className="font-body-sm text-secondary">Reads the photo on this laptop only (Firebase AI Logic, ONLY_ON_DEVICE). The photo never leaves the laptop. You still check and type-correct every value.</p>
      {!state.result && <Button variant="secondary" className="self-start" disabled={state.busy} onClick={() => void run()}><Icon name="auto_awesome" />{state.busy ? 'Reading on this laptop…' : 'Propose values from the photo'}</Button>}
      {state.error && <p role="alert" className="text-[#7a5410] font-body-md">{state.error}</p>}
      {state.result && (
        <>
          <SourceLabel raw={state.result.raw} />
          <ProposalTable p={state.result.proposal} />
          <p className="font-body-sm text-secondary">A proposal, not a record. It may be wrong. It will be saved as a draft for you to confirm beside the photo.</p>
          <Button className="self-start" onClick={() => onUse(state.result!.proposal, state.result!.raw)}>Put these values in the form</Button>
        </>
      )}
    </Card>
  );
}

/* ------------------------------ Practice: Device vs Cloud ------------------------------ */

type Side = { busy: boolean; result?: { proposal: VitalsProposal; raw: AiRaw }; error?: string };

export function PracticeComparePage() {
  const { db, clock, dataset, phase, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const sources = useLiveQuery(async () => {
    const vit = await db.entry.where('status').equals('confirmed').filter((e) => e.type === 'vital_sign').toArray();
    const out: { entry: Entry; v: VitalSign; label: string }[] = [];
    for (const e of vit.slice(0, 12)) {
      const v = await db.vital_sign.where('entry_id').equals(e.id).first();
      const p = await db.patient.get(e.patient_id);
      if (v && p) out.push({ entry: e, v, label: `${fullName(p)} · ${e.care_time.slice(11, 16)}` });
    }
    return out;
  }, [db]);
  const [pick, setPick] = useState('');
  const [kind, setKind] = useState<'text' | 'image'>('text');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [dev, setDev] = useState<Side>({ busy: false });
  const [cld, setCld] = useState<Side>({ busy: false });
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0); // bumps when the input changes: an answer for an older input is ignored
  const src = sources?.find((s) => s.entry.id === pick);
  const note = src ? syntheticNote(src.v, src.entry.care_time.slice(11, 16)) : '';
  const cloud = cloudDecision({ dataset, phase, purpose: 'compare' });

  // Cloud no longer allowed (System down declared, dataset switched): drop any cloud answer already on screen.
  useEffect(() => { if (!cloud.allowed) setCld({ busy: false }); }, [cloud.allowed]);

  useEffect(() => {
    gen.current += 1;
    setDev({ busy: false }); setCld({ busy: false });
    if (!src || kind !== 'image') { setImage(null); return; }
    let url = '';
    void drawSyntheticVitalsForm(src.v, src.label.split(' · ')[0]!, src.entry.care_time.slice(11, 16)).then((blob) => { url = URL.createObjectURL(blob); setImage({ blob, url }); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [pick, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  if (dataset !== 'practice') return <EmptyState icon="science" text="Device vs Cloud compare runs on Practice (fictional) data only." />;
  const input = () => (kind === 'image' && image ? { prompt: 'Read the vital signs on this paper form.', image: image.blob } : { prompt: note });
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
  const diffs = dev.result && cld.result ? diffProposals(dev.result.proposal, cld.result.proposal) : null;

  const saveDraft = async (side: { proposal: VitalsProposal; raw: AiRaw }) => {
    setError(null);
    try {
      if (!src) return;
      if (side.raw.source === 'in_cloud') {
        const live = await readCloudContext(db, dataset);
        const d = cloudDecision({ ...live, purpose: 'compare' });
        if (!d.allowed) { setCld({ busy: false }); throw new CloudRevokedError(d.reason); }
      }
      const actor = { userId: user!.id, deviceId };
      let ref: string | undefined;
      if (kind === 'image' && image) ref = (await savePhoto(db, clock, actor, src.entry.patient_id, image.blob)).ref;
      const values = { temp_c: null, heart_rate: null, resp_rate: null, bp_systolic: null, bp_diastolic: null, spo2: null, o2_device: null, o2_flow_lpm: null, pain_0_10: null, glucose_mgdl: null, consciousness: null, weight_kg: null, raw_text: kind === 'text' ? note : null, ...side.proposal.values, ...(side.proposal.consciousness ? { consciousness: side.proposal.consciousness } : {}) };
      const e = await createEntry(db, clock, actor, {
        type: 'vital_sign', patientId: src.entry.patient_id, careTime: src.entry.care_time, values: values as never, status: 'draft',
        rawInputKind: ref ? 'photo' : 'typed', rawInputRef: ref, aiProposal: proposalRecord(side.proposal, side.raw, clock.nowIso()), inferenceSource: side.raw.source,
      });
      navigate(`/capture/${e.id}/confirm`);
    } catch (e) { setError(cloudMsg(e)); }
  };

  const sideCard = (title: string, s: Side, run: () => void, enabled: boolean, why: string) => (
    <Card className="flex flex-col gap-space-sm" aria-label={title}>
      <h2 className="font-headline-sm text-headline-sm text-primary">{title}</h2>
      {!s.result && <Button variant="secondary" className="self-start" disabled={!src || s.busy || !enabled || (kind === 'image' && !image)} onClick={run}>{s.busy ? 'Running…' : `Run ${title.toLowerCase()}`}</Button>}
      {!enabled && <p className="font-body-sm text-secondary">{why}</p>}
      {s.error && <p role="alert" className="text-[#7a5410]">{s.error}</p>}
      {s.result && (s.result.raw.source === 'on_device' || cloud.allowed) && <><SourceLabel raw={s.result.raw} /><ProposalTable p={s.result.proposal} />
        {isNurse(user) && <Button variant="secondary" className="self-start" onClick={() => void saveDraft(s.result!)}>Review this one as a draft</Button>}</>}
    </Card>
  );

  return (
    <>
      <PageTitle>Device vs Cloud (Practice only)</PageTitle>
      <Card className="flex flex-col gap-space-md">
        <p className="text-on-surface-variant">Runs the same fictional input through the on-device model and, only when you press it, the cloud model, using Firebase AI Logic. Each answer shows where it really ran. Neither is assumed correct; a nurse checks before anything is saved.</p>
        <div className="flex flex-wrap gap-space-md items-end">
          <label className="flex flex-col gap-1"><span className="font-label-uppercase text-label-uppercase text-secondary">Fictional source record</span>
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-12 rounded-lg border border-card-border px-space-md" aria-label="Fictional source record">
              <option value="">Pick one</option>{(sources ?? []).map((s) => <option key={s.entry.id} value={s.entry.id}>{s.label}</option>)}
            </select></label>
          <div role="radiogroup" aria-label="Input type" className="flex gap-space-sm">
            <Button variant={kind === 'text' ? 'primary' : 'secondary'} role="radio" aria-checked={kind === 'text'} onClick={() => setKind('text')}>Synthetic note (text)</Button>
            <Button variant={kind === 'image' ? 'primary' : 'secondary'} role="radio" aria-checked={kind === 'image'} onClick={() => setKind('image')}>Synthetic paper form (image)</Button>
          </div>
        </div>
        {src && kind === 'text' && <p data-testid="compare-input" className="rounded-lg bg-surface-container-low p-space-sm font-code-tabular">{note}</p>}
        {src && kind === 'image' && image && <img src={image.url} alt="Synthetic practice paper vitals form" className="max-w-xl rounded-lg border border-card-border" />}
        {src && <p className="font-body-sm text-secondary">The input was generated from this fictional record, so its values are known: {Object.entries(src.v).filter(([k, v]) => v != null && k in VITAL_RULES).map(([k, v]) => `${VITAL_RULES[k as VitalKey].label} ${String(v)}`).join(', ')}.</p>}
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        {sideCard('On-device model', dev, () => void runDev(), true, '')}
        {sideCard('Cloud model', cld, () => void runCloud(), cloud.allowed, `Cloud blocked: ${cloud.reason}`)}
      </div>
      {diffs && (
        <Card aria-label="Differences">
          <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">Differences</h2>
          {diffs.length === 0 ? <p>Both proposals are the same. That does not make them correct.</p> : (
            <table className="w-full font-body-md"><thead><tr className="text-left text-secondary"><th>Field</th><th>On-device</th><th>Cloud</th></tr></thead>
              <tbody>{diffs.map((d) => <tr key={d.key} className="border-t border-card-border"><td>{d.label}</td><td className="font-code-tabular">{d.a}</td><td className="font-code-tabular">{d.b}</td></tr>)}</tbody></table>
          )}
        </Card>
      )}
      {error && <p role="alert" className="text-error">{error}</p>}
    </>
  );
}

/* ------------------------------ Back online: cloud second look ------------------------------ */

export function SecondLookCard({ entry, child }: { entry: Entry; child: VitalSign | undefined }) {
  const { db, dataset, phase } = useApp();
  const decision = cloudDecision({ dataset, phase, purpose: 'second_look' });
  const [s, setS] = useState<{ busy: boolean; result?: { proposal: VitalsProposal; raw: AiRaw }; error?: string }>({ busy: false });
  useEffect(() => { if (!decision.allowed) setS((cur) => (cur.result ? { busy: false } : cur)); }, [decision.allowed]);
  if (entry.type !== 'vital_sign' || entry.raw_input_kind !== 'photo' || !child) return null;
  const run = async () => {
    setS({ busy: true });
    try {
      const photo = await getPhoto(db, entry.raw_input_ref);
      if (!photo) throw new Error('The source photo is not on this laptop, so there is nothing to re-read.');
      setS({ busy: false, result: await proposeVitalsInCloud({ dataset, phase, readLive: () => readCloudContext(db, dataset) }, 'second_look', { prompt: 'Read the vital signs on this paper form.', image: photo.blob }) });
    } catch (e) { setS({ busy: false, error: cloudMsg(e) }); }
  };
  const recorded: VitalsProposal = { values: Object.fromEntries((Object.keys(VITAL_RULES) as VitalKey[]).filter((k) => child[k] != null).map((k) => [k, child[k] as number])), consciousness: child.consciousness ?? null, dropped: [] };
  const diffs = s.result ? diffProposals(recorded, s.result.proposal) : null;
  return (
    <Card className="flex flex-col gap-space-sm" aria-label="Cloud second look">
      <h3 className="font-headline-sm text-primary flex items-center gap-2"><Icon name="cloud" />Cloud second look (optional)</h3>
      <p className="font-body-sm text-secondary">Re-reads the original paper photo in the cloud (Firebase AI Logic, ONLY_IN_CLOUD) and lists where it differs from the confirmed record. It never changes the record.</p>
      {!decision.allowed && <p className="font-body-sm text-secondary">Not available now: {decision.reason}</p>}
      {!s.result && <Button variant="secondary" className="self-start" disabled={!decision.allowed || s.busy} onClick={() => void run()}>{s.busy ? 'Asking the cloud…' : 'Run cloud second look'}</Button>}
      {s.error && <p role="alert" className="text-[#7a5410]">{s.error}</p>}
      {s.result && diffs && decision.allowed && (
        <>
          <SourceLabel raw={s.result.raw} />
          {diffs.length === 0 ? <p>No differences from the confirmed record. That does not prove either is correct.</p> : (
            <table className="w-full font-body-md"><thead><tr className="text-left text-secondary"><th>Field</th><th>Confirmed record</th><th>Cloud reading</th></tr></thead>
              <tbody>{diffs.map((d) => <tr key={d.key} className="border-t border-card-border"><td>{d.label}</td><td className="font-code-tabular">{d.a}</td><td className="font-code-tabular">{d.b}</td></tr>)}</tbody></table>
          )}
          <p className="font-body-sm text-secondary">If the paper shows the record is wrong, use Fix on the record (a new version with a reason). Nothing was changed automatically.</p>
        </>
      )}
    </Card>
  );
}
