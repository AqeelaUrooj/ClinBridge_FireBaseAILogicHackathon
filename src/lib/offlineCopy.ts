import { useEffect, useState, useSyncExternalStore } from 'react';

/** The app's own offline copy (service worker): is it complete, and is a newer version waiting? */

let newer = false;
const listeners = new Set<() => void>();

export function newerVersionSaved() {
  newer = true;
  listeners.forEach((l) => l());
}

export const useNewerVersion = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => newer);

/** True when every file of the app is stored in this browser. A service worker only becomes active after that. */
export function useOfflineReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let on = true;
    void navigator.serviceWorker?.ready.then(() => { if (on) setReady(true); });
    return () => { on = false; };
  }, []);
  return ready;
}
