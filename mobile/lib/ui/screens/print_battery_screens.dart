import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/native.dart';
import '../../data/repos/entries.dart';
import '../../data/repos/ops.dart' as ops;
import '../../data/schema.dart';
import '../../data/store.dart';
import '../../domain/facts.dart';
import '../../domain/meds.dart';
import '../../domain/print_docs.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';

/// Colours of the paper sheet in the reference (Tailwind neutral, red, amber, emerald).
const _n900 = Color(0xFF171717), _n800 = Color(0xFF262626), _n700 = Color(0xFF404040), _n600 = Color(0xFF525252), _n500 = Color(0xFF737373), _n300 = Color(0xFFD4D4D4);
const _amber300 = Color(0xFFFCD34D), _amber400 = Color(0xFFFBBF24), _red700 = Color(0xFFB91C1C), _red800 = Color(0xFF991B1B), _red900 = Color(0xFF7F1D1D), _red50 = Color(0xFFFEF2F2);
const _em600 = Color(0xFF059669), _em800 = Color(0xFF065F46), _em100 = Color(0xFFD1FAE5);

String _why(Object e) => e is AppError ? e.message : e is PlatformException ? (e.message ?? e.code) : '$e';
Widget _cap(double max, Widget child) => ConstrainedBox(constraints: BoxConstraints(maxWidth: max), child: child);
String _shortUnit(String u) => u.replaceAll(RegExp(r'\s*(\(.*\)|Med/Surg)$'), '');

/* ------------------------------ Print ------------------------------ */

class PrintScreen extends StatefulWidget {
  final String? patientId;
  const PrintScreen({super.key, this.patientId});
  @override
  State<PrintScreen> createState() => _PrintScreenState();
}

class _PrintScreenState extends State<PrintScreen> {
  PrintPreset? preset;
  PaperSize paper = PaperSize.letter;
  int copies = 2;
  PrintJob? job;
  bool building = false, busy = false;
  String? error, info;
  int? _version;
  String? _patient;
  int _run = 0;

