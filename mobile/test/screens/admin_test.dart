import 'dart:convert';

import 'package:clinbridge_practice/config/policy.dart';
import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/repos/entries.dart' as entries;
import 'package:clinbridge_practice/data/repos/ops.dart' as ops;
import 'package:clinbridge_practice/data/schema.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/admin_screens.dart';
import 'package:clinbridge_practice/ui/screens/handover_screens.dart';
import 'package:clinbridge_practice/ui/screens/recovery_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/host.dart';
import '../support/shots.dart';
import '../visual/admin_shots_test.dart' hide main;

const four = ['p-ap', 'p-ms', 'p-jw', 'p-rt'];

Matcher refused = throwsA(isA<NotAllowedError>());

/// Handover page with the SBAR editor of p-ap on top, as the nurse opens it.
Future<void> openSbar(WidgetTester t, Harness h) async {
  await pumpPhone(t, h, home: const HandoverScreen());
  Go.sbar(ctxOf(t), 'p-ap');
  await settle(t);
  expect(find.byType(SbarScreen), findsOneWidget);
}

Future<void> typeNote(WidgetTester t) async {
  await t.enterText(find.byType(TextField).at(0), 'Situation text');
  await t.enterText(find.byType(TextField).at(1), 'Background text');
  await t.enterText(find.byType(TextField).at(2), 'Assessment text');
  await settle(t); // the field scrolls its cursor into view first
}

Future<Harness> admin(WidgetTester t) => nurse(t, patient: '', id: 's-ad');

int audits(Harness h, String action) => h.app.store.where('audit_log', 'action', action).length;

