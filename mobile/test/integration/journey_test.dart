import 'dart:convert';

import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/audit.dart';
import 'package:clinbridge_practice/data/native.dart';
import 'package:clinbridge_practice/data/repos/entries.dart';
import 'package:clinbridge_practice/data/repos/ops.dart' as ops;
import 'package:clinbridge_practice/data/schema.dart';
import 'package:clinbridge_practice/domain/fhir.dart';
import 'package:clinbridge_practice/state/app_state.dart';
import 'package:clinbridge_practice/ui/kit/kit.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/admin_screens.dart';
import 'package:clinbridge_practice/ui/screens/body_map_screen.dart';
import 'package:clinbridge_practice/ui/screens/companion_screens.dart';
import 'package:clinbridge_practice/ui/screens/entry_screens.dart';
import 'package:clinbridge_practice/ui/screens/handover_screens.dart';
import 'package:clinbridge_practice/ui/screens/med_screens.dart';
import 'package:clinbridge_practice/ui/screens/paper_screens.dart';
import 'package:clinbridge_practice/ui/screens/patient_screens.dart';
import 'package:clinbridge_practice/ui/screens/recovery_screens.dart';
import 'package:clinbridge_practice/ui/screens/vitals_screens.dart';
import 'package:clinbridge_practice/ui/screens/ward_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

import '../support/host.dart';
import '../support/shots.dart';

/* End-to-end journeys across the screen groups: real widgets from the opening page on, real core, real SQLCipher, the
 * dataset the installed app ships (assets/seed). Nothing a person does on the screen is done through h.app here;
 * the store is only read to check what was saved. */

const park = 'Jordan Park, RN', alvarez = 'Maria Alvarez, RN', okafor = 'Daniel Okafor, RN', whitfield = 'Sara Whitfield, LPN', ellis = 'Kim Ellis';

/// Times the app asked Android to close it (Back on a root page).
int exits = 0;

/* ------------------------------ The person at the phone ------------------------------ */

Iterable<String> screenText() => find.byType(RichText).evaluate().map((e) => (e.widget as RichText).text.toPlainText()).where((s) => s.trim().isNotEmpty && s.runes.any((r) => r > 32 && r < 0xE000));

void notBlank(String after) => expect(screenText(), isNotEmpty, reason: 'blank page after $after');

Finder sem(Pattern p) => find.byWidgetPredicate((w) => w is Semantics && w.properties.label != null && (p is RegExp ? p.hasMatch(w.properties.label!) : w.properties.label == p), description: 'control labelled $p');

Finder what(Object o) {
  if (o is Finder) return o;
  if (o is RegExp) return sem(o);
  final f = find.text(o as String);
  return f.evaluate().isNotEmpty ? f : sem(o);
}

/// Real work (PIN hashing, files, isolates) and then the frames after it.
Future<void> work(WidgetTester t, [int ms = 40]) async {
  await real(t, () => Future<void>.delayed(Duration(milliseconds: ms)));
  await settle(t);
}

Future<void> until(WidgetTester t, Finder f, {int tries = 80}) async {
  for (var i = 0; i < tries && f.evaluate().isEmpty; i++) {
    await real(t, () => Future<void>.delayed(const Duration(milliseconds: 50)));
    await t.pump(const Duration(milliseconds: 50));
  }
  if (f.evaluate().isEmpty) fail('never shown: $f\non screen: ${screenText().join(' | ')}');
  await settle(t);
}

Future<void> press(WidgetTester t, Object o, {bool last = false, bool twice = false, bool wait = false}) async {
  final f = what(o);
  if (f.evaluate().isEmpty) fail('not on screen: $o\non screen: ${screenText().join(' | ')}');
  final one = last ? f.last : f.first;
  await t.ensureVisible(one);
  await t.pump(const Duration(milliseconds: 300));
  final at = t.getCenter(one);
  await t.tap(one);
  if (twice) await t.tapAt(at);
  await settle(t);
  if (wait) await work(t, 80);
  notBlank(o is Finder ? 'a tap' : '$o');
}

Finder field(Pattern label) => find.descendant(of: sem(label), matching: find.byType(TextField));
Future<void> write(WidgetTester t, Object where, String text) async {
  final f = where is Finder ? where : field(where as Pattern);
  if (f.evaluate().isEmpty) fail('no field $where\non screen: ${screenText().join(' | ')}');
  await t.ensureVisible(f.first);
  await t.enterText(f.first, text);
  await settle(t);
}

/// Android Back. Returns true when the app asked to be closed.
Future<bool> back(WidgetTester t) async {
  final n = exits;
  await t.binding.handlePopRoute();
  await settle(t);
  if (exits == n) notBlank('Android back');
  return exits > n;
}

Future<void> pin(WidgetTester t, String digits) async {
  for (final d in digits.split('')) {
    final f = find.widgetWithText(Tap, d);
    await t.ensureVisible(f.first);
    await t.tap(f.first);
    await t.pump(const Duration(milliseconds: 30));
  }
  await settle(t);
}

Future<void> cosignPin(WidgetTester t, String digits) async {
  for (final d in digits.split('')) {
    await t.ensureVisible(find.byKey(ValueKey('pin-$d')));
    await t.tap(find.byKey(ValueKey('pin-$d')));
    await t.pump(const Duration(milliseconds: 30));
  }
  await settle(t);
}

Btn btn(WidgetTester t, String text) => t.widget<Btn>(find.widgetWithText(Btn, text));

/* ------------------------------ Steps shared by the journeys ------------------------------ */

/// First launch on an empty phone: opening page, vault setup, roster.
Future<Harness> firstLaunch(WidgetTester t, {double width = 390, double height = 844, double textScale = 1}) async {
  final h = Harness.make();
  addTearDown(h.dispose);
  exits = 0;
  t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (c) async {
    if (c.method == 'SystemNavigator.pop') exits++;
    return null;
  });
  addTearDown(() => t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
  await pumpPhone(t, h, width: width, height: height, textScale: textScale);
  expect(find.byType(OpeningScreen), findsOneWidget);
  await real(t, () => h.app.boot());
  await settle(t);
  await press(t, 'Get started');
  expect(find.byType(VaultScreen), findsOneWidget);
  await press(t, 'Create encrypted Practice store');
  await until(t, find.byType(SelectStaffScreen));
  return h;
}

Future<void> choose(WidgetTester t, String who) async {
  await press(t, sem(RegExp('^${RegExp.escape(who)}, ')));
  await press(t, 'Continue with $who');
  expect(find.byType(PinScreen), findsOneWidget);
}

Future<void> signIn(WidgetTester t, String who) async {
  await choose(t, who);
  await pin(t, '2468');
  await press(t, 'Sign in to 4 West');
  await until(t, who == ellis ? find.byType(ReadinessScreen) : find.byType(WardScreen));
}

Future<void> verifyBoth(WidgetTester t) async {
  expect(find.byType(VerifyPatientScreen), findsOneWidget);
  expect(btn(t, 'Confirm Patient & Open Chart').onTap, isNull, reason: 'nothing is ticked at the start');
  await press(t, 'Name confirmed verbally & band');
  expect(btn(t, 'Confirm Patient & Open Chart').onTap, isNull);
  await press(t, 'MRN matched on physical wristband');
  await press(t, 'Confirm Patient & Open Chart');
}

Finder card(String family) => find.textContaining(RegExp('\\w $family  '), findRichText: true);

