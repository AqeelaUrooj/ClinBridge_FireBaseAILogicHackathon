import { useApp } from '../../state/app';
import { ageOn, dayLabel } from '../../lib/time';
import { Icon } from '../../components/ui';
import { fullName, isNoKnownAllergy, sexLabel, type PatientBundle } from './patientData';

/**
 * Patient identity banner (Stitch "Patient Banner & Triage Header").
 * Two identifiers (name + date of birth) and MRN are always shown; bed is shown as location only.
 * Allergies are never hidden.
 */
export function PatientBanner({ data }: { data: PatientBundle }) {
  const { clock } = useApp();
  const { patient: p, encounter: e, allergies } = data;
  const real = allergies.filter((a) => !isNoKnownAllergy(a));
  return (
    <section aria-label="Patient" className="sticky z-30 bg-surface-container-lowest rounded-xl border border-card-border p-space-md" style={{ top: 'calc(var(--header-h) + 8px)' }}>
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-space-md">
        <div className="flex items-start gap-space-md">
          <div className="bg-primary text-on-primary rounded-lg px-3 py-2 flex flex-col items-center justify-center min-w-[72px]">
            <span className="font-label-uppercase text-[10px] tracking-widest text-primary-fixed">BED</span>
            <span className="font-headline-lg text-headline-lg leading-none font-bold">{e?.bed ?? '—'}</span>
          </div>
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-x-space-sm gap-y-1">
              <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">{fullName(p)}</h1>
              <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold">{ageOn(p.birth_date, clock.nowIso())}y {sexLabel(p.sex)}</span>
              <span className="font-code-tabular text-code-tabular text-secondary">Born {dayLabel(p.birth_date)}</span>
              <span className="font-code-tabular text-code-tabular font-semibold px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed" style={{ fontFeatureSettings: "'tnum' 1, 'zero' 1" }}>MRN {p.mrn}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-space-md gap-y-1 mt-1 text-on-surface-variant font-body-md text-body-md">
              {e?.attending && <span>Doctor: <span className="font-medium text-on-surface">{e.attending}</span></span>}
              {e?.code_status && <span className="inline-flex items-center gap-1 font-semibold text-primary"><span className="w-2 h-2 rounded-full bg-primary" aria-hidden />{e.code_status}</span>}
              {e?.diet && <span>Diet: <span className="font-medium text-on-surface">{e.diet}</span></span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          {e?.isolation && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error-container text-on-error-container">
              <Icon name="masks" filled className="text-[20px]" />
              <span className="font-label-uppercase text-label-uppercase">{e.isolation} isolation</span>
            </div>
          )}
          {real.length > 0 ? (
            real.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-clinical-red-bg border border-clinical-red text-clinical-red" role="note">
                <Icon name="warning" filled className="text-[20px]" />
                <span className="flex flex-col leading-tight">
                  <span className="font-label-uppercase text-label-uppercase">ALLERGY: {a.substance.toUpperCase()}</span>
                  {a.reaction && <span className="font-body-sm text-body-sm">{a.reaction}{a.severity ? ` · ${a.severity}` : ''}</span>}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-high text-on-surface font-label-badge text-label-badge">
              <Icon name="verified" className="text-[18px] text-secondary" />
              {allergies.length ? 'No known allergies' : 'Allergies not recorded'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
