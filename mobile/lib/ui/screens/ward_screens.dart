import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/repos/ops.dart';
import '../../domain/facts.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';
import 'entry_screens.dart' show ErrorBox, StatusIcons, Ticking, TwoSides, phaseRail, roleWords, unitShort;

const _amber = Color(0xFFC18A28);
const _green = Color(0xFF277453);

/// Large text: tiles stand below each other.
bool bigText(BuildContext c) => MediaQuery.textScalerOf(c).scale(10) > 11.5;

/// Stored with every two-identifier check.
const List<String> kIdentifiers = ['Name confirmed verbally and on band', 'MRN matched on band'];

/// "2d ago" / "Today", by calendar day.
String _admitted(String admitIso, String nowIso) {
  int day(String iso) => DateTime.utc(int.parse(iso.substring(0, 4)), int.parse(iso.substring(5, 7)), int.parse(iso.substring(8, 10))).millisecondsSinceEpoch ~/ 86400000;
  final d = day(nowIso) - day(admitIso);
  return d <= 0 ? 'Today' : '${d}d ago';
}

Future<T?> _sheet<T>(BuildContext context, Widget child) => showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: C.surfaceLowest,
      barrierColor: C.primary.withValues(alpha: 0.4),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => SafeArea(top: false, child: SingleChildScrollView(padding: const EdgeInsets.all(16), child: child)),
    );

class _Handle extends StatelessWidget {
  const _Handle();
  @override
  Widget build(BuildContext context) => Center(child: Container(width: 48, height: 4, margin: const EdgeInsets.only(bottom: 12), decoration: BoxDecoration(color: C.surfaceHighest, borderRadius: BorderRadius.circular(2))));
}

class _SheetHead extends StatelessWidget {
  final IconData icon;
  final String title, sub;
  const _SheetHead(this.icon, this.title, this.sub);
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.only(bottom: 8),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: C.surfaceContainer))),
        child: Row(children: [
          Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: C.secondaryContainer, borderRadius: BorderRadius.circular(6)), child: Ic(icon, size: 20, color: C.onSecondaryContainer)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Semantics(header: true, child: Text(title, style: T.headlineSm.c(C.primary))),
              Text(sub, style: T.labelSm.c(C.onSurfaceVariant)),
            ]),
          ),
          Tap(label: 'Close', onTap: () => Navigator.of(context).pop(), child: const Ic(Symbols.close, size: 24, color: C.onSurfaceVariant)),
        ]),
      );
}

/// One row of a small action sheet.
class _SheetRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? sub;
  final VoidCallback? onTap;
  const _SheetRow(this.icon, this.title, {this.sub, this.onTap});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Tap(
          label: sub == null ? title : '$title. $sub',
          expand: true,
          onTap: onTap,
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: 52),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(color: C.surface, borderRadius: R.rLg),
            child: Row(children: [
              Ic(icon, size: 20, color: C.secondary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: T.labelMd),
                  if (sub != null) Text(sub!, style: T.bodySm.c(C.onSurfaceVariant)),
                ]),
              ),
              const Ic(Symbols.chevron_right, size: 20, color: C.secondary),
            ]),
          ),
        ),
      );
}

/* ------------------------------ Two-identifier check (one set of rules for the page and the sheet) ------------------------------ */

/// The two confirmations. Nothing is ticked at the start; both are needed. [compact] = the sheet's look.
class IdentifierChecks extends StatelessWidget {
  final bool name, mrn, compact;
  final ValueChanged<bool> onName, onMrn;
  const IdentifierChecks({super.key, required this.name, required this.mrn, required this.onName, required this.onMrn, this.compact = false});

  Widget _row(String title, String sub, bool on, ValueChanged<bool> set) => Tap(
        label: '$title. $sub',
        toggled: on,
        expand: true,
        onTap: () => set(!on),
        child: Container(
          width: double.infinity,
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: compact ? C.surface : C.surfaceLow, borderRadius: R.rLg),
          child: Row(children: [
            Container(
              width: compact ? 20 : 24,
              height: compact ? 20 : 24,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: on ? C.primary : C.surfaceLowest, borderRadius: R.rBase, border: on ? null : Border.all(color: C.slate, width: 1.5)),
              child: on ? Ic(Symbols.check, size: compact ? 14 : 16, color: C.onPrimary) : null,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: compact
                  ? Text(title, style: T.bodyMd)
                  : Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(title, style: T.labelMd),
                      Text(sub, style: T.bodySm.c(C.onSurfaceVariant)),
                    ]),
            ),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _row(compact ? 'Name confirmed verbally and on band' : 'Name confirmed verbally & band', 'Ask the patient, then read the band', name, onName),
        const SizedBox(height: 4),
        _row(compact ? 'MRN matched on physical wristband' : 'MRN matched on physical wristband', 'Read the number on the band', mrn, onMrn),
      ]);
}

