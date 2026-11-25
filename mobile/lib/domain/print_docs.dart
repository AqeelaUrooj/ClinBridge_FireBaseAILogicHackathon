import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../core/clock.dart';
import '../data/repos/ops.dart';
import '../data/schema.dart';
import '../data/store.dart';
import 'charting.dart';
import 'facts.dart';
import 'meds.dart';

/// Paper copies of the stored records (sheets DT-MAR-01, DT-VIT-02, DT-SBAR-03 of the web app) and blank downtime forms.
/// Everything printed is read from the records; nothing is calculated except plain fluid sums. No barcodes, no scores.
/// Drafts and records marked as a mistake are never printed. Every page says that the data is fictional.
const String kPaperMark = 'PRACTICE – fictional data';
const String kPaperStrip = 'PRACTICE · FICTIONAL PATIENTS · NOT A MEDICAL RECORD';

enum PrintPreset { ward, bedside, blank }

enum PaperSize {
  letter('Letter (8.5 × 11 in)'),
  a4('A4 (210 × 297 mm)');

  final String label;
  const PaperSize(this.label);
  PdfPageFormat get format => this == letter ? PdfPageFormat.letter : PdfPageFormat.a4;
}

/// Reads a bundled font file (rootBundle.load in the app, a file in tests).
typedef ByteLoader = Future<ByteData> Function(String asset);

/* ------------------------------ Facts for the sheets (also drawn by the on-screen preview) ------------------------------ */

enum MedState { infusion, given, held, refused, prn, none }

class MedLine {
  final ActiveOrder order;
  final String title, status, left, right;
  final MedState state;

  /// Reason, second check, who: stored facts only.
  final List<String> lines;
  const MedLine(this.order, this.title, this.status, this.state, {this.left = '', this.right = '', this.lines = const []});
}

String _when(String iso, String nowIso) => iso.substring(0, 10) == nowIso.substring(0, 10) ? hm(iso) : '${hm(iso)}, ${dayLabel(iso)}';

class PrintData {
  final PatientFacts facts;
  final List<MedLine> meds;

  /// Confirmed records, newest first.
  final List<EntryX> medEvents, vitals, fluids, notes, labs;
  final HandoffWithTime? handoff;
  final Map<String, String> staff;
  const PrintData(this.facts, this.meds, this.medEvents, this.vitals, this.fluids, this.notes, this.labs, this.handoff, this.staff);

  Patient get patient => facts.patient;
  Encounter? get encounter => facts.encounter;

  /// Confirmed records on these sheets.
  int get records => medEvents.length + vitals.length + fluids.length + notes.length + labs.length;
  String who(String id) => staff[id] ?? id;

  String get nameLine => '${patient.family.toUpperCase()}, ${patient.given.toUpperCase()}';
  String get sexText => patient.sex.isEmpty ? 'sex not recorded' : '${patient.sex[0].toUpperCase()}${patient.sex.substring(1)}';
  String get birthLine => 'DOB: ${dayLabel(patient.birthDate)} (${facts.age}y) • $sexText • Attending: ${encounter?.attending ?? 'not recorded'}';

  /// "ALLERGIES: PENICILLIN (ANAPHYLAXIS), LATEX (CONTACT DERMATITIS)"
  String get allergyLine {
    final real = facts.realAllergies;
    if (real.isNotEmpty) return 'ALLERGIES: ${real.map((a) => '${a.substance}${a.reaction == null ? '' : ' (${a.reaction})'}').join(', ').toUpperCase()}';
    return facts.allergies.isEmpty ? 'ALLERGIES NOT RECORDED' : 'NO KNOWN ALLERGIES RECORDED';
  }
}

PrintData? loadPrintData(Store s, String patientId, String nowIso) {
  final f = loadFacts(s, patientId, nowIso);
  if (f == null) return null;
  List<EntryX> of(String type) => [for (final x in f.entries) if (x.entry.type == type && x.entry.isConfirmed && x.child != null) x];
  final staff = {for (final p in s.all('practitioner')) p['id'] as String: staffShort(s, p['id'] as String)};
  final meds = of('med_admin');
  return PrintData(f, _medLines(s, f, meds, staff), meds, of('vital_sign'), of('intake_output'), of('note'), of('lab_event'), listHandoffs(s, patientId).firstOrNull, staff);
}

