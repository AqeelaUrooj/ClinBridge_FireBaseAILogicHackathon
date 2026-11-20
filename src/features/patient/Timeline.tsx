import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listPatientEntries } from '../../db/repos/entries';
import { useApp } from '../../state/app';
import { Breadcrumbs, Button, ButtonLink, Card, EmptyState, Icon } from '../../components/ui';
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
        <div className="flex items-center justify-between mb-space-sm">
          <h2 className="font-headline-md text-headline-md text-primary">History</h2>
          <div className="flex gap-space-sm">
            <ButtonLink variant="secondary" to={`/patients/${patient.id}/body`}><Icon name="accessibility_new" />Body map</ButtonLink>
            <ButtonLink variant="secondary" to={`/patients/${patient.id}/orders`}><Icon name="list_alt" />Orders</ButtonLink>
          </div>
        </div>
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
