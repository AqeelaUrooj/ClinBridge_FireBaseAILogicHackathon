# Test report

Run: 20 Nov 2026 (round 5), local (Linux, Node 22, Chrome). All runs below happened after the last code change.

| Check | Result |
|---|---|
| `npm run typecheck` | Pass (exit 0) |
| `npm run lint` | Pass (exit 0) |
| `npm test` (Vitest) | **73 / 73 pass** (15 files) |
| `npm run build` | Pass (PWA, 22 files precached incl. illustrations) |
| `npm run test:e2e` (Playwright) | **23 / 23 pass** |

## Unit tests (12 files)

Earlier files still pass unchanged in purpose:
- `audit`, `migration` (DB v2), `entries` (incl. the high-alert guard)
- `vitals`, `meds` (incl. the policy config), `charting`, `cloud`

New or changed this round:
- `regions.test.ts`:
  - The same 21 region ids as before.
  - The patient's left/right is correct in both views, both for the tap area and for the body part it is clipped to.
  - Heels can be picked only from the back view and feet only from the front view.
  - Every standard site word maps to a region.
- `MedIllustration.test.tsx`: every registered illustration has a bundled local file (no external URL); it is decorative unless given a label.
- `handoff.test.ts`:
  - Saving adds a new row with an audit row; earlier handovers are unchanged and blank open items are dropped.
  - Only confirmed records of the same patient can be linked; Situation, Background and Assessment are required.
  - The audit chain stays valid.
- `photoQuality.test.ts`: a clear page passes; dark, washed-out, blurry and small photos get hints.
- `capture.test.ts`:
  - The photo is saved first with its hash and a `photo_saved` audit row, then linked from the entry; non-pictures are refused.
  - Confirming a draft keeps the proposal, works only on drafts and keeps the chain valid.
  - A high-alert draft still needs the second nurse.

## Round 5 additions

Unit:
- `admin.test.ts`:
  - Only an active admin can manage staff; every action is audited and PINs are never logged.
  - You cannot switch off yourself.
  - Downtime lifecycle: end is blocked until the worklist is signed off; declare → System down; network clearance needs every checklist item, the right PIN and an admin.
  - Fake files are refused for Real records; first-time setup runs once; patient-list import goes into Real records only.
- `worklist.test.ts`:
  - The interval is read from the order text only.
  - New items carry duplicate, missing-field and time-conflict flags; existing items are untouched; a second build adds nothing.
  - Sign-off happens once and is refused for drafts.
- `fhir.test.ts`:
  - The synthetic data gives a valid Bundle with more than 100 resources, and drafts are excluded.
  - The corrected version is entered-in-error with a Provenance revision; blood pressure is a LOINC panel; a held dose is not-done; every resource is tagged.
  - The validator catches a broken reference, a bad status and a bad date.

Browser (`admin-recovery.spec.ts`):
- Admin: readiness → add staff → change log filter → settings all "Not approved" → End downtime refused → a nurse sees "Admins only."
- Recovery: 45-item worklist → possible duplicate for Grace Bell explained ("every 6 hours") with the record to compare → sign off → count goes up → export prepared, structure check passed, file downloaded and parsed as a FHIR Bundle with Provenance.
- First-time setup for Real records from the sign-in screen.
- **Offline:** network off → admin signs in → recovery builds → export prepares and validates.

## Browser tests (19 from earlier rounds)

| File | Tests |
|---|---|
| vitals-slice (3) | Vitals save / reload / fix; PIN lockout. **Offline:** after the first load, network off → reload → sign in → illustrations load (no broken images) → record vitals → reload offline → still there → body map renders |
| meds (3) | High-alert second nurse; dose warning + fix; held needs a reason |
| charting (3) | Fluid totals (checked against the seed file); note fix; critical lab warning |
| **body-map (5)** | Front/Back/Both switch; all 21 regions clickable and highlighted; patient's left/right position in both views; keyboard Enter selects; list picker selects a back-only region; 2 injection markers link to the right record (`e-022`); IV marker comes only from `med_admin.site`; tap areas keep their place relative to the drawing after a window resize |
| **handover (2)** | Ward list → patient → write with "insert facts" and "add line" → review → save → history → view → print layout shows MRN header and hides buttons; Review blocked without S/B/A |
| **capture (3)** | Photo saved first ("Unchanged since saved") → typed pulse → draft → check and confirm beside the photo → confirmed with source photo; dark photo hint does not block; practice proposal labelled as simulated, missing photo file stated |

Not tested yet: screen reader pass, tablet sizes, Firefox/Safari, real Gemini Nano (not available in this environment).
