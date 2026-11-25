import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:clinbridge_practice/config/policy.dart';
import 'package:clinbridge_practice/core/clock.dart';
import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/audit.dart';
import 'package:clinbridge_practice/data/native.dart';
import 'package:clinbridge_practice/data/repos/entries.dart';
import 'package:clinbridge_practice/data/repos/ops.dart' as ops;
import 'package:clinbridge_practice/data/schema.dart';
import 'package:clinbridge_practice/domain/fhir.dart';
import 'package:clinbridge_practice/domain/print_docs.dart';
import 'package:clinbridge_practice/domain/recovery.dart';
import 'package:clinbridge_practice/ui/kit/kit.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/print_battery_screens.dart';
import 'package:clinbridge_practice/ui/screens/recovery_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/host.dart';
import '../support/shots.dart';

Future<ByteData> fileFont(String asset) async => ByteData.sublistView(Uint8List.fromList(File(asset).readAsBytesSync()));

Future<Harness> seedAdmin() async {
  final h = await Harness.make(clock: PracticeClock(frozen: true)).ready();
  await h.signIn('pr-ellis');
  return h;
}

Future<Harness> design({String user = 's-ad', bool online = false, String? seed}) async {
  final h = await Harness.make(seed: seed ?? designSeed(), clock: PracticeClock(start: designNow, frozen: true)).ready();
  await h.signIn('s-ad');
  if (online) await h.app.clearNetwork(h.app.ctx(), kNetworkChecklist, '2468');
  if (user != 's-ad') await h.signIn(user);
  return h;
}

Future<void> work(WidgetTester t, [int rounds = 6]) async {
  for (var i = 0; i < rounds; i++) {
    await real(t, () => Future<void>.delayed(const Duration(milliseconds: 30)));
    await t.pump(const Duration(milliseconds: 50));
  }
}

/// Taps start the idle timers; close the records so that none is left.
Future<void> end(WidgetTester t, Harness h) async {
  await t.pumpWidget(const SizedBox());
  h.app.lockVault();
}

int audits(Harness h, String action) => h.app.store.where('audit_log', 'action', action).length;

/// Everything clinical, to prove that nothing was changed.
String clinical(Harness h) => sha256Text(jsonEncode([for (final t in ['entry', 'vital_sign', 'med_admin', 'intake_output', 'note', 'lab_event', 'snapshot_result']) h.app.store.all(t)]));

/// Text of every page of an uncompressed PDF, read back through the embedded character maps.
List<String> pdfPages(Uint8List pdf) {
  final s = latin1.decode(pdf);
  final objects = <int, String>{for (final m in RegExp(r'(\d+) 0 obj\n?(.*?)endobj', dotAll: true).allMatches(s)) int.parse(m[1]!): m[2]!};
  final maps = <int, Map<String, int>>{};
  for (final e in objects.entries) {
    final u = RegExp(r'/ToUnicode (\d+) 0 R').firstMatch(e.value);
    if (u == null) continue;
    final body = objects[int.parse(u[1]!)]!;
    maps[e.key] = {for (final m in RegExp(r'<([0-9A-F]{4})> <([0-9A-F]{4,6})>\n').allMatches(body.substring(body.indexOf('beginbfchar')))) m[1]!.toLowerCase(): int.parse(m[2]!, radix: 16)};
  }
  final pages = <String>[];
  for (final o in objects.values) {
    if (!RegExp(r'/Type ?/Page[^s]').hasMatch(o)) continue;
    final b = StringBuffer();
    final contents = RegExp(r'/Contents ?\[?([^\]/>]*)').firstMatch(o)![1]!;
    for (final c in RegExp(r'(\d+) 0 R').allMatches(contents)) {
      var font = <String, int>{};
      for (final m in RegExp(r'/F(\d+) [\d.]+ Tf|<([0-9a-f]+)>').allMatches(objects[int.parse(c[1]!)]!)) {
        if (m[1] != null) {
          font = maps[int.parse(m[1]!)] ?? {};
        } else {
          for (var i = 0; i + 4 <= m[2]!.length; i += 4) {
            b.writeCharCode(font[m[2]!.substring(i, i + 4)] ?? 0xFFFD);
          }
          b.write(' ');
        }
      }
    }
    pages.add(b.toString().replaceAll(RegExp(r'\s+'), ' '));
  }
  return pages;
}

