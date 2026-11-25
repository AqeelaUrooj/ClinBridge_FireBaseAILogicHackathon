import 'package:flutter/material.dart';

import '../core/util.dart';
import '../domain/meds.dart';
import '../state/app_state.dart';
import 'screens/admin_screens.dart';
import 'screens/body_map_screen.dart';
import 'screens/companion_screens.dart';
import 'screens/entry_screens.dart';
import 'screens/handover_screens.dart';
import 'screens/med_screens.dart';
import 'screens/paper_screens.dart';
import 'screens/patient_screens.dart';
import 'screens/print_battery_screens.dart';
import 'screens/recovery_screens.dart';
import 'screens/vitals_screens.dart';
import 'screens/ward_screens.dart';

/* ------------------------------ Values that travel between screens ------------------------------ */

/// A vitals form on its way from the editor to the review. [key] makes a repeated save exactly-once.
class VitalsDraft {
  final String patientId, key, careTime;
  final Map<String, String> raw;
  final String? o2Device, consciousness;

  /// Warnings the nurse ticked as re-checked (vitals.dart warning keys).
  final Set<String> rechecked;

  /// Set when an existing record is being corrected.
  final String? supersedesId, correctionReason;
  const VitalsDraft({required this.patientId, required this.key, required this.careTime, required this.raw, this.o2Device, this.consciousness, this.rechecked = const {}, this.supersedesId, this.correctionReason});
}

/// A medication event prepared by the primary nurse. Nothing is saved until it is committed.
class MedProposal {
  final String patientId, orderId, key, careTime;
  final String? scheduledTime;

  /// Validated schema values (validateMed(...).values).
  final Doc values;
  final List<String> checklist;

  /// Draft entry that is being confirmed instead of a new entry.
  final String? draftEntryId;
  const MedProposal({required this.patientId, required this.orderId, required this.key, required this.careTime, this.scheduledTime, required this.values, this.checklist = const [], this.draftEntryId});
}

/// A paper photo in memory, not yet kept.
class PaperShot {
  final String patientId;

  /// vitals | medication | intake_output | note | lab
  final String formType;
  final PickedBytes bytes;
  const PaperShot(this.patientId, this.formType, this.bytes);
}

class PickedBytes {
  final List<int> data;
  final String mime;

  /// camera | upload
  final String source;
  const PickedBytes(this.data, this.mime, this.source);
}

/* ------------------------------ Guarded route graph ------------------------------ */

/// What must be true for a route. Checked when it opens and again on every state change.
class Need {
  final bool staff, nurse, admin;
  final String? patientId;
  const Need({this.staff = true, this.nurse = false, this.admin = false, this.patientId});
  static const none = Need(staff: false);

  bool met(AppState a) {
    if (!staff && !nurse && !admin && patientId == null) return true;
    if (!a.signedIn) return false;
    if (nurse && !a.user!.isNurse) return false;
    if (admin && !a.user!.isAdmin) return false;
    return patientId == null || a.verifiedPatientId == patientId;
  }
}

class _Guard extends StatefulWidget {
  final Need need;
  final WidgetBuilder builder;
  const _Guard(this.need, this.builder);
  @override
  State<_Guard> createState() => _GuardState();
}

class _GuardState extends State<_Guard> {
  bool _leaving = false;

  @override
  Widget build(BuildContext context) {
    if (!_leaving && widget.need.met(AppScope.of(context))) return widget.builder(context);
    // The page does not belong to this person or patient any more: show nothing and take it out of the back stack.
    if (!_leaving) {
      _leaving = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final r = ModalRoute.of(context);
        if (r == null || !r.isActive) return;
        if (!r.isFirst) {
          Navigator.of(context).removeRoute(r);
        } else if (widget.need.met(AppScope.read(context))) {
          setState(() => _leaving = false);
        }
      });
    }
    return const ColoredBox(color: Color(0xFFF8F9FC));
  }
}

PageRoute<T> _route<T>(String name, Need need, WidgetBuilder b) => PageRouteBuilder<T>(
      settings: RouteSettings(name: name),
      pageBuilder: (c, _, __) => _Guard(need, b),
      transitionDuration: const Duration(milliseconds: 160),
      reverseTransitionDuration: const Duration(milliseconds: 120),
      transitionsBuilder: (c, a, _, child) => FadeTransition(opacity: a, child: child),
    );

