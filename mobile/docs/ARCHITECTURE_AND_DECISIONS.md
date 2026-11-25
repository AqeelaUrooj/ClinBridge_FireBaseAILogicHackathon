# Architecture and decisions

ClinBridge Practice for Android: native-rendered (Flutter), offline, fictional patients only. Prototype, not approved for real patients.

## Baseline

| Item | Value |
|---|---|
| Upstream | `main` = `origin/main` = `5e18173` (checked 25 Nov 2026). `59dc187` is an ancestor; only documents differ. `0d3c51c` is only on `origin/feat/judge-practice-pwa` |
| Existing mobile project, `AGENTS.md`, `CLAUDE.md` | none |
| Isolation | branch `feat/android-practice-app`, everything in `mobile/`. Website, PWA, hosting and Firebase files are unchanged |
| Rules ported from | `src/config/{clinicalPolicy,clinicalWarnings,medicationPolicy,securityPolicy}.ts`, `src/lib/{vitals,meds,charting,recovery,fhir,photoQuality,time,phase,dose,crypto}.ts`, `src/db/repos/{entries,admin,worklist,handoff,export}.ts`, `src/db/{audit,seed,vault,encryption}.ts`, `src/state/app.tsx`, `src/features/{auth,patient,ward,meds,body,charting,capture,recovery}` |
| Their tests read | `src/db/repos/*.test.ts`, `src/lib/*.test.ts`, `src/db/{audit,encryption,reliability}.test.ts` |

## Stack

Flutter 3.29.0 / Dart 3.7.0 (installed), Android `minSdk 26`, `targetSdk`/`compileSdk 35`, NDK 27.0.12077973, Gradle 8.10.2, AGP 8.7.0, Kotlin 2.0.21, JDK 17.

Why Flutter and not Kotlin/Compose: it was installed; the whole app, the real SQLCipher database and the pictures can be tested on this PC without a phone; the PC (8 GB, 2 cores) can not run an emulator. Why not a WebView: forbidden by the task, and the store, keys and camera need Android anyway.

| Part | Choice |
|---|---|
| Records | SQLCipher 4 (`sqlcipher_flutter_libs` 0.6.8 + `sqlite3` 2.9.4), WAL, `synchronous=FULL`, `temp_store=MEMORY`, `secure_delete`. Every row is a JSON document under the web app's field names. One synchronous transaction per action |
| Key | random 256-bit database key → AES-256-GCM with PBKDF2-HMAC-SHA256 (600,000) of the passphrase, and again of the recovery code → sealed by a non-exportable AES-256-GCM key in Android Keystore. Files in `noBackupFilesDir` |
| Practice secrets | the web app's PUBLIC practice passphrase, recovery code and PIN. They give no confidentiality against someone who has this phone and this app; they are shown on purpose |
| Android side | one Kotlin file (`MainActivity.kt`): Keystore, PBKDF2, battery, storage, save screen (SAF), print screen, photo picker, CameraX with pictures in memory, recent-apps cover |
| Network | the release manifest has no INTERNET permission. `ACCESS_NETWORK_STATE` only shows what Android says |
| Backup | `allowBackup=false`, backup and device-transfer rules exclude everything |
| Tables | the 19 clinical tables are unchanged. 12 mobile support tables (`m_*`, see `lib/data/schema.dart`) hold PIN counters, drafts, idempotency keys, photos, body findings, checklist ticks, attestations, shift sign-off, recovery decisions, assignments, seeded holds. They are never exported |

## Three states kept apart

Vault (records open) → signed-in person → verified patient. Leaving one closes the ones inside it. Screens ask `AppState.ctx()` for a context per action; the repositories refuse it when person, lock or patient changed.

## Datasets

- **Installed app:** the approved `downtimekit-seed.json` (10 patients, 7 staff, 49 records, 153 audit rows; the seed's audit chain verifies in Dart).
- **Pictures only:** `test/fixtures/design.json` with the Stitch people. Canonical identity: Arthur Pendelton, MRN 9402-1842, born 18 Apr 1958, bed 412-A, allergies penicillin (anaphylaxis, severe) and latex (contact dermatitis, moderate). The exports contradict each other: MRN 9402-1842 / 9402-8819 / 884-9021 / 884-209-14 / 940-281-99; born 14 Oct 1955 / 12 Apr 1958 / 18 Apr 1958 / 14 May 1958 / 14 Nov 1984; bed 412-A / 402-B; "Arthur James" only on the verify screen; NKA/NKDA chips on an allergic patient. Elena Rostova is "NP" in the export; the schema has only RN, LPN and admin, so RN.

## Rules that are stricter than, or additional to, the web app (please review)

| Rule | Where it comes from |
|---|---|
| A dose closer than the order's own "every N hours" is blocked (web: flagged in recovery) | task, screen 10/13; `recovery.ts` rule |
| A scheduled time with a live record or waiting draft is blocked for given, held and refused; a given dose of a scheduled order must name its due time | task ("duplicate or conflicting dose windows"); independent review |
| An explicit seeded hold blocks "given" and a higher rate | task, screen 13. No hold exists in the installed dataset |
| High-alert doses need an attestation bound to patient, order, values, times, checklist and primary nurse; single use | task, screen 12 |
| PIN tries and lockout (5 tries, 1 minute, web values) survive restart | task, screen 3. The export says 5 minutes; the repository policy says 1 |
| Vital-sign warnings must be ticked as re-checked (web rule) | web |
| Shift sign-off: all patients of the own list or cared for in this shift need a final SBAR; two different RNs with their own PINs; no bypass | task, screen 21; second-checker policy |
| Recovery: a flagged item needs a written reason | task, screen 24 |
| A never-confirmed draft can be put aside as a mistake; it is never exported | independent review |
| Recovery counts the minute in which the downtime was declared as inside (forms keep minutes) | end-to-end test |
| FHIR file: same resources as the web export, plus a `HTEST` test-data tag | task |

## Open policy gaps (nothing was invented)

Battery threshold and freeze policy · physician override · drug interaction or allergy cross-check · medication timing windows ("overdue") · automatic reading of paper (AI/OCR) · who may decline a second check without a PIN (a decline is written by the primary nurse, marked `witness_pin_checked: false`) · "puff" as a dose unit · prescriber of a new infusion rate · pharmacy phone number.

## Not built, needs approval

Cloud or on-device AI, Firebase (no mobile app registered), EHR re-ingest, mesh/BLE/AirDrop, barcode/wristband scan, hardware key, biometric sign-in, thermal printer, store publication.
