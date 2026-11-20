import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useSession } from '../../state/app';
import { resetPractice } from '../../db/seed';
import { clearPhotos } from '../../db/photos';
import { verifyChain } from '../../db/audit';
import { backupDb } from '../../db/backup';
import { MedIllustration } from '../../components/MedIllustration';
import { ACTIVE_CLINICAL_POLICY as POLICY } from '../../config/clinicalPolicy';
import { CLINICAL_WARNINGS } from '../../config/clinicalWarnings';
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
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm flex items-center gap-2"><MedIllustration name={drafts && drafts.length ? 'workflows/bell-alert' : 'workflows/bell-ok'} size={30} />Records to check</h2>
        {drafts === undefined ? <p role="status">Loading…</p> : drafts.length === 0 ? <EmptyState text="Nothing to check" /> : (
          <ul className="flex flex-col gap-space-sm">
            {drafts.map((d) => (
              <li key={d.id}><ButtonLink variant="secondary" to={`/capture/${d.id}/confirm`}>Draft {d.type.replace('_', ' ')} · {d.care_time.slice(11, 16)}<Icon name="chevron_right" /></ButtonLink></li>
            ))}
          </ul>
        )}

      </Card>
    </>
  );
}

export function MorePage() {
  const { db, dataset, vault, lockRecords } = useApp();
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const audit = useLiveQuery(async () => verifyChain(await db.audit_log.orderBy('seq').toArray()), [db]);
  const backups = useLiveQuery(async () => {
    const b = backupDb();
    try { return (await b.backups.where('db_name').equals(db.name).toArray()).map(({ id, from_version, to_version, taken_at, kind, tables }) => ({ id, from_version, to_version, taken_at, kind, encrypted: Object.entries(tables).every(([t, rows]) => t === 'key_store' || (rows as { _enc?: unknown }[]).every((r) => r._enc !== undefined)) })); }
    finally { b.close(); }
  }, [db]);
  return (
    <>
      <PageTitle>More</PageTitle>
      <Card className="flex flex-col gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm text-primary">Signed in as {user?.name}</h2>
        <div className="flex flex-wrap gap-space-sm">
          <Button variant="secondary" onClick={() => { signOut(); navigate('/sign-in'); }}><Icon name="switch_account" />Switch user</Button>
          <ButtonLink variant="secondary" to="/labs"><Icon name="science" />Ward labs</ButtonLink>
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
      <Card className="flex flex-col gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm text-primary">Clinical settings</h2>
        <p className={POLICY.status === 'institution-approved' ? 'text-sync-green' : 'text-[#7a5410]'}>
          <Icon name={POLICY.status === 'institution-approved' ? 'verified' : 'science'} /> {POLICY.status === 'institution-approved' ? `Approved by ${POLICY.approvedBy} on ${POLICY.approvedOn}` : 'Prototype settings for fake patients. Not approved hospital policy.'}
        </p>
        <ul className="list-disc pl-6 font-body-md text-on-surface-variant">
          <li>High-alert list: {POLICY.highAlert.entries.map((e) => e.label).join(', ')}{POLICY.highAlert.listIsComplete ? '' : ' (partial list, not validated)'}</li>
          <li>Second checker: {POLICY.secondChecker.roles.join(', ')}{POLICY.secondChecker.approved ? '' : ' (needs approval)'}</li>
          <li>Medicine timing: {POLICY.medicationTiming.windows.length ? `${POLICY.medicationTiming.windows.length} windows` : 'no Overdue rule; doses show Due'}</li>
          <li>Vital-sign warning ranges: {CLINICAL_WARNINGS.review.approved ? 'approved' : 'drafts, not approved'}</li>
        </ul>
      </Card>
      <Card className="flex flex-col gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm text-primary">Records encryption</h2>
        {vault === 'unlocked' ? (
          <>
            <p className="text-on-surface-variant"><Icon name="lock" className="text-sync-green" /> Records on this laptop are encrypted{dataset === 'practice' ? ' with the public practice passphrase (no secrecy, fake data only)' : ''}. Locking needs the unit passphrase to open them again; everyone is signed out.</p>
            <Button variant="secondary" className="self-start" onClick={lockRecords}><Icon name="lock" />Lock records now</Button>
          </>
        ) : (
          <p className="text-clinical-red font-semibold"><Icon name="lock_open" /> Records on this laptop are not encrypted. Encrypting existing Real records needs approval (P-04). Keep full-disk encryption on.</p>
        )}
      </Card>
      {backups && backups.length > 0 && (
        <Card className="flex flex-col gap-space-sm">
          <h2 className="font-headline-sm text-headline-sm text-primary">Safety copies on this laptop</h2>
          <p className="text-on-surface-variant font-body-sm">Made before app updates and before encryption, so nothing is lost if a step fails. They stay on this laptop; removing them needs approval (P-04 cleanup). For a copy to keep elsewhere, an admin makes an encrypted backup file.</p>
          <ul className="flex flex-col gap-1">
            {backups.map((b) => (
              <li key={b.id} className="flex items-center gap-space-md">
                <span className="flex-1 font-body-md">{b.kind === 'pre-encryption' ? 'Before encryption' : `Version ${b.from_version} → ${b.to_version}`} · {b.taken_at.slice(0, 16).replace('T', ' ')}</span>
                {b.encrypted ? <span className="text-sync-green font-body-sm">encrypted</span> : <span className="text-clinical-red font-body-sm font-semibold">not encrypted</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
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
            <Button variant="danger" className="flex-1" onClick={async () => { await resetPractice(db); await clearPhotos('practice'); signOut(); navigate('/sign-in'); }}>Reset</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmReset(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
