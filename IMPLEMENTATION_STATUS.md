# Implementation status

Last updated: 20 Nov 2026 (round 6)

| Phase | Scope | State |
|---|---|---|
| 0 | Audit Stitch v3, plan, schema check | Done |
| 1 | Foundation: project, design tokens, 19-table database, seed, audit chain, shell, sign-in, lock | Done |
| 2 | Vertical slice: vitals | **Done** |
| 3 | Medicines (incl. high-alert two-nurse check), orders | **Done** |
| 4 | Fluids (intake/output), notes, labs | **Done** |
| 5 | Photo of paper form (on-device AI) | **Manual capture done**; AI not integrated (see docs/AI_INTEGRATION.md) |
| 6 | Handover, body map | **Done** (body map redrawn; 21-region model still a first model) |
| 7 | Admin, network gate, recovery, FHIR export, setup, practice compare | **Done** except practice compare (needs AI) |
| 8 | Offline/security hardening, encryption at rest, deploy | Partly: offline shell, restart-offline test, reliability tests, HL7 validation done; encryption waits for P-04 approval |

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

- **P-04 encryption decisions** (A, B, C, D) and **P-05** second laptop.
- **Final body map region model** (P-01). Then `note.body_site` (P-03).
- **Approved hospital policy** for high-alert list, second checker, medicine timing and vital-sign warning ranges.

## Next

- Phase 8: encryption at rest (AES-GCM + key_store), print views for the medicine schedule and vitals flowsheet, a screen-reader pass.
- On-device AI once Firebase config and a Chrome desktop test laptop are available (photo check, form reading as drafts, handover draft); cloud second look in Back online.
