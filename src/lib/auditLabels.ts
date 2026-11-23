/** Plain words for the change-log actions. An action that is not listed is shown as it is stored, never hidden. */
export type AuditGroup = 'records' | 'second_look' | 'sign_off' | 'system';

const ACTIONS: Record<string, [label: string, group: AuditGroup, icon: string]> = {
  entry_saved_raw: ['Record saved', 'records', 'save'],
  entry_confirmed: ['Record confirmed', 'records', 'check_circle'],
  entry_corrected: ['Record fixed', 'records', 'edit'],
  entered_in_error: ['Marked as a mistake', 'records', 'block'],
  photo_saved: ['Paper photo saved', 'records', 'photo_camera'],
  photo_check: ['Photo checked', 'records', 'image_search'],
  ai_proposal_on_device: ['Proposal stored (on device)', 'records', 'memory'],
  handoff_saved: ['Handover saved', 'records', 'swap_horiz'],
  second_look_match: ['Second look: same', 'second_look', 'done_all'],
  second_look_mismatch: ['Second look: different', 'second_look', 'warning'],
  second_look_not_available: ['Second look: not available', 'second_look', 'help'],
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
};

export const auditLabel = (action: string): string => ACTIONS[action]?.[0] ?? action;
export const auditIcon = (action: string): string => ACTIONS[action]?.[2] ?? 'receipt_long';
/** Staff, laptop and other administration actions that are not listed above are system events. */
export const auditGroup = (action: string): AuditGroup => ACTIONS[action]?.[1] ?? (action.startsWith('second_look') ? 'second_look' : action.startsWith('entry') ? 'records' : 'system');
