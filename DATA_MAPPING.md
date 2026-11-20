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
| Why are you fixing this? | `entry.confirmed.correction.reason` (provisional, D-05) + audit row |

## Wrong patient or mistake

| Screen | Field |
|---|---|
| (automatic) | `entry.status` → `entered-in-error` |
| Reason | `entry.confirmed.entered_in_error.reason` (provisional, D-05) + audit row |

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

## Audit

Every save writes `audit_log` rows: `seq`, `time`, `user_id`, `device_id`, `action`, `entity`, `before`, `after`, `prev_row_hash` (SHA-256 of the previous row).

## Patient banner and cards

`patient` (name, birth_date, sex, mrn) · `encounter` (bed, attending, code_status, diet, isolation, admit_time) · `allergy` (substance, reaction, severity) · `lab_event` (critical flag on ward card).

## Seed fields not imported

`active_order.route_snomed`, `med_admin.route_snomed`, `downtime_event.note` — in the fake seed file only, not in the schema, removed at import.
