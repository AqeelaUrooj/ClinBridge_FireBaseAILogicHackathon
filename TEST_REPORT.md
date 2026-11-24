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

## Round 15: PR #14 pre-merge quality check (23 Nov 2026)

Owner's checklist on `feat/v3-zip-completion`. Details: `docs/V3_ZIP_COMPLETION_REPORT.md` section 5a.

| Check | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | Pass / Pass |
| `npx vitest run` | **225 passed, 1 skipped** |
| `npm run build` | Pass |
| `npx playwright test` | **46 / 46** (+4: `print-multipage.spec.ts` 3, `phone-layout.spec.ts` 1) |
| Multi-page PDFs read back page by page | MAR 5 (A4) / 6 (Letter) pages, SBAR 3 / 3, 2-patient packet 16 pages: right patient on every page, none mixed, nothing cut off |
| Real print dialog | Opened from a fictional patient's sheet in the built-in browser; not operable from this session; closed without printing |

Defects found and fixed: near-empty first page on long forms (keep-together sections); order list sorted 1, 10, 11 (now natural order); new screens, history cards and record rows overflowing at 390 px. Test-side: the PDF reader trimmed a stream byte (now uses the declared length); multi-page tests block the service worker so the layout rows reach the page.

## Round 14: V3 ZIP completion — paper forms, packets, SpO₂ trend, phone menu (23 Nov 2026)

Branch `feat/v3-zip-completion` (from `main` `79deaeb`) on DESKTOP-6NQ637E (Windows 10, Node 24.21.0). No schema change. Report: `docs/V3_ZIP_COMPLETION_REPORT.md`.

| Check | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | Pass / Pass |
| `npx vitest run` | **225 passed, 1 skipped** (+15: `src/lib/vitalTrend.test.ts` 7, `src/features/print/printData.test.ts` 8) |
| `npm run build` | Pass (26 precache entries) |
| `npx playwright test` | **42 / 42** (+8: `e2e/print.spec.ts` 4, `e2e/trends.spec.ts` 2, `e2e/navigation.spec.ts` +2) |
| Chrome (dev server, Practice data) | Checked by hand: packet builder steps, MAR / vitals / SBAR preview, SpO₂ card on Peter Novak's history (90% at 04:20, 94% at 04:55, pre-outage 91% at 00:05) |

Two test-side fixes while writing the new tests (no app change): a forbidden-words check matched the sheet's own disclaimer ("no score, target or escalation band"), so it now checks the ZIP's NEWS2 / escalation wording and the chart's SVG structure instead; the correction test ticks the existing "I re-checked these values" step (breathing 22 is flagged unusual), as a nurse would.

## Round 13: licence, README and Devpost docs (22 Nov 2026)

Branch `docs/devpost-licence-readme` on DESKTOP-6NQ637E (Windows 10, Node 24.21.0). Changes: `LICENSE` (Apache-2.0), `NOTICE`, README rewrite, Devpost and video docs, `package.json` name/licence, and the product name shown in the app (DowntimeKit → ClinBridge in 7 visible strings). No logic, schema or clinical change.

| Check | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | Pass / Pass |
| `npx vitest run` | **210 passed, 1 skipped** |
| `npm run build` | Pass; `dist/index.html` and the manifest say ClinBridge |
| `npx playwright test` | **34 / 34 pass** |

**CI failure on `2e9603d` (flaky test, fixed):** `check` failed in `src/db/repos/admin.test.ts` ("PINs are never logged") on `expect(JSON.stringify(rows)).not.toContain('9876')`. In the CI log, all 156 audit rows have only the 10 audit fields (no PIN or PIN-hash field, no `pbkdf2$` string), and the only `9876` was at position 26 of `prev_row_hash` in row `au-0156` (`staff_deactivated`): a SHA-256 value that changes every run because the new staff id is random. Not a leak. The substring check was replaced with structural checks: fixed audit-row shape; no stored PIN hash (old or new) in any row; who/which account on each staff action; each row's hashed content recomputed and equal to the non-secret facts only (`{pin_reset: true}` for the reset); PIN stored only as a salted PBKDF2 hash that changed on reset; chain check kept. Stability: 50 / 50 runs. Mutation check: putting the PIN into the reset's audited content makes the test fail. Full run after the fix: typecheck, lint, Vitest 210 passed / 1 skipped, build, Playwright 34 / 34.

Second pass after the review corrections (docs only: cancellation wording, encryption and FHIR scope in README, IMPLEMENTATION_STATUS, KNOWN_LIMITATIONS, DEPLOYMENT licence note, technical review): typecheck pass, lint pass, Vitest 210 passed / 1 skipped, build pass, Playwright 34 / 34 against the fresh build. Secret scan of all tracked files and the branch diff: 0 findings.

## Round 12: ZIP navigation, clinical tools and patient history (22 Nov 2026)

Branch `feat/zip-navigation-history` on DESKTOP-6NQ637E (Windows 10, Node 24.21.0). Scope and traceability: `docs/ZIP_REQUIREMENTS_TRACEABILITY.md`. No schema change, no migration.

