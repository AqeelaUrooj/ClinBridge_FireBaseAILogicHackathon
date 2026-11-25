# Install ClinBridge Practice on Android

A separate, Practice-only offline prototype with **fictional patients only**. Never type real patient details and never photograph a real form. Firebase AI features are in the web application, not in this app.

## What you need

- A phone with **Android 8.0 or newer** and an ARM processor (nearly all phones).
- About 200 MB of free space. No account, SIM card or internet is needed after the download.
- Tested on one phone: realme 5i, Android 10. Other phones and Android versions were not tested.

## Install

1. On the phone, open the release page linked from https://clinbridge-hackathon.web.app and download `clinbridge-android-practice.apk`.
2. Open the downloaded file. Android asks to allow installing apps from your browser or file app: allow it for this one installation.
3. Google Play Protect may say it does not know the app, because it does not come from a store. Compare the SHA-256 first (below), then choose to install.
4. Open **ClinBridge Practice** and switch the permission for your browser off again if you like.

With a cable and Android platform-tools: `adb install -r clinbridge-android-practice.apk`.

## Check the file (optional)

The release page lists the SHA-256 value.

```powershell
Get-FileHash clinbridge-android-practice.apk -Algorithm SHA256
```

Linux or macOS: `sha256sum` or `shasum -a 256`. If the value differs, delete the file.

## First start

1. **Get started** → **Create encrypted Practice store**. This works in airplane mode.
2. Choose a fictional person: **Daniel Okafor** is a nurse, **Kim Ellis** is the admin.
3. PIN **2468** for everybody.
4. After a restart the records are locked: **Use practice passphrase** (`practice only fake patients`).

The passphrase and the PIN are public on purpose. They protect fictional data only.

The camera is asked for only when you open paper capture; "Deny" leaves manual entry. The app has no internet permission.

## Update and remove

- **Update:** install the newer APK over the old one. Records are kept, as long as both have the same signature.
- **From a test build** (signed with a debug key): Android refuses the update. Uninstall the test build first; its fictional records are deleted.
- **Remove:** uninstall the app. All its records are deleted from the phone. Files you saved yourself (FHIR export) stay where you put them.

## Trouble

| What you see | What to do |
|---|---|
| "App not installed" | An installation with another signature is on the phone (uninstall it), the Android version is older than 8.0, or the download is not complete |
| "There was a problem parsing the package" | Download it again and compare the SHA-256 |
| A black picture in a screenshot | Screenshots are blocked on purpose |
| The passphrase page after a restart | Normal. **Use practice passphrase** |

Results on the test phone: [PHYSICAL_ANDROID_RESULTS_2026-11-25.md](PHYSICAL_ANDROID_RESULTS_2026-11-25.md).
