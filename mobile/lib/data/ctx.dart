import '../core/clock.dart';
import '../core/util.dart';
import 'audit.dart';
import 'schema.dart';
import 'store.dart';

/// Who is acting, on which phone, on which verified patient. Made by AppState for one action.
/// Repositories check it themselves, so a screen cannot skip a gate.
class Ctx {
  final Store store;
  final PracticeClock clock;
  final String userId, deviceId;
  final String? verifiedPatientId;

  /// True while the session that made this context is unchanged (same person, unlocked, same patient).
  final bool Function() stillValid;

  const Ctx({required this.store, required this.clock, required this.userId, required this.deviceId, required this.verifiedPatientId, required this.stillValid});

  /// Throws when the session changed; returns the active signed-in person.
  Practitioner person() {
    if (!stillValid() || store.closed) throw const StaleContextError();
    final row = store.get('practitioner', userId);
    if (row == null || !Practitioner(row).active) throw const NotAllowedError('Sign in again.');
    return Practitioner(row);
  }

  Practitioner nurse() {
    final p = person();
    if (!p.isNurse) throw const NotAllowedError('Only nurses can record care.');
    return p;
  }

  Practitioner admin() {
    final p = person();
    if (!p.isAdmin) throw const NotAllowedError('Only an admin can do this.');
    return p;
  }

  /// The two-identifier check must be current for exactly this patient.
  void patient(String patientId) {
    if (!stillValid()) throw const StaleContextError();
    if (verifiedPatientId != patientId) throw const StaleContextError('This patient is not the verified patient any more. Nothing was saved. Verify the patient again.');
  }

  void audit(String action, String entity, Object? after, {Object? before}) =>
      appendAudit(store, time: clock.nowIso(), userId: userId, deviceId: deviceId, action: action, entity: entity, after: after, before: before);
}
