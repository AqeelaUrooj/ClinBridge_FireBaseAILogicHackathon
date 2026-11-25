import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../config/policy.dart';
import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/repos/entries.dart' as entries;
import '../../data/repos/ops.dart' as ops;
import '../../data/schema.dart';
import '../../data/store.dart';
import '../../domain/facts.dart';
import '../../domain/meds.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';

/* ------------------------------ Shared small parts ------------------------------ */

const _mint = Color(0xFF8AD6AF), _mintText = Color(0xFFA6F3CA), _amber = Color(0xFFF59E0B), _cream = Color(0xFFFEF3C7);
const _donePrefix = 'Done by outgoing nurse: ';

/// entrySummary with a plain 2: the bundled Inter has no subscript digit.
String _sum(EntryX x) => entrySummary(x).replaceAll('O₂', 'SpO2');

String _err(Object e) => e is AppError ? e.message : 'This did not work: $e';

String _phaseRail(ops.Phase p) => switch (p) { ops.Phase.down => 'EHR DOWNTIME ACTIVE', ops.Phase.online => 'BACK ONLINE (PRACTICE)', ops.Phase.ready => 'NO DOWNTIME OPEN' };

Widget _blank() => const ColoredBox(color: C.surface);

/// Large text: things that sit side by side go under each other.
bool _big(BuildContext c) => MediaQuery.textScalerOf(c).scale(100) > 120;

/// Rebuilds every [every] so that elapsed times do not stand still.
class _Ticking extends StatefulWidget {
  final Duration every;
  final WidgetBuilder builder;
  const _Ticking({required this.builder, this.every = const Duration(seconds: 1)});
  @override
  State<_Ticking> createState() => _TickingState();
}

class _TickingState extends State<_Ticking> {
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(widget.every, (_) => mounted ? setState(() {}) : null);
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context);
}

class _Rail extends StatelessWidget {
  final Color bg, dot, fg;
  final String text;
  final Widget right;
  final double gap;
  const _Rail({required this.bg, required this.dot, required this.fg, required this.text, required this.right, this.gap = 8});
  @override
  Widget build(BuildContext context) => Container(
        color: bg,
        padding: const EdgeInsets.symmetric(horizontal: S.lg, vertical: 6),
        child: Row(children: [
          Dot(dot),
          SizedBox(width: gap),
          Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: T.badge.c(fg))),
          const SizedBox(width: 8),
          right,
        ]),
      );
}

/// Title row under the rail, 48 dp touch targets, the design's 16 dp margins.
class _TitleBar extends StatelessWidget {
  final double height;
  final Widget title;
  final Widget? leading, action;
  const _TitleBar({required this.title, this.leading, this.action, this.height = 56});
  @override
  Widget build(BuildContext context) => Container(
        constraints: BoxConstraints(minHeight: height),
        decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0A000000), offset: Offset(0, 1), blurRadius: 8)]),
        padding: EdgeInsets.only(left: leading == null ? S.lg : 14, right: 8),
        child: Row(children: [
          if (leading != null) ...[leading!, const SizedBox(width: 6)],
          Expanded(child: title),
          if (action != null) action!,
          Tap(
            label: 'My account and more',
            onTap: () => Go.more(context),
            child: Container(width: 32, height: 32, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull), alignment: Alignment.center, child: const Ic(Symbols.person, size: 18, color: C.onPrimary)),
          ),
        ]),
      );
}

Widget _backBtn(BuildContext c) => Tap(label: 'Back', onTap: () => Go.back(c), child: const Ic(Symbols.arrow_back, size: 24));

/// Small banner above the form or the notes.
class _Notice extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color bg, fg;
  final Widget? action;
  const _Notice(this.text, {this.icon = Symbols.info, this.bg = C.secondaryContainer, this.fg = C.onSecondaryFixed, this.action});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: S.sm),
        decoration: BoxDecoration(color: bg, borderRadius: R.rXl),
        child: Row(children: [
          Ic(icon, size: 20, color: fg),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: T.bodySm.c(fg))),
          if (action != null) action!,
        ]),
      );
}

Widget _textAction(String text, VoidCallback? onTap, {Color color = C.primary}) => Tap(
      label: text,
      onTap: onTap,
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text(text, style: T.labelMd.c(color))),
    );

/// The S / B / A / R square.
Widget _letter(String l, Color bg, Color fg) => Container(width: 28, height: 28, alignment: Alignment.center, decoration: BoxDecoration(color: bg, borderRadius: R.rLg), child: Text(l, style: T.headlineSm.c(fg), textScaler: TextScaler.noScaling));

class _Section extends StatelessWidget {
  final String letter, title, sub;
  final Color bg, fg;
  final Widget? right;
  final List<Widget> children;
  const _Section({required this.letter, required this.title, required this.sub, required this.bg, required this.fg, this.right, required this.children});
  @override
  Widget build(BuildContext context) => Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            _letter(letter, bg, fg),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: T.headlineSm.s(17, 21)),
                Text(sub, style: T.labelSm.c(C.secondary).s(11, 20)),
              ]),
            ),
            if (right != null && !_big(context)) ...[const SizedBox(width: 8), ConstrainedBox(constraints: const BoxConstraints(maxWidth: 167), child: right!)],
          ]),
          if (right != null && _big(context)) Align(alignment: Alignment.centerLeft, child: right!),
          const SizedBox(height: 8),
          ...children,
        ]),
      );
}

Widget _badge(String text, Color bg, Color fg) => Tag(text, bg: bg, fg: fg, radius: R.base);

Widget _part(bool flex, int n, Widget child) => flex ? Expanded(flex: n, child: child) : child;

/// Patient identity card of the SBAR pages.
class _PatientCard extends StatelessWidget {
  final PatientFacts f;
  const _PatientCard(this.f);
  @override
  Widget build(BuildContext context) {
    final allergies = f.realAllergies;
    Widget chip(IconData icon, String text, Color bg, Color fg) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: bg, borderRadius: R.rBase),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Ic(icon, size: 15, color: fg),
            const SizedBox(width: 4),
            Flexible(child: Text(text, style: T.labelSm.semi.c(fg))),
          ]),
        );
    final big = _big(context);
    final care = f.careOrders.where((o) => o.text.toLowerCase().contains('vital signs')).firstOrNull;
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Flex(direction: big ? Axis.vertical : Axis.horizontal, crossAxisAlignment: CrossAxisAlignment.start, children: [
          _part(
            !big,
            178,
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Expanded(child: Text(f.patient.fullName, style: T.headlineMd)), const SizedBox(width: 8), Text(f.ageSex, style: T.labelMd.c(C.secondary))]),
              Text.rich(
                TextSpan(style: T.labelSm.c(C.secondary), children: [
                  const TextSpan(text: 'Bed: '),
                  TextSpan(text: f.bed, style: T.labelSm.semi),
                  const TextSpan(text: ' • MRN: '),
                  TextSpan(text: f.patient.mrn, style: T.labelSm.semi),
                ]),
              ),
            ]),
          ),
          const SizedBox(width: 8, height: 8),
          _part(
            !big,
            152,
            Column(crossAxisAlignment: big ? CrossAxisAlignment.start : CrossAxisAlignment.end, children: [
              if (allergies.isEmpty)
                Tag(f.allergyText.toUpperCase(), bg: f.allergies.isEmpty ? C.errorContainer : C.surfaceHigh, fg: f.allergies.isEmpty ? C.onErrorContainer : C.onSurfaceVariant, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4)),
              for (var i = 0; i < allergies.length; i++)
                Padding(
                  padding: EdgeInsets.only(top: i == 0 ? 0 : 4),
                  child: Container(
                    padding: EdgeInsets.symmetric(horizontal: 8, vertical: i == 0 ? 4 : 2),
                    decoration: const BoxDecoration(color: C.error, borderRadius: R.rBase),
                    child: Text('${allergies[i].substance}${allergies[i].severity == 'severe' && allergies[i].reaction != null ? ' (${allergies[i].reaction})' : ''}'.toUpperCase(), textAlign: TextAlign.center, style: T.badge.c(C.onError)),
                  ),
                ),
            ]),
          ),
        ]),
        const SizedBox(height: 16),
        Wrap(spacing: 6, runSpacing: 6, children: [
          if (f.hasHighAlert) chip(Symbols.warning, 'High-alert drug', C.caution, Colors.white),
          for (final o in f.infusions) chip(Symbols.water_drop, '${o.drugName ?? o.text} infusion', C.secondary, C.onSecondary),
          if (care != null) chip(Symbols.schedule, care.text, C.surfaceContainer, C.onSurfaceVariant),
          if (f.encounter?.isolation != null) chip(Symbols.info, 'Isolation: ${f.encounter!.isolation}', C.surfaceContainer, C.onSurfaceVariant),
        ]),
      ]),
    );
  }
}

/// Navy strip: phase, PRACTICE, elapsed time.
class _DowntimeStrip extends StatelessWidget {
  final AppState app;
  const _DowntimeStrip(this.app);
  @override
  Widget build(BuildContext context) {
    final ev = app.downtime;
    return Container(
      padding: const EdgeInsets.all(S.md),
      decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowSm),
      child: Column(children: [
        Row(children: [
          const Dot(C.secondaryFixed, size: 10),
          const SizedBox(width: 8),
          Expanded(child: Text(_phaseRail(app.phase), style: T.badge.c(C.secondaryFixed))),
          const Tag('PRACTICE MODE', bg: C.caution, fg: Colors.white),
        ]),
        const SizedBox(height: 6),
        Row(children: [
          const Ic(Symbols.shield_lock, size: 16, color: C.tertiaryFixed),
          const SizedBox(width: 6),
          Expanded(child: Text('Offline, encrypted on this phone', style: T.labelSm.c(C.onPrimaryContainer))),
          const SizedBox(width: 8),
          _Ticking(every: const Duration(seconds: 20), builder: (_) => Text(ev == null ? 'No downtime' : 'Elapsed: ${elapsedHm(ev.declaredAt, app.nowIso)}', style: T.labelSm.c(C.onPrimaryContainer))),
        ]),
      ]),
    );
  }
}

