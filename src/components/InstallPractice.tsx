import { useSyncExternalStore } from 'react';
import { Button } from './ui';
import { judgeDemo } from '../judgeDemo';

interface InstallPrompt extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let prompt: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function installState() {
  if (installed || window.matchMedia('(display-mode: standalone)').matches) return 'installed';
  return prompt ? 'prompt' : 'instructions';
}

// Listen before React mounts so the browser can offer installation from either route.
export function captureInstallPrompt() {
  if (!judgeDemo) return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    prompt = null;
    notify();
  });
}

export function InstallPractice() {
  const state = useSyncExternalStore(subscribe, installState);
  const install = async () => {
    const pending = prompt;
    if (!pending) return;
    prompt = null;
    notify();
    try {
      const { outcome } = await pending.prompt();
      if (outcome === 'accepted') {
        installed = true;
        notify();
      }
    } catch {
      // Keep the browser-menu instructions available if the native prompt fails.
    }
  };

  return (
    <section aria-label="Install Practice Demo" className="rounded-lg border border-card-border bg-surface-container-lowest p-space-md">
      {state === 'installed' ? <p role="status">ClinBridge Practice is installed.</p> : (
        <>
          {state === 'prompt' && <Button onClick={() => void install()}>Install Practice Demo</Button>}
          <p>In desktop Chrome, use the install icon in the address bar or look for the install option in the Chrome menu. You can also continue in this tab.</p>
        </>
      )}
      <p className="text-body-sm text-secondary">Open the demo online once and wait for offline setup before disconnecting.</p>
      <OfflineStatus />
    </section>
  );
}

function subscribeToWorker(listener: () => void) {
  const workers = navigator.serviceWorker;
  workers?.addEventListener('controllerchange', listener);
  return () => workers?.removeEventListener('controllerchange', listener);
}

function hasController() {
  return Boolean(navigator.serviceWorker?.controller);
}

function OfflineStatus() {
  const ready = useSyncExternalStore(subscribeToWorker, hasController);
  return <p role="status" className="text-body-sm text-secondary">{ready ? 'Practice is ready for offline use.' : 'Offline setup is pending.'}</p>;
}