/// From the ward: search, open, confirm both identifiers.
Future<void> openPatient(WidgetTester t, String family) async {
  expect(find.byType(WardScreen), findsOneWidget);
  await write(t, 'Search patient, bed, or MRN', family);
  await press(t, card(family));
  await verifyBoth(t);
  expect(find.byType(PatientSummaryScreen), findsOneWidget);
}

/// The number on the Queue tab of the chart.
int queue() => int.parse(RegExp(r'^Queue \((\d+)\)$').firstMatch(screenText().firstWhere((s) => s.startsWith('Queue (')))![1]!);

/// The + of the chart.
Future<void> add(WidgetTester t, String item) async {
  await press(t, find.byKey(const ValueKey('nav-add')));
  expect(find.byType(AddBedsideScreen), findsOneWidget);
  await press(t, item);
}

Future<void> toWard(WidgetTester t) async {
  for (var i = 0; i < 8 && find.byType(WardScreen).evaluate().isEmpty; i++) {
    await back(t);
  }
  expect(find.byType(WardScreen), findsOneWidget);
}

/// Ward header: sign out, back to the roster.
Future<void> signOut(WidgetTester t) async {
  await press(t, sem(RegExp(r'lock or sign out$')));
  await press(t, 'Sign out');
  await until(t, find.byType(SelectStaffScreen));
}

Future<void> done(WidgetTester t, Harness h) async {
  final c = verifyChain(h.app.store.all('audit_log'));
  expect(c.ok, isTrue, reason: 'change log in order');
  await t.pumpWidget(const SizedBox());
  h.app.lockVault();
  await t.pump(const Duration(seconds: 10));
}

/* ------------------------------ Reading the store ------------------------------ */

List<EntryX> entriesOf(Harness h, String patient, [String? type]) => [for (final x in listPatientEntries(h.app.store, patient)) if (type == null || x.entry.type == type) x];
List<EntryX> medsOf(Harness h, String patient, String order) => [for (final x in entriesOf(h, patient, 'med_admin')) if (x.med.orderId == order) x];
List<Doc> audits(Harness h, String action) => h.app.store.where('audit_log', 'action', action);

Uint8List paperForm(String name) {
  final im = img.Image(width: 1200, height: 900);
  img.fill(im, color: img.ColorRgb8(150, 146, 138));
  img.fillRect(im, x1: 40, y1: 36, x2: 1160, y2: 864, color: img.ColorRgb8(250, 250, 246));
  final ink = img.ColorRgb8(20, 28, 50);
  img.drawString(im, 'FICTIONAL PRACTICE FORM  $name', font: img.arial24, x: 80, y: 70, color: ink);
  for (var y = 150; y < 840; y += 70) {
    img.drawLine(im, x1: 70, y1: y, x2: 1130, y2: y, color: ink, thickness: 2);
    img.drawString(im, 'Line $y  25 mg PO  16:12  SJ', font: img.arial48, x: 90, y: y + 8, color: ink);
  }
  return img.encodeJpg(im, quality: 85);
}

/// Chart → + → Paper photo → upload → both ticks → keep → the empty draft with the photo.
Future<String> keepPaper(WidgetTester t, Harness h, String type, String name) async {
  final bytes = paperForm(name);
  h.bridge.picked = PickedImage(bytes, 'image/jpeg');
  await add(t, 'Paper photo');
  expect(find.byType(PaperCaptureScreen), findsOneWidget);
  await press(t, RegExp('^Document type'));
  await press(t, type);
  await press(t, 'Upload Scan');
  await until(t, find.textContaining('Measured on this phone'));
  expect(h.app.store.count('m_photo'), 0, reason: 'nothing is kept before the nurse keeps it');
  await press(t, 'Patient Match Confirmation');
  await press(t, 'Legibility & Form Type');
  await press(t, 'Keep Photo & Type Values', wait: true);
  expect(find.byType(PaperDraftScreen), findsOneWidget);
  final row = h.app.store.all('m_photo').single;
  expect(row['sha256'], sha256Hex(bytes));
  return row['id']! as String;
}

const mar = 'Medication Administration Record (MAR)';
const tickText = 'I have compared each value with the paper document.';
const commitText = 'Confirm & Commit to Device Vault';
final tick = RegExp('^I have compared each value');

Future<void> typeDose(WidgetTester t, String drug, String dose, String unit, String route) async {
  await press(t, RegExp('^Order: '));
  await press(t, RegExp('^$drug'));
  await press(t, sem('Given'));
  await write(t, 'Dose given', dose);
  await press(t, RegExp('^Unit: '));
  await press(t, sem(unit), last: true);
  await press(t, RegExp('^Route: '));
  await press(t, sem(RegExp('^$route\\b')), last: true);
}

/// On the co-sign page: choose [who] and sign.
Future<void> cosign(WidgetTester t, String who, String digits, {bool twice = false}) async {
  await press(t, RegExp(r'^(Choose the second nurse|Second nurse .*, change)$'));
  await press(t, sem(who), last: true);
  await cosignPin(t, digits);
  await press(t, 'Authorize & Save On This Phone', twice: twice, wait: true);
  await work(t, 120);
}

void journey(String name, Future<Harness> Function(WidgetTester t) body, {Timeout? timeout}) => testWidgets(name, (t) async {
      WidgetController.hitTestWarningShouldBeFatal = true;
      await t.runAsync(loadFonts);
      await done(t, await body(t));
    }, timeout: timeout);

