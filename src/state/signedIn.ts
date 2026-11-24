import { useSyncExternalStore } from 'react';

/**
 * Is someone signed in (locked or not) in this page's memory? One yes/no for the entry point, so `/` can choose
 * between the public page and the clinical app without loading the clinical code. Not stored and not a permission:
 * RequireAuth still decides what opens. Set only by SessionProvider.
 */
let signedIn = false;
const listeners = new Set<() => void>();

export function setSignedIn(value: boolean) {
  if (value === signedIn) return;
  signedIn = value;
  listeners.forEach((l) => l());
}

export function useSignedIn(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => signedIn);
}
