import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../../config/policy.dart';
import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/audit.dart';
import '../../data/repos/ops.dart' as ops;
import '../../data/schema.dart';
import '../../data/store.dart';
import '../../domain/facts.dart';
import '../../domain/meds.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';
import 'admin_nav.dart';

const _mint = Color(0xFF8AD6AF), _mintText = Color(0xFFA6F3CA), _brown = Color(0xFF7D510D), _sand = Color(0xFFFAEDD9), _cream = Color(0xFFFEF7EE), _greenBg = Color(0xFFE8F5EE);
const _amber100 = Color(0xFFFEF3C7), _amber200 = Color(0xFFFDE68A), _amber300 = Color(0xFFFCD34D), _amber400 = Color(0xFFFBBF24), _amber900 = Color(0xFF78350F), _slate200 = Color(0xFFE2E8F0), _slate300 = Color(0xFFCBD5E1);

String _err(Object e) => e is AppError ? e.message : 'This did not work: $e';

/// Readiness "Declare Network Restoration" opens the checklist at its clearance part.
bool _openAtClearance = false;

Widget _blank() => const ColoredBox(color: C.surface);

/// Large text: things that sit side by side go under each other.
bool _big(BuildContext c) => MediaQuery.textScalerOf(c).scale(100) > 120;

String _size(num bytes) {
  if (bytes >= 1073741824) return '${(bytes / 1073741824).toStringAsFixed(1)} GB';
  return '${(bytes / 1048576).toStringAsFixed(1)} MB';
}

/// Real checks of the local records. Nothing is repaired or changed.
class _Integrity {
  final ChainResult chain;
  final String database;
  final List<String> pages;
  final String at;
  const _Integrity(this.chain, this.database, this.pages, this.at);
  bool get ok => chain.ok && database == 'ok' && pages.isEmpty;
  String get text => [
        chain.ok ? 'Change log: ${chain.verified} of ${chain.total} rows in order' : 'Change log: order broken at row ${chain.brokenAtSeq}',
        'database structure: $database',
        pages.isEmpty ? 'encrypted pages: all authentic' : 'encrypted pages: ${pages.length} problem${pages.length == 1 ? '' : 's'}',
      ].join(' • ');
  static _Integrity run(Store s, String at) => _Integrity(verifyChain(s.all('audit_log')), s.integrity(), s.cipherIntegrity(), at);
}

Future<void> _startOutage(BuildContext context, AppState app) async {
  final open = app.downtime;
  final yes = await confirm(context,
      title: 'Start a practice outage?',
      text: '${open == null ? '' : 'The open practice outage (${open.id}) is closed. '}A new practice outage starts now on this phone. Saved records stay. No hospital system is touched and nothing is sent.',
      yes: 'Start practice outage');
  if (!yes || !context.mounted) return;
  try {
    final id = ops.startPracticeOutage(app.ctx());
    app.saved();
    toast(context, 'Practice outage started: $id');
  } catch (e) {
    toast(context, _err(e), icon: Symbols.error, error: true);
  }
}

/* ------------------------------ Readiness ------------------------------ */

class ReadinessScreen extends StatefulWidget {
  const ReadinessScreen({super.key});
  @override
  State<ReadinessScreen> createState() => _ReadinessScreenState();
}

