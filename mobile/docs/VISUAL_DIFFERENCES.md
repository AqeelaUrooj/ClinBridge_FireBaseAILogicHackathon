# Visual and wording differences

Reference left, app right: `evidence/index.html`. Rules used everywhere:

- Placement, spacing, colours, radii, type sizes and icons follow the PNG and its HTML; behaviour follows the ClinBridge rules.
- Six exports (MAR, history, summary, vitals editor, review, body map) were captured with a serif fallback font because Inter had not loaded. The app uses Inter, so their pixel difference stays high although the layout lines up.
- Wrong headers of the exports ("Miller, Arthur", "Bed 402-B", "Vitals Editor", "Save Confirmation", "Eleanor Vance", NKA/NKDA for an allergic patient) are replaced by the real page title and patient.
- Drill panels ("Simulation triggers", "Variant switcher", "QA sandbox", "Edge-cases") are not in the app. Their states are made in tests.
- Claims the app can not support (sync, mesh, EHR, certification, latency, signatures, MPI, US Core, OCR confidence, barcode or wristband scans, zero data loss) are replaced by facts about this phone.
- Inter’s tabular figures are used for values and units only: in running text they also widen the hyphen.
- Touch areas are at least 48 dp, so some rows are taller than in the PNG.

| Source folder | Mean pixel difference (0–255) | App height dp |
|---|---|---|
| `clinbridge_opening_screen` | 4.20 | 884 |
| `clinbridge_select_staff` | 11.24 | 819 |
| `clinbridge_staff_pin_sign_in` | 10.44 | 884 |
| `clinbridge_my_patients_ward_4b` | 28.57 | 1194 |
| `clinbridge_verify_patient` | 11.52 | 947 |
| `clinbridge_patient_summary_arthur_pendelton` | 32.95 | 1753 |
| `clinbridge_add_bedside_action_sheet` | 12.62 | 884 |
| `clinbridge_record_vitals_editor` | 20.00 | 1190 |
| `clinbridge_review_vitals_entry` | 43.97 | 1160 |
| `clinbridge_medication_schedule_offline_mar` | 36.45 | 1897 |
| `clinbridge_record_medication_event` | 17.55 | 1387 |
| `clinbridge_second_nurse_pin_co_sign` | 10.05 | 1171 |
| `clinbridge_critical_medication_conflict_dose_lock_alert` | 34.35 | 1981 |
| `clinbridge_anatomical_body_map_assessment` | 30.03 | 2102 |
| `clinbridge_patient_history_timeline` | 27.17 | 2500 |
| `clinbridge_paper_capture_camera_viewfinder` | 32.36 | 890 |
| `clinbridge_paper_photo_preview_quality_check` | 38.06 | 1194 |
| `clinbridge_optical_paper_capture_glare_occlusion_error` | 32.24 | 1981 |
| `clinbridge_paper_draft_review_value_verification` | 34.59 | 1515 |
| `clinbridge_bedside_sbar_note_editor` | 21.85 | 1902 |
| `clinbridge_ward_handover_shift_transition` | 10.77 | 2108 |
| `clinbridge_admin_readiness_dashboard` | 26.26 | 1588 |
| `clinbridge_downtime_protocol_checklist` | 30.18 | 1852 |
| `clinbridge_recovery_reconciliation_worklist` | 30.14 | 1804 |
| `clinbridge_admin_fhir_export_bundle` | 34.64 | 1705 |
| `clinbridge_offline_print_clipboard_backup` | 40.89 | 1604 |
| `clinbridge_low_battery_air_gap_vault_emergency_freeze` | 37.37 | 1244 |

Mean difference compares whole pages pixel by pixel; changed wording and one moved card raise it a lot. Judge fidelity with the pictures.

## Entry and ward

**Opening** (mean difference 4.17)
- Real: vault state, Get started routing (disabled while checking), checklist preview link, footer vault state.
- Copy changed:
  - Certified → "Practice · fictional data"
  - Zero Latency / Fail-Safe Sync → "Instant save / On this phone", "Local review / Before any export"
  - Autonomous → "Works offline"; Cache → Store
  - Telemetry sentence → fictional-patient practice sentence
  - "Rapid Response Bedside" → "Bedside Downtime Drills" (a rapid response team is a clinical service)
  - Device id and version → "THIS PHONE • Practice"
