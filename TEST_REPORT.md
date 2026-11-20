# Test report

Run: 20 Nov 2026 (round 3), local (Linux, Node 22, Chrome).

| Check | Result |
|---|---|
| `npm run typecheck` | Pass (exit 0) |
| `npm run lint` | Pass (exit 0) |
| `npm test` (Vitest) | **53 / 53 pass** (8 files) |
| `npm run build` | Pass (PWA, 14 files precached, 4.6 MB incl. icon font) |
| `npm run test:e2e` (Playwright) | **9 / 9 pass** |

## Unit tests (8 files)

- `audit.test.ts`: the seed's hashing matches; every seed audit row verifies; tampering is caught.
- `migration.test.ts` (new): DB v2 for `entry.change_reason`:
  - Still 19 tables.
  - A real v1 database with legacy reasons gets backed up first. Every reason is copied, every other field is identical and the original values are untouched.
  - The history (corrected / supersedes) is kept, one `schema_migrated` audit row is added and the chain still verifies. The backup holds the full v1 data.
  - A new database needs no backup.
  - After v2, a fix requires a reason, which is saved only in `change_reason`; the original is not overwritten. A mistake writes `change_reason`.
- `entries.test.ts`:
  - Seed and saving: seed import; Real records stay separate; the PIN is hashed; a save is all-or-nothing.
  - Fixes and mistakes: a fix keeps the original; double and cross-patient fixes are refused; entered-in-error keeps the record; parallel saves keep the chain intact.
  - High-alert guard (repository): refused with no checker, the same nurse, or a non-eligible role; saved with a different eligible RN; not needed for a held dose.
- `vitals.test.ts`: structural checks block; clinical ranges only warn; the config is marked not approved.
- `meds.test.ts`:
  - Medicine rules: high-alert names; grouping; no trailing zero; route / unit / dose structure; 50 vs 5 mg warns; held / refused need a reason; who needs a second nurse; slot status; drip rate.
  - **Policy config:** prototype marked unapproved and partial, RN only, no timing windows; a late dose still shows Due; Overdue appears only under an approved, matching window; verification comes from the policy entries.
- `charting.test.ts` (new):
  - Fluids: structural checks; urine is not an "in"; period start/end; 9,000 mL allowed (no clinical limit); totals are plain sums.
  - Notes: type and text required; a risk score is stored as entered.
  - Labs: a result needs a value; text results are kept as text; for a critical result, missing who-was-told and read-back warn but do not block.
- `regions.test.ts` (new): exactly 21 unique regions; patient's left/right correct on front and back; every standard site word maps to a region.
- `cloud.test.ts`: cloud blocked during System down; allowed purposes only after the network is cleared.

## Browser tests (9)

| File | Test |
|---|---|
| vitals-slice | Sign in → check patient → vitals (text blocked, unusual pulse needs a tick) → save → reload → still there → fix with reason → versions |
| vitals-slice | 5 wrong PINs → locked 1 minute |
| vitals-slice | Opens with no network after the first visit |
| meds | Insulin: second-nurse PIN required, own name not offered, wrong PIN refused → saved, 18:00 not Due |
| meds | 250 mg vs ordered 25 mg: tick the warning → save → fix to 25 mg with a reason → both versions |
| meds | Held dose needs a reason → status Held |
| charting | Fluids: Rosa Santos 240 in / 770 out (−530) → add 200 by mouth → 440 / 770 (−330) (totals checked against the seed file) |
| charting | Note → fix with reason → old version shown |
| charting | Critical lab: missing read-back warns, Save locked → fill in → saved → shows on Ward labs |

Not tested yet: screen reader, tablet sizes, Firefox/Safari, migration inside a real browser (covered by the unit test with an IndexedDB emulator).