class _ReadinessScreenState extends State<ReadinessScreen> {
  (int, int)? _storage;
  bool? _network;
  bool _busy = false;
  String? _checkError;
  _Integrity? _check;
  ChainResult? _chain;
  int _chainVersion = -1;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 20), (_) => mounted ? setState(() {}) : null);
    _readPhone();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _readPhone() async {
    final n = AppScope.read(context).native;
    (int, int)? s;
    bool? net;
    try {
      s = await n.storage();
    } catch (_) {}
    try {
      net = await n.networkConnected();
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _storage = s;
      _network = net;
    });
  }

  Future<void> _verify(AppState app) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _checkError = null;
    });
    await Future<void>.delayed(const Duration(milliseconds: 20));
    if (!mounted) return;
    try {
      final r = _Integrity.run(app.store, app.nowIso);
      setState(() {
        _busy = false;
        _check = r;
      });
      toast(context, r.ok ? 'Check finished. ${r.text}' : 'Problem found. ${r.text}', icon: r.ok ? Symbols.check_circle : Symbols.error, error: !r.ok);
    } catch (e) {
      setState(() {
        _busy = false;
        _check = null;
        _checkError = _err(e);
      });
      toast(context, 'The check did not finish: ${_err(e)}', icon: Symbols.error, error: true);
    }
    _readPhone();
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn || !app.user!.isAdmin) return _blank();
    final s = app.store, now = app.nowIso, ev = app.downtime, phase = app.phase;
    if (_chainVersion != app.dataVersion || _chain == null) {
      _chain = verifyChain(s.all('audit_log'));
      _chainVersion = app.dataVersion;
    }
    final chain = _chain!;
    final all = [for (final e in s.all('entry')) Entry(e)];
    final live = [for (final e in all) if (e.status == 'confirmed' || e.status == 'draft') e];
    int n(String type) => live.where((e) => e.type == type).length;
    final drafts = all.where((e) => e.isDraft).length;
    final patients = s.count('patient');
    final staff = s.all('practitioner').where((p) => p['active'] == true).length;
    final snap = s.all('snapshot').firstOrNull;
    final taken = snap?['taken_at'] as String?;
    var high = 0, checked = 0;
    for (final e in all) {
      if (e.type != 'med_admin' || !e.isConfirmed) continue;
      final m = s.where('med_admin', 'entry_id', e.id).map(MedAdmin.new).firstOrNull;
      if (m == null || !needsSecondNurse(m.drugName, m.event)) continue;
      high++;
      if (m.doubleChecked) checked++;
    }
    final rows = [
      (Symbols.verified, 'High-Alert Records With a Second Nurse', high == 0 ? 'No high-alert record on this phone yet' : '$checked of $high high-alert records on this phone have a second-nurse check', checked == high),
      (Symbols.rule_folder, 'All Drafts Handled', drafts == 0 ? 'No draft is waiting for a nurse' : '$drafts draft${drafts == 1 ? '' : 's'} still waiting for a nurse to check and confirm', drafts == 0),
    ];
    final met = rows.where((r) => r.$4).length;

    return PhonePage(
      statusColor: C.primaryContainer,
      nav: const AdminNav(active: 0),
      pad: const EdgeInsets.fromLTRB(S.lg, 5, S.lg, S.xl),
      gap: S.md,
      header: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          color: C.primaryContainer,
          padding: const EdgeInsets.symmetric(horizontal: S.lg, vertical: 6),
          child: Row(children: [
            const Dot(_mint),
            const SizedBox(width: 8),
            Expanded(child: Text('PRACTICE • ENCRYPTED RECORDS', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.badge.c(_mintText))),
            const SizedBox(width: 8),
            Text('${all.length} RECORDS', style: T.mono(11, line: 14).c(C.onPrimaryContainer).tr(0.02)),
            const SizedBox(width: 6),
            const Ic(Symbols.lock, size: 15, color: _mint),
          ]),
        ),
        Container(
          constraints: const BoxConstraints(minHeight: 56),
          decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0A000000), offset: Offset(0, 1), blurRadius: 8)]),
          padding: const EdgeInsets.only(left: S.lg, right: 8),
          child: Row(children: [
            Expanded(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Flexible(child: Text('ClinBridge Admin', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.headlineSm.s(17, 21))),
                  const SizedBox(width: 8),
                  Tag('ADMIN', bg: C.tertiaryContainer, fg: _mintText, style: T.badge.s(10, 20), pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                ]),
                Text('Admin Readiness Dashboard', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(C.secondary)),
              ]),
            ),
            Tap(label: 'Check the records now', onTap: _busy ? null : () => _verify(app), child: const Ic(Symbols.verified_user, size: 22, color: C.secondary)),
            Tap(
              label: 'My account and more',
              onTap: () => Go.more(context),
              child: Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull), child: const Ic(Symbols.admin_panel_settings, size: 18, color: C.onPrimary)),
            ),
          ]),
        ),
      ]),
      children: [
        _incident(app, ev, phase, staff, all.length),
        if (drafts > 0) _pending(drafts),
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(children: [
              const Ic(Symbols.monitor_heart, size: 20, color: C.secondary),
              const SizedBox(width: 6),
              Expanded(flex: 4, child: Text('System Health & Readiness Matrix', style: T.headlineSm.bold)),
              const SizedBox(width: 8),
              Flexible(child: Text('READ ${hm(now)}', style: T.mono(11, line: 14).c(C.secondary).tr(0.02))),
            ]),
          ),
          const SizedBox(height: 8),
          _pair(_storageTile(s), _vaultTile(all.length, n, drafts)),
          const SizedBox(height: 8),
          _networkTile(phase),
          const SizedBox(height: 8),
          _pair(
            _tile('Census Snapshot', Symbols.groups, '$patients', 'PATIENTS', taken == null ? 'Snapshot time not recorded' : 'Snapshot age: ${elapsedHm(taken, now)} ago', _tileFoot(Symbols.history, taken == null ? 'Not recorded' : 'Taken ${hm(taken)}, ${dayLabel(taken).substring(0, dayLabel(taken).length - 5)}')),
            _tile('Practice Clock', Symbols.schedule, hm(now), 'LOCAL', 'Scenario, ${dayLabel(now)}', _tileFoot(Symbols.lock_clock, 'Not the phone clock')),
          ),
          const SizedBox(height: 8),
          _ledger(app, chain),
        ]),
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(children: [
              Expanded(flex: 3, child: Text('Readiness Verification Checklist', style: T.headlineSm.bold)),
              const SizedBox(width: 8),
              Flexible(child: Text('$met of ${rows.length} Met', style: T.labelSm.c(C.secondary))),
            ]),
          ),
          for (var i = 0; i < rows.length; i++) ...[
            const SizedBox(height: 8),
            _row(rows[i].$1, rows[i].$2, rows[i].$3, rows[i].$4),
            if (i == 0) ...[
              const SizedBox(height: 8),
              Unavailable(reason: 'There are no copies on other phones. The records stay on this phone only.', child: _row(Symbols.phonelink_ring, 'Copies on Other Phones', 'Not available: the records stay on this phone, nothing is mirrored', null)),
            ],
          ],
        ]),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const Ic(Symbols.build_circle, size: 20, color: C.secondary),
                const SizedBox(width: 6),
                Expanded(child: Text('Incident Operations Controls', style: T.headlineSm.bold)),
              ]),
              const SizedBox(height: 12),
              Btn('Downtime Incident Protocol Checklist', kind: BtnKind.navy, radius: R.lg, icon: Symbols.fact_check, onTap: () => Go.checklist(context)),
              const SizedBox(height: 8),
              Btn(
                'Declare Network Restoration',
                kind: BtnKind.quiet,
                bg: C.surfaceContainer,
                radius: R.lg,
                icon: Symbols.wifi_protected_setup,
                iconColor: C.secondary,
                onTap: phase != ops.Phase.down
                    ? null
                    : () {
                        _openAtClearance = true;
                        Go.checklist(context);
                      },
                reason: phase == ops.Phase.online ? 'This phone is already Back online (Practice).' : 'No practice outage is open.',
              ),
              if (phase != ops.Phase.down) ...[
                const SizedBox(height: 8),
                Btn('Start a Practice Outage', kind: BtnKind.quiet, bg: C.surfaceContainer, radius: R.lg, icon: Symbols.play_circle, iconColor: C.secondary, onTap: () => _startOutage(context, app)),
              ],
              const SizedBox(height: 12),
              Tap(
                label: _check == null ? 'Force integrity check of the records' : 'Check again',
                onTap: _busy ? null : () => _verify(app),
                expand: true,
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  if (_busy)
                    const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: C.primary))
                  else
                    Ic(_checkError != null || _check?.ok == false ? Symbols.error : (_check == null ? Symbols.published_with_changes : Symbols.check_circle), size: 18, color: _checkError != null || _check?.ok == false ? C.error : C.saved),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      _busy ? 'Checking the records…' : (_checkError != null ? 'Check failed. Check again' : (_check == null ? 'Force Integrity Check' : (_check!.ok ? '${_check!.chain.verified} rows verified ${hm(_check!.at)}. Check again' : 'Problem found ${hm(_check!.at)}. Check again'))),
                      style: T.labelMd.c(_checkError != null || _check?.ok == false ? C.error : (_check == null ? C.secondary : C.saved)),
                    ),
                  ),
                ]),
              ),
            ]),
          ),
        ),
      ],
    );
  }

  Widget _incident(AppState app, DowntimeEvent? ev, ops.Phase phase, int staff, int records) {
    final live = phase == ops.Phase.down;
    Widget tag(String t, Color bg, Color fg, {IconData? icon}) => Tag(t, bg: bg, fg: fg, icon: icon);
    Widget pill(String label, String value, Color valueColor, IconData icon, Color iconBg, Color iconColor) => Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: C.surfaceHighest.withValues(alpha: 0.1), borderRadius: R.rLg),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                Text(label, style: T.labelSm.c(C.onPrimaryContainer)),
                Text(value, style: T.headlineSm.c(valueColor)),
              ]),
            ),
            Container(width: 32, height: 32, alignment: Alignment.center, decoration: BoxDecoration(color: iconBg, borderRadius: R.rFull), child: Ic(icon, size: 18, color: iconColor)),
          ]),
        );
    Widget fact(IconData icon, String label, String value) => Row(mainAxisSize: MainAxisSize.min, children: [
          Ic(icon, size: 15, color: C.onPrimaryContainer),
          const SizedBox(width: 4),
          Text(label, style: T.bodySm.c(C.onPrimaryContainer)),
          const SizedBox(width: 4),
          Flexible(child: Text(value, style: T.bodySm.bold.c(C.onPrimary))),
        ]);
    return Container(
      padding: const EdgeInsets.all(S.md),
      decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowMd),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_big(context) || MediaQuery.sizeOf(context).width < 380)
          Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
            tag(ev == null ? 'NO OPEN INCIDENT' : 'INCIDENT ${ev.id.toUpperCase()}', C.caution.withValues(alpha: 0.2), C.secondaryFixed),
            tag('PRACTICE DRILL', C.tertiaryContainer, _mintText, icon: Symbols.school),
            Text(live ? 'LIVE DRILL' : (phase == ops.Phase.online ? 'BACK ONLINE' : 'NO DRILL'), style: T.labelMd.c(C.onPrimary)),
          ])
        else Row(children: [
          Flexible(flex: 5, child: tag(ev == null ? 'NO OPEN INCIDENT' : 'INCIDENT ${ev.id.toUpperCase()}', C.caution.withValues(alpha: 0.2), C.secondaryFixed)),
          const SizedBox(width: 8),
          Flexible(flex: 4, child: tag('PRACTICE DRILL', C.tertiaryContainer, _mintText, icon: Symbols.school)),
          const SizedBox(width: 8),
          Dot(live ? C.error : (phase == ops.Phase.online ? _mint : C.outline)),
          const SizedBox(width: 6),
          Flexible(flex: 3, child: Text(live ? 'LIVE DRILL' : (phase == ops.Phase.online ? 'BACK ONLINE' : 'NO DRILL'), style: T.labelMd.c(C.onPrimary))),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Ic(live ? Symbols.warning : (phase == ops.Phase.online ? Symbols.cloud_done : Symbols.check_circle), size: 22, color: live ? C.errorContainer : _mint),
          const SizedBox(width: 8),
          Expanded(child: Text(live ? 'Practice Outage in Progress' : (phase == ops.Phase.online ? 'Back Online (Practice)' : 'No Practice Outage Open'), style: T.headlineMd.bold.tr(-0.025).c(C.onPrimary))),
        ]),
        const SizedBox(height: 4),
        if (_big(context)) ...[
          fact(Symbols.timer, 'Elapsed:', ev == null ? '—' : elapsedHm(ev.declaredAt, app.nowIso)),
          fact(Symbols.meeting_room, 'Active Ward:', app.unit),
        ] else Row(children: [
          Flexible(flex: 10, child: fact(Symbols.timer, 'Elapsed:', ev == null ? '—' : elapsedHm(ev.declaredAt, app.nowIso))),
          const SizedBox(width: 8),
          Text('•', style: T.bodySm.c(C.onPrimaryContainer)),
          const SizedBox(width: 8),
          Flexible(flex: 17, child: fact(Symbols.meeting_room, 'Active Ward:', app.unit)),
        ]),
        const SizedBox(height: 8),
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: pill('Staff Accounts', '$staff Active', C.onPrimary, Symbols.devices_wearables, C.secondaryContainer.withValues(alpha: 0.2), C.secondaryFixed)),
            const SizedBox(width: 8),
            Expanded(child: pill('Records on Phone', '$records Saved Locally', _mintText, Symbols.database, C.tertiaryContainer.withValues(alpha: 0.4), _mint)),
          ]),
        ),
      ]),
    );
  }

  Widget _pending(int n) => Container(
        padding: const EdgeInsets.fromLTRB(S.md, S.md, S.md, 8),
        decoration: const BoxDecoration(color: _cream, borderRadius: R.rXl, boxShadow: shadowSm),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 40, height: 40, alignment: Alignment.center, decoration: const BoxDecoration(color: _sand, borderRadius: R.rLg), child: const Ic(Symbols.assignment_late, size: 24, color: _brown)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(child: Text('PENDING ATTESTATION', style: T.badge.c(_brown))),
                Text('$n ITEM${n == 1 ? '' : 'S'}', style: T.mono(11, line: 14).c(_brown).tr(0.02)),
              ]),
              const SizedBox(height: 2),
              Text('$n Paper or Draft Record${n == 1 ? '' : 's'} Awaiting a Nurse Check', style: T.headlineSm.bold.s(17, 21)),
              const SizedBox(height: 2),
              Text('A nurse compares each draft with its paper or other source and confirms it. Until then it is not a confirmed record.', style: T.bodySm.c(C.onSecondaryContainer)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 4, children: [
                Tap(
                  label: 'Inspect drafts',
                  onTap: () => Go.queue(context),
                  child: Container(
                    constraints: const BoxConstraints(minHeight: 40),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: const BoxDecoration(color: _brown, borderRadius: R.rLg, boxShadow: shadowSm),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.rule_folder, size: 18, color: C.surface), const SizedBox(width: 6), Flexible(child: Text('Inspect Drafts', style: T.labelMd.c(C.surface)))]),
                  ),
                ),
                Unavailable(
                  reason: 'The alert stays until a nurse has handled every draft.',
                  child: Container(constraints: const BoxConstraints(minHeight: 48), padding: const EdgeInsets.symmetric(horizontal: 8), child: Center(widthFactor: 1, heightFactor: 1, child: Text('Dismiss Alert', style: T.labelMd.c(_brown)))),
                ),
              ]),
            ]),
          ),
        ]),
      );

  Widget _pair(Widget a, Widget b) => IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(child: a), const SizedBox(width: 8), Expanded(child: b)]));

  Widget _value(String v, String unit) => Text.rich(TextSpan(children: [TextSpan(text: '$v ', style: T.mono(22, w: FontWeight.w700, line: 26).tr(-0.025)), TextSpan(text: unit, style: T.unit.c(C.secondary))]));

  Widget _tile(String label, IconData icon, String value, String unit, String sub, Widget foot, {Color iconColor = C.secondary}) => Box(
        shadow: true,
        child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [Expanded(child: Text(label, style: T.labelSm.c(C.secondary))), Ic(icon, size: 16, color: iconColor)]),
            const SizedBox(height: 4),
            _value(value, unit),
            const SizedBox(height: 2),
            Text(sub, style: T.bodySm.c(C.secondary)),
          ]),
          Padding(padding: const EdgeInsets.only(top: 8), child: foot),
        ]),
      );

  Widget _tileFoot(IconData icon, String text) => Row(children: [Ic(icon, size: 14, color: C.secondary), const SizedBox(width: 4), Expanded(child: Text(text, style: T.labelSm.c(C.secondary)))]);

  Widget _storageTile(Store s) {
    final st = _storage;
    final parts = _size(s.sizeBytes()).split(' ');
    final used = st == null || st.$2 <= 0 ? null : 1 - st.$1 / st.$2;
    return _tile(
      'Storage',
      Symbols.pie_chart,
      parts[0],
      parts[1],
      st == null ? 'Phone storage: not reported' : 'of records. Phone: ${_size(st.$1)} of ${_size(st.$2)} free',
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Bar(used ?? 0, track: C.surfaceContainer),
        const SizedBox(height: 8),
        Tag('ENCRYPTED (AES-256)', bg: C.tertiaryContainer, fg: _mintText, icon: Symbols.lock, style: T.badge.s(10, 20).tr(0.025), pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
      ]),
    );
  }

  Widget _vaultTile(int total, int Function(String) n, int drafts) {
    Widget chip(String t, {bool warn = false}) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: warn ? _sand : C.surfaceContainer, borderRadius: R.rBase),
          child: Text(t, style: T.mono(10, line: 14, w: warn ? FontWeight.w700 : FontWeight.w400).c(warn ? _brown : C.onSurface).tr(0.02)),
        );
    return _tile(
      'Local Encrypted Vault',
      Symbols.encrypted,
      '$total',
      'RECORDS',
      'On this phone only',
      Wrap(spacing: 4, runSpacing: 4, children: [
        for (final (type, short) in const [('vital_sign', 'vit'), ('med_admin', 'med'), ('intake_output', 'fld'), ('note', 'note'), ('lab_event', 'lab')])
          if (n(type) > 0) chip('${n(type)} $short'),
        if (drafts > 0) chip('$drafts draft', warn: true),
      ]),
      iconColor: C.saved,
    );
  }

  Widget _networkTile(ops.Phase phase) {
    final down = phase == ops.Phase.down;
    return Box(
      shadow: true,
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(width: 40, height: 40, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rLg), child: Ic(Symbols.cloud_off, size: 22, color: down ? C.error : C.secondary)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text('Network Clearance Protocol', style: T.labelSm.c(C.secondary))),
              const SizedBox(width: 8),
              ConstrainedBox(constraints: const BoxConstraints(maxWidth: 140), child: Tag(ops.kPhaseLabel[phase]!.toUpperCase(), bg: down ? C.errorContainer : C.surfaceHigh, fg: down ? C.error : C.onSurfaceVariant, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2))),
            ]),
            const SizedBox(height: 2),
            Text('Practice phase: ${ops.kPhaseLabel[phase]} (changed by an admin only)', style: T.labelMd.bold),
            const SizedBox(height: 2),
            Text('Phone network: ${_network == null ? 'not reported' : (_network! ? 'connected' : 'not connected')}. The app has no network permission.', style: T.bodySm.c(C.secondary)),
          ]),
        ),
      ]),
    );
  }

  Widget _ledger(AppState app, ChainResult chain) {
    final bad = !chain.ok || _check?.ok == false || _checkError != null;
    final text = _checkError != null ? 'The check did not finish: $_checkError' : (_check?.text ?? (chain.ok ? 'Hash chain in order: ${chain.verified} of ${chain.total} rows • local evidence only' : 'Hash chain broken at row ${chain.brokenAtSeq}. Tell IT.'));
    return Tap(
      label: 'Change log. $text. Open',
      expand: true,
      onTap: () => Go.audit(context),
      child: Box(
        shadow: true,
        child: Row(children: [
          Container(width: 36, height: 36, alignment: Alignment.center, decoration: BoxDecoration(color: C.tertiaryContainer.withValues(alpha: 0.2), borderRadius: R.rLg), child: const Ic(Symbols.enhanced_encryption, size: 20, color: C.tertiaryFixedDim)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Flexible(child: Text('Local Audit Ledger', style: T.labelMd.bold)), const SizedBox(width: 6), Dot(bad ? C.error : C.saved, size: 6)]),
              Text(text, style: T.bodySm.c(bad ? C.error : C.secondary)),
            ]),
          ),
          const Ic(Symbols.chevron_right, size: 20, color: C.secondary),
        ]),
      ),
    );
  }

  /// [met] null = not supported.
  Widget _row(IconData icon, String title, String sub, bool? met) => Box(
        shadow: true,
        child: Row(children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: met == null ? C.secondaryContainer.withValues(alpha: 0.4) : (met ? _greenBg : _sand), borderRadius: R.rFull),
            child: Ic(icon, size: 18, color: met == null ? C.secondary : (met ? C.saved : _brown)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: T.labelMd),
              Text(sub, style: T.bodySm.c(C.secondary)),
            ]),
          ),
          if (met == true) const Ic(Symbols.check, size: 20, color: C.saved) else Ic(met == null ? Symbols.remove : Symbols.hourglass_empty, size: 20, color: met == null ? C.secondary : _brown),
        ]),
      );
}

