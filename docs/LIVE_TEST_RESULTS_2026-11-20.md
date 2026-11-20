# Live test results: owner's PC, 20 Nov 2026

Real hardware, real Chrome, real Firebase project. Synthetic Practice data only. No credentials, keys or tokens are recorded here.

Run by Claude through the Claude in Chrome extension on the owner's PC, plus Windows System Information (read-only) for hardware. The owner ran the PowerShell setup (clone, `npm ci`, `npm run dev`) and registered the App Check debug token in the Firebase Console; Claude cannot type into terminals or enter tokens into account consoles.

## Machine

| Item | Value | Source |
|---|---|---|
| PC | DESKTOP-6NQ637E, Dell Latitude E6540 | System Information |
| OS | Windows 10 Pro, 10.0.19045 (22H2) | System Information |
| CPU | Intel Core i7-4610M, 2 cores / 4 threads | System Information |
| RAM | 8 GB | System Information |
| GPU | AMD Radeon HD 8790M, **2 GB** dedicated (2,147,483,648 bytes) + Intel HD Graphics 4600 (shared). Chrome renders on the Intel HD 4600 | System Information, WebGL renderer |
| Disk | C: 35 GB free, D: 99 GB free | System Information |
| Chrome | **157.0.8103.79** | `navigator.userAgentData` |
| App | branch `fix/app-check-cloud-instance` (on top of main `7f64a17`), `npm run dev` on localhost:5173 | owner's PowerShell |

## Firebase

| Item | State |
|---|---|
| Project | `clinbridge-hackathon` (Spark, no billing). Analytics off, Gemini in Firebase off |
| Web app | ClinBridge Web |
| AI Logic | Gemini Developer API enabled (terms accepted by the owner). AI monitoring off |
| reCAPTCHA Enterprise | Website key, score-based, domain `clinbridge-hackathon.web.app` only (**no localhost**) |
| App Check | ClinBridge Web registered (reCAPTCHA Enterprise). **Firebase AI Logic: Enforced** |
| Local dev | App Check debug provider (`npm run dev` only); one debug token registered by the owner |
| `.env.local` | On the PC, ignored by Git (`git check-ignore` confirmed). Values not recorded |

## On-device AI (Gemini Nano): BLOCKED, unsupported hardware

- Prompt API (`LanguageModel`): **present** in Chrome 157.
- `LanguageModel.availability()` for text and for text+image: **"unavailable"** (checked on the PC, and on ClinBridge → More → AI check: "Chrome says this laptop cannot run it").
- Chrome's documented minimum is a GPU with more than 4 GB VRAM, or 16 GB RAM and 4+ CPU cores (plus 22 GB free disk). This PC has 2 GB VRAM, 8 GB RAM and 2 cores, so it fails both routes. This is a hardware limit, not an app defect.
- No model download was attempted beyond the readiness check; no flags or unsupported workarounds were used.
- **No genuine on-device inference has been run.** Demo B (real Gemini Nano, offline AI, full hybrid compare) still needs compatible hardware.

## Genuine Firebase cloud inference: WORKS (after two fixes)

| # | Test | Result |
|---|---|---|
| 1 | Firebase init on the AI check page | "Initialised for project clinbridge-hackathon (Firebase JS SDK 13.4.0)" |
| 2 | First cloud call, debug token not registered | **401 "Firebase App Check token is invalid"**: App Check enforcement works |
| 3 | After registering the token: still 401, and **no App Check exchange request** in the network log | Found **defect 1** (below), fixed, regression test added |
| 4 | Practice compare, synthetic **text note**, cloud | **HTTP 200**, `modelVersion: gemini-3.5-flash-lite`, finishReason STOP, `inferenceSource` in_cloud, label "Cloud · ONLY_IN_CLOUD", 8.4–9.7 s. Only 3–4 of 7 values returned | Found **defect 2** (below) |
| 5 | Practice compare, synthetic **form image**, cloud | HTTP 200, gemini-3.5-flash-lite, IMAGE 1080 tokens + TEXT. Only 3 of 7 values before the fix |
| 6 | Same, after defect 2 fix (live test, then code) | **7/7 values + consciousness correct**, nulls for unwritten fields, in_cloud, 8.9 s |
| 7 | Practice compare, harder note ("110 over 62 … sats 94% on Nasal tube … drowsy but wakes to voice"), after fix | **7/7 correct + "Responds to voice"**; O2 flow left empty (not written). 2.9 s |
| 8 | Nurse review of a cloud answer | Admin (Kim Ellis): no "Review as draft" button. Nurse (Daniel Okafor): draft created → patient check (name, born, MRN) → "Check and confirm" with every field editable and "Made by the cloud model (Firebase AI Logic, ONLY_IN_CLOUD)… It may be wrong". Not auto-confirmed |
| 9 | On-device button on this PC | "The on-device model can't run with images on this laptop. Type the values instead." Network: only a local `data:` read, **0 external requests** |

