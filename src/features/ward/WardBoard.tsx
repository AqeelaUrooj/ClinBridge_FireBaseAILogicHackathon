import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import type { DowntimeDB } from '../../db/db';
import { useApp, useSession } from '../../state/app';
import { ageOn, hm } from '../../lib/time';
import { Badge, ButtonLink, Icon, PageTitle } from '../../components/ui';
import { MedIllustration } from '../../components/MedIllustration';
import { VerifyPatientDialog } from '../patient/PatientLayout';
import { fullName, isNoKnownAllergy, loadPatient, type PatientBundle } from '../patient/patientData';

interface Row extends PatientBundle {
  drafts: number;
  critical: string | null;
  lastVitals: string | null;
}

async function loadWard(db: DowntimeDB): Promise<Row[]> {
  const patients = await db.patient.toArray();
  const rows = await Promise.all(
    patients.map(async (p) => {
      const b = (await loadPatient(db, p.id))!;
      const entries = await db.entry.where('patient_id').equals(p.id).toArray();
      const live = entries.filter((e) => e.status !== 'corrected' && e.status !== 'entered-in-error');
      const labs = await db.lab_event.where('entry_id').anyOf(live.filter((e) => e.type === 'lab_event').map((e) => e.id)).toArray();
      const crit = labs.find((l) => l.status === 'critical');
      const lastV = live.filter((e) => e.type === 'vital_sign' && e.status === 'confirmed').sort((a, b) => b.care_time.localeCompare(a.care_time))[0];
      return { ...b, drafts: live.filter((e) => e.status === 'draft').length, critical: crit ? crit.test_name : null, lastVitals: lastV?.care_time ?? null };
    }),
  );
  return rows.sort((a, b) => (a.encounter?.bed ?? '').localeCompare(b.encounter?.bed ?? ''));
}

type Filter = 'all' | 'critical' | 'drafts';

export function WardBoard() {
  const { db, clock } = useApp();
  const { verifyPatient } = useSession();
  const navigate = useNavigate();
  const rows = useLiveQuery(() => loadWard(db), [db]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, setPending] = useState<Row | null>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter === 'critical' && !r.critical) return false;
      if (filter === 'drafts' && !r.drafts) return false;
      if (!s) return true;
      return fullName(r.patient).toLowerCase().includes(s) || r.patient.mrn.toLowerCase().includes(s) || (r.encounter?.bed ?? '').toLowerCase().includes(s);
    });
  }, [rows, q, filter]);

  const counts = { all: rows?.length ?? 0, critical: rows?.filter((r) => r.critical).length ?? 0, drafts: rows?.filter((r) => r.drafts).length ?? 0 };

  return (
    <>
      <PageTitle actions={<ButtonLink variant="secondary" to="/spooler"><Icon name="print" />Paper form packets</ButtonLink>}>My patients</PageTitle>
      <div className="flex flex-wrap items-center gap-space-sm">
        <label className="relative min-w-[260px] flex-1 max-w-md">
          <span className="sr-only">Search by name, MRN or bed</span>
          <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, MRN or bed" className="w-full min-h-11 pl-9 pr-3 bg-surface-container-lowest border border-card-border rounded-lg font-body-lg text-body-lg focus:outline-none focus:ring-2 focus:ring-secondary" />
        </label>
        <div className="flex items-center bg-surface-container-low rounded-lg p-0.5 border border-card-border" role="group" aria-label="Filter">
          {(['all', 'critical', 'drafts'] as Filter[]).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-10 px-3 rounded font-body-md text-body-md ${filter === f ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant'}`}>
              {f === 'all' ? 'All' : f === 'critical' ? 'Critical lab' : 'To check'} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {rows === undefined ? (
        <p role="status" className="text-secondary">Loading patient list…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md">
          {shown.map((r) => {
            const real = r.allergies.filter((a) => !isNoKnownAllergy(a));
            return (
              <button key={r.patient.id} onClick={() => setPending(r)} data-testid={`patient-${r.patient.id}`}
                className="text-left bg-surface-container-lowest rounded-xl border border-card-border p-space-md flex flex-col gap-space-sm hover:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary font-code-tabular text-code-tabular font-bold">Bed {r.encounter?.bed}</span>
                  {real.length > 0 ? <Badge tone="red" icon="warning">Allergy</Badge> : <Badge>No known allergies</Badge>}
                </div>
                <div>
                  <span className="block font-headline-md text-headline-md text-primary">{fullName(r.patient)}</span>
                  <span className="font-body-md text-body-md text-secondary">{ageOn(r.patient.birth_date, clock.nowIso())} years</span>
                </div>
                {r.critical ? (
                  <span className="flex items-center gap-2 px-3 py-2 rounded-lg bg-clinical-red-bg text-clinical-red font-body-lg text-body-lg font-semibold"><Icon name="emergency" className="text-[18px]" />Critical lab · {r.critical}</span>
                ) : r.drafts ? (
                  <span className="flex items-center gap-2 px-3 py-2 rounded-lg bg-downtime-amber-bg text-[#6b4a0e] font-body-lg text-body-lg font-semibold"><MedIllustration name="workflows/checklist" size={22} />{r.drafts} to check</span>
                ) : (
                  <span className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-low text-primary font-body-lg text-body-lg"><MedIllustration name="vitals/heart" size={20} />{r.lastVitals ? `Last vitals ${hm(r.lastVitals)}` : 'No vitals yet'}</span>
                )}
              </button>
            );
          })}
          {shown.length === 0 && <p className="text-secondary">No patients match.</p>}
        </div>
      )}

      {pending && (
        <VerifyPatientDialog
          data={pending}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            verifyPatient(pending.patient.id);
            navigate(`/patients/${pending.patient.id}`);
          }}
        />
      )}
    </>
  );
}