/// State of one check. A new patient always starts with nothing ticked.
mixin _TwoIdentifiers<W extends StatefulWidget> on State<W> {
  bool nameOk = false, mrnOk = false, busy = false;
  String? error;
  bool get ready => nameOk && mrnOk && !busy;

  void resetChecks() {
    nameOk = mrnOk = busy = false;
    error = null;
  }

  /// Writes the check to the change log and makes the patient the verified one. False = not done, the reason is in [error].
  bool verifyNow(String patientId) {
    if (!ready) return false;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      AppScope.read(context).verifyPatient(patientId, kIdentifiers);
      return true;
    } on AppError catch (e) {
      if (mounted) setState(() => error = e.message);
      return false;
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}

/// Allergies as stored. [inline] = the sentence of the verification page.
class _AllergyAlert extends StatelessWidget {
  final PatientFacts f;
  final bool compact;
  const _AllergyAlert(this.f, {this.compact = false});

  static InlineSpan _list(PatientFacts f, TextStyle name, TextStyle reaction) => TextSpan(children: [
        for (final (i, a) in f.realAllergies.indexed) ...[
          if (i > 0) TextSpan(text: ' • ', style: name),
          TextSpan(text: a.substance.toUpperCase(), style: name),
          if (a.reaction != null) TextSpan(text: ' (${a.reaction})', style: reaction),
        ],
      ]);

  @override
  Widget build(BuildContext context) {
    final has = f.realAllergies.isNotEmpty;
    final title = has ? (f.hasSevereAllergy ? 'SEVERE ALLERGY ALERT' : 'ALLERGY ALERT') : 'ALLERGIES';
    final bg = has ? C.errorContainer : C.surfaceLow;
    final fg = has ? C.onErrorContainer : C.onSurface;
    final head = has ? C.error : C.secondary;
    final icon = has ? Symbols.warning : Symbols.info;
    final body = has ? Text.rich(_list(f, T.labelMd.s(13, 16.25).c(fg), T.bodySm.c(fg))) : Text(f.allergyText, style: T.labelMd.s(13, 16.25).c(fg));
    if (compact) {
      return Box(
        color: bg,
        radius: R.lg,
        pad: const EdgeInsets.all(10),
        child: Row(children: [
          Ic(icon, size: 20, color: head),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: T.badge.c(head)), body])),
        ]),
      );
    }
    return Box(
      color: bg,
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          SizedBox(height: 28, child: Center(child: Ic(icon, size: 20, color: head))),
          const SizedBox(width: 4),
          Flexible(child: Text(title, style: T.badge.tr(0.025).c(head))),
        ]),
        const SizedBox(height: 4),
        body,
      ]),
    );
  }
}

/* ------------------------------ Ward ------------------------------ */

enum _Filter { all, mine, pending, alert }

class WardScreen extends StatefulWidget {
  const WardScreen({super.key});
  @override
  State<WardScreen> createState() => _WardScreenState();
}

class _WardScreenState extends State<WardScreen> {
  final _search = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  var _filter = _Filter.all;
  Timer? _tick;

