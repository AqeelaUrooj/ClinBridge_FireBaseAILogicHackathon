import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/repos/entries.dart';
import '../../data/schema.dart';
import '../../domain/facts.dart';
import '../../domain/vitals.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';
import 'patient_screens.dart';

/* ------------------------------ Draft ------------------------------ */

/// One unfinished vitals form per nurse and patient (and per record being corrected).
String vitalsDraftId(String userId, String patientId, [String? supersedesId]) => ['vitals', userId, patientId, if (supersedesId != null) supersedesId].join(':');

Doc vitalsDraftPayload(VitalsDraft d) => {
      'key': d.key, 'care_time': d.careTime, 'raw': d.raw, 'o2_device': d.o2Device, 'consciousness': d.consciousness,
      'supersedes_id': d.supersedesId, 'correction_reason': d.correctionReason,
    };

VitalsDraft? vitalsDraftFrom(String patientId, Object? payload) {
  if (payload is! Map || payload['key'] is! String || payload['care_time'] is! String) return null;
  return VitalsDraft(
    patientId: patientId,
    key: payload['key'] as String,
    careTime: payload['care_time'] as String,
    raw: {for (final e in ((payload['raw'] as Map?) ?? const {}).entries) '${e.key}': '${e.value}'},
    o2Device: payload['o2_device'] as String?,
    consciousness: payload['consciousness'] as String?,
    supersedesId: payload['supersedes_id'] as String?,
    correctionReason: payload['correction_reason'] as String?,
  );
}

/// The web's extra check beside the core's: not in the future, not before admission.
String? careTimeProblem(String careTime, String nowIso, String? admitTime) {
  if (ms(careTime) > ms(nowIso) + 60000) return 'Time cannot be in the future';
  if (admitTime != null && ms(careTime) < ms(admitTime)) return 'Time is before this patient was admitted';
  return null;
}

const List<String> kO2Devices = ['Nasal cannula', 'Simple mask', 'Other'];
const _order = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'spo2', 'resp_rate', 'temp_c', 'glucose_mgdl'];
const _amberBg = Color(0xFFFFF8E1), _amber = Color(0xFFF59E0B), _amberDark = Color(0xFF92400E);

/* ------------------------------ Editor ------------------------------ */

class VitalsEditorScreen extends StatefulWidget {
  final String patientId;
  final VitalsDraft? draft;
  const VitalsEditorScreen({super.key, required this.patientId, this.draft});
  @override
  State<VitalsEditorScreen> createState() => _VitalsEditorState();
}

class _VitalsEditorState extends State<VitalsEditorScreen> {
  final Map<String, TextEditingController> _c = {for (final k in [..._order, 'o2_flow_lpm']) k: TextEditingController()};
  final Map<String, FocusNode> _f = {for (final k in _order) k: FocusNode()};
  final _reason = TextEditingController();
  String _key = newId('k');
  String _careTime = '';
  String? _pain, _device, _avpu, _supersedes;
  bool _tried = false;

  /// The form as it was opened; different from now = unsaved edits.
  String _opened = '';

  /// A copy of this form is in the encrypted drafts.
  bool _stored = false;
  String? _keptAt, _draftProblem;
  Timer? _auto;

  AppState get _app => AppScope.read(context);
  String get _draftId => vitalsDraftId(_app.user?.id ?? '', widget.patientId, _supersedes);
  bool get _dirty => _fingerprint() != _opened;

  Map<String, String> get _raw => {
        for (final e in _c.entries) if (e.value.text.trim().isNotEmpty) e.key: e.value.text.trim().replaceAll(',', '.'),
        if (_pain != null) 'pain_0_10': _pain!,
      };
  String _fingerprint() => jsonText([_careTime, _raw, _device, _avpu, _reason.text.trim()]);
  VitalsDraft _draft() => VitalsDraft(patientId: widget.patientId, key: _key, careTime: _careTime, raw: _raw, o2Device: _device, consciousness: _avpu, supersedesId: _supersedes, correctionReason: _supersedes == null ? null : _reason.text.trim());

