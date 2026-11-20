import type { Dataset } from '../../db/db';
import type { Phase } from '../phase';
import { assertCloudAllowed, type CloudPurpose } from '../cloud';
import { VITAL_RULES, CONSCIOUSNESS_OPTIONS, type VitalKey, type VitalsForm } from '../vitals';
import { readAiConfig, type AiConfig } from './config';
import { cloudModel, deviceModel } from './firebase';
import type { Part } from 'firebase/ai';

/**
 * AI service: every model call in ClinBridge goes through here.
 *
 *  runOnDevice  - Firebase AI Logic ONLY_ON_DEVICE (Chrome Prompt API / Gemini Nano). Allowed in every phase,
 *                 including System down. Hard guards, because the SDK itself is not enough:
 *                 * In SDK 13.4.0, if the browser has no `LanguageModel` API, getGenerativeModel() builds NO
 *                   on-device adapter and generateContent() goes to the CLOUD even in ONLY_ON_DEVICE mode
 *                   (callCloudOrDevice: `if (!chromeAdapter) return inCloudCall()`). We refuse before calling.
 *                 * fetch is blocked for the duration of the call; any network attempt fails the call.
 *                 * the response must report inferenceSource === 'on_device'.
 *  runInCloud   - ONLY_IN_CLOUD, only after the cloud guard (lib/cloud.ts): never in System down; Practice compare
 *                 on Practice data only; second look only after an admin cleared the network (Back online).
 * Output is always a PROPOSAL for a nurse to review. Nothing here writes a record.
 */

export type AiSource = 'on_device' | 'in_cloud';
export type UnavailableReason = 'not_configured' | 'no_prompt_api' | 'model_unavailable' | 'model_downloading' | 'unsupported_input' | 'network_blocked' | 'failed';

export class AiUnavailableError extends Error {
  constructor(public readonly reason: UnavailableReason, message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export interface AiCtx {
  dataset: Dataset;
  phase: Phase;
  cfg?: AiConfig;
}

export interface AiInput {
  prompt: string;
  image?: Blob;
}

export interface AiRaw {
  text: string;
  source: AiSource;
  ms: number;
}

const ON_DEVICE_MIME = ['image/png', 'image/jpeg'];

type LM = { availability: (opts?: unknown) => Promise<string> };
const languageModel = (): LM | undefined => (globalThis as unknown as { LanguageModel?: LM }).LanguageModel;

/* ---------------- network block (System down defence in depth) ---------------- */

let blockDepth = 0;
let realFetch: typeof fetch | null = null;
let attempts: string[] = [];

export class NetworkBlockedError extends Error {
  constructor(url: string) {
    super(`Network blocked during on-device AI: ${url}`);
    this.name = 'NetworkBlockedError';
  }
}

async function withNetworkBlocked<T>(fn: () => Promise<T>): Promise<T> {
  if (blockDepth++ === 0) {
    realFetch = globalThis.fetch;
    attempts = [];
    const passthrough = realFetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      // data:/blob: URLs never leave the laptop (the SDK decodes on-device images with fetch('data:...')).
      if (/^(data|blob):/i.test(url)) return passthrough!(input, init);
      attempts.push(url);
      return Promise.reject(new NetworkBlockedError(url));
    }) as typeof fetch;
  }
  try {
    const out = await fn();
    if (attempts.length) throw new AiUnavailableError('network_blocked', 'The on-device model tried to use the network. The result was discarded.');
    return out;
  } finally {
    if (--blockDepth === 0 && realFetch) {
      globalThis.fetch = realFetch;
      realFetch = null;
    }
  }
}

/* ---------------- image helpers ---------------- */

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await new Response(blob).arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** On-device image input is PNG or JPEG only. Other photo types are converted locally (canvas), never uploaded. */
export async function toSupportedImage(blob: Blob): Promise<Blob> {
  if (ON_DEVICE_MIME.includes(blob.type)) return blob;
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    throw new AiUnavailableError('unsupported_input', `This photo type (${blob.type || 'unknown'}) can't be read by the on-device model. Type the values instead.`);
  }
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

