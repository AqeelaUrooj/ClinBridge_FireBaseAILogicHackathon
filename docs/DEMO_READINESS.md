# Hackathon demo readiness (#BuildHybridAI 2026)

Reviewed 20 Nov 2026. Deadline 30 Nov 2026. **Synthetic data only.**

## The honest headline

The hackathon is about **hybrid AI with Firebase AI Logic** (on-device + cloud). **ClinBridge has no AI integrated yet.** Everything else (offline charting, encryption, recovery, FHIR export) works without it, by design. To show the hackathon's core idea, the AI part has to be built in the 10 days left, and that is blocked on two things only the owner can provide (see "Blockers").

## What can be demoed today (Practice dataset, fake patients)

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

## Blockers for the AI part (owner)

1. **Firebase project web config.** Put it in `.env.local` on the build machine. Never paste keys into chat or commit them.
2. **A test laptop with desktop Chrome 148+** that meets the Gemini Nano hardware requirements, with the model downloaded (see `docs/AI_INTEGRATION.md`). The development sandbox can't run Gemini Nano, so nothing on-device has been tested.

## Smallest AI scope that fits the time (proposal, not started)

Keeping AI optional and never in the critical path:
- **On-device (System down):** photo of a vitals form → schema-constrained JSON → a **draft** with a "Device" badge. The nurse confirms beside the photo (the existing confirm flow). If AI isn't available, the screen says so and manual entry works as today.
- **Cloud (Back online only, through the existing cloud guard):** recovery second look. Re-read the stored photo and flag differences as "Recheck". The rules worklist stays the default.
- **Practice compare (Practice only):** on-device vs cloud side by side.

## Other risks for the demo

- First load needs the network (to cache the app). Do it before going offline.
- Chrome desktop only for AI; the rest works in other Chromium browsers but is tested in Chrome only.
- Hosting is optional (Vercel or any static HTTPS host; see DEPLOYMENT.md). Not deployed yet.
- No real hospital review; say so in the submission (`docs/SECURITY_REVIEW.md`).
