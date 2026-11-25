# Test report, 25 Nov 2026

Windows 10 Pro 10.0.19045, 8 GB RAM, 2 cores. Flutter 3.29.0 / Dart 3.7.0. The tests below ran on the PC, on the app's own Dart code, with a real SQLCipher library (Windows DLL) and a test double for the Android side. **Phone test: [PHYSICAL_ANDROID_RESULTS_2026-11-25.md](PHYSICAL_ANDROID_RESULTS_2026-11-25.md).** No emulator was used.

## Commands and results (final code)

| Command | Result |
|---|---|
| `dart analyze lib test` | exit 0, no issues |
| `flutter test test/core_test.dart test/fhir_parity_test.dart test/screens test/visual` | exit 0, 219 passed |
| `flutter test test/integration` | exit 0, 19 passed |
| `flutter build apk --release --target-platform android-arm,android-arm64` | exit 0 |
| Fault injection on a copy of the core (`mutate.py`) | see below |

| Test group | Tests | What it covers |
|---|---|---|
| `test/core_test.dart` | 48 | encrypted files, wrong/missing keys, changed page, newer schema, failed migration, interrupted set-up, two set-ups at once, PIN limits and restart, roles, lock, stale contexts, wrong patient, blank vs 0, exactly once, every point of failure in a save, process death, corrections, high-alert rules, dose locks, downtime, recovery, handover, export, reset |
| `test/fhir_parity_test.dart` | 1 | all 301 resources equal the website's export of the same dataset, except the added `HTEST` tag and the word "Device" for "Laptop". Skipped unless `WEB_FHIR` is set |
| `test/screens/*` | 127 | each screen group through its UI on the real core |
| `test/visual/*` | 43 | 293 captures: 27 reference screens at first viewport, full page, 360 and 430 dp, text scale 1.5, and the states that exist only in the HTML. Overflow is an error |
| `test/integration/journey_test.dart` | 19 | first launch to export through the whole app, Android back, lock, account switch, layout 360×640 at 1.5 and 430×932, 48 dp targets |

Cases asked for: auth and roles, offline workflow, wrong patient and stale context, blank vs zero, unsafe medication blocks, missing or invalid witness, review and edits, unreadable photos, cancelled and denied permissions, interrupted saves, exactly-once commits, admin routes, no external sync, reload of saved data, FHIR output and failures: all have tests. **"Blocked cloud use" has no test because there is no cloud code**: the release manifest has no INTERNET permission, and the compiled app contains no Firebase or Google API address.

## Fault injection

`D:\ClinBridge_AndroidTools\mutate.py` puts one fault at a time into a copy of the core (45 faults: removed patient check, removed attestation hash, no rollback, no lockout, blank as 0, no encryption key, …) and runs the core tests. Result on the final core: 44 caught, 1 not (drafts are left out of the export in two places; removing one changes nothing). Earlier rounds missed four faults; tests were added for them.

## Independent review

A reviewer who had not written the code read all of it. Findings fixed the same day, each with a test where the PC can test it:

| Severity | Finding | Now |
|---|---|---|
| Critical | SQLCipher was never selected on Android; the app could not have opened its records on a phone (host tests hid this) | `lib/data/cipher.dart`, called first in `main()`. The compiled app names `libsqlcipher.so`. Proven on a phone the same day |
| High | a paper draft changed after a declined co-sign could be reported as saved | the draft itself is confirmed; a key never returns a draft as a record |
| High | going back and creating the store twice could lock the records for good | one job at a time, checked again before the file is written |
| High | a scheduled dose without a due time escaped the slot lock | due time required, waiting drafts hold their slot |
| Medium | care date of drafts, decimal comma in a rate, incomplete co-sign view, rate unit, holds and rate changes, storage-full behaviour, picture memory limits, typing as activity, files saved across a lock, reset messages, Android result handling, partial files, clipboard | fixed |
| Low | 10 items (parallel PIN tries, roster, camera restart, print cancel, …) | fixed, except: "Output x % of intake" on the summary stays (a plain ratio from the design) |

The end-to-end tests found and fixed: blank pages on Back, a layout error for a patient whose output exceeds the intake, lost input without a question on two pages, a record missing from recovery when typed in the first minute of an outage, text boxes that reacted only in their thin middle line.

## APK

| | |
|---|---|
| File | `release/clinbridge-practice-0.1.0-TEST.apk` (local, not committed), 48,819,428 bytes |
| SHA-256 | `361ee5e02d2e8f86702e536de51d30d3b253444ca7bedc540ece1b28820b7cd7` |
| Package, version | `org.clinbridge.practice`, 0.1.0 (1), release build, minSdk 26, targetSdk 35, armeabi-v7a + arm64-v8a |
| Signing | **test build**: this PC's Android debug key (APK signature scheme v2). No production key exists; nothing secret is in the source |
| Permissions | CAMERA, ACCESS_NETWORK_STATE. No INTERNET |
| Backup | `allowBackup=false`, extraction rules exclude everything |
| Content | approved Practice seed; the design fixture is not inside |

## Not verified

- On the phone: what [PHYSICAL_ANDROID_RESULTS_2026-11-25.md](PHYSICAL_ANDROID_RESULTS_2026-11-25.md) lists as not done; one phone only.
- TalkBack. Landscape (the app is portrait only). Tablets.
- Android with 16 KB memory pages.
- The HL7 validator was not run on the mobile file; it equals the website's file, which passed it (0 errors, `docs/FHIR_VALIDATION.md`), except the added tag.
- Pictures are drawn by Flutter's test renderer with the app's fonts, not photographed from a phone.
- Printing sends the sheet to Android's print system, which may keep it unencrypted until it is printed.
