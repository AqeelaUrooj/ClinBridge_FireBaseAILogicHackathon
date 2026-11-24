import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProvider, SessionProvider, useApp } from './app';
import { getDb } from '../db/db';
import { getVaultMode } from '../db/encryption';
import { loadSeedJson } from '../db/seed';
import { PUBLIC_PRACTICE_PASSPHRASE } from '../config/securityPolicy';
import { CloudBlockedError } from '../lib/cloud';
import { resetCloudGateForTests, runGuardedCloud } from '../lib/cloudGate';

/**
 * The key must not outlive the clinical app: `/` and `/landing` unmount it, and the idle lock with it.
 * Real start-up, real vault, real Dexie (fake IndexedDB), fictional Practice data.
 */
let app: ReturnType<typeof useApp>;
function Probe() {
  app = useApp();
  return <p>{app.ready ? app.vault : 'starting'}</p>;
}
const open = () => render(<AppProvider><SessionProvider><Probe /></SessionProvider></AppProvider>);
const practice = getDb('practice');
const mode = (db = practice) => getVaultMode(db.name)?.mode;
const settle = () => new Promise((r) => setTimeout(r, 50));
const patients = async () => ((await loadSeedJson()).patient as unknown[]).length;

/** Locked screen, then the passphrase. */
async function openUnlocked() {
  const view = open();
  await waitFor(() => expect(screen.getByText(/^(locked|unlocked)$/)).toBeTruthy(), { timeout: 20_000 });
  if (screen.queryByText('locked')) await act(() => app.unlock({ passphrase: PUBLIC_PRACTICE_PASSPHRASE }));
  await waitFor(() => expect(screen.getByText('unlocked')).toBeTruthy());
  return view;
}

afterEach(() => { localStorage.clear(); resetCloudGateForTests(); });

describe('leaving the clinical app', { timeout: 60_000 }, () => {
  it('during the very first start: the Practice load is finished, then locked; nothing half-made is left', async () => {
    const { unmount } = open();
    await waitFor(() => expect(mode()).toBe('unlocked'), { timeout: 20_000, interval: 1 }); // the vault exists, the seed is still loading
    unmount();
    await waitFor(() => expect(mode()).toBe('locked'), { timeout: 20_000 });
    await expect(practice.open().then(() => practice.patient.toArray())).rejects.toThrow(/locked/i);
    practice.close();
    await openUnlocked();
    expect(await practice.patient.count()).toBe(await patients());
  });

  it('drops the key at once, and coming back needs the unlock again', async () => {
    const { unmount } = await openUnlocked();
    expect(mode()).toBe('unlocked');
    unmount();
    await settle();
    expect(mode()).toBe('locked');
    await expect(practice.open().then(() => practice.patient.toArray())).rejects.toThrow(/locked/i);
    practice.close();
    const again = open();
    await waitFor(() => expect(screen.getByText('locked')).toBeTruthy());
    expect(mode()).toBe('locked');
    again.unmount();
  });

  it('while the passphrase is being checked: the late unlock is locked again', async () => {
    const { unmount } = await openUnlocked();
    act(() => app.lockRecords());
    const late = app.unlock({ passphrase: PUBLIC_PRACTICE_PASSPHRASE });
    unmount();
    await late;
    await settle();
    expect(mode()).toBe('locked');
  });

  it('and opening it again while the first start is still unlocking never shares that key', async () => {
    const first = await openUnlocked();
    act(() => app.lockRecords());
    const late = app.unlock({ passphrase: PUBLIC_PRACTICE_PASSPHRASE });
    first.unmount();
    open();
    await late;
    await waitFor(() => expect(screen.getByText('locked')).toBeTruthy(), { timeout: 20_000 });
    await settle();
    expect(mode()).toBe('locked');
  });

  it('switching the data set drops the other key too', async () => {
    await openUnlocked();
    act(() => app.setDataset('live'));
    await waitFor(() => expect(screen.getByText('empty')).toBeTruthy());
    await settle();
    expect(mode()).toBe('locked');
    expect(mode(getDb('live'))).not.toBe('unlocked');
  });

  it('stops a running cloud request and refuses new ones', async () => {
    const { unmount } = await openUnlocked();
    const ask = (send: (s: AbortSignal) => Promise<string>) => runGuardedCloud({ dataset: 'practice', phase: 'online', purpose: 'compare' }, send);
    const running = ask((signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const refused = expect(running).rejects.toBeInstanceOf(CloudBlockedError);
    await settle();
    unmount();
    await refused;
    await expect(ask(async () => 'answer')).rejects.toBeInstanceOf(CloudBlockedError);
  });
});
