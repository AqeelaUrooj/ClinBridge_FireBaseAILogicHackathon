# Test report

Run: 20 Nov 2026 (round 2), local (Linux, Node 22, Chrome).

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` (Vitest) | **37 / 37 pass** (5 files) |
| `npm run build` | Pass (PWA, 14 files precached, 4.5 MB incl. icon font) |
| `npm run test:e2e` (Playwright) | **6 / 6 pass** |

## Unit tests

- `audit.test.ts`: JSON matches the seed's hashing; every seed audit row verifies; a tampered row is caught.
- `entries.test.ts`:
  - Seed and saving: the seed loads all 19 tables and drops non-schema fields; fake data is refused in Real records; the practice PIN is hashed; a save writes entry + child + audit together; care time and entry time stay separate.
  - Fixes and mistakes: a fix keeps the original values; double fixes and cross-patient fixes are refused; entered-in-error keeps the record; parallel saves keep the audit chain intact.
  - **High-alert guard:**
    - Refused: no second nurse, the same nurse as checker, or a non-eligible role as checker.
    - Saved: a different eligible nurse checked it.
    - No second nurse needed: a held dose.
- `vitals.test.ts`:
  - Structural blocks: text, negatives, wrong type, too many decimals, oversized values, the scale edges (oxygen 0–100%, pain 0–10), a missing BP pair, flow without a method, only the 4 awake options, at least one value.
  - Warnings only: pulse 18 / 130 / 260 / 900, and bottom BP not below top. The config is marked not approved.
- `meds.test.ts`:
  - Order handling: the high-alert names; Scheduled / As needed / Drip grouping; pre-fill with no trailing zero.
  - Checks: missing route, a bad unit and a zero dose are blocked; 50 vs 5 mg is a warning, not a block; held and refused need a reason; the second nurse is needed only for high-alert doses and rate changes.
  - Status: slot status ignores old versions; the current drip rate is the latest change, else the order.
- `cloud.test.ts`: every cloud purpose is blocked during System down; compare only on Practice; recovery help only after the network is cleared.

## Browser tests

`e2e/vitals-slice.spec.ts`:
1. Sign in → patient check → vitals:
   - Text blocked; pulse 160 warns and Save stays locked until ticked.
   - Save → reload → still there.
   - A fix needs a reason, and the old version is kept.
2. 5 wrong PINs → locked for 1 minute.
3. Opens with no network after the first visit.

`e2e/meds.spec.ts`:
4. Insulin (high-alert):
   - Save is locked until the second nurse check, and the signed-in nurse is not offered as checker.
   - A wrong PIN is refused; the right PIN works → saved → 18:00 no longer Due.
5. Metoprolol 250 mg when 25 mg is ordered: the warning must be ticked → saved → fixed to 25 mg with a reason → both versions shown.
6. Held dose: a reason is required → status Held.

Not tested yet: screen reader, tablet sizes, Firefox/Safari, the P-02 migration (not applied).
