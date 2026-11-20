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

Copy `.env.example` to `.env.local` and fill in Firebase values when AI is added. Never commit `.env.local`, real patient data, PINs, keys or backups.

## GitHub

CI runs on every push/PR: typecheck, lint, unit tests, build, Playwright (`.github/workflows/ci.yml`).
Repo: https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon. CI also runs the official HL7 FHIR validator (fails on errors).

## Vercel (optional)

Import the repo, framework "Vite", build `npm run build`, output `dist`. Add the rewrite above.