  /// The bedside packet belongs to the verified patient only.
  String? get patientId => AppScope.read(context).verifiedPatientId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final app = AppScope.of(context);
    if (!app.signedIn) return;
    final p = app.verifiedPatientId;
    preset ??= p != null || widget.patientId != null ? PrintPreset.bedside : PrintPreset.ward;
    if (_version == app.dataVersion && _patient == p) return;
    _version = app.dataVersion;
    _patient = p;
    _rebuild();
  }

  PrintRequest _request(AppState app, int n) =>
      PrintRequest(preset: preset!, paper: paper, copies: n, patientId: app.verifiedPatientId, printedBy: staffShort(app.store, app.user!.id), nowIso: app.nowIso, unit: app.unit, eventId: app.downtime?.id);

  /// Lays out one copy in memory, so the page count on screen is the document's own.
  Future<void> _rebuild() async {
    final app = AppScope.read(context);
    final run = ++_run;
    job = null;
    if (preset == PrintPreset.bedside && app.verifiedPatientId == null) {
      building = false;
      return;
    }
    building = true;
    try {
      final j = await buildPrintJob(app.store, _request(app, 1), rootBundle.load);
      if (mounted && run == _run) {
        setState(() {
          job = j;
          building = false;
        });
      }
    } catch (e) {
      if (mounted && run == _run) {
        setState(() {
          building = false;
          error = 'The sheets could not be made: ${_why(e)}';
        });
      }
    }
  }

  void _pick(PrintPreset p) {
    if (busy) return;
    setState(() {
      preset = p;
      error = info = null;
    });
    if (p == PrintPreset.bedside && patientId == null) _choosePatient();
    _rebuild();
  }

  void _choosePatient() {
    final app = AppScope.read(context);
    final ward = loadWard(app.store, app.nowIso);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: C.surfaceLowest,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(8))),
      builder: (c) => SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * .75),
          child: Padding(
            padding: const EdgeInsets.all(S.lg),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Bedside packet for which patient?', style: T.headlineSm),
              Text('Two identifiers are checked first.', style: T.bodySm.c(C.secondary)),
              const SizedBox(height: S.sm),
              Flexible(
                child: ListView(shrinkWrap: true, children: [
                  for (final f in ward)
                    Tap(
                      expand: true,
                      label: '${f.patient.fullName}, bed ${f.bed}',
                      onTap: () {
                        Navigator.pop(c);
                        _verify(f.patient.id);
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(children: [
                          Expanded(child: Text(f.patient.fullName, style: T.labelMd)),
                          const SizedBox(width: 8),
                          Text('Bed ${f.bed}', style: T.labelSm.c(C.secondary)),
                          const Ic(Symbols.chevron_right, size: 20, color: C.secondary),
                        ]),
                      ),
                    ),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  /// After the check, back to this page (it follows the verified patient by itself).
  void _verify(String id) => withPatient(context, id, (c) => Navigator.of(c, rootNavigator: true).popUntil((r) => r.settings.name == 'print' || r.isFirst));

  String _name(String ext) => 'clinbridge-${switch (preset!) { PrintPreset.ward => 'ward-packet', PrintPreset.bedside => 'bedside-packet', PrintPreset.blank => 'blank-forms' }}-PRACTICE$ext';
  String get _entity => preset == PrintPreset.bedside ? 'patient/$patientId' : 'print/${preset!.name}';

  Future<PrintJob?> _begin(int n) async {
    final app = AppScope.read(context);
    setState(() {
      busy = true;
      error = info = null;
    });
    try {
      return await buildPrintJob(app.store, _request(app, n), rootBundle.load);
    } catch (e) {
      _end(err: 'The sheets could not be made: ${_why(e)}');
      return null;
    }
  }

  void _end({String? err, String? msg}) {
    if (!mounted) {
      // The app locked or the page was left meanwhile: still say what happened.
      currentToast.value = ToastMessage(err ?? msg ?? '', err != null ? Symbols.error : Symbols.info, err != null);
      return;
    }
    setState(() {
      busy = false;
      error = err;
      info = msg;
    });
  }

  void _record(AppState app, String action, String entity, Doc after) {
    ops.recordFile(app.ctx(), action: action, entity: entity, after: after);
    _version = app.dataVersion + 1; // the change log row does not change the sheets
    app.saved();
  }

  Future<void> _print() async {
    final app = AppScope.read(context), n = copies, entity = _entity;
    final j = await _begin(n);
    if (j == null) return;
    if (!mounted || !app.signedIn) return; // left or locked while the sheets were made: nothing opens
    final bool opened;
    try {
      opened = await app.native.printPdf(_name(''), j.bytes);
    } catch (e) {
      return _end(err: 'The print screen did not open: ${_why(e)}');
    }
    if (!opened) return _end(err: 'No print service on this phone. Save the PDF instead.');
    final text = 'Sent to Android\'s print screen: ${j.pages} page${j.pages == 1 ? '' : 's'}${n > 1 ? ' ($n copies)' : ''}.';
    try {
      _record(app, 'print_made', entity, {'preset': preset!.name, 'pages': j.pages, 'copies': n, 'paper': paper.name, 'sha256': sha256Hex(j.bytes)});
      _end(msg: text);
    } catch (e) {
      _end(err: '$text The change log could not record it: ${_why(e)}');
    }
  }

  Future<void> _savePdf() async {
    final app = AppScope.read(context), entity = _entity;
    final j = await _begin(1);
    if (j == null) return;
    if (!mounted || !app.signedIn) return;
    final String? name;
    try {
      ops.recordSaving(app.ctx(), entity, _name('.pdf'), j.bytes);
      name = await app.native.saveFile(_name('.pdf'), 'application/pdf', j.bytes);
    } catch (e) {
      return _end(err: 'The PDF was not saved: ${_why(e)}');
    }
    if (name == null) return _end(msg: 'Not saved. The save screen was closed.');
    try {
      _record(app, 'file_saved', entity, {'file': name, 'preset': preset!.name, 'pages': j.pages, 'bytes': j.bytes.length, 'sha256': sha256Hex(j.bytes)});
      _end(msg: 'Saved "$name" (${j.pages} page${j.pages == 1 ? '' : 's'}). The file is not encrypted.');
    } catch (e) {
      _end(err: 'The PDF "$name" was saved, but the change log could not record it: ${_why(e)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return const ColoredBox(color: C.surface);
    final s = app.store, p = app.verifiedPatientId;
    final d = p == null ? null : loadPrintData(s, p, app.nowIso);
    final ready = !busy && !building && job != null;
    return PhonePage(
      statusColor: C.primaryContainer,
      header: _header(app, ready),
      pad: const EdgeInsets.fromLTRB(12, 12, 12, 32),
      children: [
        _status(app),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: Row(children: [
            Expanded(child: Text('DOWNTIME PRINT PRESETS', style: T.labelMd.tr(.05))),
            const SizedBox(width: 8),
            Text(paper == PaperSize.letter ? 'Laid out for 8.5×11' : 'Laid out for A4', style: T.labelSm.c(C.secondary)),
          ]),
        ),
        const SizedBox(height: 4),
        _preset(PrintPreset.ward, Symbols.folder_copy, C.secondaryContainer, C.onSecondaryContainer, 'Full Ward Clipboard Packet', '${_pages(PrintPreset.ward)}Full census, MARs, SBAR and flowsheets', 'All patients', C.secondary, C.onSecondary),
        const SizedBox(height: 4),
        _preset(PrintPreset.bedside, Symbols.warning, _amber400, C.primaryContainer, 'Emergency Bedside Packet', d == null ? 'Choose a patient; two identifiers are checked' : 'Bed ${d.facts.bed} • ${d.patient.family}, ${d.patient.given}${job != null && preset == PrintPreset.bedside ? ' (${job!.pages} pages)' : ''}',
            'One patient', C.error, C.onError,
            foot: d == null ? null : '${d.meds.length} orders, ${d.records} records${d.facts.realAllergies.isEmpty ? '' : ' and ${d.facts.realAllergies.length} allerg${d.facts.realAllergies.length == 1 ? 'y' : 'ies'}'} included'),
        const SizedBox(height: 4),
        _preset(PrintPreset.blank, Symbols.medical_services, C.surfaceContainer, C.onSurfaceVariant, 'Blank Emergency Downtime Kit', '${_pages(PrintPreset.blank)}Vitals and fluids, medication record, note and SBAR', 'Blank', C.surfaceHigh, C.onSurfaceVariant),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: Row(children: [
            const Ic(Symbols.visibility, size: 18, color: C.secondary),
            const SizedBox(width: 4),
            Expanded(child: Text('Physical Clipboard Preview', style: T.labelMd)),
            Tag(building ? 'Making the sheets…' : job == null ? 'No sheet' : 'Sheet 1 of ${job!.pages}', fg: C.secondary, style: T.unit, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
          ]),
        ),
        const SizedBox(height: 4),
        _sheet(app, d),
        const SizedBox(height: 12),
        _output(),
        const SizedBox(height: 16),
        if (error != null) ...[_message(error!, error: true), const SizedBox(height: 8)],
        if (info != null) ...[_message(info!), const SizedBox(height: 8)],
        Btn('Print $copies Cop${copies == 1 ? 'y' : 'ies'}…', icon: Symbols.print, iconSize: 22, radius: R.lg, style: T.headlineSm, busy: busy, onTap: ready ? _print : null),
        const SizedBox(height: 4),
        Row(children: [
          Expanded(child: _second(Symbols.save, 'Save PDF', ready ? _savePdf : null)),
          const SizedBox(width: 4),
          Expanded(child: Unavailable(reason: 'This app cannot share with other devices. Save the PDF instead.', child: _second(Symbols.share, 'AirDrop / Mesh', () {}))),
        ]),
      ],
    );
  }

  String _pages(PrintPreset p) => job != null && preset == p ? '${job!.pages} Pages • ' : '';

  Widget _header(AppState app, bool ready) {
    final down = app.phase == ops.Phase.down;
    return Container(
      decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0A000000), offset: Offset(0, 1), blurRadius: 8)]),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          color: C.primaryContainer,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(children: [
            Dot(down ? C.error : C.tertiaryFixedDim),
            const SizedBox(width: 4),
            Expanded(child: Text('PRACTICE • ${down ? 'EHR DOWNTIME ACTIVE' : ops.kPhaseLabel[app.phase]!.toUpperCase()}', style: T.badge.c(_amber300), maxLines: 1, overflow: TextOverflow.ellipsis)),
            const Ic(Symbols.lock, size: 14, color: C.tertiaryFixed),
            const SizedBox(width: 4),
            Text('Vault Encrypted', style: T.labelSm.c(C.tertiaryFixed)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 4, 0),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 80),
            child: Row(children: [
              Tap(label: 'Go back', onTap: () => Go.back(context), child: const Ic(Symbols.arrow_back_ios_new, size: 24)),
              Expanded(
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Offline Print & Clipboard Backup', style: T.headlineSm, maxLines: 1, overflow: TextOverflow.ellipsis),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                    decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Ic(Symbols.domain, size: 12, color: C.secondary),
                      const SizedBox(width: 4),
                      Flexible(child: Text('${_shortUnit(app.unit)} • ${app.downtime?.id ?? 'No downtime open'}', style: T.labelSm.c(C.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis)),
                    ]),
                  ),
                ]),
              ),
              Tap(label: 'Print', onTap: ready ? _print : null, child: Ic(Symbols.print, size: 22, color: ready ? C.onSurface : C.outline)),
              Tap(label: 'More', onTap: () => Go.more(context), child: Container(width: 32, height: 32, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull), child: const Ic(Symbols.person, size: 18, color: C.onPrimary))),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _status(AppState app) {
    final n = app.store.count('patient'), snap = app.store.all('snapshot').firstOrNull?['taken_at'] as String?;
    return Box(
      color: C.surfaceLow,
      shadow: true,
      pad: const EdgeInsets.all(8),
      child: Column(children: [
        Row(children: [
          const Dot(_em600, size: 10),
          const SizedBox(width: 4),
          Expanded(child: Text(app.unit, style: T.headlineSm, maxLines: 1, overflow: TextOverflow.ellipsis)),
          Tag('$n Patient${n == 1 ? '' : 's'}', bg: C.surfaceContainer, style: T.unit, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          const Ic(Symbols.schedule, size: 15, color: C.secondary),
          const SizedBox(width: 4),
          Expanded(child: Text('Snapshot: ${snap == null ? 'none' : '${hm(snap)} Local'}', style: T.bodySm.c(C.secondary))),
          Tag('Printing by Android', icon: Symbols.print, bg: C.tertiaryFixed, fg: C.tertiaryContainer, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
        ]),
      ]),
    );
  }

  Widget _preset(PrintPreset p, IconData icon, Color ib, Color ic, String title, String sub, String tag, Color tb, Color tf, {String? foot}) {
    final on = p == preset;
    return Tap(
      label: '$title. $sub',
      selected: on,
      expand: true,
      onTap: () => _pick(p),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: on ? C.primaryContainer : C.surfaceLowest, borderRadius: R.rXl, boxShadow: on ? shadowMd : shadowSm),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Row(children: [
                Container(width: 32, height: 32, decoration: BoxDecoration(color: ib, borderRadius: R.rLg), child: Ic(icon, size: 18, color: ic)),
                const SizedBox(width: 4),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title, style: T.headlineSm.c(on ? C.onPrimary : C.onSurface)),
                    Text(sub, style: T.bodySm.c(on ? C.primaryFixed : C.onSurfaceVariant)),
                  ]),
                ),
              ]),
            ),
            const SizedBox(width: 8),
            Tag(tag.toUpperCase(), bg: tb, fg: tf, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
          ]),
          if (foot != null) ...[
            const SizedBox(height: 8),
            Row(children: [
              Ic(Symbols.verified, size: 14, color: on ? _amber300 : C.secondary),
              const SizedBox(width: 8),
              Expanded(child: Text(foot, style: T.bodySm.c(on ? C.primaryFixedDim : C.onSurfaceVariant))),
            ]),
          ],
        ]),
      ),
    );
  }

  /* ---- The sheet, drawn from the same data as the document's first page ---- */

  Widget _sheet(AppState app, PrintData? d) {
    final (code, title) = switch (preset!) {
      PrintPreset.ward => ('DT-WARD-00', 'WARD CENSUS'),
      PrintPreset.bedside => ('DT-MAR-01', 'EMERGENCY DOWNTIME BACKUP RECORD'),
      PrintPreset.blank => ('DT-VIT-02', 'VITALS AND INTAKE / OUTPUT'),
    };
    return Container(
      decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowMd),
      clipBehavior: Clip.antiAlias,
      child: Stack(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
              decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase),
              child: Column(children: [
                Text('${app.unit} (fictional)'.toUpperCase(), style: T.badge.c(_n600), textAlign: TextAlign.center),
                Text(title, style: T.headlineSm.c(_n900), textAlign: TextAlign.center),
                Text('Form $code • $kPaperMark${preset == PrintPreset.blank ? ' • Blank form' : ''}', style: T.unit.c(_n500), textAlign: TextAlign.center),
              ]),
            ),
            const SizedBox(height: 8),
            if (preset == PrintPreset.ward) ..._census(app) else if (preset == PrintPreset.blank) ..._blank() else if (d != null) ..._bedside(app, d) else ..._noPatient(),
          ]),
        ),
        // Watermark of the paper, as on every page of the document.
        Positioned.fill(
          child: IgnorePointer(
            child: ExcludeSemantics(
              child: Center(
                child: Transform.rotate(
                  angle: -.489,
                  child: OverflowBox(
                    maxWidth: double.infinity,
                    child: Text('PRACTICE – FICTIONAL DATA', softWrap: false, style: T.headlineLg.s(32, 40).w(FontWeight.w800).tr(.1).c(_n900.withValues(alpha: .06))),
                  ),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  List<Widget> _noPatient() => [
        Text('Choose the patient for this packet.', style: T.bodyMd.c(_n700)),
        const SizedBox(height: 8),
        Btn('Choose patient', icon: Symbols.person_search, kind: BtnKind.navy, onTap: _choosePatient),
      ];

  Widget _bar(String l, [String? r]) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rBase),
        child: Row(children: [Expanded(child: Text(l.toUpperCase(), style: T.badge.c(_n700))), if (r != null) ...[const SizedBox(width: 8), _cap(120, Text(r.toUpperCase(), style: T.badge.c(_n700), textAlign: TextAlign.right))]]),
      );

  List<Widget> _bedside(AppState app, PrintData d) {
    final v = d.vitals.firstOrNull;
    return [
      Container(
        padding: const EdgeInsets.all(8),
        decoration: const BoxDecoration(color: _n900, borderRadius: R.rBase),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(d.nameLine, style: T.headlineMd.c(C.onPrimary).tr(-.025)),
                Text(d.birthLine, style: T.bodySm.c(_n300)),
              ]),
            ),
            const SizedBox(width: 8),
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: MediaQuery.textScalerOf(context).scale(92)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('BED ${d.facts.bed}', style: T.headlineLg.c(_amber300).w(FontWeight.w800), textAlign: TextAlign.right),
                Text('MRN: ${d.patient.mrn}', style: T.unit.c(_n300), textAlign: TextAlign.right),
              ]),
            ),
          ]),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: const BoxDecoration(color: _red700, borderRadius: R.rBase),
            child: Row(children: [
              const Ic(Symbols.emergency, size: 16, color: C.onPrimary),
              const SizedBox(width: 4),
              Expanded(child: Text(d.allergyLine, style: T.labelMd.c(C.onPrimary))),
              const SizedBox(width: 8),
              Tag('RECORDED', bg: C.onPrimary, fg: _red700, pad: const EdgeInsets.symmetric(horizontal: 4)),
            ]),
          ),
        ]),
      ),
      const SizedBox(height: 8),
      _bar('Active medications & infusions', 'Stored records'),
      if (d.meds.isEmpty) Padding(padding: const EdgeInsets.all(8), child: Text('No medication orders recorded.', style: T.bodySm.c(_n700))),
      for (final m in d.meds) ...[const SizedBox(height: 4), _med(m)],
      const SizedBox(height: 8),
      _bar('Recent bedside vitals ledger', v == null ? null : d.who(v.entry.performerId)),
      const SizedBox(height: 4),
      if (v == null)
        Padding(padding: const EdgeInsets.all(8), child: Text('Not assessed: no vital signs recorded.', style: T.bodySm.c(_n700)))
      else
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _vital('Time', hm(v.entry.careTime)),
            const SizedBox(width: 4),
            _vital('BP (mmHg)', v.vital.sys == null ? 'Not assessed' : '${v.vital.sys}/${v.vital.dia}'),
            const SizedBox(width: 4),
            _vital('HR / SpO2', '${v.vital.heartRate == null ? '—' : formatDose(v.vital.heartRate)} • ${v.vital.spo2 == null ? '—' : '${formatDose(v.vital.spo2)}%'}'),
            const SizedBox(width: 4),
            _vital('Pain/LOC', '${v.vital.pain == null ? '—' : '${formatDose(v.vital.pain)}/10'} • ${v.vital.consciousness ?? '—'}'),
          ]),
        ),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(8),
        decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rBase),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('VERIFICATION & PHYSICAL HANDOVER SIGNATURES', style: T.unit.c(_n600)),
              const SizedBox(height: 2),
              Text.rich(TextSpan(style: T.bodySm.c(_n800), children: [const TextSpan(text: 'Made for: '), TextSpan(text: staffShort(app.store, app.user!.id), style: T.bodySm.c(_n800).semi)])),
              const SizedBox(height: 2),
              Text('Checked by: ______________________', style: T.bodySm.c(_n800), maxLines: 1, overflow: TextOverflow.clip),
            ]),
          ),
          const SizedBox(width: 8),
          Column(children: [
            Container(
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              padding: const EdgeInsets.all(4),
              alignment: Alignment.center,
              width: 56,
              decoration: const BoxDecoration(color: _n900, borderRadius: R.rBase),
              child: FittedBox(child: Text('${d.records}', style: T.headlineMd.c(C.onPrimary))),
            ),
            const SizedBox(height: 2),
            Text('RECORDS', style: T.mono(9, line: 12).c(_n600)),
          ]),
        ]),
      ),
    ];
  }

  Widget _med(MedLine m) {
    final held = m.state == MedState.held;
    final (Color b, Color fg) = held ? (_red50, _red800) : (C.surfaceLow, _n700);
    final badge = held ? _red800 : m.state == MedState.given ? _em800 : _n900;
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: b, borderRadius: R.rBase),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(m.title, style: T.labelMd.c(held ? _red900 : _n900).bold)),
          const SizedBox(width: 8),
          Tag(m.status, bg: badge, fg: C.onPrimary, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
        ]),
        if (m.left.isNotEmpty || m.right.isNotEmpty)
          Row(children: [Expanded(child: Text(m.left, style: T.bodySm.c(fg))), if (m.right.isNotEmpty) ...[const SizedBox(width: 8), Flexible(child: Text(m.right, style: T.bodySm.c(fg), textAlign: TextAlign.right))]]),
        for (final l in m.lines)
          if (l != m.order.text) m.state == MedState.infusion ? Text(l, style: T.mono(12, line: 16).c(_n500)) : Text(l, style: T.bodySm.c(fg)),
      ]),
    );
  }

  Widget _vital(String label, String value) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(label.toUpperCase(), style: T.bodySm.s(10, 16).bold.c(_n500), textAlign: TextAlign.center),
            Text(value, style: T.bodySm.bold.c(_n800), textAlign: TextAlign.center),
          ]),
        ),
      );

  List<Widget> _census(AppState app) {
    final ward = loadWard(app.store, app.nowIso);
    return [
      _bar('Patients on this phone', '${ward.length}'),
      for (final f in ward) ...[
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text('${f.patient.family}, ${f.patient.given} (${f.ageSex})', style: T.labelMd.c(_n900).bold)),
              const SizedBox(width: 8),
              Tag('BED ${f.bed}', bg: _n900, fg: C.onPrimary, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
            ]),
            Text('MRN: ${f.patient.mrn} • ${f.encounter?.codeStatus ?? 'Code status not recorded'}', style: T.bodySm.c(_n700)),
            Text('Allergies: ${f.allergyText}', style: T.bodySm.c(f.realAllergies.isEmpty ? _n700 : _red800)),
          ]),
        ),
      ],
    ];
  }

  List<Widget> _blank() {
    Widget line(String l) => Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [Text('$l ', style: T.labelSm.c(_n700).bold), Expanded(child: Container(height: 18, decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _n700)))))]),
        );
    return [
      Row(children: [Expanded(flex: 3, child: line('Name')), const SizedBox(width: 8), Expanded(flex: 2, child: line('MRN'))]),
      Row(children: [Expanded(child: line('Born')), const SizedBox(width: 8), Expanded(child: line('Bed'))]),
      line('Allergies (ask the patient)'),
      const SizedBox(height: 12),
      _bar('Vital signs', 'Leave empty = not assessed'),
      Table(
        border: TableBorder.all(color: _n300),
        children: [
          TableRow(children: [for (final h in const ['Time', 'BP', 'Pulse', 'Breaths', 'Temp', 'SpO2']) Padding(padding: const EdgeInsets.all(4), child: Text(h, style: T.bodySm.s(10, 14).bold.c(_n700)))]),
          for (var i = 0; i < 6; i++) TableRow(children: [for (var k = 0; k < 6; k++) const SizedBox(height: 22)]),
        ],
      ),
    ];
  }

  Widget _output() => Box(
        color: C.surfaceLow,
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('Target Clinical Output', style: T.labelMd)),
            Tag('Chosen in Android', bg: _em100, fg: _em800, dot: _em600),
          ]),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            constraints: const BoxConstraints(minHeight: 54),
            decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg),
            child: Row(children: [
              const Ic(Symbols.print, size: 22, color: C.secondary),
              const SizedBox(width: 4),
              Expanded(
                child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Android Print Screen', style: T.headlineSm, maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text('Paper: ${paper.label}', style: T.bodySm.c(C.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
                ]),
              ),
              Tap(
                label: 'Change paper size, now ${paper.label}',
                onTap: busy
                    ? null
                    : () {
                        setState(() => paper = paper == PaperSize.letter ? PaperSize.a4 : PaperSize.letter);
                        _rebuild();
                      },
                child: Tag('Change', bg: C.surfaceContainer, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 4)),
              ),
            ]),
          ),
          const SizedBox(height: 4),
          if (MediaQuery.textScalerOf(context).scale(10) > 12) ...[_copies(), const SizedBox(height: 4), _watermark()] else
            IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(child: _copies()), const SizedBox(width: 4), Expanded(child: _watermark())])),
          const SizedBox(height: 4),
          Unavailable(
            reason: 'This app cannot send to another device. Print, or save the PDF.',
            child: Container(
              padding: const EdgeInsets.all(4),
              constraints: const BoxConstraints(minHeight: 48),
              decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg),
              child: Row(children: [
                const Ic(Symbols.bluetooth_searching, size: 20, color: C.secondary),
                const SizedBox(width: 4),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Relay to Clipboard Runner', style: T.bodySm.semi),
                    Text('Not available: no device-to-device link', style: T.unit.c(C.onSurfaceVariant)),
                  ]),
                ),
                const Ic(Symbols.check_box_outline_blank, size: 24, color: C.outline),
              ]),
            ),
          ),
        ]),
      );

  Widget _copies() => Container(
        padding: const EdgeInsets.only(left: 8),
        decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg),
        child: Row(children: [
          Expanded(child: Text('Copies', style: T.bodySm.c(C.onSurfaceVariant))),
          _step('One copy less', '-', copies > 1 && !busy ? () => setState(() => copies--) : null),
          ConstrainedBox(constraints: const BoxConstraints(minWidth: 20), child: Text('$copies', style: T.headlineSm, textAlign: TextAlign.center)),
          _step('One copy more', '+', copies < 10 && !busy ? () => setState(() => copies++) : null),
        ]),
      );

  Widget _watermark() => Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg),
        child: Row(children: [
          Expanded(child: Text('Watermark', style: T.bodySm.c(C.onSurfaceVariant))),
          Tag('ALWAYS ON', bg: C.surfaceContainer, pad: const EdgeInsets.all(4)),
        ]),
      );

  Widget _step(String label, String t, VoidCallback? onTap) => Tap(
        label: label,
        onTap: onTap,
        child: Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rBase), child: Text(t, style: T.bodyMd.bold.c(onTap == null ? C.outline : C.onSurface))),
      );

  Widget _second(IconData icon, String text, VoidCallback? onTap) => Tap(
        label: text,
        onTap: onTap,
        expand: true,
        child: Opacity(
          opacity: onTap == null ? .5 : 1,
          child: Container(
            constraints: const BoxConstraints(minHeight: 44),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg, boxShadow: shadowSm),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [Ic(icon, size: 18, color: C.secondary), const SizedBox(width: 6), Flexible(child: Text(text, style: T.labelMd))]),
          ),
        ),
      );

  Widget _message(String text, {bool error = false}) => Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: error ? C.errorContainer : C.primaryContainer, borderRadius: R.rXl),
          child: Row(children: [
            Ic(error ? Symbols.error : Symbols.check, size: 20, color: error ? C.error : C.tertiaryFixed),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: T.bodyMd.c(error ? C.onErrorContainer : C.onPrimary))),
          ]),
        ),
      );
}