void main() {
  /* ================================ 1. First launch to a saved record and a restart ================================ */

  journey('1 first launch, PIN, search, verify, vitals, view, history, process death, still there', (t) async {
    final h = await firstLaunch(t);
    await choose(t, okafor);
    await pin(t, '1357');
    await press(t, 'Sign in to 4 West', wait: true);
    expect(find.textContaining('Wrong PIN'), findsOneWidget);
    expect(h.app.user, isNull);
    await pin(t, '2468');
    await press(t, 'Sign in to 4 West');
    await until(t, find.byType(WardScreen));
    expect(h.app.user!.id, 'pr-okafor');
    final before = h.app.store.count('entry');
    await openPatient(t, 'Rivera');
    await add(t, 'Record vitals');
    expect(find.byType(VitalsEditorScreen), findsOneWidget);
    await write(t, find.byKey(const ValueKey('v-heart_rate')), '81');
    await press(t, find.byKey(const ValueKey('pain-0')));
    await press(t, 'Review entry');
    expect(find.byType(VitalsReviewScreen), findsOneWidget);
    expect(h.app.store.count('entry'), before);
    await press(t, 'Save on device', twice: true, wait: true);
    expect(find.text('Saved on this phone'), findsWidgets);
    expect(h.app.store.count('entry'), before + 1);
    final e = entriesOf(h, 'pt-01', 'vital_sign').first;
    expect((e.vital.heartRate, e.vital.pain, e.child!['spo2'], e.entry.performerId), (81, 0, null, 'pr-okafor'));
    await press(t, 'View record');
    expect(find.byType(EntryDetailScreen), findsOneWidget);
    expect(find.textContaining('81 /min'), findsWidgets);
    await press(t, sem('Go back'));
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    await press(t, sem('History'));
    expect(find.byType(HistoryScreen), findsOneWidget);
    expect(find.byKey(ValueKey(e.entry.id)), findsOneWidget);

    // Process death: a new app on the same files and the same phone key store.
    await t.pumpWidget(const SizedBox());
    final h2 = h.restart();
    addTearDown(h.app.lockVault);
    await pumpPhone(t, h2);
    await real(t, () => h2.app.boot());
    await settle(t);
    await press(t, 'Get started');
    await press(t, 'Use practice passphrase');
    await press(t, 'Unlock records');
    await until(t, find.byType(SelectStaffScreen));
    expect(h2.app.user, isNull);
    await signIn(t, okafor);
    expect(h2.app.verifiedPatientId, isNull);
    await openPatient(t, 'Rivera');
    await press(t, sem('History'));
    expect(find.byKey(ValueKey(e.entry.id)), findsOneWidget);
    await press(t, find.descendant(of: find.byKey(ValueKey(e.entry.id)), matching: sem(RegExp('^Open '))));
    expect(find.byType(EntryDetailScreen), findsOneWidget);
    expect(find.textContaining('81 /min'), findsWidgets);
    expect(h2.app.store.count('entry'), before + 1);
    h.app.lockVault();
    return h2;
  });

  /* ================================ 2. Medicines ================================ */

  journey('2 PRN dose lock and back to the MAR; heparin rate change with a second nurse, saved once', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, okafor);
    await openPatient(t, 'Bell');
    final n4 = entriesOf(h, 'pt-04').length;
    await press(t, sem('Open the medication record (MAR)'));
    expect(find.byType(MarScreen), findsOneWidget);
    await press(t, find.byKey(const ValueKey('give-ord-10')));
    expect(find.byType(ConflictScreen), findsOneWidget);
    expect(find.text('ORDER INTERVAL'), findsOneWidget);
    // A PRN attempt can be written down as held (asks for a reason) or left with the arrow; leaving saves nothing.
    await press(t, 'Confirm Hold & Return to MAR');
    await press(t, 'Cancel');
    await press(t, sem('Go back'));
    expect(find.byType(ConflictScreen), findsNothing);
    expect(find.byType(MarScreen), findsOneWidget);
    expect(entriesOf(h, 'pt-04').length, n4);
    expect(audits(h, 'dose_locked'), hasLength(1));
    await back(t);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    await toWard(t);

    await openPatient(t, 'Hale');
    await add(t, 'Medication event');
    expect(find.byType(MarScreen), findsOneWidget);
    expect(find.textContaining('1,150', findRichText: true), findsWidgets);
    final n = medsOf(h, 'pt-05', 'ord-12').length;
    await press(t, find.byKey(const ValueKey('rate-ord-12')));
    expect(find.byType(MedEventScreen), findsOneWidget);
    await write(t, 'New prescribed rate', '1100');
    expect(btn(t, 'Authenticate Second Nurse').onTap, isNull);
    for (final x in ['^Right patient', '^Rate on the order', '^Line traced']) {
      await press(t, RegExp(x));
    }
    await press(t, 'Authenticate Second Nurse');
    expect(find.byType(CosignScreen), findsOneWidget);
    await press(t, sem('Choose the second nurse'));
    for (final ok in [park, alvarez, 'Ana Reyes, RN']) {
      expect(sem(ok), findsWidgets);
    }
    for (final no in [okafor, whitfield, ellis, 'Tara Nguyen, RN']) {
      expect(sem(no), findsNothing, reason: no);
    }
    await press(t, sem(park), last: true);
    await cosignPin(t, '1357');
    await press(t, 'Authorize & Save On This Phone', wait: true);
    expect(find.textContaining('Wrong PIN'), findsOneWidget);
    expect(medsOf(h, 'pt-05', 'ord-12').length, n);
    expect(h.app.store.count('m_attestation'), 0);
    await cosignPin(t, '2468');
    await press(t, 'Authorize & Save On This Phone', twice: true, wait: true);
    await until(t, find.byType(MarScreen));
    final l = medsOf(h, 'pt-05', 'ord-12');
    expect(l.length, n + 1);
    expect((l.first.med.rate, l.first.med.priorRate, l.first.med.doubleCheckedBy, l.first.entry.performerId, l.first.entry.status), (1100, 1150, 'pr-park', 'pr-okafor', 'confirmed'));
    expect(h.app.store.where('med_admin', 'entry_id', l.first.entry.id).single['double_checked_by'], 'pr-park');
    expect(h.app.store.count('m_attestation'), 1);
    expect(find.byType(CosignScreen), findsNothing);
    expect(find.byType(MedEventScreen), findsNothing);
    expect(find.textContaining('1,100', findRichText: true), findsWidgets);
    expect(find.textContaining('1,150', findRichText: true), findsNothing);
    await back(t);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    return h;
  });

  /* ================================ 3. Paper ================================ */

  journey('3a paper medication: photo kept, typed, ticked, committed once and linked', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, okafor);
    await openPatient(t, 'Rivera');
    final ref = await keepPaper(t, h, mar, 'Rivera');
    final n = h.app.store.count('entry');
    await typeDose(t, 'metoprolol', '25', 'mg', 'PO');
    // The due time has to be chosen: 09:00 has a record (the dose lock says so), 21:00 is later today.
    await press(t, tick);
    expect(btn(t, commitText).onTap, isNull, reason: 'the due time is not chosen');
    await t.pump(const Duration(seconds: 5));
    await press(t, sem('09:00 given'));
    expect(find.textContaining('Already recorded for 09:00', findRichText: true), findsWidgets);
    expect(sem('Not a due time'), findsNothing, reason: 'a given dose of a scheduled order belongs to one of its times');
    await press(t, sem('21:00 due'));
    expect(find.textContaining('Already recorded for 09:00', findRichText: true), findsNothing);
    await press(t, tick);
    await press(t, commitText, twice: true, wait: true);
    expect(h.app.store.count('entry'), n + 1);
    final e = h.app.store.all('entry').last;
    expect((e['raw_input_kind'], e['raw_input_ref'], e['status'], e['patient_id'], e['performer_id']), ('photo', ref, 'confirmed', 'pt-01', 'pr-okafor'));
    expect(listDrafts(h.app.store, 'pr-okafor'), isEmpty);
    await press(t, 'View Record');
    expect(find.byType(EntryDetailScreen), findsOneWidget);
    expect(find.textContaining('Photo hash checked: the stored picture is unchanged'), findsOneWidget);
    await back(t);
    await press(t, 'Done');
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    return h;
  });

  journey('3b paper high-alert dose waits for the second nurse; co-signed once; no stray draft', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, okafor);
    await openPatient(t, 'Okoye');
    final ref = await keepPaper(t, h, mar, 'Okoye');
    final s = h.app.store;
    final n = s.count('entry'), drafts = s.all('entry').where((e) => e['status'] == 'draft').length;
    await typeDose(t, 'HYDROmorphone', '0.5', 'mg', 'IV');
    await press(t, tick);
    await press(t, commitText);
    expect(find.byType(CosignScreen), findsOneWidget);
    expect(medsOf(h, 'pt-07', 'ord-18').where((x) => x.entry.isConfirmed && x.entry.rawInputRef == ref), isEmpty);
    // Going away without the second nurse: it waits, as a draft linked to the photo.
    await back(t);
    expect(find.text('Waiting for the Second Nurse'), findsOneWidget);
    expect(s.count('entry'), n + 1);
    await press(t, 'Ask the Second Nurse Again');
    await cosign(t, park, '2468', twice: true);
    await until(t, find.text('SAVED ON THIS PHONE'));
    final mine = s.all('entry').where((e) => e['raw_input_ref'] == ref).toList();
    expect(mine.length, 1);
    expect((mine.single['status'], mine.single['raw_input_kind'], mine.single['confirmed_by']), ('confirmed', 'photo', 'pr-okafor'));
    expect(s.where('med_admin', 'entry_id', mine.single['id']! as String).single['double_checked_by'], 'pr-park');
    expect(s.count('entry'), n + 1);
    expect(s.all('entry').where((e) => e['status'] == 'draft').length, drafts, reason: 'only the drafts of the dataset are left');
    expect(listDrafts(s, 'pr-okafor'), isEmpty);
    await press(t, 'Done');
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    return h;
  });

  journey('3c paper high-alert dose declined: no confirmed dose; found again in Local review', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, okafor);
    await openPatient(t, 'Okoye');
    final ref = await keepPaper(t, h, mar, 'Okoye');
    final s = h.app.store;
    final confirmed = s.all('entry').where((e) => e['status'] == 'confirmed').length;
    await typeDose(t, 'HYDROmorphone', '0.5', 'mg', 'IV');
    await press(t, tick);
    await press(t, commitText);
    await press(t, sem('Choose the second nurse'));
    await press(t, sem(park), last: true);
    await press(t, 'Decline / Flag Discrepancy');
    await press(t, 'Save Decline');
    expect(find.text('Write the reason.'), findsOneWidget);
    await write(t, 'Reason for declining', 'Paper says 5 mg');
    await press(t, 'Save Decline');
    expect(find.byType(PaperDraftScreen), findsOneWidget);
    expect(s.all('entry').where((e) => e['status'] == 'confirmed').length, confirmed);
    final att = s.all('m_attestation').single;
    expect((att['outcome'], att['witness_id'], att['reason'], att['witness_pin_checked']), ('declined', 'pr-park', 'Paper says 5 mg', false));
    final left = s.all('entry').where((e) => e['raw_input_ref'] == ref).single;
    expect(left['status'], 'draft');
    expect(find.text('SAVED ON THIS PHONE'), findsNothing);
    await back(t);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    await press(t, sem(RegExp('^Queue')));
    expect(find.byType(QueueScreen), findsOneWidget);
    expect(sem(RegExp('HYDROmorphone')), findsNWidgets(2), reason: 'the declined paper dose and the draft of the dataset');
    return h;
  });

  /* ================================ 4. Queue ================================ */

  journey('4 drafts of the dataset are checked and confirmed from Local review', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, park);
    final s = h.app.store;
    final n = s.count('entry');
    await press(t, sem('More'));
    await press(t, RegExp('^Local review'));
    expect(find.byType(QueueScreen), findsOneWidget);
    await press(t, sem(RegExp('Rosa Santos')));
    await verifyBoth(t);
    expect(find.byType(EntryDetailScreen), findsOneWidget);
    await press(t, 'Check and confirm this draft');
    expect(btn(t, 'Confirm record').onTap, isNull);
    await press(t, tick);
    final warn = find.textContaining('is unusual');
    for (var i = 0; i < warn.evaluate().length; i++) {
      await press(t, warn.at(i));
    }
    expect(s.get('entry', 'e-048')!['status'], 'draft');
    await press(t, 'Confirm record', twice: true, wait: true);
    final e = s.get('entry', 'e-048')!;
    expect((e['status'], e['confirmed_by'], e['raw_input_kind']), ('confirmed', 'pr-park', 'photo'));
    await back(t);
    expect(find.byType(QueueScreen), findsOneWidget);
    expect(sem(RegExp('Rosa Santos')), findsNothing);

    await press(t, sem(RegExp('Daniel Okoye')));
    await verifyBoth(t);
    expect(h.app.verifiedPatientId, 'pt-07');
    await press(t, 'Check and confirm this draft');
    await press(t, tick);
    await press(t, 'Ask the second nurse');
    expect(find.byType(CosignScreen), findsOneWidget);
    await press(t, sem('Choose the second nurse'));
    expect(sem(park), findsNothing);
    await press(t, sem(alvarez), last: true);
    await cosignPin(t, '2468');
    await press(t, 'Authorize & Save On This Phone', twice: true, wait: true);
    await until(t, find.byType(EntryDetailScreen));
    final x = getEntry(s, 'e-049')!;
    expect((x.entry.status, x.med.doubleCheckedBy, x.entry.careTime), ('confirmed', 'pr-alvarez', '2026-11-14T12:20:00-05:00'));
    expect(find.text('Confirmed'), findsWidgets);
    expect(s.count('entry'), n);
    expect(s.all('entry').where((e) => e['status'] == 'draft'), isEmpty);
    await back(t);
    expect(find.text('No draft record is waiting for a check.'), findsOneWidget);
    // The confirmed dose now locks the next PRN dose (every 3 hours).
    await toWard(t);
    await write(t, 'Search patient, bed, or MRN', 'Okoye');
    await press(t, card('Okoye'));
    expect(find.byType(PatientSummaryScreen), findsOneWidget, reason: 'still the verified patient');
    await press(t, sem('Open the medication record (MAR)'));
    await press(t, find.byKey(const ValueKey('give-ord-18')));
    expect(find.byType(ConflictScreen), findsOneWidget);
    return h;
  });

  /* ================================ 5. Fluid, lab, note, body map, SBAR, handover ================================ */

  journey('5 fluid, lab, note, body map, SBAR draft and note, handover counts, blocked sign-off', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, alvarez);
    final s = h.app.store;
    await openPatient(t, 'Ortiz');
    var n = s.count('entry');

    await add(t, 'Fluid balance');
    await press(t, sem('In (patient took in)'));
    await press(t, sem('By mouth'));
    await write(t, 'Amount in mL', '200');
    await press(t, 'Review');
    await press(t, 'Save on this phone', twice: true);
    expect(s.count('entry'), ++n);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);

    await add(t, 'Lab result');
    await write(t, 'Test', 'Glucose');
    await press(t, sem('Result back'));
    await write(t, 'Result', '182');
    await write(t, 'Unit', 'mg/dL');
    await press(t, 'Review');
    await press(t, 'Save on this phone', twice: true);
    expect(s.count('entry'), ++n);
    expect(h.app.store.all('lab_event').last['value_num'], 182);

    await add(t, 'Bedside note');
    await press(t, sem('Care given'));
    await write(t, 'Note', 'Walked to the chair. Fictional.');
    await press(t, 'Review');
    await press(t, 'Save on this phone', twice: true);
    expect(s.count('entry'), ++n);

    await add(t, 'Body map');
    expect(find.byType(BodyMapScreen), findsOneWidget);
    await press(t, sem('Tag new region'));
    await press(t, sem('Chest'), last: true);
    await press(t, sem('Other'), last: true);
    await write(t, find.byType(TextField).last, 'Small bruise');
    await press(t, 'Add To Map');
    expect(s.count('m_body_finding'), 0);
    await press(t, 'Save Assessment On Phone', twice: true);
    expect(s.count('entry'), ++n);
    expect(s.all('m_body_finding').single['patient_id'], 'pt-02');
    await back(t);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);

    final q = queue();
    await add(t, 'Clinical handover');
    await write(t, 'Situation', 'Fictional situation');
    expect(await back(t), isFalse);
    expect(find.text('This note is not finished'), findsOneWidget);
    await press(t, 'Keep draft');
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    expect(listDrafts(s, 'pr-alvarez', kind: 'sbar'), hasLength(1));
    expect(queue(), q + 1);
    await add(t, 'Clinical handover');
    expect(find.text('Fictional situation'), findsOneWidget);
    expect(find.textContaining('was restored'), findsOneWidget);
    await write(t, 'Background', 'Fictional background');
    await write(t, 'Assessment', 'Fictional assessment');
    await press(t, sem('I have reviewed this note'));
    await press(t, 'Save & Commit SBAR Note', twice: true, wait: true);
    expect(s.all('handoff').where((x) => x['patient_id'] == 'pt-02'), hasLength(1));
    expect(listDrafts(s, 'pr-alvarez'), isEmpty);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    expect(queue(), q);

    await toWard(t);
    await write(t, 'Search patient, bed, or MRN', 'Rivera');
    await press(t, sem('Patient options Sam Rivera'));
    await press(t, 'Assign to me');
    await press(t, sem('Handover'));
    expect(find.byType(HandoverScreen), findsOneWidget);
    final roster = ops.handoverRoster(s, 'pr-alvarez', h.app.nowIso);
    expect(roster, containsAll(['pt-01', 'pt-02']));
    expect(find.text('1 of ${roster.length} Patients Documented'), findsOneWidget);
    expect(find.text('${roster.length - 1} Pending SBAR Note${roster.length == 2 ? '' : 's'}'), findsOneWidget);
    expect(find.text('View SBAR'), findsOneWidget);
    await press(t, 'Choose nurse');
    expect(sem(alvarez), findsNothing);
    expect(sem(whitfield), findsNothing);
    await press(t, sem(park), last: true);
    await press(t, 'Complete Shift Handover Sign-Off');
    expect(find.textContaining('Sign-off is blocked'), findsOneWidget);
    expect(find.text('Authorize'), findsNothing);
    await press(t, 'Go to pending note');
    expect(s.count('m_shift_signoff'), 0);
    expect(await back(t), isFalse);
    expect(find.byType(WardScreen), findsOneWidget);
    return h;
  });

  /* ================================ 6. Admin ================================ */

  journey('6 admin: integrity, outage, clearance, recovery list, reasoned sign-off, export, audit; nurse stays out', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, ellis);
    final s = h.app.store;
    expect(h.app.phase, ops.Phase.online, reason: 'phase of the dataset');
    await press(t, 'Force Integrity Check', wait: true);
    expect(find.textContaining('encrypted pages: all authentic'), findsWidgets);
    final old = h.app.downtime!.id;
    await press(t, 'Start a Practice Outage');
    await press(t, 'Start practice outage');
    expect(h.app.phase, ops.Phase.down);
    expect(h.app.downtime!.id, isNot(old));
    await press(t, sem('Recovery'), last: true);
    expect(find.byType(RecoveryScreen), findsOneWidget);
    expect(find.text('Recovery is not open'), findsOneWidget);
    expect(find.text('Add New Downtime Records'), findsNothing);

    // A nurse records during the outage, and finds no admin page.
    await press(t, sem('More'), last: true);
    await press(t, 'Sign out');
    await until(t, find.byType(SelectStaffScreen));
    await signIn(t, okafor);
    expect(find.textContaining('SYSTEM DOWN'), findsWidgets);
    await openPatient(t, 'Rivera');
    await add(t, 'Record vitals');
    await write(t, find.byKey(const ValueKey('v-heart_rate')), '79');
    await press(t, 'Review entry');
    await press(t, 'Save on device', wait: true);
    await press(t, 'Back to chart');
    final rec = entriesOf(h, 'pt-01', 'vital_sign').first;
    expect(rec.vital.heartRate, 79);
    await press(t, sem('History'));
    expect(find.ancestor(of: find.text('Ledger'), matching: find.byType(Unavailable)), findsOneWidget);
    await toWard(t);
    await press(t, sem('More'));
    for (final x in ['Recovery worklist', 'FHIR file', 'Change log', 'Readiness']) {
      expect(find.text(x), findsNothing, reason: x);
    }
    final c = ctxOf(t);
    for (final open in <void Function(BuildContext)>[Go.recovery, Go.export, Go.audit]) {
      expect(() => open(c), throwsA(isA<NotAllowedError>()));
    }
    await press(t, sem(RegExp('^Protocol checklist')));
    expect(find.text('Only an admin can change the checklist'), findsOneWidget);
    await back(t);
    await press(t, 'Sign out');
    await until(t, find.byType(SelectStaffScreen));

    await signIn(t, ellis);
    await press(t, sem('Downtime'), last: true);
    expect(find.byType(ChecklistScreen), findsOneWidget);
    await press(t, 'Switch to Back online (Practice)');
    expect(h.app.phase, ops.Phase.down);
    for (final x in ['Network Safe to Use Again', 'Back-Entry May Start', 'Downtime Lead Sign-Off']) {
      await press(t, x);
    }
    await press(t, 'Switch to Back online (Practice)');
    for (final d in ['2', '4', '6', '8']) {
      await press(t, sem(d), last: true);
    }
    await work(t, 150);
    expect(h.app.phase, ops.Phase.online);
    await back(t);
    expect(find.byType(ReadinessScreen), findsOneWidget);
    await press(t, sem('Recovery'), last: true);
    expect(find.text('Recovery is not open'), findsNothing);
    final items = s.count('worklist_item');
    await press(t, 'Add New Downtime Records');
    expect(s.where('worklist_item', 'entry_id', rec.entry.id), hasLength(1));
    expect(s.count('worklist_item'), items + 1);
    final item = find.byKey(const ValueKey('wl-e-044'));
    await press(t, find.descendant(of: item, matching: find.text('Keep Record (Reason Needed)')));
    await press(t, 'Keep record and sign off');
    expect(find.text('Write the reason for your decision.'), findsOneWidget);
    await write(t, 'Reason', 'Cuff value read again from the paper');
    await press(t, 'Keep record and sign off');
    final w = WorklistItem(s.where('worklist_item', 'entry_id', 'e-044').single);
    expect(w.signedOffBy, 'pr-ellis');
    expect(ops.resolutionsFor(s, w.id).single['reason'], 'Cuff value read again from the paper');

    await press(t, find.textContaining('Prepare FHIR Recovery File'));
    expect(find.byType(ExportScreen), findsOneWidget);
    await until(t, find.textContaining('(.JSON,'));
    await press(t, find.textContaining('(.JSON,'));
    expect(find.textContaining('The file is NOT encrypted'), findsOneWidget);
    await press(t, 'Save with 6 open', wait: true);
    await work(t, 150);
    final (name, _, bytes) = h.bridge.saved.single;
    expect(name, contains('PRACTICE'));
    final text = utf8.decode(bytes);
    expect(text, contains('"HTEST"'));
    expect(validateBundleText(text), isEmpty);
    expect(text, contains(rec.entry.id), reason: 'the record of this outage is in the file');
    expect(find.text('File saved'), findsOneWidget);
    await back(t);
    expect(find.byType(RecoveryScreen), findsOneWidget);
    await press(t, sem('Audit'), last: true);
    expect(find.byType(AuditScreen), findsOneWidget);
    expect(find.text(auditLabel('fhir_export')), findsWidgets);
    expect(audits(h, 'fhir_export').last['user_id'], 'pr-ellis');
    await back(t);
    expect(find.byType(ReadinessScreen), findsOneWidget);
    return h;
  }, timeout: const Timeout(Duration(minutes: 6)));

  journey('6b a note typed in the first minute of an outage is in the recovery list', (t) async {
    final h = await firstLaunch(t);
    final s = h.app.store;
    await work(t, 1200); // not in second :00 of the practice clock
    await signIn(t, ellis);
    await press(t, 'Start a Practice Outage');
    await press(t, 'Start practice outage');
    await press(t, sem('More'), last: true);
    await press(t, 'Sign out');
    await until(t, find.byType(SelectStaffScreen));
    await signIn(t, okafor);
    await openPatient(t, 'Rivera');
    await add(t, 'Bedside note');
    await press(t, sem('Other'));
    await write(t, 'Note', 'Recorded during the practice outage');
    await press(t, 'Review');
    await press(t, 'Save on this phone');
    final note = entriesOf(h, 'pt-01', 'note').firstWhere((x) => x.note.text == 'Recorded during the practice outage');
    await toWard(t);
    await signOut(t);
    await signIn(t, ellis);
    await press(t, sem('Downtime'), last: true);
    for (final x in ['Network Safe to Use Again', 'Back-Entry May Start', 'Downtime Lead Sign-Off']) {
      await press(t, x);
    }
    await press(t, 'Switch to Back online (Practice)');
    for (final d in ['2', '4', '6', '8']) {
      await press(t, sem(d), last: true);
    }
    await work(t, 150);
    await back(t);
    await press(t, sem('Recovery'), last: true);
    await press(t, 'Add New Downtime Records');
    expect(s.where('worklist_item', 'entry_id', note.entry.id), hasLength(1), reason: 'care time ${note.entry.careTime}, typed ${note.entry.entryTime}, outage declared ${h.app.downtime!.declaredAt}');
    return h;
  }, timeout: const Timeout(Duration(minutes: 4)));

  /* ================================ 7. Safety ================================ */

  journey('7a Android back never loses a half-typed form silently and never shows a blank page', (t) async {
    final h = await firstLaunch(t);
    // Entry pages.
    expect(await back(t), isTrue, reason: 'roster is the root after setup');
    await choose(t, okafor);
    expect(await back(t), isFalse);
    expect(find.byType(SelectStaffScreen), findsOneWidget);
    await signIn(t, okafor);
    expect(await back(t), isTrue, reason: 'ward is a root page: Android closes the app, nothing is popped');
    expect(find.byType(WardScreen), findsOneWidget);
    await openPatient(t, 'Rivera');
    final lost = <String>[], stale = <String>[];
    final keepText = find.textContaining(RegExp(r'^Keep (as a )?draft'));

    /// [type] fills something; afterwards Back must ask, or keep it and give it back.
    Future<void> form(String item, Type screen, Future<void> Function() type, Finder typed) async {
      final q = queue();
      await add(t, item);
      expect(find.byType(screen), findsOneWidget);
      expect(await back(t), isFalse);
      expect(find.byType(PatientSummaryScreen), findsOneWidget, reason: '$item: an untouched form closes without a question');
      await add(t, item);
      await type();
      expect(typed, findsWidgets, reason: item);
      await back(t);
      if (find.byType(PatientSummaryScreen).evaluate().isEmpty) {
        // Asked: staying keeps the values.
        await press(t, find.text('Keep editing').evaluate().isNotEmpty ? 'Keep editing' : 'Keep writing');
        expect(typed, findsWidgets, reason: item);
        await back(t);
        await press(t, keepText);
      }
      expect(find.byType(PatientSummaryScreen), findsOneWidget, reason: item);
      if (queue() != q + 1) stale.add('$item: Queue (${queue()}), expected ${q + 1}');
      await add(t, item);
      if (find.text('Continue the draft').evaluate().isNotEmpty) await press(t, 'Continue the draft');
      if (typed.evaluate().isEmpty) lost.add(item);
      for (var i = 0; i < 4 && find.byType(PatientSummaryScreen).evaluate().isEmpty; i++) {
        await back(t);
        if (keepText.evaluate().isNotEmpty) await press(t, keepText);
      }
      expect(find.byType(PatientSummaryScreen), findsOneWidget);
    }

    await form('Record vitals', VitalsEditorScreen, () => write(t, find.byKey(const ValueKey('v-heart_rate')), '83'), find.text('83'));
    await form('Fluid balance', FluidScreen, () async {
      await press(t, sem('In (patient took in)'));
      await write(t, 'Amount in mL', '123');
    }, find.text('123'));
    await form('Bedside note', NoteScreen, () => write(t, 'Note', 'Half a note'), find.text('Half a note'));
    await form('Lab result', LabScreen, () => write(t, 'Test', 'Half a test'), find.text('Half a test'));
    await form('Clinical handover', SbarScreen, () => write(t, 'Situation', 'Half a situation'), find.text('Half a situation'));
    await form('Body map', BodyMapScreen, () async {
      await press(t, sem('Tag new region'));
      await press(t, sem('Chest'), last: true);
      await press(t, sem('Other'), last: true);
      await write(t, find.byType(TextField).last, 'Half a finding');
      await press(t, 'Add To Map');
    }, find.text('Half a finding'));

    // Every kept form is counted on the chart.
    expect(listDrafts(h.app.store, 'pr-okafor', patientId: 'pt-01'), hasLength(6));
    expect(stale, isEmpty, reason: 'the chart still shows the old number');

    // Paper page without a photo: kept in Local review.
    await add(t, 'Paper photo');
    await press(t, RegExp('^Document type'));
    await press(t, sem('Vitals'), last: true);
    await press(t, 'Manual Entry');
    expect(find.byType(PaperDraftScreen), findsOneWidget);
    await write(t, RegExp('^Pulse in'), '84');
    await back(t);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    expect(listDrafts(h.app.store, 'pr-okafor', kind: 'paper'), hasLength(1));

    expect(lost, isEmpty, reason: 'typed values were lost without a question');
    return h;
  }, timeout: const Timeout(Duration(minutes: 8)));

  journey('7e medicine event: Back with typed values asks, or gives them back', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, okafor);
    await openPatient(t, 'Rivera');
    Future<void> open() async {
      await press(t, find.byKey(const ValueKey('give-ord-02')));
      await press(t, 'Held');
      expect(find.byType(MedEventScreen), findsOneWidget);
    }

    await press(t, sem('Open the medication record (MAR)'));
    await open();
    expect(await back(t), isFalse);
    expect(find.byType(MarScreen), findsOneWidget, reason: 'untouched: no question');
    await open();
    await write(t, 'Reason', 'Half a reason');
    await back(t);
    if (find.byType(MedEventScreen).evaluate().isEmpty) {
      await open();
    } else {
      await back(t); // closes the question: the form stays
    }
    expect(find.text('Half a reason'), findsOneWidget, reason: 'the typed reason was lost without a question');
    return h;
  });

  journey('7f checking a draft record: Back with changed values asks, or gives them back', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, okafor);
    await press(t, sem('More'));
    await press(t, RegExp('^Local review'));
    await press(t, sem(RegExp('Rosa Santos')));
    await verifyBoth(t);
    await press(t, 'Check and confirm this draft');
    await write(t, RegExp('^Pulse in'), '85');
    await back(t);
    if (find.byType(EntryDetailScreen).evaluate().isEmpty) {
      await press(t, sem(RegExp('Rosa Santos')));
      await press(t, 'Check and confirm this draft');
    } else {
      await back(t); // closes the question: the form stays
    }
    expect(h.app.store.get('entry', 'e-048')!['status'], 'draft');
    expect(find.text('85'), findsWidgets, reason: 'the changed value was lost without a question');
    return h;
  });

  journey('7b lock with an open form: PIN page, form route gone; account switch; vault lock; covered', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, okafor);
    await openPatient(t, 'Rivera');
    for (final (item, screen) in [('Record vitals', VitalsEditorScreen), ('Bedside note', NoteScreen), ('Medication event', MarScreen), ('Clinical handover', SbarScreen)]) {
      await add(t, item);
      expect(find.byType(screen), findsOneWidget);
      if (item == 'Bedside note') await write(t, 'Note', 'Before the lock');
      h.app.lock(); // idle timer or the person
      await work(t);
      expect(find.byType(PinScreen), findsOneWidget, reason: item);
      expect(h.app.verifiedPatientId, isNull);
      for (final gone in [screen, PatientSummaryScreen, WardScreen]) {
        expect(find.byType(gone, skipOffstage: false), findsNothing, reason: '$item: $gone after a lock');
      }
      await back(t);
      expect(find.byType(SelectStaffScreen), findsOneWidget);
      expect(h.app.signedIn, isFalse);
      await signIn(t, okafor);
      await openPatient(t, 'Rivera');
    }
    // The text typed before the lock is offered again to its owner.
    await add(t, 'Bedside note');
    expect(find.text('Before the lock'), findsOneWidget);
    await back(t);

    // Short interruption: everything is covered, and comes back.
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await settle(t);
    expect(h.app.covered, isTrue);
    expect(find.text('ClinBridge Practice'), findsWidgets);
    final hit = HitTestResult();
    WidgetsBinding.instance.hitTestInView(hit, t.getCenter(find.byKey(const ValueKey('nav-add'))), t.view.viewId);
    expect(hit.path.any((e) => e.target == t.renderObject(find.byKey(const ValueKey('nav-add')))), isFalse, reason: 'nothing under the cover can be touched');
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await settle(t);
    expect(h.app.covered, isFalse);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);

    // Another person after a lock: the first person is signed out and the chart is not reachable.
    h.app.lock();
    await work(t);
    await press(t, sem('Switch to another person'));
    await signIn(t, park);
    expect(h.app.user!.id, 'pr-park');
    expect(h.app.verifiedPatientId, isNull);
    expect(await back(t), isTrue);
    await openPatient(t, 'Rivera');
    await add(t, 'Bedside note');
    expect(find.text('Before the lock'), findsNothing, reason: 'the unfinished form belongs to the first nurse');
    await back(t);
    await toWard(t);

    // Encrypted records closed from More.
    await press(t, sem('More'));
    await press(t, RegExp('^Lock encrypted records'));
    await press(t, 'Lock records');
    await until(t, find.byType(OpeningScreen));
    expect(h.app.vaultStatus, VaultStatus.locked);
    expect(await back(t), isTrue);
    expect(find.byType(OpeningScreen), findsOneWidget);
    await press(t, 'Get started');
    await press(t, 'Use practice passphrase');
    await press(t, 'Unlock records');
    await until(t, find.byType(SelectStaffScreen));
    await signIn(t, park);
    return h;
  }, timeout: const Timeout(Duration(minutes: 6)));

  journey('7c after leaving a patient the chart is not reachable by Back', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, okafor);
    await openPatient(t, 'Rivera');
    await press(t, sem('Verified patient: details and leave'));
    await press(t, 'Leave this patient');
    expect(find.byType(WardScreen), findsOneWidget);
    expect(h.app.verifiedPatientId, isNull);
    expect(await back(t), isTrue);
    expect(find.byType(WardScreen), findsOneWidget);
    expect(find.byType(PatientSummaryScreen, skipOffstage: false), findsNothing);
    return h;
  });

  journey('7d another patient opened from inside a chart: Back never ends on a blank page or on the first chart', (t) async {
    final h = await firstLaunch(t);
    await signIn(t, park);
    await openPatient(t, 'Rivera');
    await add(t, 'Bedside note');
    await press(t, sem(RegExp(r'Open More$')));
    await press(t, RegExp('^Local review'));
    await press(t, sem(RegExp('Rosa Santos')));
    await verifyBoth(t);
    expect(find.byType(EntryDetailScreen), findsOneWidget);
    expect(h.app.verifiedPatientId, 'pt-08');
    final blank = <String>[];
    for (var i = 0; i < 8 && find.byType(WardScreen).evaluate().isEmpty; i++) {
      await t.binding.handlePopRoute();
      await settle(t);
      expect(find.byType(NoteScreen), findsNothing, reason: 'form of the first patient');
      if (screenText().isEmpty) blank.add('Back ${i + 1}');
    }
    expect(find.byType(WardScreen), findsOneWidget);
    expect(blank, isEmpty, reason: 'blank pages on the way back');
    return h;
  });

  /* ================================ 8. Layout ================================ */

  for (final (w, hgt, scale) in [(360.0, 640.0, 1.5), (430.0, 932.0, 1.0)]) {
    journey('8 layout ${w.toInt()}×${hgt.toInt()} text $scale: no overflow on any main route', (t) async {
      final problems = <String>[];
      var at = 'first launch';
      final old = FlutterError.onError;
      FlutterError.onError = (d) => problems.add('$at: ${d.exceptionAsString().split('\n').first}');
      late Harness h;
      try {
        h = await firstLaunch(t, width: w, height: hgt, textScale: scale);
        await signIn(t, okafor);
        for (final (pid, family) in [('pt-01', 'Rivera'), ('pt-05', 'Hale'), ('pt-07', 'Okoye'), ('pt-08', 'Santos')]) {
          at = 'verify $family';
          await openPatient(t, family);
          for (final r in patientRoutes(h, pid).entries) {
            at = '${r.key} $family';
            r.value(ctxOf(t));
            await work(t, 10);
            notBlank(at);
            Go.summary(ctxOf(t), pid);
            await settle(t);
          }
          await toWard(t);
        }
        for (final r in nurseRoutes.entries) {
          at = r.key;
          r.value(ctxOf(t));
          await work(t, 30);
          notBlank(at);
          Go.ward(ctxOf(t));
          await settle(t);
        }
        await signOut(t);
        await signIn(t, ellis);
        for (final r in adminRoutes.entries) {
          at = r.key;
          r.value(ctxOf(t));
          await work(t, 60);
          notBlank(at);
          Go.readiness(ctxOf(t));
          await settle(t);
        }
      } finally {
        FlutterError.onError = old;
        if (problems.isNotEmpty) debugPrint('LAYOUT at $at\n${problems.join('\n')}');
      }
      expect(problems, isEmpty);
      return h;
    }, timeout: const Timeout(Duration(minutes: 8)));
  }

  journey('8 touch targets: at least 48 × 48 on the main screens', (t) async {
    final semantics = t.ensureSemantics();
    final bad = <String>[];
    Future<void> check(String at) async {
      final r = await androidTapTargetGuideline.evaluate(t);
      for (final m in RegExp(r'SemanticsNode#\d+\((.*?)\): expected tap target size.*?found (Size\([^)]*\))', dotAll: true).allMatches(r.reason ?? '')) {
        // Text fields: the box around them is checked by touch below.
        if (!m[1]!.contains('isTextField')) bad.add('$at: ${m[2]} ${RegExp(r'label: "[^"]*"', dotAll: true).firstMatch(m[1]!)?[0] ?? m[1]}');
      }
    }

    final h = await firstLaunch(t, width: 360, height: 3600);
    await check('roster');
    await choose(t, okafor);
    await check('PIN');
    await back(t);
    await signIn(t, okafor);
    await check('ward');
    for (final (pid, family) in [('pt-01', 'Rivera'), ('pt-05', 'Hale')]) {
      await openPatient(t, family);
      for (final r in patientRoutes(h, pid).entries) {
        r.value(ctxOf(t));
        await work(t, 10);
        await check('${r.key} $family');
        Go.summary(ctxOf(t), pid);
        await settle(t);
      }
      await toWard(t);
    }
    for (final r in nurseRoutes.entries) {
      r.value(ctxOf(t));
      await work(t, 30);
      await check(r.key);
      Go.ward(ctxOf(t));
      await settle(t);
    }
    await signOut(t);
    await signIn(t, ellis);
    for (final r in adminRoutes.entries) {
      r.value(ctxOf(t));
      await work(t, 60);
      await check(r.key);
      Go.readiness(ctxOf(t));
      await settle(t);
    }
    semantics.dispose();
    if (bad.isNotEmpty) debugPrint('TARGETS\n${bad.join('\n')}');
    expect(bad, isEmpty);
    return h;
  }, timeout: const Timeout(Duration(minutes: 8)));

  journey('8b text boxes: a touch anywhere in 48 dp of height starts typing', (t) async {
    final h = await firstLaunch(t, width: 360, height: 3600);
    final bad = <String>[];
    Future<void> check(String at) async {
      final fields = find.byType(EditableText);
      var n = 0;
      String? first;
      for (var i = 0; i < fields.evaluate().length; i++) {
        final r = t.getRect(fields.at(i));
        if (r.height >= 46) continue;
        // A neighbour control (the oxygen choice under SpO2) may own one side; then the other side must work, and the whole card does.
        var works = 0;
        for (final dy in [-20.0, 20.0]) {
          FocusManager.instance.primaryFocus?.unfocus();
          await t.pump(const Duration(milliseconds: 50));
          await t.tapAt(r.center + Offset(0, dy));
          await t.pump(const Duration(milliseconds: 400));
          if (t.widget<EditableText>(fields.at(i)).focusNode.hasFocus) works++;
        }
        if (works < (at == 'vitals' ? 1 : 2)) {
          n++;
          first ??= '${r.size}';
        }
      }
      if (n > 0) bad.add('$at: $n of ${fields.evaluate().length} boxes (first text area $first)');
    }

    await signIn(t, okafor);
    await openPatient(t, 'Rivera');
    for (final k in ['vitals', 'medicine event', 'fluid', 'lab', 'note', 'paper manual vitals', 'sbar']) {
      patientRoutes(h, 'pt-01')[k]!(ctxOf(t));
      await work(t, 10);
      await check(k);
      Go.summary(ctxOf(t), 'pt-01');
      await settle(t);
    }
    expect(bad, isEmpty);
    return h;
  }, timeout: const Timeout(Duration(minutes: 4)));
}

