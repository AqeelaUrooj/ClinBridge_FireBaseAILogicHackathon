# Release report, 25 Nov 2026: Android app and product access section

Fictional Practice data only. No keys, tokens or configuration values are recorded here. Times are UTC.

| Item | Value |
|---|---|
| Live address | **https://clinbridge-hackathon.web.app** |
| Website released | 25 Nov 2026, 14:45, first attempt. Firebase Hosting only, Spark plan |
| Code | `main` = `b099015` (pull requests 59 and 60). Both GitHub checks green before the deployment |
| Build | Practice-only judge build, 49 files, 6.2 MB. Release check 21 of 21 |
| Same as tested | 49 of 49 live files identical to the local build |
| Android release | [android-v0.1.0](https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon/releases/tag/android-v0.1.0), pre-release, 25 Nov 2026, 14:18, tag on `7a3f5e0` |
| Before | website of 24 Nov 2026: [RELEASE_REPORT_2026-11-24.md](RELEASE_REPORT_2026-11-24.md) |

Not changed: Firebase security settings, App Check, API restrictions, quotas, billing, hosting settings, dependencies.

## What changed on the website

A section "Web, desktop and Android" on the landing page with Launch Practice Demo, Install Desktop App, Download Android APK, and links to source, installation, architecture and test reports. "Install Practice App" is now "Install Desktop App"; one new link in the hero and one in the footer.

Compared with the live site before: 44 of 49 files identical. Different: `index.html`, the service worker, the landing script and style, and the clinical application file, whose code is the same except the name of the file it loads. The other files with Firebase and AI code are among the 44.

## Android APK

| | |
|---|---|
| File | `clinbridge-android-practice.apk`, 48,822,784 bytes |
| SHA-256 | `b8a40f8021abb534c7d5be22a6bb7744a89bfdcbd1f9b4d4e50f839d499b073d` |
| Signature | owner's release key (v2 and v3), 136 files identical to the tested APK. See [SIGNING_AND_RELEASE.md](../mobile/docs/SIGNING_AND_RELEASE.md) |
| Phone | realme 5i, Android 10: [results](../mobile/docs/PHYSICAL_ANDROID_RESULTS_2026-11-25.md) |
| Downloaded again after publishing, without sign-in | same size and SHA-256 |

## Verified on the live address

| Check | Result |
|---|---|
| Landing page at 1440, 768, 390 and 360 px in a clean profile | fits, three options, hero picture, no request to another host, no error message |
| Security headers | present |
| Download Android APK, by a click on the page (desktop Chromium) | right name, size and SHA-256 |
| All GitHub links of the page | 200 (two answered 503 in the script and 200 when repeated) |
| Desktop install | manifest without errors, Chrome reports it installable, button and instructions work |
| Offline (browser set offline) | landing page, sign-in and ward board; only a Practice database |
| Update from the live version of 24 Nov to this one | a fictional record typed in the old version is there in the new one, which also opens offline. The new version starts after all ClinBridge windows are closed |
| System Down | cloud button off, no request to Google |
| Request to Firebase AI Logic without key and App Check token | refused, 403 |

## Genuine cloud AI on the live address

| Field | Value |
|---|---|
| Time | about 14:54 |
| Fictional patient, design | Sam Rivera, Shift report (set of 08:00) |
| Model asked | `gemini-3.5-flash-lite` (from the request address; the answer's `modelVersion` was not read this time) |
| Inference source shown | Cloud · ONLY_IN_CLOUD |
| Known values | 8 of 8 exact: blood pressure 134/80, pulse 74, breathing 16, temperature 36.8, oxygen 97 %, pain 0, Alert |
| Response time | 5.0 s |

The first try a minute earlier got no answer: Google returned 500, "This model is currently experiencing high demand". The page showed that message; nothing was filled in and no other model was used. The run was made in the owner's Chrome on the new files.

## Automatic tests of this code

Unit 381 passed, 1 skipped. Judge build in the browser 33 passed, 1 skipped. Normal build in the browser 390 passed before the last link labels and release values; landing, homepage and navigation (34) repeated on the final commit. On GitHub both checks passed for pull request 60 and for `b099015`. On the owner's PC three slow unit tests need a longer time limit.

## Not verified

- The click on **Install** in Chrome's own dialog.
- The APK download in the phone's own browser, and the signed APK in airplane mode or after a phone restart (the owner did both with the test-signed file).
- Other phones and Android versions, Edge, Firefox, macOS, iPhone, a screen-reader pass, many judges at the same time.
- On-device AI (Gemini Nano): not possible on this PC.
- App Check and API restrictions were not read again in the consoles; nothing was changed there. A 403 without a key does not by itself prove App Check.

## Way back

Firebase console → Hosting → release history → Rollback. The Android release can be edited or deleted on GitHub; the website's button then has to be switched off in `src/config/androidRelease.ts` and deployed again.