/* ------------------------------ Low battery ------------------------------ */

class BatteryScreen extends StatefulWidget {
  const BatteryScreen({super.key});
  @override
  State<BatteryScreen> createState() => _BatteryScreenState();
}

class _BatteryScreenState extends State<BatteryScreen> with WidgetsBindingObserver {
  BatteryState? battery;
  (int, int)? storage;
  bool read = false;
  String? error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _read());
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _read());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _read();
  }

  Future<void> _read() async {
    if (!mounted) return;
    final n = AppScope.read(context).native;
    try {
      final b = await n.battery(), s = await n.storage();
      if (mounted) {
        setState(() {
          battery = b;
          storage = s;
          read = true;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          battery = null;
          read = true;
          error = _why(e);
        });
      }
    }
  }

  int _checkedPhotos = -1, _verifiedPhotos = 0;

  static String _gb(int b) => b >= 1073741824 ? '${(b / 1073741824).toStringAsFixed(1)} GB' : '${(b / 1048576).round()} MB';

  /// "Heparin Sodium rate changed" -> count, from confirmed high-alert records.
  Map<String, int> _highAlert(Store s) {
    final out = <String, int>{};
    for (final e in s.all('entry').map(Entry.new)) {
      if (e.type != 'med_admin' || !e.isConfirmed) continue;
      final c = s.where('med_admin', 'entry_id', e.id).firstOrNull;
      if (c == null || !isHighAlert(c['drug_name'] as String?)) continue;
      final k = '${c['drug_name']} ${(kEventLabel[c['event']] ?? '${c['event']}').toLowerCase()}';
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return const ColoredBox(color: C.surface);
    final s = app.store, frozen = s.readOnlyReason;
    final entries = s.all('entry').map(Entry.new).toList();
    final photos = s.all('m_photo');
    if (_checkedPhotos != photos.length) {
      // Reading and hashing every picture once per change, not on every rebuild.
      _checkedPhotos = photos.length;
      _verifiedPhotos = photos.where((p) => verifyPhoto(s, p['id'] as String)).length;
    }
    final high = _highAlert(s);
    return PhonePage(
      header: _header(app),
      pad: const EdgeInsets.fromLTRB(12, 4, 12, 12),
      children: [
        _banner(app),
        const SizedBox(height: 12),
        if (s.lastStorageError != null && frozen == null) ...[
          Box(color: C.errorContainer, child: Text('The last save was refused by the phone: ${s.lastStorageError}', style: T.bodySm.c(C.onErrorContainer))),
          const SizedBox(height: 12),
        ],
        _vault(
          frozen,
          confirmed: entries.where((e) => e.isConfirmed).length,
          drafts: entries.where((e) => e.isDraft).length + s.count('m_draft'),
          high: high,
          photos: photos.length,
          verified: _verifiedPhotos,
        ),
        const SizedBox(height: 12),
        _runbook(),
        const SizedBox(height: 12),
        _peers(),
        const SizedBox(height: 12),
        _paper(),
        const SizedBox(height: 24),
        _bottom(),
      ],
    );
  }

  /// Red only for facts: Android's own battery-low flag, or a store that refuses writes. The app has no threshold.
  bool _alarm(AppState app) => (battery != null && battery!.low && !battery!.charging) || app.store.readOnlyReason != null;

  Widget _header(AppState app) => Container(
        constraints: const BoxConstraints(minHeight: 64),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(color: C.surface, border: Border(bottom: BorderSide(color: C.error.withValues(alpha: .2))), boxShadow: const [BoxShadow(color: Color(0x1FBA1A1A), offset: Offset(0, 2), blurRadius: 12)]),
        child: Row(children: [
          Tap(label: 'Go back', onTap: () => Go.back(context), child: const Ic(Symbols.arrow_back, size: 24)),
          Expanded(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Ic(_alarm(app) ? Symbols.warning : Symbols.battery_full, size: 18, color: _alarm(app) ? C.error : C.onSurface),
                const SizedBox(width: 6),
                Expanded(child: Text(_alarm(app) ? 'Low Battery & Vault Freeze' : 'Battery & Vault', style: T.headlineSm.c(_alarm(app) ? C.error : C.onSurface).tr(-.025), maxLines: 2, overflow: TextOverflow.ellipsis)),
              ]),
              Text('${app.unit} • this phone', style: T.labelSm.c(C.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
            ]),
          ),
          const SizedBox(width: 8),
          Tag('PRACTICE', icon: Symbols.gpp_maybe, bg: C.errorContainer, fg: C.onErrorContainer, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
        ]),
      );

  Widget _banner(AppState app) {
    final b = battery;
    final state = b == null ? (read ? 'Not reported' : 'Reading…') : (b.charging ? 'Charging' : 'Not charging');
    final free = storage == null ? 'Storage not reported' : '${_gb(storage!.$1)} free of ${_gb(storage!.$2)}';
    const soft = Color(0xE6FFFFFF);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: _alarm(app) ? C.error : C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowMd),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(
            width: 44,
            height: 44,
            child: Stack(clipBehavior: Clip.none, children: [
              Container(decoration: const BoxDecoration(color: Color(0x33FFFFFF), borderRadius: R.rLg), alignment: Alignment.center, child: Ic(b?.charging ?? false ? Symbols.battery_charging_full : _alarm(app) ? Symbols.battery_alert : Symbols.battery_full, size: 28, color: C.onError)),
              if (_alarm(app)) const Positioned(top: -4, right: -4, child: Dot(C.errorContainer, size: 12)),
            ]),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 6, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Tag(b != null && b.low ? 'PHONE BATTERY LOW' : 'PHONE BATTERY', bg: const Color(0x40FFFFFF), fg: C.onError, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                Text(state, style: T.labelSm.c(soft)),
              ]),
              const SizedBox(height: 2),
              Text(b == null ? 'BATTERY LEVEL NOT REPORTED' : 'BATTERY ${b.percent}% REMAINING', style: T.headlineSm.s(17, 23.375).c(C.onError)),
            ]),
          ),
          const SizedBox(width: 8),
          Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: const BoxDecoration(color: Color(0x33000000), borderRadius: R.rBase), child: Text('#${app.deviceId.replaceFirst('dev-', '')}', style: T.labelSm.c(C.onError))),
        ]),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.only(top: 4),
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0x33FFFFFF)))),
          child: Row(children: [
            const Ic(Symbols.location_on, size: 16, color: soft),
            const SizedBox(width: 4),
            Expanded(child: Text(app.unit, style: T.bodySm.c(soft))),
            const SizedBox(width: 8),
            const Ic(Symbols.storage, size: 15, color: C.onError),
            const SizedBox(width: 4),
            Flexible(child: Text(free, style: T.labelSm.c(C.onError))),
          ]),
        ),
        if (error != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Android did not answer: $error', style: T.bodySm.c(C.onError))),
      ]),
    );
  }

  Widget _vault(String? frozen, {required int confirmed, required int drafts, required Map<String, int> high, required int photos, required int verified}) {
    final on = frozen != null;
    Widget row(IconData icon, String label, Widget value, {Color color = C.secondary}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            Ic(icon, size: 16, color: color),
            const SizedBox(width: 6),
            Expanded(child: Text(label, style: T.bodySm.c(C.onSurfaceVariant))),
            const SizedBox(width: 8),
            value,
          ]),
        );
    const line = Padding(padding: EdgeInsets.symmetric(vertical: 4), child: ColoredBox(color: C.surfaceHighest, child: SizedBox(height: 1, width: double.infinity)));
    final total = high.values.fold(0, (a, b) => a + b);
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(width: 32, height: 32, decoration: BoxDecoration(color: on ? C.tertiaryFixed : C.secondaryContainer, borderRadius: R.rLg), child: Ic(on ? Symbols.lock : Symbols.lock_open, size: 20, color: on ? C.onTertiaryFixed : C.onSecondaryContainer)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(on ? 'VAULT AUTO-FREEZE ENGAGED' : 'NO FREEZE POLICY IS APPROVED', style: T.headlineSm),
              Text(on ? 'Encrypted SQLite DB: reading only' : 'Encrypted SQLite DB: writing is not frozen', style: T.labelSm.s(11, 24)),
            ]),
          ),
        ]),
        const SizedBox(height: 4),
        Text(
          on
              ? 'New records are refused on this phone: $frozen Saved records can still be read.'
              : 'New records can be saved now. There is no approved battery level at which saving stops, so this phone does not stop it. If you cannot charge, change to paper forms in good time.',
          style: T.bodyMd.c(C.onSurfaceVariant),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            row(Symbols.dataset, 'Confirmed Records on This Phone', Text('$confirmed', style: T.headlineSm.c(C.primary))),
            line,
            row(Symbols.priority_high, 'High-Alert Medication Events', Tag('$total Recorded', bg: C.errorContainer, fg: C.onErrorContainer, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)), color: C.error),
            if (high.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 24),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [for (final e in high.entries) Text('• ${e.value} ${e.key}', style: T.bodySm.c(C.onSurfaceVariant))]),
              ),
            line,
            row(Symbols.document_scanner, 'Paper Chart Photos', Text(photos == 0 ? 'None' : '$verified of $photos Verified (SHA-256)', style: T.labelMd)),
            line,
            row(Symbols.edit_note, 'Drafts, Not Confirmed', Text('$drafts', style: T.labelMd)),
          ]),
        ),
      ]),
    );
  }

  Widget _runbook() {
    Widget step(int n, String title, String text) => Container(
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(margin: const EdgeInsets.only(top: 2), width: 24, height: 24, alignment: Alignment.center, decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rFull), child: Text('$n', style: T.labelMd.c(C.onPrimary))),
            const SizedBox(width: 8),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: T.labelMd), const SizedBox(height: 2), Text(text, style: T.bodySm.c(C.onSurfaceVariant))])),
          ]),
        );
    return Box(
      color: C.surfaceLow,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Ic(Symbols.assignment_late, size: 20, color: C.secondary),
          const SizedBox(width: 6),
          Expanded(child: Text('Emergency Runbook', style: T.headlineSm)),
          const SizedBox(width: 8),
          Tag('PRACTICE STEPS', bg: C.secondaryContainer, fg: C.secondary),
        ]),
        const SizedBox(height: 8),
        step(1, 'Plug In the Charger', 'Use any charger on the ward. The battery level on this page is read again every 30 seconds.'),
        const SizedBox(height: 4),
        step(2, 'Use Paper Forms if the Phone Will Switch Off', 'Write on the paper downtime forms. Type them in later with the time the care was given.'),
        const SizedBox(height: 4),
        step(3, 'After a Restart', 'Saved records stay encrypted on this phone and are read again after the next unlock. A form that was not saved has to be written again.'),
      ]),
    );
  }

  Widget _peers() => Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Dot(C.outlineVariant, size: 10),
            const SizedBox(width: 6),
            Expanded(child: Text('NO OTHER PHONES ARE LINKED', style: T.badge.c(C.secondary))),
            const SizedBox(width: 8),
            Text('No Link', style: T.labelSm.c(C.onSurfaceVariant)),
          ]),
          const SizedBox(height: 4),
          Unavailable(
            reason: 'This app does not look for other phones.',
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: C.secondaryContainer.withValues(alpha: .4), borderRadius: R.rLg),
                child: Row(children: [
                  Container(width: 40, height: 40, decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rFull), child: const Ic(Symbols.person, size: 20, color: C.onPrimary)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Second Nurse Handheld', style: T.labelMd),
                      Text('Phone-to-phone transfer is not built', style: T.bodySm.c(C.onSurfaceVariant)),
                    ]),
                  ),
                  const Ic(Symbols.link_off, size: 16, color: C.onTertiaryFixedVariant),
                ]),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
                child: Row(children: [
                  const Ic(Symbols.smartphone, size: 18, color: C.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Other ward phones', style: T.bodySm)),
                  Text('Not visible', style: T.labelSm.c(C.onSurfaceVariant)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 12),
          Unavailable(reason: 'Records cannot be sent to another phone. Print them, or use paper forms.', child: Btn('Beam Session Vault', radius: R.xl, icon: Symbols.wifi_tethering, onTap: () {})),
        ]),
      );

  Widget _paper() => Box(
        color: C.surfaceLow,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 32, height: 32, decoration: const BoxDecoration(color: C.surfaceHighest, borderRadius: R.rLg), child: const Ic(Symbols.receipt_long, size: 20)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(child: Text('Emergency Paper Print', style: T.headlineSm)),
                const SizedBox(width: 8),
                Tag('OPEN', bg: C.surfaceHighest, fg: C.onSurface, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
              ]),
              const SizedBox(height: 2),
              Text('Ward packet, bedside packet or blank forms, with Android\'s own print screen or as a PDF file.', style: T.bodySm.c(C.onSurfaceVariant)),
              const SizedBox(height: 6),
              Btn('Open Physical Ledger Print', kind: BtnKind.quiet, bg: C.surfaceHighest, height: 44, radius: R.lg, icon: Symbols.print, iconSize: 18, onTap: () => Go.print(context)),
            ]),
          ),
        ]),
      );

  Widget _bottom() => Container(
        padding: const EdgeInsets.all(12),
        decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowMd),
        child: Column(children: [
          Unavailable(reason: 'This app has no Bluetooth or Wi-Fi transfer. Use the charger, print, or paper forms.', child: Btn('Initiate Urgent BLE Peer Handoff', kind: BtnKind.danger, radius: R.xl, icon: Symbols.send_to_mobile, iconSize: 22, onTap: () {})),
          const SizedBox(height: 12),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Ic(Symbols.verified_user, size: 16),
            const SizedBox(width: 6),
            Flexible(child: Text('Saved records are encrypted on this phone', style: T.labelSm.c(C.onSurfaceVariant), textAlign: TextAlign.center)),
          ]),
        ]),
      );
}
