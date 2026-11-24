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

## Offline

Open the app once while online. The service worker then caches everything (app, fonts, icons, fake seed). After that it opens with no network.

## Environment

AI is optional. To use it, copy `.env.example` to `.env.local` and fill in the Firebase web config and App Check site key (docs/FIREBASE_SETUP.md). For a hosted build, register that domain for the reCAPTCHA Enterprise key; debug tokens work only on the development server. Never commit `.env.local`, real patient data, PINs, keys or backups.

## Licences when you ship a build

`dist/` bundles third-party code and fonts. The JavaScript keeps its `@license` comments. The Inter font files are under the SIL Open Font License 1.1: ship its text with the build (copy `node_modules/@fontsource/inter/LICENSE`), together with ClinBridge's `LICENSE` and `NOTICE`.

## GitHub

CI runs on every push/PR: typecheck, lint, unit tests, build, Playwright (`.github/workflows/ci.yml`).
Repo: https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon. CI also runs the official HL7 FHIR validator (fails on errors).

## Vercel (optional)

Import the repo, framework "Vite", build `npm run build`, output `dist`. Add the rewrite above.

## Practice-only judge preview

Build from a clean checkout with `npm ci` and `npm run build:judge`. The judge output is `dist-judge/`. Run `npm run preview -- --outDir dist-judge --port 4175 --strictPort` for local review.

Use a dedicated Firebase **demo project and HTTPS origin** for this artifact. Never serve it on an origin used for Real records or serve a regular build on the judge origin. The origin separates browser storage, installed app identity, and service workers. The judge build always opens Practice and its fictional seed, keeps staff PIN and role checks, and redirects first-time setup back to sign-in.

Once a preview is explicitly approved, run `firebase hosting:channel:deploy judge --project <dedicated-demo-project-id> --expires 7d`. The checked-in Hosting config serves the judge artifact and rewrites deep links to the React app. Keep preview and final demo URLs distinct from staff URLs. Use the final, stable HTTPS URL for judges who need to install and retain the demo. Preview URLs are public, time-limited, and use the selected project's backend.

The default judge build needs no Firebase values for local Practice. Build from a checkout with no inherited Firebase environment values if the review is offline-only. If the existing optional Cloud comparison is in scope for a later preview, supply only the demo project's web app settings and reCAPTCHA Enterprise site key. Register the exact preview and final hostnames on that key, register the demo web app with Firebase App Check, and verify a protected request after deployment approval. If the approved preview hostname changes, update the key's domain list and retest. Keep App Check enforcement and existing AI gates in place. Never publish a debug token or point the judge build at a clinical backend.

### Chrome acceptance

1. Start with a clean Chrome profile. Open the demo root and click **Launch Practice Demo**.
2. At `/sign-in`, wait for **Practice is ready for offline use**, then click **Install Practice Demo** or use Chrome's install menu. Confirm the installed app is named **ClinBridge Practice** and opens at `/sign-in` in a standalone window.
3. Disconnect the network, close the window, and launch the installed app again. Use the Practice passphrase button if the vault asks to unlock. Choose Daniel Okafor and enter the Practice PIN shown on screen. Confirm the fictional ward opens. Reload a protected page and confirm the app returns to sign-in and permits re-entry with the Practice PIN.
4. Try `/setup` directly and verify it returns to sign-in after the Practice vault is unlocked. Reconnect and reload. The core Practice flow uses local storage and the cached application shell.

CI checks the manifest, real PNG dimensions, Chromium installability, Practice isolation, offline direct navigation and reload. It saves landing, sign-in and offline ward screenshots in the **e2e-screens** artifact. The OS installation dialog and standalone relaunch are checked separately in desktop Chrome.
