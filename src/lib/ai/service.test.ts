import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AI service tests against the REAL Firebase JS SDK 13.4.0 (browser build), with:
 *  - a fake `LanguageModel` (Chrome Prompt API) standing in for Gemini Nano: NOT a real model;
 *  - a fetch spy standing in for the network (cloud responses are canned JSON: NOT a real Gemini call);
 *  - App Check mocked (no reCAPTCHA in tests).
 * Real-model results need a Chrome 148+ laptop with the model downloaded; see docs/AI_TEST_MATRIX.md.
 */
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(() => ({})),
  ReCaptchaEnterpriseProvider: vi.fn(),
}));

import { CloudBlockedError } from '../cloud';
import type { AiConfig } from './config';
import { resetFirebaseForTests, AiSetupError } from './firebase';
import {
  AiUnavailableError, diffProposals, parseVitalsProposal, proposeVitalsInCloud, proposeVitalsOnDevice, runOnDevice, VITALS_JSON_SCHEMA,
} from './service';

const CFG: AiConfig = { firebase: { apiKey: 'test-key', projectId: 'test-project', appId: '1:1:web:1' }, appCheckSiteKey: 'test-site-key', appCheckDebug: false, cloudModel: null, missing: [] };
const NO_CFG: AiConfig = { firebase: null, appCheckSiteKey: null, appCheckDebug: false, cloudModel: null, missing: ['VITE_FIREBASE_API_KEY'] };
const DOWN = { dataset: 'practice' as const, phase: 'down' as const, cfg: CFG };
const ANSWER = JSON.stringify({ bp_systolic: 128, bp_diastolic: 82, heart_rate: 77, spo2: 97, temp_c: 37.1, consciousness: 'Alert' });

type Session = { prompt: (m: unknown, o?: unknown) => Promise<string>; promptStreaming: () => ReadableStream; destroy: () => void };
function fakeLanguageModel(availability: string, answer = ANSWER, onPrompt?: () => Promise<void>) {
  const seen: { create: unknown[]; prompts: { messages: unknown; options: unknown }[] } = { create: [], prompts: [] };
  const lm = {
    availability: vi.fn(async () => availability),
    create: vi.fn(async (opts: unknown): Promise<Session> => {
      seen.create.push(opts);
      return {
        prompt: async (messages, options) => { seen.prompts.push({ messages, options }); if (onPrompt) await onPrompt(); return answer; },
        promptStreaming: () => new ReadableStream(),
        destroy: () => {},
      };
    }),
  };
  return { lm, seen };
}

let fetchSpy: ReturnType<typeof vi.fn>;
const realFetch = globalThis.fetch;
const networkCalls = () => fetchSpy.mock.calls.map((c) => String(typeof c[0] === 'string' ? c[0] : (c[0] as Request).url ?? c[0])).filter((u) => !/^(data|blob):/.test(u));

beforeEach(() => {
  resetFirebaseForTests();
  fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/^data:/.test(url)) return realFetch(input);
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: ANSWER }] }, finishReason: 'STOP', index: 0 }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterAll(async () => {
  // Let the SDK finish its background IndexedDB work (heartbeat) before the test environment is torn down.
  const { getApps, deleteApp } = await import('firebase/app');
  await Promise.all(getApps().map((a) => deleteApp(a)));
  await new Promise((r) => setTimeout(r, 200));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
});

describe('why the guard exists (SDK behaviour)', () => {
  it('raw SDK, ONLY_ON_DEVICE, browser WITHOUT the Prompt API: the request goes to the cloud', async () => {
    const { initializeApp } = await import('firebase/app');
    const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } = await import('firebase/ai');
    const app = initializeApp(CFG.firebase!, `raw-${Math.random()}`);
    const model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), { mode: InferenceMode.ONLY_ON_DEVICE });
    const r = await model.generateContent('hello');
    expect(r.response.inferenceSource).toBe('in_cloud');
    expect(networkCalls().some((u) => u.includes('googleapis.com'))).toBe(true);
  });
});

