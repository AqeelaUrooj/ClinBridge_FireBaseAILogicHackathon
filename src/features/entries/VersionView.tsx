import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import type { EntryWithChild } from '../../db/repos/entries';
import { legacyReason } from '../../db/db';
import { verifyChain } from '../../db/audit';
import { useApp } from '../../state/app';
import { auditIcon, auditLabel } from '../../lib/auditLabels';
import { dateTimeLabel, hm } from '../../lib/time';
import { Icon } from '../../components/ui';
import { StatusBadge } from './entryView';
import { entryDiff, entryFields } from './entryDiff';

const PANEL = 'min-w-0 bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-md flex flex-col gap-space-sm break-inside-avoid print:shadow-none print:border-black';

/** The reason stored with a fix or a mistake, also from older records. */
export const reasonOf = (x: EntryWithChild): string | null => x.entry.change_reason ?? legacyReason(x.entry);

/** Field-by-field changes, with the care time when it was moved. */
export function diffRows(before: EntryWithChild, after: EntryWithChild, names: Map<string, string>) {
  const rows = entryDiff(after.entry.type, before.child, after.child, names);
  return before.entry.care_time === after.entry.care_time ? rows : [...rows, { key: 'care_time', label: 'Measured / given', before: dateTimeLabel(before.entry.care_time), after: dateTimeLabel(after.entry.care_time) }];
}

/** One version: the changed values first and large, then the rest. */
function VersionColumn({ item, changed, side, names }: { item: EntryWithChild; changed: Set<string>; side: 'before' | 'after'; names: Map<string, string> }) {
  const { entry } = item;
  const fields = entryFields(entry.type, item.child, names);
  const big = fields.filter((f) => changed.has(f.key)), rest = fields.filter((f) => !changed.has(f.key));
  const old = side === 'before';
  return (
    <section aria-label={old ? 'Before the fix' : 'After the fix'} className={PANEL}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-headline-sm text-headline-sm text-primary flex flex-wrap items-center gap-2"><Link to={`/entries/${entry.id}`} className="font-code-tabular hover:underline">#{entry.id.slice(0, 8)}</Link><StatusBadge entry={entry} /></h2>
        <span className="font-code-tabular text-body-sm text-secondary">Typed {hm(entry.entry_time)} · care {hm(entry.care_time)}</span>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-sm gap-y-0.5 rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm"><dt className="text-secondary">By</dt><dd className="font-semibold text-primary">{names.get(entry.performer_id) ?? entry.performer_id}</dd><dt className="text-secondary">Laptop · number</dt><dd className="font-code-tabular">{entry.device_id} · #{entry.counter}</dd></dl>
      {big.length > 0 && (
        <dl className="flex flex-col gap-1.5">
          {big.map((f) => <div key={f.key} className={`rounded-lg p-space-sm border-2 ${old ? 'bg-error-container border-clinical-red-border' : 'bg-surface-container-low border-sync-green'}`}><dt className="font-label-uppercase text-label-uppercase uppercase text-on-surface-variant">{f.label}</dt><dd className={`font-code-tabular text-[24px] leading-tight font-bold [overflow-wrap:anywhere] whitespace-pre-wrap ${old ? 'line-through text-clinical-red' : 'text-primary'} ${f.value.length > 24 ? '!text-[16px]' : ''}`}>{f.value}</dd></div>)}
        </dl>
      )}
      <dl className="grid grid-cols-2 gap-1.5">
        {rest.map((f) => <div key={f.key} className={`min-w-0 rounded-lg bg-surface-container-low p-space-sm ${f.value.length > 24 ? 'col-span-2' : ''}`}><dt className="font-label-uppercase text-label-uppercase uppercase text-secondary">{f.label}</dt><dd className={`font-code-tabular text-body-lg font-semibold [overflow-wrap:anywhere] whitespace-pre-wrap ${old ? 'text-on-surface-variant' : 'text-primary'}`}>{f.value}</dd></div>)}
      </dl>
    </section>
  );
}

