import { describe, expect, it, vi } from 'vitest';

// Firebase init itself is covered in service.test.ts; here it is stubbed so no SDK background work (heartbeat in
// IndexedDB) outlives the test environment.
vi.mock('./firebase', () => ({ getFirebaseAi: vi.fn(async () => ({})) }));

import { checkReadiness, chromeMajor } from './readiness';
import type { AiConfig } from './config';

const CFG: AiConfig = { firebase: { apiKey: 'k', projectId: 'demo-project', appId: '1:1:web:1' }, appCheckSiteKey: 'site', appCheckDebug: false, cloudModel: null, missing: [] };
const NO_CFG: AiConfig = { firebase: null, appCheckSiteKey: null, appCheckDebug: false, cloudModel: null, missing: ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] };
const chrome = (v: number, lm?: (o: { expectedInputs: { type: string }[] }) => string) => ({
  userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
  brands: [{ brand: 'Google Chrome', version: String(v) }], mobile: false, hardwareConcurrency: 8, deviceMemory: 8,
  languageModel: lm ? { availability: async (o?: unknown) => lm(o as { expectedInputs: { type: string }[] }) } : undefined,
});
const byId = (items: { id: string; status: string; detail: string }[], id: string) => items.find((i) => i.id === id)!;

describe('AI readiness (live checks, nothing assumed)', () => {
  it('Chrome 148 with text and image models ready', async () => {
    const r = await checkReadiness({ cfg: CFG, dataset: 'practice', phase: 'online', env: chrome(148, () => 'available') });
    expect(byId(r.items, 'browser').status).toBe('ok');
    expect(byId(r.items, 'model-text').status).toBe('ok');
    expect(byId(r.items, 'model-image').status).toBe('ok');
    expect(byId(r.items, 'firebase').status).toBe('ok');
  });

  it('Chrome installed but the model is NOT downloaded: says so, does not claim ready', async () => {
    const r = await checkReadiness({ cfg: CFG, dataset: 'practice', phase: 'online', env: chrome(150, () => 'downloadable') });
    expect(byId(r.items, 'model-text')).toMatchObject({ status: 'warn' });
    expect(byId(r.items, 'model-text').detail).toMatch(/Not downloaded/);
  });

  it('text works but images do not: points to the multimodal flag', async () => {
    const r = await checkReadiness({ cfg: CFG, dataset: 'practice', phase: 'online', env: chrome(148, (o) => (o.expectedInputs.some((x) => x.type === 'image') ? 'unavailable' : 'available')) });
    expect(byId(r.items, 'model-image').detail).toMatch(/multimodal-input/);
  });

  it('no Prompt API, old Chrome, no Firebase config, System down: each reported plainly', async () => {
    const r = await checkReadiness({ cfg: NO_CFG, dataset: 'live', phase: 'down', env: chrome(138) });
    expect(byId(r.items, 'browser').status).toBe('fail');
    expect(byId(r.items, 'prompt-api').status).toBe('fail');
    expect(byId(r.items, 'model-text').detail).toMatch(/no Prompt API/);
    expect(byId(r.items, 'firebase').detail).toMatch(/VITE_FIREBASE_API_KEY/);
    expect(byId(r.items, 'cloud').detail).toMatch(/System down/);
  });

  it('reads the Chrome major version from brands or the user agent', () => {
    expect(chromeMajor({ userAgent: 'x Chrome/151.0 y' })).toBe(151);
    expect(chromeMajor({ userAgent: 'Firefox/140' })).toBeNull();
  });
});
