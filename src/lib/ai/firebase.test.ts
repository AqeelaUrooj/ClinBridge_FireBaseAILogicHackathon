import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression for a defect found live on 20 Nov 2026 (owner's PC, real Firebase project): cloud requests went out
 * with NO App Check token and Firebase answered 401 "App Check token is invalid".
 * Cause: the AI SDK reads the App Check provider once, when the AI instance is created. ClinBridge created the AI
 * instance (AI check page / on-device path) before initializeAppCheck() ran on the first cloud call.
 *
 * Real firebase/app, firebase/ai and firebase/app-check. Only the reCAPTCHA Enterprise provider is swapped for the
 * SDK's own CustomProvider returning a fake token, so no reCAPTCHA script or Google request is involved.
 */
vi.mock('firebase/app-check', async (importOriginal) => {
  const real = await importOriginal<typeof import('firebase/app-check')>();
  class FakeRecaptchaEnterpriseProvider extends real.CustomProvider {
    constructor() {
      super({ getToken: async () => ({ token: 'fake-app-check-token', expireTimeMillis: Date.now() + 3_600_000 }) });
    }
  }
  return { ...real, ReCaptchaEnterpriseProvider: FakeRecaptchaEnterpriseProvider };
});

import type { AiConfig } from './config';
import { cloudModel, deviceModel, getFirebaseAi, resetFirebaseForTests } from './firebase';

const CFG: AiConfig = { firebase: { apiKey: 'test-key', projectId: 'test-project', appId: '1:1:web:1' }, appCheckSiteKey: 'test-site-key', appCheckDebug: false, cloudModel: null, missing: [] };
const realFetch = globalThis.fetch;
const ANSWER = JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '{}' }] }, finishReason: 'STOP', index: 0 }] });

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(async () => {
  const { getApps, deleteApp } = await import('firebase/app');
  await Promise.all(getApps().map((a) => deleteApp(a)));
  resetFirebaseForTests();
  await new Promise((r) => setTimeout(r, 200));
});

describe('cloud requests carry an App Check token (regression)', () => {
  it('AI instance created first (AI check page / on-device), then a cloud call: X-Firebase-AppCheck is sent', async () => {
    // 1. What the AI check page and the on-device path do first: create the (device) AI instance.
    await getFirebaseAi(CFG);
    await deviceModel(CFG, { image: false });

    // 2. First cloud call.
    const seen: Headers[] = [];
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return new Response(ANSWER, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const model = await cloudModel(CFG);
    await model.generateContent('hello');

    expect(seen).toHaveLength(1);
    expect(seen[0]?.get('X-Firebase-AppCheck')).toBe('fake-app-check-token');
  });

  it('App Check lives only on the separate cloud app; the on-device app never gets it', async () => {
    const { getApps } = await import('firebase/app');
    const { getAI } = await import('firebase/ai');
    const names = getApps().map((a) => a.name).sort();
    expect(names).toEqual(['clinbridge', 'clinbridge-cloud']);
    const deviceApp = getApps().find((a) => a.name === 'clinbridge')!;
    const cloudApp = getApps().find((a) => a.name === 'clinbridge-cloud')!;
    expect((getAI(deviceApp) as unknown as { appCheck: unknown }).appCheck).toBeNull();
    expect((getAI(cloudApp) as unknown as { appCheck: unknown }).appCheck).not.toBeNull();
  });
});
