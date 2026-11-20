# Implementation status

Last updated: 20 Nov 2026 (round 4)

| Phase | Scope | State |
|---|---|---|
| 0 | Audit Stitch v3, plan, schema check | Done |
| 1 | Foundation: project, design tokens, 19-table database, seed, audit chain, shell, sign-in, lock | Done |
| 2 | Vertical slice: vitals | **Done** |
| 3 | Medicines (incl. high-alert two-nurse check), orders | **Done** |
| 4 | Fluids (intake/output), notes, labs | **Done** |
| 5 | Photo of paper form (on-device AI) | **Manual capture done**; AI not integrated (see docs/AI_INTEGRATION.md) |
| 6 | Handover, body map | **Done** (body map redrawn; 21-region model still a first model) |
| 7 | Admin, network gate, recovery, FHIR export, setup, practice compare | Not started |
| 8 | Offline/security hardening, encryption at rest, deploy | Partly (offline shell works) |

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

- **GitHub push** (blocked on the permission step, see the report).
- **Final body map region model** (P-01). Then `note.body_site` (P-03).
- **Approved hospital policy** for high-alert list, second checker, medicine timing and vital-sign warning ranges.

## Next

Phase 7: admin (readiness, snapshot, staff, devices, downtime lifecycle, audit log, settings, network clearance), recovery worklist, FHIR R4 export. Not started yet.
