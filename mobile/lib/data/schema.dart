import '../core/util.dart';

/// The 19 tables of the web app's final schema (src/db/schema.ts). Field names are identical.
const List<String> kClinicalTables = [
  'snapshot', 'patient', 'encounter', 'allergy', 'active_order', 'snapshot_result',
  'practitioner', 'device', 'downtime_event',
  'entry', 'vital_sign', 'med_admin', 'intake_output', 'note', 'lab_event',
  'worklist_item', 'handoff', 'audit_log', 'key_store',
];

/// Mobile-only support tables. They add nothing to the clinical schema and are never exported to FHIR.
///  m_meta          device id, seed marker
///  m_pin_state     persistent wrong-PIN counter and lockout per staff member
///  m_draft         unfinished forms (owner + patient scoped)
///  m_entry_key     idempotency key -> entry id (exactly-once saves)
///  m_photo         paper photos (bytes inside the encrypted database)
///  m_body_finding  body region, side and view of a saved note entry
///  m_checklist     downtime checklist ticks
///  m_attestation   second-nurse attestations (given or declined) with the exact content hash
///  m_shift_signoff two-person shift handover sign-off
///  m_resolution    recovery decision on one worklist item
///  m_assignment    staff member's own patient list
///  m_order_hold    explicit seeded Practice hold on an order
const List<String> kMobileTables = [
  'm_meta', 'm_pin_state', 'm_draft', 'm_entry_key', 'm_photo', 'm_body_finding', 'm_checklist',
  'm_attestation', 'm_shift_signoff', 'm_resolution', 'm_assignment', 'm_order_hold',
];

const Map<String, List<String>> kIndexes = {
  'encounter': ['patient_id'], 'allergy': ['patient_id'], 'active_order': ['encounter_id'], 'snapshot_result': ['patient_id'],
  'entry': ['patient_id', 'supersedes_id'], 'vital_sign': ['entry_id'], 'med_admin': ['entry_id'],
  'intake_output': ['entry_id'], 'note': ['entry_id'], 'lab_event': ['entry_id'], 'worklist_item': ['entry_id'],
  'handoff': ['patient_id'], 'm_body_finding': ['patient_id'], 'm_draft': ['owner_id'], 'm_resolution': ['item_id'],
  'm_assignment': ['practitioner_id'], 'm_order_hold': ['order_id'],
};

String? _s(Doc m, String k) => m[k] as String?;
num? _n(Doc m, String k) => m[k] as num?;

extension type Patient(Doc m) {
  String get id => m['id'] as String;
  String get mrn => m['mrn'] as String;
  String get family => m['family_name'] as String;
  String get given => m['given_name'] as String;
  String get birthDate => m['birth_date'] as String;
  String get sex => m['sex'] as String;
  String get fullName => '$given $family';
  String get sexLetter => sex.isEmpty ? '' : sex[0].toUpperCase();
}

extension type Encounter(Doc m) {
  String get id => m['id'] as String;
  String get patientId => m['patient_id'] as String;
  String get unit => m['unit'] as String;
  String? get bed => _s(m, 'bed');
  String get admitTime => m['admit_time'] as String;
  String? get attending => _s(m, 'attending');
  String? get codeStatus => _s(m, 'code_status');
  String? get diet => _s(m, 'diet');
  String? get isolation => _s(m, 'isolation');
}

extension type Allergy(Doc m) {
  String get substance => m['substance'] as String;
  String? get reaction => _s(m, 'reaction');
  String? get severity => _s(m, 'severity');
  String get status => m['status'] as String;
  bool get isNone => substance.toLowerCase().startsWith('no known');
}

extension type ActiveOrder(Doc m) {
  String get id => m['id'] as String;
  String get encounterId => m['encounter_id'] as String;
  String get type => m['type'] as String;
  String get text => m['text'] as String;
  String? get drugName => _s(m, 'drug_name');
  num? get dose => _n(m, 'dose');
  String? get doseUnit => _s(m, 'dose_unit');
  String? get route => _s(m, 'route');
  String? get frequency => _s(m, 'frequency');
  List<String> get scheduledTimes => ((m['scheduled_times'] as List?) ?? const []).cast<String>();
  bool get prn => m['prn'] == true;
  String get status => m['status'] as String;
  String? get orderedBy => _s(m, 'ordered_by');
}

extension type SnapshotResult(Doc m) {
  String get id => m['id'] as String;
  String get patientId => m['patient_id'] as String;
  String get kind => m['kind'] as String;
  String get name => m['name'] as String;
  num? get valueNum => _n(m, 'value_num');
  String? get valueText => _s(m, 'value_text');
  String? get unit => _s(m, 'unit');
  String? get abnormalFlag => _s(m, 'abnormal_flag');
  String get time => m['time'] as String;
}

extension type Practitioner(Doc m) {
  String get id => m['id'] as String;
  String get name => m['name'] as String;
  String get initials => m['initials'] as String;
  String get role => m['role'] as String;
  String get pinHash => m['pin_hash'] as String;
  bool get active => m['active'] == true;
  bool get isNurse => role == 'RN' || role == 'LPN';
  bool get isAdmin => role == 'admin';
  String get roleLabel => isAdmin ? 'Admin' : role;

  /// "Maria Alvarez, RN"
  String get title => isAdmin ? name : '$name, $role';
}

extension type DowntimeEvent(Doc m) {
  String get id => m['id'] as String;
  String get declaredAt => m['declared_at'] as String;
  String get declaredBy => m['declared_by'] as String;
  String? get networkClearedAt => _s(m, 'network_cleared_at');
  String? get clearedBy => _s(m, 'cleared_by');
  String? get endedAt => _s(m, 'ended_at');
}

