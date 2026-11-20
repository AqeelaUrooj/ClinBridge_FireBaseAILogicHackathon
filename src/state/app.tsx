import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb, requestPersistentStorage, type Dataset, type DowntimeDB } from '../db/db';
import { importPracticeSeed } from '../db/seed';
import type { DowntimeEvent, Practitioner, Snapshot } from '../db/schema';
import { derivePhase, currentEvent, type Phase } from '../lib/phase';
import { liveClock, practiceClock, type Clock } from '../lib/time';

/**
 * App-wide context: which dataset is open, its database, clock, phase and this laptop's device id.
 * Laravel analogy: like a service container binding that every page can resolve.
 */
interface AppState {
  dataset: Dataset;
  setDataset: (d: Dataset) => void;
  db: DowntimeDB;
  clock: Clock;
  phase: Phase;
  event: DowntimeEvent | undefined;
  snapshot: Snapshot | undefined;
  deviceId: string;
  ready: boolean;
  bootError: string | null;
}

const AppCtx = createContext<AppState | null>(null);

const DATASET_KEY = 'dtk.dataset'; // app preference only, never clinical data
const PRACTICE_DEVICE = 'dev-01';   // the practice story runs on laptop DT-4W-01

function readDataset(): Dataset {
  try {
    return localStorage.getItem(DATASET_KEY) === 'live' ? 'live' : 'practice';
  } catch {
    return 'practice';
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [dataset, setDatasetState] = useState<Dataset>(readDataset);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const db = useMemo(() => getDb(dataset), [dataset]);
  const clock = useMemo(() => (dataset === 'practice' ? practiceClock() : liveClock()), [dataset]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setBootError(null);
    (async () => {
      try {
        await db.open();
        if (dataset === 'practice') await importPracticeSeed(db);
        void requestPersistentStorage();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setBootError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, dataset]);

  const events = useLiveQuery(() => (ready ? db.downtime_event.toArray() : []), [db, ready], []);
  const snapshot = useLiveQuery(() => (ready ? db.snapshot.orderBy('taken_at').last() : undefined), [db, ready]);
  const devices = useLiveQuery(() => (ready ? db.device.toArray() : []), [db, ready], []);

  const setDataset = useCallback((d: Dataset) => {
    try {
      localStorage.setItem(DATASET_KEY, d);
    } catch {
      /* storage blocked: keep in memory */
    }
    setDatasetState(d);
  }, []);

  const value: AppState = {
    dataset,
    setDataset,
    db,
    clock,
    phase: derivePhase(events),
    event: currentEvent(events),
    snapshot,
    deviceId: dataset === 'practice' ? PRACTICE_DEVICE : devices[0]?.id ?? 'unregistered',
    ready,
    bootError,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

/* ---------------- Session (signed-in nurse, lock, verified patient) ---------------- */

interface SessionState {
  user: Practitioner | null;
  locked: boolean;
  verifiedPatientId: string | null;
  signIn: (p: Practitioner) => void;
  unlock: () => void;
  lock: () => void;
  signOut: () => void;
  verifyPatient: (id: string) => void;
}

const SessionCtx = createContext<SessionState | null>(null);
export const AUTO_LOCK_MS = 5 * 60_000;

export function SessionProvider({ children, autoLockMs = AUTO_LOCK_MS }: { children: ReactNode; autoLockMs?: number }) {
  const { dataset } = useApp();
  const [user, setUser] = useState<Practitioner | null>(null);
  const [locked, setLocked] = useState(false);
  const [verifiedPatientId, setVerified] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // Switching dataset always signs out: practice and live sessions never mix.
  useEffect(() => {
    setUser(null);
    setLocked(false);
    setVerified(null);
  }, [dataset]);

  const lock = useCallback(() => {
    setLocked(true);
    setVerified(null);
  }, []);

  useEffect(() => {
    if (!user || locked) return;
    const reset = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(lock, autoLockMs);
    };
    reset();
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer.current);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [user, locked, lock, autoLockMs]);

  const value: SessionState = {
    user,
    locked,
    verifiedPatientId,
    signIn: (p) => {
      setUser(p);
      setLocked(false);
      setVerified(null);
    },
    unlock: () => setLocked(false),
    lock,
    signOut: () => {
      setUser(null);
      setLocked(false);
      setVerified(null);
    },
    verifyPatient: (id) => setVerified(id),
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(SessionCtx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

export const isNurse = (p: Practitioner | null) => p?.role === 'RN' || p?.role === 'LPN';
export const isAdmin = (p: Practitioner | null) => p?.role === 'admin';
