import { useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AUTO_LOCK_MS, useApp, useSession } from '../../state/app';
import { ACTIVE_CLINICAL_POLICY as POLICY } from '../../config/clinicalPolicy';
import { CLINICAL_WARNINGS } from '../../config/clinicalWarnings';
import { SECURITY_POLICY } from '../../config/securityPolicy';
import { VITAL_RULES, type VitalKey } from '../../lib/vitals';
import { dateTimeLabel } from '../../lib/time';
import { Badge, Button, ButtonLink, Icon } from '../../components/ui';
import { CATEGORY_LABEL } from '../recovery/recoveryData';
import { Block, Facts, Head, PaperHead, saveJson } from './adminUi';

type Tab = 'all' | 'lock' | 'meds' | 'vitals' | 'recovery' | 'roles';
const TABS: { v: Tab; label: string; icon: string }[] = [
  { v: 'all', label: 'All', icon: 'list' }, { v: 'lock', label: 'Lock and keys', icon: 'timer' }, { v: 'meds', label: 'High-alert medicines', icon: 'warning' },
  { v: 'vitals', label: 'Vital-sign ranges', icon: 'vital_signs' }, { v: 'recovery', label: 'Recovery and network', icon: 'checklist' }, { v: 'roles', label: 'Roles', icon: 'person_check' },
];
const EVENT: Record<string, string> = { administered: 'Given', held: 'Held', refused: 'Refused', rate_changed: 'Rate changed' };
const State = ({ ok }: { ok: boolean }) => <Badge tone={ok ? 'green' : 'amber'}>{ok ? 'Approved' : 'Not approved'}</Badge>;
const Row = ({ children, badge }: { children: ReactNode; badge?: ReactNode }) => <li className="rounded-lg bg-surface-container-low p-space-sm flex flex-wrap items-center justify-between gap-2 font-body-md text-body-md"><span className="min-w-0 flex-1 basis-[12rem]">{children}</span>{badge}</li>;

