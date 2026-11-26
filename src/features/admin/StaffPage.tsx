import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AUTO_LOCK_MS, useApp, useSession } from '../../state/app';
import { addStaff, resetStaffPin, setStaffActive } from '../../db/repos/admin';
import { isPendingActivation } from '../../db/enrollment';
import type { Practitioner, Role } from '../../db/schema';
import { ACTIVE_CLINICAL_POLICY as POLICY } from '../../config/clinicalPolicy';
import { SECURITY_POLICY } from '../../config/securityPolicy';
import { PHASE_LABEL } from '../../lib/phase';
import { roleLabel } from '../../lib/admission';
import { auditLabel } from '../../lib/auditLabels';
import { dateTimeLabel, hm, dayLabel } from '../../lib/time';
import { Badge, Button, ButtonLink, EmptyState, Icon } from '../../components/ui';
import { fieldCls, labelCls } from '../charting/TwoStepEditor';
import { ActivateStaffForm } from './EnrollmentUi';
import { Block, Err, Facts, Head, PANEL, PaperHead, Tile, msg } from './adminUi';

const GRID = 'xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1.5fr)_8rem_8.5rem_15rem]';
const roleName = (r: Role) => roleLabel(r);
const mayDo = (r: Role) => (r === 'admission' ? 'Registers patients, assigns beds, records transfers and discharges (Practice). Cannot chart.' : r === 'admin' ? 'Manages this laptop. Cannot chart.' : `Charts for patients.${POLICY.secondChecker.roles.includes(r) ? ' Can be the second nurse (prototype rule).' : ' Cannot be the second nurse (prototype rule).'}`);
const STAFF_ROW = /^(staff_|credential_|first_time_setup)/;

