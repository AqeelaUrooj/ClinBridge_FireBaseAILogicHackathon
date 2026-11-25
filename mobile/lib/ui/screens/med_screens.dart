import 'dart:async';

import 'package:flutter/material.dart';

import '../../config/policy.dart';
import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/repos/entries.dart';
import '../../data/repos/ops.dart' as ops;
import '../../data/schema.dart';
import '../../domain/facts.dart';
import '../../domain/meds.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';
import 'patient_screens.dart' show queueCount;

/* ------------------------------ Shared small pieces ------------------------------ */

const _amber = Color(0xFFFCD34D); // amber-300 of the exports
const _emerald = Color(0xFF059669);

String _cap(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
String _initials(String name) => name.split(' ').where((w) => w.isNotEmpty).map((w) => w[0]).take(2).join().toUpperCase();
String _routeText(String? r) => r == null ? 'Route not on order' : _cap(kRouteLabel[r] ?? r);
String _phaseText(AppState a) => switch (a.phase) { ops.Phase.down => 'EHR Downtime Active', ops.Phase.online => 'Back Online', ops.Phase.ready => 'Normal Operation' };
String _dayWord(String iso, String nowIso) => iso.substring(0, 10) == nowIso.substring(0, 10) ? 'Today' : dayLabel(iso);
bool _due(String time, String nowIso) => ms(time) <= ms(nowIso);

/// Upper width limit for a side element, as a share of the phone width.
Widget _cap2(BuildContext c, double share, Widget child) => ConstrainedBox(constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(c).width * share), child: child);

Doc? _holdOf(AppState a, String orderId) => a.store.where('m_order_hold', 'order_id', orderId).where((h) => h['released_at'] == null).firstOrNull;

/// The stored order, only when it is a medicine order of exactly this patient.
ActiveOrder? _orderOf(AppState a, String patientId, String orderId) {
  final row = a.store.get('active_order', orderId);
  if (row == null) return null;
  final o = ActiveOrder(row);
  return a.store.get('encounter', o.encounterId)?['patient_id'] == patientId && isMedOrder(o) ? o : null;
}

void _toMar(BuildContext c) => Navigator.of(c, rootNavigator: true).popUntil((r) => r.settings.name == 'mar' || r.isFirst);

Future<T?> _sheet<T>(BuildContext c, WidgetBuilder b) => showModalBottomSheet<T>(
      context: c,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      elevation: 0,
      barrierColor: C.primaryContainer.withValues(alpha: 0.6),
      builder: (x) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(x).bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(x).height * 0.9),
          child: Container(
            width: double.infinity,
            decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
            child: SafeArea(top: false, child: SingleChildScrollView(padding: const EdgeInsets.all(S.lg), child: b(x))),
          ),
        ),
      ),
    );

/// Grab handle, title and close button of the exports' drawers.
class _SheetTop extends StatelessWidget {
  final String title;
  const _SheetTop(this.title);
  @override
  Widget build(BuildContext context) => Column(children: [
        Container(width: 48, height: 6, decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rFull)),
        const SizedBox(height: S.md),
        Row(children: [
          Expanded(child: Text(title, style: T.headlineMd)),
          Tap(label: 'Close', onTap: () => Navigator.pop(context), child: const Ic(Symbols.close, size: 24, color: C.onSurfaceVariant)),
        ]),
        const SizedBox(height: 8),
      ]);
}

class _Avatar extends StatelessWidget {
  final String name;
  const _Avatar(this.name);
  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Signed in: $name',
        excludeSemantics: true,
        child: Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rFull),
          child: FittedBox(fit: BoxFit.scaleDown, child: Text(_initials(name), style: T.labelSm.bold.c(C.onSecondaryContainer))),
        ),
      );
}

/// Elapsed downtime, counted from the stored start time.
class _Elapsed extends StatefulWidget {
  final String fromIso;
  final Widget Function(String text) builder;
  const _Elapsed(this.fromIso, this.builder);
  @override
  State<_Elapsed> createState() => _ElapsedState();
}

class _ElapsedState extends State<_Elapsed> {
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(elapsedHms(widget.fromIso, AppScope.read(context).nowIso));
}

/// Header of the record screens: back, title, patient, PRACTICE, signed-in person.
class _TopBar extends StatelessWidget {
  final String title, sub;
  const _TopBar(this.title, this.sub);
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    return Container(
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 2),
      decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0F1C2536), offset: Offset(0, 1), blurRadius: 8)]),
      child: Row(children: [
        Tap(label: 'Go back', onTap: () => Go.back(context), child: const Ic(Symbols.arrow_back, size: 24)),
        Expanded(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: T.headlineSm.tr(-0.025), maxLines: 2, overflow: TextOverflow.ellipsis),
            Text(sub, style: T.labelSm.c(C.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
          ]),
        ),
        const SizedBox(width: 8),
        _cap2(context, 0.28, Tag('PRACTICE', icon: Symbols.lock, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2))),
        const SizedBox(width: 8),
        _Avatar(a.user?.name ?? ''),
      ]),
    );
  }
}

/// Error text in the exports' red block. Always the real message.
class _ErrorBox extends StatelessWidget {
  final String text;
  const _ErrorBox(this.text);
  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.all(S.sm),
          decoration: const BoxDecoration(color: C.errorContainer, borderRadius: R.rBase),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Ic(Symbols.error, size: 18, color: C.onErrorContainer),
            const SizedBox(width: 6),
            Expanded(child: Text(text, style: T.bodySm.c(C.onErrorContainer))),
          ]),
        ),
      );
}

class _KV extends StatelessWidget {
  final String k, v;
  final TextStyle? style;
  const _KV(this.k, this.v, {this.style});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 104, child: Text(k, style: T.labelSm.c(C.onSurfaceVariant).s(12, 20))),
          Expanded(child: Text(v, style: style ?? T.bodyMd.semi)),
        ]),
      );
}

class _ChipPick extends StatelessWidget {
  final String text;
  final bool on;
  final VoidCallback? onTap;
  const _ChipPick(this.text, {required this.on, required this.onTap});
  @override
  Widget build(BuildContext context) => Tap(
        label: text,
        selected: on,
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: on ? C.primary : C.surfaceHigh, borderRadius: R.rLg),
          child: Text(text, style: T.labelMd.c(on ? C.onPrimary : C.onSurfaceVariant)),
        ),
      );
}

Widget _raised(Widget child, {List<BoxShadow> shadow = shadowSm, BorderRadius radius = R.rXl}) => DecoratedBox(decoration: BoxDecoration(borderRadius: radius, boxShadow: shadow), child: child);

/* ------------------------------ Medication schedule (MAR) ------------------------------ */

class MarScreen extends StatefulWidget {
  final String patientId;
  const MarScreen({super.key, required this.patientId});
  @override
  State<MarScreen> createState() => _MarScreenState();
}

class _MarScreenState extends State<MarScreen> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = loadFacts(a.store, widget.patientId, a.nowIso);
    if (f == null) return const PhonePage(children: [_ErrorBox('This patient is not in the patient list.')]);
    final now = f.nowIso;
    final tests = <String, bool Function(ActiveOrder)>{
      'all': (_) => true,
      'due': (o) => f.due.any((d) => d.order.id == o.id && _due(d.time, now)),
      'high': (o) => isHighAlert(o.drugName),
      'prn': (o) => orderGroup(o) == OrderGroup.prn,
    };
    int n(String k) => f.medOrders.where(tests[k]!).length;
    final tabs = [('all', 'All (${n('all')})'), ('due', 'Due Now (${n('due')})'), ('high', 'High-Alert (${n('high')})'), ('prn', 'PRN (${n('prn')})')];
    final shown = f.medOrders.where(tests[_filter]!).toList();
    List<ActiveOrder> of(OrderGroup g) => [for (final o in shown) if (orderGroup(o) == g) o];
    final sched = of(OrderGroup.scheduled)..sort((x, y) => _rank(a, f, x).compareTo(_rank(a, f, y)));
    final inf = of(OrderGroup.infusion), prn = of(OrderGroup.prn);
    final drip = f.infusions.where((o) => isHighAlert(o.drugName)).firstOrNull ?? f.infusions.firstOrNull;
    final m = _MarActions(context, f);
    Text orders(int n) => Text('$n Order${n == 1 ? '' : 's'}', style: T.labelSm.c(C.onSurfaceVariant));

    return PhonePage(
      header: _header(context, a, f),
      pad: const EdgeInsets.fromLTRB(S.md, 0, S.md, 32),
      nav: BottomNav(fabIndex: 2, [
        NavItem(Symbols.monitor_heart, 'Summary', () => Go.back(context)),
        NavItem(Symbols.receipt_long, 'History', () => Go.history(context, widget.patientId)),
        NavItem(Symbols.add, 'Add bedside data', m.nurse ? () => Go.addSheet(context, widget.patientId) : () => toast(context, 'Only nurses can record care.', icon: Symbols.info)),
        NavItem(Symbols.cloud_off, 'Queue (${queueCount(a, f)})', () => Go.queue(context, patientId: widget.patientId)),
        NavItem(Symbols.checklist_rtl, 'Protocols', () => Go.checklist(context)),
      ]),
      children: [
        _strip(a),
        const SizedBox(height: S.sm),
        _identity(f),
        const SizedBox(height: S.sm),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(children: [
              for (final (i, t) in tabs.indexed) ...[
                if (i > 0) const SizedBox(width: 6),
                Tap(
                  label: t.$2,
                  selected: _filter == t.$1,
                  onTap: () => setState(() => _filter = t.$1),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 48),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    decoration: BoxDecoration(color: _filter == t.$1 ? C.primary : C.surfaceHigh, borderRadius: R.rFull, boxShadow: _filter == t.$1 ? shadowSm : null),
                    child: Center(widthFactor: 1, heightFactor: 1, child: Text(t.$2, style: T.labelMd.c(_filter == t.$1 ? C.onPrimary : C.onSurfaceVariant))),
                  ),
                ),
              ],
            ]),
          ),
        ),
        const SizedBox(height: S.sm),
        if (shown.isEmpty)
          Box(
            shadow: true,
            pad: const EdgeInsets.all(S.lg),
            child: Column(children: [
              const Ic(Symbols.medication, size: 28, color: C.slate),
              const SizedBox(height: 8),
              Text(f.medOrders.isEmpty ? 'No medicine orders in the patient list.' : 'No order matches this filter.', style: T.bodyMd.c(C.onSurfaceVariant), textAlign: TextAlign.center),
              if (_filter != 'all') ...[const SizedBox(height: 8), Btn('Show all orders', kind: BtnKind.quiet, radius: R.xl, onTap: () => setState(() => _filter = 'all'))],
            ]),
          ),
        if (sched.isNotEmpty) _Section(Symbols.schedule, 'Scheduled Medications', trailing: orders(sched.length), cards: [for (final o in sched) _SchedCard(o, m)]),
        if (inf.isNotEmpty)
          _Section(Symbols.water_ph, 'Continuous Infusions & Drips', iconColor: C.error, trailing: inf.any((o) => isHighAlert(o.drugName)) ? const Tag('High-Alert', bg: C.errorContainer, fg: C.onErrorContainer) : null, cards: [for (final o in inf) _DripCard(o, m)]),
        if (prn.isNotEmpty) _Section(Symbols.medication, 'PRN Medications (As Needed)', trailing: orders(prn.length), cards: [for (final o in prn) _PrnCard(o, m)]),
        if (f.medOrders.isNotEmpty) ...[
          const SizedBox(height: S.sm + S.xs),
          Box(
            color: C.surfaceLow,
            pad: const EdgeInsets.all(S.sm),
            child: Row(children: [
              Expanded(child: _raised(Btn('Record Med Event', icon: Symbols.bolt, radius: R.xl, style: T.labelMd.semi, onTap: m.pick), shadow: shadowMd)),
              if (drip != null) ...[
                const SizedBox(width: 12),
                _cap2(
                  context,
                  0.42,
                  IntrinsicWidth(
                    child: _raised(
                      Btn('${(drip.drugName ?? drip.text).split(' ').first} Drip', icon: Symbols.water_drop, iconSize: 18, kind: isHighAlert(drip.drugName) ? BtnKind.danger : BtnKind.navy, radius: R.xl, style: T.labelMd.semi, onTap: () => m.rate(drip)),
                      shadow: shadowMd,
                    ),
                  ),
                ),
              ],
            ]),
          ),
        ],
      ],
    );
  }

  /// Due now first, then on hold, then later times, then already recorded.
  int _rank(AppState a, PatientFacts f, ActiveOrder o) {
    if (_holdOf(a, o.id) != null) return 1;
    final due = f.due.where((d) => d.order.id == o.id);
    return due.any((d) => _due(d.time, f.nowIso)) ? 0 : due.isNotEmpty ? 2 : 3;
  }

  Widget _header(BuildContext context, AppState a, PatientFacts f) {
    final ev = a.downtime;
    return Container(
      constraints: const BoxConstraints(minHeight: 112),
      padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 4),
      decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0F1C2536), offset: Offset(0, 1), blurRadius: 8)]),
      child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Row(children: [
          Dot(ev == null ? C.saved : C.error, size: 10),
          const SizedBox(width: 8),
          Expanded(
            child: Row(children: [
              Flexible(child: Text(_phaseText(a).toUpperCase(), style: T.badge.c(ev == null ? C.saved : C.error))),
              if (ev != null) ...[const SizedBox(width: 8), _Elapsed(ev.declaredAt, (t) => Tag(t, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)))],
            ]),
          ),
          const SizedBox(width: 8),
          _cap2(context, 0.34, Tag('Local Encrypted', icon: Symbols.encrypted, bg: C.tertiaryFixed, fg: C.onTertiaryFixed, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2))),
          const SizedBox(width: 8),
          _Avatar(a.user?.name ?? ''),
        ]),
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text('Medication Schedule', style: T.headlineSm.tr(-0.025)),
                Text('Bed ${f.bed}', style: T.labelSm.c(C.onSurfaceVariant)),
              ]),
              Text('DOB: ${dayLabel(f.patient.birthDate)} • MRN: ${f.patient.mrn}', style: T.bodySm.c(C.onSurfaceVariant)),
            ]),
          ),
          if (f.realAllergies.isNotEmpty) _cap2(context, 0.3, Tag(f.realAllergies.first.substance.toUpperCase(), bg: C.error, fg: C.onError, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 4))),
          const SizedBox(width: 4),
          Tap(label: 'Patient details', onTap: () => _sheet<void>(context, (_) => _PatientSheet(f)), child: const Ic(Symbols.info, size: 20, color: C.onSurfaceVariant)),
        ]),
      ]),
    );
  }

  Widget _strip(AppState a) {
    final ev = a.downtime;
    return Box(
      color: C.primaryContainer,
      pad: const EdgeInsets.all(S.sm),
      shadow: true,
      child: Column(children: [
        Row(children: [
          Dot(ev == null ? C.tertiaryFixed : C.error),
          const SizedBox(width: 4),
          Expanded(child: Text('${_phaseText(a).toUpperCase()}${ev == null ? '' : ' (${elapsedHms(ev.declaredAt, a.nowIso).substring(0, 5)})'}', style: T.badge.c(ev == null ? C.tertiaryFixed : C.error))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: _amber.withValues(alpha: 0.2), borderRadius: R.rFull, border: Border.all(color: _amber.withValues(alpha: 0.4))),
            child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.science, size: 14, color: _amber), const SizedBox(width: 4), Text('PRACTICE', style: T.badge.s(10, 14).c(_amber))]),
          ),
        ]),
        const SizedBox(height: 4),
        Row(children: [
          const Ic(Symbols.lock, size: 13, color: C.tertiaryFixed),
          const SizedBox(width: 4),
          Expanded(child: Text('Encrypted on this phone', style: T.labelSm.c(C.onPrimaryContainer))),
          const SizedBox(width: 8),
          Text('Fictional patients', style: T.labelSm.c(_amber)),
        ]),
      ]),
    );
  }

  Widget _identity(PatientFacts f) {
    final al = f.realAllergies.firstOrNull;
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(f.patient.fullName, style: T.headlineSm),
                Tag(f.bed, style: T.labelMd, fg: C.onSurface, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
              ]),
              const SizedBox(height: 2),
              Text('MRN: ${f.patient.mrn} • DOB: ${dayLabel(f.patient.birthDate)} (${f.age}y ${f.patient.sexLetter})', style: T.bodySm.c(C.onSurfaceVariant)),
            ]),
          ),
          const SizedBox(width: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 140),
            child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Tag((al == null ? f.allergyText : al.reaction ?? 'Allergy').toUpperCase(), bg: al == null ? C.surfaceHigh : C.error, fg: al == null ? C.onSurfaceVariant : C.onError),
              if (al != null) ...[const SizedBox(height: 4), Text('${al.substance} Allergy', style: T.labelSm.semi.c(C.error), textAlign: TextAlign.end)],
              if (f.realAllergies.length > 1) Text('also ${f.realAllergies.skip(1).map((x) => x.substance).join(', ')}', style: T.labelSm.c(C.error), textAlign: TextAlign.end),
            ]),
          ),
        ]),
        const SizedBox(height: S.sm),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(color: C.secondaryContainer.withValues(alpha: 0.4), borderRadius: R.rLg),
          child: Row(children: [
            const Ic(Symbols.verified_user, size: 16, color: C.secondary),
            const SizedBox(width: 8),
            Expanded(child: Text('Medicine records are saved on this phone only. Nothing is sent to another system.', style: T.bodySm.c(C.onSecondaryContainer))),
          ]),
        ),
      ]),
    );
  }
}

