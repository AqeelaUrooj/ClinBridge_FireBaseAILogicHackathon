import { useSyncExternalStore } from 'react';

/** Chromium's install event (not in the TypeScript DOM types). It can be used once, from a real click. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * standalone   this window IS the installed app
 * installed    the browser reported that it installed the app, in this visit
 * available    the browser gave us its install dialog
 * accepted     the person said yes in the dialog; the browser has not reported the result yet
 * dismissed    the person said no
 * unavailable  no install dialog: not supported, already installed, or not offered (yet)
 */
export type InstallState = 'standalone' | 'installed' | 'available' | 'accepted' | 'dismissed' | 'unavailable';

let pending: InstallPromptEvent | null = null;
let result: 'installed' | 'accepted' | 'dismissed' | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches === true
  || (navigator as Navigator & { standalone?: boolean }).standalone === true; // iOS

export function installState(): InstallState {
  if (isStandalone()) return 'standalone';
  if (pending) return 'available';
  return result ?? 'unavailable';
}

/** Listen before React starts: Chromium fires the event once, early. */
export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // our own button shows the dialog instead of the browser's own bar
    pending = e as InstallPromptEvent;
    result = null; // the browser only offers this while the app is not installed
    changed();
  });
  window.addEventListener('appinstalled', () => {
    pending = null;
    result = 'installed';
    changed();
  });
}

/** Show the browser's own install dialog. Call it from a click. False: there is none to show. */
export async function askToInstall(): Promise<boolean> {
  const event = pending;
  if (!event) return false;
  pending = null; // it can be shown once
  let shown = true;
  try {
    const { outcome } = await event.prompt();
    if (installState() === 'unavailable') result = outcome; // unless the browser already reported "installed"
  } catch {
    shown = false;
  }
  changed();
  return shown;
}

export const useInstallState = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, installState);

export type BrowserKind = 'chrome' | 'edge' | 'android' | 'ios' | 'safari' | 'firefox' | 'other';

/** Which instructions to show. Only wording depends on it, never a feature. */
export function browserKind(ua = navigator.userAgent, touch = navigator.maxTouchPoints): BrowserKind {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return 'ios';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Android/.test(ua)) return 'android';
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\//.test(ua)) return 'other';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

export const INSTALL_STEPS: Record<BrowserKind, string> = {
  chrome: 'In Chrome: click the install icon at the right end of the address bar, or open the ⋮ menu, then “Cast, save and share”, then “Install page as app…”.',
  edge: 'In Edge: click the “App available” icon in the address bar, or open the … menu, then “Apps”, then “Install this site as an app”.',
  android: 'In Chrome on Android: open the ⋮ menu, then “Add to home screen”, then “Install”. Installation was tested on a Windows laptop only.',
  ios: 'On an iPhone or iPad: open this site in Safari, tap Share, then “Add to Home Screen”. Installation was tested on a Windows laptop only.',
  safari: 'In Safari on a Mac: open the File menu, then “Add to Dock”. Installation was tested on a Windows laptop only.',
  firefox: 'Firefox does not offer this kind of installation here. Open this site in Chrome or Edge to install it. The Practice demo also works in this tab.',
  other: 'Open this site in Chrome or Edge and choose the browser’s “Install app” option. The Practice demo also works in this tab.',
};
