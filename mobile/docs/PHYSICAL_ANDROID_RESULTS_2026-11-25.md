# Physical Android test, 25 Nov 2026

| | |
|---|---|
| Phone | realme 5i (RMX2030), Android 10 (API 29), security patch 2022-01-05, arm64-v8a, 720×1600 px at 320 dpi = **360 dp wide**, text size 1.0 |
| App | `org.clinbridge.practice` 0.1.0 (1), test APK, installed with adb |
| APKs | first run: SHA-256 `4d8b4650…`; final (with the fixes below): `361ee5e02d2e8f86702e536de51d30d3b253444ca7bedc540ece1b28820b7cd7`, 48,819,428 bytes, checked on the phone |
| How | real taps and text through adb, results read from Android's accessibility tree. Log with times: `phone/log.txt` (local). Fictional data only |

## Results

| Step | Result |
|---|---|
| First launch with Wi-Fi and mobile data off (network unreachable): encrypted store created with SQLCipher and Android Keystore, roster shown | pass |
| Wrong PIN 4, 3, 2, 1 tries left, then locked with a countdown; the lockout went on after force-stop | pass |
| Right PIN: nurse to the ward; admin to Readiness | pass (admin after fix 1) |
| Patient check: confirm off with no tick and with one tick, on with two; a second patient needs a new check | pass |
| Vitals: pulse 81, pain 0, rest blank; review shows "Not assessed"; two fast taps on Save = one record | pass |
| Keyboard: the field stays visible; Back closes only the keyboard | pass |
| PRN dose saved once (two fast taps); a second dose within 6 hours is blocked; Back leaves without a record | pass |
| Heparin rate change: own name, LPN, admin and switched-off account are not offered; wrong witness PIN refused; saved once after the right PIN, both names shown | pass |
| Camera: denied, asked again, allowed, torch on/off, picture, retake, reject (nothing stored, nothing in the gallery), manual entry | pass |
| Home and back; process killed while typing an SBAR note: the encrypted draft came back; saved once | pass |
| After force-stop: records locked, opened with the passphrase, vitals, dose, rate change and SBAR are there | pass |
| Update installed over the older version (three times): all records kept (52) | pass |
| Integrity on the phone: structure ok, encrypted pages no problems, change log 184 of 184 rows | pass |
| Recovery item signed off with a reason | pass |
| FHIR file saved to Downloads: 309 resources, pulse 81 inside, `HTEST` tag, the SHA-256 on the page equals the file's; cancelled save says so and leaves no export row; the save screen offers no cloud folder | pass |
| Android's print screen opens (no printer on the phone) | pass |
| Practice outage started; Wi-Fi back for two minutes: still System down | pass |
| Network: no INTERNET permission, the process is not in Android's network group, no traffic recorded for the app | pass |
| 5 minutes without use: PIN page | pass |
| Screenshots and recent-apps picture: refused by Android (FLAG_SECURE on Android 10) | pass |
| No patient text in the app's log | pass |
| Layout at 360 dp on 20 pages (pictures from a capture build that differs only in the screenshot block; never delivered) | pass after fix 3 |

## Found on the phone and fixed

1. **The admin Readiness page stayed empty.** SQLCipher on Android answers `PRAGMA page_size` with text, the PC's library with a number. Fixed in `store.dart`. A page that fails to draw now shows a message instead of nothing, and the log gets only the kind of error, never values.
2. **The medicine page showed the first allergy instead of the severe one** (codeine instead of shellfish). Allergies are now sorted by stored severity on every page.
3. White status-bar icons on light pages. The icons now follow the page.
4. "LIVE DRILL" is now "DRILL OPEN".

Two lines of the raw log say FAIL because the test script looked for the wrong words ("Wait", and text that was outside the visible part); both were repeated and passed.

## Done by the owner on the same phone, 25 Nov 2026

The owner reported "All five pass" for these steps. They were not watched or measured by the test script, and no details were given.

| Step | Owner's report |
|---|---|
| Phone restarted, app opened and unlocked, Sam Rivera's pulse still 81 | pass |
| Airplane mode on: the app opens and works | pass |
| Paper photo: the camera picture is upright | pass |
| Fictional form: photo taken or uploaded, kept, values typed, committed | pass |
| Largest text size in Settings: nothing cut off | pass |

## Release-signed APK on the same phone, 25 Nov 2026

`clinbridge-android-practice.apk`, SHA-256 `b8a40f8021abb534c7d5be22a6bb7744a89bfdcbd1f9b4d4e50f839d499b073d`, checked on the phone. The test app was no longer installed; its fictional records were deleted with it. Fictional data only.

| Step | Result |
|---|---|
| First start with Wi-Fi and mobile data off (network unreachable): encrypted store created, roster shown | pass |
| Wrong PIN refused (4 tries left), then nurse signed in | pass |
| Patient check; vitals with pulse 81, rest blank; review says "Not assessed"; two fast taps on Save = one record (49 to 50) | pass |
| Force-stop: records locked, opened with the passphrase, pulse 81 is there | pass |
| The old test APK (other signature) over it: refused by Android, the app stays | pass |
| The same file over it with `adb install -r`: 50 records, pulse 81 is there | pass |
| Screenshot refused; not debuggable; not in Android's network group; no INTERNET permission; no patient text in the log | pass |
| Wi-Fi on again: no traffic recorded for the app | pass |
| Camera: asked when used, allowed, live picture with torch switch (no picture taken) | pass |
| Admin: readiness page; integrity: structure ok, encrypted pages authentic, change log 168 of 168 rows | pass |

One line of the raw log says FAIL because the script looked for the passphrase one page too early; it was repeated and passed. Not repeated with this signature: airplane mode, phone restart, medicines, paper photo, FHIR file, printing (same files as above).

## Not done

A real printer · a full disk · low battery · other phones and Android versions (only Android 10 was tested) · TalkBack.
