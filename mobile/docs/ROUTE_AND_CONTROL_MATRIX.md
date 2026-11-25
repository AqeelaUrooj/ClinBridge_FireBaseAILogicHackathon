# Source to route and control matrix

Source: `stitch_clinbridge_mobile_ehr_downtime_system (3).zip`, SHA-256 `89B7718F74E69AD4B70DDE5C42C3C50C09ABCE1049A915CD7BA44759A2F24E9F`, 27 screen folders + illustration + DESIGN.md. Pictures: `evidence/<folder>/` (local, not committed). Reference size = the PNG scaled to 390 dp width.

| # | Source folder | PNG px | Reference dp | Native screen | Route | Permission | Writes | Failure states | Captures |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `clinbridge_opening_screen` | 706×1600 | 390×884 | OpeningScreen | `Go.opening` | none | - | vault still checking: button off | 7 |
| 2 | `clinbridge_select_staff` | 706×1600 | 390×884 | SelectStaffScreen | `Go.staff` | vault open | - | no match text | 8 |
| 3 | `clinbridge_staff_pin_sign_in` | 706×1600 | 390×884 | PinScreen (also lock page) | `Go.pin` | vault open | m_pin_state, audit | tries left, lockout 1 min, switched off | 26 |
| 4 | `clinbridge_my_patients_ward_4b` | 523×1600 | 390×1193 | WardScreen + verification sheet | `Go.ward` | signed in | m_assignment, audit | nothing found text; admin: look only | 13 |
| 5 | `clinbridge_verify_patient` | 659×1600 | 390×947 | VerifyPatientScreen | `Go.verify` | signed in | audit patient_verified | storage text, chart stays closed | 8 |
| 6 | `clinbridge_patient_summary_arthur_pendelton` | 356×1600 | 390×1753 | PatientSummaryScreen | `Go.summary` | verified patient | - | empty states | 9 |
| 7 | `clinbridge_add_bedside_action_sheet` | 706×1600 | 390×884 | AddBedsideScreen | `Go.addSheet` | verified patient | - | admin: entries off with reason | 9 |
| 8 | `clinbridge_record_vitals_editor` | 487×1360 | 390×1089 | VitalsEditorScreen | `Go.vitals` | nurse + verified patient | m_draft | field errors, draft kept | 15 |
| 9 | `clinbridge_review_vitals_entry` | 487×1447 | 390×1159 | VitalsReviewScreen | `Go.vitalsReview` | nurse + verified patient | entry, vital_sign, audit | not saved + real text, retry with same key | 9 |
| 10 | `clinbridge_medication_schedule_offline_mar` | 329×1600 | 390×1897 | MarScreen + confirmation drawer | `Go.mar` | verified patient | - | conflict page | 11 |
| 11 | `clinbridge_record_medication_event` | 450×1600 | 390×1387 | MedEventScreen | `Go.medEvent` | nurse + verified patient | entry, med_admin, audit | form kept, real text | 11 |
| 12 | `clinbridge_second_nurse_pin_co_sign` | 533×1600 | 390×1171 | CosignScreen | `Go.cosign` | nurse + verified patient + other RN | m_attestation, entry, audit | tries left, lockout, declined | 10 |
| 13 | `clinbridge_critical_medication_conflict_dose_lock_alert` | 315×1600 | 390×1981 | ConflictScreen | `Go.conflict` | verified patient | audit dose_locked, held entry | error box | 7 |
| 14 | `clinbridge_anatomical_body_map_assessment` | 297×1600 | 390×2101 | BodyMapScreen | `Go.bodyMap` | verified patient (edit: nurse) | entry note, m_body_finding, audit | findings kept | 9 |
| 15 | `clinbridge_patient_history_timeline` | 300×1600 | 390×2080 | HistoryScreen | `Go.history` | verified patient | - | nothing matches text | 10 |
| 16 | `clinbridge_paper_capture_camera_viewfinder` | 701×1600 | 390×890 | PaperCaptureScreen | `Go.paperCapture` | nurse + verified patient | - | denied, blocked, error, paused | 11 |
| 17 | `clinbridge_paper_photo_preview_quality_check` | 523×1600 | 390×1193 | PaperPreviewScreen | `Go.paperPreview` | nurse + verified patient | m_photo, audit | real text, page stays | 9 |
| 18 | `clinbridge_optical_paper_capture_glare_occlusion_error` | 315×1600 | 390×1981 | PaperErrorScreen | `Go.paperError` | nurse + verified patient | audit photo_rejected | retry | 7 |
| 19 | `clinbridge_paper_draft_review_value_verification` | 412×1600 | 390×1515 | PaperDraftScreen (steps 3 and 4) | `Go.paperDraft` | nurse + verified patient | entry, child, audit, m_draft | hash fault, lock, co-sign wait, retry | 12 |
| 20 | `clinbridge_bedside_sbar_note_editor` | 328×1600 | 390×1902 | SbarScreen | `Go.sbar` | nurse + verified patient | handoff, audit, m_draft | form kept | 10 |
| 21 | `clinbridge_ward_handover_shift_transition` | 296×1600 | 390×2108 | HandoverScreen + sign-off | `Go.handover` | nurse | m_shift_signoff, audit | blocked while notes are missing | 13 |
| 22 | `clinbridge_admin_readiness_dashboard` | 393×1600 | 390×1588 | ReadinessScreen | `Go.readiness` | admin | (drill start) | red check result | 7 |
| 23 | `clinbridge_downtime_protocol_checklist` | 337×1600 | 390×1852 | ChecklistScreen | `Go.checklist / preview` | signed in (change: admin) | m_checklist, downtime_event, audit | missing ticks, PIN, worklist | 14 |
| 24 | `clinbridge_recovery_reconciliation_worklist` | 346×1600 | 390×1803 | RecoveryScreen | `Go.recovery` | admin, Back online | worklist_item, m_resolution, audit | reason missing, storage | 16 |
| 25 | `clinbridge_admin_fhir_export_bundle` | 366×1600 | 390×1705 | ExportScreen | `Go.export` | admin, Back online | audit fhir_export, exported_at | blocked, errors, cancelled, failed | 13 |
| 26 | `clinbridge_offline_print_clipboard_backup` | 389×1600 | 390×1604 | PrintScreen | `Go.print` | signed in (bedside: verified) | audit print_made / file_saved | no print service, cancelled | 11 |
| 27 | `clinbridge_low_battery_air_gap_vault_emergency_freeze` | 502×1600 | 390×1243 | BatteryScreen | `Go.battery` | signed in | - | not reported | 8 |

