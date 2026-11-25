import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/repos/entries.dart';
import 'package:clinbridge_practice/data/schema.dart';
import 'package:clinbridge_practice/domain/meds.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/body_art.dart';
import 'package:clinbridge_practice/ui/screens/body_map_screen.dart';
import 'package:clinbridge_practice/ui/screens/med_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/host.dart';
import '../support/shots.dart';

const mar = 'clinbridge_medication_schedule_offline_mar';
const med = 'clinbridge_record_medication_event';
const cos = 'clinbridge_second_nurse_pin_co_sign';
const con = 'clinbridge_critical_medication_conflict_dose_lock_alert';
const body = 'clinbridge_anatomical_body_map_assessment';
const slot16 = '2026-11-14T16:00:00-05:00';
const slot18 = '2026-11-14T18:00:00-05:00';

Future<Harness> start(WidgetTester t, {String who = 's-sj', String patient = 'p-ap', String now = designNow}) async {
  final h = await real(t, () => designHarness(now: now));
  addTearDown(h.dispose);
  await real(t, () => h.signIn(who));
  h.app.verifyPatient(patient, ['Name', 'MRN']);
  return h;
}

ActiveOrder orderOf(Harness h, String id) => ActiveOrder(h.app.store.get('active_order', id)!);

Future<void> tapLabel(WidgetTester t, Pattern label) async {
  final f = find.bySemanticsLabel(label).first;
  await t.ensureVisible(f);
  await t.pump(const Duration(milliseconds: 300));
  await t.tap(f, warnIfMissed: false);
  await settle(t);
}

/// First view, widths and large text of one screen.
Future<void> frames(WidgetTester t, Harness h, String folder, Widget Function() screen, {Future<void> Function()? prepare}) async {
  await pumpPhone(t, h, home: screen());
  await shot(t, '$folder/first');
  await pumpPhone(t, h, home: screen(), width: 360);
  await shot(t, '$folder/w360');
  await pumpPhone(t, h, home: screen(), width: 430, height: 932);
  await shot(t, '$folder/w430');
  await pumpPhone(t, h, home: screen(), textScale: 1.5, height: 2600);
  await shot(t, '$folder/text150');
  await pumpPhone(t, h, home: screen(), width: 360, textScale: 1.5, height: 2600);
}

MedProposal titration(Harness h, {String rate = '1100'}) {
  final o = orderOf(h, 'o-hep');
  final v = validateMed(MedForm(event: 'rate_changed', rate: rate, rateUnit: 'units/h'), o, 1000);
  return MedProposal(patientId: 'p-ap', orderId: o.id, key: newId('k'), careTime: h.app.nowIso, values: v.values, checklist: const ['a', 'b', 'c']);
}

Future<void> finding(Harness h, String region, String view, String kind, String text, {String at = '2026-11-14T12:30:00-05:00'}) async {
  final r = regionById(region)!;
  createEntry(
    h.app.ctx(),
    type: 'note',
    patientId: 'p-ap',
    careTime: at,
    clientKey: newId('k'),
    values: {'category': 'assessment', 'text': '${r.label}: $text', 'score_name': null, 'score_value': null},
    also: (e) => h.app.store.insert('m_body_finding', {'id': newId('bf'), 'entry_id': e.id, 'patient_id': 'p-ap', 'region_id': r.id, 'region_label': r.label, 'side': r.side, 'view': view, 'kind': kind, 'text': text, 'saved_at': e.entryTime}),
  );
}

Future<Uint8List> picture(Color a, Color b) async {
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  c.drawRect(const Rect.fromLTWH(0, 0, 320, 240), Paint()..color = a);
  c.drawRect(const Rect.fromLTWH(40, 40, 240, 120), Paint()..color = b);
  final img = await rec.endRecording().toImage(320, 240);
  return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
}

Future<void> digits(WidgetTester t, String pin) async {
  for (final d in pin.split('')) {
    await t.tap(find.byKey(ValueKey('pin-$d')));
    await t.pump(const Duration(milliseconds: 50));
  }
  await settle(t);
}

