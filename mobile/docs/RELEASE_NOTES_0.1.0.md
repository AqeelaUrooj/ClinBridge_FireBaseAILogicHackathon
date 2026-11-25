# ClinBridge Practice for Android 0.1.0 (draft, not published)

Native Android application for offline bedside nursing documentation with encrypted local storage.

**Separate Practice-only offline prototype. Fictional patients only. Not approved for real patients.** Firebase AI features are available in the [web application](https://clinbridge-hackathon.web.app), not in the Android application.

| | |
|---|---|
| File | `clinbridge-android-practice.apk` |
| Version | 0.1.0 (1), package `org.clinbridge.practice` |
| Size | *after release signing* |
| SHA-256 | *after release signing* |
| Signing certificate SHA-256 | *after release signing* |
| Android | 8.0 (API 26) or newer, ARM phones (arm64-v8a, armeabi-v7a) |
| Tested on | realme 5i, Android 10 (one phone) |
| Permissions | camera (asked for when used), network state. **No internet permission** |

## Install

[Installation guide](https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon/blob/main/mobile/docs/INSTALL_ANDROID.md). In short: download the file on the phone, open it, allow this installation, start the app.

If you had a test build: uninstall it first.

## Practice sign-in (public on purpose)

Daniel Okafor (nurse) or Kim Ellis (admin), PIN `2468`, passphrase `practice only fake patients`.

## Tested

- 238 automated tests (219 core, screen and visual tests, 19 whole-app journeys) on the app's code.
- Phone test on 25 Nov 2026, first with the same code under a test signature: first start offline, PIN lockout, patient check, vitals, medicines with second nurse, camera, process death, update over an older build, FHIR file, integrity check, no network use. [Results](https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon/blob/main/mobile/docs/PHYSICAL_ANDROID_RESULTS_2026-11-25.md)
- This signed file on the phone: *after release signing*

## Known limitations

- Tested on one phone and one Android version. Not tested: TalkBack, tablets, landscape (portrait only), a real printer, a full disk, low battery, Android with 16 KB memory pages.
- No AI, no cloud, no synchronisation, no EHR connection. The FHIR R4 file is saved where you choose.
- The Practice passphrase and PIN are public and protect fictional data only.
- Some medication rules are stricter than in the web app and are not clinically approved.
- Uninstalling deletes all records. There is no automatic backup.
- Not from a store: Play Protect may show a warning, and updates are installed by hand.

Source: [`mobile/`](https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon/tree/main/mobile). Licence: Apache-2.0, libraries in [NOTICE](https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon/blob/main/mobile/NOTICE.md).