Map<String, void Function(BuildContext)> patientRoutes(Harness h, String pid) {
  final order = h.app.store.all('active_order').firstWhere((o) => (o['type'] == 'med' || o['type'] == 'iv') && h.app.store.get('encounter', o['encounter_id']! as String)!['patient_id'] == pid)['id']! as String;
  final e = entriesOf(h, pid).firstOrNull?.entry.id;
  final draft = h.app.store.all('entry').where((x) => x['status'] == 'draft' && x['patient_id'] == pid).firstOrNull?['id'] as String?;
  return {
    'summary': (c) => Go.summary(c, pid),
    'add': (c) => Go.addSheet(c, pid),
    'history': (c) => Go.history(c, pid),
    if (e != null) 'record': (c) => Go.entry(c, pid, e),
    if (draft != null) 'draft record': (c) => Go.entry(c, pid, draft),
    'body map': (c) => Go.bodyMap(c, pid),
    'vitals': (c) => Go.vitals(c, pid),
    'vitals review': (c) => Go.vitalsReview(c, VitalsDraft(patientId: pid, key: newId('k'), careTime: h.app.nowIso, raw: const {'heart_rate': '140', 'bp_systolic': '188', 'bp_diastolic': '104', 'spo2': '85', 'temp_c': '39.4'}, o2Device: 'Non-rebreather mask')),
    'MAR': (c) => Go.mar(c, pid),
    'medicine event': (c) => Go.medEvent(c, pid, order, event: 'administered'),
    'medicine held': (c) => Go.medEvent(c, pid, order, event: 'held'),
    if (pid == 'pt-05') 'rate change': (c) => Go.medEvent(c, pid, 'ord-12', event: 'rate_changed'),
    if (pid == 'pt-05')
      'co-sign': (c) => Go.cosign(c, MedProposal(patientId: pid, orderId: 'ord-12', key: newId('k'), careTime: h.app.nowIso, values: const {'order_id': 'ord-12', 'drug_name': 'heparin', 'event': 'rate_changed', 'infusion_rate': 1100, 'infusion_rate_unit': 'units/h', 'prior_infusion_rate': 1150}, checklist: const ['a', 'b', 'c'])),
    'fluid': (c) => Go.fluid(c, pid),
    'lab': (c) => Go.lab(c, pid),
    'note': (c) => Go.note(c, pid),
    'paper capture': (c) => Go.paperCapture(c, pid, formType: 'medication'),
    'paper manual vitals': (c) => Go.paperDraft(c, pid, formType: 'vitals'),
    'paper manual medicine': (c) => Go.paperDraft(c, pid, formType: 'medication'),
    'paper preview': (c) => Go.paperPreview(c, PaperShot(pid, 'medication', PickedBytes(paperForm('layout'), 'image/jpeg', 'upload'))),
    'paper error': (c) => Go.paperError(c, PaperShot(pid, 'medication', PickedBytes(paperForm('layout'), 'image/jpeg', 'upload')), staffReasons: const ['glare', 'corner']),
    'sbar': (c) => Go.sbar(c, pid),
    'queue of patient': (c) => Go.queue(c, patientId: pid),
    'print bedside': (c) => Go.print(c, patientId: pid),
  };
}

final nurseRoutes = <String, void Function(BuildContext)>{
  'ward': Go.ward,
  'verify': (c) => Go.verify(c, 'pt-05'),
  'handover': Go.handover,
  'saved SBAR': (c) => Go.sbarView(c, 'ho-02'),
  'queue': (c) => Go.queue(c),
  'alerts': Go.alerts,
  'more': Go.more,
  'checklist': Go.checklist,
  'print': (c) => Go.print(c),
  'battery': Go.battery,
};

final adminRoutes = <String, void Function(BuildContext)>{
  'readiness': Go.readiness,
  'admin ward': Go.ward,
  'admin checklist': Go.checklist,
  'recovery': Go.recovery,
  'export': Go.export,
  'audit': Go.audit,
  'admin queue': (c) => Go.queue(c),
  'admin alerts': Go.alerts,
  'admin more': Go.more,
};