class _PatientSheet extends StatelessWidget {
  final PatientFacts f;
  const _PatientSheet(this.f);
  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const _SheetTop('Patient Details'),
        _KV('Name', f.patient.fullName),
        _KV('Born', '${dayLabel(f.patient.birthDate)} (${f.ageSex})'),
        _KV('MRN', f.patient.mrn),
        _KV('Bed', '${f.bed} • ${f.encounter?.unit ?? ''}'),
        _KV('Admitted', dateTimeLabel(f.encounter?.admitTime)),
        _KV('Attending', f.encounter?.attending ?? 'Not recorded'),
        _KV('Code status', f.encounter?.codeStatus ?? 'Not recorded'),
        _KV('Allergies', f.realAllergies.isEmpty ? f.allergyText : f.realAllergies.map((a) => '${a.substance} (${[a.reaction, a.severity].whereType<String>().join(', ')})').join('\n'), style: T.bodyMd.semi.c(f.realAllergies.isEmpty ? C.onSurface : C.error)),
      ]);
}

class _Section extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final Widget? trailing;
  final List<Widget> cards;
  const _Section(this.icon, this.title, {this.iconColor = C.secondary, this.trailing, required this.cards});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: S.md),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(children: [
              Ic(icon, size: 18, color: iconColor),
              const SizedBox(width: 6),
              Expanded(child: Text(title, style: T.headlineSm)),
              if (trailing != null) trailing!,
            ]),
          ),
          for (final c in cards) ...[const SizedBox(height: S.sm), c],
        ]),
      );
}

/// What a tap on the schedule does. Locks are checked here, again on the form and again inside the save.
class _MarActions {
  final BuildContext context;
  final PatientFacts f;
  _MarActions(this.context, this.f);
  AppState get a => AppScope.read(context);
  bool get nurse => a.user?.isNurse ?? false;
  String get pid => f.patient.id;

  static const why = 'Only nurses can record medicines. You can look at the schedule.';
  bool _ok() {
    if (!nurse) toast(context, why, icon: Symbols.info);
    return nurse;
  }

  List<Slot> slots(ActiveOrder o) => slotStatuses(o, f.nowIso, f.meds);
  List<Slot> open(ActiveOrder o) => [for (final s in slots(o)) if (s.status == 'due') s];
  List<DoseLock> locks(ActiveOrder o, String? slot) => doseLocks(a.store, o, listPatientEntries(a.store, pid), careTime: a.nowIso, scheduledTime: slot);

  void details(ActiveOrder o) => _sheet<void>(context, (_) => _OrderSheet(o, this));
  void pick() => _sheet<void>(context, (_) => _PickSheet(this));
  void entry(String id) => Go.entry(context, pid, id);

  /// Record administration: lock check, then the confirmation drawer, then the form.
  Future<void> give(ActiveOrder o, {String? slot, bool ask = true}) async {
    if (!_ok()) return;
    final found = locks(o, slot);
    if (found.isNotEmpty) return Go.conflict(context, pid, o.id, scheduledTime: slot, locks: found);
    if (!ask) return Go.medEvent(context, pid, o.id, event: 'administered', scheduledTime: slot);
    final r = await _sheet<(String, String?)>(context, (_) => _AdminSheet(o, this, slot));
    if (r == null || !context.mounted) return;
    if (r.$1 == 'administered') {
      final again = locks(o, r.$2);
      if (again.isNotEmpty) return Go.conflict(context, pid, o.id, scheduledTime: r.$2, locks: again);
    }
    return Go.medEvent(context, pid, o.id, event: r.$1, scheduledTime: r.$2);
  }

  void other(ActiveOrder o, String event, {String? slot}) {
    if (_ok()) Go.medEvent(context, pid, o.id, event: event, scheduledTime: slot);
  }

  void rate(ActiveOrder o) => other(o, 'rate_changed');
}

/// Order text without the drug name in front (the full text is in the order details).
String _rest(ActiveOrder o) {
  final d = o.drugName ?? '';
  var s = o.text;
  if (d.isNotEmpty && s.toLowerCase().startsWith(d.toLowerCase())) s = s.substring(d.length).replaceFirst(RegExp(r'^\s*infusion\s*,'), '').trim();
  return s.isEmpty ? o.text : _cap(s);
}

String _orderLine(ActiveOrder o) => [[orderDose(o), o.route ?? ''].where((x) => x.isNotEmpty).join(' '), o.frequency ?? ''].where((x) => x.isNotEmpty).join(' • ');

class _MedCard extends StatelessWidget {
  final Color color;
  final List<Widget> children;
  final bool rail;
  const _MedCard({this.color = C.surfaceLowest, this.rail = false, required this.children});
  @override
  Widget build(BuildContext context) => Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: color, borderRadius: R.rXl, boxShadow: shadowSm),
        child: Stack(children: [
          if (rail) const Positioned(left: 0, top: 0, bottom: 0, width: 6, child: ColoredBox(color: C.error)),
          Padding(padding: EdgeInsets.fromLTRB(rail ? 16 : 12, 12, 12, 12), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children)),
        ]),
      );
}

Widget _badges(Tag tag, String side) => Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [tag, if (side.isNotEmpty) Text(side, style: T.labelSm.c(C.onSurfaceVariant))]);

Widget _small(IconData icon, String text, {double size = 15, double gap = 8}) =>
    Row(children: [Ic(icon, size: size, color: C.secondary), SizedBox(width: gap), Expanded(child: Text(text, style: T.bodySm.c(C.onSurfaceVariant)))]);

class _SchedCard extends StatelessWidget {
  final ActiveOrder o;
  final _MarActions m;
  const _SchedCard(this.o, this.m);
  @override
  Widget build(BuildContext context) {
    final a = m.a, f = m.f, now = f.nowIso;
    final slots = m.slots(o), open = m.open(o);
    final dueNow = [for (final s in open) if (_due(s.time, now)) s];
    final name = Text(o.drugName ?? o.text, style: T.headlineSm);
    final line = _orderLine(o);
    final hold = _holdOf(a, o.id);
    final high = isHighAlert(o.drugName) ? const Padding(padding: EdgeInsets.only(top: 4), child: Align(alignment: Alignment.centerLeft, child: Tag('HIGH-ALERT • SECOND NURSE', bg: C.errorContainer, fg: C.onErrorContainer))) : null;

    if (hold != null) {
      return _MedCard(color: Color.alphaBlend(C.errorContainer.withValues(alpha: 0.2), C.surface), children: [
        _badges(const Tag('HELD • ORDER ON HOLD', bg: C.error, fg: C.onError), open.isEmpty ? '' : 'Sched: ${hm(open.first.time)}'),
        const SizedBox(height: 4),
        name,
        Text(line, style: T.bodyMd.semi),
        if (high != null) high,
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(color: C.errorContainer.withValues(alpha: 0.6), borderRadius: R.rBase),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Ic(Symbols.warning, size: 18, color: C.error),
            const SizedBox(width: 6),
            Expanded(child: Text('${hold['reason'] ?? 'This order has a Practice hold.'}', style: T.bodySm.c(C.onErrorContainer))),
          ]),
        ),
        const SizedBox(height: S.md),
        Row(children: [
          Expanded(
            child: Unavailable(
              reason: 'A physician override is not available: no override workflow is approved. Ask the prescriber using your downtime process.',
              child: _raised(Btn('Physician Override', icon: Symbols.verified, iconSize: 18, kind: BtnKind.white, fg: C.error, radius: R.xl, style: T.labelMd.semi, onTap: () {})),
            ),
          ),
          const SizedBox(width: 8),
          _cap2(context, 0.36, IntrinsicWidth(child: Btn('Order Details', kind: BtnKind.quiet, fg: C.onSurfaceVariant, radius: R.xl, onTap: () => m.details(o)))),
        ]),
      ]);
    }

    final draft = orderHistory(o, f.meds).where((x) => x.entry.isDraft).firstOrNull;
    final last = lastGiven(o, f.meds);
    final lastText = last == null ? 'Last given: no record yet' : 'Last given: ${hm(last.entry.careTime)} (${_dayWord(last.entry.careTime, now)})';
    if (open.isEmpty && slots.isNotEmpty && draft == null) {
      final s = slots.last;
      final given = s.status == 'given';
      return Opacity(
        opacity: 0.9,
        child: _MedCard(children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _badges(Tag('${s.status.toUpperCase()} • ${hm(s.time)}', bg: given ? C.tertiaryFixed : C.surfaceHighest, fg: given ? C.onTertiaryFixed : C.onSurface), _cap(o.frequency ?? '')),
                const SizedBox(height: 4),
                name,
                Text(line, style: T.bodyMd),
                const SizedBox(height: 4),
                Text('${given ? 'Administered' : _cap(s.status)} ${hm(s.entry!.careTime)} by ${staffShort(a.store, s.entry!.performerId)} (Saved on this phone)', style: T.bodySm.c(C.onSurfaceVariant)),
              ]),
            ),
            const SizedBox(width: 8),
            Tap(
              label: 'Order details of ${o.drugName ?? o.text}',
              onTap: () => m.details(o),
              child: Container(width: 32, height: 32, decoration: BoxDecoration(color: given ? C.tertiaryFixed : C.surfaceHighest, borderRadius: R.rFull), child: Ic(given ? Symbols.check : Symbols.pause, size: 18, color: given ? C.onTertiaryFixed : C.onSurfaceVariant)),
            ),
          ]),
        ]),
      );
    }
    final slot = dueNow.firstOrNull ?? open.firstOrNull;
    final tag = draft != null
        ? Tag('DRAFT • ${hm(draft.entry.careTime)}', bg: C.secondaryContainer, fg: C.onSecondaryContainer)
        : dueNow.isNotEmpty
            ? Tag('DUE NOW • ${hm(slot!.time)}', bg: C.errorContainer, fg: C.onErrorContainer)
            : Tag(slot == null ? 'NO TIME ON ORDER' : 'DUE • ${hm(slot.time)}');
    final more = [for (final s in slots) if (s.time != slot?.time) '${hm(s.time)} ${s.status}'];
    return _MedCard(children: [
      _badges(tag, _routeText(o.route)),
      const SizedBox(height: 4),
      name,
      Text(line, style: T.bodyMd.semi),
      if (high != null) high,
      const SizedBox(height: 8),
      _small(Symbols.history, '$lastText${more.length > 1 ? ' • ${more.join(', ')}' : ''}'),
      const SizedBox(height: S.md + S.xs),
      if (draft != null) ...[
        Btn('Check Draft Record', icon: Symbols.rule, kind: BtnKind.quiet, radius: R.xl, style: T.labelMd.semi, onTap: () => m.entry(draft.entry.id)),
        const SizedBox(height: 8),
      ],
      Btn('Record Administration', key: ValueKey('give-${o.id}'), icon: Symbols.check_circle, kind: dueNow.isNotEmpty ? BtnKind.primary : BtnKind.quiet, radius: R.xl, style: T.labelMd.semi, onTap: m.nurse && (slot != null || slots.isEmpty) ? () => m.give(o, slot: slot?.time) : null, reason: m.nurse ? 'Every due time of today has a record or a waiting draft.' : _MarActions.why),
      if (!m.nurse) ...[const SizedBox(height: 8), Btn('Order Details', kind: BtnKind.quiet, radius: R.xl, onTap: () => m.details(o))],
    ]);
  }
}

