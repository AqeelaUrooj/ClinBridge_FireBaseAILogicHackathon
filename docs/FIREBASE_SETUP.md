# Firebase setup for ClinBridge AI (owner, on your own laptop)

Checked against the Firebase docs on 20 Nov 2026. Firebase JS SDK in this repo: **13.4.0**.
Synthetic data only. **Never paste keys, config values or debug tokens into chat, issues, commits or screenshots.**

On-device AI (Scenario A) needs only steps 1–2 and 5. Cloud AI (Scenarios B and C) needs all steps.

## 1. Project and web app

1. Firebase console → create a project (or open the one you want to use).
2. Project settings → **Your apps** → **Add app** → Web. Give it a name (e.g. "ClinBridge local"). Firebase Hosting is not needed.
3. Keep the config page open: you need `apiKey`, `authDomain`, `projectId`, `appId`, `messagingSenderId` in step 5.

## 2. Firebase AI Logic

1. Firebase console → **AI Services → AI Logic** → **Get started**.
2. Choose **Gemini Developer API** (Firebase recommends it for a quick, no-cost start). The other provider (Agent Platform / formerly Vertex AI) needs billing and is not required here.
3. Let the flow finish. It turns on the needed APIs (including the Firebase AI Logic API, `firebasevertexai.googleapis.com`).

## 3. App Check (required for cloud calls)

The AI Logic setup flow turns on App Check enforcement for AI Logic. Cloud requests without a valid App Check token are rejected.

1. Google Cloud console (same project) → **reCAPTCHA** (Fraud Defense) → enable the API if asked → **Create key**:
   - Type: **Website** (score-based). Leave "Use checkbox challenge" **off**.
   - Domains: only real domains you will deploy to (e.g. your Vercel domain), if any. **Do not add `localhost`**: Firebase says to use the debug provider for local testing instead (step 4).
   - Copy the **site key** (public). This is `VITE_FIREBASE_APPCHECK_SITE_KEY`.
2. Firebase console → **Security → App Check → Apps** → your web app → register with **reCAPTCHA Enterprise** → paste the site key → Save.
3. **Security → App Check → APIs**: check **Firebase AI Logic** says **Enforced**. If it says "Unenforced", enforce it.

## 4. Local testing on localhost: App Check debug token

Because `localhost` is not a reCAPTCHA domain, cloud tests on your laptop use the App Check **debug provider**:

1. In `.env.local` set `VITE_FIREBASE_APPCHECK_DEBUG=true` (and keep the site key from step 3 filled in; ClinBridge requires it).
2. Run the **development server**: `npm run dev` → http://localhost:5173. The debug mode works **only** in `npm run dev`. Production builds (`npm run build`) ignore it by design.
3. Trigger one cloud action (Practice → More → Device vs Cloud → **Run cloud model**). Open Chrome DevTools → Console. The App Check SDK prints a line with the **App Check debug token**.
4. Firebase console → **Security → App Check → Apps** → your web app → ⋮ menu → **Manage debug tokens** → **Add debug token** → paste it → Save.
5. Run the cloud action again. It should now succeed.

Treat the debug token like a password: it lets anyone call your project's AI. It is stored only in this Chrome profile; it is never in a file or in Git. **Delete it in the console after testing.**

## 5. `.env.local` (exact variable names)

Create `.env.local` in the project root (copy `.env.example`). It is in `.gitignore`. Never commit it.

| Variable | Needed for | Value |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | all AI | `apiKey` from step 1 |
| `VITE_FIREBASE_AUTH_DOMAIN` | optional | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | all AI | `projectId` |
| `VITE_FIREBASE_APP_ID` | all AI | `appId` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | optional | `messagingSenderId` |
| `VITE_FIREBASE_APPCHECK_SITE_KEY` | cloud AI | reCAPTCHA Enterprise site key from step 3 |
| `VITE_FIREBASE_APPCHECK_DEBUG` | cloud AI on localhost | `true` only for `npm run dev`; leave empty otherwise |
| `VITE_FIREBASE_AI_CLOUD_MODEL` | optional | leave empty = SDK default `gemini-3.5-flash-lite` |

The first three required ones (`API_KEY`, `PROJECT_ID`, `APP_ID`) turn AI on. With none of them set, ClinBridge works normally and the AI screens say "not set up".

After editing `.env.local`, restart `npm run dev` (Vite reads it at start).

## 6. Check it

Open http://localhost:5173/sign-in → **Use practice passphrase** → sign in as Kim Ellis (PIN 2468) → More → **AI check**:

- "Firebase AI Logic: Initialised for project *your-project-id*" → config read.
- "App Check (cloud only): reCAPTCHA Enterprise site key set; DEBUG token mode (development build only)" → ready for local cloud tests.

Before committing anything, run `git status` and make sure `.env.local` is **not** listed.

## Optional: deployed test (Vercel or any HTTPS host)

Not needed for the hackathon test. If you deploy, add the deployed domain to the reCAPTCHA key (step 3), set the same variables (without `VITE_FIREBASE_APPCHECK_DEBUG`) in the host's environment settings, and build with `npm run build`. Then App Check uses real reCAPTCHA and no debug token is involved.