Widget _sbarHeader(BuildContext c, {required PatientFacts? f}) {
  final n = f?.realAllergies.length ?? 0;
  final alarm = n > 0 || (f?.allergies.isEmpty ?? false);
  return Column(mainAxisSize: MainAxisSize.min, children: [
    _Rail(bg: C.tertiaryContainer, dot: _mint, fg: _mintText, gap: 6, text: 'PRACTICE • ENCRYPTED ON THIS PHONE', right: Text('AES-256', style: T.labelSm.c(_mint))),
    _TitleBar(
      height: 64,
      leading: _backBtn(c),
      title: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('SBAR Handover Note', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.headlineSm.s(17, 21)),
        if (f != null)
          Row(children: [
            Flexible(child: Text('${f.patient.fullName} • Bed ${f.bed}', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(C.secondary))),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(color: alarm ? C.errorContainer : C.surfaceHigh, borderRadius: R.rBase),
              child: Semantics(
                label: n > 0 ? '$n allerg${n == 1 ? 'y' : 'ies'} recorded' : f.allergyText,
                excludeSemantics: true,
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  if (alarm) const Ic(Symbols.warning, size: 12, color: C.onErrorContainer),
                  if (alarm) const SizedBox(width: 3),
                  Text(n > 0 ? '$n' : f.allergies.isEmpty ? '?' : 'NKA', style: T.badge.s(10, 20).c(alarm ? C.onErrorContainer : C.onSurfaceVariant)),
                ]),
              ),
            ),
          ]),
      ]),
      action: Tap(label: 'What belongs in an SBAR note', onTap: () => _sbarTips(c), child: const Ic(Symbols.info, size: 22, color: C.secondary)),
    ),
  ]);
}

void _sbarTips(BuildContext c) => confirm(c,
    title: 'SBAR note',
    text: 'S: what is happening with the patient now.\nB: what led to it (admission, history, orders).\nA: what you found.\nR: what is still open for the next nurse.\n\nYou write every word. The app does not write, check or suggest clinical text. A saved note can not be changed; a new note is added after it.',
    yes: 'OK',
    no: 'Close');

/* ------------------------------ SBAR editor ------------------------------ */

/// First line = the open item, further lines = detail (smaller).
class _ItemText extends TextEditingController {
  bool done = false;
  _ItemText({super.text});
  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    final first = done ? T.bodyMd.medium.copyWith(color: C.onSurface.withValues(alpha: 0.7), decoration: TextDecoration.lineThrough) : T.bodyMd.medium;
    final i = text.indexOf('\n');
    if (i < 0) return TextSpan(text: text, style: first);
    return TextSpan(style: T.labelSm, children: [TextSpan(text: text.substring(0, i + 1), style: first), TextSpan(text: text.substring(i + 1), style: T.labelSm.c(C.secondary))]);
  }
}

class _Item {
  final _ItemText text;
  final FocusNode focus = FocusNode();
  _Item({String text = '', bool done = false}) : text = _ItemText(text: text)..done = done;
  bool get done => text.done;
  void dispose() {
    text.dispose();
    focus.dispose();
  }
}

class SbarScreen extends StatefulWidget {
  final String patientId;
  final String? draftId;
  const SbarScreen({super.key, required this.patientId, this.draftId});
  @override
  State<SbarScreen> createState() => _SbarScreenState();
}

class _SbarScreenState extends State<SbarScreen> {
  static const _choices = [(Symbols.check_circle, 'Condition Stable', 'Condition stable.'), (Symbols.trending_up, 'Acuity Elevated', 'Acuity elevated.'), (Symbols.sync_alt, 'Transfer Pending', 'Transfer pending.')];

  late final AppState _app = AppScope.read(context);
  final _shift = TextEditingController(), _s = TextEditingController(), _b = TextEditingController(), _a = TextEditingController();
  final List<_Item> _items = [];
  Set<String> _linked = {};
  late String _draftId;
  String _key = newId('k');
  String? _restoredAt, _draftAt, _draftError, _error;
  bool _touched = false, _dirty = false, _hasDraft = false, _busy = false, _reviewed = false, _tried = false, _gone = false;
  Timer? _auto;
  AppLifecycleListener? _life;

  @override
  void initState() {
    super.initState();
    // The phone may stop the app in the background: keep what was typed.
    _life = AppLifecycleListener(onInactive: () {
      if (mounted && !_gone && _dirty && _app.signedIn && !(_empty && !_hasDraft)) _saveDraft();
    });
    _draftId = widget.draftId ?? 'sbar/${_app.user?.id}/${widget.patientId}';
    if (!_app.signedIn) return;
    _shift.text = _defaultShift(_app.nowIso);
    final d = entries.getDraft(_app.store, _draftId, _app.user!.id);
    if (d != null && d['patient_id'] == widget.patientId) _restore(d);
  }

  @override
  void dispose() {
    _auto?.cancel();
    _life?.dispose();
    for (final c in [_shift, _s, _b, _a]) {
      c.dispose();
    }
    for (final i in _items) {
      i.dispose();
    }
    super.dispose();
  }

  /// "Day to night, 14 Nov 19:00": the next shift change after [now] (07:00 / 19:00).
  static String _defaultShift(String now) {
    final start = ops.shiftOf(now).$2, day = start.substring(11, 13) == '07';
    final end = PracticeClock.toIso(ms(start) + 12 * 3600000);
    return '${day ? 'Day to night' : 'Night to day'}, ${dayLabel(end).split(' ').take(2).join(' ')} ${hm(end)}';
  }

  void _restore(Doc d) {
    final p = (d['payload'] as Map).cast<String, Object?>();
    String t(String k) => p[k] as String? ?? '';
    _key = p['key'] as String? ?? _key;
    if (t('shift').isNotEmpty) _shift.text = t('shift');
    _s.text = t('situation');
    _b.text = t('background');
    _a.text = t('assessment');
    for (final i in (p['items'] as List? ?? const [])) {
      _items.add(_Item(text: (i as Map)['text'] as String? ?? '', done: i['done'] == true));
    }
    // Only records that can still be linked come back.
    final ok = {for (final x in _linkable()) x.entry.id};
    _linked = {for (final id in (p['linked'] as List? ?? const [])) if (ok.contains(id)) id as String};
    _hasDraft = true;
    _restoredAt = d['updated_at'] as String?;
  }

  Doc _payload() => {
        'key': _key, 'shift': _shift.text, 'situation': _s.text, 'background': _b.text, 'assessment': _a.text,
        'items': [for (final i in _items) {'text': i.text.text, 'done': i.done}],
        'linked': _linked.toList(),
      };

  bool get _empty => _s.text.trim().isEmpty && _b.text.trim().isEmpty && _a.text.trim().isEmpty && _linked.isEmpty && _items.every((i) => i.text.text.trim().isEmpty);

  /// Confirmed records of this patient from the last 24 hours.
  List<EntryX> _linkable() {
    final from = ms(_app.nowIso) - 24 * 3600000;
    return [for (final x in entries.listPatientEntries(_app.store, widget.patientId)) if (x.entry.isConfirmed && ms(x.entry.careTime) >= from) x];
  }

  void _edited() {
    setState(() {
      _touched = _dirty = true;
      _error = null;
    });
    _auto?.cancel();
    _auto = Timer(const Duration(milliseconds: 800), () {
      if (mounted && !_gone && _dirty && !(_empty && !_hasDraft)) _saveDraft();
    });
  }

  bool _saveDraft() {
    _auto?.cancel();
    try {
      entries.saveDraft(_app.ctx(), id: _draftId, kind: 'sbar', patientId: widget.patientId, payload: _payload());
      setState(() {
        _dirty = false;
        _hasDraft = true;
        _draftAt = _app.nowIso;
        _draftError = null;
      });
      _app.saved();
      return true;
    } catch (e) {
      setState(() => _draftError = _err(e));
      return false;
    }
  }

  void _saveDraftPressed() {
    if (_saveDraft()) {
      toast(context, 'Incomplete draft saved on this phone, ${hm(_draftAt)}', icon: Symbols.save);
    } else {
      toast(context, _draftError!, icon: Symbols.error, error: true);
    }
  }

  void _close() {
    _gone = true;
    _auto?.cancel();
    Navigator.of(context).pop();
  }

  bool _discard() {
    try {
      entries.discardDraft(_app.ctx(), _draftId);
      _app.saved();
      return true;
    } catch (e) {
      toast(context, _err(e), icon: Symbols.error, error: true);
      return false;
    }
  }

