# Implementation status

Last updated: 20 Nov 2026

| Phase | Scope | State |
|---|---|---|
| 0 | Audit Stitch v3, plan, schema check | Done |
| 1 | Foundation: project, design tokens, 19-table database, seed, audit chain, shell, sign-in, lock | Done |
| 2 | Vertical slice: vitals | **Done** |
| 3 | Medicines (incl. high-alert two-nurse check), orders | Not started |
| 4 | Fluids (intake/output), notes, labs | Not started |
| 5 | Photo of paper form (on-device AI) | Not started |
| 6 | Handover, body map | Not started (body map waits on D-03) |
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

## Next

Phase 3: medicines list from `active_order`, give/hold/refuse, dose format rules, high-alert second nurse (`double_checked_by`), the 50 mg vs 5 mg recheck case.
