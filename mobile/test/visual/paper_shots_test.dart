import 'dart:typed_data';

import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/repos/entries.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/companion_screens.dart';
import 'package:clinbridge_practice/ui/screens/paper_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

import '../support/host.dart';
import '../support/shots.dart';

const capture = 'clinbridge_paper_capture_camera_viewfinder';
const preview = 'clinbridge_paper_photo_preview_quality_check';
const errorPage = 'clinbridge_optical_paper_capture_glare_occlusion_error';
const draft = 'clinbridge_paper_draft_review_value_verification';
const companions = 'companions';

/// A fictional paper MAR on a grey table, drawn with the package's own fonts.
Uint8List paperMar({int w = 1200, int h = 900}) {
  final im = img.Image(width: w, height: h);
  img.fill(im, color: img.ColorRgb8(150, 146, 138));
  img.fillRect(im, x1: 40, y1: 36, x2: w - 40, y2: h - 36, color: img.ColorRgb8(250, 250, 246));
  final ink = img.ColorRgb8(20, 28, 50), line = img.ColorRgb8(130, 136, 148);
  void text(String s, int x, int y, img.BitmapFont f) => img.drawString(im, s, font: f, x: x, y: y, color: ink);
  text('MEDICATION ADMINISTRATION RECORD', 80, 70, img.arial24);
  text('FICTIONAL PRACTICE FORM', w - 380, 70, img.arial24);
  text('Pendelton, Arthur   MRN 9402-1842   Bed 412-A', 80, 120, img.arial24);
  for (var y = 180; y < h - 60; y += 70) {
    img.drawLine(im, x1: 70, y1: y, x2: w - 70, y2: y, color: line, thickness: 2);
  }
  for (final x in [70, 520, 720, 900, w - 70]) {
    img.drawLine(im, x1: x, y1: 180, x2: x, y2: h - 90, color: line, thickness: 2);
  }
  text('MEDICATION', 90, 200, img.arial24);
  text('DOSE', 540, 200, img.arial24);
  text('TIME', 740, 200, img.arial24);
  text('INITIALS', 920, 200, img.arial24);
  const rows = [('Metoprolol', '25 mg PO', '16:12', 'SJ'), ('Ceftriaxone', '1 g IV', '', ''), ('Lisinopril', '10 mg PO', '08:02', 'SJ')];
  for (var i = 0; i < rows.length; i++) {
    final y = 262 + i * 70, r = rows[i];
    text(r.$1, 90, y, img.arial48);
    text(r.$2, 540, y, img.arial24);
    text(r.$3, 740, y, img.arial24);
    text(r.$4, 920, y, img.arial24);
  }
  return img.encodeJpg(im, quality: 85);
}

Uint8List flat(int level, {int w = 800, int h = 600}) {
  final im = img.Image(width: w, height: h);
  img.fill(im, color: img.ColorRgb8(level, level, level));
  final d = (level - 12).clamp(0, 255);
  img.drawString(im, 'Fictional form', font: img.arial24, x: 40, y: 40, color: img.ColorRgb8(d, d, d));
  return img.encodePng(im);
}

PaperShot shotOf(Uint8List b, {String type = 'medication', String mime = 'image/jpeg', String source = 'camera'}) => PaperShot('p-ap', type, PickedBytes(b, mime, source));

/// Waits for real work (isolate, crypto) until [f] is on screen.
Future<void> until(WidgetTester t, Finder f, {int tries = 100}) async {
  for (var i = 0; i < tries && f.evaluate().isEmpty; i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await t.pump(const Duration(milliseconds: 100));
  }
  expect(f, findsWidgets);
}

Future<void> tapOn(WidgetTester t, Finder f) async {
  await t.ensureVisible(f.first);
  await t.pump();
  await t.tap(f.first);
  await settle(t);
}

/// Stops the app's own timers before the test framework looks for them.
Future<void> closeApp(WidgetTester t, Harness h) async {
  await t.pumpWidget(const SizedBox());
  h.app.lockVault();
  await t.pump(const Duration(seconds: 10));
}

Future<Harness> nurse(WidgetTester t) async {
  final h = await real(t, () => designHarness());
  addTearDown(h.dispose);
  await real(t, () => h.signIn('s-sj'));
  h.app.verifyPatient('p-ap', ['Name', 'MRN']);
  return h;
}

String keepPhoto(Harness h, Uint8List b, {String type = 'medication'}) =>
    savePhoto(h.app.ctx(), patientId: 'p-ap', bytes: b, mime: 'image/jpeg', check: {'form_type': type, 'readable': true, 'problem': 'none', 'overridden': false, 'checked_by': 's-sj', 'method': 'manual+technical'});

