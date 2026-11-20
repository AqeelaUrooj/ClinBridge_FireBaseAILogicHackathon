import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../state/app';
import { Button, Dialog, EmptyState, ButtonLink } from '../../components/ui';
import { dayLabel } from '../../lib/time';
import { PatientBanner } from './PatientBanner';
import { fullName, usePatient, type PatientBundle } from './patientData';
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
        <dt className="text-secondary">MRN</dt><dd className="font-headline-sm text-headline-sm text-primary" style={{ fontFeatureSettings: "'zero' 1" }}>{p.mrn}</dd>
      </dl>
      <div className="flex gap-space-sm">
        <Button onClick={onConfirm} data-autofocus className="flex-1">Yes, open</Button>
        <Button variant="secondary" onClick={onCancel} className="flex-1">No, go back</Button>
      </div>
    </Dialog>
  );
}

/** Loads a patient, asks for the two-identifier check once, then shows the banner and the page. */
export function PatientFrame({ patientId, children }: { patientId: string | undefined; children: ReactNode }) {
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
      <PatientBanner data={data} />
      {children}
    </PatientCtx.Provider>
  );
}

export function PatientLayout() {
  const { id } = useParams();
  return <PatientFrame patientId={id}><Outlet /></PatientFrame>;
}
