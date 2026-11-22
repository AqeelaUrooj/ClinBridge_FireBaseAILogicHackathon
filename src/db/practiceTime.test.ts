import { afterEach, describe, expect, it, vi } from 'vitest';
import { DowntimeDB } from './db';
import { importPracticeSeed, PRACTICE_PIN } from './seed';
import { latestRecordedTime } from './practiceTime';
import { clearNetwork, startPracticeOutageDrill } from './repos/admin';
import { liveClock, practiceClock, PRACTICE_ANCHOR } from '../lib/time';
import { ACTIVE_CLINICAL_POLICY } from '../config/clinicalPolicy';

const admin = { userId: 'pr-ellis', deviceId: 'dev-01' };
const MIN = 60_000;

afterEach(() => vi.useRealTimers());

describe('practice clock across a reload', () => {
  it('never goes back after a reload; back online is never earlier than down', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-22T16:00:00Z'));
    const db = new DowntimeDB('practice', `ptime-${crypto.randomUUID()}`);
    await importPracticeSeed(db);

    // First page load: 6 minutes in, an admin starts a practice outage (13:26 on the scenario clock).
    const first = practiceClock();
    vi.setSystemTime(Date.now() + 6 * MIN);
    await startPracticeOutageDrill(db, first, admin);
    const down = (await db.downtime_event.filter((e) => !e.ended_at).toArray())[0];
    if (!down) throw new Error('practice outage was not declared');
    const downMs = Date.parse(down.declared_at);
    expect(downMs).toBe(Date.parse(PRACTICE_ANCHOR) + 6 * MIN);

    // Reload: a new clock starts at the anchor again (the old bug: 13:20, before the outage)...
    vi.setSystemTime(Date.now() + 30_000);
    const second = practiceClock();
    expect(second.now()).toBeLessThan(downMs);
    // ...until the records open and the clock is moved past what is already saved.
    second.advanceTo?.(await latestRecordedTime(db));
    expect(second.now()).toBeGreaterThanOrEqual(downMs);

    // It keeps running forward and never moves back.
    const before = second.now();
    second.advanceTo?.(0);
    second.advanceTo?.(Number.NaN);
    expect(second.now()).toBe(before);
    vi.setSystemTime(Date.now() + MIN);
    expect(second.now()).toBe(before + MIN);

    await clearNetwork(db, second, admin, ACTIVE_CLINICAL_POLICY.recovery.networkChecklist, PRACTICE_PIN);
    const cleared = (await db.downtime_event.get(down.id))!;
    expect(Date.parse(cleared.network_cleared_at!)).toBeGreaterThanOrEqual(downMs);
  });

  it('a fresh Practice dataset still starts at the scenario anchor', async () => {
    const db = new DowntimeDB('practice', `ptime-seed-${crypto.randomUUID()}`);
    await importPracticeSeed(db);
    expect(await latestRecordedTime(db)).toBeLessThanOrEqual(Date.parse(PRACTICE_ANCHOR));
    const clock = practiceClock();
    clock.advanceTo?.(await latestRecordedTime(db));
    expect(Math.abs(clock.now() - Date.parse(PRACTICE_ANCHOR))).toBeLessThan(MIN);
  });

  it('Real records keep the real clock (no advanceTo)', () => {
    const clock = liveClock();
    expect(clock.advanceTo).toBeUndefined();
    expect(Math.abs(clock.now() - Date.now())).toBeLessThan(1000);
  });
});
