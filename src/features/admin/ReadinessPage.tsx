import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../state/app';
import { verifyChain } from '../../db/audit';
import { SECURITY_POLICY } from '../../config/securityPolicy';
import { PHASE_LABEL } from '../../lib/phase';
import { dateTimeLabel, hm, sinceText } from '../../lib/time';
import { auditLabel } from '../../lib/auditLabels';
import { Badge, Button, ButtonLink, Icon } from '../../components/ui';
import { Block, Counts, Facts, Head, PANEL, Tile, saveJson } from './adminUi';

type Ok = boolean | null;
interface Item { id: string; ok: Ok; label: string; detail: string }

/** What this browser can tell about the laptop. Read again on demand; nothing is probed on the network. */
export function useBrowser(n = 0) {
  const [online, setOnline] = useState(navigator.onLine);
  const [sw, setSw] = useState<Ok>(null);
  const [persisted, setPersisted] = useState<Ok>(null);
  const [quota, setQuota] = useState<{ used: number; total: number } | null>(null);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on();
    addEventListener('online', on); addEventListener('offline', on);
    void navigator.serviceWorker?.getRegistration().then((r) => setSw(!!r?.active)).catch(() => setSw(false));
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    void navigator.storage?.estimate?.().then((e) => setQuota({ used: e.usage ?? 0, total: e.quota ?? 0 })).catch(() => undefined);
    return () => { removeEventListener('online', on); removeEventListener('offline', on); };
  }, [n]);
  return { online, sw, persisted, quota };
}