  Future<void> _leave() async {
    _auto?.cancel();
    final r = await showDialog<String>(
      context: context,
      barrierColor: C.primaryContainer.withValues(alpha: 0.4),
      builder: (c) => Dialog(
        backgroundColor: C.surfaceLowest,
        shape: const RoundedRectangleBorder(borderRadius: R.rXl),
        insetPadding: const EdgeInsets.all(S.lg),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(S.lg),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('This note is not finished', style: T.headlineSm),
            const SizedBox(height: S.sm),
            Text('Keep it as your encrypted draft on this phone, or discard it. A draft is not a handover note.', style: T.bodyMd.c(C.onSurfaceVariant)),
            const SizedBox(height: S.lg),
            Btn('Keep draft', kind: BtnKind.navy, onTap: () => Navigator.pop(c, 'keep')),
            const SizedBox(height: S.sm),
            Btn('Keep writing', kind: BtnKind.quiet, onTap: () => Navigator.pop(c)),
            const SizedBox(height: S.sm),
            Btn('Discard draft', kind: BtnKind.dangerQuiet, onTap: () => Navigator.pop(c, 'discard')),
          ]),
        ),
      ),
    );
    if (!mounted) return;
    if (r == 'keep') {
      if (_saveDraft()) {
        toast(context, 'Draft kept on this phone', icon: Symbols.save);
        _close();
      } else {
        toast(context, _draftError!, icon: Symbols.error, error: true);
      }
    } else if (r == 'discard') {
      if (!_hasDraft || _discard()) _close();
    }
  }

  Future<void> _discardRestored() async {
    if (!await confirm(context, title: 'Discard this draft?', text: 'The draft from ${hm(_restoredAt)} is deleted from this phone. Saved notes stay.', yes: 'Discard draft', danger: true)) return;
    if (!mounted || !_discard()) return;
    final old = [..._items];
    setState(() {
      _items.clear();
      _linked = {};
      _s.clear();
      _b.clear();
      _a.clear();
      _shift.text = _defaultShift(_app.nowIso);
      _key = newId('k');
      _hasDraft = _touched = _dirty = false;
      _restoredAt = _draftAt = null;
    });
    _disposeLater(old);
    toast(context, 'Draft discarded', icon: Symbols.delete);
  }

  void _disposeLater(List<_Item> old) => WidgetsBinding.instance.addPostFrameCallback((_) {
        for (final i in old) {
          i.dispose();
        }
      });

  Future<void> _copyLast(Handoff h) async {
    if (!_empty && !await confirm(context, title: 'Replace what you wrote?', text: 'The text of the last saved note replaces the text in this draft.', yes: 'Replace')) return;
    if (!mounted) return;
    final old = [..._items];
    _items
      ..clear()
      ..addAll([for (final t in h.openItems) if (!t.startsWith(_donePrefix)) _Item(text: t)]);
    _s.text = h.situation;
    _b.text = h.background;
    _a.text = h.assessment;
    _edited();
    _disposeLater(old);
  }

  void _choose(String sentence) {
    final t = _s.text;
    _s.text = t.contains(sentence) ? t.replaceFirst(sentence, '').replaceAll('  ', ' ').trim() : [if (t.trim().isNotEmpty) t.trim(), sentence].join(' ');
    _edited();
  }

  Future<void> _link() async {
    final r = await showModalBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: C.surfaceLowest,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => _LinkSheet(list: _linkable(), chosen: _linked),
    );
    if (r == null || !mounted) return;
    _linked = r;
    _edited();
  }

  Map<String, String> get _errors => ops.validateHandoff(shift: _shift.text, situation: _s.text, background: _b.text, assessment: _a.text);

  Future<void> _commit() async {
    if (_busy) return;
    _auto?.cancel();
    final e = _errors;
    if (e.isNotEmpty || !_reviewed) {
      setState(() {
        _tried = true;
        _error = e.isNotEmpty ? e.values.first : 'Tick "I have reviewed this note" first.';
      });
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    await Future<void>.delayed(Duration.zero);
    if (!mounted) return;
    try {
      ops.createHandoff(
        _app.ctx(),
        patientId: widget.patientId,
        shift: _shift.text,
        situation: _s.text,
        background: _b.text,
        assessment: _a.text,
        openItems: [
          for (final i in _items)
            if (i.text.text.trim().isNotEmpty) '${i.done ? _donePrefix : ''}${i.text.text.trim().split(RegExp(r'\s*\n\s*')).join(' · ')}',
        ],
        sourceEntryIds: _linked.toList(),
        clientKey: _key,
        draftId: _draftId,
      );
      _gone = true;
      _app.saved();
      toast(context, 'SBAR note saved on this phone');
      _close();
    } catch (err) {
      setState(() {
        _busy = false;
        _error = _err(err);
      });
    }
  }

  Widget _area(TextEditingController c, {required String label, required int rows, String? error, required String hint}) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          // 3 dp less on the right: the text field keeps that much for its cursor.
          padding: const EdgeInsets.fromLTRB(10, 10, 7, 10),
          decoration: BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg, border: error == null ? null : Border.all(color: C.error, width: 1.5)),
          child: Field(c, label: label, hint: hint, minLines: rows, maxLines: null, keyboard: TextInputType.multiline, enabled: !_busy, onChanged: (_) => _edited()),
        ),
        if (error != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(error, style: T.labelSm.c(C.error))),
      ]);

  Widget _vital(String label, String? value, String unit) => Container(
        padding: const EdgeInsets.all(8),
        decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          Text(label, maxLines: 2, overflow: TextOverflow.ellipsis, style: T.labelSm.c(C.secondary)),
          const SizedBox(height: 2),
          // A stored value is never cut off: the unit moves to its own line instead.
          Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.end, spacing: 4, children: [
            Text(value ?? 'Not assessed', style: value == null ? T.bodySm.s(12, 26).c(C.onSurfaceVariant) : T.vital),
            Padding(padding: const EdgeInsets.only(bottom: 4), child: Text(unit, style: T.unit.c(C.secondary))),
          ]),
        ]),
      );

  Widget _itemRow(int i) {
    final it = _items[i];
    return Padding(
      key: ObjectKey(it),
      padding: EdgeInsets.only(top: i == 0 ? 0 : 8),
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Tap(
            label: it.done ? 'Open item ${i + 1}: marked as done by you. Tap to undo' : 'Open item ${i + 1}: mark as done by you',
            toggled: it.done,
            onTap: _busy
                ? null
                : () {
                    it.text.done = !it.text.done;
                    _edited();
                  },
            child: SizedBox(
              width: 40,
              height: 48,
              child: Stack(children: [
                Positioned(
                  left: 8,
                  top: 12,
                  child: Container(
                    width: 20,
                    height: 20,
                    decoration: BoxDecoration(color: it.done ? C.primaryContainer : C.surfaceLowest, borderRadius: R.rBase, border: Border.all(color: it.done ? C.primaryContainer : const Color(0xFF767676))),
                    child: it.done ? const Ic(Symbols.check, size: 18, color: Colors.white) : null,
                  ),
                ),
              ]),
            ),
          ),
          Expanded(
            child: Transform.translate(
              offset: const Offset(-4, 0),
              child: Padding(
                padding: EdgeInsets.only(bottom: it.done ? 8 : 0),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Semantics(
                    label: 'Open item ${i + 1}',
                    child: TextField(
                      controller: it.text,
                      focusNode: it.focus,
                      enabled: !_busy,
                      minLines: 1,
                      maxLines: null,
                      style: T.bodyMd.medium,
                      strutStyle: StrutStyle.disabled,
                      cursorColor: C.primary,
                      keyboardType: TextInputType.multiline,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(isDense: true, contentPadding: EdgeInsets.only(top: 8, bottom: it.done ? 0 : 8), constraints: const BoxConstraints(minHeight: 48), border: InputBorder.none, hintText: 'Write the open item', hintStyle: T.bodyMd.c(C.outline)),
                      autofillHints: null,
                      enableIMEPersonalizedLearning: false,
                      contextMenuBuilder: safeTextMenu,
                      onChanged: (_) {
                        onTyping?.call();
                        _edited();
                      },
                    ),
                  ),
                  if (it.done) Text('Done by outgoing nurse • ${staffShort(_app.store, _app.user!.id)}', style: T.labelSm.semi.c(C.onTertiaryFixedVariant)),
                ]),
              ),
            ),
          ),
          ListenableBuilder(
            listenable: Listenable.merge([it.focus, it.text]),
            builder: (_, __) => it.focus.hasFocus || it.text.text.isEmpty
                ? Tap(
                    label: 'Remove open item ${i + 1}',
                    onTap: _busy
                        ? null
                        : () {
                            _items.remove(it);
                            _edited();
                            _disposeLater([it]);
                          },
                    child: const Ic(Symbols.close, size: 18, color: C.secondary),
                  )
                : const SizedBox(width: 4),
          ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return _blank();
    final f = loadFacts(app.store, widget.patientId, app.nowIso);
    if (f == null) return PhonePage(header: _sbarHeader(context, f: null), statusColor: C.tertiaryContainer, children: const [_Notice('This patient is not in the patient list.', bg: C.errorContainer, fg: C.onErrorContainer)]);
    final me = app.user!;
    final errors = _tried ? _errors : const <String, String>{};
    final notes = ops.listHandoffs(app.store, widget.patientId);
    final chosen = [for (final x in f.entries) if (_linked.contains(x.entry.id)) x];
    final nV = chosen.where((x) => x.entry.type == 'vital_sign').length, nM = chosen.where((x) => x.entry.type == 'med_admin').length, nO = chosen.length - nV - nM;
    final openDrafts = f.drafts.length;
    final sys = f.latest('bp_systolic'), dia = f.latest('bp_diastolic'), hr = f.latest('heart_rate'), spo2 = f.latest('spo2'), temp = f.latest('temp_c'), pain = f.latest('pain_0_10');
    final last = f.lastVitals;
    final flow = last?.vital.o2Flow;
    final check = f.meds.where((x) => x.entry.isConfirmed && x.child != null && x.med.doubleCheckedBy != null).firstOrNull;
    final open = _items.where((i) => !i.done && i.text.text.trim().isNotEmpty).length;
    String at(String label, (num, String)? v) => v == null ? label : '$label • ${hm(v.$2)}';
    Widget filled(TextEditingController c) => c.text.trim().isEmpty ? _badge('EMPTY', C.surfaceHigh, C.onSurfaceVariant) : _badge('WRITTEN', C.tertiaryFixed.withValues(alpha: 0.3), C.onTertiaryFixed);
    final vitals = [
      [
        _vital(at('Blood Pressure', sys), sys == null ? null : '${formatDose(sys.$1)}/${dia != null && dia.$2 == sys.$2 ? formatDose(dia.$1) : '—'}', 'mmHg'),
        _vital(at('Heart Rate', hr), hr == null ? null : formatDose(hr.$1), '/min'),
      ],
      [
        _vital(at('SpO2${spo2 != null && last != null && flow != null && spo2.$2 == last.entry.careTime ? ' (${formatDose(flow)} L/min)' : ''}', spo2), spo2 == null ? null : formatDose(spo2.$1), '%'),
        _vital(at('Temp / Pain', temp ?? pain), temp == null ? null : '${formatDose(temp.$1)}°', pain == null ? 'Pain: not assessed' : 'Pain ${formatDose(pain.$1)}/10'),
      ],
    ];

    return PopScope(
      canPop: _gone || !_touched || (_empty && !_hasDraft),
      onPopInvokedWithResult: (did, _) {
        if (!did) _leave();
      },
      child: PhonePage(
        header: _sbarHeader(context, f: f),
        statusColor: C.tertiaryContainer,
        pad: const EdgeInsets.fromLTRB(S.lg, 2, S.lg, S.xl),
        footer: Container(
          padding: const EdgeInsets.all(S.md),
          decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x141C2536), offset: Offset(0, -4), blurRadius: 16)]),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            // Shown here, not as a floating message: that would cover the button needed for the retry.
            if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 6), child: _Notice(_error!, icon: Symbols.error, bg: C.errorContainer, fg: C.onErrorContainer)),
            Btn('Save & Commit SBAR Note', kind: BtnKind.navy, radius: R.lg, icon: Symbols.lock, iconColor: C.tertiaryFixed, busy: _busy, onTap: _commit),
            const SizedBox(height: 6),
            Btn('Save as Incomplete Draft', kind: BtnKind.quiet, bg: C.surfaceContainer, height: 44, radius: R.lg, icon: Symbols.save, iconSize: 18, iconColor: C.secondary, onTap: _busy ? null : _saveDraftPressed),
            const SizedBox(height: 6),
            Text(
              _draftError != null ? 'The draft was NOT saved: $_draftError' : 'Saved encrypted on this phone • Nothing is sent anywhere\n${_dirty ? 'Draft not saved yet' : (_draftAt ?? _restoredAt) != null ? 'Draft saved ${hm(_draftAt ?? _restoredAt)}' : 'No draft saved'}',
              textAlign: TextAlign.center,
              style: T.labelSm.s(10, 20).c(_draftError != null ? C.error : C.secondary),
            ),
          ]),
        ),
        children: [
          _DowntimeStrip(app),
          const SizedBox(height: S.md),
          if (_restoredAt != null) ...[
            _Notice('Your draft from ${hm(_restoredAt)} was restored. It is not a handover note yet.', icon: Symbols.history, action: _textAction('Discard', _busy ? null : _discardRestored, color: C.onErrorContainer)),
            const SizedBox(height: S.md),
          ],
          _PatientCard(f),
          const SizedBox(height: S.lg),
          if (notes.isNotEmpty) ...[
            Btn('Copy from last note', kind: BtnKind.white, radius: R.lg, icon: Symbols.content_copy, iconSize: 18, iconColor: C.secondary, onTap: _busy ? null : () => _copyLast(notes.first.handoff)),
            const SizedBox(height: S.md),
          ],
          _Section(
            letter: 'S',
            title: 'Situation',
            sub: 'Immediate Bedside Status',
            bg: C.primaryContainer,
            fg: C.onPrimary,
            right: filled(_s),
            children: [
              _area(_s, label: 'Situation', rows: 3, error: errors['situation'], hint: 'Write what is happening now'),
              const SizedBox(height: 17),
              Wrap(spacing: 8, runSpacing: 8, children: [for (final (icon, label, sentence) in _choices) _chip(icon, label, sentence)]),
            ],
          ),
          const SizedBox(height: S.md),
          _Section(
            letter: 'B',
            title: 'Background',
            sub: 'Clinical Context & Baseline',
            bg: C.secondary,
            fg: C.onSecondary,
            right: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _busy ? null : _link,
              child: Semantics(
                button: true,
                label: 'Linked records: $nV vitals, $nM medicines, $nO other. Tap to choose',
                excludeSemantics: true,
                child: Container(
                  constraints: const BoxConstraints(minHeight: 48),
                  alignment: Alignment.centerRight,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rLg),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Ic(Symbols.link, size: 16, color: C.onSecondaryContainer),
                      const SizedBox(width: 4),
                      Flexible(child: Text(chosen.isEmpty ? 'Link records' : 'Linked: $nV Vitals • $nM Meds${nO > 0 ? ' • $nO Other' : ''}', style: T.labelSm.semi.c(C.onSecondaryContainer))),
                    ]),
                  ),
                ),
              ),
            ),
            children: [
              _area(_b, label: 'Background', rows: 4, error: errors['background'], hint: 'Write admission, history, orders'),
              const SizedBox(height: 15),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
                child: Row(children: [
                  const Ic(Symbols.history_edu, size: 20, color: C.secondary),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Paper and draft records to check', style: T.labelSm.c(C.secondary))),
                  Text(openDrafts == 0 ? 'NONE OPEN' : '$openDrafts OPEN', style: T.badge.c(openDrafts == 0 ? C.onSecondaryContainer : C.error)),
                ]),
              ),
            ],
          ),
          const SizedBox(height: S.md),
          _Section(
            letter: 'A',
            title: 'Assessment',
            sub: 'Objective Bedside Findings',
            bg: C.caution,
            fg: Colors.white,
            right: _badge(last == null ? 'NO VITALS' : 'VITALS ${hm(last.entry.careTime)}', C.surfaceHigh, C.onSurfaceVariant),
            children: [
              for (final row in vitals) ...[
                IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(child: row[0]), const SizedBox(width: 8), Expanded(child: row[1])])),
                const SizedBox(height: 8),
              ],
              const SizedBox(height: 4),
              _area(_a, label: 'Assessment', rows: 3, error: errors['assessment'], hint: 'Write what you found'),
              if (check != null) ...[
                const SizedBox(height: 17),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: C.secondaryContainer.withValues(alpha: 0.5), borderRadius: R.rLg),
                  child: Row(children: [
                    const Ic(Symbols.assignment_turned_in, size: 20, color: C.secondary),
                    const SizedBox(width: 8),
                    Expanded(child: Text('Dual Nurse Check Saved', style: T.labelMd.c(C.onSecondaryContainer))),
                    const SizedBox(width: 8),
                    ConstrainedBox(constraints: const BoxConstraints(maxWidth: 130), child: Text('${staffShort(app.store, check.med.doubleCheckedBy)} • ${hm(check.entry.careTime)}', textAlign: TextAlign.right, style: T.labelSm.c(C.secondary))),
                  ]),
                ),
              ],
            ],
          ),
          const SizedBox(height: S.md),
          _Section(
            letter: 'R',
            title: 'Recommendation',
            sub: 'Open Items, Incoming Nurse',
            bg: C.tertiaryContainer,
            fg: C.tertiaryFixed,
            right: _badge(open == 0 ? 'NONE OPEN' : '$open OPEN', open == 0 ? C.surfaceHigh : C.errorContainer, open == 0 ? C.onSurfaceVariant : C.onErrorContainer),
            children: [
              Text('Write what the incoming nurse must know or do. Tick only what you have already done yourself:', style: T.bodySm.c(C.secondary)),
              const SizedBox(height: 12),
              for (var i = 0; i < _items.length; i++) _itemRow(i),
              const SizedBox(height: 8),
              Btn('Add open item', kind: BtnKind.quiet, bg: C.surfaceContainer, radius: R.lg, icon: Symbols.add, iconSize: 18, onTap: _busy ? null : _addItem),
            ],
          ),
          const SizedBox(height: S.md),
          Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Shift Handover Attestation', style: T.labelMd),
              const SizedBox(height: 8),
              _kv('Outgoing Clinician:', me.title),
              _kv('Receiving Clinician:', 'Chosen at the shift sign-off'),
              _kv('Handover Bedside Time:', '${hm(app.nowIso)} (Practice clock)'),
              const SizedBox(height: 6),
              Text('Which handover', style: T.labelSm.c(C.secondary)),
              const SizedBox(height: 4),
              Container(
                decoration: BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg, border: errors['shift'] == null ? null : Border.all(color: C.error, width: 1.5)),
                child: Semantics(
                  label: 'Which handover',
                  child: TextField(
                    controller: _shift,
                    enabled: !_busy,
                    style: T.bodyMd,
                    cursorColor: C.primary,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: const InputDecoration(isDense: true, contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 14), constraints: BoxConstraints(minHeight: 48), border: InputBorder.none),
                    onChanged: (_) => _edited(),
                  ),
                ),
              ),
              if (errors['shift'] != null) Text(errors['shift']!, style: T.labelSm.c(C.error)),
              Tap(
                label: 'I have reviewed this note',
                toggled: _reviewed,
                expand: true,
                onTap: _busy ? null : () => setState(() => _reviewed = !_reviewed),
                child: Row(children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(color: _reviewed ? C.primaryContainer : C.surfaceLowest, borderRadius: R.rLg, border: Border.all(color: _tried && !_reviewed ? C.error : (_reviewed ? C.primaryContainer : const Color(0xFF767676)), width: _tried && !_reviewed ? 2 : 1)),
                    child: _reviewed ? const Ic(Symbols.check, size: 18, color: Colors.white) : null,
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Text('I have reviewed this note', style: T.bodyMd.medium)),
                ]),
              ),
            ]),
          ),
          if (notes.isNotEmpty) ...[
            const SizedBox(height: S.lg),
            Text('Earlier notes of this patient', style: T.headlineSm),
            for (final n in notes) Padding(padding: const EdgeInsets.only(top: 8), child: _NoteRow(n, () => Go.sbarView(context, n.handoff.id))),
          ],
        ],
      ),
    );
  }

  void _addItem() {
    final it = _Item();
    setState(() => _items.add(it));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _items.contains(it)) it.focus.requestFocus();
    });
  }

  Widget _chip(IconData icon, String label, String sentence) {
    final on = _s.text.contains(sentence);
    return Tap(
      label: '$label: your own choice, written into the Situation text',
      selected: on,
      onTap: _busy ? null : () => _choose(sentence),
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(color: on ? C.tertiaryContainer : C.surfaceContainer, borderRadius: R.rLg),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Ic(icon, size: 18, color: on ? C.tertiaryFixed : C.onSurfaceVariant),
          const SizedBox(width: 6),
          Flexible(child: Text(label, style: T.labelSm.c(on ? C.tertiaryFixed : C.onSurfaceVariant))),
        ]),
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(children: [
          Expanded(child: Text(k, style: T.bodySm.c(C.secondary))),
          const SizedBox(width: 8),
          Expanded(child: Text(v, textAlign: TextAlign.right, style: T.bodySm.medium)),
        ]),
      );
}

