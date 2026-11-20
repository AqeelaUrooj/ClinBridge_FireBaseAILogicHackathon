import type { Dataset } from '../../db/db';
import type { Phase } from '../phase';
import { cloudDecision } from '../cloud';
import type { AiConfig } from './config';
import { getFirebaseAi } from './firebase';

/**
 * AI readiness for THIS laptop, checked live (nothing assumed from the Chrome version alone).
 * Sources: Firebase AI Logic hybrid web get-started (SDK 12.5+ hybrid, Chrome desktop 139+ with the
 * multimodal-input flag for images); Chrome Prompt API docs (web pages from Chrome 148; model downloaded
 * separately; LanguageModel.availability() with the same options as create()).
 */

export type Status = 'ok' | 'warn' | 'fail' | 'info';
export interface ReadinessItem { id: string; label: string; status: Status; detail: string }

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'no-api' | 'error';

interface Env {
  userAgent: string;
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  languageModel?: { availability: (o?: unknown) => Promise<string> };
  storageEstimate?: () => Promise<{ quota?: number; usage?: number }>;
}

export function browserEnv(): Env {
  const nav = navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[]; mobile: boolean }; deviceMemory?: number };
  return {
    userAgent: nav.userAgent,
    brands: nav.userAgentData?.brands,
    mobile: nav.userAgentData?.mobile,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    languageModel: (globalThis as unknown as { LanguageModel?: Env['languageModel'] }).LanguageModel,
    storageEstimate: nav.storage?.estimate ? () => nav.storage.estimate() : undefined,
  };
}

export function chromeMajor(env: Env): number | null {
  const b = env.brands?.find((x) => x.brand === 'Google Chrome' || x.brand === 'Chromium');
  if (b) return Number(b.version);
  const m = /Chrome\/(\d+)/.exec(env.userAgent);
  return m ? Number(m[1]) : null;
}

const TEXT_OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const IMAGE_OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

async function availability(env: Env, opts: object): Promise<Availability> {
  if (!env.languageModel) return 'no-api';
  try {
    return (await env.languageModel.availability(opts)) as Availability;
  } catch {
    return 'error';
  }
}

const AVAIL_TEXT: Record<Availability, [Status, string]> = {
  available: ['ok', 'Ready on this laptop.'],
  downloadable: ['warn', 'Not downloaded yet. Press "Prepare on-device model" while the network is up (several minutes, about 4 GB+).'],
  downloading: ['warn', 'Downloading now. Keep Chrome open and the network up.'],
  unavailable: ['fail', 'Chrome says this laptop cannot run it (hardware, free disk space, or a missing flag).'],
  'no-api': ['fail', 'This browser has no Prompt API.'],
  error: ['fail', 'Chrome refused the check.'],
};

