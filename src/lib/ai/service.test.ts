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

import { readFileSync } from 'node:fs';
import { CloudBlockedError } from '../cloud';
import { CloudRevokedError, inflightCloudRequests, publishCloudContext, resetCloudGateForTests, type CloudContext } from '../cloudGate';
import type { AiConfig } from './config';
import { resetFirebaseForTests, AiSetupError } from './firebase';
import {
  AiUnavailableError, classifySource, diffProposals, parseVitalsProposal, proposeVitalsInCloud, proposeVitalsOnDevice, runOnDevice, VITALS_JSON_SCHEMA,
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
    // Every field required + nullable, with the words nurses write (live finding: optional fields were skipped).
    const schema = body.generationConfig.responseSchema;
    expect(schema.required).toEqual(expect.arrayContaining(['bp_systolic', 'bp_diastolic', 'heart_rate', 'resp_rate', 'temp_c', 'spo2', 'pain_0_10', 'consciousness']));
    expect(schema.properties.heart_rate).toMatchObject({ type: 'number', nullable: true });
    expect(schema.properties.heart_rate.description).toMatch(/pulse/);
    expect(schema.properties.spo2.description).toMatch(/sats/);
    expect(schema.properties.bp_diastolic.description).toMatch(/second number/);
  });

  it('null means "not written": nulls are skipped, never shown as values or as dropped', () => {
    const p = parseVitalsProposal('{"bp_systolic":128,"bp_diastolic":80,"heart_rate":86,"glucose_mgdl":null,"o2_flow_lpm":null,"consciousness":"Alert"}');
    expect(p.values).toEqual({ bp_systolic: 128, bp_diastolic: 80, heart_rate: 86 });
    expect(p.consciousness).toBe('Alert');
    expect(p.dropped).toEqual([]);
    expect(parseVitalsProposal('{"consciousness":null}')).toEqual({ values: {}, consciousness: null, dropped: [] });
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

/* Holds the cloud generateContent request open until release(); records the AbortSignal the SDK passed to fetch. */
function holdCloudFetch(honourAbort: boolean) {
  let release!: () => void;
  let started!: () => void;
  const sent = new Promise<void>((r) => { started = r; });
  const gate = new Promise<void>((r) => { release = r; });
  let signal: AbortSignal | undefined;
  fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/^data:/.test(url)) return realFetch(input);
    signal = init?.signal ?? undefined;
    started();
    if (honourAbort && signal) {
      await Promise.race([gate, new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))]);
    } else {
      await gate; // a server that answers anyway (the request was already transmitted)
    }
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: ANSWER }] }, finishReason: 'STOP', index: 0 }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { sent, release, signal: () => signal };
}