class _NoteRow extends StatelessWidget {
  final ops.HandoffWithTime n;
  final VoidCallback onTap;
  const _NoteRow(this.n, this.onTap);
  @override
  Widget build(BuildContext context) {
    final s = AppScope.read(context).store;
    return Tap(
      label: 'Read note ${n.handoff.shift} by ${staffName(s, n.handoff.createdBy)}',
      onTap: onTap,
      expand: true,
      child: Box(
        shadow: true,
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(n.handoff.shift, style: T.labelMd),
              Text(n.handoff.situation, maxLines: 2, overflow: TextOverflow.ellipsis, style: T.bodySm.c(C.onSurfaceVariant)),
              Text('${staffShort(s, n.handoff.createdBy)} • ${n.savedAt == null ? 'came with the practice data' : 'saved ${dateTimeLabel(n.savedAt)}'}', style: T.labelSm.c(C.secondary)),
            ]),
          ),
          const Ic(Symbols.chevron_right, size: 20, color: C.secondary),
        ]),
      ),
    );
  }
}

/// Choose confirmed records of the last 24 hours.
class _LinkSheet extends StatefulWidget {
  final List<EntryX> list;
  final Set<String> chosen;
  const _LinkSheet({required this.list, required this.chosen});
  @override
  State<_LinkSheet> createState() => _LinkSheetState();
}

