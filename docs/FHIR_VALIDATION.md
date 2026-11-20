# FHIR validation results

**What this is:** the result of running the **official HL7 FHIR Validator** (the checker made by HL7, the group that writes the FHIR standard) on ClinBridge's export file.

**What this is not:** proof that any hospital EHR (electronic health record system) can load the file. Passing the validator only means the file follows the FHIR R4 rules. Every hospital adds its own rules (profiles, code lists, ID formats), and we have tested against none of them. **ClinBridge does not claim EHR interoperability.**

## How it was run

| Item | Value |
|---|---|
| Validator | HL7 FHIR Validator `validator_cli.jar` **7.0.6** (pinned release from hapifhir/org.hl7.fhir.core) |
| FHIR version | R4, package `hl7.fhir.r4.core#4.0.1` |
| Profiles checked | Base R4 resources plus the R4 vital-signs profiles (heartrate, resprate, bodytemp, oxygensat, bp). The validator also applies these on its own when it sees those LOINC codes. |
| Input | `fhir-bundle.json`: the export of the synthetic Practice dataset (fake patients only), clock fixed at 2026-11-14 13:20 −05:00 |
| Bundle size | 301 resources: 10 Patient, 10 Encounter, 7 Practitioner, 8 AllergyIntolerance, 16 MedicationRequest, 17 MedicationAdministration, 104 Observation, 4 DocumentReference, 125 Provenance |
| Where | GitHub Actions job `fhir-validate` in `.github/workflows/ci.yml`. The job log prints every error and a grouped list of warnings (`scripts/fhir-summary.mjs`). The full JSON/HTML report is uploaded as the `fhir-validation` artifact. |
| Command | `java -jar validator_cli.jar fhir-bundle.json -version 4.0.1 -output fhir-validation.json -html-output fhir-validation.html` |

**Why CI and not a laptop:** the development sandbox can't reach `packages.fhir.org` or `tx.fhir.org` (the HL7 package and terminology servers), so the validator can't load R4 there. The npm package called `hl7.fhir.r4.core` is a squatted placeholder, not the HL7 one, so we didn't use it.

**Terminology server:** the validator ran with its default terminology server. Codes in the free-text parts aren't checked against any code list, because they don't have codes (see "Unsupported mappings").

## Results

| Run | Commit | Errors | Warnings | Information |
|---|---|---|---|---|
| 1 (first run) | `28e1786` | **10** | 264 | 418 |
| 2 (after fixes) | `5ab0b64` | **0** | 264 | 418 |
| 3 (MRN type code, validator pinned) | `8508424` | **0** | 254 | 418 |
| 4 (generated narrative, PR #4) | `74368b2` | **0** | **11** | 418 |

### The 10 errors from run 1, and what we did

| # | Rule | Where | Cause | Fix |
|---|---|---|---|---|
| 1–8 | `ait-1`: AllergyIntolerance.clinicalStatus SHALL be present unless entered-in-error | all 8 AllergyIntolerance | We didn't send the allergy's status. | Now sent from the existing `allergy.status` field (active / inactive / resolved). These are the exact FHIR codes, so nothing is guessed. `allergy.severity` (mild / moderate / severe) now goes to `reaction.severity`, also an exact match. |
| 9–10 | `mad-1`: dosage SHALL have dose or rate | MedicationAdministration `e-031` (furosemide, held) and `e-033` (potassium chloride, refused) | A dose that was held or refused has no amount given. We still sent a dosage block with only the route, which breaks the rule. | The dosage block is now left out when there's no dose and no rate. The record keeps status `not-done` and the reason text. **Known loss:** the planned route of a not-given dose is not in the export. |

### Warnings

| Count | Warning | Why it's there | Plan |
|---|---|---|---|
| 243 | `dom-6`: resource should have a narrative (human-readable `text` block) | We didn't generate narrative. | **Fixed in run 4:** every resource now has `text.status = generated`. That is FHIR's word for a summary made entirely from the resource's own fields. It restates each field (HTML-escaped) and adds no interpretation and no codes (`narrative()` in `src/lib/fhir.ts`). |
| 11 | UCUM unit `{score}` has an annotation | Pain score (LOINC 72514-3) uses unit `{score}`, which is what LOINC itself lists for that code. | Leave it. **These 11 are the only warnings left (run 4).** |
| 10 | Patient identifier type has no code | The MRN (medical record number) type was text only. | **Fixed in run 3:** now coded `MR` from HL7 table v2-0203 ("Medical record number"), which is exactly what the field holds. Gone in run 3. |

### Information messages (not problems)

- **301 ×** "CodeSystem `https://clinbridge.example/fhir/tags` could not be found". This is our own "documented during EHR downtime" tag. It's a placeholder address, not a real code system. A hospital would replace it with its own.
- **~116 ×** "Validate Observation against the … profile". The validator telling us it checked the vital-signs profiles. They passed.

## Unsupported mappings (honest list)

These parts of the export are **free text with no standard code**. The validator accepts them, but a receiving EHR most likely can't match them to its own records without someone mapping them by hand.

| Data | How it's exported | What's missing |
|---|---|---|
| Medicine names (orders and doses) | `medicationCodeableConcept.text`, e.g. "furosemide" | No RxNorm (US medicine code list) or local formulary code. Dose units are plain text, not UCUM. |
| Allergy substance and reaction | `code.text`, `manifestation.text` | No SNOMED CT or RxNorm codes. |
| Level of consciousness (AVPU) | Observation with text code, `valueString` | No agreed LOINC/SNOMED code chosen. |
| Oxygen delivery method | Observation with text code, `valueString` | No code. |
| Fluid intake and output | Observation, text code "Fluid intake: oral" etc., value in mL | No LOINC codes per fluid type. |
| Risk scores (Braden, Morse) | Observation, text code, `valueInteger` | No LOINC codes. ClinBridge records scores the nurse writes down. It never calculates them. |
| Labs (except potassium and glucose, which have LOINC) | Observation, text code | Panel names (CBC, BMP, aPTT) aren't coded. |
| Nursing notes | DocumentReference with text type "Nursing note: …" | No LOINC document type code. |
| Encounter | status, class, patient | Ward/bed location is not exported. |
| Practitioner | name | No NPI or hospital staff ID. |
| Held or refused dose | MedicationAdministration `not-done` + reason text | Planned route not exported (see error fix above). Reason isn't coded. |
| Photos of paper notes | Provenance points to `vault/raw/<id>` | The photo itself is not inside the bundle. |
| Second-nurse check | `note` text on the MedicationAdministration | Not a structured performer entry. |

Picking codes for these needs the hospital's own code lists. We won't make them up. This is on the post-hackathon list.

## How to repeat this

1. Push to `main` or open a pull request. The `fhir-validate` job runs on its own.
2. Read the job log (section "Summary") or download the `fhir-validation` artifact.
3. Locally, if you can reach the HL7 servers: `FHIR_OUT=$PWD/fhir-bundle.json npx vitest run src/lib/fhir.export.test.ts`, then run the command in the table above.

Since errors reached 0, the job **fails CI if any validator error comes back**. Warnings are reported but don't block.
