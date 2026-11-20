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
| D-21 | High-alert list, units and routes come from the docs and sit in `src/config/medicationPolicy.ts` | Documented values; admin Settings later |
| D-22 | Held / Refused need a reason (`med_admin.reason`); rate change reason optional | Every held/refused dose in the synthetic seed carries one; flag if your policy differs |

## Open — need an answer

| ID | Question | What the app does now |
|---|---|---|
| P-01 | Body map regions — exact differences in `docs/proposals/P-01-body-map-regions.md` | Body map not built |
| P-03 | Optional `note.body_site` — migration in `docs/proposals/P-03-note-body-site.md` | Not applied |
| D-04 | Private repo `downtimekit`. Connected GitHub account is `AqeelaUrooj` (name "Aqeel Urooj"): owner must confirm it is theirs to use | Repo is local only, nothing pushed, no repo created |
| P-02 | `entry.change_reason` — migration in `docs/proposals/P-02-entry-change-reason.md` | Until approved: reason kept in `entry.confirmed` JSON and in the audit row; migration moves them without loss |
| D-16 | Firebase project config for AI | AI not wired; `.env.example` has empty placeholders |
| D-17b | Clinical review of the warning ranges in `src/config/clinicalWarnings.ts` | Marked not approved; warn only |
| D-18 | When does a due dose count as **Overdue**? (hospital time window) | Shows "Due" only; no Overdue status until the window is given |
| D-19 | Can an LPN be the second checker on high-alert drugs? (UI/UX §6 says "by hospital policy"; seed has an LPN checking insulin) | RN only (stricter default) in `src/config/medicationPolicy.ts` |
