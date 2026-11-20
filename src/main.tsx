import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { AppProvider, SessionProvider } from './state/app';
import { App } from './App';

// Offline: the service worker caches the whole app shell so it opens with no network.
if (import.meta.env.PROD) registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
