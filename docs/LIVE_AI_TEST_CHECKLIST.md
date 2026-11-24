# Live AI test checklist (owner's laptop)

Goal: prove **genuine on-device inference (Gemini Nano in Chrome)** and **genuine Firebase cloud inference**, on synthetic data, with ClinBridge's offline-first safety rules holding.

Rules for this test:
- **Synthetic data only.** Practice dataset, fictional patients, fictional paper forms. No real patient data, ever.
- **Live evidence only.** Unit and browser tests in the repo use mocks; they do not count here. Record only what this laptop shows.
- **No secrets in results.** Don't paste config values, keys or the App Check debug token into the results, chat or screenshots. Close the DevTools console (where the debug token is printed) before taking screenshots.
- If a step fails, write the exact error text and stop calling that scenario "working".

---

## 0. One-time preparation (network ON)

| # | Step | Expected |
|---|---|---|
| P1 | Laptop: Windows 10/11, macOS 13+, Linux, or Chromebook Plus. **22 GB free** on the drive with the Chrome profile. GPU with **more than 4 GB VRAM**, or **16 GB RAM + 4 CPU cores**. Unmetered network for the download. | Meets all |
| P2 | Chrome → `chrome://settings/help` → update. Then `chrome://version` → note the exact version. | **148 or later** |
| P3 | `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → Relaunch. | Needed for paper-form photos |
| P4 | `git pull` on `main` → `npm ci` → create `.env.local` per `docs/FIREBASE_SETUP.md` → `npm run dev`. Note the commit: `git rev-parse --short HEAD`. | App at http://localhost:5173 |
| P5 | Open the app → **Use practice passphrase** → Kim Ellis (PIN 2468) → More → **AI check** → **Prepare on-device model**. Wait (can take many minutes). Then **Check again**. | "On-device model ready." Prompt API, text input and image input rows all **OK**; Firebase "Initialised for project …" |
| P6 | `chrome://on-device-internals` → model status. Note the model name/version shown. | Model listed as ready |
| P7 | (Optional) DevTools Console on the app tab: `await LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] })` | `"available"` |
| P8 | Make a **synthetic paper form**: either More → Device vs Cloud → pick a record → "Synthetic paper form (image)" (drawn on screen, marked PRACTICE · FICTIONAL PATIENT; screenshot it as PNG), or hand-write made-up vitals on paper marked "PRACTICE – FICTIONAL" and photograph it (JPEG/PNG). Write down the values you used. | Known values to compare against |

If P5 shows "Not downloaded yet", "can't run on this laptop" or image input not OK, fix that before the scenarios (free disk space, flag, restart Chrome).

---

## Scenario A — System Down (on-device only)