| Check | Result |
|---|---|
| `npm run typecheck` / `npm run lint` | Pass / Pass |
| `npx vitest run` | **210 passed, 1 skipped** (+8: `src/lib/history.test.ts`) |
| `npm run build` | Pass |
| `npx playwright test` | **34 / 34 pass** (+3: `e2e/navigation.spec.ts`). Existing specs updated only where the UI changed: the admin link "To check" is now "Recovery Gate & Worklist"; "Downtime" / "Body map" / "Note" selectors scoped or made exact because the sidebar now has similar labels; history rows now expand, then "Open details". |
| Chrome (dev server, Practice data) | Checked by hand. Nurse menu: 3 groups, counts 10 / 4, clinical tools follow the open patient. Admin menu: System admin. Ward schedule, vitals and fluids pages show real records. History: tabs 11 / 6 / 1 / 2 / 2 / 0, expand all → 11, collapse → 0, oldest first starts 04:10, search finds the note. |

New tests cover: tab counts that ignore old versions and mistakes; type filter; newest / oldest order with a typed-time tie-break; search; integrity facts; care team; nurse vs admin menu; nurse has no System admin group; every admin link opens a page; each clinical tool page shows seed values; the patient check still runs from tools and Add; history counts add up and the integrity panel makes no "bedside verified / countersigned / all signed" claim.

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
- Finding: a photo record whose care time is before the practice outage start is not added to the worklist (by design; keep the default "When measured" time in walkthrough step 4).
- Fixed in PR #11: the Practice clock now continues from the latest saved time after a reload.

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

## Documented administration body-map coverage

- `src/features/body/medicationSites.test.ts` covers grouping, counts, timestamps, exact record links, non-administration events, corrections and mistakes, identity isolation, and missing or unmapped sites.
- `src/features/body/regions.test.ts` verifies the 24 identifiers, patient laterality, and the six historical site mappings.
- `e2e/body-map.spec.ts` verifies the document-to-region relationship and accessible counts, keyboard and touch selection, pins and linked records, mistaken record removal, verification and patient isolation, and offline persistence. Practice evidence is emitted under each test's `screens/` artifact directory.

## Synthetic handwritten reports

- `src/features/reports/reports.test.tsx`: all ten patients in all four designs (own identifiers, nobody else's), recorded values, held / refused / rate changes, drafts and mistakes left out, corrected values, missing data, long names, read only, refused in Real records.
- `src/lib/handwriting/hand.test.ts`: the layout keeps every word, numbers always in the clear hand, long words never shortened.
- `e2e/handwritten-report.spec.ts`: patient check, switching patients and designs, zoom, rotate, PNG (right patient, label in the pixels, nothing stored or sent), print on A4 and Letter, offline, Real records, paper capture unchanged, six widths.

### Reports in Device vs Cloud

All answers are MOCK (Prompt API replaced in the page, cloud replaced by a local stand-in). Nothing here is a live model result.

- `src/features/reports/sheetReading.test.tsx`: the compared values are only what is drawn (all patients, all designs), partial sets, hospital-list sets, blood sugar of another time, crossed-out values, other words for consciousness, no vital signs.
- `src/lib/ai/compare.test.ts`: values that are not in the input never count.
- `e2e/compare-page.spec.ts`: four designs and two patients; preview against the picture of the patient's report page (under 0.2 % clearly different pixels); both models get the previewed file (SHA-256) and the same text; answers cleared on every change, late answers and late pictures dropped; old pictures released; no on-device model, no picture support, System down, no vital signs, partial set; nothing stored, no draft; typed note unchanged; offline; six widths.

## Public landing-page branch

The visual correction uses the shared Stitch v1 landing_page_2 and v3 landing HTML. Compared with the first PR #20 version, the header is shorter and adds a status strip, and the pale-blue hero has tighter typography, four compact metric cards, a panoramic workstation photo, and a detailed Practice dashboard. The workflow uses three columns, the clinical showcase uses two photographic panels, and the navy recovery band uses a photo alongside four proof cards. Scope cards take the place of endorsements. The centered accordion retains the ten accurate answers, and the gradient CTA leads to Practice sign-in above a multi-column footer. The photos are original illustrative assets. The responsive layout adapts the desktop reference at tablet and phone widths.

`e2e/landing.spec.ts` covers 360, 390, 768, 1024 and 1440 CSS pixels, menu focus, keyboard FAQ controls, protected routes, the Practice sign-in entry point, public storage isolation, offline reload and full-page screenshots.

`e2e/homepage.spec.ts` covers `/`: the public page with no database opened and no clinical code loaded, the way from the page to the ward board, nurse and admin redirects without a new sign-in, the locked screen, Switch user, Lock records, page loads, direct addresses with refresh, offline use and the installed-app start address. With the landing page always shown at `/`, six of these tests fail.

## Collapsed history readability

At 390 px a saved Practice metoprolol tartrate 250 mg administration used 237 px of text in an 89 px single-line summary. The regression follows its correction to 25 mg, shows the old version and checks both summaries fit at 390 and 1440 px. It also checks keyboard expansion, status badges and page overflow. The phone row gives the text more space and all record summaries wrap, including notes, fluids, labs and vitals. Screenshots are under `screens/history-doses-*.png` in the browser-test artifacts.
