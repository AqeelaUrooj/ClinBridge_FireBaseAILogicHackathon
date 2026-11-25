import 'package:clinbridge_practice/config/policy.dart';
import 'package:clinbridge_practice/data/repos/entries.dart' as entries;
import 'package:clinbridge_practice/data/repos/ops.dart' as ops;
import 'package:clinbridge_practice/ui/kit/kit.dart';
import 'package:clinbridge_practice/ui/screens/admin_screens.dart';
import 'package:clinbridge_practice/ui/screens/handover_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/host.dart';
import '../support/shots.dart';

const sbarRef = 'clinbridge_bedside_sbar_note_editor', handRef = 'clinbridge_ward_handover_shift_transition', readyRef = 'clinbridge_admin_readiness_dashboard', checkRef = 'clinbridge_downtime_protocol_checklist';

// Fictional text of the reference picture, as if the nurse typed it.
const sText = '68yo male admitted 2 days ago for acute exacerbation of COPD with co-morbid hypertension. Currently completing shift day-transition to incoming RN David Chen.';
const bText = 'History of severe penicillin anaphylaxis. Started on continuous IV Heparin titration for bilateral subsegmental pulmonary embolism. Baseline SpO2 92-94% on 2L O2 via nasal cannula.';
const aText = 'Lungs with bilateral expiratory wheezes diminished at bases, improved post-albuterol. Heparin running at 1,100 units/hr (22 mL/hr) following dual-nurse rate co-sign with D. Chen RN at 16:20.';
const items = [
  ('Check repeat aPTT draw scheduled at 18:00 (draw from left arm, avoid Heparin PIV site)', true),
  ('Next Metoprolol 25mg PO scheduled at 20:00\nHold if SBP < 100 or HR < 55', false),
  ('Monitor O2 saturation; titrate nasal cannula to maintain SpO2 > 92%\nNotify MD if > 3L NC required', false),
  ('Second nurse bedside witness required for next Heparin rate titration\nProtocol #HEP-4B Active', false),
];

Future<Harness> nurse(WidgetTester t, {String patient = 'p-ap', String id = 's-sj'}) async {
  final h = await real(t, () => designHarness());
  await real(t, () => h.signIn(id));
  if (patient.isNotEmpty) h.app.verifyPatient(patient, ['Name', 'MRN']);
  return h;
}

void note(Harness h, String pid) {
  ops.createHandoff(h.verified(pid), patientId: pid, shift: 'Day to night, 14 Nov 19:00', situation: 'Written by the nurse for the practice drill.', background: 'Background as written.', assessment: 'Assessment as written.', openItems: ['Check the 18:00 sample'], sourceEntryIds: const [], clientKey: 'k-$pid');
  h.app.saved();
}

/// The nurse's unfinished note with the reference text.
void fillDraft(Harness h) => entries.saveDraft(h.verified('p-ap'), id: 'sbar/s-sj/p-ap', kind: 'sbar', patientId: 'p-ap', payload: {
      'key': 'k-ref', 'shift': 'Day to night, 14 Nov 19:00', 'situation': '$sText Condition stable.', 'background': bText, 'assessment': aText,
      'items': [for (final (x, d) in items) {'text': x, 'done': d}],
      'linked': ['de-011', 'de-001', 'de-007'],
    });

Future<void> tapText(WidgetTester t, String text) async {
  final f = find.text(text);
  await t.ensureVisible(f.first);
  await t.pump();
  await t.pump(const Duration(milliseconds: 300));
  await t.tap(f.first, warnIfMissed: false);
  await settle(t);
}

Future<void> tapLabel(WidgetTester t, String label) async {
  final f = find.byWidgetPredicate((w) => w is Tap && w.label == label);
  await t.ensureVisible(f.first);
  await t.pump();
  await t.pump(const Duration(milliseconds: 300));
  await t.tap(f.first);
  await settle(t);
}

Future<void> wait(WidgetTester t) async {
  await real(t, () async => Future<void>.delayed(const Duration(milliseconds: 60)));
  await settle(t);
}

Future<void> sizes(WidgetTester t, Harness h, String folder, Widget home) async {
  await pumpPhone(t, h, home: home, width: 360, height: 780);
  await shot(t, '$folder/w360');
  await pumpPhone(t, h, home: home, width: 430, height: 932);
  await shot(t, '$folder/w430');
  await pumpPhone(t, h, home: home, height: 2600, textScale: 1.5);
  await shot(t, '$folder/text150');
  await pumpPhone(t, h, home: home, width: 360, height: 780, textScale: 1.5);
}