### Defect 1: App Check never attached to cloud calls (fixed)

The AI SDK reads the App Check provider once, when the AI instance is created. ClinBridge created the AI instance early (AI check page / on-device path) and initialised App Check later, on the first cloud call, so every cloud request went out with no `X-Firebase-AppCheck` header. Fix: cloud calls use a separate Firebase app (`clinbridge-cloud`) with App Check initialised before `getAI()`; the on-device app never gets App Check. Regression test with the real SDK fails on the old code and passes now (`src/lib/ai/firebase.test.ts`).

### Defect 2: cloud model skipped clearly written values (fixed)

With every schema field optional and no descriptions, gemini-3.5-flash-lite left out pulse, sats and diastolic BP. Fix: cloud schema makes every field required and nullable (null = not written) with descriptions of the words nurses write; the prompt says "use null" instead of "leave it out". Still no guessing, calculating or unit conversion. Verified live (rows 6, 7 and the second look below).

## System Down on the real PC (network watched, Wi-Fi on)

Wi-Fi could not be switched off during the run: the Claude in Chrome extension needs the internet to receive commands. Instead, every request was logged; true no-network behaviour is covered by the automated offline browser tests on the production build.

| Test | Result |
|---|---|
| Practice outage (Admin → Downtime) | SYSTEM DOWN banner: "AI on this laptop only · Cloud blocked" |
| Cloud in Device vs Cloud during System Down | Button disabled: "Cloud blocked: System down: cloud is blocked until an admin clears the network." |
| Patient verification | "Is this the right patient?" with name, born, MRN before the chart opens |
| Paper photo (synthetic form, Arjun Mehta) | "Photo saved on this laptop", "Unchanged since saved" |
| On-device proposal | Clear "can't run" message; network: only `data:` (0 external) |
| Manual entry → review → save | Unusual-value prompts (draft ranges); Save disabled until "I re-checked these values" is ticked; saved **Confirmed**, source photo linked; 0 external requests |
| Reload | Record still there; raw IndexedDB shows the row **encrypted** (`_enc`, no plaintext values) |

## Back online: cloud second look (real)

| Test | Result |
|---|---|
| Network clearance | 3-item checklist + PIN → BACK ONLINE, "Cloud allowed · cleared by Kim Ellis" |
| Worklist | "Add new downtime records" → 1 new item (the 13:23 record) |
| Cloud second look on the paper photo | **HTTP 200**, gemini-3.5-flash-lite, IMAGE 1100 tokens, label "Cloud · ONLY_IN_CLOUD · 3608 ms". All 7 values read correctly + Alert |
| Differences | Pain (record —, cloud 0) and Consciousness (record —, cloud Alert): the two fields left blank when typing by hand |
| Record unchanged | Still Confirmed with the same values; "Nothing was changed automatically" |

Pending-request cancellation on System Down was not re-run live (it needs a slow network to catch a request in flight); it is covered by 7 unit tests and a browser test with a second tab (see TEST_REPORT).

## Demo readiness

- **Working and verified live:** Firebase cloud inference (text + image) with App Check, Practice compare cloud side, nurse review of AI drafts, cloud blocked in System Down, on-device-unavailable fallback, manual capture with photo, encrypted storage, network clearance, cloud second look.
- **Implemented, mock-tested only:** on-device Gemini Nano proposals, offline AI, Device-vs-Cloud with both sides real.
- **Blocked by hardware:** Gemini Nano on DESKTOP-6NQ637E.
- The complete hybrid demonstration is **not** verified until on-device inference runs on compatible hardware.

## Follow-ups for the owner

- ~~Delete the exposed debug token~~ **Done 20 Nov 2026:** revoked in Firebase ("No tokens registered") and removed from the PC's browser storage, so the SDK makes a fresh token next time. The reCAPTCHA Enterprise site key was not touched.
- A "Review this one as a draft" Practice draft (Tom Hale, 13:22) was left unconfirmed in the Practice data.