void main() {
  visual('access: roles are refused on the screens and in the core', (t) async {
    final h = await nurse(t, id: 's-mv'); // LPN
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const HandoverScreen());
    expect(find.text('Shift Handover Roster'), findsOneWidget);
    final c = ctxOf(t);
    expect(() => Go.audit(c), refused);
    expect(() => Go.recovery(c), refused);
    final ev = h.app.downtime!.id;
    expect(() => ops.startPracticeOutage(h.app.ctx()), refused);
    expect(() => ops.clearNetwork(h.app.ctx(), kNetworkChecklist, pinOk: true), refused);
    expect(() => ops.endDowntime(h.app.ctx()), refused);
    expect(() => ops.setChecklistItem(h.app.ctx(), eventId: ev, itemId: 'vitals', done: true), refused);
    Go.readiness(c);
    await settle(t);
    expect(find.text('ClinBridge Admin'), findsNothing);
    await pumpPhone(t, h, home: const ReadinessScreen());
    expect(find.text('ClinBridge Admin'), findsNothing);

    // The checklist is read only for a nurse.
    await pumpPhone(t, h, home: const ChecklistScreen(), height: 3000);
    expect(find.text('Only an admin can change the checklist'), findsOneWidget);
    await t.tap(find.text('Vital Signs Recorded for All Patients'));
    await settle(t);
    expect(h.app.store.count('m_checklist'), 0);

    // An admin writes no SBAR note.
    await real(t, () => h.signIn('s-ad'));
    h.app.verifyPatient('p-ap', ['Name', 'MRN']);
    await pumpPhone(t, h, home: const ReadinessScreen());
    expect(find.text('ClinBridge Admin'), findsOneWidget);
    expect(() => Go.sbar(ctxOf(t), 'p-ap'), refused);
    await tapLabel(t, 'Audit');
    expect(find.byType(AuditScreen), findsOneWidget);
    await t.binding.handlePopRoute();
    await settle(t);
    expect(find.byType(ReadinessScreen), findsOneWidget);
    expect(() => Go.handover(ctxOf(t)), refused);
    expect(() => note(h, 'p-ap'), refused);
    expect(h.app.store.count('handoff'), 0);
    h.app.lockVault();
  });

  visual('SBAR is saved once, with linked records, done mark and a removed draft', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    await openSbar(t, h);
    await typeNote(t);
    await tapLabel(t, 'Transfer Pending: your own choice, written into the Situation text');
    await t.ensureVisible(find.text('Link records'));
    await tapText(t, 'Link records');
    expect(find.textContaining('BP 118/72'), findsNothing, reason: 'records of another patient are not offered');
    await tapLabel(t, '14:15 BP 138/84 · Pulse 76 · SpO2 96% · Temp 37.1');
    await tapText(t, 'Use 1 linked');
    await tapText(t, 'Add open item');
    await t.enterText(find.byType(TextField).at(3), 'Sample sent\nleft arm');
    await tapLabel(t, 'Open item 1: mark as done by you');
    await tapText(t, 'Save & Commit SBAR Note');
    expect(find.text('Tick "I have reviewed this note" first.'), findsWidgets);
    expect(h.app.store.count('handoff'), 0);

    await tapLabel(t, 'I have reviewed this note');
    final save = find.text('Save & Commit SBAR Note');
    await t.tap(save);
    await t.tap(save);
    await settle(t);
    final rows = h.app.store.all('handoff').map(Handoff.new).toList();
    expect(rows.length, 1);
    expect(audits(h, 'handoff_saved'), 1);
    expect(rows.single.situation, 'Situation text Transfer pending.');
    expect(rows.single.openItems, ['Done by outgoing nurse: Sample sent · left arm']);
    expect(rows.single.sourceEntryIds, ['de-011']);
    expect(rows.single.createdBy, 's-sj');
    expect(rows.single.shift, 'Day to night, 14 Nov 19:00');
    expect(entries.listDrafts(h.app.store, 's-sj', kind: 'sbar'), isEmpty);
    expect(find.byType(SbarScreen), findsNothing);
    expect(find.text('SBAR note saved on this phone'), findsOneWidget);
    h.app.lockVault();
  });

  visual('SBAR: a storage failure keeps the form; the retry saves one note', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    await openSbar(t, h);
    await typeNote(t);
    await tapLabel(t, 'I have reviewed this note');
    h.app.store.fault = (op) {
      if (op == 'commit') throw const StorageError(kStorageFull);
    };
    await tapText(t, 'Save & Commit SBAR Note');
    expect(find.text(kStorageFull), findsWidgets);
    expect(h.app.store.count('handoff'), 0);
    expect(find.text('Situation text'), findsOneWidget);
    h.app.store.fault = null;
    await tapText(t, 'Save & Commit SBAR Note');
    await settle(t);
    expect(h.app.store.count('handoff'), 1);
    h.app.lockVault();
  });

  visual('SBAR draft: kept encrypted for its owner, restored, prompt before discarding', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    await openSbar(t, h);
    await typeNote(t);
    await t.pump(const Duration(seconds: 1));
    final d = entries.getDraft(h.app.store, 'sbar/s-sj/p-ap', 's-sj')!;
    expect((d['payload'] as Map)['background'], 'Background text');
    expect(entries.getDraft(h.app.store, 'sbar/s-sj/p-ap', 's-dc'), isNull);

    await t.binding.handlePopRoute();
    await settle(t);
    expect(find.text('This note is not finished'), findsOneWidget);
    await tapText(t, 'Keep draft');
    expect(find.byType(SbarScreen), findsNothing);
    expect(find.text('Continue SBAR Draft'), findsOneWidget);

    Go.sbar(ctxOf(t), 'p-ap');
    await settle(t);
    expect(find.text('Assessment text'), findsOneWidget);
    expect(find.textContaining('was restored'), findsOneWidget);
    await t.enterText(find.byType(TextField).at(0), 'Changed');
    await t.pump();
    await t.binding.handlePopRoute();
    await settle(t);
    await tapText(t, 'Keep writing');
    expect(find.byType(SbarScreen), findsOneWidget);
    await t.binding.handlePopRoute();
    await settle(t);
    await tapText(t, 'Discard draft');
    await settle(t);
    expect(find.byType(SbarScreen), findsNothing);
    expect(entries.listDrafts(h.app.store, 's-sj'), isEmpty);
    expect(audits(h, 'draft_discarded'), 1);
    expect(h.app.store.count('handoff'), 0);
    h.app.lockVault();
  });

  visual('SBAR: copy from the last note needs confirmation and starts nothing by itself', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    ops.createHandoff(h.app.ctx(), patientId: 'p-ap', shift: 'Night to day', situation: 'Old S', background: 'Old B', assessment: 'Old A', openItems: ['Done by outgoing nurse: x', 'Still open'], sourceEntryIds: const [], clientKey: 'k-old');
    await openSbar(t, h);
    expect(find.text('EMPTY'), findsOneWidget);
    await t.enterText(find.byType(TextField).at(0), 'Mine');
    await tapText(t, 'Copy from last note');
    await tapText(t, 'Cancel');
    expect(find.text('Mine'), findsOneWidget);
    await tapText(t, 'Copy from last note');
    await tapText(t, 'Replace');
    expect(find.text('Old S'), findsWidgets);
    expect(find.text('Still open'), findsOneWidget);
    expect(find.textContaining('Done by outgoing nurse: x'), findsNothing);
    await t.pump(const Duration(seconds: 1));
    h.app.lockVault();
  });

  visual('only confirmed records of the same patient can be linked', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    final draft = entries.createEntry(h.app.ctx(), type: 'vital_sign', patientId: 'p-ap', careTime: h.app.nowIso, values: {'heart_rate': 80}, clientKey: 'd', status: 'draft');
    void link(String id) => ops.createHandoff(h.app.ctx(), patientId: 'p-ap', shift: 's', situation: 's', background: 'b', assessment: 'a', openItems: const [], sourceEntryIds: [id], clientKey: newId('k'));
    expect(() => link('de-013'), throwsA(isA<AppError>()));
    expect(() => link(draft.id), throwsA(isA<AppError>()));
    expect(h.app.store.count('handoff'), 0);
    await openSbar(t, h);
    await t.ensureVisible(find.text('Link records'));
    await tapText(t, 'Link records');
    expect(find.text('Pulse 80'), findsNothing);
    expect(find.textContaining('Pulse 76'), findsOneWidget);
    h.app.lockVault();
  });

  visual('a saved note opens read only with its records', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    final n = ops.createHandoff(h.app.ctx(), patientId: 'p-ap', shift: 'Day to night', situation: 'S text', background: 'B text', assessment: 'A text', openItems: ['One'], sourceEntryIds: ['de-011'], clientKey: 'k');
    await pumpPhone(t, h, home: SbarViewScreen(handoffId: n.id), height: 1600);
    expect(find.text('S text'), findsOneWidget);
    expect(find.text('Written by Sarah Jenkins, RN'), findsOneWidget);
    expect(find.textContaining('append-only'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    expect(find.textContaining('BP 138/84'), findsOneWidget);
    h.app.lockVault();
  });

  visual('handover: counts and filters come from the records', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    note(h, 'p-ms');
    await pumpPhone(t, h, home: const HandoverScreen(), height: 3000);
    expect(find.text('1 of 4 Patients Documented'), findsOneWidget);
    expect(find.text('3 Pending SBAR Notes'), findsOneWidget);
    expect(find.text('View SBAR'), findsOneWidget);
    await tapLabel(t, 'Pending Handover, 3');
    expect(find.textContaining('Maria Santos'), findsNothing);
    await tapLabel(t, 'High-alert drug or severe allergy, 2');
    expect(find.textContaining('Arthur Pendelton, '), findsOneWidget);
    expect(find.textContaining('James K. Wilson, '), findsOneWidget);
    expect(find.textContaining('Robert Taylor, '), findsNothing);
    expect(find.textContaining('1,000 units/h'), findsOneWidget);
    h.app.lockVault();
  });

  visual('sign-off is blocked while a note is missing; there is no bypass', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    note(h, 'p-ms');
    await pumpPhone(t, h, home: const HandoverScreen());
    await tapText(t, 'Choose nurse');
    expect(find.text('Marcus Vance, LPN'), findsNothing);
    expect(find.text('Kim Ellis'), findsNothing);
    expect(find.text('Elena Rostova, RN'), findsOneWidget);
    await tapText(t, 'David Chen, RN');
    await tapText(t, 'Complete Shift Handover Sign-Off');
    expect(find.textContaining('Sign-off is blocked'), findsOneWidget);
    expect(find.text('Authorize'), findsNothing);
    await tapText(t, 'Go to pending note');
    expect(find.text('Shift Co-Signature'), findsNothing);
    expect(() => ops.recordShiftSignoff(h.app.ctx(), roster: four, incomingId: 's-dc'), throwsA(isA<AppError>()));
    expect(h.app.store.count('m_shift_signoff'), 0);
    h.app.lockVault();
  });

  visual('sign-off needs two different people with their own PINs', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    for (final p in four) {
      note(h, p);
    }
    final same = await real(t, () => h.app.shiftSignoff(h.app.ctx(), roster: four, ownPin: '2468', incomingId: 's-sj', incomingPin: '2468'));
    expect(same.ok, isFalse);
    expect(same.error, contains('different person'));
    Object? lpn;
    try {
      await real(t, () async {
        try {
          await h.app.shiftSignoff(h.app.ctx(), roster: four, ownPin: '2468', incomingId: 's-mv', incomingPin: '2468');
        } catch (e) {
          lpn = e;
        }
      });
    } catch (_) {}
    expect(lpn, isA<AppError>());
    expect(h.app.store.count('m_shift_signoff'), 0);

    await pumpPhone(t, h, home: const HandoverScreen());
    await tapText(t, 'Choose nurse');
    await tapText(t, 'David Chen, RN');
    await tapText(t, 'Complete Shift Handover Sign-Off');
    await t.enterText(find.byType(TextField).at(0), '2468');
    await t.enterText(find.byType(TextField).at(1), '1111');
    await settle(t);
    await tapText(t, 'Authorize');
    await wait(t);
    expect(find.textContaining('Incoming nurse: Wrong PIN'), findsOneWidget);
    expect(h.app.store.count('m_shift_signoff'), 0);
    expect(audits(h, 'staff_pin_wrong'), 1);
    await t.enterText(find.byType(TextField).at(1), '2468');
    await settle(t);
    await tapText(t, 'Authorize');
    await wait(t);
    final row = h.app.store.all('m_shift_signoff').single;
    expect(row['outgoing_id'], 's-sj');
    expect(row['incoming_id'], 's-dc');
    expect((row['handoff_ids'] as List).length, 4);
    expect(find.textContaining('Handover Signed Off'), findsOneWidget);
    expect(find.text('Complete Shift Handover Sign-Off'), findsNothing);
    h.app.lockVault();
  });

  visual('no assigned patients: the whole ward list is used and says so (practice seed)', (t) async {
    final h = await real(t, () => Harness.make().ready());
    addTearDown(h.dispose);
    await real(t, () => h.signIn('pr-park'));
    await pumpPhone(t, h, home: const HandoverScreen());
    expect(find.text('No patients are assigned to you. The whole ward list is shown.'), findsOneWidget);
    expect(find.text('10 Patients'), findsOneWidget);
    await pumpPhone(t, h, home: const HandoverScreen(), width: 360, textScale: 1.5, height: 780);
    h.app.verifyPatient('pt-05', ['Name', 'MRN']);
    await pumpPhone(t, h, home: const SbarScreen(patientId: 'pt-05'), width: 360, textScale: 1.5, height: 780);
    await real(t, () => h.signIn('pr-ellis'));
    await pumpPhone(t, h, home: const ReadinessScreen(), width: 360, textScale: 1.5, height: 780);
    await pumpPhone(t, h, home: const ChecklistScreen(), width: 360, textScale: 1.5, height: 780);
    h.app.lockVault();
  });

  visual('keyboard open: the form still scrolls and the buttons stay reachable', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const SbarScreen(patientId: 'p-ap'), width: 360, height: 780);
    t.view.viewInsets = const FakeViewPadding(bottom: 620);
    await settle(t);
    await t.enterText(find.byType(TextField).at(2), 'Assessment');
    await settle(t);
    expect(t.takeException(), isNull);
    expect(find.text('Save & Commit SBAR Note'), findsOneWidget);
    await t.pump(const Duration(seconds: 1));
    h.app.lockVault();
  });

  visual('Back online needs every tick and the admin PIN; a phone network changes nothing', (t) async {
    final h = await admin(t);
    addTearDown(h.dispose);
    h.bridge.network = true;
    await pumpPhone(t, h, home: const ReadinessScreen(), height: 2000);
    expect(find.textContaining('Phone network: connected'), findsOneWidget);
    expect(h.app.phase, ops.Phase.down);
    await tapText(t, 'Declare Network Restoration');
    await settle(t);
    expect(find.byType(ChecklistScreen), findsOneWidget);
    expect(h.app.phase, ops.Phase.down);

    await tapText(t, 'Switch to Back online (Practice)');
    expect(find.text('Tick every clearance item first (3 left).'), findsOneWidget);
    expect(() => ops.clearNetwork(h.app.ctx(), kNetworkChecklist.take(2).toList(), pinOk: true), throwsA(isA<AppError>()));
    expect(() => ops.clearNetwork(h.app.ctx(), kNetworkChecklist, pinOk: false), throwsA(isA<AppError>()));
    for (final s in ['Network Safe to Use Again', 'Back-Entry May Start', 'Downtime Lead Sign-Off']) {
      await tapText(t, s);
    }
    final ticks = ops.checklistState(h.app.store, h.app.downtime!.id);
    expect(ticks.length, 3);
    expect(ticks['net-0']!['by'], 's-ad');
    expect(audits(h, 'checklist_changed'), 3);
    // The worklist step can not be ticked before Back online.
    await tapText(t, 'Recovery Worklist Reviewed');
    expect(ops.checklistState(h.app.store, h.app.downtime!.id).length, 3);

    await tapText(t, 'Switch to Back online (Practice)');
    for (final k in ['1', '1', '1', '1']) {
      await tapLabel(t, k);
    }
    await wait(t);
    expect(find.textContaining('Wrong PIN'), findsOneWidget);
    expect(h.app.phase, ops.Phase.down);
    for (final k in ['2', '4', '6', '8']) {
      await tapLabel(t, k);
    }
    await wait(t);
    expect(h.app.phase, ops.Phase.online);
    expect(h.app.downtime!.clearedBy, 's-ad');
    expect(find.textContaining('nothing was sent'), findsWidgets);
    expect(h.bridge.saved, isEmpty);
    h.app.lockVault();
  });

  visual('ending the downtime is blocked by unsigned worklist items', (t) async {
    final h = await admin(t);
    addTearDown(h.dispose);
    ops.clearNetwork(h.app.ctx(), kNetworkChecklist, pinOk: true);
    final n = ops.buildWorklist(h.app.ctx());
    expect(n, greaterThan(0));
    h.app.saved();
    await pumpPhone(t, h, home: const ChecklistScreen());
    await tapText(t, 'End this downtime');
    await tapText(t, 'End downtime');
    expect(find.text('$n worklist items are not signed off yet.'), findsWidgets);
    expect(h.app.phase, ops.Phase.online);
    for (final w in h.app.store.all('worklist_item')) {
      ops.signOffItem(h.app.ctx(), w['id'] as String, reason: 'Checked with the paper');
    }
    h.app.saved();
    await settle(t);
    await tapText(t, 'End this downtime');
    await tapText(t, 'End downtime');
    expect(h.app.phase, ops.Phase.ready);
    expect(audits(h, 'downtime_ended'), 1);

    // Ready: a new practice outage can be started here, after a question.
    await tapText(t, 'Start a practice outage');
    await tapText(t, 'Cancel');
    expect(h.app.phase, ops.Phase.ready);
    await tapText(t, 'Start a practice outage');
    await tapText(t, 'Start practice outage');
    expect(h.app.phase, ops.Phase.down);
    expect(ops.checklistState(h.app.store, h.app.downtime!.id), isEmpty);
    h.app.lockVault();
  });

  visual('ticks can be removed, with person and time', (t) async {
    final h = await admin(t);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const ChecklistScreen(), height: 3000);
    await tapText(t, 'Patient List Age Checked');
    expect(find.text('Ticked by K. Ellis'), findsOneWidget);
    expect(find.text('1/10 Completed'), findsOneWidget);
    await tapText(t, 'Patient List Age Checked');
    expect(find.textContaining('Tick removed by K. Ellis'), findsOneWidget);
    expect(find.text('0/10 Completed'), findsOneWidget);
    expect(audits(h, 'checklist_changed'), 2);
    h.app.lockVault();
  });

  visual('integrity check shows what was really found', (t) async {
    final h = await admin(t);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const ReadinessScreen(), height: 2000);
    final total = h.app.store.count('audit_log');
    await tapText(t, 'Force Integrity Check');
    await settle(t);
    expect(find.textContaining('Change log: $total of $total rows in order'), findsWidgets);
    expect(find.textContaining('encrypted pages: all authentic'), findsWidgets);
    final s = h.app.store;
    s.tx(() => s.insert('audit_log', {...s.lastAudit()!, 'id': 'au-bad', 'seq': total + 1, 'prev_row_hash': 'bad'}));
    h.app.saved();
    await settle(t);
    await tapText(t, '$total rows verified 16:30. Check again');
    await settle(t);
    expect(find.textContaining('order broken at row ${total + 1}'), findsWidgets);
    expect(find.textContaining('Problem found'), findsWidgets);
    h.app.lockVault();
  });

  visual('readiness: draft card, real counts, high-alert check', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    entries.createEntry(h.app.ctx(), type: 'vital_sign', patientId: 'p-ap', careTime: h.app.nowIso, values: {'heart_rate': 80}, clientKey: 'd1', status: 'draft', rawInputKind: 'photo');
    await real(t, () => h.signIn('s-ad'));
    await pumpPhone(t, h, home: const ReadinessScreen(), height: 2000);
    expect(find.text('18 RECORDS'), findsWidgets);
    expect(find.text('1 Paper or Draft Record Awaiting a Nurse Check'), findsOneWidget);
    expect(find.text('1 of 1 high-alert records on this phone have a second-nurse check'), findsOneWidget);
    expect(find.text('5 Active'), findsOneWidget);
    expect(find.textContaining('503'), findsNothing);
    await t.tap(find.text('Dismiss Alert'), warnIfMissed: false);
    await settle(t);
    expect(find.text('1 Paper or Draft Record Awaiting a Nurse Check'), findsOneWidget);
    h.app.lockVault();
  });

  visual('checklist file: saved, cancelled, failed', (t) async {
    final h = await admin(t);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const ChecklistScreen());
    h.bridge.saveCancelled = true;
    await tapText(t, 'Save Protocol Audit Log (CSV)');
    expect(find.text('Saving was cancelled. No file was saved.'), findsOneWidget);
    await t.pump(const Duration(seconds: 5)); // the message covers the button for 4 s
    await settle(t);
    h.bridge
      ..saveCancelled = false
      ..saveError = const AppError('The folder is full.');
    await tapText(t, 'Save Protocol Audit Log (CSV)');
    expect(find.text('The file was not saved: The folder is full.'), findsOneWidget);
    expect(audits(h, 'file_saved'), 0);
    await t.pump(const Duration(seconds: 9));
    await settle(t);
    h.bridge.saveError = null;
    await tapText(t, 'Save Protocol Audit Log (CSV)');
    expect(find.text('File saved: clinbridge-practice-checklist.csv'), findsOneWidget);
    expect(audits(h, 'file_saved'), 1);
    final (name, mime, bytes) = h.bridge.saved.single;
    expect((name, mime), ('clinbridge-practice-checklist.csv', 'text/csv'));
    final csv = utf8.decode(bytes);
    expect(csv, contains('"Downtime Lead Sign-Off"'));
    expect(csv, contains('PRACTICE'));
    h.app.lockVault();
  });

  visual('preview works without the records and changes nothing', (t) async {
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    h.app.lockVault();
    await pumpPhone(t, h, home: const ChecklistScreen(preview: true), height: 2600);
    expect(find.text('Sign in as admin to change'), findsOneWidget);
    expect(find.text('Vital Signs Recorded for All Patients'), findsOneWidget);
    for (final x in kNetworkChecklist) {
      expect(find.text('$x.'), findsOneWidget);
    }
    await t.tap(find.text('Vital Signs Recorded for All Patients'));
    await settle(t);
    expect(find.textContaining('Ticked by'), findsNothing);
  });

  visual('touch targets are at least 48 dp', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    final handle = t.ensureSemantics();
    await pumpPhone(t, h, home: const HandoverScreen(), width: 360, height: 2600);
    await expectLater(t, meetsGuideline(androidTapTargetGuideline));
    await pumpPhone(t, h, home: const SbarScreen(patientId: 'p-ap'), width: 360, height: 2600);
    await expectLater(t, meetsGuideline(androidTapTargetGuideline));
    await real(t, () => h.signIn('s-ad'));
    await pumpPhone(t, h, home: const ReadinessScreen(), width: 360, height: 2600);
    await expectLater(t, meetsGuideline(androidTapTargetGuideline));
    await pumpPhone(t, h, home: const ChecklistScreen(), width: 360, height: 2600);
    await expectLater(t, meetsGuideline(androidTapTargetGuideline));
    handle.dispose();
    h.app.lockVault();
  });
}