  // Records are read again after every save and once a minute.
  String _key = '';
  List<PatientFacts> _ward = const [];

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 30), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _tick?.cancel();
    _search.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Patients tab on this page: the whole list, from its start.
  void _showAll() {
    _search.clear();
    _focus.unfocus();
    setState(() => _filter = _Filter.all);
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  Future<void> _verifySheet(PatientFacts f) => _sheet(context, _VerifySheet(facts: f));

  void _openChart(String id) => withPatient(context, id, (c) => Go.summary(c, id));

  /// Choose a patient first; the two-identifier check comes next unless this patient is the verified one.
  Future<void> _addPicker() async {
    final id = await _sheet<String>(context, _PatientPicker(ward: _ward, verifiedId: AppScope.read(context).verifiedPatientId));
    if (id == null || !mounted) return;
    withPatient(context, id, (c) => Go.addSheet(c, id));
  }

  void _options(PatientFacts f, bool assigned) => _sheet<void>(
        context,
        Builder(builder: (c) {
          final app = AppScope.read(c);
          final nurse = app.user?.isNurse ?? false;
          void close() => Navigator.of(c).pop();
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            const _Handle(),
            _SheetHead(Symbols.badge, f.patient.fullName, 'Bed ${f.bed} • MRN: ${f.patient.mrn} • Practice'),
            const SizedBox(height: 8),
            _SheetRow(Symbols.folder_open, 'Open chart', sub: app.verifiedPatientId == f.patient.id ? 'Verified patient' : 'Two identifiers are checked first', onTap: () {
              close();
              _openChart(f.patient.id);
            }),
            if (nurse)
              _SheetRow(assigned ? Symbols.person_remove : Symbols.person_add, assigned ? 'Remove from my patients' : 'Assign to me', sub: 'Your own list on this phone', onTap: () {
                close();
                _assign(f, !assigned);
              })
            else
              const Unavailable(reason: 'Only nurses have their own patient list.', child: _SheetRow(Symbols.person_add, 'Assign to me', sub: 'Only nurses have their own patient list')),
            _SheetRow(Symbols.notifications, 'View alerts', sub: 'Facts from the saved records', onTap: () {
              close();
              Go.alerts(context);
            }),
          ]);
        }),
      );

  void _assign(PatientFacts f, bool on) {
    final app = AppScope.read(context);
    try {
      setAssigned(app.ctx(), f.patient.id, on);
      app.saved();
      toast(context, on ? '${f.patient.fullName} is on your list. Saved on this phone.' : '${f.patient.fullName} is off your list. Saved on this phone.');
    } on AppError catch (e) {
      toast(context, e.message, icon: Symbols.error, error: true);
    }
  }

  void _session() => _sheet<void>(
        context,
        Builder(builder: (c) {
          final app = AppScope.read(c);
          final p = app.user;
          void close() => Navigator.of(c).pop();
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            const _Handle(),
            _SheetHead(Symbols.account_circle, p?.title ?? 'Signed out', p == null ? 'Practice' : '${roleWords(p)} • ${app.unit} • Practice'),
            const SizedBox(height: 8),
            if (p?.isAdmin ?? false)
              _SheetRow(Symbols.shield_with_heart, 'Admin readiness', sub: 'Back to the admin pages', onTap: () {
                close();
                Go.home(context);
              }),
            _SheetRow(Symbols.lock, 'Lock', sub: 'Your PIN opens it again. The patient is verified again.', onTap: () {
              close();
              app.lock();
            }),
            _SheetRow(Symbols.logout, 'Sign out', sub: 'Saved records stay on this phone', onTap: () {
              close();
              app.signOut();
            }),
          ]);
        }),
      );

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final me = app.user;
    if (!app.signedIn || me == null) return const ColoredBox(color: C.surface);
    final s = app.store, now = app.nowIso;
    final key = '${app.dataVersion} ${app.epoch} ${now.substring(0, 16)}';
    if (key != _key) {
      _key = key;
      _ward = loadWard(s, now);
    }
    final mine = assignedPatients(s, me.id);
    final by = <String, List<String>>{};
    for (final r in s.all('m_assignment')) {
      by.putIfAbsent(r['patient_id'] as String, () => []).add(staffShort(s, r['practitioner_id'] as String).split(',').first);
    }
    final pending = {for (final f in _ward) if (f.vitalsDue.isNotEmpty) f.patient.id};
    bool inFilter(PatientFacts f, _Filter x) => switch (x) { _Filter.all => true, _Filter.mine => mine.contains(f.patient.id), _Filter.pending => pending.contains(f.patient.id), _Filter.alert => f.hasHighAlert };
    int countOf(_Filter x) => _ward.where((f) => inFilter(f, x)).length;
    final q = _search.text.trim().toLowerCase();
    final list = [for (final f in _ward) if (inFilter(f, _filter) && (q.isEmpty || '${f.patient.fullName} ${f.bed} ${f.patient.mrn}'.toLowerCase().contains(q))) f];
    final hint = list.where((f) => f.patient.id != app.verifiedPatientId).firstOrNull ?? list.firstOrNull;
    final short = unitShort(app.unit);
    final myCount = _ward.where((f) => mine.contains(f.patient.id)).length;

    final metrics = [
      _Metric('My Shift', Text('$myCount ${myCount == 1 ? 'Patient' : 'Patients'}', textAlign: TextAlign.center, style: T.headlineSm.c(C.primary))),
      _Metric('Vitals Due', Text('${pending.length} Pending', textAlign: TextAlign.center, style: T.headlineSm.c(pending.isEmpty ? C.primary : C.error))),
      _Metric(
        'On This Phone',
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Dot(C.tertiaryFixedDim, size: 6),
          const SizedBox(width: 4),
          Flexible(child: Text('${s.count('entry')} records', style: T.labelMd.s(13, 22))),
        ]),
      ),
    ];

    return StatusIcons(
      light: true,
      child: PhonePage(
        statusColor: C.primaryContainer,
        header: _WardHeader(app: app, onPerson: _session),
        controller: _scroll,
        nav: _WardNav(
          onPatients: _showAll,
          onAdd: me.isNurse ? _addPicker : null,
          onHandover: me.isNurse ? () => Go.handover(context) : null,
          onAlerts: () => Go.alerts(context),
          onMore: () => Go.more(context),
        ),
        pad: const EdgeInsets.fromLTRB(16, S.md, 16, 32),
        children: [
          // Census
          Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TwoSides(
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Ic(Symbols.medical_services, size: 20, color: C.secondary),
                  const SizedBox(width: 4),
                  Flexible(child: Text('$short Census', style: T.headlineSm.c(C.primary))),
                ]),
                Tag('${_ward.length} ${_ward.length == 1 ? 'BED' : 'BEDS'} LISTED', bg: C.surfaceContainer, fg: C.onSurfaceVariant),
              ),
              const SizedBox(height: 8),
              if (bigText(context))
                for (final (k, m) in metrics.indexed) Padding(padding: EdgeInsets.only(top: k == 0 ? 0 : 4), child: m)
              else
                IntrinsicHeight(
                  child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Expanded(child: metrics[0]),
                    const SizedBox(width: 4),
                    Expanded(child: metrics[1]),
                    const SizedBox(width: 4),
                    Expanded(child: metrics[2]),
                  ]),
                ),
            ]),
          ),
          // Search. The touch area includes the space above and below the field.
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _focus.requestFocus,
            child: Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Container(
                constraints: const BoxConstraints(minHeight: 40),
                padding: const EdgeInsets.only(left: 12),
                decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg, boxShadow: shadowSm),
                child: Row(children: [
                  const Ic(Symbols.search, size: 20, color: C.secondary),
                  const SizedBox(width: 8),
                  Expanded(child: Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Field(_search, focus: _focus, label: 'Search patient, bed, or MRN', hint: 'Search patient, bed, or MRN...', action: TextInputAction.search, onChanged: (_) => setState(() {})))),
                  if (q.isEmpty)
                    const SizedBox(width: 12)
                  else
                    Tap(
                      label: 'Clear search',
                      onTap: () {
                        _search.clear();
                        setState(() {});
                        _focus.requestFocus();
                      },
                      child: const Ic(Symbols.cancel, size: 18, color: C.onSurfaceVariant),
                    ),
                ]),
              ),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final (i, x) in _Filter.values.indexed) ...[
                if (i > 0) const SizedBox(width: 4),
                _Pill('${switch (x) { _Filter.all => 'All Beds', _Filter.mine => 'Assigned to Me', _Filter.pending => 'Pending Vitals', _Filter.alert => 'High Alert' }} (${countOf(x)})', on: _filter == x, onTap: () => setState(() => _filter = x)),
              ],
            ]),
          ),
          if (hint != null)
            Tap(
              expand: true,
              label: 'Bed ${hint.bed}: open the bedside verification sheet',
              onTap: () => _verifySheet(hint),
              child: Container(
                margin: const EdgeInsets.only(top: 2, bottom: 18),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rLg),
                child: Row(children: [
                  const Ic(Symbols.touch_app, size: 16, color: C.primary),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text.rich(TextSpan(children: [const TextSpan(text: 'Tap '), TextSpan(text: 'Bed ${hint.bed}', style: T.labelSm.bold.c(C.onSecondaryContainer).copyWith(fontFeatures: const [])), const TextSpan(text: ' for Bedside Verification sheet')]), style: T.labelSm.c(C.onSecondaryContainer)),
                  ),
                  const Ic(Symbols.expand_more, size: 16, color: C.onSecondaryContainer),
                ]),
              ),
            ),
          if (list.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Box(
                pad: const EdgeInsets.all(32),
                child: Column(children: [
                  const Ic(Symbols.person_search, size: 48, color: C.outline),
                  const SizedBox(height: 8),
                  Text('No Patient Found', style: T.headlineSm, textAlign: TextAlign.center),
                  const SizedBox(height: 4),
                  Text(q.isEmpty ? 'No patient on this phone is in this group.' : 'Check the name, MRN or bed number. Only patients on this phone are searched.', style: T.bodyMd.c(C.onSurfaceVariant), textAlign: TextAlign.center),
                ]),
              ),
            ),
          for (final (i, f) in list.indexed) ...[
            if (i > 0) const SizedBox(height: 8),
            _PatientCard(
              f,
              due: pending.contains(f.patient.id),
              verified: f.patient.id == app.verifiedPatientId,
              mine: mine.contains(f.patient.id),
              assigned: by[f.patient.id] ?? const [],
              onTap: () => _openChart(f.patient.id),
              onOptions: () => _options(f, mine.contains(f.patient.id)),
            ),
          ],
        ],
      ),
    );
  }
}

