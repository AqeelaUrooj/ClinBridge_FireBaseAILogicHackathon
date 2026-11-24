import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useApp, useSession, isAdmin } from './state/app';
import { AppShell } from './components/AppShell';
import { SignIn, LockScreen } from './features/auth/SignIn';
import { UnlockVault } from './features/auth/UnlockVault';
import { WardBoard } from './features/ward/WardBoard';
import { WardBodyMapPage, WardFluidsPage, WardMedSchedulePage, WardVitalsPage } from './features/ward/WardTools';
import { PatientLayout } from './features/patient/PatientLayout';
import { PatientSummary } from './features/patient/PatientSummary';
import { Timeline } from './features/patient/Timeline';
import { VitalsPage, RecordVitals } from './features/vitals/VitalsPages';
import { EntryLayout, EntryDetail, EntryHistory, CorrectEntry } from './features/entries/EntryPages';
import { MarPage } from './features/meds/MarPage';
import { RecordMed } from './features/meds/MedsPages';
import { OrdersPage } from './features/meds/OrdersPage';
import { BodyMapPage } from './features/body/BodyMapPage';
import { RecordNote } from './features/charting/ChartingPages';
import { PatientLabsPage, RecordLab, WardLabsPage } from './features/charting/LabPages';
import { NotesPage } from './features/charting/NotesPage';
import { IoPage, RecordIo } from './features/charting/IoPages';
import { PatientHandoffPage, NewHandoffPage, HandoffViewPage, WardHandoverPage } from './features/handoff/HandoffPages';
import { CapturePage, ConfirmDraftPage } from './features/capture/CapturePages';
import { AdminLayout, SettingsPage, SetupPage, BackupPage } from './features/admin/AdminPages';
import { DevicesPage } from './features/admin/DevicesPage';
import { StaffPage } from './features/admin/StaffPage';
import { SnapshotPage } from './features/admin/SnapshotPage';
import { DowntimePage } from './features/admin/DowntimePage';
import { ReadinessPage } from './features/admin/ReadinessPage';
import { AuditPage } from './features/admin/AuditPage';
import { ExportPage } from './features/recovery/RecoveryPages';
import { RecoveryItemPage, RecoveryLayout, RecoveryNothingOpen } from './features/recovery/RecoveryWorklist';
import { NotBuilt, AddPage, AlertsPage, MorePage } from './features/misc/Pages';
import { AiCheckPage, PracticeComparePage } from './features/ai/AiPages';
import { PrintFormPage, SpoolerPage } from './features/print/PrintPages';

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
  const { ready, bootError, vault } = useApp();
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
  if (!ready) return <p role="status" className="p-space-xl text-secondary">Opening ClinBridge…</p>;
  // Encrypted and locked (refresh, restart, "Lock records", idle lock): nothing else renders until unlocked.
  if (vault === 'locked') return <UnlockVault />;
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/lock" element={<LockScreen />} />
      {/* Reachable before anyone exists: the page itself only works while Real records has no staff. */}
      <Route path="/setup" element={<main className="min-h-screen bg-background p-space-xl flex flex-col gap-space-lg"><SetupPage /></main>} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="/ward" element={<WardBoard />} />
          <Route path="/add" element={<AddPage />} />
          <Route path="/handover" element={<WardHandoverPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/labs" element={<WardLabsPage />} />
          <Route path="/tools/meds" element={<WardMedSchedulePage />} />
          <Route path="/tools/vitals" element={<WardVitalsPage />} />
          <Route path="/tools/io" element={<WardFluidsPage />} />
          <Route path="/tools/body" element={<WardBodyMapPage />} />
          <Route path="/export" element={<ExportPage />} />
          {/* Paper downtime forms (DT-MAR-01, DT-VIT-02, DT-SBAR-03) and the packet builder. The app frame is hidden when printing. */}
          <Route path="/print/:kind/:id" element={<PrintFormPage />} />
          <Route path="/spooler" element={<SpoolerPage />} />
          <Route path="/drill/compare" element={<PracticeComparePage />} />
          <Route path="/ai" element={<AiCheckPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<ReadinessPage />} />
            <Route path="downtime" element={<DowntimePage />} />
            <Route path="snapshot" element={<SnapshotPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="backup" element={<BackupPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="/recovery" element={<RecoveryLayout />}>
            <Route index element={<RecoveryNothingOpen />} />
            <Route path=":item" element={<RecoveryItemPage />} />
          </Route>
          <Route path="/patients/:id" element={<PatientLayout />}>
            <Route index element={<PatientSummary />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="vitals" element={<VitalsPage />} />
            <Route path="vitals/record" element={<RecordVitals />} />
            <Route path="meds" element={<MarPage />} />
            <Route path="meds/:order" element={<MarPage />} />
            <Route path="meds/:order/record" element={<RecordMed />} />
            <Route path="io" element={<IoPage />} />
            <Route path="io/record" element={<RecordIo />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="notes/new" element={<RecordNote />} />
            <Route path="labs" element={<PatientLabsPage />} />
            <Route path="labs/record" element={<RecordLab />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="body" element={<BodyMapPage />} />
            <Route path="handoff" element={<PatientHandoffPage />} />
            <Route path="handoff/new" element={<NewHandoffPage />} />
            <Route path="handoff/:hid" element={<HandoffViewPage />} />
            <Route path="capture" element={<CapturePage />} />
          </Route>
          <Route path="/entries/:entry" element={<EntryLayout />}>
            <Route index element={<EntryDetail />} />
            <Route path="history" element={<EntryHistory />} />
            <Route path="correct" element={<CorrectEntry />} />
          </Route>
          <Route path="/capture/:entry" element={<EntryLayout />}>
            <Route path="confirm" element={<ConfirmDraftPage />} />
          </Route>
          <Route path="*" element={<NotBuilt title="Page not found" phase="no such page" />} />
        </Route>
      </Route>
    </Routes>
  );
}
