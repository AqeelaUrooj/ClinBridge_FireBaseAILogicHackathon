import { useNavigate } from 'react-router-dom';
import { createEntry } from '../../db/repos/entries';
import { isNurse, useApp, useSession } from '../../state/app';
import { Breadcrumbs, EmptyState } from '../../components/ui';
import { useCurrentPatient } from '../patient/PatientLayout';
import { fullName } from '../patient/patientData';
import { NoteEditor, noteToForm } from './editors';

const NurseOnly = () => <EmptyState icon="block" text="Only nurses can add records." />;

export function RecordNote() {
  const { patient, encounter } = useCurrentPatient();
  const { db, clock, deviceId } = useApp();
  const { user } = useSession();
  const navigate = useNavigate();
  const base = `/patients/${patient.id}`;
  if (!isNurse(user)) return <NurseOnly />;
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: base }, { label: 'Notes', to: `${base}/notes` }, { label: 'New' }]} />
      <h1 className="font-headline-lg text-headline-lg text-primary">New note</h1>
      <NoteEditor initial={noteToForm()} minCareTime={encounter?.admit_time} saveLabel="Save"
        onCancel={() => navigate(`${base}/notes`)}
        onSubmit={async ({ values, careTime }) => {
          const e = await createEntry(db, clock, { userId: user!.id, deviceId }, { type: 'note', patientId: patient.id, careTime, values });
          navigate(`${base}/notes`, { state: { saved: e.id } });
        }} />
    </>
  );
}
