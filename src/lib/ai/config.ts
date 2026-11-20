/**
 * Firebase web configuration from Vite env (.env.local, never committed). See .env.example.
 * Nothing here is a secret in the cryptographic sense (Firebase web config is shipped to browsers), but the owner
 * keeps it out of Git. App Check debug tokens are never read from env: the SDK generates them in development only.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
}

export interface AiConfig {
  firebase: FirebaseWebConfig | null;
  appCheckSiteKey: string | null;
  /** Development only: let the App Check SDK create a debug token (printed in the console). */
  appCheckDebug: boolean;
  cloudModel: string | null;
  missing: string[];
}

type Env = Record<string, string | boolean | undefined>;

export function readAiConfig(env: Env = import.meta.env as unknown as Env): AiConfig {
  const s = (k: string) => (typeof env[k] === 'string' && (env[k] as string).trim() ? (env[k] as string).trim() : null);
  const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
  const missing = required.filter((k) => !s(k));
  const firebase = missing.length
    ? null
    : { apiKey: s('VITE_FIREBASE_API_KEY')!, projectId: s('VITE_FIREBASE_PROJECT_ID')!, appId: s('VITE_FIREBASE_APP_ID')!, authDomain: s('VITE_FIREBASE_AUTH_DOMAIN') ?? undefined, messagingSenderId: s('VITE_FIREBASE_MESSAGING_SENDER_ID') ?? undefined };
  return {
    firebase,
    appCheckSiteKey: s('VITE_FIREBASE_APPCHECK_SITE_KEY'),
    appCheckDebug: env.DEV === true && s('VITE_FIREBASE_APPCHECK_DEBUG') === 'true',
    cloudModel: s('VITE_FIREBASE_AI_CLOUD_MODEL'),
    missing,
  };
}