class _WardHeader extends StatelessWidget {
  final AppState app;
  final VoidCallback onPerson;
  const _WardHeader({required this.app, required this.onPerson});
  @override
  Widget build(BuildContext context) {
    final me = app.user!;
    final ok = app.store.readOnlyReason == null && app.store.lastStorageError == null;
    return DecoratedBox(
      decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0F1C2536), offset: Offset(0, 1), blurRadius: 8)]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          color: C.primaryContainer,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Row(children: [
            const Dot(C.tertiaryFixed),
            const SizedBox(width: 4),
            Expanded(
              child: Text(switch (app.phase) { Phase.down => 'SYSTEM DOWN • OFFLINE LOCAL STORAGE ACTIVE', Phase.online => 'BACK ONLINE • LOCAL REVIEW, OFFLINE STORAGE ACTIVE', Phase.ready => 'EHR NORMAL • OFFLINE LOCAL STORAGE ACTIVE' }, style: T.badge.c(C.secondaryFixed)),
            ),
            const SizedBox(width: 8),
            Tag('PRACTICE', bg: _amber, fg: C.surface, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
          ]),
        ),
        Container(
          color: C.surfaceLowest,
          padding: const EdgeInsets.fromLTRB(16, 0, 8, 0),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(app.unit, style: T.headlineSm.c(C.primary)),
                Text(me.isAdmin ? '${me.title} • Administrator' : me.title, style: T.labelSm.c(C.onSurfaceVariant)),
              ]),
            ),
            const SizedBox(width: 8),
            Tag(ok ? 'Saved on phone' : 'Saving stopped', dot: ok ? _green : C.error, bg: C.surfaceContainer, fg: ok ? C.secondary : C.error, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4)),
            Tap(
              label: '${me.title}: lock or sign out',
              onTap: onPerson,
              child: Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rFull), child: Text(me.initials, textScaler: TextScaler.noScaling, style: T.labelMd.c(C.primaryFixed))),
            ),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: TwoSides(Semantics(header: true, child: Text('Patients', style: T.headlineSm)), Text(unitShort(app.unit).toUpperCase(), style: T.unit.c(C.secondary))),
        ),
      ]),
    );
  }
}

class _Metric extends StatelessWidget {
  final String label;
  final Widget value;
  const _Metric(this.label, this.value);
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(4),
        decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase),
        child: Column(children: [Text(label, style: T.labelSm.c(C.secondary), textAlign: TextAlign.center), value]),
      );
}

class _Pill extends StatelessWidget {
  final String text;
  final bool on;
  final VoidCallback onTap;
  const _Pill(this.text, {required this.on, required this.onTap});
  @override
  Widget build(BuildContext context) => Tap(
        label: text,
        selected: on,
        onTap: onTap,
        // 30 dp pill of the export in a 48 dp touch area.
        child: Container(
          margin: const EdgeInsets.only(top: 8, bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: on ? C.primary : C.surfaceLowest, borderRadius: R.rFull, boxShadow: shadowSm),
          child: Text(text, style: T.labelMd.c(on ? C.onPrimary : C.secondary)),
        ),
      );
}

class _PatientCard extends StatelessWidget {
  final PatientFacts f;
  final bool due, verified, mine;
  final List<String> assigned;
  final VoidCallback onTap, onOptions;
  const _PatientCard(this.f, {required this.due, required this.verified, required this.mine, required this.assigned, required this.onTap, required this.onOptions});

