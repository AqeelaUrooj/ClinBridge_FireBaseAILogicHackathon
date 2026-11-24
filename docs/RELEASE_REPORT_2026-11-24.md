# Production release report: public judge website

Fictional Practice data only. No keys, tokens or configuration values are recorded here. Times are UTC (25 Nov, 02:00 in Pakistan).

| Item | Value |
|---|---|
| Live address | **https://clinbridge-hackathon.web.app** |
| Released | 24 Nov 2026, 21:00 |
| Code | `main` = `59dc187`. No application file changed since the tested preview (`b025eaa`); PR 56 changed documents only |
| Build | Practice-only judge build, 49 files, 6.2 MB. Release check 21 of 21 |
| Same as the preview | 49 of 49 files identical before the deployment; 49 of 49 identical on the live site after it |
| Plan | Spark, unchanged |

## Deployment

1. First attempt, 20:58: the files were uploaded, but Google answered **HTTP 500 "Internal error"** when the version was released. The live site stayed "Site Not Found"; this was checked before anything else was done.
2. Second attempt with the same command and the same files, 21:00: released.

## Verified on the live address

| Check | Result |
|---|---|
| Landing page, HTTPS, security headers, direct addresses, missing asset | OK. No request to another host, no error message, no Content-Security-Policy refusal |
| Launch Practice Demo | OK, in the owner's Chrome and in a clean profile |
| Install Practice App | Chrome offers it, no installability errors. Installed in a new Chrome profile: Start menu entry, own window, starts at `/sign-in`. **Started by a test command, not by a click in Chrome's dialog** |
| Nurse sign-in (Daniel Okafor), administrator sign-in (Kim Ellis) | OK: ward board with ten patients; admin pages |
| Offline: no address reachable for that Chrome | Starts from the Start menu; sign-in, vitals, note, medicines, body map, picture download |
| Chrome closed completely, still no network | Vitals and note still there |
| All four handwritten report designs | Drawn, also offline, with the synthetic label |
| System Down | Cloud button off, no request to Google (network on); also blocked without network |
| Network back | SYSTEM DOWN until the admin clears it, then Back online |
| FHIR export | 305 resources prepared in this scenario (structure check in the app; the official HL7 validator runs in CI) |
| Practice only | Old Real preference ignored, no Real choice, `/setup` goes to `/sign-in`, no Real database |
| App Check | Firebase AI Logic: Enforced. Requests without a token: 401 |
| API key | Other websites 403, other API 403 (two APIs, three websites, unchanged) |
| AI limit | 5 per minute per user in 43 regions, unchanged |

The test installation was removed afterwards.

## Genuine cloud AI on the live address

| Field | Value |
|---|---|
| Time | 21:03 |
| Fictional patient, design | Sam Rivera, Shift report (set of 08:00) |
| Actual model | gemini-3.5-flash-lite (the answer's `modelVersion`) |
| Inference source | Cloud · ONLY_IN_CLOUD |
| Known values in the picture | 8: blood pressure 134/80, pulse 74, breathing 16, temperature 36.8, oxygen 97 %, pain 0, awake: Alert |
| Correct | 8 |
| Wrong or missing | none (blood sugar and oxygen flow are not written there; the model answered "null") |
| Response time | 10.2 s in all |
| App Check | reCAPTCHA token exchange 200, token sent, answer 200 |

Together with the preview (docs/LIVE_TEST_RESULTS_2026-11-24.md): five genuine cloud runs, two fictional patients, all four designs, 43 of 43 known values. Drawn handwriting only; it says nothing about real paper.

## Not verified

- The click on **Install** in Chrome's own dialog (a "ClinBridge Practice" entry that was not made by these tests is in the owner's Start menu, but the owner has not reported the steps).
- Wi-Fi really switched off, and a Windows restart while offline, on the live address.
- On-device AI (Gemini Nano): not possible on this PC.
- Edge, Firefox, macOS, phones; a screen-reader pass; many judges at the same time.
- A cloud run on localhost with a debug token after the key limits.
- An update of an installed app from one live version to the next (tested with the same code on a local website only).

## Still to do by the owner

- Revoke the App Check debug token "DESKTOP-6NQ637E localhost dev (22 Nov)" after the demo.
- When the preview ends (2 Dec 2026): remove its host from the reCAPTCHA key and from the API key.
- Remove a test app that was installed from the preview; install from the live address.

## Take it back

Firebase console → Hosting → release history. This is the first release, so there is no older one to go back to; `firebase hosting:disable --project PROJECT` takes the site offline.
