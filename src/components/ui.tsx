import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

/** Material Symbols icon, bundled locally (no Google Fonts call). Decorative unless a label is given. */
export function Icon({ name, className = '', filled = false, label }: { name: string; className?: string; filled?: boolean; label?: string }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    >
      {name}
    </span>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-container',
  secondary: 'bg-surface-container-lowest text-primary border border-outline-variant hover:bg-surface-container-low',
  danger: 'bg-error text-on-error hover:opacity-90',
  ghost: 'text-secondary hover:bg-surface-container-low',
};
const BASE = 'inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg font-body-md text-body-md font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button className={`${BASE} ${VARIANT[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', className = '', children, ...rest }: LinkProps & { variant?: Variant }) {
  return (
    <Link className={`${BASE} ${VARIANT[variant]} ${className}`} {...rest}>
      {children}
    </Link>
  );
}

export function Card({ className = '', children, as: As = 'section', ...aria }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article'; 'aria-label'?: string }) {
  return <As className={`bg-surface-container-lowest rounded-xl border border-card-border p-space-md ${className}`} {...aria}>{children}</As>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="font-label-uppercase text-label-uppercase text-slate-muted uppercase block">{children}</span>;
}

type Tone = 'neutral' | 'red' | 'amber' | 'green' | 'blue' | 'navy';
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-container text-on-surface-variant',
  red: 'bg-clinical-red-bg text-clinical-red border border-clinical-red-border',
  amber: 'bg-downtime-amber-bg text-[#7a5410] border border-downtime-amber-border',
  green: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  blue: 'bg-secondary-fixed text-on-secondary-fixed',
  navy: 'bg-primary-container text-on-primary',
};
export function Badge({ tone = 'neutral', icon, children, className = '' }: { tone?: Tone; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-badge text-label-badge whitespace-nowrap ${TONE[tone]} ${className}`}>
      {icon && <Icon name={icon} className="text-[14px]" />}
      {children}
    </span>
  );
}

/** Accessible modal: traps focus, Esc closes (when allowed), labelled by its title. */
export function Dialog({ title, children, onClose, labelId = 'dlg-title' }: { title: string; children: ReactNode; onClose?: () => void; labelId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter((x) => !x.hasAttribute('disabled'));
    (el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] bg-primary-container/60 grid place-items-center p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelId} className="bg-surface-container-lowest rounded-xl border border-card-border w-full max-w-md p-space-xl flex flex-col gap-space-lg" style={{ boxShadow: '0 8px 24px -4px rgba(28,37,54,.25)' }}>
        <h2 id={labelId} className="font-headline-md text-headline-md text-primary">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'eco', text, action }: { icon?: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-space-sm py-space-xl text-center text-on-surface-variant">
      <Icon name={icon} className="text-[36px] text-slate-control" />
      <p className="font-body-lg text-body-lg">{text}</p>
      {action}
    </div>
  );
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-space-md">
      <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">{children}</h1>
      {actions && <div className="flex flex-wrap gap-space-sm">{actions}</div>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Path" className="flex flex-wrap items-center gap-1 font-body-md text-body-md text-secondary">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {it.to ? <Link to={it.to} className="font-medium text-secondary hover:text-primary hover:underline">{it.label}</Link> : <span className="text-on-surface">{it.label}</span>}
          {i < items.length - 1 && <Icon name="chevron_right" className="text-[16px] text-outline" />}
        </span>
      ))}
    </nav>
  );
}