const cefText = {'dose': '1', 'time': '16:12'};
const cefPick = {'day': 'today', 'order': 'o-cef', 'event': 'administered', 'slot': '2026-11-14T18:00:00-05:00', 'unit': 'g', 'route': 'IV'};
const metText = {'dose': '25', 'time': '16:12'};
const metPick = {'day': 'today', 'order': 'o-met', 'event': 'administered', 'slot': '2026-11-14T16:00:00-05:00', 'unit': 'mg', 'route': 'PO'};

void fillDraft(Harness h, String ref, {Map<String, String> text = cefText, Map<String, String> pick = cefPick}) => saveDraft(h.app.ctx(), id: 'paper:s-sj:$ref', kind: 'paper', patientId: 'p-ap', payload: {
      'form': {'type': 'med_admin', 'text': text, 'pick': pick},
      'key': newId('k'),
      'form_type': 'medication',
      'photo_ref': ref,
    });

void main() {
  visual('capture', (t) async {
    final h = await nurse(t);
    Widget home() => const PaperCaptureScreen(patientId: 'p-ap', formType: 'medication');
    await pumpPhone(t, h, home: home());
    await shot(t, '$capture/first');
    await pumpPhone(t, h, home: home(), height: 1600 * 390 / 701);
    await shot(t, '$capture/full');
    await tapOn(t, find.bySemanticsLabel(RegExp('Document type')));
    await shot(t, '$capture/type_menu');
    for (final w in [360.0, 430.0]) {
      await pumpPhone(t, h, home: home(), width: w);
      await shot(t, '$capture/w${w.round()}');
    }
    await pumpPhone(t, h, home: home(), textScale: 1.5, height: 1400);
    await shot(t, '$capture/text150');
    h.bridge.torchSupported = false;
    await pumpPhone(t, h, home: home());
    await shot(t, '$capture/no_torch');
    h.bridge.permission = 'denied';
    await pumpPhone(t, h, home: home());
    await shot(t, '$capture/camera_ask');
    h.bridge.permissionAfterAsk = 'denied';
    await tapOn(t, find.text('Allow camera'));
    await shot(t, '$capture/camera_denied');
    h.bridge.permissionAfterAsk = 'blocked';
    await tapOn(t, find.text('Ask again'));
    await shot(t, '$capture/camera_blocked');
    h.bridge
      ..permission = 'granted'
      ..cameraError = const AppError('The camera is used by another app.');
    await pumpPhone(t, h, home: home());
    await shot(t, '$capture/camera_error');
    await closeApp(t, h);
  });

  visual('preview', (t) async {
    final h = await nurse(t);
    final mar = paperMar();
    Future<void> open(Uint8List b, {double width = 390, double height = 844, double scale = 1, String mime = 'image/jpeg'}) async {
      await pumpPhone(t, h, home: PaperPreviewScreen(shot: shotOf(b, mime: mime)), width: width, height: height, textScale: scale);
      await until(t, find.textContaining('Measured on this phone'));
      await settle(t);
    }

    await open(mar);
    await shot(t, '$preview/first');
    await tapOn(t, find.textContaining('Tap to inspect'));
    await shot(t, '$preview/zoomed');
    await open(mar, height: 1600 * 390 / 523);
    await tapOn(t, find.text('Patient Match Confirmation'));
    await tapOn(t, find.text('Legibility & Form Type'));
    await shot(t, '$preview/full');
    await open(mar, width: 360);
    await shot(t, '$preview/w360');
    await open(mar, width: 430);
    await shot(t, '$preview/w430');
    await open(mar, height: 1800, scale: 1.5);
    await shot(t, '$preview/text150');
    await open(flat(252), mime: 'image/png', height: 1193);
    await shot(t, '$preview/preview_glare');
    await open(flat(24), mime: 'image/png', height: 1193);
    await shot(t, '$preview/preview_dark');
    await tapOn(t, find.text('Reject photo'));
    await shot(t, '$preview/reject_sheet');
    await closeApp(t, h);
  });

  visual('error', (t) async {
    final h = await nurse(t);
    final mar = paperMar();
    Future<void> open(Uint8List b, List<String> why, {double width = 390, double height = 844, double scale = 1}) async {
      await pumpPhone(t, h, home: PaperErrorScreen(shot: shotOf(b), staffReasons: why), width: width, height: height, textScale: scale);
      await until(t, find.textContaining('Measured on this phone'));
      await settle(t);
    }

    await open(mar, ['glare', 'covered']);
    await shot(t, '$errorPage/first');
    await open(mar, ['glare', 'covered'], height: 1600 * 390 / 315);
    await shot(t, '$errorPage/full');
    await open(flat(24), ['corner', 'other: coffee stain on the dose column'], height: 1981);
    await shot(t, '$errorPage/error_reasons');
    await open(Uint8List.fromList([1, 2, 3, 4]), [kUndecodable], height: 1981);
    await shot(t, '$errorPage/undecodable');
    await open(mar, ['glare'], width: 360);
    await shot(t, '$errorPage/w360');
    await open(mar, ['glare'], width: 430);
    await shot(t, '$errorPage/w430');
    await open(mar, ['glare'], height: 2600, scale: 1.5);
    await shot(t, '$errorPage/text150');
    await closeApp(t, h);
  });

  visual('draft', (t) async {
    final h = await nurse(t);
    final ref = keepPhoto(h, paperMar());
    fillDraft(h, ref);
    Widget home() => PaperDraftScreen(patientId: 'p-ap', formType: 'medication', photoRef: ref);
    await pumpPhone(t, h, home: home());
    await shot(t, '$draft/first');
    await pumpPhone(t, h, home: home(), height: 1600 * 390 / 412);
    await shot(t, '$draft/full');
    await pumpPhone(t, h, home: home(), height: 1900);
    await shot(t, '$draft/held_order');
    await pumpPhone(t, h, home: home(), width: 360);
    await shot(t, '$draft/w360');
    await pumpPhone(t, h, home: home(), width: 430);
    await shot(t, '$draft/w430');
    await pumpPhone(t, h, home: home(), textScale: 1.5, height: 2700);
    await shot(t, '$draft/text150');
    await tapOn(t, find.text('Expand'));
    await shot(t, '$draft/modal');

    // A dose that can be committed: metoprolol 25 mg, due 16:00.
    final ref2 = keepPhoto(h, paperMar(w: 1100, h: 800));
    fillDraft(h, ref2, text: metText, pick: metPick);
    await pumpPhone(t, h, home: PaperDraftScreen(patientId: 'p-ap', formType: 'medication', photoRef: ref2), height: 1760);
    await shot(t, '$draft/draft_unticked');
    await tapOn(t, find.textContaining('I have compared each value'));
    await shot(t, '$draft/draft_ticked');
    h.app.store.fault = (op) {
      if (op == 'commit') throw const StorageError(kStorageFull);
    };
    await tapOn(t, find.text('Confirm & Commit to Device Vault'));
    await shot(t, '$draft/draft_failed');
    h.app.store.fault = null;
    await tapOn(t, find.text('Try Again'));
    expect(find.text('View Record'), findsOneWidget);
    await shot(t, '$draft/draft_saved');

    await pumpPhone(t, h, home: const PaperDraftScreen(patientId: 'p-ap', formType: 'vitals'), height: 1900);
    await shot(t, '$draft/manual_vitals');
    await closeApp(t, h);
  });

  visual('companions', (t) async {
    final h = await nurse(t);
    Future<void> page(String name, Widget Function() w, {double height = 1100}) async {
      await pumpPhone(t, h, home: w(), height: height);
      await shot(t, '$companions/$name');
      await pumpPhone(t, h, home: w(), width: 360);
      await shot(t, '$companions/${name}_w360');
      await pumpPhone(t, h, home: w(), width: 430);
      await shot(t, '$companions/${name}_w430');
      await pumpPhone(t, h, home: w(), textScale: 1.5, height: 1600);
      await shot(t, '$companions/${name}_text150');
    }

    await page('fluid', () => const FluidScreen(patientId: 'p-ap'));
    await pumpPhone(t, h, home: const FluidScreen(patientId: 'p-ap'), height: 1100);
    await tapOn(t, find.text('In (patient took in)'));
    await shot(t, '$companions/fluid_in');
    await page('lab', () => const LabScreen(patientId: 'p-ap'));
    await page('note', () => const NoteScreen(patientId: 'p-ap'));
    final ref = keepPhoto(h, paperMar(w: 1100, h: 800));
    createEntry(h.app.ctx(), type: 'note', patientId: 'p-ap', careTime: '2026-11-14T16:10:00-05:00', values: {'category': 'other', 'text': 'Fictional note typed from paper.', 'score_name': null, 'score_value': null}, clientKey: 'k-shot', rawInputKind: 'photo', rawInputRef: ref, photoCheck: const {'form_type': 'note'});
    final photoEntry = h.app.store.all('entry').last['id'] as String;
    await page('entry_detail', () => EntryDetailScreen(patientId: 'p-ap', entryId: photoEntry), height: 1300);
    await page('entry_detail_vitals', () => const EntryDetailScreen(patientId: 'p-ap', entryId: 'de-011'));
    fillDraft(h, ref);
    await page('queue', () => const QueueScreen());
    await page('alerts', () => const AlertsScreen());
    await page('more', () => const MoreScreen(), height: 1300);
    await closeApp(t, h);
  });
}
