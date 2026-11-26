import { useState } from 'react';
import { isActiveStay, staysByPatient } from '../../lib/admission';
import { afterPracticeReset } from '../../db/repos/admission';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

const ADD_FORMS: [string, string, string][] = [
  ['vitals/record', 'vital_signs', 'Vitals'], ['notes/new', 'edit_note', 'Note'], ['capture', 'photo_camera', 'Photo of paper'],
  ['meds', 'medication', 'Medicine'], ['io/record', 'water_drop', 'Fluids'], ['labs/record', 'science', 'Lab'], ['handoff/new', 'swap_horiz', 'Handover'],
];

export function AddPage() {
  const { db } = useApp();
  const rows = useLiveQuery(async () => {
    const stays = staysByPatient(await db.encounter.toArray()); // patients with an active stay only: no form for a discharged patient
    return (await db.patient.toArray()).filter((p) => isActiveStay(stays.get(p.id))).map((p) => ({ p, bed: stays.get(p.id)?.bed ?? '' })).sort((a, b) => a.bed.localeCompare(b.bed));
  }, [db]);
  return (
    <>
      <PageTitle>Add Note / Form</PageTitle>
      <p className="font-body-lg text-on-surface-variant">Every record belongs to one checked patient: the patient check (name, born, MRN) runs before the form opens.</p>
      {!rows ? <p role="status">Loading…</p> : rows.length === 0 ? <EmptyState text="No patients in the patient list" /> : (
        <Card>
          <ul className="flex flex-col">
            {rows.map(({ p, bed }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-space-sm py-space-sm border-b border-card-border last:border-0">
                <span className="w-56 min-w-0 truncate"><span className="font-code-tabular font-bold">Bed {bed || '—'}</span> · {p.given_name} {p.family_name}</span>
                <span className="flex flex-wrap gap-1" aria-label={`Forms for ${p.given_name} ${p.family_name}`}>
                  {ADD_FORMS.map(([sub, icon, label]) => (
                    <Link key={sub} to={`/patients/${p.id}/${sub}`} className="inline-flex items-center gap-1 min-h-9 px-2.5 rounded border border-card-border font-body-md hover:bg-surface-container-low">
                      <Icon name={icon} className="text-[18px] text-secondary" />{label}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

export function AlertsPage() {
  const { db } = useApp();
  const drafts = useLiveQuery(() => db.entry.where('status').equals('draft').toArray(), [db]);
  // Critical lab results on current records (confirmed or draft), and active orders per patient.
  const ward = useLiveQuery(async () => {
    const stays = staysByPatient(await db.encounter.toArray());
    const patients = (await db.patient.toArray()).filter((p) => isActiveStay(stays.get(p.id))); // the ward now, not discharged stays
    const encs = [...stays.values()];
    const labEntries = (await db.entry.where('status').anyOf('confirmed', 'draft').toArray()).filter((e) => e.type === 'lab_event');
    const labs = await db.lab_event.where('entry_id').anyOf(labEntries.map((e) => e.id)).toArray();
    const critical = labs.filter((l) => l.status === 'critical').map((l) => {
      const e = labEntries.find((x) => x.id === l.entry_id)!;
      return { l, e, p: patients.find((p) => p.id === e.patient_id), bed: encs.find((x) => x.patient_id === e.patient_id)?.bed };
    }).filter((x) => !!x.p).sort((a, b) => b.e.care_time.localeCompare(a.e.care_time));
    const orders = await db.active_order.toArray();
    const perPatient = patients.map((p) => {
      const enc = encs.find((x) => x.patient_id === p.id);
      const own = enc ? orders.filter((o) => o.encounter_id === enc.id) : [];
      return { p, bed: enc?.bed, total: own.length, meds: own.filter((o) => o.type === 'med' || o.type === 'iv').length };
    }).sort((a, b) => (a.bed ?? '').localeCompare(b.bed ?? ''));
    return { critical, perPatient };
  }, [db]);
  return (
    <>
      <PageTitle>Alerts & Orders</PageTitle>
      <Card>
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm flex items-center gap-2"><Icon name="emergency" className="text-clinical-red" />Critical lab results</h2>
        {!ward ? <p role="status">Loading…</p> : ward.critical.length === 0 ? <EmptyState text="No critical lab results recorded" /> : (
          <ul className="flex flex-col gap-space-sm">
            {ward.critical.map(({ l, e, p, bed }) => (
              <li key={l.id}>
                <ButtonLink variant="secondary" className="w-full !justify-between" to={`/entries/${e.id}`}>
                  <span>{e.care_time.slice(11, 16)} · Bed {bed ?? '—'} · {p ? `${p.given_name} ${p.family_name}` : e.patient_id} · {l.test_name}{l.value_num != null ? ` ${l.value_num} ${l.unit ?? ''}` : ''}</span>
                  <span className={l.read_back ? 'text-sync-green' : 'text-clinical-red font-semibold'}>{l.read_back ? 'Read back' : 'Read-back not recorded'}</span>
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-headline-sm text-headline-sm text-primary mb-space-sm flex items-center gap-2"><Icon name="list_alt" />Orders from the patient list (read only)</h2>
        <p className="font-body-sm text-secondary mb-space-sm">New electronic orders can't be made during downtime; these are the orders copied from the hospital system. Opening one runs the patient check.</p>
        {!ward ? <p role="status">Loading…</p> : (
          <ul className="flex flex-col">
            {ward.perPatient.map(({ p, bed, total, meds }) => (
              <li key={p.id}>
                <Link to={`/patients/${p.id}/orders`} className="flex items-center justify-between min-h-[48px] px-space-sm border-b border-card-border last:border-0 hover:bg-surface-container-low rounded">
                  <span><span className="font-code-tabular font-bold">Bed {bed ?? '—'}</span> · {p.given_name} {p.family_name}</span>
                  <span className="text-secondary font-body-md">{total} order{total === 1 ? '' : 's'} ({meds} medicine)<Icon name="chevron_right" className="align-middle text-outline" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
  const { db, dataset, vault, lockRecords, clock, deviceId } = useApp();
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
          <ButtonLink variant="secondary" to="/spooler"><Icon name="print" />Paper form packets</ButtonLink>
          <ButtonLink variant="secondary" to="/ai"><Icon name="memory" />AI check</ButtonLink>
          {dataset === 'practice' && <ButtonLink variant="secondary" to="/drill/compare"><Icon name="compare" />Device vs Cloud</ButtonLink>}
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
          <p>All practice records you added will be removed and the fake patients restored. Patients registered on this laptop (admissions and provisional), their stays, transfers, discharges and records are removed too. Real records are never touched.</p>
          <div className="flex gap-space-sm">
            <Button variant="danger" className="flex-1" onClick={async () => { await resetPractice(db); await afterPracticeReset(db, clock, deviceId); await clearPhotos('practice'); signOut(); navigate('/sign-in'); }}>Reset</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmReset(false)}>Cancel</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
