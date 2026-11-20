# AI in ClinBridge (Firebase AI Logic hybrid inference)

**Status (20 Nov 2026): implemented on branch `feat/ai-hybrid` and tested with mocks only** (see `docs/AI_TEST_MATRIX.md`). No real model has been run yet. ClinBridge is restricted to synthetic data. AI is optional: every record can be typed by hand, and no AI proposal is saved without a nurse checking it.

| # | Capability | Where it runs | When allowed | Inference mode | Where in the app |
|---|---|---|---|---|---|
| 1 | **Paper photo → proposed vitals** (draft) | Gemini Nano in Chrome, via Firebase AI Logic | Every phase, incl. **System down** | `ONLY_ON_DEVICE` + ClinBridge guards | Patient → Photo of paper → Vitals sheet → "Propose values from the photo" |
| 2 | **Device vs Cloud compare** | Both, run separately | **Practice data only**; cloud side not in System down; cloud only when pressed | `ONLY_ON_DEVICE` and `ONLY_IN_CLOUD` | More → Device vs Cloud (`/drill/compare`) |
| 3 | **Cloud second look** | Gemini in the cloud | **Back online** (after the admin's network clearance) | `ONLY_IN_CLOUD` | Recovery → item with a photo |
| 4 | **AI check + model preparation** | This laptop | Preparation not in System down | – | More → AI check (`/ai`) |

`PREFER_ON_DEVICE` and `PREFER_IN_CLOUD` are **never** used: both can switch engines silently.

## How it is built

- **SDK:** `firebase` 13.4.0 (`firebase/app`, `firebase/ai` with `GoogleAIBackend`, `firebase/app-check`). The modules load lazily and the service worker caches them for offline use.
- **Config:** `.env.local` (template `.env.example`). Never committed. The app works without it, and the AI screens then say "not set up".
- **App Check:** reCAPTCHA Enterprise provider. It is started **only when a cloud model is first needed**, so on-device use causes no App Check or reCAPTCHA traffic. Debug-token mode applies only to development builds (`VITE_FIREBASE_APPCHECK_DEBUG=true` + `import.meta.env.DEV`); the token itself is never in a file, and production builds contain no code that sets it (checked in `dist`).
- **On-device guard (`src/lib/ai/service.ts`, `runOnDevice`):**
  1. Firebase config present.
  2. `LanguageModel` (Prompt API) present. **Required:** SDK 13.4.0 builds no on-device adapter without it, and then sends even `ONLY_ON_DEVICE` requests to the cloud (shown by a test).
  3. `LanguageModel.availability()` with the same options as the session is "available". "downloadable"/"downloading" means stop and say "prepare it first"; the call never waits minutes in a clinical flow.
  4. The SDK's on-device adapter exists in `only_on_device` mode.
  5. `fetch` is blocked for the call (`data:`/`blob:` allowed, because the SDK decodes images that way). Any network attempt discards the result.
  6. `response.inferenceSource` must be `on_device`.
- **Cloud guard:** `runInCloud` calls `assertCloudAllowed` (`src/lib/cloud.ts`) first. Cloud is never allowed in System down; compare is allowed on Practice only; second look only after network clearance. The response must report `in_cloud`.
- **Output:** a JSON schema (`responseConstraint` on device, `responseSchema` in the cloud). Checks are structural only (type, scale edges); values that fail are dropped and listed. The prompt says: copy only clearly written values, never guess.
- **Records:**
  - A proposal fills the editable form, and the record is always saved as a **draft** with `ai_proposal` (values + `_ai`: engine, SDK, mode, real source, time).
  - It is confirmed beside the photo (existing confirm flow). Correction history and the original photo are unchanged. Medication entry has no AI, so high-alert controls are untouched.
  - Seed proposals have no `_ai` block and show "Simulated proposal".

## On-device: verified platform facts

- The Prompt API (Gemini Nano in Chrome) runs on desktop Chrome only: Windows 10/11, macOS 13+, Linux, or Chromebook Plus. It does not run on Android or iOS.
- **ClinBridge's browser requirement: desktop Chrome 148 or later.** Reason: the Prompt API is on by default for web pages from Chrome 148 stable (released 5 May 2026). Before that, only Chrome extensions had it (from Chrome 138). Firebase AI Logic's own minimum (Chrome 139+, SDK 12.5.0+) is lower, but as a web app ClinBridge is bound by 148. Sampling settings (like temperature) are still an origin trial on the web, so ClinBridge must not rely on them.
- **Other browsers:** not supported. MDN lists the Prompt API as Chrome-only, and two browser vendors oppose the spec. Firefox, Safari and (per a third-party report) Chromium builds from Linux package managers will show "AI not available"; manual capture still works there.
- Hardware:
  - Storage: 22 GB free on the drive that holds the Chrome profile.
  - Processor: either a GPU with more than 4 GB of video memory, or a CPU with 16 GB RAM and 4 or more cores.
- Download and offline use: the model downloads separately the first time a site uses it, and needs the network only for that download. If free space later drops below 10 GB, Chrome removes the model, and it downloads again once the requirements are met.
- Image input (needed for paper forms): Firebase's guide says to enable the `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` flag. On-device input image types are PNG and JPEG.
- The model's presence can be checked with `LanguageModel.availability()`.

- On-device image limit (Firebase docs): up to 9216 tokens per image.
- Default cloud model in SDK 13.4.0: `gemini-3.5-flash-lite` (the get-started page says the same; the configuration-options page still mentions `gemini-2.5-flash-lite` for 12.8.0). Override with `VITE_FIREBASE_AI_CLOUD_MODEL`.
- Firebase console AI monitoring shows no data for on-device inference.

**What this means for ClinBridge**
- Each downtime laptop must download the model **before** an outage (More → AI check → Prepare). Installing Chrome isn't enough; the AI check page says "Not downloaded yet" until it is.
- The sandbox's Chrome 153 reports the Prompt API present but the model **unavailable**, so no real on-device answer has been produced yet.

## What stays true

- AI never confirms, never overwrites, and never sees data in the cloud during System down.
- No real patient data is used for development or testing.
- Manual capture and rules-only recovery remain complete without AI.

## Needed from the owner (when ready)

1. A Chrome desktop test laptop that meets the requirements, with the model downloaded (`chrome://on-device-internals` shows the model).
2. Firebase project config, set up locally by the owner (not sent through chat).
