import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb, requestPersistentStorage, type Dataset, type DowntimeDB } from '../db/db';
import { setVaultMode } from '../db/encryption';
import { migrateToEncrypted } from '../db/encryptMigration';
import {
  auditVaultEvent, createVault, detectVault, isUnlocked, lockVault, peekVault, readVaultRow, recoverVault, refreshPlainAllowance, resealLegacyRows,
  unlockFromRow, type UnlockSecret,
} from '../db/vault';
import { PUBLIC_PRACTICE_PASSPHRASE, SECURITY_POLICY } from '../config/securityPolicy';
import { importPracticeSeed } from '../db/seed';
import { openWithMigration } from '../db/backup';
import { latestRecordedTime } from '../db/practiceTime';
import type { DowntimeEvent, Practitioner, Snapshot } from '../db/schema';
import { derivePhase, currentEvent, type Phase } from '../lib/phase';
import { liveClock, practiceClock, type Clock } from '../lib/time';
import { publishCloudContext, type CloudContext } from '../lib/cloudGate';

/** Fresh read of the authoritative phase for the cloud gate (right before a cloud request is sent, and after it returns). */
export async function readCloudContext(db: DowntimeDB, dataset: Dataset): Promise<CloudContext> {
  return { dataset, phase: derivePhase(await db.downtime_event.toArray()) };
}

/**
 * App-wide context: which dataset is open, its database, clock, phase and this laptop's device id.
 * Laravel analogy: like a service container binding that every page can resolve.
 */
