# Data mapping (built screens)

Schema: `src/db/schema.ts` (19 tables, matches the Data & DB tab). No invented fields.

## Record vitals → `entry` + `vital_sign`

| Screen | Field |
|---|---|
| When measured | `entry.care_time` |
| (automatic) time typed | `entry.entry_time` |
| (automatic) laptop | `entry.device_id`, `entry.counter` (+1 per laptop) |
| (automatic) signed-in nurse | `entry.performer_id`, `entry.confirmed_by`, `entry.confirmed_at` |
| (automatic) | `entry.raw_input_kind = 'typed'`, `entry.status = 'confirmed'`, `entry.encounter_id` |
| Top / Bottom blood pressure | `vital_sign.bp_systolic` / `bp_diastolic` |
| Pulse | `heart_rate` |
| Breathing | `resp_rate` |
| Temperature | `temp_c` |
| Oxygen level | `spo2` |
| Pain | `pain_0_10` |
| Blood sugar | `glucose_mgdl` |
| Oxygen flow / Oxygen given by | `o2_flow_lpm` / `o2_device` |
| Awake? | `consciousness` |

## Fix → new `entry` + `vital_sign`

| Screen | Field |
|---|---|
| (automatic) | new `entry.supersedes_id` = old id; old `entry.status` → `corrected` |
| Why are you fixing this? | new `entry.change_reason` (DB v2) + audit row |

## Wrong patient or mistake

| Screen | Field |
|---|---|
| (automatic) | `entry.status` → `entered-in-error` |
| Reason | `entry.change_reason` on the marked entry (DB v2) + audit row |

## Record medicine → `entry` + `med_admin`

| Screen | Field |
|---|---|
| Due time picked on the order page | `entry.scheduled_time` |
| Time | `entry.care_time` |
| (from the order) | `med_admin.order_id`, `drug_name`, `rxnorm_code`, `dose_due`, `dose_due_unit` |
| What happened: Given / Held / Refused / Rate changed | `med_admin.event` = `administered` / `held` / `refused` / `rate_changed` |
| Dose given / Unit | `dose_given` / `dose_given_unit` (mg, mcg, g, mL, units, mmol, tablet) |
| Route | `route` (PO, IV, IM, SC, SL, PR, INH, TOP) |
| Site | `site` (standard words, patient's left/right) |
| New rate / Unit · current rate | `infusion_rate` / `infusion_rate_unit` · `prior_infusion_rate` |
| Why held / What the patient said / Note | `reason` |
| Second nurse check (high-alert) | `double_checked = true`, `double_checked_by` = that nurse's id |

Medicine slot status is worked out, not stored: the live entry (confirmed or draft) with the same `order_id` and `scheduled_time`.

## Fluids → `entry` + `intake_output`

| Screen | Field |
|---|---|
| In or out | `direction` |
| What kind (by mouth, tube feed, IV fluid, IV piggyback, other / urine, vomit, NG tube, drain, other) | `category` (`oral`, `tube`, `iv`, `ivpb`, `other` / `urine`, `emesis`, `ng`, `drain`, `other`) |
| Amount (mL) | `volume_ml` |
| How measured | `method` |
| Period start / end | `start_time` / `end_time` |
| IV order | `order_id` |

## Notes → `entry` + `note`

| Screen | Field |
|---|---|
| Type (Assessment, Care given, Talked to doctor / team, Risk score, Restraint check, Other) | `category` (`assessment`, `intervention`, `communication`, `risk_score`, `restraint_check`, `other`) |
| Note | `text` |
| Score name / Score (risk score only, as written) | `score_name` / `score_value` |

## Labs → `entry` + `lab_event`

| Screen | Field |
|---|---|
| Lab order / Test | `order_id` (+ `order_time` from the order) / `test_name` |
| Status | `status` (`pending`, `collected`, `resulted`, `critical`) |
| Sample taken at | `specimen_time` |
| Result + unit | `value_num` (numbers) or `value_text` (words), `unit`; `result_time` = entry time when a result is recorded |
| Who was told / Read back | `called_to` / `read_back` |

## Handover → `handoff`

| Screen | Field |
|---|---|
| Which handover | `shift` |
| Situation / Background / Assessment | `situation` / `background` / `assessment` |
| Open items | `open_items` (blank lines dropped) |
| Ticked / "Add line" records (confirmed, same patient only) | `source_entry_ids` |
| (signed-in nurse) | `created_by` |
| (save time) | audit row `handoff_saved`, `entity = handoff/<id>` |

## Photo of paper → photo store + `entry`

| Step | Where |
|---|---|
| Photo file | local photo store `downtimekit-<dataset>-photos` (blob, type, size, SHA-256, saved time, patient) + audit row `photo_saved` |
| Reference | `entry.raw_input_kind = 'photo'`, `entry.raw_input_ref = vault/raw/<id>.<ext>` |
| Quality hints + nurse override | `entry.photo_check` (`form_type`, `readable`, `problem`, `overridden`) |
| Typed values | child table as for typed entries |
| Draft / Confirm | `entry.status` draft → confirmed; `confirmed`, `confirmed_by`, `confirmed_at`; `ai_proposal` kept; audit `entry_confirmed` with before/after |

## Admin and recovery

| Screen | Field / table |
|---|---|
| Declare System down | `downtime_event.id`, `declared_at`, `declared_by` |
| Clear network (Back online) | `downtime_event.network_cleared_at`, `cleared_by` (+ audit `network_cleared` with the ticked checklist) |
| End downtime | `downtime_event.ended_at` |
| Staff add / switch off / new PIN | `practitioner` (`name`, `initials`, `role`, `pin_hash`, `active`) |
| First-time setup | first `practitioner` (admin) + `device` |
| Patient list import | `snapshot`, `patient`, `encounter`, `allergy`, `active_order`, `snapshot_result` |
| Worklist item | `worklist_item` (`entry_id`, `patient_id`, `category`, `priority`, `flags`, `signed_off_by`, `signed_off_at`, `exported_at`) |
| Export | audit `fhir_export` (SHA-256 of the file); `worklist_item.exported_at` |

## Body map (no new fields)

Medicine markers come from `med_admin.site` via a fixed table (`src/features/body/regions.ts`). Region ids are drafts and are not stored. `note.body_site` is prepared but not applied (P-03).

## Audit

Every save writes `audit_log` rows: `seq`, `time`, `user_id`, `device_id`, `action`, `entity`, `before`, `after`, `prev_row_hash` (SHA-256 of the previous row).

## Patient banner and cards

`patient` (name, birth_date, sex, mrn) · `encounter` (bed, attending, code_status, diet, isolation, admit_time) · `allergy` (substance, reaction, severity) · `lab_event` (critical flag on ward card).

## Seed fields not imported

`active_order.route_snomed`, `med_admin.route_snomed`, `downtime_event.note` — in the fake seed file only, not in the schema, removed at import.
