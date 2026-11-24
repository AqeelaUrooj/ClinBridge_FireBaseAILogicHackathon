import type { ComponentType } from 'react';
import type { ReportData } from './reportData';
import { hash, type Pen } from '../../lib/handwriting/hand';
import type { Look } from './ink';
import { AssessmentSheet } from './AssessmentSheet';
import { ShiftSheet } from './ShiftSheet';
import { WorksheetSheet } from './WorksheetSheet';
import { PocketSheet } from './PocketSheet';

export type TemplateId = 'assessment' | 'shift' | 'worksheet' | 'pocket';
interface Template {
  id: TemplateId;
  name: string;
  about: string;
  Sheet: ComponentType<{ d: ReportData; pen: Pen; seed: string; look: Look }>;
  pen: Omit<Pen, 'ink' | 'slant'>;
  inks: string[];
  slant: [number, number];
}

/** One entry per reference sheet. A new design is one more entry here: data, handwriting, print and export stay the same. */
export const TEMPLATES: Template[] = [
  { id: 'assessment', name: 'Assessment sheet', about: 'Patient background, assessments, labs and body figures', Sheet: AssessmentSheet, pen: { main: 'CB Kalam', alt: 'CB Caveat', altShare: 0.3, weight: 0.5, mess: 1.1 }, inks: ['#172a94', '#1b2f8f', '#16256f'], slant: [0, 6] },
  { id: 'shift', name: 'Shift report', about: 'Vitals trend, medicines, intake and output, handover', Sheet: ShiftSheet, pen: { main: 'CB Caveat', alt: 'CB Nothing', altShare: 0.4, weight: 0.35, mess: 1.15 }, inks: ['#252f88', '#232f78', '#2a3686'], slant: [2, 8] },
  { id: 'worksheet', name: 'Bedside worksheet', about: 'Black grid with lab fishbones, systems and hours', Sheet: WorksheetSheet, pen: { main: 'CB Architect', alt: 'CB Indie', altShare: 0.3, weight: 0.4, mess: 1.05 }, inks: ['#111216', '#16171c'], slant: [-2, 4] },
  { id: 'pocket', name: 'Pocket notes', about: 'Notepad at the bedside, no printed form', Sheet: PocketSheet, pen: { main: 'CB JustMe', alt: 'CB Grace', altShare: 0.16, weight: 0.8, mess: 1.15 }, inks: ['#151a33', '#1a2142', '#101218'], slant: [2, 8] },
];
export const templateById = (id: string | null | undefined) => TEMPLATES.find((t) => t.id === id);

/**
 * No Practice patient has a report picture of their own, so every report is drawn from the records. Which design opens
 * first depends on the patient id, so patients do not all look the same; any design can be chosen.
 */
export const defaultTemplate = (patientId: string): Template => TEMPLATES[(Number(/\d+$/.exec(patientId)?.[0] ?? hash(patientId)) - 1 + TEMPLATES.length) % TEMPLATES.length]!;

/** The same hand for the same patient and design, another one for the next patient. */
export function penFor(t: Template, patientId: string): Pen {
  const h = hash(`${t.id}|${patientId}`);
  return { ...t.pen, ink: t.inks[h % t.inks.length]!, slant: t.slant[0] + ((h >>> 8) % 100) / 100 * (t.slant[1] - t.slant[0]), mess: t.pen.mess * (0.88 + ((h >>> 16) % 100) / 100 * 0.24) };
}

export function HandwrittenNursingReport({ d, template, look }: { d: ReportData; template: TemplateId; look: Look }) {
  const t = templateById(template)!;
  const id = d.bundle.patient.id;
  return <t.Sheet d={d} pen={penFor(t, id)} seed={`${t.id}|${id}`} look={look} />;
}