- Remaining difference: text only.

**Vault** (no reference; PIN screen styling)
- Real: checking, setup, locked (passphrase or recovery code, show/hide, fill-in of the public secrets), unlocked and problem states, busy state, real error text. No reset.

**Select staff** (11.50)
- Real: active roster including admin, search by name or role, empty state, selection, shift chip, elapsed time, last sign-in from the audit log.
- Unavailable: hardware key (not supported; use the PIN). The NFC modal is left out.
- Copy changed:
  - Roles → "Nurse" / "Admin"; "Active 12m ago" → "Signed in 16:30" / "Not signed in on this phone"
  - "Stationed Unit Roster / 4 Available" → "Practice Unit Roster / 5 Active"
  - Header line → "Vault: Unlocked (Local Encrypted)", shortened to fit 390 dp; Back online phase shows "Since down 09h 40m"
  - Intro and assignment text
- Remaining differences:
  - A fifth person (admin) pushes the info card down.
  - The shift chip uses a clock icon; the export showed search_off.
  - `full` is captured at 818 dp, where the export pins its bar.

**PIN** (10.58)
- Real: signIn, persistent tries and lockout with a one-second countdown, switched-off account, lock reason, Clear and backspace. Nothing is pre-entered.
- Copy changed:
  - DRILL ACTIVE → PRACTICE DRILL; Zero-Loss Mode → "On this phone"; Station/Terminal → "Practice phone • Works offline"
  - BSN → role; subtitle → "Ward 4B Registered nurse"; FHIR reconciliation note → local truth
- The simulation panel is gone. Its place shows "Practice PIN for every person: 2468", as the web sign-in page does (SignIn.tsx line 223).
- Remaining difference: the Sign in button is dimmed at 3 digits, because it is really disabled.

**Ward** (28.67)
- Real: census numbers, search, filters and counts, cards from loadWard, hint row and sheet, options sheet, Add picker, session sheet, bottom nav.
- Unavailable: Add and Handover for admin (nurses only); "Assign to me" for admin.
- Copy changed:
  - Eleanor Vance header → unit, signed-in person and initials button (Lock / Sign out / Admin readiness)
  - 8/12 OCCUPIED → "4 BEDS LISTED"; Offline Cache 100% → "On This Phone · 17 records"
  - Dx → "Att: doctor • code status"; Fall Risk, Post-Op and drip chips → stored facts; Overdue → "Saved locally (time)"
  - Scan wristband → "Check wristband to chart"; NC/RA → "2 L/min" when stored
  - Missing values are "Not assessed"
- The high mean is mostly vertical shift:
  - The export's header overlapped its census card. Mine does not (+6 dp).
  - The hint row has a 48 dp touch area (+10 dp).
- Nav labels are capped at 1.2 text scale. Tiles stack and a value never breaks over two lines at large text.

**Verify** (11.77)
- Real: both ticks needed and nothing pre-ticked, stored allergy, DOB, attending and admitted facts, audit write, real errors, `then` callback. The page pops itself before `then`, so Back never returns to an old check.
- Unavailable: barcode ("Barcode scanning is not available…").
- Copy changed:
  - VERIFIED PRE-DOWNTIME → "FROM SNAPSHOT 14:40, 14 NOV 2026"; Semi-private → stored code status or isolation
  - SECURE ENCLAVE → "ENCRYPTED RECORDS ON THIS PHONE"; MRN CACHED → "MRN ON RECORD"
  - Critical Safety Alert → "SEVERE ALLERGY ALERT" (or ALLERGY ALERT / ALLERGIES, from stored severity)
  - Barcode legible → "Read the number on the band"
- Remaining difference: text only.

Icons marked FILL 1 in the HTML are drawn unfilled, because the PNGs show them unfilled.

## Chart and vitals

### Summary
- **Real:**
  - Header and rails: phase and live elapsed time, allergy rail, identity sheet with "Leave this patient".
  - Vitals and fluids: latest vital record with its time and performer ("Check value" only from `isUnusual`); fluid totals of today with output as a share of intake.
  - Medications: from orders, holds, slots, last given and current rate.
  - Bedside: latest m_photo decrypted in memory, latest valid body-map site, diet, isolation, code status and attending.
  - Recent confirmed entries and the queue count.
