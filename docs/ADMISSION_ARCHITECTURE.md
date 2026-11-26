# Admission, provisional registration and patient lifecycle

Added 26 Nov 2026 (owner-approved). **Practice only, fictional patients, prototype policy.** ClinBridge is not a hospital registration system, not a master patient index and not certified for real patients.

## The problem it solves

A hospital imports its patient list, then the EHR goes down. A patient who arrives after that is not on the list. Before this change ClinBridge could not record that patient, so nurses would have had to keep separate paper records for exactly the patients who arrive during the outage. Now admission staff register the patient, or a nurse registers a provisional record during System Down, and the existing nursing workflows continue for that patient.

## Roles and permissions

| Role (`Role` in `src/db/schema.ts`) | May | May not |
|---|---|---|
| `admission` (Admission staff, new) | Register Practice patients, assign beds, record transfers and discharges, identity reconciliation steps, allergy status of locally registered patients | Chart, give or record medicines, prescribe, open nursing records, write handovers, downtime or cloud settings, staff accounts |
| `RN` | Everything before, plus: provisional registration **during System Down only**, transfer, discharge, identity steps, allergy assessment | Official (admissions) registration |
| `LPN` | Everything before | Registration, transfer, discharge, identity steps (no policy for it) |
| `admin` | Everything before; admission actions only as an **override with a written reason** (audited as `admin_override`) | Provisional registration (a nurse's step); charting as before |

Where it is enforced:

- **Repository** (`src/db/repos/admission.ts`, `requireActor`): every action reads the signed-in account from the database again (active, not waiting for activation, role, and for provisional registration the current phase). A deactivated account or a stale session cannot act; a direct call cannot skip the check.
- `createEntry` and `createHandoff` refuse an Admission Staff account and a discharged stay. Lifecycle records cannot be fixed or crossed out through the record pages.
- **Routes** (`src/App.tsx`): an Admission Staff session can only open `/admission/*`; any other address, typed or not, goes back to `/admission`. `/ward/register` is RN only. The screens ask `mayDo()` (`src/lib/admission.ts`) only to decide what to show.
- Settings: `src/config/admissionPolicy.ts` (`approved: false`). These are prototype policies that need institutional approval before real use.

Practice account: **Leila Marquez, Admission staff**, PIN 2468 (public, fictional). It is added once by `ensurePracticeAdmissionStaff` after unlock (older installations) and after a Practice reset; idempotent, audited (`practice_staff_added`), never re-added when an admin switched it off, never added to Real records. Nothing is reseeded.

## Workflows

**Admission staff: Register Practice Patient** (`/admission/register`). Generated fictional identity ("Generate another"), admission time (last 72 h, not future), type, reason from a Practice list, free bed, responsible nurse (active RN or none), allergy status, optional Practice medication scenario. A review page, then save. After saving: view admission details, back to the list, register another. Saving does **not** verify the patient for nursing care.

**Nurse: Add Provisional Practice Patient** (ward board, `/ward/register`, RN, System Down only). Same form and the same repository function; origin `nurse_provisional`; the text explains why the record is local and that admissions reconcile it later. After saving: open the nursing record (through the patient check) or go back to the ward.

**Transfer** (stay page: `/admission/patients/:id` or `/patients/:id/stay`). A free bed of the same unit, a reason from a list, a time, and the acknowledgement that recording is not the clinical decision. One transaction closes the old location, opens the new one, updates the bed, writes a lifecycle record and audit rows. The page sends the bed it showed (`fromBed`); if the patient was moved meanwhile, the transfer is refused instead of moving the patient twice. Transfers to other units are not in this version.

**Discharge**. Destination and reason from lists, time, review of outstanding documentation: **unconfirmed drafts block** the discharge (they would be left behind); scheduled doses without a record and recovery items not signed off must be acknowledged, with the words "This acknowledgement is not an instruction to omit any treatment". The stay becomes `discharged`, the bed is free, every record stays readable, new records on the stay are refused. Readmission is not in this version.

**Identity reconciliation**. A person records a step: "under review", and after the network is cleared "reconciled", which needs the note "Matched to a hospital record by admissions". ClinBridge never compares names or dates of birth, never merges patients, never marks an identity reconciled by itself, and the network coming back changes nothing.

**Allergy assessment**. For a locally registered patient whose status is unknown or not yet assessed: documented (allergens and reactions from lists), no known allergies, or unknown. Once only.

## Data model (database version 3)

No new table, no new index. All new fields are optional and **not indexed**, so they are inside the encrypted part of each row (AES-256-GCM, same middleware). Rows from before version 3 stay valid: absent fields mean "from the patient list, active stay".

| Where | Field | Meaning |
|---|---|---|
| `patient` | `origin` | `hospital_list`, `practice_seed`, `admission_registered`, `nurse_provisional` (absent = list) |
| `patient` | `identifier_kind` | `hospital_mrn` or `local_temporary`. The temporary ID (`PX-000001`) is stored in `mrn` so search, the patient check and uniqueness work unchanged, but it is always labelled "Temporary ID", never "MRN" |
| `patient` | `identity_status` | `not_required`, `pending_verification`, `under_review`, `reconciled` |
| `patient` | `allergy_status` | `documented`, `none_known`, `unknown`, `not_assessed`. An empty allergy list is never read as "no known allergies" |
| `encounter` | `status` | `active` or `discharged` (absent = active) |
| `encounter` | `admission_type`, `admit_reason`, `room`, `responsible_nurse_id` | admission details |
| `encounter` | `location_history` | every location `{unit, room, bed, from, to}`, appended, never rewritten |
| `encounter` | `discharge_time`, `discharge_destination`, `discharge_reason` | discharge |
| `practitioner` | `role: 'admission'` | new role value |

Patient-level facts (identity, allergy status) are on `patient`; stay facts on `encounter`.

**Current stay** (`currentEncounter`): the active stay (newest admission if there were two), else the newest discharged stay. Used by charting, the patient pages and recovery instead of "whichever row comes first".

**Plain index fields**: the temporary ID is in the `mrn` index like every MRN (needed for lookups and the uniqueness check). The ID is local, sequential and fictional in Practice.

### Transactions

Registration writes patient, stay, allergies, optional orders, one lifecycle record (an ordinary append-only `note` with category `admission`) and its audit rows in **one** IndexedDB transaction. Inside that transaction it checks again that the temporary ID is unused (identifier index) and that no active stay is in the bed. IndexedDB runs read-write transactions on the same stores one after another, also across browser tabs, so two registrations can never get the same ID or bed; a changed audit head starts a fresh attempt. A failure anywhere leaves nothing behind (tested by forcing a write to fail). Transfer, discharge, identity and allergy steps follow the same pattern.

### Audit

New actions: `patient_registered`, `patient_registered_provisional`, `bed_assigned`, `practice_orders_added`, `patient_transferred`, `patient_discharged`, `identity_reviewed`, `allergy_status_recorded`, `admin_override`, `practice_staff_added`, `practice_reset`, plus the usual `entry_saved_raw`/`entry_confirmed` of each lifecycle record. Same SHA-256 chain; values are stored as hashes only. Nothing is written to the console, analytics or the cloud.

### Version safety and rollback

Dexie 4 opens a database that a newer build upgraded, so the version number alone does not protect an older build. From version 3 on, `openWithMigration` refuses a database whose version is higher than the build's own (`NewerDatabaseError`, nothing changed).

**Builds before version 3 (the live website of 24/25 Nov 2026) do not have that check.** If such a build opened a version 3 Practice database it would show discharged patients as still in a bed, show temporary IDs as MRNs and let anyone chart on closed stays. Therefore:

- **Never roll the website back to a build before version 3.** If the new release has a problem, deploy a fixed newer build.
- If it happened anyway: deploy the version 3 build again; installed apps take it after all ClinBridge windows are closed. The records were not deleted; records charted in the meantime on closed stays stay in the history.
- A safety copy of the version 2 database is kept in `downtimekit-backups` before the upgrade (as for every schema upgrade).
- Real records are not affected: nothing new is written there.

## Integration

| Area | Registered patient |
|---|---|
| Ward board | appears at once (live query); filters Registered here, Provisional, Pending reconciliation, Discharged (shown when not empty); census counts active stays only |
| Search, patient check | by name, temporary ID or bed; the check shows "Temporary ID" and, for provisional patients, a warning |
| Vitals, notes, fluids, labs, body map, paper photo | existing pages and repositories, unchanged |
| Medicines | only with orders. The optional **Practice medication scenario** copies reviewed, non-high-alert orders of the fictional list (`ordered_by` says "Practice scenario (fictional, not a prescription)"). Existing safeguards (second nurse, dose locks) apply |
| Allergies | four states on banner, ward card, medicine form, orders, paper forms, handover, reports |
| Handwritten reports, paper forms, SBAR | work; the admission reason appears where the sheet has a field for it |
| Recovery worklist | lifecycle records written during the downtime get the category "Admission and identity", ranked first; a provisional identity not yet reconciled is flagged "Recheck". The item page shows the temporary ID, origin, location and status, and links to the reconciliation step |
| FHIR R4 | temporary ID as `identifier` with `use: temp` and a ClinBridge namespace, never type MR; Encounter with `status` `finished` and `period.end` after discharge, `location[]` with each bed and its period, `reasonCode`, `type`, responsible nurse as `participant`, `hospitalization.dischargeDisposition`; patient meta tags `registered-locally`, `provisional-identity`, `identity-reconciliation-pending`; lifecycle records as DocumentReference "Stay record: …". A file, not an EHR connection |
| Patient list check | counts only list patients against the list's numbers; registered patients are listed apart, so an eleventh patient is not a failed check |
| Device vs Cloud | registered patients are left out: the benchmark stays the reviewed Practice list and their data never goes to the cloud from there |
| Practice reset | removes registered patients and their records (the dialog says so), restores the Admission Staff account, logs `practice_reset` |

## Offline

No step uses Firebase, a remote API, the network or any AI. Tested in the judge build with the website stopped and the browser offline: sign-in, registration, search, charting, provisional registration, transfer, discharge, restart, then clearance, recovery, reconciliation and the FHIR file (`e2e-judge/admission.spec.ts`).

## Future work (not implemented)

- **Real records**: registration would need the hospital's own numbering, an approved identity procedure, a second check, and a way to send registrations back to the hospital's master patient index. The repository refuses Real records today.
- Readmission, transfers to other units or hospitals, late entries after discharge, correction of a lifecycle record.
- **Android app** (not changed in this phase): the same roles and repository rules, the same optional fields (its SQLCipher schema would need a version step), the same ward filters and stay page, and the same FHIR mapping. The mobile app must also refuse a newer database.
