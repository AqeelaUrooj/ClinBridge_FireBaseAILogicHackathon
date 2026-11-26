import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../state/app';
import { Button, Dialog, EmptyState, ButtonLink } from '../../components/ui';
import { dayLabel } from '../../lib/time';
import { PatientBanner } from './PatientBanner';
import { PatientPrint } from './PatientPrint';
import { fullName, usePatient, type PatientBundle } from './patientData';
import { idLabel, isActiveStay, isProvisional } from '../../lib/admission';
import { createContext, useContext, type ReactNode } from 'react';

const PatientCtx = createContext<PatientBundle | null>(null);
export function useCurrentPatient(): PatientBundle {
  const v = useContext(PatientCtx);
  if (!v) throw new Error('useCurrentPatient outside a patient route');
  return v;
}

/** Two-identifier check: name + date of birth + MRN before any patient page opens (worst case B2). */
export function VerifyPatientDialog({ data, onConfirm, onCancel }: { data: PatientBundle; onConfirm: () => void; onCancel: () => void }) {
  const p = data.patient;
  return (
    <Dialog title="Is this the right patient?" onClose={onCancel}>
      <p className="font-body-md text-body-md text-on-surface-variant">Check the wristband before you continue.</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-space-lg gap-y-space-sm bg-surface-container-low rounded-lg p-space-md">
        <dt className="text-secondary">Name</dt><dd className="font-headline-sm text-headline-sm text-primary">{fullName(p)}</dd>
        <dt className="text-secondary">Born</dt><dd className="font-headline-sm text-headline-sm text-primary">{dayLabel(p.birth_date)}</dd>
        <dt className="text-secondary">{idLabel(p)}</dt><dd className="font-headline-sm text-headline-sm text-primary" style={{ fontFeatureSettings: "'zero' 1" }}>{p.mrn}</dd>
      </dl>
      {isProvisional(p) && <p role="note" className="rounded-lg bg-downtime-amber-bg border border-downtime-amber-border p-space-sm font-body-md text-body-md text-[#5c400c]">Provisional identity registered during downtime. The temporary ID is not a hospital MRN; admissions match it with the hospital record later.</p>}
      {!isActiveStay(data.encounter) && <p role="note" className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface-variant">This patient was discharged. The records open read only; new charting on this stay is closed.</p>}
      <div className="flex gap-space-sm">
        <Button onClick={onConfirm} data-autofocus className="flex-1">Yes, open</Button>
        <Button variant="secondary" onClick={onCancel} className="flex-1">No, go back</Button>
      </div>
    </Dialog>
  );
}

/**
 * Loads a patient, asks for the two-identifier check once, then shows the banner and the page.
 * On paper the banner is replaced by a header on every page. `ownPrintHeader`: the page brings its own (paper forms).
 */
export function PatientFrame({ patientId, ownPrintHeader = false, children }: { patientId: string | undefined; ownPrintHeader?: boolean; children: ReactNode }) {
  const data = usePatient(patientId);
  const { verifiedPatientId, verifyPatient } = useSession();
  const navigate = useNavigate();

  if (data === undefined) return <p className="text-secondary" role="status">Loading patient…</p>;
  if (data === null) return <EmptyState icon="person_off" text="This patient is not in the patient list." action={<ButtonLink to="/ward" variant="secondary">Back to My patients</ButtonLink>} />;
  if (verifiedPatientId !== data.patient.id) {
    return <VerifyPatientDialog data={data} onConfirm={() => verifyPatient(data.patient.id)} onCancel={() => navigate('/ward')} />;
  }
  return (
    <PatientCtx.Provider value={data}>
      <div className="print:hidden"><PatientBanner data={data} /></div>
      {!isActiveStay(data.encounter) && <p role="note" className="print:hidden rounded-xl bg-surface-container-low border border-card-border p-space-sm px-space-md font-body-md text-body-md text-on-surface-variant flex items-center gap-2"><span className="material-symbols-outlined" aria-hidden>logout</span>Discharged {data.encounter?.discharge_time?.slice(11, 16)} · {data.encounter?.discharge_destination ?? ''}. Records are read only; new records for this stay are refused.</p>}
      {ownPrintHeader ? children : <PatientPrint data={data}>{children}</PatientPrint>}
    </PatientCtx.Provider>
  );
}

export function PatientLayout() {
  const { id } = useParams();
  return <PatientFrame patientId={id}><Outlet /></PatientFrame>;
}
