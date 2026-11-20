import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { confirmDraft, createEntry, listPatientEntries } from '../../db/repos/entries';
import { savePhoto, type StoredPhoto } from '../../db/photos';
import { PhotoView } from './PhotoView';
import type { ActiveOrder, EntryType, IntakeOutput, MedAdmin, Note, PhotoCheck, VitalSign } from '../../db/schema';
import { isNurse, useApp, useSession } from '../../state/app';
import { assessQuality, readPixels, type Quality } from '../../lib/photoQuality';
import { currentRate, isMedOrder, medFormFromOrder, orderGroup, type MedEvent } from '../../lib/meds';
import { Breadcrumbs, Button, ButtonLink, Card, EmptyState, Icon } from '../../components/ui';
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
  const base = `/patients/${patient.id}`;
  if (!isNurse(user)) return <EmptyState icon="block" text="Only nurses can add records." />;
  const k = KINDS.find((x) => x.v === kind);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true); setError(null);
    try {
      const saved = await savePhoto(db, clock, { userId: user!.id, deviceId }, patient.id, f); // saved first, before anything else
      setPhoto(saved);
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
  const common = { minCareTime: encounter?.admit_time, saveLabel: asDraft ? 'Save as draft' : 'Save', onCancel: () => navigate(base) };
  const order = ord?.orders.find((o) => o.id === orderId);

  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Photo of paper' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary flex items-center gap-3"><MedIllustration name="workflows/paper-photo" size={36} />Photo of paper</h1>
      <p className="font-body-sm text-secondary -mt-space-sm">Works with no network and no AI. You type the values from the photo; the photo is kept as the source.</p>

      {!kind && (
        <Card>
          <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">1. What kind of paper form?</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
            {KINDS.map((x) => (
              <button key={x.v} onClick={() => setKind(x.v)} className="min-h-24 rounded-xl border border-card-border bg-surface-container-lowest hover:border-secondary flex flex-col items-center justify-center gap-2 p-space-md">
                <MedIllustration name={x.art} size={40} />
                <span className="font-headline-sm text-headline-sm text-primary">{x.label}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {kind && !photo && (
        <Card className="flex flex-col gap-space-md">
          <h2 className="font-headline-sm text-headline-sm text-primary">2. Take or choose a photo · {k!.label}</h2>
          <label className="self-start inline-flex items-center gap-2 min-h-12 px-space-lg rounded-lg bg-primary-container text-on-primary font-semibold cursor-pointer">
            <Icon name="photo_camera" />{busy ? 'Saving…' : 'Take or choose photo'}
            <input type="file" accept="image/*" capture="environment" className="sr-only" data-testid="photo-input" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          {error && <p role="alert" className="text-error">{error}</p>}
          <Button variant="ghost" className="self-start" onClick={() => setKind(null)}>Change form type</Button>
        </Card>
      )}

      {kind && photo && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-lg items-start">
          <Card className="flex flex-col gap-space-sm xl:sticky xl:top-[calc(var(--header-h)+16px)]">
            <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="check_circle" className="text-sync-green" filled />Photo saved on this laptop</h2>
            <PhotoView refId={photo.ref} />
            {quality && quality.hints.length > 0 && (
              <div role="status" className="rounded-lg border border-downtime-amber-border bg-downtime-amber-bg p-space-sm">
                <ul className="list-disc pl-5 font-body-md">{quality.hints.map((h) => <li key={h}>{h}</li>)}</ul>
                <p className="font-body-sm text-secondary mt-1">You can retake, or carry on if you can read it. Your choice is recorded.</p>
              </div>
            )}
            {quality && quality.hints.length === 0 && <p className="font-body-sm text-sync-green">Photo looks clear.</p>}
            <label className="self-start inline-flex items-center gap-2 min-h-11 px-space-md rounded-lg border border-card-border cursor-pointer font-body-md">
              <Icon name="photo_camera" />Retake (keeps this one too)
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
          </Card>
          <div className="flex flex-col gap-space-md">
            <h2 className="font-headline-sm text-headline-sm text-primary">3. Type what the paper says</h2>
            {kind === 'vital_sign' && !ai && <OnDeviceProposalCard photoRef={photo.ref} onUse={(proposal, raw) => setAi({ proposal, raw, at: clock.nowIso() })} />}
            {ai ? (
              <p role="status" className="rounded-lg border border-card-border bg-surface-container-low p-space-sm font-body-md"><Icon name="memory" /> The form below starts with the on-device AI proposal. Check every value against the photo. It will be saved as a <strong>draft</strong> and confirmed on the next screen.</p>
            ) : (
              <label className="flex items-center gap-2 min-h-11 font-body-md cursor-pointer">
                <input type="checkbox" className="w-5 h-5" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} />Save as a draft to check later (shows in Alerts)
              </label>
            )}
            {kind === 'vital_sign' && <VitalsEditor key={ai ? 'ai' : 'manual'} {...common} {...(ai ? { initial: proposalToForm(ai.proposal), saveLabel: 'Save as draft' } : {})} onSubmit={({ values, careTime }) => save('vital_sign', { ...values, weight_kg: null, raw_text: null } as never, careTime)} />}
            {kind === 'intake_output' && ord && <IoEditor {...common} initial={ioToForm()} ivOrders={ord.ivOrders} onSubmit={({ values, careTime }) => save('intake_output', values as never, careTime)} />}
            {kind === 'note' && <NoteEditor {...common} initial={noteToForm()} onSubmit={({ values, careTime }) => save('note', values as never, careTime)} />}
            {kind === 'med_admin' && ord && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="font-label-uppercase text-label-uppercase text-secondary uppercase">Which order is on the paper?</span>
                  <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="h-12 rounded-lg border border-card-border px-space-md bg-surface-container-lowest" aria-label="Medicine order">
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
          </div>
        </div>
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
    await confirmDraft(db, clock, { userId: user!.id, deviceId }, entry.id, entry.type, values, careTime);
    navigate(`/entries/${entry.id}`, { replace: true });
  };
  const common = { initialCareTime: entry.care_time, minCareTime: encounter?.admit_time, saveLabel: 'Confirm', onCancel: () => navigate(`/entries/${entry.id}`) };
  const med = child as MedAdmin | undefined;
  const order = med?.order_id ? ord?.orders.find((o) => o.id === med.order_id) : undefined;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: `/patients/${patient.id}` }, { label: 'Check draft' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">Check and confirm</h1>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-lg items-start">
        <Card className="flex flex-col gap-space-sm">
          <h2 className="font-headline-sm text-headline-sm text-primary">Source</h2>
          {entry.raw_input_kind === 'photo' ? <PhotoView refId={entry.raw_input_ref} /> : <p className="text-secondary">Typed entry.</p>}
          {entry.ai_proposal && (
            <div className="rounded-lg bg-surface-container-low p-space-sm font-body-sm">
              <p className="font-semibold text-primary flex items-center gap-1"><Icon name="memory" />Proposal stored with this draft</p>
              {aiMeta(entry)
                ? <p className="text-secondary">Made by {aiMeta(entry)!.source === 'on_device' ? 'the on-device model on this laptop (Firebase AI Logic, ONLY_ON_DEVICE)' : 'the cloud model (Firebase AI Logic, ONLY_IN_CLOUD)'} at {aiMeta(entry)!.at.slice(11, 16)}. It may be wrong: check every value against the paper.</p>
                : <p className="text-secondary">From the practice data set (simulated, not a model answer). Check every value against the paper.</p>}
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-space-md">
          {entry.type === 'vital_sign' && <VitalsEditor {...common} initial={vitalsToForm(child as VitalSign | undefined)} onSubmit={({ values, careTime }) => done({ ...values, weight_kg: null, raw_text: null } as never, careTime)} />}
          {entry.type === 'intake_output' && ord && <IoEditor {...common} initial={ioToForm(child as IntakeOutput)} ivOrders={ord.ivOrders} onSubmit={({ values, careTime }) => done(values as never, careTime)} />}
          {entry.type === 'note' && <NoteEditor {...common} initial={noteToForm(child as Note)} onSubmit={({ values, careTime }) => done(values as never, careTime)} />}
          {entry.type === 'med_admin' && ord && (order
            ? <MedEditor {...common} order={order} initial={medFormFromOrder(order, (med!.event as MedEvent) ?? 'administered', med)} events={medEvents(order)} priorRate={med?.prior_infusion_rate ?? currentRate(order, ord.meds).rate}
                onSubmit={({ values, careTime }) => done(values as never, careTime)} />
            : <EmptyState icon="help" text="This draft has no matching order in the patient list, so it cannot be confirmed here." />)}
          {entry.type === 'lab_event' && <EmptyState icon="help" text="Lab drafts are confirmed from the lab page." />}
        </div>
      </div>
    </>
  );
}
