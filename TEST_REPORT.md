# Test report

Run: 20 Nov 2026 (round 9), local (Linux, Node 22, Chrome for Testing 153) on branch `feat/ai-hybrid`. All runs below happened after the last code change.

| Check | Result |
|---|---|
| `npm run typecheck` | Pass (exit 0) |
| `npm run lint` | Pass (exit 0) |
| `npm test` (Vitest) | **185 pass, 1 skipped** (27 files + 1 skipped) |
| `npm run build` | Pass (PWA, 26 files precached incl. the Firebase chunks) |
| `npm run test:e2e` (Playwright) | **30 / 30 pass** (second server: AI build with fake Firebase values) |
| Real AI model | **Not run.** Sandbox Chrome 153: Prompt API present, model "unavailable" |

## Round 11: local checks + live rehearsal on the owner's PC (22 Nov 2026)

Full write-up: `docs/LIVE_TEST_RESULTS_2026-11-22.md`. DESKTOP-6NQ637E, Windows 10, Node 24.21.0, Chrome 157, `main` = `6636639`, project folder `D:\ClinBridge_FireBaseAILogicHackathon`. No code changed.

Automated, run locally (separate from CI):

| Check | Result |
|---|---|
| `npm run typecheck` | Pass (exit 0) |
| `npm run lint` | Pass (exit 0) |
| `npx vitest run` | **199 passed, 1 skipped** (28 files + 1 skipped) |
| `npm run build` | Pass (PWA, 26 precache entries) |
| `npx playwright test` | **31 / 31 pass** (bundled Chromium) |
| FHIR R4 validator | Not run locally (no Java); CI on `6636639`: 0 errors |

Live (synthetic Practice data, real Firebase project):

