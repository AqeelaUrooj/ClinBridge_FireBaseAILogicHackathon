# Implementation status

Last updated: 20 Nov 2026 (round 2)

| Phase | Scope | State |
|---|---|---|
| 0 | Audit Stitch v3, plan, schema check | Done |
| 1 | Foundation: project, design tokens, 19-table database, seed, audit chain, shell, sign-in, lock | Done |
| 2 | Vertical slice: vitals | **Done** |
| 3 | Medicines (incl. high-alert two-nurse check), orders | **Done** |
| 4 | Fluids (intake/output), notes, labs | Not started |
| 5 | Photo of paper form (on-device AI) | Not started |
| 6 | Handover, body map | Not started (body map waits on P-01) |
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

## Vitals change (this round)

Only definitional checks block saving. Clinical ranges are in `src/config/clinicalWarnings.ts`, marked not approved, and only warn (nurse ticks "I re-checked").

## Waiting on you

P-01 body map regions · P-02 `entry.change_reason` · P-03 `note.body_site` · GitHub account confirmation · D-18, D-19 (see DECISIONS.md).

## Next

Phase 4: fluids (intake/output with running totals), nursing notes, labs (critical result display).