/** Readiness (Stitch "Readiness, storage telemetry"). Only what this browser and this laptop's records can show. */
export function ReadinessPage() {
  const { db, clock, phase, event, snapshot, deviceId, vault, dataset } = useApp();
  const [n, setN] = useState(0);
  const { online, sw, persisted, quota } = useBrowser(n);
  const ai = typeof (globalThis as { LanguageModel?: unknown }).LanguageModel !== 'undefined';
  const camera = typeof navigator.mediaDevices?.getUserMedia === 'function';
  const data = useLiveQuery(async () => {
    const rows = await db.audit_log.orderBy('seq').toArray();
    const staff = await db.practitioner.toArray();
    const entries = await db.entry.toArray();
    return {
      chain: await verifyChain(rows), last: rows[rows.length - 1], names: new Map(staff.map((p) => [p.id, p.name])),
      devices: await db.device.toArray(), entries: entries.length, perDevice: (id: string) => entries.filter((e) => e.device_id === id).length,
      staff: staff.filter((p) => p.active).length, drafts: entries.filter((e) => e.status === 'draft').length,
      open: await db.worklist_item.filter((w) => !w.signed_off_at).count(),
      patients: await db.patient.count(), orders: await db.active_order.count(), results: await db.snapshot_result.count(), at: clock.nowIso(), run: n,
    };
  }, [db, n]);
  if (!data) return <p role="status">Loading…</p>;
  const now = clock.nowIso();
  const device = data.devices.find((d) => d.id === deviceId);
  const ageH = snapshot ? (clock.now() - Date.parse(snapshot.taken_at)) / 3_600_000 : null;
  const share = quota && quota.total ? quota.used / quota.total : null;
  const mb = (b: number) => (b / 1e6 < 10 ? (b / 1e6).toFixed(1) : (b / 1e6).toFixed(0));
  const items: Item[] = [
    { id: 'offline', ok: sw, label: 'Works offline', detail: sw ? 'App is stored on this laptop (service worker active).' : 'Open the app once while online to store it.' },
    { id: 'network', ok: online ? true : null, label: online ? 'Network: connected' : 'Network: offline', detail: online ? 'Cloud features are still only allowed in Back online.' : 'Offline work is fine; everything saves on this laptop.' },
    { id: 'kept', ok: persisted, label: 'Storage kept by the browser', detail: persisted ? 'The browser will not clear this data on its own.' : 'Not guaranteed. Avoid clearing browser data.' },
    { id: 'space', ok: share == null ? null : share < 0.8, label: 'Storage space', detail: quota ? `${(quota.used / 1e6).toFixed(1)} MB used of ${(quota.total / 1e9).toFixed(1)} GB` : 'Not reported by this browser.' },
    { id: 'laptop', ok: device ? true : null, label: 'Laptop registered', detail: device ? `${device.label} · last clock check ${dateTimeLabel(device.last_clock_sync) || 'not recorded'}` : 'This laptop is not in the device list.' },
    { id: 'list', ok: ageH != null && ageH < 24, label: 'Patient list', detail: snapshot ? `Taken ${dateTimeLabel(snapshot.taken_at)} (${ageH!.toFixed(0)} h old) from ${snapshot.source_system}` : 'No patient list loaded.' },
    { id: 'log', ok: data.chain.ok, label: 'Change log', detail: `${data.chain.verified} of ${data.chain.total} rows verified` },
    { id: 'staff', ok: data.staff > 0, label: 'Active staff', detail: `${data.staff} people can sign in` },
    { id: 'drafts', ok: data.drafts === 0 ? true : null, label: 'Drafts waiting', detail: `${data.drafts} records still need checking` },
    { id: 'worklist', ok: data.open === 0 ? true : null, label: 'Worklist', detail: `${data.open} items not signed off` },
  ];
  const good = items.filter((i) => i.ok === true).length;
  const bad = items.filter((i) => i.ok === false).length;
  const save = () => saveJson(`clinbridge-readiness-${now.slice(0, 16).replace(/[:T]/g, '-')}.json`, {
    made_at: now, laptop: device?.label ?? null, records: dataset === 'practice' ? 'Practice, fake patients' : 'Real records', mode: PHASE_LABEL[phase],
    note: 'No patient and no staff names. What this browser and this laptop report; not a hardware test.',
    checks: items.map(({ label, ok, detail }) => ({ check: label, result: ok === true ? 'ok' : ok === false ? 'warning' : 'look', detail })), browser: navigator.userAgent,
  });
  return (
    <div className="flex flex-col gap-space-md">
      <Head label="Readiness" title="Readiness and storage"
        badges={<><Badge tone={bad ? 'amber' : 'green'} icon={bad ? 'warning' : 'check_circle'}>{bad ? `${bad} ${bad === 1 ? 'warning' : 'warnings'}` : 'No warning'}</Badge><Badge tone={phase === 'down' ? 'amber' : 'neutral'}>{PHASE_LABEL[phase]}</Badge>{event && <Badge tone={phase === 'down' ? 'amber' : 'neutral'} icon="timer">Downtime open {sinceText(event.declared_at, now)}</Badge>}</>}
        text={<>{device ? <strong className="text-primary">{device.label}</strong> : 'This laptop'}{device ? ` · ${device.unit}` : ''} · {good} of {items.length} checks are fine</>}
        actions={<><Button variant="secondary" onClick={() => setN((x) => x + 1)}><Icon name="fact_check" />Check again</Button><Button variant="secondary" onClick={save}><Icon name="download" />Save checks (JSON)</Button><ButtonLink to="/admin/backup"><Icon name="lock" />Encrypted backup</ButtonLink></>}>
        {n > 0 && <p role="status" className="font-body-sm text-body-sm text-on-surface-variant">Checked again at {hm(data.at)}: {good} fine, {bad} {bad === 1 ? 'warning' : 'warnings'}, {items.length - good - bad} to look at.</p>}
      </Head>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        <Tile label="On-device AI" icon="neurology" value={ai ? 'Found' : 'None'} unit="in this browser" foot={ai ? 'Chrome Prompt API found. Whether this laptop can run the model: More → AI check. Manual capture works without it.' : 'Not available here. Manual capture works without it.'} />
        <Tile label="Storage used" icon="database" value={share == null ? '—' : share < 0.001 ? '< 0.1' : (share * 100).toFixed(1)} unit={share == null ? 'not reported' : '%'} foot={quota ? `${mb(quota.used)} MB used of ${(quota.total / 1e9).toFixed(1)} GB this browser allows` : 'This browser does not say.'} bar={share} />
        <Tile label="Network" icon={online ? 'wifi' : 'wifi_off'} value={online ? 'Yes' : 'No'} unit={online ? 'connected' : 'not connected'} foot="What the browser reports. Nothing is probed. Charting does not need it." />
        <Tile label="Clock check" icon="schedule" value={device?.last_clock_sync ? hm(device.last_clock_sync) : '—'} unit={device?.last_clock_sync ? `${sinceText(device.last_clock_sync, now)} ago` : 'not recorded'} foot="Last time this laptop's clock was checked. ClinBridge cannot set the clock." />
      </div>

      <section aria-label="Checks" className={PANEL}>
        <ul aria-label="Checks" className="grid grid-cols-1 md:grid-cols-2 gap-x-space-lg">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-space-sm py-2 border-b border-card-border">
              <Icon name={i.ok === null ? 'help' : i.ok ? 'check_circle' : 'warning'} filled label={i.ok === null ? 'Look' : i.ok ? 'Fine' : 'Warning'} className={i.ok === null ? 'text-outline' : i.ok ? 'text-sync-green' : 'text-downtime-amber'} />
              <div className="min-w-0 flex-1"><p className="font-semibold text-primary">{i.label}</p><p className="font-body-sm text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">{i.detail}</p></div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md items-stretch">
        <Block title="Patient list on this laptop" icon="inventory_2" badge={<Badge icon="lock">Read only</Badge>} text="The hospital list taken before the downtime. Charting never changes it.">
          <Facts rows={snapshot ? [['List', snapshot.id], ['Taken', dateTimeLabel(snapshot.taken_at)], ['Age', sinceText(snapshot.taken_at, now)], ['From', snapshot.source_system]] : [['List', 'None loaded']]} />
          <Counts items={[['Patients', data.patients], ['Orders', data.orders], ['Lab results', data.results]]} />
          <ButtonLink variant="secondary" className="mt-auto" to="/admin/snapshot">Open patient list</ButtonLink>
        </Block>
        <Block title="Encryption and keys" icon="key" badge={<Badge tone={vault === 'unlocked' ? 'green' : 'amber'}>{vault === 'unlocked' ? 'Encrypted' : 'Not encrypted'}</Badge>} text="Records are encrypted in the browser's storage. The key is only in memory while the records are open.">
          <Facts rows={[['Records', 'AES-256-GCM'], ['Passphrase to key', `PBKDF2, ${SECURITY_POLICY.pbkdf2Iterations.toLocaleString('en-US')} rounds`], ['Close when not used', `After ${SECURITY_POLICY.vaultIdleLockMinutes} min`], ['Security settings', SECURITY_POLICY.approved ? 'Approved' : 'Prototype, not approved']]} />
          <p className="rounded-lg bg-surface-container-low p-space-sm font-body-md text-body-md text-on-surface-variant flex items-start gap-2"><Icon name="shield" /><span><strong className="text-primary">Recovery key</strong> Shown once, at setup. Your unit keeps it on paper. ClinBridge does not store it.</span></p>
        </Block>
        <Block title="Laptops in this unit" icon="laptop_windows" badge={<Badge>{data.devices.length}</Badge>} text="Laptops do not talk to each other. Every record keeps the laptop it was made on.">
          <ul className="flex flex-col gap-2">
            {data.devices.map((d) => <li key={d.id} className="rounded-lg bg-surface-container-low p-space-sm flex flex-wrap items-center justify-between gap-2"><span className="min-w-0"><span className="block font-body-md text-body-md font-semibold text-primary [overflow-wrap:anywhere]">{d.label}</span><span className="block font-body-sm text-body-sm text-on-surface-variant">{data.perDevice(d.id)} records here from it</span></span>{d.id === deviceId && <Badge tone="navy">This laptop</Badge>}</li>)}
          </ul>
          <ButtonLink variant="secondary" className="mt-auto" to="/admin/devices">Open laptops</ButtonLink>
        </Block>
        <Block title="Paper, camera, scanner" icon="print" text="What ClinBridge can and cannot see.">
          <Facts rows={[['Printing', 'Browser print'], ['Printer and paper', 'ClinBridge cannot see them'], ['Camera', camera ? 'The browser asks when used' : 'Not offered by this browser'], ['Barcode scanner', 'Not used']]} />
          <ButtonLink variant="secondary" className="mt-auto" to="/spooler">Print paper packets</ButtonLink>
        </Block>
        <Block title="Browser storage" icon="memory" badge={<Badge tone={persisted ? 'green' : 'amber'}>{persisted ? 'Kept' : 'Not guaranteed'}</Badge>} text="Records live in this browser profile. Clearing browser data deletes them.">
          <Facts rows={[['App stored for offline', sw ? 'Yes' : 'No'], ['Kept by the browser', persisted ? 'Yes' : 'Not guaranteed'], ['Used', quota ? `${mb(quota.used)} MB` : 'Not reported'], ['Allowed', quota ? `${(quota.total / 1e9).toFixed(1)} GB` : 'Not reported'], ['Records saved', data.entries]]} />
        </Block>
        <Block title="Change log" icon="receipt_long" badge={<Badge tone={data.chain.ok ? 'green' : 'red'}>{data.chain.ok ? 'Chain verified' : 'Broken'}</Badge>} text="Each row holds the fingerprint of the row before it. Evidence on this laptop.">
          <Facts rows={[['Rows', data.chain.total], ['Broken links', data.chain.ok ? 0 : `First at row ${data.chain.brokenAtSeq}`], ['Newest', data.last ? auditLabel(data.last.action) : '—'], ['Newest time', data.last ? dateTimeLabel(data.last.time) : '—'], ['By', data.last ? data.names.get(data.last.user_id) ?? data.last.user_id : '—']]} />
          <ButtonLink variant="secondary" className="mt-auto" to="/admin/audit">Open change log</ButtonLink>
        </Block>
      </div>

      <section aria-label="Recovery and drill" className="rounded-xl bg-primary-container text-on-primary p-space-md flex flex-wrap items-center justify-between gap-space-md print:hidden">
        <div className="min-w-0 flex-1 basis-[18rem] flex items-start gap-space-sm"><Icon name="checklist" /><div><h3 className="font-headline-sm text-headline-sm">Recovery and drill</h3><p className="font-body-sm text-body-sm opacity-90">When IT says the network is safe, an admin clears it. Then every record is checked before the export file is made.</p></div></div>
        <div className="flex flex-wrap gap-2"><ButtonLink variant="secondary" to="/admin/downtime"><Icon name="power_settings_new" />Downtime</ButtonLink><ButtonLink variant="secondary" to="/recovery"><Icon name="checklist" />Recovery worklist ({data.open})</ButtonLink></div>
      </section>
    </div>
  );
}