class _DripCard extends StatelessWidget {
  final ActiveOrder o;
  final _MarActions m;
  const _DripCard(this.o, this.m);
  @override
  Widget build(BuildContext context) {
    final f = m.f;
    final high = isHighAlert(o.drugName);
    final (rate, unit) = currentRate(o, f.meds);
    final lastRate = orderHistory(o, f.meds).where((x) => x.entry.isConfirmed && x.med.event == 'rate_changed').firstOrNull;
    final hold = _holdOf(m.a, o.id);
    return _MedCard(rail: high, children: [
      Row(children: [
        Expanded(child: Align(alignment: Alignment.centerLeft, child: high ? const Tag('HIGH-ALERT • INDEPENDENT DOUBLE-CHECK', bg: C.error, fg: C.onError) : const Tag('CONTINUOUS'))),
        const SizedBox(width: 4),
        Dot(hold != null ? C.error : _emerald),
        const SizedBox(width: 4),
        Text(hold != null ? 'ON HOLD' : 'ORDER ACTIVE', style: T.badge.c(C.tertiary)),
      ]),
      const SizedBox(height: 8),
      Tap(
        label: 'Order details of ${o.drugName ?? o.text}',
        onTap: () => m.details(o),
        expand: true,
        child: Align(
          alignment: Alignment.centerLeft,
          heightFactor: 1,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${o.drugName ?? o.text} Infusion', style: T.headlineSm),
            Text(_rest(o), style: T.bodyMd.semi),
          ]),
        ),
      ),
      if (hold != null) ...[const SizedBox(height: 8), _ErrorBox('${hold['reason'] ?? 'This order has a Practice hold.'}')],
      const SizedBox(height: 12),
      Box(
        color: C.surfaceLow,
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Current Infusion Rate', style: T.labelSm.c(C.onSurfaceVariant)),
              Text.rich(TextSpan(text: rate == null ? '—' : grouped(rate), children: [TextSpan(text: ' ${unit ?? ''}', style: T.unit.c(C.onSurfaceVariant))]), style: T.vital),
            ]),
          ),
          const SizedBox(width: 8),
          _cap2(
            context,
            0.36,
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('Rate On Order', style: T.labelSm.c(C.onSurfaceVariant)),
              Text(o.dose == null ? 'Not on order' : '${grouped(o.dose)} ${o.doseUnit ?? ''}', style: T.labelMd.bold, textAlign: TextAlign.end),
            ]),
          ),
        ]),
      ),
      const SizedBox(height: 8),
      _small(Symbols.timer, lastRate == null ? 'No rate change recorded. Starting rate from the order.' : 'Last rate record: ${hm(lastRate.entry.careTime)} (${[staffShort(m.a.store, lastRate.entry.performerId), if (lastRate.med.doubleCheckedBy != null) 'checked by ${staffShort(m.a.store, lastRate.med.doubleCheckedBy)}'].join(', ')})', gap: 4),
      const SizedBox(height: S.md),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(child: _raised(Btn(high ? 'Rate Change / Co-Sign' : 'Rate Change', key: ValueKey('rate-${o.id}'), icon: Symbols.sync_alt, iconSize: 18, kind: BtnKind.navy, radius: R.xl, style: T.labelMd.semi, onTap: m.nurse ? () => m.rate(o) : null))),
        const SizedBox(width: 8),
        Unavailable(
          reason: 'The app does not control pumps. Pause the pump at the bedside and record what you did.',
          child: Container(height: 48, padding: const EdgeInsets.symmetric(horizontal: 14), decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rXl), child: const Center(widthFactor: 1, child: Ic(Symbols.pause, size: 20))),
        ),
      ]),
    ]);
  }
}

class _PrnCard extends StatelessWidget {
  final ActiveOrder o;
  final _MarActions m;
  const _PrnCard(this.o, this.m);
  @override
  Widget build(BuildContext context) {
    final f = m.f, now = f.nowIso;
    final high = isHighAlert(o.drugName);
    final last = lastGiven(o, f.meds);
    final locks = m.locks(o, null);
    final draft = orderHistory(o, f.meds).where((x) => x.entry.isDraft).firstOrNull;
    final tag = draft != null
        ? Tag('DRAFT • ${hm(draft.entry.careTime)}', bg: C.secondaryContainer, fg: C.onSecondaryContainer)
        : locks.isNotEmpty
            ? Tag('LOCKED • ${locks.first.kind == 'hold' ? 'ON HOLD' : 'INTERVAL'}', bg: C.error, fg: C.onError)
            : high
                ? const Tag('HIGH-ALERT', bg: C.errorContainer, fg: C.onErrorContainer)
                : const Tag('AS NEEDED');
    final lastText = last == null ? 'Last given: no record yet' : 'Last given: ${hm(last.entry.careTime)} (${sinceText(last.entry.careTime, now)} ago)';
    return _MedCard(children: [
      _badges(tag, _cap(o.frequency ?? 'as needed')),
      const SizedBox(height: 4),
      Text(o.drugName ?? o.text, style: T.headlineSm),
      Text(_rest(o), style: T.bodyMd.semi),
      const SizedBox(height: 4),
      Text(lastText, style: T.bodySm.c(C.onSurfaceVariant)),
      if (high) ...[const SizedBox(height: 4), _small(Symbols.pin, 'Requires 2nd nurse witness PIN before it is saved', size: 14, gap: 4)],
      const SizedBox(height: S.md),
      if (draft != null) ...[
        Btn('Check Draft Record', icon: Symbols.rule, kind: BtnKind.quiet, radius: R.xl, style: T.labelMd.semi, onTap: () => m.entry(draft.entry.id)),
        const SizedBox(height: 8),
      ],
      Btn(high ? 'Witness Co-Sign & Administer' : 'Administer PRN Dose', key: ValueKey('give-${o.id}'), icon: high ? Symbols.badge : Symbols.add_circle, iconSize: 18, kind: BtnKind.quiet, radius: R.xl, style: T.labelMd.semi, onTap: m.nurse ? () => m.give(o, ask: false) : null, reason: _MarActions.why),
    ]);
  }
}

/// Confirmation drawer of the export: order facts, then the form. Nothing is saved here.
class _AdminSheet extends StatefulWidget {
  final ActiveOrder o;
  final _MarActions m;
  final String? slot;
  const _AdminSheet(this.o, this.m, this.slot);
  @override
  State<_AdminSheet> createState() => _AdminSheetState();
}

class _AdminSheetState extends State<_AdminSheet> {
  late String? _slot = widget.slot;
  @override
  Widget build(BuildContext context) {
    final o = widget.o, f = widget.m.f;
    final open = widget.m.open(o);
    final hr = f.latest('heart_rate');
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const _SheetTop('Confirm Administration'),
      Text('${doseLine(o)} for ${f.patient.fullName}, bed ${f.bed}${_slot == null ? '' : ', scheduled ${hm(_slot)}'}. Check the order, then record what you gave.', style: T.bodyMd.c(C.onSurfaceVariant)),
      const SizedBox(height: 16),
      if (open.length > 1) ...[
        Text('Scheduled time', style: T.labelSm.c(C.onSurfaceVariant)),
        Wrap(spacing: 8, children: [for (final s in open) _ChipPick(hm(s.time), on: s.time == _slot, onTap: () => setState(() => _slot = s.time))]),
        const SizedBox(height: 8),
      ],
      Box(
        color: C.surfaceLow,
        pad: const EdgeInsets.all(S.sm),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Latest Recorded Heart Rate', style: T.labelSm.c(C.onSurfaceVariant)),
          const SizedBox(height: 4),
          Row(children: [
            Text(hr == null ? 'Not recorded' : formatDose(hr.$1), style: hr == null ? T.headlineSm : T.vital),
            const SizedBox(width: 8),
            Expanded(child: Text(hr == null ? '' : 'BPM (Recorded ${hm(hr.$2)}, for reference only)', style: T.unit.c(C.onSurfaceVariant), textAlign: TextAlign.end)),
          ]),
        ]),
      ),
      const SizedBox(height: 16),
      Btn('Continue To Record', icon: Symbols.edit_note, radius: R.xl, style: T.labelMd.semi, onTap: () => Navigator.pop(context, ('administered', _slot))),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: Btn('Held', kind: BtnKind.quiet, radius: R.xl, onTap: () => Navigator.pop(context, ('held', _slot)))),
        const SizedBox(width: 8),
        Expanded(child: Btn('Refused', kind: BtnKind.quiet, radius: R.xl, onTap: () => Navigator.pop(context, ('refused', _slot)))),
      ]),
      Tap(label: 'Cancel', expand: true, onTap: () => Navigator.pop(context), child: Text('Cancel', style: T.labelMd)),
    ]);
  }
}

class _PickSheet extends StatelessWidget {
  final _MarActions m;
  const _PickSheet(this.m);
  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const _SheetTop('Record Med Event'),
        Text('Choose the order.', style: T.bodyMd.c(C.onSurfaceVariant)),
        const SizedBox(height: 8),
        for (final o in m.f.medOrders)
          Tap(
            label: doseLine(o),
            expand: true,
            onTap: () {
              Navigator.pop(context);
              m.details(o);
            },
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 3),
              padding: const EdgeInsets.all(S.md),
              decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl),
              child: Row(children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(o.drugName ?? o.text, style: T.labelMd), Text(_orderLine(o), style: T.bodySm.c(C.onSurfaceVariant))])),
                if (isHighAlert(o.drugName)) const Tag('HIGH-ALERT', bg: C.errorContainer, fg: C.onErrorContainer),
                const Ic(Symbols.chevron_right, size: 20, color: C.onSurfaceVariant),
              ]),
            ),
          ),
      ]);
}

/// Full stored order, today's times, history, and the actions this order allows.
class _OrderSheet extends StatelessWidget {
  final ActiveOrder o;
  final _MarActions m;
  const _OrderSheet(this.o, this.m);
  @override
  Widget build(BuildContext context) {
    final f = m.f, g = orderGroup(o);
    final history = orderHistory(o, f.meds);
    final hold = _holdOf(m.a, o.id);
    final open = m.open(o);
    final slot = (open.where((s) => _due(s.time, f.nowIso)).firstOrNull ?? open.firstOrNull)?.time;
    final allDone = g == OrderGroup.scheduled && o.scheduledTimes.isNotEmpty && open.isEmpty;
    void act(void Function() go) {
      Navigator.pop(context);
      go();
    }

    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _SheetTop(o.drugName ?? o.text),
      if (isHighAlert(o.drugName)) const Padding(padding: EdgeInsets.only(bottom: 8), child: Align(alignment: Alignment.centerLeft, child: Tag('HIGH-ALERT • SECOND NURSE', bg: C.error, fg: C.onError))),
      Box(
        color: C.surfaceLow,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(o.text, style: T.bodyLg.bold),
          const SizedBox(height: 4),
          _KV('Order', o.id),
          _KV('Dose and route', [orderDose(o), _routeText(o.route)].where((x) => x.isNotEmpty).join(' • ')),
          _KV('How often', o.frequency ?? 'Not on order'),
          _KV('Ordered by', o.orderedBy ?? 'Not recorded'),
          _KV('Started', o.m['start'] == null ? 'Not recorded' : dateTimeLabel(o.m['start'] as String)),
          if (g == OrderGroup.scheduled) _KV('Today', m.slots(o).isEmpty ? 'No time on order' : m.slots(o).map((s) => '${hm(s.time)} ${s.status}').join(', ')),
        ]),
      ),
      if (hold != null) ...[const SizedBox(height: 8), _ErrorBox('${hold['title'] ?? 'Order on hold'}. ${hold['reason'] ?? ''}')],
      const SizedBox(height: 12),
      if (!m.nurse)
        Text(_MarActions.why, style: T.bodySm.c(C.onSurfaceVariant))
      else if (allDone)
        Text('Every scheduled time today has a record.', style: T.bodySm.c(C.onSurfaceVariant))
      else ...[
        if (g == OrderGroup.infusion) ...[
          Btn('Rate Change', icon: Symbols.sync_alt, kind: BtnKind.navy, radius: R.xl, onTap: () => act(() => m.rate(o))),
          const SizedBox(height: 8),
        ],
        Btn(g == OrderGroup.infusion ? 'Record Start / Bag' : 'Record Administration', key: ValueKey('sheet-give-${o.id}'), icon: Symbols.check_circle, kind: g == OrderGroup.infusion ? BtnKind.quiet : BtnKind.primary, radius: R.xl, onTap: () => act(() => m.give(o, slot: slot, ask: g == OrderGroup.scheduled))),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: Btn('Held', kind: BtnKind.quiet, radius: R.xl, onTap: () => act(() => m.other(o, 'held', slot: slot)))),
          if (g != OrderGroup.infusion) ...[const SizedBox(width: 8), Expanded(child: Btn('Refused', kind: BtnKind.quiet, radius: R.xl, onTap: () => act(() => m.other(o, 'refused', slot: slot))))],
        ]),
      ],
      const SizedBox(height: 16),
      Text('History', style: T.headlineSm),
      if (history.isEmpty) Text('Nothing recorded for this order.', style: T.bodySm.c(C.onSurfaceVariant)),
      for (final x in history)
        Tap(
          label: '${dateTimeLabel(x.entry.careTime)} ${entrySummary(x)}',
          expand: true,
          onTap: () => act(() => m.entry(x.entry.id)),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 56, child: Text(hm(x.entry.careTime), style: T.labelMd.bold)),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(entrySummary(x), style: T.bodyMd.copyWith(decoration: x.entry.isConfirmed || x.entry.isDraft ? null : TextDecoration.lineThrough)),
                  Text([dayLabel(x.entry.careTime), staffShort(m.a.store, x.entry.performerId), if (x.med.doubleCheckedBy != null) 'checked by ${staffShort(m.a.store, x.med.doubleCheckedBy)}', if (x.med.reason != null) x.med.reason!, if (!x.entry.isConfirmed) x.entry.status].join(' • '), style: T.bodySm.c(C.onSurfaceVariant)),
                ]),
              ),
            ]),
          ),
        ),
    ]);
  }
}

