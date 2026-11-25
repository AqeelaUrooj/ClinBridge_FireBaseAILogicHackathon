import 'package:clinbridge_practice/core/clock.dart';
import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/audit.dart';
import 'package:clinbridge_practice/data/repos/entries.dart';
import 'package:clinbridge_practice/data/schema.dart';
import 'package:clinbridge_practice/ui/kit/kit.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/body_map_screen.dart';
import 'package:clinbridge_practice/ui/screens/companion_screens.dart';
import 'package:clinbridge_practice/ui/screens/handover_screens.dart';
import 'package:clinbridge_practice/ui/screens/med_screens.dart';
import 'package:clinbridge_practice/ui/screens/paper_screens.dart';
import 'package:clinbridge_practice/ui/screens/patient_screens.dart';
import 'package:clinbridge_practice/ui/screens/vitals_screens.dart';
import 'package:clinbridge_practice/ui/screens/ward_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/host.dart';
import '../support/shots.dart';

/// Real core, real SQLCipher, design fixture (fictional). Phone of 390 × 1300 dp so that a whole form is on screen.
Future<Harness> start(WidgetTester t, {String staff = 's-sj', String patient = 'p-ap', Widget? home}) async {
  final h = await real(t, () => designHarness());
  addTearDown(h.dispose);
  await real(t, () => h.signIn(staff));
  h.app.verifyPatient(patient, ['Name', 'MRN']);
  await pumpPhone(t, h, home: home ?? PatientSummaryScreen(patientId: patient), height: 1300);
  return h;
}

Future<void> end(WidgetTester t, Harness h) async {
  await t.pumpWidget(const SizedBox());
  h.app.lockVault();
}

Future<void> openEditor(WidgetTester t, {VitalsDraft? draft}) async {
  Go.vitals(ctxOf(t), 'p-ap', draft: draft);
  await settle(t);
  expect(find.byType(VitalsEditorScreen), findsOneWidget);
}

Finder vf(String k) => find.byKey(ValueKey('v-$k'));
Future<void> type(WidgetTester t, String k, String v) async {
  await t.ensureVisible(vf(k));
  await t.enterText(vf(k), v);
  await t.pump();
}

Future<void> tapText(WidgetTester t, String s) async {
  await t.ensureVisible(find.text(s).last);
  await t.pump();
  await t.tap(find.text(s).last);
  await settle(t);
}

List<EntryX> vitalsOf(Harness h, [String patient = 'p-ap']) => [for (final x in listPatientEntries(h.app.store, patient)) if (x.entry.type == 'vital_sign') x];
void chainOk(Harness h) => expect(verifyChain(h.app.store.all('audit_log')).ok, isTrue);

const good = VitalsDraft(patientId: 'p-ap', key: 'k-1', careTime: '2026-11-14T16:15:00-05:00', raw: {'heart_rate': '78', 'pain_0_10': '0'});