/* ------------------------------ Downtime checklist ------------------------------ */

class _Step {
  final String id, title, text;

  /// kNetworkChecklist text, when this step is one of the three clearance items.
  final String? network;

  /// Computed facts: (icon, text).
  final List<(IconData?, String)> facts;
  const _Step(this.id, this.title, this.text, {this.network, this.facts = const []});
}

class ChecklistScreen extends StatefulWidget {
  final bool preview;
  const ChecklistScreen({super.key, this.preview = false});
  @override
  State<ChecklistScreen> createState() => _ChecklistScreenState();
}

class _ChecklistScreenState extends State<ChecklistScreen> {
  final _clearance = GlobalKey();
  bool _busy = false;
  bool? _network;
  String? _error;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 20), (_) => mounted ? setState(() {}) : null);
    if (widget.preview) return;
    _readNetwork();
    if (_openAtClearance) {
      _openAtClearance = false;
      WidgetsBinding.instance.addPostFrameCallback((_) => _showClearance());
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _readNetwork() async {
    bool? n;
    try {
      n = await AppScope.read(context).native.networkConnected();
    } catch (_) {}
    if (mounted) setState(() => _network = n);
  }

  void _showClearance() {
    final c = _clearance.currentContext;
    if (c != null && c.mounted) Scrollable.ensureVisible(c, duration: const Duration(milliseconds: 250), alignment: 0.05);
  }

  static const _net = [('net-0', 'Network Safe to Use Again'), ('net-1', 'Back-Entry May Start'), ('net-2', 'Downtime Lead Sign-Off')];

  /// Protocol text; facts only when the records are open and a person is signed in.
  List<(String, List<_Step>)> _phases(AppState? app) {
    String staffText = '', listText = 'The time of the printed patient list was read out.', sbarText = 'Each nurse wrote a final SBAR note for each patient.';
    var vit = const <(IconData?, String)>[], paper = const <(IconData?, String)>[], beds = const <(IconData?, String)>[], work = const <(IconData?, String)>[];
    if (app != null) {
      final s = app.store, now = app.nowIso, ev = app.downtime;
      final ward = loadWard(s, now);
      if (ev != null) {
        final active = {for (final p in s.all('practitioner')) if (p['active'] == true) p['id'] as String};
        final seen = {for (final a in s.where('audit_log', 'action', 'staff_signed_in')) if (ms(a['time'] as String) >= ms(ev.declaredAt)) a['user_id'] as String}.intersection(active);
        staffText = ' ${seen.length} of ${active.length} signed in since the start.';
        final withVitals = ward.where((f) => f.entries.any((x) => x.entry.type == 'vital_sign' && x.entry.isConfirmed && ms(x.entry.careTime) >= ms(ev.declaredAt))).length;
        vit = [(Symbols.database, '$withVitals of ${ward.length} patients'), (Symbols.timelapse, 'Since ${hm(ev.declaredAt)}')];
      }
      final snap = s.all('snapshot').firstOrNull?['taken_at'] as String?;
      listText = snap == null ? 'The patient list has no snapshot time.' : 'List taken ${hm(snap)}, ${dayLabel(snap)} (${sinceText(snap, now)} old), ${ward.length} patients.';
      final drafts = s.all('entry').where((e) => e['status'] == 'draft').length;
      paper = [(Symbols.rule_folder, '$drafts draft${drafts == 1 ? '' : 's'} open'), (Symbols.photo, '${s.count('m_photo')} paper photo${s.count('m_photo') == 1 ? '' : 's'}')];
      final have = ops.shiftHandoffs(s, now);
      sbarText = 'Final SBAR notes saved this shift: ${have.length} of ${ward.length} patients.';
      beds = [for (final f in ward) if (have.containsKey(f.patient.id)) (null, 'Bed ${f.bed}')];
      final items = s.all('worklist_item');
      work = [(Symbols.checklist, items.isEmpty ? 'List not built yet' : '${items.where((w) => w['signed_off_at'] != null).length} of ${items.length} signed off')];
    }
    return [
      (
        'Onset & Containment',
        [
          const _Step('paper-forms', 'Paper Forms & MAR Binders Ready', 'Blank downtime forms and printed patient sheets are at the nursing station.'),
          _Step('staff-in', 'Staff Signed In on This Phone', 'Each person uses their own PIN.$staffText'),
          _Step('list-age', 'Patient List Age Checked', listText),
        ]
      ),
      (
        'Bedside Continuity Operations',
        [
          _Step('vitals', 'Vital Signs Recorded for All Patients', 'Vital signs of each patient are on this phone or on a paper form.', facts: vit),
          _Step('paper-check', 'Paper MAR & Draft Records Checked', 'A nurse compared each paper photo and draft with its source.', facts: paper),
          _Step('sbar', 'Ward Shift Handover SBAR Recorded', sbarText, facts: beds),
        ]
      ),
      (
        'Pre-Reconnection Clearance',
        [
          for (var i = 0; i < 3; i++) _Step(_net[i].$1, _net[i].$2, '${kNetworkChecklist[i]}.', network: kNetworkChecklist[i]),
          _Step('worklist', 'Recovery Worklist Reviewed', 'Opens after Back online. A person checks and signs each item.', facts: work),
        ]
      ),
    ];
  }

  void _toggle(AppState app, DowntimeEvent ev, _Step st, bool done) {
    try {
      ops.setChecklistItem(app.ctx(), eventId: ev.id, itemId: st.id, done: done);
      app.saved();
      setState(() => _error = null);
    } catch (e) {
      setState(() => _error = _err(e));
    }
  }

  Future<void> _clear(AppState app, List<String> ticked) async {
    final left = kNetworkChecklist.where((x) => !ticked.contains(x)).length;
    if (left > 0) {
      setState(() => _error = 'Tick every clearance item first ($left left).');
      _showClearance();
      return;
    }
    setState(() => _error = null);
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: C.surfaceLowest,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      enableDrag: false, // the PIN check can not be swiped away while it runs
      builder: (_) => _PinSheet(ticked: ticked),
    );
    if (ok == true && mounted) toast(context, 'Back online (Practice). Only this phone changed; nothing was sent.');
  }

  Future<void> _end(AppState app) async {
    if (!await confirm(context, title: 'End this downtime?', text: 'The practice downtime is closed on this phone. Saved records stay. Nothing is sent.', yes: 'End downtime')) return;
    if (!mounted) return;
    try {
      ops.endDowntime(app.ctx());
      app.saved();
      setState(() => _error = null);
      toast(context, 'Downtime ended on this phone');
    } catch (e) {
      setState(() => _error = _err(e));
    }
  }

  String _csv(AppState app, List<(String, List<_Step>)> phases, Map<String, Doc> state) {
    final s = app.store, ev = app.downtime;
    String q(Object? v) {
      var t = '${v ?? ''}'.replaceAll('"', '""');
      if (t.isNotEmpty && '=+-@'.contains(t[0])) t = "'$t";
      return '"$t"';
    }

    String line(List<Object?> c) => c.map(q).join(',');
    const about = {'downtime_declared', 'network_cleared', 'downtime_ended', 'practice_drill_closed', 'checklist_changed'};
    return [
      line(['ClinBridge PRACTICE downtime checklist (fictional data)']),
      line(['Made', app.nowIso, 'Unit', app.unit]),
      line(['Downtime', ev?.id ?? 'none open', 'Phase', ops.kPhaseLabel[app.phase]]),
      '',
      line(['Section', 'Step', 'Text', 'Done', 'By', 'Time']),
      for (final (name, steps) in phases)
        for (final st in steps) line([name, st.title, st.network ?? st.text, state[st.id]?['done'] == true ? 'yes' : 'no', state[st.id] == null ? '' : staffName(s, state[st.id]!['by'] as String), state[st.id]?['time']]),
      '',
      line(['Change log row', 'Time', 'Person', 'Action', 'About']),
      for (final a in s.all('audit_log').map(AuditRow.new))
        if (about.contains(a.action)) line([a.seq, a.time, staffName(s, a.userId), auditLabel(a.action), a.entity]),
      '',
    ].join('\r\n');
  }

  Future<void> _save(AppState app, String csv) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final bytes = utf8.encode(csv);
      ops.recordSaving(app.ctx(), 'checklist/${app.downtime?.id ?? 'none'}', 'clinbridge-practice-checklist.csv', bytes);
      final name = await app.native.saveFile('clinbridge-practice-checklist.csv', 'text/csv', bytes);
      if (name == null) {
        currentToast.value = ToastMessage('Saving was cancelled. No file was saved.', Symbols.info, false);
        return;
      }
      try {
        ops.recordFile(app.ctx(), action: 'file_saved', entity: 'checklist/${app.downtime?.id ?? 'none'}', after: {'file': name, 'bytes': bytes.length, 'sha256': sha256Hex(bytes)});
        app.saved();
        currentToast.value = ToastMessage('File saved: $name', Symbols.check_circle, false);
      } catch (e) {
        currentToast.value = ToastMessage('File saved ($name), but not noted in the change log: ${_err(e)}', Symbols.error, true);
      }
    } catch (e) {
      currentToast.value = ToastMessage('The file was not saved: ${_err(e)}', Symbols.error, true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!widget.preview && !app.signedIn) return _blank();
    final live = widget.preview ? null : app;
    final admin = live?.user?.isAdmin ?? false;
    final ev = live?.downtime;
    final phase = live?.phase ?? ops.Phase.ready;
    final phases = _phases(live);
    final state = live == null || ev == null ? <String, Doc>{} : ops.checklistState(live.store, ev.id);
    bool isDone(_Step st) => state[st.id]?['done'] == true;
    final steps = [for (final (_, l) in phases) ...l];
    final done = steps.where(isDone).length;
    final pct = done * 100 / steps.length;
    final ticked = [for (final st in steps) if (st.network != null && isDone(st)) st.network!];
    final now = live?.nowIso;

    return PhonePage(
      statusColor: C.primaryContainer,
      pad: const EdgeInsets.fromLTRB(S.md, 4, S.md, 36),
      header: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          color: C.primaryContainer,
          padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 4),
          child: Row(children: [
            Dot(phase == ops.Phase.down ? C.error : _mint),
            const SizedBox(width: 4),
            Expanded(
              child: Text(widget.preview ? 'PRACTICE • PREVIEW ONLY' : 'PRACTICE • ${switch (phase) { ops.Phase.down => 'EHR DOWNTIME ACTIVE', ops.Phase.online => 'BACK ONLINE', ops.Phase.ready => 'NO DOWNTIME OPEN' }}',
                  maxLines: 1, overflow: TextOverflow.ellipsis, style: T.badge.c(_amber300)),
            ),
            const SizedBox(width: 8),
            const Ic(Symbols.lock, size: 14, color: C.tertiaryFixed),
            const SizedBox(width: 4),
            Text(widget.preview ? 'Records closed' : 'Records encrypted', style: T.labelSm.c(C.tertiaryFixed)),
          ]),
        ),
        Container(
          constraints: const BoxConstraints(minHeight: 80),
          decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0A000000), offset: Offset(0, 1), blurRadius: 8)]),
          padding: const EdgeInsets.only(left: 10, right: 4),
          child: Row(children: [
            Tap(label: 'Back', onTap: () => Go.back(context), child: const Ic(Symbols.arrow_back_ios_new, size: 24)),
            const SizedBox(width: 2),
            Expanded(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Downtime Protocol Checklist', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.headlineSm),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Ic(Symbols.domain, size: 12, color: C.secondary),
                    const SizedBox(width: 4),
                    Flexible(child: Text(widget.preview ? 'Practice protocol' : '${live!.unit} • ${ev == null ? 'No incident' : ev.id}', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(C.onSurfaceVariant))),
                  ]),
                ),
              ]),
            ),
            widget.preview
                ? const Unavailable(reason: 'Sign in to save this list as a file.', child: SizedBox(width: 48, height: 48, child: Center(child: Ic(Symbols.print, size: 22))))
                : Tap(label: 'Save the checklist as a file', onTap: _busy ? null : () => _save(live!, _csv(live, phases, state)), child: const Ic(Symbols.print, size: 22)),
            widget.preview
                ? SizedBox(width: 48, height: 48, child: Center(child: Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull), child: const Ic(Symbols.person, size: 18, color: C.onPrimary))))
                : Tap(
                    label: 'My account and more',
                    onTap: () => Go.more(context),
                    child: Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull), child: const Ic(Symbols.person, size: 18, color: C.onPrimary)),
                  ),
          ]),
        ),
      ]),
      footer: _footer(context, live, admin, phase, ticked, phases, state),
      children: [
        _summary(live, ev, phase, now, done, steps.length, pct),
        const SizedBox(height: S.md),
        _banner(admin),
        const SizedBox(height: S.md),
        for (var p = 0; p < phases.length; p++) ...[
          _phaseHead(p, phases[p].$1, phases[p].$2.where(isDone).length, phases[p].$2.length),
          for (final st in phases[p].$2) ...[const SizedBox(height: 4), _step(live, admin, ev, phase, st, state[st.id])],
          const SizedBox(height: 16),
        ],
        if (!widget.preview) _attestation(live!, ev, state),
        if (widget.preview)
          Box(
            shadow: true,
            child: _note('This is the list only. Ticks are kept for one practice downtime and can be changed by a signed-in admin.'),
          ),
      ],
    );
  }

  Widget _summary(AppState? app, DowntimeEvent? ev, ops.Phase phase, String? now, int done, int total, double pct) => Container(
        padding: const EdgeInsets.all(S.md),
        decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowSm),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Ic(Symbols.shield_with_heart, size: 18, color: _amber300, fill: 1),
            const SizedBox(width: 4),
            Expanded(
              child: Text(
                widget.preview ? 'PROTOCOL PREVIEW' : switch (phase) { ops.Phase.down => 'CLEARANCE PROTOCOL IN PROGRESS', ops.Phase.online => 'BACK ONLINE (PRACTICE)', ops.Phase.ready => 'NO DOWNTIME OPEN' },
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: T.badge.c(_amber300),
              ),
            ),
            const SizedBox(width: 4),
            Container(
              constraints: const BoxConstraints(maxWidth: 130),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: R.rLg),
              child: Text(ev?.id ?? 'PRACTICE', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(_slate200)),
            ),
          ]),
          const SizedBox(height: 4),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(app == null ? 'Ward Bedside Clearance' : '${app.unit.split(' ').take(2).join(' ')} Bedside Clearance', style: T.headlineMd.c(C.surfaceLowest)),
                Text.rich(TextSpan(style: T.bodySm.c(_slate300), children: [
                  TextSpan(text: ev == null ? 'No outage open' : 'Outage Duration: '),
                  if (ev != null) TextSpan(text: elapsedHm(ev.declaredAt, now!), style: T.bodySm.semi.c(Colors.white)),
                  const TextSpan(text: ' • Practice drill'),
                ])),
              ]),
            ),
            const SizedBox(width: 8),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(widget.preview ? '$total' : '${pct == pct.roundToDouble() ? pct.toInt() : pct.toStringAsFixed(1)}%', style: T.vital.c(C.tertiaryFixed)),
              Text(widget.preview ? 'steps' : '$done/$total Completed', style: T.unit.c(_slate300)),
            ]),
          ]),
          const SizedBox(height: 8),
          Container(
            height: 8,
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.3), borderRadius: const BorderRadius.all(Radius.circular(4))),
            child: Row(children: [
              if (done > 0) Expanded(flex: done, child: Container(decoration: const BoxDecoration(color: C.tertiaryFixed, borderRadius: R.rBase))),
              if (done > 0 && done < total) const SizedBox(width: 2),
              if (done < total) Expanded(flex: total - done, child: Container(decoration: const BoxDecoration(color: _amber400, borderRadius: R.rBase))),
            ]),
          ),
          const SizedBox(height: 12),
          Row(children: [
            const Dot(Color(0xFF34D399)),
            const SizedBox(width: 6),
            Expanded(child: Text(app == null ? 'Local list, works without a network' : 'Saved on this phone', style: T.labelSm.c(_slate200))),
            Text('AES-256', style: T.unit.c(_slate300).tr(0.05)),
          ]),
        ]),
      );

  Widget _banner(bool admin) => Box(
        shadow: true,
        child: Row(children: [
          ClipRRect(
            borderRadius: R.rXl,
            child: SizedBox(
              width: 56,
              height: 56,
              child: ColoredBox(
                color: C.surfaceHigh,
                child: ClipRect(
                  child: Stack(children: [
                    Positioned(left: -76, top: -24, width: 140, height: 140, child: Image.asset('assets/art/opening.png', fit: BoxFit.contain, excludeFromSemantics: true)),
                    Positioned.fill(child: ColoredBox(color: C.primary.withValues(alpha: 0.2))),
                  ]),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Flexible(child: Text('PRACTICE PROTOCOL', style: T.badge.c(C.secondary))), const SizedBox(width: 4), const Ic(Symbols.verified, size: 14, color: C.secondary)]),
              Text('EHR Downtime Checklist', maxLines: 1, overflow: TextOverflow.ellipsis, style: T.headlineSm),
              Text(widget.preview ? 'Read only. An admin ticks the steps after sign-in.' : (admin ? 'Your ticks are saved with name and time' : 'Read only. Only an admin can tick the steps.'), maxLines: 2, overflow: TextOverflow.ellipsis, style: T.bodySm.c(C.onSurfaceVariant)),
            ]),
          ),
        ]),
      );

  Widget _phaseHead(int i, String title, int done, int total) {
    final full = done == total;
    return Padding(
      key: i == 2 ? _clearance : null,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(children: [
        Container(width: 24, height: 24, alignment: Alignment.center, decoration: BoxDecoration(color: full ? C.tertiaryFixed : _amber400, borderRadius: R.rFull), child: Text('${i + 1}', style: T.badge.c(full ? C.onTertiaryFixed : C.primary), textScaler: TextScaler.noScaling)),
        const SizedBox(width: 4),
        Expanded(child: Text(title.toUpperCase(), style: T.labelMd.tr(0.025))),
        const SizedBox(width: 4),
        Flexible(
          flex: 0,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: full ? C.tertiaryFixed : _amber100, borderRadius: R.rFull),
            child: Text(widget.preview ? '$total steps' : (full ? '$done/$total Complete' : '${total - done}/$total Left'), style: T.badge.c(full ? C.onTertiaryFixed : _amber900)),
          ),
        ),
      ]),
    );
  }

  Widget _step(AppState? app, bool admin, DowntimeEvent? ev, ops.Phase phase, _Step st, Doc? tick) {
    final done = tick?['done'] == true;
    final required = st.network != null && !done;
    String? why;
    if (st.network != null && phase == ops.Phase.online) why = 'Already cleared';
    if (st.id == 'worklist' && phase != ops.Phase.online) why = 'Opens after Back online';
    final can = admin && ev != null && why == null && !_busy;
    final time = done ? hm(tick!['time'] as String) : null;
    final by = tick == null || app == null ? null : '${done ? 'Ticked by' : 'Tick removed by'} ${staffShort(app.store, tick['by'] as String)}${done ? '' : ', ${hm(tick['time'] as String)}'}';
    Widget chip(IconData? icon, String t) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rBase),
          child: Row(mainAxisSize: MainAxisSize.min, children: [if (icon != null) ...[Ic(icon, size: 12, color: C.secondary), const SizedBox(width: 4)], Flexible(child: Text(t, style: T.unit.c(C.onSurfaceVariant)))]),
        );
    final body = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Expanded(child: Text(st.title, style: T.labelMd)),
        const SizedBox(width: 4),
        if (time != null)
          Text(time, style: T.unit.c(C.onSurfaceVariant))
        else if (required)
          Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: const BoxDecoration(color: _amber200, borderRadius: R.rFull), child: Text('Required', style: T.badge.c(_amber900))),
      ]),
      SizedBox(height: required ? 4 : 2),
      Text(st.text, style: T.bodySm.c(C.onSurfaceVariant)),
      if (st.facts.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Wrap(spacing: 8, runSpacing: 4, children: [for (final (i, t) in st.facts) chip(i, t), if (by != null) chip(done ? Symbols.badge : Symbols.history, done ? staffShort(app!.store, tick!['by'] as String) : by)])),
      if (by != null && st.facts.isEmpty)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Row(children: [
            Ic(done ? Symbols.badge : Symbols.history, size: 14, color: C.secondary),
            const SizedBox(width: 6),
            Expanded(child: Text(by, style: T.labelSm.c(C.secondary))),
          ]),
        ),
      if (why != null && !done) Padding(padding: const EdgeInsets.only(top: 4), child: Text(why, style: T.labelSm.c(C.secondary))),
      if (st.id == 'net-2' && app != null) ...[
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rLg),
          child: Column(children: [
            _diag('Phone network (Android):', _network == null ? 'not reported' : (_network! ? 'connected' : 'not connected')),
            const SizedBox(height: 6),
            _diag('Draft records open:', '${app.store.all('entry').where((e) => e['status'] == 'draft').length}'),
            const SizedBox(height: 6),
            _diag('Practice phase on this phone:', ops.kPhaseLabel[phase]!),
          ]),
        ),
      ],
    ]);
    final box = done
        ? Container(width: 28, height: 28, margin: const EdgeInsets.only(top: 2, right: 8), alignment: Alignment.center, decoration: const BoxDecoration(color: C.tertiaryFixed, borderRadius: R.rLg), child: const Ic(Symbols.check, size: 18, color: C.onTertiaryFixed))
        : required
            ? Container(width: 24, height: 24, margin: const EdgeInsets.only(left: 2, top: 2, right: 18), alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg), child: const Ic(Symbols.check, size: 18, color: Colors.white))
            : Container(width: 28, height: 28, margin: const EdgeInsets.only(top: 2, right: 8), alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg), child: const Ic(Symbols.check, size: 18, color: Colors.white));
    return Tap(
      label: '${st.title}. ${st.text} ${st.facts.map((f) => f.$2).join(', ')}. ${by ?? 'Not ticked'}${why == null || done ? '' : '. $why'}',
      toggled: done,
      button: can,
      expand: true,
      onTap: can ? () => _toggle(app!, ev, st, !done) : null,
      child: Box(
        shadow: true,
        color: st.network != null && done ? const Color(0xFFF1FCF6) : C.surfaceLowest,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [box, Expanded(child: body)]),
      ),
    );
  }

  Widget _diag(String k, String v) => Row(children: [Expanded(flex: 3, child: Text(k, style: T.labelSm.c(C.onSurfaceVariant))), const SizedBox(width: 8), Expanded(flex: 2, child: Text(v, textAlign: TextAlign.right, style: T.unit))]);

  Widget _note(String t) => Container(
        padding: const EdgeInsets.all(8),
        decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rLg),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(padding: EdgeInsets.only(top: 2), child: Ic(Symbols.info, size: 18, color: C.secondary)),
          const SizedBox(width: 4),
          Expanded(child: Text(t, style: T.bodySm.s(12, 19.5).c(C.onSurfaceVariant))),
        ]),
      );

  Widget _attestation(AppState app, DowntimeEvent? ev, Map<String, Doc> state) {
    final s = app.store;
    final ticks = [for (final r in state.values) if (r['done'] == true) r]..sort((a, b) => ms(a['time'] as String).compareTo(ms(b['time'] as String)));
    final people = <String, (int, String)>{};
    for (final r in ticks) {
      final id = r['by'] as String;
      people[id] = ((people[id]?.$1 ?? 0) + 1, r['time'] as String);
    }
    Widget person(String? id, String title, String sub, String badge, bool ok, Color bg) => Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Row(children: [
            Container(width: 36, height: 36, alignment: Alignment.center, decoration: BoxDecoration(color: bg, borderRadius: R.rFull), child: Text(staffById(s, id)?.initials ?? '—', style: T.labelMd.bold.c(Colors.white), textScaler: TextScaler.noScaling)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelMd),
                Text(sub, maxLines: 2, overflow: TextOverflow.ellipsis, style: T.bodySm.c(C.onSurfaceVariant)),
              ]),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: ok ? C.tertiaryFixed : _amber100, borderRadius: R.rBase),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Ic(ok ? Symbols.done_all : Symbols.hourglass_empty, size: 12, color: ok ? C.onTertiaryFixed : _amber900),
                const SizedBox(width: 4),
                Text(badge, style: T.badge.c(ok ? C.onTertiaryFixed : _amber900)),
              ]),
            ),
          ]),
        );
    final clearedBy = ev?.clearedBy;
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [const Ic(Symbols.verified_user, size: 20, color: C.primary), const SizedBox(width: 4), Expanded(child: Text('Who Ticked and Who Cleared', style: T.headlineSm))]),
          const SizedBox(height: 8),
          if (people.isEmpty) person(null, 'Checklist', ev == null ? 'No downtime is open' : 'Nobody has ticked a step yet', 'Open', false, C.primaryContainer),
          for (final e in people.entries) person(e.key, staffName(s, e.key), '${e.value.$1} step${e.value.$1 == 1 ? '' : 's'} ticked • last ${hm(e.value.$2)}', 'Ticked', true, C.primaryContainer),
          person(clearedBy, clearedBy == null ? 'Network Clearance' : staffName(s, clearedBy), clearedBy == null ? 'Not cleared on this phone' : 'Back online (Practice) • ${dateTimeLabel(ev!.networkClearedAt)}', clearedBy == null ? 'Open' : 'Cleared', clearedBy != null, C.secondary),
          const SizedBox(height: 4),
          _note('Switching to Back online is a local Practice change on this phone. The app pings no network, opens no connection and sends nothing.'),
        ]),
      ),
    );
  }

  Widget _footer(BuildContext context, AppState? app, bool admin, ops.Phase phase, List<String> ticked, List<(String, List<_Step>)> phases, Map<String, Doc> state) {
    Widget main;
    const st = BtnKind.navy;
    if (app == null) {
      main = Btn('Sign in as admin to change', kind: st, radius: R.lg, icon: Symbols.lock, onTap: () {
        final a = AppScope.read(context);
        a.unlocked ? Go.staff(context) : Go.vault(context);
      });
    } else if (!admin) {
      main = const Btn('Only an admin can change the checklist', kind: st, radius: R.lg, icon: Symbols.lock, onTap: null);
    } else {
      main = switch (phase) {
        ops.Phase.down => Btn('Switch to Back online (Practice)', kind: st, radius: R.lg, icon: Symbols.sync, onTap: () => _clear(app, ticked)),
        ops.Phase.online => Btn('End this downtime', kind: st, radius: R.lg, icon: Symbols.task_alt, onTap: () => _end(app)),
        ops.Phase.ready => Btn('Start a practice outage', kind: st, radius: R.lg, icon: Symbols.play_circle, onTap: () => _startOutage(context, app)),
      };
    }
    final save = Btn('Save Protocol Audit Log (CSV)', kind: BtnKind.quiet, height: 44, radius: R.lg, icon: Symbols.file_download, iconSize: 16, style: T.labelSm, busy: _busy, onTap: app == null ? null : () => _save(app, _csv(app, phases, state)));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 8),
      decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x141C2536), offset: Offset(0, -4), blurRadius: 16)]),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_error != null)
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.all(8),
            decoration: const BoxDecoration(color: C.errorContainer, borderRadius: R.rLg),
            child: Row(children: [const Ic(Symbols.error, size: 18, color: C.onErrorContainer), const SizedBox(width: 8), Expanded(child: Text(_error!, style: T.bodySm.c(C.onErrorContainer)))]),
          ),
        main,
        const SizedBox(height: 2),
        Row(children: [
          Expanded(child: app == null ? Unavailable(reason: 'Sign in to save this list as a file.', child: save) : save),
          const SizedBox(width: 4),
          Unavailable(reason: 'The app makes no calls. Use the ward phone to reach the downtime lead.', child: Container(width: 48, height: 48, alignment: Alignment.center, child: Container(width: 44, height: 44, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg), child: const Ic(Symbols.support_agent, size: 18)))),
        ]),
      ]),
    );
  }
}

