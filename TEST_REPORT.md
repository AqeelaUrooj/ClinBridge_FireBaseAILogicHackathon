# Test report

Run: 20 Nov 2026, local (Linux, Node 22, Chrome).

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` (Vitest) | **20 / 20 pass** |
| `npm run build` | Pass (PWA, 14 files precached) |
| `npm run test:e2e` (Playwright) | **3 / 3 pass** |

## Unit tests

- `audit.test.ts` — JSON matches the seed's hashing; every seed audit row verifies; a tampered row is caught.
- `entries.test.ts` — seed loads all 19 tables and drops non-schema fields; fake data refused in Real records; practice PIN is hashed; save writes entry + child + audit together; care time and entry time stay separate; a fix keeps the original values; double fixes and cross-patient fixes refused; entered-in-error keeps the record; parallel saves keep the audit chain intact.
- `vitals.test.ts` — normal set accepted; impossible values and text refused; both BP numbers needed, bottom lower than top; at least one value; out-of-range flagged but not blocked.
- `cloud.test.ts` — every cloud purpose blocked during System down; compare only on Practice; recovery help only after the network is cleared.

## Browser tests (`e2e/vitals-slice.spec.ts`)

1. Sign in → My patients → patient check → record vitals (impossible pulse caught) → review → save → reload → still there → fix needs reason → old version kept.
2. Wrong PIN 5 times → locked for 1 minute, keypad disabled.
3. App opens with no network after the first visit.

Not tested yet: screen-reader pass, tablet sizes, Firefox/Safari.
