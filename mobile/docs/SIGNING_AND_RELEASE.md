# Signing and release

**State, 25 Nov 2026: 0.1.0 is signed with the owner's key and tested on the phone.**

| | |
|---|---|
| File | `clinbridge-android-practice.apk`, 48,822,784 bytes |
| SHA-256 | `b8a40f8021abb534c7d5be22a6bb7744a89bfdcbd1f9b4d4e50f839d499b073d` |
| Signature | APK Signature Scheme v2 and v3, RSA 4096, `CN=ClinBridge Practice, O=ClinBridge` |
| Certificate SHA-256 | `061f988b60f72e02f18d4199b1c65de4d37d02443d3e8632f13f4120c7fe8c83` |
| Content | 136 files, identical to the tested APK `361ee5e0…` |

## Why the test APK is not published

`clinbridge-practice-0.1.0-TEST.apk` (SHA-256 `361ee5e0…`) is a release build with a valid signature, but the key is the Android **debug** key of one PC. Its password is the same on every PC, it has no owner, and it is lost with the PC. Android accepts an update only with the same key.

## The release key

- The owner creates it once, types the password, and keeps the file and the password **outside the repository** with a backup. Nobody else gets it. If it is lost, later versions can not update installed ones.
- The certificate is readable in every APK, so it has no person's name in it.

```powershell
keytool -genkeypair -keystore <folder outside the repository>\clinbridge-release.p12 -storetype PKCS12 -alias clinbridge -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=ClinBridge Practice, O=ClinBridge"
```

## Sign the tested APK

[`tool/sign-release.ps1`](../tool/sign-release.ps1) takes the APK that was tested on the phone and replaces only the signature. It refuses the debug key, refuses a key inside the repository, and stops if any file in the APK is different. So the code is the tested code; the file's SHA-256 is new.

## Repeat after signing

| Check | Why |
|---|---|
| `apksigner verify --print-certs`, size, SHA-256 | new file |
| Package, version, permissions (`aapt2 dump badging`): CAMERA and ACCESS_NETWORK_STATE, no INTERNET, not debuggable | nothing changed on the way |
| Uninstall the test build, install this file on the phone, first start in airplane mode, sign-in, one record, force-stop, unlock, record is there | it works with this signature |
| Install the same file again over it (`adb install -r`): the record is still there | updates with the same key keep data |
| Screenshot blocked, process not in the network group | protection unchanged |

A change from the debug key to the release key **deletes** the fictional records on the test phone (uninstall). Key rotation could keep them, but would leave the debug key inside the release's signing history and valid on Android 8; it is not used.

## Publish (only with the owner's approval)

1. `mobile/` is on `main`.
2. GitHub Release with tag `android-v0.1.0` on that commit, asset `clinbridge-android-practice.apk`, text from [RELEASE_NOTES_0.1.0.md](RELEASE_NOTES_0.1.0.md). Mark it as a pre-release.
3. Download the asset again and compare the SHA-256.
4. Put version, tag, size and SHA-256 into `src/config/androidRelease.ts` of the website. Only then does the website show the download button.
