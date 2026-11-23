import { useSession } from '../../state/app';

/** The tick beside a paper source, as on the Stitch capture screen. Nothing is saved as confirmed without it. */
const SOURCE_CHECK = 'I checked every value against the paper.';

export function SourceCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { user } = useSession();
  return (
    <label className="flex items-start gap-space-sm rounded-lg bg-surface-container-low p-space-md cursor-pointer">
      <input type="checkbox" className="w-5 h-5 mt-0.5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={SOURCE_CHECK} />
      <span>
        <span className="block font-body-md text-body-md font-semibold text-primary">{SOURCE_CHECK}</span>
        <span className="block font-body-sm text-body-sm text-secondary">Recorded under {user?.name ?? 'the signed-in nurse'}.</span>
      </span>
    </label>
  );
}