  @override
  void initState() {
    super.initState();
    for (final c in [..._c.values, _reason]) {
      c.addListener(_changed);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _offerDraft();
    });
  }

  bool _ready = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _careTime = _app.nowIso;
    if (widget.draft != null) _fill(widget.draft!);
    _opened = _fingerprint();
    _ready = true;
    final d = widget.draft;
    if (d != null && _app.unlocked) _stored = vitalsDraftFrom(widget.patientId, getDraft(_app.store, _draftId, _app.user?.id ?? '')?['payload'])?.key == d.key;
  }

  void _fill(VitalsDraft d) {
    _key = d.key;
    _careTime = d.careTime;
    _device = d.o2Device;
    _avpu = d.consciousness;
    _pain = d.raw['pain_0_10'];
    _supersedes = d.supersedesId;
    for (final e in _c.entries) {
      e.value.text = d.raw[e.key] ?? '';
    }
    _reason.text = d.correctionReason ?? '';
  }

  @override
  void dispose() {
    _auto?.cancel();
    for (final c in [..._c.values, _reason]) {
      c.dispose();
    }
    for (final f in _f.values) {
      f.dispose();
    }
    super.dispose();
  }

  void _changed() {
    if (!_ready || !mounted) return;
    setState(() {});
    _auto?.cancel();
    _auto = Timer(const Duration(milliseconds: 700), () {
      if (mounted) _keepDraft();
    });
  }

  /// Writes the form to the encrypted drafts (or removes the copy when nothing is left). Returns false and says why when it could not.
  bool _keepDraft() {
    _auto?.cancel();
    final a = _app;
    if (a.user == null || !a.unlocked || (!_dirty && !_stored)) return true;
    try {
      if (_dirty) {
        saveDraft(a.ctx(), id: _draftId, kind: 'vitals', patientId: widget.patientId, payload: vitalsDraftPayload(_draft()));
        _stored = true;
        _keptAt = a.nowIso;
      } else if (_raw.isEmpty && _stored) {
        discardDraft(a.ctx(), _draftId, audit: false);
        _stored = false;
      }
      _draftProblem = null;
      a.saved();
      return true;
    } catch (e) {
      setState(() => _draftProblem = e is AppError ? e.message : 'The draft was not kept: $e');
      return false;
    }
  }

  Future<void> _offerDraft() async {
    if (!mounted) return;
    final a = _app;
    if (a.user == null || !a.unlocked) return;
    var found = vitalsDraftFrom(widget.patientId, getDraft(a.store, _draftId, a.user!.id)?['payload']);
    // Opened without a form (chart or queue): an unfinished correction is offered too.
    if (found == null && widget.draft == null) {
      for (final d in listDrafts(a.store, a.user!.id, kind: 'vitals', patientId: widget.patientId)) {
        found ??= vitalsDraftFrom(widget.patientId, d['payload']);
      }
    }
    if (found == null || found.key == widget.draft?.key) return;
    final draft = found;
    final other = draft.supersedesId != _supersedes; // it belongs to another form: never overwritten by this one
    final n = draft.raw.length + (draft.consciousness == null ? 0 : 1);
    final choice = await _ask(
      context,
      title: 'Unfinished vitals',
      text: 'You started ${draft.supersedesId == null ? 'vitals for this patient' : 'a correction of a saved record of this patient'}. $n value${n == 1 ? '' : 's'}, measured ${dateTimeLabel(draft.careTime)}. They are not a record yet.',
      options: [
        const ('keep', 'Continue the draft', BtnKind.primary),
        ('new', other ? 'New vitals, keep the draft' : widget.draft == null ? 'Start empty and discard the draft' : 'Start again and discard the draft', BtnKind.quiet),
        const ('back', 'Back to the chart', BtnKind.quiet),
      ],
      dismissible: false,
    );
    if (!mounted) return;
    if (choice == 'keep') {
      setState(() {
        _fill(draft);
        _opened = _fingerprint();
        _stored = true;
      });
    } else if (choice == 'new') {
      if (other) return;
      try {
        discardDraft(a.ctx(), _draftId);
        a.saved();
      } catch (e) {
        if (mounted) toast(context, e is AppError ? e.message : '$e', error: true, icon: Symbols.error);
      }
    } else {
      _pop();
    }
  }

  void _pop() {
    final nav = Navigator.of(context);
    if (nav.canPop()) {
      nav.pop();
    } else {
      Go.summary(context, widget.patientId);
    }
  }

  Future<void> _back() async {
    FocusScope.of(context).unfocus();
    if (!_dirty) return _pop();
    final choice = await _ask(
      context,
      title: 'Leave these vitals?',
      text: 'Nothing is saved to the chart yet.',
      options: const [('keep', 'Keep as a draft and leave', BtnKind.primary), ('discard', 'Discard these values', BtnKind.dangerQuiet), ('stay', 'Keep editing', BtnKind.quiet)],
    );
    if (!mounted || choice == null || choice == 'stay') return;
    if (choice == 'keep') {
      if (!_keepDraft()) {
        toast(context, _draftProblem!, error: true, icon: Symbols.error);
        return;
      }
      toast(context, 'Draft kept on this phone. It is not a record yet.');
      return _pop();
    }
    try {
      _auto?.cancel();
      if (getDraft(_app.store, _draftId, _app.user!.id) != null) {
        discardDraft(_app.ctx(), _draftId);
        _app.saved();
      }
      _opened = _fingerprint();
      _pop();
    } catch (e) {
      toast(context, e is AppError ? e.message : '$e', error: true, icon: Symbols.error);
    }
  }

  Future<void> _review(Encounter? enc) async {
    setState(() => _tried = true);
    final r = validateVitals(VitalsForm(_raw, o2Device: _device, consciousness: _avpu));
    final time = careTimeProblem(_careTime, _app.nowIso, enc?.admitTime);
    final reason = _supersedes != null && _reason.text.trim().isEmpty;
    if (!r.ok || time != null || reason) {
      final first = _order.where((k) => r.errors[k] != null).firstOrNull;
      if (first != null) {
        _f[first]!.requestFocus();
      }
      return;
    }
    FocusScope.of(context).unfocus();
    _keepDraft();
    final route = ModalRoute.of(context);
    await Go.vitalsReview(context, _draft());
    if (!mounted || !_app.unlocked || !(route?.isCurrent ?? true)) return;
    // Saved on the review page (its ways out go to the chart): this form is finished.
    if (_app.store.get('m_entry_key', _key) != null) {
      _auto?.cancel();
      _pop();
    }
  }

  Future<void> _editTime(Encounter? enc) async {
    FocusScope.of(context).unfocus();
    final iso = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: C.surfaceLowest,
      barrierColor: C.primary.withValues(alpha: 0.6),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (c) => _TimeSheet(initial: _careTime, nowIso: _app.nowIso, admitTime: enc?.admitTime),
    );
    if (iso == null || !mounted) return;
    _careTime = iso;
    _changed();
  }

  Future<void> _editOxygen() async {
    FocusScope.of(context).unfocus();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: C.surfaceLowest,
      barrierColor: C.primary.withValues(alpha: 0.6),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (c) => _OxygenSheet(
        device: _device,
        flow: _c['o2_flow_lpm']!,
        onDevice: (d) {
          _device = d;
          if (d == null) _c['o2_flow_lpm']!.text = '';
          _changed();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = a.unlocked ? loadFacts(a.store, widget.patientId, a.nowIso) : null;
    if (f == null) return PhonePage(children: [Text('PRACTICE', style: T.badge), Text('This patient is not in the records on this phone.', style: T.bodyMd)]);
    final raw = _raw;
    final r = validateVitals(VitalsForm(raw, o2Device: _device, consciousness: _avpu));
    final timeProblem = careTimeProblem(_careTime, a.nowIso, f.encounter?.admitTime);
    String? err(String k) => r.errors[k] == null || (!_tried && (raw[k] ?? '').isEmpty) ? null : r.errors[k];
    bool odd(String k) => r.warnings.containsKey(k);
    final typing = MediaQuery.viewInsetsOf(context).bottom > 0;
    final when = '${_careTime.substring(0, 10) == a.nowIso.substring(0, 10) ? '' : '${dayLabel(_careTime).replaceFirst(RegExp(r' \d{4}$'), '')} '}${hm(_careTime)}';

    Widget input(String k, {bool center = false}) {
      final rule = kVitalRules[k]!;
      final i = _order.indexOf(k);
      final field = Field(
        _c[k]!,
        key: ValueKey('v-$k'),
        focus: _f[k],
        label: '${rule.label}, ${rule.unit}',
        hint: '—',
        maxLength: 6,
        align: center ? TextAlign.center : TextAlign.start,
        style: T.vital.c(C.primary),
        keyboard: rule.integer ? TextInputType.number : const TextInputType.numberWithOptions(decimal: true),
        action: i == _order.length - 1 ? TextInputAction.done : TextInputAction.next,
        onSubmitted: (_) => i == _order.length - 1 ? _f[k]!.unfocus() : _f[_order[i + 1]]!.requestFocus(),
      );
      return center ? field : IntrinsicWidth(child: ConstrainedBox(constraints: const BoxConstraints(minWidth: 34), child: field));
    }

    /// What is below a value: a fault, a re-check hint, "Not assessed", or the last stored value with its time.
    Widget below(String k) {
      final e = err(k);
      if (e != null) return _Line(Symbols.error, e, C.error);
      if ((raw[k] ?? '').isEmpty) return const _Line(null, 'Not assessed', C.onSurfaceVariant, dot: C.outlineVariant);
      if (odd(k)) return const _Line(Symbols.error, 'Check value', kAmberText);
      final last = f.latest(k);
      return _Line(null, last == null ? 'No earlier value' : 'Last ${formatDose(last.$1)} at ${hm(last.$2)}', C.onSurfaceVariant, dot: C.secondary);
    }

    Widget? tag(String k) {
      if (err(k) != null) return const _Chip('Fix', C.errorContainer, C.onErrorContainer);
      if ((raw[k] ?? '').isEmpty) return null;
      return odd(k) ? const _Chip('Check', _amberBg, kAmberText) : const _Chip('Entered', C.secondaryFixed, C.onSecondaryFixed);
    }

    Widget card(String k, IconData? icon, Color iconColor, String label, {String? unitRight, String? unitAfter, Widget? extra, double fill = 0}) => GestureDetector(
          behavior: HitTestBehavior.opaque,
          excludeFromSemantics: true,
          onTap: () => _f[k]!.requestFocus(),
          child: Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, spacing: 4, runSpacing: 2, children: [
                Row(mainAxisSize: MainAxisSize.min, children: [
                  if (icon != null) ...[Ic(icon, size: 16, color: iconColor, fill: fill), const SizedBox(width: 4)],
                  Flexible(child: SubText(label.toUpperCase(), T.labelSm.c(C.onSurfaceVariant).tr(0.025))),
                ]),
                if (tag(k) != null) tag(k)! else if (unitRight != null) Text(unitRight, style: T.unit.c(C.onSurfaceVariant)),
              ]),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                  Flexible(child: input(k)),
                  Text(unitAfter ?? '', style: T.unit.c(C.onSurfaceVariant)),
                ]),
              ),
              if (extra != null) ...[extra, if (err(k) != null || odd(k)) Padding(padding: const EdgeInsets.only(top: 4), child: below(k))] else below(k),
            ]),
          ),
        );

    Widget bp(String k, String label) => Expanded(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            excludeFromSemantics: true,
            onTap: () => _f[k]!.requestFocus(),
            child: Container(
              constraints: const BoxConstraints(minHeight: 56),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl, border: err(k) == null ? null : Border.all(color: C.error)),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [Text(label, style: T.labelSm.c(C.onSurfaceVariant)), input(k, center: true)]),
            ),
          ),
        );
    final bpErr = err('bp_systolic') ?? err('bp_diastolic');
    final bpOdd = odd('bp_systolic') || odd('bp_diastolic') || odd('bp_order');
    final bpEmpty = (raw['bp_systolic'] ?? '').isEmpty && (raw['bp_diastolic'] ?? '').isEmpty;
    final lastSys = f.latest('bp_systolic'), lastDia = f.latest('bp_diastolic');

    Widget pick(String text, bool on, VoidCallback tap, {String? label, required Key key}) => Semantics(
          button: true,
          selected: on,
          label: label ?? text,
          excludeSemantics: true,
          onTap: tap,
          child: GestureDetector(
            key: key,
            behavior: HitTestBehavior.opaque,
            onTap: tap,
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              alignment: Alignment.center,
              decoration: BoxDecoration(color: on ? C.primary : C.surfaceLow, borderRadius: R.rBase, boxShadow: on ? shadowSm : null),
              child: FittedBox(fit: BoxFit.scaleDown, child: Text(text, style: T.labelMd.c(on ? C.onPrimary : C.onSurface))),
            ),
          ),
        );
    Widget painRow(int from, int to) => Row(children: [
          for (var i = from; i <= to; i++) ...[
            if (i > from) const SizedBox(width: 4),
            Expanded(
              child: pick('$i', _pain == '$i', () {
                _pain = _pain == '$i' ? null : '$i';
                _changed();
              }, label: 'Pain $i of 10', key: ValueKey('pain-$i')),
            ),
          ],
        ]);
    Widget timeChip() => Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.schedule, size: 14, color: C.onSurfaceVariant), const SizedBox(width: 4), Text(when, style: T.labelSm.c(C.onSurfaceVariant))]);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (did, _) {
        if (!did) _back();
      },
      child: PhonePage(
        header: BackHeader(title: _supersedes == null ? 'Record Vitals' : 'Correct Vitals', sub: '${f.patient.fullName} • Bed ${f.bed}', onBack: _back),
        pad: const EdgeInsets.fromLTRB(12, 0, 12, 16),
        footer: Container(
          color: C.surface.withValues(alpha: 0.95),
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (_tried && r.errors['form'] != null) Padding(padding: const EdgeInsets.only(bottom: 4), child: _Line(Symbols.error, r.errors['form']!, C.error)),
            DecoratedBox(decoration: const BoxDecoration(borderRadius: R.rXl, boxShadow: shadowMd), child: Btn('Review entry', kind: BtnKind.navy, radius: R.xl, style: T.headlineSm, trailing: Symbols.arrow_forward, onTap: () => _review(f.encounter))),
            if (!typing) ...[
              const SizedBox(height: 4),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Ic(_draftProblem == null ? Symbols.lock : Symbols.error, size: 13, color: _draftProblem == null ? C.tertiary : C.error),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    _draftProblem ?? (_stored && _keptAt != null ? 'Draft kept encrypted on this phone at ${hm(_keptAt)}' : 'Will be stored in the encrypted records on this phone'),
                    style: T.labelSm.c(_draftProblem == null ? C.onSurfaceVariant : C.error),
                    textAlign: TextAlign.center,
                  ),
                ),
              ]),
            ],
          ]),
        ),
        children: [
          const _PracticeRail(),
          const SizedBox(height: 8),
          if (_supersedes != null) ...[
            Box(
              color: C.secondaryFixed,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Correction of a saved record', style: T.labelMd.c(C.onSecondaryFixed)),
                Text('The old values stay in the history, crossed out. Say why you are fixing this.', style: T.bodySm.c(C.onSecondaryFixed)),
                const SizedBox(height: 8),
                Container(
                  constraints: const BoxConstraints(minHeight: 48),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
                  decoration: BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg, border: _tried && _reason.text.trim().isEmpty ? Border.all(color: C.error) : null),
                  child: Field(_reason, key: const ValueKey('v-reason'), label: 'Reason for the correction', hint: 'e.g. typed pulse wrong', maxLines: 3, minLines: 1, maxLength: 200),
                ),
                if (_tried && _reason.text.trim().isEmpty) const Padding(padding: EdgeInsets.only(top: 4), child: _Line(Symbols.error, 'Say why you are fixing this', C.error)),
              ]),
            ),
            const SizedBox(height: 12),
          ],
          Container(
            padding: const EdgeInsets.all(12),
            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Ic(f.realAllergies.isEmpty ? Symbols.person_check : Symbols.warning, size: 16, color: f.realAllergies.isEmpty ? C.secondary : C.error),
                const SizedBox(width: 6),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text.rich(TextSpan(children: [TextSpan(text: f.patient.fullName, style: T.labelMd), TextSpan(text: '  (Bed ${f.bed})', style: T.bodySm.c(C.onSurfaceVariant))])),
                    Text('MRN ${f.patient.mrn} • DOB ${dobLabel(f.patient)}', style: T.labelSm.c(C.onSurfaceVariant)),
                  ]),
                ),
                Tap(
                  label: 'Edit observation time, now ${hm(_careTime)}',
                  onTap: () => _editTime(f.encounter),
                  child: Container(padding: const EdgeInsets.all(4), decoration: const BoxDecoration(color: C.surfaceHighest, borderRadius: R.rBase), child: timeChip()),
                ),
              ]),
              const SizedBox(height: 4),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Wrap(spacing: 4, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    Padding(padding: const EdgeInsets.only(right: 4), child: Text('Alerts:', style: T.labelSm.c(C.onSurfaceVariant))),
                    if (f.realAllergies.isEmpty)
                      Text(f.allergyText, style: T.labelSm)
                    else
                      for (final x in f.realAllergies) Tag(x.substance, icon: Symbols.block, bg: C.errorContainer, fg: C.onErrorContainer, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
                  ]),
                ),
                const SizedBox(width: 4),
                if (a.verifiedPatientId == widget.patientId) const Flexible(flex: 0, child: Tag('Identity checked', icon: Symbols.verified_user, bg: C.secondaryFixed, fg: C.onSecondaryFixedVariant, pad: EdgeInsets.symmetric(horizontal: 4, vertical: 2))),
              ]),
            ]),
          ),
          const SizedBox(height: 12),
          Semantics(
            button: true,
            label: 'Observation time ${hm(_careTime)}. Change',
            excludeSemantics: true,
            onTap: () => _editTime(f.encounter),
            child: GestureDetector(
              key: const ValueKey('v-time'),
              behavior: HitTestBehavior.opaque,
              onTap: () => _editTime(f.encounter),
              child: Box(
                shadow: true,
                pad: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                border: timeProblem == null ? null : Border.all(color: C.error),
                child: Row(children: [
                  const Ic(Symbols.update, size: 20, color: C.secondary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Observation Timestamp', style: T.labelMd),
                      Text(timeProblem ?? 'When it was measured. Tap to change', style: T.bodySm.c(timeProblem == null ? C.onSurfaceVariant : C.error)),
                    ]),
                  ),
                  const SizedBox(width: 8),
                  Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rLg), child: Text(when, style: T.headlineSm.c(C.primary))),
                ]),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg),
            child: Row(children: [
              const Ic(Symbols.info, size: 16, color: C.onSurfaceVariant),
              const SizedBox(width: 4),
              Expanded(child: Text.rich(TextSpan(style: T.labelSm.c(C.onSurfaceVariant), children: [const TextSpan(text: 'Unentered fields stay '), TextSpan(text: 'Not Assessed', style: T.labelSm.bold), const TextSpan(text: ', never numeric 0.')]))),
            ]),
          ),
          const SizedBox(height: 8),
          Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, spacing: 4, runSpacing: 2, children: [
                Text('BLOOD PRESSURE', style: T.labelMd.c(C.onSurfaceVariant).tr(0.025)),
                bpErr != null
                    ? const _Chip('Fix', C.errorContainer, C.onErrorContainer)
                    : bpEmpty
                        ? const _Chip('Not assessed', C.surfaceContainer, C.onSurfaceVariant)
                        : bpOdd
                            ? const _Chip('Check value', _amberBg, kAmberText)
                            : const _Chip('Entered', C.secondaryFixed, C.onSecondaryFixed),
              ]),
              const SizedBox(height: 4),
              Row(children: [
                bp('bp_systolic', 'Systolic'),
                Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('/', style: T.headlineMd.c(C.outlineVariant).regular)),
                bp('bp_diastolic', 'Diastolic'),
                const SizedBox(width: 12),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text('mmHg', style: T.unit.c(C.onSurfaceVariant)),
                  const SizedBox(height: 4),
                  Text(lastSys == null || lastDia == null ? 'No last' : 'Last ${lastSys.$1}/${lastDia.$1}', style: T.bodySm.medium.c(C.secondary).s(11, 14)),
                ]),
              ]),
              if (bpErr != null) Padding(padding: const EdgeInsets.only(top: 4), child: _Line(Symbols.error, bpErr, C.error)),
              if (bpErr == null && odd('bp_order')) const Padding(padding: EdgeInsets.only(top: 4), child: _Line(Symbols.error, 'Bottom number is not lower than the top', kAmberText)),
            ]),
          ),
          const SizedBox(height: 8),
          TwoCols(gap: 8, [
            card('heart_rate', Symbols.favorite, C.error, 'Heart Rate', unitAfter: 'bpm', fill: 1),
            card('spo2', Symbols.air, C.secondary, 'SpO₂',
                unitAfter: '%',
                unitRight: 'Not assessed',
                extra: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Semantics(
                    button: true,
                    label: 'Oxygen device: ${_oxygen(raw)}. Change',
                    excludeSemantics: true,
                    onTap: _editOxygen,
                    child: GestureDetector(
                      key: const ValueKey('v-oxygen'),
                      behavior: HitTestBehavior.opaque,
                      onTap: _editOxygen,
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 48),
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase, border: r.errors['o2_flow_lpm'] == null ? null : Border.all(color: C.error)),
                        child: Row(children: [Expanded(child: Text(_oxygen(raw), style: T.labelSm, maxLines: 2, overflow: TextOverflow.ellipsis)), const Ic(Symbols.unfold_more, size: 16, color: C.onSurfaceVariant)]),
                      ),
                    ),
                  ),
                  if (r.errors['o2_flow_lpm'] != null) Padding(padding: const EdgeInsets.only(top: 4), child: _Line(Symbols.error, 'Flow: ${r.errors['o2_flow_lpm']}', C.error)),
                ])),
            card('resp_rate', null, C.secondary, 'Resp. Rate', unitAfter: '/min'),
            card('temp_c', Symbols.device_thermostat, C.secondary, 'Temp', unitAfter: '°C'),
          ]),
          const SizedBox(height: 8),
          Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const Ic(Symbols.sentiment_neutral, size: 16, color: C.secondary),
                const SizedBox(width: 4),
                Expanded(child: Text('PAIN RATING (NRS)', style: T.labelMd.c(C.onSurfaceVariant).tr(0.025))),
                const SizedBox(width: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rBase),
                  child: Text.rich(TextSpan(children: [
                    if (_pain == null) TextSpan(text: 'Not assessed', style: T.labelSm.c(C.onSurfaceVariant).s(11, 22)) else ...[TextSpan(text: _pain, style: T.headlineSm.bold.c(C.primary)), TextSpan(text: ' / 10', style: T.labelSm.c(C.onSurfaceVariant))],
                  ])),
                ),
              ]),
              const SizedBox(height: 4),
              painRow(0, 5),
              const SizedBox(height: 4),
              painRow(6, 10),
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
                child: Wrap(alignment: WrapAlignment.spaceBetween, spacing: 8, children: [
                  Text('0: No Pain', style: T.bodySm.c(C.onSurfaceVariant)),
                  Text('Tap again to clear', style: T.bodySm.c(C.onSurfaceVariant)),
                  Text('10: Worst Possible', style: T.bodySm.c(C.onSurfaceVariant)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 8),
          Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Wrap(alignment: WrapAlignment.spaceBetween, spacing: 4, children: [
                Text('CONSCIOUSNESS LEVEL (AVPU)', style: T.labelSm.c(C.onSurfaceVariant).tr(0.025)),
                if (_avpu == null) Text('Not assessed', style: T.labelSm.c(C.onSurfaceVariant)),
              ]),
              const SizedBox(height: 4),
              Row(children: [
                for (var i = 0; i < kAvpu.length; i++) ...[
                  if (i > 0) const SizedBox(width: 4),
                  Expanded(
                    child: pick(const ['Alert', 'Voice', 'Pain', 'Unresp.'][i], _avpu == kAvpu[i], () {
                      _avpu = _avpu == kAvpu[i] ? null : kAvpu[i];
                      _changed();
                    }, label: kAvpu[i], key: ValueKey('avpu-$i')),
                  ),
                ],
              ]),
            ]),
          ),
          const SizedBox(height: 8),
          card('glucose_mgdl', Symbols.glucose, C.secondary, 'More: Blood sugar', unitAfter: 'mg/dL'),
        ],
      ),
    );
  }

  String _oxygen(Map<String, String> raw) {
    final flow = raw['o2_flow_lpm'];
    if (_device == null) return flow == null ? 'Oxygen: not recorded' : '$flow L/min, device?';
    return flow == null ? _device! : '$flow L/min $_device';
  }
}

