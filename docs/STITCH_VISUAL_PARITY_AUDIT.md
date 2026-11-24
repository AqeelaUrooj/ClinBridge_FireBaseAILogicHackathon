# Stitch visual parity audit: all 33 screens

Date: 23 November 2026. Code looked at: `main` at `d08635dc`. All patients are fictional Practice records.

This audit compares what is on screen. A working route, a passing test or an earlier report does not count as a match.

## 1. How it was done

- Every reference `code.html` and `screen.png` in the owner's archive was read. Controls were listed from the HTML (916 without the repeated sidebar links, counted once per screen; the two landing folders and repeated table rows are included).
- The app at `d08635dc` was built and every screen captured in Chromium at 1440 px, signed in as a nurse or a system admin as needed. Each capture was placed next to its Stitch picture and compared by eye.
- The visible controls of each app screen were listed from the running page, not from the source code.
- Similarity words (high, medium, low) are judgements by eye. No percentage is given because none was measured.
- Not done: no pixel-difference tool, no designer or nurse review, and no comparison of every hidden state (for example the setup wizard on Real records was not opened).

### Classes

| Class | Meaning |
|---|---|
| A | Matches visually and works |
| B | Same structure; some sections or controls differ |
| C | Works, but looks significantly different from Stitch |
| D | No screen at all |

### Control classes

1 Implemented · 2 Equivalent (another control does the same job) · 3 Safe to implement (real data or a real action exists) · 4 Deferred (needs a clinical, hardware or owner decision) · 5 Not applicable (claims something ClinBridge does not do).

## 2. Which archive is the reference

The task text says v3; the attached archive is v4. v4 contains everything in v3 (54 files are identical byte for byte) and adds the 18 `screen.png` files v3 lacked. It also replaces the single landing folder with `…landing_page_1` and `…landing_page_2`, and changes the two-nurse HTML (menu labels and one banner text only). **v4 is used here.** Where v3 and v4 differ, nothing but the landing page is affected.