void main() {
  visual('editor to review to saved record', (t) async {
    final h = await start(t);
    final before = vitalsOf(h).length;
    await openEditor(t);
    await type(t, 'bp_systolic', '136');
    await type(t, 'bp_diastolic', '82');
    await type(t, 'heart_rate', '78');
    await type(t, 'temp_c', '36,9'); // comma of some keyboards
    await t.tap(find.byKey(const ValueKey('pain-0')));
    await t.tap(find.byKey(const ValueKey('avpu-1')));
    await tapText(t, 'Review entry');
    expect(find.byType(VitalsReviewScreen), findsOneWidget);
    expect(find.text('Not assessed'), findsWidgets);
    expect(vitalsOf(h).length, before, reason: 'nothing is saved before Save');
    expect(h.app.store.count('m_draft'), 1);

    await tapText(t, 'Save on device');
    expect(find.text('Saved on this phone'), findsOneWidget);
    final e = vitalsOf(h).first;
    expect(vitalsOf(h).length, before + 1);
    expect(find.textContaining(e.entry.id), findsOneWidget);
    expect(find.textContaining('Device counter ${e.entry.counter}'), findsOneWidget);
    expect(e.vital.sys, 136);
    expect(e.vital.tempC, 36.9);
    expect(e.vital.pain, 0, reason: 'a recorded zero stays a zero');
    expect(e.vital.consciousness, 'Responds to voice');
    expect(e.child!['spo2'], isNull, reason: 'blank is not assessed, never zero');
    expect(e.child!['resp_rate'], isNull);
    expect(e.entry.performerId, 's-sj');
    expect(e.entry.isConfirmed, isTrue);
    expect(h.app.store.count('m_draft'), 0, reason: 'the draft is gone with the save');
    chainOk(h);

    await tapText(t, 'Back to chart');
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    expect(find.byType(VitalsReviewScreen), findsNothing);
    expect(find.textContaining('136/82'), findsWidgets);
    await end(t, h);
  });

  visual('view record and system back after saving', (t) async {
    final h = await start(t);
    await openEditor(t);
    await type(t, 'heart_rate', '80');
    await tapText(t, 'Review entry');
    await tapText(t, 'Save on device');
    await tapText(t, 'View record');
    expect(find.byType(EntryDetailScreen), findsOneWidget);
    await t.binding.handlePopRoute();
    await settle(t);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    expect(vitalsOf(h).where((x) => x.vital.heartRate == 80).length, 1);
    await end(t, h);
  });

  visual('double tap on Save stores one record', (t) async {
    final h = await start(t, home: const VitalsReviewScreen(draft: good));
    final before = vitalsOf(h).length;
    await t.tap(find.text('Save on device'));
    await t.tap(find.text('Save on device'), warnIfMissed: false);
    await t.pump();
    await t.tap(find.byType(Btn).first, warnIfMissed: false);
    await settle(t);
    expect(vitalsOf(h).length, before + 1);
    chainOk(h);
    await end(t, h);
  });

  visual('storage failure keeps the values; retry saves exactly once', (t) async {
    final h = await start(t);
    await openEditor(t);
    await type(t, 'heart_rate', '77');
    await tapText(t, 'Review entry');
    final before = vitalsOf(h).length, rows = h.app.store.count('audit_log');
    h.app.store.fault = (op) => op == 'commit' ? throw const StorageError(kStorageFull) : null;
    await tapText(t, 'Save on device');
    expect(find.text('Not saved'), findsOneWidget);
    expect(find.text(kStorageFull), findsOneWidget);
    expect(find.text('Saved on this phone'), findsNothing);
    expect(find.text('77'), findsNothing, reason: 'shown as rich text with its unit');
    expect(find.textContaining('77'), findsWidgets);
    expect(vitalsOf(h).length, before);
    expect(h.app.store.count('audit_log'), rows);
    expect(h.app.store.count('m_draft'), 1);

    // Edit goes back with the values, and the same form is saved later.
    await tapText(t, 'Edit measurements');
    expect(find.byType(VitalsEditorScreen), findsOneWidget);
    expect(find.text('77'), findsOneWidget);
    await tapText(t, 'Review entry');
    await tapText(t, 'Save on device');
    expect(find.text('Not saved'), findsOneWidget);
    h.app.store.fault = null;
    await tapText(t, 'Retry');
    expect(find.text('Saved on this phone'), findsOneWidget);
    expect(vitalsOf(h).length, before + 1);
    expect(h.app.store.count('m_draft'), 0);
    chainOk(h);
    await end(t, h);
  });

  visual('another verified patient, or nobody signed in: save is refused', (t) async {
    final h = await start(t, home: const VitalsReviewScreen(draft: good));
    final before = h.app.store.count('entry');
    h.app.verifyPatient('p-ms', ['Name', 'MRN']);
    await settle(t);
    await tapText(t, 'Save on device');
    expect(find.text('Not saved'), findsOneWidget);
    expect(find.textContaining('not the verified patient any more'), findsOneWidget);
    expect(h.app.store.count('entry'), before);
    h.app.leavePatient();
    await settle(t);
    await tapText(t, 'Retry');
    expect(h.app.store.count('entry'), before);
    await end(t, h);
  });

  visual('route guard: leaving the patient closes the vitals pages', (t) async {
    final h = await start(t);
    await openEditor(t);
    await type(t, 'heart_rate', '70');
    final nav = t.element(find.byType(Navigator).first);
    h.app.leavePatient();
    await settle(t);
    expect(find.byType(VitalsEditorScreen), findsNothing);
    expect(() => Go.vitals(nav, 'p-ap'), throwsA(isA<NotAllowedError>()));
    await end(t, h);
  });

  visual('a draft is kept encrypted when leaving, offered again, continued', (t) async {
    final h = await start(t);
    await openEditor(t);
    await type(t, 'heart_rate', '81');
    await type(t, 'resp_rate', '17');
    await t.tap(find.byKey(const ValueKey('pain-3')));
    await t.binding.handlePopRoute();
    await settle(t);
    expect(find.text('Leave these vitals?'), findsOneWidget);
    await tapText(t, 'Keep editing');
    expect(find.byType(VitalsEditorScreen), findsOneWidget);
    await t.tap(find.bySemanticsLabel('Go back'));
    await settle(t);
    await tapText(t, 'Keep as a draft and leave');
    expect(find.byType(VitalsEditorScreen), findsNothing);
    final d = listDrafts(h.app.store, 's-sj', kind: 'vitals', patientId: 'p-ap').single;
    expect((d['payload']! as Map)['raw'], {'heart_rate': '81', 'resp_rate': '17', 'pain_0_10': '3'});
    expect(find.text('Queue (1)'), findsOneWidget, reason: 'the chart counts the draft');
    expect(listDrafts(h.app.store, 's-dc'), isEmpty, reason: 'only for its owner');

    await openEditor(t);
    expect(find.text('Unfinished vitals'), findsOneWidget);
    await tapText(t, 'Continue the draft');
    expect(find.text('81'), findsOneWidget);
    await tapText(t, 'Review entry');
    await tapText(t, 'Save on device');
    final e = vitalsOf(h).first;
    expect(e.vital.heartRate, 81);
    expect(e.vital.pain, 3);
    expect(h.app.store.get('m_entry_key', (d['payload']! as Map)['key'] as String), isNotNull, reason: 'same key as the draft');
    expect(h.app.store.count('m_draft'), 0);
    await end(t, h);
  });

  visual('an unfinished correction is offered from the queue route and never overwritten by new vitals', (t) async {
    final h = await start(t);
    const cor = VitalsDraft(patientId: 'p-ap', key: 'k-c', careTime: '2026-11-14T14:15:00-05:00', raw: {'heart_rate': '79'}, supersedesId: 'de-011', correctionReason: 'Typed wrong');
    saveDraft(h.app.ctx(), id: vitalsDraftId('s-sj', 'p-ap', 'de-011'), kind: 'vitals', patientId: 'p-ap', payload: vitalsDraftPayload(cor));
    await openEditor(t);
    expect(find.textContaining('a correction of a saved record'), findsOneWidget);
    await tapText(t, 'New vitals, keep the draft');
    await type(t, 'heart_rate', '70');
    await t.pump(const Duration(seconds: 1));
    expect(h.app.store.count('m_draft'), 2);
    await t.tap(find.bySemanticsLabel('Go back'));
    await settle(t);
    await tapText(t, 'Discard these values');
    expect(h.app.store.count('m_draft'), 1);
    await openEditor(t);
    await tapText(t, 'Continue the draft');
    expect(find.text('Correct Vitals'), findsOneWidget);
    await tapText(t, 'Review entry');
    await tapText(t, 'Save on device');
    expect(h.app.store.get('entry', 'de-011')!['status'], 'corrected');
    expect(h.app.store.count('m_draft'), 0);
    await end(t, h);
  });

  visual('typing is kept without leaving, and discard asks first', (t) async {
    final h = await start(t);
    await openEditor(t);
    await type(t, 'heart_rate', '90');
    await t.pump(const Duration(seconds: 1));
    expect(h.app.store.count('m_draft'), 1, reason: 'a lock or a dead battery does not lose it');
    await t.tap(find.bySemanticsLabel('Go back'));
    await settle(t);
    await tapText(t, 'Discard these values');
    expect(find.byType(VitalsEditorScreen), findsNothing);
    expect(h.app.store.count('m_draft'), 0);
    expect(h.app.store.all('audit_log').last['action'], 'draft_discarded');
    await openEditor(t);
    expect(find.text('Unfinished vitals'), findsNothing);
    await t.tap(find.bySemanticsLabel('Go back'));
    await settle(t);
    expect(find.byType(VitalsEditorScreen), findsNothing, reason: 'nothing typed, nothing asked');
    chainOk(h);
    await end(t, h);
  });

  visual('draft can not be kept: says why and stays', (t) async {
    final h = await start(t);
    await openEditor(t);
    h.app.store.fault = (op) => throw const StorageError(kStorageFull);
    await type(t, 'heart_rate', '90');
    await t.pump(const Duration(seconds: 1));
    expect(find.text(kStorageFull), findsOneWidget);
    await t.tap(find.bySemanticsLabel('Go back'));
    await settle(t);
    await tapText(t, 'Keep as a draft and leave');
    expect(find.byType(VitalsEditorScreen), findsOneWidget);
    expect(find.text('90'), findsOneWidget);
    h.app.store.fault = null;
    await end(t, h);
  });

  visual('future time is refused on the form and by the core', (t) async {
    final h = await start(t);
    await openEditor(t);
    await type(t, 'heart_rate', '77');
    await t.tap(find.byKey(const ValueKey('v-time')));
    await settle(t);
    await t.enterText(find.byKey(const ValueKey('time-h')), '16');
    await t.enterText(find.byKey(const ValueKey('time-m')), '45');
    await tapText(t, 'Set time');
    expect(find.text('Time cannot be in the future'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('time-h')), '25');
    await tapText(t, 'Set time');
    expect(find.textContaining('hours 00'), findsOneWidget);
    await t.enterText(find.byKey(const ValueKey('time-h')), '15');
    await tapText(t, 'Set time');
    expect(find.text('15:45'), findsWidgets);
    await tapText(t, 'Review entry');
    await tapText(t, 'Save on device');
    expect(vitalsOf(h).where((x) => x.entry.careTime == '2026-11-14T15:45:00-05:00').length, 1);

    await pumpPhone(t, h, home: const VitalsReviewScreen(draft: VitalsDraft(patientId: 'p-ap', key: 'k-f', careTime: '2026-11-14T18:00:00-05:00', raw: {'heart_rate': '70'})), height: 1300);
    final n = h.app.store.count('entry');
    await tapText(t, 'Save on device');
    expect(find.text('The time cannot be in the future.'), findsOneWidget);
    expect(h.app.store.count('entry'), n);
    await end(t, h);
  });

  visual('errors block the review; nothing entered is said', (t) async {
    final h = await start(t);
    await openEditor(t);
    await tapText(t, 'Review entry');
    expect(find.text('Enter at least one measurement'), findsOneWidget);
    await type(t, 'bp_systolic', '130');
    await type(t, 'spo2', '140');
    await tapText(t, 'Review entry');
    expect(find.byType(VitalsReviewScreen), findsNothing);
    expect(find.text('Enter both blood pressure numbers'), findsOneWidget);
    expect(find.text('Must be 0–100%'), findsOneWidget);
    await end(t, h);
  });

  visual('pain and consciousness clear with a second tap', (t) async {
    final h = await start(t);
    await openEditor(t);
    await type(t, 'heart_rate', '70');
    for (var i = 0; i < 2; i++) {
      await t.tap(find.byKey(const ValueKey('pain-5')));
      await t.tap(find.byKey(const ValueKey('avpu-0')));
      await t.pump();
    }
    await tapText(t, 'Review entry');
    await tapText(t, 'Save on device');
    expect(vitalsOf(h).first.child!['pain_0_10'], isNull);
    expect(vitalsOf(h).first.vital.consciousness, isNull);
    await end(t, h);
  });

  visual('oxygen device and flow', (t) async {
    final h = await start(t);
    await openEditor(t);
    await type(t, 'spo2', '97');
    await t.tap(find.byKey(const ValueKey('v-oxygen')));
    await settle(t);
    await tapText(t, 'Simple mask');
    await t.enterText(vf('o2_flow_lpm'), '6');
    await t.pump();
    await tapText(t, 'Done');
    expect(find.text('6 L/min Simple mask'), findsOneWidget);
    await tapText(t, 'Review entry');
    await tapText(t, 'Save on device');
    expect(vitalsOf(h).first.vital.o2Device, 'Simple mask');
    expect(vitalsOf(h).first.vital.o2Flow, 6);
    await end(t, h);
  });

  visual('every warning needs its own re-check tick', (t) async {
    final h = await start(t, home: const VitalsReviewScreen(draft: VitalsDraft(patientId: 'p-ap', key: 'k-w', careTime: '2026-11-14T16:15:00-05:00', raw: {'heart_rate': '128', 'spo2': '88'})));
    final n = h.app.store.count('entry');
    expect(find.text('Check value'), findsNWidgets(2));
    await tapText(t, 'Save on device');
    expect(h.app.store.count('entry'), n);
    await t.tap(find.byKey(const ValueKey('tick-heart_rate')));
    await settle(t);
    await tapText(t, 'Save on device');
    expect(h.app.store.count('entry'), n);
    await t.tap(find.byKey(const ValueKey('tick-spo2')));
    await settle(t);
    await tapText(t, 'Save on device');
    expect(h.app.store.count('entry'), n + 1);
    await end(t, h);
  });

  visual('correction needs a reason and keeps the old version', (t) async {
    final h = await start(t);
    final old = EntryX(Entry(h.app.store.get('entry', 'de-011')!), h.app.store.get('vital_sign', 'c-011'));
    final raw = {for (final k in ['bp_systolic', 'bp_diastolic', 'heart_rate', 'resp_rate', 'temp_c', 'spo2', 'o2_flow_lpm', 'pain_0_10']) if (old.child![k] != null) k: '${old.child![k]}'};
    await openEditor(t, draft: VitalsDraft(patientId: 'p-ap', key: 'k-cor', careTime: old.entry.careTime, raw: raw, o2Device: old.vital.o2Device, consciousness: old.vital.consciousness, supersedesId: 'de-011'));
    expect(find.text('Correct Vitals'), findsOneWidget);
    await type(t, 'heart_rate', '79');
    await tapText(t, 'Review entry');
    expect(find.byType(VitalsReviewScreen), findsNothing);
    expect(find.text('Say why you are fixing this'), findsOneWidget);
    await t.enterText(vf('reason'), 'Typed pulse wrong');
    await tapText(t, 'Review entry');
    await tapText(t, 'Save on device');
    expect(find.text('Saved on this phone'), findsOneWidget);
    expect(h.app.store.get('entry', 'de-011')!['status'], 'corrected');
    final chain = versionChain(h.app.store, 'de-011');
    expect(chain.length, 2);
    expect(chain.last.vital.heartRate, 79);
    expect(chain.last.entry.changeReason, 'Typed pulse wrong');
    expect(chain.first.vital.heartRate, 76);

    await pumpPhone(t, h, home: const HistoryScreen(patientId: 'p-ap'), height: 3200);
    final id = chain.last.entry.id;
    await t.tap(find.byKey(ValueKey('payload:$id')));
    await settle(t);
    expect(find.textContaining('76 now 79', findRichText: true), findsOneWidget);
    expect(find.textContaining('Typed pulse wrong', findRichText: true), findsOneWidget);
    expect(find.byKey(const ValueKey('payload:de-011')), findsNothing, reason: 'the old version is folded into the new one');
    chainOk(h);
    await end(t, h);
  });

  visual('history: order, outage line, baseline kept apart, filters', (t) async {
    final h = await start(t, home: const HistoryScreen(patientId: 'p-ap'));
    createEntry(h.app.ctx(), type: 'note', patientId: 'p-ap', careTime: '2026-11-14T14:12:00-05:00', values: {'category': 'other', 'text': 'Same time as the list', 'score_name': null, 'score_value': null}, clientKey: newId('k'));
    h.app.saved();
    final ev = buildLedger(h.app.store, 'p-ap');
    final times = [for (final e in ev) ms(e.time!)];
    expect(times, [...times]..sort((a, b) => b.compareTo(a)));
    final same = [for (final e in ev) if (e.time == '2026-11-14T14:12:00-05:00') e];
    expect(same.map((e) => e.isBaseline), [false, true], reason: 'records first, list results after them');
    expect(ev.where((e) => e.isBaseline).length, 2);
    final local = [for (final e in ev) if (!e.isBaseline) e.id];
    expect(local, [for (final x in listPatientEntries(h.app.store, 'p-ap')) x.entry.id], reason: 'the stable order of the core');

    await pumpPhone(t, h, home: const HistoryScreen(patientId: 'p-ap'), height: 3600);
    expect(find.textContaining('PRACTICE OUTAGE DECLARED'), findsOneWidget);
    expect(find.text('All Events (${ev.length})'), findsOneWidget);
    expect(find.text('PRE-OUTAGE LIST'), findsNWidgets(2));
    final heldY = t.getTopLeft(find.text('Ceftriaxone held')).dy, lineY = t.getTopLeft(find.textContaining('PRACTICE OUTAGE DECLARED')).dy, vitalsY = t.getTopLeft(find.text('Vital signs')).dy;
    expect(heldY < lineY && lineY < vitalsY, isTrue, reason: '15:10 > outage 14:48 > 14:15');

    await tapText(t, 'Pre-Outage List (2)');
    expect(find.text('Vital signs'), findsNothing);
    expect(find.text('Baseline Vitals'), findsOneWidget);
    expect(find.textContaining('PRACTICE OUTAGE DECLARED'), findsNothing);
    await tapText(t, 'Meds & Drips');
    expect(find.text('Heparin Sodium rate changed'), findsOneWidget);
    expect(find.text('Baseline Vitals'), findsNothing);
    await tapText(t, 'Vitals & Labs');
    expect(find.text('Baseline Lab Results'), findsOneWidget);
    expect(find.text('Heparin Sodium rate changed'), findsNothing);
    await tapText(t, 'Notes & SBAR');
    expect(find.text('Same time as the list', findRichText: true), findsOneWidget);
    await tapText(t, 'Performer');
    await tapText(t, 'Marcus Vance, LPN');
    expect(find.text('Same time as the list', findRichText: true), findsNothing);
    expect(find.textContaining('saline flush', findRichText: true), findsOneWidget);
    await end(t, h);
  });

  visual('history: entry opens its record; ledger is for admins', (t) async {
    final h = await start(t, home: const HistoryScreen(patientId: 'p-ap'));
    await t.tap(find.text('Ledger'), warnIfMissed: false);
    await settle(t);
    expect(find.textContaining('opens for admins'), findsOneWidget);
    await t.pump(const Duration(seconds: 5));
    await tapText(t, 'Ceftriaxone held');
    expect(find.byType(EntryDetailScreen), findsOneWidget);
    await end(t, h);
  });

  visual('add sheet: every entry opens its form; back returns to the same chart', (t) async {
    final h = await start(t);
    final targets = <String, Type>{
      'Record vitals': VitalsEditorScreen,
      'Medication event': MarScreen,
      'Fluid balance': FluidScreen,
      'Bedside note': NoteScreen,
      'Lab result': LabScreen,
      'Clinical handover': SbarScreen,
      'Paper photo': PaperCaptureScreen,
      'Body map': BodyMapScreen,
    };
    for (final e in targets.entries) {
      await tapText(t, 'Record Bedside Care');
      expect(find.byType(AddBedsideScreen), findsOneWidget);
      await tapText(t, e.key);
      expect(find.byType(e.value), findsOneWidget, reason: e.key);
      expect(find.byType(AddBedsideScreen), findsNothing);
      Navigator.of(ctxOf(t), rootNavigator: true).pop();
      await settle(t);
      expect(find.byType(PatientSummaryScreen), findsOneWidget);
    }
    for (final close in [() => tapText(t, 'Cancel and return to chart'), () => t.tap(find.bySemanticsLabel('Close')), () => t.binding.handlePopRoute(), () => t.tapAt(const Offset(195, 1280))]) {
      await t.tap(find.byKey(const ValueKey('nav-add')));
      await settle(t);
      expect(find.byType(AddBedsideScreen), findsOneWidget);
      await close();
      await settle(t);
      expect(find.byType(AddBedsideScreen), findsNothing);
      expect(find.byType(PatientSummaryScreen), findsOneWidget);
    }
    expect(h.app.verifiedPatientId, 'p-ap');
    await end(t, h);
  });

  visual('admin: entries are disabled with the reason', (t) async {
    final h = await start(t, staff: 's-ad', home: const AddBedsideScreen(patientId: 'p-ap'));
    await t.tap(find.text('Record vitals'), warnIfMissed: false);
    await settle(t);
    expect(find.text('Only nurses can record care'), findsOneWidget);
    expect(find.byType(VitalsEditorScreen), findsNothing);
    expect(() => Go.vitals(ctxOf(t), 'p-ap'), throwsA(isA<NotAllowedError>()));
    await t.pump(const Duration(seconds: 5));
    await end(t, h);
  });

  visual('summary navigation and leaving the patient', (t) async {
    final h = await start(t);
    await t.tap(find.bySemanticsLabel('History'));
    await settle(t);
    expect(find.byType(HistoryScreen), findsOneWidget);
    await t.tap(find.bySemanticsLabel('Summary'));
    await settle(t);
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    await t.tap(find.bySemanticsLabel(RegExp('^Queue')));
    await settle(t);
    expect(find.byType(QueueScreen), findsOneWidget);
    Navigator.of(ctxOf(t), rootNavigator: true).pop();
    await settle(t);
    await t.tap(find.bySemanticsLabel('Open the medication record (MAR)'));
    await settle(t);
    expect(find.byType(MarScreen), findsOneWidget);
    Navigator.of(ctxOf(t), rootNavigator: true).pop();
    await settle(t);
    await t.tap(find.bySemanticsLabel('Verified patient: details and leave'));
    await settle(t);
    expect(find.text('9402-1842'), findsOneWidget);
    await tapText(t, 'Leave this patient');
    expect(h.app.verifiedPatientId, isNull);
    expect(find.byType(WardScreen), findsOneWidget);
    expect(find.byType(PatientSummaryScreen), findsNothing);
    await end(t, h);
  });

  visual('summary of a seed patient without vital signs', (t) async {
    final h = await real(t, () => Harness.make().ready());
    addTearDown(h.dispose);
    await real(t, () => h.signIn('pr-alvarez'));
    h.app.verifyPatient('pt-07', ['Name', 'MRN']);
    await pumpPhone(t, h, home: const PatientSummaryScreen(patientId: 'pt-07'), height: 2200);
    expect(find.text('No vital signs recorded'), findsOneWidget);
    expect(find.text('Not assessed'), findsNWidgets(4));
    expect(find.text('No photo on this phone'), findsOneWidget);
    expect(find.text('0'), findsNothing);
    await pumpPhone(t, h, home: const HistoryScreen(patientId: 'pt-07'), height: 2600);
    expect(find.text('DRAFT · NOT CONFIRMED'), findsOneWidget);
    // A record that was marked as a mistake is crossed out, not hidden.
    h.app.verifyPatient('pt-10', ['Name', 'MRN']);
    await pumpPhone(t, h, home: const HistoryScreen(patientId: 'pt-10'), height: 2600);
    expect(find.text('ENTERED IN ERROR'), findsOneWidget);
    await end(t, h);
  });
}
