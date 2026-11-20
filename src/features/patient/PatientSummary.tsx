import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { listPatientEntries } from '../../db/repos/entries';
import type { VitalSign } from '../../db/schema';
import { useApp, isNurse, useSession } from '../../state/app';
import { hm } from '../../lib/time';
import { Card, EmptyState, Icon, SectionLabel, ButtonLink } from '../../components/ui';
import { EntryRow, isRetired } from '../entries/entryView';
import { useCurrentPatient } from './PatientLayout';

function ActionCard({ to, icon, kicker, title, children, disabledReason }: { to: string; icon: string; kicker: string; title: string; children?: React.ReactNode; disabledReason?: string }) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-lg bg-secondary-fixed text-on-secondary-fixed grid place-items-center"><Icon name={icon} className="text-[22px]" /></div>
        <div>
          <SectionLabel>{kicker}</SectionLabel>
          <span className="block font-headline-sm text-headline-sm text-primary">{title}</span>
        </div>
      </div>
      {children}
      {disabledReason && <span className="font-body-sm text-body-sm text-secondary">{disabledReason}</span>}
    </>
  );
  const cls = 'bg-surface-container-lowest rounded-xl border border-card-border p-space-md flex flex-col gap-space-sm min-h-[124px]';
  return disabledReason ? <div className={`${cls} opacity-50`} aria-disabled="true">{body}</div> : <Link to={to} className={`${cls} hover:border-secondary`}>{body}</Link>;
}

export function PatientSummary() {
  const { patient } = useCurrentPatient();
  const { db } = useApp();
  const { user } = useSession();
  const entries = useLiveQuery(() => listPatientEntries(db, patient.id), [db, patient.id]);
  const recent = (entries ?? []).filter((x) => !isRetired(x.entry)).slice(0, 3);
  const lastVitals = (entries ?? []).find((x) => x.entry.type === 'vital_sign' && x.entry.status === 'confirmed');
  const v = lastVitals?.child as VitalSign | undefined;
  const base = `/patients/${patient.id}`;
  const nurseOnly = isNurse(user) ? undefined : 'Nurses only';

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-space-md">
        <ActionCard to={`${base}/meds`} icon="vaccines" kicker="Medicine" title="Give medicine" disabledReason={nurseOnly} />
        <ActionCard to={`${base}/vitals`} icon="vital_signs" kicker="Observation" title="Vitals" disabledReason={nurseOnly}>
          {v ? (
            <span className="font-code-tabular text-code-tabular text-on-surface-variant">
              {v.bp_systolic != null && `BP ${v.bp_systolic}/${v.bp_diastolic} · `}{v.heart_rate != null && `Pulse ${v.heart_rate} · `}{hm(lastVitals!.entry.care_time)}
            </span>
          ) : <span className="font-body-sm text-body-sm text-secondary">No vitals yet</span>}
        </ActionCard>
        <ActionCard to={`${base}/io`} icon="water_drop" kicker="Intake/Output" title="Fluids" disabledReason={nurseOnly} />
        <ActionCard to={`${base}/notes`} icon="description" kicker="Nursing" title="Note" disabledReason={nurseOnly} />
        <ActionCard to={`${base}/capture`} icon="photo_camera" kicker="Paper form" title="Photo of paper" disabledReason={nurseOnly} />
      </div>
      <Card>
        <div className="flex items-center justify-between mb-space-sm">
          <h2 className="font-headline-md text-headline-md text-primary">Latest</h2>
          <ButtonLink to={`${base}/timeline`} variant="secondary">View details<Icon name="chevron_right" /></ButtonLink>
        </div>
        {entries === undefined ? <p role="status" className="text-secondary">Loading…</p> : recent.length ? recent.map((x) => <EntryRow key={x.entry.id} item={x} />) : <EmptyState text="Nothing recorded yet" />}
      </Card>
    </>
  );
}