| Question | Finding |
|---|---|
| Landing page | `…landing_page_1` matches the composition already built (PR #20). `…landing_page_2` has an empty hero and no usable photos. **Owner to confirm `_1`.** |
| Body art | The Stitch body map uses a slate figure. The owner's chosen art is Theme 2 (warm ivory, slate blue) from the generated sheet, so the different figure is intended. |
| `whatsapp_image…` | A third-party product screenshot ("DocuVerse"). Inspiration only; not copied. |
| Sidebar width | `DESIGN.md` says 220 px, the screens use 256 px. The screens win from 1024 px up. |

## 3. Correction to earlier reports

`V3_ZIP_COMPLETION_REPORT.md` counted 17 screens as "UI complete". That counted working workflows, not visual match. **Measured by eye, no screen on `main` is class A.** Please read that report as a workflow report only.

## 4. Result

| | A | B | C | D |
|---|---|---|---|---|
| `main` at `d08635dc` (when the audit was made) | 0 | 7 | 26 | 0 |
| With batch 1 (#21, #22; merged 23 November) | 0 | 11 | 22 | 0 |
| With batch 1 and batch 2 (#24, #25, #26; merged 23 November) | 0 | 13 | 20 | 0 |
| With batch 3 as well (#29, #30, #32, #33; merged 23 November, `main` at `c4db9b5`) | 0 | 16 | 17 | 0 |
| With batch 4 as well (#35 to #39; merged 24 November, `main` at `8e14aff`) | 0 | 21 | 12 | 0 |
| With batch 5 as well (#41 to #49; merged 24 November, `main` at `3eb4757`) | 0 | 33 | 0 | 0 |

Batch 1 moves the ward board, patient summary, medication record and two-nurse page from C to B. They are not called A: section 7 lists what still differs. Batch 2 moves vitals and intake/output from C to B; the body map stays B and comes closer. Batch 3 moves paper capture, SBAR handover and the recovery worklist from C to B; the history stays B and comes closer. Batch 4 moves notes, orders, labs, entry detail and the change log from C to B. Batch 5 moves sign-in, lock, readiness, downtime, the network gate, patient list, staff, laptops, settings, setup, device and cloud compare, and export with backup from C to B; the paper pages stay B and come closer. The landing page was not changed: it waits for the owner's answer on the reference and the photo rights.

## 5. Problems found while comparing (not only looks)

| # | Problem | State |
|---|---|---|
| 1 | Sam Rivera's amLODIPine is recorded as 50 mg against a 5 mg order, and the kept paper line reads 5.0 mg. The app showed only "09:00 Given". The design shows a warning. | Shown on ward, summary and medication record in batch 1 |
| 2 | Vitals page: when the newest record holds only blood sugar, all the latest tiles show "—" (Lena Ortiz), although older values exist. | Fixed on the ward board and summary in batch 1, and on the vitals page in batch 2 (#24) |
| 3 | The wrong-PIN lockout of the second-nurse check was cleared by closing the dialog. | Survives closing and Go back in batch 1. Leaving the page still clears it; the same is true for sign-in. Owner decision in section 10 |
| 4 | The change log is a plain 5,430 px table and shows user ids, not names. | Fixed in #39 (merged) |
| 5 | The header prints `DT-4W-01` as fixed text. In Real records it would be wrong. | Fixed in #39 (merged): this laptop's own name, only while the records are open |
| 6 | The photos in `src/features/landing/assets` are not listed in `NOTICE`. | Owner to confirm the rights |
| 7 | Printed History has no MRN on any page and no patient name on page 2. Printed Handover has no name or MRN on page 2, because its fixed print header does not repeat. Checked with real PDFs on 23 November. | **Patient-identity risk on paper.** Root cause: the banner is hidden on paper on every patient screen. Fixed for all of them in #27 (merged, `main` is `bfea237`). The body map page in #26 now uses the shared header |
| 8 | "Record vitals" had no role check on its own page (the other record pages had one). | Fixed in batch 2 (#24) |
| 9 | **Numbers cut off in forms.** The − and + buttons added in #24 and #25 left too little room in a narrow form. On the check-and-confirm page a top blood pressure of 114 was shown as "1"; at 1280 px the box was 0 px wide. Stored values were right. | On `main` from batch 2 until #28 (merged) |
| 10 | **Blank sheet on paper.** In a narrow band of lengths (about 25 px) the first or last printed sheet of a patient page came out blank. No wrong patient. | On `main` from #27 until #31 (merged) |
| 11 | A proposal read from one photo could be saved with another photo after a retake. Confirming a draft dropped its weight and the words copied from the paper. | Fixed in #29 (merged) |
| 12 | A handover printed a linked record that was fixed or marked as a mistake later with its old value and no mark. | Fixed in #32 (merged) |
| 13 | Recovery worklist: the tenfold amLODIPine record said only "the rules no longer find a problem". A fixed record was called a possible duplicate of its own old version. On a phone the time and kind of record were hidden. | Fixed in #33 (merged). The rules themselves are unchanged |
| 14 | The oxygen table on the history page was cut off on paper. | Fixed in #30 (merged) |
| 15 | Long notes were cut with "…" in the notes list, also on paper. | Fixed in #35 (merged) |
| 16 | On a phone the ward lab list cut the patient name and the test; the change log scrolled sideways at 390 px. | Fixed in #36 and #39 (merged) |
| 17 | Admins saw New note and Record lab buttons that led to a refusal. | Fixed in #35 and #36 (merged) |
| 18 | Device and cloud compare: the page said every value of the fictional record is known, also blood sugar, which is not written in the note or on the drawn form. | Fixed in #47 (merged) |
| 19 | Loading a new patient list (Real records) adds and updates rows. A patient who is not in the new file stays on the laptop. | Not changed. Said on the page in #44 (merged); owner decision in section 10 |
| 20 | The PIN at the network gate has no limit on wrong tries (sign-in has 5). | Not changed. Owner decision in section 10 |
| 21 | When the screen locks, also by itself after 5 minutes, text that was typed and not saved is lost. | Not changed. Said on the lock screen in #41 (merged); owner decision in section 10 |

## 6. Screen by screen

Fields: **Ref** Stitch folder · **App** route and component · **Similarity** · **Missing** sections, art, controls, dialogs or interactions on `main` · **Mobile** · **Backend** that already exists · **Approval / hardware** · **Fix** · **Priority** (P1 first batch … P4).

### 1. Sign-in: C at `d08635dc`, B with batch 5 (#41)
- Ref `staff_sign_in_authentication_ward_4_west` · App `/sign-in`, `SignIn` · Similarity low
- Missing: node banner, unit, system-down and cache panels, staff strip with photos or initials above the keypad, keypad on the same page, "Authenticate Session", practice-PIN note, key-escrow help dialog.
- Mobile: single column, usable; the reference has no phone picture.
- Backend: staff list, PIN check, lockout, unlock, patient-list age, downtime state.
- Approval / hardware: badge numbers are not stored; escrow is not a ClinBridge feature.
- Fix: rebuild as status panels, staff strip and keypad on one page. Priority P3.

### 2. Lock screen: C at `d08635dc`, B with batch 5 (#41)
- Ref `terminal_auto_lock_secure_unlock_workstation_dt_4w_01` · App `/lock`, `LockScreen` · Similarity low
- Missing: navy header, locked-user card, auto-lock and stat panels, "Switch Caregiver" as a panel.
- Mobile: usable.
- Backend: lock reason, lock time, user switch.
- Approval / hardware: the design shows a critical lab on the locked screen, which shows patient facts to anyone passing (privacy). "Code Override" would bypass the PIN. Both blocked without a policy.
- Fix: rebuild header, card and keypad; no patient facts. Priority P3.

### 3. Ward board: C at `d08635dc`, B with batch 1
- Ref `ward_board_my_patients_minimal_with_expandable_cards` · App `/ward`, `WardBoard` · Similarity low on main, high in batch 1
- Missing on main: summary tiles, sort, expand and collapse, per-patient value tiles, due dose, expanded details, per-card actions, refresh, footer.
- Mobile: one long list on main; stacked cards in batch 1, checked at 390 and 360.
- Backend: all facts already saved.
- Approval / hardware: NEWS2, acuity, "bedside verified", pre-op checklist, turn log, printer status.
- Priority P1.

### 4. Patient summary: C at `d08635dc`, B with batch 1
- Ref `patient_summary_bedside_overview_peter_novak` · App `/patients/:id`, `PatientSummary` · Similarity low on main, high in batch 1
- Missing on main: filled action cards, today's regimen, recent-entry cards, body sites, paper sheet, handover card.
- Mobile: checked at 390 and 360 in batch 1.
- Approval / hardware: "Emergency Transfer Packet", custody transfer sign-off, NEWS2, OCR confidence.
- Priority P1.

### 5. Patient history: B (closer with batch 3, #30)
- Ref `patient_history_clinical_timeline_minimal_with_expandable_cards` · App `/patients/:id/timeline`, `Timeline` · Similarity medium to high
- Missing: entry-id chips, value tiles in an expanded vitals card, red critical card, paper slip inset, care-team strip, sign-off log link, patient-list baseline as a card.
- Mobile: repaired in PR #18.
- Backend: all except the telephony log.
- Approval / hardware: none for the visual parts.
- Priority P2.

### 6. Medication record: C at `d08635dc`, B with batch 1
- Ref `medication_administration_record_mar_sam_rivera` · App `/patients/:id/meds`, `MarPage` (was `MedsPage`) · Similarity low on main, high in batch 1
- Missing on main: patient tabs, order tabs, search, hour strip, grouped cards, order-detail panel, dose-difference warning, paper evidence, vital signs beside the order.
- Mobile: list and detail are separate pages in batch 1, checked at 390 and 360.
- Approval / hardware: hold limits, MAP, indications, daily maximum, pump status, "typical dose" AI text, time-conflict rule, recording without an order.
- Priority P1.

### 7. Two-nurse check: C at `d08635dc`, B with batch 1
- Ref `bedside_add_capture_two_nurse_verification_flow_daniel_okoye` · App `/patients/:id/meds/:order/record`, `MedEditor` · Similarity low on main, high in batch 1
- Missing on main: step bar, large drug card, tiles, reference facts, inline verification panel, preparation card, change-log footer.
- Mobile: checked at 390 and 360 in batch 1; keys are at least 44 px.
- Approval / hardware: RFID, dose arithmetic, "cleared" statements, witnessed waste, attestation ticks.
- Priority P1.

### 8. Vitals flowsheet: C
- Ref `vital_signs_flowsheet_charts_lena_ortiz` · App `/patients/:id/vitals`, `VitalsPage` · Similarity low
- Missing: seven latest tiles that keep their own times, two charts, flowsheet table with tabs, record dialog with steppers. See also problem 2.
- Mobile: list is usable; charts and table missing.
- Backend: all values, trends and record form exist.
- Approval / hardware: NEWS2, GCS scale, thresholds and colours by value, rhythm.
- Fix: tiles, charts from confirmed values, table in its own scroll box. Priority P2.

### 9. Intake and output: C
- Ref `fluid_intake_output_i_o_rosa_santos` · App `/patients/:id/io` · Similarity low
- Missing: four cards, hourly chart, separate intake and output ledgers, add dialog with presets.
- Backend: totals, categories, form.
- Approval / hardware: alert limit for "Flag Alert"; preset volumes need owner agreement.
- Priority P2.

### 10. Body map: B
- Ref `interactive_patient_body_map_lena_ortiz` · App `/patients/:id/body`, `BodyMapPage` · Similarity medium
- Missing: layer chips with counts, selected-area panel layout, line card, reset view, photo of a site.
- Kept: 24 areas, medicine-site highlighting, front, back and both.
- Approval / hardware: site logging and Braden (deferred P-03), flush log.
- Priority P2.

### 11. Paper capture: C at `d08635dc`, B with batch 3 (#29)
- Ref `bedside_paper_capture_ai_review_peter_novak` · App `/patients/:id/capture` then `/capture/:entry/confirm` · Similarity low
- In batch 3 all states were compared as pictures: start, photo taken, and confirm, with a drawn fictional form. Before that only the first step had been captured.
- Missing on main: photo and review panes together; zoom, rotate, per-field edit rows, the "matches the paper" tick, keep for later.
- Backend: photo store, proposal, field review, confirm.
- Approval / hardware: confidence figures; a real AI reading stays off during System Down.
- Priority P2.

### 12. Notes: C at `d08635dc`, B with batch 4 (#35)
- Ref `nursing_notes_clinical_communication_minimal_with_expandable_cards` · App `/patients/:id/notes` · Similarity low
- Missing: category tabs with counts, expandable cards, expand all, side composer, print.
- Approval / hardware: Morse and Braden scores, titration, verbal orders, templates (owner decision open), timers, second signature on a note.
- Priority P3.

### 13. Orders and allergies: C at `d08635dc`, B with batch 4 (#37)
- Ref `patient_orders_allergies_peter_novak` · App `/patients/:id/orders` · Similarity low
- Missing: allergy card, tabs with counts, search, order cards with actions, print.
- Approval / hardware: new allergy report (read-only patient list), pharmacy pager, allergy broadcast.
- Priority P3.

### 14. SBAR handover: C at `d08635dc`, B with batch 3 (#32)
- Ref `clinical_sbar_handover_peter_novak` · App `/patients/:id/handoff` · Similarity low
- Missing on main: patient tabs, four S/B/A/R cards, vitals table, trail and sign-off card beside the text.
- Approval / hardware: custody sign-off and counter-signature, badge tap.
- Priority P2.

### 15. Entry detail and correction: C at `d08635dc`, B with batch 4 (#38)
- Ref `entry_detail_versioned_correction_audit_mei_chen` · App `/entries/:id`, `/history`, `/correct` · Similarity low
- Missing: old, change and new in three columns, amendment chain card, print.
- Approval / hardware: "Approve Amendment" by a second person, clarification request.
- Priority P3.

### 16. Ward labs: C at `d08635dc`, B with batch 4 (#36)
- Ref `ward_laboratory_tracking_critical_results_4_west` · App `/labs` · Similarity low
- Missing: header actions, tabs with counts, critical banner with steps, search, table.
- Approval / hardware: protocol actions, ECG view, titration log.
- Priority P3.

### 17. Device and cloud compare: C at `d08635dc`, B with batch 5 (#47)
- Ref `device_vs_cloud_comparison` · App `/drill/compare` · Similarity low
- Missing: three sample cards, two result columns, benchmark table, export.
- Approval / hardware: Gemini Nano has not been run live; no result may be shown until it is. Simulated outages stay off.
- Priority P4.

### 18. Readiness: C at `d08635dc`, B with batch 5 (#42)
- Ref `readiness_storage_telemetry_workstation_node_dt_4w_01` · App `/admin` · Similarity low
- Missing: header actions, tile grid, storage bars, check list with states.
- Approval / hardware: battery, printer, network nodes.
- Priority P3.

### 19. Settings: C at `d08635dc`, B with batch 5 (#46)
- Ref `administration_settings_governance_minimal_with_tooltips` · App `/admin/settings` · Similarity low
- Missing: section tabs, cards with help text. Values are read-only on purpose.
- Approval / hardware: every editable policy, key ceremony, escrow.
- Priority P4.

### 20. Patient snapshot: C at `d08635dc`, B with batch 5 (#44)
- Ref `patient_snapshot_management` · App `/admin/snapshot` · Similarity low
- Missing: search, filter, table, checksum card, inspect panel.
- Approval / hardware: rollback, distribution to other carts, acuity.
- Priority P3.

### 21. Devices: C at `d08635dc`, B with batch 5 (#45)
- Ref `workstation_nodes_peer_cow_device_management_ward_4_west` · App `/admin/devices` · Similarity low
- Missing: node cards, health tiles.
- Approval / hardware: mesh, pairing, remote lock and PCAP need hardware ClinBridge does not have. Most of this screen is class 5.
- Priority P4.

### 22. Staff: C at `d08635dc`, B with batch 5 (#45)
- Ref `staff_roster_offline_credentials_ward_4_west` · App `/admin/staff` · Similarity low
- Missing: search, filter, staff cards with role and state, print, privileges view.
- Approval / hardware: temporary PIN, 2-hour recovery PIN, badge numbers, mesh broadcast.
- Priority P3.

### 23. Change log: C at `d08635dc`, B with batch 4 (#39)
- Ref `cryptographic_audit_log_merkle_chain_inspector_ward_4_west` · App `/admin/audit` · Similarity low
- Missing: stat tiles, search, tabs with counts, names instead of ids, row inspector, paging.
- Approval / hardware: signed certificate; "Merkle tree" is not what ClinBridge uses (it is a hash chain).
- Priority P2.

### 24. Downtime operations: C at `d08635dc`, B with batch 5 (#43)
- Ref `downtime_operations_incident_lifecycle_ward_4_west` · App `/admin/downtime`, `DowntimePage` · Similarity low
- Missing: lifecycle timeline, tiles, step cards, quick actions, history table.
- Approval / hardware: cart broadcast, mesh, simulated resumption.
- Priority P3.

### 25. First-time setup: C at `d08635dc`, B with batch 5 (#46)
- Ref `first_time_setup_wizard_workstation_dt_4w_01` · App `/setup` · Similarity not fully judged
- Practice shows only a message. The Real-records wizard exists and was **not** opened for this audit (no Real records work is allowed), so its look is unknown here.
- Approval / hardware: key slots, peripherals, escrow.
- Priority P4.

### 26. Network clearance gate: C at `d08635dc`, B with batch 5 (#43)
- Ref `network_clearance_gate` · App inside `/admin/downtime` · Similarity low
- Missing: own page layout, check cards, PIN keypad beside them, confirm dialog.
- Approval / hardware: automatic network probes.
- Priority P3.

### 27. Recovery worklist: C at `d08635dc`, B with batch 3 (#33)
- Ref `recovery_worklist_second_look_reconciliation_simulation` · App `/recovery` · Similarity low
- Missing on main: list, record and decision together; paper source, record and order in three columns; counts on the tabs.
- Backend: items, rules, open-to-fix and sign off exist.
- Priority P2.

### 28. FHIR, backup and recovery: C at `d08635dc`, B with batch 5 (#48)
- Ref `fhir_v4.0.1_data_sync_backup_recovery_operations` · App `/export`, `/admin/backup` · Similarity low
- Missing: dashboard tiles, export summary, backup card on one page.
- Approval / hardware: "Authoritative FHIR Sync to Hospital EHR" is a claim ClinBridge must not make; it downloads a file.
- Priority P3.

### 29. Spooler: B (closer with batch 5, #49)
- Ref `batch_census_downtime_documentation_spooler_ward_4_west` · App `/spooler` · Similarity medium to high
- Missing: preview drawer, sort by bed or form, blank packs, per-row remove.
- Approval / hardware: printer status, background queue, print logging (owner decision open).
- Priority P3.

### 30, 31, 32. Paper forms: B (closer with batch 5, #49)
- Ref `printable_bedside…`, `printable_vitals…`, `printable_verbal_orders…` · App `/print/mar|vit|sbar/:id` · Similarity high for the sheet, medium for the surrounding page
- Missing: form tabs at the top as tabs, batch and blank buttons on the page, printer card.
- Approval / hardware: barcodes and QR (owner decision open), verbal-order authority, encrypted PDF.
- Priority P3.

### 33. Landing: B
- Ref `…landing_page_1` · App `/landing` · Similarity high in composition
- Missing: some sections and the sample form interactions. Wording differs on purpose.
- Not used: "FDA 510(k)", "99.4 %", "0 discrepancy", "< 1.2 s", mesh, Epic and Cerner claims, pilot booking, e-mail form.
- Owner: confirm `_1` and the photo rights.
- Priority P3 (keep the photo layout).

## 7. Batches 1 and 2: what still differs from Stitch

| Page | Remaining differences and why |
|---|---|
| Ward board | No NEWS2, acuity or "verified" chips; the second button on each card is the same set for everyone (open, labs, vitals, medicine, draft, body map) instead of special ones such as "Pre-Op Checklist" or "Log Turn"; our top bar and patient check stay. |
| Patient summary | No custody sign-off, transfer packet or AI confidence; small body figure is the owner's Theme 2 art; patient tabs not added here yet. |
| Medication record | Order facts ClinBridge does not hold are left out (indication, daily maximum, bag volume, pump); no handwriting picture in the evidence card, only a link to the record; no AI tally; eMAR station box left out; hour strip follows the real clock. |
| Two-nurse | Step 1 is the patient check, not a wristband scan; PIN keypad instead of a masked box with "RFID Tap"; checks are plain text because ClinBridge stores the PIN check, not ticks; waste and volume tiles say "Not recorded here"; no block id or broadcast. |

| Vitals (batch 2) | No NEWS2, mean pressure, target bands, "normal" wording, next check time, cuff position, rhythm, GCS or per-row verified mark. The form is a page, not a pop-up. |
| Intake and output (batch 2) | No target, amount left of a limit, urine rate, preset amounts or pitcher picture. "Flag alert" is off with its reason. No weight box in the vitals form (the column exists; owner decision). Totals from 00:00, because there is no shift. |
| Body map (batch 2) | No next-site advice, rotation, line details, phlebitis or Braden calculation, skin and pain pins, or site photos (P-03). Theme 2 figure. |
| Paper capture (batch 3) | No confidence figures, "OCR verified", perspective correction, FEVER / CRITICAL labels, MAP or normal ranges. No invented handwriting picture. A retake deletes nothing. |
| History (batch 3) | No event names such as "Acute desaturation", NEWS2, "bedside verified", countersign status, badge or pager numbers, doctor in the care team, telephony log. "Unusual" is the draft mark of the vitals page. |
| SBAR handover (batch 3) | No transfer of care, counter-signature PIN, badge or attestation tick: the card says so and opens the paper sheet. Tick boxes for open items only on paper. No NEWS2, targets or monitor pictures. |
| Recovery worklist (batch 3) | No second reviewer PIN, recommended value, maximum dose, dispensing data, Code Blue text or automatic reason. No record opens by itself. |
| Notes (batch 4) | No risk words, score parts, templates, timers, second signature or verbal-order records. Scores as the nurse wrote them. |
| Orders (batch 4) | No allergy report or broadcast, pharmacy pager, lockout, maximum dose, indications or countdown. Read only. |
| Labs (batch 4) | No ranges on new results, escalation, ECG, tube colours, LOINC, courier or fridge tiles. The hospital list keeps its own printed range. |
| Entry detail (batch 4) | No countersignature, approval, root cause, FLAGGED / NORMAL labels or certificate. |
| Change log (batch 4) | A hash chain on one laptop, not a Merkle tree; no signed certificate, tamper simulation, TPM or other laptops. |
| Sign-in (batch 5) | No badge numbers, shift or bed assignment, MAC address, power, clock drift or AI tiles, key escrow or mesh. Signing in happens on the fourth digit, so there is no Authenticate button. |
| Lock (batch 5) | No badge reader, Code Override or critical lab on the locked screen (privacy). Counts only. |
| Readiness (batch 5) | No battery, temperature, clock-drift, printer or scanner status, mesh or key escrow. Checks run in the browser; "Force clock" is not possible. |
| Downtime and gate (batch 5) | No target time, root cause, sub-events, runbook, broadcast or battery. The gate has the three checklist items of the prototype policy and the admin's own 4-digit PIN, not a 6-digit code or a token. Nothing on the network is tested. |
| Patient list (batch 5) | No rollback, distribution, simulate buttons, acuity, diagnosis or FHIR inspector. |
| Staff (batch 5) | No badge numbers, duty list, bed assignment, last sign-in, temporary or recovery PIN. Sign-ins are not logged. |
| Laptops (batch 5) | No link, ping, pairing, battery or peripherals. The other laptop is shown from its stored row only. |
| Settings (batch 5) | Read only. No sliders, switches, signature, key rotation or telemetry. |
| Setup (batch 5) | Four real steps instead of five. The form, its checks and the recovery key are unchanged. The frame was looked at on an empty test browser only, never on this laptop's Real records. |
| Compare (batch 5) | No benchmark, percentage of confidence, grade, failure simulation or bounding boxes. Only answers that really ran are shown. |
| Export and backup (batch 5) | No sync, gateway, certificate, progress bar or second signature. Two pages (nurses may export, admins make backups). |
| Paper pages (batch 5) | No barcodes, QR, printer status, hold or blank packs. The sheets are unchanged. |

Phone layouts: the archive has no phone pictures, so these follow the desktop order in one column.

## 8. Control inventory

Repeated on most screens and judged once: sidebar links **1**; Quick Lock **1** (header Lock); "Ward Board / Add / Capture…" names **2** (ClinBridge names); Device & Mesh link **2** (Laptops); Settings, Snapshot, Compare, Gate, Recovery links **1** for the roles that may open them.

States marked † came with batch 1 and ‡ with batch 2 (both merged 23 November); § with batch 3 (merged 23 November); ¶ with batch 4 (merged 24 November); ◊ with batch 5 (merged 24 November).

| Screen | 1 Implemented | 2 Equivalent | 3 Safe to implement | 4 Deferred | 5 Not applicable |
|---|---|---|---|---|---|
| 1 Sign-in | staff buttons, digits, Clear, backspace, same-page keypad◊, practice-PIN note◊, forgotten-PIN help◊ | Authenticate (sign-in on 4th digit) | — | — | Safe Key Escrow |
| 2 Lock | digits, Clear, Unlock (4th digit), Switch Caregiver, header and stat panels◊ | — | — | Code Override, reason list, Confirm bypass | — |
| 3 Ward | Search, All, Due Meds†, Critical Lab, Drafts†, Expand All†, Refresh†, card open, Show Details / Less†, Open Record, Vitals†, Give Med†, body map†, Reset Filters†, Prepare SBAR† | Critical Response and Labs Flow → Labs†; Give Insulin → Give med†; BGL Flow, Resp Assessment → Vitals†; Scan Form, Reconcile Med → Check draft†; Print Ward Summary → Paper form packets | Strict I/O, Log Output → fluids link | Dual Sign-Off from card, Whitaker Call Log | Log Turn, Pre-Op Checklist |
| 4 Summary | Record Vitals†, Log Fluids†, Add Note†, Start†, Open full map†, Inspect Slip†, View handover†, Quick lock† | Quick Administer → Give medicine†; Print Summary → paper forms | Prepare (opens the order) | Transfer custody | Emergency Transfer Packet |
| 5 History | tabs, Expand / Collapse All, search, newest / oldest, Add past-dated note, Print sheet, expand rows, patient tabs§, Inspect slip§, sign-off log§, baseline card§ | View MAR Log → Open MAR§; Append Addendum → Fix or Add a note§; Export PDF → print | — | View Telephony Log | — |
| 6 MAR | patient tabs†, All / Scheduled / PRN / Infusions / Stopped tabs†, search†, View Proof → View record†, Verify Dose → Check dose†, Record PRN†, Record New Administration†, Print MAR† | Check Line / Rate → New rate†; paper log tile → record link†; eMAR refresh (always live); Flagged for Worklist → worklist (admin) | — | Record Non-MAR Med (off, with reason)†, Flag Time Conflict (off, with reason)† | Accept 5 mg (AI must not change a record) |
| 7 Two-nurse | pick nurse, PIN, Cancel† | Confirm Dual Sign-off → Save dose record; three ticks → printed check list† | — | witnessed waste, volumes | RFID Tap, mesh staging |
| 8 Vitals | Record, Print, patient tabs‡, column tabs‡, chart switch‡, old versions‡, steppers‡, View timeline‡, Open row‡ | Save to ledger → Save; Export PDF → print | — | NEWS2, GCS tab, View Scale, rhythm | Verified mark per row |
| 9 I/O | Add intake, Add output‡, Print, Cancel, Save, tabs‡, steppers‡, ledger rows‡, chart hours‡, notes / labs / history links‡ | Recalculate (always live) | — | preset volumes, Flag Alert | — |
| 10 Body map | Front, Back, Both, site rows, tabs‡, layer switches‡, Reset‡, Print‡, Handover‡ | Export sheet → Print‡; Snap site → Photo of paper | — | Snap New Site, Add Line, Log Flush, Save Site, skin and pain pins (P-03) | — |
| 11 Capture | Retake, photo beside the form, edit fields, Save, zoom§, rotate§, per-field edit§, confirm tick§ | Flag for worklist → Keep as a draft§; Discard → Change form type§ | — | confidence | — |
| 12 Notes | New note, reset (Clear)¶, sign (PIN user), tabs¶, expand¶, composer beside list¶, print¶ | Attach photo → Photo of paper¶ | — | templates (4), risk scores, dual sign, verbal orders | Re-stock |
| 13 Orders | Open order, tabs¶, search¶, allergy card¶, print¶ | Prepare Dose → record page¶; Link order → record page; verbal order form → paper form¶ | — | Report allergy | Pharmacy pager, Broadcast |
| 14 SBAR | New handover, Print, patient tabs§, four cards§, vitals table§, linked records§, Return to ward§ | Export PDF → print; checklist → open items and printed tick boxes§ | — | Sign & transfer, counter-sign, PIN | Tap Badge |
| 15 Entry | History, All versions, Back, Fix, three-column compare¶, print¶ | — | — | Approve Amendment, Request Clarification | Medico-legal certificate |
| 16 Labs | open result, tabs¶, search¶, ledger¶, print list¶, record for a patient¶ | Log Draw and Check Status → Record result¶; Flowsheet¶ | — | Review Protocol, Titration Log | View ECG |
| 17 Compare | pick sample, sample cards◊, Run device, Run cloud (each only when pressed), Export JSON of answers that ran◊, field table◊ | Reset → choose another input | — | Run Benchmark | Simulate drop, Simulate throttle, bounding boxes |
| 18 Readiness | tiles◊, Check again◊, links to list, laptops, log, backup, recovery◊, node JSON as a check file without names◊ | Export encrypted database → Backup; Print test sheet → paper packets◊ | — | — | Force clock |
| 19 Settings | groups◊, cards◊, role details◊, export JSON◊, print◊ | Re-test → Readiness◊ | — | all edits, Save, auto-lock, precision, roles | Key ceremony, Sovereign policy |
| 20 Snapshot | Import file (Real records), Run checksum → Check the list◊, search◊, filter◊, table◊, print◊ | Inspect → open through the patient check◊ | — | — | Rollback, distribute to carts, simulate buttons, acuity |
| 21 Devices | laptop cards◊, newest records◊, Lock station◊ | Run local check → Readiness◊ | — | — | Mesh ping, pair, deauthorize, PCAP, peer logs |
| 22 Staff | Add (with role), New PIN, Switch on / off, search◊, print◊, what each role may do◊ | Audit logs → change log | — | Edit access of existing staff, temporary PIN, shift hours, recovery PIN | Broadcast, COW ping |
| 23 Change log | action filter, verify (Check again¶), search¶, tabs¶, names¶, inspector¶, print¶ | — | — | Export certificate | Merkle tree, simulate tamper |
| 24 Downtime | Start, End, gate, timeline◊, history table◊, print◊, steps with links◊ | Force backup → Backup; Print MAR backup → spooler; run checksum → verify | — | sub-events, runbook text | Broadcast, mesh alert, simulate resumption |
| 25 Setup | step strip◊, browser facts◊, the same form on Real records | Back → Back to sign-in◊ | — | key slot choices | Helpdesk, peripherals |
| 26 Gate | checklist cards◊, PIN keypad◊, authorise button◊, preview worklist◊, own layout◊, history◊ | — | — | confirm dialog, re-run probe | SIM FAIL |
| 27 Recovery | filter tabs with counts§, Export, open item, sign off, three panes§, Inspect slip§, decision§, print§, Encrypted backup§ | PIN authorise → signed-in user and choice§ | — | second reviewer, dual sign-off | dispensing register |
| 28 FHIR | prepare file, download, backup, dashboard tiles◊, record kinds◊, resources◊, who signed off◊ | dry run → checks before download | — | — | Sync to hospital EHR |
| 29 Spooler | form ticks, select all, rows, check list, print, order of sheets◊, orders and packet columns◊ | Batch PDF → print; Inspect → preview; remove row → untick | blank packs | print log | Hold spooler, background queue |
| 30–32 Forms | Print, other forms, tabs◊ | Batch census → spooler◊ | blank sheet | barcodes, QR | Encrypted PDF |
| 33 Landing | Launch demo, section links, tabs, FAQ | Watch drill → Explore | sample interactions that only change the sample | — | Book pilot, e-mail form, JSON payload, EHR claims |

Class 3 is the work that can start without a new decision. Class 4 needs an owner or clinical decision. Class 5 will not be built.

## 9. Next batches (each a small pull request)

1. **Batch 1 (merged):** ward board and summary; medication record and two-nurse check.
2. **Batch 2 (merged, #24, #25, #26):** vitals flowsheet (with problem 2), intake and output, body map.
3. **Batch 3 (merged: fixes #28 and #31, then #29, #30, #32, #33):** paper capture, history and SBAR handover, recovery worklist.
4. **Batch 4 (merged, #35, #36, #37, #38, #39):** change log, labs, orders, entry detail, notes layout.
5. **Batch 5 (merged, #41 to #49):** sign-in and lock (#41), readiness (#42), downtime and gate (#43), patient list (#44), staff and laptops (#45), settings and setup (#46), compare (#47), export and backup (#48), paper pages (#49).
6. **Landing:** waits for the owner.

## 10. Decisions needed from the owner

- Which landing reference (`_1` is assumed) and the rights to the landing photos.
- Should the wrong-PIN lockout be kept per person until the minute is over, even after leaving the page? It is a security-policy change, so it was not made.
- Still open from before: note templates, print logging, barcodes, site logging (P-03).
- A weight box in the vitals form (the database column already exists).
- New in batch 3: a required tick before a record from paper is confirmed, and a required choice before a recovery sign-off. Both follow the design; the owner may want a nurse to judge them.
- May the nurse who recorded an item also sign it off in recovery? Today yes; the design asks for a second person.
- New in batch 5: should a new patient list remove patients who are not in it, limit wrong PINs at the network gate, and keep unsaved typing when the screen locks? None of these was changed.
- Blank intake sheets (a paper form with no patient): a form design and an identity rule are needed.
- System Admin sidebar order stays deferred, as asked.