  @override
  Widget build(BuildContext context) {
    final p = f.patient, e = f.encounter, strong = f.hasSevereAllergy;
    final code = e?.codeStatus, diet = e?.diet ?? '';
    final npo = diet.toLowerCase().contains('npo') || diet.toLowerCase().contains('nothing by mouth');
    Widget chip(String t, Color bg, Color fg) => Tag(t.toUpperCase(), bg: bg, fg: fg, style: T.badge.copyWith(fontFeatures: const []));
    final later = _laterVitals(f);
    final (footIcon, footText) = verified
        ? (Symbols.verified_user, 'Verified patient. Tap to open the chart')
        : !due && later != null
            ? (Symbols.alarm, 'Next vital signs listed for ${hm(later)}')
            : (Symbols.qr_code_scanner, 'Check wristband to chart');

    return Semantics(
      button: true,
      container: true,
      onTapHint: 'open the chart',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: DecoratedBox(
          decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowSm),
          child: ClipRRect(
            borderRadius: R.rXl,
            child: Stack(children: [
              if (strong) const Positioned(left: 0, top: 0, bottom: 0, width: 6, child: ColoredBox(color: C.error)),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Row(children: [
                    Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: strong ? C.primary : C.secondary, borderRadius: R.rBase), child: Text(f.bed, style: T.headlineSm.tr(-0.025).copyWith(fontFeatures: const []).c(strong ? C.onPrimary : C.surface))),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text.rich(TextSpan(children: [TextSpan(text: p.fullName), TextSpan(text: '  ${f.ageSex}', style: T.labelMd.c(C.secondary))]), style: T.headlineSm.c(C.primary)),
                        Text('MRN: ${p.mrn} • Adm: ${e == null ? 'not recorded' : _admitted(e.admitTime, f.nowIso)}', style: T.labelSm.c(C.onSurfaceVariant).copyWith(fontFeatures: const [])),
                      ]),
                    ),
                    const SizedBox(width: 44),
                  ]),
                  const SizedBox(height: 6),
                  Text.rich(TextSpan(children: [TextSpan(text: 'Att: ', style: T.labelMd.c(C.secondary)), TextSpan(text: '${e?.attending ?? 'not recorded'} • ${code ?? 'Code status not recorded'}')]), style: T.bodyMd),
                  const SizedBox(height: 8),
                  Wrap(spacing: 6, runSpacing: 6, children: [
                    if (f.realAllergies.isEmpty)
                      chip(f.allergyText, f.allergies.isEmpty ? _amber : C.surfaceContainer, f.allergies.isEmpty ? C.surface : C.secondary)
                    else
                      chip('${f.allergyText} ${f.realAllergies.length == 1 ? 'allergy' : 'allergies'}', C.error, C.onError),
                    if (code != null && code.toLowerCase() != 'full code') chip(code, C.primary, C.onPrimary),
                    if (e?.isolation != null) chip('${e!.isolation} isolation', _amber, C.surface),
                    if (npo) chip(diet, C.primaryContainer, C.onPrimaryContainer),
                    if (due) chip('Vitals due', C.surfaceContainer, C.secondary),
                    if (f.hasHighAlert) chip('High-alert drug', _amber, C.surface),
                    if (assigned.isNotEmpty) chip('Assigned: ${assigned.join(', ')}', strong && mine ? C.secondaryContainer : C.surfaceContainer, strong && mine ? C.onSecondaryContainer : C.secondary),
                  ]),
                  const SizedBox(height: 8),
                  _LastVitals(f),
                  const SizedBox(height: 4),
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(children: [
                      Ic(footIcon, size: 16, color: C.secondary),
                      const SizedBox(width: 4),
                      Expanded(child: Text(footText, style: T.labelSm.c(C.secondary))),
                      const Ic(Symbols.chevron_right, size: 20, color: C.secondary),
                    ]),
                  ),
                ]),
              ),
              // 36 dp button of the export inside a 48 dp touch area.
              Positioned(
                right: 6,
                top: 6,
                child: Tap(
                  label: 'Patient options ${p.fullName}',
                  onTap: onOptions,
                  child: Container(width: 36, height: 36, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rFull), child: Ic(strong ? Symbols.badge : Symbols.more_vert, size: 20, color: strong ? C.primary : C.secondary)),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  /// Next vital-sign time of today that the orders list.
  static String? _laterVitals(PatientFacts f) {
    final now = ms(f.nowIso);
    final t = <String>[
      for (final o in f.careOrders)
        if (o.text.toLowerCase().contains('vital signs'))
          for (final x in o.scheduledTimes)
            if (ms('${f.nowIso.substring(0, 10)}T$x:00${f.nowIso.substring(19)}') > now) '${f.nowIso.substring(0, 10)}T$x:00${f.nowIso.substring(19)}',
    ]..sort();
    return t.firstOrNull;
  }
}

/// Latest confirmed vital-sign record: one record, one time. Missing values are "Not assessed".
class _LastVitals extends StatelessWidget {
  final PatientFacts f;
  const _LastVitals(this.f);

  @override
  Widget build(BuildContext context) {
    final x = f.lastVitals;
    final v = x?.vital;
    final bp = v == null || (v.sys == null && v.dia == null) ? null : '${v.sys == null ? '–' : formatDose(v.sys)}/${v.dia == null ? '–' : formatDose(v.dia)}';
    final flow = v?.o2Flow;
    final tiles = [
      _tile(const TextSpan(text: 'BP'), bp, 'mmHg'),
      _tile(const TextSpan(text: 'HEART RATE'), v?.heartRate == null ? null : formatDose(v!.heartRate), 'bpm'),
      _tile(const TextSpan(text: 'SPO', children: [TextSpan(text: '2', style: TextStyle(fontSize: 8))]), v?.spo2 == null ? null : formatDose(v!.spo2), flow == null ? '%' : '% ${formatDose(flow)} L/min'),
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 4, 10, 10),
      decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TwoSides(
          Row(mainAxisSize: MainAxisSize.min, children: [
            const Ic(Symbols.history, size: 14, color: C.secondary),
            const SizedBox(width: 4),
            Flexible(child: Text(x == null ? 'Last Vitals: none recorded' : 'Last Vitals: ${sinceText(x.entry.careTime, f.nowIso)} ago', style: T.labelSm.c(C.secondary))),
          ]),
          x == null
              ? const SizedBox()
              : Row(mainAxisSize: MainAxisSize.min, children: [
                  const Dot(_green, size: 6),
                  const SizedBox(width: 4),
                  Flexible(child: Text('Saved locally (${hm(x.entry.careTime)})', style: T.labelSm.c(_green))),
                ]),
        ),
        const SizedBox(height: 8),
        if (bigText(context)) ...[
          for (final (k, t) in tiles.indexed) Padding(padding: EdgeInsets.only(top: k == 0 ? 0 : 6), child: t),
        ] else
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(flex: 37, child: tiles[0]),
            const SizedBox(width: 8),
            Expanded(flex: 31, child: tiles[1]),
            const SizedBox(width: 8),
            Expanded(flex: 32, child: tiles[2]),
          ]),
      ]),
    );
  }

  static Widget _tile(InlineSpan label, String? value, String unit) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text.rich(label, style: T.unit.c(C.secondary)),
        if (value == null)
          Text('Not assessed', style: T.bodySm.s(12, 22).c(C.onSurfaceVariant))
        else
          // A value is never broken over two lines.
          FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text.rich(TextSpan(children: [TextSpan(text: value, style: T.headlineSm.c(C.primary)), const WidgetSpan(child: SizedBox(width: 2)), TextSpan(text: unit, style: T.unit.c(C.secondary))]), softWrap: false)),
      ]);
}

