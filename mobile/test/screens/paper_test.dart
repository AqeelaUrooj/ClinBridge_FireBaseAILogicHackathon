import 'dart:io';
import 'dart:typed_data';

import 'package:clinbridge_practice/config/policy.dart';
import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/audit.dart';
import 'package:clinbridge_practice/data/native.dart';
import 'package:clinbridge_practice/data/repos/entries.dart';
import 'package:clinbridge_practice/state/app_state.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/companion_screens.dart';
import 'package:clinbridge_practice/ui/screens/med_screens.dart';
import 'package:clinbridge_practice/ui/screens/paper_screens.dart';
import 'package:clinbridge_practice/ui/screens/vitals_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

import '../support/host.dart';
import '../support/shots.dart';
import '../visual/paper_shots_test.dart' show cefPick, cefText, closeApp, fillDraft, flat, keepPhoto, metPick, metText, nurse, paperMar, shotOf, tapOn, until;

/// Grey picture with soft stripes: bright enough, but not sharp.
Uint8List blurry() {
  final im = img.Image(width: 900, height: 700);
  for (final p in im) {
    final v = 120 + (p.x * 60 ~/ 900);
    p.setRgb(v, v, v);
  }
  return img.encodePng(im);
}

class SettingsBridge extends FakeBridge {
  SettingsBridge(super.dir);
  int opened = 0, captures = 0;
  @override
  Future<void> openAppSettings() async => opened++;
}

const _home = Scaffold(body: Center(child: Text('home')));

Future<void> push(WidgetTester t, Harness h, void Function(BuildContext c) go, {double height = 1800}) async {
  await pumpPhone(t, h, home: _home, height: height);
  go(ctxOf(t));
  await settle(t);
}

int audits(Harness h, String action) => h.app.store.where('audit_log', 'action', action).length;
int entries(Harness h) => h.app.store.count('entry');

Future<void> type(WidgetTester t, String label, String text) async {
  final f = find.descendant(of: find.byWidgetPredicate((w) => w is Semantics && w.properties.label == label), matching: find.byType(TextField));
  await t.ensureVisible(f.first);
  await t.enterText(f.first, text);
  await settle(t);
}

