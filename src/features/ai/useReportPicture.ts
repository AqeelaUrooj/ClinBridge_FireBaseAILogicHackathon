import { useEffect, useState } from 'react';
import { useApp } from '../../state/app';
import { fullName } from '../patient/patientData';
import { loadReportData } from '../reports/reportData';
import { prepareReportImages, reportImage, type ReportImage } from '../reports/reportImage';
import type { TemplateId } from '../reports/templates';
import { msg } from './messages';

/** A drawn report picture, with the patient and design it was drawn FROM (not what is selected now). */
export interface ReportPicture extends ReportImage { key: string; url: string; patientId: string; name: string; mrn: string; template: TemplateId; drawnAt: string }

/**
 * The picture of one patient's report, or nothing. A picture is only returned for exactly the patient and design that
 * are asked for now: one that was drawn for an older choice is dropped, also when it is ready late.
 */
export function useReportPicture(patientId: string, template: TemplateId, on: boolean) {
  const { db, clock } = useApp();
  const [attempt, setAttempt] = useState(0);
  const [state, set] = useState<{ key: string; picture?: ReportPicture; error?: string } | null>(null);
  const key = on && patientId ? `${patientId}|${template}|${attempt}` : '';

  // Early, so that nothing has to be fetched while the on-device model runs (fetch is blocked then).
  useEffect(() => { prepareReportImages().catch(() => undefined); }, []);

  useEffect(() => {
    let current = true, url = '';
    set(null);
    if (key) {
      void (async () => {
        try {
          const drawnAt = clock.nowIso();
          const d = await loadReportData(db, patientId, drawnAt);
          if (!current) return;
          if (!d) throw new Error('This patient is not in the patient list.');
          const image = await reportImage(d, template);
          if (!current) return;
          const p = d.bundle.patient;
          url = URL.createObjectURL(image.blob);
          set({ key, picture: { ...image, key, url, patientId: p.id, name: fullName(p), mrn: p.mrn, template, drawnAt } });
        } catch (e) {
          if (current) set({ key, error: msg(e) });
        }
      })();
    }
    return () => { current = false; if (url) URL.revokeObjectURL(url); };
  }, [key, db, clock, patientId, template]);

  const mine = key && state?.key === key ? state : null;
  return { picture: mine?.picture, error: mine?.error, retry: () => setAttempt((n) => n + 1) };
}
