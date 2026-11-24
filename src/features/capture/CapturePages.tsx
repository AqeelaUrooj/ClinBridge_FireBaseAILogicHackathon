import { PUBLIC_DEMO } from '../../config/publicDemo';
import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { confirmDraft, createEntry, listPatientEntries } from '../../db/repos/entries';
import { savePhoto, type StoredPhoto } from '../../db/photos';
import { PhotoView } from './PhotoView';
import type { ActiveOrder, EntryType, IntakeOutput, MedAdmin, Note, PhotoCheck, VitalSign } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { assessQuality, readPixels, type Quality } from '../../lib/photoQuality';
import { currentRate, isMedOrder, medFormFromOrder, orderGroup, type MedEvent } from '../../lib/meds';
import { Badge, Breadcrumbs, Button, ButtonLink, Dialog, EmptyState, Icon } from '../../components/ui';
import { MedIllustration, type MedicalAsset } from '../../components/MedIllustration';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { VitalsEditor, vitalsToForm } from '../vitals/VitalsEditor';
import { MedEditor } from '../meds/MedEditor';
import { IoEditor, NoteEditor, ioToForm, noteToForm } from '../charting/editors';
import { useCurrentEntry } from '../entries/EntryPages';
import { OnDeviceProposalCard } from '../ai/AiPages';
import { proposalToForm, type AiRaw, type VitalsProposal } from '../../lib/ai/service';
import { aiMeta, proposalRecord } from '../../lib/ai/proposal';
import { keepDraftSource } from './draftSource';

type FormKind = 'vital_sign' | 'med_admin' | 'intake_output' | 'note';
const KINDS: { v: FormKind; label: string; art: MedicalAsset; check: PhotoCheck['form_type'] }[] = [
  { v: 'vital_sign', label: 'Vitals sheet', art: 'vitals/bp-monitor', check: 'vitals' },
  { v: 'med_admin', label: 'Medicine sheet', art: 'medication/capsule', check: 'medication' },
  { v: 'intake_output', label: 'Fluids sheet', art: 'medication/iv-bag', check: 'intake_output' },
  { v: 'note', label: 'Nursing note', art: 'workflows/checklist', check: 'note' },
];

function useOrders() {
  const { db } = useApp();
  const { patient, encounter } = useCurrentPatient();
  return useLiveQuery(async () => {
    const orders = encounter ? await db.active_order.where('encounter_id').equals(encounter.id).toArray() : [];
    const meds = (await listPatientEntries(db, patient.id)).filter((x) => x.entry.type === 'med_admin');
    return { orders: orders.filter(isMedOrder), ivOrders: orders.filter((o) => o.type === 'iv'), meds };
  }, [db, encounter?.id, patient.id]);
}

const medEvents = (o: ActiveOrder): MedEvent[] => (orderGroup(o) === 'infusion' ? ['rate_changed', 'administered', 'held'] : ['administered', 'held', 'refused']);

/* ------------------------------ Shared frame ------------------------------ */

