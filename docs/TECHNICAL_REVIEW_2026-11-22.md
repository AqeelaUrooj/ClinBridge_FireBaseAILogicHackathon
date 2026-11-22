# ClinBridge technical review: 22 Nov 2026

For the owner's review before any submission work. State at `main` = `e9f17c7` plus PR #13 (docs, licence and product name only). Fictional Practice data only.

**Bottom line:** the offline nursing workflow and genuine Firebase cloud AI work and have been seen live. Gemini Nano on-device inference is real code but only tested with mocks, because the test PC's hardware can't run it. ClinBridge is a prototype and is not approved for real patients.

## 1. What works, by evidence level

### Implemented and live-tested
Seen on the owner's PC (DESKTOP-6NQ637E, Windows 10, Chrome 157, real Firebase project) on 20 and 22 Nov 2026. Evidence: `docs/LIVE_TEST_RESULTS_2026-11-20.md`, `docs/LIVE_TEST_RESULTS_2026-11-22.md`.

| Feature | What was seen |
|---|---|
| Practice unlock, PIN sign-in, patient check (name, born, MRN) | Walkthrough rehearsal |
| System Down (practice outage) | Banner "Cloud blocked"; cloud buttons disabled; 0 external requests during the on-device attempt |
| Offline-style charting and paper-photo capture | Vitals typed beside a form photo, confirmed with the photo |
| On-device unavailable fallback | "The on-device model can't run with images on this laptop. Type the values instead."; nothing sent |
| Encrypted storage, persistence after reload | Unlock after reload, records still there |
| Network clearance → Back online | Admin checks + PIN; banner "Cloud allowed" |
| Genuine Firebase cloud inference | `gemini-3.5-flash-lite`, `ONLY_IN_CLOUD`, HTTP 200, App Check enforced (401 without a registered debug token). Text and form photos: all 7 vitals values correct in each of four extraction tests; values that weren't written came back `null` |
| Cloud second look | Lists differences, "Nothing was changed automatically"; record unchanged |
| Nurse-reviewed AI draft | Saved as a draft labelled "Made by the cloud model… It may be wrong"; left unconfirmed |
| Sidebar groups, ward tools, patient history (round 12) | Checked by hand in Chrome |

### Implemented, automated tests only
Covered by Vitest (210 passed, 1 skipped) and Playwright (34 tests), run locally and in CI. Not walked through by hand in a live session, or only partly.

| Feature | Tests |
|---|---|
| True network-off use of the production build (service worker), restart off-line | `vitals-slice`, `restart`, `admin-recovery` (network off) |
| High-alert medicine: second nurse's own PIN required, also enforced in the database layer | `meds.spec`, unit tests |
| Dose different from the order warns; held/refused need a reason | `meds.spec` |
| Fluids, notes, labs (critical result read-back), body map (21 regions), SBAR handover | `charting`, `body-map`, `handover` |
| Corrections as new versions with a reason; entered-in-error | `vitals-slice`, `charting` |
| Audit hash chain and its check | `audit.test.ts` |
| Encryption at rest, tamper detection, migration on Practice, encrypted backup and restore, second-laptop enrollment, guarded cleanup | `encryption*`, `backup`, `enrollment`, `cleanup` |
| Recovery worklist rules and sign-off | `admin-recovery` |
| FHIR R4 export | `fhir*.test.ts`, `admin-recovery`; **official HL7 validator in CI: 0 errors** (last documented counts: 11 warnings, 418 information) |
| Cloud request aborted when System Down starts; late answer discarded | 7 unit + 1 browser test (`ai.spec`) |
| Gemini Nano path (`ONLY_ON_DEVICE`, network blocked, `inferenceSource` checked) | Mock Prompt API (`service.test.ts`, `ai.spec`) |
| Role separation: nurses can't open admin pages; admin actions checked in the database layer | `navigation`, `admin-recovery` |
| Wrong-PIN lockout, idle lock | `vitals-slice`, unit tests |

### Not implemented, blocked or not approved

| Item | Status |
|---|---|
| Gemini Nano live inference | **Blocked by hardware** on the test PC (2 GB VRAM, 8 GB RAM, 2 cores). Needs a compatible laptop (`docs/GEMINI_NANO_SECOND_LAPTOP.md`) |
| Real patient use | **Not approved**: clinical rules and security are prototypes |
| Real-records migration and plaintext cleanup | **Not approved** (P-04, P-06). Not done; the cleanup is refused for Real records |
| Hosted deployment | None. Runs locally only |
| Stitch-design items not built | Printable downtime sheets and spooler, verbal orders and countersignature, NEWS2, oliguria alerts, dual sign-offs, mesh networking, port-9100 printing, RFID, mTLS/DNS probes, SQLite-WASM, landing page, SpO₂ trend, 24-region body map (21 now). Reasons: `docs/ZIP_REQUIREMENTS_TRACEABILITY.md` |
| Clinical decision support | No dose-range, allergy-vs-drug or interaction checks; no Overdue status; warning ranges are placeholders (only warn) |
| AI beyond vitals | None on purpose (D-60): no AI for medicines, notes or handover |

