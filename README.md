# DowntimeKit

Offline nursing documentation for when the hospital EHR (electronic health record) is down.

- **System down:** the app works with no network. Everything saves on the laptop (IndexedDB, the browser's built-in database). AI, when added, runs only on the laptop (Gemini Nano).
- **Back online:** after an admin checks the network, cloud AI (Gemini) can help, and records are exported for the EHR.

> Practice mode uses fake patients only. Never type real patient information into Practice.

## Run it

```bash
npm ci
npm run dev          # http://localhost:5173
```

Sign in to Practice: pick any person, PIN **2468** (practice only).
Records are encrypted at rest. After a reload or restart the app asks for the unit passphrase first; for Practice press **Use practice passphrase** (`practice only fake patients`, public on purpose: it protects nothing and is only for fake data). Real records get their own passphrase and a recovery key at first-time setup.

**AI (optional):** copy `.env.example` to `.env.local` and fill in your Firebase web config and App Check site key (never commit it). Then use desktop Chrome 148+ and go to More → AI check → Prepare on-device model. Details: docs/AI_INTEGRATION.md. Firebase console setup: docs/FIREBASE_SETUP.md. Live test checklist: docs/LIVE_AI_TEST_CHECKLIST.md. Demo steps: docs/DEMO_READINESS.md. **Live status:** genuine Firebase cloud inference (gemini-3.5-flash-lite, App Check) verified on the owner's PC; Gemini Nano is mock-tested only (blocked by that PC's hardware). Demo: docs/DEMO_WALKTHROUGH.md.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build the offline app into `dist/` |
| `npm run preview` | Serve the built app on port 4173 |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright). Set `CHROME_PATH` to use a local Chrome |

## Stack

React 18 + TypeScript (strict) + Vite + React Router · Tailwind with the Stitch v3 design tokens · Dexie (IndexedDB) · vite-plugin-pwa (offline) · Vitest + Testing Library · Playwright.

## Folder map

```
src/db/          19-table schema, Dexie database, seed import, audit hash chain, entry repository
src/lib/         clock, phase, cloud guard, vitals rules, PIN hashing, dose format
src/state/       app + session context (dataset, phase, signed-in nurse, lock)
src/components/  shell (header, sidebar) and shared UI
src/features/    auth, ward, patient, vitals, meds, charting, body, handoff, capture, entries, misc
src/assets/medical/  local Theme 2 illustrations (WebP)
scripts/         seed generator, icon extraction
e2e/             Playwright tests
docs/            planning documents and the project docs below
```

## Project docs

- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — what works, what is next
- [DECISIONS.md](DECISIONS.md) — choices made and open questions
- [ROUTES.md](ROUTES.md) — every page and its state
- [DATA_MAPPING.md](DATA_MAPPING.md) — screen fields → database fields
- [TEST_REPORT.md](TEST_REPORT.md) — latest test run
- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) — honest gaps
- [DEPLOYMENT.md](DEPLOYMENT.md) — how to ship it
- [docs/ASSETS.md](docs/ASSETS.md) — body map artwork and medical illustrations
- [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md) — on-device AI requirements and status