class _LinkSheetState extends State<_LinkSheet> {
  late final Set<String> _c = {...widget.chosen};
  @override
  Widget build(BuildContext context) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
          child: Padding(
            padding: const EdgeInsets.all(S.lg),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Link records to this note', style: T.headlineSm),
              Text('Confirmed records of this patient, last 24 hours', style: T.bodySm.c(C.secondary)),
              const SizedBox(height: 8),
              Flexible(
                child: widget.list.isEmpty
                    ? Padding(padding: const EdgeInsets.all(S.lg), child: Text('There are no confirmed records in the last 24 hours.', style: T.bodyMd))
                    : SingleChildScrollView(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          for (final x in widget.list)
                            Tap(
                              label: '${hm(x.entry.careTime)} ${_sum(x)}',
                              toggled: _c.contains(x.entry.id),
                              expand: true,
                              onTap: () => setState(() => _c.contains(x.entry.id) ? _c.remove(x.entry.id) : _c.add(x.entry.id)),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(vertical: 4),
                                child: Row(children: [
                                  Ic(_c.contains(x.entry.id) ? Symbols.check_box : Symbols.check_box_outline_blank, size: 24, color: C.primaryContainer, fill: _c.contains(x.entry.id) ? 1 : 0),
                                  const SizedBox(width: 8),
                                  Text('${hm(x.entry.careTime)}  ', style: T.labelMd),
                                  Expanded(child: Text(_sum(x), style: T.bodySm)),
                                ]),
                              ),
                            ),
                        ]),
                      ),
              ),
              const SizedBox(height: 8),
              Btn('Use ${_c.length} linked', kind: BtnKind.navy, radius: R.lg, onTap: () => Navigator.pop(context, _c)),
            ]),
          ),
        ),
      );
}

/* ------------------------------ SBAR, read only ------------------------------ */

class SbarViewScreen extends StatelessWidget {
  final String handoffId;
  const SbarViewScreen({super.key, required this.handoffId});
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return _blank();
    final s = app.store;
    final row = s.get('handoff', handoffId);
    final f = row == null ? null : loadFacts(s, row['patient_id'] as String, app.nowIso);
    if (row == null || f == null) {
      return PhonePage(header: _sbarHeader(context, f: null), statusColor: C.tertiaryContainer, children: const [_Notice('This note was not found.', icon: Symbols.error, bg: C.errorContainer, fg: C.onErrorContainer)]);
    }
    final h = Handoff(row);
    final savedAt = ops.listHandoffs(s, h.patientId).where((n) => n.handoff.id == handoffId).firstOrNull?.savedAt;
    final pid = h.patientId;
    Widget text(String t) => Container(padding: const EdgeInsets.all(10), decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg), child: Text(t, style: T.bodyMd));
    final linked = [for (final id in h.sourceEntryIds) (id, entries.getEntry(s, id))];
    return PhonePage(
      header: _sbarHeader(context, f: f),
      statusColor: C.tertiaryContainer,
      pad: const EdgeInsets.fromLTRB(S.lg, 2, S.lg, S.xl),
      gap: S.md,
      children: [
        _DowntimeStrip(app),
        _PatientCard(f),
        const _Notice('Saved note, append-only. It can not be changed; a new note is added after it.', icon: Symbols.lock),
        _Section(letter: 'S', title: 'Situation', sub: h.shift, bg: C.primaryContainer, fg: C.onPrimary, children: [text(h.situation)]),
        _Section(letter: 'B', title: 'Background', sub: 'As written by the nurse', bg: C.secondary, fg: C.onSecondary, children: [text(h.background)]),
        _Section(letter: 'A', title: 'Assessment', sub: 'As written by the nurse', bg: C.caution, fg: Colors.white, children: [text(h.assessment)]),
        _Section(
          letter: 'R',
          title: 'Recommendation',
          sub: 'Open items',
          bg: C.tertiaryContainer,
          fg: C.tertiaryFixed,
          right: _badge('${h.openItems.where((i) => !i.startsWith(_donePrefix)).length} OPEN', C.surfaceHigh, C.onSurfaceVariant),
          children: [
            if (h.openItems.isEmpty) Text('No open items were written.', style: T.bodySm.c(C.secondary)),
            for (var i = 0; i < h.openItems.length; i++)
              Padding(
                padding: EdgeInsets.only(top: i == 0 ? 0 : 8),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 48),
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
                  child: Row(children: [
                    Ic(h.openItems[i].startsWith(_donePrefix) ? Symbols.check_circle : Symbols.radio_button_unchecked, size: 20, color: C.secondary),
                    const SizedBox(width: 12),
                    Expanded(child: Text(h.openItems[i], style: T.bodyMd.medium)),
                  ]),
                ),
              ),
          ],
        ),
        Box(
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Linked records (${linked.length})', style: T.labelMd),
            if (linked.isEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('No records were linked to this note.', style: T.bodySm.c(C.secondary))),
            for (final (id, x) in linked)
              Tap(
                label: x == null ? 'Record not found' : 'Open record ${hm(x.entry.careTime)} ${_sum(x)}',
                expand: true,
                onTap: x == null ? null : () => withPatient(context, pid, (c) => Go.entry(c, pid, id)),
                child: Row(children: [
                  Text(x == null ? '—  ' : '${hm(x.entry.careTime)}  ', style: T.labelMd),
                  Expanded(child: Text(x == null ? 'Record $id not found' : '${_sum(x)}${x.entry.isConfirmed ? '' : ' (${x.entry.status})'}', style: T.bodySm)),
                  const Ic(Symbols.chevron_right, size: 20, color: C.secondary),
                ]),
              ),
          ]),
        ),
        Box(
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Shift Handover Attestation', style: T.labelMd),
            const SizedBox(height: 8),
            Text('Written by ${staffName(s, h.createdBy)}', style: T.bodySm.medium),
            Text(savedAt == null ? 'Came with the practice data (no save time)' : 'Saved ${dateTimeLabel(savedAt)} on this phone', style: T.bodySm.c(C.secondary)),
          ]),
        ),
      ],
    );
  }
}

