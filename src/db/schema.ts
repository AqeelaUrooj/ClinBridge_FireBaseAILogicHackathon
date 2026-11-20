/**
 * Types for the final 19-table schema (Data & Database Plan, section 8).
 * Field names match the plan exactly. Nothing here is invented for UI decoration.
 * All times are ISO 8601 strings with a UTC offset.
 */

export type ISODateTime = string;
export type ISODate = string;

/* ---------- A. Snapshot (read-only) ---------- */

export interface Snapshot {
  id: string;
  taken_at: ISODateTime;
  source_system: string;
  unit: string;
  row_counts?: Record<string, number> | null;
}

export type AdministrativeGender = 'male' | 'female' | 'other' | 'unknown';

export interface Patient {
  id: string;
  mrn: string;
  family_name: string;
  given_name: string;
  birth_date: ISODate;
  sex: AdministrativeGender;
  wristband_barcode?: string | null;
}

export interface Encounter {
  id: string;
  patient_id: string;
  visit_number: string;
  unit: string;
  bed?: string | null;
  admit_time: ISODateTime;
  attending?: string | null;
  code_status?: string | null;
  diet?: string | null;
  isolation?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
}

export interface Allergy {
  id: string;
  patient_id: string;
  substance: string;
  reaction?: string | null;
  severity?: 'mild' | 'moderate' | 'severe' | null;
  status: 'active' | 'inactive' | 'resolved';
}

export type OrderType = 'med' | 'lab' | 'imaging' | 'diet' | 'nursing' | 'iv';

export interface ActiveOrder {
  id: string;
  encounter_id: string;
  type: OrderType;
  text: string;
  drug_name?: string | null;
  rxnorm_code?: string | null;
  dose?: number | null;
  dose_unit?: string | null;
  route?: string | null;
  frequency?: string | null;
  scheduled_times?: string[] | null;
  prn?: boolean | null;
  start?: ISODateTime | null;
  stop?: ISODateTime | null;
  status: string;
  status_time?: ISODateTime | null;
  ordered_by?: string | null;
}

export interface SnapshotResult {
  id: string;
  patient_id: string;
  kind: 'lab' | 'vital' | 'io';
  code?: string | null;
  name: string;
  value_num?: number | null;
  value_text?: string | null;
  unit?: string | null;
  range_low?: number | null;
  range_high?: number | null;
  abnormal_flag?: 'low' | 'high' | 'normal' | 'critical' | null;
  time: ISODateTime;
}

/* ---------- B. Context ---------- */

export type Role = 'RN' | 'LPN' | 'admin';

export interface Practitioner {
  id: string;
  name: string;
  initials: string;
  role: Role;
  pin_hash: string;
  active: boolean;
}

export interface Device {
  id: string;
  label: string;
  unit: string;
  last_clock_sync?: ISODateTime | null;
  model_status: string;
}

export interface DowntimeEvent {
  id: string;
  declared_at: ISODateTime;
  declared_by: string;
  network_cleared_at?: ISODateTime | null;
  cleared_by?: string | null;
  ended_at?: ISODateTime | null;
}

/* ---------- C. Capture (append-only) ---------- */

export type EntryType = 'vital_sign' | 'med_admin' | 'intake_output' | 'note' | 'lab_event';
export type EntryStatus = 'draft' | 'confirmed' | 'corrected' | 'entered-in-error';
export type InferenceSource = 'on_device' | 'in_cloud';

export interface PhotoCheck {
  form_type: 'vitals' | 'medication' | 'intake_output' | 'note' | 'lab' | 'unknown';
  readable: boolean;
  problem: 'none' | 'blurry' | 'cropped' | 'too_dark' | 'glare' | 'not_a_form';
  overridden: boolean;
}

export interface Entry {
  id: string;
  type: EntryType;
  patient_id: string;
  encounter_id: string;
  care_time: ISODateTime;
  entry_time: ISODateTime;
  scheduled_time?: ISODateTime | null;
  counter: number;
  device_id: string;
  performer_id: string;
  enterer_id?: string | null;
  raw_input_kind: 'typed' | 'photo';
  raw_input_ref: string;
  ai_proposal?: Record<string, unknown> | null;
  inference_source?: InferenceSource | null;
  confirmed?: Record<string, unknown> | null;
  confirmed_by?: string | null;
  confirmed_at?: ISODateTime | null;
  status: EntryStatus;
  supersedes_id?: string | null;
  photo_check?: PhotoCheck | null;
  /** Why a record was fixed (on the new version) or marked entered-in-error (on that record). Added in DB v2 (P-02, approved). */
  change_reason?: string | null;
}

