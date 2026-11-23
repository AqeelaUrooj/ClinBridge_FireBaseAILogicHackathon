import { useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useSession } from '../../state/app';
import { dateTimeLabel, dayLabel } from '../../lib/time';
import { fullName, type PatientBundle } from './patientData';

/**
 * Puts the patient identifiers on every printed page of a patient screen (the on-screen banner is hidden on paper).
 * On paper the page becomes a table whose header row repeats. Two things make Chromium repeat it: the header is a
 * table-header-group, and it has break-inside: avoid. A fixed header does not repeat after the first page.
 * On screen the wrappers are `display: contents`, so nothing changes.
 */
export function PatientPrint({ data, children }: { data: PatientBundle; children: ReactNode }) {
  const { db, clock, dataset, deviceId } = useApp();
  const { user } = useSession();
  const device = useLiveQuery(async () => (await db.device.get(deviceId))?.label, [db, deviceId]);
  const { patient: p, encounter: e } = data;
  // The time of printing, not the time the page was opened.
  const [at, setAt] = useState(() => clock.nowIso());
  useEffect(() => {
    const stamp = () => flushSync(() => setAt(clock.nowIso()));
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, [clock]);
  return (
    <div className="contents print:table print:w-full">
      <div className="hidden print:table-header-group break-inside-avoid">
        <div className="print:table-row">
          <div className="print:table-cell" data-print-identity="">
            <div className="mb-3 border-b border-black pb-1 text-black">
              <p className="text-[11pt] leading-snug"><strong>{fullName(p)}</strong> · Born {dayLabel(p.birth_date)} · MRN {p.mrn}{e?.bed ? ` · Bed ${e.bed}` : ''}</p>
              <p className="text-[8.5pt] leading-snug">Printed by {user?.name ?? 'unknown'} · {dateTimeLabel(at)}{device ? ` · laptop ${device}` : ''}{dataset === 'practice' ? ' · Fake practice data, not a clinical record' : ''}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="contents print:table-row-group">
        <div className="contents print:table-row">
          <div className="contents print:table-cell">
            <div className="contents print:block print:space-y-4">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
