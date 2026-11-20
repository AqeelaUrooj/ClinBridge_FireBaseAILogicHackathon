# Decisions

## Made

| ID | Decision | Why |
|---|---|---|
| D-01 | Keep Stitch v3 look (navy header, white sidebar, tokens) but replace its long sidebar with 4 nurse items + More | Nurses need a short menu |
| D-02 | Dexie on IndexedDB, not SQLite WASM/OPFS | Simpler, works in every target browser, already in the plan |
| D-06 | 4-digit PIN (PBKDF2-SHA256), not Stitch's 6-digit | Matches the plan and the data tab |
| D-07 | No NEWS2 or other early-warning score | That is clinical decision support (software that suggests care); not in the schema, needs clinical approval |
| D-08 | Removed invented Stitch fields: `acuity_score`, `witness_practitioner_id` (use `double_checked_by`), `flag_critical`, `body_site_id`, `is_corrected` / `original_entry_id` (use `status` / `supersedes_id`) | No invented fields |
| D-09 | No P2P mesh, no port-9100 label printing, no three.js 3D body | Not possible or not needed in a browser; use browser print and a 2D SVG body |
| D-10 | Network gate is an admin checklist + PIN, not a 5-stage automatic test | A browser cannot test mTLS or DNS |
| D-11 | AI shows values only, never "recommended overwrite" | Nurse confirms every value |
| D-12 | No photos of people. Initials only | Privacy |
| D-13 | Practice runs on a scenario clock fixed to 14 Nov 2026 13:20 (UTC−05:00) | New practice entries fit the fake outage story |
| D-14 | Correction = new entry with `supersedes_id`; old entry status → `corrected`. Values never edited in place | Append-only record |
| D-15 | Routes not built yet show an honest "being built" page, no dead buttons | No fake features |
| D-17 | Vitals: only definitional checks block (number, type, decimals, no negatives, 0–100% oxygen, 0–10 pain, BP pair, flow needs a method, the 4 awake options). Clinical ranges only warn, live in `src/config/clinicalWarnings.ts`, marked not approved | Owner instruction: never reject possibly valid observations on unapproved limits |
| D-20 | Medicines: dose/unit/route different from the order = warning to tick, never a block | Same principle; catches the 50 mg vs 5 mg case without inventing dose limits |
| D-21 | Units, routes and site words in `src/config/medicationPolicy.ts` (data formats). High-alert list, second-checker roles and timing windows in `src/config/clinicalPolicy.ts`, status `synthetic-prototype` | Keeps prototype settings apart from approved policy |
| D-22 | Held / Refused need a reason (`med_admin.reason`); rate change reason optional | Every held/refused dose in the synthetic seed carries one; flag if your policy differs |
| D-23 | P-02 applied as DB v2, additive only (legacy reasons copied, not removed) | Owner: do not overwrite the original entry |
| D-24 | Body map first model = UI/UX 21 regions; ids are drafts; Stitch quadrant labels removed (mirrored) | Owner decision; see P-01 |
| D-25 | No Overdue status without an approved timing window; mechanism exists, list empty | Owner decision |
| D-26 | Critical lab: missing "who was told" / read-back warns, never blocks | Do not add clinical rules without approval |
| D-27 | Fluid totals are calendar-day sums from 00:00, not shift totals | Shift times are hospital policy; not approved |

## Open — need an answer

| ID | Question | What the app does now |
|---|---|---|
| P-01 | Final body map region model | First model built (21 UI/UX regions); limitations table in P-01 |
| P-03 | Optional `note.body_site` — migration in `docs/proposals/P-03-note-body-site.md` | Not applied |
| D-04 | Repo `AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon` (public, empty) chosen by owner | `origin` set locally; push blocked on the session's GitHub permission step |
| D-16 | Firebase project config for AI | AI not wired; `.env.example` has empty placeholders |
| D-17b | Clinical review of the warning ranges in `src/config/clinicalWarnings.ts` | Marked not approved; warn only |
| D-18 | Approved medicine timing policy (windows may differ by drug) | Shows Due only (D-25) |
| D-19 | Second-checker eligibility per local policy, credentials and regulations | RN only, temporary prototype setting in `clinicalPolicy.ts`; seed no longer shows an LPN checker |
| D-28 | Hospital-approved high-alert list and verification rules | Prototype list from the UI/UX doc, marked partial |
