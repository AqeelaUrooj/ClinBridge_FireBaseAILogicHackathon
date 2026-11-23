import { useEffect } from 'react';
import { Icon } from '../../components/ui';

/** 4-digit PIN keypad. Shows dots only, never the digits. Physical keyboard works too. */
export function PinPad({ value, onChange, onSubmit, disabled, error, wide }: { value: string; onChange: (v: string) => void; onSubmit: (v: string) => void; disabled?: boolean; error?: string | null; /** Larger keys, for the sign-in and lock screens. */ wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (/^\d$/.test(e.key) && value.length < 4) { const v = value + e.key; onChange(v); if (v.length === 4) onSubmit(v); }
      else if (e.key === 'Backspace') onChange(value.slice(0, -1));
      else if (e.key === 'Enter' && value.length === 4) onSubmit(value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [value, onChange, onSubmit, disabled]);

  const press = (d: string) => {
    if (disabled || value.length >= 4) return;
    const v = value + d;
    onChange(v);
    if (v.length === 4) onSubmit(v);
  };
  const key = `h-16 rounded-lg grid place-items-center hover:bg-surface-container disabled:opacity-40 font-headline-md text-primary ${wide ? 'bg-surface-container-low text-[28px] font-bold' : 'border border-card-border bg-surface-container-lowest text-headline-md'}`;
  return (
    <div className="flex flex-col gap-space-lg items-center w-full">
      <div className={`flex gap-4 ${wide ? 'rounded-lg bg-surface-container px-12 py-4' : ''}`} aria-label={`${value.length} of 4 digits entered`} role="status">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`w-4 h-4 rounded-full border-2 border-primary ${i < value.length ? 'bg-primary' : ''}`} />
        ))}
      </div>
      {error && <p role="alert" className="font-body-md text-body-md font-semibold text-error">{error}</p>}
      <div className={`grid grid-cols-3 ${wide ? 'gap-2 w-full max-w-[400px]' : 'gap-3 w-[264px]'}`}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className={key} onClick={() => press(d)} disabled={disabled}>{d}</button>
        ))}
        <button type="button" className={key} onClick={() => onChange('')} disabled={disabled} aria-label="Clear"><span className="font-label-uppercase text-label-uppercase">CLEAR</span></button>
        <button type="button" className={key} onClick={() => press('0')} disabled={disabled}>0</button>
        <button type="button" className={key} onClick={() => onChange(value.slice(0, -1))} disabled={disabled} aria-label="Delete last digit"><Icon name="backspace" /></button>
      </div>
    </div>
  );
}
