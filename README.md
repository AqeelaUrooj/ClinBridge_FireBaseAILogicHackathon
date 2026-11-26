# ClinBridge

Offline nursing documentation for when the hospital EHR (electronic health record) goes down, with Firebase AI Logic hybrid inference.

When ransomware or an outage takes the EHR offline, nurses fall back to paper and the records pile up for weeks of back-entry. ClinBridge runs in Chrome on a ward laptop with no network. Nurses keep charting vitals, medicines, notes, fluids, labs, body map and handovers into an encrypted local database. When systems come back, an admin clears the network, and Firebase AI Logic gives a cloud "second look" at paper-photo records before they are exported as FHIR R4 for the EHR.

**Live demo (fictional patients only): https://clinbridge-hackathon.web.app** · [Judge demo guide](docs/JUDGE_DEMO_GUIDE.md)

![ClinBridge ward board with fictional Practice patients](docs/images/readme/03-ward-board.webp)

More pictures: [Screenshots](#screenshots).

## Three ways to use it

| | Get it | Source | Guide | Tests |
|---|---|---|---|---|
| **Web application** | [Launch the demo](https://clinbridge-hackathon.web.app) | [`src/`](src) | [Judge demo guide](docs/JUDGE_DEMO_GUIDE.md) | [Release report](docs/RELEASE_REPORT_2026-11-25.md), [first release](docs/RELEASE_REPORT_2026-11-24.md), [test report](TEST_REPORT.md) |
| **Desktop application** (the web application, installed by Chrome or Edge) | **Install Desktop App** on the website | [`src/`](src) | [Installation](docs/JUDGE_DEMO_GUIDE.md#install-it-windows-laptop-chrome-or-edge) | [Offline tests](docs/PHYSICAL_OFFLINE_TESTS.md) |
| **Android application** (separate, Practice only, offline, no AI) | [APK 0.1.0](https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon/releases/tag/android-v0.1.0) | [`mobile/`](mobile) | [Installation](mobile/docs/INSTALL_ANDROID.md) | [Test report](mobile/docs/TEST_REPORT_2026-11-25.md), [phone test](mobile/docs/PHYSICAL_ANDROID_RESULTS_2026-11-25.md) |

Architecture: [web and hybrid AI](docs/AI_INTEGRATION.md) · [Android](mobile/docs/ARCHITECTURE_AND_DECISIONS.md). Firebase AI features are in the web application, not in the Android application.

> **Prototype. Not approved for real patients.** Practice mode uses fictional patients only. Never type real patient information into it.

## What works today

| Area | Status | Evidence |
|---|---|---|
| Offline nursing documentation (vitals, medicines with high-alert second check, notes, fluids, labs, body map, handover, paper-photo capture) | **Working** | Unit tests, Playwright browser tests, including a production build with the network off |
| Encrypted local records (AES-256-GCM per record, unit passphrase, tamper-evident audit chain) | **Working, prototype**: names, values and notes are encrypted; ids, times and statuses stay readable but tamper-checked. Not reviewed by hospital security | Unit tests; checked live after reload. Gaps: `KNOWN_LIMITATIONS.md` |
| System Down blocks cloud AI: no new cloud call can start, and a call already running is aborted and its answer thrown away | **Verified** (automated tests; cloud button blocked and 0 requests seen live). An abort can't recall data that had already been sent | Unit + browser tests; `docs/AI_INTEGRATION.md` |
| Back Online network clearance by an admin, then cloud second look (never edits the record) | **Verified live** | `docs/LIVE_TEST_RESULTS_2026-11-22.md` |
| Genuine Firebase cloud AI (`gemini-3.5-flash-lite`, `ONLY_IN_CLOUD`, App Check enforced), text notes and paper-form photos | **Live-tested** on the owner's PC, 20 and 22 Nov 2026, and on the live site with real App Check, 24 Nov 2026 | `docs/RELEASE_REPORT_2026-11-24.md`, `docs/LIVE_TEST_RESULTS_2026-11-24.md`, `docs/LIVE_TEST_RESULTS_2026-11-20.md`, `docs/LIVE_TEST_RESULTS_2026-11-22.md` |
| Gemini Nano on-device inference (`ONLY_ON_DEVICE`, network blocked during the call) | **Implemented and mock-tested, not live-verified.** The test PC's hardware can't run Gemini Nano | `docs/AI_TEST_MATRIX.md`, `docs/GEMINI_NANO_VERIFICATION_CHECKLIST.md` |
| FHIR R4 export (file) | **Working**: 0 errors from the official HL7 validator in CI. Many fields are free text; no live EHR link | `docs/FHIR_VALIDATION.md` |
| Admission lifecycle: Admission Staff role, registration, provisional registration by a nurse during System Down, temporary IDs, beds, transfer, discharge, identity reconciliation (Practice only) | **Working, prototype policy**: fictional patients only; not a hospital registration system | Unit and offline browser tests; `docs/ADMISSION_ARCHITECTURE.md` |
| Real patient deployment | **Not approved** | Clinical rules and security are prototypes (`KNOWN_LIMITATIONS.md`) |

AI is optional. Every record can be typed by hand, and no AI proposal is ever saved as confirmed: a nurse checks it against the paper first.

## Screenshots

All screens show **fictional Practice patients** only. Click a picture to see it larger. Web pictures come from the judge build (1440 px wide); the phone pictures are 390 px (web) and 360 dp (Android).

### Web application

| | |
|---|---|
| <a href="docs/images/readme/01-landing.webp"><img src="docs/images/readme/01-landing.webp" alt="Landing page: launch the demo, install the desktop app or get the Android app" width="420"></a><br>Landing page: launch the demo, install the desktop app or get the Android app | <a href="docs/images/readme/02-sign-in.webp"><img src="docs/images/readme/02-sign-in.webp" alt="Sign in: choose a Practice staff member, then a PIN" width="420"></a><br>Sign in: choose a Practice staff member, then a PIN |
| <a href="docs/images/readme/03-ward-board.webp"><img src="docs/images/readme/03-ward-board.webp" alt="Ward board: fictional patients, alerts, vitals due" width="420"></a><br>Ward board: fictional patients, alerts, vitals due | <a href="docs/images/readme/04-patient-summary.webp"><img src="docs/images/readme/04-patient-summary.webp" alt="Patient summary with allergies and recent records" width="420"></a><br>Patient summary with allergies and recent records |
| <a href="docs/images/readme/05-record-vitals.webp"><img src="docs/images/readme/05-record-vitals.webp" alt="Recording vital signs offline" width="420"></a><br>Recording vital signs offline | <a href="docs/images/readme/06-medication-record.webp"><img src="docs/images/readme/06-medication-record.webp" alt="Medication record (MAR) with high-alert second check" width="420"></a><br>Medication record (MAR) with high-alert second check |
| <a href="docs/images/readme/07-body-map.webp"><img src="docs/images/readme/07-body-map.webp" alt="Body map assessment" width="420"></a><br>Body map assessment | <a href="docs/images/readme/08-handwritten-report.webp"><img src="docs/images/readme/08-handwritten-report.webp" alt="Handwritten-style Practice report, drawn from the records" width="420"></a><br>Handwritten-style Practice report, drawn from the records |

### Downtime, hybrid AI and recovery

| | |
|---|---|
| <a href="docs/images/readme/09-system-down.webp"><img src="docs/images/readme/09-system-down.webp" alt="Admin starts a practice outage: System Down, cloud blocked" width="420"></a><br>Admin starts a practice outage: System Down, cloud blocked | <a href="docs/images/readme/10-device-vs-cloud.webp"><img src="docs/images/readme/10-device-vs-cloud.webp" alt="Device vs Cloud: the same fictional input through each model, labelled" width="420"></a><br>Device vs Cloud: the same fictional input through each model, labelled |
| <a href="docs/images/readme/15-recovery-identity.webp"><img src="docs/images/readme/15-recovery-identity.webp" alt="Recovery worklist: a provisional patient waits for identity reconciliation" width="420"></a><br>Recovery worklist: a provisional patient waits for identity reconciliation | <a href="docs/images/readme/16-fhir-export.webp"><img src="docs/images/readme/16-fhir-export.webp" alt="FHIR R4 export file for the EHR" width="420"></a><br>FHIR R4 export file for the EHR |

### Admission lifecycle (Practice only)

| | |
|---|---|
| <a href="docs/images/readme/11-register-patient.webp"><img src="docs/images/readme/11-register-patient.webp" alt="Admission Staff registers a fictional patient: bed, nurse, allergies" width="420"></a><br>Admission Staff registers a fictional patient: bed, nurse, allergies | <a href="docs/images/readme/12-admissions-dashboard.webp"><img src="docs/images/readme/12-admissions-dashboard.webp" alt="Admissions dashboard: beds and active stays" width="420"></a><br>Admissions dashboard: beds and active stays |
| <a href="docs/images/readme/13-stay-and-transfer.webp"><img src="docs/images/readme/13-stay-and-transfer.webp" alt="Stay page after a transfer, with location history" width="420"></a><br>Stay page after a transfer, with location history | <a href="docs/images/readme/14-ward-provisional.webp"><img src="docs/images/readme/14-ward-provisional.webp" alt="Ward board with a provisional patient (temporary ID) added by a nurse during System Down" width="420"></a><br>Ward board with a provisional patient (temporary ID) added by a nurse during System Down |

### Phone

| Web app on a phone | Android app: ward | Android app: vitals |
|---|---|---|
| <img src="docs/images/readme/17-phone-ward.webp" alt="Web app ward board at phone width" width="230"> | <img src="docs/images/readme/18-android-ward.webp" alt="Android app ward list" width="230"> | <img src="docs/images/readme/19-android-vitals.webp" alt="Android app vital signs editor" width="230"> |

Android pictures come from the app's visual parity test (`mobile/docs/VISUAL_DIFFERENCES.md`). The Android app is separate, Practice only, offline, and has no AI.

## How the hybrid AI works

| Phase | What the AI may do | Inference mode |
|---|---|---|
| **System Down** | On-device only (Gemini Nano in Chrome), if the laptop supports it. No cloud call can start. A cloud call that was already running is aborted and its answer thrown away, but anything it had already sent has left the laptop (that's why cloud only ever runs on Practice data or after clearance). If on-device isn't available, the nurse types the values; nothing goes to the cloud | `ONLY_ON_DEVICE` |
| **Back Online** (after an admin's network clearance) | Cloud second look at paper-photo records: lists where the cloud reading differs from what the nurse typed. Nothing is changed automatically; fixes are new versions with a reason | `ONLY_IN_CLOUD` |
| **Practice: Device vs Cloud** | Runs the same fictional note or handwritten Practice report through each model separately, labelled with where it really ran | both, never mixed |

`PREFER_ON_DEVICE` and `PREFER_IN_CLOUD` are never used, because they can switch engines silently.

Firebase AI Logic in the code:
- `src/lib/ai/firebase.ts`: `getAI` with `GoogleAIBackend`, `getGenerativeModel` with `InferenceMode.ONLY_ON_DEVICE` or `ONLY_IN_CLOUD`, App Check (reCAPTCHA Enterprise) on a separate `clinbridge-cloud` app.
- `src/lib/ai/service.ts`: `generateContent` calls, JSON schemas, checks that `inferenceSource` matches the mode, network blocked during on-device calls.
- `src/lib/cloudGate.ts`, `src/lib/cloud.ts`: the rules that block cloud calls during System Down.
- Details: [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md).

## Run it

Needs Node.js 22 or newer and desktop Chrome.

```bash
npm ci
npm run dev          # http://localhost:5173
```

1. **Open and unlock:** the address shows the public page; press **Launch Practice Demo** (or open `/sign-in`). Then press **Use practice passphrase** (`practice only fake patients`; public on purpose, it protects only fake data). Real records get their own passphrase and recovery key at first-time setup.
2. **Sign in:** pick any person, PIN **2468** (Practice only). Nurses (RN) chart; Kim Ellis (Admin) runs downtime and recovery.
3. **Try an outage:** as Admin → Downtime Management → **Start a practice outage**. Chart as a nurse. Then Admin → Downtime Management → tick the checks → **Clear network — Back online** → Recovery Gate & Worklist.

Everything above works with no Firebase setup and no network.

**AI (optional):** copy `.env.example` to `.env.local` and fill in your Firebase web config and App Check site key (never commit it). For local development, App Check debug tokens work (`VITE_FIREBASE_APPCHECK_DEBUG=true`, then register the token in the Firebase console). On-device AI needs desktop Chrome with Gemini Nano support: More → AI check → **Prepare on-device model**. Setup: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md). Demo steps: [docs/DEMO_WALKTHROUGH.md](docs/DEMO_WALKTHROUGH.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build the offline app into `dist/` |
| `npm run preview` | Serve the built app on port 4173 |
| `npm run build:judge` · `check:judge` · `preview:judge` · `test:judge` | Public judge website: Practice only, installable ([docs/JUDGE_DEMO_GUIDE.md](docs/JUDGE_DEMO_GUIDE.md), [DEPLOYMENT.md](DEPLOYMENT.md)) |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright; runs against `dist/`, so build first). Set `CHROME_PATH` to use a local Chrome |

CI (`.github/workflows/ci.yml`) runs all of these on every push and pull request, plus the official HL7 FHIR validator on the export.

## Stack

React 18 + TypeScript (strict) + Vite + React Router · Firebase JS SDK 13.4 (Firebase AI Logic, App Check) · Dexie 4 (IndexedDB, 19 tables) with AES-256-GCM encryption · vite-plugin-pwa (offline) · Tailwind with design tokens from a Google Stitch export · Vitest + Testing Library · Playwright.

## Folder map

```
src/db/          19-table schema, encrypted Dexie database, seed import, audit hash chain, repositories
src/lib/         clock, phase, cloud gate, vitals rules, PIN hashing, FHIR export, history logic
src/lib/ai/      Firebase AI Logic: setup, on-device and cloud calls, readiness checks
src/state/       app + session context (dataset, phase, signed-in nurse, lock)
src/components/  shell (header, sidebar) and shared UI
src/features/    auth, ward, patient, vitals, meds, charting, body, handoff, capture, recovery, admin, ai, misc
src/assets/medical/  local illustrations (WebP)
mobile/          native Android Practice app (Flutter), its own tests and docs
scripts/         seed generator, icon extraction, FHIR summary
e2e/             Playwright tests
docs/            planning documents and the project docs below
```

## Project docs

- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md): what works, what is next
- [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md): honest gaps
- [DECISIONS.md](DECISIONS.md): choices made and open questions
- [ROUTES.md](ROUTES.md): every page and its state
- [DATA_MAPPING.md](DATA_MAPPING.md): screen fields → database fields
- [TEST_REPORT.md](TEST_REPORT.md): latest test runs
- [DEPLOYMENT.md](DEPLOYMENT.md): how to ship it
- [docs/AI_INTEGRATION.md](docs/AI_INTEGRATION.md): hybrid AI design and status
- [docs/ADMISSION_ARCHITECTURE.md](docs/ADMISSION_ARCHITECTURE.md): roles, registration, transfer, discharge, identity reconciliation, database version 3
- [docs/FHIR_VALIDATION.md](docs/FHIR_VALIDATION.md): export validation results
- [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md): security notes
- [docs/ASSETS.md](docs/ASSETS.md): body map artwork and illustrations
- [docs/DEVPOST_SUBMISSION.md](docs/DEVPOST_SUBMISSION.md): hackathon submission text
- [docs/DEMO_VIDEO_SCRIPT.md](docs/DEMO_VIDEO_SCRIPT.md): 3-minute demo script and shot list

## Name

ClinBridge was called DowntimeKit while it was being planned. The planning documents in `docs/` and some storage names (for example the `downtimekit-backups` database and `downtimekit-seed.json`) keep the old name on purpose: renaming storage would cut existing laptops off from their saved data.

## Licence

Apache License 2.0, see [LICENSE](LICENSE). Third-party packages keep their own licences; the Inter font stays under the SIL Open Font License 1.1. See [NOTICE](NOTICE).