/* ------------------------------ Ward handover ------------------------------ */

class HandoverScreen extends StatefulWidget {
  const HandoverScreen({super.key});
  @override
  State<HandoverScreen> createState() => _HandoverScreenState();
}

class _HandoverScreenState extends State<HandoverScreen> {
  int _filter = 0;
  String? _incoming;
  final Map<String, GlobalKey> _cards = {};
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<T?> _sheet<T>(Widget Function(BuildContext c) content) => showModalBottomSheet<T>(
        context: context,
        isScrollControlled: true,
        backgroundColor: C.surfaceLowest,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
        builder: (c) => SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.85),
            child: SingleChildScrollView(padding: const EdgeInsets.all(S.lg), child: content(c)),
          ),
        ),
      );

  Future<void> _pickIncoming(AppState app) async {
    final list = [for (final p in app.store.all('practitioner').map(Practitioner.new)) if (p.active && kSecondCheckerRoles.contains(p.role) && p.id != app.user!.id) p];
    final r = await _sheet<String>(
      (c) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Incoming nurse', style: T.headlineSm),
        Text('Active RN, a different person from the outgoing nurse', style: T.bodySm.c(C.secondary)),
        const SizedBox(height: 8),
        if (list.isEmpty) Text('There is no other active RN on this phone.', style: T.bodyMd),
        for (final p in list)
          Tap(
            label: p.title,
            selected: p.id == _incoming,
            expand: true,
            onTap: () => Navigator.pop(c, p.id),
            child: Row(children: [
              Container(width: 36, height: 36, alignment: Alignment.center, decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rFull), child: Text(p.initials, style: T.labelMd.c(C.onPrimary), textScaler: TextScaler.noScaling)),
              const SizedBox(width: 12),
              Expanded(child: Text(p.title, style: T.bodyMd.medium)),
              if (p.id == _incoming) const Ic(Symbols.check, color: C.saved),
            ]),
          ),
      ]),
    );
    if (r != null && mounted) setState(() => _incoming = r);
  }

  void _draft(String pid) => withPatient(context, pid, (c) => Go.sbar(c, pid));

  Future<void> _pickPatient(List<PatientFacts> roster, Map<String, ops.HandoffWithTime> have) async {
    final r = await _sheet<String>(
      (c) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('New SBAR note for', style: T.headlineSm),
        const SizedBox(height: 8),
        for (final f in roster)
          Tap(
            label: 'Bed ${f.bed}, ${f.patient.fullName}',
            expand: true,
            onTap: () => Navigator.pop(c, f.patient.id),
            child: Row(children: [
              Text('${f.bed}  ', style: T.labelMd),
              Expanded(child: Text(f.patient.fullName, style: T.bodyMd.medium)),
              Text(have.containsKey(f.patient.id) ? 'Ready' : 'Pending', style: T.labelSm.c(have.containsKey(f.patient.id) ? C.saved : C.error)),
            ]),
          ),
      ]),
    );
    if (r != null && mounted) _draft(r);
  }

  void _goTo(String pid) {
    setState(() => _filter = 0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _cards[pid]?.currentContext;
      if (c != null && c.mounted) Scrollable.ensureVisible(c, alignment: 0.1, duration: const Duration(milliseconds: 250));
    });
  }

  Future<void> _signOff(AppState app, List<PatientFacts> roster, List<PatientFacts> missing) async {
    if (_incoming == null) {
      await _pickIncoming(app);
      if (_incoming == null || !mounted) return;
    }
    final r = await showDialog<Object>(
      context: context,
      barrierColor: C.primaryContainer.withValues(alpha: 0.4),
      barrierDismissible: false,
      builder: (_) => _SignModal(roster: [for (final f in roster) f.patient.id], missing: missing, incomingId: _incoming!),
    );
    if (!mounted) return;
    if (r is String) _goTo(r);
    if (r == true) toast(context, 'Shift handover signed off by both nurses');
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn || !app.user!.isNurse) return _blank();
    final s = app.store, me = app.user!, now = app.nowIso, ev = app.downtime;
    final mine = ops.assignedPatients(s, me.id);
    final ward = loadWard(s, now);
    final duty = ops.handoverRoster(s, me.id, now).toSet();
    final own = [for (final f in ward) if (mine.contains(f.patient.id)) f];
    final roster = [for (final f in ward) if (duty.contains(f.patient.id)) f];
    final have = ops.shiftHandoffs(s, now);
    final drafts = {for (final d in entries.listDrafts(s, me.id, kind: 'sbar')) d['patient_id'] as String?: d};
    final missing = [for (final f in roster) if (!have.containsKey(f.patient.id)) f];
    final alert = [for (final f in roster) if (f.hasHighAlert || f.hasSevereAllergy) f];
    final ready = roster.length - missing.length;
    final (shift, shiftStart) = ops.shiftOf(now);
    final done = s.all('m_shift_signoff').where((r) => r['shift_start'] == shiftStart && r['outgoing_id'] == me.id).lastOrNull;
    final list = switch (_filter) { 1 => missing, 2 => alert, _ => roster };
    final saves = [
      for (final f in roster) if (have[f.patient.id]?.savedAt != null) have[f.patient.id]!.savedAt!,
      for (final f in roster) if (drafts[f.patient.id] != null) drafts[f.patient.id]!['updated_at'] as String,
    ]..sort();
    final incoming = staffById(s, done?['incoming_id'] as String? ?? _incoming);

    return PhonePage(
      controller: _scroll,
      statusColor: C.primaryContainer,
      header: Column(mainAxisSize: MainAxisSize.min, children: [
        _Rail(
          bg: C.primaryContainer,
          dot: _amber,
          fg: _cream,
          text: 'PRACTICE • ${switch (app.phase) { ops.Phase.down => 'DOWNTIME', ops.Phase.online => 'BACK ONLINE', ops.Phase.ready => 'NO DOWNTIME' }}',
          right: Row(mainAxisSize: MainAxisSize.min, children: [
            _Ticking(builder: (_) => Text(ev == null ? 'PRACTICE' : 'OFFLINE ${elapsedHms(ev.declaredAt, app.nowIso)}', style: T.mono(11, line: 14).c(C.onPrimaryContainer).tr(0.02))),
            const SizedBox(width: 6),
            const Ic(Symbols.cloud_off, size: 15, color: _mint),
          ]),
        ),
        _TitleBar(
          title: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Flexible(child: Text('Handover', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.headlineSm.s(17, 21))),
              const SizedBox(width: 8),
              Tag(me.roleLabel, bg: C.surfaceContainer, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
            ]),
            Text(app.unit, maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(C.secondary)),
          ]),
          action: Tap(label: 'Records and drafts on this phone', onTap: () => Go.queue(context), child: const Ic(Symbols.sync_saved_locally, size: 22, color: C.secondary)),
        ),
      ]),
      nav: _NurseNav(onAdd: () => _pickPatient(roster, have)),
      pad: const EdgeInsets.fromLTRB(S.lg, 5, S.lg, 40),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowSm),
          child: Column(children: [
            Row(children: [
              const Dot(_amber, size: 10),
              const SizedBox(width: 8),
              Expanded(flex: 7, child: _Ticking(builder: (_) => Text('${_phaseRail(app.phase)}${ev == null ? '' : ' (${elapsedHms(ev.declaredAt, app.nowIso)})'}', style: T.badge.c(_cream)))),
              const SizedBox(width: 8),
              const Flexible(flex: 4, child: Tag('PRACTICE DRILL', bg: _cream, fg: C.primaryContainer)),
            ]),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(children: [
                const Ic(Symbols.lock, size: 16, color: _mint),
                const SizedBox(width: 6),
                Expanded(flex: 3, child: Text('Encrypted on this phone', style: T.mono(11, line: 14).c(C.onPrimaryContainer).tr(0.02))),
                const SizedBox(width: 8),
                Expanded(flex: 2, child: Text(saves.isEmpty ? 'No SBAR yet' : 'Last saved ${hm(saves.last)}', textAlign: TextAlign.right, style: T.labelSm.c(C.tertiaryFixedDim))),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 8),
        Box(
          pad: const EdgeInsets.all(S.lg),
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('WARD CONTEXT', style: T.badge.c(C.secondary)),
                  Text(app.unit, style: T.headlineMd),
                  Text('Shift Handover • $shift', style: T.labelSm.c(C.secondary)),
                ]),
              ),
              Container(width: 40, height: 40, alignment: Alignment.center, decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rFull), child: const Ic(Symbols.published_with_changes, size: 22, color: C.onSecondaryContainer)),
            ]),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: _person('Outgoing ${me.roleLabel}', me.title, 'Signed in on this phone')),
                const SizedBox(width: 8),
                Expanded(
                  child: Semantics(
                    button: done == null,
                    label: incoming == null ? 'Choose the incoming nurse' : 'Incoming nurse ${incoming.title}',
                    excludeSemantics: true,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: done != null ? null : () => _pickIncoming(app),
                      child: _person('Incoming RN', incoming?.title ?? 'Choose nurse', done != null ? 'Signed ${hm(done['time'] as String)}' : (incoming == null ? 'Tap to choose' : 'Tap to change')),
                    ),
                  ),
                ),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: S.lg),
        Box(
          pad: const EdgeInsets.all(S.lg),
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const Ic(Symbols.assignment_turned_in, size: 20, color: C.secondary),
              const SizedBox(width: 8),
              Expanded(child: Text('Shift Handover Roster', style: T.headlineSm)),
              const SizedBox(width: 8),
              Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rFull), child: Text('${roster.length} Patient${roster.length == 1 ? '' : 's'}', style: T.labelMd)),
            ]),
            if (roster.length == ward.length && own.length < ward.length) ...[const SizedBox(height: 8), Text('No patients are assigned to you. The whole ward list is shown.', style: T.bodySm.c(C.secondary))] else if (roster.length > own.length) ...[const SizedBox(height: 8), Text('Includes patients you recorded care for in this shift.', style: T.bodySm.c(C.secondary))],
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: Text('$ready of ${roster.length} Patients Documented', style: T.labelSm)),
              const SizedBox(width: 8),
              Expanded(child: Text(missing.isEmpty ? 'All ready' : '${missing.length} Pending SBAR Note${missing.length == 1 ? '' : 's'}', textAlign: TextAlign.right, style: T.labelSm.bold.c(missing.isEmpty ? C.saved : C.error))),
            ]),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: const BorderRadius.all(Radius.circular(5)),
              child: SizedBox(
                height: 10,
                child: Row(children: [
                  if (ready > 0) Expanded(flex: ready, child: const ColoredBox(color: C.tertiaryContainer, child: SizedBox.expand())),
                  if (missing.isNotEmpty) Expanded(flex: missing.length, child: const ColoredBox(color: _amber, child: SizedBox.expand())),
                  if (roster.isEmpty) const Expanded(child: ColoredBox(color: C.surfaceHigh, child: SizedBox.expand())),
                ]),
              ),
            ),
            const SizedBox(height: 16),
            Tap(
              label: 'Export ward summary: opens the paper copy page',
              expand: true,
              onTap: () => Go.print(context),
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rLg),
                child: Row(children: [
                  const Ic(Symbols.download_for_offline, size: 20, color: C.secondary),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Export Ward Summary (This Phone)', style: T.labelMd)),
                  const Ic(Symbols.lock_reset, size: 18, color: C.secondary),
                ]),
              ),
            ),
          ]),
        ),
        const SizedBox(height: S.lg),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            _tab(0, 'All Beds', roster.length),
            const SizedBox(width: 8),
            _tab(1, 'Pending Handover', missing.length, red: true),
            const SizedBox(width: 8),
            _tab(2, 'High-alert drug or severe allergy', alert.length),
            const SizedBox(width: 8),
            Unavailable(reason: 'The app keeps no code or resuscitation events.', child: _tab(3, 'Code / Resus', null)),
          ]),
        ),
        const SizedBox(height: 24),
        if (list.isEmpty) Text(_filter == 1 ? 'No patient is waiting for an SBAR note.' : 'No patient in this list.', style: T.bodyMd.c(C.onSurfaceVariant)),
        for (var i = 0; i < list.length; i++) ...[
          if (i > 0) const SizedBox(height: 14),
          KeyedSubtree(key: _cards.putIfAbsent(list[i].patient.id, GlobalKey.new), child: _card(s, list[i], have[list[i].patient.id], drafts[list[i].patient.id])),
        ],
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl),
          child: Row(children: [
            Expanded(
              child: Tap(
                label: 'Print offline handover sheet',
                expand: true,
                onTap: () => Go.print(context),
                child: Row(children: [
                  const Ic(Symbols.print, size: 22, color: C.secondary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                      Text('Print Offline Handover Sheet', style: T.labelMd),
                      Text('Backup hardcopy format for nursing clipboards', style: T.bodySm.c(C.secondary)),
                    ]),
                  ),
                ]),
              ),
            ),
            const SizedBox(width: 12),
            Unavailable(
              reason: 'Sharing is not part of this app. Use the paper copy.',
              child: Container(width: 48, height: 48, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg), child: const Ic(Symbols.share, size: 20)),
            ),
          ]),
        ),
        const SizedBox(height: 28),
        if (done != null)
          Container(
            constraints: const BoxConstraints(minHeight: 50),
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(color: C.tertiaryContainer, borderRadius: R.rLg, boxShadow: shadowMd),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Ic(Symbols.done_all, size: 20, color: _mintText),
              const SizedBox(width: 8),
              Flexible(child: Text('Handover Signed Off ${hm(done['time'] as String)} (Stored on This Phone)', textAlign: TextAlign.center, style: T.labelMd.bold.c(_mintText).tr(0.025))),
            ]),
          )
        else
          Container(
            decoration: const BoxDecoration(borderRadius: R.rLg, boxShadow: shadowMd),
            child: Btn('Complete Shift Handover Sign-Off', height: 50, radius: R.lg, icon: Symbols.verified_user, iconSize: 22, style: T.labelMd.bold.tr(0.025), onTap: roster.isEmpty ? null : () => _signOff(app, roster, missing)),
          ),
        const SizedBox(height: 8),
        Text(
          done != null
              ? 'Outgoing: ${staffName(s, done['outgoing_id'] as String)} • Incoming: ${staffName(s, done['incoming_id'] as String)} • ${dateTimeLabel(done['time'] as String)} • ${(done['handoff_ids'] as List).length} SBAR notes'
              : 'Requires mutual PIN co-signature (${me.name} • ${incoming?.name ?? 'incoming nurse'})',
          textAlign: TextAlign.center,
          style: T.bodySm.c(C.secondary),
        ),
      ],
    );
  }

  Widget _person(String label, String name, String sub) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: T.labelSm.c(C.secondary)),
        Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: T.labelMd),
        Text(sub, style: T.bodySm.s(11, 16).c(C.onSurfaceVariant)),
      ]);

  Widget _tab(int i, String label, int? n, {bool red = false}) {
    final on = i == _filter;
    return Tap(
      label: n == null ? label : '$label, $n',
      selected: on,
      onTap: () => setState(() => _filter = i),
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(color: on ? C.primary : C.surfaceLowest, borderRadius: R.rLg, boxShadow: shadowSm),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(label, style: T.labelMd.c(on ? C.onPrimary : C.onSurface)),
          if (n != null) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(color: on ? C.surface.withValues(alpha: 0.2) : (red && n > 0 ? C.errorContainer : C.surfaceContainer), borderRadius: R.rFull),
              child: Text('$n', style: T.labelMd.s(10, 18).c(on ? C.onPrimary : (red && n > 0 ? C.onErrorContainer : C.secondary))),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _card(Store s, PatientFacts f, ops.HandoffWithTime? note, Doc? draft) {
    final pending = note == null;
    final enc = f.encounter;
    final v = f.lastVitals;
    final inf = f.infusions;
    Widget chip(String t, Color bg, Color fg) => Tag(t, bg: bg, fg: fg);
    final code = enc?.codeStatus;
    return Box(
      pad: const EdgeInsets.all(S.lg),
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Tag('BED ${f.bed}', bg: pending ? C.primaryContainer : C.surfaceContainer, fg: pending ? C.onPrimary : C.onSurfaceVariant),
                Text('MRN: ${f.patient.mrn}', style: T.mono(11, line: 14).c(C.secondary).tr(0.02)),
              ]),
              const SizedBox(height: 4),
              Text('${f.patient.fullName}, ${f.ageSex}', style: T.headlineSm.bold),
              Text([if (enc?.attending != null) enc!.attending!, if (enc?.diet != null) 'Diet: ${enc!.diet}'].join(' • '), maxLines: 1, overflow: TextOverflow.ellipsis, style: T.bodySm.c(C.secondary)),
            ]),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            constraints: const BoxConstraints(maxWidth: 104),
            decoration: BoxDecoration(color: pending ? C.errorContainer : C.tertiaryFixed, borderRadius: R.rBase),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (pending) const Dot(C.error, size: 6) else const Ic(Symbols.check, size: 14, color: C.onTertiaryFixed),
              const SizedBox(width: 4),
              Flexible(child: Text(pending ? 'NEEDS SBAR' : 'READY', style: T.badge.c(pending ? C.onErrorContainer : C.onTertiaryFixed))),
            ]),
          ),
        ]),
        const SizedBox(height: 12),
        Wrap(spacing: 6, runSpacing: 6, children: [
          if (f.realAllergies.isNotEmpty)
            chip('${f.allergyText.toUpperCase()} ALLERGY', C.errorContainer, C.onErrorContainer)
          else
            chip(f.allergyText.toUpperCase(), f.allergies.isEmpty ? C.errorContainer : C.surfaceContainer, f.allergies.isEmpty ? C.onErrorContainer : C.onSurface),
          if (f.hasHighAlert) chip('HIGH-ALERT DRUG', C.secondaryContainer, C.onSecondaryFixed),
          if (enc?.isolation != null) chip('ISOLATION: ${enc!.isolation}'.toUpperCase(), C.surfaceContainer, C.onSurface),
          if (code != null && code.toLowerCase() != 'full code') chip(code.toUpperCase(), C.surfaceContainer, C.onSurface),
        ]),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (inf.isEmpty)
              Row(children: [
                Expanded(child: Text('No active infusion order', style: T.labelSm)),
                Text(v == null ? 'No vitals' : 'Vitals: ${hm(v.entry.careTime)}', style: T.mono(11, line: 14).tr(0.02)),
              ]),
            for (final o in inf)
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Active Infusion:', style: T.labelSm),
                const SizedBox(width: 8),
                Expanded(child: Text('${o.drugName ?? o.text} ${_rate(o, f)}', textAlign: TextAlign.right, style: T.mono(11, w: FontWeight.w700, line: 14))),
              ]),
            const SizedBox(height: 6),
            Text(v == null ? 'No vital signs recorded on this phone.' : 'Last vitals ${hm(v.entry.careTime)}, ${dayLabel(v.entry.careTime)}: ${_sum(v)}', style: T.bodySm.c(C.onSurfaceVariant)),
          ]),
        ),
        if (pending) ...[
          const SizedBox(height: 12),
          if (draft != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('Your draft from ${hm(draft['updated_at'] as String)} is not finished.', style: T.bodySm.c(C.onErrorContainer))),
          Tap(
            label: draft == null ? 'Draft bedside SBAR for ${f.patient.fullName}' : 'Continue SBAR draft for ${f.patient.fullName}',
            expand: true,
            onTap: () => _draft(f.patient.id),
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rLg, boxShadow: shadowSm),
              child: Row(children: [
                const Ic(Symbols.edit_note, size: 20, color: C.onPrimary),
                const SizedBox(width: 8),
                Expanded(child: Text(draft == null ? 'Draft Bedside SBAR' : 'Continue SBAR Draft', style: T.labelMd.c(C.onPrimary))),
                const Ic(Symbols.arrow_forward, size: 18, color: C.onPrimary),
              ]),
            ),
          ),
        ] else ...[
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: Text('Signed ${hm(note.savedAt)} by ${staffShort(s, note.handoff.createdBy)}', style: T.bodySm.c(C.secondary))),
            const SizedBox(width: 8),
            Tap(
              label: 'View SBAR of ${f.patient.fullName}',
              onTap: () => Go.sbarView(context, note.handoff.id),
              child: Container(
                constraints: const BoxConstraints(minHeight: 48),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg),
                child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.visibility, size: 18), const SizedBox(width: 6), Text('View SBAR', style: T.labelMd)]),
              ),
            ),
          ]),
        ],
      ]),
    );
  }

  String _rate(ActiveOrder o, PatientFacts f) {
    final (r, u) = currentRate(o, f.meds);
    return r == null ? '(no rate)' : '${grouped(r)} ${u ?? ''}'.trim();
  }
}

