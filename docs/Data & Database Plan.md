# Data & Database Plan

DowntimeKit needs **19 tables**. They hold three things: a read-only snapshot taken before the outage, what nurses write during it, and the back-entry work after it. Every table comes from the real paper forms and downtime tools below, and every clinical row maps to a FHIR R4 resource so it can be exported later. Section 8 has the final field list, and section 8.1 checks it against the new Gemini features.

## 1. What downtime paper charting captures

Hospitals don't invent forms during an outage. Every unit keeps a downtime kit with pre-approved paper forms, and those forms tell us exactly what data must be captured. The ANIA nursing downtime toolkit says only forms approved by the hospital's forms committee are used ([ANIA/VUMC](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf)).

**The forms that appear across hospitals, and what each records:**

| Paper form | Fields it records | Seen at |
| --- | --- | --- |
| Patient label / registration | Name, DOB, MRN, encounter number (FIN/CSN), location. Every form must carry a label or the same details handwritten | [ANIA](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf), [Health PEI](https://src.healthpei.ca/sites/src.healthpei.ca/files/CIS/Downtime%20Procedures/724_Access_%20Downtime_%20Viewer_%20May_%202025.pdf) |
| Vital signs flowsheet | Date/time, temperature, heart rate, BP, respiratory rate, SpO2, pain score, height/weight, blood sugar, nurse initials. Also used for restraint and close-observation checks | [Health PEI](https://src.healthpei.ca/sites/src.healthpei.ca/files/CIS/Downtime%20Procedures/724_Access_%20Downtime_%20Viewer_%20May_%202025.pdf), [NLN chart](https://www.atsu.edu/pdf/Hospital-Care-Nursing-Notes-Day-1.pdf) |
| Downtime MAR (printed or blank) | Allergies at the top; per drug: order date, medication, dose, route, frequency, hours due, date/time given, injection site, nurse initials + signature key. Separate sections for scheduled, PRN and continuous/insulin | [NLN chart](https://www.atsu.edu/pdf/Hospital-Care-Nursing-Notes-Day-1.pdf), [SPHP](https://www.sphp.com/sites/default/files/hg_features/mercury_standard_layout/aa49ab0f532d6985e94bc550c7e00f14.pdf) |
| Intake & output bedside sheet | Per shift: intake (oral, tube feed, IV, IVPB, other) and output (urine, emesis, NG, drains, other), shift totals | [NLN chart](https://www.atsu.edu/pdf/Hospital-Care-Nursing-Notes-Day-1.pdf) |
| Nursing note / progress note | Free-text narrative, special precautions, PRN meds given, meal % eaten | [ICANotes downtime form](https://help.icanotes.com/portal/en/kb/articles/downtime-form-nursing-note-icanotes) |
| Admission assessment & history | Allergies, home medications, immunizations, history, admission assessment, vitals | [ANIA](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf), [Downtime Admission Health History](https://opentextbc.ca/wp-content/uploads/sites/532/2026/10/Downtime-Admission-Health-History.pdf) |
| Medication reconciliation | Home meds list, allergies | [Health PEI](https://src.healthpei.ca/sites/src.healthpei.ca/files/CIS/Downtime%20Procedures/724_Access_%20Downtime_%20Viewer_%20May_%202025.pdf) |
| Physician order form | Handwritten orders (meds, labs, imaging, diet, code status); consultant notes on the right-hand side | [Health PEI](https://src.healthpei.ca/sites/src.healthpei.ca/files/CIS/Downtime%20Procedures/724_Access_%20Downtime_%20Viewer_%20May_%202025.pdf), [Houston Methodist](https://cioquarterly.houstonmethodist.org/?p=4951) |
| Lab / imaging requisitions | Test ordered, ordering clinician, specimen collected time | [UToledo](https://www.utoledo.edu/policies/utmc/nursing/guidelines/general/pdfs/Guideline%20General%20-%20Computer%20downtime%20-%20nursing%20services.pdf), [ANIA](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf) |
| Risk scores | Braden (pressure injury), fall risk (e.g. Conley) | [Health PEI](https://src.healthpei.ca/sites/src.healthpei.ca/files/CIS/Downtime%20Procedures/724_Access_%20Downtime_%20Viewer_%20May_%202025.pdf) |
| Blood transfusion form | Product, unit number, start/stop times, vitals, two-person check | [Health PEI](https://src.healthpei.ca/sites/src.healthpei.ca/files/CIS/Downtime%20Procedures/724_Access_%20Downtime_%20Viewer_%20May_%202025.pdf) |
| Patient tracking (HICS 254) | Tag number, demographics, area, procedure time, disposition | [ASPR TRACIE](https://asprtracie.hhs.gov/documents/aspr-tracie-ta-paper-based-hospital-records-073117-508.pdf) |

**Rules that shape the database:**

- **Two identifiers.** The Joint Commission requires at least two patient identifiers (e.g. name and DOB) before giving medicines or blood, collecting specimens or doing procedures, and never the room number ([Joint Commission NPSG 2025](https://digitalassets.jointcommission.org/api/public/content/9be383450fc941df806b76c5fbdd9ae6)). So every entry needs a verified patient link, and the bed is only a location, never an identifier.
- **Downtime meds must be back-entered** to avoid double dosing ([ANIA](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf)). That makes medication administration the top-priority table.
- **Proxy entry is logged.** If the nurse who documented isn't there, the record says who gave it and who entered it ([ANIA](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf)). ASPR TRACIE adds a note whenever someone other than the original author enters the data ([ASPR TRACIE](https://asprtracie.hhs.gov/documents/aspr-tracie-ta-paper-based-hospital-records-073117-508.pdf)).
- **The downtime window is recorded** ("System down" start and end) so reviewers know paper may exist ([ANIA](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf)).
- **Forms should match the EHR layout** so re-entry is easy ([ASPR TRACIE](https://asprtracie.hhs.gov/documents/aspr-tracie-ta-paper-based-hospital-records-073117-508.pdf)). Our fields follow the EHR's field names, not the paper's.

## 2. What existing downtime software holds

The big EHRs all ship a read-only downtime viewer, and they agree on the core data: **census, allergies, active orders, the MAR, recent results and vitals**. That set is our pre-outage snapshot. None of them let nurses write anything new, which is the gap DowntimeKit fills.

| Tool | What it shows per patient | Refresh | Source |
| --- | --- | --- | --- |
| Epic BCA (PC / Web) | Census; clinical summary with active orders, recent results and vitals; a printable downtime MAR per patient; respiratory summary | Every 15–30 min | [Houston Methodist](https://it.houstonmethodist.org/downtime/), [SPHP](https://www.sphp.com/sites/default/files/hg_features/mercury_standard_layout/aa49ab0f532d6985e94bc550c7e00f14.pdf) |
| Epic BCA MAR report | Scheduled, continuous and PRN meds; administrations from the past 3 days and doses scheduled for the next 24 hours | 30 min | [SPHP Willow](https://sphp.com/sites/default/files/hg_features/mercury_standard_layout/f27ed644db8008fed5214c45e0a6cb8a.pdf) |
| Epic BCA Rx Med Profile | Relevant results, allergies, all medications | 30 min | [SPHP Willow](https://sphp.com/sites/default/files/hg_features/mercury_standard_layout/f27ed644db8008fed5214c45e0a6cb8a.pdf) |
| Epic BCA ED census | Name, age, sex, MRN, CSN, bed, chief complaint, disposition, last vitals, treatment team | 15 min | [SPHP](https://www.sphp.com/sites/default/files/hg_features/mercury_standard_layout/aa49ab0f532d6985e94bc550c7e00f14.pdf) |
| Oracle Health 724Access Downtime Viewer | Patient list by unit (location, name, MRN, FIN); allergies; lab results (3 days); patient care results; MAR incl. PRN, unscheduled and infusions; orders; vitals (3 days); signed documents; intake & output (3 days); medication profile with home meds; immunizations | Current encounter | [Health PEI](https://src.healthpei.ca/sites/src.healthpei.ca/files/CIS/Downtime%20Procedures/724_Access_%20Downtime_%20Viewer_%20May_%202025.pdf), [Oracle](https://www.oracle.com/uk/corporate/accessibility/templates/t2-16273.html) |
| BCS Downtime Viewer (Shared Health MB) | Patient list (name, visit type, MRN, visit ID, DOB, location, admit time, provider); orders (name, date, status, stop date, requested by); results (value + reference range); documents; prescriptions; flowsheets (vitals, assessments); health issues; allergies; eMAR | — | [Shared Health](https://healthproviders.sharedhealthmb.ca/files/epr-bcs-downtime-viewer.pdf) |

**What hospitals must re-enter after downtime** (Health PEI's list): home medications, medication orders, patient care orders (diet, code status, allergies), IV fluid orders, lab/imaging orders, admit/transfer/discharge, height and weight ([Health PEI](https://src.healthpei.ca/sites/src.healthpei.ca/files/CIS/Downtime%20Procedures/724_Access_%20Downtime_%20Viewer_%20May_%202025.pdf)). ANIA adds allergies, immunizations, history, admission assessment and vitals for outages over 2 hours or across a shift change ([ANIA](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf)). These become the worklist categories.

**For backload planning** ANIA lists: unit census, patients going home in 12 hours, patients admitted during downtime, and hours the system was down. It also lists dispensing-cabinet reports to reconcile against the paper MAR ([ANIA](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf)).

## 3. The datasets DowntimeKit needs

The 19 tables fall into four groups. The **snapshot** is loaded before an outage and never edited. **Capture** tables are append-only: a correction adds a new row that points at the old one. **Recovery** tables are built after the network is cleared, and **security** tables protect everything else.

*The research in section 7 adds fields and renames to these tables. Build from the final field list in section 8.*

**A. Snapshot (read-only, copied from the EHR's downtime report before the outage)**

| # | Table | Key fields | Why |
| --- | --- | --- | --- |
| 1 | `snapshot` | id, taken\_at, source system, unit, row counts | Drives the "snapshot is X hours old" banner (B4) |
| 2 | `patient` | id, MRN, family name, given name, DOB, sex, wristband barcode | Two identifiers before any entry (B2, Joint Commission) |
| 3 | `encounter` | id, patient\_id, FIN/CSN, unit, room/bed, admit time, attending, code status, diet, isolation, height, weight | Census row; bed is a location only, never an identifier |
| 4 | `allergy` | id, patient\_id, substance, reaction, severity, status | Shown on every MAR and med entry |
| 5 | `active_order` | id, encounter\_id, type (med / lab / imaging / diet / nursing / IV), text, drug, dose, unit, route, frequency, scheduled times, PRN flag, start, stop, ordered\_by | The downtime MAR schedule and the pending-labs list come from here |
| 6 | `snapshot_result` | id, patient\_id, kind (lab / vital / I&O), code, value, unit, reference range, time | Last known values to compare against (BCA shows 3 days) |

**B. Context (who, where, when)**

| # | Table | Key fields | Why |
| --- | --- | --- | --- |
| 7 | `staff_user` | id, name, initials, role (RN, LPN, admin), PIN hash, active | Initials on every entry, like the paper signature key |
| 8 | `device` | id, label, unit, last good clock sync, model status | Device stamp (A7) and clock checks (A9) |
| 9 | `downtime_event` | id, declared\_at, declared\_by, network\_cleared\_at, cleared\_by, ended\_at | The "System down" window ANIA asks to record; gates Recovery |

**C. Capture (append-only, written during the outage)**

| # | Table | Key fields | Why |
| --- | --- | --- | --- |
| 10 | `entry` | id, type, patient\_id, encounter\_id, care\_time, entry\_time, monotonic counter, device\_id, author\_id, entered\_by\_id (proxy), raw\_input (text or photo ref), ai\_proposal JSON, inference\_source, confirmed JSON, confirmed\_by, confirmed\_at, status (draft / confirmed / corrected / entered-in-error), supersedes\_id | One header for every record: save-first (A5), AI vs nurse (B1, C3), proxy entry (ANIA) |
| 11 | `vital_sign` | entry\_id, temp, HR, RR, BP sys/dia, SpO2, O2 device + flow, pain 0–10, glucose, LOC, weight | Vital signs flowsheet |
| 12 | `med_admin` | entry\_id, order\_id (nullable), drug, dose value, dose unit, route, site, rate, status (given / held / refused / not-given), reason, high-alert double-check by, witness | Downtime MAR; top back-entry priority to stop double dosing |
| 13 | `intake_output` | entry\_id, direction (in / out), category (oral, tube, IV, IVPB, urine, emesis, NG, drain, other), volume mL, period start/end | I&O bedside sheet |
| 14 | `clinical_note` | entry\_id, category (assessment, intervention, communication, risk score, restraint check, other), text, score name + value (Braden, falls) | Nursing note, assessments and risk forms |
| 15 | `lab_event` | entry\_id, order\_id, test name, status (pending / collected / resulted / critical), value, collected\_at, called\_to, read\_back | Pending labs and critical-result log (B3) |

**D. Recovery and security**

| # | Table | Key fields | Why |
| --- | --- | --- | --- |
| 16 | `worklist_item` | id, entry\_id, patient\_id, category (meds, allergies, orders, results, vitals, I&O, notes), priority score, flags (duplicate / time\_conflict / missing\_field), billable, assigned\_to, signed\_off\_by, signed\_off\_at, exported\_at | Back-entry list (E1, E2, E4) |
| 17 | `handoff` | id, patient\_id, shift, situation, background, assessment, open items, source entry ids, created\_by | Shift handoff built only from confirmed entries (B6) |
| 18 | `audit_log` | seq, time, user, device, action, entity, before/after hash, previous-row hash | Tamper-evident trail (C3) |
| 19 | `key_store` | data key wrapped by the nurse PIN, same key wrapped by the admin recovery key, created\_at, rotated\_at | Envelope encryption (C1, C5) |

**Not stored on the device:** photos of paper forms after Recovery sign-off (kept until then so the nurse can check them), passwords in plain text, and anything from outside the unit's own census.

## 4. Standards and codes

Every clinical table maps to one FHIR R4 resource, so Recovery can export a standard bundle the hospital's EHR team can load. Vitals use LOINC codes and UCUM units, as the FHIR vital-signs profile requires ([FHIR vital signs](https://build.fhir.org/observation-vitalsigns.html)).

**Table → FHIR R4 resource**

| Our table | FHIR R4 resource | Note |
| --- | --- | --- |
| `patient` | Patient | MRN as identifier |
| `encounter` | Encounter | Location = unit + bed |
| `allergy` | AllergyIntolerance |  |
| `active_order` (med) | MedicationRequest |  |
| `active_order` (lab, imaging, nursing) | ServiceRequest |  |
| `vital_sign` | Observation (category vital-signs) | One Observation per measurement; BP as one panel with two components |
| `med_admin` | [MedicationAdministration](https://hl7.org/fhir/R4/medicationadministration.html) | Status codes: completed, not-done, on-hold, stopped, entered-in-error, in-progress, unknown. Dose or rate is required |
| `intake_output` | Observation | Volume in mL |
| `clinical_note` | Observation (scores) or DocumentReference (narrative) |  |
| `lab_event` | ServiceRequest + Observation |  |
| `staff_user` | Practitioner | Performer on each administration |

**Vital-sign codes (LOINC) and units (UCUM)**

| Measurement | LOINC | Unit |
| --- | --- | --- |
| Vital signs panel (groups the set) | 85353-1 | — |
| Heart rate | 8867-4 | /min |
| Respiratory rate | 9279-1 | /min |
| Body temperature | 8310-5 | Cel |
| Blood pressure panel | 85354-9 | — |
| Systolic BP | 8480-6 | mm\[Hg\] |
| Diastolic BP | 8462-4 | mm\[Hg\] |
| SpO2 by pulse oximetry | 59408-5 | % |
| Inhaled oxygen flow rate | 3151-8 | L/min |
| Body weight | 29463-7 | kg |
| Body height | 8302-2 | cm |

Codes from the [FHIR R4 vital signs value set](https://www.hl7.org/fhir/R4/valueset-observation-vitalsignresult.html) and [US Core vital signs](https://www.hl7.org/fhir/us/core/STU5/ValueSet-us-core-vital-signs.html).

**Fixed lists stored in the app (so the AI can't invent values):**

- **Dose units:** mg, mcg, g, mL, units, mmol, tablet.
- **Routes:** PO, IV, IM, SC, SL, PR, INH, TOP.
- **I&O categories:** oral, tube feed, IV, IVPB, other in; urine, emesis, NG, drain, other out (the NLN bedside sheet columns).
- **High-alert drugs:** a short list in `/shared/rules` that triggers a double-check.

**Still to pick (open questions):** LOINC codes for point-of-care glucose and the 0–10 pain score, and whether to code drugs with RxNorm in the export or send drug names as text only. Answered in section 7.4.

## 5. Database structure draft

&#91;embedded content: DowntimeKit database · 19 tables in 4 groups\]

The `entry` row is the hub: each capture table holds exactly one detail row per entry, and every entry points at a verified patient, the nurse, the device and the time. The snapshot is never written to during an outage. Recovery only reads entries a nurse has confirmed. The audit log records every write in every group, and the key store holds the keys that encrypt all of it.

**Storage on the device:** IndexedDB, one object store per table. Clinical values are encrypted with AES-GCM. The indexes stay plain: patient\_id, encounter\_id, type, care\_time and status.

## 6. Test data

No real patient data goes anywhere near the build. The snapshot comes from **Synthea**, the paper forms we make ourselves.

| Dataset | Where it comes from | What we add |
| --- | --- | --- |
| Patients, encounters, allergies, conditions, meds, vitals, labs | [Synthea](https://github.com/synthetichealth/synthea), an open-source (Apache-2.0) synthetic patient generator that outputs FHIR R4 with allergies, medications, observations/vitals and labs ([repo](https://github.com/jdmsu4/synthea)). A fixed seed gives the same patients every run | Pick 10 adult patients and convert their FHIR bundles into our `patient`, `encounter`, `allergy` and `snapshot_result` tables |
| Inpatient orders and MAR schedule | Hand-written JSON | Synthea is built around a whole lifetime of encounters, so we write the inpatient details ourselves: scheduled times, PRN flags, one high-alert drug, one IV infusion |
| Paper form photos | Printed and filled in by us | The 20 photos and ground-truth JSON from the accuracy test set (Implementation Plan, section 10) |
| Staff and devices | Hand-written JSON | 3 nurses, 1 admin, 2 devices, one with a deliberately wrong clock to test A9 |
| A downtime scenario | Script | A 9-hour outage across a shift change, with one duplicate dose and one late critical lab, so Recovery has something to flag |

## 7. Schema research: public EHR models vs our draft

Our 19-table draft holds up against the public hospital data models: nothing needs dropping, but `med_admin` and `intake_output` need more fields. Five changes, all applied in section 8:

1. **Medication records get "due vs given".** Add scheduled time, dose due beside dose given, an aligned event list (administered, not given, delayed, held, refused, stopped), infusion rate and end time. Every real MAR model has these.
2. **Fluids become timed.** Intake and output rows get start and end times, a rate, a measured/estimated flag and a link to the order.
3. **Values keep their raw form.** Store a number, the original text and a unit for every result, plus a `raw_text` column beside coded fields, as OMOP and PCORnet do.
4. **Downtime-only fields export through FHIR Provenance.** Who gave vs who typed, the source photo, the AI's part and corrections all have a home there; a tag marks every record as downtime documentation.
5. **Codes are settled.** Glucose 41653-7, pain 72514-3, routes in SNOMED CT, fluids in LOINC, drugs as text plus RxNorm when the order has one. Five small renames bring names in line with the standards.

### 7.1 Source catalogue

Twelve public models were checked, as of Nov 18, 2026. The two most useful for us are **MIMIC-IV** (it shows how a real hospital stores a MAR and fluid charts) and **FHIR R4** (our export format).

| Source | What it is / who maintains it | Access and licence | Tables or resources relevant to us |
| --- | --- | --- | --- |
| [MIMIC-IV](https://mimic.mit.edu/docs/iv/modules/hosp/emar.html) | De-identified records from Beth Israel Deaconess Medical Center, run by MIT's Laboratory for Computational Physiology via PhysioNet | Full database: credentialed users only. [Demo of 100 patients](https://www.physionet.org/content/mimic-iv-demo/): open, Open Database License v1.0, no free-text notes | `emar`, `emar_detail`, `poe`, `prescriptions`, `pharmacy`, `labevents`, `chartevents`, `inputevents`, `outputevents`, `d_items` |
| [eICU-CRD](https://eicu-crd.mit.edu/gettingstarted/overview) | ICU data from 200+ US hospitals in the Philips eICU program, via MIT + Philips eRI | Full: human-research course + data use agreement ([PhysioNet](https://physionet.org/content/eicu-crd/)). [Demo of 2,500+ unit stays](https://physionet.org/content/eicu-crd-demo/2.0/): open, ODbL v1.0 ([package note](https://rdrr.io/github/eth-mds/eicu-demo)) | `patient`, `allergy`, `medication`, `infusionDrug`, `intakeOutput`, `nurseCharting`, `nurseAssessment`, `nurseCare`, `lab`, `vitalPeriodic`, `note` ([table list](https://pmc.ncbi.nlm.nih.gov/articles/PMC6132188/table/t4)) |
| [OMOP CDM v5.4](https://data-models-service.research.chop.edu/models/omop/5.4.0) | Research data model from the OHDSI community | Open specification | `person`, `visit_occurrence`, `visit_detail`, `drug_exposure`, `measurement`, `observation`, `note`, `specimen`, `provider`, `care_site` |
| HL7 FHIR R4 / US Core | Exchange standard from HL7 | Open specification | Patient, Encounter, AllergyIntolerance, MedicationRequest, ServiceRequest, Observation, [MedicationAdministration](https://hl7.org/fhir/R4/medicationadministration.html), DocumentReference, Practitioner, [Provenance](https://hl7.org/fhir/R4/provenance.html) |
| [openEHR archetypes](https://ckm.openehr.org/ckm/archetypes/1013.1.123) | Clinical models in the openEHR Clinical Knowledge Manager, openEHR Foundation | Open; the medication archetype is CC BY-SA 4.0 | ACTION.medication, [OBSERVATION.fluid\_input](https://ckm.openehr.org/ckm/archetypes/1013.1.1671), [OBSERVATION.fluid\_output](https://ckm.openehr.org/ckm/archetypes/1013.1.1683), [OBSERVATION.fluid\_balance](https://ckm.openehr.org/ckm/archetypes/1013.1.1682), OBSERVATION.blood\_pressure |
| [PCORnet CDM v7.0](https://data-models-service.research.chop.edu/models/pcornet/7.0.0) | US research network data model | Public specification (licence terms not confirmed) | `demographic`, `encounter`, `med_admin`, `prescribing`, `vital`, `obs_clin`, `lab_result_cm` |
| [i2b2](https://i2b2.atlassian.net/wiki/spaces/BUN/pages/207290415/2.+Quick+Start+Guide) | Open-source analytics platform with a star schema | Open source (exact licence not confirmed) | `observation_fact` at the centre; `patient_dimension`, `visit_dimension`, `concept_dimension`, `provider_dimension`, `modifier_dimension` |
| [Synthea](https://github.com/synthetichealth/synthea/wiki/CSV-File-Data-Dictionary) | Synthetic patient generator from MITRE | Open source, Apache-2.0; fully synthetic | `patients.csv`, `encounters.csv`, `allergies.csv`, `medications.csv`, `observations.csv`, `providers.csv`; FHIR R4 bundles |
| [OpenMRS](https://openmrs.atlassian.net/wiki/spaces/docs/pages/25476856) | Open-source medical record system used worldwide | Open source (exact licence not confirmed here) | `patient`, `visit`, `encounter`, `obs`, `orders`, `drug_order`, `concept` |
| [VistA (US Veterans Affairs)](https://vistapedia.com/index.php/Where_does_the_pharmacy_data_get_stored_in_the_database) | The VA's hospital system; file definitions are published | Public documentation | PATIENT file (#2), BCMA MEDICATION LOG (#53.79), BCMA MEDICATION VARIANCE LOG (#53.78), BCMA UNABLE TO SCAN LOG (#53.77), MEDICATION ROUTES (#51.2), DOSE UNITS (#51.24) |
| [ABDM FHIR guide (India)](https://www.nrces.in/ndhm/fhir/r4/profiles.html) | India's national health data standard, published by NRCeS for the National Health Authority | Open | FHIR R4 profiles: DischargeSummaryRecord, OPConsultRecord, AllergyIntolerance, MedicationRequest, ObservationVitalSigns |
| [HL7 v2 RAS^O17](https://hl7.eu/refactored/msgRAS_O17.html) | The message real hospital systems send for each medication administration | Open standard | RXA segment: start and end time of administration, administered code, amount, units, system entry time ([RXA fields](https://www.hl7.eu/HL7v2x/v24/hl7v24segmRXA.htm)) |

**Not found:** a published Pakistani national EHR data standard, and public Epic or Oracle Health table-level schemas. Their downtime report contents are in section 2.

### 7.2 Comparison matrix

Every clinical table of ours has a match in at least three of the five models, so the draft's shape is sound. The seven tables with no match anywhere are the downtime-specific ones, which is expected.

| Our table | MIMIC-IV | OMOP v5.4 | FHIR R4 | openEHR | Synthea |
| --- | --- | --- | --- | --- | --- |
| `snapshot` | none | none | Bundle (with a timestamp) | none | none |
| `patient` | `patients` (subject\_id) | `person` | Patient | (EHR subject, not an archetype) | `patients.csv` |
| `encounter` | `admissions` (hadm\_id), ICU stay (stay\_id) | `visit_occurrence`, `visit_detail` | Encounter | none | `encounters.csv` |
| `allergy` | none in the tables reviewed | `observation` (FHIR-to-OMOP maps allergies there) | AllergyIntolerance | not checked | `allergies.csv` |
| `active_order` | `poe`, `prescriptions`, `pharmacy` | `drug_exposure` (orders aren't separate) | MedicationRequest, ServiceRequest | INSTRUCTION.medication\_order | `medications.csv` (RxNorm code) |
| `snapshot_result` | `labevents`, `chartevents` | `measurement` | Observation | OBSERVATION archetypes | `observations.csv` |
| `staff_user` | caregiver\_id, enter\_provider\_id | `provider` | Practitioner | none | `providers.csv` |
| `device` | none | none | Device | none | none |
| `downtime_event` | none | none | none | none | none |
| `entry` (hub) | charttime + storetime + caregiver\_id on every event row | `*_datetime`, `provider_id`, `*_source_value` on every event row | effective\[x\] + Provenance | ENTRY (time, provider) | none |
| `vital_sign` | `chartevents`: itemid, value, valuenum, valueuom, warning | `measurement`: value\_as\_number, unit\_concept\_id, range\_low/high | Observation (vital-signs, LOINC) | OBSERVATION.blood\_pressure and similar | `observations.csv` |
| `med_admin` | `emar`: charttime, scheduletime, storetime, medication, event\_txt. `emar_detail`: dose\_due, dose\_given, units, infusion\_rate, route, site | `drug_exposure`: start/end datetime, quantity, route\_concept\_id, stop\_reason | MedicationAdministration | ACTION.medication: dose administered / omitted / deferred / aborted | FHIR export only; route not supported natively |
| `intake_output` | `inputevents`: starttime, endtime, amount, rate, units, linkorderid. `outputevents`: charttime, value, valueuom | `measurement` | Observation | OBSERVATION.fluid\_input, fluid\_output, fluid\_balance | none found |
| `clinical_note` | Notes are excluded from the open demo | `note`: note\_text, note\_title, note\_datetime | DocumentReference; Observation for scores | not checked | none |
| `lab_event` | `labevents` | `measurement`, `specimen` | ServiceRequest + Observation | not checked | `observations.csv` |
| `worklist_item` | none | none | Task (possible fit, not verified) | none | none |
| `handoff` | none | `note` | Composition or DocumentReference | not checked | none |
| `audit_log` | none | none | AuditEvent, Provenance | none | none |
| `key_store` | none | none | none | none | none |

Sources: MIMIC-IV [emar](https://mimic.mit.edu/docs/iv/modules/hosp/emar.html), [emar\_detail](https://mimic.mit.edu/docs/iv/modules/hosp/emar_detail), [chartevents](https://mimic.mit.edu/docs/iv/modules/icu/chartevents/), [inputevents](https://mimic.mit.edu/docs/iv/modules/icu/inputevents/), [outputevents](https://mimic.mit.edu/docs/iv/modules/icu/outputevents/) · [OMOP v5.4 fields](https://data-models-service.research.chop.edu/models/omop/5.4.0) · [FHIR-to-OMOP guide](https://build.fhir.org/ig/HL7/fhir-omop-ig/en/toc.html) · [openEHR medication archetype](https://ckm.openehr.org/ckm/archetypes/1013.1.123) · [Synthea CSV dictionary](https://github.com/synthetichealth/synthea/wiki/CSV-File-Data-Dictionary) · [Synthea route discussion](https://github.com/synthetichealth/synthea/discussions/1423). "Not checked" means I didn't open a page that confirms it.

### 7.3 Gap analysis

The biggest gap is in `med_admin`: real MAR tables record what was **due** and what was **given** separately, plus the scheduled time and the infusion rate. Our draft had only what was given.

**Fields the standards have that we're missing**

| Add to | Field(s) | Who has it | Why we need it |
| --- | --- | --- | --- |
| `med_admin` | `scheduled_time` | MIMIC `emar.scheduletime`; openEHR "original scheduled date/time" | Shows late and missed doses; lets Recovery match a dose to its MAR slot |
| `med_admin` | `dose_due`, `dose_due_unit` beside `dose_given`, `dose_given_unit` | MIMIC `emar_detail` | A partial dose is a safety event; MIMIC even has `complete_dose_not_given` |
| `med_admin` | `event` list: administered, not given, delayed, held, refused, stopped | MIMIC `event_txt` (Administered, Applied, Confirmed, Delayed, Not Given); openEHR dose administered / omitted / deferred / aborted; FHIR status codes | Our four statuses were close; align the words |
| `med_admin` | `infusion_rate`, `infusion_rate_unit`, `prior_infusion_rate`, `rate_change_reason` | MIMIC `emar_detail`; MIMIC `inputevents.rate`, `originalrate`, `statusdescription` | IV drips change rate; one "dose" field can't hold that |
| `med_admin` | `end_time` | HL7 v2 RXA start + end of administration; OMOP `drug_exposure_end_datetime`; PCORnet `medadmin_stop_time` | Infusions have a duration |
| `med_admin` | `double_checked` (yes/no) | openEHR "Double-checked?" | We had a checker's name; keep both |
| `intake_output` | `start_time`, `end_time`, `rate`, `rate_unit`, `order_id`, `method` (measured / estimated) | MIMIC `inputevents`; openEHR fluid archetypes ("Measured") | An IV bag runs over hours and links to an order |
| `vital_sign`, `lab_event`, `snapshot_result` | `value_num` + `value_text` + `unit`, `range_low`, `range_high`, `abnormal_flag` | MIMIC `value` / `valuenum` / `valueuom` / `warning`; OMOP `range_low` / `range_high`; PCORnet `abn_ind` | Some values aren't numbers ("<10", "trace") |
| `lab_event` | `specimen_time`, `specimen_source`, `result_time`, `order_time` | PCORnet `lab_result_cm`; OMOP `specimen` | Collected time and result time differ, and it matters for back-entry |
| every capture table | `raw_*` source text beside each coded value | OMOP `*_source_value`; PCORnet `raw_*` | Keep exactly what the nurse or the paper said next to the code |
| `entry` | timestamps with UTC offset; `scheduled_time` kept separate from `care_time` and `entry_time` | MIMIC charttime / storetime / scheduletime; HL7 v2 "system entry date/time" | The three-clock pattern is standard. We already had two of the three |
| `active_order` | `status`, `status_time` | BCS viewer shows order status and stop date | Orders get stopped or held before the outage |

**Fields we have that no standard has, and how to export them**

| Our field | Carry it in the FHIR bundle as |
| --- | --- |
| `author_id` vs `entered_by_id` (proxy entry) | A [Provenance](https://hl7.org/fhir/R4/provenance.html) resource per entry with two agents (who performed, who entered) and `onBehalfOf`. Check the exact agent-type codes before coding |
| `raw_input` (text or photo) | Provenance `entity` with role `source`, pointing at a DocumentReference that holds the photo or text |
| `ai_proposal`, `inference_source` | Provenance agent of type Device for the model, plus a local extension for on-device vs cloud. Don't export the proposal itself, only the confirmed value |
| `supersedes_id` | Provenance `entity` with role `revision`; the old resource gets status `entered-in-error` |
| `care_time` vs `entry_time` | `effectiveDateTime` on the resource; `Provenance.occurred` and `Provenance.recorded` |
| device clock data, monotonic counter | Local extension on Provenance. No standard field exists |
| downtime flag | A `meta.tag` on every resource (e.g. "downtime-documentation"), plus the downtime window in a Composition or note |

**Renames to match the standards**

| Ours | Rename to | Matches |
| --- | --- | --- |
| `entry.author_id` | `performer_id` | FHIR MedicationAdministration.performer |
| `entry.entered_by_id` | `enterer_id` | Common FHIR/HL7 term for the person who keyed it in |
| `entry.care_time` / `entry_time` | keep, document as chart time / store time | MIMIC charttime / storetime |
| `clinical_note` | `note` | OMOP `note` |
| `lab_event.value` | `value_num` + `value_text` | MIMIC, OMOP |
| `staff_user` | `practitioner` | FHIR Practitioner |
| `encounter.FIN/CSN` | `encounter.visit_number` | Vendor-neutral |

### 7.4 Open questions answered

The open questions from section 4 now have answers; three codes still need a final look-up before the export is built.

**Bedside glucose and pain score**

| Measurement | LOINC | Notes |
| --- | --- | --- |
| Glucose by glucometer, mg/dL | [41653-7](https://www.findacode.com/loinc/41653-7--glucose-bldc-glucomtr-mcnc.html) | "Glucose \[Mass/volume\] in Capillary blood by Glucometer", active |
| Glucose by glucometer, mmol/L | 14743-9 (to confirm) | It sits in the NLM [Blood Glucose value set](https://tx5.health-samurai.io/ui/vs/2.16.840.1.113762.1.4.1078.442), which also names a moles/volume glucometer code. Confirm the pairing on loinc.org. Pakistan and the US mostly use mg/dL, so 41653-7 is the default |
| Pain score 0–10 | [72514-3](https://www.findacode.com/loinc/72514-3--pain-severity-0-10-verbal-numeric-rating-score-reported.html) | "Pain severity - 0-10 verbal numeric rating \[Score\] - Reported"; unit `{score}` |

**Drugs: RxNorm or plain names?** Export **both**: always send the drug name as text, and add the RxNorm code when the snapshot order already carries one. Synthea's `medications.csv` uses RxNorm codes, so our test orders arrive coded ([Synthea setup notes](https://pleiadian53.github.io/ehr-sequencing/setup/synthea_setup)). Using RxNorm-owned codes needs no UMLS licence ([HL7 terminology note](https://build.fhir.org/ig/HL7/UTG/en/RxNorm.html)), and NLM's RxNorm API needs no licence either ([NLM terms](https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html)). RxNorm is US-centric and has few non-US drugs ([NLM FAQ](https://mainweb.awsprod.nlm.nih.gov/research/umls/rxnorm/faq.html)), so text must stay the fallback. Don't let the on-device model guess a code from handwriting: a nurse-typed drug with no matching order exports as text only.

**Routes: SNOMED CT.** FHIR's example route list is every SNOMED CT child of "route of administration" ([FHIR R4 route codes](https://www.hl7.org/fhir/R4/valueset-route-codes.html)).

| Our route | SNOMED CT code |
| --- | --- |
| PO (oral) | 26643006 |
| IV | 47625008 |
| IM | 78421000 |
| SC | 34206005 |
| SL (sublingual) | 37839007 |
| PR (rectal) | 37161004 |
| TOP (topical) | 6064005 |
| NG (add this) | 127492001 |
| INH (inhaled) | to look up; not in the pages I opened |

Codes from the [FHIR R4 route value set](https://hl7.org/fhir/r4/valueset-route-codes.html). SNOMED CT needs an affiliate licence for production use, which that page notes; a demo that only stores a few codes should check this before launch.

**Intake and output: LOINC for the observation, our own short list for the category.**

| What | LOINC |
| --- | --- |
| Fluid intake, oral, measured | [9000-1](https://www.findacode.com/loinc/9000-1--fluid-intake-oral-measured.html) |
| Fluid intake, measured (any route) | [8985-4](https://www.findacode.com/loinc/8985-4--fluid-intake-measured.html) |
| Urine output | [9187-6](https://www.findacode.com/loinc/9187-6--urine-output.html) |
| Fluid intake total, 8 hour / 24 hour | 9105-8 / 9108-2 ([list](https://www.findacode.com/loinc/children-of--LP432695-7.LP7787-7.LP7814-9.LP76223-4.LP421734-7--fluid-intake-total-patient-timed-specific-intake.html)) |
| Urine output, 8 hour | 9189-2 ([list](https://www.findacode.com/loinc/children-of--LP432695-7.LP7787-7.LP7818-0.LP76110-3.LP421805-5--urine-output-urinary-tract-timed-specific-output.html)) |
| Fluid output total, 24 hour | [9262-7](https://www.findacode.com/loinc/9262-7--fluid-output-total-24h.html) |

LOINC publishes shift totals at 1, 8, 10, 12 and 24 hours ([LOINC guide](https://cdn.loinc.org/kb/users-guide/clinical-observations-and-measures)). For IV, tube feed, emesis, NG and drains I didn't confirm specific codes: export those with 8985-4 (intake) or a generic output code plus our category as text, and look up exact codes later.

### 7.5 Test data findings

**Keep the plan in section 6: Synthea for patients, hand-written JSON for everything ward-specific.**

| Need | Synthea | What we do |
| --- | --- | --- |
| Patients, encounters, allergies, medication orders, vitals, labs | Yes: CSV and FHIR R4 ([data dictionary](https://github.com/synthetichealth/synthea/wiki/CSV-File-Data-Dictionary)) | Generate with a fixed seed, pick 10 adults |
| Route of administration | Not supported natively; needs its "Flexporter" add-on for FHIR ([maintainer reply](https://github.com/synthetichealth/synthea/discussions/1423)) | Add routes by hand |
| MAR schedule, PRN flags, due times | No evidence it produces these | Hand-write per patient |
| IV infusions with rates, intake and output | No evidence it produces these | Hand-write |
| Dispensing | Not supported ([maintainer reply](https://github.meowingcats01.workers.dev/synthetichealth/synthea/discussions/1323)) | Not needed |

**Can we use MIMIC-IV demo data?** Legally it's open: 100 patients, Open Database License v1.0, "anyone can access the files" under that licence ([PhysioNet](https://www.physionet.org/content/mimic-iv-demo/)). The eICU demo is open under the same licence ([eICU demo](https://physionet.org/content/eicu-crd-demo/2.0/)). But both are **de-identified records of real patients**, which breaks our own "no real patient data" rule, and the licence has attribution and share-alike terms to read first. The full MIMIC-IV and eICU need credentialing: registration, human-research training and a data use agreement ([eICU](https://physionet.org/content/eicu-crd/)).

**Recommendation:** don't put MIMIC or eICU rows in the app, repo or video. Do open the MIMIC demo's `emar_detail` file to copy the **shape** of realistic rows (e.g. an insulin drip in UNIT/HR with "See Flowsheet for Titration", or a rate changed from 75 to 100 mL/hr) when hand-writing our synthetic MAR ([demo file](https://www.physionet.org/content/mimic-iv-demo/2.2/hosp/emar_detail.csv.gz)). I'm not a lawyer; this is a reading of the published licence names, not legal advice.

## 8. Revised schema (final, replaces the field lists in section 3)

Still 19 tables. Nothing is dropped; the changes are added fields and five renames. **R** = required, **O** = optional, **PH** = post-hackathon. All times are ISO 8601 strings with a UTC offset. Every table also has `id` (string, R).

**A. Snapshot (read-only)**

| Table → FHIR | Fields (type, R/O) | Code systems |
| --- | --- | --- |
| `snapshot` → Bundle | taken\_at (datetime, R), source\_system (string, R), unit (string, R), row\_counts (json, O) | — |
| `patient` → Patient | mrn (string, R), family\_name (string, R), given\_name (string, R), birth\_date (date, R), sex (enum, R), wristband\_barcode (string, O) | sex: FHIR administrative gender |
| `encounter` → Encounter | patient\_id (R), visit\_number (string, R), unit (string, R), bed (string, O), admit\_time (datetime, R), attending (string, O), code\_status (string, O), diet (string, O), isolation (string, O), height\_cm (number, O), weight\_kg (number, O) | height 8302-2, weight 29463-7 (LOINC) |
| `allergy` → AllergyIntolerance | patient\_id (R), substance (string, R), reaction (string, O), severity (enum, O), status (enum, R) | text only for the hackathon; coding PH |
| `active_order` → MedicationRequest / ServiceRequest | encounter\_id (R), type (enum, R), text (string, R), drug\_name (string, O), rxnorm\_code (string, O), dose (number, O), dose\_unit (enum, O), route (enum, O), frequency (string, O), scheduled\_times (json, O), prn (bool, O), start (datetime, O), stop (datetime, O), status (enum, R), status\_time (datetime, O), ordered\_by (string, O) | drug: RxNorm when present; route: SNOMED CT; unit: UCUM |
| `snapshot_result` → Observation | patient\_id (R), kind (enum, R), code (string, O), name (string, R), value\_num (number, O), value\_text (string, O), unit (string, O), range\_low (number, O), range\_high (number, O), abnormal\_flag (enum, O), time (datetime, R) | LOINC + UCUM |

**B. Context**

| Table → FHIR | Fields (type, R/O) | Code systems |
| --- | --- | --- |
| `practitioner` (was `staff_user`) → Practitioner | name (string, R), initials (string, R), role (enum, R), pin\_hash (string, R), active (bool, R) | — |
| `device` → Device | label (string, R), unit (string, R), last\_clock\_sync (datetime, O), model\_status (enum, R) | — |
| `downtime_event` → note in the bundle | declared\_at (datetime, R), declared\_by (R), network\_cleared\_at (datetime, O), cleared\_by (O), ended\_at (datetime, O) | — |

**C. Capture (append-only)**

| Table → FHIR | Fields (type, R/O) | Code systems |
| --- | --- | --- |
| `entry` → Provenance | type (enum, R), patient\_id (R), encounter\_id (R), care\_time (datetime, R), entry\_time (datetime, R), scheduled\_time (datetime, O), counter (int, R), device\_id (R), performer\_id (R), enterer\_id (O), raw\_input\_kind (enum, R), raw\_input\_ref (string, R), ai\_proposal (json, O), inference\_source (enum, O), confirmed (json, O), confirmed\_by (O), confirmed\_at (datetime, O), status (enum, R), supersedes\_id (O), photo\_check (json, O) | status: draft, confirmed, corrected, entered-in-error |
| `vital_sign` → Observation | entry\_id (R), temp\_c (number, O), heart\_rate (int, O), resp\_rate (int, O), bp\_systolic (int, O), bp\_diastolic (int, O), spo2 (int, O), o2\_device (string, O), o2\_flow\_lpm (number, O), pain\_0\_10 (int, O), glucose\_mgdl (number, O), consciousness (string, O), weight\_kg (number, O), raw\_text (string, O) | LOINC: 8310-5, 8867-4, 9279-1, 85354-9 with 8480-6 / 8462-4, 59408-5, 3151-8, 72514-3, 41653-7, 29463-7 |
| `med_admin` → MedicationAdministration | entry\_id (R), order\_id (O), drug\_name (string, R), rxnorm\_code (string, O), event (enum, R), dose\_due (number, O), dose\_due\_unit (enum, O), dose\_given (number, O), dose\_given\_unit (enum, O), route (enum, O), site (string, O), end\_time (datetime, O), infusion\_rate (number, O), infusion\_rate\_unit (string, O), prior\_infusion\_rate (number, O), reason (string, O), double\_checked (bool, O), double\_checked\_by (O), raw\_text (string, O) | event → FHIR status: administered = completed, not given / refused = not-done, held = on-hold, stopped = stopped. Route: SNOMED CT. Units: UCUM |
| `intake_output` → Observation | entry\_id (R), direction (enum, R), category (enum, R), volume\_ml (number, R), method (enum, O), start\_time (datetime, O), end\_time (datetime, O), rate (number, O), rate\_unit (string, O), order\_id (O) | LOINC: 9000-1 oral intake, 8985-4 intake, 9187-6 urine; others as text for now |
| `note` (was `clinical_note`) → DocumentReference / Observation | entry\_id (R), category (enum, R), text (string, R), score\_name (string, O), score\_value (number, O) | scores as text; coding PH |
| `lab_event` → ServiceRequest + Observation | entry\_id (R), order\_id (O), test\_name (string, R), status (enum, R), value\_num (number, O), value\_text (string, O), unit (string, O), order\_time (datetime, O), specimen\_time (datetime, O), specimen\_source (string, O), result\_time (datetime, O), called\_to (string, O), read\_back (bool, O) | LOINC for test codes: PH |

**D. Recovery and security**

| Table → FHIR | Fields (type, R/O) | Notes |
| --- | --- | --- |
| `worklist_item` → not exported | entry\_id (R), patient\_id (R), category (enum, R), priority (number, R), flags (json, R), billable (bool, O, stretch), assigned\_to (O), signed\_off\_by (O), signed\_off\_at (datetime, O), exported\_at (datetime, O), second\_look\_status (enum, O), second\_look\_reading (json, O), mismatch\_fields (json, O) | Internal only |
| `handoff` → DocumentReference | patient\_id (R), shift (string, R), situation (string, R), background (string, R), assessment (string, R), open\_items (json, R), source\_entry\_ids (json, R), created\_by (R) | Export is PH |
| `audit_log` → not exported | seq (int, R), time (datetime, R), user\_id (R), device\_id (R), action (enum, R), entity (string, R), before\_hash (string, O), after\_hash (string, R), prev\_row\_hash (string, R) | AuditEvent export is PH |
| `key_store` → never exported | wrapped\_key\_pin (string, R), wrapped\_key\_recovery (string, R), created\_at (datetime, R), rotated\_at (datetime, O) | Stays on the device |

**Post-hackathon list:** SNOMED/RxNorm coding of allergies, LOINC codes for lab tests and risk scores, the mmol/L glucose code, specific LOINC codes for IV/tube/emesis/drain volumes, AuditEvent and handoff export, multi-bag infusion linking (MIMIC's `linkorderid` pattern), and a proper FHIR profile for the downtime extensions.

**Build order for one developer in 12 days:** groups A and B, the entry table, `key_store`, `audit_log` in P1; `vital_sign`, `med_admin`, `intake_output`, `note`, `lab_event`, `handoff` in P2; `worklist_item` and the FHIR export with Provenance in P3. The new `med_admin` fields are all optional, so typed and photo capture work before infusion fields are wired up.

### 8.1 Check against the new Gemini features

The three new features for Nov 30 need **no new tables**: one new field on `entry`, three new fields and one new flag on `worklist_item`. The two stretch features (only built if time allows) would add 3 small tables, so the most the database can grow to is 22 tables.

**What each new feature stores**

| Feature | What it saves | Where | Exported in FHIR? |
| --- | --- | --- | --- |
| Photo check (G1) | Which form the AI thought it was, whether the photo was clear, what was wrong (blurry, cut off, too dark, glare, not a form), and whether the nurse chose to continue anyway | `entry.photo_check` (json): `form_type`, `readable`, `problem`, `overridden` | No. It's an internal quality record, kept in the audit trail |
| Cloud second look (G2) | Whether the cloud's reading matched (match, mismatch, not available), the cloud's full reading, and the list of fields that differ | `worklist_item.second_look_status`, `second_look_reading`, `mismatch_fields`; plus `recheck` added to `worklist_item.flags` | No. Only the value the nurse finally signs off is exported |
| Side-by-side test (G3) | Nothing. It runs on fake patients in Drill mode and the results are only shown on screen | — | No |

**Flag values on `worklist_item.flags`** (the marks that tell a nurse to look again): `duplicate`, `time_conflict`, `missing_field`, `recheck` (new, from the second look) and `not_recorded` (stretch, from the medicine cabinet check).

**Stretch tables (only if phone-order read-back or the medicine cabinet check get built)**

| Table → FHIR | Fields (type, R/O) | Notes |
| --- | --- | --- |
| `verbal_order` (G4) → MedicationRequest or ServiceRequest (check the exact fields before building) | entry\_id (R), prescriber\_name (string, R), order\_time (datetime, R), order\_text (string, R), structured (json, O), read\_back\_sentence (string, R), read\_back\_done (bool, R), read\_back\_at (datetime, O) | A verbal order is a doctor telling a nurse an order by phone or in person. `entry.type` gets a new value, `verbal_order` |
| `cabinet_import` (G5) → not exported | file\_name (string, R), imported\_at (datetime, R), imported\_by (R), row\_count (int, R) | One row per medicine cabinet report uploaded in Recovery |
| `cabinet_removal` (G5) → not exported | import\_id (R), drug\_name (string, R), amount (number, O), unit (string, O), removed\_at (datetime, R), removed\_by (string, O), patient\_ref (string, O), matched\_med\_admin\_id (O), match\_status (enum, R: matched, not\_recorded, unclear) | One row per medicine taken out of the cabinet. An unmatched row creates a `not_recorded` flag on the worklist |

**Rules that still hold, checked against the new features:**

- **Photos stay until sign-off.** The second look needs the original photos, and section 3 already keeps them until Recovery sign-off, so nothing changes.
- **Cloud data is encrypted like everything else.** The cloud's reading in `second_look_reading` contains patient values, so it's stored encrypted in the same vault.
- **Every run is logged.** `audit_log` records each photo check, each second look and each nurse override as its own action.
- **Append-only still holds.** The second look never edits an entry. If the nurse agrees with the cloud, she makes a correction, which adds a new entry that supersedes (replaces) the old one.

## Sources

- Downtime toolkits and policies: [ANIA Nursing Downtime Preparedness toolkit (VUMC)](https://www.vumc.org/nursinginformatics/sites/default/files/public_files/aniatoolkitnursingdowntime.pdf) · [UToledo computer downtime guideline](https://www.utoledo.edu/policies/utmc/nursing/guidelines/general/pdfs/Guideline%20General%20-%20Computer%20downtime%20-%20nursing%20services.pdf) · [ASPR TRACIE paper-based hospital records](https://asprtracie.hhs.gov/documents/aspr-tracie-ta-paper-based-hospital-records-073117-508.pdf)
- Hospital downtime guides: [Health PEI 724Access Downtime Viewer (May 2025)](https://src.healthpei.ca/sites/src.healthpei.ca/files/CIS/Downtime%20Procedures/724_Access_%20Downtime_%20Viewer_%20May_%202025.pdf) · [Houston Methodist downtime](https://it.houstonmethodist.org/downtime/) · [Houston Methodist downtime kit](https://cioquarterly.houstonmethodist.org/?p=4951) · [SPHP ED/OB BCA reports](https://www.sphp.com/sites/default/files/hg_features/mercury_standard_layout/aa49ab0f532d6985e94bc550c7e00f14.pdf) · [SPHP Willow inpatient BCA reports](https://sphp.com/sites/default/files/hg_features/mercury_standard_layout/f27ed644db8008fed5214c45e0a6cb8a.pdf) · [Shared Health BCS Downtime Viewer](https://healthproviders.sharedhealthmb.ca/files/epr-bcs-downtime-viewer.pdf) · [Oracle 724Access Downtime Viewer](https://www.oracle.com/uk/corporate/accessibility/templates/t2-16273.html)
- Sample paper forms: [NLN simulation chart (MAR, vitals, I&O)](https://www.atsu.edu/pdf/Hospital-Care-Nursing-Notes-Day-1.pdf) · [ICANotes downtime nursing note](https://help.icanotes.com/portal/en/kb/articles/downtime-form-nursing-note-icanotes) · [Downtime Admission Health History](https://opentextbc.ca/wp-content/uploads/sites/532/2026/10/Downtime-Admission-Health-History.pdf)
- Patient identification: [Joint Commission National Patient Safety Goals 2025](https://digitalassets.jointcommission.org/api/public/content/9be383450fc941df806b76c5fbdd9ae6)
- Standards: [FHIR vital signs profile](https://build.fhir.org/observation-vitalsigns.html) · [FHIR R4 vital signs value set](https://www.hl7.org/fhir/R4/valueset-observation-vitalsignresult.html) · [US Core vital signs](https://www.hl7.org/fhir/us/core/STU5/ValueSet-us-core-vital-signs.html) · [FHIR R4 MedicationAdministration](https://hl7.org/fhir/R4/medicationadministration.html)
- Test data: [Synthea](https://github.com/synthetichealth/synthea)
- Schema research (sections 7–8), pages opened or searched on Nov 18, 2026:
  - MIMIC-IV: [emar](https://mimic.mit.edu/docs/iv/modules/hosp/emar.html) · [emar\_detail](https://mimic.mit.edu/docs/iv/modules/hosp/emar_detail) · [chartevents](https://mimic.mit.edu/docs/iv/modules/icu/chartevents/) · [inputevents](https://mimic.mit.edu/docs/iv/modules/icu/inputevents/) · [outputevents](https://mimic.mit.edu/docs/iv/modules/icu/outputevents/) · [MIMIC-IV demo on PhysioNet](https://www.physionet.org/content/mimic-iv-demo/) · [demo emar\_detail file](https://www.physionet.org/content/mimic-iv-demo/2.2/hosp/emar_detail.csv.gz)
  - eICU: [overview of tables](https://eicu-crd.mit.edu/gettingstarted/overview) · [table list (Scientific Data)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6132188/table/t4) · [eICU demo](https://physionet.org/content/eicu-crd-demo/2.0/) · [full eICU access](https://physionet.org/content/eicu-crd/) · [demo licence note](https://rdrr.io/github/eth-mds/eicu-demo)
  - OMOP: [v5.4 tables and fields](https://data-models-service.research.chop.edu/models/omop/5.4.0) · [FHIR-to-OMOP guide](https://build.fhir.org/ig/HL7/fhir-omop-ig/en/toc.html)
  - FHIR: [Provenance](https://hl7.org/fhir/R4/provenance.html) · [route codes](https://hl7.org/fhir/r4/valueset-route-codes.html)
  - openEHR: [Medication management](https://ckm.openehr.org/ckm/archetypes/1013.1.123) · [Fluid input](https://ckm.openehr.org/ckm/archetypes/1013.1.1671) · [Fluid output](https://ckm.openehr.org/ckm/archetypes/1013.1.1683) · [Fluid balance](https://ckm.openehr.org/ckm/archetypes/1013.1.1682)
  - PCORnet: [CDM v7.0 fields](https://data-models-service.research.chop.edu/models/pcornet/7.0.0) · i2b2: [star schema quick start](https://i2b2.atlassian.net/wiki/spaces/BUN/pages/207290415/2.+Quick+Start+Guide)
  - Synthea: [CSV data dictionary](https://github.com/synthetichealth/synthea/wiki/CSV-File-Data-Dictionary) · [route of administration discussion](https://github.com/synthetichealth/synthea/discussions/1423) · [customisation discussion](https://github.meowingcats01.workers.dev/synthetichealth/synthea/discussions/1323)
  - OpenMRS: [technical overview](https://openmrs.atlassian.net/wiki/spaces/docs/pages/25476856) · VistA: [pharmacy file list](https://vistapedia.com/index.php/Where_does_the_pharmacy_data_get_stored_in_the_database) · India ABDM: [FHIR profiles](https://www.nrces.in/ndhm/fhir/r4/profiles.html)
  - HL7 v2: [RAS^O17 message](https://hl7.eu/refactored/msgRAS_O17.html) · [RXA segment](https://www.hl7.eu/HL7v2x/v24/hl7v24segmRXA.htm)
  - LOINC: [41653-7 glucose](https://www.findacode.com/loinc/41653-7--glucose-bldc-glucomtr-mcnc.html) · [72514-3 pain](https://www.findacode.com/loinc/72514-3--pain-severity-0-10-verbal-numeric-rating-score-reported.html) · [9000-1](https://www.findacode.com/loinc/9000-1--fluid-intake-oral-measured.html) · [9187-6](https://www.findacode.com/loinc/9187-6--urine-output.html) · [9262-7](https://www.findacode.com/loinc/9262-7--fluid-output-total-24h.html) · [LOINC guide on intake/output](https://cdn.loinc.org/kb/users-guide/clinical-observations-and-measures)
  - RxNorm: [HL7 usage note](https://build.fhir.org/ig/HL7/UTG/en/RxNorm.html) · [NLM terms of service](https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html) · [NLM FAQ](https://mainweb.awsprod.nlm.nih.gov/research/umls/rxnorm/faq.html)