/// Bottom navigation of the ward export (22 px icons, natural item widths).
class _WardNav extends StatelessWidget {
  final VoidCallback? onAdd, onHandover;
  final VoidCallback onPatients, onAlerts, onMore;
  const _WardNav({required this.onPatients, required this.onAdd, required this.onHandover, required this.onAlerts, required this.onMore});

  @override
  Widget build(BuildContext context) {
    Widget look(IconData icon, String label, {bool on = false}) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Ic(icon, size: 22, color: on ? C.primary : C.onSurfaceVariant),
            const SizedBox(height: 2),
            Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(on ? C.primary : C.onSurfaceVariant)),
          ]),
        );
    Widget item(IconData icon, String label, VoidCallback? go, {bool on = false, String reason = ''}) => Flexible(
          child: go == null
              ? Unavailable(reason: reason, child: ConstrainedBox(constraints: const BoxConstraints(minWidth: 48, minHeight: 48), child: Center(widthFactor: 1, heightFactor: 1, child: look(icon, label))))
              : Tap(label: label, selected: on, onTap: go, child: look(icon, label, on: on)),
        );
    return Container(
      decoration: const BoxDecoration(color: C.surfaceLowest, boxShadow: [BoxShadow(color: Color(0x0F1C2536), offset: Offset(0, -2), blurRadius: 12)]),
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      // Five labels must stay readable on one line.
      child: MediaQuery.withClampedTextScaling(
        maxScaleFactor: 1.2,
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
          item(Symbols.group, 'Patients', onPatients, on: true),
          item(Symbols.add_box, 'Add', onAdd, reason: 'Admins can look at charts. Only nurses add records.'),
          item(Symbols.assignment_turned_in, 'Handover', onHandover, reason: 'Shift handover is for nurses.'),
          item(Symbols.notification_important, 'Alerts', onAlerts),
          item(Symbols.more_horiz, 'More', onMore),
        ]),
      ),
    );
  }
}

/* ------------------------------ Add: choose a patient first ------------------------------ */

class _PatientPicker extends StatelessWidget {
  final List<PatientFacts> ward;
  final String? verifiedId;
  const _PatientPicker({required this.ward, required this.verifiedId});
  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const _Handle(),
        const _SheetHead(Symbols.add_box, 'Add a record: choose the patient', 'Two identifiers are checked before any entry • Practice'),
        const SizedBox(height: 8),
        if (ward.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text('No patient is on this phone.', style: T.bodyMd.c(C.onSurfaceVariant), textAlign: TextAlign.center)),
        for (final f in ward)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Tap(
              label: 'Bed ${f.bed}, ${f.patient.fullName}, MRN ${f.patient.mrn}${f.patient.id == verifiedId ? ', verified' : ''}',
              expand: true,
              onTap: () => Navigator.of(context).pop(f.patient.id),
              child: Container(
                width: double.infinity,
                constraints: const BoxConstraints(minHeight: 56),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                decoration: const BoxDecoration(color: C.surface, borderRadius: R.rLg),
                child: Row(children: [
                  Container(constraints: const BoxConstraints(minWidth: 56), alignment: Alignment.center, padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: f.hasSevereAllergy ? C.primary : C.secondary, borderRadius: R.rBase), child: Text(f.bed, style: T.labelMd.c(C.onPrimary).copyWith(fontFeatures: const []))),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text.rich(TextSpan(children: [TextSpan(text: f.patient.fullName), TextSpan(text: '  ${f.ageSex}', style: T.labelMd.c(C.secondary))]), style: T.labelMd),
                      Text('MRN: ${f.patient.mrn}${f.patient.id == verifiedId ? ' • Verified' : ''}', style: T.labelSm.c(C.onSurfaceVariant)),
                    ]),
                  ),
                  const Ic(Symbols.chevron_right, size: 20, color: C.secondary),
                ]),
              ),
            ),
          ),
      ]);
}

/* ------------------------------ Bedside Verification sheet ------------------------------ */

class _VerifySheet extends StatefulWidget {
  final PatientFacts facts;
  const _VerifySheet({required this.facts});
  @override
  State<_VerifySheet> createState() => _VerifySheetState();
}

