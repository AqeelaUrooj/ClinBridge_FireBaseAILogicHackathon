import '../core/util.dart';
import 'schema.dart';
import 'store.dart';

/// Sequential hash chain, same layout as the web app (src/db/audit.ts): local tamper EVIDENCE, not proof.
final String kGenesisHash = '0' * 64;

String rowHash(Doc row) => sha256Text(canonicalJson(row));

/// Appends one audit row. Call inside the same tx() as the change it describes.
void appendAudit(Store s, {required String time, required String userId, required String deviceId, required String action, required String entity, required Object? after, Object? before}) {
  final last = s.lastAudit();
  final seq = last == null ? 1 : AuditRow(last).seq + 1;
  String text(Object? v) => v is String ? v : canonicalJson(((v ?? const {}) as Map).cast<String, Object?>());
  s.insert('audit_log', {
    'id': 'au-${seq.toString().padLeft(4, '0')}',
    'seq': seq,
    'time': time,
    'user_id': userId,
    'device_id': deviceId,
    'action': action,
    'entity': entity,
    'before_hash': before == null ? null : sha256Text(text(before)),
    'after_hash': sha256Text(text(after)),
    'prev_row_hash': last == null ? kGenesisHash : rowHash(last),
  });
}

class ChainResult {
  final int total, verified;
  final int? brokenAtSeq;
  const ChainResult(this.total, this.verified, this.brokenAtSeq);
  bool get ok => brokenAtSeq == null;
}

ChainResult verifyChain(List<Doc> rows) {
  final sorted = [...rows]..sort((a, b) => AuditRow(a).seq.compareTo(AuditRow(b).seq));
  var prev = kGenesisHash, verified = 0;
  for (final r in sorted) {
    if (AuditRow(r).prevRowHash != prev) return ChainResult(sorted.length, verified, AuditRow(r).seq);
    verified++;
    prev = rowHash(r);
  }
  return ChainResult(sorted.length, verified, null);
}

/// Plain words for the change-log actions (web src/lib/auditLabels.ts + mobile actions).
/// An action that is not listed is shown as it is stored, never hidden.
const Map<String, String> kAuditLabels = {
  'entry_saved_raw': 'Record saved',
  'entry_confirmed': 'Record confirmed',
  'entry_corrected': 'Record fixed',
  'entered_in_error': 'Marked as a mistake',
  'photo_saved': 'Paper photo saved',
  'photo_check': 'Photo checked',
  'photo_rejected': 'Paper photo rejected',
  'ai_proposal_on_device': 'Proposal stored (simulated practice data)',
  'handoff_saved': 'Handover saved',
  'second_look_match': 'Second look (simulated): same',
  'second_look_mismatch': 'Second look (simulated): different',
  'second_look_not_available': 'Second look (simulated): not available',
  'worklist_built': 'Recovery list built',
  'worklist_signed_off': 'Recovery item signed off',
  'downtime_declared': 'Downtime started',
  'downtime_ended': 'Downtime ended',
  'network_cleared': 'Network cleared',
  'fhir_export': 'FHIR file made',
  'practice_drill_closed': 'Practice outage closed',
  'vault_created': 'Encrypted store created',
  'vault_unlocked': 'Records unlocked',
  'device_registered': 'Phone registered',
  'practice_reset': 'Practice records reset',
  'staff_signed_in': 'Signed in',
  'staff_pin_wrong': 'Wrong PIN',
  'staff_pin_lockout': 'PIN locked (too many wrong tries)',
  'patient_verified': 'Patient verified (two identifiers)',
  'cosign_given': 'Second nurse check given',
  'cosign_declined': 'Second nurse check declined',
  'cosign_wrong_pin': 'Second nurse check: wrong PIN',
  'dose_locked': 'Dose blocked',
  'checklist_changed': 'Checklist changed',
  'recovery_decision': 'Recovery decision',
  'shift_signed_off': 'Shift handover signed off',
  'print_made': 'Paper copy made',
  'file_saved': 'File saved',
  'file_saving': 'Save screen opened',
  'cosign_not_used': 'Second nurse check not used',
  'assignment_changed': 'My patients list changed',
  'draft_discarded': 'Draft discarded',
};

String auditLabel(String action) => kAuditLabels[action] ?? action;