describe('cloud request during a mode change (regression)', () => {
  afterEach(() => resetCloudGateForTests());
  const READY_PRACTICE = { dataset: 'practice' as const, phase: 'ready' as const, cfg: CFG };

  it('pending cloud request, then System down: the request is aborted and its answer is never returned', async () => {
    publishCloudContext({ dataset: 'practice', phase: 'ready' });
    const h = holdCloudFetch(true);
    const p = proposeVitalsInCloud(READY_PRACTICE, 'compare', { prompt: 'BP 128/82' });
    await h.sent;
    expect(inflightCloudRequests()).toBe(1);
    publishCloudContext({ dataset: 'practice', phase: 'down' });
    expect(h.signal()?.aborted).toBe(true);
    await expect(p).rejects.toBeInstanceOf(CloudRevokedError);
    await expect(p).rejects.toThrow(/System down/);
    h.release();
    expect(inflightCloudRequests()).toBe(0);
  });

  it('the server answers anyway after System down (request already transmitted): the answer is still discarded', async () => {
    publishCloudContext({ dataset: 'practice', phase: 'ready' });
    const h = holdCloudFetch(false);
    const p = proposeVitalsInCloud(READY_PRACTICE, 'compare', { prompt: 'BP 128/82' });
    await h.sent;
    publishCloudContext({ dataset: 'practice', phase: 'down' });
    h.release();
    await expect(p).rejects.toBeInstanceOf(CloudRevokedError);
  });

  it('System down recorded in the database but not yet published to the screen: refused right before sending', async () => {
    let live: CloudContext = { dataset: 'practice', phase: 'ready' };
    const readLive = vi.fn(async () => live);
    // The first check passes; the phase flips while the model is being prepared; the pre-send check catches it.
    readLive.mockImplementationOnce(async () => { const out = live; live = { dataset: 'practice', phase: 'down' }; return out; });
    await expect(proposeVitalsInCloud({ ...READY_PRACTICE, readLive }, 'compare', { prompt: 'x' })).rejects.toBeInstanceOf(CloudBlockedError);
    expect(readLive).toHaveBeenCalledTimes(2);
    expect(networkCalls()).toEqual([]);
  });

  it('phase flips to System down in the database while the answer is in flight: discarded on arrival', async () => {
    let live: CloudContext = { dataset: 'practice', phase: 'ready' };
    const h = holdCloudFetch(false);
    const p = proposeVitalsInCloud({ ...READY_PRACTICE, readLive: async () => live }, 'compare', { prompt: 'x' });
    await h.sent;
    live = { dataset: 'practice', phase: 'down' };
    h.release();
    await expect(p).rejects.toBeInstanceOf(CloudRevokedError);
  });

  it('a stale screen snapshot cannot start a cloud request after System down was published', async () => {
    publishCloudContext({ dataset: 'practice', phase: 'down' });
    await expect(proposeVitalsInCloud(READY_PRACTICE, 'compare', { prompt: 'x' })).rejects.toBeInstanceOf(CloudBlockedError);
    expect(networkCalls()).toEqual([]);
  });

  it('second look in Back online: aborted when the phase leaves Back online; compare aborted when the dataset switches to Real', async () => {
    publishCloudContext({ dataset: 'practice', phase: 'online' });
    const h1 = holdCloudFetch(true);
    const p1 = proposeVitalsInCloud({ dataset: 'practice', phase: 'online', cfg: CFG }, 'second_look', { prompt: 'x' });
    await h1.sent;
    publishCloudContext({ dataset: 'practice', phase: 'down' });
    await expect(p1).rejects.toBeInstanceOf(CloudRevokedError);

    publishCloudContext({ dataset: 'practice', phase: 'ready' });
    const h2 = holdCloudFetch(true);
    const p2 = proposeVitalsInCloud(READY_PRACTICE, 'compare', { prompt: 'x' });
    await h2.sent;
    publishCloudContext({ dataset: 'live', phase: 'ready' });
    await expect(p2).rejects.toBeInstanceOf(CloudRevokedError);
    h1.release(); h2.release();
  });

  it('if the current phase cannot be read, cloud stays off', async () => {
    await expect(proposeVitalsInCloud({ ...READY_PRACTICE, readLive: async () => { throw new Error('locked'); } }, 'compare', { prompt: 'x' })).rejects.toBeInstanceOf(CloudBlockedError);
    expect(networkCalls()).toEqual([]);
  });
});

describe('inferenceSource contract (firebase@13.4.0)', () => {
  it('installed SDK: InferenceSource constant names are ON_DEVICE / IN_CLOUD, runtime values are lowercase', async () => {
    const pkg = JSON.parse(readFileSync('node_modules/firebase/package.json', 'utf8')) as { version: string };
    expect(pkg.version).toBe('13.4.0');
    const { InferenceSource } = await import('firebase/ai');
    expect(InferenceSource).toEqual({ ON_DEVICE: 'on_device', IN_CLOUD: 'in_cloud' });
  });

  it('raw SDK at runtime: ONLY_ON_DEVICE with a Prompt API reports response.inferenceSource === InferenceSource.ON_DEVICE', async () => {
    const { lm } = fakeLanguageModel('available', 'ok');
    vi.stubGlobal('LanguageModel', lm);
    const { initializeApp } = await import('firebase/app');
    const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource } = await import('firebase/ai');
    const app = initializeApp(CFG.firebase!, `src-${Math.random()}`);
    const model = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), { mode: InferenceMode.ONLY_ON_DEVICE });
    const r = await model.generateContent('hello');
    expect(r.response.inferenceSource).toBe(InferenceSource.ON_DEVICE);
    expect(r.response.inferenceSource).toBe('on_device');
    vi.unstubAllGlobals();
  });

  it('classifySource: exact SDK values only; other spellings, unknown and missing values are rejected', async () => {
    const { InferenceSource } = await import('firebase/ai');
    expect(classifySource('on_device', InferenceSource)).toBe('on_device');
    expect(classifySource('in_cloud', InferenceSource)).toBe('in_cloud');
    for (const bad of ['ON_DEVICE', 'IN_CLOUD', 'On_Device', 'device', 'hybrid', '', undefined, null, 1, {}]) {
      expect(classifySource(bad, InferenceSource)).toBeNull();
    }
  });

  it('on-device path never accepts a cloud-labelled answer (no weakening of ONLY_ON_DEVICE)', async () => {
    const { InferenceSource } = await import('firebase/ai');
    expect(classifySource(InferenceSource.IN_CLOUD, InferenceSource)).not.toBe('on_device');
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
