/** Plain words for the change-log actions. An action that is not listed is shown as it is stored, never hidden. */
export type AuditGroup = 'records' | 'second_look' | 'sign_off' | 'system';

// The proposal and second-look rows exist only in the practice data set; the app itself never writes them.
const ACTIONS: Record<string, [label: string, group: AuditGroup, icon: string]> = {
  entry_saved_raw: ['Record saved', 'records', 'save'],
  entry_confirmed: ['Record confirmed', 'records', 'check_circle'],
  entry_corrected: ['Record fixed', 'records', 'edit'],
  entered_in_error: ['Marked as a mistake', 'records', 'block'],
  photo_saved: ['Paper photo saved', 'records', 'photo_camera'],
  photo_check: ['Photo checked', 'records', 'image_search'],
  ai_proposal_on_device: ['Proposal stored (simulated practice data)', 'records', 'memory'],
  handoff_saved: ['Handover saved', 'records', 'swap_horiz'],
  second_look_match: ['Second look (simulated): same', 'second_look', 'done_all'],
  second_look_mismatch: ['Second look (simulated): different', 'second_look', 'warning'],
  second_look_not_available: ['Second look (simulated): not available', 'second_look', 'help'],
  worklist_built: ['Recovery list built', 'sign_off', 'playlist_add'],
  worklist_signed_off: ['Recovery item signed off', 'sign_off', 'task_alt'],
  downtime_declared: ['Downtime started', 'system', 'power_off'],
  downtime_ended: ['Downtime ended', 'system', 'power'],
  network_cleared: ['Network cleared', 'system', 'cloud_done'],
  fhir_export: ['FHIR file made', 'system', 'download'],
  backup_created: ['Backup made', 'system', 'backup'],
  backup_restored: ['Backup restored', 'system', 'settings_backup_restore'],
  vault_encrypted: ['Records encrypted', 'system', 'lock'],
  plain_copies_removed: ['Plain copies removed', 'system', 'delete_sweep'],
  schema_migrated: ['Database updated', 'system', 'database'],
  staff_added: ['Staff added', 'system', 'person_add'],
  staff_pin_reset: ['Staff PIN reset', 'system', 'pin'],
  staff_deactivated: ['Staff switched off', 'system', 'person_off'],
  staff_reactivated: ['Staff switched on', 'system', 'person_check'],
  credential_activated: ['Staff sign-in activated', 'system', 'how_to_reg'],
  snapshot_imported: ['Patient list imported', 'system', 'inventory'],
  first_time_setup: ['First-time setup', 'system', 'settings'],
  practice_drill_closed: ['Practice outage closed', 'system', 'school'],
  enrollment_created: ['Laptop enrolment file made', 'system', 'devices'],
  enrollment_completed: ['Laptop enrolled', 'system', 'devices'],
  vault_created: ['Encrypted store created', 'system', 'lock'],
  vault_unlocked: ['Records unlocked', 'system', 'lock_open'],
  vault_recovered: ['Opened with the recovery key', 'system', 'key'],
  vault_format_upgraded: ['Encryption format updated', 'system', 'lock'],
  patient_registered: ['Patient registered (admissions)', 'records', 'person_add'],
  patient_registered_provisional: ['Provisional patient registered (downtime)', 'records', 'person_add'],
  bed_assigned: ['Bed assigned', 'records', 'bed'],
  practice_orders_added: ['Practice medication scenario added', 'records', 'medication'],
  patient_transferred: ['Patient transferred', 'records', 'move_down'],
  patient_discharged: ['Patient discharged', 'records', 'logout'],
  identity_reviewed: ['Identity reconciliation step', 'records', 'badge'],
  allergy_status_recorded: ['Allergy status recorded', 'records', 'warning'],
  admin_override: ['Admin override', 'system', 'admin_panel_settings'],
  practice_staff_added: ['Practice staff account added', 'system', 'person_add'],
  practice_reset: ['Practice data reset', 'system', 'restart_alt'],
};

export const auditLabel = (action: string): string => ACTIONS[action]?.[0] ?? action;
export const auditIcon = (action: string): string => ACTIONS[action]?.[2] ?? 'receipt_long';
/** Staff, laptop and other administration actions that are not listed above are system events. */
export const auditGroup = (action: string): AuditGroup => ACTIONS[action]?.[1] ?? (action.startsWith('second_look') ? 'second_look' : action.startsWith('entry') ? 'records' : 'system');
