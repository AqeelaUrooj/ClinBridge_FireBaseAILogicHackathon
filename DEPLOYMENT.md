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
