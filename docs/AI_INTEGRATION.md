# AI in ClinBridge (Firebase AI Logic hybrid inference)

**Status (22 Nov 2026):** genuine Firebase cloud inference (`gemini-3.5-flash-lite`, `ONLY_IN_CLOUD`, App Check enforced) is **live-tested** on the owner's PC with text notes and paper-form photos (`docs/LIVE_TEST_RESULTS_2026-11-20.md`, `docs/LIVE_TEST_RESULTS_2026-11-22.md`). Gemini Nano on-device inference is **implemented and mock-tested only** (`docs/AI_TEST_MATRIX.md`): that PC's hardware can't run it, so it has not been verified live. Console setup in `docs/FIREBASE_SETUP.md`. ClinBridge is restricted to synthetic data. AI is optional: every record can be typed by hand, and no AI proposal is saved without a nurse checking it.

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
  6. `response.inferenceSource` must equal the SDK's `InferenceSource.ON_DEVICE` (see "inferenceSource contract" below).
- **Cloud guard + cloud gate:** `runInCloud` runs inside `runGuardedCloud` (`src/lib/cloudGate.ts`), which applies the rules in `src/lib/cloud.ts` for the whole life of the request. Cloud is never allowed in System down; compare is allowed on Practice only; second look only after network clearance. The response must equal the SDK's `InferenceSource.IN_CLOUD`. Details in "Cloud request during a mode change" below.
- **Output:** a JSON schema (`responseConstraint` on device, `responseSchema` in the cloud). Checks are structural only (type, scale edges); values that fail are dropped and listed. The prompt says: copy only clearly written values, never guess.
- **Records:**
  - A proposal fills the editable form, and the record is always saved as a **draft** with `ai_proposal` (values + `_ai`: engine, SDK, mode, real source, time).
  - It is confirmed beside the photo (existing confirm flow). Correction history and the original photo are unchanged. Medication entry has no AI, so high-alert controls are untouched.
  - Seed proposals have no `_ai` block and show "Simulated proposal".

## Two Firebase app instances (found live, 20 Nov 2026)

- The AI SDK reads the App Check provider **once**, when the AI instance is created. So ClinBridge uses two Firebase apps: `clinbridge` (on-device; never gets App Check, so no reCAPTCHA traffic) and `clinbridge-cloud` (cloud; App Check is initialised **before** `getAI()`).
- Before this fix, cloud requests carried no App Check token and Firebase answered 401. Regression test: `src/lib/ai/firebase.test.ts`.

## Cloud vitals schema

- Cloud `responseSchema`: every field **required and nullable** (null = not written), each with a description of the words nurses write (pulse, resps, sats, temp, "BP 128/80"). With optional, undescribed fields, gemini-3.5-flash-lite skipped clearly written values. Verified live.
- On-device constraint: same descriptions, fields optional (nullable types untested on a real Prompt API model).

## inferenceSource contract (verified for the installed SDK)

- Installed: `firebase` **13.4.0**, which bundles `@firebase/ai` 3.1.0. Its source defines
  `InferenceSource = { ON_DEVICE: 'on_device', IN_CLOUD: 'in_cloud' }`.
- The Firebase docs write `InferenceSource.ON_DEVICE` / `InferenceSource.IN_CLOUD`. Those are the **constant names**. The value the SDK puts on `response.inferenceSource` at runtime is the **lowercase string**. So the docs and our tests agree; there is no mismatch.
- ClinBridge compares against the SDK's own constant (`sdkInferenceSource()` in `src/lib/ai/firebase.ts`, `classifySource()` in `service.ts`), not a hand-typed string. If a future SDK changed the values, the constant would change with it.
- Exact match only. `'ON_DEVICE'` (uppercase string), unknown values, and a missing value are **rejected** and the result is discarded. The on-device path accepts only `ON_DEVICE`; a cloud-labelled answer there is discarded, so `ONLY_ON_DEVICE` is not weakened.
- Tests (`src/lib/ai/service.test.ts`, "inferenceSource contract"): pins the SDK version and constant values; runs the real SDK with a mock Prompt API and checks the runtime value is `InferenceSource.ON_DEVICE` (`'on_device'`); checks every rejected spelling.
- Still to confirm on a real laptop: that a real Gemini Nano answer and a real cloud answer report these same values (checklist steps A6 and B4).

## Cloud request during a mode change (cloud gate)

What happens if a cloud request is already running and ClinBridge switches to System down (or the dataset switches, or Back online ends):

1. **Before anything:** the screen's snapshot, the latest phase the app published, and a **fresh read of the phase from the database** must all allow the purpose. Otherwise nothing is set up or sent.
2. **Immediately before transmission** (after App Check setup and image encoding): checked again, including a fresh database read.
3. **While running:** the app shell publishes every phase/dataset change (`publishCloudContext` in `src/state/app.tsx`). If the change no longer allows the request, its `AbortController` is aborted; the SDK passes that signal to `fetch` (`generateContent(request, { signal })`). This also works across tabs on the same laptop, because the phase comes from IndexedDB (tested in the browser with a second tab declaring the outage).
4. **When the answer arrives:** checked again (fresh database read). If authorisation was revoked at any point, the answer is thrown away (`CloudRevokedError`): never returned, never shown, never saved. The screens also clear any cloud answer already on screen when cloud stops being allowed, and "Review this one as a draft" re-checks before saving a cloud answer.
5. While the records are locked or not readable, the gate fails closed (treated as System down).

**What cannot be prevented (browser limits):**
- Once the HTTPS request has been **transmitted**, its body (the synthetic note or form photo) has left the laptop. Aborting only stops ClinBridge waiting for and using the answer. Google's servers may still receive, process and log the request, and it may count toward quota.
- An abort cannot stop bytes already in the network stack, and the browser may still finish the TCP/TLS exchange.
- App Check token requests and SDK background calls (e.g. heartbeat) may already be in flight when the phase changes; they carry no clinical content.
- This is why cloud is only ever used on Practice data or after network clearance, and System down never starts a cloud request in the first place.

Regression tests: `src/lib/ai/service.test.ts` → "cloud request during a mode change" (7 tests, incl. pending request + System down, server answering anyway, database phase flip before send and during flight, stale screen snapshot, dataset switch, unreadable phase); `e2e/ai.spec.ts` → "pending cloud compare, then System down declared in another tab".

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
2. Firebase project config, set up locally by the owner (not sent through chat): `docs/FIREBASE_SETUP.md`.
3. One real run of each scenario, recorded with `docs/LIVE_AI_TEST_CHECKLIST.md`.
