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

## Audit

Every save writes `audit_log` rows: `seq`, `time`, `user_id`, `device_id`, `action`, `entity`, `before`, `after`, `prev_row_hash` (SHA-256 of the previous row).

## Patient banner and cards

`patient` (name, birth_date, sex, mrn) · `encounter` (bed, attending, code_status, diet, isolation, admit_time) · `allergy` (substance, reaction, severity) · `lab_event` (critical flag on ward card).

## Seed fields not imported

`active_order.route_snomed`, `med_admin.route_snomed`, `downtime_event.note` — in the fake seed file only, not in the schema, removed at import.