class _Line extends StatelessWidget {
  final IconData? icon;
  final String text;
  final Color color;
  final Color? dot;
  const _Line(this.icon, this.text, this.color, {this.dot});
  @override
  Widget build(BuildContext context) => Row(children: [
        if (icon != null) ...[Ic(icon!, size: 14, color: color), const SizedBox(width: 4)],
        if (dot != null) ...[Dot(dot!, size: 6), const SizedBox(width: 4)],
        Expanded(child: Text(text, style: T.bodySm.c(color))),
      ]);
}

class _Chip extends StatelessWidget {
  final String text;
  final Color bg, fg;
  const _Chip(this.text, this.bg, this.fg);
  @override
  Widget build(BuildContext context) => Tag(text, bg: bg, fg: fg, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2));
}

/// The amber strip of the export. No switch: this app has no other mode.
class _PracticeRail extends StatelessWidget {
  const _PracticeRail();
  @override
  Widget build(BuildContext context) {
    const light = Color(0xFFFDE68A);
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: const Color(0xFF2A2007), borderRadius: R.rXl, border: Border.all(color: _amber.withValues(alpha: 0.4)), boxShadow: shadowSm),
      child: Column(children: [
        ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 24),
          child: Row(children: [
            const Dot(_amber, size: 10),
            const SizedBox(width: 4),
            Expanded(child: Text('PRACTICE · FICTIONAL DATA', style: T.labelMd.bold.c(light).tr(0.025))),
            const SizedBox(width: 8),
            Text('TRAINING', style: T.badge.c(light)),
          ]),
        ),
        const SizedBox(height: 6),
        Container(
          padding: const EdgeInsets.only(top: 4),
          decoration: BoxDecoration(border: Border(top: BorderSide(color: _amber.withValues(alpha: 0.2)))),
          child: Row(children: [
            const Ic(Symbols.science, size: 14, color: _amber),
            const SizedBox(width: 4),
            Expanded(child: Text('Saved encrypted on this phone', style: T.bodySm.medium.c(light.withValues(alpha: 0.85)))),
            const SizedBox(width: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: const Color(0xFF453412).withValues(alpha: 0.8), borderRadius: R.rBase, border: Border.all(color: _amber.withValues(alpha: 0.3))),
              child: Text('Nothing is sent', style: T.labelSm.semi.c(_amber)),
            ),
          ]),
        ),
      ]),
    );
  }
}

