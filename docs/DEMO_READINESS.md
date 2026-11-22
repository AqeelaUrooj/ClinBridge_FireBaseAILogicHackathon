# Hackathon demo readiness (#BuildHybridAI 2026)

Reviewed 20 Nov 2026. Deadline 30 Nov 2026. **Synthetic data only.**

## The honest headline

Hybrid AI with Firebase AI Logic is built (PR #7). **Live status (20 Nov 2026, owner's PC DESKTOP-6NQ637E, see `docs/LIVE_TEST_RESULTS_2026-11-20.md`):**

- **Verified live:** genuine Firebase cloud inference (gemini-3.5-flash-lite, text and image) with App Check enforced; Practice compare (cloud side); nurse review of AI drafts; cloud blocked in System Down; on-device-unavailable fallback; manual capture; encrypted storage; network clearance; cloud second look.
- **Implemented, mock-tested only:** on-device Gemini Nano proposals, offline AI, Device-vs-Cloud with both sides real.
- **Blocked by hardware:** Gemini Nano on DESKTOP-6NQ637E (2 GB VRAM, 8 GB RAM, 2 cores; Chrome reports the model "unavailable").

It is **not** a completed hybrid-AI demonstration until on-device inference runs on compatible hardware (Demo B below). The demo needs a prepared laptop and the owner's Firebase config. Everything else (offline charting, encryption, recovery, FHIR export) works without AI, by design.

**Presenting:** follow `docs/DEMO_WALKTHROUGH.md` (10 steps, each marked live / automated / hardware-blocked). Gemini Nano on another laptop: `docs/GEMINI_NANO_SECOND_LAPTOP.md`.

**Re-checked 22 Nov 2026** on the same PC (`main` `6636639`, see `docs/LIVE_TEST_RESULTS_2026-11-22.md`): local typecheck, lint, Vitest 199/1 skipped, build and Playwright 31/31 pass; App Check enforced; cloud 200 with gemini-3.5-flash-lite, 7/7 on text and image; walkthrough steps 1–9 pass live, step 10 hardware-blocked. Tip: in walkthrough step 4 keep the default "When measured" time, or the photo record won't join the worklist for step 7; after the step 5 reload the downtime history may show "back online" earlier than "down" (Practice clock restarts at 13:20 on every load).

**App Check debug token:** the token used in live testing was revoked on 20 Nov 2026 (it was briefly exposed in a console log). Register a fresh one for each demo session and revoke it afterwards (walkthrough, "Before the demo"). A new one ("DESKTOP-6NQ637E localhost dev (22 Nov)") was registered on 22 Nov 2026 and must be revoked after the demo.

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

1. ~~Firebase project + App Check~~ **Done** (`clinbridge-hackathon`, App Check enforced, debug token for localhost).
2. **A laptop that can run Gemini Nano** (GPU with more than 4 GB VRAM, or 16 GB RAM + 4 cores; Chrome 148+; 22 GB free disk). DESKTOP-6NQ637E cannot.
3. On that laptop: Scenario 1 and the on-device side of Scenario 2 (`docs/LIVE_AI_TEST_CHECKLIST.md`). Scenario 3 (cloud second look) and the cloud side of Scenario 2 already passed live.

**Two demos until then:** *Demo A (this PC, verified):* real cloud inference with App Check, offline nursing documentation, encryption, recovery, on-device-unavailable fallback, manual capture, FHIR export. *Demo B (compatible hardware, not yet run):* real Gemini Nano, on-device image reading, offline AI proposals, full Device vs Cloud. Mark Demo B verified only after it has actually run.

## Other risks for the demo

- First load needs the network (to cache the app). Do it before going offline.
- Chrome desktop only for AI; the rest works in other Chromium browsers but is tested in Chrome only.
- Hosting is optional (Vercel or any static HTTPS host; see DEPLOYMENT.md). Not deployed yet.
- No real hospital review; say so in the submission (`docs/SECURITY_REVIEW.md`).