- **Unavailable:** none.
- **Copy changed:**
  - "EHR Downtime Active" is now "Practice downtime active".
  - "Local Encrypted" is now "Encrypted here".
  - "CRITICAL" is now the stored severity.
  - Targets, sinus and unlabored are now "Recorded hh:mm", pain and AVPU.
  - The shift range is now today 00:00 to now.
  - "Output % of Target" is now "of intake".
  - "AVAILABLE" is now "AS NEEDED".
  - "MAR Offline V3" is now the "Open MAR" link.
  - The Fall Risk tile is now Isolation, plus Code status and Attending.
  - "Offline commits" is now "n saved here".
- **Remaining differences:** drill toggle left out; initials instead of the stock avatar; up to 4 medication rows plus "n more in the MAR"; "Record Bedside Care" is pinned instead of in-flow sticky.

### Add sheet
- **Real:** 8 entries (Body map added) with real badges ("LAST 14:15", "1 due so far"). The sheet closes before the form opens, so leaving a form returns to the same chart. Cancel, X, touching outside, the back arrow and Android back all return to the chart.
- **Unavailable:** for admins, all entries ("Only nurses can record care", also shown in the notice row).
- **Copy changed:** "Auto-stamped: Room 412 Gateway" and "OCR-Ready" replaced with truthful text; "Cache #3" is now "PRACTICE".
- **Remaining differences:** the sheet grows to its content (the export is cut at 426 dp; `cut_like_export` shows that cut); patient name is visible (white on white in the export); icons are outlined as in the PNG.

### History
- **Real:**
  - Entries, SBAR notes and grouped baseline results in one ordered list, with the outage line at `declaredAt` and computed counts.
  - 7 filters plus a performer filter.
  - Expandable payload: stored values, id, device and counter, both times, confirmer, correction chain with struck-through old values and reason. The photo reference and SHA-256 appear only when a photo exists, and the hash is checked against the picture.
  - Corrected versions are folded into the current record; entered-in-error records are crossed out.
- **Unavailable:** "Ledger" for nurses; admins get Go.audit.
- **Copy changed:** "Downtime Bedside" is now "Bedside Records", because some local entries are from before the outage (those carry a "BEFORE OUTAGE" chip). "Pre-Outage EHR" is now "Pre-Outage List". The invented hashes, INC number, telemetry and barcode text are gone.
- **Remaining differences:** the filter area is about 19 dp taller (48 dp touch targets); the tall export header title is shortened to "Patient History".

### Vitals editor
- **Real:**
  - All fields, time sheet (not future, not before admission) and oxygen sheet.
  - Validation, next-focus order, numeric and decimal keyboards; a typed comma is accepted.
  - Encrypted draft: autosaved 0.7 s after a change and on leaving, offered again on reopening. Discarding asks first.
  - Corrections: reason required.
- **Unavailable:** none.
- **Copy changed:** Normal, Target, MAP, sinus, eupneic and afebrile are now Entered, Check, Not assessed, or "Last 76 at 14:15". "Wristband Scanned" is now "Identity checked".
- **Remaining differences:** no toggle in the amber strip; an extra "More: Blood sugar" card; the BP boxes are narrower.

### Review
- **Real:** separate review, busy, saved and failed states. A re-check tick for each warning. Save and draft removal happen in one transaction. Retry uses the same key. Corrections are supported.
- **Unavailable:** none.
- **Copy changed:** signing, queueing and storage-reallocation claims replaced; "Controlled" and similar are now Entered, Left blank or Check value.
- **Remaining differences:** the second duplicated amber strip and the variant switcher are left out; an extra row (consciousness, blood sugar); pinned footer.

### All screens
- "PRACTICE" is visible on each screen.
- The bundled fonts have no "₂" or "→". My screens draw the ₂ as a small 2.
- Most reference PNGs use the serif fallback font, so the mean pixel difference stays high (13 to 44) although the layout aligns.
- Header and bottom-nav text scaling is limited to 1.25 and 1.15; page content scales fully.

## Medicines and body map