- **App Check enforcement: PASS.** 401 "Firebase App Check token is invalid" before the owner registered a fresh debug token; 200 after.
- **Genuine cloud inference: PASS.** `gemini-3.5-flash-lite`, HTTP 200, label "Cloud · ONLY_IN_CLOUD": text 7/7 (11489 ms first call, 1990 ms, 2803 ms), image 7/7 (3577 ms, IMAGE 1080 tokens). Unwritten fields (blood sugar, O2 flow) stayed `null`.
- **On-device fallback: PASS** (Gemini Nano still **blocked by hardware**): clear message, 0 requests.
- **Nurse review: PASS.** No review button for Admin; RN gets a draft with the cloud label, all fields editable; not auto-confirmed.
- **Demo walkthrough (10 steps): steps 1–9 PASS live** (Wi-Fi on, network logged: 0 external requests while documenting); FHIR file validation CI only; step 10 hardware-blocked.
- **Cloud second look: PASS.** 200, 4052 ms, IMAGE 1100 tokens; only the two hand-left-blank fields differ; record unchanged.
- Findings, not defects: the Practice clock restarts at 13:20 on each page load (downtime history can show Back online before System down after the walkthrough's reload); a photo record whose care time is before the practice outage start is not added to the worklist.

## Round 10: live tests on the owner's PC (20 Nov 2026)

Full write-up: `docs/LIVE_TEST_RESULTS_2026-11-20.md`. Real Chrome 157 on DESKTOP-6NQ637E, real Firebase project `clinbridge-hackathon`, synthetic Practice data.

- **Genuine cloud inference: PASS** (after fixes): gemini-3.5-flash-lite, HTTP 200, in_cloud, text 2.9–9.7 s, image 1080–1100 image tokens; App Check enforced (401 without a registered debug token).
- **Gemini Nano: BLOCKED (hardware).** Prompt API present; text and image availability "unavailable".
- **System Down (network logged): PASS.** Cloud blocked; on-device fallback message; manual photo capture saved and confirmed; 0 external requests; encrypted at rest after reload.
- **Back online second look: PASS.** 7/7 values from the photo; differences shown; record unchanged.
- **Defects found live and fixed** (branch `fix/app-check-cloud-instance`): (1) App Check not attached to cloud calls → separate cloud Firebase app, App Check before getAI; regression test `src/lib/ai/firebase.test.ts` (2) fails on old code. (2) Cloud model skipped written values → required+nullable described schema; tests in `service.test.ts`. Admin readiness no longer shows on-device AI green just because the API exists.
- Automated after the fixes: typecheck, lint, Vitest **199 passed / 1 skipped**, build, Playwright **31/31**.

## Round 9 additions (AI)

- `src/lib/ai/service.test.ts` (14). Real Firebase SDK 13.4.0 browser build, **mock** LanguageModel, fetch spy, App Check mocked:
  - The SDK pitfall: ONLY_ON_DEVICE without the Prompt API goes to the cloud.
  - System down: refused without the Prompt API; on-device proposal labelled on_device with 0 network; unavailable and not-downloaded reasons; a network attempt discards the result; not configured.
  - Cloud refused for every purpose in System down.
  - PNG image part sent to the device; WebP refused, not uploaded.
  - Practice cloud compare: ONLY_IN_CLOUD, labelled in_cloud, schema sent. Compare on Real records, second look before clearance, and a missing App Check key are all refused.
  - Parsing and diff.
- `src/lib/ai/readiness.test.ts` (5): Chrome 148 ready; installed but not downloaded; text OK but image off → flag hint; old Chrome / no API / no config / System down; version parsing.
- `src/db/repos/drill.test.ts` (1): practice outage drill, audited, admin and Practice only.
- `e2e/ai.spec.ts` (3, **mock** Prompt API, fake Firebase values):
  - System-down drill → photo → on-device proposal labelled ONLY_ON_DEVICE → nurse edits → draft → "Device AI", with **0 external requests**.
  - No usable on-device AI → clear message, nothing sent, manual save works.
  - The AI check page shows "Not downloaded yet" even though Chrome is installed, Firebase initialised, and the System-down mode as ONLY_ON_DEVICE.
- `e2e/capture.spec.ts`: seed proposals are shown as "simulated, not a model answer".
- Pre-merge checks for PR #7 (owner's final checks A and B):
  - `service.test.ts` +11 (now 25): **cloud request during a mode change** (7): pending request + System down → aborted, answer discarded; server answers anyway → discarded; System down in the database before send → refused, 0 requests; phase flips in the database while in flight → discarded; stale screen snapshot → refused; second look aborted when Back online ends, compare aborted on dataset switch; unreadable phase → refused. **inferenceSource contract** (4): SDK version and constant values pinned; runtime value from the real SDK is `InferenceSource.ON_DEVICE` (`'on_device'`); other spellings / unknown / missing rejected; the on-device path never accepts a cloud-labelled answer.
  - Mutation check: with the gate's abort and on-arrival check disabled, 4 of the 7 mode-change tests fail.
  - `e2e/ai.spec.ts` +1 (now 4): pending cloud compare, then a second tab declares a practice outage → request cancelled, "Cloud answer discarded", late answer never shown. reCAPTCHA, App Check and Gemini are local stand-ins (no Google traffic).
- **No real model has been run.** Live results: `docs/LIVE_AI_TEST_CHECKLIST.md` (owner).

## Round 8 additions

- `enrollment.test.ts` (8):
  - The file holds no PIN hash, records, key or passphrase.
  - Admin only; weak passphrase and the unit passphrase are refused.
  - The fingerprint matches laptop 1. Damaged, edited, expired and wrong-passphrase files are refused.
  - Laptop 2 gets its own vault, a new device id, the same staff ids. Only the importing admin can sign in; laptop 1's PIN doesn't work there.
  - Activation needs an admin and the in-person identity tick. It's audited without the PIN, and plain PIN reset is refused for pending accounts.
  - A duplicate enrollment on the same laptop is refused. The same file on a third laptop gets a different device id.
  - Failures leave laptop 2 empty.
- `plainCleanup.test.ts` (5):
  - All six checks pass. The fresh backup opens. The temporary restore database is removed.
  - Wrong confirmation or a non-admin is refused. Only the plain copy is removed, clinical data is untouched, and an audit row is written. The token is single use.
  - Refused at step 1 while a migration is unfinished. A weak backup passphrase is refused. A made-up token is refused.
  - Real records: checks pass but deletion is refused; the copy stays.
- `realMigrationEvidence.test.ts` (4, synthetic Real records; approval flag used only in tests):
  - Refused without approval.
  - Backup → migrate → identical, and the backup restores to the same content.
  - The checkpoint restores the original plain data.
  - Interrupted → restart → wrong passphrase refused → resume → identical.
- Browser:
  - `e2e/enrollment.spec.ts`, two fresh browsers: fingerprint compared, wrong passphrase, join, pending nurse disabled, laptop-A PIN refused, activation needs the identity tick, nurse signs in with the new PIN.
  - `e2e/cleanup.spec.ts`: six checks, fresh backup downloaded, typed confirmation, plain copy removed, temporary database gone.

## Round 7 additions: encryption at rest (P-04)

Index-field integrity, `src/db/indexIntegrity.test.ts` (6 tests, added after review):
- All **45 index fields** of all tables were tampered one by one in raw IndexedDB. Each one fails with an integrity error, and the row is readable again once restored. This includes patient.mrn, entry.patient_id/encounter_id/care_time/status/supersedes_id/device_id/counter, audit_log.seq, med_admin.order_id, snapshot_result.time and worklist_item.priority.
- Removing an index field, or changing the stored format version, is detected.
- Legitimate app changes (correction, entered-in-error) re-seal the row and stay readable.
- Photo index fields are bound too.
- Data in the first format (v1) stays readable after unlock and is re-sealed as v2 with identical content (audit row). An old v1 copy put back afterwards is refused.

Crypto, `src/lib/vaultCrypto.test.ts` (23 tests):
- Default 600,000 PBKDF2 iterations.
- The working key is non-extractable (`exportKey` refused).
- Stored strings hold no passphrase, recovery code or raw key.
- Wrong passphrase, wrong recovery code and a tampered wrapped key are all refused.
- Recovery issues a new code and voids the old one; changing the passphrase keeps the data key.
- 1,000 encryptions → 1,000 different nonces.
- A changed byte, changed nonce, or data moved to another row are all detected.
- Recovery-code format; passphrase rules.

Storage, `src/db/encryption.test.ts` (15 tests):
- On disk only index fields are readable (names, values, PIN hashes are not). A nurse save through the normal repository is encrypted. The audit chain verifies.
- Locked: every read and write is refused.
- A reload starts locked; the right passphrase unlocks; the recovery code unlocks.
- A plain row slipped in → IntegrityError. Ciphertext copied between rows → refused.
- Real records refuse the public practice passphrase/recovery key and weak passphrases. Practice and Real keys can't read each other's data.
- Practice reset keeps the vault.

Migration, `src/db/encryptMigration.test.ts` (11 tests):
- Checkpoint → vault → encrypt → verify: every row is identical to the original, and the chain is valid.
- A failure before any change leaves the database as it was.
- Interrupted half-way → still readable → after restart, wrong passphrase refused → unlock → resume finishes and verifies.
- Resume without unlock is refused. The verify step catches a changed or missing row.
- Plain copies left afterwards: only the kept checkpoint.
- Photos: sealed only after their capture hash checks out; unreadable when locked.
- Real records refused without approval, with nothing changed.

Backup, `src/db/encryptedBackup.test.ts` (10 tests):
- No readable data or secrets in the file. Fresh salt and nonce each time.
- Weak passphrase and the unit passphrase are refused.
- Restore into an empty database with its own new key: every table matches, photos match their hashes, chain valid, the data key is not carried over.
- Wrong passphrase → nothing written. Changed byte, edited header or cut-off file → "damaged".
- A non-empty target, the other dataset, or a locked target are refused.
- A broken chain in the backup → rolled back.

FHIR (`fhir.test.ts`): the narrative is generated XHTML from the resource's own fields, HTML-escaped.

Browser:
- Every reload or restart shows the unlock screen first. Unlocking works with the network off (`vitals-slice`, `restart`, `admin-recovery` offline).
- Real-records setup (`admin-recovery`):
  - A weak passphrase is refused.
  - The recovery key is shown once and its last group must be typed back.
  - Raw IndexedDB holds no admin name, PIN hash, passphrase or recovery key.
  - After a reload the practice passphrase is refused and the unit passphrase opens.
  - The recovery key + a new passphrase give a new key; the old key is refused.
- Backup (`backup.spec`, two fresh browsers):
  - The unit passphrase is refused as backup passphrase.
  - The file holds no names or secrets.
  - Restoring with a wrong backup passphrase creates nothing; the right one restores staff.
  - Laptop B's own passphrase opens it; laptop A's doesn't.
- FHIR export: needs the "sensitive, not encrypted" tick box; the file name starts with `SENSITIVE-`.

## Round 6 additions

Unit (`src/db/reliability.test.ts`, 9 tests). Each test breaks something on purpose:
- **Interrupted write:** the child table write fails halfway. Nothing is saved, and the entry counter has no gap.
- **Failed correction:** the old version is NOT marked corrected.
- **Failed draft confirm / handover save:** nothing is added.
- **Storage full (quota):** the nurse sees "Laptop storage is full, so this was NOT saved. Use the paper downtime form…" instead of the raw browser error. *(Defect found and fixed this round.)*
- **Failed DB upgrade:** v1 data is kept as it was; a later good upgrade works.
- **Safety copy restore:** restores into an empty database; refuses a database that already has data.
- **Wrong laptop clock (set backwards):** the entry counter still goes up, and the recovery worklist flags a time conflict.
- **Duplicate worklist items:** 3 worklist builds running at the same moment add each item only once.
- **Interrupted export:** if writing the export record fails, `exported_at` stays empty and no audit row is added.

Browser (`e2e/restart.spec.ts`), real Chrome profile on disk:
- Service worker installed → pulse 83 saved → second form half-filled (pulse 199) → browser killed.
- Browser started again **with the network off**: app opens, pulse 83 is there, 199 is not, `navigator.onLine` is false.

FHIR: the official HL7 validator runs in CI (`fhir-validate` job) on every push to main and every PR, and now fails the build on any error.

## Unit tests (12 files)

Earlier files still pass unchanged in purpose:
- `audit`, `migration` (DB v2), `entries` (incl. the high-alert guard)
- `vitals`, `meds` (incl. the policy config), `charting`, `cloud`

New or changed this round:
- `regions.test.ts`:
  - The same 21 region ids as before.
  - The patient's left/right is correct in both views, both for the tap area and for the body part it is clipped to.
  - Heels can be picked only from the back view and feet only from the front view.
  - Every standard site word maps to a region.
- `MedIllustration.test.tsx`: every registered illustration has a bundled local file (no external URL); it is decorative unless given a label.
- `handoff.test.ts`:
  - Saving adds a new row with an audit row; earlier handovers are unchanged and blank open items are dropped.
  - Only confirmed records of the same patient can be linked; Situation, Background and Assessment are required.
  - The audit chain stays valid.
- `photoQuality.test.ts`: a clear page passes; dark, washed-out, blurry and small photos get hints.
- `capture.test.ts`:
  - The photo is saved first with its hash and a `photo_saved` audit row, then linked from the entry; non-pictures are refused.
  - Confirming a draft keeps the proposal, works only on drafts and keeps the chain valid.
  - A high-alert draft still needs the second nurse.

## Round 5 additions

Unit:
- `admin.test.ts`:
  - Only an active admin can manage staff; every action is audited and PINs are never logged.
  - You cannot switch off yourself.
  - Downtime lifecycle: end is blocked until the worklist is signed off; declare → System down; network clearance needs every checklist item, the right PIN and an admin.
  - Fake files are refused for Real records; first-time setup runs once; patient-list import goes into Real records only.
- `worklist.test.ts`:
  - The interval is read from the order text only.
  - New items carry duplicate, missing-field and time-conflict flags; existing items are untouched; a second build adds nothing.
  - Sign-off happens once and is refused for drafts.
- `fhir.test.ts`:
  - The synthetic data gives a valid Bundle with more than 100 resources, and drafts are excluded.
  - The corrected version is entered-in-error with a Provenance revision; blood pressure is a LOINC panel; a held dose is not-done; every resource is tagged.
  - The validator catches a broken reference, a bad status and a bad date.

Browser (`admin-recovery.spec.ts`):
- Admin: readiness → add staff → change log filter → settings all "Not approved" → End downtime refused → a nurse sees "Admins only."
- Recovery: 45-item worklist → possible duplicate for Grace Bell explained ("every 6 hours") with the record to compare → sign off → count goes up → export prepared, structure check passed, file downloaded and parsed as a FHIR Bundle with Provenance.
- First-time setup for Real records from the sign-in screen.
- **Offline:** network off → admin signs in → recovery builds → export prepares and validates.

## Browser tests (19 from earlier rounds)

| File | Tests |
|---|---|
| vitals-slice (3) | Vitals save / reload / fix; PIN lockout. **Offline:** after the first load, network off → reload → sign in → illustrations load (no broken images) → record vitals → reload offline → still there → body map renders |
| meds (3) | High-alert second nurse; dose warning + fix; held needs a reason |
| charting (3) | Fluid totals (checked against the seed file); note fix; critical lab warning |
| **body-map (5)** | Front/Back/Both switch; all 21 regions clickable and highlighted; patient's left/right position in both views; keyboard Enter selects; list picker selects a back-only region; 2 injection markers link to the right record (`e-022`); IV marker comes only from `med_admin.site`; tap areas keep their place relative to the drawing after a window resize |
| **handover (2)** | Ward list → patient → write with "insert facts" and "add line" → review → save → history → view → print layout shows MRN header and hides buttons; Review blocked without S/B/A |
| **capture (3)** | Photo saved first ("Unchanged since saved") → typed pulse → draft → check and confirm beside the photo → confirmed with source photo; dark photo hint does not block; practice proposal labelled as simulated, missing photo file stated |

Not tested yet: screen reader pass, tablet sizes, Firefox/Safari, real Gemini Nano (not available in this environment).
