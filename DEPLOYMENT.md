# Deployment

## Build

```bash
npm ci
npm run build      # output in dist/
npm run preview    # check it on http://localhost:4173
```

`dist/` is static files. Any static host works. It must be served over **HTTPS** (or localhost) for the service worker and Web Crypto to work.

## Single-page app routing

All unknown paths must return `index.html`.
- Vercel: add `vercel.json` with `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.
- nginx: `try_files $uri /index.html;`
- Firebase Hosting: `firebase.json` (below).

## Offline

Open the app once while online. The service worker then caches everything (app, fonts, icons, fake seed). After that it opens with no network.

A newer version is stored in the background and waits. It is used after every ClinBridge window is closed. ClinBridge never reloads by itself (that would lose typing that is not saved yet) and an update never touches IndexedDB. People who are not signed in see "A newer version of ClinBridge is ready".

## Environment

AI is optional. To use it, copy `.env.example` to `.env.local` and fill in the Firebase web config and App Check site key (docs/FIREBASE_SETUP.md). For a hosted build, register that domain for the reCAPTCHA Enterprise key; debug tokens work only on the development server. Never commit `.env.local`, real patient data, PINs, keys or backups.

## Licences when you ship a build

`dist/` bundles third-party code and fonts. The JavaScript keeps its `@license` comments. The Inter font files are under the SIL Open Font License 1.1: ship its text with the build (copy `node_modules/@fontsource/inter/LICENSE`), together with ClinBridge's `LICENSE` and `NOTICE`.

## GitHub

CI runs on every push/PR: typecheck, lint, unit tests, build, Playwright (`.github/workflows/ci.yml`).
Repo: https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon. CI also runs the official HL7 FHIR validator (fails on errors).

## Vercel (optional)

Import the repo, framework "Vite", build `npm run build`, output `dist`. Add the rewrite above.

## Public judge website (Firebase Hosting)

A separate build: Practice only, installable, with the landing page. What it is and is not: [docs/JUDGE_DEMO_GUIDE.md](docs/JUDGE_DEMO_GUIDE.md).

| Command | What it does |
|---|---|
| `npm run build:judge` | Builds `dist-judge/` (Vite mode `judge`) |
| `npm run check:judge` | Release check: no source maps, keys, tokens or debug switch; Practice only; manifest, icons, offline files, licenses. Prints names, never values |
| `npm run preview:judge` | Serves it on http://localhost:4175 with the headers of `firebase.json` |
| `npm run test:judge` | Browser tests of this build (own ports 4285 and 4286) |

`firebase.json` publishes only `dist-judge/`, and builds and checks it again right before every deploy. Unknown addresses open the app; a missing file under `/assets/` is a real 404. `index.html`, the manifest and the service worker are never cached by the browser (`no-cache`); files in `/assets/` for one hour (the service worker keeps them anyway). The Content-Security-Policy allows this site, Google's reCAPTCHA and `*.googleapis.com` (Firebase), nothing else.

There is no `.firebaserc`: the project is named in each command, so nothing is published to a wrong project by mistake.

### Firebase project

Seen in the Firebase console on 24 Nov 2026 (read only): there is a project for this hackathon, on the **no-cost Spark plan**. **Hosting is not set up there yet.** The console says that since October 2026 the first Hosting site of a project is made on demand, so the owner may have to press **Hosting → Get started** once. Do not use a clinical or private project, and do not upgrade the plan for this.

### AI and App Check on the website (optional)

The public build does **not** read `.env.local`. Without more, everything works and cloud AI says "not set up". To switch cloud AI on for the website:

1. Copy `hosting/.env.example` to `hosting/.env.local` (never committed) and fill in the web app settings of the approved demo project. They become public; the App Check debug switch is always off in this build.
2. Google Cloud → reCAPTCHA → the website's key → **Domains**: add the exact host name of the preview and of the final site. Not `localhost`. A changed preview host name must be added again.
3. Firebase → App Check → the web app is registered with that key; **Firebase AI Logic stays Enforced**.
4. Google Cloud → Credentials → the browser API key: limit it to the website's addresses (HTTP referrers) and to the Firebase AI Logic, App Check and Installations APIs. Keep the AI Logic quota low: the site is public.
5. After the deployment: one cloud run in Device vs Cloud (Back online), and one blocked run in System down.

Firebase Authentication, Firestore and Storage are not used; there are no "authorized domains" to set for them.

### Preview, then production (only after the owner's approval)

Step by step with the tests: [docs/JUDGE_RELEASE_CHECKLIST.md](docs/JUDGE_RELEASE_CHECKLIST.md).

A preview address is public for everyone who has it. Node 22, the Firebase CLI (`npm install -g firebase-tools`) and the owner's own login are needed.

```powershell
firebase login
```

```powershell
firebase hosting:channel:deploy judge-preview --project APPROVED_PROJECT_ID --expires 7d --no-authorized-domains
```

Test the preview with a new Chrome profile ([docs/JUDGE_DEMO_GUIDE.md](docs/JUDGE_DEMO_GUIDE.md), with Wi-Fi really off). Then, with a second approval:

```powershell
firebase deploy --only hosting --project APPROVED_PROJECT_ID
```

Use the final address, not the preview, for judges who install the app: an installed app belongs to its address. Never serve the normal build on the judge address, or the judge build on an address where staff have Real records.

To take it back: Firebase console → Hosting → release history → Rollback, or `firebase hosting:channel:delete judge-preview`.