export async function checkReadiness(ctx: { cfg: AiConfig; dataset: Dataset; phase: Phase; env?: Env }): Promise<{ items: ReadinessItem[]; text: Availability; image: Availability }> {
  const env = ctx.env ?? browserEnv();
  const items: ReadinessItem[] = [];
  const major = chromeMajor(env);
  const isChrome = !!env.brands?.some((b) => b.brand === 'Google Chrome') || (/Chrome\//.test(env.userAgent) && !/Edg\/|OPR\//.test(env.userAgent));
  items.push({
    id: 'browser', label: 'Browser',
    status: env.mobile ? 'fail' : isChrome && major !== null && major >= 148 ? 'ok' : isChrome && major !== null && major >= 139 ? 'warn' : 'fail',
    detail: env.mobile ? 'Mobile browsers are not supported for on-device AI.'
      : !isChrome || major === null ? 'Not Google Chrome. On-device AI needs desktop Chrome (manual entry works in any browser).'
        : major >= 148 ? `Chrome ${major} (desktop). Meets the ClinBridge target (148+).`
          : major >= 139 ? `Chrome ${major}. Firebase's hybrid minimum is 139 with flags; the Prompt API is on by default for web pages from 148. Update Chrome.`
            : `Chrome ${major} is too old. Update to 148 or later.`,
  });
  items.push({ id: 'prompt-api', label: 'Prompt API (LanguageModel)', status: env.languageModel ? 'ok' : 'fail', detail: env.languageModel ? 'Present in this browser.' : 'Missing. On-device AI cannot run here; ClinBridge never falls back to the cloud in System down.' });
  const text = await availability(env, TEXT_OPTS);
  const image = await availability(env, IMAGE_OPTS);
  items.push({ id: 'model-text', label: 'On-device model: text input', status: AVAIL_TEXT[text][0], detail: AVAIL_TEXT[text][1] });
  items.push({
    id: 'model-image', label: 'On-device model: image input (paper photos)', status: AVAIL_TEXT[image][0],
    detail: image === 'unavailable' && text === 'available' ? 'Text works but images do not. Enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input and restart Chrome.' : AVAIL_TEXT[image][1],
  });
  const est = env.storageEstimate ? await env.storageEstimate().catch(() => ({} as { quota?: number })) : {};
  const hw = [
    env.hardwareConcurrency ? `${env.hardwareConcurrency} CPU threads` : null,
    env.deviceMemory ? `at least ${env.deviceMemory} GB memory reported (browsers cap this at 8)` : null,
    est.quota ? `site storage quota about ${Math.round(est.quota / 1e9)} GB` : null,
  ].filter(Boolean).join('; ');
  items.push({ id: 'hardware', label: 'Hardware (hints only)', status: 'info', detail: `${hw || 'Not reported'}. Chrome needs about 22 GB free disk and a GPU with more than 4 GB VRAM, or 16 GB RAM and 4+ cores. A browser can't read GPU memory or free disk space, so the model checks above are the real answer.` });

  if (!ctx.cfg.firebase) {
    items.push({ id: 'firebase', label: 'Firebase AI Logic', status: 'fail', detail: `Not set up on this build (missing ${ctx.cfg.missing.join(', ')}). Add them to .env.local and rebuild.` });
  } else {
    try {
      await getFirebaseAi(ctx.cfg);
      items.push({ id: 'firebase', label: 'Firebase AI Logic', status: 'ok', detail: `Initialised for project ${ctx.cfg.firebase.projectId} (Firebase JS SDK 13.4.0). No network is used to initialise.` });
    } catch (e) {
      items.push({ id: 'firebase', label: 'Firebase AI Logic', status: 'fail', detail: e instanceof Error ? e.message : String(e) });
    }
  }
  items.push({
    id: 'app-check', label: 'App Check (cloud only)', status: ctx.cfg.appCheckSiteKey ? 'ok' : 'warn',
    detail: ctx.cfg.appCheckSiteKey ? `reCAPTCHA Enterprise site key set${ctx.cfg.appCheckDebug ? '; DEBUG token mode (development build only)' : ''}. Started only when a cloud request is made.` : 'No site key: cloud AI stays off. On-device AI does not need App Check.',
  });
  const cmp = cloudDecision({ dataset: ctx.dataset, phase: ctx.phase, purpose: 'compare' });
  const sec = cloudDecision({ dataset: ctx.dataset, phase: ctx.phase, purpose: 'second_look' });
  items.push({ id: 'cloud', label: 'Cloud AI right now', status: ctx.phase === 'down' ? 'info' : cmp.allowed || sec.allowed ? 'ok' : 'info', detail: `Practice compare: ${cmp.allowed ? 'allowed' : 'blocked'} (${cmp.reason}) · Second look: ${sec.allowed ? 'allowed' : 'blocked'} (${sec.reason})` });
  items.push({ id: 'modes', label: 'Inference modes used', status: 'info', detail: 'System down: ONLY_ON_DEVICE (no cloud fallback). Practice compare: ONLY_ON_DEVICE and ONLY_IN_CLOUD, run separately. Back-online second look: ONLY_IN_CLOUD. PREFER_ON_DEVICE is never used.' });
  return { items, text, image };
}
