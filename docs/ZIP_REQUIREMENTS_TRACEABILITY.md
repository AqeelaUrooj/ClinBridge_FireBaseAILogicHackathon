# ZIP requirements, traceability and database mapping

> Updated by PR #14. The full 33-screen matrix, deferred features and body-map assessment are in `docs/V3_ZIP_COMPLETION_REPORT.md`.

Source: `stitch_downtimekit_nursing_documentation_system_v3.zip` (owner's Downloads, 22 Nov 2026).
Extracted read-only outside the repo; nothing from it was copied into the app, and none of its scripts were run.
All patient names in the ZIP are fictional; the app keeps its own synthetic seed.

**Status legend** (per the owner's brief): **1** fully implemented · **2** implemented elsewhere · **3** partial · **4** UI only · **5** data/backend only · **6** missing · **7** conflicts with the app's rules (not built, reason given) · **8** ambiguous.

Requirements are marked **explicit** (written in a ZIP spec or shown on a ZIP screen) or **inferred** (deduced by us; never presented as a source requirement).

---

## 1. What is in the ZIP (every file)

105 entries: 43 folders and 62 files. There are no scripts or executables and no unsafe paths. The HTML files load external CDNs (Tailwind, Google Fonts, three.js); the app uses none of them.

| Kind | Count | Notes |
|---|---|---|
| HTML screens (`code.html`) | 33 | Static Stitch mock-ups with hard-coded sample data. A few have demo JavaScript (e.g. the sign-in screen accepts "2468" or "1234"); none of it was used. |
| HTML wrappers `three.js_1`, `three.js_2` | 2 | They render a black page. The `<script>` bodies are Markdown spec text: an "implementation package" (route table, 19 interfaces, components) and a "migration manifest" (33-view map, first-milestone acceptance criteria). They are requirement documents, not 3D viewers. |
| PNG screenshots | 24 | 19 are previews of the screens above. The other 5: an AI-generated anatomy/icon style sheet (3 themes); `capture.jpg` (an earlier vitals screen); 3 stock-style hospital photos. |
| Markdown | 3 | `downtimekit_frontend_handoff_architecture_spec.md` (v1), `downtimekit_v2_frontend_handoff_architecture_spec.md` (v2), `clinical_high_reliability_downtime_interface/DESIGN.md` (design tokens). |
| Third-party image | 1 | `whatsapp_image_2026_11_18_at_6.17.46_pm.jpeg`: a "DocuVerse" dashboard from another product. Mood board only, not a requirement, not copied. |

**No requirement documents were found for:** SQL files, JSON schemas, sample-record files, test instructions, a README, or an explicit permissions matrix. Roles appear only as a column in the route table of the v1/v2 specs.

### Screen inventory and where each one lives in ClinBridge

| ZIP screen (folder) | Spec route | ClinBridge route | Status |
|---|---|---|---|
| staff_sign_in_authentication | `/sign-in` | `/sign-in` | 1 |
| terminal_auto_lock_secure_unlock | `/lock` | `/lock` | 1 (no emergency bypass: 7) |
| ward_board_my_patients (canonical minimal) | `/ward` | `/ward` | 1 |
| patient_summary_bedside_overview | `/patients/:id` | `/patients/:id` | 1 |
| patient_history_clinical_timeline (minimal, expandable) | `/patients/:id/timeline` | `/patients/:id/timeline` | **1 (rebuilt in this PR)** |
| medication_administration_record_mar | `/patients/:id/meds` | `/patients/:id/meds` | 1 |
| bedside_add_capture_two_nurse_verification | `/patients/:id/meds/:order/verify` | `/patients/:id/meds/:order/record` (second-nurse PIN step) | 2 (waste witnessing: 7) |
| vital_signs_flowsheet_charts | `/patients/:id/vitals` | `/patients/:id/vitals` + ward `/tools/vitals` (new) | 1 (NEWS2: 7) |
| fluid_intake_output_i_o | `/patients/:id/io` | `/patients/:id/io` + ward `/tools/io` (new) | 1 (oliguria alert: 7) |
| interactive_patient_body_map | `/patients/:id/body` | `/patients/:id/body` + ward `/tools/body` (new) | 3 (21 of the spec's 24 regions, see P-01) |
| bedside_paper_capture_ai_review | `/patients/:id/capture` | `/patients/:id/capture` | 1 (OCR fiducials / deskew: 7) |
| nursing_notes_clinical_communication | `/patients/:id/notes` | `/patients/:id/notes` | 1 (second-RN co-sign on notes: 7) |
| patient_orders_allergies | `/patients/:id/orders` | `/patients/:id/orders` | 1 read-only (new allergy entry / verbal orders: 7) |
| clinical_sbar_handover | `/patients/:id/handoff` | `/patients/:id/handoff` | 1 (dual sign-off ledger: 7) |
| entry_detail_versioned_correction_audit | `/entries/:entry(/correct)` | `/entries/:entry`, `/history`, `/correct` | 1 |
| ward_laboratory_tracking_critical_results | `/labs` | `/labs` | 1 (specimen courier, fridge telemetry: 7) |
| device_vs_cloud_comparison | `/drill/compare` | `/drill/compare` (Practice only) | 1 (real Firebase AI Logic) |
| readiness_storage_telemetry | `/admin` | `/admin` | 1 for the real browser checks (UPS, PTP, mesh: 7) |
| administration_settings_governance | `/admin/settings` | `/admin/settings` (read only, "not approved") | 3 (editing policies needs an approved settings store) |
| patient_snapshot_management | `/admin/snapshot` | `/admin/snapshot` | 1 (mesh distribution: 7) |
| workstation_nodes_peer_cow_device_management | `/admin/devices` | `/admin/devices` (laptops + enrollment) | 2 (P2P mesh: 7) |
| staff_roster_offline_credentials | `/admin/staff` | `/admin/staff` | 1 (RFID, temporary broadcast PINs: 7) |
| cryptographic_audit_log_merkle_chain_inspector | `/admin/audit` | `/admin/audit` | 1 (SHA-256 chain check; PKI / TPM: 7) |
| downtime_operations_incident_lifecycle | `/admin/downtime` | `/admin/downtime` | 1 |
| first_time_setup_wizard | `/admin/setup` | `/setup` (Real records only) | 2 |
| network_clearance_gate | `/recovery/gate` | Clearance checklist + admin PIN in `/admin/downtime` | 2 (DNS / mTLS / NTP probes: 7) |
| recovery_worklist_second_look_reconciliation | `/recovery` | `/recovery`, `/recovery/:item` (cloud second look) | 1 (Pyxis concordance: 7) |
| fhir_v4.0.1_data_sync_backup_recovery | `/recovery/fhir` | `/export` (FHIR R4 file; no push to an EHR) | 2 (push to EHR over mTLS: 7) |
| batch_census_downtime_documentation_spooler | `/spooler` | `/spooler` (PR #14) | **2**: browser packet builder; port 9100 / LPR printing stays 7 |
| printable_bedside_downtime_documentation_sheets / vitals_neuro_io_flowsheet / verbal_orders_sbar_handover | `/print/*` | `/print/mar/:id`, `/print/vit/:id`, `/print/sbar/:id` (PR #14) | **1** for the paper forms; barcode / QR / OCR fiducials, NEWS2 and GCS maths, verbal-order authorisation stay 7 |
| downtimekit_enterprise…landing_page | `/landing` | — | 6, out of scope (marketing page with unverifiable compliance claims) |

---

## 2. Navigation (explicit: patient history, patient summary, orders, vitals and labs screens, "Sidebar A")

| Group | Menu label | ClinBridge destination | Roles | Status |
|---|---|---|---|---|
| PRIMARY OPERATIONS | My Patients (count) | `/ward` | Nurse (RN, LPN) | 1 |
| | Add Note / Form | `/add`: every patient with form shortcuts (vitals, note, photo, medicine, fluids, lab, handover). The patient check runs first. | Nurse | **1 (new)** |
| | Handover | `/handover` | Nurse | 1 |
| | Alerts & Orders (count) | `/alerts`: drafts to check, critical lab results (read-back status), orders per patient (read only) | Nurse, Admin | **1 (extended)** |
| CLINICAL TOOLS | Medication Schedule | Patient open: `/patients/:id/meds`. Otherwise `/tools/meds` (ward schedule for today). | Nurse | **1 (new)** |
| | Vitals Flowsheet | `/patients/:id/vitals` or `/tools/vitals` (latest vitals per patient) | Nurse | **1 (new)** |
| | Fluid Balance (I/O) | `/patients/:id/io` or `/tools/io` (today's in / out / balance) | Nurse | **1 (new)** |
| | Lab Results | `/patients/:id/labs` or `/labs` | Nurse | 1 |
| | Body Map | `/patients/:id/body` or `/tools/body` (pick a patient) | Nurse | **1 (new)** |
| SYSTEM ADMIN | Readiness & Storage | `/admin` | Admin | 1 |
| | Downtime Management | `/admin/downtime` | Admin | 1 |
| | Recovery Gate & Worklist | `/recovery` (the clearance gate is in Downtime Management) | Admin | 1 |
| | Audit Log | `/admin/audit` | Admin | 1 |

**Role rule kept (conflict resolved in favour of authorisation):** the ZIP shows all three groups to a "Charge Nurse". ClinBridge has no charge-nurse role, and the existing design says nurses never see admin pages. So nurses get PRIMARY OPERATIONS + CLINICAL TOOLS, and admins get SYSTEM ADMIN plus Alerts & Orders. `/admin/*` stays guarded in `AdminLayout` whatever the menu shows. More (switch user, AI check, Device vs Cloud, settings) stays for both roles.

**Variants not used:** Sidebar B uses different labels for the same groups ("Ward Board", "Add / Capture", "Handover / SBAR", "Alerts & Labs"). Sidebar C (Clinical Drills / Recovery Operations / Administration & Governance) appears on the admin and print screens. Sidebar A was chosen because the owner's brief names it and the canonical "minimal" screens use it.

---

## 3. Patient dashboard and history: requirement → implementation → tests

| Requirement (explicit unless marked) | Implementation | Tests | Status |
|---|---|---|---|
| Header: bed, name, age/sex, MRN, attending, code status, isolation, allergy status | `PatientBanner.tsx` (already built) | existing e2e | 1 |
| Header: ward / unit, snapshot time | `PatientBanner.tsx` (unit + "Patient list HH:MM, date" from `encounter.unit` and `snapshot.taken_at`) | visual | **1 (new)** |
| Identification safeguard (two identifiers) | Patient check dialog on every patient and entry page (unchanged) | existing e2e + `navigation.spec.ts` | 1 |
| Filter tabs with counts (All, Vitals, Medications, Clinical notes, Lab / bloodwork) | `lib/history.ts` (`historyCounts`, `filterHistory`) + `Timeline.tsx`. A Fluids (I/O) tab was added because the app records I/O (*inferred*). | `history.test.ts` (8), `navigation.spec.ts` (counts add up) | **1** |
| Counts stay right after fixes and mistakes | Counts include current records only; old versions and mistakes are excluded and can be shown crossed out with a toggle | `history.test.ts` | **1** |
| Expand all / Collapse all / single-card expand | `Timeline.tsx` (`aria-expanded`) | e2e | **1** |
| Search history | Free-text search over summary, record type and author | unit + e2e | **1** |
| Newest first / Oldest first by clinical time | Sorted by `care_time`, then `entry_time`, then `counter` (not display order) | unit + e2e | **1** |
| Card details (values, measured vs typed time, laptop/counter, fix reason, source photo) | Reuses `EntryValues` from the details page. Shows "typed N min later" when entry time is ≥ 5 min after care time (`care_time != entry_time` rule from the spec). | e2e | **1** |
| Pre-outage baseline ("Ground Truth" card) | Read-only card "Hospital patient list (before the outage)" from `snapshot_result` | visual | **1** |
| Charting integrity panel | Facts only: confirmed, drafts (confirmation pending), fixed, mistakes, from photo, from AI or simulated proposal, change-log chain check (`verifyChain`) | unit + e2e (asserts no "Bedside verified / Countersigned / All signed") | **1** |
| "Bedside Verified", "Physician Countersigned", "All records signed" | **Not shown.** ClinBridge has no such workflow, and inventing an e-signature policy is out of bounds. The panel says so. | e2e | 7 |
| Care team involved | Authors of current records with counts (`careTeam`) | unit | **1** |
| Recorded sequence strip | Times and types of current records in order (`recordedSequence`) | unit | **1** |
| Timeline actions: add past-dated note, print | "Add a note (any past time)" (nurses), browser print | visual | 1 (PDF export: 6) |
| Shift chronology types: vitals, meds, notes (incl. "talked to doctor"), labs, I/O | All five entry types in one chronology | e2e | 1 |
| Chronology: oxygen titration, SBAR call, verbal order, handover events | No new record types were added (not in the 19-table model as separate types). Titration and SBAR calls are recorded as notes or vitals. Handovers keep their own page, because `handoff` rows have no time field to place them in a chronology. | — | 3 / 7 (verbal orders) |
| SpO₂ recovery trend chart | `components/TrendChart.tsx` + `lib/vitalTrend.ts` on history and vitals (PR #14): confirmed line, hollow drafts, pre-outage marker, values table | `vitalTrend.test.ts` (7), `e2e/trends.spec.ts` | **1** |

## 4. Modules A–K (from the brief) against the ZIP

| Area | Status | Notes |
|---|---|---|
| A. Patient list, selection, two-identifier check, details, encounter, history | 1 | History rebuilt (section 3) |
| B. Vitals: record, history, fixes, draft warnings, photo link | 1 | NEWS2 / early-warning score is **7** (`lib/vitals.ts`: no score without an approved algorithm) |
| C. Medicines: orders, schedule, give / held / refused, high-alert second-nurse PIN, audit | 1 | Ward schedule added. Waste witnessing, independent dose maths and barcode wristband scan are **7** (no approved rule or hardware). |
| D. Notes: create, draft, confirm, fix, chronology | 1 | DAR template and quick tags: 6. Second-RN co-sign on notes: 7. |
| E. Intake / output | 1 | Ward totals added. Oliguria (< 0.5 mL/kg/h) and fluid-restriction alerts: **7** (clinical rules, not approved). |
| F. Labs: results, critical flag, read-back | 1 | Specimen courier, fridge temperature, LOINC: 7 / 6 |
| G. Body map | 3 | D-76 extends the original 21 regions with front neck, back of neck, and perineum. The resulting 24 retain ClinBridge's original IDs and subdivisions. See [P-01](proposals/P-01-body-map-regions.md) for the differences from Stitch. |
| H. Handover | 1 | Dual nurse sign-off / custody PIN: 7 (no approved policy) |
| I. Offline, System Down, practice outage, restart, Back Online, worklist | 1 | Live-verified 22 Nov (`docs/LIVE_TEST_RESULTS_2026-11-22.md`) |
| J. Admin: readiness, staff, laptops, backup, change log, settings | 1 / 3 | Settings are read only (needs an approved settings store) |
| K. Firebase AI Logic | 1 | Unchanged by this PR |

## 5. ZIP items not built, and why (status 7)

These are explicit in the ZIP but conflict with ClinBridge's safety rules, approved clinical policy, or what a browser can do. Not built:

- **Infrastructure a web app cannot reach:**
  - P2P / Wi-Fi Direct mesh between carts, gossip replication, packet capture
  - LPR / port 9100 printing, printer telemetry
  - RFID / YubiKey / smartcard / TPM / HSM
  - UPS and battery telemetry, PTP / GPS clock sync, MAC address
  - DNS, mTLS and endpoint probes in the clearance gate
  - Pyxis cabinet concordance, fridge and courier telemetry, Mindray monitor ingest
- **Clinical scores and alerts without an approved algorithm:** NEWS2 (with escalation colours), oliguria, fluid ceilings, Morse/Braden calculators with thresholds, PRN interval locks.
- **New signature / verification policies:** physician countersignature countdowns, verbal-order logging with countersign, "Bedside verified", dual sign-off of handovers and notes, emergency PIN bypass on the lock screen.
- **SQLite WASM / OPFS:** the app uses Dexie / IndexedDB with AES-GCM encryption (built, tested, live-verified). Switching engines would mean migrating encrypted Real records; not justified.
- **Marketing claims on the landing page** (FDA, SOC 2, HIPAA, Joint Commission, testimonials): not reproduced.

## 6. Database mapping (ZIP spec field names → ClinBridge 19-table schema)

The ZIP's DATA_MAPPING tables name the same 19 tables as `src/db/schema.ts`; the field names differ. **No schema change and no migration was needed for this PR.** Every new screen reads existing fields through existing repositories (`listPatientEntries`, `loadPatient`, `slotStatuses`, `ioTotals`, `verifyChain`).

| ZIP field (spec) | ClinBridge field | Notes |
|---|---|---|
| `snapshot.snapshot_id, created_at, hash, is_frozen` | `snapshot.id, taken_at, source_system, unit, row_counts` | No freeze flag; the snapshot is replaced only by an admin import on Real records |
| `patient.patient_id, mrn, family_name, given_name, birth_date, gender` | `patient.id, mrn, family_name, given_name, birth_date, sex` | `gender` → `sex` (FHIR administrative gender values) |
| `encounter.bed_name, acuity_score, attending_physician` | `encounter.bed, attending` (+ `unit, code_status, isolation, diet`) | No acuity score (would need an approved score) |
| `allergy.substance, severity, reaction_type, snomed_code` | `allergy.substance, severity, reaction, status` | No SNOMED code field |
| `active_order.medication_name, dose, route, schedule_freq` | `active_order.drug_name, dose, dose_unit, route, frequency` | |
| `entry.entry_type, care_time, entry_time, is_corrected, original_entry_id` | `entry.type, care_time, entry_time, status ('corrected' / 'entered-in-error'), supersedes_id` | Same append-only model: the old row stays and the new row points back |
| `vital_sign.bp_systolic, bp_diastolic, heart_rate, news2_score` | same names, no `news2_score` | NEWS2 not computed (status 7) |
| `med_admin.status, dose_given, admin_time, witness_practitioner_id` | `med_admin.event, dose_given, entry.care_time, double_checked_by` | |
| `intake_output.category, fluid_type, volume_ml, route` | `intake_output.direction, category, volume_ml, method, start_time, end_time` | |
| `note.category, narrative, body_site_id` | `note.category, text, score_name, score_value` | `body_site` is proposal P-03, not applied |
| `lab_event.test_name, result_value, units, flag_critical` | `lab_event.test_name, value_num / value_text, unit, status = 'critical'` (+ `called_to, read_back`) | |
| `worklist_item.discrepancy_type, source_ai, nurse_confirmed` | `worklist_item.flags, second_look_status, second_look_reading, signed_off_by` | |
| `handoff.outgoing_nurse_id, incoming_nurse_id, sbar_notes` | `handoff.created_by, situation, background, assessment, open_items, source_entry_ids` | No incoming-nurse signature (status 7) |
| `audit_log.seq_id, prev_hash, entry_hash, action_payload` | `audit_log.seq, prev_row_hash, after_hash, before_hash, action, entity` | SHA-256 chain, verified by `verifyChain` |
| `key_store.key_id, public_key, status` | `key_store` (wrapped data key, KDF parameters) | Symmetric vault key, not ECDSA key pairs |

Encryption at rest, index-field authentication, the audit chain and FHIR export are untouched. The existing migration path (DB v1 → v2, safety copy first) is unchanged.

## 7. Visual comparison

The ZIP's design tokens (`DESIGN.md`) are the ones the app already uses: navy `#1C2536` rail, `#F8F9FB` canvas, white 1px-bordered cards, 220px sidebar, Inter, tabular figures. Differences that remain:
- Sidebar items are 36px high with 14px labels (DESIGN.md); the ZIP's unit header and mesh status footer are not shown, because there is no mesh.
- The history page uses an 8/4 column grid like the ZIP. The ZIP's large per-card vital tiles appear only when a card is expanded.
- SpO₂ trend added in PR #14 (no target line, unlike the ZIP's dashed baseline).
- The ZIP top bar's "P2P mesh", "pending sync" and shift timer are not shown; the app's header shows mode, patient-list age, clock, laptop and user.
