# Physical Android test

On one Android phone (Android 8 or newer), fictional data only. **State: run on a realme 5i on 25 Nov 2026, results in [PHYSICAL_ANDROID_RESULTS_2026-11-25.md](PHYSICAL_ANDROID_RESULTS_2026-11-25.md).** The emulator was not used (build PC: 8 GB RAM, 2 cores).

Preparation on the phone: Settings → About phone → tap "Build number" 7 times → Developer options → **USB debugging** on. Connect the USB cable and accept "Allow USB debugging" for this PC. No Google account, SIM or real data is needed.

Install: `adb install -r clinbridge-practice-0.1.0-TEST.apk` (from `D:\ClinBridge_AndroidTools\sdk\platform-tools`). Or copy the APK to the phone and open it (Android asks to allow the installation from that app).

Evidence to record for each step: pass / fail, time, screenshot without other apps' content.

| # | Step | Expected |
|---|---|---|
| 0 | Record model, Android version, app version (More → About), SHA-256 of the APK | values written down |
| 1 | Airplane mode **on**. Start the app for the first time → Get started → create the encrypted Practice store | works offline; roster of 6 active people |
| 2 | Daniel Okafor, wrong PIN 5 times | tries left 4, 3, 2, 1, then "Wait 1 minute"; force-stop and reopen: still waiting |
| 3 | Daniel Okafor, 2468; then sign out; Kim Ellis | nurse: ward, no admin pages; Kim Ellis: Readiness |
| 4 | Daniel → Sam Rivera → verify | chart opens only after both ticks |
| 5 | Vitals with pulse **81** and pain **0**, rest blank → Review → Save | saved; blank = "Not assessed", pain 0 is shown |
| 6 | Double tap on Save | exactly one record |
| 7 | Grace Bell → acetaminophen PRN | blocked when the last dose is closer than 6 hours |
| 8 | Tom Hale → heparin rate change → second nurse: wrong PIN, then Maria Alvarez 2468 | nothing saved before; saved with both names; own name not offered |
| 9 | Paper capture: deny the camera, then allow, take a photo, retake, torch, then Manual entry | every state has a way on; nothing in the gallery |
| 10 | SBAR for Sam Rivera: draft, leave, come back, save | draft restored, saved once |
| 11 | Kim Ellis → Recovery / FHIR export → save to Downloads (phase Back online) | Android's save screen; file name contains PRACTICE |
| 12 | Force-stop, reopen (airplane mode on) | pulse 81, pain 0, SBAR are there |
| 13 | Restart the phone, reopen | same |
| 14 | Airplane mode **off**, Wi-Fi on; start a practice outage; wait 2 minutes | still SYSTEM DOWN; App info → Permissions shows no network permission; nothing is sent |
| 15 | Recent apps | no patient content visible |
| 16 | Back gesture on every main screen; font size largest; display size largest; narrow phone if possible | no cut-off controls, no exit in the middle of a form without a question |
| 17 | `adb shell run-as org.clinbridge.practice ls no_backup` | refused (release build is not debuggable) |

Not possible with this test: behaviour with a full disk, very low battery, many phone models.
