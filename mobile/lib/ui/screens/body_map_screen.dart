import 'dart:async';
import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';

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
import 'body_art.dart';

class _Kind {
  final String id, label, legend;
  final IconData icon;
  final Color color, fg, soft, softFg;
  const _Kind(this.id, this.label, this.legend, this.icon, this.color, this.fg, this.soft, this.softFg);
}

const List<_Kind> _kinds = [
  _Kind('line', 'Line', 'Lines / PIV', Symbols.water_drop, C.secondary, C.onSecondary, C.secondaryContainer, C.onSecondaryContainer),
  _Kind('wound', 'Wound / Pressure', 'Wounds / Pressure', Symbols.healing, C.error, C.onError, C.errorContainer, C.onErrorContainer),
  _Kind('device', 'Device', 'Therapy / Device', Symbols.airline_stops, C.primaryContainer, C.onPrimary, C.surfaceHighest, C.onSurface),
  _Kind('other', 'Other', 'Other', Symbols.label, C.outline, C.onPrimary, C.surfaceHigh, C.onSurfaceVariant),
];
String _titleCase(String s) => s.split(' ').map((w) => w.isEmpty || w == 'of' ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
_Kind _kindOf(String id) => _kinds.firstWhere((k) => k.id == id, orElse: () => _kinds.last);

/// One saved finding row with the live version of its note.
class _Rec {
  final Doc row;
  final EntryX tip;
  const _Rec(this.row, this.tip);
  bool get live => tip.entry.isConfirmed;
  String get text => tip.entry.id == row['entry_id'] ? '${row['text']}' : (tip.child == null ? '${row['text']}' : tip.note.text);
}

/// Newest live record of one region and kind; older ones are its history.
class _Group {
  final BodyRegion region;
  final _Kind kind;
  final List<_Rec> all; // newest first
  _Group(this.region, this.kind, this.all);
  _Rec get now => all.firstWhere((r) => r.live);
  String get key => '${region.id}|${kind.id}';
  String get view => '${now.row['view']}';
}

class _Pending {
  final String key, regionId, view, kind, text, careTime;
  const _Pending(this.key, this.regionId, this.view, this.kind, this.text, this.careTime);
  Doc toDoc() => {'key': key, 'region_id': regionId, 'view': view, 'kind': kind, 'text': text, 'care_time': careTime};
  static _Pending of(Doc d) => _Pending('${d['key']}', '${d['region_id']}', '${d['view']}', '${d['kind']}', '${d['text']}', '${d['care_time']}');
}

/// A site named on a medicine record. Read only.
class _Site {
  final EntryX x;
  final BodyRegion region;
  const _Site(this.x, this.region);
  bool get iv => (x.med.site ?? '').contains('IV line') || x.med.route == 'IV';
}

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

Widget _sheetTop(BuildContext c, String title) => Column(children: [
      Container(width: 48, height: 6, decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rFull)),
      const SizedBox(height: S.md),
      Row(children: [
        Expanded(child: Text(title, style: T.headlineMd)),
        Tap(label: 'Close', onTap: () => Navigator.pop(c), child: const Ic(Symbols.close, size: 24, color: C.onSurfaceVariant)),
      ]),
      const SizedBox(height: 8),
    ]);

Widget _error(String text) => Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(S.sm),
        decoration: const BoxDecoration(color: C.errorContainer, borderRadius: R.rBase),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Ic(Symbols.error, size: 18, color: C.onErrorContainer), const SizedBox(width: 6), Expanded(child: Text(text, style: T.bodySm.c(C.onErrorContainer)))]),
      ),
    );

class BodyMapScreen extends StatefulWidget {
  final String patientId;
  const BodyMapScreen({super.key, required this.patientId});
  @override
  State<BodyMapScreen> createState() => _BodyMapScreenState();
}

class _BodyMapScreenState extends State<BodyMapScreen> {
  String _view = 'front';
  bool _taggedOnly = false, _busy = false, _ready = false, _restored = false;
  String? _region, _flash, _error1;
  final Set<String> _closed = {};
  List<_Pending> _pending = [];
  final Map<String, GlobalKey> _cards = {};
  Timer? _flashTimer;

  static const _why = 'Only nurses can record care. You can look at the map.';

