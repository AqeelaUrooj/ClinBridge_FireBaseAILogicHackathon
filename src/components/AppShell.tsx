import { useEffect, useRef, useState, type Ref, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { isAdmin, useApp, useSession } from '../state/app';
import { Icon } from './ui';
import { hm } from '../lib/time';
import { PHASE_LABEL } from '../lib/phase';

/** Header: always visible, shows mode, snapshot age, laptop and the signed-in person (Stitch status rail). */
export function ModeBanner({ onMenu, menuOpen, menuRef }: { menuRef?: Ref<HTMLButtonElement>; onMenu?: () => void; menuOpen?: boolean } = {}) {
  const { phase, event, snapshot, clock, dataset, db, vault, deviceId } = useApp();
  const { user, lock } = useSession();
  const navigate = useNavigate();
  // The header is also on the unlock screen: the laptop's name is read only while the records are open, and never breaks the page.
  const laptop = useLiveQuery(async () => {
    if (vault !== 'unlocked') return undefined;
    try { return (await db.device.get(deviceId))?.label; } catch { return undefined; }
  }, [db, deviceId, vault]);
  const clearedBy = useLiveQuery(async () => (event?.cleared_by ? (await db.practitioner.get(event.cleared_by))?.name : undefined), [db, event?.cleared_by]);
  const ageH = snapshot ? Math.floor((clock.now() - Date.parse(snapshot.taken_at)) / 3_600_000) : null;
  const dot = phase === 'down' ? 'bg-downtime-amber' : phase === 'online' ? 'bg-tertiary-fixed' : 'bg-tertiary-fixed-dim';
  const detail =
    phase === 'down' ? `since ${hm(event?.declared_at)} · AI on this laptop only · Cloud blocked`
      : phase === 'online' ? `Cloud allowed · cleared ${hm(event?.network_cleared_at)}${clearedBy ? ` by ${clearedBy}` : ''}`
        : 'Standing by';
  return (
    <header className="fixed top-0 left-0 right-0 z-50 text-on-primary select-none">
      <div className="h-11 bg-primary-container px-space-md flex items-center justify-between gap-space-md">
        {onMenu && (
          <button ref={menuRef} onClick={onMenu} className="md:hidden min-h-9 px-2 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1 font-body-sm font-semibold shrink-0"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={!!menuOpen} aria-controls="main-menu">
            <Icon name={menuOpen ? 'close' : 'menu'} className="text-[18px]" />Menu
          </button>
        )}
        <div className="flex items-center gap-space-sm min-w-0 flex-1" role="status" aria-live="polite">
          <span className={`w-2 h-2 rounded-full ${dot} ${phase === 'down' ? 'animate-pulse' : ''}`} aria-hidden />
          <span className="font-label-uppercase text-label-uppercase tracking-wide whitespace-nowrap">{PHASE_LABEL[phase].toUpperCase()}</span>
          <span className="text-outline-variant" aria-hidden>•</span>
          <span className="font-body-sm text-body-sm text-on-primary-container truncate">{detail}</span>
          {snapshot && (
            <>
              <span className="hidden lg:inline text-outline-variant" aria-hidden>•</span>
              <span className={`hidden lg:inline font-body-sm text-body-sm ${ageH != null && ageH >= 12 ? 'text-[#ffb4ab] font-bold' : 'text-on-primary-container'}`}>
                Patient list {hm(snapshot.taken_at)} ({ageH} h old)
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-space-md font-code-tabular text-code-tabular">
          <span className="hidden md:flex items-center gap-1 text-on-primary"><Icon name="schedule" className="text-[15px]" />{hm(clock.nowIso())}</span>
          {laptop && <span className="hidden xl:flex items-center gap-1 font-bold max-w-[14rem]" title={laptop}><Icon name="desktop_windows" className="text-[15px]" /><span className="truncate">{laptop.replace(/\s*\(.*\)$/, '')}</span></span>}
          {user && (
            <>
              <span className="text-right leading-tight hidden sm:block">
                <span className="block font-body-sm text-body-sm font-semibold">{user.name}</span>
                <span className="block font-label-uppercase text-[10px] text-on-primary-container">{user.role === 'admin' ? 'Admin' : user.role}</span>
              </span>
              <button onClick={() => { lock(); navigate('/lock'); }} className="min-h-9 px-2.5 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1 font-body-sm font-semibold" aria-label="Lock screen">
                <Icon name="lock" className="text-[16px]" />Lock
              </button>
            </>
          )}
        </div>
      </div>
      {dataset === 'practice' && (
        <div className="h-6 flex items-center gap-space-sm px-space-md font-label-uppercase text-[10px] tracking-wider text-white" style={{ background: 'repeating-linear-gradient(135deg,#4a6078 0 14px,#3e5468 14px 28px)' }}>
          <Icon name="school" className="text-[14px]" />PRACTICE · FAKE PATIENTS ONLY · NOT A CLINICAL RECORD
        </div>
      )}
      {vault === 'plain-data' && (
        <div role="alert" className="min-h-6 flex items-center gap-space-sm px-space-md font-label-uppercase text-[10px] tracking-wider bg-clinical-red text-white">
          <Icon name="lock_open" className="text-[14px]" />RECORDS ON THIS LAPTOP ARE NOT ENCRYPTED · ENCRYPTING THEM NEEDS APPROVAL (P-04) · KEEP FULL-DISK ENCRYPTION ON
        </div>
      )}
    </header>
  );
}

function NavItem({ to, icon, label, badge, count, end }: { to: string; icon: string; label: string; badge?: number; count?: number; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center justify-between min-h-9 px-2.5 rounded transition-colors ${isActive ? 'bg-surface-container-high text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`
      }
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon name={icon} className="text-[19px] shrink-0" />
        <span className="font-body-md text-[14px] font-medium whitespace-nowrap truncate">{label}</span>
      </span>
      {badge ? <span className="px-1.5 rounded-full bg-error text-on-error font-code-tabular text-[11px] font-bold" aria-label={`${badge} to check`}>{badge}</span>
        : count ? <span className="px-1.5 rounded-full bg-surface-container-high text-on-surface-variant font-code-tabular text-[11px] font-bold" aria-label={`${count} patients`}>{count}</span> : null}
    </NavLink>
  );
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = `nav-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-0.5">
      <span id={id} className="px-2.5 pt-1.5 pb-0.5 font-label-uppercase text-[10px] tracking-wider text-slate-muted uppercase">{title}</span>
      {children}
    </div>
  );
}

/**
 * Menu groups from the Stitch design (PRIMARY OPERATIONS / CLINICAL TOOLS / SYSTEM ADMIN), by role:
 * nurses get the clinical groups, admins get SYSTEM ADMIN. Nurses never see admin pages (and /admin
 * stays guarded in AdminLayout). CLINICAL TOOLS open the current patient's page when one is open,
 * otherwise a ward overview (the patient check still runs before any patient page).
 */
export function Sidebar({ open = false }: { open?: boolean } = {}) {
  const { db, snapshot } = useApp();
  const { user } = useSession();
  const drafts = useLiveQuery(() => db.entry.where('status').equals('draft').count(), [db], 0);
  const patients = useLiveQuery(() => db.patient.count(), [db], 0);
  const inPatient = useMatch('/patients/:id/*')?.params.id;
  const tool = (sub: string, ward: string) => (inPatient ? `/patients/${inPatient}/${sub}` : ward);
  return (
    <aside id="main-menu" className={`fixed left-0 bottom-0 w-[220px] lg:w-64 bg-surface-container-lowest border-r border-card-border z-40 flex-col justify-between overflow-y-auto ${open ? 'flex shadow-xl' : 'hidden'} md:flex md:shadow-none`} style={{ top: 'var(--header-h)' }} aria-label="Main menu">
      <div className="p-space-md flex flex-col gap-space-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary-container flex items-center justify-center text-on-primary"><Icon name="emergency_home" className="text-[18px]" /></div>
          <div>
            <span className="block font-headline-sm text-headline-sm font-bold text-primary tracking-tight">ClinBridge</span>
            <span className="block font-code-tabular text-[10px] text-secondary font-semibold uppercase">Downtime charting</span>
          </div>
        </div>
        <div className="px-2 py-1 rounded bg-surface-container-low">
          <span className="font-label-uppercase text-[10px] font-bold text-on-surface-variant tracking-wider block uppercase">Unit assignment</span>
          <span className="font-body-sm text-body-sm font-bold text-primary block">{snapshot?.unit ?? 'No patient list'}</span>
        </div>
        <nav className="flex flex-col gap-space-xs">
          {isAdmin(user) ? (
            <>
              <NavGroup title="System admin">
                <NavItem to="/admin" icon="monitor_heart" label="Readiness & Storage" end />
                <NavItem to="/admin/downtime" icon="power_settings_new" label="Downtime Management" />
                <NavItem to="/recovery" icon="checklist" label="Recovery Gate & Worklist" />
                <NavItem to="/admin/audit" icon="verified_user" label="Audit Log" />
              </NavGroup>
              <NavGroup title="Operations">
                <NavItem to="/alerts" icon="notifications_active" label="Alerts & Orders" badge={drafts} />
                <NavItem to="/more" icon="more_horiz" label="More" />
              </NavGroup>
            </>
          ) : (
            <>
              <NavGroup title="Primary operations">
                <NavItem to="/ward" icon="grid_view" label="My Patients" count={patients} />
                <NavItem to="/add" icon="add_box" label="Add Note / Form" />
                <NavItem to="/handover" icon="assignment_return" label="Handover" />
                <NavItem to="/alerts" icon="notifications_active" label="Alerts & Orders" badge={drafts} />
              </NavGroup>
              <NavGroup title="Clinical tools">
                <NavItem to={tool('meds', '/tools/meds')} icon="medication" label="Medication Schedule" />
                <NavItem to={tool('vitals', '/tools/vitals')} icon="vital_signs" label="Vitals Flowsheet" />
                <NavItem to={tool('io', '/tools/io')} icon="water_drop" label="Fluid Balance (I/O)" />
                <NavItem to={tool('labs', '/labs')} icon="science" label="Lab Results" />
                <NavItem to={tool('body', '/tools/body')} icon="accessibility_new" label="Body Map" />
              </NavGroup>
              <NavGroup title="Other">
                <NavItem to="/more" icon="more_horiz" label="More" />
              </NavGroup>
            </>
          )}
        </nav>
      </div>
      <div className="p-space-md border-t border-card-border flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-secondary-fixed text-on-secondary-fixed grid place-items-center font-bold font-body-md" aria-hidden>{user?.initials}</span>
        <span className="leading-tight">
          <span className="block font-body-md text-body-md font-semibold text-primary">{user?.name}</span>
          <span className="block font-body-sm text-body-sm text-secondary">{user?.role === 'admin' ? 'Admin' : user?.role}</span>
        </span>
      </div>
    </aside>
  );
}

export function AppShell() {
  const { dataset } = useApp();
  const headerH = dataset === 'practice' ? '68px' : '44px';
  // Narrow screens (< 768 px): the menu hides behind a header button and opens over the page.
  const menuRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && menuRef.current?.getClientRects().length) {
        setMenuOpen(false);
        menuRef.current.focus();
      } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  return (
    <div style={{ ['--header-h' as string]: headerH }}>
      <div className="print:hidden">
        <ModeBanner menuRef={menuRef} onMenu={() => setMenuOpen((o) => !o)} menuOpen={menuOpen} />
        {menuOpen && <div className="md:hidden fixed inset-0 z-30 bg-black/30" style={{ top: 'var(--header-h)' }} onClick={() => setMenuOpen(false)} aria-hidden />}
        <Sidebar open={menuOpen} />
      </div>
      <main id="main" className="min-h-screen bg-background md:pl-[220px] lg:pl-64 print:pl-0 print:!pt-0 print:min-h-0 print:bg-white" style={{ paddingTop: headerH }}>
        <div className="print:!py-0 max-w-[1240px] mx-auto px-space-md md:px-space-lg py-space-md flex flex-col gap-space-lg">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
