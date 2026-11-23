import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Icon } from '../../components/ui';
import { SECURITY_POLICY } from '../../config/securityPolicy';
import { Block, Facts, PANEL } from './adminUi';
import { useBrowser } from './ReadinessPage';

type Kind = 'new' | 'join' | 'restore';
const FIRST: Record<Kind, string> = { new: 'Admin and laptop', join: 'Enrollment file', restore: 'Backup file' };

/** The page around first-time setup (Stitch "First-time setup wizard"). It shows steps and facts; the form inside decides everything. */
export function SetupFrame({ step, kind, children }: { step: 1 | 3; kind: Kind; children: ReactNode }) {
  const { online, sw, persisted, quota } = useBrowser();
  const steps = [{ n: 1, label: FIRST[kind] }, { n: 2, label: 'Unit passphrase' }, { n: 3, label: 'Recovery key' }, { n: 4, label: kind === 'restore' ? 'Sign in' : 'Sign in, patient list' }];
  return (
    <div className="w-full max-w-[1180px] flex flex-col gap-space-md">
      <header className="flex flex-wrap items-end justify-between gap-space-sm">
        <div>
          <p className="flex items-center gap-2 font-label-uppercase text-label-uppercase uppercase text-secondary">Real records <Badge tone="blue">{kind === 'join' ? 'Steps 1 to 3 of 4' : step === 1 ? 'Steps 1 and 2 of 4' : 'Step 3 of 4'}</Badge></p>
          <h2 className="font-headline-lg text-headline-lg text-primary">First-time setup</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Prepares this laptop to keep encrypted records when the hospital system is down.</p>
        </div>
        <Link to="/sign-in" className="min-h-11 inline-flex items-center gap-1 font-body-md font-semibold text-primary"><Icon name="arrow_back" className="text-[20px]" /><span className="underline">Back to sign-in</span></Link>
      </header>
      <ol aria-label="Steps" className={`${PANEL} grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2`}>
        {steps.map((s) => {
          const now = kind === 'join' ? s.n <= 3 : step === 1 ? s.n <= 2 : s.n === 3, // the join form shows its own recovery key
             done = step === 3 && s.n < 3;
          return (
            <li key={s.n} aria-current={now ? 'step' : undefined} className={`rounded-lg p-space-sm flex items-center gap-space-sm ${now ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-on-surface-variant'}`}>
              <span aria-hidden className={`w-9 h-9 rounded-full grid place-items-center font-bold shrink-0 ${now ? 'bg-secondary-fixed text-on-secondary-fixed' : done ? 'bg-sync-green text-white' : 'bg-surface-container-highest'}`}>{done ? <Icon name="check" className="text-[20px]" /> : s.n}</span>
              <span className="min-w-0"><span className="block font-label-uppercase text-label-uppercase uppercase">{done ? 'Filled in' : now ? 'Now' : 'Later'}</span><span className="block font-body-md text-body-md font-semibold [overflow-wrap:anywhere]">{s.label}</span></span>
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-space-md items-start">
        <section aria-label="Setup form" className={`${PANEL} flex flex-col gap-space-md`}>{children}</section>
        <div className="flex flex-col gap-space-md min-w-0">
          <Block title="This browser" icon="monitor_heart" text="What the browser reports now. Not a hardware test.">
            <Facts rows={[['App stored for offline', sw === null ? 'Not known' : sw ? 'Yes' : 'Not yet'], ['Data kept by the browser', persisted === null ? 'Not known' : persisted ? 'Yes' : 'Not guaranteed'], ['Space allowed', quota ? `${(quota.total / 1e9).toFixed(1)} GB` : 'Not reported'], ['Network', online ? 'Connected' : 'None, not needed for a new setup'], ['Encryption', `AES-256-GCM, ${SECURITY_POLICY.approved ? 'approved settings' : 'prototype settings'}`]]} />
          </Block>
          <div role="note" className="rounded-xl bg-downtime-amber-bg border border-downtime-amber-border p-space-md flex items-start gap-space-sm text-[#5c400c]">
            <Icon name="warning" /><div><p className="font-headline-sm text-headline-sm">Before you start</p><p className="font-body-md text-body-md">ClinBridge is a prototype and is not approved for real patients. If the passphrase and the recovery key are both lost, the records cannot be read by anyone.</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}
