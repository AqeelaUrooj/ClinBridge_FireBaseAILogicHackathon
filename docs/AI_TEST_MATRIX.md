# AI test matrix: real model vs mocks

Status 20 Nov 2026, branch `feat/ai-hybrid`. **No test so far has used a real Gemini Nano or a real Gemini cloud model.** The development sandbox has no Firebase project, and its Chrome can't run the on-device model.

## What the sandbox's real Chrome reports

Headless Chrome for Testing **153** on the CI/sandbox Linux machine, checked with the real Prompt API:
- `LanguageModel` **exists**.
- `availability()` returns **"unavailable"** for both text and image input.

So the real browser API was exercised for availability only, and ClinBridge's "can't run on this laptop" path is what a real user on such a machine sees.

## Matrix

| Scenario | Real model? | How it was tested | Result |
|---|---|---|---|
| SDK pitfall: `ONLY_ON_DEVICE` in a browser without the Prompt API sends the request to the **cloud** (SDK 13.4.0) | Real SDK, no model | `service.test.ts` with the real `firebase/ai` browser build and a fetch spy | Confirmed: `inferenceSource = in_cloud`, a googleapis request was made. **This is why ClinBridge refuses before calling.** |
| System down, Prompt API missing | Real SDK, no model | Unit (fetch spy) | Refused (`no_prompt_api`), **0 network requests** |
| System down, model available | **Mock** `LanguageModel` + real SDK | Unit + browser (`e2e/ai.spec.ts`) | Proposal labelled `on_device`, structured output requested, **0 external requests** in the browser, saved as a draft, nurse edits, "Device AI" badge |
| System down, model unavailable / not downloaded | Mock + **real Chrome API** ("unavailable") | Unit + browser | Clear message, no download started, manual entry saves |
| Something tries the network during an on-device call | Mock | Unit | Result discarded (`network_blocked`), request never reached the network |
| Cloud in System down (compare, second look, worklist) | Real SDK | Unit | `CloudBlockedError` before any request |
| Practice compare, cloud side | Real SDK + **canned** HTTP response; App Check mocked | Unit | `ONLY_IN_CLOUD`, labelled `in_cloud`, JSON schema sent |
| Compare on Real records; second look before network clearance; no App Check key | Real SDK | Unit | Refused, 0 requests |
| AI readiness | Real Chrome API (browser test); fakes (unit) | Unit + browser | Reports the API, "not downloaded" vs "can't run", the multimodal flag, Firebase init, cloud status |
| Paper photo → proposal (image input) | **Mock** model; real image pipeline in Chrome | Browser | PNG goes to the device as an image part; nurse confirms beside the photo |
| Back-online cloud second look | Not run against a model | Code path + guard unit tests | Button only after network clearance; never edits the record |
| Inference-source labels | Real SDK `response.inferenceSource` (mock / canned backends) | Unit + browser | Labels come from the SDK value, not from the mode we asked for |
| inferenceSource contract (SDK 13.4.0) | Real SDK source + runtime value with a **mock** Prompt API | Unit | Constant `{ ON_DEVICE: 'on_device', IN_CLOUD: 'in_cloud' }`; runtime value `'on_device'`; `'ON_DEVICE'`, unknown and missing values rejected |
| Cloud request running, then System down | Real SDK + **held canned** HTTP response | Unit (7) + browser (second tab declares the outage; fake reCAPTCHA/App Check/Gemini stand-ins) | Request aborted; a late answer is discarded (`CloudRevokedError`), never shown or saved; phase re-read from the database before sending and on arrival |

## What still needs a real run (owner, on a prepared laptop)

1. Desktop Chrome **148+**. Multimodal flag on. Model downloaded via ClinBridge → More → AI check → "Prepare on-device model".
2. `.env.local` with the Firebase web config and an App Check reCAPTCHA Enterprise site key (or a registered debug token on localhost, development only).
3. Run, and record what each step actually shows:
   - **System down drill:** photo of a synthetic vitals form → "Propose values from the photo" → note the time and the values.
   - **Practice → Device vs Cloud:** the synthetic note, then the synthetic form. Note both sources and the differences.
   - **Back online → Recovery item with a photo → Cloud second look.**
4. Put the observed results in TEST_REPORT. Until then, ClinBridge must not claim live AI results.

Step-by-step version with a results template: `docs/LIVE_AI_TEST_CHECKLIST.md`. Firebase console setup: `docs/FIREBASE_SETUP.md`.
