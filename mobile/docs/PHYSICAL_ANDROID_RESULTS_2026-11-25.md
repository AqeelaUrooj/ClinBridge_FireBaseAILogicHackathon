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

## Not done

A real printer · a full disk · low battery · other phones and Android versions (only Android 10 was tested) · TalkBack.
