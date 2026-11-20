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

## Open — need an answer

| ID | Question | What the app does now |
|---|---|---|
| D-03 | Body map regions: Stitch has 24, UI/UX doc has 21 (and "Abdomen, left side" is unclear). Which set? Add optional `note.body_site`? | Body map not built |
| D-04 | GitHub repo owner and name. The linked GitHub account is not Talal's | Repo is local only, nothing pushed |
| D-05 | Where to store the reason for a fix / mistake? No schema field | Stored inside `entry.confirmed` JSON (`correction.reason`, `entered_in_error.reason`) and in the audit row |
| D-16 | Firebase project config for AI | AI not wired; `.env.example` has empty placeholders |
| D-17 | Clinical sign-off for vitals limits (impossible-value limits and "usual range" highlight) and the 4 awake-level options (AVPU: Alert, Voice, Pain, Unresponsive) | Placeholder numbers in `src/lib/vitals.ts`; highlight never blocks saving |
