import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { LandingPage } from './features/landing/LandingPage';
import { useSignedIn } from './state/signedIn';

const ClinicalApplication = lazy(() => import('./ClinicalApplication'));

/**
 * `/` is the public page for everyone who is not signed in. For a signed-in person the clinical app stays mounted
 * (the session is only in its memory) and its own rules decide: /ward, /admin, or /lock while the screen is locked.
 */
function Entry() {
  const { pathname } = useLocation();
  const signedIn = useSignedIn();
  if (pathname === '/' && !signedIn) return <LandingPage />;
  return <Suspense fallback={<p role="status">Opening ClinBridge…</p>}><ClinicalApplication /></Suspense>;
}

export function Root() {
  return (
    <Routes>
      <Route path="/landing" element={<LandingPage />} />
      <Route path="*" element={<Entry />} />
    </Routes>
  );
}