export interface VitalSign {
  id: string;
  entry_id: string;
  temp_c?: number | null;
  heart_rate?: number | null;
  resp_rate?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  spo2?: number | null;
  o2_device?: string | null;
  o2_flow_lpm?: number | null;
  pain_0_10?: number | null;
  glucose_mgdl?: number | null;
  consciousness?: string | null;
  weight_kg?: number | null;
  raw_text?: string | null;
}

export interface MedAdmin {
  id: string;
  entry_id: string;
  order_id?: string | null;
  drug_name: string;
  rxnorm_code?: string | null;
  event: string;
  dose_due?: number | null;
  dose_due_unit?: string | null;
  dose_given?: number | null;
  dose_given_unit?: string | null;
  route?: string | null;
  site?: string | null;
  end_time?: ISODateTime | null;
  infusion_rate?: number | null;
  infusion_rate_unit?: string | null;
  prior_infusion_rate?: number | null;
  reason?: string | null;
  double_checked?: boolean | null;
  double_checked_by?: string | null;
  raw_text?: string | null;
}

export interface IntakeOutput {
  id: string;
  entry_id: string;
  direction: 'in' | 'out';
  category: string;
  volume_ml: number;
  method?: string | null;
  start_time?: ISODateTime | null;
  end_time?: ISODateTime | null;
  rate?: number | null;
  rate_unit?: string | null;
  order_id?: string | null;
}

export interface Note {
  id: string;
  entry_id: string;
  category: string;
  text: string;
  score_name?: string | null;
  score_value?: number | null;
}

export interface LabEvent {
  id: string;
  entry_id: string;
  order_id?: string | null;
  test_name: string;
  status: string;
  value_num?: number | null;
  value_text?: string | null;
  unit?: string | null;
  order_time?: ISODateTime | null;
  specimen_time?: ISODateTime | null;
  specimen_source?: string | null;
  result_time?: ISODateTime | null;
  called_to?: string | null;
  read_back?: boolean | null;
}

/* ---------- D. Recovery and security ---------- */

export type WorklistFlag = 'duplicate' | 'time_conflict' | 'missing_field' | 'recheck' | 'not_recorded';

export interface WorklistItem {
  id: string;
  entry_id: string;
  patient_id: string;
  category: string;
  priority: number;
  flags: WorklistFlag[];
  billable?: boolean | null;
  assigned_to?: string | null;
  signed_off_by?: string | null;
  signed_off_at?: ISODateTime | null;
  exported_at?: ISODateTime | null;
  second_look_status?: 'match' | 'mismatch' | 'not_available' | null;
  second_look_reading?: Record<string, unknown> | null;
  mismatch_fields?: string[] | null;
}

export interface Handoff {
  id: string;
  patient_id: string;
  shift: string;
  situation: string;
  background: string;
  assessment: string;
  open_items: string[];
  source_entry_ids: string[];
  created_by: string;
}

export interface AuditLog {
  id: string;
  seq: number;
  time: ISODateTime;
  user_id: string;
  device_id: string;
  action: string;
  entity: string;
  before_hash?: string | null;
  after_hash: string;
  prev_row_hash: string;
}

export interface KeyStore {
  id: string;
  wrapped_key_pin: string;
  wrapped_key_recovery: string;
  created_at: ISODateTime;
  rotated_at?: ISODateTime | null;
}

/** Child table for each entry type. */
export interface ChildByType {
  vital_sign: VitalSign;
  med_admin: MedAdmin;
  intake_output: IntakeOutput;
  note: Note;
  lab_event: LabEvent;
}

export const TABLE_NAMES = [
  'snapshot', 'patient', 'encounter', 'allergy', 'active_order', 'snapshot_result',
  'practitioner', 'device', 'downtime_event',
  'entry', 'vital_sign', 'med_admin', 'intake_output', 'note', 'lab_event',
  'worklist_item', 'handoff', 'audit_log', 'key_store',
] as const;
export type TableName = (typeof TABLE_NAMES)[number];
