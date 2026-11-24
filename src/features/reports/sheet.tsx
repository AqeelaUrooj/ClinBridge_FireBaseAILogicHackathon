import type { ReportData, ReportLab } from './reportData';
import { Arrow, Print, Ring, Value } from './ink';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { fullName } from '../patient/patientData';
import { regionById } from '../body/regions';
import { shortDay } from './reportText';

export const sheetTitle = (d: ReportData, name: string) => `Synthetic Practice report: ${name} for ${fullName(d.bundle.patient)}, MRN ${d.bundle.patient.mrn}. Not a medical record.`;
export const sheetDesc = (d: ReportData) => `Fictional patient, born ${dayLabel(d.bundle.patient.birth_date)}. Drawn by ClinBridge from the Practice records at ${dateTimeLabel(d.nowIso)}. The handwriting is made by the program. Not signed.`;

/** Who the sheet is about, in print, and where it comes from. */
export function Footer({ d, w, y, size = 11.5 }: { d: ReportData; w: number; y: number; size?: number }) {
  const p = d.bundle.patient;
  return (
    <>
      <Print x={w / 2} y={y - size * 1.25} anchor="middle" size={size} bold fill="#a3261b" t={`${fullName(p)}, MRN ${p.mrn}, born ${dayLabel(p.birth_date)} (fictional patient ${p.id})`} />
      <Print x={w / 2} y={y} anchor="middle" size={size * 0.94} fill="#a3261b" t={`Synthetic: drawn by ClinBridge from Practice records, ${dateTimeLabel(d.nowIso)}. Handwriting made by the program. Not signed.`} />
    </>
  );
}

/** A recorded value, its flag as a pen arrow (ring = recorded as critical), and when it is from. */
export function LabValue({ x, y, w, l, size = 22 }: { x: number; y: number; w: number; l: ReportLab | undefined; size?: number }) {
  if (!l) return null;
  return (
    <g>
      <Value x={x} y={y} w={w * 0.5} h={size * 1.3} t={l.value} size={size} tag={`lab-${l.name}`} />
      {l.flag === 'low' && <Arrow x1={x + w * 0.5} y1={y + 4} x2={x + w * 0.5} y2={y + size * 1.1} />}
      {(l.flag === 'high' || l.flag === 'critical') && <Arrow x1={x + w * 0.5} y1={y + size * 1.1} x2={x + w * 0.5} y2={y + 4} />}
      {l.flag === 'critical' && <Ring x={x - 10} y={y - 3} w={w * 0.5} h={size * 1.45} />}
      <Value x={x + w * 0.57} y={y - 1} w={w * 0.46} h={size * 1.45} t={`${l.unit} ${l.fromList ? shortDay(l.time) : hm(l.time)}`} size={size * 0.62} />
    </g>
  );
}

/** Numbered sites of this patient's own medicine records that have a place on the front figure. */
export function sitesOnFigure(d: ReportData) {
  const seen = new Map<string, string>();
  for (const m of d.sites.marked) if (!seen.has(m.regionId)) seen.set(m.regionId, m.site);
  return [...seen].flatMap(([id, site], i) => {
    const zone = regionById(id)?.zones.front;
    return zone ? [{ n: i + 1, site, at: zone.anchor }] : [];
  });
}
