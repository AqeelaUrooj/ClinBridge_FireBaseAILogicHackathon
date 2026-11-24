# Live test results: public judge preview, 24 Nov 2026 (UTC)

Firebase Hosting preview of the Practice-only judge build, real Firebase project, fictional Practice data only. No keys, tokens or configuration values are recorded here. Times are UTC (the evening of 24 Nov, early 25 Nov in Pakistan).

| Item | Value |
|---|---|
| Address | https://clinbridge-hackathon--judge-preview-2d0uqehe.web.app (ends 2 Dec 2026) |
| Code | `main` = `b025eaa`; all 49 files on the site are identical to the local judge build |
| PC / browser | Windows 10 Pro 10.0.19045, Chrome 157 |
| Firebase plan | Spark. Not changed |
| Production address | Not deployed at this point ("Site Not Found") |

## Genuine cloud AI

Run in the owner's normal Chrome on the preview, Practice phase Back online. Fictional patient **Tom Hale** (pt-05), set of 12:00. One run per design. Source label of every answer: **Cloud · ONLY_IN_CLOUD**. The answer never came from the device and there was no fallback. A real picture file was sent; only vital signs are compared.

| Design | Time | Actual model | Known values in the picture | Correct | Wrong or missing | Response time | App Check |
|---|---|---|---|---|---|---|---|
| Assessment sheet | 20:17 | gemini-3.5-flash-lite (model in the request) | 8 | **8** | none | 9523 ms | reCAPTCHA token exchange 200, answer 200 |
| Shift report | 20:42 | gemini-3.5-flash-lite (the answer's `modelVersion`) | 9 | **9** | none | 9314 ms | token sent, answer 200 |
| Bedside worksheet | 20:43 | gemini-3.5-flash-lite (`modelVersion`) | 9 | **9** | none | 5455 ms | token sent, answer 200 |
| Pocket notes | 20:44 | gemini-3.5-flash-lite (`modelVersion`) | 9 | **9** | none | 6757 ms | token sent, answer 200 |

Known and answered: blood pressure 114/66, pulse 72, breathing 18, temperature 36.6 °C, oxygen level 95 %, oxygen flow 2 L/min, awake: Alert, and pain 2/10 (not written on the Assessment sheet, so 8 values there). Blood sugar is not in this set; the model answered "null" in the last three runs, which is right. The Content-Security-Policy refused nothing.

No run failed. **What this does not show:** one patient, one run per design, drawn handwriting. It says nothing about real paper, other patients, or a nurse's handwriting. All 35 values come from the same set of vital signs; the last three runs repeat the first one's values on another design. On-device AI was not run.

## Restrictions set on 24 Nov 2026 (owner's approval)

| Setting | Before | Now |
|---|---|---|
| Firebase AI Logic, "Generate content requests per minute per project per user …" | 100 in 43 regions | **5** in 43 regions |
| Browser API key: APIs | 25 | **2**: Firebase AI Logic API, Firebase App Check API |
| Browser API key: websites | any | `https://clinbridge-hackathon.web.app/*`, `https://clinbridge-hackathon--judge-preview-2d0uqehe.web.app/*`, `http://localhost:5173/*` |
| reCAPTCHA key domains | production host | production host and preview host |

The 25 APIs before, to put them back if ever needed: Cloud Datastore, Cloud Firestore, Cloud Logging, Cloud SQL Admin, Cloud Storage for Firebase, FCM Registration, Firebase AI Logic, Firebase App Check, Firebase App Distribution, Firebase App Hosting, Firebase App Testers, Firebase Hosting, Firebase In-App Messaging, Firebase Installations, Firebase Management, Firebase ML, Firebase Phone Number Verification, Firebase Realtime Database Management, Firebase Remote Config, Firebase Remote Config Realtime, Firebase Rules, Firebase SQL Connect, Identity Toolkit, ML Kit, Token Service.

Not changed: live-audio ("Bidi") limits, App Check (Enforced), billing, every other quota and key setting.

Requests with the key from outside the app, after the change:

| Request | Answer |
|---|---|
| Production, preview or localhost:5173 as the website, **no App Check token** | 401 |
| Another website, another web.app site, localhost on another port, no website | 403 |
| Another API (Identity Toolkit) | 403 API_KEY_SERVICE_BLOCKED |

A cloud run on localhost:5173 with a debug token was not repeated after the change.

## Rules checked again

| Check | Result |
|---|---|
| System down, network on | Cloud button off, "Cloud blocked: System down"; no request to Google |
| System down, no network | Cloud blocked |
| Practice only: old Real preference, `/setup`, sign-in, unlock | No Real choice; `/setup` goes to `/sign-in`; no Real database |

## Installation and offline (real Chrome, new profile, preview address)

| Check | Result |
|---|---|
| Landing page, HTTPS, security headers, direct addresses, missing asset | OK (200 / 404) |
| Chrome offers installation, no installability errors | OK |
| Installed, Start menu entry "ClinBridge Practice", own window, starts at `/sign-in` | OK. Started by a test command, not by a click in Chrome's dialog |
| No address reachable for that Chrome: start from the Start menu, sign in, ten patients, vitals, note, medicines, body map, four reports, picture download | OK |
| Chrome closed completely, still no network | Vitals and note still there |
| Network back | SYSTEM DOWN until the admin clears it; then Back online and FHIR export (305 resources) |
| Uninstall | Start menu entry gone |

For the owner: the click in Chrome's dialog, Wi-Fi off, and a Windows restart while offline ([JUDGE_RELEASE_CHECKLIST.md](JUDGE_RELEASE_CHECKLIST.md), section 5). On the Bedside worksheet of 20:43 a note by the owner's own test is visible ("offline PWA persistence verification", "created while Wi-Fi was disconnected"); this file does not count it as a verified result.

## Limits that remain

- On-device AI not verified on this PC. Edge, macOS, phones not tested.
- Offline in the tests above means: the test browser could reach no address. It was not the Wi-Fi switch.
- The free limits of the Gemini Developer API apply to the whole project. If many judges use cloud AI at once, a request can be refused; the app then says so and charting continues.
- An app installed from the preview is tied to the preview address.
