import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { useApp, useSession } from '../../state/app';
import { dateTimeLabel, dayLabel, hm, sinceText } from '../../lib/time';
import { Badge, Button, ButtonLink, EmptyState, Icon } from '../../components/ui';
import { TYPE_LABEL } from '../entries/entryView';
import { EnrollLaptopCard } from './EnrollmentUi';
import { Block, Facts, Head, PANEL, Tile } from './adminUi';

/** Laptops (Stitch "Workstation nodes"). ClinBridge has no network between laptops, so nothing here is live from another one. */
export function DevicesPage() {
  const { db, deviceId, clock, dataset, vault } = useApp();
  const { lock } = useSession();
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const [devices, entries, work] = await Promise.all([db.device.toArray(), db.entry.toArray(), db.worklist_item.toArray()]);
    return { devices, entries, clash: new Set(work.filter((w) => w.flags.includes('time_conflict')).map((w) => w.entry_id)) };
  }, [db]);
  if (!data) return <p role="status">Loading…</p>;
  const { devices, entries, clash } = data;
  const now = clock.nowIso();
  const name = new Map(devices.map((d) => [d.id, d.label]));
  const checks = devices.map((d) => d.last_clock_sync).filter((t): t is string => !!t).sort();
  const newest = [...entries].sort((a, b) => b.entry_time.localeCompare(a.entry_time)).slice(0, 6);
  const me = devices.find((d) => d.id === deviceId);
  return (
    <div className="flex flex-col gap-space-md">
      <Head label="Laptops" title="Laptops"
        badges={<>{me && <Badge icon="domain">{me.unit}</Badge>}<Badge icon="link_off">No link between laptops</Badge></>}
        text="Laptops known to this one. Each keeps its own records. Nothing on this page comes live from another laptop."
        actions={<><ButtonLink variant="secondary" to="/admin"><Icon name="monitor_heart" />Check this laptop</ButtonLink><Button onClick={() => { lock(); navigate('/lock'); }}><Icon name="lock" />Lock this screen</Button></>} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        <Tile label="Laptops known" icon="laptop_windows" value={devices.length} foot={devices.map((d) => d.label.split(' (')[0]).join(', ') || 'None'} />
        <Tile label="Records here" icon="receipt_long" value={entries.length} unit="records" foot={`${entries.filter((e) => e.device_id === deviceId).length} made on this laptop`} />
        <Tile label="Oldest clock check" icon="schedule" value={checks[0] ? dayLabel(checks[0]).replace(/ \d{4}$/, '') : '—'} unit={checks[0] ? hm(checks[0]) : ''} foot={checks[0] ? `${sinceText(checks[0], now)} ago. A wrong clock shows up in Recovery.` : 'No clock check recorded'} />
        <Tile label="Time conflicts" icon="running_with_errors" value={clash.size} unit="in recovery" foot="Records with that flag on the recovery worklist" tone={clash.size ? 'amber' : undefined} />
      </div>

      <ul aria-label="Laptops" className="grid grid-cols-1 lg:grid-cols-2 gap-space-md items-stretch">
        {devices.map((d) => {
          const mine = entries.filter((e) => e.device_id === d.id);
          const counters = mine.map((e) => e.counter);
          const last = mine.reduce<string | null>((m, e) => (!m || e.entry_time > m ? e.entry_time : m), null);
          const here = d.id === deviceId;
          return (
            <li key={d.id} className={`${PANEL} !p-0 overflow-hidden flex flex-col`}>
              <div className="bg-surface-container-low p-space-md flex flex-wrap items-center justify-between gap-space-sm">
                <div className="flex items-center gap-space-sm min-w-0"><span className={`w-11 h-11 rounded-lg grid place-items-center shrink-0 ${here ? 'bg-primary-container text-on-primary' : 'bg-secondary text-on-secondary'}`}><Icon name="laptop_windows" /></span><div className="min-w-0"><h3 className="font-headline-sm text-headline-sm text-primary [overflow-wrap:anywhere]">{d.label}</h3><p className="font-body-sm text-body-sm text-on-surface-variant">{d.id} · {d.unit}</p></div></div>
                {here ? <Badge tone="navy">This laptop</Badge> : <Badge>Other laptop, not seen live</Badge>}
              </div>
              <div className="p-space-md flex flex-col gap-space-sm flex-1">
                <Facts rows={[
                  ['Clock check', d.last_clock_sync ? `${dateTimeLabel(d.last_clock_sync)} (${sinceText(d.last_clock_sync, now)} ago)` : 'Not recorded'],
                  ['Records from it, kept here', mine.length],
                  ['Drafts among them', mine.filter((e) => e.status === 'draft').length],
                  ['Counter', counters.length ? `${Math.min(...counters)} to ${Math.max(...counters)}` : 'None'],
                  ['Newest record', last ? dateTimeLabel(last) : 'None'],
                  ['Time conflicts', mine.filter((e) => clash.has(e.id)).length],
                ]} />
                <p className="font-body-sm text-body-sm text-secondary mt-auto">{here ? (vault === 'unlocked' ? 'Records on this laptop are encrypted and open now.' : 'Records on this laptop are not encrypted.') : 'Whether it is on, charged or connected is not known here.'}</p>
              </div>
            </li>
          );
        })}
      </ul>
      {devices.length === 0 && <EmptyState text="No laptop is registered" />}

      <section aria-label="Newest records" className={`${PANEL} flex flex-col gap-space-sm`}>
        <h3 className="font-headline-sm text-headline-sm text-primary">Newest records and the laptop they were made on</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Each record keeps its laptop and a counter, so clock problems can be found in Recovery.</p>
        <ul aria-label="Newest records" className="rounded-lg bg-primary-container text-on-primary p-space-sm flex flex-col">
          {newest.map((e) => <li key={e.id} className="grid grid-cols-[5rem_minmax(0,1fr)] sm:grid-cols-[5rem_minmax(0,1.2fr)_minmax(0,1fr)_7rem] gap-x-space-sm py-1.5 border-b border-white/10 last:border-0 font-body-md text-body-md"><span className="font-code-tabular font-bold">{hm(e.entry_time)}</span><span className="min-w-0 [overflow-wrap:anywhere]">{TYPE_LABEL[e.type]} {e.id.slice(0, 8)}</span><span className="col-start-2 sm:col-start-auto min-w-0 [overflow-wrap:anywhere]">{name.get(e.device_id) ?? e.device_id}</span><span className="col-start-2 sm:col-start-auto font-code-tabular opacity-90">counter {e.counter}</span></li>)}
          {newest.length === 0 && <li>No records yet.</li>}
        </ul>
      </section>

      {dataset === 'live' ? <EnrollLaptopCard /> : (
        <Block title="Add another laptop" icon="add_to_queue" text="Works only in Real records: an admin makes an encrypted enrollment file with the staff list, and the new laptop gets its own passphrase and key. No PINs, patients or keys are in the file." />
      )}
    </div>
  );
}