/* ------------------------------ Record a medication event ------------------------------ */

class MedEventScreen extends StatefulWidget {
  final String patientId;
  final String orderId;
  final String event;
  final String? scheduledTime;
  const MedEventScreen({super.key, required this.patientId, required this.orderId, required this.event, this.scheduledTime});
  @override
  State<MedEventScreen> createState() => _MedEventScreenState();
}

class _MedEventScreenState extends State<MedEventScreen> {
  /// One idempotency key for this form; a retry or a second tap can not make a second record.
  final String _key = newId('k');
  final _dose = TextEditingController(), _rate = TextEditingController(), _site = TextEditingController(), _reason = TextEditingController();
  String _unit = '', _route = '', _rateUnit = '';
  final Set<int> _ticks = {};
  List<String> _rechecked = const [];
  String? _care; // null = now
  bool _tried = false, _busy = false, _ready = false, _noteOpen = false;
  String? _error;

  bool get _isRate => widget.event == 'rate_changed';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    final o = _orderOf(AppScope.read(context), widget.patientId, widget.orderId);
    if (o == null) return;
    final m = MedForm.fromOrder(o, widget.event);
    if (widget.event == 'administered') _dose.text = m.dose;
    _unit = m.unit;
    _route = m.route;
    _rateUnit = kRateUnits.contains(m.rateUnit) ? m.rateUnit : '';
    _first = _print;
  }

  /// What is on the form now; compared with [_first] when the page is left.
  String _first = '';
  String get _print => [_dose.text, _rate.text, _site.text, _reason.text, _unit, _route, _rateUnit, _care ?? '', _ticks.length].join('|');

  @override
  void dispose() {
    for (final c in [_dose, _rate, _site, _reason]) {
      c.dispose();
    }
    super.dispose();
  }

  MedForm get _form => MedForm(event: widget.event, dose: _dose.text, unit: _unit, route: _route, site: _site.text, rate: _rateRaw, rateUnit: _rateUnit, reason: _reason.text);

  List<String> _checks(bool infusion) => [
        'Right patient, drug, dose, route and time checked against the order',
        infusion ? 'Rate on the order compared with the pump by me' : 'Dose on the order compared with the container by me',
        infusion ? 'Line traced from bag to patient' : 'Route and site checked on the patient',
      ];

  String? _timeError(PatientFacts f) {
    final t = _care;
    if (t == null) return null;
    if (ms(t) > AppScope.read(context).clock.now() + 60000) return 'The time cannot be in the future.';
    final admit = f.encounter?.admitTime;
    return admit != null && ms(t) < ms(admit) ? 'The time is before this patient was admitted.' : null;
  }

  String get _rateRaw => _rate.text.replaceAll(',', '').trim();
  String _rateLast = '';

  /// Thousands are grouped while typing (1,100); the record keeps the plain number.
  void _groupRate() {
    final t = _rate.text;
    final commas = ','.allMatches(t).length > ','.allMatches(_rateLast).length;
    // A typed or pasted comma is not a thousands mark of ours: 12,5 must not become 125.
    if (t.length > _rateLast.length && commas && !RegExp(r'^\d{1,3}(,\d{3})+(\.\d*)?$').hasMatch(t)) {
      _rate.value = TextEditingValue(text: _rateLast, selection: TextSelection.collapsed(offset: _rateLast.length));
      toast(context, 'Use a point for decimals, for example 12.5.', icon: Symbols.info);
      return;
    }
    final parts = _rateRaw.split('.');
    parts[0] = parts[0].replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
    final s = parts.join('.');
    setState(() {
      if (s != _rate.text) _rate.value = TextEditingValue(text: s, selection: TextSelection.collapsed(offset: s.length));
      _rateLast = s;
    });
  }

  void _step(num current, int dir) {
    final by = _rateUnit == 'mL/h' ? 1 : 50;
    final base = num.tryParse(_rateRaw) ?? current;
    final next = base + dir * by;
    _rate.text = formatDose(next < 0 ? 0 : next);
    _groupRate();
  }

  Future<void> _next(PatientFacts f, ActiveOrder o, MedResult v) async {
    if (_busy) return;
    final a = AppScope.read(context);
    setState(() {
      _tried = true;
      _error = v.errors.values.firstOrNull ?? _timeError(f);
    });
    if (_error != null) return;
    final care = _care ?? a.nowIso;
    final locks = doseLocks(a.store, o, listPatientEntries(a.store, widget.patientId), careTime: care, scheduledTime: widget.scheduledTime, event: widget.event);
    if (locks.isNotEmpty) return Go.conflict(context, widget.patientId, o.id, scheduledTime: widget.scheduledTime, locks: locks);
    setState(() => _busy = true);
    try {
      if (v.needsSecondCheck) {
        final id = await Go.cosign(
          context,
          MedProposal(patientId: widget.patientId, orderId: o.id, key: _key, careTime: care, scheduledTime: widget.scheduledTime, values: v.values, checklist: _checks(orderGroup(o) == OrderGroup.infusion)),
        );
        if (id != null && mounted) _done(a, id);
      } else {
        final r = await _sheet<Object>(context, (_) => _ReviewSheet(f: f, o: o, v: v, careTime: care, scheduledTime: widget.scheduledTime, save: () => _save(a, v, care)));
        if (!mounted) return;
        if (r is String) _done(a, r);
        if (r is DoseLockedError) await Go.conflict(context, widget.patientId, o.id, scheduledTime: widget.scheduledTime, locks: r.locks);
      }
    } on AppError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _save(AppState a, MedResult v, String care) {
    final e = createEntry(a.ctx(), type: 'med_admin', patientId: widget.patientId, careTime: care, scheduledTime: widget.scheduledTime, values: v.values, clientKey: _key);
    a.saved();
    return e.id;
  }

  void _done(AppState a, String id) {
    final x = getEntry(a.store, id);
    if (x == null) return;
    final by = x.med.doubleCheckedBy;
    toast(context, '${x.med.drugName}: ${kEventLabel[x.med.event]?.toLowerCase()}. Saved on this phone${by == null ? '' : ', checked by ${staffShort(a.store, by)}'}.');
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = loadFacts(a.store, widget.patientId, a.nowIso);
    final o = _orderOf(a, widget.patientId, widget.orderId);
    if (f == null || o == null || o.status != 'active') {
      return const PhonePage(header: _TopBar('Record Med Event', 'PRACTICE'), children: [_ErrorBox('This order is not an active medicine order of the verified patient. Nothing can be recorded.')]);
    }
    final (prior, priorUnit) = currentRate(o, f.meds);
    final v = validateMed(_form, o, prior);
    final warnOk = v.warnings.every(_rechecked.contains);
    final second = v.needsSecondCheck;
    final why = second && _ticks.length < 3 ? 'Tick the 3 checks first.' : !warnOk ? 'Check the warning and tick it first.' : null;
    final bed = 'Bed ${f.bed}';
    return LeaveGuard(
      dirty: () => !_busy && _print != _first,
      child: PhonePage(
      header: _TopBar('Record Med Event', '${f.patient.fullName} • $bed'),
      pad: const EdgeInsets.fromLTRB(S.md, 0, S.md, S.md),
      gap: S.md,
      footer: Container(
        padding: const EdgeInsets.fromLTRB(S.md, S.sm, S.md, S.lg),
        decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0F1C2536), offset: Offset(0, -4), blurRadius: 12)]),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_error != null) ...[_ErrorBox(_error!), const SizedBox(height: 8)],
          Btn(second ? 'Authenticate Second Nurse' : 'Review & Save', icon: second ? Symbols.verified_user : Symbols.save, style: T.headlineSm, busy: _busy, onTap: why == null ? () => _next(f, o, v) : null, reason: why),
          const SizedBox(height: 8),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Ic(Symbols.lock_clock, size: 14, color: C.onSurfaceVariant),
            const SizedBox(width: 8),
            Flexible(child: Text('Saved only on this phone, encrypted • $bed', style: T.labelSm.c(C.onSurfaceVariant))),
          ]),
        ]),
      ),
      children: [
        _identity(a, f),
        if (second) _highAlert(),
        _spec(a, f, o, v, prior, priorUnit),
        if (v.warnings.isNotEmpty) _warnings(v.warnings, warnOk),
        if (second) _checklist(_checks(orderGroup(o) == OrderGroup.infusion)),
        _signatures(a, f, o, v, second, why),
      ],
    ),
    );
  }

  Widget _identity(AppState a, PatientFacts f) => Container(
        clipBehavior: Clip.antiAlias,
        decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowSm),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            color: C.primaryContainer,
            padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 6),
            child: Row(children: [
              const Dot(C.tertiaryFixed),
              const SizedBox(width: 6),
              Expanded(child: Text(_phaseText(a).toUpperCase(), style: T.badge.c(C.tertiaryFixed))),
              const Ic(Symbols.offline_pin, size: 13, color: C.onPrimaryContainer),
              const SizedBox(width: 4),
              _cap2(context, 0.42, Text('Encrypted on this phone', style: T.labelSm.c(C.onPrimaryContainer))),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.all(S.md),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Wrap(spacing: 8, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [Text(f.patient.fullName, style: T.headlineSm), Tag('Bed ${f.bed}', style: T.unit, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2))]),
                    const SizedBox(height: 2),
                    Text('MRN: ${f.patient.mrn} • DOB: ${dayLabel(f.patient.birthDate)} (${f.age}y ${f.patient.sexLetter})', style: T.bodySm.c(C.onSurfaceVariant)),
                  ]),
                ),
                const SizedBox(width: 8),
                _cap2(context, 0.36, Tag('2 IDs Verified', icon: Symbols.badge, bg: C.secondaryContainer, fg: C.onSecondaryContainer, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4))),
              ]),
              const SizedBox(height: 12),
              Wrap(spacing: 6, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Padding(padding: const EdgeInsets.only(right: 4), child: Text('Allergies:', style: T.labelSm.c(C.onSurfaceVariant))),
                if (f.realAllergies.isEmpty) Tag(f.allergyText),
                for (final al in f.realAllergies)
                  Tag('${al.substance}${al.reaction == null || al.severity != 'severe' ? '' : ' (${al.reaction})'}'.toUpperCase(), icon: al.severity == 'severe' ? Symbols.warning : null, bg: C.errorContainer, fg: C.onErrorContainer),
              ]),
            ]),
          ),
        ]),
      );

  Widget _highAlert() => Container(
        padding: const EdgeInsets.all(S.md),
        decoration: BoxDecoration(color: Color.alphaBlend(C.errorContainer.withValues(alpha: 0.4), C.surface), borderRadius: R.rXl, boxShadow: shadowSm),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(margin: const EdgeInsets.only(top: 2), padding: const EdgeInsets.all(8), decoration: const BoxDecoration(color: C.errorContainer, borderRadius: R.rBase), child: const Ic(Symbols.crisis_alert, size: 20, color: C.onErrorContainer)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_isRate ? 'HIGH-ALERT MEDICATION TITRATION' : 'HIGH-ALERT MEDICATION', style: T.labelMd.tr(-0.025).c(C.onErrorContainer)),
              const SizedBox(height: 2),
              Text('A second nurse must check this record and sign with their own PIN before anything is saved. Practice rule, not approved hospital policy.', style: T.bodySm),
            ]),
          ),
        ]),
      );

  Widget _factRow(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: Row(children: [
          Text('$k:', style: T.labelSm),
          const SizedBox(width: 6),
          Expanded(child: Text(v, style: T.bodySm.c(C.onSurfaceVariant))),
        ]),
      );

  Widget _spec(AppState a, PatientFacts f, ActiveOrder o, MedResult v, num? prior, String? priorUnit) {
    final inf = orderGroup(o) == OrderGroup.infusion;
    final hist = [for (final x in orderHistory(o, f.meds)) if (x.entry.isConfirmed) x];
    final lastSite = hist.where((x) => (x.med.site ?? '').isNotEmpty).firstOrNull;
    final care = _care ?? a.nowIso;
    final timeErr = _tried ? _timeError(f) : null;
    final reasonNeeded = widget.event == 'held' || widget.event == 'refused';
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Ic(Symbols.medication, size: 20, color: C.secondary),
          const SizedBox(width: 8),
          Expanded(child: Text(inf ? 'Infusion Order' : 'Medication Order', style: T.headlineSm)),
          ConstrainedBox(constraints: const BoxConstraints(maxWidth: 150), child: Tag('ORDER #${o.id}'.toUpperCase(), bg: C.surfaceContainer)),
        ]),
        const SizedBox(height: 16),
        Box(
          color: C.surfaceLow,
          radius: R.lg,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Text(o.drugName ?? o.text, style: T.labelMd)),
              const SizedBox(width: 8),
              ConstrainedBox(constraints: const BoxConstraints(maxWidth: 160), child: Tag(inf ? 'Continuous ${o.route ?? ''}' : _cap(o.frequency ?? 'No frequency'), style: T.unit, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2))),
            ]),
            const SizedBox(height: 8),
            _factRow('Order', o.text),
            _factRow('Prescribed by', o.orderedBy ?? 'Not recorded'),
            _factRow('Last site', lastSite == null ? 'Not recorded' : '${lastSite.med.site} (${hm(lastSite.entry.careTime)})'),
            if (widget.scheduledTime != null) _factRow('Scheduled', hm(widget.scheduledTime)),
          ]),
        ),
        const SizedBox(height: 16),
        if (_isRate) ...[
          IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(child: _priorTile(hist, prior, priorUnit)),
              const SizedBox(width: 8),
              Expanded(child: _newRateTile(o, v, prior ?? 0)),
            ]),
          ),
          if (!kRateUnits.contains(o.doseUnit)) _pickRow('Rate unit', kRateUnits, _rateUnit, (x) => setState(() => _rateUnit = x), v.errors['rateUnit']),
        ] else if (widget.event == 'administered') ...[
          IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(
                child: Box(
                  color: C.surfaceLow,
                  radius: R.lg,
                  child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [const Ic(Symbols.history, size: 14, color: C.onSurfaceVariant), const SizedBox(width: 4), Flexible(child: Text(inf ? 'Rate On Order' : 'Ordered Dose', style: T.labelSm.c(C.onSurfaceVariant)))]),
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(o.dose == null ? '—' : grouped(o.dose), style: T.vital),
                      Text(o.doseUnit ?? 'Not on order', style: T.unit.c(C.onSurfaceVariant)),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Box(
                  color: C.secondaryContainer.withValues(alpha: 0.5),
                  radius: R.lg,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [Expanded(child: Text('Dose Given', style: T.labelSm.c(C.onSecondaryContainer))), const Dot(C.secondary)]),
                    const SizedBox(height: 8),
                    TapToType(child: Container(
                      constraints: const BoxConstraints(minHeight: 48),
                      alignment: Alignment.centerLeft,
                      decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: BorderRadius.all(Radius.circular(6)), boxShadow: shadowSm),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                      child: Field(_dose, label: 'Dose given', style: T.vital, hint: '—', keyboard: const TextInputType.numberWithOptions(decimal: true), onChanged: (_) => setState(() {})),
                    )),
                    Padding(padding: const EdgeInsets.only(top: 4), child: Text(_unit.isEmpty ? 'Pick a unit' : _unit, style: T.unit.c(C.onSecondaryContainer))),
                    if (_tried && v.errors['dose'] != null) Text(v.errors['dose']!, style: T.bodySm.c(C.error)),
                  ]),
                ),
              ),
            ]),
          ),
          _pickRow('Unit', kDoseUnits, _unit, (x) => setState(() => _unit = x), v.errors['unit']),
          _pickRow('Route (how given)', kRoutes, _route, (x) => setState(() => _route = x), v.errors['route']),
          if (['IV', 'SC', 'IM'].contains(_route)) ...[
            _label('Site (optional, the patient\'s own left and right)'),
            _input(_site, 'Site'),
            const SizedBox(height: 4),
            Wrap(spacing: 8, children: [for (final s in kSiteWords) _ChipPick(s, on: _site.text == s, onTap: () => setState(() => _site.text = s))]),
          ],
        ] else
          Align(alignment: Alignment.centerLeft, child: Tag(widget.event == 'held' ? 'HELD • NOT GIVEN' : 'REFUSED • NOT GIVEN', bg: C.errorContainer, fg: C.onErrorContainer)),
        if (!_isRate || _noteOpen) ...[
          _label(widget.event == 'held' ? 'Why was it held?' : widget.event == 'refused' ? 'What did the patient say?' : 'Note (optional)'),
          _input(_reason, reasonNeeded ? 'Reason' : 'Note', lines: 2),
          if (_tried && v.errors['reason'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(v.errors['reason']!, style: T.bodySm.c(C.error))),
        ],
        const SizedBox(height: 12),
        Tap(
          label: 'Bedside execution time ${hm(care)}, change',
          expand: true,
          onTap: () async {
            final t = await _sheet<String>(context, (_) => _TimeSheet(care, f.encounter?.admitTime));
            if (t != null && mounted) setState(() => _care = t.isEmpty ? null : t);
          },
          child: Container(
            constraints: const BoxConstraints(minHeight: 42),
            padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 10),
            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
            child: Row(children: [
              const Ic(Symbols.schedule, size: 18, color: C.onSurfaceVariant),
              const SizedBox(width: 8),
              Expanded(child: Text('Bedside Execution Time', style: T.labelSm)),
              Text(hm(care), style: T.mono(17, w: FontWeight.w700, line: 22)),
              const SizedBox(width: 6),
              Tag(_care == null ? 'NOW' : 'EDITED', bg: _care == null ? C.tertiaryFixed : C.secondaryContainer, fg: _care == null ? C.onTertiaryFixed : C.onSecondaryContainer, style: T.unit, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
            ]),
          ),
        ),
        if (timeErr != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(timeErr, style: T.bodySm.c(C.error))),
        // The design of a titration has no note; it is one tap away.
        if (_isRate && !_noteOpen) Align(alignment: Alignment.centerLeft, child: Tap(label: 'Add note', onTap: () => setState(() => _noteOpen = true), child: Text('+ Add note (optional)', style: T.labelSm.c(C.secondary)))),
      ]),
    );
  }

  Widget _label(String t) => Padding(padding: const EdgeInsets.only(top: 12, bottom: 4), child: Text(t, style: T.labelSm));
  Widget _input(TextEditingController c, String label, {int lines = 1}) => TapToType(
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Field(c, label: label, minLines: 1, maxLines: lines + 2, onChanged: (_) => setState(() {})),
        ),
      );

  Widget _pickRow(String label, List<String> options, String value, void Function(String) pick, String? err) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        _label(label),
        Wrap(spacing: 8, children: [for (final x in options) _ChipPick(x, on: x == value, onTap: () => pick(x))]),
        if (_tried && err != null) Text(err, style: T.bodySm.c(C.error)),
      ]);

  Widget _priorTile(List<EntryX> hist, num? prior, String? unit) {
    final last = hist.where((x) => x.med.event == 'rate_changed').firstOrNull;
    return Box(
      color: C.surfaceLow,
      radius: R.lg,
      child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [const Ic(Symbols.history, size: 14, color: C.onSurfaceVariant), const SizedBox(width: 4), Flexible(child: Text('Current Rate', style: T.labelSm.c(C.onSurfaceVariant)))]),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(prior == null ? '—' : grouped(prior), style: T.vital), Text(unit ?? '', style: T.unit.c(C.onSurfaceVariant))]),
        ),
        Text(last == null ? 'Starting rate on the order' : 'Recorded ${hm(last.entry.careTime)}', style: T.bodySm.c(C.onSurfaceVariant)),
      ]),
    );
  }

  Widget _newRateTile(ActiveOrder o, MedResult v, num current) => Box(
        color: C.secondaryContainer.withValues(alpha: 0.5),
        radius: R.lg,
        child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: Text('New Prescribed Rate', style: T.labelSm.c(C.onSecondaryContainer))), const Dot(C.secondary)]),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                ConstrainedBox(
                  constraints: const BoxConstraints(minWidth: 48, maxWidth: 88),
                  child: IntrinsicWidth(child: Field(_rate, label: 'New prescribed rate', style: T.vital, hint: '—', keyboard: const TextInputType.numberWithOptions(decimal: true), onChanged: (_) => _groupRate())),
                ),
                const SizedBox(width: 4),
                Flexible(child: Text(_rateUnit, style: T.unit.c(C.onSurfaceVariant))),
              ]),
              Text(o.orderedBy == null ? 'prescriber not on order' : 'order: ${o.orderedBy}', style: T.unit.c(C.onSecondaryContainer)),
              if (_tried && v.errors['rate'] != null) Text(v.errors['rate']!, style: T.bodySm.c(C.error)),
            ]),
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(4),
            decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: BorderRadius.all(Radius.circular(6)), boxShadow: shadowSm),
            child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
              Tap(label: 'Decrease typed rate', onTap: () => _step(current, -1), child: const Ic(Symbols.remove, size: 20)),
              Container(width: 1, height: 24, margin: const EdgeInsets.symmetric(horizontal: 4), color: C.surfaceHigh),
              Tap(label: 'Increase typed rate', onTap: () => _step(current, 1), child: const Ic(Symbols.add, size: 20)),
            ]),
          ),
        ]),
      );

  Widget _warnings(List<String> list, bool ok) => Container(
        padding: const EdgeInsets.all(S.md),
        decoration: BoxDecoration(color: Color.alphaBlend(C.caution.withValues(alpha: 0.15), C.surface), borderRadius: R.rXl, boxShadow: shadowSm),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [const Ic(Symbols.warning, size: 20, color: C.caution), const SizedBox(width: 8), Text('Check This', style: T.headlineSm)]),
          for (final w in list) Padding(padding: const EdgeInsets.only(top: 4), child: Text(w, style: T.bodyMd)),
          _CheckRow('I checked this and it is right', ok, (x) => setState(() => _rechecked = x ? [...list] : const [])),
        ]),
      );

  Widget _checklist(List<String> items) => Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('Verification Checklist', style: T.headlineSm)),
            Tag('${_ticks.length}/3 Complete', bg: _ticks.length == 3 ? C.tertiaryFixed : C.errorContainer, fg: _ticks.length == 3 ? C.onTertiaryFixed : C.onErrorContainer),
          ]),
          const SizedBox(height: 8),
          for (final (i, t) in items.indexed) ...[
            if (i > 0) const SizedBox(height: 4),
            _CheckRow(t, _ticks.contains(i), (x) => setState(() => x ? _ticks.add(i) : _ticks.remove(i))),
          ],
        ]),
      );

  Widget _signatures(AppState a, PatientFacts f, ActiveOrder o, MedResult v, bool second, String? why) => Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(second ? 'Dual Signature Protocol' : 'Signature', style: T.headlineSm),
          const SizedBox(height: 12),
          Box(
            color: C.surfaceLow,
            radius: R.lg,
            child: Row(children: [
              Container(width: 40, height: 40, decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rFull), child: const Ic(Symbols.badge, size: 20, color: C.onPrimary)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(a.user?.title ?? '', style: T.labelMd),
                  Text('Signed in • Primary • ${hm(_care ?? a.nowIso)}', style: T.bodySm.c(C.onSurfaceVariant)),
                ]),
              ),
              const SizedBox(width: 8),
              Tag(second ? 'Primary' : 'Signs', icon: Symbols.verified, bg: C.tertiaryFixed, fg: C.tertiaryContainer, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4)),
            ]),
          ),
          if (second) ...[
            const SizedBox(height: 12),
            Box(
              color: C.secondaryContainer.withValues(alpha: 0.4),
              radius: R.lg,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  const Ic(Symbols.group_add, size: 18, color: C.onSecondaryContainer),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Second Nurse Independent Co-Sign', style: T.labelMd.c(C.onSecondaryContainer))),
                  const SizedBox(width: 8),
                  const Tag('PENDING', bg: C.surfaceHighest, pad: EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                ]),
                const SizedBox(height: 8),
                Text('A different RN checks the patient, the order and the ${orderGroup(o) == OrderGroup.infusion ? 'pump rate' : 'dose'} apart from you, then signs with their own PIN. Nothing is saved before that.', style: T.bodySm.c(C.onSurfaceVariant)),
                const SizedBox(height: 12),
                Opacity(
                  opacity: why == null ? 1 : 0.5,
                  child: Tap(
                    label: 'Open second nurse co-sign',
                    expand: true,
                    onTap: why == null && !_busy ? () => _next(f, o, v) : null,
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 48),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rBase, boxShadow: shadowSm),
                      child: Row(children: [
                        const Ic(Symbols.pin, size: 18, color: C.primary),
                        const SizedBox(width: 8),
                        Expanded(child: Text('Open Second Nurse Co-Sign', style: T.labelMd.c(C.primary))),
                        const Ic(Symbols.arrow_forward, size: 18, color: C.primary),
                      ]),
                    ),
                  ),
                ),
              ]),
            ),
          ],
        ]),
      );
}

