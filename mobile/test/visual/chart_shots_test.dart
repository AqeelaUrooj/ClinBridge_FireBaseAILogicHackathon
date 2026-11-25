import 'dart:typed_data';

import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/repos/entries.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/patient_screens.dart';
import 'package:clinbridge_practice/ui/screens/vitals_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;

import '../support/host.dart';
import '../support/shots.dart';

const _summary = 'clinbridge_patient_summary_arthur_pendelton';
const _add = 'clinbridge_add_bedside_action_sheet';
const _history = 'clinbridge_patient_history_timeline';
const _editor = 'clinbridge_record_vitals_editor';
const _review = 'clinbridge_review_vitals_entry';

/// The values of the reference.
const refDraft = VitalsDraft(
  patientId: 'p-ap',
  key: 'k-shot',
  careTime: '2026-11-14T16:15:00-05:00',
  raw: {'bp_systolic': '136', 'bp_diastolic': '82', 'heart_rate': '78', 'spo2': '97', 'resp_rate': '16', 'temp_c': '36.9', 'pain_0_10': '2', 'o2_flow_lpm': '2'},
  o2Device: 'Nasal cannula',
  consciousness: 'Alert',
);
const oddDraft = VitalsDraft(patientId: 'p-ap', key: 'k-odd', careTime: '2026-11-14T16:15:00-05:00', raw: {'bp_systolic': '188', 'bp_diastolic': '82', 'heart_rate': '128', 'pain_0_10': '0'});

/// A drawn "paper form", so no picture file is needed.
Uint8List paper() {
  final p = img.Image(width: 800, height: 600);
  img.fill(p, color: img.ColorRgb8(232, 232, 228));
  for (var i = 0; i < 9; i++) {
    img.fillRect(p, x1: 80, y1: 70 + i * 55, x2: 720 - (i * 37) % 260, y2: 78 + i * 55, color: img.ColorRgb8(70, 80, 100));
  }
  return Uint8List.fromList(img.encodePng(p));
}

Future<Harness> _nurse(WidgetTester t, {String staff = 's-sj'}) async {
  final h = await real(t, () => designHarness());
  addTearDown(h.dispose);
  await real(t, () => h.signIn(staff));
  h.app.verifyPatient('p-ap', ['Name', 'MRN']);
  return h;
}

/// Ends a test that touched the screen: the idle timers of the session are stopped.
Future<void> _end(WidgetTester t, Harness h) async {
  await t.pumpWidget(const SizedBox());
  h.app.lockVault();
}

Future<void> _sizes(WidgetTester t, Harness h, String folder, Widget Function() home) async {
  await pumpPhone(t, h, home: home(), width: 360, height: 760);
  await shot(t, '$folder/w360');
  await pumpPhone(t, h, home: home(), width: 430, height: 932);
  await shot(t, '$folder/w430');
  await pumpPhone(t, h, home: home(), textScale: 1.5);
  await shot(t, '$folder/text150');
  await pumpPhone(t, h, home: home(), textScale: 1.5, width: 360, height: 4600);
  await shot(t, '$folder/text150_full');
}