class _NurseNav extends StatelessWidget {
  final VoidCallback onAdd;
  const _NurseNav({required this.onAdd});
  @override
  Widget build(BuildContext context) {
    Widget item(IconData icon, String label, VoidCallback? onTap, {bool active = false}) => Expanded(
          child: Tap(
            label: label,
            selected: active,
            expand: true,
            onTap: onTap,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Ic(icon, size: 22, color: active ? C.primary : C.onSurfaceVariant),
              const SizedBox(height: 2),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(active ? C.primary : C.onSurfaceVariant).w(active ? FontWeight.w600 : FontWeight.w500)),
            ]),
          ),
        );
    return MediaQuery.withClampedTextScaling(maxScaleFactor: 1.2, child: Container(
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0A000000), offset: Offset(0, -1), blurRadius: 8)]),
      child: Row(children: [
        item(Symbols.groups, 'Patients', () => Go.ward(context)),
        item(Symbols.swap_horiz, 'Handover', null, active: true),
        Expanded(
          child: Transform.translate(
            offset: const Offset(0, -12),
            child: Tap(
              label: 'New SBAR note',
              onTap: onAdd,
              expand: true,
              child: Container(width: 48, height: 48, alignment: Alignment.center, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rXl, boxShadow: shadowMd), child: const Ic(Symbols.add, size: 28, color: C.onPrimary)),
            ),
          ),
        ),
        item(Symbols.notification_important, 'Alerts', () => Go.alerts(context)),
        item(Symbols.menu, 'More', () => Go.more(context)),
      ]),
    ));
  }
}

