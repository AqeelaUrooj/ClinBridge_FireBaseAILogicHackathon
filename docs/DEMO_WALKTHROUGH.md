# ClinBridge demo walkthrough (about 8 minutes)

Synthetic Practice data only (fake patients). Every step below names what is **live-verified**, **automated-test only**, or **hardware-blocked**. Evidence: `docs/LIVE_TEST_RESULTS_2026-11-20.md`.

## Status at a glance

| Feature | Status |
|---|---|
| Firebase cloud inference (gemini-3.5-flash-lite, text + image) with App Check | **Live-verified** (owner's PC, 20 Nov 2026) |
| Cloud blocked in System Down | **Live-verified** |
| On-device-unavailable fallback, manual photo capture | **Live-verified** |
| Encrypted storage, persistence after reload | **Live-verified** |
| Network clearance, cloud second look (record unchanged) | **Live-verified** |
| Nurse-reviewed AI draft | **Live-verified** |
| Recovery worklist, FHIR R4 export | **Automated tests** (Playwright + official HL7 validator in CI); worklist also used live |
| True Wi-Fi-off run, offline reload of the installed PWA | **Automated tests** (production build) |
| Cancelling a running cloud request when System Down starts | **Automated tests** (7 unit + 1 browser) |
| Gemini Nano on-device proposals, offline AI, Device-vs-Cloud with both sides real | **Mock-tested only**; **hardware-blocked** on DESKTOP-6NQ637E |

Never present the "Simulated proposal" seed records, or anything from the automated tests, as live AI.

## Before the demo (once, network on)

1. `git switch main; git pull --ff-only` in the project folder, then `npm run dev` (keep the window open). `.env.local` stays in place.
2. **New App Check debug token** (the old one was revoked): open the app, run one cloud action (More → Device vs Cloud → pick a record → Run cloud model). It fails once with 401. Press F12 → Console → filter `debug token` → copy the token after "Firebase App Check debug token:". Firebase → App Check → Apps → ClinBridge Web → ⋮ → Manage debug tokens → Add debug token → paste → Save. Reload the page. **Revoke it after the demo.** Never show the console on screen.
3. Optional: More → Reset practice to start from clean fake data.
4. Close DevTools before sharing the screen.

## The walkthrough

1. **Practice sign-in, fictional patient** (*live*). Unlock → **Use practice passphrase** → sign in as **Daniel Okafor (RN)**, PIN 2468 → My patients → **Arjun Mehta** → "Is this the right patient?" (name, born, MRN) → **Yes, open**.
2. **System Down** (*live*). Switch user → **Kim Ellis (Admin)** → Downtime Management → **Start a practice outage**. Point at the banner: "SYSTEM DOWN · AI on this laptop only · Cloud blocked". Show More → Device vs Cloud: the cloud button is disabled with "Cloud blocked: System down".
3. **Offline nursing documentation** (*live in-app; true Wi-Fi-off is automated*). Switch back to Daniel → Arjun Mehta → Vitals → **Record vitals**, or a medicine / note / body map / handover. Explain everything saves on this laptop.
4. **Paper photo + unavailable-AI fallback** (*live*). Arjun Mehta → **Photo of paper** → **Vitals sheet** → choose a synthetic form photo (draw one in Device vs Cloud → "Synthetic paper form (image)" and screenshot it beforehand). Press **Propose values from the photo** → "The on-device model can't run with images on this laptop. Type the values instead." Type the values → **Review** → tick "I re-checked these values" → **Save**. It shows **Confirmed** with the source photo. Keep the default "When measured" time: a time before the practice outage started keeps the record out of the worklist in step 7.
5. **Encrypted storage + persistence** (*live*). Reload the page → unlock → the record is still there. Optional for a technical audience: DevTools → Application → IndexedDB shows the row as `_enc` ciphertext (keep the console closed).
6. **Back Online clearance** (*live*). Kim Ellis → Downtime Management → tick the three checks → PIN → **Clear network — Back online**. Banner: "BACK ONLINE · Cloud allowed".
7. **Firebase cloud second look** (*live*). **Recovery Gate & Worklist** → **Add new downtime records** → open the new photo record → **Run cloud second look**. Label "Cloud · ONLY_IN_CLOUD · N ms"; the table lists where the cloud reading differs (e.g. fields left blank by hand). Point out "Nothing was changed automatically"; fixes go through **Fix** (a new version with a reason).
8. **Nurse-reviewed AI proposal** (*live*). As Daniel: More → **Device vs Cloud** → pick a record → **Synthetic note (text)** → **Run cloud model** → **Review this one as a draft** → patient check → **Check and confirm** shows "Made by the cloud model (Firebase AI Logic, ONLY_IN_CLOUD)… It may be wrong". Nothing is confirmed until the nurse does it. (Admins don't get this button.)
9. **Recovery worklist + FHIR R4 export** (*automated + worklist live*). **Recovery Gate & Worklist** → filters (Possible duplicate, Missing field, Time conflict) → **Checked — sign off** on an item → **Export** → **Export (FHIR R4)** → **Prepare export file**. Show the warning "Sensitive: this file is NOT encrypted". Download only if needed (fake data). CI validates this export with the official HL7 validator (0 errors).
10. **Gemini Nano (separate, only on compatible hardware)**. Follow `docs/GEMINI_NANO_SECOND_LAPTOP.md`. Show it only after it has actually run there; until then say "on-device inference is implemented and mock-tested; this laptop's hardware can't run Gemini Nano".

## One-line pitch for the AI part

"During an outage nothing leaves the laptop. AI runs on-device only where the hardware supports it, and the app works fully without it. Back online, after an admin clears the network, Firebase AI Logic gives a cloud second look that flags differences but never edits the record."