extension type Entry(Doc m) {
  String get id => m['id'] as String;
  String get type => m['type'] as String;
  String get patientId => m['patient_id'] as String;
  String get careTime => m['care_time'] as String;
  String get entryTime => m['entry_time'] as String;
  String? get scheduledTime => _s(m, 'scheduled_time');
  int get counter => (m['counter'] as num).toInt();
  String get deviceId => m['device_id'] as String;
  String get performerId => m['performer_id'] as String;
  String get rawInputKind => m['raw_input_kind'] as String;
  String get rawInputRef => m['raw_input_ref'] as String;
  String? get confirmedBy => _s(m, 'confirmed_by');
  String? get confirmedAt => _s(m, 'confirmed_at');
  String get status => m['status'] as String;
  String? get supersedesId => _s(m, 'supersedes_id');
  String? get changeReason => _s(m, 'change_reason');
  Doc? get aiProposal => (m['ai_proposal'] as Map?)?.cast<String, Object?>();
  Doc? get photoCheck => (m['photo_check'] as Map?)?.cast<String, Object?>();
  bool get isConfirmed => status == 'confirmed';
  bool get isDraft => status == 'draft';
}

extension type VitalSign(Doc m) {
  num? get tempC => _n(m, 'temp_c');
  num? get heartRate => _n(m, 'heart_rate');
  num? get respRate => _n(m, 'resp_rate');
  num? get sys => _n(m, 'bp_systolic');
  num? get dia => _n(m, 'bp_diastolic');
  num? get spo2 => _n(m, 'spo2');
  String? get o2Device => _s(m, 'o2_device');
  num? get o2Flow => _n(m, 'o2_flow_lpm');
  num? get pain => _n(m, 'pain_0_10');
  num? get glucose => _n(m, 'glucose_mgdl');
  String? get consciousness => _s(m, 'consciousness');
}

extension type MedAdmin(Doc m) {
  String? get orderId => _s(m, 'order_id');
  String get drugName => m['drug_name'] as String;
  String get event => m['event'] as String;
  num? get doseDue => _n(m, 'dose_due');
  String? get doseDueUnit => _s(m, 'dose_due_unit');
  num? get doseGiven => _n(m, 'dose_given');
  String? get doseGivenUnit => _s(m, 'dose_given_unit');
  String? get route => _s(m, 'route');
  String? get site => _s(m, 'site');
  num? get rate => _n(m, 'infusion_rate');
  String? get rateUnit => _s(m, 'infusion_rate_unit');
  num? get priorRate => _n(m, 'prior_infusion_rate');
  String? get reason => _s(m, 'reason');
  bool get doubleChecked => m['double_checked'] == true;
  String? get doubleCheckedBy => _s(m, 'double_checked_by');
}

extension type IntakeOutput(Doc m) {
  String get direction => m['direction'] as String;
  String get category => m['category'] as String;
  num get volumeMl => m['volume_ml'] as num;
  String? get method => _s(m, 'method');
}

extension type Note(Doc m) {
  String get category => m['category'] as String;
  String get text => m['text'] as String;
  String? get scoreName => _s(m, 'score_name');
  num? get scoreValue => _n(m, 'score_value');
}

extension type LabEvent(Doc m) {
  String get testName => m['test_name'] as String;
  String get status => m['status'] as String;
  num? get valueNum => _n(m, 'value_num');
  String? get valueText => _s(m, 'value_text');
  String? get unit => _s(m, 'unit');
  String? get calledTo => _s(m, 'called_to');
  bool? get readBack => m['read_back'] as bool?;
  String? get resultTime => _s(m, 'result_time');
}

extension type WorklistItem(Doc m) {
  String get id => m['id'] as String;
  String get entryId => m['entry_id'] as String;
  String get patientId => m['patient_id'] as String;
  String get category => m['category'] as String;
  int get priority => (m['priority'] as num).toInt();
  List<String> get flags => ((m['flags'] as List?) ?? const []).cast<String>();
  String? get signedOffBy => _s(m, 'signed_off_by');
  String? get signedOffAt => _s(m, 'signed_off_at');
  String? get exportedAt => _s(m, 'exported_at');
  String? get secondLookStatus => _s(m, 'second_look_status');
  Doc? get secondLookReading => (m['second_look_reading'] as Map?)?.cast<String, Object?>();
  List<String> get mismatchFields => ((m['mismatch_fields'] as List?) ?? const []).cast<String>();
}

extension type Handoff(Doc m) {
  String get id => m['id'] as String;
  String get patientId => m['patient_id'] as String;
  String get shift => m['shift'] as String;
  String get situation => m['situation'] as String;
  String get background => m['background'] as String;
  String get assessment => m['assessment'] as String;
  List<String> get openItems => ((m['open_items'] as List?) ?? const []).cast<String>();
  List<String> get sourceEntryIds => ((m['source_entry_ids'] as List?) ?? const []).cast<String>();
  String get createdBy => m['created_by'] as String;
}

extension type AuditRow(Doc m) {
  int get seq => (m['seq'] as num).toInt();
  String get time => m['time'] as String;
  String get userId => m['user_id'] as String;
  String get deviceId => m['device_id'] as String;
  String get action => m['action'] as String;
  String get entity => m['entity'] as String;
  String get prevRowHash => m['prev_row_hash'] as String;
  String get afterHash => m['after_hash'] as String;
}

/// An entry with its child row (the web's EntryWithChild).
class EntryX {
  final Entry entry;
  final Doc? child;
  const EntryX(this.entry, this.child);
  VitalSign get vital => VitalSign(child!);
  MedAdmin get med => MedAdmin(child!);
  IntakeOutput get io => IntakeOutput(child!);
  Note get note => Note(child!);
  LabEvent get lab => LabEvent(child!);
}
