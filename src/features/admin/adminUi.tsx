import type { ReactNode } from 'react';
import { Icon } from '../../components/ui';

/** Shared pieces of the admin pages (Stitch admin screens). Plain layout only; no data is read here. */
export const PANEL = 'min-w-0 bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-md';

export const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
export const Err = ({ e }: { e: string | null }) => (e ? <p role="alert" className="text-error font-body-md">{e}</p> : null);

/** Page head: badges, title, one line of text, actions on the right. */
export function Head({ label, badges, title, text, actions, children }: { label: string; badges?: ReactNode; title: string; text: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-label={label} className={`${PANEL} flex flex-wrap items-center justify-between gap-space-md print:border-0 print:shadow-none print:p-0`}>
      <div className="min-w-0 flex-1 basis-[20rem]">
        {badges && <div className="flex flex-wrap items-center gap-2 mb-1">{badges}</div>}
        <h2 className="font-headline-md text-headline-md text-primary">{title}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">{text}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}
      {children && <div className="basis-full">{children}</div>}
    </section>
  );
}

export function Tile({ label, icon, value, unit, foot, bar, tone }: { label: string; icon: string; value: ReactNode; unit?: ReactNode; foot?: ReactNode; /** 0 to 1 */ bar?: number | null; tone?: 'red' | 'amber' }) {
  const color = tone === 'red' ? 'text-clinical-red' : tone === 'amber' ? 'text-[#7a5410]' : 'text-primary';
  return (
    <div className={`${PANEL} flex flex-col gap-1`}>
      <p className="flex items-center justify-between gap-2 font-label-uppercase text-label-uppercase text-secondary uppercase">{label}<Icon name={icon} className="text-[20px]" /></p>
      <p className={`font-code-tabular text-[30px] leading-tight font-bold [overflow-wrap:anywhere] ${color}`}>{value}{unit && <span className="text-body-sm font-normal text-secondary"> {unit}</span>}</p>
      {foot && <p className="font-body-sm text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{foot}</p>}
      {bar != null && <span aria-hidden className="mt-auto block h-1.5 rounded-full bg-surface-container"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(1, bar * 100))}%` }} /></span>}
    </div>
  );
}

/** A card with an icon title, an optional badge and text. */
export function Block({ title, icon, badge, text, children, className = '' }: { title: string; icon: string; badge?: ReactNode; text?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`${PANEL} flex flex-col gap-space-sm ${className}`}>
      <div className="rounded-lg bg-surface-container-low px-space-sm py-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2 min-w-0"><Icon name={icon} className="shrink-0" />{title}</h3>{badge}
      </div>
      {text && <p className="font-body-md text-body-md text-on-surface-variant">{text}</p>}
      {children}
    </section>
  );
}

/** Label and value rows in a grey box. */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="rounded-lg bg-surface-container-low p-space-sm flex flex-col gap-1.5">
      {rows.map(([k, v]) => <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-space-sm"><dt className="font-body-md text-body-md text-on-surface-variant">{k}</dt><dd className="font-body-md text-body-md font-semibold text-primary text-right min-w-0 [overflow-wrap:anywhere]">{v}</dd></div>)}
    </dl>
  );
}

/** Small number boxes side by side. */
export function Counts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-2">
      {items.map(([k, v]) => <div key={k} className="rounded-lg bg-surface-container-low p-space-sm text-center flex flex-col-reverse"><dt className="font-body-sm text-body-sm text-on-surface-variant">{k}</dt><dd className="font-code-tabular text-[20px] font-bold text-primary">{v}</dd></div>)}
    </dl>
  );
}

/** Paper header for admin lists. Hidden on screen. */
export function PaperHead({ title, by, at, practice }: { title: string; by?: string; at: string; practice: boolean }) {
  return <p className="hidden print:block border-b border-black pb-1 text-[9pt]"><strong>{title}</strong> · printed by {by} · {at}{practice ? ' · Fake practice data, not a clinical record' : ''}</p>;
}

export function saveJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