class _VerifySheetState extends State<_VerifySheet> with _TwoIdentifiers {
  void _confirm() {
    final id = widget.facts.patient.id;
    final nav = Navigator.of(context, rootNavigator: true);
    final nurse = AppScope.read(context).user?.isNurse ?? false;
    if (!verifyNow(id)) return;
    nav.pop();
    Go.summary(nav.context, id);
    if (nurse) Go.vitals(nav.context, id);
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.facts, p = f.patient;
    final nurse = AppScope.read(context).user?.isNurse ?? false;
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const _Handle(),
      const _SheetHead(Symbols.verified_user, 'Bedside Verification', 'Confirm patient before Downtime Entry'),
      const SizedBox(height: 12),
      Box(
        color: C.surfaceLow,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TwoSides(
            Tag('Bed ${f.bed}', bg: C.primary, fg: C.onPrimary, style: T.labelMd.copyWith(fontFeatures: const [])),
            Row(mainAxisSize: MainAxisSize.min, children: [const Dot(_green), const SizedBox(width: 4), Flexible(child: Text('PRACTICE • ON THIS PHONE', style: T.badge.c(_green)))]),
          ),
          const SizedBox(height: 8),
          Text(p.fullName, style: T.headlineMd.c(C.primary)),
          Text('${f.ageSex} • DOB: ${dayLabel(p.birthDate)}', style: T.bodyMd.c(C.secondary)),
          Text('MRN: ${p.mrn}', style: T.labelMd.c(C.onSurfaceVariant)),
          const SizedBox(height: 8),
          _AllergyAlert(f, compact: true),
        ]),
      ),
      const SizedBox(height: 12),
      IdentifierChecks(compact: true, name: nameOk, mrn: mrnOk, onName: (v) => setState(() => nameOk = v), onMrn: (v) => setState(() => mrnOk = v)),
      const SizedBox(height: 16),
      if (error != null) ...[ErrorBox(error!), const SizedBox(height: 8)],
      Btn(nurse ? 'Open Quick Vital Chart' : 'Open Chart', icon: nurse ? Symbols.note_add : Symbols.folder_open, style: T.headlineSm, busy: busy, onTap: ready ? _confirm : null, reason: 'Tick both identifiers first.'),
      const SizedBox(height: 4),
      Tap(label: 'Cancel', expand: true, onTap: () => Navigator.of(context).pop(), child: Text('Cancel', style: T.headlineSm.c(C.secondary))),
    ]);
  }
}

/* ------------------------------ Verify patient ------------------------------ */

class VerifyPatientScreen extends StatefulWidget {
  final String patientId;
  final void Function(BuildContext c)? then;
  const VerifyPatientScreen({super.key, required this.patientId, this.then});
  @override
  State<VerifyPatientScreen> createState() => _VerifyPatientScreenState();
}

class _VerifyPatientScreenState extends State<VerifyPatientScreen> with _TwoIdentifiers {
  @override
  void didUpdateWidget(VerifyPatientScreen old) {
    super.didUpdateWidget(old);
    if (old.patientId != widget.patientId) resetChecks();
  }

  void _confirm() {
    final nav = Navigator.of(context, rootNavigator: true);
    if (!verifyNow(widget.patientId)) return;
    if (widget.then == null) return Go.summary(nav.context, widget.patientId);
    // This page is finished: Back must not return to an old check.
    nav.pop();
    widget.then!(nav.context);
  }