## Companion screens (implementation additions, no reference picture)

Vault set-up / unlock / problem (`VaultScreen`), Fluid balance, Lab result, Bedside note, Record details, Local review (Queue), Alerts, More, Change log (Audit), SBAR view, patient picker for ward Add, slot and time sheets. They reuse the tokens and cards of the neighbouring references and are captured separately (`evidence/*/vault_*`, build/shots/companions).

## Route graph

opening → vault (set-up, unlock) → staff → PIN → ward (nurse) or readiness (admin) · ward → verify (two identifiers) → summary → add sheet → vitals → review → save · summary → MAR → conflict, medication event → co-sign → save · summary → history → record details · add sheet → fluid, lab, note, SBAR, body map · add sheet → capture → preview → error or draft → commit → co-sign or conflict · handover → SBAR → sign-off · readiness → checklist, recovery → export, audit · more → print, battery, local review, lock.

Every route has a guard (`lib/ui/router.dart`, `Need`) and every write checks person, role, lock state and patient again in the repository (`lib/data/ctx.dart`). Lock, sign-out, account change and vault lock clear the pages of the earlier state; a page whose patient is no longer the verified one leaves the back stack.

## Controls

### Entry and ward

| Screen | Control | Destination / effect | Permission | Writes | Failure state |
|---|---|---|---|---|---|
| Opening | Get started | vault / staff / home | any | none | disabled while checking |
| Opening | Checklist link | Go.checklistPreview | any | none | none |
| Vault | Create encrypted Practice store | createVault → staff | state none | vault, seed, audit vault_created | error text, stays |
| Vault | Unlock records | unlockVault → staff | state locked | audit vault_unlocked | "not right" text, input kept |
| Vault | Use practice passphrase / code; use the other secret | fills or switches field | locked | none | none |
| Vault | Back to opening page | Go.opening | problem | none | none |
| Staff | Card / search / clear | select / filter | vault open | none | "No clinicians matched" |
| Staff | Continue | Go.pin; a different locked person is signed out first | one selected | none | disabled |
| Staff | Hardware key | Unavailable | n/a | none | reason toast |
| PIN | Keys, Clear, backspace | edit PIN | active, not locked out | none | dimmed and off |
| PIN | Sign in | signIn → Go.home | 4 digits | m_pin_state, audit staff_signed_in / staff_pin_wrong / staff_pin_lockout | tries left, countdown, dots cleared |
| PIN | Switch | Go.staff | any | none | off while busy |
| Ward | Card | withPatient → Go.summary | signed in | none | none |
| Ward | Hint row sheet, confirm | verifyPatient → summary, plus vitals for a nurse | both ticks | audit patient_verified | error in sheet |
| Ward | Options: open / assign / alerts | chart / setAssigned / Go.alerts | assign: nurse | m_assignment, audit assignment_changed | error toast |
| Ward | Initials: Lock / Sign out / Admin readiness | lock / signOut / Go.home (admin) | signed in | none | none |
| Ward | Nav: Patients / Add / Handover / Alerts / More | show all / picker → verify → Go.addSheet / Go.handover / Go.alerts / Go.more | Add, Handover: nurse | none | reason toast |
| Verify | Confirm | verifyPatient → then or Go.summary | both ticks | audit patient_verified | error text, ticks kept |
| Verify | Barcode | Unavailable | n/a | none | reason toast |
| Verify | Go back to ward census | Go.back / Go.ward | signed in | none | none |