**MAR**
- Real: filters with counts, slot/hold/draft/lock states, confirmation drawer with latest recorded heart rate, slot choice when several times are open, order details with history, order picker, drip shortcut, patient sheet, bottom nav, downtime clock.
- Unavailable: Physician Override (no approved workflow); drip Pause (the app does not control pumps).
- Copy changed:
  - "AVAILABLE NOW" → "AS NEEDED" / "LOCKED • INTERVAL"
  - "Target aPTT" → "Rate On Order"
  - cross-reactivity text → the stored hold reason
  - safe heart-rate limit → "Recorded hh:mm, for reference only"
  - "Secure Enclave" → "Encrypted on this phone"
  - drill toggle → a static PRACTICE badge
- Visual differences: Inter instead of the serif fallback; kit "+" button is 48 dp (reference 56); one or two extra lines where stored order text is longer.

**Record Med Event**
- Real: titration, ordinary dose, held, refused. Typed or stepped rate, unit/route/site from config, time sheet (not in the future, not before admission), warning tick, 3-item checklist, review sheet, lock re-check.
- No mL/h value is shown. "Band Verified" → "2 IDs Verified". No badge number. Concentration/Indication/Access Site → Order / Prescribed by / Last site. "REALTIME" → "NOW" / "EDITED".
- Visual difference: a 48 dp "+ Add note (optional)" row on titration, which the reference does not have. Non-severe allergies show the name only, as in the reference.

**Co-sign**
- Real: eligible RN selector with nobody preselected, masked keypad, tries left, lockout countdown, decline with reason, retry after a storage failure with the same check, warning when leaving an unused check.
- Copy: pump mL/h tile → Current Rate; "FALL & BLEED RISK" → recorded allergy; barcode claim removed.
- Visual differences: drill rail removed; Decline 2 dp lower.

**Conflict**
- Real: hold/slot/interval reason cards, recorded allergies, "Hold & mark not given" (reason required), "Return to MAR" when the slot already has a record, dose_locked audit row each time the page opens.
- With one lock, the second card shows stored facts only and says no interaction check is made.
- Unavailable: substitute, physician override (row and footer), pharmacy call (no number stored).
- The page is shorter than the reference because the clinical prose is not produced.

**Body map**
- Real: front/back, region tap or list, markers that open their card, all/tagged filter, pending findings with encrypted draft, all-or-nothing save, reassess, history, read-only medicine sites, decrypted photo thumbnails.
- Unavailable: Care Plan (not stored).
- Not invented: gauge, flush, Braden, repositioning timer.
- Copy: "NO ACUTE LESIONS" → "NOTHING RECORDED".
- Visual differences:
  - our artwork replaces the stick figure; patient's right/left labels added
  - the back-view wound is not drawn on the front ("1 on back" instead)
  - view switch and filter rows are 48 dp touch height; Device card also has Reassess/History
  - Save is dimmed when nothing is new

Mean difference against the reference: MAR 36.7, med event 17.5, co-sign 10.3, conflict 34.3, body 30.1. The high values come from the serif export font, the missing clinical prose and the removed drill panels.

## Paper and companions

**Capture**
- Real:
  - type selector with 5 types; no type chosen blocks capture, upload and manual entry
  - permission states: not asked, denied, blocked (opens app settings), camera error, paused
  - camera start/stop on lifecycle and dispose, torch result, capture, picker (cancel, wrong file, error), Manual Entry
- Unavailable: auto-detect edge (nothing detects edges); torch when the phone has none or the camera is off.
- Copy: the HUD says "LIGHT: UNCHECKED", "ANGLE: UNCHECKED" and "MAR CHOSEN BY YOU". "Cache #3" became "On phone", and the profile photo became initials that open More. "LOCAL VAULT" became a green verified mark so the full name and MRN fit. "NKDA" became the real allergy. "Fictional practice documents only" added.
- Visual difference: dark placeholder instead of the fake paper. The type list opens in place, not as an overlay. No pulsing animations.

**Preview**
- Real: zoomable actual bytes, brightness/sharpness/size measured in an isolate, 2 staff ticks, an override tick when there is a problem, keep, retake, reject sheet. An undecodable picture goes to the error page.
- Copy: "Auto-Quality Assessment 3/3 Passed" became "Picture Checks n/3 Done". OCR, barcode and 99.4% text removed. Oversight text is now "No automatic reading on this phone…". The main button is "Keep Photo & Type Values".
- Visual difference: simulation row removed, "Reject photo" link added.