  String _draftId(AppState a) => 'body-${a.user!.id}-${widget.patientId}';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_ready) return;
    _ready = true;
    final a = AppScope.read(context);
    if (a.user == null) return;
    final d = getDraft(a.store, _draftId(a), a.user!.id);
    if (d != null && d['patient_id'] == widget.patientId) {
      final items = ((d['payload'] as Map?)?['items'] as List?) ?? const [];
      _pending = [for (final i in items) _Pending.of((i as Map).cast<String, Object?>())];
      _restored = _pending.isNotEmpty;
    }
  }

  @override
  void dispose() {
    _flashTimer?.cancel();
    super.dispose();
  }

  /* ---------- data ---------- */

  List<_Group> _groups(AppState a) {
    final map = <String, List<_Rec>>{};
    for (final row in a.store.where('m_body_finding', 'patient_id', widget.patientId)) {
      final chain = versionChain(a.store, '${row['entry_id']}');
      if (chain.isEmpty || regionById('${row['region_id']}') == null) continue;
      (map['${row['region_id']}|${row['kind']}'] ??= []).add(_Rec(row, chain.last));
    }
    final out = <_Group>[];
    for (final l in map.values) {
      l.sort((x, y) {
        var c = ms(y.tip.entry.careTime).compareTo(ms(x.tip.entry.careTime));
        if (c == 0) c = ms('${y.row['saved_at']}').compareTo(ms('${x.row['saved_at']}'));
        return c == 0 ? y.tip.entry.counter.compareTo(x.tip.entry.counter) : c;
      });
      if (l.any((r) => r.live)) out.add(_Group(regionById('${l.first.row['region_id']}')!, _kindOf('${l.first.row['kind']}'), l));
    }
    out.sort((x, y) => _kinds.indexOf(x.kind).compareTo(_kinds.indexOf(y.kind)));
    return out;
  }

  List<_Site> _sites(PatientFacts f) {
    final seen = <String>{};
    return [
      for (final x in f.meds)
        if (x.entry.isConfirmed && x.child != null && siteRegion(x.med.site) != null && seen.add('${x.med.site}')) _Site(x, siteRegion(x.med.site)!),
    ];
  }

  /* ---------- actions ---------- */

  bool get _nurse => AppScope.read(context).user?.isNurse ?? false;

  void _keepDraft() {
    final a = AppScope.read(context);
    try {
      if (_pending.isEmpty) {
        discardDraft(a.ctx(), _draftId(a), audit: false);
      } else {
        saveDraft(a.ctx(), id: _draftId(a), kind: 'body', patientId: widget.patientId, payload: {'items': [for (final p in _pending) p.toDoc()]});
      }
      a.saved();
      _error1 = null;
    } on AppError catch (e) {
      _error1 = 'The draft could not be kept on this phone. ${e.message}';
    }
  }

  Future<void> _tag({_Group? again}) async {
    if (!_nurse) return toast(context, _why, icon: Symbols.info);
    final a = AppScope.read(context);
    final r = await _sheet<(String, String, String, String)>(context, (_) => _TagSheet(view: again?.view ?? _view, regionId: again?.region.id ?? _region, kind: again?.kind.id, again: again != null));
    if (r == null || !mounted) return;
    setState(() {
      _pending = [..._pending, _Pending(newId('k'), r.$1, r.$2, r.$3, r.$4, a.nowIso)];
      _view = r.$2;
      _keepDraft();
    });
  }

  Future<void> _remove(_Pending p) async {
    if (!await confirm(context, title: 'Remove this finding?', text: '${regionById(p.regionId)?.label ?? p.regionId}: ${p.text}\n\nIt is not saved yet.', yes: 'Remove', danger: true) || !mounted) return;
    setState(() {
      _pending = [for (final x in _pending) if (x.key != p.key) x];
      _keepDraft();
    });
  }

  Future<void> _discard() async {
    if (_busy) return;
    if (_pending.isNotEmpty) {
      final n = AppScope.read(context).store.get('patient', widget.patientId);
      if (!await confirm(context, title: 'Discard unsaved findings?', text: '${_pending.length} finding${_pending.length == 1 ? ' is' : 's are'} not saved for ${n == null ? 'this patient' : Patient(n).fullName}. Saved findings are not changed.', yes: 'Discard', danger: true) || !mounted) return;
      final a = AppScope.read(context);
      try {
        discardDraft(a.ctx(), _draftId(a));
      } on AppError catch (e) {
        return setState(() => _error1 = e.message);
      }
      _pending = [];
    }
    if (mounted) Go.back(context);
  }

  /// All new findings in one transaction: every note with its region row, or nothing.
  void _save() {
    if (_busy || _pending.isEmpty) return;
    final a = AppScope.read(context);
    setState(() {
      _busy = true;
      _error1 = null;
    });
    try {
      final c = a.ctx();
      final list = [..._pending];
      a.store.tx(() {
        for (final p in list) {
          final r = regionById(p.regionId);
          if (r == null || !r.zones.containsKey(p.view)) throw const AppError('This body region is not on the map.');
          createEntry(
            c,
            type: 'note',
            patientId: widget.patientId,
            careTime: p.careTime,
            clientKey: p.key,
            values: {'category': 'assessment', 'text': '${r.label} (${p.view} view), ${_kindOf(p.kind).label.toLowerCase()}: ${p.text}', 'score_name': null, 'score_value': null},
            also: (e) => a.store.insert('m_body_finding', {'id': newId('bf'), 'entry_id': e.id, 'patient_id': widget.patientId, 'region_id': r.id, 'region_label': r.label, 'side': r.side, 'view': p.view, 'kind': p.kind, 'text': p.text, 'saved_at': e.entryTime}),
          );
        }
        discardDraft(c, _draftId(a), audit: false);
      });
      _pending = [];
      _restored = false;
      a.saved();
      toast(context, '${list.length} finding${list.length == 1 ? '' : 's'} saved on this phone, encrypted.');
    } on AppError catch (e) {
      _error1 = e.message;
    } finally {
      setState(() => _busy = false);
    }
  }

  void _openCard(String key) {
    setState(() {
      _closed.remove(key);
      _flash = key;
    });
    _flashTimer?.cancel();
    _flashTimer = Timer(const Duration(milliseconds: 1200), () {
      if (mounted) setState(() => _flash = null);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final c = _cards[key]?.currentContext;
      if (c != null && c.mounted) Scrollable.ensureVisible(c, duration: const Duration(milliseconds: 250), alignment: 0.3);
    });
  }

  void _history(_Group g) {
    final a = AppScope.read(context);
    _sheet<void>(
      context,
      (x) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _sheetTop(x, '${g.region.label} History'),
        for (final r in g.all)
          Tap(
            label: 'Open record ${dateTimeLabel(r.tip.entry.careTime)}',
            expand: true,
            onTap: () {
              Navigator.pop(x);
              Go.entry(context, widget.patientId, r.tip.entry.id);
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 56, child: Text(hm(r.tip.entry.careTime), style: T.labelMd.bold)),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(r.text, style: T.bodyMd.copyWith(decoration: r.live ? null : TextDecoration.lineThrough)),
                    Text('${dayLabel(r.tip.entry.careTime)} • ${staffShort(a.store, r.tip.entry.performerId)} • ${r.row['view']} view${r.live ? '' : ' • ${r.tip.entry.status}'}', style: T.bodySm.c(C.onSurfaceVariant)),
                  ]),
                ),
                const Ic(Symbols.chevron_right, size: 20, color: C.onSurfaceVariant),
              ]),
            ),
          ),
      ]),
    );
  }

  /* ---------- screen ---------- */

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = loadFacts(a.store, widget.patientId, a.nowIso);
    if (f == null) return PhonePage(children: [_error('This patient is not in the patient list.')]);
    final groups = _groups(a);
    final sites = _taggedOnly ? const <_Site>[] : _sites(f);
    final total = groups.length + sites.length;
    final nurse = a.user?.isNurse ?? false;
    return PhonePage(
      header: _header(f),
      pad: const EdgeInsets.fromLTRB(S.md, 0, S.md, S.md),
      gap: S.md,
      footer: Container(
        color: C.surface,
        padding: const EdgeInsets.fromLTRB(S.md, S.sm, S.md, S.sm),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_error1 != null) ...[_error(_error1!), const SizedBox(height: 8)],
          Row(children: [
            SizedBox(width: 100, child: Btn('Discard', kind: BtnKind.quiet, onTap: _busy ? null : _discard)),
            const SizedBox(width: 8),
            Expanded(child: DecoratedBox(decoration: const BoxDecoration(boxShadow: shadowMd), child: Btn('Save Assessment On Phone', key: const ValueKey('body-save'), icon: Symbols.save, kind: BtnKind.navy, busy: _busy, onTap: nurse && _pending.isNotEmpty ? _save : null))),
          ]),
          const SizedBox(height: 4),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Ic(Symbols.check_circle, size: 13, color: C.tertiary),
            const SizedBox(width: 4),
            Flexible(child: Text(!nurse ? _why : _pending.isEmpty ? 'PRACTICE • Nothing new to save' : 'PRACTICE • ${_pending.length} not saved yet, draft kept encrypted', style: T.labelSm.c(C.onSurfaceVariant), textAlign: TextAlign.center)),
          ]),
        ]),
      ),
      children: [
        _banner(a, f),
        _practiceRow(),
        _controls(total),
        _canvas(a, groups, sites),
        Tap(
          label: 'Tag new region',
          expand: true,
          onTap: () => _tag(),
          child: Box(
            shadow: true,
            pad: const EdgeInsets.symmetric(horizontal: S.md, vertical: 12),
            child: Row(children: [
              const Ic(Symbols.add_circle, size: 20, color: C.secondary),
              const SizedBox(width: 8),
              Expanded(child: Text('+ Tag New Region (Wound, Line, Drain, Rash)', style: T.headlineSm.c(C.secondary), textAlign: TextAlign.center)),
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(children: [
            const Ic(Symbols.assignment_late, size: 20, color: C.secondary),
            const SizedBox(width: 4),
            Expanded(child: Text('Bedside Findings & Interventions', style: T.headlineMd)),
            const SizedBox(width: 4),
            Tag('$total Active', style: T.labelSm, radius: R.full),
          ]),
        ),
        if (_restored) _noteBox(Symbols.history, 'Your unsaved findings were kept on this phone and are shown again.'),
        for (final p in _pending) _pendingCard(a, p),
        if (groups.isEmpty && sites.isEmpty && _pending.isEmpty)
          Box(
            shadow: true,
            pad: const EdgeInsets.all(S.lg),
            child: Column(children: [
              const Ic(Symbols.accessibility_new, size: 28, color: C.slate),
              const SizedBox(height: 8),
              Text('No finding is tagged for this patient. Not assessed is not the same as no finding.', style: T.bodyMd.c(C.onSurfaceVariant), textAlign: TextAlign.center),
            ]),
          ),
        for (final g in groups) _findingCard(a, g),
        for (final s in sites) _siteCard(a, s),
        _photos(a),
      ],
    );
  }

  Widget _header(PatientFacts f) => Container(
        constraints: const BoxConstraints(minHeight: 80),
        padding: const EdgeInsets.symmetric(horizontal: S.md),
        decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0F1C2536), offset: Offset(0, 1), blurRadius: 8)]),
        child: Row(children: [
          Tap(label: 'Go back', onTap: () => Go.back(context), child: const Ic(Symbols.arrow_back, size: 24)),
          Expanded(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Anatomical Body Map', style: T.headlineSm.tr(-0.025), maxLines: 2, overflow: TextOverflow.ellipsis),
              Text('${f.patient.fullName} • Bed ${f.bed}', style: T.labelSm.c(C.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
            ]),
          ),
          const SizedBox(width: 8),
          Container(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2), decoration: const BoxDecoration(color: C.tertiaryFixed, borderRadius: R.rBase), child: const Ic(Symbols.encrypted, size: 13, color: C.onTertiaryFixed)),
          const SizedBox(width: 8),
          Tag('PRACTICE', style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
        ]),
      );

  Widget _banner(AppState a, PatientFacts f) {
    final ev = a.downtime;
    final al = f.realAllergies;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowSm),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          color: C.primary,
          padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 4),
          child: Row(children: [
            const Dot(C.tertiaryFixed),
            const SizedBox(width: 4),
            Expanded(child: Text((a.phase == ops.Phase.down ? 'EHR Downtime Active' : a.phase == ops.Phase.online ? 'Back Online' : 'Normal Operation').toUpperCase(), style: T.badge.c(C.secondaryFixed))),
            if (ev != null) ...[
              const Ic(Symbols.timer, size: 14, color: C.onPrimaryContainer),
              const SizedBox(width: 4),
              Text('Offline ${elapsedHms(ev.declaredAt, a.nowIso)}', style: T.labelSm.c(C.onPrimaryContainer)),
            ],
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(S.md),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text(f.patient.fullName, style: T.headlineSm.c(C.onPrimary)),
                  Tag(f.ageSex, bg: C.surfaceHighest.withValues(alpha: 0.2), fg: C.inverseOnSurface, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                ]),
                Text('MRN: ${f.patient.mrn} • Bed ${f.bed}', style: T.bodySm.c(C.onPrimaryContainer)),
              ]),
            ),
            const SizedBox(width: 8),
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.38),
              child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                if (al.isEmpty) Tag(f.allergyText, bg: C.secondary, fg: C.onSecondary),
                for (final (i, x) in al.take(3).indexed) ...[
                  if (i > 0) const SizedBox(height: 4),
                  x.severity == 'severe' ? Tag(x.substance.toUpperCase(), icon: Symbols.warning, bg: C.error, fg: C.onError) : Tag('${x.substance} ALLERGY'.toUpperCase(), bg: C.secondary, fg: C.onSecondary),
                ],
              ]),
            ),
          ]),
        ),
        Container(
          color: C.surfaceHighest.withValues(alpha: 0.1),
          padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 6),
          child: Row(children: [
            const Ic(Symbols.lock, size: 14, color: C.tertiaryFixed),
            const SizedBox(width: 4),
            Expanded(child: Text('Encrypted on this phone', style: T.labelSm.c(C.tertiaryFixed))),
            const SizedBox(width: 8),
            Text('Local review', style: T.labelSm.c(C.secondaryFixed)),
          ]),
        ),
      ]),
    );
  }

  Widget _practiceRow() => Container(
        padding: const EdgeInsets.all(S.sm),
        decoration: BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl, boxShadow: shadowSm, border: Border.all(color: C.surfaceHighest, width: 2)),
        child: Row(children: [
          const Tag('PRACTICE', icon: Symbols.science, bg: C.secondaryContainer, fg: C.onSecondaryContainer),
          const SizedBox(width: 8),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Practice Drill', style: T.labelMd), Text('Fictional patients only', style: T.labelSm.c(C.onSurfaceVariant))])),
        ]),
      );

  Widget _noteBox(IconData i, String t) => Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: C.secondaryContainer.withValues(alpha: 0.4), borderRadius: R.rBase),
        child: Row(children: [Ic(i, size: 18, color: C.secondary), const SizedBox(width: 8), Expanded(child: Text(t, style: T.bodySm))]),
      );

  Widget _viewButton(String v, IconData i, String text) => Expanded(
        child: Tap(
          label: text,
          selected: _view == v,
          expand: true,
          onTap: () => setState(() => _view = v),
          child: Container(
            constraints: const BoxConstraints(minHeight: 40),
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(color: _view == v ? C.surfaceLowest : null, borderRadius: R.rBase, boxShadow: _view == v ? shadowSm : null),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Ic(i, size: 18, color: _view == v ? C.primary : C.onSurfaceVariant),
              const SizedBox(width: 6),
              Flexible(child: Text(text, style: T.labelMd.c(_view == v ? C.primary : C.onSurfaceVariant))),
            ]),
          ),
        ),
      );

  Widget _controls(int n) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg),
          child: Row(children: [_viewButton('front', Symbols.accessibility_new, 'Anterior (Front)'), _viewButton('back', Symbols.man, 'Posterior (Back)')]),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Row(children: [
            const Ic(Symbols.filter_list, size: 18, color: C.secondary),
            const SizedBox(width: 6),
            Expanded(child: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [Text('View Filter:', style: T.labelSm.c(C.onSurfaceVariant)), Text('Active Findings ($n)', style: T.labelMd)])),
            Tap(
              label: _taggedOnly ? 'Showing tagged only. Show all findings' : 'Showing all findings. Show tagged only',
              onTap: () => setState(() => _taggedOnly = !_taggedOnly),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.36),
                decoration: BoxDecoration(color: _taggedOnly ? C.secondaryContainer : C.surfaceHighest, borderRadius: R.rBase),
                child: Text(_taggedOnly ? 'Showing Tagged Only' : 'Showing All Findings', style: T.labelSm.semi.c(_taggedOnly ? C.onSecondaryContainer : C.onSurfaceVariant), textAlign: TextAlign.center),
              ),
            ),
          ]),
        ),
      ]);

  Widget _canvas(AppState a, List<_Group> groups, List<_Site> sites) {
    const h = 340.0, s = h / kArtHeight;
    final marks = <(String key, BodyRegion region, String view, _Kind kind, String label, IconData icon, bool saved)>[
      for (final g in groups) (g.key, g.region, g.view, g.kind, g.kind.id.toUpperCase(), g.kind.icon, true),
      for (final p in _pending) if (regionById(p.regionId) != null) (p.key, regionById(p.regionId)!, p.view, _kindOf(p.kind), 'NOT SAVED', _kindOf(p.kind).icon, false),
      for (final x in sites) ('site-${x.x.entry.id}', x.region, x.region.primary, x.iv ? _kinds[0] : _kinds[2], x.iv ? 'IV SITE' : 'INJECTION', x.iv ? Symbols.water_drop : Symbols.vaccines, true),
    ];
    final here = [for (final m in marks) if (m.$3 == _view) m];
    final away = marks.length - here.length;
    final sel = regionById(_region);
    final onSel = sel == null ? 0 : marks.where((m) => m.$2.id == sel.id && m.$7).length;
    final title = sel != null
        ? 'SELECTED: ${sel.label.toUpperCase()} — ${onSel == 0 ? 'NOTHING RECORDED' : '$onSel ON RECORD'}'
        : _view == 'front'
            ? 'ANTERIOR VIEW — TAP MARKERS FOR DETAILS'
            : 'POSTERIOR VIEW — TAP MARKERS FOR DETAILS';
    final (l, r) = _view == 'front' ? ('Patient\'s\nright', 'Patient\'s\nleft') : ('Patient\'s\nleft', 'Patient\'s\nright');
    final hasOther = marks.any((m) => m.$4.id == 'other');
    return Box(
      shadow: true,
      child: Column(children: [
        Row(children: [
          Expanded(child: Text(title, key: const ValueKey('body-title'), style: T.badge.c(C.secondary))),
          const SizedBox(width: 8),
          const Ic(Symbols.fiber_manual_record, size: 16, color: C.tertiaryFixedDim, fill: 1),
          const SizedBox(width: 4),
          ConstrainedBox(constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.36), child: Text('${here.length} Marker${here.length == 1 ? '' : 's'}${away > 0 ? ' • $away on ${_view == 'front' ? 'back' : 'front'}' : ''}', style: T.bodySm.c(C.onSurfaceVariant))),
        ]),
        const SizedBox(height: 4),
        LayoutBuilder(builder: (context, box) {
          final w = box.maxWidth, left = (w - kArtWidth * s) / 2;
          // Several markers on one region: fan out sideways.
          final used = <String, int>{};
          return SizedBox(
            height: h,
            child: Stack(clipBehavior: Clip.none, children: [
              Positioned(
                left: left,
                top: 0,
                width: kArtWidth * s,
                height: h,
                child: Semantics(
                  label: '${_view == 'front' ? 'Front' : 'Back'} of the body. Tap a region, or use Tag new region to choose it from a list.',
                  child: GestureDetector(
                    key: const ValueKey('body-figure'),
                    behavior: HitTestBehavior.opaque,
                    onTapUp: (d) {
                      final hit = regionAt(_view, d.localPosition / s);
                      setState(() => _region = hit?.id == _region ? null : hit?.id);
                    },
                    child: CustomPaint(painter: _FigurePainter(_view, sel?.zones[_view], s)),
                  ),
                ),
              ),
              Positioned(left: 0, top: 0, child: Text(l, style: T.labelSm.semi.c(C.secondary))),
              Positioned(right: 0, top: 0, child: Text(r, style: T.labelSm.semi.c(C.secondary), textAlign: TextAlign.end)),
              for (final m in here)
                () {
                  final zone = m.$2.zones[_view] ?? m.$2.zones.values.first;
                  final n = used.update(m.$2.id, (v) => v + 1, ifAbsent: () => 0);
                  return _marker(m, Offset(left + zone.anchor.dx * s + n * 18, zone.anchor.dy * s), w, zone.anchor.dx, showLabel: n == 0);
                }(),
            ]),
          );
        }),
        const SizedBox(height: 4),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Wrap(alignment: WrapAlignment.spaceAround, spacing: 8, runSpacing: 4, children: [
            for (final k in _kinds)
              if (k.id != 'other' || hasOther) Row(mainAxisSize: MainAxisSize.min, children: [Dot(k.color, size: 10), const SizedBox(width: 4), Text(k.legend, style: T.labelSm.c(C.onSurfaceVariant))]),
          ]),
        ),
      ]),
    );
  }

  Widget _marker((String, BodyRegion, String, _Kind, String, IconData, bool) m, Offset at, double width, double ax, {required bool showLabel}) {
    final k = m.$4;
    final pill = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: k.id == 'line' ? C.primary : k.color, borderRadius: R.rBase, boxShadow: shadowSm),
      child: Text(m.$5, style: T.badge.c(k.id == 'line' ? C.onPrimary : k.fg), maxLines: 1, overflow: TextOverflow.ellipsis),
    );
    final dot = Tap(
      label: '${m.$2.label}: ${m.$5}',
      onTap: () => _openCard(m.$1),
      child: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(color: k.color, shape: BoxShape.circle, border: Border.all(color: C.surfaceLowest, width: 2), boxShadow: [BoxShadow(color: k.soft.withValues(alpha: 0.9), spreadRadius: 3), ...shadowMd]),
        child: Ic(m.$6, size: 16, color: k.fg),
      ),
    );
    return Positioned(
      left: 0,
      right: 0,
      top: at.dy - 24,
      height: 48,
      child: Stack(clipBehavior: Clip.none, children: [
        if (showLabel)
          ax < 119
              ? Positioned(right: width - at.dx + 18, top: 0, bottom: 0, width: (at.dx - 18).clamp(0, 400), child: IgnorePointer(child: Align(alignment: Alignment.centerRight, child: pill)))
              : ax > 121
                  ? Positioned(left: at.dx + 18, top: 0, bottom: 0, width: (width - at.dx - 18).clamp(0, 400), child: IgnorePointer(child: Align(alignment: Alignment.centerLeft, child: pill)))
                  : Positioned(left: 0, right: 0, top: -12, child: IgnorePointer(child: Center(child: pill))),
        Positioned(left: at.dx - 24, top: 0, child: dot),
      ]),
    );
  }

  Widget _cardShell(String key, {required _Kind kind, IconData? icon, required String title, required String tag, required Color tagBg, required Color tagFg, required String sub, required List<Widget> body, Widget? action}) {
    final open = !_closed.contains(key);
    return Container(
      key: _cards.putIfAbsent(key, GlobalKey.new),
      child: Box(
        shadow: true,
        color: _flash == key ? C.secondaryContainer : C.surfaceLowest,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(margin: const EdgeInsets.only(top: 4), width: 36, height: 36, decoration: BoxDecoration(color: kind.soft, borderRadius: R.rLg), child: Ic(icon ?? kind.icon, size: 22, color: kind.softFg)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 8, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [Text(title, style: T.headlineSm), Tag(tag, bg: tagBg, fg: tagFg, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 1))]),
                Text(sub, style: T.bodySm.c(C.onSurfaceVariant)),
              ]),
            ),
            action ?? Tap(label: open ? 'Hide details of $title' : 'Show details of $title', onTap: () => setState(() => open ? _closed.add(key) : _closed.remove(key)), child: Ic(open ? Symbols.expand_less : Symbols.expand_more, size: 22, color: C.onSurfaceVariant)),
          ]),
          if (open) ...body,
        ]),
      ),
    );
  }

  Widget _cell(String k, String v, String? sub, {bool center = false}) => Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Column(crossAxisAlignment: center ? CrossAxisAlignment.center : CrossAxisAlignment.start, children: [
            Text(k, style: T.labelSm.c(C.onSurfaceVariant), textAlign: center ? TextAlign.center : TextAlign.start),
            Text(v, style: T.bodyMd.semi, textAlign: center ? TextAlign.center : TextAlign.start),
            if (sub != null) Text(sub, style: T.labelSm.c(C.secondary), textAlign: center ? TextAlign.center : TextAlign.start),
          ]),
        ),
      );

  Widget _metrics(List<Widget> cells) => Padding(
        padding: const EdgeInsets.only(top: S.sm),
        child: Box(color: C.surfaceLow, radius: R.lg, pad: const EdgeInsets.all(4), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: cells)),
      );

  Widget _findingCard(AppState a, _Group g) {
    final now = g.now, e = now.tip.entry;
    final today = e.careTime.substring(0, 10) == a.nowIso.substring(0, 10);
    final when = '${hm(e.careTime)} ${today ? 'Today' : dayLabel(e.careTime)}';
    final by = 'by ${staffShort(a.store, e.performerId)}';
    final side = g.region.side == null ? 'Centre' : g.region.side == 'left' ? 'Left' : 'Right';
    final view = g.view == 'front' ? 'Front' : 'Back';
    final n = '${g.all.length} record${g.all.length == 1 ? '' : 's'}';
    final reassess = Btn(g.kind.id == 'wound' ? 'Log Skin Reassessment' : g.kind.id == 'line' ? 'Assess Line Again' : 'Reassess',
        key: ValueKey('reassess-${g.key}'), icon: g.kind.id == 'line' ? Symbols.vaccines : Symbols.edit_note, iconSize: 18, kind: BtnKind.primary, bg: g.kind.id == 'wound' ? C.primary : C.secondary, height: 40, onTap: _nurse ? () => _tag(again: g) : null);
    return _cardShell(
      g.key,
      kind: g.kind,
      title: '${_titleCase(g.region.label)} ${g.kind.id == 'wound' ? 'Skin' : g.kind.id == 'other' ? 'Finding' : g.kind.label}',
      tag: g.kind.id.toUpperCase(),
      tagBg: g.kind.id == 'wound' ? C.error : g.kind.id == 'line' ? C.tertiaryFixed : C.surfaceHighest,
      tagFg: g.kind.id == 'wound' ? C.onError : g.kind.id == 'line' ? C.onTertiaryFixed : C.onSurfaceVariant,
      sub: '$side • $view view • Recorded $when',
      body: [
        _metrics(g.kind.id == 'device' ? [_cell('Recorded', hm(e.careTime), by, center: true), _cell('Side', side, 'of the patient', center: true), _cell('History', n, view, center: true)] : [_cell('Last Recorded', when, by), _cell('Patient\'s Side', side, '$view view')]),
        const SizedBox(height: S.sm),
        Text('Recorded note:', style: T.labelMd),
        const SizedBox(height: 6),
        Container(width: double.infinity, padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rBase), child: Text(now.text, style: T.bodySm)),
        if (g.kind.id == 'wound') ...[
          const SizedBox(height: S.sm),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: C.secondaryContainer.withValues(alpha: 0.4), borderRadius: R.rBase),
            child: Row(children: [
              const Ic(Symbols.history, size: 18, color: C.secondary),
              const SizedBox(width: 8),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('$n for this region', style: T.labelMd), Text('A reassessment is a new note. Older notes stay.', style: T.bodySm.c(C.onSurfaceVariant))])),
              Tap(label: 'History of ${g.region.label}', onTap: () => _history(g), child: Text('History', style: T.labelMd.c(C.secondary))),
            ]),
          ),
        ],
        const SizedBox(height: S.md),
        Row(children: [
          Expanded(child: reassess),
          const SizedBox(width: 4),
          if (g.kind.id == 'wound')
            Unavailable(reason: 'Care plans are not stored in this app. Use your unit\'s care plan.', child: IntrinsicWidth(child: Btn('Care Plan', kind: BtnKind.quiet, height: 40, onTap: () {})))
          else
            IntrinsicWidth(child: Btn('History', kind: BtnKind.quiet, height: 40, onTap: () => _history(g))),
        ]),
      ],
    );
  }

  Widget _pendingCard(AppState a, _Pending p) {
    final r = regionById(p.regionId), k = _kindOf(p.kind);
    return _cardShell(
      p.key,
      kind: k,
      title: '${_titleCase(r?.label ?? p.regionId)} ${k.id == 'wound' ? 'Skin' : k.id == 'other' ? 'Finding' : k.label}',
      tag: 'NOT SAVED',
      tagBg: C.errorContainer,
      tagFg: C.onErrorContainer,
      sub: '${p.view == 'front' ? 'Front' : 'Back'} view • ${hm(p.careTime)} • ${a.user?.title ?? ''}',
      action: Tap(label: 'Remove ${r?.label}', onTap: _busy ? null : () => _remove(p), child: const Ic(Symbols.delete, size: 22, color: C.onSurfaceVariant)),
      body: [const SizedBox(height: S.sm), Container(width: double.infinity, padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rBase), child: Text(p.text, style: T.bodySm))],
    );
  }

  Widget _siteCard(AppState a, _Site s) {
    final m = s.x.med, e = s.x.entry;
    return _cardShell(
      'site-${e.id}',
      kind: s.iv ? _kinds[0] : _kinds[2],
      icon: s.iv ? Symbols.water_drop : Symbols.vaccines,
      title: m.site!,
      tag: 'FROM MEDICINES',
      tagBg: C.surfaceHighest,
      tagFg: C.onSurfaceVariant,
      sub: 'Named on a medicine record • Read only',
      body: [
        _metrics([_cell('Newest Record', '${m.drugName} ${kEventLabel[m.event]?.toLowerCase() ?? m.event}', null), _cell('Recorded', dateTimeLabel(e.careTime), 'by ${staffShort(a.store, e.performerId)}')]),
        const SizedBox(height: S.md),
        Btn('Open Medicine Record', kind: BtnKind.quiet, height: 40, onTap: () => Go.entry(context, widget.patientId, e.id)),
      ],
    );
  }

  Widget _photos(AppState a) {
    final rows = a.store.where('m_photo', 'patient_id', widget.patientId).reversed.toList();
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Ic(Symbols.photo_camera, size: 20, color: C.secondary),
          const SizedBox(width: 8),
          Expanded(child: Text('Offline Photo Archive', style: T.headlineSm)),
          Text('${rows.length} Encrypted', style: T.labelSm.semi.c(C.onTertiaryContainer)),
        ]),
        const SizedBox(height: 8),
        if (rows.isEmpty)
          Container(
            height: 112,
            alignment: Alignment.center,
            decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rLg),
            child: Text('No photo is kept for this patient.', style: T.bodySm.c(C.onSurfaceVariant), textAlign: TextAlign.center),
          )
        else
          LayoutBuilder(builder: (context, box) => Wrap(spacing: 4, runSpacing: 4, children: [for (final r in rows) SizedBox(width: (box.maxWidth - 4) / 2, child: _thumb(a, r))])),
      ]),
    );
  }

  Widget _thumb(AppState a, Doc r) {
    final bytes = a.store.photoBytes('${r['id']}');
    final name = 'Paper ${dateTimeLabel(r['saved_at'] as String?)}';
    return Tap(
      label: 'Open photo, $name',
      expand: true,
      onTap: bytes == null
          ? null
          : () => showDialog<void>(
                context: context,
                barrierColor: C.primaryContainer.withValues(alpha: 0.9),
                builder: (x) => Dialog(
                  backgroundColor: C.surfaceLowest,
                  shape: const RoundedRectangleBorder(borderRadius: R.rXl),
                  insetPadding: const EdgeInsets.all(S.md),
                  child: Padding(
                    padding: const EdgeInsets.all(S.md),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Text('$name • ${verifyPhoto(a.store, '${r['id']}') ? 'same bytes as saved' : 'bytes differ from the saved fingerprint'}', style: T.bodySm),
                      const SizedBox(height: 8),
                      Flexible(child: InteractiveViewer(maxScale: 5, child: Image.memory(bytes, fit: BoxFit.contain, cacheWidth: 2400))),
                      const SizedBox(height: 8),
                      Btn('Close', kind: BtnKind.quiet, onTap: () => Navigator.pop(x)),
                    ]),
                  ),
                ),
              ),
      child: ClipRRect(
        borderRadius: R.rLg,
        child: SizedBox(
          height: 112,
          child: Stack(fit: StackFit.expand, children: [
            const ColoredBox(color: C.surfaceContainer),
            if (bytes != null) Image.memory(bytes, fit: BoxFit.cover, cacheWidth: 480, errorBuilder: (_, __, ___) => const Center(child: Ic(Symbols.broken_image, size: 24, color: C.slate))),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.all(6),
                color: C.primary.withValues(alpha: 0.8),
                child: Row(children: [Expanded(child: Text(name, style: T.labelSm.c(C.onPrimary), maxLines: 1, overflow: TextOverflow.ellipsis)), const Ic(Symbols.lock, size: 14, color: C.onPrimary)]),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Figure in the greys of the design: silhouette, detail lines, dashed region borders, selected region.
class _FigurePainter extends CustomPainter {
  final String view;
  final BodyZone? selected;
  final double scale;
  const _FigurePainter(this.view, this.selected, this.scale);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(scale);
    final fill = Paint()..shader = const RadialGradient(center: Alignment(0, -0.2), radius: 0.6, colors: [Color(0xFFECEEF0), Color(0xFFE1E2E5)]).createShader(const Rect.fromLTWH(0, 0, kArtWidth, kArtHeight));
    final edge = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..strokeJoin = StrokeJoin.round
      ..color = const Color(0xFFC5C6CD);
    for (final p in kShapes.values) {
      canvas.drawPath(p, edge);
    }
    for (final p in kShapes.values) {
      canvas.drawPath(p, fill);
    }
    if (selected != null) {
      canvas.drawPath(selected!.path, Paint()..color = C.secondaryContainer);
      canvas.drawPath(
          selected!.path,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = C.secondary);
    }
    final line = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..strokeCap = StrokeCap.round
      ..color = const Color(0xFFC5C6CD);
    for (final p in view == 'front' ? kFrontDetail : kBackDetail) {
      canvas.drawPath(p, line);
    }
    final dash = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.9
      ..color = const Color(0xFFB3B6BF);
    for (final p in view == 'front' ? kFrontDividers : kBackDividers) {
      for (final PathMetric m in p.computeMetrics()) {
        for (var d = 0.0; d < m.length; d += 5) {
          canvas.drawPath(m.extractPath(d, d + 2.4), dash);
        }
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_FigurePainter old) => old.view != view || old.selected != selected || old.scale != scale;
}

/// Region, kind and text of one finding. Pops with (region id, view, kind, text); nothing is saved here.
class _TagSheet extends StatefulWidget {
  final String view;
  final String? regionId, kind;

  /// Reassessment: region and kind stay the same.
  final bool again;
  const _TagSheet({required this.view, this.regionId, this.kind, this.again = false});
  @override
  State<_TagSheet> createState() => _TagSheetState();
}

class _TagSheetState extends State<_TagSheet> {
  late String? _region = widget.regionId;
  late String? _kind = widget.kind;
  late bool _list = widget.regionId == null;
  final _text = TextEditingController();
  String? _err;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  String _viewFor(BodyRegion r) => r.zones.containsKey(widget.view) ? widget.view : r.primary;

  void _add() {
    final r = regionById(_region);
    final e = r == null ? 'Choose the body region.' : _kind == null ? 'Choose what kind of finding it is.' : _text.text.trim().isEmpty ? 'Write what you found.' : null;
    if (e != null) return setState(() => _err = e);
    Navigator.pop(context, (r!.id, _viewFor(r), _kind!, _text.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final r = regionById(_region);
    final all = [...regionsInView(widget.view), for (final x in kRegions) if (!x.zones.containsKey(widget.view)) x];
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _sheetTop(context, widget.again ? 'Reassess ${r?.label ?? ''}' : 'Tag New Region'),
      Text('Left and right are the patient\'s own left and right.', style: T.bodySm.c(C.onSurfaceVariant)),
      const SizedBox(height: 12),
      Text('Body region', style: T.labelSm),
      const SizedBox(height: 4),
      Tap(
        label: r == null ? 'Choose body region' : 'Body region ${r.label}',
        expand: true,
        onTap: widget.again ? null : () => setState(() => _list = !_list),
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Row(children: [
            const Ic(Symbols.pin_drop, size: 20, color: C.secondary),
            const SizedBox(width: 8),
            Expanded(child: Text(r == null ? 'Choose a region' : '${r.label} (${_viewFor(r)} view)', style: T.bodyMd.semi)),
            if (!widget.again) Ic(_list ? Symbols.expand_less : Symbols.expand_more, size: 22, color: C.onSurfaceVariant),
          ]),
        ),
      ),
      if (_list)
        Container(
          height: 200,
          margin: const EdgeInsets.only(top: 4),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: ListView(padding: const EdgeInsets.symmetric(horizontal: 12), children: [
            for (final x in all)
              Tap(
                label: x.label,
                selected: x.id == _region,
                expand: true,
                onTap: () => setState(() {
                  _region = x.id;
                  _list = false;
                  _err = null;
                }),
                child: Row(children: [Expanded(child: Text(x.label, style: T.bodyMd.w(x.id == _region ? FontWeight.w700 : FontWeight.w400))), Text('${_viewFor(x)} view', style: T.labelSm.c(C.onSurfaceVariant))]),
              ),
          ]),
        ),
      const SizedBox(height: 12),
      Text('Kind', style: T.labelSm),
      Wrap(spacing: 8, children: [
        for (final k in _kinds)
          if (!widget.again || k.id == widget.kind)
            Tap(
              label: k.label,
              selected: _kind == k.id,
              onTap: widget.again
                  ? null
                  : () => setState(() {
                        _kind = k.id;
                        _err = null;
                      }),
              child: Container(
                constraints: const BoxConstraints(minHeight: 40),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(color: _kind == k.id ? k.color : C.surfaceHigh, borderRadius: R.rLg),
                child: Row(mainAxisSize: MainAxisSize.min, children: [Ic(k.icon, size: 18, color: _kind == k.id ? k.fg : C.onSurfaceVariant), const SizedBox(width: 6), Text(k.label, style: T.labelMd.c(_kind == k.id ? k.fg : C.onSurfaceVariant))]),
              ),
            ),
      ]),
      const SizedBox(height: 12),
      Text('What you found', style: T.labelSm),
      const SizedBox(height: 4),
      Container(constraints: const BoxConstraints(minHeight: 72), padding: const EdgeInsets.all(12), decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg), child: Field(_text, label: 'What you found', hint: 'Write only what you see', minLines: 2, maxLines: 6, maxLength: 600)),
      if (_err != null) ...[const SizedBox(height: 8), _error(_err!)],
      const SizedBox(height: 16),
      Btn(widget.again ? 'Add Reassessment' : 'Add To Map', key: const ValueKey('tag-add'), icon: Symbols.add_circle, radius: R.xl, onTap: _add),
      const SizedBox(height: 8),
      Btn('Cancel', kind: BtnKind.quiet, radius: R.xl, onTap: () => Navigator.pop(context)),
    ]);
  }
}
