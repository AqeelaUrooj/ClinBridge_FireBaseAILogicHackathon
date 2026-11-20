# Hackathon demo readiness (#BuildHybridAI 2026)

Reviewed 20 Nov 2026. Deadline 30 Nov 2026. **Synthetic data only.**

## The honest headline

Hybrid AI with Firebase AI Logic is **built** (merged to `main` via PR #7), but it has only been tested with **mocks**. It is **not** a completed, working hybrid-AI demonstration until the live test in `docs/LIVE_AI_TEST_CHECKLIST.md` passes. No real Gemini Nano or Gemini cloud answer has been produced yet; see `docs/AI_TEST_MATRIX.md`. The demo needs a prepared laptop and the owner's Firebase config. Everything else (offline charting, encryption, recovery, FHIR export) works without AI, by design.

## Demo instructions (synthetic data only)

**Before the demo (network on):**
1. Fill `.env.local` per `docs/FIREBASE_SETUP.md`. On localhost use `npm run dev` with the App Check debug token (cloud needs it; reCAPTCHA keys must not list localhost). On a deployed domain use `npm run build` with a reCAPTCHA Enterprise key for that domain.
2. Laptop: desktop Chrome 148+, with `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled and Chrome restarted.
3. Open ClinBridge once (caches the app). Unlock with **Use practice passphrase**, sign in as Kim Ellis (PIN 2468) → More → **AI check**. Press **Prepare on-device model** and wait for "ready". Every row should be OK. If "Not downloaded" or "can't run" shows, fix that first.
4. Print or open a synthetic paper vitals form. Or use Device vs Cloud with the synthetic paper form option, which draws one on screen.

**Scenario 1: hospital outage (on-device only)**
1. Kim Ellis → Admin → Downtime → **Start a practice outage**. The banner shows SYSTEM DOWN.
2. Turn the network off (Wi-Fi off). With `npm run dev`, don't use DevTools → Offline: it also blocks the local dev server.
3. Switch user → Daniel Okafor → patient → **Photo of paper** → Vitals sheet → take or choose the synthetic form photo.
4. **Propose values from the photo**. The card shows "On this laptop · ONLY_ON_DEVICE · N ms" and the proposed values.
5. **Put these values in the form** → correct anything against the paper → Review → **Save as draft** → **Check and confirm** beside the photo.
6. Reload while offline → unlock → sign in → the record is still there (encrypted on disk).

**Scenario 2: hybrid comparison (Practice)**
1. Network on. Still in Practice: Admin → Downtime → tick the checklist → PIN → **Clear network: Back online**. Compare's cloud side is blocked in System down.
2. More → **Device vs Cloud** → pick a fictional record → Synthetic note or Synthetic paper form.
3. **Run on-device model**, then **Run cloud model** (an explicit press). Each card shows its real source and time. The Differences table lists field by field, without saying which is right.
4. **Review this one as a draft** → confirm screen (nurse review).

**Scenario 3: EHR recovery**
1. Back online (from scenario 2). Recovery / To check → **Add new downtime records** → open an item with a photo (from scenario 1) → **Run cloud second look**. It lists differences from the confirmed record and changes nothing → sign off.
2. Export → tick "sensitive, not encrypted" → **Download file**. The FHIR R4 Bundle passes the HL7 validator with 0 errors (not EHR interoperability).

If any AI step says "not set up / can't run / not downloaded", say so on camera and continue with manual entry. The app keeps working, which is part of the point. Never present a mock or the seed's simulated proposals as model output.

## What can be demoed today without AI (Practice dataset, fake patients)

| # | Flow | Works offline | Notes |
|---|---|---|---|
| 1 | Open the app, unlock with the practice passphrase, sign in (PIN 2468) | Yes | The unlock screen shows encryption at rest |
| 2 | Ward board → patient check → record vitals → review → save → fix with a reason | Yes | Append-only versions, audit chain |
| 3 | Medicines incl. high-alert second-nurse PIN; held/refused with a reason | Yes | |
| 4 | Fluids, notes, labs (critical-result log), body map, handover with print | Yes | |
| 5 | Photo of a paper form → typed values → draft → confirm beside the photo | Yes | Manual today; this is where on-device AI would fill the draft |
| 6 | Admin: declare downtime → network clearance → recovery worklist (possible duplicate explained) → sign off | Yes | Rules only |
| 7 | FHIR R4 export with "sensitive" confirmation | Yes | Passes the HL7 validator with 0 errors (not EHR interoperability) |
| 8 | Lock records → reload → unlock; encrypted backup file | Yes | |
| 9 | Real records: first-time setup with passphrase + recovery key; second laptop by enrollment file | Yes | Use synthetic names only |

Suggested 3-minute story: 1 → 2 (go offline in DevTools first) → 5 → 6 → 7, with 8 as a short security aside.

## Blockers for the live AI demo (owner)

1. **Firebase project + App Check:** web config and reCAPTCHA Enterprise site key in `.env.local`. Never paste keys into chat or commit them.
2. **A laptop with desktop Chrome 148+** that can run Gemini Nano, with the model prepared. The sandbox's Chrome reports the model "unavailable".
3. **One real run of the three scenarios** (`docs/LIVE_AI_TEST_CHECKLIST.md`), recorded in TEST_REPORT before the submission claims live results.

## Other risks for the demo

- First load needs the network (to cache the app). Do it before going offline.
- Chrome desktop only for AI; the rest works in other Chromium browsers but is tested in Chrome only.
- Hosting is optional (Vercel or any static HTTPS host; see DEPLOYMENT.md). Not deployed yet.
- No real hospital review; say so in the submission (`docs/SECURITY_REVIEW.md`).