class _CheckRow extends StatelessWidget {
  final String text;
  final bool on;
  final void Function(bool) set;
  const _CheckRow(this.text, this.on, this.set);
  @override
  Widget build(BuildContext context) => Semantics(
        checked: on,
        child: Tap(
          label: text,
          expand: true,
          onTap: () => set(!on),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Row(children: [
              Container(width: 24, height: 24, decoration: BoxDecoration(color: on ? C.primary : C.surfaceHigh, borderRadius: R.rBase), child: on ? const Ic(Symbols.check, size: 16, color: C.onPrimary) : null),
              const SizedBox(width: 12),
              Expanded(child: Text(text, style: T.bodyMd)),
            ]),
          ),
        ),
      );
}

/// Today or yesterday and HH:MM. Returns the time, '' for "now", or null when closed.
class _TimeSheet extends StatefulWidget {
  final String care;
  final String? admit;
  const _TimeSheet(this.care, this.admit);
  @override
  State<_TimeSheet> createState() => _TimeSheetState();
}

class _TimeSheetState extends State<_TimeSheet> {
  late final _c = TextEditingController(text: hm(widget.care));
  late bool _today = widget.care.substring(0, 10) == AppScope.read(context).nowIso.substring(0, 10);
  String? _err;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _use() {
    final a = AppScope.read(context);
    final t = _c.text.trim();
    if (!RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(t)) return setState(() => _err = 'Write the time as HH:MM.');
    final now = a.nowIso;
    final day = _today ? now : PracticeClock.toIso(a.clock.now() - 86400000);
    final iso = '${day.substring(0, 10)}T$t:00${now.substring(19)}';
    if (ms(iso) > a.clock.now() + 60000) return setState(() => _err = 'The time cannot be in the future.');
    if (widget.admit != null && ms(iso) < ms(widget.admit!)) return setState(() => _err = 'The time is before this patient was admitted.');
    Navigator.pop(context, iso);
  }

  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const _SheetTop('Bedside Execution Time'),
        Wrap(spacing: 8, children: [_ChipPick('Today', on: _today, onTap: () => setState(() => _today = true)), _ChipPick('Yesterday', on: !_today, onTap: () => setState(() => _today = false))]),
        const SizedBox(height: 8),
        Container(padding: const EdgeInsets.all(12), decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg), child: Field(_c, label: 'Time HH:MM', style: T.vital, keyboard: TextInputType.datetime, maxLength: 5)),
        if (_err != null) ...[const SizedBox(height: 8), _ErrorBox(_err!)],
        const SizedBox(height: 16),
        Btn('Use This Time', radius: R.xl, onTap: _use),
        const SizedBox(height: 8),
        Btn('Use Now', kind: BtnKind.quiet, radius: R.xl, onTap: () => Navigator.pop(context, '')),
      ]);
}