Future<void> top(WidgetTester t) async {
  await t.drag(find.byType(SingleChildScrollView).first, const Offset(0, 3000), warnIfMissed: false);
  await settle(t);
}

Future<void> wait(WidgetTester t) async {
  await real(t, () async => Future<void>.delayed(const Duration(milliseconds: 150)));
  await settle(t);
}

/// Taps start the idle timers inside the test clock; closing the records stops them.
void shots(String name, Future<Harness> Function(WidgetTester t) body) => visual(name, (t) async {
      final h = await body(t);
      await t.pumpWidget(const SizedBox());
      h.app.lockVault();
      await t.pump(const Duration(seconds: 10));
    });

void main() {
  shots('mar', (t) async {
    final h = await start(t);
    await frames(t, h, mar, () => const MarScreen(patientId: 'p-ap'));
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1600 * 390 / 329);
    await shot(t, '$mar/full');
    await tapLabel(t, RegExp(r'^Due Now'));
    await shot(t, '$mar/mar_filter_due');
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'));
    await tapLabel(t, 'Record Administration');
    await shot(t, '$mar/mar_modal');
    await tapLabel(t, 'Cancel');
    await tapLabel(t, 'Order Details');
    await shot(t, '$mar/order_details');
    await tapLabel(t, 'Close');
    await tapLabel(t, 'Record Med Event');
    await shot(t, '$mar/pick_order');
    return h;
  });

  shots('mar admin looks only', (t) async {
    final h = await start(t, who: 's-ad');
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1900);
    await shot(t, '$mar/admin');
    return h;
  });

  shots('med event', (t) async {
    final h = await start(t, now: '2026-11-14T16:20:00-05:00');
    Widget s() => const MedEventScreen(patientId: 'p-ap', orderId: 'o-hep', event: 'rate_changed');
    await frames(t, h, med, s);
    await pumpPhone(t, h, home: s(), height: 1600 * 390 / 450);
    await t.enterText(find.byType(TextField).first, '1100');
    await settle(t);
    for (final x in ['Right patient', 'Rate on the order', 'Line traced']) {
      await tapLabel(t, RegExp('^$x'));
    }
    await top(t);
    await shot(t, '$med/full');

    Widget dose() => const MedEventScreen(patientId: 'p-ap', orderId: 'o-met', event: 'administered', scheduledTime: slot16);
    await pumpPhone(t, h, home: dose(), height: 1300);
    await shot(t, '$med/ordinary_dose');
    await tapLabel(t, 'Review & Save');
    await shot(t, '$med/review');
    await pumpPhone(t, h, home: dose(), width: 360, textScale: 1.5, height: 2200);
    await shot(t, '$med/ordinary_text150');
    await pumpPhone(t, h, home: const MedEventScreen(patientId: 'p-ap', orderId: 'o-met', event: 'held', scheduledTime: slot16));
    await tapLabel(t, 'Review & Save');
    await shot(t, '$med/held_reason');
    await pumpPhone(t, h, home: const MedEventScreen(patientId: 'p-ap', orderId: 'o-hyd', event: 'administered'), height: 1900);
    await t.enterText(find.byType(TextField).first, '1');
    await settle(t);
    await shot(t, '$med/high_alert_dose_warning');
    await tapLabel(t, RegExp('^Bedside execution time'));
    await shot(t, '$med/time');
    return h;
  });

  shots('cosign', (t) async {
    final h = await start(t, now: '2026-11-14T16:20:00-05:00');
    final p = titration(h);
    await frames(t, h, cos, () => CosignScreen(proposal: p));
    await pumpPhone(t, h, home: CosignScreen(proposal: p), height: 1600 * 390 / 533);
    await shot(t, '$cos/cosign_empty');
    await tapLabel(t, 'Choose the second nurse');
    await shot(t, '$cos/cosign_choose');
    await tapLabel(t, 'David Chen, RN');
    await digits(t, '135');
    await top(t);
    await shot(t, '$cos/full');
    await digits(t, '9');
    for (var i = 0; i < 5; i++) {
      await tapLabel(t, 'Authorize & Save On This Phone');
      await wait(t);
      if (i == 0) await shot(t, '$cos/cosign_wrong_pin');
      if (i < 4) await digits(t, '1359');
    }
    await shot(t, '$cos/cosign_lockout');
    await tapLabel(t, 'Decline / Flag Discrepancy');
    await shot(t, '$cos/cosign_decline');
    expect(h.app.store.where('med_admin', 'order_id', 'o-hep').length, 1);
    return h;
  });

  shots('conflict', (t) async {
    final h = await start(t);
    final cef = orderOf(h, 'o-cef');
    List<DoseLock> locks(ActiveOrder o, {String? slot}) => doseLocks(h.app.store, o, listPatientEntries(h.app.store, 'p-ap'), careTime: h.app.nowIso, scheduledTime: slot);
    Widget hold() => ConflictScreen(patientId: 'p-ap', orderId: 'o-cef', scheduledTime: slot18, locks: locks(cef, slot: slot18));
    await frames(t, h, con, hold);
    await pumpPhone(t, h, home: hold(), height: 1600 * 390 / 315);
    await shot(t, '$con/full');
    await tapLabel(t, 'Confirm Hold & Return to MAR');
    await shot(t, '$con/hold_reason');
    return h;
  });

  shots('conflict interval', (t) async {
    final h = await start(t);
    final o = orderOf(h, 'o-alb');
    createEntry(h.app.ctx(), type: 'med_admin', patientId: 'p-ap', careTime: '2026-11-14T15:05:00-05:00', clientKey: newId('k'), values: validateMed(const MedForm(event: 'administered', dose: '2', unit: 'mg', route: 'INH'), o, null).values);
    final l = doseLocks(h.app.store, o, listPatientEntries(h.app.store, 'p-ap'), careTime: h.app.nowIso);
    expect(l.map((x) => x.kind), ['interval']);
    await pumpPhone(t, h, home: ConflictScreen(patientId: 'p-ap', orderId: 'o-alb', locks: l), height: 1600 * 390 / 315);
    await shot(t, '$con/interval');
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1600 * 390 / 329);
    await shot(t, '$mar/locked_prn');
    return h;
  });

  shots('body map', (t) async {
    final h = await start(t);
    Widget s() => const BodyMapScreen(patientId: 'p-ap');
    await pumpPhone(t, h, home: s(), height: 1500);
    await shot(t, '$body/empty');
    await finding(h, 'RIGHT_FOREARM', 'front', 'line', '20 gauge IV line. Dressing intact, no redness, no swelling.');
    await finding(h, 'BUTTOCKS', 'back', 'wound', 'Red area over the sacrum, 2.5 x 1.8 cm, skin intact.', at: '2026-11-14T14:00:00-05:00');
    await finding(h, 'RIGHT_LOWER_LEG', 'front', 'device', 'Compression sleeve on. Skin under the sleeve warm and dry.', at: '2026-11-14T15:05:00-05:00');
    for (final c in const [(Color(0xFFD8C4B8), Color(0xFFB98C7C)), (Color(0xFFC9CFD6), Color(0xFF8FA3B5))]) {
      final b = await real(t, () => picture(c.$1, c.$2));
      savePhoto(h.app.ctx(), patientId: 'p-ap', bytes: b, mime: 'image/png', check: const {});
    }
    h.app.saved();
    await frames(t, h, body, s);
    await pumpPhone(t, h, home: s(), height: 1600 * 390 / 297);
    await tapLabel(t, RegExp('Show tagged only'));
    await top(t);
    await shot(t, '$body/full');
    await tapLabel(t, 'Posterior (Back)');
    await top(t);
    await shot(t, '$body/back');
    await pumpPhone(t, h, home: s());
    // Viewer's left arm on the front view = the patient's RIGHT forearm.
    final fig = t.getRect(find.byKey(const ValueKey('body-figure')));
    await t.ensureVisible(find.byKey(const ValueKey('body-figure')));
    await t.tapAt(t.getRect(find.byKey(const ValueKey('body-figure'))).topLeft + Offset(50 / 240 * fig.width, 270 / 560 * fig.height));
    await settle(t);
    await shot(t, '$body/selected');
    await tapLabel(t, 'Tag new region');
    await shot(t, '$body/tag_sheet');
    return h;
  });
}
