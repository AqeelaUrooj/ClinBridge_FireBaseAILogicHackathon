/**
 * Local medical illustration library (Theme 2: warm ivory + soft slate-blue).
 * Cut from the supplied reference sheet with transparent backgrounds (scripts/extract_icons.py).
 * Bundled with the app, so they work offline. Never used as proof of a measurement or a drug form,
 * and never instead of a text label: next to a label they are decorative (empty alt).
 */
const FILES = import.meta.glob('../assets/medical/**/*.webp', { eager: true, import: 'default' }) as Record<string, string>;

export const MEDICAL_ASSETS = {
  'medication/capsule': 'Oral medicine',
  'medication/syringe': 'Injection',
  'medication/iv-bag': 'IV bag',
  'medication/vial': 'Vial',
  'medication/tube': 'Cream or ointment tube',
  'medication/oral-liquid': 'Oral liquid bottle',
  'vitals/heart': 'Heart',
  'vitals/lungs': 'Lungs',
  'vitals/thermometer': 'Thermometer',
  'vitals/bp-monitor': 'Blood pressure cuff',
  'vitals/pulse-oximeter': 'Pulse oximeter',
  'vitals/glucose-meter': 'Blood sugar meter',
  'workflows/checklist': 'Checklist',
  'workflows/paper-photo': 'Photo of a paper form',
  'workflows/handover': 'Handover',
  'workflows/bell': 'Alert bell',
  'workflows/bell-alert': 'Alert waiting',
  'workflows/bell-ok': 'All clear',
  'workflows/warning': 'Warning',
  'workflows/offline-alert': 'Offline alert',
  'workflows/device': 'Device check',
} as const;

export type MedicalAsset = keyof typeof MEDICAL_ASSETS;

export const assetUrl = (name: MedicalAsset): string | undefined => FILES[`../assets/medical/${name}.webp`];

/** label = meaningful image (alt text). No label = decorative, hidden from screen readers. */
export function MedIllustration({ name, size = 40, label, className = '' }: { name: MedicalAsset; size?: number; label?: string; className?: string }) {
  const src = assetUrl(name);
  if (!src) return null;
  return (
    <img src={src} width={size} height={size} alt={label ?? ''} aria-hidden={label ? undefined : true}
      className={`shrink-0 object-contain ${className}`} style={{ width: size, height: size }} draggable={false} data-asset={name} />
  );
}