/* ------------------------------ Shift sign-off ------------------------------ */

/// Both PINs, two different people. Returns true when signed, a patient id for "go to pending note", null when cancelled.
class _SignModal extends StatefulWidget {
  final List<String> roster;
  final List<PatientFacts> missing;
  final String incomingId;
  const _SignModal({required this.roster, required this.missing, required this.incomingId});
  @override
  State<_SignModal> createState() => _SignModalState();
}

class _SignModalState extends State<_SignModal> {
  final _own = TextEditingController(), _inc = TextEditingController();
  final _ownF = FocusNode(), _incF = FocusNode();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _own.dispose();
    _inc.dispose();
    _ownF.dispose();
    _incF.dispose();
    super.dispose();
  }

  Future<void> _authorize(AppState app) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    String error;
    try {
      final r = await app.shiftSignoff(app.ctx(), roster: widget.roster, ownPin: _own.text, incomingId: widget.incomingId, incomingPin: _inc.text);
      if (!mounted) return;
      if (r.ok) {
        Navigator.of(context).pop(true);
        return;
      }
      error = r.error ?? 'The PIN is not right.';
    } catch (e) {
      error = _err(e);
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
      (error.startsWith('Outgoing') ? _own : _inc).clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return const SizedBox();
    final s = app.store, blocked = widget.missing.isNotEmpty;
    final ready = !blocked && !_busy && _own.text.length == 4 && _inc.text.length == 4;
    String short(String id) => staffShort(s, id).split(',').first;
    Widget pins(String label, TextEditingController c, FocusNode f, Color bg) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(label, style: T.labelSm.c(C.secondary)),
          const SizedBox(height: 4),
          Opacity(
            opacity: blocked ? 0.5 : 1,
            child: _PinBoxes(
              label: label,
              controller: c,
              focus: f,
              bg: bg,
              enabled: !blocked && !_busy,
              onChanged: () {
                setState(() => _error = null);
                if (c.text.length == 4 && identical(c, _own)) _incF.requestFocus();
              },
            ),
          ),
        ]);
    final pendingBeds = widget.missing.map((f) => 'Bed ${f.bed}').join(', ');
    return PopScope(
      canPop: !_busy, // the check in progress finishes on this page
      child: Dialog(
      alignment: Alignment.bottomCenter,
      backgroundColor: C.surfaceLowest,
      insetPadding: const EdgeInsets.all(S.lg),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16))),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Ic(Symbols.key, size: 24, color: C.primary),
            const SizedBox(width: 8),
            Expanded(child: Text('Shift Co-Signature', style: T.headlineSm.bold)),
            Tap(label: 'Close', onTap: _busy ? null : () => Navigator.of(context).pop(), child: const Ic(Symbols.close, size: 24, color: C.secondary)),
          ]),
          const SizedBox(height: 12),
          if (blocked || _error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: C.errorContainer.withValues(alpha: 0.4), borderRadius: R.rLg),
              child: Row(children: [
                const Ic(Symbols.warning, size: 20, color: C.error),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    blocked ? '$pendingBeds still ${widget.missing.length == 1 ? 'has' : 'have'} no final SBAR note for this shift. Sign-off is blocked until every patient has one.' : _error!,
                    style: T.labelSm.c(C.onErrorContainer),
                  ),
                ),
              ]),
            ),
            const SizedBox(height: 16),
          ],
          pins('Outgoing ${app.user!.roleLabel} PIN (${short(app.user!.id)})', _own, _ownF, C.surfaceContainer),
          const SizedBox(height: 12),
          pins('Incoming RN PIN (${short(widget.incomingId)})', _inc, _incF, C.surfaceHigh),
          const SizedBox(height: 24),
          Row(children: [
            Expanded(child: Btn('Cancel', kind: BtnKind.quiet, bg: C.surfaceContainer, radius: R.lg, onTap: _busy ? null : () => Navigator.of(context).pop())),
            const SizedBox(width: 8),
            Expanded(
              child: blocked
                  ? Btn('Go to pending note', radius: R.lg, onTap: () => Navigator.of(context).pop(widget.missing.first.patient.id))
                  : Btn('Authorize', radius: R.lg, trailing: Symbols.verified, iconSize: 18, busy: _busy, onTap: ready ? () => _authorize(app) : null),
            ),
          ]),
        ]),
      ),
    ),
    );
  }
}

/// Four masked boxes over one hidden number field.
class _PinBoxes extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final FocusNode focus;
  final Color bg;
  final bool enabled;
  final VoidCallback onChanged;
  const _PinBoxes({required this.label, required this.controller, required this.focus, required this.bg, required this.enabled, required this.onChanged});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([controller, focus]),
        builder: (_, __) => Stack(children: [
          ExcludeSemantics(
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              for (var i = 0; i < 4; i++)
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: bg, borderRadius: R.rLg, border: focus.hasFocus && i == controller.text.length.clamp(0, 3) ? Border.all(color: C.primary, width: 2) : null),
                  child: i < controller.text.length ? const Dot(C.onSurface, size: 10) : const Dot(C.outlineVariant, size: 6),
                ),
            ]),
          ),
          Positioned.fill(
            child: Semantics(
              label: label,
              child: TextField(
                controller: controller,
                focusNode: focus,
                enabled: enabled,
                obscureText: true,
                showCursor: false,
                style: const TextStyle(color: Colors.transparent, fontSize: 1),
                keyboardType: TextInputType.number,
                autocorrect: false,
                enableSuggestions: false,
                enableInteractiveSelection: false,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
                decoration: const InputDecoration(border: InputBorder.none, counterText: ''),
                autofillHints: null,
                enableIMEPersonalizedLearning: false,
                onChanged: (_) => onChanged(),
              ),
            ),
          ),
        ]),
      );
}