async function parts(input: AiInput): Promise<Array<string | Part>> {
  if (!input.image) return [input.prompt];
  return [input.prompt, { type: 'inlineData', inlineData: { data: await toBase64(input.image), mimeType: input.image.type } }];
}

/* ---------------- on-device ---------------- */

export async function runOnDevice(ctx: AiCtx, input: AiInput, responseConstraint?: object): Promise<AiRaw> {
  const cfg = ctx.cfg ?? readAiConfig();
  if (!cfg.firebase) throw new AiUnavailableError('not_configured', 'AI is not set up on this build (Firebase config missing). Type the values instead.');
  const lm = languageModel();
  if (!lm) throw new AiUnavailableError('no_prompt_api', 'This browser has no on-device AI (Chrome Prompt API). Type the values instead.');
  const image = input.image ? await toSupportedImage(input.image) : undefined;
  const createOptions = {
    expectedInputs: image ? [{ type: 'text', languages: ['en'] }, { type: 'image' }] : [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  };
  const availability = await lm.availability(createOptions);
  if (availability === 'unavailable') throw new AiUnavailableError('model_unavailable', `The on-device model can't run ${image ? 'with images ' : ''}on this laptop. Type the values instead.`);
  if (availability === 'downloadable' || availability === 'downloading') {
    throw new AiUnavailableError('model_downloading', 'The on-device model is not downloaded yet. Prepare it on the AI check page while the network is up. Type the values for now.');
  }
  const model = await deviceModel(cfg, { image: !!image, responseConstraint });
  const adapter = (model as unknown as { chromeAdapter?: { mode?: string } }).chromeAdapter;
  if (adapter?.mode !== 'only_on_device') throw new AiUnavailableError('no_prompt_api', 'On-device AI could not be prepared. Type the values instead.');
  const started = performance.now();
  try {
    const result = await withNetworkBlocked(async () => model.generateContent(await parts({ ...input, image })));
    const source = result.response.inferenceSource;
    if (source !== 'on_device') throw new AiUnavailableError('network_blocked', `Unexpected inference source "${String(source)}". The result was discarded.`);
    return { text: result.response.text(), source: 'on_device', ms: Math.round(performance.now() - started) };
  } catch (e) {
    if (e instanceof AiUnavailableError) throw e;
    throw new AiUnavailableError('failed', `The on-device model did not answer: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ---------------- cloud ---------------- */

export async function runInCloud(ctx: AiCtx, purpose: CloudPurpose, input: AiInput, responseSchema?: object): Promise<AiRaw> {
  assertCloudAllowed({ dataset: ctx.dataset, phase: ctx.phase, purpose }); // throws CloudBlockedError before anything else
  const cfg = ctx.cfg ?? readAiConfig();
  if (!cfg.firebase) throw new AiUnavailableError('not_configured', 'Cloud AI is not set up on this build (Firebase config missing).');
  const model = await cloudModel(cfg, responseSchema);
  const started = performance.now();
  try {
    const result = await model.generateContent(await parts(input));
    const source = result.response.inferenceSource;
    if (source !== 'in_cloud') throw new AiUnavailableError('failed', `Unexpected inference source "${String(source)}".`);
    return { text: result.response.text(), source: 'in_cloud', ms: Math.round(performance.now() - started) };
  } catch (e) {
    if (e instanceof AiUnavailableError) throw e;
    throw new AiUnavailableError('failed', `The cloud model did not answer: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ---------------- vitals extraction (proposal only) ---------------- */

export const PROPOSAL_KEYS: VitalKey[] = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'resp_rate', 'temp_c', 'spo2', 'pain_0_10', 'glucose_mgdl', 'o2_flow_lpm'];

export interface VitalsProposal {
  values: Partial<Record<VitalKey, number>>;
  consciousness: string | null;
  /** Fields the model returned that failed basic checks (dropped, shown to the nurse). */
  dropped: string[];
}

export const VITALS_PROMPT =
  'You are reading a nurse\'s handwritten or typed vital-signs record. Return ONLY a JSON object. ' +
  'Copy a value only if it is clearly written; leave a field out if it is missing, unclear or crossed out. ' +
  'Do not guess, calculate, convert units or add anything that is not written. ' +
  'Fields: bp_systolic, bp_diastolic (mmHg), heart_rate (/min), resp_rate (/min), temp_c (Celsius), spo2 (%), ' +
  'pain_0_10, glucose_mgdl, o2_flow_lpm (L/min), consciousness (one of: Alert, Responds to voice, Responds to pain, Unresponsive).';

/** JSON schema used as the on-device responseConstraint and the cloud responseSchema. */
export const VITALS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    ...Object.fromEntries(PROPOSAL_KEYS.map((k) => [k, { type: 'number' }])),
    consciousness: { type: 'string', enum: [...CONSCIOUSNESS_OPTIONS] },
  },
};

/** Parse model text into a proposal. Structural checks only (type, scale edges); never clinical judgement. */
export function parseVitalsProposal(text: string): VitalsProposal {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()) as Record<string, unknown>;
  } catch {
    return { values: {}, consciousness: null, dropped: ['(answer was not readable JSON)'] };
  }
  const values: Partial<Record<VitalKey, number>> = {};
  const dropped: string[] = [];
  for (const k of PROPOSAL_KEYS) {
    const v = obj[k];
    if (v === undefined || v === null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(v);
    const r = VITAL_RULES[k];
    const ok = Number.isFinite(n) && n >= 0 && n < 10000 && (!r.integer || Number.isInteger(n)) && (!r.scale || (n >= r.scale[0] && n <= r.scale[1]));
    if (ok) values[k] = n;
    else dropped.push(`${r.label}: ${String(v)}`);
  }
  const c = typeof obj.consciousness === 'string' ? obj.consciousness : null;
  const consciousness = c && (CONSCIOUSNESS_OPTIONS as readonly string[]).includes(c) ? c : null;
  if (c && !consciousness) dropped.push(`Consciousness: ${c}`);
  return { values, consciousness, dropped };
}