export type VaultView = 'booting' | 'locked' | 'unlocked' | 'empty' | 'plain-data';

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
  /** Encryption at rest (P-04). */
  vault: VaultView;
  unlock: (secret: UnlockSecret) => Promise<void>;
  /** Forgotten passphrase: returns the NEW recovery code to show once. */
  recover: (recoveryCode: string, newPassphrase: string) => Promise<string>;
  lockRecords: () => void;
  /** First-time setup of Real records: vault created before any record. */
  vaultCreated: () => void;
  /** After recover(): the new recovery key has been shown and confirmed; open the records. */
  finishRecovery: () => void;
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
  const [vault, setVault] = useState<VaultView>('booting');
  const [bootError, setBootError] = useState<string | null>(null);
  const db = useMemo(() => getDb(dataset), [dataset]);
  const clock = useMemo(() => (dataset === 'practice' ? practiceClock() : liveClock()), [dataset]);
  const bootDevice = dataset === 'practice' ? PRACTICE_DEVICE : 'unregistered';

  /** Open the Dexie database (runs any schema upgrade) once the key, if any, is in memory. */
  const openAndFinish = useCallback(async (): Promise<VaultView> => {
    await openWithMigration(db, clock, bootDevice);
    const peek = await readVaultRow(db);
    if (peek) {
      // A Practice vault whose seed load was cut off (e.g. reload during the first start): load it now.
      if (db.dataset === 'practice' && (await db.patient.count()) === 0) await importPracticeSeed(db);
      const left = await refreshPlainAllowance(db);
      // An interrupted Practice encryption is finished straight after unlock (Real records never get here).
      if (left.plain > 0 && db.dataset === 'practice') await migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: bootDevice });
      // Already-encrypted rows/photos from the first format (v1) are re-sealed as v2 (index fields authenticated).
      await resealLegacyRows(db, { clock, deviceId: bootDevice });
      // Practice clock restarts at the scenario anchor on each load: move it past anything already saved.
      if (db.dataset === 'practice') clock.advanceTo?.(await latestRecordedTime(db));
      return 'unlocked';
    }
    return (await detectVault(db)) as VaultView;
  }, [db, clock, bootDevice]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setVault('booting');
    setBootError(null);
    (async () => {
      try {
        const peek = await peekVault(db.name);
        if (peek.row) {
          // Encrypted: stay closed until someone unlocks. Nothing is read before that.
          setVaultMode(db.name, { mode: 'locked' });
          if (!cancelled) { setVault('locked'); setReady(true); }
          return;
        }
        // No vault yet: rows (if any) are plain, so open in pass-through mode for a possible schema upgrade.
        setVaultMode(db.name, { mode: 'plain' });
        await openWithMigration(db, clock, bootDevice);
        let view = (await detectVault(db)) as VaultView;
        if (dataset === 'practice') {
          if (view === 'empty') {
            await createVault(db, PUBLIC_PRACTICE_PASSPHRASE);
            await importPracticeSeed(db);
            await auditVaultEvent(db, clock, bootDevice, 'vault_created', { dataset: 'practice', public_secret: true });
          } else if (view === 'plain-data') {
            await migrateToEncrypted(db, { passphrase: PUBLIC_PRACTICE_PASSPHRASE, clock, deviceId: bootDevice });
          }
          clock.advanceTo?.(await latestRecordedTime(db));
          view = 'unlocked';
        }
        void requestPersistentStorage();
        if (!cancelled) { setVault(view); setReady(true); }
      } catch (e) {
        if (!cancelled) setBootError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, dataset, clock, bootDevice]);

  const unlock = useCallback(async (secret: UnlockSecret) => {
    const peek = await peekVault(db.name);
    if (!peek.row) throw new Error('There is no encrypted vault on this laptop for these records.');
    await unlockFromRow(db.name, peek.row, secret);
    try {
      const view = await openAndFinish();
      await auditVaultEvent(db, clock, bootDevice, 'vault_unlocked', { method: 'passphrase' in secret ? 'passphrase' : 'recovery' });
      void requestPersistentStorage();
      setVault(view);
    } catch (e) {
      lockVault(db);
      throw e;
    }
  }, [db, clock, bootDevice, openAndFinish]);

  const recover = useCallback(async (recoveryCode: string, newPassphrase: string) => {
    const peek = await peekVault(db.name);
    if (!peek.row) throw new Error('There is no encrypted vault on this laptop for these records.');
    await unlockFromRow(db.name, peek.row, { recovery: recoveryCode });
    try {
      await openAndFinish();
      const code = await recoverVault(db, recoveryCode, newPassphrase, { clock, deviceId: bootDevice });
      // The screen stays on the unlock page until the NEW recovery key is confirmed (finishRecovery).
      return code;
    } catch (e) {
      lockVault(db);
      throw e;
    }
  }, [db, clock, bootDevice, openAndFinish]);

  const lockRecords = useCallback(() => {
    if (!isUnlocked(db)) return;
    lockVault(db);
    setVault('locked');
  }, [db]);

  // Vault idle lock (prototype value, needs hospital IT approval: config/securityPolicy.ts).
  useEffect(() => {
    if (vault !== 'unlocked') return;
    let t = window.setTimeout(lockRecords, SECURITY_POLICY.vaultIdleLockMinutes * 60_000);
    const reset = () => {
      window.clearTimeout(t);
      t = window.setTimeout(lockRecords, SECURITY_POLICY.vaultIdleLockMinutes * 60_000);
    };
    const evs = ['pointerdown', 'keydown'] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(t);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [vault, lockRecords]);

  const usable = ready && (vault === 'unlocked' || vault === 'plain-data' || vault === 'empty');
  const events = useLiveQuery(() => (usable ? db.downtime_event.toArray() : []), [db, usable], []);
  const snapshot = useLiveQuery(() => (usable ? db.snapshot.orderBy('taken_at').last() : undefined), [db, usable]);
  const devices = useLiveQuery(() => (usable ? db.device.toArray() : []), [db, usable], []);

  // Tell the cloud gate about every phase/dataset change: a running cloud request that is no longer allowed is aborted.
  // While the records can't be read (locked, booting), fail closed as if the system were down.
  const phaseNow = derivePhase(events);
  useEffect(() => {
    publishCloudContext({ dataset, phase: usable ? phaseNow : 'down' });
  }, [dataset, phaseNow, usable]);

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
    phase: phaseNow,
    event: currentEvent(events),
    snapshot,
    deviceId: dataset === 'practice' ? PRACTICE_DEVICE : devices[0]?.id ?? 'unregistered',
    ready,
    bootError,
    vault,
    unlock,
    recover,
    lockRecords,
    vaultCreated: () => setVault('unlocked'),
    finishRecovery: () => { if (isUnlocked(db)) setVault('unlocked'); },
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
  const { dataset, vault } = useApp();
  const [user, setUser] = useState<Practitioner | null>(null);
  const [locked, setLocked] = useState(false);
  const [verifiedPatientId, setVerified] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // Switching dataset always signs out: practice and live sessions never mix.
  // Locking the encrypted records signs out too: after unlock, each person signs in again with their PIN.
  useEffect(() => {
    setUser(null);
    setLocked(false);
    setVerified(null);
  }, [dataset]);
  useEffect(() => {
    if (vault === 'locked') {
      setUser(null);
      setLocked(false);
      setVerified(null);
    }
  }, [vault]);

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