**Error**
- Real: rejection audited once when the page opens; measured versus staff reasons are labelled; retake, manual entry, flag as damaged (asks first).
- Copy: the OCR percent and legal floor became "Checks not passed n of m". Skew/luminance/occlusion became brightness/sharpness/size. The field list became "Reasons", and the protocol became "Camera Tips". "Requires dual-nurse sign-off" removed (untrue).
- Visual difference: short title instead of the overflowing 3-line one. The fake glare and thumb art became bubbles.

**Draft**
- Real:
  - editable fields for all 5 types
  - tick bound to the exact values and the photo; any edit clears it
  - hash check on opening and again before commit, exactly-once key, encrypted `paper` draft
  - dose lock goes to Go.conflict, high-alert goes to Go.cosign
  - step 4 outcome on the same page: saved, failed, held or waiting
- The Help drawer shows the real camera permission and an audited "Mark Unreadable".
- Removed: confidence, formulary, RxNorm, badge number, policy DT-409.
- Visual difference: cards 01 and 03 are taller (event, due time and day choices, hold box). No horizontal offset. The type is labelled "MAR" instead of "MED-DRAFT".
- Choice I made: a scheduled order requires an explicit due time or "Not a due time", so duplicate slots are caught.

**Companions** (implementation additions, no reference)
- Fluid, Lab and Note: review sheet, warnings ticked, saved once, half-typed form kept.
- EntryDetail: Correct works for vitals; for other types it is Unavailable ("Use Mark as a mistake and record again."). Confirm draft works for vital signs and medication only, and keeps raw_text and weight.
- Local Review, Alerts and More follow the brief. Local Review opens kinds paper, fluid, note, lab, sbar, vitals and body; these match what the other streams save.

Mean difference against the references: capture 32, preview 38, error 32, draft 35. Most of it is changed copy, real pictures and removed panels that shift the content below.

## Handover and admin

**SBAR editor**
- Real:
  - Fields start empty or with the encrypted draft `sbar/<user>/<patient>`. The draft autosaves 0.8 s after typing and when the app goes inactive. It is restored with a notice, and the app asks before discarding.
  - The once-only key is kept inside the draft.
  - Condition chips write or remove a sentence in the visible Situation text.
  - The link sheet offers confirmed records of this patient from the last 24 h.
  - Vitals tiles show stored values with times.
  - Open items can be added, edited and removed. A ticked item is saved as "Done by outgoing nurse: …".
  - "Copy from last note", shift text, required review tick, earlier notes list.
- Unavailable: none.
- Copy changed:
  - NKA → warning icon plus real allergy count. Dx and fall risk → stored facts (high-alert drug, infusion, vitals order).
  - "16:30 SYNC" → "VITALS 14:15". "1 DUE SOON" → "n OPEN". Receiving clinician → "Chosen at the shift sign-off".
  - "Background sync" → "Saved encrypted on this phone • Nothing is sent anywhere".
- Remaining difference: text areas grow instead of clipping the nurse's text (about 40 px lower after S and again after A). I added "Add open item", the shift field and the review tick.

**SBAR view** (no reference)
- Real: read-only, append-only notice, author, time, linked records → Go.entry via withPatient.

**Handover**
- Real: roster (assigned patients, or the whole ward and it says so), incoming RN picker, counts, progress bar, 3 filters, card facts, ward-level record of the sign-off.
- Unavailable: share icon; "Code / Resus" tab (no such data).
- Copy changed: badge IDs → "Signed in on this phone" / "Tap to change". Dx → attending and diet. "WNL", "stable" and plan text → last vitals and infusion rate. The bypass text was removed; sign-off is blocked and offers "Go to pending note".
- Remaining difference: wording only.

**Readiness**
- Real: incident card, draft card (hidden at 0), storage, vault, network, census, clock and ledger tiles, full integrity check, Start a Practice Outage (shown when the phase is not down).
- Unavailable: Dismiss Alert; "Copies on Other Phones" row (replaces mirroring).
- Copy changed: no 503, mesh, NTP or heartbeat; they become Practice phase, phone network, Practice clock and staff/record counts.
- Remaining difference: one extra checklist row ("All Drafts Handled"), so the controls box is about 80 px lower.

