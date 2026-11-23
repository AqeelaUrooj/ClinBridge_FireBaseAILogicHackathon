import type { ReactNode } from 'react';
import type { ActiveOrder } from '../../db/schema';
import { orderDose } from '../../lib/meds';
import { Icon } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import type { MedicalAsset } from '../../components/MedIllustration';

/**
 * Pieces of the record-a-medicine page, after the Stitch "Two-Nurse Verification" screen: step bar, large drug card
 * with tiles and reference facts, preparation card, change-log footer. They show saved facts and say plainly what
 * ClinBridge does not record. Nothing here clears, approves or calculates a dose.
 */
export interface RefFact { text: string; source: string; tone?: 'plain' | 'amber' | 'red' }
export interface MedWide {
  art: MedicalAsset | null;
  high: boolean;
  dueLabel?: string;
  tiles: { label: string; value: string; note?: string }[];
  facts: RefFact[];
  recorder: string;
  deviceId: string;
  logRows: number | undefined;
}

const kicker = 'font-label-uppercase text-[10px] leading-[13px] text-on-surface-variant uppercase font-bold';

export function StepBar({ current, second, checked }: { current: 'fill' | 'review'; second: boolean; checked: boolean }) {
  const at = current === 'fill' ? 1 : second && !checked ? 2 : 3;
  const steps = ['Patient check done', 'Dose details', second ? 'Second nurse check' : 'Check the record', 'Save on this laptop'];
  return (
    <ol aria-label="Steps" className="bg-surface-container-lowest rounded-xl border border-card-border px-space-md py-space-sm grid grid-cols-2 md:grid-cols-4 gap-space-sm">
      {steps.map((s, i) => {
        const done = i < at || (i === 2 && at === 3), now = i === at;
        return (
          <li key={s} aria-current={now ? 'step' : undefined} className={`flex items-center gap-space-sm p-1.5 rounded ${now ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low'}`}>
            <span className={`w-6 h-6 rounded-full grid place-items-center font-bold text-xs shrink-0 ${done ? 'bg-tertiary-fixed-dim text-on-tertiary-fixed' : now ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-surface-container-highest text-on-surface-variant'}`}>
              {done ? <Icon name="check" className="text-[14px]" label="done" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className={`font-label-uppercase text-[10px] leading-[13px] uppercase block ${now ? 'text-primary-fixed' : 'text-on-surface-variant'}`}>Step {i + 1}{now ? ' • now' : ''}</span>
              <span className={`font-label-badge text-label-badge block ${now ? 'font-bold' : 'text-on-surface'}`}>{s}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function DrugCard({ order, wide, children }: { order: ActiveOrder; wide: MedWide; children?: ReactNode }) {
  return (
    <section aria-label="Medicine" className="bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-space-sm">
        <span className={`flex items-center gap-1 font-label-uppercase text-label-uppercase uppercase ${wide.high ? 'text-error' : 'text-secondary'}`}><Icon name="medication" className="text-[18px]" />{wide.high ? 'High-alert medicine' : 'Medicine'}</span>
        <span className="flex flex-wrap gap-1.5">
          {wide.dueLabel && <span className="font-code-tabular text-code-tabular px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-bold">{wide.dueLabel}</span>}
          <span className="font-code-tabular text-code-tabular px-2 py-0.5 rounded bg-surface-container-high text-on-surface">ORDER ID: {order.id}</span>
        </span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-space-sm mb-space-md">
        <div className="flex items-start gap-space-md min-w-0">
          {wide.art && <span className="w-14 h-14 rounded-xl bg-[#FBF8F2] ring-1 ring-card-border grid place-items-center shrink-0"><MedIllustration name={wide.art} size={38} /></span>}
          <div className="min-w-0">
            <h1 className="font-headline-lg text-headline-lg text-on-surface font-extrabold tracking-tight break-words">{order.drug_name ?? order.text}</h1>
            <p className="font-body-lg text-body-lg text-secondary">{order.text}</p>
          </div>
        </div>
        <div className="sm:text-right shrink-0">
          <span className={`${kicker} block`}>Dose ordered</span>
          <span className="font-vital-display text-vital-display text-primary leading-none">{orderDose(order) || '—'}</span>
          <span className="font-body-lg text-body-lg text-secondary"> {order.route ?? ''}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm mb-space-md">
        {wide.tiles.map((t) => (
          <div key={t.label} className="p-space-sm rounded-lg bg-surface-container-low">
            <span className={`${kicker} block`}>{t.label}</span>
            <span className="font-label-badge text-label-badge text-on-surface mt-1 block">{t.value}</span>
            {t.note && <span className="font-body-sm text-body-sm text-secondary block">{t.note}</span>}
          </div>
        ))}
      </div>
      <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1.5">
        <h2 className={kicker}>Facts to check against</h2>
        <ul className="flex flex-col gap-1.5">
          {wide.facts.map((f) => (
            <li key={f.text} className={`flex items-start justify-between gap-2 font-body-sm text-body-sm ${f.tone === 'red' ? 'text-error font-semibold' : f.tone === 'amber' ? 'text-[#7a5410] font-semibold' : 'text-on-surface'}`}>
              <span className="flex items-start gap-1.5"><Icon name={f.tone === 'plain' || !f.tone ? 'info' : 'warning'} className="text-[16px] mt-0.5 shrink-0" />{f.text}</span>
              <span className="font-code-tabular text-[11px] text-secondary font-bold uppercase shrink-0">{f.source}</span>
            </li>
          ))}
        </ul>
        <p className="font-body-sm text-[12px] text-secondary">For reference. ClinBridge does not clear or approve a dose.</p>
      </div>
      {children}
    </section>
  );
}

/** The design shows ampoule volume, drawn dose and witnessed waste. ClinBridge records none of these, and says so. */
export function PreparationCard({ doseText, recorder }: { doseText: string; recorder: string }) {
  return (
    <section aria-label="Preparation and waste" className="bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm">
      <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2 mb-space-sm"><Icon name="science" className="text-[20px] text-primary" />Preparation and waste</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm text-center">
        <div className="p-space-sm rounded-lg bg-surface-container-low"><span className={`${kicker} block`}>Ampoule or bag volume</span><span className="font-body-lg text-body-lg text-secondary font-semibold block mt-1">Not recorded here</span></div>
        <div className="p-space-sm rounded-lg bg-surface-container-high"><span className={`${kicker} block`}>Dose in this record</span><span className="font-headline-md text-headline-md text-primary font-extrabold block mt-1">{doseText || '—'}</span></div>
        <div className="p-space-sm rounded-lg bg-surface-container-low"><span className={`${kicker} block`}>Witnessed waste</span><span className="font-body-lg text-body-lg text-secondary font-semibold block mt-1">Not recorded here</span></div>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-sm">Write volumes and witnessed waste on the paper controlled-drug form. ClinBridge does not calculate or witness them.</p>
      <p className="mt-space-sm p-1.5 px-2 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5"><Icon name="badge" className="text-[16px]" />Recording nurse: <strong>{recorder}</strong></p>
    </section>
  );
}

export function ChangeLogFooter({ wide, second }: { wide: MedWide; second: boolean }) {
  return (
    <section aria-label="Change log" className="bg-surface-container-lowest rounded-xl border border-card-border p-space-md shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div className="flex items-start gap-space-sm">
        <Icon name="receipt_long" className="text-secondary text-[24px]" />
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">What saving does</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">The record is saved encrypted on this laptop with your name{second ? ' and the second nurse’s name' : ''}, and one row is added to the change log, linked to the row before it (SHA-256). Nothing is sent to other devices.</p>
        </div>
      </div>
      <div className="font-code-tabular text-code-tabular text-secondary shrink-0 md:text-right">
        <span className="block">{wide.logRows != null ? `${wide.logRows} change-log rows now` : 'Reading change log…'}</span>
        <span className="block">{wide.deviceId.toUpperCase()}</span>
      </div>
    </section>
  );
}
