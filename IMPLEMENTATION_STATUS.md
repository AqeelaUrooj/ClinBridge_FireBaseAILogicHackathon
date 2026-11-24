# Implementation status

Last updated: 22 Nov 2026 (round 13). Full review: docs/TECHNICAL_REVIEW_2026-11-22.md

| Phase | Scope | State |
|---|---|---|
| 0 | Audit Stitch v3, plan, schema check | Done |
| 1 | Foundation: project, design tokens, 19-table database, seed, audit chain, shell, sign-in, lock | Done |
| 2 | Vertical slice: vitals | **Done** |
| 3 | Medicines (incl. high-alert two-nurse check), orders | **Done** |
| 4 | Fluids (intake/output), notes, labs | **Done** |
| 5 | Photo of paper form (on-device AI) | Manual capture done and used live. On-device Gemini Nano proposals built (PR #7) and tested with mocks only: the owner's PC can't run Gemini Nano (hardware), so it is not live-verified |
| 6 | Handover, body map | **Done** (Theme 2 artwork, 24 selectable regions, documented administration highlights and accessible counts) |
| 7 | Admin, network gate, recovery, FHIR export, setup, practice compare | Done. Cloud second look and the cloud side of Device vs Cloud **live-tested** with real Firebase AI Logic responses (20 and 22 Nov 2026). Cloud gate aborts running cloud requests on System down and discards their answers (D-62); data already sent can't be recalled |
| 8 | Offline/security hardening, encryption at rest, deploy | Encryption at rest merged (PR #4). F1 second-laptop enrollment (PR #5). Cleanup workflow on synthetic data (PR #6). Real-records migration and Real-records cleanup not approved. Not deployed |

## Rounds 10–13 (20–22 Nov 2026)

- **Round 10** (PR #8, #9): live tests on the owner's PC. Genuine cloud inference passed after the App Check fix (separate `clinbridge-cloud` app); Gemini Nano blocked by hardware. docs/LIVE_TEST_RESULTS_2026-11-20.md
- **Round 11** (PR #10, #11): live re-check and demo rehearsal on 22 Nov (docs/LIVE_TEST_RESULTS_2026-11-22.md); the Practice clock continues after a reload.
- **Round 12** (PR #12): Stitch-design sidebar groups, read-only ward clinical tools (`/tools/*`), rebuilt patient history with integrity facts. docs/ZIP_REQUIREMENTS_TRACEABILITY.md
- **Round 13** (PR #13): Apache-2.0 licence and NOTICE, accurate README, product name ClinBridge in the app, Devpost and video preparation docs.
- **Round 14** (PR #14, branch `feat/v3-zip-completion`): paper forms DT-MAR-01 / DT-VIT-02 / DT-SBAR-03 (`/print/:kind/:id`), paper form packets (`/spooler`), SpO₂ trend on history and vitals, print links on the patient pages, phone-width menu. No schema change. Report: docs/V3_ZIP_COMPLETION_REPORT.md

## Phase 2 slice — working end to end

Sign in (PIN) → My patients → patient check (name, born, MRN) → Summary → Vitals → Record → Review → Save to IndexedDB → shows in History → survives reload → Fix (needs a reason) → old version kept and crossed out → All versions.

Also working:
- "Wrong patient or mistake" marks a record as entered-in-error (never deleted).
- Audit log: every save adds a hash-chained row. More → "Change log check" verifies the chain.
- PIN lockout after 5 wrong tries (1 minute). Auto-lock after 5 minutes idle.
- Practice / Real records are two separate databases. Practice reset on More.
- App opens with no network after the first load (service worker).

## Phase 3 — medicines, working

- Medicines page grouped Scheduled / As needed / Drips. Today's times show Given, Due, Held, Refused or Check this (draft).
- Record from a due time: pre-filled from the order (no trailing zeros), fixed unit and route lists, optional site.
- Held and Refused need a reason. Rate change shows the current rate and saves old → new.
- Dose, unit or route different from the order → warning that must be ticked (this is the 50 mg vs 5 mg case). It never blocks.
- High-alert drugs (insulin, heparin, HYDROmorphone, potassium chloride): red bar, and Save stays locked until a **different** eligible nurse picks their name and enters their own PIN. The database layer refuses the save too, so the rule cannot be skipped from the screen.
- Fixing a medicine record works like vitals: new version, reason required, old version kept.
- Orders page (read only).

## Round 9

- **PR #5 merged** (`f6b0485`) and **PR #6 merged** (`6b67fef`, rebased onto main, CI green).
- **Firebase AI Logic** (PR #7, `feat/ai-hybrid`):
  - On-device paper-photo proposals (ONLY_ON_DEVICE with strict guards).
  - Practice Device vs Cloud with real source labels.
  - Back-online cloud second look.
  - AI check page with model preparation.
  - Practice outage drill.
  - Tested with mocks; no real model run yet (docs/AI_TEST_MATRIX.md).

## Round 8

- **PR #4 merged** (`ff8a11a`) after the review fixes: every plain index field is authenticated (format v2), with v1 data still readable and upgraded on unlock; docs synced.
- **F1 second-laptop enrollment** (PR #5): encrypted staff-only file, fingerprint check, own vault and device id on laptop 2, in-person activation.
- **Plain safety-copy cleanup** (PR #6): six checks, including a fresh backup and a restore test. Works on Practice; refused for Real records.
- **Real-records migration evidence pack:** P-06 (not approved).
- Required external reviewer roles (`docs/SECURITY_REVIEW.md`); demo readiness (`docs/DEMO_READINESS.md`).

## Round 7 (PR #4, branch `feat/encryption`)

- **PRs #1, #3, #2 merged** after re-checking CI on each head and on the combined branch.
- **Encryption at rest** (index fields authenticated, format v2):
  - WebCrypto vault: unit passphrase + recovery key; AES-256-GCM per row and per photo.
  - Unlock screen after every reload or restart; Lock records now; idle lock.
  - Practice encrypted with the public passphrase.
  - New Real-records setups are encrypted from the first record.
- **Staged migration** proven on Practice (checkpoint, verify, interruption, resume). Real records are not migrated.
- **Encrypted backup file** and restore at setup. FHIR export needs a "sensitive" confirmation.
- **FHIR narrative:** HL7 warnings went from 254 to 11.

## Round 6

- **Reliability tests:** interrupted writes, failed migration, storage full, browser killed mid-form, restart with the network off, wrong clock, duplicate worklist builds, interrupted export, safety copy restore. One defect found and fixed (raw "quota" error shown to nurses).
- **FHIR:** official HL7 validator in CI. First run 10 errors, now 0. Free-text parts are listed honestly in docs/FHIR_VALIDATION.md.
- **Security review:** encryption design and the decisions it needs in P-04 (PR #2). Nothing irreversible done.
- **Second laptop:** options in P-05 (PR #2).
- **AI preparation:** docs/AI_INTEGRATION.md rewritten with checked browser and hardware facts (PR #3). Manual capture and rules-only recovery stay the default.

## Round 5

- **GitHub:** history re-authored as the owner (content unchanged) and pushed to `AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon`.
- **Admin:**
  - Screens: readiness, downtime lifecycle, patient list, staff, laptops, change log and settings.
  - First-time setup for Real records.
  - Every admin action is checked in the database layer and audited.
- **Network clearance (Back online):** needs every checklist item ticked plus the admin's PIN again. Ending the downtime needs every worklist item signed off.
- **Recovery:**
  - Rules-only worklist: possible duplicate, missing field, time conflict. Every rule is definitional or comes from the order's own wording.
  - Review page with the reasons, a related record to compare, versions, and fix / confirm links.
  - Sign-off is recorded once and audited.
- **FHIR R4 export:**
  - A collection Bundle with Patient, Encounter, Practitioner, AllergyIntolerance, MedicationRequest, MedicationAdministration, Observation, DocumentReference and Provenance resources.
  - LOINC and UCUM codes for vitals. Corrected or mistaken versions are exported as entered-in-error; drafts and proposals are never exported.
  - Structural validator; download; fingerprint written to the change log.
  - File only, no live EHR link.

## Round 4

- **Body map redrawn:** original Theme 2 vector figures (front, back), the same 21 region ids, tap areas clipped to the drawing, Front/Back/Both, list picker, keyboard, labels, injection/IV markers from records only.
- **Medical illustrations:** 21 icons cut from the Theme 2 reference sheet (local WebP, precached) on medicines, patient summary, vitals, ward board, alerts, handover and capture (`docs/ASSETS.md`).
- **Handover:** patient and ward pages, written from confirmed records only, review before save, history, browser print.
- **Paper capture:** photo saved first (local photo store, hash, audit row), quality hints, typed values, drafts, confirm beside the photo. No AI needed.

## Round 3

- **DB v2 applied:** `entry.change_reason` (P-02). Safety copy of the old database first, legacy reasons copied, nothing else changed, audit chain valid.
- **Clinical policy config:** `src/config/clinicalPolicy.ts` holds the high-alert list (marked partial, not validated), second-checker roles (RN only, temporary, needs approval) and medicine timing windows (none approved, so only Due). Shown on More → Clinical settings.
- **Fake data fixed:** insulin second checks are now done by an RN (new fictional day charge nurse, Ana Reyes).
- **Body map:** 21 UI/UX regions on the Stitch artwork, patient's left/right, medicine sites as markers, last 3 sites shown when recording an injection.
- **Phase 4:** fluids with daily totals, notes, labs with critical-result log, ward labs page. Every record type can be fixed.

## Waiting on you

- **Real-records cleanup** (P-04) and **Real-records migration** (P-06) approvals; hospital IT/security review (docs/SECURITY_REVIEW.md); a Gemini Nano-capable laptop for the live on-device test (docs/GEMINI_NANO_SECOND_LAPTOP.md).
- **Note-to-body-area links** (`note.body_site`, P-03) remain a separate proposal.
- **Approved hospital policy** for high-alert list, second checker, medicine timing and vital-sign warning ranges.

## Next

- Live Gemini Nano run on compatible hardware (cloud runs are done).
- Print views for the medicine schedule and vitals flowsheet, a screen-reader pass.
- Owner decisions on note templates and print audit, listed in docs/V3_ZIP_COMPLETION_REPORT.md section 12.

## Public prototype introduction

The landing-page branch implements `/landing` with locally bundled Practice screenshots, workflow, capabilities, safeguards and FAQ. The public page renders independently of the vault. `/` shows the same page to visitors who are not signed in; signed-in staff go to their dashboard (see ROUTES.md, Public homepage).