/** Settings (Stitch "Administration settings, governance"). Read only: the values live in reviewed code, not on this page. */
export function SettingsPage() {
  const { db, dataset, clock } = useApp();
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const staff = useLiveQuery(() => db.practitioner.filter((p) => p.active).toArray(), [db]);
  const show = (t: Tab) => tab === 'all' || tab === t;
  const now = clock.nowIso();
  const secondLine = (r: string) => (POLICY.secondChecker.roles as string[]).includes(r);
  const queue = Object.entries(POLICY.recovery.categoryRank).sort((a, b) => b[1] - a[1]).map(([k]) => CATEGORY_LABEL[k] ?? 'Other');
  const save = () => saveJson(`clinbridge-settings-${now.slice(0, 16).replace(/[:T]/g, '-')}.json`, {
    made_at: now, note: 'Prototype settings. Not approved clinical or security policy. No patient or staff data.',
    clinical_policy: POLICY, vital_sign_warnings: CLINICAL_WARNINGS, security: SECURITY_POLICY, screen_lock_minutes: AUTO_LOCK_MS / 60_000, wrong_pin: { tries: 5, wait_seconds: 60 },
  });
  return (
    <div className="flex flex-col gap-space-md">
      <PaperHead title="Settings" by={user?.name} at={dateTimeLabel(now)} practice={dataset === 'practice'} />
      <Head label="Settings" title="Settings"
        badges={<><Badge icon="lock">Read only</Badge><Badge tone="amber" icon="science">Prototype, for fake patients only</Badge></>}
        text={`${POLICY.note} They are read only here; a hospital-approved policy will replace them.`}
        actions={<><ButtonLink variant="secondary" to="/admin"><Icon name="monitor_heart" />Check this laptop</ButtonLink><Button variant="secondary" onClick={save}><Icon name="download" />Save settings (JSON)</Button><Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print</Button></>} />

      <div role="group" aria-label="Settings group" className="flex flex-wrap gap-1 print:hidden">
        {TABS.map((t) => <button key={t.v} type="button" aria-pressed={tab === t.v} onClick={() => setTab(t.v)} className={`min-h-11 px-3 rounded-lg font-body-md text-body-md font-semibold flex items-center gap-2 ${tab === t.v ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest border border-card-border text-on-surface-variant hover:bg-surface-container'}`}><Icon name={t.icon} className="text-[20px]" />{t.label}</button>)}
      </div>

      <div className={`grid grid-cols-1 ${tab === 'all' ? 'xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''} gap-space-md items-start print:block`}>
        <div className="min-w-0 flex flex-col gap-space-md">
          {show('lock') && (
            <Block title="Screen lock and PIN" icon="lock_clock" badge={<State ok={SECURITY_POLICY.approved} />}>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
                {([['Screen locks after', AUTO_LOCK_MS / 60_000, 'min without use'], ['Wrong PIN', 5, 'tries, then 1 min wait'], ['Records close after', SECURITY_POLICY.vaultIdleLockMinutes, 'min without use']] as [string, number, string][]).map(([k, v, u]) => <dl key={k} className="rounded-lg bg-surface-container-low p-space-sm"><dt className="font-body-sm text-body-sm text-on-surface-variant">{k}</dt><dd className="font-body-sm text-body-sm text-secondary"><strong className="font-code-tabular text-[28px] leading-9 text-primary">{v}</strong> {u}</dd></dl>)}
              </div>
              <p className="font-body-sm text-body-sm text-secondary">When the records close, the unit passphrase is needed again. Hospital IT and security must review these values.</p>
            </Block>
          )}
          {show('meds') && (
            <Block title="High-alert medicines" icon="medication" badge={<State ok={POLICY.highAlert.approved} />} text={<>A second nurse enters their own PIN.{POLICY.highAlert.listIsComplete ? '' : ' This list is partial. A medicine that is not here is not called safe.'}</>}>
              <ul className="flex flex-col gap-2">{POLICY.highAlert.entries.map((e) => <Row key={e.id} badge={<Badge tone="red">Second nurse PIN</Badge>}><strong className="text-primary">{e.label}</strong> <span className="text-body-sm text-on-surface-variant">when {e.events.map((x) => (EVENT[x] ?? x).toLowerCase()).join(' or ')}</span></Row>)}</ul>
              <p className="font-body-sm text-body-sm text-secondary">Source: {POLICY.highAlert.source}</p>
              <Facts rows={[['Second nurse may be', POLICY.secondChecker.roles.join(', ')], ['Medicine timing (Overdue)', POLICY.medicationTiming.windows.length ? `${POLICY.medicationTiming.windows.length} windows` : 'None: doses show Due only']]} />
            </Block>
          )}
          {show('vitals') && (
            <Block title="Vital-sign warning ranges" icon="vital_signs" badge={<State ok={CLINICAL_WARNINGS.review.approved} />} text="Outside a range the form says “Unusual value, check it”. It warns only and never blocks saving. No early-warning or risk score is calculated.">
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-2">{(Object.entries(CLINICAL_WARNINGS.ranges) as [VitalKey, [number, number]][]).map(([k, [lo, hi]]) => <Row key={k} badge={<span className="font-code-tabular font-semibold text-primary whitespace-nowrap">{lo} to {hi} <span className="text-body-sm font-normal text-secondary">{VITAL_RULES[k].unit}</span></span>}>{VITAL_RULES[k].label}</Row>)}</ul>
              <p className="font-body-sm text-body-sm text-secondary">{CLINICAL_WARNINGS.review.note}</p>
            </Block>
          )}
          {show('recovery') && (
            <Block title="Recovery and network" icon="checklist" badge={<State ok={POLICY.recovery.approved} />} text={POLICY.recovery.note}>
              <Facts rows={[['Recovery queue order', queue.join(' > ')]]} />
              <h4 className="font-body-md text-body-md font-semibold text-primary">Network clearance: {POLICY.recovery.networkChecklist.length} items and the admin&apos;s PIN</h4>
              <ol className="flex flex-col gap-2">{POLICY.recovery.networkChecklist.map((c, i) => <Row key={c}>{i + 1}. {c}</Row>)}</ol>
            </Block>
          )}
        </div>
        <div className="min-w-0 flex flex-col gap-space-md print:mt-4">
          {show('roles') && (
            <Block title="Roles" icon="person_check" badge={<Badge>{staff?.length ?? 0} active</Badge>} text="What a person may do follows the role. It is not set per person.">
              <ul aria-label="Roles" className="flex flex-col gap-2">
                {(staff ?? []).map((p) => (
                  <li key={p.id} className="rounded-lg bg-surface-container-low p-space-sm">
                    <details>
                      <summary className="cursor-pointer list-none flex flex-wrap items-center gap-space-sm"><span aria-hidden className={`w-10 h-10 rounded-lg grid place-items-center font-bold shrink-0 ${p.role === 'admin' ? 'bg-primary-container text-on-primary' : 'bg-secondary-fixed text-on-secondary-fixed'}`}>{p.initials}</span><span className="min-w-0 flex-1 basis-[7rem] font-body-md text-body-md font-semibold text-primary [overflow-wrap:anywhere]">{p.name}</span><Badge tone={p.role === 'admin' ? 'navy' : 'blue'}>{p.role === 'admin' ? 'Admin' : p.role}</Badge><Icon name="expand_more" /></summary>
                      <ul className="mt-2 list-disc pl-5 font-body-sm text-body-sm text-on-surface-variant">
                        {(p.role === 'admin' ? ['Admin pages, staff, backup, network clearance', 'Admissions only as an override with a written reason', 'Cannot chart'] : p.role === 'admission' ? ['Registers Practice patients, assigns beds, records transfers and discharges', 'Identity reconciliation steps', 'Cannot chart, give medicines or open nursing records', 'No admin pages'] : ['Charts, checks drafts, hands over', ...(p.role === 'RN' ? ['Provisional patient during downtime, transfer, discharge, identity steps'] : ['No registration, transfer or discharge (prototype rule)']), secondLine(p.role) ? 'Can be the second nurse' : 'Cannot be the second nurse', 'No admin pages']).map((t) => <li key={t}>{t}</li>)}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
              <ButtonLink variant="secondary" className="print:hidden" to="/admin/staff">Open staff</ButtonLink>
            </Block>
          )}
          {show('lock') && (
            <Block title="Encryption and recovery key" icon="key" badge={<State ok={SECURITY_POLICY.approved} />}>
              <Facts rows={[['Records', 'AES-256-GCM'], ['Passphrase to key', `PBKDF2-SHA-256, ${SECURITY_POLICY.pbkdf2Iterations.toLocaleString('en-US')} rounds`], ['Enrollment file valid', `${SECURITY_POLICY.enrollmentValidHours} h`], ['Recovery key', 'On paper, kept by the unit']]} />
              <p className="font-body-sm text-body-sm text-secondary">ClinBridge does not store the passphrase or the recovery key.</p>
            </Block>
          )}
        </div>
      </div>
    </div>
  );
}
