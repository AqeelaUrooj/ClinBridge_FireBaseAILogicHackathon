# Live test results: owner's PC, 22 Nov 2026

Real hardware, real Chrome, real Firebase project. Synthetic Practice data only. No credentials, keys or tokens are recorded here.

Run by Claude Code on the owner's PC (local terminal, plus the Claude in Chrome extension for the browser). The owner registered the App Check debug token in the Firebase Console; Claude only typed the token's name and showed the value in a copy box on the localhost page (never read, logged or screenshotted).

Three categories are kept apart below: **live-verified** (seen today on this PC), **automated-test only**, **hardware-blocked**.

## Machine and code

| Item | Value |
|---|---|
| PC | DESKTOP-6NQ637E (`hostname`), user `desktop-6nq637e\binary` |
| OS / browser | Windows 10 Pro 10.0.19045; Chrome 157 (AI check page) |
| Tools | Node v24.21.0, npm 11.19.0, git 2.56.1. No Java, no `gh` CLI |
| Project folder | `D:\ClinBridge_FireBaseAILogicHackathon` (copied from the old C: Documents checkout on 22 Nov 2026; the earlier "move" had not happened) |
| Commit | `main` = `6636639` (already up to date with GitHub; `git pull --ff-only` said "Already up to date") |
| Fix check | `src/lib/ai/firebase.ts` contains `clinbridge-cloud`; `src/lib/ai/service.ts` contains `VITALS_CLOUD_SCHEMA` |
| `.env.local` | Present, ignored by Git (`.gitignore:9`). All 8 variable names present; values not recorded |
| App | `npm run dev` → Vite 6.4.6 on http://localhost:5173 (HTTP 200) |

## Automated checks, run locally today

| Command | Result |
|---|---|
| `npm run typecheck` | Pass (exit 0) |
| `npm run lint` | Pass (exit 0) |
| `npx vitest run` | **199 passed, 1 skipped** (28 files + 1 skipped), exit 0 |
| `npm run build` | Pass (PWA, 26 precache entries; usual large-chunk warning) |
| `npx playwright test` | **31 / 31 passed** (bundled Playwright Chromium, 1.7 min) |
| FHIR R4 validator | **Not run locally** (no Java). GitHub CI `fhir-validate` on `6636639`: 0 errors |

## Firebase (read-only check, nothing changed)

