import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The install state machine on its own; the buttons and texts are tested in e2e-judge/website.spec.ts. */
type Install = typeof import('./install');
let m: Install;
const standalone = (on: boolean) => { window.matchMedia = ((q: string) => ({ matches: on && q.includes('standalone') })) as unknown as typeof window.matchMedia; };
const offer = (prompt: () => Promise<{ outcome: string }>) => {
  const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt });
  window.dispatchEvent(e);
  return e;
};

beforeEach(async () => {
  vi.resetModules();
  standalone(false);
  m = await import('./install');
  m.watchInstall();
});

describe('installing the Practice app', () => {
  it('nothing is claimed before the browser offers or reports anything', async () => {
    expect(m.installState()).toBe('unavailable');
    expect(await m.askToInstall()).toBe(false);
    expect(m.installState()).toBe('unavailable');
  });
  it('the dialog is kept for our button, shown once, and never by itself', async () => {
    const prompt = vi.fn(async () => ({ outcome: 'accepted' }));
    expect(offer(prompt).defaultPrevented).toBe(true);
    expect(m.installState()).toBe('available');
    expect(prompt).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([m.askToInstall(), m.askToInstall()]); // a double click
    expect([a, b]).toEqual([true, false]);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(m.installState()).toBe('accepted');
  });
  it('only the browser’s own report says installed, also when it comes before the answer of the dialog', async () => {
    offer(async () => { window.dispatchEvent(new Event('appinstalled')); return { outcome: 'accepted' }; });
    await m.askToInstall();
    expect(m.installState()).toBe('installed');
  });
  it('dismissed, then offered again', async () => {
    offer(async () => ({ outcome: 'dismissed' }));
    await m.askToInstall();
    expect(m.installState()).toBe('dismissed');
    offer(async () => ({ outcome: 'accepted' }));
    expect(m.installState()).toBe('available');
  });
  it('a dialog that fails is not an answer', async () => {
    offer(async () => { throw new Error('no user gesture'); });
    expect(await m.askToInstall()).toBe(false);
    expect(m.installState()).toBe('unavailable');
  });
  it('a window of the installed app is always "standalone"', () => {
    standalone(true);
    offer(async () => ({ outcome: 'accepted' }));
    expect(m.installState()).toBe('standalone');
  });
  it.each([
    ['chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', 0],
    ['edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0', 0],
    ['firefox', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0', 0],
    ['safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 0],
    ['ios', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 5],
    ['ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1', 5],
    ['android', 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36', 5],
    ['other', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 OPR/125.0.0.0', 0],
  ])('instructions for %s', (kind, ua, touch) => {
    expect(m.browserKind(ua, touch)).toBe(kind);
    expect(m.INSTALL_STEPS[m.browserKind(ua, touch)].length).toBeGreaterThan(20);
  });
});
