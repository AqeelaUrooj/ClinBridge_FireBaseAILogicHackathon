# On-device AI: what is needed and current status

**Status: not integrated.** Paper capture, handover and every other workflow run fully without AI. No AI result is shown anywhere. The only "proposals" in the app are stored values inside the synthetic practice data, and they are labelled as simulated.

## What the platform supports (checked 20 Nov 2026, Firebase AI Logic docs)

- On-device inference on the web uses Chrome's built-in Prompt API (Gemini Nano). It works on **Chrome desktop 139 or later only**.
- Image input needs the flag `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` to be enabled. The model is **not on the device by default** and must download once (it can be downloaded before the first request).
- Firebase AI Logic Web SDK **12.5.0 or later**. Supported on-device: single-turn text output from text or **text + image (JPEG, PNG)**, with structured JSON output.
- App Check is enforced for AI Logic. It matters only for cloud calls (Back online mode).

## What this means for ClinBridge

| Need | Plan | Blocker |
|---|---|---|
| Photo check + form reading during System down | `ONLY_ON_DEVICE` model, JPEG/PNG input, JSON output, so the result becomes a **draft** the nurse confirms (confirm flow already built) | Needs a real Chrome desktop with the model downloaded; the test container cannot run Gemini Nano |
| Handover draft | Same, text-only input built from confirmed records | Same |
| Cloud second look / worklist (Back online only) | `ONLY_IN_CLOUD`, behind the existing cloud guard (`src/lib/cloud.ts`) | Firebase project config + App Check |
| Offline model availability | Check availability at start-up; show "AI not available on this laptop" and keep manual mode | Model download must happen before the outage (readiness check) |

Rules that stay: AI never confirms, never overwrites, and never runs in the cloud during System down. Every AI value is a draft with a Device badge.

## Needed from the owner when ready

1. Firebase project web config (put in `.env.local`, never committed).
2. A Chrome desktop (139+) laptop for testing, with the multimodal flag on and the model downloaded.
