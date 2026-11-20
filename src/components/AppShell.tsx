import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { isAdmin, useApp, useSession } from '../state/app';
import { Icon } from './ui';
import { hm } from '../lib/time';
import { PHASE_LABEL } from '../lib/phase';

/** Header: always visible, shows mode, snapshot age, laptop and the signed-in person (Stitch status rail). */
export function ModeBanner() {
  const { phase, event, snapshot, clock, dataset, db } = useApp();
  const { user, lock } = useSession();
  const navigate = useNavigate();
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
        <div className="flex items-center gap-space-sm min-w-0" role="status" aria-live="polite">
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
          <span className="hidden xl:flex items-center gap-1 font-bold"><Icon name="desktop_windows" className="text-[15px]" />DT-4W-01</span>
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
    </header>
  );
}

function NavItem({ to, icon, label, badge, end }: { to: string; icon: string; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center justify-between min-h-11 px-2.5 rounded transition-colors ${isActive ? 'bg-surface-container-high text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`
      }
    >
      <span className="flex items-center gap-2.5">
        <Icon name={icon} className="text-[20px]" />
        <span className="font-body-lg text-body-lg">{label}</span>
      </span>
      {badge ? <span className="px-1.5 rounded-full bg-error text-on-error font-code-tabular text-[11px] font-bold">{badge}</span> : null}
    </NavLink>
  );
}

/** Nurse menu has exactly four main buttons (UI/UX section 20); admins get their own menu. */
export function Sidebar() {
  const { db, snapshot } = useApp();
  const { user } = useSession();
  const drafts = useLiveQuery(() => db.entry.where('status').equals('draft').count(), [db], 0);
  return (
    <aside className="fixed left-0 bottom-0 w-[220px] bg-surface-container-lowest border-r border-card-border z-40 flex flex-col justify-between overflow-y-auto" style={{ top: 'var(--header-h)' }} aria-label="Main menu">
      <div className="p-space-md flex flex-col gap-space-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary-container flex items-center justify-center text-on-primary"><Icon name="emergency_home" className="text-[18px]" /></div>
          <div>
            <span className="block font-headline-sm text-headline-sm font-bold text-primary tracking-tight">DowntimeKit</span>
            <span className="block font-code-tabular text-[10px] text-secondary font-semibold uppercase">{snapshot?.unit ?? 'No patient list'}</span>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {isAdmin(user) ? (
            <>
              <NavItem to="/admin" icon="admin_panel_settings" label="Admin" end />
              <NavItem to="/recovery" icon="checklist" label="To check" />
              <NavItem to="/alerts" icon="notifications_active" label="Alerts" />
            </>
          ) : (
            <>
              <NavItem to="/ward" icon="grid_view" label="My patients" />
              <NavItem to="/add" icon="add_box" label="Add" />
              <NavItem to="/handover" icon="assignment_return" label="Handover" />
              <NavItem to="/alerts" icon="notifications_active" label="Alerts" badge={drafts} />
            </>
          )}
          <NavItem to="/more" icon="more_horiz" label="More" />
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
  return (
    <div style={{ ['--header-h' as string]: headerH }}>
      <ModeBanner />
      <Sidebar />
      <main id="main" className="min-h-screen bg-background pl-[220px]" style={{ paddingTop: headerH }}>
        <div className="max-w-[1180px] mx-auto px-space-xl py-space-lg flex flex-col gap-space-lg">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