List<MedLine> _medLines(Store s, PatientFacts f, List<EntryX> confirmed, Map<String, String> staff) {
  String who(String id) => staff[id] ?? id;
  final out = <MedLine>[];
  for (final o in f.medOrders) {
    final hist = orderHistory(o, confirmed);
    final last = hist.firstOrNull;
    final group = orderGroup(o);
    final hold = [for (final h in s.where('m_order_hold', 'order_id', o.id)) if (h['released_at'] == null) h].firstOrNull;
    final by = last == null ? null : 'Recorded by ${who(last.entry.performerId)} at ${_when(last.entry.careTime, f.nowIso)}';
    final check = last?.med.doubleCheckedBy == null ? null : 'Second nurse check: ${who(last!.med.doubleCheckedBy!)}';
    final ordered = [if (o.frequency != null) o.frequency!, if (o.scheduledTimes.isNotEmpty) o.scheduledTimes.join(', ')].join(' • ');
    final open = [for (final sl in slotStatuses(o, f.nowIso, f.meds)) if (sl.status == 'due' && ms(sl.time) <= ms(f.nowIso)) hm(sl.time)];
    if (hold != null || last?.med.event == 'held') {
      final reason = (last?.med.event == 'held' ? last!.med.reason : null) ?? hold?['reason'] as String? ?? 'not recorded';
      out.add(MedLine(o, doseLine(o), 'HELD', MedState.held, left: ordered, lines: ['Reason: $reason', if (by != null) by]));
    } else if (group == OrderGroup.infusion) {
      final (rate, unit) = currentRate(o, confirmed);
      final change = [for (final x in hist) if (x.med.event == 'rate_changed') x].firstOrNull;
      out.add(MedLine(
        o,
        '${o.drugName ?? o.text} infusion',
        'INFUSION',
        MedState.infusion,
        left: rate == null ? 'Rate: not recorded' : 'Rate: ${grouped(rate)} ${unit ?? ''}'.trim(),
        right: change == null ? 'Rate as ordered' : 'Rate recorded ${_when(change.entry.careTime, f.nowIso)}',
        lines: [
          o.text,
          if (change != null) ['By ${who(change.entry.performerId)}', if (change.med.doubleCheckedBy != null) 'second check ${who(change.med.doubleCheckedBy!)}'].join(' / '),
        ],
      ));
    } else {
      final at = last == null ? '' : _when(last.entry.careTime, f.nowIso);
      final (status, state) = last == null
          ? (group == OrderGroup.prn ? ('AS NEEDED', MedState.prn) : ('NO RECORD', MedState.none))
          : last.med.event == 'refused'
              ? ('REFUSED $at', MedState.refused)
              : ('GIVEN $at', MedState.given);
      out.add(MedLine(o, doseLine(o), status, state, left: ordered, lines: [
        if (open.isNotEmpty) 'No record yet for ${open.join(', ')}',
        if (last?.med.event == 'refused') 'Reason: ${last!.med.reason ?? 'not recorded'}',
        if (by != null) by,
        if (check != null) check,
      ]));
    }
  }
  int rank(MedLine m) => orderGroup(m.order) == OrderGroup.infusion
      ? 0
      : orderGroup(m.order) == OrderGroup.prn
          ? 3
          : m.state == MedState.held
              ? 2
              : 1;
  final indexed = [for (var i = 0; i < out.length; i++) (i, out[i])]..sort((a, b) => rank(a.$2) != rank(b.$2) ? rank(a.$2) - rank(b.$2) : a.$1 - b.$1);
  return [for (final x in indexed) x.$2];
}

/// "Not assessed" stays words; a recorded 0 is shown as 0.
String vitalText(num? v, [String unit = '']) => v == null ? 'Not assessed' : '${formatDose(v)}$unit';