### Chart and vitals

| Screen | Control | Destination / effect | Permission | Writes | Failure state |
|---|---|---|---|---|---|
| Summary | Record Bedside Care, + | Go.addSheet | verified patient | none | route guard |
| Summary | History / Queue / Protocols | Go.history / Go.queue(patient) / Go.checklist | signed in (History: verified patient) | none | route guard |
| Summary | meds header, med rows, "n more" | Go.mar | verified patient | none | route guard |
| Summary | body map chip | Go.bodyMap | verified patient | none | route guard |
| Summary | timeline row | Go.entry | verified patient | none | route guard |
| Summary, History | person icon / info | identity sheet | verified patient | none | none |
| Identity sheet | Leave this patient | leavePatient + Go.ward | signed in | none (session only) | none |
| Add sheet | Vitals, Medication, Fluid, Note, Lab, SBAR, Paper, Body map | matching Go.* | nurse | none | admin: Unavailable with reason |
| Add sheet | Cancel, X, outside, back | same chart | verified patient | none | none |
| History | filter chips, Performer | filter the list | verified patient | none | "Nothing matches" |
| History | card / Payload | Go.entry or Go.sbarView / expand | verified patient | none | none |
| History | Ledger | Go.audit | admin | none | nurse: Unavailable |
| History | Summary / + / Queue / Protocols | Go.* | as Summary | none | route guard |
| Editor | fields, pain, AVPU, oxygen, time | form state, autosaved draft | nurse + patient | m_draft | real message in the footer, values kept |
| Editor | Back | asks: keep draft / discard / stay | nurse + patient | m_draft, draft_discarded audit | stays with error toast |
| Editor | draft offer | continue / start empty / back | draft owner | m_draft | error toast |
| Editor | Review entry | Go.vitalsReview | nurse + patient | m_draft | errors under fields |
| Review | warning tick | allows saving | nurse | none | none |
| Review | Save on device / Retry / Try again | createEntry + saved() | nurse + verified patient | entry, vital_sign, m_entry_key, audit; deletes m_draft | "Not saved" + real text, same key |
| Review | Edit measurements, back | editor with the values | nurse | none | none |
| Review (saved) | View record / Back to chart / back | Go.entry / Go.summary | verified patient | none | none |

### Medicines and body map