/// The admin's own PIN for the local Back online change. Pops true after it was saved.
class _PinSheet extends StatefulWidget {
  final List<String> ticked;
  const _PinSheet({required this.ticked});
  @override
  State<_PinSheet> createState() => _PinSheetState();
}

class _PinSheetState extends State<_PinSheet> {
  String _pin = '';
  bool _busy = false;
  String? _error;

  Future<void> _key(AppState app, String k) async {
    if (_busy) return;
    setState(() {
      _error = null;
      if (k == '<') {
        if (_pin.isNotEmpty) _pin = _pin.substring(0, _pin.length - 1);
      } else if (_pin.length < 4) {
        _pin += k;
      }
    });
    if (k == '<' || _pin.length < 4) return;
    setState(() => _busy = true);
    String error;
    try {
      final r = await app.clearNetwork(app.ctx(), widget.ticked, _pin);
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
      _pin = '';
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return const SizedBox();
    Widget key(String k, {Widget? child}) => Expanded(
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: Tap(
              label: k == '<' ? 'Delete last digit' : k,
              expand: true,
              onTap: _busy ? null : () => _key(app, k),
              child: Container(height: 52, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rLg), child: child ?? Text(k, style: T.headlineMd, textScaler: TextScaler.noScaling)),
            ),
          ),
        );
    return PopScope(
      canPop: !_busy, // the check in progress finishes on this page
      child: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(S.lg),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Ic(Symbols.key, size: 24, color: C.primary),
            const SizedBox(width: 8),
            Expanded(child: Text('Admin PIN (${app.user!.name})', style: T.headlineSm.bold)),
            Tap(label: 'Close', onTap: _busy ? null : () => Navigator.of(context).pop(), child: const Ic(Symbols.close, size: 24, color: C.secondary)),
          ]),
          Text('Switch the Practice records on this phone to Back online. This is a local Practice change: no network ping, and nothing is sent.', style: T.bodySm.c(C.onSurfaceVariant)),
          const SizedBox(height: 16),
          PinDots(_pin.length),
          const SizedBox(height: 8),
          SizedBox(
            height: 24,
            child: _busy ? const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: C.primary))) : Center(child: FittedBox(fit: BoxFit.scaleDown, child: Text(_error ?? '', style: T.labelMd.c(C.error)))),
          ),
          const SizedBox(height: 8),
          for (final r in const [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]) Row(children: [for (final k in r) key(k)]),
          Row(children: [const Expanded(child: SizedBox()), key('0'), key('<', child: const Ic(Symbols.backspace, size: 22))]),
        ]),
      ),
    ),
    );
  }
}