/// Last look before an ordinary record is saved. Pops with the entry id, or with the dose lock that stopped it.
class _ReviewSheet extends StatefulWidget {
  final PatientFacts f;
  final ActiveOrder o;
  final MedResult v;
  final String careTime;
  final String? scheduledTime;
  final String Function() save;
  const _ReviewSheet({required this.f, required this.o, required this.v, required this.careTime, required this.scheduledTime, required this.save});
  @override
  State<_ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends State<_ReviewSheet> {
  bool _busy = false;
  String? _err;

  void _go() {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      Navigator.pop<Object>(context, widget.save()); // stays busy: a second tap can not save again
    } on DoseLockedError catch (e) {
      Navigator.pop<Object>(context, e);
    } on AppError catch (e) {
      setState(() {
        _busy = false;
        _err = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = MedAdmin(widget.v.values);
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const _SheetTop('Check Before Saving'),
      Box(
        color: C.surfaceLow,
        child: Column(children: [
          _KV('Patient', '${widget.f.patient.fullName} • Bed ${widget.f.bed}'),
          _KV('Drug', m.drugName),
          _KV('What happened', kEventLabel[m.event] ?? m.event),
          if (m.doseGiven != null) _KV('Dose given', '${formatDose(m.doseGiven)} ${m.doseGivenUnit ?? ''}', style: T.vital),
          if (m.event == 'administered') _KV('Ordered', orderDose(widget.o).isEmpty ? 'No dose on order' : orderDose(widget.o)),
          if (m.rate != null) _KV('New rate', '${formatDose(m.rate)} ${m.rateUnit ?? ''} (was ${formatDose(m.priorRate)})', style: T.vital),
          if (m.route != null && m.event == 'administered') _KV('Route', '${m.route} (${kRouteLabel[m.route] ?? ''})'),
          if (m.site != null) _KV('Site', m.site!),
          if (m.reason != null) _KV('Reason / note', m.reason!),
          _KV('Time', '${dateTimeLabel(widget.careTime)}${widget.scheduledTime == null ? '' : ' • due ${hm(widget.scheduledTime)}'}'),
          _KV('Signed by', AppScope.read(context).user?.title ?? ''),
        ]),
      ),
      for (final w in widget.v.warnings) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Checked by you: $w', style: T.bodySm.c(C.onErrorContainer))),
      if (_err != null) ...[const SizedBox(height: 8), _ErrorBox(_err!)],
      const SizedBox(height: 16),
      Btn(_err == null ? 'Sign & Save On This Phone' : 'Try Again', icon: Symbols.save, radius: R.xl, style: T.labelMd.semi, busy: _busy, onTap: _go),
      const SizedBox(height: 8),
      Btn('Go Back', kind: BtnKind.quiet, radius: R.xl, onTap: _busy ? null : () => Navigator.pop(context)),
    ]);
  }
}

/* ------------------------------ Second nurse PIN co-sign ------------------------------ */

class CosignScreen extends StatefulWidget {
  final MedProposal proposal;
  const CosignScreen({super.key, required this.proposal});
  @override
  State<CosignScreen> createState() => _CosignScreenState();
}

class _CosignScreenState extends State<CosignScreen> {
  String? _witness;
  String _pin = '';
  bool _busy = false, _done = false;
  String? _error;
  IconData _errorIcon = Symbols.error;

  /// The second check was given, but the record could not be written yet. A retry saves with this same check.
  String? _attestation;
  Timer? _tick;

  MedProposal get p => widget.proposal;

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  /// Active staff with a second-checker role. The primary nurse is never offered.
  List<Practitioner> _eligible(AppState a) => [
        for (final r in a.store.all('practitioner'))
          if (Practitioner(r).active && kSecondCheckerRoles.contains(r['role']) && r['id'] != a.user?.id) Practitioner(r),
      ];

  void _watchLock() {
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(seconds: 1), (t) {
      final a = AppScope.read(context);
      if (!a.signedIn) return t.cancel();
      if (_witness == null || a.pinLockedFor(_witness!) == Duration.zero) {
        t.cancel();
        setState(() => _error = null);
      } else {
        setState(() {});
      }
    });
    setState(() {});
  }

  void _key(String k) {
    if (_busy || _attestation != null) return;
    if (_witness == null) return _say('Choose the second nurse first.', Symbols.person_off);
    setState(() {
      _error = null;
      if (k == 'clear') {
        _pin = '';
      } else if (k == 'back') {
        _pin = _pin.isEmpty ? '' : _pin.substring(0, _pin.length - 1);
      } else if (_pin.length < 4) {
        _pin += k;
      }
    });
  }

  void _say(String text, [IconData icon = Symbols.error]) => setState(() {
        _error = text;
        _errorIcon = icon;
      });

  Future<void> _authorize() async {
    if (_busy || _done) return;
    final a = AppScope.read(context);
    final w = _witness;
    if (_attestation == null) {
      if (w == null) return _say('Choose the second nurse first.', Symbols.person_off);
      if (a.pinLockedFor(w) > Duration.zero) return _watchLock();
      if (_pin.length < 4) return _say('Enter the complete 4-digit PIN.', Symbols.pin);
    }
    final pin = _pin;
    setState(() {
      _busy = true;
      _error = null;
      _pin = '';
    });
    try {
      if (_attestation == null) {
        final (r, id) = await a.cosign(a.ctx(), witnessId: w!, pin: pin, patientId: p.patientId, careTime: p.careTime, scheduledTime: p.scheduledTime, values: p.values, checklist: p.checklist);
        if (!mounted) return;
        if (!r.ok) {
          _say(r.error ?? 'The PIN was not accepted.');
          if (r.lockedFor > Duration.zero) _watchLock();
          return;
        }
        _attestation = id;
      }
      final e = p.draftEntryId != null
          ? confirmDraft(a.ctx(), p.draftEntryId!, p.values, careTime: p.careTime, attestationId: _attestation)
          : createEntry(a.ctx(), type: 'med_admin', patientId: p.patientId, careTime: p.careTime, scheduledTime: p.scheduledTime, values: p.values, clientKey: p.key, attestationId: _attestation);
      _done = true;
      a.saved();
      if (mounted) Navigator.pop(context, e.id);
    } on DoseLockedError catch (e) {
      if (mounted) await Go.conflict(context, p.patientId, p.orderId, scheduledTime: p.scheduledTime, locks: e.locks);
    } on AppError catch (e) {
      if (mounted) _say(_attestation == null ? e.message : 'The second check is recorded, but the medication record is NOT saved. ${e.message}');
    } finally {
      if (mounted && !_done) setState(() => _busy = false);
    }
  }

  Future<void> _decline() async {
    if (_busy || _done) return;
    final w = _witness;
    if (w == null) return _say('Choose the second nurse who declines.', Symbols.person_off);
    final reason = await _sheet<String>(context, (_) => const _ReasonSheet(title: 'Decline / Flag Discrepancy', text: 'Nothing is recorded as given. Say what does not match.', label: 'Reason for declining', button: 'Save Decline', danger: true));
    if (reason == null || !mounted) return;
    final a = AppScope.read(context);
    setState(() => _busy = true);
    try {
      recordAttestation(a.ctx(), witnessId: w, outcome: 'declined', patientId: p.patientId, careTime: p.careTime, scheduledTime: p.scheduledTime, values: p.values, checklist: p.checklist, reason: reason);
      _done = true;
      a.saved();
      toast(context, 'Second check declined. No medication record was saved.', icon: Symbols.cancel);
      Navigator.pop(context);
    } on AppError catch (e) {
      _say(e.message);
    } finally {
      if (mounted && !_done) setState(() => _busy = false);
    }
  }

