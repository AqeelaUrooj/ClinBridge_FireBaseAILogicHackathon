import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { Root } from './Root';
import { PUBLIC_DEMO } from './config/publicDemo';
import { watchInstall } from './lib/install';
import { newerVersionSaved } from './lib/offlineCopy';

// Offline: the service worker caches the whole app shell so it opens with no network.
// A newer version waits until every window is closed: an automatic reload would lose typing that is not saved yet.
if (import.meta.env.PROD) registerSW({ immediate: true, onNeedRefresh: newerVersionSaved });
if (PUBLIC_DEMO) watchInstall();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
);
