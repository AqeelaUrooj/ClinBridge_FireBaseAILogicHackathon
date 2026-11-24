import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { loadReportFonts, reportFontCss } from '../../lib/handwriting/fonts';
import { fullName } from '../patient/patientData';
import { sheetToPicture } from './exportPng';
import type { ReportData } from './reportData';
import { sheetReading, type SheetReading } from './sheetReading';
import { HandwrittenNursingReport, type TemplateId } from './templates';

export interface ReportImage {
  blob: Blob;
  width: number;
  height: number;
  /** SHA-256 of the picture file, so it can be shown that two models got the same one. */
  sha256: string;
  reading: SheetReading | null;
}

/** Everything a picture needs from the app's own files. Done early: while the on-device model runs, fetch is blocked. */
export const prepareReportImages = () => Promise.all([loadReportFonts(), reportFontCss()]);

/**
 * The report of one patient in one design as a picture file. The same sheet, the same photo look and the same export
 * as the patient's report page, only drawn outside the page. JPEG: the paper grain makes a PNG about 6 MB, too much to
 * send to a model. Nothing is sent and nothing is saved here.
 */
export async function reportImage(d: ReportData, template: TemplateId, width = 1600): Promise<ReportImage> {
  await prepareReportImages(); // the handwriting is measured while it is drawn
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<HandwrittenNursingReport d={d} template={template} look="photo" />));
    const svg = host.querySelector<SVGSVGElement>('svg[data-look="photo"]');
    if (!svg) throw new Error('The report could not be drawn.');
    const p = d.bundle.patient;
    const blob = await sheetToPicture(svg, { name: fullName(p), mrn: p.mrn }, 'image/jpeg', width);
    const digest = await crypto.subtle.digest('SHA-256', await new Response(blob).arrayBuffer());
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
    return {
      blob, width, height: Math.round((width * h) / w),
      sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
      reading: sheetReading(svg, d, template),
    };
  } finally {
    root.unmount();
  }
}