| Screen | Control | Destination / effect | Permission | Writes | Failure state |
|---|---|---|---|---|---|
| MAR | filter tabs | filters cards | any verified | none | "No order matches" |
| MAR | Record Administration | lock check → drawer → medEvent, or conflict | nurse | none | disabled with reason for admin |
| MAR | drawer/sheet Held, Refused | medEvent | nurse | none | toast |
| MAR | Administer PRN / Witness Co-Sign | lock check → medEvent or conflict | nurse | none | disabled |
| MAR | Rate Change, Drip | medEvent rate_changed | nurse | none | disabled / toast |
| MAR | Order Details, Record Med Event, info | sheets; history rows → Go.entry | any | none | none |
| MAR | Check Draft Record | Go.entry | any | none | none |
| MAR | nav | back / history / add / queue / checklist | add: nurse | none | toast |
| MedEvent | Review & Save → Sign & Save | createEntry | nurse | entry, med_admin, key, audit | form kept, real message, Try Again; lock → conflict |
| MedEvent | Authenticate Second Nurse (two places) | Go.cosign | nurse | none | disabled until 3 ticks and warnings ticked |
| MedEvent | execution time | time sheet | nurse | none | future / before admission refused |
| Cosign | nurse selector | sheet | nurse | none | "No other nurse…" |
| Cosign | Authorize | app.cosign + createEntry or confirmDraft | another active RN's PIN | attestation, entry, audit | tries left, lockout, mismatch, "record NOT saved" + Save Again |
| Cosign | Decline | recordAttestation declined | nurse | attestation, audit | real message |
| Cosign | back after an unused check | confirm | nurse | audit cosign_not_used | toast |
| Conflict | page opens | audit | signed in | audit dose_locked | error box |
| Conflict | Confirm Hold | createEntry held | nurse | entry, med_admin, audit | error box |
| Conflict | Return to MAR | back to MAR | any | none | blocked if the audit row could not be written |
| Body | Tag / Reassess / Remove | pending finding | nurse | m_draft | error box |
| Body | Save | note + m_body_finding in one transaction | nurse | entry, note, m_body_finding, audit | all pending kept |
| Body | Discard | confirm → delete draft → back | any | audit draft_discarded | error box |
| Body | History, Open Medicine Record, photo | sheet / Go.entry / viewer | any | none | none |

### Paper and companions

| Screen | Control | Destination / effect | Permission | Writes | Failure state |
|---|---|---|---|---|---|
| Capture | shutter | Preview | nurse + verified patient + camera | none | "No picture was taken. …" |
| Capture | Upload Scan | Android picker, then Preview | nurse | none | "No picture was chosen." / not a picture / real error |
| Capture | Manual Entry | Draft without photo | nurse | none until typed | asks for the type |
| Capture | Allow / Ask again / Open app settings / Try again | native | nurse | none | state text |
| Capture | torch | cameraTorch | camera running | none | "The torch did not turn on." |
| Preview | Keep | Draft | nurse, 2 ticks (+ override tick) | m_photo, 2 audit rows, m_draft | real error, page stays |
| Preview | Retake / Reject | fresh capture / Error page | nurse | none | – |
| Error | page opens | – | nurse | audit photo_rejected | red box + Try again |
| Error | Flag damaged | confirm | nurse | audit document_damaged | toast with real error |
| Error | Retake / Manual | Capture / Draft | nurse | none | – |
| Draft | Commit | same page, step 4 | nurse, tick, warnings ticked, hash ok | entry + child + audit; m_draft removed | Commit Failed, retry with same key |
| Draft | Commit, locked dose | ConflictScreen | nurse | none | "Held by a Dose Lock" |
| Draft | Commit, high-alert | CosignScreen | nurse + second RN | draft entry linked to the photo | "Waiting for the Second Nurse" |
| Draft | Discard / Retake / Mark Unreadable | confirm, then manual form / capture / manual form | nurse | m_draft and audit; photo stays | toast |
| Fluid, Lab, Note | Review, then Save | back | nurse | entry + child + audit | box in the sheet, Try again |
| EntryDetail | Correct (vitals) | Go.vitals with draft + reason | nurse | by the vitals stream | – |
| EntryDetail | Mark as a mistake | reason sheet | nurse | status + audit | toast |
| EntryDetail | Check and confirm draft | same page; cosign or conflict | nurse | confirmDraft | red box |
| Queue | Continue / Discard | owning form after the patient check / confirm | owner | m_draft | toast |
| Queue | worklist line | Go.recovery | admin | none | – |
| Alerts | each line | MAR / vitals / summary / entry / conflict after withPatient | signed in | none | – |
| More | Lock / Sign out / Lock records | session or vault | signed in | none | – |
| More | Local review / Print / Checklist / Battery | Go.* | signed in | none | – |
| More | Admin pages | Go.* | admin | none | – |
| More | Reset practice | confirm + passphrase | signed in | all fictional records replaced | wrong passphrase: nothing deleted |

### Handover and admin