function Pane({ label, icon, title, sub, aside, children }: { label: string; icon: string; title: string; sub: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={label} className="min-w-0 bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm flex flex-col gap-space-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name={icon} />{title}</h2>
          <p className="font-body-sm text-body-sm text-secondary">{sub}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The grey line under a pane title: plain facts about where this is kept. */
function Strip({ icon, children }: { icon: string; children: ReactNode }) {
  return <p className="rounded-lg bg-surface-container-low px-space-sm py-2 font-body-sm text-body-sm text-on-surface-variant flex flex-wrap items-center gap-x-2 gap-y-1"><Icon name={icon} className="text-[18px]" />{children}</p>;
}

/** Bar at the bottom of the capture screens: what else can be done, and where the record goes. */
function EndBar({ patientName, children }: { patientName: string; children: ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm flex flex-wrap items-center justify-between gap-space-md">
      <div className="flex flex-wrap items-center gap-space-sm">{children}</div>
      <p className="font-body-sm text-body-sm text-secondary">
        <span className="block font-label-uppercase text-label-uppercase uppercase">Goes to</span>
        <span className="font-semibold text-primary">{patientName}’s history, on this laptop</span>
      </p>
    </div>
  );
}

const PANES = 'grid grid-cols-1 lg:grid-cols-2 gap-space-md items-start';

/* ------------------------------ New capture ------------------------------ */

export function CapturePage() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const ord = useOrders();
  const [kind, setKind] = useState<FormKind | null>(null);
  const [photo, setPhoto] = useState<StoredPhoto | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asDraft, setAsDraft] = useState(false);
  const [orderId, setOrderId] = useState('');
  // On-device AI proposal (optional). When used, the record is always saved as a draft to confirm beside the photo.
  const [ai, setAi] = useState<{ proposal: VitalsProposal; raw: AiRaw; at: string } | null>(null);
  const [aiDropped, setAiDropped] = useState(false);
  const [changeKind, setChangeKind] = useState(false);
  const base = `/patients/${patient.id}`;
  if (!isNurse(user)) return <EmptyState icon="block" text="Only nurses can add records." />;
  const k = KINDS.find((x) => x.v === kind);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true); setError(null);
    try {
      const saved = await savePhoto(db, clock, { userId: user!.id, deviceId }, patient.id, f); // saved first, before anything else
      setPhoto(saved);
      // A proposal belongs to the photo it was read from: a new photo drops it, so it can never be saved with another photo.
      setAiDropped(!!ai); setAi(null);
      try { const { px, shortSide } = await readPixels(f); setQuality(assessQuality(px, shortSide)); }
      catch { setQuality({ problem: 'none', hints: ['Could not check the photo quality. Look at it closely.'], brightness: 0, sharpness: 0, shortSide: 0 }); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the photo.'); }
    setBusy(false);
  }

  const photoCheck = (): PhotoCheck => ({ form_type: k!.check, readable: (quality?.problem ?? 'none') === 'none', problem: quality?.problem ?? 'none', overridden: (quality?.problem ?? 'none') !== 'none' });
  const save = async <T extends EntryType>(type: T, values: never, careTime: string) => {
    const e = await createEntry(db, clock, { userId: user!.id, deviceId }, {
      type, patientId: patient.id, careTime, values, rawInputKind: 'photo', rawInputRef: photo!.ref, photoCheck: photoCheck(), status: asDraft || ai ? 'draft' : 'confirmed',
      ...(ai && type === 'vital_sign' ? { aiProposal: proposalRecord(ai.proposal, ai.raw, ai.at), inferenceSource: ai.raw.source } : {}),
    });
    navigate(`/entries/${e.id}`, { replace: true });
  };
  const common = { minCareTime: encounter?.admit_time, saveLabel: asDraft ? 'Save as draft' : 'Save', sourceCheck: !asDraft && !ai, onCancel: () => navigate(base) };
  const order = ord?.orders.find((o) => o.id === orderId);

  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Photo of paper' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary flex items-center gap-3"><MedIllustration name="workflows/paper-photo" size={36} />Photo of paper</h1>
      <p className="font-body-sm text-secondary -mt-space-sm">Works with no network and no AI. You type the values from the photo; the photo is kept as the source.</p>

      <div className={PANES}>
        <Pane label="Paper photo" icon="description" title="Paper form" sub={photo ? 'The photo is kept as the source of the record.' : 'Take one photo of the whole form.'}
          aside={photo ? <Badge tone="green" icon="check_circle">Photo saved on this laptop</Badge> : undefined}>
          {!photo && (
            <div className="rounded-lg bg-surface-container-low p-space-lg grid place-items-center">
              <div className="w-full max-w-sm bg-surface-container-lowest rounded-lg border border-card-border shadow-sm px-space-lg pb-space-lg flex flex-col items-center gap-space-md text-center">
                <span aria-hidden className="w-20 h-5 -mt-2 rounded bg-outline-variant grid place-items-center"><span className="w-10 h-1.5 rounded bg-surface-container-lowest" /></span>
                <MedIllustration name="workflows/paper-photo" size={72} />
                <p className="font-body-md text-on-surface-variant">Lay the form flat, in good light, with all four corners in the picture. The photo is saved here before anything is typed.</p>
                {PUBLIC_DEMO && <p className="rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-sm text-[#5c400c] font-semibold">Public demo: use a made-up sheet only, never a real patient’s paper.</p>}
                <label className="inline-flex items-center gap-2 min-h-12 px-space-lg rounded-lg bg-primary text-on-primary font-semibold cursor-pointer focus-within:ring-2 focus-within:ring-secondary">
                  <Icon name="photo_camera" />{busy ? 'Saving…' : 'Take or choose photo'}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" data-testid="photo-input" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
                </label>
                {error && <p role="alert" className="text-error">{error}</p>}
              </div>
            </div>
          )}
          {photo && (
            <>
              {quality && (quality.hints.length > 0 ? (
                <div role="status" className="rounded-lg border border-downtime-amber-border bg-downtime-amber-bg p-space-sm">
                  <ul className="list-disc pl-5 font-body-md">{quality.hints.map((h) => <li key={h}>{h}</li>)}</ul>
                  <p className="font-body-sm text-secondary mt-1">You can retake, or carry on if you can read it. Your choice is recorded.</p>
                </div>
              ) : <Strip icon="check_circle"><strong className="text-primary">Photo looks clear</strong> Light and sharpness were checked on this laptop.</Strip>)}
              <PhotoView refId={photo.ref} actions={(
                <label className="inline-flex items-center gap-1 min-h-11 px-3 rounded-lg bg-clinical-red-bg text-clinical-red font-body-sm text-body-sm font-semibold cursor-pointer focus-within:ring-2 focus-within:ring-secondary">
                  <Icon name="photo_camera" className="text-[18px]" />{busy ? 'Saving…' : 'Retake (keeps this one too)'}
                  <input type="file" accept="image/*" capture="environment" className="sr-only" data-testid="retake-input" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
                </label>
              )} />
              {error && <p role="alert" className="text-error">{error}</p>}
            </>
          )}
        </Pane>

        <Pane label="Type and check" icon="fact_check" title="Type and check the record" sub="Type the values from the form, then check each one against the photo."
          aside={<Badge tone="navy" icon="wifi_off">Works with no network</Badge>}>
          <Strip icon="lock"><strong className="text-primary">Kept on this laptop</strong> {ai ? 'Started from the on-device AI proposal. You check every value.' : 'Values are typed by you.'}</Strip>
          {!kind ? (
            <div className="flex flex-col gap-space-sm">
              <h3 className="font-body-lg font-semibold text-primary">What kind of paper form is it?</h3>
              <div className="grid grid-cols-2 gap-space-sm">
                {KINDS.map((x) => (
                  <button key={x.v} type="button" onClick={() => setKind(x.v)} className="min-h-24 rounded-xl border border-card-border bg-surface-container-lowest hover:border-secondary hover:bg-surface-container-low flex flex-col items-center justify-center gap-2 p-space-sm">
                    <MedIllustration name={x.art} size={40} />
                    <span className="font-body-md font-semibold text-primary">{x.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-card-border px-space-sm py-1">
              <span className="flex items-center gap-2 font-body-md font-semibold text-primary"><MedIllustration name={k!.art} size={28} />{k!.label}</span>
              <Button variant="ghost" onClick={() => (photo ? setChangeKind(true) : setKind(null))}>Change form type</Button>
            </p>
          )}
          {kind && !photo && <p className="rounded-lg border border-dashed border-card-border p-space-md font-body-md text-secondary">Take the photo first. Then the boxes for the {k!.label.toLowerCase()} open here, beside the photo.</p>}
          {kind && photo && (
            <>
              {kind === 'vital_sign' && !ai && <OnDeviceProposalCard key={photo.ref} photoRef={photo.ref} onUse={(proposal, raw) => { setAiDropped(false); setAi({ proposal, raw, at: clock.nowIso() }); }} />}
              {aiDropped && <p role="status" className="rounded-lg border border-downtime-amber-border bg-downtime-amber-bg p-space-sm font-body-md">You took a new photo. The proposal came from the earlier photo, so it was removed and the boxes are empty again.</p>}
              {ai && <p role="status" className="rounded-lg border border-card-border bg-surface-container-low p-space-sm font-body-md"><Icon name="memory" /> The boxes below start with the on-device AI proposal. Check every value against the photo. It will be saved as a <strong>draft</strong> and confirmed on the next screen.</p>}
              {kind === 'vital_sign' && <VitalsEditor key={ai ? 'ai' : aiDropped ? 'manual-again' : 'manual'} {...common} {...(ai ? { initial: proposalToForm(ai.proposal), proposal: proposalRecord(ai.proposal, ai.raw, ai.at), saveLabel: 'Save as draft' } : {})} onSubmit={({ values, careTime }) => save('vital_sign', { ...values, weight_kg: null, raw_text: null } as never, careTime)} />}
              {kind === 'intake_output' && ord && <IoEditor {...common} initial={ioToForm()} ivOrders={ord.ivOrders} onSubmit={({ values, careTime }) => save('intake_output', values as never, careTime)} />}
              {kind === 'note' && <NoteEditor {...common} initial={noteToForm()} onSubmit={({ values, careTime }) => save('note', values as never, careTime)} />}
              {kind === 'med_admin' && ord && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="font-label-uppercase text-label-uppercase text-secondary uppercase">Which order is on the paper?</span>
                    <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="h-12 w-full rounded-lg border border-card-border px-space-md bg-surface-container-lowest" aria-label="Medicine order">
                      <option value="">Pick an order…</option>
                      {ord.orders.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
                    </select>
                  </label>
                  {order && (
                    <MedEditor key={order.id} {...common} order={order} initial={medFormFromOrder(order, 'administered')} events={medEvents(order)}
                      priorRate={currentRate(order, ord.meds).rate}
                      onSubmit={({ values, careTime }) => save('med_admin', values as never, careTime)} />
                  )}
                </>
              )}
            </>
          )}
        </Pane>
      </div>

      {kind && photo && (
        <EndBar patientName={fullName(patient)}>
          {ai ? <Badge tone="amber" icon="fact_check">Will be saved as a draft</Badge> : (
            <label className="flex items-center gap-2 min-h-11 font-body-md cursor-pointer">
              <input type="checkbox" className="w-5 h-5" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} />Save as a draft to check later (shows in Alerts)
            </label>
          )}
        </EndBar>
      )}

      {changeKind && (
        <Dialog title="Change the form type?" onClose={() => setChangeKind(false)}>
          <p className="font-body-md text-on-surface-variant">The values typed on this screen are cleared. The photo stays.</p>
          <div className="flex gap-space-sm">
            <Button className="flex-1" onClick={() => { setKind(null); setAi(null); setAiDropped(false); setOrderId(''); setChangeKind(false); }}>Change type</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setChangeKind(false)}>Go back</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

/* ------------------------------ Confirm a draft ------------------------------ */

export function ConfirmDraftPage() {
  const { entry, child } = useCurrentEntry();
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const ord = useOrders();
  if (entry.status !== 'draft') return <EmptyState icon="task_alt" text="This record is not a draft." action={<ButtonLink variant="secondary" to={`/entries/${entry.id}`}>Open record</ButtonLink>} />;
  if (!isNurse(user)) return <EmptyState icon="block" text="Only nurses can confirm records." />;
  const done = async (values: never, careTime: string) => {
    await confirmDraft(db, clock, { userId: user!.id, deviceId }, entry.id, entry.type, keepDraftSource(entry.type, values, child) as never, careTime);
    navigate(`/entries/${entry.id}`, { replace: true });
  };
  const common = { initialCareTime: entry.care_time, minCareTime: encounter?.admit_time, saveLabel: 'Confirm', sourceCheck: entry.raw_input_kind === 'photo', onCancel: () => navigate(`/entries/${entry.id}`) };
  const med = child as MedAdmin | undefined;
  const order = med?.order_id ? ord?.orders.find((o) => o.id === med.order_id) : undefined;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: `/patients/${patient.id}` }, { label: 'Check draft' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">Check and confirm</h1>
      <div className={PANES}>
        <Pane label="Paper photo" icon="description" title={entry.raw_input_kind === 'photo' ? 'Paper form' : 'Source'} sub={entry.raw_input_kind === 'photo' ? 'Compare every value with the paper.' : 'This draft was typed, not read from paper.'}
          aside={<Badge tone="amber" icon="fact_check">Draft</Badge>}>
          {entry.photo_check && (
            <Strip icon={entry.photo_check.readable ? 'check_circle' : 'warning'}>
              <strong className="text-primary">{entry.photo_check.readable ? 'Photo check when taken: no problem found' : `Photo check when taken: ${entry.photo_check.problem.replace('_', ' ')}`}</strong>
              {entry.photo_check.overridden ? 'The nurse chose to carry on.' : ''}
            </Strip>
          )}
          {entry.raw_input_kind === 'photo' ? <PhotoView refId={entry.raw_input_ref} /> : <p className="text-secondary">Typed entry.</p>}
          {entry.ai_proposal && (
            <div className="rounded-lg bg-surface-container-low p-space-sm font-body-sm">
              <p className="font-semibold text-primary flex items-center gap-1"><Icon name="memory" />Proposal stored with this draft</p>
              {aiMeta(entry)
                ? <p className="text-secondary">Made by {aiMeta(entry)!.source === 'on_device' ? 'the on-device model on this laptop (Firebase AI Logic, ONLY_ON_DEVICE)' : 'the cloud model (Firebase AI Logic, ONLY_IN_CLOUD)'} at {aiMeta(entry)!.at.slice(11, 16)}. It may be wrong: check every value against the paper.</p>
                : <p className="text-secondary">From the practice data set (simulated, not a model answer). Check every value against the paper.</p>}
            </div>
          )}
        </Pane>
        <Pane label="Type and check" icon="fact_check" title="Check the record" sub="Fix any value that does not match. Nothing is confirmed until you press Confirm."
          aside={<Badge tone="navy" icon="wifi_off">Works with no network</Badge>}>
          <Strip icon="lock"><strong className="text-primary">Kept on this laptop</strong> {entry.ai_proposal ? 'Values started from the stored proposal.' : 'Values were typed by the nurse.'}</Strip>
          {entry.type === 'vital_sign' && <VitalsEditor {...common} startAtReview proposal={entry.ai_proposal as Record<string, unknown> | null | undefined} initial={vitalsToForm(child as VitalSign | undefined)} onSubmit={({ values, careTime }) => done({ ...values, weight_kg: null, raw_text: null } as never, careTime)} />}
          {entry.type === 'intake_output' && ord && <IoEditor {...common} initial={ioToForm(child as IntakeOutput)} ivOrders={ord.ivOrders} onSubmit={({ values, careTime }) => done(values as never, careTime)} />}
          {entry.type === 'note' && <NoteEditor {...common} initial={noteToForm(child as Note)} onSubmit={({ values, careTime }) => done(values as never, careTime)} />}
          {entry.type === 'med_admin' && ord && (order
            ? <MedEditor {...common} order={order} initial={medFormFromOrder(order, (med!.event as MedEvent) ?? 'administered', med)} events={medEvents(order)} priorRate={med?.prior_infusion_rate ?? currentRate(order, ord.meds).rate}
                onSubmit={({ values, careTime }) => done(values as never, careTime)} />
            : <EmptyState icon="help" text="This draft has no matching order in the patient list, so it cannot be confirmed here." />)}
          {entry.type === 'lab_event' && <EmptyState icon="help" text="Lab drafts are confirmed from the lab page." />}
        </Pane>
      </div>
      <EndBar patientName={fullName(patient)}>
        <ButtonLink variant="secondary" to={`/entries/${entry.id}`}><Icon name="schedule" />Keep as a draft (stays in Alerts)</ButtonLink>
      </EndBar>
    </>
  );
}
