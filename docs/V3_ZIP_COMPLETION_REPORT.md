# V3 ZIP completion report (PR #14)

Branch `feat/v3-zip-completion`, started from `main` = `79deaeb` (PR #13 merged, CI green). Fictional Practice data only. No schema change, no migration, no new dependency, no AI change, no deployment, nothing published.

Source: `stitch_downtimekit_nursing_documentation_system_v3.zip` (owner's Downloads). Extracted read-only to a scratch folder outside the repository; no ZIP script was run and nothing from the ZIP was copied into the app.

**Legend.** UI / Workflow: **Complete** = the safe parts of the ZIP screen work on real stored data with the app's role and patient checks; **Partial** = works, but named ZIP controls are missing (reason given); **Missing** = not built. Decision: **Build** (done in this PR), **Built earlier**, **Adapt** (same purpose, safer form), **Defer** (needs an owner decision or clinical approval), **Block** (needs hardware, network infrastructure or a policy a browser app cannot supply).

---

## 1. ZIP inventory (verified from the archive)

62 files (105 entries including 43 folders). No executables, no unsafe paths.

| Kind | Count | What |
|---|---|---|
| `code.html` screens | 33 | Static Stitch mock-ups with hard-coded sample data; they load Tailwind, Google Fonts and (two of them) three.js from CDNs. Demo JavaScript only. |
| `three.js_1`, `three.js_2` `code.html` | 2 | Spec text inside `<script>` tags: implementation package (route table, interfaces, components) and migration manifest. Not 3D code. |
| PNG | 24 | 19 previews of the screens; 1 AI-generated icon/anatomy sheet; `capture.jpg` (earlier vitals screen); 3 stock-style photos. Plus a third-party "DocuVerse" dashboard image (mood board only). |
| Markdown | 3 | `downtimekit_frontend_handoff_architecture_spec.md` (v1), `downtimekit_v2_frontend_handoff_architecture_spec.md` (v2: route table, 24-region anatomy, marker classes), `clinical_high_reliability_downtime_interface/DESIGN.md` (tokens). |

Demonstration data in the ZIP (patients "Eleanor Vance", "Peter Novak" etc., "St. Jude Health System", licence numbers, Ord #s, provenance hashes, printer IPs, "Charge Nurse Jordan Park") was treated as sample content, never as requirements. The app keeps its own synthetic seed.

## 2. All 33 screens → ClinBridge

Security column: N = nurses (RN, LPN), A = admin, All = any signed-in user. "Patient check" = the two-identifier dialog (name, born, MRN) before any patient page.

| # | ZIP screen (folder) | Spec route | ClinBridge route · component | UI | Workflow | Database (tables · repo) | Security | Missing / deviation | Clinical approval | Decision | Tests |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | staff_sign_in_authentication_ward_4_west | `/sign-in` | `/sign-in` · `auth/SignIn.tsx` | Complete | Complete | practitioner · crypto (PBKDF2) | Public route; 5-try lockout | RFID / badge tap, temporary broadcast PINs | — | Built earlier · Block (RFID) | `vitals-slice` (lockout) |
| 2 | terminal_auto_lock_secure_unlock | `/lock` | `/lock` · `auth/SignIn.tsx` | Complete | Complete | — (session in memory) | Own PIN to unlock | Emergency bypass button | Yes | Built earlier · Block (bypass) | unit + e2e |
| 3 | ward_board_my_patients (minimal) | `/ward` | `/ward` · `ward/WardBoard.tsx` | Complete | Complete | patient, encounter, entry, lab_event | N | Acuity score; **+ "Paper form packets" button (PR #14)** | Score: yes | Built earlier + Build | `navigation` |
| 4 | patient_summary_bedside_overview | `/patients/:id` | same · `patient/PatientSummary.tsx` | Complete | Complete | entry + children | All, patient check; actions N | **+ paper forms card (PR #14)** | — | Built earlier + Build | `print`, `vitals-slice` |
| 5 | patient_history_clinical_timeline | `/patients/:id/timeline` | same · `patient/Timeline.tsx` | Complete | Complete | entry, snapshot_result, audit_log · `history.ts` | All, patient check | **+ SpO₂ trend (PR #14)**; verbal-order / titration event types are notes; no "bedside verified" claims | Event types: yes | Built earlier + Build | `history.test`, `vitalTrend.test`, `navigation`, `trends` |
| 6 | medication_administration_record_mar | `/patients/:id/meds` | same · `meds/MedsPages.tsx` | Partial | Complete | active_order, med_admin · `meds.ts` | N to record | Overdue (no approved window), PRN interval lock, barcode scan; **+ "Paper MAR sheet" link (PR #14)** | Yes | Built earlier · Defer | `meds` |
| 7 | bedside_add_capture_two_nurse_verification | `/patients/:id/meds/:order/verify` | `/patients/:id/meds/:order/record` · `meds/MedEditor.tsx` | Complete | Complete | med_admin.double_checked_by | Second RN's own PIN, enforced in the DB layer | Waste witnessing, independent dose maths | Yes | Built earlier · Defer | `meds` |
| 8 | vital_signs_flowsheet_charts | `/patients/:id/vitals` | same · `vitals/VitalsPages.tsx` | Partial | Complete | vital_sign | N to record | NEWS2 auto-score; **+ SpO₂ trend, + "Paper vitals & I/O sheet" link (PR #14)** | NEWS2: yes | Built earlier + Build · Defer (NEWS2) | `vitals-slice`, `trends` |
| 9 | fluid_intake_output_i_o | `/patients/:id/io` | same · `charting/ChartingPages.tsx` | Partial | Complete | intake_output · `ioTotals` | N | Oliguria / fluid-ceiling alerts, shift totals (no approved shift times); **+ paper sheet link** | Yes | Built earlier · Defer | `charting` |
| 10 | interactive_patient_body_map | `/patients/:id/body` | same · `body/BodyMapPage.tsx` | Partial | Partial | med_admin.site (markers); note.body_site not applied (P-03) | N | 21 of 24 regions (section 7), pain / wound / drain markers need P-03 | Region model: owner | Defer | `body-map`, `regions.test` |
| 11 | bedside_paper_capture_ai_review | `/patients/:id/capture` | same · `capture/CapturePages.tsx` | Complete | Complete | entry (photo), photos store | N | OCR fiducials / deskew | — | Built earlier · Block (fiducials) | `capture`, `ai` |
| 12 | nursing_notes_clinical_communication | `/patients/:id/notes` | same · `charting/ChartingPages.tsx` | Partial | Complete | note | N | DAR template, quick tags, second-RN co-sign | Template wording: owner | Defer | `charting` |
| 13 | patient_orders_allergies | `/patients/:id/orders` | same · `meds/MedsPages.tsx` (OrdersPage) | Complete (read only) | Complete | active_order, allergy | All | New allergy entry, verbal orders | Yes | Built earlier · Block | e2e |
| 14 | clinical_sbar_handover | `/patients/:id/handoff` | same · `handoff/HandoffPages.tsx` | Partial | Complete | handoff · `handoff.ts` | N to write | Dual nurse sign-off ledger; **+ "Paper SBAR sheet" link (PR #14)** | Yes | Built earlier · Defer | `handover` |
| 15 | entry_detail_versioned_correction_audit | `/entries/:entry(/correct)` | `/entries/:entry`, `/history`, `/correct` · `entries/EntryPages.tsx` | Complete | Complete | entry.supersedes_id, change_reason, audit_log | N to fix | — | — | Built earlier | `vitals-slice`, `charting` |
| 16 | ward_laboratory_tracking_critical_results | `/labs` | `/labs` · `charting/ChartingPages.tsx` | Complete | Complete | lab_event | All | Specimen courier, fridge telemetry | — | Built earlier · Block | `charting` |
| 17 | device_vs_cloud_comparison | `/drill/compare` | same · `ai/AiPages.tsx` | Complete | Complete | entry (drafts) | Practice only; cloud blocked in System Down | On-device side mock-tested only (hardware) | — | Built earlier | `ai`; live cloud test 20/22 Nov |
| 18 | readiness_storage_telemetry | `/admin` | same · `admin/AdminPages.tsx` | Partial | Complete | several | A | UPS / PTP / mesh telemetry | — | Built earlier · Block | `admin-recovery` |
| 19 | administration_settings_governance | `/admin/settings` | same (read only) | Partial | Partial | config file | A | Editing policies (needs an approved settings store and schema decision) | Yes | Defer | `admin-recovery` |
| 20 | patient_snapshot_management | `/admin/snapshot` | same | Complete | Complete | snapshot + all patient tables | A; Real records only for import | Mesh distribution | — | Built earlier · Block (mesh) | `admin.test` |
| 21 | workstation_nodes_peer_cow_device_management | `/admin/devices` | same + enrollment | Partial | Complete | device, key_store | A | P2P mesh, gossip replication | — | Built earlier · Block | `enrollment` |
| 22 | staff_roster_offline_credentials | `/admin/staff` | same | Complete | Complete | practitioner | A | RFID, broadcast PINs | — | Built earlier · Block | `admin.test` |
| 23 | cryptographic_audit_log_merkle_chain_inspector | `/admin/audit` | same | Complete | Complete | audit_log · `verifyChain` | A | Merkle proofs, PKI / TPM signatures | — | Built earlier · Block | `audit.test` |
| 24 | downtime_operations_incident_lifecycle | `/admin/downtime` | same | Complete | Complete | downtime_event, worklist_item | A | — | — | Built earlier | `admin-recovery` |
| 25 | first_time_setup_wizard | `/admin/setup` | `/setup` | Complete | Complete | practitioner, device, key_store | Only while Real records has no staff | — | — | Built earlier | `admin-recovery` |
| 26 | network_clearance_gate | `/recovery/gate` | checklist + admin PIN in `/admin/downtime` | Partial | Complete | downtime_event | A + PIN | DNS / mTLS / NTP probes | — | Adapt · Block (probes) | `admin-recovery` |
| 27 | recovery_worklist_second_look_reconciliation | `/recovery` | `/recovery`, `/recovery/:item` · `recovery/RecoveryPages.tsx` | Complete | Complete | worklist_item | A; cloud only after clearance | Pyxis concordance | — | Built earlier | `admin-recovery`, live 22 Nov |
| 28 | fhir_v4.0.1_data_sync_backup_recovery | `/recovery/fhir` | `/export` | Partial | Complete | all · `fhir.ts` | A; "sensitive" confirm | Push to an EHR over mTLS | — | Adapt · Block (push) | `fhir*.test`, HL7 validator in CI |
| 29 | batch_census_downtime_documentation_spooler | `/spooler` | **`/spooler` · `print/PrintPages.tsx` (new)** | Partial | Complete | patient, encounter, allergy (read) | All signed-in; check-the-list step | Port 9100 / LPR, printer telemetry, encrypted PDF | — | **Build (adapted)** | `print` |
| 30 | printable_bedside_downtime_documentation_sheets (DT-MAR-01) | `/print/mar/:id` | **`/print/mar/:id` · `print/PrintForms.tsx` (new)** | Partial | Complete | active_order, med_admin, allergy (read) | All signed-in, patient check | Barcode / QR / fiducials, indication column (not in schema) | — | **Build** | `print`, `printData.test` |
| 31 | printable_vitals_neuro_i_o_flowsheet (DT-VIT-02) | `/print/vit/:id` | **`/print/vit/:id` (new)** | Partial | Complete | vital_sign, intake_output (read) | All signed-in, patient check | NEWS2 rows and bands, GCS total maths, BGL in mmol/L (app stores mg/dL) | NEWS2/GCS: yes | **Build** | `print` |
| 32 | printable_verbal_orders_sbar_handover_record (DT-SBAR-03) | `/print/sbar/:id` | **`/print/sbar/:id` (new)** | Partial | Complete | handoff (read) | All signed-in, patient check | Countersignature status tracking (paper boxes only) | Policy: yes | **Build** | `print` |
| 33 | downtimekit_enterprise_hospital_ehr_downtime_platform_landing_page | `/landing` | — | Missing | Missing | — | — | Marketing page with unverifiable compliance claims | — | Defer (out of scope) | — |

Count: 33 screens. Complete UI: 17 · Partial: 15 · Missing: 1. Complete workflow: 30 · Partial: 2 (body map, settings) · Missing: 1 (landing page).

## 3. New in this PR

| Route / place | What it does | Files |
|---|---|---|
| `/print/mar/:id` | DT-MAR-01: identifiers (repeat on every printed page), allergies, active medicine orders grouped scheduled / drip / as needed, today's scheduled times with what ClinBridge recorded ("Given 09:02 (in ClinBridge)") or a blank line, high-alert second-nurse box, site/reason box, blank rows for paper orders, initials key | `src/features/print/PrintForms.tsx`, `printData.ts`, `PrintPages.tsx` |
| `/print/vit/:id` | DT-VIT-02: blank 8-column vital-sign grid, blank neuro grid (no total maths), fluid grid with the app's own I/O categories, last 3 confirmed readings and today's confirmed I/O totals for reference, notes lines | same |
| `/print/sbar/:id` | DT-SBAR-03: newest saved handover (with its time and author) or blank SBAR lines; blank verbal/telephone order table and handover signature table, each labelled as paper-only | same |
| `/spooler` | Packet builder: forms, patients (select all / none, counts), check-the-list step, preview (patient-separated page breaks), confirm dialog, browser print | `PrintPages.tsx` |
| Patient history | SpO₂ card: latest, lowest, latest vs lowest, chart, values table, pre-outage marker | `src/components/TrendChart.tsx`, `src/lib/vitalTrend.ts`, `Timeline.tsx` |
| Vitals page | SpO₂ chart beside the pulse chart; link to the paper sheet | `VitalsPages.tsx` |
| Entry points | Ward board "Paper form packets"; More → Paper form packets (admins); summary card with the 3 forms; MAR, fluids and handover pages link their sheet | `WardBoard.tsx`, `misc/Pages.tsx`, `PatientSummary.tsx`, `MedsPages.tsx`, `ChartingPages.tsx`, `HandoffPages.tsx` |
| App frame | Below 768 px: Menu button, overlay menu, closes on navigation / Escape; full-width content | `components/AppShell.tsx` |
| CSS | Print page breaks, repeating id strip, on-screen sheet look | `src/index.css` |
| CI | `e2e-screens` artifact with the tests' screenshots (fictional data) | `.github/workflows/ci.yml` |

Shared print rules met: no external fonts or CDNs (bundled Inter and icons, precached by the service worker); real data only; app frame and buttons hidden in print; identifiers on every page; Letter and A4 both render (PDF check in `e2e/print.spec.ts`); a sensitive-information notice on screen and "Confidential patient information" on every sheet; "PRACTICE · FICTIONAL PATIENT · NOT A MEDICAL RECORD" on Practice sheets; printing only after a button press (and a confirm dialog for packets); nothing is downloaded or sent anywhere.

## 4. Deferred or blocked (not built), and why

| ZIP source | Requested behaviour | Why not | Missing dependency | Possible approach | Owner approval |
|---|---|---|---|---|---|
| spooler, print sheets | Code-128 / QR "provenance hash", OCR corner fiducials, cart-scanner ingest | Nothing verified to encode, no scanner or ingest pipeline; a barcode that nothing reads would look authoritative | Scanner hardware, agreed identifier and format | A standard Code-128 of the MRN once the hospital confirms the format and a scanner | Yes |
| spooler | LPR / port 9100 direct printing, printer status, toner, "spool N packets" | Browsers cannot open raw sockets or confirm printing | Print server / native helper | Hospital print server API | Yes (infrastructure) |
| spooler, sheets | "Export encrypted PDF" | Would create a sensitive file outside the encrypted store | Key handling and file policy | Reuse the encrypted backup format | Yes |
| DT-VIT-02, vitals flowsheet, history | NEWS2 score, escalation bands, targets | No approved algorithm (D-17b) | Clinical sign-off | `lib/vitals.ts` hook once approved | Yes |
| DT-VIT-02 | GCS total calculated | Same: a coma-scale total is a clinical score | Clinical sign-off | — | Yes |
| DT-SBAR-03, history | Verbal-order logging with prescriber countersignature countdown | New signature policy | Approved verbal-order policy | New record type + schema change | Yes |
| DT-SBAR-03, handover | Dual nurse custody sign-off ledger | New signature policy | Approved policy | — | Yes |
| MAR | Overdue status, PRN interval lock, waste witnessing, independent dose maths, barcode scan | No approved timing window / policy, no scanner | Policy, hardware | Config in `clinicalPolicy.ts` | Yes |
| I/O | Oliguria, fluid ceilings, shift totals | Clinical rules and shift times not approved | Policy | — | Yes |
| Notes | DAR template, quick tags | Template wording is a documentation-policy choice | Agreed headings | Nurse-selected text templates (no auto-filled findings) | Yes (wording) |
| Body map | 24-region model, pain / wound / drain markers | See section 7; markers need `note.body_site` (P-03, schema change) | Owner decision on regions; P-03 approval | Additive 21 + 3 regions; P-03 migration | Yes |
| Admin settings | Edit retention, salt rotation, mesh parameters | Needs an approved settings store (schema) and key-rotation design | Schema decision | — | Yes |
| Workstations, snapshot | P2P / Wi-Fi Direct mesh, gossip replication | Browser cannot do it; would bypass the clearance gate | Native networking | — | Yes |
| Sign-in, lock | RFID / smartcard, emergency bypass | Hardware; bypass weakens access control | Hardware, policy | — | Yes |
| Clearance gate | Real DNS / mTLS / NTP probes | Not possible from a browser without a server | Hospital endpoint | Server-side health endpoint | Yes |
| FHIR | Push to the EHR over mTLS | No EHR connection or certificates | EHR team | — | Yes |
| Audit | Merkle proofs, PKI / TPM signatures | Would need signing keys and a verifier; a fake proof would mislead | Key infrastructure | — | Yes |
| Landing page | Marketing page with FDA / SOC 2 / HIPAA claims | Unverifiable claims | — | — | Yes |
| (any) | Printing written to the change log | The browser cannot tell whether a page printed; an audit row would record "opened print dialog" only | Owner decision | Add a `forms_printed` audit action (no schema change) | Yes |

## 5. Main visual and content differences from the ZIP

- **DT-MAR-01:** ZIP shows a QR "provenance hash", corner fiducials, printer card, "St. Jude Health System", indication column, PRN "last given" text, "Charge nurse verified shift completeness" ledger. ClinBridge: none of these (section 4), ward unit name from the record, ordered-by instead of indication (no indication field), recorded times marked "(in ClinBridge)".
- **DT-VIT-02:** ZIP pre-fills hourly 07:00–18:00 columns and NEWS2 rows. ClinBridge leaves time headers blank (no approved shift or observation schedule) and shows recent confirmed readings in a reference line instead of putting them into the paper grid.
- **DT-SBAR-03:** ZIP shows filled verbal orders "Pending countersign due …". ClinBridge prints the saved handover text and blank paper tables with "paper only" notes.
- **Spooler:** ZIP shows hardware status, "Spool 10 packets (30 pages)", collation options. ClinBridge shows a three-step builder and an honest print-dialog notice; collation is by patient (each patient's sheets together).
- **SpO₂ card:** ZIP draws a dashed "baseline" line and "Titrated" tag. ClinBridge draws no reference line and no interpretive tag; the pre-outage value is a separate square marker.
- **Header / sidebar:** unchanged from PR #12 (no mesh / pending-sync / shift timer); below 768 px the sidebar becomes a menu.
- Pixel-level comparison was not attempted: the ZIP images use different sample data and branding, so a pixel diff would measure content, not layout. Comparison was done side by side against `screen.png` files and recorded above.

## 6. Screenshots (review evidence)

Taken by the browser tests on fictional Practice data and uploaded by CI as the `e2e-screens` artifact of the PR run:

| File | Shows |
|---|---|
| `print-mar-letter.png` | DT-MAR-01 in print media (no app frame) |
| `print-vit.png`, `print-sbar.png` | DT-VIT-02 and DT-SBAR-03 on screen |
| `spooler-packet-print.png` | 2-patient packet in print media |
| `history-spo2-desktop.png`, `-small-desktop.png`, `-phone.png` | SpO₂ card at 1440, 1024 and 390 px |
| `phone-menu-open.png`, `phone-ward.png` | Phone-width menu and ward board |

## 7. Database compatibility

- **No schema change.** 19 tables, Dexie version 2, unchanged (`src/db/schema.ts`, `src/db/db.ts` untouched). Encryption, audit chain, correction model, backup format untouched. Everything new reads existing data through existing repositories (`loadPatient`, `listPatientEntries`, `listHandoffs`, `slotStatuses`, `ioTotals`) and writes nothing (unit test: audit row count unchanged after loading print data).
- **Body map 24-region assessment (Phase 8):**

| Current id (21) | Nearest Stitch id (24) | Fit |
|---|---|---|
| HEAD | REG_HEAD_ANT + REG_OCCIPUT | Split front/back |
| CHEST | REG_CHEST_R + REG_CHEST_L | Split by side |
| ABDOMEN_RIGHT / ABDOMEN_LEFT | REG_ABDOMEN_UR+LR / UL+LL | Halves vs quadrants: an existing "abdomen, left side" record cannot be placed in upper or lower |
| UPPER_BACK | REG_THORACIC_POST_R + _L | Split by side |
| LOWER_BACK | REG_LUMBAR_SPINE | Same |
| BUTTOCKS | REG_SACRUM_GLUTE_R + _L | Split by side |
| LEFT/RIGHT_UPPER_ARM, _FOREARM, _HAND | REG_ARM_L/R_ANT + _POST | Three parts vs whole arm front/back: detail lost (IV sites in the seed are forearm/hand) |
| LEFT/RIGHT_THIGH, _LOWER_LEG, _FOOT, _HEEL | REG_LEG_L/R_ANT + _POST | Four parts vs whole leg front/back: foot has no Stitch region; heel is inside "leg back" |
| — | REG_NECK_ANT, REG_CERVICAL_SPINE, REG_PERINEUM | **Only in Stitch** (drawn in the current art but not selectable) |

  Conclusion: the Stitch model is **not additive**. Adopting it would merge or split existing ids, and stored sites would need a mapping rule for the abdomen that is a clinical choice. Markers are derived at read time from `med_admin.site` text, so no stored region ids would change, but the owner's P-01 choice (21 regions) would. **Proposal (not built):** keep the 21 ids and add 3 new selectable regions `NECK`, `BACK_OF_NECK`, `PERINEUM` = 24 regions, purely additive (new ids only, no stored data touched, no migration). Needs the owner's yes on P-01. Pain, wound and drain markers additionally need P-03 (`note.body_site`, a schema change) and are not shown.

## 8. Security and roles

- Print routes are inside `RequireAuth` (signed-out users are sent to sign-in, then back) and use the same patient check as patient pages (test: no sheet renders before "Yes, open").
- No new role. All signed-in staff can print (spec: "All roles"); the packet builder shows only patients of the open dataset (Practice or Real records) and requires the check-the-list step. There is no per-patient assignment in ClinBridge, so "authorised patients" = the ward list, as on My Patients.
- Admin pages stay blocked for nurses (`navigation.spec.ts`), unchanged.
- Nothing is transmitted: no network call in any new code; the offline test opens a sheet with the network off after a reload.
- Firebase AI Logic, App Check, inference modes and the System Down cloud gate are untouched (no change under `src/lib/ai`, `src/lib/cloud*.ts`).

## 9. Automated tests (local, after the last code change)

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | Pass |
| `npx vitest run` | **225 passed, 1 skipped** (+15: `vitalTrend.test.ts` 7, `printData.test.ts` 8). The skipped file writes the FHIR bundle and runs only in CI |
| `npm run build` | Pass (26 precache entries) |
| `npx playwright test` | **42 / 42** (+8: `print.spec.ts` 4, `trends.spec.ts` 2, `navigation.spec.ts` +2) |

New browser tests cover: sign-in and patient check before a sheet; real orders and identifiers; no automatic print (print counter stays 0 until a click); print-media layout without the app frame; Letter and A4 PDF rendering; vitals sheet without scores; SBAR with saved handover and paper-only boxes; packet select all / none, no-forms guard, check-the-list, page breaks per patient and per form, per-sheet identifiers, confirm and cancel; offline after reload; SpO₂ values, order, pre-outage marker, no target line; a fixed reading replacing the old one in the trend; phone menu open / close / Escape; wide screen unchanged.

## 10. Official FHIR validation

Runs in CI (`fhir-validate`, HL7 validator 7.0.6, R4 4.0.1, fails on any error). The export code is unchanged in this PR. Result on the PR head is recorded on the PR.

## 11. Files changed

New: `src/features/print/{PrintForms.tsx, PrintPages.tsx, printData.ts, printData.test.ts}`, `src/components/TrendChart.tsx`, `src/lib/vitalTrend.ts`, `src/lib/vitalTrend.test.ts`, `e2e/print.spec.ts`, `e2e/trends.spec.ts`, this report.
Changed: `src/App.tsx` (2 routes), `src/components/AppShell.tsx` (narrow-screen menu), `src/index.css` (print rules), `src/features/patient/{Timeline.tsx, PatientSummary.tsx}`, `src/features/vitals/VitalsPages.tsx`, `src/features/meds/MedsPages.tsx`, `src/features/charting/ChartingPages.tsx`, `src/features/handoff/HandoffPages.tsx`, `src/features/ward/WardBoard.tsx`, `src/features/misc/Pages.tsx`, `e2e/navigation.spec.ts`, `.github/workflows/ci.yml`, `ROUTES.md`, `DECISIONS.md` (D-70–D-75), `KNOWN_LIMITATIONS.md`, `IMPLEMENTATION_STATUS.md`, `TEST_REPORT.md`, `docs/ZIP_REQUIREMENTS_TRACEABILITY.md`.
Not touched: `src/db/**`, `src/lib/ai/**`, `src/lib/cloud*.ts`, `src/lib/fhir.ts`, `src/config/**`, `package.json`, `package-lock.json`.

## 12. Decisions for the owner

1. **Body map:** add the 3 additive regions (neck, back of neck, perineum) → 24 regions, or keep 21?
2. **Note templates:** approve neutral nurse-selected templates (for example DAR headings Data / Action / Response) and their wording?
3. **Print audit:** write a change-log row when someone opens the print dialog for a sheet or packet (records the attempt, not that a page printed)?
4. **Barcodes:** confirm whether the hospital wants a Code-128 of the MRN on paper forms, and the exact format, before any barcode is added.
5. Clinical items (NEWS2, GCS totals, verbal orders, dual sign-off, overdue windows, oliguria): need approved clinical policy first.

## 13. PR and commits

PR #14 and commit SHAs: see the PR page (filled in after push).
