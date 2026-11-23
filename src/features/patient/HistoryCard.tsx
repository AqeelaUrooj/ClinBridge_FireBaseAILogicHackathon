import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { EntryWithChild } from '../../db/repos/entries';
import type { EntryType, LabEvent, SnapshotResult, VitalSign, WorklistItem } from '../../db/schema';
import { isRetiredStatus } from '../../lib/history';
import { dateTimeLabel, dayLabel, hm } from '../../lib/time';
import { VITAL_RULES, isUnusual, type VitalKey } from '../../lib/vitals';
import { Badge, ButtonLink, Icon } from '../../components/ui';
import { PhotoView } from '../capture/PhotoView';
import { EntryValues } from '../entries/EntryPages';
import { SourceBadge, StatusBadge, TYPE_ICON, TYPE_LABEL, entrySummary } from '../entries/entryView';

/** The page of this patient where the same kind of record lives. */
const HOME: Record<EntryType, [label: string, path: string]> = {
  vital_sign: ['Open vitals', '/vitals'], med_admin: ['Open MAR', '/meds'], note: ['Open notes', '/notes'],
  lab_event: ['Open labs', '/labs'], intake_output: ['Open intake / output', '/io'],
};
const TILE_ICON: Partial<Record<VitalKey, string>> = { temp_c: 'thermometer', heart_rate: 'favorite', resp_rate: 'air', spo2: 'spo2', glucose_mgdl: 'glucose', o2_flow_lpm: 'air', pain_0_10: 'sentiment_stressed' };

function Tile({ label, value, unit, icon, unusual }: { label: string; value: ReactNode; unit?: string; icon?: string; unusual?: boolean }) {
  return (
    <div className={`rounded-lg p-space-sm flex flex-col gap-0.5 ${unusual ? 'bg-downtime-amber-bg border border-downtime-amber-border' : 'bg-surface-container-low border border-transparent'}`}>
      <dt className="flex items-start justify-between gap-1 font-label-uppercase text-label-uppercase text-secondary uppercase">{label}{icon && <Icon name={icon} className="text-[18px]" />}</dt>
      <dd className="font-code-tabular text-[26px] leading-tight font-bold text-primary [overflow-wrap:anywhere]">{value}{unit && <span className="text-body-sm font-normal text-secondary"> {unit}</span>}</dd>
      {unusual && <dd><Badge tone="amber" icon="warning">Unusual</Badge></dd>}
    </div>
  );
}

/** Vital signs of one record as large tiles. "Unusual" is the same draft range the vitals page uses; no other judgement. */
function VitalTiles({ v }: { v: VitalSign }) {
  const keys = (Object.keys(VITAL_RULES) as VitalKey[]).filter((k) => v[k] != null && k !== 'bp_systolic' && k !== 'bp_diastolic');
  const bp = v.bp_systolic != null || v.bp_diastolic != null;
  const unusual = keys.some((k) => isUnusual(k, v[k])) || isUnusual('bp_systolic', v.bp_systolic) || isUnusual('bp_diastolic', v.bp_diastolic);
  return (
    <>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,8.25rem),1fr))] gap-space-sm">
        {bp && <Tile label="Blood pressure" value={`${v.bp_systolic ?? '?'}/${v.bp_diastolic ?? '?'}`} unit="mmHg" icon="speed" unusual={isUnusual('bp_systolic', v.bp_systolic) || isUnusual('bp_diastolic', v.bp_diastolic)} />}
        {keys.map((k) => <Tile key={k} label={VITAL_RULES[k].label} value={v[k] as number} unit={VITAL_RULES[k].unit} icon={TILE_ICON[k]} unusual={isUnusual(k, v[k])} />)}
        {v.weight_kg != null && <Tile label="Weight" value={v.weight_kg} unit="kg" />}
        {v.o2_device && <Tile label="Oxygen given by" value={<span className="text-[17px]">{v.o2_device}</span>} />}
        {v.consciousness && <Tile label="Awake?" value={<span className="text-[17px]">{v.consciousness}</span>} />}
      </dl>
      {unusual && <p className="font-body-sm text-body-sm text-secondary">“Unusual” uses draft ranges that are not clinically approved yet.</p>}
    </>
  );
}