/// A question with more than two answers. Null = dismissed.
Future<String?> _ask(BuildContext context, {required String title, required String text, required List<(String, String, BtnKind)> options, bool dismissible = true}) => showDialog<String>(
      context: context,
      barrierDismissible: dismissible,
      barrierColor: C.primaryContainer.withValues(alpha: 0.4),
      builder: (c) => PopScope(
        canPop: dismissible,
        child: Dialog(
          backgroundColor: C.surfaceLowest,
          shape: const RoundedRectangleBorder(borderRadius: R.rXl),
          insetPadding: const EdgeInsets.all(S.lg),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(S.lg),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(title, style: T.headlineSm),
              const SizedBox(height: S.sm),
              Text(text, style: T.bodyMd.c(C.onSurfaceVariant)),
              const SizedBox(height: S.sm),
              for (final o in options) Padding(padding: const EdgeInsets.only(top: S.sm), child: Btn(o.$2, kind: o.$3, onTap: () => Navigator.pop(c, o.$1))),
            ]),
          ),
        ),
      ),
    );

class _TimeSheet extends StatefulWidget {
  final String initial, nowIso;
  final String? admitTime;
  const _TimeSheet({required this.initial, required this.nowIso, this.admitTime});
  @override
  State<_TimeSheet> createState() => _TimeSheetState();
}

