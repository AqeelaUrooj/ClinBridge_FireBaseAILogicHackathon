# ClinBridge Practice for Android

Native (Flutter) offline app for fictional nursing downtime drills. **Prototype. Not approved for real patients. Practice data only.**

- **Install it on a phone:** [docs/INSTALL_ANDROID.md](docs/INSTALL_ANDROID.md)
- What it is and why it is built this way: [docs/ARCHITECTURE_AND_DECISIONS.md](docs/ARCHITECTURE_AND_DECISIONS.md)
- Screens, routes, controls: [docs/ROUTE_AND_CONTROL_MATRIX.md](docs/ROUTE_AND_CONTROL_MATRIX.md) · differences from the designs: [docs/VISUAL_DIFFERENCES.md](docs/VISUAL_DIFFERENCES.md)
- Tests and what is not verified: [docs/TEST_REPORT_2026-11-25.md](docs/TEST_REPORT_2026-11-25.md) · phone test: [results](docs/PHYSICAL_ANDROID_RESULTS_2026-11-25.md), [steps](docs/PHYSICAL_ANDROID_TESTS.md)
- Assets and licences: [NOTICE.md](NOTICE.md)

## Build

Flutter 3.29.0, JDK 17, Android SDK 35, NDK 27.0.12077973.

```
flutter pub get
flutter build apk --release --target-platform android-arm,android-arm64
```

A local build is signed with the PC's debug key: a **test APK**, never published. The published APK is signed afterwards with the owner's key, which is not in the repository: [docs/SIGNING_AND_RELEASE.md](docs/SIGNING_AND_RELEASE.md). There is no INTERNET permission in it.

## Tests

Host tests use a real SQLCipher DLL (not in the repository): set `SQLCIPHER_HOST` to a folder with `sqlcipher.dll` and `libcrypto-1_1-x64.dll` (pub.dev package `sqlcipher_library_windows` 1.0.2).

```
dart analyze lib test
flutter test
python -I tool/evidence.py <27 reference folders> <output folder>
```

## Practice sign-in

Public on purpose, fictional people only: passphrase `practice only fake patients`, PIN `2468` for every staff member (nurses, for example Daniel Okafor; admin: Kim Ellis).
