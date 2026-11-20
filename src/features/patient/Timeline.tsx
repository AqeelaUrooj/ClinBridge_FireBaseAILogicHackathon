import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listPatientEntries } from '../../db/repos/entries';
import { useApp } from '../../state/app';
import { Breadcrumbs, Button, Card, EmptyState } from '../../components/ui';
import { EntryRow } from '../entries/entryView';
import { useCurrentPatient } from './PatientLayout';
import { fullName } from './patientData';

const PAGE = 10;

export function Timeline() {
  const { patient } = useCurrentPatient();
  const { db } = useApp();
  const entries = useLiveQuery(() => listPatientEntries(db, patient.id), [db, patient.id]);
  const [n, setN] = useState(PAGE);
  return (
    <>
      <Breadcrumbs items={[{ label: 'My patients', to: '/ward' }, { label: fullName(patient), to: `/patients/${patient.id}` }, { label: 'History' }]} />
      <Card>
        <h2 className="font-headline-md text-headline-md text-primary mb-space-sm">History</h2>
        {entries === undefined ? <p role="status">Loading…</p> : entries.length === 0 ? <EmptyState text="Nothing recorded yet" /> : (
          <>
            {entries.slice(0, n).map((x) => <EntryRow key={x.entry.id} item={x} />)}
            {entries.length > n && <Button variant="secondary" className="mt-space-md" onClick={() => setN(n + PAGE)}>Show more ({entries.length - n})</Button>}
          </>
        )}
      </Card>
    </>
  );
}