void main() {
  group('picture check', () {
    test('glare, dark, blurry, good and not a picture', () {
      expect(measurePhoto(flat(252))!.problem, 'glare');
      expect(measurePhoto(flat(24))!.problem, 'too_dark');
      expect(measurePhoto(blurry())!.problem, 'blurry');
      final good = measurePhoto(paperMar())!;
      expect(good.problem, 'none');
      expect((good.width, good.height), (1200, 900));
      expect(technicalChecks(good).every((c) => c.$3), isTrue);
      expect(measurePhoto(Uint8List.fromList([1, 2, 3, 4, 5])), isNull);
      expect(measurePhoto(paperMar().sublist(0, 40)), isNull);
      // Orientation in the file is applied before measuring.
      final turned = img.decodeJpg(paperMar())!..exif.imageIfd.orientation = 6;
      expect((measurePhoto(img.encodeJpg(turned))!.width, measurePhoto(img.encodeJpg(turned))!.height), (900, 1200));
    });
  });

  group('capture', () {
    Future<(Harness, SettingsBridge)> start(WidgetTester t, {String permission = 'granted'}) async {
      final dir = Directory.systemTemp.createTempSync('cb_mobile_');
      final b = SettingsBridge(dir.path)..permission = permission;
      final h = await real(t, () => Harness.make(seed: designSeed(), dir: dir, bridge: b).ready());
      addTearDown(h.dispose);
      await real(t, () => h.signIn('s-sj'));
      h.app.verifyPatient('p-ap', ['Name', 'MRN']);
      return (h, b);
    }

    testWidgets('not asked, denied, blocked, settings and back', (t) async {
      final (h, b) = await start(t, permission: 'denied');
      b.permissionAfterAsk = 'denied';
      await push(t, h, (c) => Go.paperCapture(c, 'p-ap', formType: 'medication'));
      expect(find.text('Camera not allowed yet'), findsOneWidget);
      expect(b.cameraRunning, isFalse);
      await tapOn(t, find.text('Allow camera'));
      expect(find.text('Camera not allowed'), findsOneWidget);
      b.permissionAfterAsk = 'blocked';
      await tapOn(t, find.text('Ask again'));
      expect(find.text('Camera blocked'), findsOneWidget);
      await tapOn(t, find.text('Open app settings'));
      expect(b.opened, 1);
      // The shutter does nothing without a camera.
      await tapOn(t, find.bySemanticsLabel('Capture paper form'));
      expect(find.byType(PaperCaptureScreen), findsOneWidget);
      // Back from the settings with the permission.
      b.permission = 'granted';
      for (final s in [AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused, AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]) {
        t.binding.handleAppLifecycleStateChanged(s);
      }
      await settle(t);
      expect(b.cameraRunning, isTrue);
      expect(find.text('Align all 4 document corners inside frame'), findsOneWidget);
      await closeApp(t, h);
    });

    testWidgets('the camera stops when the app pauses, starts again, and stops when the page closes', (t) async {
      final (h, b) = await start(t);
      await push(t, h, (c) => Go.paperCapture(c, 'p-ap', formType: 'medication'));
      expect(b.cameraRunning, isTrue);
      for (final s in [AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused]) {
        t.binding.handleAppLifecycleStateChanged(s);
      }
      await settle(t);
      expect(b.cameraRunning, isFalse);
      for (final s in [AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]) {
        t.binding.handleAppLifecycleStateChanged(s);
      }
      await settle(t);
      expect(b.cameraRunning, isTrue);
      await tapOn(t, find.bySemanticsLabel('Go back'));
      expect(find.text('home'), findsOneWidget);
      expect(b.cameraRunning, isFalse);
      await closeApp(t, h);
    });

    testWidgets('torch: real state, and no torch on this phone', (t) async {
      final (h, b) = await start(t);
      await push(t, h, (c) => Go.paperCapture(c, 'p-ap', formType: 'medication'));
      await tapOn(t, find.text('Torch off'));
      expect(b.torchOn, isTrue);
      expect(find.text('Torch ON'), findsOneWidget);
      b.torchSupported = false;
      await push(t, h, (c) => Go.paperCapture(c, 'p-ap', formType: 'medication'));
      expect(find.text('No torch'), findsOneWidget);
      await tapOn(t, find.bySemanticsLabel(RegExp('no torch')));
      expect(find.text('This phone has no torch.'), findsOneWidget);
      await tapOn(t, find.bySemanticsLabel(RegExp('not detect edges')));
      expect(find.textContaining('does not detect edges'), findsOneWidget);
      await closeApp(t, h);
    });

    testWidgets('cancelled pick, wrong file, camera error and document type', (t) async {
      final (h, b) = await start(t);
      await push(t, h, (c) => Go.paperCapture(c, 'p-ap'));
      // No document type yet: nothing happens.
      await tapOn(t, find.text('Upload Scan'));
      expect(find.text('Choose the document type first.'), findsOneWidget);
      await tapOn(t, find.bySemanticsLabel(RegExp('Document type')));
      await tapOn(t, find.text('Vitals'));
      await tapOn(t, find.text('Upload Scan'));
      expect(find.text('No picture was chosen.'), findsOneWidget);
      b.picked = PickedImage(Uint8List.fromList([1]), 'application/pdf');
      await tapOn(t, find.text('Upload Scan'));
      expect(find.textContaining('not a picture'), findsOneWidget);
      b.cameraError = const AppError('The camera is used by another app.');
      await tapOn(t, find.bySemanticsLabel('Capture paper form'));
      expect(find.text('No picture was taken. The camera is used by another app.'), findsOneWidget);
      expect(h.app.store.count('m_photo'), 0);
      await push(t, h, (c) => Go.paperCapture(c, 'p-ap', formType: 'vitals'));
      expect(find.text('Camera error'), findsOneWidget);
      b.cameraError = null;
      await tapOn(t, find.text('Try again'));
      expect(b.cameraRunning, isTrue);
      await closeApp(t, h);
    });

    testWidgets('capture goes to the preview with the real bytes; manual entry needs no photo', (t) async {
      final (h, b) = await start(t);
      b.capture = paperMar();
      await push(t, h, (c) => Go.paperCapture(c, 'p-ap', formType: 'medication'));
      await tapOn(t, find.bySemanticsLabel('Capture paper form'));
      await until(t, find.textContaining('Measured on this phone'));
      expect(t.widget<PaperPreviewScreen>(find.byType(PaperPreviewScreen)).shot.bytes.data, b.capture);
      expect(b.cameraRunning, isFalse);
      // Retake opens a fresh capture and no old preview stays behind.
      await tapOn(t, find.text('Retake Form Photo'));
      expect(find.byType(PaperCaptureScreen), findsOneWidget);
      await tapOn(t, find.bySemanticsLabel('Go back'));
      expect(find.text('home'), findsOneWidget);
      expect(h.app.store.count('m_photo'), 0);
      await push(t, h, (c) => Go.paperCapture(c, 'p-ap', formType: 'vitals'));
      await tapOn(t, find.text('Manual Entry'));
      expect(find.text('No photo: manual entry'), findsOneWidget);
      await closeApp(t, h);
    });
  });

  group('preview', () {
    testWidgets('keep needs both staff ticks and stores the encrypted photo with its hash', (t) async {
      final h = await nurse(t);
      final bytes = paperMar();
      await push(t, h, (c) => Go.paperPreview(c, shotOf(bytes)));
      await until(t, find.textContaining('Measured on this phone'));
      expect(find.text('1/3 Done'), findsOneWidget);
      await tapOn(t, find.text('Keep Photo & Type Values'));
      expect(h.app.store.count('m_photo'), 0);
      await tapOn(t, find.text('Patient Match Confirmation'));
      await tapOn(t, find.text('Keep Photo & Type Values'));
      expect(h.app.store.count('m_photo'), 0);
      await tapOn(t, find.text('Legibility & Form Type'));
      expect(find.text('3/3 Done'), findsOneWidget);
      await tapOn(t, find.text('Keep Photo & Type Values'));
      expect(find.byType(PaperDraftScreen), findsOneWidget);
      final row = h.app.store.all('m_photo').single;
      expect(row['sha256'], sha256Hex(bytes));
      expect(row['check'], {'form_type': 'medication', 'readable': true, 'problem': 'none', 'overridden': false, 'checked_by': 's-sj', 'method': 'manual+technical'});
      expect(verifyPhoto(h.app.store, row['id'] as String), isTrue);
      expect(find.textContaining('Photo hash checked'), findsOneWidget);
      // The kept photo waits in this person's own list.
      expect(listDrafts(h.app.store, 's-sj', kind: 'paper').single['payload'], containsPair('photo_ref', row['id']));
      await closeApp(t, h);
      final raw = File('${h.dir.path}/practice.db').readAsBytesSync();
      final probe = bytes.sublist(2000, 2032);
      var found = false;
      for (var i = 0; i + 32 < raw.length && !found; i++) {
        if (raw[i] != probe[0]) continue;
        var k = 1;
        while (k < 32 && raw[i + k] == probe[k]) {
          k++;
        }
        found = k == 32;
      }
      expect(found, isFalse, reason: 'photo bytes must not be readable in the database file');
    });

    testWidgets('a problem needs the extra tick and is recorded as overridden', (t) async {
      final h = await nurse(t);
      await push(t, h, (c) => Go.paperPreview(c, shotOf(flat(24), mime: 'image/png', source: 'upload')));
      await until(t, find.textContaining('Photo looks dark'));
      await tapOn(t, find.text('Patient Match Confirmation'));
      await tapOn(t, find.text('Legibility & Form Type'));
      await tapOn(t, find.text('Keep Photo & Type Values'));
      expect(h.app.store.count('m_photo'), 0);
      await tapOn(t, find.text('I can still read it'));
      await tapOn(t, find.text('Keep Photo & Type Values'));
      final check = h.app.store.all('m_photo').single['check'] as Map;
      expect(check['problem'], 'too_dark');
      expect(check['overridden'], isTrue);
      await closeApp(t, h);
    });

    testWidgets('storage failure keeps the page and shows the real text', (t) async {
      final h = await nurse(t);
      await push(t, h, (c) => Go.paperPreview(c, shotOf(paperMar())));
      await until(t, find.textContaining('Measured on this phone'));
      await tapOn(t, find.text('Patient Match Confirmation'));
      await tapOn(t, find.text('Legibility & Form Type'));
      h.app.store.fault = (op) {
        if (op == 'insert m_photo') throw const StorageError(kStorageFull);
      };
      await tapOn(t, find.text('Keep Photo & Type Values'));
      expect(find.text(kStorageFull), findsOneWidget);
      expect(h.app.store.count('m_photo'), 0);
      h.app.store.fault = null;
      await tapOn(t, find.text('Keep Photo & Type Values'));
      expect(h.app.store.count('m_photo'), 1);
      await closeApp(t, h);
    });

    testWidgets('reject stores no photo and no record, only one audit row; damaged is flagged once', (t) async {
      final h = await nurse(t);
      final before = entries(h);
      await push(t, h, (c) => Go.paperPreview(c, shotOf(paperMar())));
      await until(t, find.textContaining('Measured on this phone'));
      await tapOn(t, find.text('Reject photo'));
      expect(find.text('Tick a reason first.'), findsOneWidget);
      await tapOn(t, find.text('Glare'));
      await tapOn(t, find.bySemanticsLabel('Reject photo').last);
      await until(t, find.byType(PaperErrorScreen));
      await settle(t);
      expect(find.text('CAPTURE REJECTED: GLARE'), findsOneWidget);
      expect(h.app.store.count('m_photo'), 0);
      expect(entries(h), before);
      expect(audits(h, 'photo_rejected'), 1);
      expect(find.textContaining('The rejection is in the change log.'), findsOneWidget);
      await tapOn(t, find.text('Flag Document as Damaged / Unusable'));
      await tapOn(t, find.text('Cancel'));
      expect(audits(h, 'photo_rejected'), 1);
      await tapOn(t, find.text('Flag Document as Damaged / Unusable'));
      await tapOn(t, find.text('Flag as damaged'));
      expect(audits(h, 'photo_rejected'), 2);
      expect(find.textContaining('Flagged as damaged at'), findsOneWidget);
      expect(h.app.store.count('m_photo'), 0);
      expect(verifyChain(h.app.store.all('audit_log')).ok, isTrue);
      await tapOn(t, find.text('Manual Bedside Form Entry'));
      expect(find.text('No photo: manual entry'), findsOneWidget);
      await closeApp(t, h);
    });

    testWidgets('a file that is not a picture goes to the error page', (t) async {
      final h = await nurse(t);
      await pumpPhone(t, h, home: _home, height: 1800);
      Go.paperPreview(ctxOf(t), shotOf(Uint8List.fromList([9, 9, 9, 9])));
      await until(t, find.text('1 of 1')); // no settle(): it would decode the broken picture itself
      expect(find.text('CAPTURE REJECTED: PICTURE COULD NOT BE OPENED'), findsOneWidget);
      expect(find.text('1 of 1'), findsOneWidget);
      expect(h.app.store.count('m_photo'), 0);
      expect(audits(h, 'photo_rejected'), 1);
      await tapOn(t, find.text('Retake Photo'));
      expect(find.byType(PaperCaptureScreen), findsOneWidget);
      await closeApp(t, h);
    });
  });

  group('paper draft', () {
    Future<String> open(WidgetTester t, Harness h, {Map<String, String> text = metText, Map<String, String> pick = metPick}) async {
      final ref = keepPhoto(h, paperMar());
      fillDraft(h, ref, text: text, pick: pick);
      await push(t, h, (c) => Go.paperDraft(c, 'p-ap', formType: 'medication', photoRef: ref));
      return ref;
    }

    final tick = find.textContaining('I have compared each value');
    final commit = find.text('Confirm & Commit to Device Vault');

    testWidgets('an edit after the tick clears the tick', (t) async {
      final h = await nurse(t);
      final before = entries(h);
      await open(t, h);
      await tapOn(t, commit); // not ticked
      expect(entries(h), before);
      await tapOn(t, tick);
      expect(find.textContaining('For exactly these values and this photo'), findsOneWidget);
      await type(t, 'Dose given', '20');
      expect(find.textContaining('Tick after the last change'), findsOneWidget);
      await tapOn(t, commit);
      expect(entries(h), before);
      // Typing the old value again does not bring the tick back.
      await type(t, 'Dose given', '25');
      expect(find.textContaining('Tick after the last change'), findsOneWidget);
      await closeApp(t, h);
    });

    testWidgets('commit stores the record once, linked to the checked photo', (t) async {
      final h = await nurse(t);
      final before = entries(h);
      final ref = await open(t, h);
      await tapOn(t, tick);
      h.app.store.fault = (op) {
        if (op == 'commit') throw const StorageError(kStorageFull);
      };
      await tapOn(t, commit);
      expect(find.text('Commit Failed'), findsOneWidget);
      expect(find.textContaining(kStorageFull), findsWidgets);
      expect(entries(h), before);
      h.app.store.fault = null;
      await tapOn(t, find.text('Try Again'));
      expect(entries(h), before + 1);
      final e = h.app.store.all('entry').last;
      expect(e['raw_input_kind'], 'photo');
      expect(e['raw_input_ref'], ref);
      expect((e['photo_check'] as Map)['checked_by'], 's-sj');
      expect(e['status'], 'confirmed');
      expect(e['scheduled_time'], '2026-11-14T16:00:00-05:00');
      expect(h.app.store.where('med_admin', 'entry_id', e['id'] as String).single['dose_given'], 25);
      expect(listDrafts(h.app.store, 's-sj'), isEmpty);
      expect(find.text('Record ${e['counter']} Saved'), findsOneWidget);
      expect(find.text('Step 4 of 4: Commit'), findsOneWidget);
      await tapOn(t, find.text('View Record'));
      expect(find.byType(EntryDetailScreen), findsOneWidget);
      expect(find.textContaining('Photo hash checked: the stored picture is unchanged'), findsOneWidget);
      await closeApp(t, h);
    });

    testWidgets('a missing or changed photo refuses the commit', (t) async {
      final h = await nurse(t);
      final before = entries(h);
      h.app.store.tx(() => h.app.store.insertPhoto({'id': 'vault/raw/changed.jpg', 'patient_id': 'p-ap', 'type': 'image/jpeg', 'size': 3, 'sha256': 'not-the-hash', 'saved_at': designNow, 'check': {'form_type': 'medication'}}, paperMar()));
      for (final ref in ['vault/raw/changed.jpg', 'vault/raw/missing.jpg']) {
        fillDraft(h, ref, text: metText, pick: metPick);
        await push(t, h, (c) => Go.paperDraft(c, 'p-ap', formType: 'medication', photoRef: ref));
        expect(find.textContaining('Photo hash checked'), findsNothing);
        await tapOn(t, tick);
        await tapOn(t, commit);
        expect(find.textContaining('missing or does not match its saved hash'), findsOneWidget);
        expect(entries(h), before);
      }
      await closeApp(t, h);
    });

    testWidgets('a held order opens the dose lock and saves nothing', (t) async {
      final h = await nurse(t);
      final before = entries(h);
      await open(t, h, text: cefText, pick: cefPick);
      expect(find.textContaining('Order on hold'), findsWidgets);
      await tapOn(t, tick);
      await tapOn(t, commit);
      expect(find.byType(ConflictScreen), findsOneWidget);
      expect(entries(h), before);
      Navigator.of(t.element(find.byType(ConflictScreen))).pop();
      await settle(t);
      expect(find.text('Held by a Dose Lock'), findsOneWidget);
      await closeApp(t, h);
    });

    testWidgets('a high-alert dose stays a draft until a second nurse agrees', (t) async {
      final h = await nurse(t);
      final before = entries(h);
      final ref = await open(t, h, text: const {'dose': '0.5', 'time': '16:12'}, pick: const {'day': 'today', 'order': 'o-hyd', 'event': 'administered', 'unit': 'mg', 'route': 'IV'});
      await tapOn(t, tick);
      await tapOn(t, commit);
      expect(find.byType(CosignScreen), findsOneWidget);
      final p = t.widget<CosignScreen>(find.byType(CosignScreen)).proposal;
      Navigator.of(t.element(find.byType(CosignScreen))).pop();
      await settle(t);
      expect(find.text('Waiting for the Second Nurse'), findsOneWidget);
      expect(entries(h), before + 1);
      final e = h.app.store.all('entry').last;
      expect(e['status'], 'draft');
      expect(e['raw_input_ref'], ref);
      expect(p.draftEntryId, e['id']);
      // Without a valid second check the core refuses to confirm it.
      expect(() => confirmDraft(h.app.ctx(), e['id'] as String, p.values, careTime: p.careTime), throwsA(isA<AppError>()));
      // Asking again uses the same draft.
      await tapOn(t, find.text('Ask the Second Nurse Again'));
      expect(entries(h), before + 1);
      final again = t.widget<CosignScreen>(find.byType(CosignScreen)).proposal;
      final att = recordAttestation(h.app.ctx(), witnessId: 's-dc', outcome: 'given', patientId: 'p-ap', careTime: again.careTime, values: again.values, checklist: const ['x']);
      confirmDraft(h.app.ctx(), again.draftEntryId!, again.values, careTime: again.careTime, attestationId: att);
      Navigator.of(t.element(find.byType(CosignScreen))).pop(again.draftEntryId);
      await settle(t);
      expect(find.text('SAVED ON THIS PHONE'), findsOneWidget);
      expect(h.app.store.where('med_admin', 'entry_id', e['id'] as String).single['double_checked_by'], 's-dc');
      await closeApp(t, h);
    });

    testWidgets('discard asks, then an empty manual form opens and the photo stays', (t) async {
      final h = await nurse(t);
      await open(t, h);
      await tapOn(t, find.text('Discard Draft & Enter Manually'));
      await tapOn(t, find.text('Cancel'));
      expect(listDrafts(h.app.store, 's-sj', kind: 'paper'), hasLength(1));
      await tapOn(t, find.text('Discard Draft & Enter Manually'));
      await tapOn(t, find.text('Discard'));
      expect(listDrafts(h.app.store, 's-sj', kind: 'paper'), isEmpty);
      expect(find.text('No photo: manual entry'), findsOneWidget);
      expect(h.app.store.count('m_photo'), 1);
      await closeApp(t, h);
    });

    testWidgets('manual vitals: typed record, warning tick, blank stays not assessed, 0 stays 0', (t) async {
      final h = await nurse(t);
      await push(t, h, (c) => Go.paperDraft(c, 'p-ap', formType: 'vitals'), height: 2400);
      await type(t, 'Pulse in /min', '130');
      await type(t, 'Pain in /10', '0');
      await tapOn(t, tick);
      await tapOn(t, commit);
      expect(find.text('Record 1 Saved'), findsNothing); // the warning is not ticked yet
      await tapOn(t, find.textContaining('is unusual'));
      await tapOn(t, commit);
      final e = h.app.store.all('entry').last;
      expect(e['raw_input_kind'], 'typed');
      final v = h.app.store.where('vital_sign', 'entry_id', e['id'] as String).single;
      expect((v['heart_rate'], v['pain_0_10'], v['spo2']), (130, 0, null));
      await closeApp(t, h);
    });
  });

  group('companions', () {
    Future<void> saveOnce(WidgetTester t, Harness h, String table) async {
      final before = entries(h);
      await tapOn(t, find.text('Review'));
      h.app.store.fault = (op) {
        if (op == 'insert $table') throw const StorageError(kStorageFailed);
      };
      await tapOn(t, find.text('Save on this phone'));
      expect(find.text(kStorageFailed), findsOneWidget);
      expect(entries(h), before);
      h.app.store.fault = null;
      final again = find.text('Try again');
      await t.ensureVisible(again);
      await t.pump();
      await t.tap(again);
      await t.tap(again, warnIfMissed: false);
      await settle(t);
      expect(entries(h), before + 1);
      expect(h.app.store.all('entry').last['type'], table);
      expect(find.text('home'), findsOneWidget);
      expect(listDrafts(h.app.store, 's-sj'), isEmpty);
    }

    testWidgets('fluid', (t) async {
      final h = await nurse(t);
      await push(t, h, (c) => Go.fluid(c, 'p-ap'));
      await tapOn(t, find.text('Review'));
      expect(find.text('Pick In or Out'), findsOneWidget);
      await tapOn(t, find.text('Out (patient passed out)'));
      await tapOn(t, find.text('Urine'));
      // An empty amount is never filled by the buttons.
      await tapOn(t, find.bySemanticsLabel('50 mL more'));
      await type(t, 'Amount in mL', '200');
      await tapOn(t, find.bySemanticsLabel('50 mL more'));
      await saveOnce(t, h, 'intake_output');
      final io = h.app.store.all('intake_output').last;
      expect((io['direction'], io['category'], io['volume_ml']), ('out', 'urine', 250));
      await closeApp(t, h);
    });

    testWidgets('note with a score the nurse typed', (t) async {
      final h = await nurse(t);
      await push(t, h, (c) => Go.note(c, 'p-ap'));
      await tapOn(t, find.text('Risk score'));
      await type(t, 'Score name', 'Braden');
      await type(t, 'Score', '17');
      await type(t, 'Note', 'Fictional note.');
      await saveOnce(t, h, 'note');
      final n = h.app.store.all('note').last;
      expect((n['score_name'], n['score_value'], n['text']), ('Braden', 17, 'Fictional note.'));
      await closeApp(t, h);
    });

    testWidgets('critical lab: open points need a tick', (t) async {
      final h = await nurse(t);
      await push(t, h, (c) => Go.lab(c, 'p-ap'));
      await type(t, 'Test', 'Potassium');
      await tapOn(t, find.text('Critical result (phoned by lab)'));
      await type(t, 'Result', '6.4');
      await type(t, 'Unit', 'mmol/L');
      final before = entries(h);
      await tapOn(t, find.text('Review'));
      await tapOn(t, find.text('Save on this phone'));
      expect(entries(h), before);
      await tapOn(t, find.textContaining('Who was told about this critical result'));
      await tapOn(t, find.textContaining('Read-back is not ticked'));
      await tapOn(t, find.text('Save on this phone'));
      expect(entries(h), before + 1);
      final l = h.app.store.all('lab_event').last;
      expect((l['status'], l['value_num'], l['read_back']), ('critical', 6.4, false));
      await closeApp(t, h);
    });

    testWidgets('a half-typed form is kept for its owner and offered again', (t) async {
      final h = await nurse(t);
      await push(t, h, (c) => Go.note(c, 'p-ap'));
      await type(t, 'Note', 'Half a note');
      await t.pump(const Duration(seconds: 1));
      await tapOn(t, find.bySemanticsLabel('Go back'));
      expect(listDrafts(h.app.store, 's-sj', kind: 'note'), hasLength(1));
      await push(t, h, (c) => Go.note(c, 'p-ap'));
      expect(find.text('Half a note'), findsOneWidget);
      expect(find.text('Your unfinished form was opened again.'), findsOneWidget);
      await closeApp(t, h);
    });

    testWidgets('mark as a mistake needs a reason and keeps the values', (t) async {
      final h = await nurse(t);
      await push(t, h, (c) => Go.entry(c, 'p-ap', 'de-011'));
      await tapOn(t, find.text('Mark as a mistake'));
      await tapOn(t, find.bySemanticsLabel('Mark as a mistake').last); // no reason yet
      expect(h.app.store.get('entry', 'de-011')!['status'], 'confirmed');
      await type(t, 'Reason', 'wrong patient');
      await tapOn(t, find.bySemanticsLabel('Mark as a mistake').last);
      expect(h.app.store.get('entry', 'de-011')!['status'], 'entered-in-error');
      expect(h.app.store.get('entry', 'de-011')!['change_reason'], 'wrong patient');
      expect(h.app.store.where('vital_sign', 'entry_id', 'de-011').single['heart_rate'], isNotNull);
      expect(find.text('Marked as a mistake'), findsWidgets);
      expect(find.text('Correct'), findsNothing);
      await closeApp(t, h);
    });

    testWidgets('correct opens the vitals form with the stored values and a reason', (t) async {
      final h = await nurse(t);
      await push(t, h, (c) => Go.entry(c, 'p-ap', 'de-011'));
      await tapOn(t, find.text('Correct'));
      await type(t, 'Why are you fixing this?', 'typed wrong');
      await tapOn(t, find.text('Open the form'));
      final d = t.widget<VitalsEditorScreen>(find.byType(VitalsEditorScreen)).draft!;
      expect((d.supersedesId, d.correctionReason, d.raw['bp_systolic']), ('de-011', 'typed wrong', '138'));
      await closeApp(t, h);
    });

    testWidgets('an admin sees the record but no change buttons', (t) async {
      final h = await nurse(t);
      await real(t, () => h.signIn('s-ad'));
      h.app.verifyPatient('p-ap', ['Name', 'MRN']);
      await push(t, h, (c) => Go.entry(c, 'p-ap', 'de-011'));
      expect(find.text('Who, when, where'), findsOneWidget);
      expect(find.text('Correct'), findsNothing);
      expect(find.text('Mark as a mistake'), findsNothing);
      await closeApp(t, h);
    });

    testWidgets('a practice vital-sign draft is checked and confirmed; a high-alert draft goes to the second nurse', (t) async {
      final h = await real(t, () => Harness.make().ready());
      addTearDown(h.dispose);
      await real(t, () => h.signIn('pr-park'));
      h.app.verifyPatient('pt-08', ['Name', 'MRN']);
      await push(t, h, (c) => Go.entry(c, 'pt-08', 'e-048'), height: 3200);
      expect(find.textContaining('not stored on this phone'), findsWidgets);
      await tapOn(t, find.text('Check and confirm this draft'));
      await tapOn(t, find.text('Confirm record'));
      expect(h.app.store.get('entry', 'e-048')!['status'], 'draft');
      for (final w in find.textContaining('is unusual').evaluate().toList()) {
        await t.tap(find.byWidget(w.widget));
        await settle(t);
      }
      await tapOn(t, find.textContaining('I have compared each value'));
      await tapOn(t, find.text('Confirm record'));
      final e = h.app.store.get('entry', 'e-048')!;
      expect((e['status'], e['confirmed_by'], e['raw_input_kind']), ('confirmed', 'pr-park', 'photo'));
      expect(h.app.store.where('vital_sign', 'entry_id', 'e-048').single['bp_systolic'], 146);

      h.app.verifyPatient('pt-07', ['Name', 'MRN']);
      await push(t, h, (c) => Go.entry(c, 'pt-07', 'e-049'), height: 3200);
      await tapOn(t, find.text('Check and confirm this draft'));
      await tapOn(t, find.textContaining('I have compared each value'));
      await tapOn(t, find.text('Ask the second nurse'));
      expect(t.widget<CosignScreen>(find.byType(CosignScreen)).proposal.draftEntryId, 'e-049');
      expect(h.app.store.get('entry', 'e-049')!['status'], 'draft');
      await closeApp(t, h);
    });

    testWidgets('local review: only own forms, draft records, and no word about sending', (t) async {
      final h = await nurse(t);
      final ref = keepPhoto(h, paperMar());
      fillDraft(h, ref);
      createEntry(h.app.ctx(), type: 'note', patientId: 'p-ap', careTime: '2026-11-14T16:00:00-05:00', values: {'category': 'other', 'text': 'x', 'score_name': null, 'score_value': null}, clientKey: 'k-d', status: 'draft');
      await push(t, h, Go.queue);
      expect(find.text('Paper entry'), findsOneWidget);
      expect(find.textContaining(RegExp('sync', caseSensitive: false)), findsNothing);
      await tapOn(t, find.text('Continue'));
      expect(find.byType(PaperDraftScreen), findsOneWidget);
      await real(t, () => h.signIn('s-dc'));
      await push(t, h, Go.queue);
      expect(find.text('Paper entry'), findsNothing);
      expect(find.text('You have no unfinished form on this phone.'), findsOneWidget);
      expect(find.text('Other'), findsOneWidget); // the draft record is for any nurse
      await real(t, () => h.signIn('s-sj'));
      await push(t, h, Go.queue);
      await tapOn(t, find.text('Discard'));
      await tapOn(t, find.bySemanticsLabel('Cancel'));
      expect(listDrafts(h.app.store, 's-sj'), hasLength(1));
      await tapOn(t, find.text('Discard'));
      await tapOn(t, find.text('Discard').last);
      expect(listDrafts(h.app.store, 's-sj'), isEmpty);
      expect(h.app.store.count('m_photo'), 1);
      await closeApp(t, h);
    });

    testWidgets('alerts: facts of the ward, opened for the verified patient', (t) async {
      final h = await nurse(t);
      await push(t, h, Go.alerts, height: 2600);
      expect(find.text('Ceftriaxone: Order on hold'), findsOneWidget);
      expect(find.textContaining('Metoprolol Tartrate 25 mg PO'), findsOneWidget);
      expect(find.textContaining('Penicillin: Anaphylaxis'), findsOneWidget);
      await tapOn(t, find.text('Ceftriaxone: Order on hold'));
      expect(find.byType(ConflictScreen), findsOneWidget);
      await closeApp(t, h);
    });

    testWidgets('more: lock, sign out, lock records, admin pages only for an admin', (t) async {
      final h = await nurse(t);
      await push(t, h, Go.more, height: 2200);
      expect(find.text('Recovery worklist'), findsNothing);
      expect(find.text(kPolicyNote), findsOneWidget);
      await tapOn(t, find.text('Lock'));
      expect(h.app.locked, isTrue);
      expect(h.app.verifiedPatientId, isNull);
      await real(t, () => h.signIn('s-sj'));
      await push(t, h, Go.more, height: 2200);
      await tapOn(t, find.text('Sign out'));
      expect(h.app.user, isNull);
      await real(t, () => h.signIn('s-ad'));
      await push(t, h, Go.more, height: 2200);
      expect(find.text('Recovery worklist'), findsOneWidget);
      await tapOn(t, find.text('Lock encrypted records'));
      await tapOn(t, find.text('Cancel'));
      expect(h.app.unlocked, isTrue);
      await tapOn(t, find.text('Lock encrypted records'));
      await tapOn(t, find.text('Lock records'));
      expect(h.app.vaultStatus, VaultStatus.locked);
      await closeApp(t, h);
    });

    testWidgets('reset: a wrong passphrase deletes nothing, the right one starts again', (t) async {
      final h = await nurse(t);
      keepPhoto(h, paperMar());
      Future<void> reset(String pass) async {
        await tapOn(t, find.text('Reset practice'));
        await tapOn(t, find.text('Continue'));
        await type(t, 'Practice passphrase', pass);
        await tapOn(t, find.text('Delete and start again'));
        await t.runAsync(() => Future<void>.delayed(const Duration(seconds: 1)));
        await settle(t);
      }

      await push(t, h, Go.more, height: 2200);
      await reset('not it');
      expect(find.textContaining('The passphrase is not right.'), findsOneWidget);
      expect(h.app.signedIn, isTrue);
      expect(h.app.store.count('m_photo'), 1);
      await t.pump(const Duration(seconds: 10));
      await settle(t);
      await reset(kPracticePassphrase);
      await t.runAsync(() => Future<void>.delayed(const Duration(seconds: 2)));
      await settle(t);
      expect(h.app.unlocked, isTrue);
      expect(h.app.user, isNull);
      expect(h.app.store.count('m_photo'), 0);
      expect(h.app.store.where('audit_log', 'action', 'practice_reset'), hasLength(1));
      await closeApp(t, h);
    });
  });
}
