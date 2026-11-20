import { Link } from 'react-router-dom';
import type { Entry, EntryType, LabEvent, MedAdmin, IntakeOutput, Note, VitalSign } from '../../db/schema';
import type { EntryWithChild } from '../../db/repos/entries';
import { vitalsSummary } from '../../lib/vitals';
import { formatDose } from '../../lib/dose';
import { hm } from '../../lib/time';
import { Badge, Icon } from '../../components/ui';

export const TYPE_LABEL: Record<EntryType, string> = { vital_sign: 'Vitals', med_admin: 'Medicine', intake_output: 'Fluids', note: 'Note', lab_event: 'Lab' };
export const TYPE_ICON: Record<EntryType, string> = { vital_sign: 'vital_signs', med_admin: 'medication', intake_output: 'water_drop', note: 'description', lab_event: 'science' };
const EVENT: Record<string, string> = { administered: 'Given', held: 'Held', refused: 'Refused', rate_changed: 'Rate changed' };

export function entrySummary({ entry, child }: EntryWithChild): string {
  if (!child) return TYPE_LABEL[entry.type];
  switch (entry.type) {
    case 'vital_sign': return vitalsSummary(child as VitalSign);
    case 'med_admin': {
      const m = child as MedAdmin;
      if (m.event === 'rate_changed') return `${m.drug_name} · rate ${formatDose(m.prior_infusion_rate)} → ${formatDose(m.infusion_rate)} ${m.infusion_rate_unit ?? ''}`;
      return `${m.drug_name}${m.dose_given != null ? ` ${formatDose(m.dose_given)} ${m.dose_given_unit ?? ''}` : ''} · ${EVENT[m.event] ?? m.event}`;
    }
    case 'intake_output': { const io = child as IntakeOutput; return `${io.direction === 'in' ? 'In' : 'Out'} · ${io.category} ${io.volume_ml} mL`; }
    case 'note': { const n = child as Note; return n.text.length > 70 ? `${n.text.slice(0, 68)}…` : n.text; }
    case 'lab_event': { const l = child as LabEvent; return `${l.test_name}${l.value_num != null ? ` ${l.value_num} ${l.unit ?? ''}` : ''} · ${l.status}`; }
  }
}

export function StatusBadge({ entry }: { entry: Entry }) {
  if (entry.status === 'draft') return <Badge tone="amber" icon="rule">Check this</Badge>;
  if (entry.status === 'corrected') return <Badge icon="history">Old version</Badge>;
  if (entry.status === 'entered-in-error') return <Badge icon="block">Mistake</Badge>;
  return <Badge tone="green" icon="check">Confirmed</Badge>;
}

export function SourceBadge({ entry }: { entry: Entry }) {
  if (entry.inference_source === 'on_device') return <Badge tone="navy" icon="memory">Device</Badge>;
  if (entry.inference_source === 'in_cloud') return <Badge tone="blue" icon="cloud">Cloud</Badge>;
  return null;
}

export const isRetired = (e: Entry) => e.status === 'corrected' || e.status === 'entered-in-error';

export function EntryRow({ item }: { item: EntryWithChild }) {
  const { entry } = item;
  const retired = isRetired(entry);
  return (
    <Link to={`/entries/${entry.id}`} className="flex items-center gap-space-md min-h-[60px] px-space-sm py-space-sm border-b border-card-border last:border-0 hover:bg-surface-container-low rounded">
      <span className="w-12 font-code-tabular text-[13px] font-bold text-primary">{hm(entry.care_time)}</span>
      <span className="w-9 h-9 rounded-lg bg-surface-container-low grid place-items-center text-secondary"><Icon name={TYPE_ICON[entry.type]} className="text-[20px]" /></span>
      <span className={`flex-1 min-w-0 truncate font-body-lg text-body-lg ${retired ? 'line-through text-outline' : 'text-on-surface'}`}>{entrySummary(item)}</span>
      <SourceBadge entry={entry} />
      <StatusBadge entry={entry} />
      <Icon name="chevron_right" className="text-outline" />
    </Link>
  );
}