function PaperSource({ item }: { item: EntryWithChild }) {
  const [show, setShow] = useState(false);
  const { entry } = item;
  return (
    <section aria-label="Paper source" className="rounded-lg bg-surface-container-low p-space-sm flex flex-col gap-space-sm">
      <div className="flex flex-wrap items-center gap-space-sm">
        <span className="w-11 h-11 shrink-0 rounded-lg bg-surface-container-highest grid place-items-center text-secondary"><Icon name="image_search" /></span>
        <span className="flex-1 min-w-[11rem]">
          <span className="block font-body-md text-body-md text-on-surface">Paper source <strong className="font-code-tabular text-primary [overflow-wrap:anywhere]">{entry.raw_input_ref}</strong></span>
          <span className="block font-body-sm text-body-sm text-secondary">{entry.photo_check ? (entry.photo_check.readable ? 'Photo check when taken: no problem found.' : `Photo check when taken: ${entry.photo_check.problem.replace('_', ' ')}${entry.photo_check.overridden ? ', the nurse chose to carry on' : ''}.`) : 'No photo check stored.'}</span>
        </span>
        <button type="button" aria-expanded={show} onClick={() => setShow(!show)} className="print:hidden inline-flex items-center gap-2 min-h-11 px-space-md rounded-lg bg-surface-container-lowest border border-outline-variant font-body-md text-body-md font-semibold text-primary hover:bg-surface-container">
          <Icon name={show ? 'visibility_off' : 'visibility'} />{show ? 'Hide paper' : 'Inspect paper'}
        </button>
      </div>
      {show && <PhotoView refId={entry.raw_input_ref} />}
    </section>
  );
}

