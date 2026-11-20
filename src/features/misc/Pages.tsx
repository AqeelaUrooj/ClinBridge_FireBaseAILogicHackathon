import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useSession } from '../../state/app';
import { resetPractice } from '../../db/seed';
import { verifyChain } from '../../db/audit';
import { Button, ButtonLink, Card, Dialog, EmptyState, Icon, PageTitle } from '../../components/ui';

/** Honest placeholder for a route that exists in ROUTES.md but is not built yet. No fake buttons. */
export function NotBuilt({ title, phase }: { title: string; phase: string }) {
  const { pathname } = useLocation();
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <EmptyState icon="construction" text={`This page is being built (${phase}). Nothing here saves data yet.`}
        action={<span className="font-code-tabular text-body-sm text-secondary">{pathname}</span>} />
    </>
  );
}

export function AddPage() {
  return (
    <>
      <PageTitle>Add</PageTitle>
      <Card>
        <p className="font-body-lg text-on-surface-variant mb-space-md">Pick a patient first. Every record belongs to one checked patient.</p>
        <ButtonLink to="/ward"><Icon name="groups" />Go to My patients</ButtonLink>
      </Card>
    </>
  );
}

export function AlertsPage() {
  const { db } = useApp();
  const drafts = useLiveQuery(() => db.entry.where('status').equals('draft').toArray(), [db]);
  return (
    <>
      <PageTitle>Alerts</PageTitle>
      <Card>
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm">Records to check</h2>
        {drafts === undefined ? <p role="status">Loading…</p> : drafts.length === 0 ? <EmptyState text="Nothing to check" /> : (
          <ul className="flex flex-col gap-space-sm">
            {drafts.map((d) => (
              <li key={d.id}><ButtonLink variant="secondary" to={`/entries/${d.id}`}>Draft {d.type.replace('_', ' ')} · {d.care_time.slice(11, 16)}<Icon name="chevron_right" /></ButtonLink></li>
            ))}
          </ul>
        )}
        <p className="mt-space-md font-body-sm text-secondary">Checking drafts opens in a later phase. You can see each draft now.</p>
      </Card>
    </>
  );
}

export function MorePage() {
  const { db, dataset } = useApp();
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const audit = useLiveQuery(async () => verifyChain(await db.audit_log.orderBy('seq').toArray()), [db]);
  return (
    <>
      <PageTitle>More</PageTitle>
      <Card className="flex flex-col gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm text-primary">Signed in as {user?.name}</h2>
        <div className="flex flex-wrap gap-space-sm">
          <Button variant="secondary" onClick={() => { signOut(); navigate('/sign-in'); }}><Icon name="switch_account" />Switch user</Button>
        </div>
      </Card>
      <Card className="flex flex-col gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm text-primary">Change log check</h2>
        {audit ? (
          <p className={audit.ok ? 'text-sync-green' : 'text-error'}>
            <Icon name={audit.ok ? 'verified' : 'gpp_bad'} /> {audit.verified} of {audit.total} log rows verified{audit.ok ? '' : ` · broken at row ${audit.brokenAtSeq}`}
          </p>
        ) : <p role="status">Checking…</p>}
      </Card>
      {dataset === 'practice' && (
        <Card className="flex flex-col gap-space-sm">
          <h2 className="font-headline-sm text-headline-sm text-primary">Practice</h2>
          <p className="text-on-surface-variant">Put the fake patients back to the start. Real records are never touched.</p>
          <Button variant="danger" className="self-start" onClick={() => setConfirmReset(true)}><Icon name="restart_alt" />Reset practice</Button>
        </Card>
      )}
      {confirmReset && (
        <Dialog title="Reset practice data?" onClose={() => setConfirmReset(false)}>
          <p>All practice records you added will be removed and the fake patients restored.</p>
          <div className="flex gap-space-sm">
            <Button variant="danger" className="flex-1" onClick={async () => { await resetPractice(db); signOut(); navigate('/sign-in'); }}>Reset</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmReset(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