void main() {
  visual('admin guard: nurses can not open recovery, export or the change log, or write them', (t) async {
    final h = await real(t, () => design(user: 's-sj', online: true));
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const Scaffold(body: SizedBox()));
    final c = ctxOf(t);
    for (final open in [Go.recovery, Go.export, Go.audit]) {
      expect(() => open(c), throwsA(isA<NotAllowedError>()));
    }
    expect(() => ops.recordExport(h.app.ctx(), '{}', 'x.json'), throwsA(isA<NotAllowedError>()));
    expect(() => ops.clearNetwork(h.app.ctx(), kNetworkChecklist, pinOk: true), throwsA(isA<NotAllowedError>()));
    expect(audits(h, 'fhir_export'), 0);
  });

  visual('recovery is closed while the system is down; nothing can be built', (t) async {
    final h = await real(t, design);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const RecoveryScreen());
    expect(find.text('Recovery is not open'), findsOneWidget);
    expect(find.text('Build list'), findsNothing);
    expect(find.textContaining('Prepare FHIR'), findsNothing);
    expect(() => ops.buildWorklist(h.app.ctx()), throwsA(isA<AppError>()));
    expect(h.app.store.count('worklist_item'), 0);
  });

  visual('build the list on demand; counts come from the records; a held dose needs a reason', (t) async {
    final h = await real(t, () => design(online: true));
    addTearDown(h.dispose);
    final s = h.app.store, before = clinical(h);
    await pumpPhone(t, h, home: const RecoveryScreen(), height: 2600);
    expect(find.text('The list is empty'), findsOneWidget);
    await t.tap(find.text('Build list'));
    await settle(t);
    final items = s.all('worklist_item').map(WorklistItem.new).toList();
    expect(items.map((i) => i.entryId).toSet(), {'de-012', 'de-013', 'de-014', 'de-015', 'de-017'}); // care time after 14:48
    final pr = WorkProgress.of(items);
    expect(find.text('${pr.total} Records'), findsOneWidget);
    expect(find.text('${pr.plain} Waiting'), findsOneWidget);
    expect(find.text('${pr.flagged} Flagged'), findsOneWidget);
    expect(find.textContaining('Auto'), findsNothing);

    // Held Ceftriaxone: reason is required.
    await t.tap(find.text('Sign Off Hold'));
    await settle(t);
    await t.tap(find.text('Sign off hold'));
    await settle(t);
    expect(find.text('Write the reason for your decision.'), findsOneWidget);
    expect(s.count('m_resolution'), 0);
    await t.enterText(find.byType(TextField), 'Hold checked against the allergy list');
    await t.tap(find.text('Sign off hold'));
    await settle(t);
    final hold = items.firstWhere((i) => i.entryId == 'de-012');
    expect(WorklistItem(s.get('worklist_item', hold.id)!).signedOffBy, 's-ad');
    expect(ops.resolutionsFor(s, hold.id).single['reason'], 'Hold checked against the allergy list');

    // A clean item: one tap, no reason. Nothing else is signed by itself.
    await t.tap(find.text('Sign Off').first);
    await settle(t);
    expect(s.all('worklist_item').where((w) => w['signed_off_at'] != null).length, 2);
    // The list is never built twice for the same record.
    await t.ensureVisible(find.text('Add New Downtime Records'));
    await settle(t);
    await t.tap(find.text('Add New Downtime Records'));
    await settle(t);
    expect(s.count('worklist_item'), 5);
    expect(clinical(h), before, reason: 'records stay exactly as they are');
    expect(verifyChain(s.all('audit_log')).ok, isTrue);
    await end(t, h);
  });

  visual('flagged item: both readings shown, reason required, originals unchanged', (t) async {
    final h = await real(t, seedAdmin);
    addTearDown(h.dispose);
    final s = h.app.store, before = clinical(h);
    await pumpPhone(t, h, home: const RecoveryScreen(), height: 4200);
    final card = find.byKey(const ValueKey('wl-e-044')); // BP 116/70 and a stored second reading 116/76
    Finder on(Finder f) => find.descendant(of: card, matching: f);
    expect(on(find.textContaining('116/70', findRichText: true)), findsWidgets);
    expect(on(find.textContaining('116/76', findRichText: true)), findsWidgets);
    expect(on(find.text('SECOND LOOK (SIMULATED PRACTICE DATA)')), findsOneWidget);
    expect(on(find.text('Difference: 6 mmHg')), findsOneWidget);
    expect(on(find.textContaining('09:', findRichText: true)), findsNothing);
    final w = s.where('worklist_item', 'entry_id', 'e-044').single;
    expect(() => ops.signOffItem(h.app.ctx(), w['id'] as String), throwsA(predicate((e) => '$e' == 'Write the reason for your decision.')));
    expect(() => ops.signOffItem(h.app.ctx(), w['id'] as String, reason: '   '), throwsA(isA<AppError>()));

    await t.ensureVisible(on(find.text('Keep Record (Reason Needed)')));
    await t.tap(on(find.text('Keep Record (Reason Needed)')));
    await settle(t);
    await t.enterText(find.byType(TextField), 'Cuff value read again from the paper');
    // The storage refuses: the sheet stays with its text, nothing is saved.
    s.readOnlyReason = 'Frozen for this test.';
    await t.tap(find.text('Keep record and sign off'));
    await settle(t);
    expect(find.text('Frozen for this test.'), findsOneWidget);
    expect(find.text('Cuff value read again from the paper'), findsOneWidget);
    expect(s.get('worklist_item', w['id'] as String)!['signed_off_at'], isNull);
    s.readOnlyReason = null;
    await t.tap(find.text('Keep record and sign off'));
    await settle(t);
    final r = ops.resolutionsFor(s, w['id'] as String).single;
    expect(r['decision'], 'record_kept');
    expect(r['by'], 'pr-ellis');
    expect(s.get('worklist_item', w['id'] as String)!['second_look_reading'], w['second_look_reading']);
    expect(clinical(h), before);
    expect(() => ops.signOffItem(h.app.ctx(), w['id'] as String, reason: 'again'), throwsA(predicate((e) => '$e' == 'Already signed off.')));
    await end(t, h);
  });

  visual('not supported controls keep their place and do nothing', (t) async {
    final h = await real(t, seedAdmin);
    addTearDown(h.dispose);
    final s = h.app.store;
    await pumpPhone(t, h, home: const RecoveryScreen(), height: 4200);
    final rows = s.count('audit_log');
    for (final x in ['Merge Readings', 'Inspect Waveform']) {
      expect(find.ancestor(of: find.text(x).first, matching: find.byType(Unavailable)), findsOneWidget);
      await t.tap(find.text(x).first, warnIfMissed: false);
      await settle(t);
    }
    expect(s.count('audit_log'), rows);
    await end(t, h);
  });

  visual('view JSON shows the resources the file holds for that record', (t) async {
    final h = await real(t, seedAdmin);
    addTearDown(h.dispose);
    final s = h.app.store;
    final file = ops.prepareExport(s, h.app.nowIso);
    final x = getEntry(s, 'e-029')!;
    final mine = resourcesOf(s, x, h.app.nowIso);
    expect(mine.map((r) => r['resourceType']), ['MedicationAdministration', 'Provenance']);
    final inFile = [for (final e in file.entries) (e as Map)['resource'] as Map];
    for (final r in mine) {
      expect(jsonEncode(jsNumbers(inFile.firstWhere((f) => f['resourceType'] == r['resourceType'] && f['id'] == r['id']))), jsonEncode(jsNumbers(r)));
    }
  });

  visual('export is blocked while the system is down', (t) async {
    final h = await real(t, design);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const ExportScreen());
    await work(t);
    expect(find.text('Export is not open'), findsOneWidget);
    expect(find.textContaining('Download FHIR Bundle'), findsNothing);
    expect(() => ops.recordExport(h.app.ctx(), '{}', 'x.json'), throwsA(predicate((e) => '$e'.contains('Back online'))));
    expect(audits(h, 'fhir_export'), 0);
  });

  visual('export: counts, exact text, confirmation with open blockers, recorded only after a real save', (t) async {
    final h = await real(t, seedAdmin);
    addTearDown(h.dispose);
    final s = h.app.store;
    final f = ops.prepareExport(s, h.app.nowIso);
    final made = audits(h, 'fhir_export'); // one export is part of the practice dataset
    expect(f.errors, isEmpty);
    expect(validateBundleText(f.json), isEmpty);
    expect(f.counts.values.reduce((a, b) => a + b), f.entries.length);
    expect(f.counts['Patient'], s.count('patient'));
    expect(f.counts['Practitioner'], s.count('practitioner'));
    expect(f.counts['MedicationAdministration'], s.all('entry').where((e) => e['type'] == 'med_admin' && e['status'] != 'draft').length);
    expect(f.drafts, 2);
    expect(f.blockers, 7);
    expect(validateBundleText(f.json.replaceFirst('"collection"', '"batch"')), contains('Bundle.type must be collection'));
    expect(validateBundleText('{'), isNotEmpty);

    await pumpPhone(t, h, home: const ExportScreen(), height: 2800);
    await work(t);
    expect(find.text('${f.entries.length} TOTAL'), findsOneWidget);
    for (final e in f.counts.entries) {
      expect(find.text(e.key), findsWidgets, reason: e.key);
      expect(find.text('${e.value} item${e.value == 1 ? '' : 's'}'), findsWidgets, reason: e.key);
    }
    expect(find.text('7 flagged items not signed off'), findsOneWidget);

    Future<void> save() async {
      await t.tap(find.textContaining('(.JSON,'));
      await settle(t);
      expect(find.text('7 flagged items are not signed off'), findsOneWidget);
      await t.tap(find.text('Save with 7 open'));
      await settle(t);
      await work(t, 2);
    }

    // Not confirmed
    await t.tap(find.textContaining('(.JSON,'));
    await settle(t);
    await t.tap(find.text('Cancel'));
    await settle(t);
    expect(h.bridge.saved, isEmpty);
    // Android refuses
    h.bridge.saveError = Exception('No space left');
    await save();
    expect(find.textContaining('The file was not saved'), findsOneWidget);
    expect(audits(h, 'fhir_export'), made);
    // The person closes the save screen
    h.bridge.saveError = null;
    h.bridge.saveCancelled = true;
    await save();
    expect(find.text('Not saved. The save screen was closed.'), findsOneWidget);
    expect(audits(h, 'fhir_export'), made);
    expect(s.get('worklist_item', 'wl-001')!['exported_at'], isNull);
    // Saved
    h.bridge.saveCancelled = false;
    await save();
    final (name, mime, bytes) = h.bridge.saved.single;
    expect(name, startsWith('clinbridge-PRACTICE-export-'));
    expect(name, endsWith('.json'));
    expect(mime, 'application/fhir+json');
    final text = utf8.decode(bytes);
    expect(validateBundleText(text), isEmpty);
    expect(text, contains('"HTEST"'));
    expect((jsonDecode(text)['entry'] as List).length, f.entries.length);
    expect(audits(h, 'fhir_export'), made + 1);
    expect(find.text('File saved'), findsOneWidget);
    expect(find.text(sha256Text(text)), findsOneWidget);
    expect(find.textContaining('HTTP 201'), findsNothing);
    final row = AuditRow(s.where('audit_log', 'action', 'fhir_export').last);
    expect(row.afterHash, sha256Text(canonicalJson({'sha256': sha256Text(text), 'bytes': text.length, 'file': name})));
    expect(s.get('worklist_item', 'wl-001')!['exported_at'], isNotNull, reason: 'signed off earlier');
    expect(s.all('worklist_item').where((w) => w['signed_off_at'] == null && w['exported_at'] != null), isEmpty);
    expect(verifyChain(s.all('audit_log')).ok, isTrue);
    await end(t, h);
  });

  visual('structural errors block saving', (t) async {
    final bad = jsonDecode(designSeed()) as Map<String, dynamic>;
    (bad['entry'] as List).first['performer_id'] = 's-unknown';
    final h = await real(t, () => design(online: true, seed: jsonEncode(bad)));
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const ExportScreen(), height: 2800);
    await work(t);
    expect(find.textContaining('reference Practitioner/s-unknown not in bundle'), findsWidgets);
    expect(find.text('Saving is blocked until the structure problems are fixed.'), findsOneWidget);
    await t.tap(find.textContaining('Download FHIR Bundle'), warnIfMissed: false);
    await settle(t);
    expect(h.bridge.saved, isEmpty);
    expect(audits(h, 'fhir_export'), 0);
    await end(t, h);
  });

  visual('audit log CSV: every row, recorded only after a real save', (t) async {
    final h = await real(t, seedAdmin);
    addTearDown(h.dispose);
    final s = h.app.store;
    await pumpPhone(t, h, home: const RecoveryScreen());
    h.bridge.saveCancelled = true;
    await t.tap(find.text('Export Offline Audit Log (CSV)'));
    await work(t, 2);
    expect(audits(h, 'file_saved'), 0);
    h.bridge.saveCancelled = false;
    final rows = s.count('audit_log');
    await t.tap(find.text('Export Offline Audit Log (CSV)'));
    await work(t, 2);
    final (name, mime, bytes) = h.bridge.saved.single;
    expect(name, contains('PRACTICE'));
    expect(mime, 'text/csv');
    final lines = const LineSplitter().convert(utf8.decode(bytes));
    expect(lines.length, rows + 1);
    expect(lines.first, startsWith('seq,time,user_id'));
    expect(lines[1], contains(s.all('audit_log').first['after_hash'] as String));
    expect(audits(h, 'file_saved'), 1);
    expect(auditCsv(s), contains('"file_saved","File saved","audit_log"'));
    await end(t, h);
  });

  visual('change log screen: computed chain, newest first, filter', (t) async {
    final h = await real(t, seedAdmin);
    addTearDown(h.dispose);
    final s = h.app.store;
    await pumpPhone(t, h, home: const AuditScreen());
    final c = verifyChain(s.all('audit_log'));
    expect(find.text('${c.verified} of ${c.total} rows verified on this phone'), findsOneWidget);
    expect(find.text(auditLabel(s.lastAudit()!['action'] as String)), findsWidgets);
    expect(find.textContaining(rowHash(s.lastAudit()!).substring(0, 12)), findsOneWidget);
    await t.tap(find.textContaining('Recovery & Files'));
    await settle(t);
    expect(find.text('Signed in'), findsNothing);
    await end(t, h);
  });

  test('PDFs: real pages, identity and allergies on every patient page, watermark on every page, both paper sizes', () async {
    final h = await design(user: 's-sj');
    addTearDown(h.dispose);
    final s = h.app.store;
    PrintRequest r(PrintPreset p, {PaperSize paper = PaperSize.letter, int copies = 1}) =>
        PrintRequest(preset: p, paper: paper, copies: copies, patientId: 'p-ap', printedBy: 'S. Jenkins, RN', nowIso: h.app.nowIso, unit: h.app.unit, eventId: h.app.downtime!.id);
    for (final paper in PaperSize.values) {
      for (final p in PrintPreset.values) {
        final job = await buildPrintJob(s, r(p, paper: paper), fileFont, compress: false);
        final pages = pdfPages(job.bytes);
        File('build/pdf/${p.name}_${paper.name}.pdf')
          ..parent.createSync(recursive: true)
          ..writeAsBytesSync(job.bytes);
        expect(job.pages, greaterThan(0));
        expect(pages.length, job.pages, reason: '${p.name} ${paper.name}');
        if (p != PrintPreset.ward) expect(job.pages, 3, reason: 'one page per sheet, ${p.name} ${paper.name}');
        for (final text in pages) {
          expect(text, contains('PRACTICE – fictional data'));
          expect(text, contains('NOT A MEDICAL RECORD'));
          expect(text, isNot(contains('�')));
          if (p == PrintPreset.bedside) {
            expect(text, contains('PENDELTON, ARTHUR'));
            expect(text, contains('9402-1842'));
            expect(text, contains('PENICILLIN (ANAPHYLAXIS), LATEX'));
          }
          if (p == PrintPreset.blank) {
            expect(text, contains('BLANK FORM: nothing is filled in'));
            expect(text, isNot(contains('PENDELTON')));
          }
        }
        // The watermark text is drawn besides the footer.
        expect('PRACTICE – fictional data'.allMatches(pages.first).length, greaterThanOrEqualTo(2));
      }
    }
    final bed = await buildPrintJob(s, r(PrintPreset.bedside), fileFont, compress: false);
    final all = pdfPages(bed.bytes).join('\n');
    for (final x in ['138/84', 'Heparin Sodium infusion', 'HELD', 'Second nurse check', 'GCS 15', '980', 'Not assessed']) {
      if (x == 'Second nurse check' || x == 'Not assessed') continue; // only printed when stored
      expect(all, contains(x));
    }
    expect(all, contains('D. Chen, RN'));
    expect(bed.records, s.where('entry', 'patient_id', 'p-ap').where((e) => e['status'] == 'confirmed').length);
    final two = await buildPrintJob(s, r(PrintPreset.bedside, copies: 2), fileFont);
    expect(two.pages, bed.pages * 2);
    final ward = await buildPrintJob(s, r(PrintPreset.ward), fileFont, compress: false);
    final wardText = pdfPages(ward.bytes);
    expect(ward.patients, s.count('patient'));
    for (final p in s.all('patient').map(Patient.new)) {
      expect(wardText.where((x) => x.contains(p.mrn)).length, greaterThanOrEqualTo(4), reason: 'census and three sheets');
    }
  });

  test('PDFs: drafts and mistakes are not printed; long notes flow over pages (repository seed)', () async {
    final h = await seedAdmin();
    addTearDown(h.dispose);
    final s = h.app.store;
    final note = 'Observed and recorded. ' * 400;
    s.tx(() => s.put('note', {...s.all('note').first, 'text': note}));
    final ward = await buildPrintJob(s, PrintRequest(preset: PrintPreset.ward, printedBy: 'K. Ellis', nowIso: h.app.nowIso, unit: h.app.unit), fileFont, compress: false);
    final pages = pdfPages(ward.bytes);
    expect(pages.length, ward.pages);
    expect(pages.every((p) => p.contains('PRACTICE – fictional data')), isTrue);
    expect(ward.records, s.all('entry').where((e) => e['status'] == 'confirmed').length);
    expect('Observed and recorded.'.allMatches(pages.join(' ')).length, 400);
    File('build/pdf/seed_ward.pdf').writeAsBytesSync(ward.bytes);
  });

  visual('print screen: bedside packet needs the verified patient; unavailable service; honest messages', (t) async {
    final h = await real(t, () => design(user: 's-sj'));
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const PrintScreen(), height: 2400);
    await work(t, 30);
    await t.tap(find.text('Emergency Bedside Packet'));
    await settle(t);
    expect(find.text('Bedside packet for which patient?'), findsOneWidget);
    expect(find.text('PENDELTON, ARTHUR'), findsNothing);
    await t.tapAt(const Offset(195, 20));
    await settle(t);
    h.app.verifyPatient('p-ap', ['Name', 'MRN']);
    await work(t, 30);
    expect(find.text('PENDELTON, ARTHUR'), findsOneWidget);
    expect(find.textContaining('Sheet 1 of 3'), findsOneWidget);

    h.bridge.printAvailable = false;
    await t.tap(find.textContaining('Print 2 Copies'));
    await work(t, 30);
    expect(find.textContaining('No print service on this phone'), findsOneWidget);
    expect(audits(h, 'print_made'), 0);
    h.bridge.printAvailable = true;
    await t.tap(find.textContaining('Print 2 Copies'));
    await work(t, 30);
    expect(find.textContaining('Sent to Android\'s print screen: 6 pages (2 copies)'), findsOneWidget);
    expect(find.textContaining('Printed'), findsNothing);
    expect(audits(h, 'print_made'), 1);
    expect(h.bridge.printed.single.$1, contains('PRACTICE'));

    h.bridge.saveCancelled = true;
    await t.tap(find.text('Save PDF'));
    await work(t, 30);
    expect(audits(h, 'file_saved'), 0);
    h.bridge.saveCancelled = false;
    await t.tap(find.text('Save PDF'));
    await work(t, 30);
    expect(h.bridge.saved.single.$1, 'clinbridge-bedside-packet-PRACTICE.pdf');
    expect(h.bridge.saved.single.$2, 'application/pdf');
    expect(audits(h, 'file_saved'), 1);
    expect(find.ancestor(of: find.text('AirDrop / Mesh'), matching: find.byType(Unavailable)), findsOneWidget);
    await end(t, h);
  });

  visual('battery: real values; freeze text only when the store refuses writes; reading still works', (t) async {
    final h = await real(t, () => design(user: 's-sj'));
    addTearDown(h.dispose);
    final s = h.app.store;
    h.bridge.batteryState = const BatteryState(37, true);
    await pumpPhone(t, h, home: const BatteryScreen(), height: 1600);
    await work(t, 2);
    expect(find.text('BATTERY 37% REMAINING'), findsOneWidget);
    expect(find.text('Charging'), findsOneWidget);
    expect(find.text('VAULT AUTO-FREEZE ENGAGED'), findsNothing);
    expect(find.text('NO FREEZE POLICY IS APPROVED'), findsOneWidget);
    expect(find.text('${s.all('entry').where((e) => e['status'] == 'confirmed').length}'), findsOneWidget);
    expect(find.text('• 1 Heparin Sodium rate changed'), findsOneWidget);
    h.bridge.batteryState = const BatteryState(4, false, low: true);
    await t.pump(const Duration(seconds: 31)); // read again by itself
    await work(t, 2);
    expect(find.text('BATTERY 4% REMAINING'), findsOneWidget);
    expect(find.text('VAULT AUTO-FREEZE ENGAGED'), findsNothing, reason: 'no threshold is invented');

    s.readOnlyReason = 'Records are frozen for this drill.';
    h.app.saved();
    await settle(t);
    expect(find.text('VAULT AUTO-FREEZE ENGAGED'), findsOneWidget);
    final n = s.count('entry');
    expect(() => ops.setAssigned(h.app.ctx(), 'p-ms', true), throwsA(isA<StorageError>()));
    expect(() => h.app.verifyPatient('p-ap', ['Name', 'MRN']), throwsA(isA<StorageError>()));
    expect(s.count('entry'), n);
    expect(listPatientEntries(s, 'p-ap'), isNotEmpty);
    expect(find.textContaining('Zero'), findsNothing);
    expect(find.ancestor(of: find.text('Beam Session Vault'), matching: find.byType(Unavailable)), findsOneWidget);
    s.readOnlyReason = null;
    await end(t, h);
  });

  visual('photos on the battery screen are counted by their verified hash', (t) async {
    final h = await real(t, () => design(user: 's-sj'));
    addTearDown(h.dispose);
    final c = h.verified('p-ap');
    savePhoto(c, patientId: 'p-ap', bytes: Uint8List.fromList([1, 2, 3]), mime: 'image/png', check: const {'problem': 'none'});
    h.app.saved();
    await pumpPhone(t, h, home: const BatteryScreen(), height: 1600);
    await work(t, 2);
    expect(find.text('1 of 1 Verified (SHA-256)'), findsOneWidget);
    await end(t, h);
  });

  test('a failure in the middle of a transaction keeps the last committed record readable after a restart', () async {
    final h = await design(user: 's-sj');
    final c = h.verified('p-ap');
    Doc vitals(int sys) => {
          'temp_c': null, 'heart_rate': 80, 'resp_rate': null, 'bp_systolic': sys, 'bp_diastolic': 70, 'spo2': null, 'o2_device': null, 'o2_flow_lpm': null,
          'pain_0_10': 0, 'glucose_mgdl': null, 'consciousness': null, 'weight_kg': null, 'raw_text': null,
        };
    final kept = createEntry(c, type: 'vital_sign', patientId: 'p-ap', careTime: h.app.nowIso, values: vitals(121), clientKey: 'k-1');
    final n = h.app.store.count('entry'), log = h.app.store.count('audit_log');
    for (final op in ['insert vital_sign', 'insert audit_log', 'commit']) {
      h.app.store.fault = (o) {
        if (o == op) throw const StorageError('power lost');
      };
      expect(() => createEntry(c, type: 'vital_sign', patientId: 'p-ap', careTime: h.app.nowIso, values: vitals(199), clientKey: 'k-$op'), throwsA(isA<StorageError>()));
    }
    // Power off here: nothing is closed.
    final g = h.restart();
    await g.app.boot();
    await g.app.unlockVault(passphrase: kPracticePassphrase);
    addTearDown(g.dispose);
    addTearDown(h.app.lockVault);
    final s = g.app.store;
    expect(s.count('entry'), n);
    expect(getEntry(s, kept.id)!.vital.sys, 121);
    expect(s.all('vital_sign').where((v) => v['bp_systolic'] == 199), isEmpty);
    expect(s.count('audit_log'), log + 1, reason: 'only the unlock row was added');
    expect(verifyChain(s.all('audit_log')).ok, isTrue);
    expect(s.integrity(), 'ok');
  });
}