  void _toWard() {
    final nav = Navigator.of(context, rootNavigator: true);
    nav.canPop() ? Go.back(context) : Go.ward(context);
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return const ColoredBox(color: C.surface);
    final f = loadFacts(app.store, widget.patientId, app.nowIso);
    final ev = app.downtime;
    if (f == null) {
      return PhonePage(pad: const EdgeInsets.all(16), children: [const ErrorBox('This patient is not in the patient list on this phone.'), const SizedBox(height: 12), Btn('Go back to ward census', onTap: _toWard)]);
    }
    final p = f.patient, e = f.encounter;
    final taken = app.store.all('snapshot').firstOrNull?['taken_at'] as String?;
    Widget line() => Container(height: 1, color: C.surfaceHighest, margin: const EdgeInsets.only(top: 8));
    Widget cap(String t) => Text(t, style: T.labelSm.tr(0.05).c(C.secondary));

    return StatusIcons(
      light: true,
      child: PhonePage(
        statusColor: C.primaryContainer,
        header: DecoratedBox(
          decoration: const BoxDecoration(color: C.surfaceContainer, boxShadow: shadowMd),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              color: C.primaryContainer,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: TwoSides(
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Dot(C.tertiaryFixedDim),
                  const SizedBox(width: 4),
                  Flexible(child: Text(phaseRail(app.phase).toUpperCase(), style: T.badge.c(C.secondaryFixed))),
                ]),
                ev == null
                    ? const SizedBox(height: 14)
                    : Row(mainAxisSize: MainAxisSize.min, children: [
                        const Ic(Symbols.timer, size: 14, color: C.onPrimaryContainer),
                        const SizedBox(width: 4),
                        Flexible(child: Ticking(() => !app.unlocked ? '' : app.phase == Phase.down ? '${elapsedHms(ev.declaredAt, app.nowIso)} OFFLINE' : 'SINCE DOWN ${elapsedHms(ev.declaredAt, app.nowIso)}', style: T.unit.c(C.onPrimaryContainer))),
                      ]),
              ),
            ),
            Container(
              color: C.surfaceHigh,
              constraints: const BoxConstraints(minHeight: 40),
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(children: [
                const Ic(Symbols.meeting_room, size: 16, color: C.secondary),
                const SizedBox(width: 4),
                Expanded(child: Text('${unitShort(app.unit)} • Bed ${f.bed}', style: T.labelMd.copyWith(fontFeatures: const []))),
                const SizedBox(width: 8),
                Tag('PRACTICE MODE', icon: Symbols.model_training, bg: C.surfaceHighest, fg: C.onSurfaceVariant, radius: R.full, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 3)),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
              child: TwoSides(
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Ic(Symbols.lock, size: 12, color: C.onSurfaceVariant),
                  const SizedBox(width: 6),
                  Flexible(child: Text('ENCRYPTED RECORDS ON THIS PHONE', style: T.labelSm.c(C.onSurfaceVariant))),
                ]),
                Text('MRN ON RECORD', style: T.labelSm.c(C.onSurfaceVariant)),
              ),
            ),
          ]),
        ),
        pad: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl),
            child: TwoSides(
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 24, height: 24, alignment: Alignment.center, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull), child: Text('1', textScaler: TextScaler.noScaling, style: T.labelMd.c(C.onPrimary))),
                const SizedBox(width: 4),
                Flexible(child: Text('Bedside Verification', style: T.labelMd)),
              ]),
              Text('Step 1 of 2', style: T.labelSm.c(C.onSurfaceVariant)),
            ),
          ),
          const SizedBox(height: 12),
          _AllergyAlert(f),
          const SizedBox(height: 12),
          DecoratedBox(
            decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowSm),
            child: ClipRRect(
              borderRadius: R.rXl,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Container(height: 4, color: C.primary),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 28, 16, 16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 28),
                      child: Row(children: [
                        Expanded(child: Semantics(header: true, child: Text('Verify Bedside Patient', style: T.headlineSm.c(C.primary)))),
                        const Ic(Symbols.verified_user, size: 20, color: C.primary),
                      ]),
                    ),
                    const SizedBox(height: 4),
                    Text('Confirm 2 patient identifiers with wristband before recording clinical care.', style: T.bodySm.c(C.onSurfaceVariant)),
                    const SizedBox(height: 12),
                    Box(
                      color: C.surfaceLow,
                      radius: R.lg,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        cap('PATIENT FULL NAME'),
                        Text(p.fullName, style: T.vital.tr(-0.025).c(C.primary)),
                        line(),
                        const SizedBox(height: 8),
                        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              cap('DATE OF BIRTH'),
                              Text(dayLabel(p.birthDate), style: T.labelMd),
                              Text('Age ${f.age} • ${p.sex.isEmpty ? 'Sex not recorded' : '${p.sex[0].toUpperCase()}${p.sex.substring(1)}'}', style: T.bodySm.c(C.onSurfaceVariant)),
                            ]),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              cap('MRN NUMBER'),
                              Text(p.mrn, style: T.labelMd.bold.tr(0.025).c(C.primary)),
                              Text(taken == null ? 'FROM THE PATIENT LIST' : 'FROM SNAPSHOT ${hm(taken)}, ${dayLabel(taken).toUpperCase()}', style: T.badge.c(C.onSurfaceVariant)),
                            ]),
                          ),
                        ]),
                        line(),
                        const SizedBox(height: 8),
                        TwoSides(
                          Row(mainAxisSize: MainAxisSize.min, children: [
                            const SizedBox(height: 24, child: Center(child: Ic(Symbols.single_bed, size: 16, color: C.secondary))),
                            const SizedBox(width: 4),
                            Flexible(child: Text('Bed ${f.bed}', style: T.bodyMd.medium)),
                          ]),
                          Text(e?.isolation == null ? (e?.codeStatus ?? 'Code status not recorded') : '${e!.isolation} isolation', style: T.bodySm.c(C.onSurfaceVariant)),
                        ),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
                          decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rBase),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                            TwoSides(Text('Attending', style: T.labelSm.c(C.onSurfaceVariant)), Text(e?.attending ?? 'Not recorded', style: T.labelMd.medium)),
                            const SizedBox(height: 4),
                            TwoSides(Text('Admitted', style: T.labelSm.c(C.onSurfaceVariant)), Text(e == null ? 'Not recorded' : dateTimeLabel(e.admitTime), style: T.bodySm.c(C.onSurfaceVariant))),
                          ]),
                        ),
                      ]),
                    ),
                    const SizedBox(height: 12),
                    IdentifierChecks(name: nameOk, mrn: mrnOk, onName: (v) => setState(() => nameOk = v), onMrn: (v) => setState(() => mrnOk = v)),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: C.secondaryContainer.withValues(alpha: 0.5), borderRadius: R.rBase),
                      child: Row(children: [
                        const Ic(Symbols.privacy_tip, size: 16, color: C.onSecondaryContainer),
                        const SizedBox(width: 8),
                        Expanded(child: Text('This check is written to the change log on this phone, with your name and the time.', style: T.bodySm.c(C.onSecondaryContainer))),
                      ]),
                    ),
                  ]),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 16),
          if (error != null) ...[ErrorBox(error!), const SizedBox(height: 8)],
          DecoratedBox(
            decoration: BoxDecoration(boxShadow: ready ? shadowMd : null),
            child: Btn('Confirm Patient & Open Chart', icon: Symbols.assignment_turned_in, busy: busy, onTap: ready ? _confirm : null),
          ),
          if (!nameOk || !mrnOk) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Tick both identifiers first.', style: T.labelSm.c(C.onSurfaceVariant), textAlign: TextAlign.center)),
          const SizedBox(height: 8),
          Unavailable(
            reason: 'Barcode scanning is not available. Check the two identifiers by hand.',
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rBase),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Ic(Symbols.qr_code_scanner, size: 18, color: C.onSurfaceVariant),
                const SizedBox(width: 4),
                Flexible(child: Text('Scan Wristband Barcode (Not Available)', style: T.labelMd.c(C.onSurfaceVariant), textAlign: TextAlign.center)),
              ]),
            ),
          ),
          const SizedBox(height: 2),
          Tap(
            expand: true,
            label: 'Go back to ward census',
            onTap: _toWard,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Ic(Symbols.arrow_back, size: 14, color: C.secondary),
              const SizedBox(width: 4),
              Flexible(
                child: Container(
                  padding: const EdgeInsets.only(bottom: 1),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: C.secondary))),
                  child: Text('Go back to ward census', style: T.labelMd.c(C.secondary)),
                ),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}