class _TimeSheetState extends State<_TimeSheet> {
  late String _day = widget.initial.substring(0, 10);
  late final _h = TextEditingController(text: widget.initial.substring(11, 13));
  late final _m = TextEditingController(text: widget.initial.substring(14, 16));
  final _mFocus = FocusNode();
  String? _error;

  @override
  void dispose() {
    _h.dispose();
    _m.dispose();
    _mFocus.dispose();
    super.dispose();
  }

  void _move(int days) => setState(() {
        _day = PracticeClock.toIso(ms('${_day}T12:00:00${widget.nowIso.substring(19)}') + days * 86400000).substring(0, 10);
        _error = null;
      });

  void _set() {
    final h = int.tryParse(_h.text.trim()), m = int.tryParse(_m.text.trim());
    if (h == null || m == null || h < 0 || h > 23 || m < 0 || m > 59) {
      setState(() => _error = 'Use hours 00–23 and minutes 00–59');
      return;
    }
    final iso = '${_day}T${'$h'.padLeft(2, '0')}:${'$m'.padLeft(2, '0')}:00${widget.nowIso.substring(19)}';
    final p = careTimeProblem(iso, widget.nowIso, widget.admitTime);
    if (p != null) {
      setState(() => _error = p);
      return;
    }
    Navigator.pop(context, iso);
  }

