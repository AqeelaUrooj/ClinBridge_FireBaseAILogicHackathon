import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useApp, useSession, isAdmin } from './state/app';
import { AppShell } from './components/AppShell';
import { SignIn, LockScreen } from './features/auth/SignIn';
import { WardBoard } from './features/ward/WardBoard';
import { PatientLayout } from './features/patient/PatientLayout';
import { PatientSummary } from './features/patient/PatientSummary';
import { Timeline } from './features/patient/Timeline';
import { VitalsPage, RecordVitals } from './features/vitals/VitalsPages';
import { EntryLayout, EntryDetail, EntryHistory, CorrectEntry } from './features/entries/EntryPages';
import { MedsPage, OrderPage, RecordMed, OrdersPage } from './features/meds/MedsPages';
import { NotBuilt, AddPage, AlertsPage, MorePage } from './features/misc/Pages';

function RequireAuth() {
  const { user, locked } = useSession();
  const location = useLocation();
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (locked) return <Navigate to="/lock" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function Home() {
  const { user } = useSession();
  return <Navigate to={isAdmin(user) ? '/admin' : '/ward'} replace />;
}

export function App() {
  const { ready, bootError } = useApp();
  if (bootError) {
    return (
      <main className="min-h-screen grid place-items-center p-space-xl">
        <div role="alert" className="max-w-md bg-clinical-red-bg border border-clinical-red-border rounded-xl p-space-lg">
          <h1 className="font-headline-md text-clinical-red">Storage could not open</h1>
          <p className="mt-2">{bootError}</p>
          <p className="mt-2 text-body-sm text-secondary">Use paper downtime forms and tell the charge nurse.</p>
        </div>
      </main>
    );
  }
  if (!ready) return <p role="status" className="p-space-xl text-secondary">Opening DowntimeKit…</p>;
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/lock" element={<LockScreen />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="/ward" element={<WardBoard />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/handover" element={<NotBuilt title="Handover" phase="Phase 6" />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/labs" element={<NotBuilt title="Labs" phase="Phase 4" />} />
          <Route path="/export" element={<NotBuilt title="Export" phase="Phase 7" />} />
          <Route path="/drill/compare" element={<NotBuilt title="Practice compare" phase="Phase 7" />} />
          <Route path="/setup" element={<NotBuilt title="First-time setup" phase="Phase 7" />} />
          <Route path="/admin/*" element={<NotBuilt title="Admin" phase="Phase 7" />} />
          <Route path="/recovery/*" element={<NotBuilt title="To check (recovery)" phase="Phase 7" />} />
          <Route path="/patients/:id" element={<PatientLayout />}>
            <Route index element={<PatientSummary />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="vitals" element={<VitalsPage />} />
            <Route path="vitals/record" element={<RecordVitals />} />
            <Route path="meds" element={<MedsPage />} />
            <Route path="meds/:order" element={<OrderPage />} />
            <Route path="meds/:order/record" element={<RecordMed />} />
            <Route path="io" element={<NotBuilt title="Fluids" phase="Phase 4" />} />
            <Route path="notes" element={<NotBuilt title="Notes" phase="Phase 4" />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="body" element={<NotBuilt title="Body map" phase="Phase 6" />} />
            <Route path="handoff" element={<NotBuilt title="Handover for this patient" phase="Phase 6" />} />
            <Route path="capture" element={<NotBuilt title="Photo of paper" phase="Phase 5" />} />
          </Route>
          <Route path="/entries/:entry" element={<EntryLayout />}>
            <Route index element={<EntryDetail />} />
            <Route path="history" element={<EntryHistory />} />
            <Route path="correct" element={<CorrectEntry />} />
          </Route>
          <Route path="/capture/:entry/confirm" element={<NotBuilt title="Check photo result" phase="Phase 5" />} />
          <Route path="*" element={<NotBuilt title="Page not found" phase="no such page" />} />
        </Route>
      </Route>
    </Routes>
  );
}