  Future<void> _choose(AppState a) async {
    final list = _eligible(a);
    final id = await _sheet<String>(
      context,
      (x) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const _SheetTop('Second Nurse'),
        Text('Who may check: ${kSecondCheckerRoles.join(', ')}. Practice setting, not approved hospital policy.', style: T.bodySm.c(C.onSurfaceVariant)),
        const SizedBox(height: 8),
        if (list.isEmpty) const _ErrorBox('No other nurse who can check is set up on this phone.'),
        for (final s in list)
          Tap(
            label: s.title,
            selected: s.id == _witness,
            expand: true,
            onTap: () => Navigator.pop(x, s.id),
            child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: _staffRow(s, false)),
          ),
      ]),
    );
    if (id == null || !mounted) return;
    setState(() {
      _witness = id;
      _pin = '';
      _error = null;
    });
    if (a.pinLockedFor(id) > Duration.zero) _watchLock();
  }

  Widget _staffRow(Practitioner s, bool caret) => Row(children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rFull),
          child: FittedBox(fit: BoxFit.scaleDown, child: Text(s.initials, style: T.bodyMd.bold.c(C.onSecondaryContainer))),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.title, style: T.headlineSm, maxLines: 1, overflow: TextOverflow.ellipsis),
            Text('${s.role} • May act as second checker', style: T.bodySm.c(C.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
          ]),
        ),
        if (caret) const Ic(Symbols.expand_more, size: 24, color: C.onSurfaceVariant),
      ]);

  Future<void> _leave() async {
    final a = AppScope.read(context);
    final leave = await confirm(context, title: 'Leave without saving?', text: 'The second check was given, but the medication record is not saved. If you leave, this check can not be used again and the second nurse must check again.', yes: 'Leave', danger: true);
    if (!leave || !mounted) return;
    try {
      ops.recordFile(a.ctx(), action: 'cosign_not_used', entity: 'attestation/$_attestation', after: {'reason': 'left before the record was saved'});
    } on AppError catch (e) {
      toast(context, e.message, icon: Symbols.error, error: true);
    }
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = loadFacts(a.store, p.patientId, a.nowIso);
    final o = _orderOf(a, p.patientId, p.orderId);
    if (f == null || o == null) return const PhonePage(header: _TopBar('Second Nurse Co-Sign', 'PRACTICE'), children: [_ErrorBox('This order is not an active medicine order of the verified patient. Nothing can be recorded.')]);
    final w = staffById(a.store, _witness);
    final wait = _witness == null ? Duration.zero : a.pinLockedFor(_witness!);
    final locked = wait > Duration.zero;
    final (icon, msg, err) = locked
        ? (Symbols.lock_clock, 'Too many wrong tries. Wait ${(wait.inMilliseconds / 1000).ceil()} seconds.', true)
        : _error != null
            ? (_errorIcon, _error!, true)
            : _attestation != null
                ? (Symbols.verified, 'Second check recorded.', false)
                : _busy
                    ? (Symbols.pin, 'Checking the PIN…', false)
                    : (Symbols.pin, _pin.length == 4 ? '4 digits entered. Not checked yet.' : 'Awaiting PIN entry (${_pin.length}/4 digits)', false);

    return PopScope(
      canPop: (_attestation == null || _done) && !_busy,
      onPopInvokedWithResult: (did, _) {
        if (!did && !_busy) _leave(); // while the PIN is checked or the record is saved, the page stays
      },
      child: PhonePage(
        header: _TopBar('Second Nurse Co-Sign', '${f.patient.fullName} • Bed ${f.bed}'),
        pad: const EdgeInsets.fromLTRB(S.md, 0, S.md, S.lg),
        children: [
          _banner(),
          const SizedBox(height: S.md),
          _contextCard(a, f, o),
          const SizedBox(height: S.md),
          Row(children: [
            Expanded(child: Text('Co-Signing Second Nurse', style: T.labelMd)),
            _cap2(context, 0.45, Text('Physical Presence Required', style: T.labelSm.c(C.secondary), textAlign: TextAlign.end)),
          ]),
          const SizedBox(height: 4),
          Tap(
            label: w == null ? 'Choose the second nurse' : 'Second nurse ${w.title}, change',
            expand: true,
            onTap: _busy || _attestation != null ? null : () => _choose(a),
            child: Box(
              shadow: true,
              pad: const EdgeInsets.symmetric(horizontal: S.md, vertical: S.sm),
              child: w != null
                  ? _staffRow(w, true)
                  : Row(children: [
                      Container(width: 40, height: 40, decoration: const BoxDecoration(color: C.surfaceHighest, borderRadius: R.rFull), child: const Ic(Symbols.person_add, size: 20, color: C.onSurfaceVariant)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Choose the second nurse', style: T.headlineSm),
                          Text(_eligible(a).isEmpty ? 'No other nurse who can check is on this phone' : 'A different RN, with their own PIN', style: T.bodySm.c(C.onSurfaceVariant)),
                        ]),
                      ),
                      const Ic(Symbols.expand_more, size: 24, color: C.onSurfaceVariant),
                    ]),
            ),
          ),
          const SizedBox(height: S.md),
          _pinCard(w, icon, msg, err, locked),
          const SizedBox(height: S.md),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Padding(padding: EdgeInsets.only(top: 2), child: Ic(Symbols.verified_user, size: 18, color: C.secondary)),
              const SizedBox(width: 4),
              Expanded(child: Text('By entering your PIN, you confirm that you checked the patient, the order, the label and the ${orderGroup(o) == OrderGroup.infusion ? 'pump rate' : 'dose'} yourself, apart from the primary nurse.', style: T.bodySm.c(C.onSurfaceVariant))),
            ]),
          ),
          const SizedBox(height: S.lg),
          Btn(_attestation == null ? 'Authorize & Save On This Phone' : 'Save Again', icon: Symbols.enhanced_encryption, radius: R.xl, style: T.headlineSm, busy: _busy, onTap: locked ? null : _authorize),
          const SizedBox(height: S.sm),
          Btn('Decline / Flag Discrepancy', icon: Symbols.cancel, iconSize: 18, height: 44, radius: R.xl, bg: C.errorContainer.withValues(alpha: 0.4), fg: C.error, onTap: _busy || _attestation != null ? null : _decline),
        ],
      ),
    );
  }

  Widget _banner() => Box(
        color: C.primaryContainer,
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Expanded(child: Align(alignment: Alignment.centerLeft, child: Tag('HIGH-ALERT VERIFICATION', icon: Symbols.warning, bg: C.error, fg: C.onError))),
            const SizedBox(width: 4),
            const Ic(Symbols.lock, size: 14, color: C.tertiaryFixed),
            const SizedBox(width: 4),
            Text('On This Phone', style: T.labelSm.semi.c(C.tertiaryFixed)),
          ]),
          const SizedBox(height: 4),
          Text('Independent Double-Check', style: T.headlineSm.c(C.onPrimary)),
          const SizedBox(height: 4),
          Text('A different nurse checks this high-alert medicine on their own and signs with their own PIN. Nothing is saved before that.', style: T.bodySm.c(C.onPrimaryContainer)),
        ]),
      );

  Widget _tile(String k, String v, String unit) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rBase),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(k, style: T.labelSm.c(C.onSurfaceVariant)),
            Text(v, style: T.vital),
            Text(unit, style: T.unit.c(C.secondary)),
          ]),
        ),
      );

  Widget _contextCard(AppState a, PatientFacts f, ActiveOrder o) {
    final m = MedAdmin(p.values);
    final rate = m.event == 'rate_changed';
    String n(num? x) => x == null ? '—' : grouped(x);
    final al = f.realAllergies.firstOrNull;
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('PATIENT IDENTIFICATION', style: T.labelSm.s(11, 24).tr(0.05).c(C.onSurfaceVariant)),
              Text(f.patient.fullName, style: T.headlineSm),
              Text('MRN: ${f.patient.mrn} • Bed ${f.bed} (${f.encounter?.unit ?? ''})', style: T.bodySm.medium.c(C.secondary)),
            ]),
          ),
          const SizedBox(width: 8),
          if (al != null) _cap2(context, 0.3, Tag('${f.realAllergies.map((x) => x.substance).join(', ')} allergy'.toUpperCase(), bg: C.errorContainer, fg: C.onErrorContainer, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4))),
        ]),
        const SizedBox(height: S.sm),
        Box(
          color: C.surfaceLow,
          radius: R.lg,
          pad: const EdgeInsets.all(S.sm),
          child: Column(children: [
            Row(children: [
              const Ic(Symbols.medication, size: 16, color: C.error),
              const SizedBox(width: 6),
              Expanded(child: Text(rate ? '${m.drugName} Infusion Titration' : '${m.drugName} ${orderGroup(o) == OrderGroup.infusion ? 'Infusion' : 'Dose'}', style: T.labelMd.c(C.error))),
            ]),
            const SizedBox(height: 8),
            IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (rate) ...[_tile('New Prescribed Rate', n(m.rate), m.rateUnit ?? ''), const SizedBox(width: 8), _tile('Current Rate', n(m.priorRate), currentRate(o, f.meds).$2 ?? '')] else ...[
                  _tile('Dose To Record', n(m.doseGiven), [m.doseGivenUnit, m.route].whereType<String>().join(' • ')),
                  const SizedBox(width: 8),
                  _tile('Dose On Order', n(m.doseDue), m.doseDueUnit ?? ''),
                ],
              ]),
            ),
            if (m.site != null || m.reason != null)
              Padding(padding: const EdgeInsets.only(top: 8), child: Align(alignment: Alignment.centerLeft, child: Text([if (m.site != null) 'Site: ${m.site}', if (m.reason != null) 'Note: ${m.reason}'].join(' • '), style: T.bodySm.c(C.onSurfaceVariant)))),
          ]),
        ),
        const SizedBox(height: S.md),
        Row(children: [
          const Ic(Symbols.check_circle, size: 18, color: C.onTertiaryFixedVariant),
          const SizedBox(width: 8),
          Expanded(child: Text.rich(TextSpan(text: 'Primary: ', children: [TextSpan(text: a.user?.title ?? '', style: T.bodySm.bold)]), style: T.bodySm.c(C.onSurfaceVariant))),
          Tag(dateTimeLabel(p.careTime), bg: C.surfaceContainer, fg: C.onSurface, style: T.labelSm),
        ]),
        if (p.scheduledTime != null) Text('For the due time ${dateTimeLabel(p.scheduledTime)}', style: T.labelSm.c(C.onSurfaceVariant), textAlign: TextAlign.end),
      ]),
    );
  }

  Widget _pinCard(Practitioner? w, IconData icon, String msg, bool err, bool locked) => Box(
        shadow: true,
        child: Column(children: [
          Text('SECONDARY CREDENTIAL CHALLENGE', style: T.labelMd.tr(0.05), textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(w == null ? 'Choose the second nurse, then they enter their own PIN' : 'Nurse ${w.name}: Enter your own 4-digit PIN', style: T.bodySm.c(C.onSurfaceVariant), textAlign: TextAlign.center),
          const SizedBox(height: S.md - 4),
          Semantics(
            label: '${_pin.length} of 4 digits entered',
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 0; i < 4; i++)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(shape: BoxShape.circle, color: i < _pin.length ? C.primary.withValues(alpha: 0.2) : (err ? C.error.withValues(alpha: 0.2) : null)),
                  child: Dot(i < _pin.length ? C.primary : (err ? C.error : C.surfaceHighest), size: 16),
                ),
            ]),
          ),
          const SizedBox(height: S.lg - 4),
          Semantics(
            liveRegion: true,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(color: err ? C.errorContainer : C.surfaceLow, borderRadius: R.rBase),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Ic(icon, size: 15, color: err ? C.onErrorContainer : C.onSurfaceVariant),
                const SizedBox(width: 4),
                Flexible(child: Text(msg, key: const ValueKey('cosign-feedback'), style: T.labelSm.c(err ? C.onErrorContainer : C.onSurfaceVariant), textAlign: TextAlign.center)),
              ]),
            ),
          ),
          const SizedBox(height: S.md),
          Opacity(
            opacity: locked || _attestation != null ? 0.5 : 1,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 320),
              child: Column(children: [
                for (final (i, row) in const [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['clear', '0', 'back']].indexed) ...[
                  if (i > 0) const SizedBox(height: 10),
                  Row(children: [
                    for (final (j, k) in row.indexed) ...[if (j > 0) const SizedBox(width: 10), Expanded(child: _keyButton(k, locked))],
                  ]),
                ],
              ]),
            ),
          ),
        ]),
      );

  Widget _keyButton(String k, bool locked) => Tap(
        label: k == 'clear' ? 'Clear PIN' : k == 'back' ? 'Delete last digit' : 'Digit $k',
        expand: true,
        onTap: locked ? null : () => _key(k),
        child: Container(
          key: ValueKey('pin-$k'),
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: k.length > 1 ? C.surfaceContainer : C.surfaceLow, borderRadius: R.rLg, boxShadow: shadowSm),
          child: k == 'back' ? const Ic(Symbols.backspace, size: 20) : FittedBox(fit: BoxFit.scaleDown, child: Text(k == 'clear' ? 'CLEAR' : k, style: k == 'clear' ? T.labelMd.c(C.onSurfaceVariant) : T.headlineMd)),
        ),
      );
}

/// A required reason. Pops with the text.
class _ReasonSheet extends StatefulWidget {
  final String title, text, label, button;
  final bool danger;
  const _ReasonSheet({required this.title, required this.text, required this.label, required this.button, this.danger = false});
  @override
  State<_ReasonSheet> createState() => _ReasonSheetState();
}

class _ReasonSheetState extends State<_ReasonSheet> {
  final _c = TextEditingController();
  bool _empty = false;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _SheetTop(widget.title),
        Text(widget.text, style: T.bodyMd.c(C.onSurfaceVariant)),
        const SizedBox(height: 12),
        Container(constraints: const BoxConstraints(minHeight: 72), padding: const EdgeInsets.all(12), decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg), child: Field(_c, label: widget.label, hint: 'Reason (required)', minLines: 2, maxLines: 5)),
        if (_empty) ...[const SizedBox(height: 8), const _ErrorBox('Write the reason.')],
        const SizedBox(height: 16),
        Btn(widget.button, kind: widget.danger ? BtnKind.danger : BtnKind.primary, radius: R.xl, onTap: () => _c.text.trim().isEmpty ? setState(() => _empty = true) : Navigator.pop(context, _c.text.trim())),
        const SizedBox(height: 8),
        Btn('Cancel', kind: BtnKind.quiet, radius: R.xl, onTap: () => Navigator.pop(context)),
      ]);
}

/* ------------------------------ Dose lock ------------------------------ */

class ConflictScreen extends StatefulWidget {
  final String patientId;
  final String orderId;
  final String? scheduledTime;
  final List<DoseLock> locks;
  const ConflictScreen({super.key, required this.patientId, required this.orderId, this.scheduledTime, required this.locks});
  @override
  State<ConflictScreen> createState() => _ConflictScreenState();
}