| Screen | Control | Destination / effect | Permission | Writes | Failure state |
|---|---|---|---|---|---|
| SBAR | Save & Commit | createHandoff, leave, toast | nurse + verified patient | handoff, m_entry_key, audit; deletes draft | error above the button, form kept, same key on retry |
| SBAR | Save draft / autosave | saveDraft | nurse + verified patient | m_draft | red footer text (toast for the button) |
| SBAR | Back / Discard | keep / keep writing / discard | owner | m_draft delete, audit draft_discarded | stays, toast |
| SBAR | Link records | sheet | nurse | draft only | core refuses other-patient or draft records |
| SBAR | Copy from last note | fills fields, asks if not empty | nurse | draft only | cancel keeps text |
| SBAR | Earlier note | Go.sbarView | staff | none | n/a |
| SbarView | Linked record | withPatient → Go.entry | staff | none | verify screen |
| Handover | Incoming tile | RN picker | nurse | none | empty list text |
| Handover | Draft / Continue / + | withPatient → Go.sbar | nurse | none | verify screen |
| Handover | View SBAR | Go.sbarView | staff | none | "note was not found" |
| Handover | Export summary / Print sheet | Go.print | staff | none | n/a |
| Handover | Header icon / bar | Go.queue, Go.ward, Go.alerts, Go.more | staff | none | n/a |
| Handover | Sign-off | both PINs → shiftSignoff | nurse + different active RN | m_shift_signoff, audit | blocked text, wrong PIN, lockout; the wrong PIN is cleared |
| Readiness | Inspect drafts | Go.queue | admin page | none | n/a |
| Readiness | Protocol checklist | Go.checklist | admin page | none | n/a |
| Readiness | Declare restoration | Go.checklist at the clearance part | admin page | none | disabled with reason when not down |
| Readiness | Ledger tile | Go.audit | admin | none | n/a |
| Readiness | Integrity check (header, bottom) | verifyChain + integrity + cipherIntegrity | admin page | none | red result or "did not finish" |
| Readiness / Checklist | Start practice outage | confirm → startPracticeOutage | admin | downtime_event, audit | toast |
| Checklist | Step | setChecklistItem | admin, downtime open | m_checklist, audit | text in footer |
| Checklist | Switch to Back online | 3 ticks → PIN pad → clearNetwork | admin | downtime_event, audit | "Tick every clearance item first", wrong PIN, lockout |
| Checklist | End this downtime | confirm → endDowntime | admin | downtime_event, audit | real core message |
| Checklist | Save CSV / print icon | native.saveFile | signed in | audit file_saved only after a real save | cancelled / not saved / saved but not logged |
| Checklist preview | Sign in as admin | Go.vault, or Go.staff if unlocked | none | none | n/a |

### Recovery, export, print, battery

| Screen | Control | Destination / effect | Permission | Writes | Failure state |
|---|---|---|---|---|---|
| Recovery | Build list / Add new | `buildWorklist` | person (route admin), online | worklist_item, audit | error box |
| Recovery | chips | filter | admin | none | "Nothing here" |
| Recovery | Keep Record | reason sheet -> `signOffItem` (record_kept) | online | m_resolution, worklist_item, 2 audit | error in sheet, text kept |
| Recovery | Sign Off Hold | same, decision hold_signed_off; reason enforced in the UI | online | same | same |
| Recovery | Sign Off | `signOffItem` | online | worklist_item, audit | error toast |
| Recovery | Open Record / Review Rx Note | `withPatient` -> Go.entry | two identifiers | patient_verified | verify screen |
| Recovery | View JSON | sheet | admin | none | none |
| Recovery | Prepare FHIR | Go.export | admin | none | blocked card |
| Recovery, Audit | CSV | `saveFile` | admin | file_saved after save | toast, no row |
| Recovery, Audit | shield / avatar | store and chain check / Go.more | admin | none | error toast |
| Export | Download | confirm -> `saveFile` -> `recordExport` | admin, online | exported_at, fhir_export | failed / cancelled / saved-but-not-recorded |
| Export | Open the worklist | back to it, else Go.recovery | admin | none | none |
| Export | checklist link / info / back | Go.checklist / sheet / back | admin | none | none |
| Audit | filter, Show more | list | admin | none | "Nothing here" |
| Print | presets, Change, copies | rebuild | staff (bedside: verified patient) | none | error box |
| Print | Choose patient | `withPatient` | staff | patient_verified | verify screen |
| Print | Print… (and header icon) | `printPdf` | staff | print_made after the screen opened | "No print service on this phone…" |
| Print | Save PDF | `saveFile` | staff | file_saved after save | failed / cancelled |
| Battery | Open Physical Ledger Print | Go.print | staff | none | "Battery level not reported" |