| # | Step | Expected / what to record |
|---|---|---|
| A1 | Network on. Kim Ellis → **Downtime** → **Start a practice outage**. | Banner shows **SYSTEM DOWN** |
| A2 | DevTools → **Network** tab → tick **Preserve log** → clear it. | Empty log |
| A3 | Turn **Wi-Fi off** / unplug the cable. (Don't use DevTools "Offline": it also blocks the local dev server.) Check: another tab can't load any website. | Laptop offline; app still open |
| A4 | Switch user → Daniel Okafor (PIN 2468) → a patient → **Photo of paper** → **Vitals sheet** → choose the synthetic form photo. | Photo shown |
| A5 | Press **Propose values from the photo**. | Card shows proposed values |
| A6 | **Is it genuinely on-device?** Check all of: card label **"On this laptop · ONLY_ON_DEVICE · N ms"**; Network log has **no request to any non-localhost host** (no googleapis, firebase, recaptcha, gstatic); `chrome://on-device-internals` shows the model was used (event log, if shown). | Record label, ms, the values, and the external-request count (must be 0) |
| A7 | **Put these values in the form** → correct anything against the paper → **Review** → **Save as draft** → the entry shows **"Device AI"** → **Check and confirm** beside the photo. | Saved only after nurse review; record the label |
| A8 | **Failure path:** open http://localhost:5173/sign-in in a browser with no on-device AI (e.g. Firefox), Practice, Daniel Okafor → same photo screen → **Propose values from the photo**. | Clear "no on-device AI" message, nothing sent |
| A9 | In that browser, type the values by hand → Review → **Save**. | Saves as Confirmed; manual entry unaffected |
| A10 | Back in Chrome, still offline: reload → unlock → sign in → the A7 record is still there. Then turn Wi-Fi back on. | Offline-first holds |

---

## Scenario B — Practice: Device vs Cloud

| # | Step | Expected / what to record |
|---|---|---|
| B1 | Network on. Check cloud is **blocked** while System Down: More → **Device vs Cloud** → cloud card. | "Cloud blocked: System down…"; button disabled |
| B2 | Kim Ellis → Downtime → tick the checklist → PIN → **Clear network: Back online**. | Banner no longer SYSTEM DOWN |
| B3 | DevTools → Network → clear → filter `generateContent`. More → **Device vs Cloud** → pick a fictional record → **Synthetic paper form (image)**. | Form drawn; known values listed under it |
| B4 | **Run on-device model**. | Label "On this laptop · ONLY_ON_DEVICE · N ms"; **no** generateContent request |
| B5 | **Run cloud model**. Network: one `POST …:generateContent`, status **200**. Click it → **Response** → note `modelVersion`. | Label **"Cloud · ONLY_IN_CLOUD · N ms"**; record status, `modelVersion`, ms. If 401/403 or an App Check error: see FIREBASE_SETUP step 4 |
| B6 | Look at **Differences** and at both value lists vs the known values. | Record each field: device / cloud / known |
| B7 | Repeat B4–B6 with **Synthetic note (text)**. | Same records |
| B8 | On either card → **Review this one as a draft**. | Opens the confirm screen as a **draft**; nothing is confirmed until a nurse presses confirm; label "Device AI" or "Cloud AI" |
| B9 | (Optional) Mode change: DevTools → Network throttling **Slow 3G** → **Run cloud model** → quickly, in a second tab, Kim Ellis → Downtime → **Start a practice outage**. | First tab: "Cloud answer discarded…"; no cloud values shown. Then set throttling back to "No throttling" |

---

## Scenario C — Back Online: cloud second look

| # | Step | Expected / what to record |
|---|---|---|
| C1 | Make sure the Scenario A record exists and the phase is **Back online** (B2, or Kim Ellis → Downtime → checklist → PIN → **Clear network: Back online**). | Back online |
| C2 | Recovery / To check → **Add new downtime records** → open the item with the photo from A7. Note its current values and version history. | Item opens |
| C3 | Network → clear, filter `generateContent` → **Run cloud second look**. | Label "Cloud · ONLY_IN_CLOUD · N ms"; one generateContent **200**; record `modelVersion`, ms |
| C4 | Read the differences table (confirmed record vs cloud reading). | Record each difference |
| C5 | Re-open the record / its history. | **No new version, values unchanged** (second look never edits) |
| C6 | Sign off the item as usual. | Normal recovery flow |

---

## Results template (copy, fill in, send back; no keys or tokens)

```
ClinBridge commit:            (git rev-parse --short HEAD)
Date/time + timezone:
Laptop OS + RAM/GPU:
Chrome version (chrome://version):
Multimodal flag enabled:      yes / no
Firebase JS SDK:              13.4.0 (from package-lock)
On-device model (on-device-internals):
Cloud model (modelVersion from response):
Gemini API provider:          Gemini Developer API
App Check mode:               debug token on localhost / reCAPTCHA Enterprise on <domain>

Scenario A (System Down)
  Label shown:                  
  Saved draft label:            
  Output values vs known:       
  Elapsed (ms):                 
  External requests during A5:  (count; must be 0)
  Errors:                       
  Manual fallback (A8–A9):      pass / fail
  Offline reload (A10):         pass / fail

Scenario B (Practice compare)   image | text
  Device label + ms:            
  Cloud label + ms:             
  Cloud HTTP status:            
  Output values (device/cloud/known):
  Differences table matched:    yes / no
  Nurse review before save:     pass / fail
  Cloud blocked in System Down: pass / fail
  Mode-change discard (B9):     pass / fail / not run
  Errors:                       

Scenario C (Back online second look)
  Label + ms:                   
  Cloud HTTP status:            
  Differences shown:            
  Record unchanged:             pass / fail
  Errors:                       

Network restrictions held:      yes / no (details)
```

Send the filled template (and screenshots without the DevTools console) and the results go into `TEST_REPORT.md`. Until then, the submission must not claim working live AI.

## Results so far

- **20 Nov 2026, DESKTOP-6NQ637E** (Windows 10, Chrome 157): cloud parts of Scenario B and all of Scenario C **passed**; Scenario A on-device steps **blocked by hardware** (manual fallback passed); see `docs/LIVE_TEST_RESULTS_2026-11-20.md`.
- **22 Nov 2026, DESKTOP-6NQ637E** (`main` `6636639`, fresh debug token): B1–B3, B5–B8 (cloud side) and C1–C6 **passed** again; cloud 200 with `gemini-3.5-flash-lite`, 7/7 on text and image, nulls for unwritten fields, record unchanged after the second look. B4 and A5–A7 **blocked by hardware**; A3/A10 (Wi-Fi off) and B9 not run live (automated only). See `docs/LIVE_TEST_RESULTS_2026-11-22.md`.

## Notes from the first live run

- The App Check debug token line in the console starts with **"Firebase App Check debug token:"** and appears once per page load, on the first cloud call.
- Don't switch Wi-Fi off while Claude drives the browser through the Claude in Chrome extension: the extension needs the internet. Do the Wi-Fi-off steps (A3–A10) by hand.