  @override
  Widget build(BuildContext context) {
    final isToday = _day == widget.nowIso.substring(0, 10);
    Widget box(TextEditingController c, String key, String label, {FocusNode? focus, VoidCallback? next}) => SizedBox(
          width: 88,
          child: Container(
            constraints: const BoxConstraints(minHeight: 56),
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl),
            child: Field(c, key: ValueKey(key), focus: focus, label: label, align: TextAlign.center, style: T.vital, keyboard: TextInputType.number, maxLength: 2, action: next == null ? TextInputAction.done : TextInputAction.next, onSubmitted: (_) => next == null ? _set() : next()),
          ),
        );
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(12, 12, 12, 12 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [Expanded(child: Text('When was it measured?', style: T.headlineSm)), const Tag('PRACTICE', bg: C.secondaryContainer, fg: C.onSecondaryFixed)]),
          const SizedBox(height: 8),
          Row(children: [
            Tap(label: 'Day before', onTap: () => _move(-1), child: const Ic(Symbols.chevron_left, size: 24)),
            Expanded(child: Text('${dayLabel(_day)}${isToday ? ' (today)' : ''}', style: T.labelMd, textAlign: TextAlign.center)),
            Tap(label: 'Day after', onTap: isToday ? null : () => _move(1), child: Ic(Symbols.chevron_right, size: 24, color: isToday ? C.outlineVariant : C.onSurface)),
          ]),
          const SizedBox(height: 8),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            box(_h, 'time-h', 'Hour', next: _mFocus.requestFocus),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text(':', style: T.vital)),
            box(_m, 'time-m', 'Minute', focus: _mFocus),
          ]),
          const SizedBox(height: 8),
          if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: _Line(Symbols.error, _error!, C.error)),
          Text('Practice time now: ${dateTimeLabel(widget.nowIso)}', style: T.bodySm.c(C.onSurfaceVariant), textAlign: TextAlign.center),
          const SizedBox(height: 12),
          Btn('Set time', kind: BtnKind.navy, onTap: _set),
          const SizedBox(height: 8),
          Btn('Use the time now', kind: BtnKind.quiet, onTap: () => Navigator.pop(context, widget.nowIso)),
        ]),
      ),
    );
  }
}

class _OxygenSheet extends StatefulWidget {
  final String? device;
  final TextEditingController flow;
  final ValueChanged<String?> onDevice;
  const _OxygenSheet({required this.device, required this.flow, required this.onDevice});
  @override
  State<_OxygenSheet> createState() => _OxygenSheetState();
}

class _OxygenSheetState extends State<_OxygenSheet> {
  late String? _device = widget.device;

  @override
  Widget build(BuildContext context) {
    final problem = validateVitals(VitalsForm({'o2_flow_lpm': widget.flow.text.replaceAll(',', '.')}, o2Device: _device)).errors['o2_flow_lpm'];
    Widget option(String text, String? value) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Btn(text, kind: _device == value ? BtnKind.navy : BtnKind.quiet, onTap: () {
            setState(() => _device = value);
            widget.onDevice(value);
          }),
        );
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(12, 12, 12, 12 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [Expanded(child: Text('How is oxygen given?', style: T.headlineSm)), const Tag('PRACTICE', bg: C.secondaryContainer, fg: C.onSecondaryFixed)]),
          option('Not recorded', null),
          for (final d in kO2Devices) option(d, d),
          const SizedBox(height: 12),
          Text('Flow', style: T.labelSm.c(C.onSurfaceVariant)),
          const SizedBox(height: 4),
          Opacity(
            opacity: _device == null ? 0.5 : 1,
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl),
              child: Row(children: [
                Expanded(child: Field(widget.flow, key: const ValueKey('v-o2_flow_lpm'), enabled: _device != null, label: 'Oxygen flow, L/min', hint: 'Not recorded', style: T.headlineSm, maxLength: 5, keyboard: const TextInputType.numberWithOptions(decimal: true), onChanged: (_) => setState(() {}))),
                Text('L/min', style: T.unit.c(C.onSurfaceVariant)),
              ]),
            ),
          ),
          if (problem != null) Padding(padding: const EdgeInsets.only(top: 4), child: _Line(Symbols.error, problem, C.error)),
          const SizedBox(height: 12),
          Btn('Done', onTap: () => Navigator.pop(context)),
        ]),
      ),
    );
  }
}

/* ------------------------------ Review ------------------------------ */

class VitalsReviewScreen extends StatefulWidget {
  final VitalsDraft draft;
  const VitalsReviewScreen({super.key, required this.draft});
  @override
  State<VitalsReviewScreen> createState() => _VitalsReviewState();
}

class _VitalsReviewState extends State<VitalsReviewScreen> {
  late final VitalsResult _r = validateVitals(VitalsForm(widget.draft.raw, o2Device: widget.draft.o2Device, consciousness: widget.draft.consciousness));
  late final Set<String> _ticked = {for (final k in widget.draft.rechecked) if (_r.warnings.containsKey(k)) k};
  final _status = GlobalKey();
  bool _busy = false;
  String? _error;
  Entry? _saved;

  bool get _allTicked => _r.warnings.keys.every(_ticked.contains);