/// All navigation. Screens call these; they never build routes themselves.
class Go {
  static NavigatorState _n(BuildContext c) => Navigator.of(c, rootNavigator: true);
  static Future<T?> _push<T>(BuildContext c, String name, Need need, WidgetBuilder b) {
    if (!need.met(AppScope.read(c))) throw const NotAllowedError('This page is not open to you now.');
    return _n(c).push<T>(_route<T>(name, need, b));
  }

  static Future<T?> _replace<T>(BuildContext c, String name, Need need, WidgetBuilder b) => _n(c).pushReplacement<T, void>(_route<T>(name, need, b));
  static void _root(BuildContext c, String name, Need need, WidgetBuilder b) => _n(c).pushAndRemoveUntil(_route<void>(name, need, b), (_) => false);

  static void back(BuildContext c) => _n(c).maybePop();

  // Entry
  static void opening(BuildContext c) => _root(c, 'opening', Need.none, (_) => const OpeningScreen());
  static void vault(BuildContext c) => _push<void>(c, 'vault', Need.none, (_) => const VaultScreen());

  /// Vault unlocked: choose a person (removes everything before it).
  static void staff(BuildContext c) => _root(c, 'staff', Need.none, (_) => const SelectStaffScreen());
  static void pin(BuildContext c, String staffId) => _push<void>(c, 'pin', Need.none, (_) => PinScreen(staffId: staffId));
  static void checklistPreview(BuildContext c) => _push<void>(c, 'checklist-preview', Need.none, (_) => const ChecklistScreen(preview: true));

  /// After sign-in: nurses to the ward, admins to readiness.
  static void home(BuildContext c) => AppScope.read(c).user?.isAdmin ?? false ? readiness(c) : ward(c);

  // Ward and patient
  static void ward(BuildContext c) => _root(c, 'ward', const Need(), (_) => const WardScreen());
  static Future<void> verify(BuildContext c, String patientId, {void Function(BuildContext c)? then}) => _push<void>(c, 'verify', const Need(), (_) => VerifyPatientScreen(patientId: patientId, then: then));

  /// Chart of the verified patient on top of the ward (or admin home).
  static void summary(BuildContext c, String patientId) {
    home(c);
    _n(c).push(_route<void>('summary', Need(patientId: patientId), (_) => PatientSummaryScreen(patientId: patientId)));
  }

  static Future<void> addSheet(BuildContext c, String patientId) => _push<void>(c, 'add', Need(patientId: patientId), (_) => AddBedsideScreen(patientId: patientId));
  static Future<void> history(BuildContext c, String patientId) => _push<void>(c, 'history', Need(patientId: patientId), (_) => HistoryScreen(patientId: patientId));
  static Future<void> entry(BuildContext c, String patientId, String entryId) => _push<void>(c, 'entry', Need(patientId: patientId), (_) => EntryDetailScreen(patientId: patientId, entryId: entryId));
  static Future<void> bodyMap(BuildContext c, String patientId) => _push<void>(c, 'body', Need(patientId: patientId), (_) => BodyMapScreen(patientId: patientId));

  // Records
  static Future<void> vitals(BuildContext c, String patientId, {VitalsDraft? draft}) => _push<void>(c, 'vitals', Need(nurse: true, patientId: patientId), (_) => VitalsEditorScreen(patientId: patientId, draft: draft));
  static Future<bool?> vitalsReview(BuildContext c, VitalsDraft d) => _push<bool>(c, 'vitals-review', Need(nurse: true, patientId: d.patientId), (_) => VitalsReviewScreen(draft: d));
  static Future<void> mar(BuildContext c, String patientId) => _push<void>(c, 'mar', Need(patientId: patientId), (_) => MarScreen(patientId: patientId));
  static Future<void> medEvent(BuildContext c, String patientId, String orderId, {required String event, String? scheduledTime}) =>
      _push<void>(c, 'med-event', Need(nurse: true, patientId: patientId), (_) => MedEventScreen(patientId: patientId, orderId: orderId, event: event, scheduledTime: scheduledTime));