/** One record: closed it shows what happened; open it shows the values, the paper, who did what, and where to go next. */
export function HistoryCard({ item, open, onToggle, names, work, base, nurse }: {
  item: EntryWithChild; open: boolean; onToggle: () => void; names: Map<string, string>; work?: WorklistItem; base: string; nurse: boolean;
}) {
  const { entry, child } = item;
  const retired = isRetiredStatus(entry.status);
  const critical = !retired && entry.type === 'lab_event' && (child as LabEvent | undefined)?.status === 'critical';
  const lateBy = Math.round((Date.parse(entry.entry_time) - Date.parse(entry.care_time)) / 60_000);
  const who = (id: string) => names.get(id) ?? id;
  const [homeLabel, homePath] = HOME[entry.type];
  const frame = critical ? 'border-2 border-clinical-red-border' : entry.status === 'draft' ? 'border-2 border-downtime-amber-border' : 'border border-card-border';
  return (
    <li className={`break-inside-avoid bg-surface-container-lowest rounded-xl shadow-sm ${frame}`} data-testid={`history-${entry.id}`}>
      <button type="button" aria-expanded={open} aria-controls={`body-${entry.id}`} onClick={onToggle}
        className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:flex items-center gap-2 sm:gap-space-md px-space-md py-space-md text-left hover:bg-surface-container-low rounded-xl">
        <span className={`w-11 h-11 rounded-lg hidden sm:grid place-items-center shrink-0 ${critical ? 'bg-clinical-red-bg text-clinical-red' : 'bg-surface-container text-primary'}`}><Icon name={entry.raw_input_kind === 'photo' ? 'photo_camera' : TYPE_ICON[entry.type]} /></span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-code-tabular text-[15px] font-bold ${critical ? 'text-clinical-red' : 'text-primary'}`}>{hm(entry.care_time)}</span>
            <span className="px-1.5 rounded bg-surface-container font-code-tabular text-[11px] font-semibold text-on-surface-variant [overflow-wrap:anywhere]">#{entry.id.length > 8 ? entry.id.slice(0, 8) : entry.id}</span>
            {critical && <Badge tone="red" icon="priority_high">Critical result</Badge>}
          </span>
          <span className={`block [overflow-wrap:anywhere] font-body-lg text-body-lg font-semibold ${retired ? 'line-through text-outline' : 'text-primary'}`}>{entrySummary(item)}</span>
          <span className="block font-body-sm text-body-sm text-secondary">{TYPE_LABEL[entry.type]} · {who(entry.performer_id)}{entry.raw_input_kind === 'photo' ? ' · from paper photo' : ''}</span>
          {/* Narrow screens: the badges sit under the summary so the row never runs off the screen. */}
          <span className="flex sm:hidden flex-wrap gap-1 mt-1"><SourceBadge entry={entry} /><StatusBadge entry={entry} /></span>
        </span>
        <span className="hidden sm:flex items-center gap-2 shrink-0"><SourceBadge entry={entry} /><StatusBadge entry={entry} /></span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-outline shrink-0" />
      </button>
      {open && (
        <div id={`body-${entry.id}`} className="mx-space-md pb-space-md pt-space-md border-t border-card-border flex flex-col gap-space-sm">
          {entry.type === 'vital_sign' && child ? <VitalTiles v={child as VitalSign} /> : <EntryValues item={item} names={names} />}
          {entry.raw_input_kind === 'photo' && <PaperSource item={item} />}
          <dl aria-label="Sign-off log" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-space-lg gap-y-1 font-body-md text-body-md">
            <dt className="text-secondary">Measured / given</dt><dd className="font-code-tabular">{dateTimeLabel(entry.care_time)}</dd>
            <dt className="text-secondary">Typed in</dt><dd className="font-code-tabular">{dateTimeLabel(entry.entry_time)}{lateBy >= 5 ? ` (${lateBy} min later)` : ''}</dd>
            {entry.confirmed_by && entry.confirmed_at && <><dt className="text-secondary">Confirmed by</dt><dd>{who(entry.confirmed_by)}, <span className="font-code-tabular">{hm(entry.confirmed_at)}</span></dd></>}
            {work && !retired && <><dt className="text-secondary">Recovery check</dt><dd>{work.signed_off_at ? <>Signed off by {who(work.signed_off_by ?? '')}, <span className="font-code-tabular">{hm(work.signed_off_at)}</span></> : 'Not signed off yet'}</dd></>}
            <dt className="text-secondary">Laptop · number</dt><dd className="font-code-tabular">{entry.device_id} · #{entry.counter}</dd>
            {entry.change_reason && <><dt className="text-secondary">{entry.status === 'entered-in-error' ? 'Mistake reason' : 'Fix reason'}</dt><dd>{entry.change_reason}</dd></>}
          </dl>
          <div className="flex flex-wrap gap-space-sm print:hidden">
            {entry.status === 'draft' && nurse && <ButtonLink to={`/capture/${entry.id}/confirm`}><Icon name="fact_check" />Check and confirm</ButtonLink>}
            <ButtonLink variant="secondary" to={`/entries/${entry.id}`}><Icon name="open_in_new" />Open details</ButtonLink>
            <ButtonLink variant="secondary" to={`${base}${homePath}`}><Icon name={TYPE_ICON[entry.type]} />{homeLabel}</ButtonLink>
            {entry.status === 'confirmed' && nurse && <ButtonLink variant="secondary" to={`/entries/${entry.id}/correct`}><Icon name="edit" />Fix</ButtonLink>}
            {nurse && <ButtonLink variant="secondary" to={`${base}/notes/new`}><Icon name="post_add" />Add a note</ButtonLink>}
          </div>
        </div>
      )}
    </li>
  );
}

/** The hospital patient list before the outage, as the last card of the timeline. On paper it is always printed in full. */
export function BaselineCard({ results, open, onToggle }: { results: SnapshotResult[]; open: boolean; onToggle: () => void }) {
  const newest = results[0]!;
  const short = (r: SnapshotResult) => `${r.name} ${r.value_num ?? r.value_text ?? '—'}${r.unit ? ` ${r.unit}` : ''}`;
  const days = new Set(results.map((r) => r.time.slice(0, 10))).size > 1;
  return (
    <section aria-label="Hospital patient list before the outage" className="bg-surface-container-lowest rounded-xl border border-card-border shadow-sm">
      <button type="button" aria-expanded={open} aria-controls="baseline-body" onClick={onToggle} className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:flex items-center gap-2 sm:gap-space-md p-space-md text-left hover:bg-surface-container-low rounded-xl">
        <span className="w-11 h-11 rounded-lg hidden sm:grid place-items-center shrink-0 bg-surface-container text-primary"><Icon name="cloud_download" /></span>
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2"><span className="font-code-tabular text-[15px] font-bold text-primary">{hm(newest.time)}</span><span className="px-1.5 rounded bg-surface-container font-code-tabular text-[11px] font-semibold text-on-surface-variant">{results.length} value{results.length === 1 ? '' : 's'}</span></span>
          <span className="block font-body-lg text-body-lg font-semibold text-primary">Hospital patient list (before the outage)</span>
          <span className="block font-body-sm text-body-sm text-secondary">{results.slice(0, 3).map(short).join(' · ')}{results.length > 3 ? ' …' : ''}</span>
        </span>
        <Badge icon="lock" className="justify-self-start">Read only</Badge>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-outline shrink-0 max-sm:row-start-1 max-sm:col-start-2" />
      </button>
      <div id="baseline-body" className={`mx-space-md pb-space-md pt-space-sm border-t border-card-border flex-col gap-1 ${open ? 'flex' : 'hidden print:flex'}`}>
        <p className="font-body-sm text-body-sm text-secondary">Copied from the hospital system when the patient list was taken; not entered on this laptop.</p>
        <ul className="flex flex-col">
          {results.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-space-md gap-y-1 min-h-[40px] border-b border-card-border last:border-0 px-space-sm py-1">
              <span className="w-24 font-code-tabular text-[13px] text-secondary">{hm(r.time)}{days ? ` ${dayLabel(r.time).replace(/ \d{4}$/, '')}` : ''}</span>
              <span className="flex-1 min-w-[8rem]">{r.name}</span>
              <span className="flex items-center gap-2 font-code-tabular font-semibold">{r.value_num ?? r.value_text ?? '—'} {r.unit ?? ''}{r.abnormal_flag && r.abnormal_flag !== 'normal' && <Badge tone={r.abnormal_flag === 'critical' ? 'red' : 'amber'}>{r.abnormal_flag}</Badge>}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A row of the actions card. */
export function ActionRow({ to, icon, label, dark }: { to: string; icon: string; label: string; dark?: boolean }) {
  return (
    <Link to={to} className={`flex items-center gap-space-sm min-h-11 px-space-md rounded-lg font-body-md text-body-md font-semibold ${dark ? 'bg-primary text-on-primary hover:bg-primary-container' : 'bg-surface-container-low text-primary hover:bg-surface-container'}`}>
      <Icon name={icon} /><span className="flex-1">{label}</span><Icon name="chevron_right" className="text-[20px]" />
    </Link>
  );
}