/* ------------------------------ The document ------------------------------ */

class PrintRequest {
  final PrintPreset preset;
  final PaperSize paper;

  /// The whole set of pages is repeated this many times inside the document.
  final int copies;
  final String? patientId;
  final String printedBy, nowIso, unit;
  final String? eventId;
  const PrintRequest({required this.preset, this.paper = PaperSize.letter, this.copies = 1, this.patientId, required this.printedBy, required this.nowIso, required this.unit, this.eventId});
}

class PrintJob {
  final Uint8List bytes;

  /// Pages of the generated document (counted after it was laid out).
  final int pages, copies;
  final int patients, records;
  const PrintJob(this.bytes, this.pages, this.copies, this.patients, this.records);
  int get pagesPerCopy => pages ~/ copies;
}

class _Fonts {
  final pw.ThemeData theme;
  final pw.Font mono;
  const _Fonts(this.theme, this.mono);
}

Future<_Fonts> _loadFonts(ByteLoader load) async {
  final f = <pw.Font>[];
  for (final n in const ['Inter-400', 'Inter-700', 'RobotoMono-Regular', 'Roboto-Regular']) {
    f.add(pw.Font.ttf(await load('assets/fonts/$n.ttf')));
  }
  return _Fonts(pw.ThemeData.withFont(base: f[0], bold: f[1], italic: f[0], boldItalic: f[1], fontFallback: [f[3]]), f[2]);
}

Future<PrintJob> buildPrintJob(Store s, PrintRequest r, ByteLoader load, {bool compress = true}) async {
  final fonts = await _loadFonts(load);
  final doc = pw.Document(compress: compress, title: 'ClinBridge Practice paper copy', author: 'ClinBridge Practice (fictional data)');
  final data = switch (r.preset) {
    PrintPreset.blank => <PrintData>[],
    PrintPreset.bedside => [loadPrintData(s, r.patientId!, r.nowIso)!],
    PrintPreset.ward => [for (final f in loadWard(s, r.nowIso)) loadPrintData(s, f.patient.id, r.nowIso)!],
  };
  final b = _Builder(r, fonts, s.all('snapshot').firstOrNull?['taken_at'] as String?);
  for (var copy = 0; copy < r.copies; copy++) {
    if (r.preset == PrintPreset.ward) doc.addPage(b.census(data));
    for (final d in data) {
      doc.addPage(b.medication(d));
      doc.addPage(b.vitals(d));
      doc.addPage(b.notes(d));
      await Future<void>.delayed(Duration.zero); // lets the screen draw between patients
    }
    if (r.preset == PrintPreset.blank) b.blankForms().forEach(doc.addPage);
  }
  final bytes = await doc.save();
  return PrintJob(bytes, doc.document.pdfPageList.pages.length, r.copies, data.length, data.fold(0, (n, d) => n + d.records));
}

const _black = PdfColors.black, _grey = PdfColor.fromInt(0xFFE7E8EB), _mid = PdfColor.fromInt(0xFF525252);

class _Builder {
  final PrintRequest r;
  final _Fonts fonts;
  final String? snapshotAt;
  _Builder(this.r, this.fonts, this.snapshotAt);

  pw.TextStyle st(double size, {bool bold = false, PdfColor color = _black}) => pw.TextStyle(fontSize: size, fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal, color: color, lineSpacing: 1);
  pw.Text t(String v, {double size = 8.5, bool bold = false, PdfColor color = _black, pw.TextAlign? align}) => pw.Text(v, style: st(size, bold: bold, color: color), textAlign: align);

  pw.PageTheme get _page => pw.PageTheme(
        pageFormat: r.paper.format,
        margin: const pw.EdgeInsets.fromLTRB(30, 26, 30, 26),
        theme: fonts.theme,
        buildBackground: (_) => pw.FullPage(
          ignoreMargins: true,
          child: pw.Center(child: pw.Transform.rotateBox(angle: .5, child: t(kPaperMark, size: 42, bold: true, color: const PdfColor.fromInt(0xFFE6E6EA)))),
        ),
      );