  Future<void> _save() async {
    if (_busy || _saved != null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    await WidgetsBinding.instance.endOfFrame; // the busy state is on screen before the write
    if (!mounted) return;
    final a = AppScope.read(context);
    final d = widget.draft;
    try {
      if (!_r.ok) throw AppError(_r.errors.values.first);
      if (!_allTicked) throw const AppError('Tick every value you checked again first.');
      final c = a.ctx();
      final id = vitalsDraftId(c.userId, d.patientId, d.supersedesId);
      final e = createEntry(
        c,
        type: 'vital_sign',
        patientId: d.patientId,
        careTime: d.careTime,
        values: _r.values,
        clientKey: d.key,
        supersedesId: d.supersedesId,
        correctionReason: d.correctionReason,
        // The unfinished copy goes away in the same transaction.
        also: (_) {
          if (c.store.get('m_draft', id) != null) c.store.delete('m_draft', id);
        },
      );
      _saved = e;
      a.saved();
    } catch (e) {
      _error = e is AppError ? e.message : 'Nothing was saved: $e';
    }
    if (!mounted) return;
    setState(() => _busy = false);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _status.currentContext;
      if (c != null && c.mounted) Scrollable.ensureVisible(c, alignment: 1, duration: const Duration(milliseconds: 200));
    });
  }

  void _edit() {
    final nav = Navigator.of(context);
    if (nav.canPop()) {
      nav.pop(false);
    } else {
      Go.vitals(context, widget.draft.patientId, draft: widget.draft);
    }
  }

  void _toChart() => Go.summary(context, widget.draft.patientId);

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final d = widget.draft;
    final f = a.unlocked ? loadFacts(a.store, d.patientId, a.nowIso) : null;
    if (f == null) return PhonePage(children: [Text('PRACTICE', style: T.badge), Text('This patient is not in the records on this phone.', style: T.bodyMd)]);
    final v = _r.values;
    final allergy = mainAllergy(f);
    final today = f.entries.where((x) => x.entry.type == 'vital_sign' && x.entry.isConfirmed && x.entry.careTime.substring(0, 10) == a.nowIso.substring(0, 10)).length;
    final saved = _saved;
    final oxygen = v['o2_device'] == null ? null : '${v['o2_flow_lpm'] == null ? '' : '${formatDose(v['o2_flow_lpm'] as num)} L/min '}${v['o2_device']}';

    Widget cell(String label, IconData icon, String? value, String unit, List<String> keys, {Color iconColor = C.secondary, String? desc}) {
      final odd = keys.any(_r.warnings.containsKey);
      return Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          ConstrainedBox(constraints: const BoxConstraints(minHeight: 24), child: Row(children: [Expanded(child: SubText(label.toUpperCase(), T.labelSm.c(C.onSurfaceVariant).tr(0.05))), Ic(icon, size: 18, color: iconColor)])),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: value == null
                ? Text('Not assessed', style: T.labelMd.c(C.onSurfaceVariant).s(14, 26))
                : Text.rich(TextSpan(children: [TextSpan(text: value, style: T.vital), if (unit.isNotEmpty) TextSpan(text: ' $unit', style: T.unit.c(C.onSurfaceVariant))])),
          ),
          if (odd)
            const _Chip2('Check value', _amberBg, kAmberText)
          else if (desc != null && value != null)
            Text(desc, style: T.bodySm.c(C.onSurfaceVariant))
          else
            _Chip2(value == null ? 'Left blank' : 'Entered', C.surfaceContainer, C.onSurfaceVariant),
        ]),
      );
    }

    String? n(String k) => v[k] == null ? null : formatDose(v[k] as num);
    final (i, o, net) = f.io;
    final hasIn = f.ioToday.any((x) => x.io.direction == 'in'), hasOut = f.ioToday.any((x) => x.io.direction == 'out');

    return PopScope(
      canPop: saved == null && !_busy,
      onPopInvokedWithResult: (did, _) {
        if (!did && saved != null) _toChart();
      },
      child: PhonePage(
        header: BackHeader(title: saved == null ? 'Review Vitals' : 'Vitals Saved', sub: '${f.patient.fullName} • Bed ${f.bed}', onBack: () => saved != null ? _toChart() : (_busy ? null : _edit())),
        pad: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        footer: Container(
          color: C.surface.withValues(alpha: 0.95),
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (saved != null) ...[
              _foot('View record', Symbols.description, BtnKind.navy, 52, () {
                Go.summary(context, d.patientId);
                Go.entry(context, d.patientId, saved.id);
              }),
              const SizedBox(height: 4),
              _foot('Back to chart', Symbols.arrow_back, BtnKind.quiet, 48, _toChart),
            ] else ...[
              Btn(
                _busy ? 'Saving on device…' : (_error == null ? 'Save on device' : 'Try again'),
                kind: _error == null ? BtnKind.navy : BtnKind.danger,
                height: 52,
                radius: R.xl,
                icon: _error == null ? Symbols.save : Symbols.refresh,
                busy: _busy,
                reason: 'Tick every value you checked again first',
                onTap: _allTicked && _r.ok ? _save : null,
              ),
              const SizedBox(height: 4),
              _foot('Edit measurements', Symbols.edit_note, BtnKind.quiet, 48, _busy ? null : _edit),
            ],
          ]),
        ),
        children: [
          _rails(a),
          const SizedBox(height: 4),
          Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Wrap(spacing: 4, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                      Text(f.patient.fullName, style: T.headlineSm),
                      Tag('Bed ${f.bed}', bg: C.secondaryContainer, fg: C.onSecondaryContainer, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                    ]),
                    const SizedBox(height: 2),
                    Text('MRN: ${f.patient.mrn} • DOB: ${dobLabel(f.patient)}', style: T.bodySm.c(C.onSurfaceVariant)),
                  ]),
                ),
                const SizedBox(width: 8),
                if (allergy != null)
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 140),
                    child: Tag(allergy.substance.toUpperCase(), icon: Symbols.warning, bg: C.error, fg: C.onError, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4)),
                  ),
              ]),
              const SizedBox(height: 8),
              Wrap(spacing: 4, runSpacing: 4, children: [
                _pill(Symbols.shield, f.encounter?.codeStatus ?? 'Code status not recorded'),
                _pill(Symbols.air, oxygen ?? 'Oxygen not recorded'),
                if (allergy == null) _pill(Symbols.info, f.allergyText),
              ]),
            ]),
          ),
          const SizedBox(height: 12),
          if (saved == null && d.supersedesId != null) ...[
            Box(color: C.secondaryFixed, child: Text('Correction of a saved record. Reason: ${d.correctionReason ?? ''}', style: T.bodySm.c(C.onSecondaryFixed))),
            const SizedBox(height: 12),
          ],
          Padding(
            padding: const EdgeInsets.only(left: 2, right: 2, bottom: 8),
            child: Row(children: [
              const Ic(Symbols.assignment_turned_in, size: 20, color: C.secondary),
              const SizedBox(width: 4),
              Expanded(child: Text(saved == null ? 'Review Bedside Vitals' : 'Saved Bedside Vitals', style: T.headlineSm)),
              const SizedBox(width: 8),
              Tag('$today saved today', bg: C.surfaceContainer, style: T.labelSm),
            ]),
          ),
          Box(
            color: C.surfaceLow,
            child: Row(children: [
              InitialsBox(a.user?.initials ?? '', size: 40),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(a.user?.title ?? '', style: T.labelMd),
                  Text('Recording nurse • Signed in here', style: T.bodySm.c(C.onSurfaceVariant)),
                ]),
              ),
              const SizedBox(width: 8),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.schedule, size: 15, color: C.secondary), const SizedBox(width: 4), Text(hm(d.careTime), style: T.labelMd)]),
                Text(dayLabel(d.careTime), style: T.bodySm.c(C.onSurfaceVariant)),
              ]),
            ]),
          ),
          const SizedBox(height: 12),
          TwoCols(gap: 8, [
            cell('Blood Pressure', Symbols.cardiology, v['bp_systolic'] == null ? null : '${n('bp_systolic')}/${n('bp_diastolic')}', 'mmHg', const ['bp_systolic', 'bp_diastolic', 'bp_order']),
            cell('Heart Rate', Symbols.favorite, n('heart_rate'), 'bpm', const ['heart_rate'], iconColor: C.error),
            cell('SpO₂ Oxygen', Symbols.air, n('spo2'), '%', const ['spo2'], desc: oxygen ?? 'Device not recorded'),
            cell('Resp. Rate', Symbols.pulmonology, n('resp_rate'), '/min', const ['resp_rate']),
            cell('Temperature', Symbols.thermostat, n('temp_c'), '°C', const ['temp_c']),
            cell('Pain Scale', Symbols.sentiment_neutral, n('pain_0_10'), '/ 10', const ['pain_0_10']),
            cell('Consciousness', Symbols.visibility, v['consciousness'] as String?, '', const ['consciousness']),
            cell('Blood Sugar', Symbols.glucose, n('glucose_mgdl'), 'mg/dL', const ['glucose_mgdl']),
          ]),
          if (_r.warnings.isNotEmpty && saved == null) ...[const SizedBox(height: 12), _recheck()],
          const SizedBox(height: 12),
          Box(
            shadow: true,
            child: Row(children: [
              Container(width: 40, height: 40, decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rXl), child: const Ic(Symbols.water_drop, size: 22, color: C.onSecondaryContainer)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Fluids recorded today', style: T.labelMd),
                  Text('In ${hasIn ? '${grouped(i)} mL' : 'not recorded'} • Out ${hasOut ? '${grouped(o)} mL' : 'not recorded'}', style: T.bodySm.c(C.onSurfaceVariant)),
                ]),
              ),
              const SizedBox(width: 8),
              if (hasIn && hasOut) Tag('Net ${net > 0 ? '+' : net < 0 ? '−' : ''}${grouped(net.abs())} mL', bg: C.tertiaryFixed, fg: C.onTertiaryFixedVariant, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4)),
            ]),
          ),
          const SizedBox(height: 12),
          KeyedSubtree(key: _status, child: saved != null ? _success(a, saved) : _error != null ? _failure() : _assurance()),
        ],
      ),
    );
  }

  Widget _foot(String text, IconData icon, BtnKind kind, double h, VoidCallback? tap) => Btn(text, icon: icon, kind: kind, height: h, radius: R.xl, bg: kind == BtnKind.quiet ? C.surfaceContainer : null, onTap: tap);

  Widget _pill(IconData icon, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rFull),
        child: Row(mainAxisSize: MainAxisSize.min, children: [Ic(icon, size: 14, color: C.onSurfaceVariant), const SizedBox(width: 4), Flexible(child: Text(text, style: T.labelSm.c(C.onSurfaceVariant)))]),
      );

  Widget _rails(AppState a) => Column(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowSm),
          child: Row(children: [
            const Dot(C.secondaryFixed, size: 8),
            const SizedBox(width: 4),
            Expanded(child: Text('${phaseText(a)}${a.downtime == null ? '' : ' (${outageHms(a).substring(0, 5)})'}'.toUpperCase(), style: T.badge.c(C.secondaryFixed))),
            const SizedBox(width: 8),
            const Tag('PRACTICE', bg: C.secondaryFixed, fg: C.onSecondaryFixed, pad: EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
          ]),
        ),
        const SizedBox(height: 4),
        Container(
          constraints: const BoxConstraints(minHeight: 43),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(color: _amberBg, borderRadius: R.rXl, border: Border.all(color: _amber.withValues(alpha: 0.4)), boxShadow: shadowSm),
          child: Row(children: [
            const Ic(Symbols.science, size: 18, color: Color(0xFFD97706)),
            const SizedBox(width: 4),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [Flexible(child: Text('PRACTICE RECORD', style: T.badge.c(const Color(0xFFB45309)))), const SizedBox(width: 6), const Dot(Color(0xFFD97706), size: 6)]),
                Text('Fictional data only • Saved encrypted on this phone', style: T.labelSm.c(_amberDark.withValues(alpha: 0.8))),
              ]),
            ),
          ]),
        ),
      ]);

  Widget _recheck() => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: _amberBg, borderRadius: R.rXl, border: Border.all(color: _amber.withValues(alpha: 0.4))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [const Ic(Symbols.warning, size: 18, color: Color(0xFFD97706)), const SizedBox(width: 4), Expanded(child: Text('Check these values', style: T.labelMd.c(kAmberText)))]),
          for (final w in _r.warnings.entries)
            Semantics(
              container: true,
              checked: _ticked.contains(w.key),
              label: '${w.value}. I re-checked this value',
              excludeSemantics: true,
              onTap: _busy ? null : () => _tick(w.key),
              child: GestureDetector(
                key: ValueKey('tick-${w.key}'),
                behavior: HitTestBehavior.opaque,
                onTap: _busy ? null : () => _tick(w.key),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 48),
                  child: Row(children: [
                    Ic(_ticked.contains(w.key) ? Symbols.check_box : Symbols.check_box_outline_blank, size: 24, color: kAmberText, fill: _ticked.contains(w.key) ? 1 : 0),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                        Text(w.value, style: T.labelMd),
                        Text('I re-checked this value and it is right', style: T.bodySm.c(C.onSurfaceVariant)),
                      ]),
                    ),
                  ]),
                ),
              ),
            ),
          Text('Warning ranges are drafts awaiting clinical review. They never stop you saving a value you checked.', style: T.bodySm.c(C.onSurfaceVariant)),
        ]),
      );

  void _tick(String k) => setState(() => _ticked.contains(k) ? _ticked.remove(k) : _ticked.add(k));

  Widget _assurance() => Box(
        color: C.primaryContainer,
        shadow: true,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 32, height: 32, margin: const EdgeInsets.only(top: 2), decoration: const BoxDecoration(color: C.secondaryFixed, borderRadius: R.rFull), child: const Ic(Symbols.lock, size: 18, color: C.onSecondaryFixed, fill: 1)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Ready for local device storage', style: T.labelMd.c(C.primaryFixed)),
              const SizedBox(height: 2),
              Text('The record is kept encrypted on this phone with your name and the time, and stays there for local review. Nothing is sent.', style: T.bodySm.s(12, 19.5).c(C.onPrimaryContainer)),
            ]),
          ),
        ]),
      );

  Widget _success(AppState a, Entry e) => Semantics(
        liveRegion: true,
        child: Box(
          color: C.tertiaryFixed,
          shadow: true,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Ic(Symbols.check_circle, size: 24, color: C.onTertiaryFixed),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Saved on this phone', style: T.headlineSm.c(C.onTertiaryFixed)),
                const SizedBox(height: 2),
                Text('Record ${e.id}', style: T.bodySm.c(C.onTertiaryFixed)),
                Text('Device counter ${e.counter} • Saved ${dateTimeLabel(e.entryTime)} • Measured ${hm(e.careTime)}', style: T.bodySm.c(C.onTertiaryFixed)),
                Text('By ${staffName(a.store, e.performerId)}', style: T.bodySm.c(C.onTertiaryFixed)),
              ]),
            ),
          ]),
        ),
      );

  Widget _failure() => Semantics(
        liveRegion: true,
        child: Box(
          color: C.errorContainer,
          shadow: true,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Padding(padding: EdgeInsets.only(top: 2), child: Ic(Symbols.error, size: 24, color: C.error)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Not saved', style: T.headlineSm.c(C.onErrorContainer)),
                const SizedBox(height: 2),
                Text(_error!, style: T.bodySm.c(C.onErrorContainer)),
                const SizedBox(height: 2),
                Text('Your values are still here. Nothing was changed.', style: T.bodySm.c(C.onErrorContainer)),
                const SizedBox(height: 4),
                Tap(
                  label: 'Try to save again',
                  onTap: _busy ? null : _save,
                  child: Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), decoration: const BoxDecoration(color: C.error, borderRadius: R.rBase), child: Text('Retry', style: T.labelMd.c(C.onError))),
                ),
              ]),
            ),
          ]),
        ),
      );
}

class _Chip2 extends StatelessWidget {
  final String text;
  final Color bg, fg;
  const _Chip2(this.text, this.bg, this.fg);
  @override
  Widget build(BuildContext context) => Tag(text, bg: bg, fg: fg, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2));
}