/** Old version, what changed, new version (Stitch "Entry detail, versioned correction"). */
export function VersionCompare({ before, after, names }: { before: EntryWithChild; after: EntryWithChild; names: Map<string, string> }) {
  const rows = diffRows(before, after, names);
  const changed = new Set(rows.map((r) => r.key));
  const reason = reasonOf(after);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md items-start">
      <VersionColumn item={before} changed={changed} side="before" names={names} />
      <section aria-label="What changed" className={PANEL}>
        <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="swap_horiz" />What changed</h2>
        {rows.length === 0 ? <p className="font-body-md text-body-md text-secondary">The values are the same in both versions.</p> : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((r) => <li key={r.key} className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md [overflow-wrap:anywhere]"><span className="block font-semibold text-primary">{r.label}</span><s className="text-clinical-red whitespace-pre-wrap">{r.before}</s> <span aria-hidden>→</span><span className="sr-only"> is now </span> <strong className="text-primary whitespace-pre-wrap">{r.after}</strong></li>)}
          </ul>
        )}
        <dl className="flex flex-col gap-1.5 font-body-md text-body-md">
          <div className="rounded-lg bg-surface-container-low p-space-sm"><dt className="font-label-uppercase text-label-uppercase uppercase text-secondary">{after.entry.status === 'entered-in-error' ? 'Mistake reason' : 'Fix reason'}</dt><dd className="text-primary [overflow-wrap:anywhere]">{reason ?? 'No reason stored'}</dd></div>
          <div className="rounded-lg bg-surface-container-low p-space-sm"><dt className="font-label-uppercase text-label-uppercase uppercase text-secondary">Fixed by</dt><dd className="text-primary flex flex-wrap justify-between gap-2"><strong>{names.get(after.entry.performer_id) ?? after.entry.performer_id}</strong><span className="font-code-tabular">{dateTimeLabel(after.entry.entry_time)}</span></dd></div>
        </dl>
        <p className="font-body-sm text-body-sm text-secondary">ClinBridge has no second signature on a fix, so none is shown.</p>
      </section>
      <VersionColumn item={after} changed={changed} side="after" names={names} />
    </div>
  );
}

/** The change-log rows of every version of one record, and whether the whole log is intact. */
export function VersionLog({ chain, names }: { chain: EntryWithChild[]; names: Map<string, string> }) {
  const { db } = useApp();
  const ids = chain.map((x) => x.entry.id).join(',');
  const log = useLiveQuery(async () => {
    const all = await db.audit_log.orderBy('seq').toArray();
    const want = new Set(ids.split(',').map((i) => `entry/${i}`));
    return { rows: all.filter((r) => want.has(r.entity)), chain: await verifyChain(all) };
  }, [db, ids]);
  return (
    <section aria-label="Change log of this record" className={PANEL}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="verified_user" />Change log of this record</h2>
        {log && <span className={`px-2 py-0.5 rounded font-label-badge text-label-badge font-bold ${log.chain.ok ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-error text-on-error'}`}>{log.chain.ok ? `Log intact, ${log.chain.total} rows` : `Log broken at row ${log.chain.brokenAtSeq}`}</span>}
      </div>
      {!log ? <p role="status">Loading…</p> : log.rows.length === 0 ? <p className="font-body-md text-body-md text-secondary">No change-log rows for this record.</p> : (
        <ol className="flex flex-col gap-1.5">
          {log.rows.map((r) => (
            <li key={r.id} className="rounded-lg bg-surface-container-low p-space-sm flex flex-wrap items-center gap-x-space-md gap-y-1 font-body-md text-body-md">
              <Icon name={auditIcon(r.action)} className="text-[20px] text-secondary" />
              <span className="font-code-tabular font-bold text-primary w-16">Row {r.seq}</span>
              <span className="flex-1 min-w-[10rem]"><strong className="text-primary">{auditLabel(r.action)}</strong> <span className="font-code-tabular text-body-sm text-secondary">#{r.entity.replace('entry/', '').slice(0, 8)}</span></span>
              <span className="text-on-surface-variant">{names.get(r.user_id) ?? r.user_id}</span>
              <span className="font-code-tabular text-body-sm text-secondary">{dateTimeLabel(r.time)}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="font-body-sm text-body-sm text-secondary">No record is deleted or overwritten: a fix is a new version and the old one stays. The log shows that its own rows are unbroken; it does not show who was at the bedside.</p>
    </section>
  );
}