class _ConflictScreenState extends State<ConflictScreen> {
  final String _key = newId('k');
  bool _busy = false, _noted = false;
  String? _error;
  late final String _at = AppScope.read(context).nowIso;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _note();
    });
  }

  /// The refused attempt goes into the change log once.
  bool _note() {
    if (_noted) return true;
    final a = AppScope.read(context);
    try {
      ops.recordFile(a.ctx(), action: 'dose_locked', entity: 'active_order/${widget.orderId}', after: {'patient_id': widget.patientId, 'order_id': widget.orderId, 'scheduled_time': widget.scheduledTime, 'locks': [for (final l in widget.locks) l.kind]});
      return _noted = true;
    } on AppError catch (e) {
      setState(() => _error = 'The lock could not be written to the change log. ${e.message}');
      return false;
    }
  }

  /// Can this attempt still be recorded as not given? Not when the scheduled time already has a live record.
  bool _canHold(AppState a, PatientFacts f, ActiveOrder o) {
    if (!(a.user?.isNurse ?? false)) return false;
    if (widget.scheduledTime == null) return orderGroup(o) != OrderGroup.scheduled || o.scheduledTimes.isEmpty;
    return !orderHistory(o, f.meds).any((x) => x.entry.scheduledTime == widget.scheduledTime && (x.entry.isConfirmed || x.entry.isDraft));
  }

  Future<void> _confirmHold(AppState a, ActiveOrder o) async {
    if (_busy) return;
    final reason = await _sheet<String>(context, (_) => _ReasonSheet(title: 'Hold Medication', text: '${doseLine(o)}${widget.scheduledTime == null ? '' : ', scheduled ${hm(widget.scheduledTime)}'}. It is recorded as held, not given.', label: 'Reason held', button: 'Save As Held'));
    if (reason == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!_note()) return;
      final v = validateMed(MedForm(event: 'held', reason: reason), o, null);
      if (!v.ok) throw AppError(v.errors.values.first);
      createEntry(a.ctx(), type: 'med_admin', patientId: widget.patientId, careTime: a.nowIso, scheduledTime: widget.scheduledTime, values: v.values, clientKey: _key);
      a.saved();
      if (!mounted) return;
      toast(context, '${o.drugName ?? o.text}: held, not given. Saved on this phone.');
      _toMar(context);
    } on AppError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _return() {
    if (_note()) _toMar(context);
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = loadFacts(a.store, widget.patientId, a.nowIso);
    final o = _orderOf(a, widget.patientId, widget.orderId);
    if (f == null || o == null) return const PhonePage(header: _TopBar('Medication Conflict & Dose Lock', 'PRACTICE'), children: [_ErrorBox('This order is not a medicine order of the verified patient.')]);
    final hold = _canHold(a, f, o);
    final n = widget.locks.length;
    return PhonePage(
      header: _header(f),
      pad: const EdgeInsets.fromLTRB(S.md, 0, S.md, S.md),
      footer: Container(
        padding: const EdgeInsets.all(S.md),
        decoration: const BoxDecoration(color: C.surface, boxShadow: shadowUp),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_error != null) ...[_ErrorBox(_error!), const SizedBox(height: 8)],
          _raised(Btn(hold ? 'Confirm Hold & Return to MAR' : 'Return to MAR', icon: hold ? Symbols.verified_user : Symbols.arrow_back, busy: _busy, onTap: hold ? () => _confirmHold(a, o) : _return), shadow: shadowMd, radius: R.rBase),
          const SizedBox(height: 4),
          Unavailable(
            reason: 'An emergency override is not available: no override workflow is approved.',
            child: Btn('Enter Physician Emergency Override PIN', icon: Symbols.key, iconSize: 18, height: 44, kind: BtnKind.quiet, bg: C.surfaceHighest, fg: C.error, onTap: () {}),
          ),
        ]),
      ),
      children: [
        Box(
          color: C.primaryContainer,
          shadow: true,
          child: Row(children: [
            const Dot(C.tertiaryFixedDim, size: 10),
            const SizedBox(width: 4),
            Expanded(child: Text('${a.phase == ops.Phase.down ? 'EHR Offline' : ops.kPhaseLabel[a.phase]} • PRACTICE'.toUpperCase(), style: T.labelSm.tr(0.025).c(C.primaryFixed))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              decoration: BoxDecoration(color: C.primary.withValues(alpha: 0.4), borderRadius: R.rBase),
              child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.lock, size: 14, color: C.primaryFixedDim), const SizedBox(width: 4), Text('LOCAL CHANGE LOG', style: T.unit.c(C.primaryFixedDim))]),
            ),
          ]),
        ),
        const SizedBox(height: S.sm),
        _banner(n),
        const SizedBox(height: S.md),
        _patient(f),
        const SizedBox(height: S.md),
        _order(o),
        const SizedBox(height: S.md),
        for (final (i, l) in widget.locks.indexed) ...[_reason(a, f, o, l, first: i == 0), SizedBox(height: i == n - 1 && n > 1 ? S.md : S.sm)],
        if (n == 1) ...[_onRecord(a, f, o), const SizedBox(height: S.md)],
        Box(
          color: C.surfaceHighest,
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [const Ic(Symbols.lock_clock, size: 20, color: C.error), const SizedBox(width: 4), Expanded(child: Text('ADMINISTRATION RECORD LOCKED', style: T.headlineSm.tr(0.025).c(C.error)))]),
            const SizedBox(height: 6),
            Text('This dose cannot be recorded as given while the reason above stands. The same check runs again when a record is saved. Ask the prescriber or pharmacy using your downtime process.', style: T.bodySm.s(12, 19.5).c(C.onSurfaceVariant)),
          ]),
        ),
        const SizedBox(height: S.md),
        Row(children: [
          Expanded(child: Text('REQUIRED RESOLUTION', style: T.labelMd.tr(0.05))),
          _cap2(context, 0.4, Text('1 action available', style: T.labelSm.c(C.onSurfaceVariant), textAlign: TextAlign.end)),
        ]),
        const SizedBox(height: 8),
        _option(
          on: true,
          title: hold ? 'Hold Medication & Mark Not Given' : 'Return to MAR, Nothing Recorded',
          tag: const Tag('AVAILABLE', bg: C.tertiaryFixed, fg: C.onTertiaryFixed, pad: EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
          text: hold ? 'Saves a held record with your reason${widget.scheduledTime == null ? '' : ' for ${hm(widget.scheduledTime)}'}. Nothing is recorded as given.' : 'This scheduled time already has a record. Only this attempt is written to the change log.',
        ),
        const SizedBox(height: 4),
        Unavailable(reason: 'Substitutes are not available: no approved substitution list is on this phone. Ask pharmacy.', child: _option(title: 'Request Protocol Antimicrobial Substitute', text: 'Not available: the app stores no substitution protocol and recommends no drug.')),
        const SizedBox(height: 4),
        Unavailable(
          reason: 'A physician override is not available: no override workflow is approved.',
          child: _option(title: 'Physician Override with Dual RN Witness', color: C.error, tag: const Tag('NOT AVAILABLE', bg: C.errorContainer, fg: C.onErrorContainer, pad: EdgeInsets.symmetric(horizontal: 6, vertical: 2)), text: 'Not available: no override workflow is approved for Practice.'),
        ),
        const SizedBox(height: S.lg),
        Box(
          color: C.surfaceLow,
          shadow: true,
          child: Row(children: [
            Container(width: 36, height: 36, decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rFull), child: const Ic(Symbols.local_pharmacy, size: 20, color: C.onSecondaryContainer)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Pharmacy', style: T.labelMd),
                Text('No phone number is stored on this phone', style: T.bodySm.c(C.onSurfaceVariant)),
              ]),
            ),
            Unavailable(reason: 'No pharmacy phone number is stored on this phone. Use your unit\'s downtime phone list.', child: Container(width: 48, height: 48, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rLg), child: const Ic(Symbols.call, size: 20, color: C.onPrimary))),
          ]),
        ),
      ],
    );
  }

  Widget _header(PatientFacts f) => Container(
        constraints: const BoxConstraints(minHeight: 64),
        padding: const EdgeInsets.symmetric(horizontal: S.md),
        decoration: BoxDecoration(color: C.surface, border: Border(bottom: BorderSide(color: C.error.withValues(alpha: 0.2))), boxShadow: const [BoxShadow(color: Color(0x1FBA1A1A), offset: Offset(0, 2), blurRadius: 12)]),
        child: Row(children: [
          Tap(label: 'Go back', onTap: () => Go.back(context), child: const Ic(Symbols.arrow_back, size: 24)),
          Expanded(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [const Ic(Symbols.warning, size: 18, color: C.error), const SizedBox(width: 6), Expanded(child: Text('Medication Conflict & Dose Lock', style: T.headlineSm.tr(-0.025).c(C.error), maxLines: 2, overflow: TextOverflow.ellipsis))]),
              Text('${f.patient.fullName} • Bed ${f.bed}', style: T.labelSm.c(C.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
            ]),
          ),
          const SizedBox(width: 8),
          _cap2(context, 0.28, const Tag('SAFETY ALERT', icon: Symbols.gpp_maybe, bg: C.errorContainer, fg: C.onErrorContainer, pad: EdgeInsets.symmetric(horizontal: 4, vertical: 2))),
        ]),
      );

  Widget _banner(int n) => Container(
        clipBehavior: Clip.antiAlias,
        decoration: const BoxDecoration(color: C.error, borderRadius: R.rXl, boxShadow: shadowMd),
        child: Stack(children: [
          Positioned(right: -16, bottom: -16, child: Container(width: 112, height: 112, decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [C.errorContainer.withValues(alpha: 0.25), C.errorContainer.withValues(alpha: 0)])))),
          Padding(
            padding: const EdgeInsets.all(S.md),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 40, height: 40, decoration: BoxDecoration(color: C.surfaceLowest.withValues(alpha: 0.2), borderRadius: R.rLg), child: const Ic(Symbols.gpp_maybe, size: 26, color: C.onError)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('DOSE LOCK • NOTHING WAS SAVED', style: T.badge.c(C.errorContainer)),
                  const SizedBox(height: 2),
                  Text(n == 1 ? widget.locks.first.title.toUpperCase() : 'DOSE LOCKED FOR $n REASONS', style: T.headlineSm.tr(-0.025).c(C.onError)),
                  const SizedBox(height: 4),
                  Text('This dose cannot be recorded as given. $n reason${n == 1 ? ' was' : 's were'} found in the records on this phone.', style: T.bodySm.c(C.surfaceLowest.withValues(alpha: 0.9))),
                ]),
              ),
            ]),
          ),
        ]),
      );

  Widget _patient(PatientFacts f) => Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [Text(f.patient.fullName, style: T.headlineMd), Tag(f.ageSex, style: T.labelMd, bg: C.surfaceContainer, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2))]),
                const SizedBox(height: 2),
                Text('MRN: ${f.patient.mrn} • Bed ${f.bed} (${f.encounter?.unit ?? ''})', style: T.labelSm.c(C.onSurfaceVariant)),
              ]),
            ),
            const SizedBox(width: 8),
            if (f.hasSevereAllergy) _cap2(context, 0.36, const Tag('SEVERE ALLERGY', bg: C.errorContainer, fg: C.onErrorContainer, pad: EdgeInsets.symmetric(horizontal: 8, vertical: 4))),
          ]),
          const SizedBox(height: S.md),
          Box(
            color: C.surfaceLow,
            radius: R.lg,
            pad: const EdgeInsets.all(S.sm),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [const Ic(Symbols.notification_important, size: 13, color: C.error), const SizedBox(width: 4), Expanded(child: Text('DOCUMENTED ALLERGIES', style: T.unit.tr(0.05).c(C.onSurfaceVariant)))]),
              const SizedBox(height: 6),
              Wrap(spacing: 6, runSpacing: 6, children: [
                if (f.realAllergies.isEmpty) Text(f.allergyText, style: T.labelSm),
                for (final al in f.realAllergies)
                  Tag('${al.substance} (${[al.reaction, al.severity].whereType<String>().join(', ')})'.toUpperCase(),
                      icon: al.severity == 'severe' ? Symbols.dangerous : Symbols.report, bg: al.severity == 'severe' ? C.error : C.surfaceHighest, fg: al.severity == 'severe' ? C.onError : C.onSurface, style: T.labelSm),
              ]),
            ]),
          ),
        ]),
      );

  Widget _order(ActiveOrder o) => Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Ic(Symbols.block, size: 15, color: C.error),
            const SizedBox(width: 4),
            Expanded(child: Text('ATTEMPTED ADMINISTRATION', style: T.badge.c(C.error))),
            const SizedBox(width: 8),
            Text('${hm(_at)} Not Saved', style: T.labelSm.c(C.onSurfaceVariant)),
          ]),
          const SizedBox(height: 8),
          Text(o.text, style: T.headlineSm),
          const SizedBox(height: 4),
          Wrap(spacing: 12, runSpacing: 4, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.schedule, size: 15, color: C.onSurfaceVariant), const SizedBox(width: 4), Flexible(child: Text('Cadence: ${o.frequency ?? 'not on order'}', style: T.bodySm.c(C.onSurfaceVariant)))]),
            Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.person_check, size: 15, color: C.onSurfaceVariant), const SizedBox(width: 4), Flexible(child: Text('Ordered by: ${o.orderedBy ?? 'not recorded'}', style: T.bodySm.c(C.onSurfaceVariant)))]),
          ]),
          const SizedBox(height: S.md),
          Box(
            color: C.surfaceLow,
            radius: R.lg,
            pad: const EdgeInsets.all(S.sm),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: _fact('ORDERED DOSE', o.dose == null ? 'Not on order' : grouped(o.dose), [o.doseUnit, o.route].whereType<String>().join(' '), C.onSurface)),
              const SizedBox(width: 4),
              Expanded(child: _fact('SCHEDULED TIME', widget.scheduledTime == null ? 'No set time' : hm(widget.scheduledTime), '', C.error)),
            ]),
          ),
        ]),
      );

  Widget _fact(String k, String v, String unit, Color color) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(k, style: T.unit.c(C.onSurfaceVariant)),
        const SizedBox(height: 2),
        Text.rich(TextSpan(text: '$v ', children: [TextSpan(text: unit, style: T.unit.c(C.onSurfaceVariant))]), style: (RegExp(r'^\d').hasMatch(v) ? T.vital : T.headlineSm).c(color)),
      ]);

  Widget _railCard(Color rail, List<Widget> children) => Container(
        clipBehavior: Clip.antiAlias,
        decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowSm),
        child: Stack(children: [
          Positioned(left: 0, top: 0, bottom: 0, width: 6, child: ColoredBox(color: rail)),
          Padding(padding: const EdgeInsets.fromLTRB(20, 12, 12, 12), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children)),
        ]),
      );

  Widget _reason(AppState a, PatientFacts f, ActiveOrder o, DoseLock l, {required bool first}) {
    final held = l.kind == 'hold' ? _holdOf(a, o.id) : null;
    final rel = l.related;
    final kind = switch (l.kind) { 'hold' => 'Hold On Order', 'slot' => 'Same Scheduled Time', _ => 'Order Interval' };
    final boxTitle = l.kind == 'hold' ? 'Hold set ${dateTimeLabel(held?['set_at'] as String?)}' : 'Related record: ${dateTimeLabel(rel?.careTime)}';
    final boxText = l.kind == 'hold' ? 'The hold has not been released in these records.' : rel == null ? '' : 'Recorded by ${staffShort(a.store, rel.performerId)}${rel.scheduledTime == null ? '' : ' for the ${hm(rel.scheduledTime)} time'}.';
    return _railCard(first ? C.error : C.secondary, [
      Row(children: [
        Expanded(child: Align(alignment: Alignment.centerLeft, child: Tag(kind.toUpperCase(), bg: first ? C.errorContainer : C.secondaryContainer, fg: first ? C.onErrorContainer : C.onSecondaryContainer))),
        const SizedBox(width: 8),
        Ic(first ? Symbols.warning : Symbols.lock, size: 13, color: first ? C.error : C.secondary),
        const SizedBox(width: 2),
        _cap2(context, 0.3, Text('DOSE BLOCKED', style: T.unit.bold.c(first ? C.error : C.secondary))),
      ]),
      const SizedBox(height: 8),
      Text(l.title, style: T.headlineSm),
      const SizedBox(height: 6),
      Text(l.reason, style: T.bodySm.s(12, 19.5).c(C.onSurfaceVariant)),
      const SizedBox(height: S.sm),
      Container(
        padding: const EdgeInsets.all(S.sm),
        decoration: BoxDecoration(color: first ? C.errorContainer.withValues(alpha: 0.4) : C.surfaceLow, borderRadius: R.rLg),
        child: Row(children: [
          Ic(l.kind == 'hold' ? Symbols.front_hand : Symbols.history, size: 20, color: first ? C.error : C.secondary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(boxTitle, style: T.labelSm.semi.c(first ? C.onErrorContainer : C.onSurface)),
              if (boxText.isNotEmpty) Text(boxText, style: T.bodySm.c(C.onSurfaceVariant)),
            ]),
          ),
        ]),
      ),
    ]);
  }

  /// Stored facts only. No interaction check is made.
  Widget _onRecord(AppState a, PatientFacts f, ActiveOrder o) {
    final last = orderHistory(o, f.meds).where((x) => x.entry.isConfirmed).firstOrNull;
    final inf = f.infusions.where((x) => x.id != o.id).firstOrNull;
    final (rate, unit) = inf == null ? (null, null) : currentRate(inf, f.meds);
    Widget cell(String k, String v) => Expanded(child: Column(children: [Text(k, style: T.unit.c(C.onSurfaceVariant), textAlign: TextAlign.center), Text(v, style: T.labelMd, textAlign: TextAlign.center)]));
    return _railCard(C.secondary, [
      Row(children: [
        const Expanded(child: Align(alignment: Alignment.centerLeft, child: Tag('ALSO ON RECORD', bg: C.secondaryContainer, fg: C.onSecondaryContainer))),
        const SizedBox(width: 8),
        _cap2(context, 0.3, Text('FACTS ONLY', style: T.unit.bold.c(C.secondary), textAlign: TextAlign.end)),
      ]),
      const SizedBox(height: 8),
      Text('Records for This Patient', style: T.headlineSm),
      const SizedBox(height: 6),
      Text('Shown for reference. The app makes no interaction check and gives no advice.', style: T.bodySm.s(12, 19.5).c(C.onSurfaceVariant)),
      const SizedBox(height: S.sm),
      Box(
        color: C.surfaceLow,
        radius: R.lg,
        pad: const EdgeInsets.all(S.sm),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          cell('Last Record, This Order', last == null ? 'None' : '${kEventLabel[last.med.event] ?? last.med.event} ${hm(last.entry.careTime)}'),
          const SizedBox(width: 4),
          cell('Infusion On Record', inf == null ? 'None' : '${inf.drugName ?? inf.text} ${rate == null ? '' : '${grouped(rate)} ${unit ?? ''}'}'),
        ]),
      ),
    ]);
  }

  Widget _option({bool on = false, required String title, required String text, Tag? tag, Color color = C.onSurface}) => Box(
        shadow: true,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Container(width: 20, height: 20, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: on ? C.primary : C.outline, width: on ? 2 : 1)), child: on ? const Center(child: Dot(C.primary, size: 10)) : null),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: Text(title, style: T.labelMd.bold.c(color))),
                if (tag != null) ...[const SizedBox(width: 8), _cap2(context, 0.3, tag)],
              ]),
              const SizedBox(height: 4),
              Text(text, style: T.bodySm.c(C.onSurfaceVariant)),
            ]),
          ),
        ]),
      );
}
