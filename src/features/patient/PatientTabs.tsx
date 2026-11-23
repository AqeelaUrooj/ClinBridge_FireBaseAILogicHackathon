import { NavLink } from 'react-router-dom';

/** Patient page tabs, as on the Stitch patient screens. Every tab is a real page of this patient. */
const TABS: [label: string, path: string][] = [
  ['Summary', ''], ['History', '/timeline'], ['Medications (MAR)', '/meds'], ['Vitals', '/vitals'],
  ['Intake / Output', '/io'], ['Clinical notes', '/notes'], ['Body map and sites', '/body'],
];

export function PatientTabs({ patientId }: { patientId: string }) {
  return (
    <nav aria-label="Patient pages" className="flex items-center gap-1 overflow-x-auto bg-surface-container-lowest rounded-xl border border-card-border p-1.5">
      {TABS.map(([label, path]) => (
        <NavLink key={label} to={`/patients/${patientId}${path}`} end={path === ''}
          className={({ isActive }) => `min-h-9 px-3 rounded flex items-center font-body-sm text-body-sm whitespace-nowrap transition-colors ${isActive ? 'bg-primary text-on-primary font-bold shadow-sm' : 'text-on-surface-variant font-semibold hover:bg-surface-container hover:text-on-surface'}`}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