  pw.MultiPage _sheet(String code, String title, List<pw.Widget> Function() body, {PrintData? d, bool blank = false}) => pw.MultiPage(
        pageTheme: _page,
        maxPages: 200,
        header: (c) => _header(code, title, d, blank),
        footer: (c) => _footer(c, code),
        build: (c) => body(),
      );

  pw.Widget _header(String code, String title, PrintData? d, bool blank) => pw.Padding(
        padding: const pw.EdgeInsets.only(bottom: 8),
        child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
          pw.Container(
            padding: const pw.EdgeInsets.symmetric(vertical: 2),
            decoration: pw.BoxDecoration(border: pw.Border.all(width: 1.2)),
            child: t(kPaperStrip, size: 9, bold: true, align: pw.TextAlign.center),
          ),
          pw.SizedBox(height: 4),
          pw.Container(
            color: _grey,
            padding: const pw.EdgeInsets.all(5),
            child: pw.Column(children: [
              t(r.unit.toUpperCase(), size: 7.5, bold: true, color: _mid),
              t(title.toUpperCase(), size: 13, bold: true),
              t('Form $code${blank ? ' • BLANK FORM: nothing is filled in' : ''} • Downtime ${r.eventId ?? 'none open'}', size: 7.5, color: _mid),
            ]),
          ),
          if (d != null) ...[pw.SizedBox(height: 4), _identity(d)],
          if (blank) ...[pw.SizedBox(height: 6), _blankIdentity()],
        ]),
      );

  pw.Widget _identity(PrintData d) => pw.Container(
        color: const PdfColor.fromInt(0xFF171717),
        padding: const pw.EdgeInsets.all(6),
        child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
          pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Expanded(
              child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                t(d.nameLine, size: 15, bold: true, color: PdfColors.white),
                t('${d.birthLine} • Code status: ${d.encounter?.codeStatus ?? 'not recorded'}', size: 8, color: PdfColors.white),
              ]),
            ),
            pw.SizedBox(width: 10),
            pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
              t('BED ${d.facts.bed}', size: 15, bold: true, color: PdfColors.white),
              pw.Text('MRN: ${d.patient.mrn}', style: pw.TextStyle(font: fonts.mono, fontSize: 9, color: PdfColors.white)),
            ]),
          ]),
          pw.SizedBox(height: 4),
          pw.Container(
            color: PdfColors.white,
            padding: const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 3),
            child: t('${d.allergyLine}${d.encounter?.isolation == null ? '' : '   ISOLATION: ${d.encounter!.isolation!.toUpperCase()}'}', size: 9, bold: true, color: const PdfColor.fromInt(0xFFB91C1C)),
          ),
        ]),
      );

  pw.Widget _field(String label, {int flex = 1}) => pw.Expanded(
        flex: flex,
        child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
          t('$label ', size: 8, bold: true),
          pw.Expanded(child: pw.Container(height: 16, decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(width: .7))))),
          pw.SizedBox(width: 8),
        ]),
      );

  pw.Widget _blankIdentity() => pw.Column(children: [
        pw.Row(children: [_field('Name', flex: 3), _field('MRN', flex: 2), _field('Bed')]),
        pw.Row(children: [_field('Born', flex: 2), _field('Allergies (ask the patient)', flex: 4)]),
      ]);

  pw.Widget _footer(pw.Context c, String code) => pw.Container(
        padding: const pw.EdgeInsets.only(top: 3),
        decoration: const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(width: .7))),
        child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
          pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
            pw.Expanded(child: t('Form $code • made by ClinBridge Practice ${dateTimeLabel(r.nowIso)} for ${r.printedBy}${snapshotAt == null ? '' : ' • patient list from ${dateTimeLabel(snapshotAt)}'}', size: 7)),
            t('Page ${c.pageNumber}', size: 7),
          ]),
          t('$kPaperMark. Anything written on this sheet is not in ClinBridge until a nurse types it in.', size: 7, bold: true),
        ]),
      );

  pw.Widget _section(String title, [String? note]) => pw.Container(
        margin: const pw.EdgeInsets.only(top: 8, bottom: 3),
        padding: const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 2.5),
        color: _grey,
        child: pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [pw.Expanded(child: t(title.toUpperCase(), size: 8.5, bold: true)), if (note != null) t(note, size: 7.5)]),
      );

  pw.Widget _table(List<String> head, List<List<String>> rows, {Map<int, pw.TableColumnWidth>? widths, double rowHeight = 0}) => pw.Table(
        border: pw.TableBorder.all(width: .5),
        columnWidths: widths ?? {for (var i = 0; i < head.length; i++) i: const pw.FlexColumnWidth()},
        children: [
          pw.TableRow(repeat: true, decoration: const pw.BoxDecoration(color: _grey), children: [for (final h in head) pw.Padding(padding: const pw.EdgeInsets.all(3), child: t(h, size: 7.5, bold: true))]),
          for (final row in rows)
            pw.TableRow(children: [
              for (final v in row) pw.Container(constraints: pw.BoxConstraints(minHeight: rowHeight), padding: const pw.EdgeInsets.all(3), child: t(v, size: 8)),
            ]),
        ],
      );

  pw.Widget _none(String what) => pw.Padding(padding: const pw.EdgeInsets.all(4), child: t('No $what recorded.', color: _mid));

  List<pw.Widget> _lines(int n) => [for (var i = 0; i < n; i++) pw.Container(height: 18, decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(width: .4))))];

  pw.Widget _signatures() => pw.Padding(
        padding: const pw.EdgeInsets.only(top: 10),
        child: pw.Column(children: [
          pw.Row(children: [_field('Checked against the chart by', flex: 4), _field('Time'), _field('Signature', flex: 2)]),
          pw.Row(children: [_field('Received by', flex: 4), _field('Time'), _field('Signature', flex: 2)]),
        ]),
      );

  String _at(String iso) => _when(iso, r.nowIso);

  /* ---- Sheets ---- */

  pw.Page census(List<PrintData> all) => _sheet('DT-WARD-00', 'Ward census', () => [
        _section('Patients on this phone', '${all.length} patients'),
        _table(const ['Bed', 'Patient', 'MRN', 'Born', 'Allergies', 'Code status', 'Latest vitals'], [
          for (final d in all)
            [
              d.facts.bed,
              '${d.patient.family}, ${d.patient.given} (${d.facts.ageSex})',
              d.patient.mrn,
              dayLabel(d.patient.birthDate),
              d.allergyLine.replaceFirst('ALLERGIES: ', ''),
              d.encounter?.codeStatus ?? 'not recorded',
              d.vitals.isEmpty ? 'Not assessed' : '${_at(d.vitals.first.entry.careTime)} • ${d.vitals.first.vital.sys == null ? 'BP not assessed' : 'BP ${d.vitals.first.vital.sys}/${d.vitals.first.vital.dia}'}',
            ],
        ], widths: const {0: pw.FixedColumnWidth(38), 1: pw.FlexColumnWidth(2), 2: pw.FlexColumnWidth(1.2), 3: pw.FlexColumnWidth(1.2), 4: pw.FlexColumnWidth(2.2), 5: pw.FlexColumnWidth(1.1), 6: pw.FlexColumnWidth(1.6)}),
        _signatures(),
      ]);

  pw.Page medication(PrintData d) => _sheet('DT-MAR-01', 'Emergency downtime backup record', d: d, () => [
        _section('Active medications and infusions', 'From the stored orders and records'),
        if (d.meds.isEmpty) _none('medication orders'),
        for (final m in d.meds)
          pw.Container(
            margin: const pw.EdgeInsets.only(bottom: 3),
            padding: const pw.EdgeInsets.all(4),
            decoration: pw.BoxDecoration(border: pw.Border.all(width: m.state == MedState.held ? 1.4 : .5)),
            child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
              pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
                pw.Expanded(child: t(m.title, size: 9.5, bold: true)),
                pw.Container(color: _black, padding: const pw.EdgeInsets.symmetric(horizontal: 4, vertical: 1.5), child: t(m.status, size: 7.5, bold: true, color: PdfColors.white)),
              ]),
              if (m.left.isNotEmpty || m.right.isNotEmpty) pw.Row(children: [pw.Expanded(child: t(m.left)), t(m.right)]),
              for (final l in m.lines) t(l, size: 8),
            ]),
          ),
        _section('Recent bedside vitals ledger', d.vitals.isEmpty ? null : 'Recorded ${_at(d.vitals.first.entry.careTime)} by ${d.who(d.vitals.first.entry.performerId)}'),
        if (d.vitals.isEmpty) _none('vital signs') else _vitalTable(d.vitals.take(1).toList()),
        _section('Medication events', '${d.medEvents.length} confirmed records'),
        if (d.medEvents.isEmpty)
          _none('medication events')
        else
          _table(const ['Time', 'Drug', 'What happened', 'Amount', 'Route', 'By', 'Second check'], [
            for (final x in d.medEvents)
              [
                _at(x.entry.careTime),
                x.med.drugName,
                kEventLabel[x.med.event] ?? x.med.event,
                x.med.event == 'rate_changed'
                    ? '${formatDose(x.med.rate)} ${x.med.rateUnit ?? ''}'
                    : x.med.doseGiven == null
                        ? (x.med.reason ?? 'not recorded')
                        : '${formatDose(x.med.doseGiven)} ${x.med.doseGivenUnit ?? ''}',
                x.med.route ?? 'not recorded',
                d.who(x.entry.performerId),
                x.med.doubleCheckedBy == null ? '' : d.who(x.med.doubleCheckedBy!),
              ],
          ], widths: const {0: pw.FlexColumnWidth(1), 1: pw.FlexColumnWidth(1.8), 2: pw.FlexColumnWidth(1.2), 3: pw.FlexColumnWidth(2), 4: pw.FlexColumnWidth(.9), 5: pw.FlexColumnWidth(1.5), 6: pw.FlexColumnWidth(1.5)}),
        _signatures(),
      ]);

  pw.Widget _vitalTable(List<EntryX> rows, {int blanks = 0}) => _table(const ['Time', 'BP mmHg', 'Pulse /min', 'Breathing /min', 'Temp °C', 'SpO2 %', 'Oxygen', 'Pain /10', 'Awake', 'Glucose mg/dL'], [
        for (final x in rows)
          [
            _at(x.entry.careTime),
            x.vital.sys == null ? 'Not assessed' : '${x.vital.sys}/${x.vital.dia}',
            vitalText(x.vital.heartRate),
            vitalText(x.vital.respRate),
            vitalText(x.vital.tempC),
            vitalText(x.vital.spo2),
            x.vital.o2Device == null ? 'not recorded' : '${x.vital.o2Device}${x.vital.o2Flow == null ? '' : ' ${formatDose(x.vital.o2Flow)} L/min'}',
            vitalText(x.vital.pain),
            x.vital.consciousness ?? 'Not assessed',
            vitalText(x.vital.glucose),
          ],
        for (var i = 0; i < blanks; i++) List.filled(10, ''),
      ], rowHeight: blanks > 0 ? 18 : 0);

  pw.Page vitals(PrintData d) {
    final (i, o, net) = d.facts.io;
    return _sheet('DT-VIT-02', 'Vitals ledger and fluid balance', d: d, () => [
          _section('Vital signs', '${d.vitals.length} confirmed records, newest first; empty rows to write in'),
          _vitalTable(d.vitals, blanks: 6),
          _section('Intake and output', 'Today: in ${formatDose(i)} mL, out ${formatDose(o)} mL, difference ${formatDose(net)} mL (plain sums)'),
          _table(const ['Time', 'In or out', 'Kind', 'Amount mL', 'Method', 'By'], [
            for (final x in d.fluids) [_at(x.entry.careTime), x.io.direction == 'in' ? 'In' : 'Out', ioLabel(x.io.direction, x.io.category), formatDose(x.io.volumeMl), x.io.method ?? 'not recorded', d.who(x.entry.performerId)],
            for (var k = 0; k < 4; k++) List.filled(6, ''),
          ], rowHeight: 16),
          if (d.labs.isNotEmpty) ...[
            _section('Lab events', '${d.labs.length} confirmed records'),
            _table(const ['Time', 'Test', 'Status', 'Result', 'By'], [
              for (final x in d.labs) [_at(x.entry.careTime), x.lab.testName, labLabel(x.lab.status), x.lab.valueNum != null ? '${formatDose(x.lab.valueNum)} ${x.lab.unit ?? ''}' : x.lab.valueText ?? 'no result', d.who(x.entry.performerId)],
            ]),
          ],
        ]);
  }

  /// Long text is a direct child of the page, so it can continue on the next one.
  pw.Widget _long(String v) => pw.Text(v, style: st(9), overflow: pw.TextOverflow.span);

  pw.Page notes(PrintData d) {
    final h = d.handoff;
    return _sheet('DT-SBAR-03', 'Nursing notes and SBAR handover', d: d, () => [
          _section('SBAR handover', h == null ? null : '${h.handoff.shift} • by ${d.who(h.handoff.createdBy)}${h.savedAt == null ? ' • from the practice dataset' : ' • saved ${_at(h.savedAt!)}'}'),
          if (h == null)
            _none('SBAR handover')
          else
            for (final (label, text) in [
              ('Situation', h.handoff.situation),
              ('Background', h.handoff.background),
              ('Assessment', h.handoff.assessment),
              ('Open items', h.handoff.openItems.isEmpty ? 'None written' : h.handoff.openItems.join('; ')),
            ]) ...[
              t(label, bold: true),
              _long(text),
              pw.SizedBox(height: 3),
            ],
          _section('Nursing notes', '${d.notes.length} confirmed records'),
          if (d.notes.isEmpty) _none('nursing notes'),
          for (final x in d.notes) ...[
            t('${_at(x.entry.careTime)} • ${noteLabel(x.note.category)}${x.note.scoreName == null ? '' : ' (${x.note.scoreName} ${formatDose(x.note.scoreValue)})'} • ${d.who(x.entry.performerId)}', bold: true),
            _long(x.note.text),
            pw.SizedBox(height: 4),
          ],
          _section('Write here'),
          ..._lines(6),
          _signatures(),
        ]);
  }

  List<pw.Page> blankForms() => [
        _sheet('DT-VIT-02', 'Vitals and intake / output', blank: true, () => [
              _section('Vital signs', 'Leave a box empty when it was not assessed'),
              _vitalTable(const [], blanks: 12),
              _section('Intake and output'),
              _table(const ['Time', 'In or out', 'Kind', 'Amount mL', 'Method', 'By'], [for (var i = 0; i < 8; i++) List.filled(6, '')], rowHeight: 18),
              _signatures(),
            ]),
        _sheet('DT-MAR-01', 'Medication record', blank: true, () => [
              _section('Medication events', 'Given, held, refused or rate changed'),
              _table(const ['Time', 'Drug', 'What happened', 'Dose or rate, unit', 'Route', 'Reason', 'Nurse', 'Second nurse'], [for (var i = 0; i < 18; i++) List.filled(8, '')],
                  rowHeight: 22,
                  widths: const {0: pw.FixedColumnWidth(40), 1: pw.FlexColumnWidth(2.2), 2: pw.FlexColumnWidth(1.4), 3: pw.FlexColumnWidth(1.5), 4: pw.FlexColumnWidth(.9), 5: pw.FlexColumnWidth(1.6), 6: pw.FlexColumnWidth(1.1), 7: pw.FlexColumnWidth(1.1)}),
              _signatures(),
            ]),
        _sheet('DT-SBAR-03', 'Note and SBAR handover', blank: true, () => [
              for (final (title, n) in const [('Situation', 4), ('Background', 4), ('Assessment', 4), ('Recommendation / open items', 4), ('Nursing notes', 6)]) ...[_section(title), ..._lines(n)],
              _signatures(),
            ]),
      ];
}