describe('System down: on-device only, never the cloud', () => {
  it('no Prompt API in the browser: refused before any SDK call; no network request', async () => {
    await expect(runOnDevice(DOWN, { prompt: 'x' })).rejects.toMatchObject({ reason: 'no_prompt_api' });
    expect(networkCalls()).toEqual([]);
  });

  it('model available: proposal comes from the device, labelled on_device, structured output requested, zero network', async () => {
    const { lm, seen } = fakeLanguageModel('available');
    (globalThis as { LanguageModel?: unknown }).LanguageModel = lm;
    const { proposal, raw } = await proposeVitalsOnDevice(DOWN, { prompt: 'BP 128/82, pulse 77, sats 97%, temp 37.1, alert' });
    expect(raw.source).toBe('on_device');
    expect(proposal.values).toEqual({ bp_systolic: 128, bp_diastolic: 82, heart_rate: 77, spo2: 97, temp_c: 37.1 });
    expect(proposal.consciousness).toBe('Alert');
    expect(seen.prompts[0]!.options).toEqual({ responseConstraint: VITALS_JSON_SCHEMA });
    expect(networkCalls()).toEqual([]);
    expect(globalThis.fetch).toBe(fetchSpy); // network block removed afterwards
  });

  it('model not available / not downloaded: clear reason, no download started, no network', async () => {
    const un = fakeLanguageModel('unavailable');
    (globalThis as { LanguageModel?: unknown }).LanguageModel = un.lm;
    await expect(runOnDevice(DOWN, { prompt: 'x' })).rejects.toMatchObject({ reason: 'model_unavailable' });
    const dl = fakeLanguageModel('downloadable');
    (globalThis as { LanguageModel?: unknown }).LanguageModel = dl.lm;
    await expect(runOnDevice(DOWN, { prompt: 'x' })).rejects.toMatchObject({ reason: 'model_downloading' });
    expect(dl.lm.create).not.toHaveBeenCalled();
    expect(networkCalls()).toEqual([]);
  });

  it('if anything tries the network during an on-device call, the result is discarded', async () => {
    const { lm } = fakeLanguageModel('available', ANSWER, async () => { await fetch('https://example.com/leak').catch(() => undefined); });
    (globalThis as { LanguageModel?: unknown }).LanguageModel = lm;
    await expect(runOnDevice(DOWN, { prompt: 'x' })).rejects.toMatchObject({ reason: 'network_blocked' });
    expect(networkCalls()).toEqual([]); // blocked before reaching the (spy) network
  });

  it('Firebase not configured: refused, manual entry stays the path', async () => {
    (globalThis as { LanguageModel?: unknown }).LanguageModel = fakeLanguageModel('available').lm;
    await expect(runOnDevice({ ...DOWN, cfg: NO_CFG }, { prompt: 'x' })).rejects.toMatchObject({ reason: 'not_configured' });
  });

  it('cloud is refused in System down for every purpose, before any network request', async () => {
    for (const purpose of ['compare', 'second_look', 'worklist'] as const) {
      await expect(proposeVitalsInCloud(DOWN, purpose, { prompt: 'x' })).rejects.toBeInstanceOf(CloudBlockedError);
    }
    expect(networkCalls()).toEqual([]);
  });

  it('photo (PNG) goes to the device as an image part; a WebP that cannot be converted locally is refused, not uploaded', async () => {
    const { lm, seen } = fakeLanguageModel('available');
    (globalThis as { LanguageModel?: unknown }).LanguageModel = lm;
    (globalThis as { createImageBitmap?: unknown }).createImageBitmap = vi.fn(async () => ({ width: 1, height: 1 }));
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    await proposeVitalsOnDevice(DOWN, { prompt: 'Read this form', image: png });
    const msg = (seen.prompts[0]!.messages as { content: { type: string }[] }[])[0]!;
    expect(msg.content.map((c) => c.type)).toEqual(['text', 'image']);
    expect(networkCalls()).toEqual([]);
    const webp = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
    await expect(proposeVitalsOnDevice(DOWN, { prompt: 'x', image: webp })).rejects.toMatchObject({ reason: 'unsupported_input' });
    expect(networkCalls()).toEqual([]);
  });
});

describe('cloud: only where authorised', () => {
  it('Practice compare (not System down): ONLY_IN_CLOUD, labelled in_cloud, JSON schema sent', async () => {
    const { proposal, raw } = await proposeVitalsInCloud({ dataset: 'practice', phase: 'online', cfg: CFG }, 'compare', { prompt: 'BP 128/82' });
    expect(raw.source).toBe('in_cloud');
    expect(proposal.values.heart_rate).toBe(77);
    const calls = networkCalls();
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatch(/googleapis\.com.*:generateContent/);
    const body = JSON.parse(String((fetchSpy.mock.calls.find((c) => String(c[0]).includes('googleapis'))![1] as RequestInit).body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('compare on Real records, and second look before the network is cleared, are refused', async () => {
    await expect(proposeVitalsInCloud({ dataset: 'live', phase: 'online', cfg: CFG }, 'compare', { prompt: 'x' })).rejects.toBeInstanceOf(CloudBlockedError);
    await expect(proposeVitalsInCloud({ dataset: 'practice', phase: 'ready', cfg: CFG }, 'second_look', { prompt: 'x' })).rejects.toBeInstanceOf(CloudBlockedError);
    expect(networkCalls()).toEqual([]);
  });

  it('no App Check site key: cloud refused before any request', async () => {
    await expect(proposeVitalsInCloud({ dataset: 'practice', phase: 'online', cfg: { ...CFG, appCheckSiteKey: null } }, 'compare', { prompt: 'x' })).rejects.toBeInstanceOf(AiSetupError);
    expect(networkCalls()).toEqual([]);
  });
});

describe('proposal parsing (structural only)', () => {
  it('keeps clean values, drops out-of-scale or wrongly typed ones and lists them', () => {
    const p = parseVitalsProposal('```json\n{"spo2": 140, "heart_rate": 72.5, "pain_0_10": 3, "temp_c": "37.4", "consciousness": "Sleepy"}\n```');
    expect(p.values).toEqual({ pain_0_10: 3, temp_c: 37.4 });
    expect(p.consciousness).toBeNull();
    expect(p.dropped.join(' | ')).toMatch(/Pulse: 72.5.*Oxygen level: 140.*Consciousness: Sleepy/);
    expect(parseVitalsProposal('not json').dropped[0]).toMatch(/not readable/);
  });

  it('differences are listed field by field without saying which is right', () => {
    const a = parseVitalsProposal('{"heart_rate": 77, "spo2": 97}');
    const b = parseVitalsProposal('{"heart_rate": 71, "spo2": 97, "temp_c": 37.1}');
    expect(diffProposals(a, b)).toEqual([
      { key: 'heart_rate', label: 'Pulse', a: '77', b: '71' },
      { key: 'temp_c', label: 'Temperature', a: '—', b: '37.1' },
    ]);
  });

  it('AiUnavailableError carries a reason code the UI can show', () => {
    expect(new AiUnavailableError('model_unavailable', 'x').reason).toBe('model_unavailable');
  });
});
