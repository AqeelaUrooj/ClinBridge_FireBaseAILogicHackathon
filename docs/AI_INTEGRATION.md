# AI in ClinBridge: four separate capabilities

**Status (20 Nov 2026): none integrated.** ClinBridge is restricted to synthetic data. Manual paper capture, handover, and rules-only recovery work fully without AI. The only "proposals" or "second-look" values in the app come from the synthetic practice data and are labelled as simulated.

| # | Capability | Where it runs | When allowed | Depends on | Status |
|---|---|---|---|---|---|
| 1 | **On-device inference**: photo quality check, reading a paper form into a **draft**, handover draft | Chrome's built-in Gemini Nano on the laptop | Any mode, incl. **System down** | Chrome desktop + downloaded model (below) | Not built |
| 2 | **Firebase AI / cloud inference** (Gemini via Firebase AI Logic) | Google cloud | **Back online only** (cloud guard `src/lib/cloud.ts` already blocks it in System down) | Firebase project config, App Check | Not built |
| 3 | **Practice comparison** (`/drill/compare`): same photo read on-device and in the cloud, side by side, for training | Both | **Practice dataset only** (cloud guard rule already exists) | 1 + 2 | Placeholder page |
| 4 | **Recovery cloud second look**: re-read the original photo in the cloud and flag differences as "Recheck" | Cloud | Back online, after network clearance | 2 + stored photos | Rules-only worklist works now; the `recheck` flag is filled only by practice data |

## 1. On-device: verified platform facts

- The Prompt API (Gemini Nano in Chrome) runs on desktop Chrome only: Windows 10/11, macOS 13+, Linux, or Chromebook Plus. It does not run on Android or iOS.
- **ClinBridge's browser requirement: desktop Chrome 148 or later.** Reason: the Prompt API is on by default for web pages from Chrome 148 stable (released 5 May 2026). Before that, only Chrome extensions had it (from Chrome 138). Firebase AI Logic's own minimum (Chrome 139+, SDK 12.5.0+) is lower, but as a web app ClinBridge is bound by 148. Sampling settings (like temperature) are still an origin trial on the web, so ClinBridge must not rely on them.
- **Other browsers:** not supported. MDN lists the Prompt API as Chrome-only, and two browser vendors oppose the spec. Firefox, Safari and (per a third-party report) Chromium builds from Linux package managers will show "AI not available"; manual capture still works there.
- Hardware:
  - Storage: 22 GB free on the drive that holds the Chrome profile.
  - Processor: either a GPU with more than 4 GB of video memory, or a CPU with 16 GB RAM and 4 or more cores.
- Download and offline use: the model downloads separately the first time a site uses it, and needs the network only for that download. If free space later drops below 10 GB, Chrome removes the model, and it downloads again once the requirements are met.
- Image input (needed for paper forms): Firebase's guide says to enable the `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` flag. On-device input image types are PNG and JPEG.
- The model's presence can be checked with `LanguageModel.availability()`.

**What this means for ClinBridge**
- Each downtime laptop must meet those requirements and must download the model **before** an outage. The Admin readiness check would show "AI ready / not ready" (today it only detects whether the API exists).
- The test environment used for this build cannot run Gemini Nano, so no on-device result has been produced or tested.
- Planned interface: one `AiService` with `photoCheck(image)`, `extractForm(type, image)` and `draftHandoff(entries)`.
  - It uses `ONLY_ON_DEVICE` in System down.
  - Output is schema-constrained JSON.
  - Results always become a **draft** with a Device badge; the existing confirm flow does the rest.

## 2–4. Cloud: what is needed

- **Firebase project web config.** Put it in `.env.local` on the build machine; never paste keys into chat and never commit them.
- **App Check** (enforced for AI Logic).
- **Cloud calls only through the existing cloud guard:** never in System down, and compare only on Practice.
- **Rules-only fallback** stays the default when the cloud fails (Implementation Plan H8).

## What stays true

- AI never confirms, never overwrites, and never sees data in the cloud during System down.
- No real patient data is used for development or testing.
- Manual capture and rules-only recovery remain complete without AI.

## Needed from the owner (when ready)

1. A Chrome desktop test laptop that meets the requirements, with the model downloaded (`chrome://on-device-internals` shows the model).
2. Firebase project config, set up locally by the owner (not sent through chat).
