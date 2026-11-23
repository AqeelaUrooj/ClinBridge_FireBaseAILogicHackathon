import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { LandingPage } from './features/landing/LandingPage';

const ClinicalApplication = lazy(() => import('./ClinicalApplication'));

// Offline: the service worker caches the whole app shell so it opens with no network.
if (import.meta.env.PROD) registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/landing" element={<LandingPage />} />
        <Route path="*" element={<Suspense fallback={<p role="status">Opening ClinBridge…</p>}><ClinicalApplication /></Suspense>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
