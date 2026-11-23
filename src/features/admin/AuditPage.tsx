import { useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { GENESIS_HASH, rowHash, verifyChain } from '../../db/audit';
import type { AuditLog } from '../../db/schema';
import { useApp, useSession } from '../../state/app';
import { auditGroup, auditIcon, auditLabel, type AuditGroup } from '../../lib/auditLabels';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { Badge, Button, ButtonLink, EmptyState, Icon } from '../../components/ui';
import { TYPE_LABEL } from '../entries/entryView';

const PANEL = 'min-w-0 bg-surface-container-lowest rounded-xl border border-card-border shadow-sm p-space-md';
const STEP = 40;
type Tab = 'all' | AuditGroup;
const TABS: { v: Tab; label: string }[] = [{ v: 'all', label: 'All rows' }, { v: 'records', label: 'Records' }, { v: 'second_look', label: 'Second look' }, { v: 'sign_off', label: 'Sign-offs' }, { v: 'system', label: 'System' }];
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

function Tile({ label, icon, value, unit, foot }: { label: string; icon: string; value: ReactNode; unit?: string; foot: ReactNode }) {
  return (
    <div className={`${PANEL} flex flex-col gap-1`}>
      <p className="flex items-center justify-between gap-2 font-label-uppercase text-label-uppercase text-secondary uppercase">{label}<Icon name={icon} className="text-[20px]" /></p>
      <p className="font-code-tabular text-[30px] leading-tight font-bold text-primary">{value}{unit && <span className="text-body-sm font-normal text-secondary"> {unit}</span>}</p>
      <p className="rounded bg-surface-container-low px-2 py-1 font-body-sm text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{foot}</p>
    </div>
  );
}

/** Change log (Stitch "Cryptographic audit log"). Read only. Names come from the staff list; records open through the patient check. */
export function AuditPage() {
  const { db, event, clock, dataset } = useApp();
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState(STEP);
  const [pick, setPick] = useState<number | null>(null);
  const [check, setCheck] = useState(0);
  const inspector = useRef<HTMLElement>(null);
  // Narrow screens: the inspector sits above the list, so bring it into view.
  const choose = (seq: number) => {
    const on = pick !== seq;
    setPick(on ? seq : null);
    if (on && window.innerWidth < 1280) requestAnimationFrame(() => inspector.current?.scrollIntoView({ block: 'center' }));
  };
  const data = useLiveQuery(async () => {
    const rows = await db.audit_log.orderBy('seq').toArray();
    const staff = new Map((await db.practitioner.toArray()).map((p) => [p.id, p]));
    const kinds = new Map((await db.entry.toArray()).map((e) => [`entry/${e.id}`, TYPE_LABEL[e.type]]));
    const laptops = new Map((await db.device.toArray()).map((d) => [d.id, d.label]));
    return { rows, staff, kinds, laptops, chain: await verifyChain(rows), at: check };
  }, [db, check]);
  const row = data?.rows.find((r) => r.seq === pick) ?? null;
  const own = useLiveQuery(async () => (row ? await rowHash(row) : null), [row?.id, row?.after_hash]);
  if (!data) return <p role="status">Loading…</p>;
  const { rows, staff, kinds, laptops, chain } = data;
  const who = (id: string) => staff.get(id)?.name ?? id;
  const what = (r: AuditLog) => (kinds.has(r.entity) ? `${kinds.get(r.entity)} ${r.entity.replace('entry/', '').slice(0, 8)}` : r.entity);
  const needle = q.trim().toLowerCase();
  const match = (r: AuditLog) => !needle || [String(r.seq), who(r.user_id), auditLabel(r.action), r.action, r.entity, what(r), r.after_hash, r.device_id].some((t) => t.toLowerCase().includes(needle));
  const hits = rows.filter((r) => (tab === 'all' || auditGroup(r.action) === tab) && (!action || r.action === action) && match(r)).reverse();
  const shown = hits.slice(0, limit);
  const people = [...new Set(rows.map((r) => r.user_id))];
  const prev = row ? rows.find((r) => r.seq === row.seq - 1) : undefined;
  const next = row ? rows.find((r) => r.seq === row.seq + 1) : undefined;
  const entryId = row && kinds.has(row.entity) ? row.entity.replace('entry/', '') : null;
  const grid = 'xl:grid-cols-[4.5rem_6.5rem_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_8.5rem]';
  return (
    <div className="flex flex-col gap-space-md">
      <p className="hidden print:block border-b border-black pb-1 text-[9pt]"><strong>Change log, {TABS.find((t) => t.v === tab)!.label}</strong> · printed by {user?.name} · {dateTimeLabel(clock.nowIso())}{dataset === 'practice' ? ' · Fake practice data, not a clinical record' : ''}</p>
      <section aria-label="Change log status" className={`${PANEL} flex flex-wrap items-center justify-between gap-space-md`}>
        <div className="min-w-0">
          <h2 className="font-headline-md text-headline-md text-primary flex flex-wrap items-center gap-2">Change log <Badge tone={chain.ok ? 'green' : 'red'} icon={chain.ok ? 'verified' : 'gpp_bad'}>{chain.ok ? `All ${chain.total} rows verified` : `Broken at row ${chain.brokenAtSeq}`}</Badge></h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Each row holds the fingerprint (SHA-256) of the row before it, so an edited or missing row shows. It is evidence on this laptop, not proof against someone who controls the laptop.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="secondary" onClick={() => setCheck((n) => n + 1)}><Icon name="fact_check" />Check again</Button>
          <Button variant="secondary" onClick={() => window.print()}><Icon name="print" />Print rows shown</Button>
        </div>
        {data.at > 0 && <p role="status" className="basis-full font-body-sm text-body-sm text-on-surface-variant print:hidden">Checked again at {hm(clock.nowIso())}: {chain.verified} of {chain.total} rows follow from the row before.</p>}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md print:hidden">
        <Tile label="Rows in the log" icon="receipt_long" value={rows.length} unit="rows" foot={rows.length ? `Row ${rows[0]!.seq} to ${rows[rows.length - 1]!.seq}` : 'Empty'} />
        <Tile label="Chain" icon="link" value={chain.ok ? 0 : 1} unit={chain.ok ? 'broken links' : 'broken link'} foot={chain.ok ? `${chain.verified} of ${chain.total} verified` : `First at row ${chain.brokenAtSeq}`} />
        <Tile label="People in the log" icon="how_to_reg" value={people.length} unit={people.length === 1 ? 'person' : 'people'} foot={people.map(who).slice(0, 3).join(', ') + (people.length > 3 ? ' …' : '')} />
        <Tile label="Network" icon="cloud_sync" value={event?.network_cleared_at ? hm(event.network_cleared_at) : '—'} unit={event?.network_cleared_at ? 'cleared' : ''} foot={event?.network_cleared_at ? `By ${event.cleared_by ? who(event.cleared_by) : '—'}, ${dayLabel(event.network_cleared_at)}` : 'Not cleared'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-space-md items-start print:block">
        <section aria-label="Change log rows" className={`${PANEL} flex flex-col gap-space-sm print:border-0 print:p-0 print:shadow-none`}>
          <div className="flex flex-wrap items-center gap-space-sm print:hidden">
            <label className="flex-1 min-w-[min(100%,15rem)] flex items-center gap-2 h-11 rounded-lg bg-surface-container-low px-space-sm"><Icon name="search" className="text-secondary" /><span className="sr-only">Search the change log</span><input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(STEP); }} placeholder="Row, person, action, record or fingerprint" className="flex-1 min-w-0 bg-transparent outline-none font-body-md text-body-md" /></label>
            <select value={action} onChange={(e) => { setAction(e.target.value); setLimit(STEP); }} aria-label="Filter by action" className="h-11 max-w-full rounded-lg border border-card-border px-2 bg-surface-container-lowest font-body-md text-body-md"><option value="">All actions</option>{[...new Set(rows.map((r) => r.action))].sort((a, b) => auditLabel(a).localeCompare(auditLabel(b))).map((a) => <option key={a} value={a}>{auditLabel(a)}</option>)}</select>
            <p className="font-body-sm text-body-sm text-secondary">Showing {shown.length} of {hits.length}</p>
          </div>
          <div role="group" aria-label="Row type" className="flex flex-wrap gap-1 print:hidden">
            {TABS.map((t) => <button key={t.v} type="button" aria-pressed={tab === t.v} onClick={() => { setTab(t.v); setLimit(STEP); }} className={`min-h-11 px-3 rounded-lg font-body-md text-body-md font-semibold ${tab === t.v ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>{t.label} ({t.v === 'all' ? rows.length : rows.filter((r) => auditGroup(r.action) === t.v).length})</button>)}
          </div>
          <div aria-hidden className={`hidden xl:grid ${grid} gap-space-sm px-space-sm py-2 rounded-lg bg-surface-container-low font-label-uppercase text-label-uppercase text-secondary uppercase`}><span>Row</span><span>Time</span><span>Person</span><span>Action</span><span>What</span><span>Fingerprint</span></div>
          {shown.length === 0 ? <EmptyState text="No rows here" /> : (
            <ul aria-label="Rows" className="flex flex-col">
              {shown.map((r) => (
                <li key={r.id} className="break-inside-avoid border-b border-card-border last:border-0">
                  <button type="button" aria-pressed={pick === r.seq} onClick={() => choose(r.seq)} className={`w-full text-left grid grid-cols-[4.5rem_minmax(0,1fr)] ${grid} gap-x-space-sm gap-y-0.5 items-center px-space-sm py-2 rounded ${pick === r.seq ? 'bg-surface-container' : chain.brokenAtSeq === r.seq ? 'bg-error-container' : 'hover:bg-surface-container-low'}`}>
                    <span className="font-code-tabular font-bold text-primary">#{r.seq}</span>
                    <span className="font-code-tabular text-body-sm text-on-surface">{hm(r.time)} <span className="text-secondary">{dayLabel(r.time).replace(/ \d{4}$/, '')}</span></span>
                    <span className="col-start-2 xl:col-start-auto min-w-0 font-body-md text-body-md [overflow-wrap:anywhere]">{who(r.user_id)}{staff.get(r.user_id) && <span className="text-body-sm text-secondary"> {staff.get(r.user_id)!.role}</span>}</span>
                    <span className="col-start-2 xl:col-start-auto min-w-0 flex items-center gap-1 font-body-md text-body-md font-semibold text-primary [overflow-wrap:anywhere]"><Icon name={auditIcon(r.action)} className="text-[18px] text-secondary shrink-0" />{auditLabel(r.action)}</span>
                    <span className="col-start-2 xl:col-start-auto min-w-0 font-code-tabular text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{what(r)}</span>
                    <span className="col-start-2 xl:col-start-auto font-code-tabular text-body-sm text-secondary">{short(r.after_hash)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hits.length > limit && <Button variant="secondary" className="self-center print:hidden" onClick={() => setLimit((n) => n + STEP)}>Show {Math.min(STEP, hits.length - limit)} more</Button>}
          <p className="font-body-sm text-body-sm text-secondary">Read only. Rows store fingerprints (hashes) of the data, never PINs and never the values themselves.</p>
        </section>

        <section ref={inspector} aria-label="Row inspector" className={`${PANEL} ${row ? 'flex order-first xl:order-none' : 'hidden xl:flex'} flex-col gap-space-sm xl:sticky xl:top-[calc(var(--header-h)+16px)] print:hidden`}>
          <h2 className="font-headline-sm text-headline-sm text-primary flex items-center gap-2"><Icon name="policy" />Row inspector</h2>
          {!row ? <p className="font-body-md text-body-md text-secondary">Pick a row to see its fingerprints and how it is linked.</p> : (
            <>
              <dl className="rounded-lg bg-surface-container-low p-space-sm grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-sm gap-y-1 font-body-md text-body-md"><dt className="text-secondary">Row</dt><dd className="font-code-tabular font-bold text-primary">#{row.seq}</dd><dt className="text-secondary">Action</dt><dd className="font-semibold text-primary">{auditLabel(row.action)} <span className="font-code-tabular text-body-sm text-secondary [overflow-wrap:anywhere]">{row.action}</span></dd><dt className="text-secondary">What</dt><dd className="[overflow-wrap:anywhere]">{what(row)}</dd><dt className="text-secondary">Person</dt><dd>{who(row.user_id)}</dd><dt className="text-secondary">Time</dt><dd className="font-code-tabular">{dateTimeLabel(row.time)}</dd><dt className="text-secondary">Laptop</dt><dd className="[overflow-wrap:anywhere]">{laptops.get(row.device_id) ?? row.device_id}</dd></dl>
              <Hash label="Link to the row before" note={row.prev_row_hash === GENESIS_HASH ? 'First row of the log' : prev ? `Row ${prev.seq}` : 'The row before is missing'} value={row.prev_row_hash} />
              {row.before_hash && <Hash label="Data before" note="Fingerprint" value={row.before_hash} />}
              <Hash label="Data in this row" note="Fingerprint" value={row.after_hash} />
              <Hash label="This row" note={!own ? 'Working it out…' : !next ? 'Newest row: the next one will hold this' : next.prev_row_hash === own ? `Row ${next.seq} holds the same value` : `Row ${next.seq} holds a different value`} value={own ?? ''} bad={!!own && !!next && next.prev_row_hash !== own} />
              {entryId && <ButtonLink variant="secondary" to={`/entries/${entryId}`}><Icon name="open_in_new" />Open the record</ButtonLink>}
              {!next && <p className="font-body-sm text-body-sm text-secondary">An edit to the newest row shows only after another row is added.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Hash({ label, note, value, bad }: { label: string; note: string; value: string; bad?: boolean }) {
  return (
    <div className={`rounded-lg p-space-sm ${bad ? 'bg-error-container' : 'bg-surface-container-low'}`}>
      <p className="flex flex-wrap items-center justify-between gap-x-2 font-label-uppercase text-label-uppercase uppercase text-secondary">{label}<span className={`font-body-sm text-body-sm normal-case ${bad ? 'text-clinical-red font-bold' : ''}`}>{note}</span></p>
      <p className="mt-1 rounded bg-surface-container-lowest p-1.5 font-code-tabular text-[12px] break-all text-primary">{value}</p>
    </div>
  );
}