**Checklist**
- Real: preview without records, nurse read-only, admin ticks with name and time, computed facts, "Who Ticked and Who Cleared", Back online / End downtime / Start outage, CSV.
- The worklist step can be ticked only after Back online. Clearance ticks lock after clearing.
- Unavailable: headset; in preview also print and save.
- Copy changed: PDF/CSV → CSV; "dual clinician" → real actors; the ping box → phone network, drafts open, phase.
- Remaining difference:
  - 10 steps instead of 8.
  - Content starts 26 px lower, because the export hides the card's top under its header.
  - Local drawing instead of the remote photos.

## Recovery, export, print, battery

**Recovery**
- Real:
  - Closed unless Back online (link to the checklist). Build list / Add new records (`buildWorklist`). `WorkProgress` counts. Filters All, Needs Review, Waiting, Signed Off, Medications, Vitals.
  - Comparison rails show record vs second look (labelled simulated), related record, or pre-outage snapshot, with absolute differences. Reasons come from `flagEntry` plus the order/record dose fact.
  - Reason sheet stays open with its text when the store refuses. Held card, View JSON, CSV. The shield button runs `integrity`, `cipherIntegrity` and `verifyChain`.
- Unavailable: Merge Readings (readings are never merged); Inspect Waveform (no monitor).
- Copy:
  - "Vault armed" -> "PRACTICE: ENCRYPTED ON THIS PHONE"; session id -> real downtime id; "Sync Readiness" -> "Sign-off progress".
  - "Auto-Resolved" -> "Waiting"; "Clean mapped" -> "No flag, waiting"; "Keep Bedside (Recommended)" -> "Keep Record (Reason Needed)".
  - Cross-reaction text -> allergies on record plus the stored hold reason; `MedicationStatement` -> `MedicationAdministration.status = "not-done"`.
- Differences: an extra "Open Record" row, "Sign Off" on clean items, and one card per record (the reference merges vitals and I/O).

**Export**
- Real:
  - Three-step state, nine resource types with bundle counts, structure and reference check with an error list, drafts and open/flagged items.
  - The exact bytes are validated again before `saveFile`. A dialog names the number of open flagged items and says the file is not encrypted. `recordExport` runs only after a real save, then name, bytes and SHA-256 are shown. Blocked, failed and cancelled states work.
- Repository rule kept: saving with open items is allowed; structural errors block it.
- Unavailable: Direct Re-Ingest, Mesh share.
- Copy: removed US Core, MPI, ECDSA, HTTP 201, the 42 badge and the Media row (photos are not in the file). "Attestation" -> who signed off; the file has no digital signature.
- Difference: longer than the reference (9 types, 4 check rows).

**Audit (companion, no reference)**: computed chain result, newest first, group filter, row-hash prefix, CSV.

**Print**
- Real:
  - PDFs with embedded Inter and RobotoMono (Roboto as fallback), Letter or A4 ("Change"). Watermark, practice strip and footer on every page; identity and allergies on every patient page.
  - Sheets: census; DT-MAR-01, DT-VIT-02 and DT-SBAR-03 per patient; three blank forms. Page counts come from the built document.
  - The copies stepper really repeats pages inside the print job (Save PDF is always one copy). The preview is drawn from the same data (the order-text line of an infusion is only in the PDF). The QR became the record count.
- Unavailable: AirDrop/Mesh, Relay. "Save to USB" -> "Save PDF".
- The blank kit holds vitals/fluids, medication, and note/SBAR forms. Code-blue and narcotic-waste forms are left out because no approved form exists.
- Difference: the status card is shown in full (the export hid it under the header), so content sits lower.

**Battery**
- Real: battery, charging and storage, read on open, on resume and every 30 s. Confirmed records, high-alert events by drug, photos by `verifyPhoto`, drafts. "VAULT AUTO-FREEZE ENGAGED" appears only when `readOnlyReason` is set, else "NO FREEZE POLICY IS APPROVED". Print link.
- Unavailable: peer list, Beam, BLE handoff.
- Title shortened; "Zero data loss", "seal" and the minutes estimate are removed; a third runbook step covers restart.

## After the independent review (25 Nov 2026)

- Co-sign: date of the event, due time and all allergies are shown; the current rate keeps its own unit.
- New rate tile: "order: <prescriber>" instead of "by <prescriber>" (the app has no order for the new rate).
- Battery page: red only for Android’s own low-battery flag or a store that refuses writes; navy otherwise.
- Paper form: "Not a due time" is not offered for a given dose of a scheduled order.