  /// Returns the saved entry id, or null when cancelled or declined.
  static Future<String?> cosign(BuildContext c, MedProposal p) => _push<String>(c, 'cosign', Need(nurse: true, patientId: p.patientId), (_) => CosignScreen(proposal: p));
  static Future<void> conflict(BuildContext c, String patientId, String orderId, {String? scheduledTime, required List<DoseLock> locks}) =>
      _push<void>(c, 'conflict', Need(patientId: patientId), (_) => ConflictScreen(patientId: patientId, orderId: orderId, scheduledTime: scheduledTime, locks: locks));
  static Future<void> fluid(BuildContext c, String patientId) => _push<void>(c, 'fluid', Need(nurse: true, patientId: patientId), (_) => FluidScreen(patientId: patientId));
  static Future<void> lab(BuildContext c, String patientId) => _push<void>(c, 'lab', Need(nurse: true, patientId: patientId), (_) => LabScreen(patientId: patientId));
  static Future<void> note(BuildContext c, String patientId) => _push<void>(c, 'note', Need(nurse: true, patientId: patientId), (_) => NoteScreen(patientId: patientId));

  // Paper
  static Future<void> paperCapture(BuildContext c, String patientId, {String? formType}) => _push<void>(c, 'paper', Need(nurse: true, patientId: patientId), (_) => PaperCaptureScreen(patientId: patientId, formType: formType));
  static Future<void> paperPreview(BuildContext c, PaperShot s) => _replace<void>(c, 'paper-preview', Need(nurse: true, patientId: s.patientId), (_) => PaperPreviewScreen(shot: s));
  static Future<void> paperError(BuildContext c, PaperShot s, {required List<String> staffReasons}) => _replace<void>(c, 'paper-error', Need(nurse: true, patientId: s.patientId), (_) => PaperErrorScreen(shot: s, staffReasons: staffReasons));

  /// [photoRef] null = manual entry without a picture.
  static Future<void> paperDraft(BuildContext c, String patientId, {required String formType, String? photoRef}) => _replace<void>(c, 'paper-draft', Need(nurse: true, patientId: patientId), (_) => PaperDraftScreen(patientId: patientId, formType: formType, photoRef: photoRef));

  // Handover
  static Future<void> sbar(BuildContext c, String patientId, {String? draftId}) => _push<void>(c, 'sbar', Need(nurse: true, patientId: patientId), (_) => SbarScreen(patientId: patientId, draftId: draftId));
  static Future<void> sbarView(BuildContext c, String handoffId) => _push<void>(c, 'sbar-view', const Need(), (_) => SbarViewScreen(handoffId: handoffId));
  static Future<void> handover(BuildContext c) => _push<void>(c, 'handover', const Need(nurse: true), (_) => const HandoverScreen());

  // Companions (implementation additions)
  static Future<void> queue(BuildContext c, {String? patientId}) => _push<void>(c, 'queue', const Need(), (_) => QueueScreen(patientId: patientId));
  static Future<void> alerts(BuildContext c) => _push<void>(c, 'alerts', const Need(), (_) => const AlertsScreen());
  static Future<void> more(BuildContext c) => _push<void>(c, 'more', const Need(), (_) => const MoreScreen());

  // Admin
  static void readiness(BuildContext c) => _root(c, 'readiness', const Need(admin: true), (_) => const ReadinessScreen());
  static Future<void> checklist(BuildContext c) => _push<void>(c, 'checklist', const Need(), (_) => const ChecklistScreen());
  static Future<void> recovery(BuildContext c) => _push<void>(c, 'recovery', const Need(admin: true), (_) => const RecoveryScreen());
  static Future<void> export(BuildContext c) => _push<void>(c, 'export', const Need(admin: true), (_) => const ExportScreen());
  static Future<void> audit(BuildContext c) => _push<void>(c, 'audit', const Need(admin: true), (_) => const AuditScreen());
  static Future<void> print(BuildContext c, {String? patientId}) => _push<void>(c, 'print', const Need(), (_) => PrintScreen(patientId: patientId));
  static Future<void> battery(BuildContext c) => _push<void>(c, 'battery', const Need(), (_) => const BatteryScreen());
}

/// Opens [then] for a patient: directly when verified, else after the two-identifier check.
void withPatient(BuildContext c, String patientId, void Function(BuildContext c) then) {
  if (AppScope.read(c).verifiedPatientId == patientId) {
    then(c);
  } else {
    Go.verify(c, patientId, then: then);
  }
}
