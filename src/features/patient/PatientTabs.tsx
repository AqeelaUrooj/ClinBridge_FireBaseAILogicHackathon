import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

/** Patient page tabs, as on the Stitch patient screens. Every tab is a real page of this patient. */
const TABS: [label: string, path: string][] = [
  ['Summary', ''], ['History', '/timeline'], ['Medications (MAR)', '/meds'], ['Vitals', '/vitals'],
  ['Intake / Output', '/io'], ['Clinical notes', '/notes'], ['Body map and sites', '/body'], ['SBAR handover', '/handoff'],
];

export function PatientTabs({ patientId }: { patientId: string }) {
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // Narrow screens: bring the current tab into the strip (sideways only, the page itself does not move).
  useEffect(() => {
    const el = ref.current, on = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (el && on) el.scrollLeft = on.offsetLeft - el.offsetLeft - (el.clientWidth - on.offsetWidth) / 2;
  }, [pathname]);
  return (
    <nav ref={ref} aria-label="Patient pages" className="flex items-center gap-1 overflow-x-auto bg-surface-container-lowest rounded-xl border border-card-border p-1.5">
      {TABS.map(([label, path]) => (
        <NavLink key={label} to={`/patients/${patientId}${path}`} end={path === ''}
          className={({ isActive }) => `min-h-9 px-3 rounded flex items-center font-body-sm text-body-sm whitespace-nowrap transition-colors ${isActive ? 'bg-primary text-on-primary font-bold shadow-sm' : 'text-on-surface-variant font-semibold hover:bg-surface-container hover:text-on-surface'}`}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