/** Staff (Stitch "Staff roster, offline credentials"). No badge numbers, temporary PINs or recovery PINs: an admin sets a new PIN in person. */
export function StaffPage() {
  const { db, clock, deviceId, dataset, phase, snapshot } = useApp();
  const { user } = useSession();
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ name: '', initials: '', role: 'RN' as Role, pin: '' });
  const [pinFor, setPinFor] = useState<{ id: string; pin: string } | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const data = useLiveQuery(async () => {
    const [staff, entries, log] = await Promise.all([db.practitioner.toArray(), db.entry.toArray(), db.audit_log.toArray()]);
    return { staff, entries, changes: log.filter((r) => STAFF_ROW.test(r.action)) };
  }, [db]);
  const actor = { userId: user!.id, deviceId };
  const run = async (f: () => Promise<unknown>, after?: () => void, done?: string) => { setError(null); setNote(null); try { await f(); after?.(); if (done) setNote(done); } catch (e) { setError(msg(e)); } };
  if (!data) return <p role="status">Loading…</p>;
  const { staff, entries, changes } = data;
  const now = clock.nowIso();
  const on = staff.filter((p) => p.active);
  const ready = on.filter((p) => !isPendingActivation(p));
  const waiting = on.length - ready.length;
  const needle = q.trim().toLowerCase();
  const shown = staff.filter((p) => !needle || [p.name, p.initials, roleName(p.role)].some((t) => t.toLowerCase().includes(needle)));
  const last = changes[changes.length - 1];
  const work = (p: Practitioner) => {
    const mine = entries.filter((e) => (e.enterer_id ?? e.performer_id) === p.id);
    return { n: mine.length, last: mine.reduce<string | null>((m, e) => (!m || e.entry_time > m ? e.entry_time : m), null) };
  };
  return (
    <div className="flex flex-col gap-space-md">
      <PaperHead title="Staff on this laptop" by={user?.name} at={dateTimeLabel(now)} practice={dataset === 'practice'} />
      <Head label="Staff" title="Staff and PINs"
        badges={<>{snapshot && <Badge icon="domain">{snapshot.unit}</Badge>}<Badge tone={phase === 'down' ? 'amber' : 'neutral'}>{PHASE_LABEL[phase]}</Badge></>}
        text="People who can sign in on this laptop. PINs are stored only as a salted hash; nobody can read one."
        actions={<><Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print staff list</Button><ButtonLink variant="secondary" to="/admin/audit"><Icon name="receipt_long" />Staff changes in the log</ButtonLink><Button onClick={() => { nameBox.current?.scrollIntoView({ block: 'center' }); nameBox.current?.focus(); }}><Icon name="person_add" />New person</Button></>}>
        {note && <p role="status" className="text-sync-green">{note}</p>}
        <Err e={error} />
      </Head>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md print:hidden">
        <Tile label="Can sign in" icon="person_check" value={ready.length} unit="people" foot={`${ready.filter((p) => p.role === 'RN' || p.role === 'LPN').length} nurses, ${ready.filter((p) => p.role === 'admin').length} admin, ${ready.filter((p) => p.role === 'admission').length} admission`} />
        <Tile label="PINs on this laptop" icon="lock_clock" value={staff.filter((p) => !isPendingActivation(p)).length} unit="set" foot="Salted hash only (PBKDF2)" />
        <Tile label="Waiting" icon="how_to_reg" value={waiting} unit="to activate" foot={`${staff.length - on.length} switched off`} tone={waiting ? 'amber' : undefined} />
        <Tile label="Staff changes" icon="receipt_long" value={changes.length} unit="in the log" foot={last ? `Newest: ${auditLabel(last.action)}, ${dateTimeLabel(last.time)}` : 'None since this list was made'} />
      </div>

      <section aria-label="Staff list" className={`${PANEL} flex flex-col gap-space-sm print:border-0 print:p-0 print:shadow-none`}>
        <div className="flex flex-wrap items-center justify-between gap-space-sm">
          <div className="min-w-0"><h3 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="groups" />Staff on this laptop</h3><p className="font-body-sm text-body-sm text-on-surface-variant">Only this laptop. A change here does not reach another laptop. Who is on duty and bed assignments are not recorded.</p></div>
          <div className="w-full sm:w-[16rem] print:hidden"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search staff" placeholder="Search staff" className={fieldCls()} /></div>
        </div>
        <div aria-hidden className={`hidden xl:grid print:grid ${GRID} print:grid-cols-[1.4fr_1.6fr_1fr_1fr] gap-space-sm px-space-sm py-2 rounded-lg bg-surface-container-low font-label-uppercase text-label-uppercase text-secondary uppercase`}><span>Person</span><span>What they may do</span><span>Records saved</span><span>PIN</span><span className="print:hidden">Change</span></div>
        {shown.length === 0 ? <EmptyState text="Nobody here" /> : (
          <ul aria-label="Staff">
            {shown.map((p) => {
              const w = work(p), pending = isPendingActivation(p);
              return (
                <li key={p.id} className="break-inside-avoid border-b border-card-border last:border-0">
                  <div className={`grid grid-cols-1 sm:grid-cols-2 ${GRID} print:grid-cols-[1.4fr_1.6fr_1fr_1fr] gap-space-sm items-center px-space-sm py-space-sm font-body-md text-body-md`}>
                    <span className="flex items-center gap-space-sm min-w-0"><span aria-hidden className={`w-10 h-10 rounded-lg grid place-items-center font-bold shrink-0 ${p.role === 'admin' ? 'bg-primary-container text-on-primary' : 'bg-secondary-fixed text-on-secondary-fixed'}`}>{p.initials}</span><span className="min-w-0"><span className="block font-semibold text-primary [overflow-wrap:anywhere]">{p.name}</span><span className="block text-body-sm text-secondary">{roleName(p.role)}{p.id === user?.id ? ' · you' : ''}</span></span></span>
                    <span className="min-w-0 text-body-sm text-on-surface-variant">{mayDo(p.role)}</span>
                    <span className="text-body-sm"><strong className="font-code-tabular text-primary">{w.n}</strong> <span className="xl:hidden print:hidden text-secondary">records saved</span>{w.last && <span className="block text-secondary">newest {hm(w.last)}, {dayLabel(w.last).replace(/ \d{4}$/, '')}</span>}</span>
                    <span className="flex flex-col items-start gap-1">{!p.active ? <Badge>Switched off</Badge> : pending ? <Badge tone="amber">Needs activation</Badge> : <Badge tone="green">Active</Badge>}<span className="text-body-sm text-secondary">{pending ? 'No PIN yet' : 'PIN set'}</span></span>
                    <span className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-1 xl:justify-end print:hidden">
                      {pending
                        ? <Button variant="secondary" disabled={!p.active} onClick={() => setActivating(p.id)}>Activate</Button>
                        : <Button variant="secondary" aria-label={`New PIN for ${p.name}`} onClick={() => setPinFor({ id: p.id, pin: '' })}>New PIN</Button>}
                      <Button variant="secondary" className={p.active ? '!text-error' : ''} aria-label={`${p.active ? 'Switch off' : 'Switch on'} ${p.name}`} onClick={() => run(() => setStaffActive(db, clock, actor, p.id, !p.active), undefined, `${p.name} switched ${p.active ? 'off' : 'on'}.`)}>{p.active ? 'Switch off' : 'Switch on'}</Button>
                    </span>
                  </div>
                  {activating === p.id && <div className="px-space-sm pb-space-sm print:hidden"><ActivateStaffForm person={p} onDone={() => setActivating(null)} /></div>}
                  {pinFor?.id === p.id && (
                    <div role="group" aria-label={`New PIN, ${p.name}`} className="flex flex-wrap items-end gap-space-sm mx-space-sm mb-space-sm rounded-lg bg-surface-container-low p-space-sm print:hidden">
                      <label className="flex flex-col gap-1"><span className={labelCls}>New 4-digit PIN for {p.name}</span>
                        <input type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={pinFor.pin} onChange={(e) => setPinFor({ ...pinFor, pin: e.target.value })} className={`${fieldCls()} max-w-40`} aria-label="New PIN" /></label>
                      <Button onClick={() => run(() => resetStaffPin(db, clock, actor, pinFor.id, pinFor.pin), () => setPinFor(null), `New PIN saved for ${p.name}.`)}>Save PIN</Button>
                      <Button variant="ghost" onClick={() => setPinFor(null)}>Cancel</Button>
                      <p className="basis-full font-body-sm text-body-sm text-on-surface-variant">Check who the person is, then let them type their own PIN.</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-md items-stretch print:hidden">
        <Block title="Add a person" icon="person_add">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-space-md">
            <label className="flex flex-col gap-1"><span className={labelCls}>Name</span><input ref={nameBox} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldCls()} aria-label="Name" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Initials</span><input value={form.initials} maxLength={3} onChange={(e) => setForm({ ...form, initials: e.target.value })} className={fieldCls()} aria-label="Initials" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Role</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={fieldCls()} aria-label="Role"><option value="RN">RN</option><option value="LPN">LPN</option><option value="admin">Admin</option><option value="admission">Admission staff</option></select></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>4-digit PIN</span><input type="password" inputMode="numeric" maxLength={4} autoComplete="new-password" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className={fieldCls()} aria-label="PIN" /></label>
          </div>
          <Button className="self-start" onClick={() => run(() => addStaff(db, clock, actor, form), () => setForm({ name: '', initials: '', role: 'RN', pin: '' }), 'Person added to the list.')}><Icon name="person_add" />Add</Button>
          <p className="font-body-sm text-body-sm text-secondary mt-auto">What each role may do follows the UI/UX role table. Who may be a second nurse is a prototype setting (see Settings).</p>
        </Block>
        <Block title="Forgotten PIN and lock rules" icon="lock_reset" text="An admin checks who the person is and sets a new PIN with them. There is no temporary PIN, recovery PIN or badge.">
          <Facts rows={[
            ['Screen locks', `After ${AUTO_LOCK_MS / 60_000} min without use`],
            ['Wrong PIN', '5 tries, then wait 1 min'],
            ['Records close', `After ${SECURITY_POLICY.vaultIdleLockMinutes} min without use`],
            ['Second nurse', `${POLICY.secondChecker.roles.join(', ')} (${POLICY.secondChecker.approved ? 'approved' : 'prototype, not approved'})`],
            ['Own account', 'You cannot switch off yourself'],
            ['Last admin', 'Cannot be switched off'],
          ]} />
        </Block>
      </div>
    </div>
  );
}
