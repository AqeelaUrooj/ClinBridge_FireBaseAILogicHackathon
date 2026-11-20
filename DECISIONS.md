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
| D-29 | Paper photos stored in a separate local IndexedDB photo store per dataset; `entry.raw_input_ref` holds the reference | The 19-table schema has no image table; plan says raw input is a "photo ref" |
| D-30 | Handover save time and author come from the audit row; draft only on screen; each save a new row | `handoff` has no time/status fields; no schema change |
| D-31 | Body map artwork: original Theme 2 vector drawing; reference figures not extracted (baked highlights, callout lines, low resolution); same 21 region ids | See docs/ASSETS.md and P-01 |
| D-32 | Icons cut from the reference sheet; sheet's "Tablet" (a tablet computer) not used; "Inhaler" (a tube) used only for creams | Do not mislead |
| D-33 | Photo quality hints are technical (light, sharpness, size) and never block; the nurse's override is stored in `photo_check` | Not a clinical rule |
| D-34 | Recovery rules: duplicate = same order + same scheduled time, or closer than the order's own "every N hours"; time conflict = care time after typed time, or counter order ≠ clock order on a laptop; missing field = given dose without route/dose/unit | No invented clinical numbers |
| D-35 | Worklist queue order = prototype category rank (meds first, per Data plan) + number of flags; marked not approved | Queue order only, not a clinical score |
| D-36 | Network clearance = prototype checklist (3 items, wording not approved) + admin PIN re-entry; end downtime only when the worklist is signed off | Implementation Plan gate; UI/UX "end only when the worklist is finished" |
| D-37 | FHIR export: collection Bundle; text-only codes where no code is agreed (fluids, risk scores, labs, consciousness); `https://clinbridge.example/fhir` as placeholder base URL; handoff/audit not exported (post-hackathon list) | Data plan §7 |
| D-38 | Snapshot import only into Real records; files marked fake are refused; only the 6 patient-list tables are accepted | Keeps practice and real data apart |
| D-39 | Storage full (quota error) on any save → plain message to use paper and tell the charge nurse/IT; nothing partly saved | Reliability test found the raw browser error reaching nurses |
| D-40 | FHIR fixes from the HL7 validator: allergy `clinicalStatus` from the existing `allergy.status`, `reaction.severity` from `allergy.severity`, MRN identifier coded `MR` (HL7 v2-0203), no dosage block for a held/refused dose without dose or rate | Exact matches to existing fields; nothing guessed |
| D-41 | Official HL7 FHIR Validator 7.0.6 (pinned), R4 4.0.1, runs in GitHub Actions; fails on errors, reports warnings | The sandbox can't reach the HL7 package servers |
| D-42 | Encryption at rest (P-04): A1 modified (unit passphrase unlocks the vault; PINs identify and authorise), B1 encrypted backups, C1 Practice encrypted with a published passphrase, D1 staged migration on Practice first | Owner decision 20 Nov 2026; irreversible steps need separate approval |
| D-43 | Encryption middleware keeps the IndexedDB transaction alive with its own tiny reads on the request's transaction instead of `Dexie.waitFor` | Dexie's zone was unreliable inside middleware in real Chrome (live queries hung); proven by browser tests |
| D-44 | Encrypted stored row = index fields + `_enc`; logical schema unchanged; `key_store` row `vault` uses self-describing strings in the existing fields | No schema change (P-04) |
| D-45 | Recovery always issues a NEW recovery key (the typed one may have been seen); Practice keeps its published one | Security; Practice has no secrecy anyway |
| D-46 | Real-records first-time setup creates the vault before any record; recovery key shown and confirmed BEFORE the vault exists | A1; nothing to migrate, so not an irreversible step |
| D-47 | More → "Save copy" (plain JSON safety copy download) removed; list shows encrypted / not encrypted | Plain downloads defeat encryption; encrypted backup file replaces it |
| D-48 | Seed's fake `key_store` placeholder is not imported; Practice reset keeps the vault row | Placeholder isn't a key; keeps reset data readable |
| D-49 | FHIR narrative `text.status = generated`, built only from each resource's fields | dom-6 warnings; no invented content |
| D-50 | Vault idle lock 60 min, PBKDF2 600,000 iterations: prototype values in `securityPolicy.ts`, shown "Not approved" | Hospital IT decides |

## Open — need an answer

| ID | Question | What the app does now |
|---|---|---|
| P-01 | Final body map region model | First model built (21 UI/UX regions); limitations table in P-01 |
| P-03 | Optional `note.body_site` — migration in `docs/proposals/P-03-note-body-site.md` | Not applied |
| P-05 | Second-laptop credential activation: F1 admin-supervised (recommended), F2 one-time codes, or both — `docs/proposals/P-05-second-laptop-enrollment.md` | Not built; no PIN hashes move between laptops |
| P-04-D6 | Cleanup of plain copies: proposal in P-04 (needs a fresh encrypted backup first; removes only unencrypted safety copies) | Not done; plain copies kept |
| P-04-RM | Encrypting an existing Real-records database that already holds plain data (irreversible step): proposal in P-04 | Not done; app shows "not encrypted" |
| P-04-IT | Hospital IT/security review of the encryption design, idle-lock time and iteration count | Prototype values, marked not approved |
| D-04 | Repo `AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon`. Old commits had an author email that GitHub maps to an unrelated account; owner chose to rewrite authorship before publishing | **Resolved 20 Nov 2026:** all 13 commits re-authored as `Aqeela Urooj <38668564+AqeelaUrooj@users.noreply.github.com>` (owner confirmed); file content and messages unchanged; pushed |
| D-16 | Firebase project config for AI | AI not wired; `.env.example` has empty placeholders |
| D-17b | Clinical review of the warning ranges in `src/config/clinicalWarnings.ts` | Marked not approved; warn only |
| D-18 | Approved medicine timing policy (windows may differ by drug) | Shows Due only (D-25) |
| D-19 | Second-checker eligibility per local policy, credentials and regulations | RN only, temporary prototype setting in `clinicalPolicy.ts`; seed no longer shows an LPN checker |
| D-28 | Hospital-approved high-alert list and verification rules | Prototype list from the UI/UX doc, marked partial |