## 2. Database integrity

- 19 tables (`V1_STORES` in `src/db/db.ts`), Dexie version 2 (additive `entry.change_reason`). PR #13 changes nothing under `src/db`.
- Records are append-only: fixes are new versions (`supersedes_id`, reason required); mistakes are marked entered-in-error, never deleted.
- Every write adds a SHA-256 hash-chained audit row; `verifyChain` checks it (patient history and More → Change log check).

## 3. Security restrictions

- AES-256-GCM per row and per photo; unit passphrase plus recovery key; lock after reload and when idle. Practice uses a public passphrase on purpose (fake data only).
- Gaps (`KNOWN_LIMITATIONS.md`): ids, times and statuses are readable (but tamper-checked); no rollback detection; key in memory while unlocked; not reviewed by hospital security.
- Cloud rules (`src/lib/cloud.ts`, `src/lib/cloudGate.ts`): no cloud in System Down; second look only after network clearance; compare on Practice only. Re-checked before setup, right before sending, and when the answer arrives. A running request is aborted on a phase change, but **data already sent can't be recalled**.
- `PREFER_ON_DEVICE` / `PREFER_IN_CLOUD` never used. App Check is started only for cloud calls; debug tokens only in development builds.
- Secrets: `.env.local` is ignored by Git; secret scans on every PR found nothing. The App Check debug token "DESKTOP-6NQ637E localhost dev (22 Nov)" is registered in the Firebase console and must be revoked after the demo.

## 4. UI and navigation

- Nurse sidebar: Primary operations (My Patients, Add Note / Form, Handover, Alerts & Orders), Clinical tools (Medication Schedule, Vitals Flowsheet, Fluid Balance, Lab Results, Body Map; they follow the open patient) and More.
- Admin sidebar: Readiness & Storage, Downtime Management, Recovery Gate & Worklist, Audit Log, Alerts & Orders, More.
- Every route works (`ROUTES.md`); unknown addresses show "Page not found".
- Product name ClinBridge in the app (PR #13). Storage names keep `downtimekit-…` so saved data stays readable.

## 5. Known clinical limitations

Warning ranges, the high-alert list, second-checker roles and medicine timing are placeholders marked "not approved" (`src/config/clinicalPolicy.ts`, More → Clinical settings). Fluid totals are per calendar day. Labs are typed in by nurses. FHIR export is a file with many free-text fields, not an EHR interface.

## 6. Automated test results (PR #13 head, local)

Run on DESKTOP-6NQ637E (Windows 10, Node 24.21.0) after the last change in PR #13:

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npx vitest run` | **210 passed, 1 skipped** (31 files). The skipped one writes the bundle for the HL7 validator and runs only in CI. Includes encryption (15), encrypted backup (10), reliability (9), audit chain (3), cloud rules (3), AI service with the mock Prompt API (26), Firebase/App Check setup (2), AI readiness (5), FHIR (3) |
| `npm run build` | Pass (PWA, 26 precache entries) |
| `npx playwright test` (production build) | **34 / 34 pass**, including network-off use, the browser restart, AI with a mock model and zero external requests, and cancelling a cloud request on System Down |
| Secret scan (all tracked files + branch diff) | No keys, tokens or private keys. Tracked env files: `.env.example` (empty) and `.env.e2e-ai` (fake values for tests) |
| Official HL7 FHIR validator | Runs in CI (`fhir-validate`) on each push; result recorded on the PR |

## 7. Open technical concerns

1. Gemini Nano live verification is the main gap for the hackathon's Web (Chrome) requirement.
2. The on-device guard depends on Firebase SDK 13.4.0 internals; re-check on any SDK upgrade.
3. A hosted build would need a third-party licence file shipped with `dist/` (see `DEPLOYMENT.md`) and the App Check site key registered for the domain.
4. A flaky audit test (PIN digits appearing by chance inside a random SHA-256 value) failed CI once on `2e9603d`; replaced with structural checks (`TEST_REPORT.md`, round 13). No PIN was logged.
5. FHIR warning/information counts for the latest CI runs weren't readable (log view truncated); the job fails on any error, so errors are 0.