| Item | State |
|---|---|
| App Check → APIs | Firebase AI Logic: **Basic - Enforced** (Replay off) |
| App Check → Apps | ClinBridge Web: **Registered**; provider shown as "Fraud Defense" (the console's current name for reCAPTCHA Enterprise) |
| AI check page | "Initialised for project clinbridge-hackathon (Firebase JS SDK 13.4.0)"; "App Check: reCAPTCHA Enterprise site key set; DEBUG token mode" |
| Debug token | Before: "No tokens registered". A first cloud call returned **401 "Firebase App Check token is invalid"** (enforcement proven). The owner then registered a fresh token named "DESKTOP-6NQ637E localhost dev (22 Nov)". **Revoke it after the demo.** |

## Genuine Firebase cloud inference: live-verified

Captured from the response only (status, `modelVersion`, `finishReason`, text, usage modalities). Request headers were never recorded.

| # | Input | Status / model | Card label | Values vs known |
|---|---|---|---|---|
| 1 | Text note, e-001 Sam Rivera (Kim Ellis) | **200**, `gemini-3.5-flash-lite`, STOP | Cloud · ONLY_IN_CLOUD · 11489 ms (first call, includes the App Check exchange) | **7/7** + Alert. Blood sugar and O2 flow `null` |
| 2 | Paper form image, e-003 Arjun Mehta | **200**, `gemini-3.5-flash-lite`, STOP; usage IMAGE 1080 + TEXT 185 | Cloud · ONLY_IN_CLOUD · 3577 ms | **7/7** + Alert. Blood sugar and O2 flow `null` |
| 3 | Harder text note, e-004 Tom Hale ("110 over 62 … sats 94% on Nasal tube … drowsy but wakes to voice") | **200**, `gemini-3.5-flash-lite`, STOP | Cloud · ONLY_IN_CLOUD · 1990 ms | **7/7** + "Responds to voice". O2 flow `null`: the note writes no number, so the record's hidden value (2) was correctly not invented |
| 4 | Text note, e-005 Peter Novak (Daniel Okafor) | **200**, `gemini-3.5-flash-lite`, STOP | Cloud · ONLY_IN_CLOUD · 2803 ms | **7/7** + Alert |
| 5 | Back-online second look, Mei Chen photo record (13:27) | **200**, `gemini-3.5-flash-lite`, STOP; usage IMAGE 1100 + TEXT 185 | Cloud · ONLY_IN_CLOUD · 4052 ms | All 6 typed values match; differences only Pain (— vs 1) and Consciousness (— vs Alert), the two fields left blank by hand. Record unchanged, "Nothing was changed automatically" |

- **Missing values stay empty:** in every answer `glucose_mgdl` and `o2_flow_lpm` were `null` when not written.
- **On-device button** (image, e-003): "The on-device model can't run with images on this laptop. Type the values instead." Network log during the attempt: **0 requests**. The same log captured the next cloud call, so it was recording.
- **Nurse review:** as Kim Ellis (Admin) there is no "Review this one as a draft" button. As Daniel Okafor (RN): Review this one as a draft → "Is this the right patient?" (Peter Novak, 9 Dec 1963, DK-004563) → Check and confirm shows "Made by the cloud model (Firebase AI Logic, ONLY_IN_CLOUD) at 13:23. It may be wrong: check every value against the paper." All fields editable and pre-filled; blood sugar and O2 flow empty. **Left as a draft, not confirmed.**

## Demo walkthrough rehearsal (`docs/DEMO_WALKTHROUGH.md`)

Wi-Fi stayed on (the Chrome extension needs it); every step's requests were read from the network log instead.

| Step | Result | What was on screen |
|---|---|---|
| 1. Practice sign-in, fictional patient | **Live pass** | Patient check Arjun Mehta, 21 Jan 1955, DK-004527 → chart |
| 2. System Down | **Live pass** | Banner "SYSTEM DOWN · since 13:26 · AI on this laptop only · Cloud blocked"; no browser dialog. Device vs Cloud: cloud button disabled, "Cloud blocked: System down: cloud is blocked until an admin clears the network." |
| 3. Offline documentation | **Live pass** (in-app; true Wi-Fi-off is automated only) | Vitals 142/88 · 64 · 36.8 · 96% saved ("Saved on this laptop", Confirmed); nursing note saved; medicines, handover list and body map (Front/Back/Both) render. 14 requests in this stretch, **all localhost**, 0 external |
| 4. Photo of paper → Vitals sheet | **Live pass** | Synthetic form photo saved (76 KB, "Photo looks clear"); Propose → "The on-device model can't run with images on this laptop. Type the values instead." (0 requests); typed → Review → "I re-checked these values" → Save → **Confirmed** with "Source photo" |
| 5. Encrypted persistence | **Live pass** | After reload + unlock both new records are listed. Raw IndexedDB `downtimekit-practice` / `entry` row: has `_enc`; only index fields in clear (id, patient_id, encounter_id, care_time, device_id, status, supersedes_id, counter); no plaintext 152 / 54 / 36.7 |
| 6. Back online | **Live pass** | 3 checks + PIN → "Now: Back online", banner "BACK ONLINE · Cloud allowed". See finding 1 about the time shown |
| 7. Cloud second look | **Live pass** | Row 5 above. Needed a second photo record (finding 2) |
| 8. Nurse-reviewed cloud proposal | **Live pass** | Nurse review above |
| 9. Recovery worklist + FHIR R4 export | **Live pass** for the screens; validator **CI only** | Filters: Possible duplicate 2, Missing field 1, Time conflict 2, Not signed off 37. Signed off one item (11 → 12 of 48). Prepare export file: 333 resources, "Structure check passed", 4 drafts not included, "Sensitive: this file is NOT encrypted". **Not downloaded** |
| 10. Gemini Nano | **Hardware-blocked** | AI check: Prompt API present; on-device text and image "Not ready" (Chrome says this laptop cannot run it) |

Cancelling a pending cloud request when System Down starts was not re-run live (needs a slow request); it stays covered by 7 unit tests + 1 browser test.

## Findings (no code changed)

1. **Practice clock restarts at 13:20 on every page load** (`practiceClock()` in `src/lib/time.ts`, by design). The walkthrough reloads in step 5, between System Down (step 2) and Back online (step 6), so the downtime history reads e.g. "down 13:26 · back online 13:20". Cosmetic, Practice only. Records typed in the first minutes after a reload also get a care time before the outage start.
2. **Only records whose care time is inside the current outage join the worklist** (`inDowntime`: care time ≥ declared). In the rehearsal the first photo record used the paper's time (08:05), earlier than the practice outage (13:26), so "Add new downtime records" correctly skipped it. Keep the default "When measured" time in step 4 (as the walkthrough does), or the photo record won't appear in step 7.

## Not verified today

- True Wi-Fi-off run and offline reload of the installed PWA: **automated only** (Playwright offline tests passed locally today).
- FHIR file validation: **CI only** (no Java on this PC).
- Gemini Nano / on-device proposals / both sides of Device vs Cloud real: **hardware-blocked** here; **mock-tested only**. See `docs/GEMINI_NANO_SECOND_LAPTOP.md`.

## Practice data left behind

- A cloud-made draft for Peter Novak (13:23) left unconfirmed on purpose.
- New confirmed Practice records: Arjun Mehta vitals 13:27 and 08:05 (photo), a rehearsal note 13:27 (signed off), Mei Chen vitals 13:27 (photo, second look run).
- System Down → Back online drill event. **More → Reset practice** puts the fake patients back to the start before the demo.