void main() {
  visual('sbar', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const SbarScreen(patientId: 'p-ap'));
    await shot(t, '$sbarRef/sbar_empty');
    fillDraft(h);
    await pumpPhone(t, h, home: const SbarScreen(patientId: 'p-ap'));
    await shot(t, '$sbarRef/sbar_draft_restored');
    await sizes(t, h, sbarRef, const SbarScreen(patientId: 'p-ap'));
    entries.discardDraft(h.app.ctx(), 'sbar/s-sj/p-ap');

    // The reference text, typed by the nurse.
    await pumpPhone(t, h, home: const SbarScreen(patientId: 'p-ap'), height: 1600 * 390 / 328);
    await t.enterText(find.byType(TextField).at(0), sText);
    await t.enterText(find.byType(TextField).at(1), bText);
    await t.enterText(find.byType(TextField).at(2), aText);
    await settle(t);
    await tapLabel(t, 'Condition Stable: your own choice, written into the Situation text');
    await tapText(t, 'Link records');
    await shot(t, '$sbarRef/link_sheet');
    for (final id in ['14:15 BP 138/84 · Pulse 76 · SpO2 96% · Temp 37.1', '08:00 Lisinopril given 10 mg', '08:02 Metoprolol Tartrate given 25 mg']) {
      await tapLabel(t, id);
    }
    await tapText(t, 'Use 3 linked');
    for (var i = 0; i < items.length; i++) {
      await tapText(t, 'Add open item');
      await t.enterText(find.byType(TextField).at(3 + i), items[i].$1);
    }
    await tapLabel(t, 'Open item 1: mark as done by you');
    FocusManager.instance.primaryFocus?.unfocus();
    await t.pump(const Duration(seconds: 1));
    await settle(t);
    await t.drag(find.byType(SingleChildScrollView).first, const Offset(0, 3000));
    await settle(t);
    await shot(t, '$sbarRef/full');
    t.view.physicalSize = const Size(780, 844 * 2);
    await settle(t);
    await shot(t, '$sbarRef/first');
    h.app.lockVault();
  });

  visual('sbar view and commit errors', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    final n = ops.createHandoff(h.app.ctx(), patientId: 'p-ap', shift: 'Day to night, 14 Nov 19:00', situation: sText, background: bText, assessment: aText, openItems: ['Done by outgoing nurse: aPTT sample sent', 'Next Metoprolol 25 mg at 20:00'], sourceEntryIds: ['de-011', 'de-007'], clientKey: 'k1');
    await pumpPhone(t, h, home: SbarViewScreen(handoffId: n.id), height: 1500);
    await shot(t, '$sbarRef/view');
    await pumpPhone(t, h, home: SbarViewScreen(handoffId: n.id), width: 360, height: 780, textScale: 1.5);
    await pumpPhone(t, h, home: const SbarScreen(patientId: 'p-ap'), height: 2400);
    await tapText(t, 'Save & Commit SBAR Note');
    await shot(t, '$sbarRef/errors_and_earlier_notes');
    h.app.lockVault();
  });

  visual('handover', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    for (final p in ['p-ms', 'p-jw', 'p-rt']) {
      note(h, p);
    }
    await pumpPhone(t, h, home: const HandoverScreen(), height: 1600 * 390 / 296);
    await tapText(t, 'Choose nurse');
    await shot(t, '$handRef/incoming_sheet');
    await tapText(t, 'David Chen, RN');
    await shot(t, '$handRef/full');
    t.view.physicalSize = const Size(780, 844 * 2);
    await settle(t);
    await shot(t, '$handRef/first');
    await shot(t, '$handRef/handover_pending');
    await tapText(t, 'Complete Shift Handover Sign-Off');
    await shot(t, '$handRef/handover_signoff_blocked');
    await tapText(t, 'Go to pending note');
    await shot(t, '$handRef/handover_goto_pending');
    await sizes(t, h, handRef, const HandoverScreen());
    h.app.lockVault();
  });

  visual('handover sign-off', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    for (final p in ['p-ap', 'p-ms', 'p-jw', 'p-rt']) {
      note(h, p);
    }
    await pumpPhone(t, h, home: const HandoverScreen());
    await tapText(t, 'Choose nurse');
    await tapText(t, 'David Chen, RN');
    await shot(t, '$handRef/handover_ready');
    await tapText(t, 'Complete Shift Handover Sign-Off');
    await t.enterText(find.byType(TextField).at(0), '2468');
    await settle(t);
    await shot(t, '$handRef/handover_signoff_modal');
    await t.enterText(find.byType(TextField).at(1), '1111');
    await settle(t);
    await tapText(t, 'Authorize');
    await wait(t);
    await shot(t, '$handRef/handover_signoff_wrong_pin');
    await t.enterText(find.byType(TextField).at(1), '2468');
    await settle(t);
    await tapText(t, 'Authorize');
    await wait(t);
    await shot(t, '$handRef/handover_done');
    h.app.lockVault();
  });

  visual('readiness', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    for (final k in ['d1', 'd2']) {
      entries.createEntry(h.app.ctx(), type: 'vital_sign', patientId: 'p-ap', careTime: h.app.nowIso, values: {'heart_rate': 80}, clientKey: k, status: 'draft', rawInputKind: 'photo');
    }
    await real(t, () => h.signIn('s-ad'));
    await pumpPhone(t, h, home: const ReadinessScreen());
    await shot(t, '$readyRef/first');
    await pumpPhone(t, h, home: const ReadinessScreen(), height: 1600 * 390 / 393);
    await shot(t, '$readyRef/full');
    await pumpPhone(t, h, home: const ReadinessScreen(), height: 1800);
    await tapText(t, 'Force Integrity Check');
    await settle(t);
    await shot(t, '$readyRef/integrity_checked');
    await sizes(t, h, readyRef, const ReadinessScreen());
    ops.clearNetwork(h.app.ctx(), kNetworkChecklist, pinOk: true);
    h.app.saved();
    await pumpPhone(t, h, home: const ReadinessScreen(), height: 1700);
    await shot(t, '$readyRef/readiness_online');
    h.app.lockVault();
  });

  visual('checklist', (t) async {
    final h = await nurse(t);
    addTearDown(h.dispose);
    for (final p in ['p-ap', 'p-ms', 'p-jw', 'p-rt']) {
      note(h, p);
    }
    await real(t, () => h.signIn('s-ad'));
    final ev = h.app.downtime!.id;
    for (final i in ['paper-forms', 'staff-in', 'list-age', 'vitals', 'paper-check', 'sbar', 'net-0', 'net-1']) {
      ops.setChecklistItem(h.app.ctx(), eventId: ev, itemId: i, done: true);
    }
    h.app.saved();
    await pumpPhone(t, h, home: const ChecklistScreen());
    await shot(t, '$checkRef/first');
    await pumpPhone(t, h, home: const ChecklistScreen(), height: 1600 * 390 / 337);
    await shot(t, '$checkRef/full');
    await sizes(t, h, checkRef, const ChecklistScreen());
    await pumpPhone(t, h, home: const ChecklistScreen());
    await tapText(t, 'Switch to Back online (Practice)');
    await shot(t, '$checkRef/checklist_missing_tick');
    ops.setChecklistItem(h.app.ctx(), eventId: ev, itemId: 'net-2', done: true);
    h.app.saved();
    await settle(t);
    await tapText(t, 'Switch to Back online (Practice)');
    await tapLabel(t, '2');
    await tapLabel(t, '4');
    await shot(t, '$checkRef/checklist_pin');
    await tapLabel(t, '6');
    await tapLabel(t, '9');
    await wait(t);
    await shot(t, '$checkRef/checklist_pin_wrong');
    for (final k in ['2', '4', '6', '8']) {
      await tapLabel(t, k);
    }
    await wait(t);
    await settle(t);
    await shot(t, '$checkRef/checklist_online');
    h.app.lockVault();
  });

  visual('checklist preview, nurse', (t) async {
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    h.app.lockVault();
    await pumpPhone(t, h, home: const ChecklistScreen(preview: true), height: 1400);
    await shot(t, '$checkRef/checklist_preview');
    await sizes(t, h, '$checkRef/preview', const ChecklistScreen(preview: true));
    await real(t, () => h.app.unlockVault(passphrase: kPracticePassphrase));
    await real(t, () => h.signIn('s-sj'));
    await pumpPhone(t, h, home: const ChecklistScreen());
    await shot(t, '$checkRef/checklist_nurse');
    h.app.lockVault();
  });
}