export function proposalToForm(p: VitalsProposal): VitalsForm {
  const f: VitalsForm = {};
  for (const [k, v] of Object.entries(p.values)) f[k as VitalKey] = String(v);
  if (p.consciousness) f.consciousness = p.consciousness;
  return f;
}

export interface FieldDiff { key: string; label: string; a: string; b: string }

/** Field-by-field differences. Says nothing about which side is right. */
export function diffProposals(a: VitalsProposal, b: VitalsProposal): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const k of PROPOSAL_KEYS) {
    const x = a.values[k];
    const y = b.values[k];
    if (x !== y) out.push({ key: k, label: VITAL_RULES[k].label, a: x === undefined ? '—' : String(x), b: y === undefined ? '—' : String(y) });
  }
  if ((a.consciousness ?? null) !== (b.consciousness ?? null)) out.push({ key: 'consciousness', label: 'Consciousness', a: a.consciousness ?? '—', b: b.consciousness ?? '—' });
  return out;
}

export async function proposeVitalsOnDevice(ctx: AiCtx, input: AiInput): Promise<{ proposal: VitalsProposal; raw: AiRaw }> {
  const raw = await runOnDevice(ctx, { ...input, prompt: `${VITALS_PROMPT}\n\n${input.prompt}` }, VITALS_JSON_SCHEMA);
  return { proposal: parseVitalsProposal(raw.text), raw };
}

export async function proposeVitalsInCloud(ctx: AiCtx, purpose: CloudPurpose, input: AiInput): Promise<{ proposal: VitalsProposal; raw: AiRaw }> {
  const raw = await runInCloud(ctx, purpose, { ...input, prompt: `${VITALS_PROMPT}\n\n${input.prompt}` }, VITALS_JSON_SCHEMA);
  return { proposal: parseVitalsProposal(raw.text), raw };
}