void main() {
  visual('summary', (t) async {
    final h = await _nurse(t);
    Widget home() => const PatientSummaryScreen(patientId: 'p-ap');
    await pumpPhone(t, h, home: home());
    await shot(t, '$_summary/first');
    await pumpPhone(t, h, home: home(), height: 1753);
    await shot(t, '$_summary/full');
    await _sizes(t, h, _summary, home);
    savePhoto(h.app.ctx(), patientId: 'p-ap', bytes: paper(), mime: 'image/png', check: {'form_type': 'vitals', 'readable': true, 'problem': 'none', 'overridden': false});
    h.app.saved();
    await pumpPhone(t, h, home: home(), height: 1753);
    await shot(t, '$_summary/with_photo');
    await t.tap(find.bySemanticsLabel('Verified patient: details and leave'));
    await settle(t);
    await shot(t, '$_summary/patient_info');
    await _end(t, h);
  });

  visual('summary without data', (t) async {
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    await real(t, () => h.signIn('s-sj'));
    // A patient without entries: James Wilson's orders only.
    h.app.store.tx(() => h.app.store.insert('patient', {'id': 'p-new', 'mrn': '5550-0001', 'family_name': 'Nguyen', 'given_name': 'Practice', 'birth_date': '1990-02-03', 'sex': 'female'}));
    h.app.verifyPatient('p-new', ['Name', 'MRN']);
    await pumpPhone(t, h, home: const PatientSummaryScreen(patientId: 'p-new'), height: 1250);
    await shot(t, '$_summary/no_data');
    await pumpPhone(t, h, home: const HistoryScreen(patientId: 'p-new'));
    await shot(t, '$_history/no_data');
  });

  visual('add sheet', (t) async {
    final h = await _nurse(t);
    Widget home() => const AddBedsideScreen(patientId: 'p-ap');
    await pumpPhone(t, h, home: home());
    await shot(t, '$_add/first');
    await pumpPhone(t, h, home: home(), height: 1600 * 390 / 706);
    await shot(t, '$_add/full');
    await pumpPhone(t, h, home: home(), height: 426);
    await shot(t, '$_add/cut_like_export');
    await pumpPhone(t, h, home: home(), height: 600);
    await t.drag(find.byType(SingleChildScrollView).last, const Offset(0, -600));
    await settle(t);
    await shot(t, '$_add/scrolled_end');
    await _sizes(t, h, _add, home);
    await _end(t, h);
  });

  visual('add sheet, admin', (t) async {
    final h = await _nurse(t, staff: 's-ad');
    await pumpPhone(t, h, home: const AddBedsideScreen(patientId: 'p-ap'));
    await t.tap(find.text('Record vitals'), warnIfMissed: false);
    await settle(t);
    await shot(t, '$_add/admin_disabled');
    await t.pump(const Duration(seconds: 5));
    await _end(t, h);
  });

  visual('history', (t) async {
    final h = await _nurse(t);
    Widget home() => const HistoryScreen(patientId: 'p-ap');
    await pumpPhone(t, h, home: home());
    await shot(t, '$_history/first');
    // A correction and a handover make the ledger like the reference.
    final c = h.app.ctx();
    final old = h.app.store.get('vital_sign', 'c-011')!;
    createEntry(c, type: 'vital_sign', patientId: 'p-ap', careTime: '2026-11-14T14:15:00-05:00', values: {...old, 'heart_rate': 78}..remove('id')..remove('entry_id'), clientKey: newId('k'), supersedesId: 'de-011', correctionReason: 'Typed pulse wrong');
    createEntry(c, type: 'vital_sign', patientId: 'p-ap', careTime: '2026-11-14T16:15:00-05:00', values: {...old, 'heart_rate': 78, 'bp_systolic': 136, 'bp_diastolic': 82, 'spo2': 97, 'temp_c': 36.9, 'resp_rate': null}..remove('id')..remove('entry_id'), clientKey: newId('k'));
    final ref = savePhoto(c, patientId: 'p-ap', bytes: paper(), mime: 'image/png', check: {'form_type': 'note', 'readable': true, 'problem': 'none', 'overridden': false});
    createEntry(c, type: 'note', patientId: 'p-ap', careTime: '2026-11-14T16:20:00-05:00', values: {'category': 'assessment', 'text': 'Resting. Copied from the paper sheet.', 'score_name': null, 'score_value': null}, clientKey: newId('k'), rawInputKind: 'photo', rawInputRef: ref);
    h.app.saved();
    await pumpPhone(t, h, home: home(), height: 2500);
    await shot(t, '$_history/full');
    await _sizes(t, h, _history, home);
    await pumpPhone(t, h, home: home(), height: 1500);
    await t.ensureVisible(find.text('Vitals & Labs'));
    await settle(t);
    await t.tap(find.text('Vitals & Labs'));
    await settle(t);
    for (final label in ['Vital signs', 'Baseline Vitals']) {
      expect(find.text(label), findsWidgets);
    }
    final payloads = find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key! as ValueKey<String>).value.startsWith('payload:'));
    await t.tap(payloads.at(1));
    await settle(t);
    await shot(t, '$_history/filter_vitals_payload');
    await t.ensureVisible(find.text('Notes & SBAR'));
    await settle(t);
    await t.tap(find.text('Notes & SBAR'));
    await settle(t);
    await t.tap(payloads.first);
    await settle(t);
    await shot(t, '$_history/filter_notes_photo_payload');
    await t.tap(find.text('Performer'));
    await settle(t);
    await shot(t, '$_history/performer_sheet');
    await _end(t, h);
  });

  visual('vitals editor', (t) async {
    final h = await _nurse(t);
    Widget home() => const VitalsEditorScreen(patientId: 'p-ap', draft: refDraft);
    await pumpPhone(t, h, home: home());
    await shot(t, '$_editor/first');
    await pumpPhone(t, h, home: home(), height: 1190);
    await shot(t, '$_editor/full');
    await _sizes(t, h, _editor, home);
    await pumpPhone(t, h, home: const VitalsEditorScreen(patientId: 'p-ap'), height: 1190);
    await shot(t, '$_editor/empty');
    await t.tap(find.text('Review entry'));
    await settle(t);
    await shot(t, '$_editor/nothing_entered');
    await t.enterText(find.byKey(const ValueKey('v-bp_systolic')), '300');
    await t.enterText(find.byKey(const ValueKey('v-heart_rate')), '128');
    await t.enterText(find.byKey(const ValueKey('v-spo2')), '120');
    await t.enterText(find.byKey(const ValueKey('v-temp_c')), '36.95');
    await settle(t);
    await t.tap(find.text('Review entry'));
    await settle(t);
    await shot(t, '$_editor/errors');
    await t.tap(find.byKey(const ValueKey('v-oxygen')));
    await settle(t);
    await shot(t, '$_editor/oxygen_sheet');
    await t.tap(find.text('Done'));
    await settle(t);
    await t.tap(find.byKey(const ValueKey('v-time')));
    await settle(t);
    await shot(t, '$_editor/time_sheet');
    await t.tap(find.text('Use the time now'));
    await settle(t);
    await t.tap(find.bySemanticsLabel('Go back'));
    await settle(t);
    await shot(t, '$_editor/leave_question');
    await _end(t, h);
  });

  visual('vitals editor, keyboard open', (t) async {
    final h = await _nurse(t);
    await pumpPhone(t, h, home: const VitalsEditorScreen(patientId: 'p-ap', draft: refDraft));
    t.view.viewInsets = const FakeViewPadding(bottom: 300 * 2);
    await t.pump();
    await t.ensureVisible(find.byKey(const ValueKey('v-temp_c')));
    await t.tap(find.byKey(const ValueKey('v-temp_c')));
    await settle(t);
    final r = t.getRect(find.byKey(const ValueKey('v-temp_c')));
    expect(r.bottom, lessThan(844 - 300), reason: 'the field is above the keyboard');
    await shot(t, '$_editor/keyboard');
    t.view.viewInsets = FakeViewPadding.zero;
    await _end(t, h);
  });

  visual('vitals editor, draft offered and correction', (t) async {
    final h = await _nurse(t);
    saveDraft(h.app.ctx(), id: vitalsDraftId('s-sj', 'p-ap'), kind: 'vitals', patientId: 'p-ap', payload: vitalsDraftPayload(refDraft));
    await pumpPhone(t, h, home: const VitalsEditorScreen(patientId: 'p-ap'));
    await shot(t, '$_editor/draft_offer');
    await pumpPhone(t, h, home: VitalsEditorScreen(patientId: 'p-ap', draft: VitalsDraft(patientId: 'p-ap', key: 'k-c', careTime: refDraft.careTime, raw: refDraft.raw, o2Device: refDraft.o2Device, consciousness: refDraft.consciousness, supersedesId: 'de-011')));
    await shot(t, '$_editor/correction');
    await _end(t, h);
  });

  visual('vitals review', (t) async {
    final h = await _nurse(t);
    Widget home() => const VitalsReviewScreen(draft: refDraft);
    await pumpPhone(t, h, home: home());
    await shot(t, '$_review/first');
    await pumpPhone(t, h, home: home(), height: 1160);
    await shot(t, '$_review/full');
    await _sizes(t, h, _review, home);

    await pumpPhone(t, h, home: const VitalsReviewScreen(draft: oddDraft), height: 1260);
    await t.tap(find.byKey(const ValueKey('tick-heart_rate')));
    await settle(t);
    await shot(t, '$_review/warning_recheck');

    h.app.store.fault = (op) => throw const StorageError(kStorageFull);
    await pumpPhone(t, h, home: home(), height: 1160);
    await t.tap(find.text('Save on device'));
    await settle(t);
    await shot(t, '$_review/save_error');
    h.app.store.fault = null;
    await t.tap(find.text('Retry'));
    await settle(t);
    await shot(t, '$_review/save_success');
    await _end(t, h);
  });
}
