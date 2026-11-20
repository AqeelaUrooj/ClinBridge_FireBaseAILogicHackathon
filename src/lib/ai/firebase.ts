import type { FirebaseApp } from 'firebase/app';
import type { GenerativeModel, AI } from 'firebase/ai';
import type { AiConfig } from './config';

/**
 * Firebase AI Logic (Firebase JS SDK 13.4.0, `firebase/ai`). Hybrid inference per
 * https://firebase.google.com/docs/ai-logic/hybrid/web/get-started.
 *
 * - On-device models use InferenceMode.ONLY_ON_DEVICE (never PREFER_ON_DEVICE: that can fall back to the cloud).
 * - Cloud models use InferenceMode.ONLY_IN_CLOUD and need App Check (enforced for AI Logic).
 * - App Check is initialised ONLY when a cloud model is first needed, so on-device use triggers no App Check /
 *   reCAPTCHA network traffic.
 * Modules are imported lazily; the chunks are still precached by the service worker for offline use.
 */

export class AiSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiSetupError';
  }
}

/** SDK 13.4.0's own default cloud model (DEFAULT_HYBRID_IN_CLOUD_MODEL); override with VITE_FIREBASE_AI_CLOUD_MODEL. */
export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite';

let app: FirebaseApp | null = null;
let ai: AI | null = null;
let appCheckReady = false;

export async function getFirebaseAi(cfg: AiConfig): Promise<{ app: FirebaseApp; ai: AI }> {
  if (!cfg.firebase) throw new AiSetupError(`Firebase is not set up on this build (missing ${cfg.missing.join(', ')}).`);
  if (!app) {
    const { initializeApp, getApps } = await import('firebase/app');
    app = getApps().find((a) => a.name === 'clinbridge') ?? initializeApp(cfg.firebase, 'clinbridge');
  }
  if (!ai) {
    const { getAI, GoogleAIBackend } = await import('firebase/ai');
    ai = getAI(app, { backend: new GoogleAIBackend() });
  }
  return { app, ai };
}

/** App Check for cloud calls. Debug provider only in development builds (import.meta.env.DEV). */
async function ensureAppCheck(cfg: AiConfig, firebaseApp: FirebaseApp): Promise<void> {
  if (appCheckReady) return;
  if (!cfg.appCheckSiteKey) throw new AiSetupError('App Check is not set up (missing VITE_FIREBASE_APPCHECK_SITE_KEY). Cloud AI stays off.');
  if (cfg.appCheckDebug && import.meta.env.DEV) {
    // Firebase docs: set before initializeAppCheck on localhost; the SDK prints a token to register in the console.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
  initializeAppCheck(firebaseApp, { provider: new ReCaptchaEnterpriseProvider(cfg.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  appCheckReady = true;
}

export interface DeviceModelOptions {
  image: boolean;
  /** JSON schema for structured output (Prompt API responseConstraint). */
  responseConstraint?: object;
}

/** ONLY_ON_DEVICE model. Callers must still go through runOnDevice() (see service.ts) before prompting. */
export async function deviceModel(cfg: AiConfig, opts: DeviceModelOptions): Promise<GenerativeModel> {
  const { ai: a } = await getFirebaseAi(cfg);
  const { getGenerativeModel, InferenceMode } = await import('firebase/ai');
  return getGenerativeModel(a, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: opts.image ? [{ type: 'text', languages: ['en'] }, { type: 'image' }] : [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
      ...(opts.responseConstraint ? { promptOptions: { responseConstraint: opts.responseConstraint } } : {}),
    },
  });
}

/** ONLY_IN_CLOUD model with JSON output. Callers must pass the cloud guard first (service.ts). */
export async function cloudModel(cfg: AiConfig, responseSchema?: object): Promise<GenerativeModel> {
  const { app: firebaseApp, ai: a } = await getFirebaseAi(cfg);
  await ensureAppCheck(cfg, firebaseApp);
  const { getGenerativeModel, InferenceMode } = await import('firebase/ai');
  return getGenerativeModel(a, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cfg.cloudModel ?? DEFAULT_CLOUD_MODEL,
      generationConfig: responseSchema ? { responseMimeType: 'application/json', responseSchema: responseSchema as never } : undefined,
    },
  });
}

/** Test hook: forget cached instances. */
export function resetFirebaseForTests(): void {
  app = null;
  ai = null;
  appCheckReady = false;
}
