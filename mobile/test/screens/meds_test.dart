import 'package:clinbridge_practice/config/policy.dart';
import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/audit.dart';
import 'package:clinbridge_practice/data/repos/entries.dart';
import 'package:clinbridge_practice/data/schema.dart';
import 'package:clinbridge_practice/domain/meds.dart';
import 'package:clinbridge_practice/ui/kit/kit.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/body_art.dart';
import 'package:clinbridge_practice/ui/screens/body_map_screen.dart';
import 'package:clinbridge_practice/ui/screens/med_screens.dart';
import 'package:flutter/material.dart' hide Tab;
import 'package:flutter_test/flutter_test.dart';

import '../support/host.dart';
import '../support/shots.dart';

const slot08 = '2026-11-14T08:00:00-05:00';
const slot16 = '2026-11-14T16:00:00-05:00';
const slot18 = '2026-11-14T18:00:00-05:00';

Future<Harness> start(WidgetTester t, {String who = 's-sj', String patient = 'p-ap'}) async {
  final h = await real(t, () => designHarness());
  addTearDown(h.dispose);
  await real(t, () => h.signIn(who));
  h.app.verifyPatient(patient, ['Name', 'MRN']);
  return h;
}

/// Taps start idle timers inside the test clock; closing the records stops them.
void ui(String name, Future<Harness> Function(WidgetTester t) body) => visual(name, (t) async {
      final h = await body(t);
      await t.pumpWidget(const SizedBox());
      h.app.lockVault();
      await t.pump(const Duration(seconds: 10));
    });

Finder label(Pattern p) => find.bySemanticsLabel(p);

Future<void> tap(WidgetTester t, Pattern p, {bool twice = false}) async {
  final f = label(p).first;
  await t.ensureVisible(f);
  await t.pump(const Duration(milliseconds: 300));
  final at = t.getCenter(f);
  await t.tapAt(at);
  if (twice) await t.tapAt(at);
  await settle(t);
}

Future<void> wait(WidgetTester t) async {
  await real(t, () async => Future<void>.delayed(const Duration(milliseconds: 200)));
  await settle(t);
}

Future<void> digits(WidgetTester t, String pin) async {
  for (final d in pin.split('')) {
    await t.ensureVisible(find.byKey(ValueKey('pin-$d')));
    await t.tap(find.byKey(ValueKey('pin-$d')));
    await t.pump(const Duration(milliseconds: 50));
  }
}

ActiveOrder orderOf(Harness h, String id) => ActiveOrder(h.app.store.get('active_order', id)!);
List<EntryX> medsOf(Harness h, String orderId, {String patient = 'p-ap'}) => [for (final x in listPatientEntries(h.app.store, patient)) if (x.entry.type == 'med_admin' && x.med.orderId == orderId) x];
List<String> audits(Harness h) => [for (final r in h.app.store.all('audit_log')) '${r['action']}'];

Doc given(Harness h, String id, {String dose = '25', String unit = 'mg', String route = 'PO'}) {
  final r = validateMed(MedForm(event: 'administered', dose: dose, unit: unit, route: route), orderOf(h, id), null);
  expect(r.ok, isTrue, reason: '${r.errors}');
  return r.values;
}

Doc rate(Harness h, String n) => validateMed(MedForm(event: 'rate_changed', rate: n, rateUnit: 'units/h'), orderOf(h, 'o-hep'), 1000).values;

Entry save(Harness h, Doc values, {String patient = 'p-ap', String? slot, String? care, String? att, String? key}) =>
    createEntry(h.app.ctx(), type: 'med_admin', patientId: patient, careTime: care ?? h.app.nowIso, scheduledTime: slot, values: values, clientKey: key ?? newId('k'), attestationId: att);

MedProposal proposal(Harness h, {String r = '1100'}) => MedProposal(patientId: 'p-ap', orderId: 'o-hep', key: newId('k'), careTime: h.app.nowIso, values: rate(h, r), checklist: const ['a', 'b', 'c']);

Future<void> openCosign(WidgetTester t, Harness h, {MedProposal? p, String witness = 'David Chen, RN'}) async {
  await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1300);
  Go.cosign(ctxOf(t), p ?? proposal(h));
  await settle(t);
  await tap(t, 'Choose the second nurse');
  await tap(t, witness);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /* ------------------------------ ordinary administration ------------------------------ */

  ui('a given dose goes from the schedule into the records, once', (t) async {
    final h = await start(t);
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1900);
    expect(label('Due Now (1)'), findsOneWidget);
    expect(label('High-Alert (2)'), findsOneWidget);
    await tap(t, 'Record Administration');
    expect(medsOf(h, 'o-met').length, 1, reason: 'the drawer saves nothing');
    await tap(t, 'Continue To Record');
    expect(find.byType(MedEventScreen), findsOneWidget);
    await tap(t, 'Review & Save');
    expect(medsOf(h, 'o-met').length, 1, reason: 'the review saves nothing');
    await tap(t, 'Sign & Save On This Phone', twice: true);
    await settle(t);
    final l = medsOf(h, 'o-met');
    expect(l.length, 2);
    expect(l.first.entry.scheduledTime, slot16);
    expect(l.first.entry.status, 'confirmed');
    expect(l.first.entry.performerId, 's-sj');
    expect((l.first.med.event, l.first.med.doseGiven, l.first.med.doseGivenUnit, l.first.med.route), ('administered', 25, 'mg', 'PO'));
    expect(find.byType(MarScreen), findsOneWidget);
    expect(find.textContaining('Saved on this phone'), findsWidgets);
    expect(label('Due Now (0)'), findsOneWidget);
    expect(find.text('GIVEN • 16:00'), findsOneWidget);
    expect(verifyChain(h.app.store.all('audit_log')).ok, isTrue);
    return h;
  });

  ui('held needs a reason and is stored for its scheduled time', (t) async {
    final h = await start(t);
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1900);
    await tap(t, 'Record Administration');
    await tap(t, 'Held');
    await tap(t, 'Review & Save');
    expect(find.text('Say why it was held'), findsWidgets);
    await t.enterText(find.byType(TextField).last, 'Patient vomiting');
    await settle(t);
    await tap(t, 'Review & Save');
    await tap(t, 'Sign & Save On This Phone');
    final l = medsOf(h, 'o-met');
    expect(l.length, 2);
    expect((l.first.med.event, l.first.med.reason, l.first.entry.scheduledTime, l.first.med.doseGiven), ('held', 'Patient vomiting', slot16, null));
    expect(find.text('HELD • 16:00'), findsOneWidget);
    return h;
  });

  ui('a dose different from the order must be ticked; storage failure keeps the form; retry saves one record', (t) async {
    final h = await start(t);
    await pumpPhone(t, h, home: const MedEventScreen(patientId: 'p-ap', orderId: 'o-met', event: 'administered', scheduledTime: slot16), height: 1900);
    await t.enterText(find.byType(TextField).first, '50');
    await settle(t);
    expect(find.text('Check the warning and tick it first.'), findsOneWidget);
    await tap(t, 'Review & Save');
    expect(label('Sign & Save On This Phone'), findsNothing);
    await tap(t, 'I checked this and it is right');
    await tap(t, 'Review & Save');
    h.app.store.fault = (op) {
      if (op == 'insert med_admin') throw const StorageError(kStorageFull);
    };
    await tap(t, 'Sign & Save On This Phone');
    expect(find.text(kStorageFull), findsOneWidget);
    expect(medsOf(h, 'o-met').length, 1);
    h.app.store.fault = null;
    await tap(t, 'Try Again', twice: true);
    final l = medsOf(h, 'o-met');
    expect(l.length, 2);
    expect(l.first.med.doseGiven, 50);
    return h;
  });

  ui('LPN records an ordinary medicine', (t) async {
    final h = await start(t, who: 's-mv');
    await pumpPhone(t, h, home: const MedEventScreen(patientId: 'p-ap', orderId: 'o-met', event: 'administered', scheduledTime: slot16), height: 1500);
    await tap(t, 'Review & Save');
    await tap(t, 'Sign & Save On This Phone');
    expect(medsOf(h, 'o-met').first.entry.performerId, 's-mv');
    return h;
  });

  ui('admin looks at the schedule but cannot record', (t) async {
    final h = await start(t, who: 's-ad');
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1900);
    await tap(t, 'Record Administration');
    expect(label('Continue To Record'), findsNothing);
    await tap(t, RegExp('^Rate Change'));
    expect(find.byType(MedEventScreen), findsNothing);
    expect(() => Go.medEvent(ctxOf(t), 'p-ap', 'o-met', event: 'administered'), throwsA(isA<NotAllowedError>()));
    expect(() => save(h, given(h, 'o-met'), slot: slot16), throwsA(isA<NotAllowedError>()));
    expect(medsOf(h, 'o-met').length, 1);
    return h;
  });

  ui('an order of another patient is refused', (t) async {
    final h = await start(t);
    expect(() => save(h, given(h, 'o-ace', dose: '1', unit: 'g', route: 'IV')), throwsA(predicate((e) => e is AppError && e.message.contains('another patient'))));
    await pumpPhone(t, h, home: const MedEventScreen(patientId: 'p-ap', orderId: 'o-ace', event: 'administered'));
    expect(find.textContaining('not an active medicine order of the verified patient'), findsOneWidget);
    expect(label('Review & Save'), findsNothing);
    expect(medsOf(h, 'o-ace').length, 0);
    return h;
  });

  ui('a time in the future is refused', (t) async {
    final h = await start(t);
    await pumpPhone(t, h, home: const MedEventScreen(patientId: 'p-ap', orderId: 'o-met', event: 'administered', scheduledTime: slot16), height: 1500);
    await tap(t, RegExp('^Bedside execution time'));
    await t.enterText(find.byType(TextField).last, '18:05');
    await tap(t, 'Use This Time');
    expect(find.text('The time cannot be in the future.'), findsOneWidget);
    expect(() => save(h, given(h, 'o-met'), slot: slot16, care: '2026-11-14T18:05:00-05:00'), throwsA(isA<AppError>()));
    return h;
  });

  /* ------------------------------ high-alert: second nurse ------------------------------ */

  ui('a high-alert record without a second nurse is never stored', (t) async {
    final h = await start(t);
    expect(() => save(h, rate(h, '1100')), throwsA(predicate((e) => e is AppError && e.message.contains('second nurse'))));
    expect(() => save(h, {...rate(h, '1100'), 'double_checked': true, 'double_checked_by': 's-dc'}), throwsA(isA<AppError>()));
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1900);
    await tap(t, 'Rate Change / Co-Sign');
    await t.enterText(find.byType(TextField).first, '1100');
    await settle(t);
    await tap(t, 'Authenticate Second Nurse');
    expect(find.byType(CosignScreen), findsNothing, reason: 'the three checks are not ticked');
    for (final x in ['Right patient', 'Rate on the order', 'Line traced']) {
      await tap(t, RegExp('^$x'));
    }
    await tap(t, 'Authenticate Second Nurse');
    expect(find.byType(CosignScreen), findsOneWidget);
    expect(medsOf(h, 'o-hep').length, 1, reason: 'nothing is saved before the co-sign');
    await tap(t, 'Go back');
    expect(find.byType(CosignScreen), findsNothing);
    expect(medsOf(h, 'o-hep').length, 1);
    return h;
  });

  ui('rate change with a second nurse, full path, stored once with both people', (t) async {
    final h = await start(t);
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1900);
    await tap(t, 'Rate Change / Co-Sign');
    await tap(t, 'Increase typed rate');
    await tap(t, 'Increase typed rate');
    for (final x in ['Right patient', 'Rate on the order', 'Line traced']) {
      await tap(t, RegExp('^$x'));
    }
    await tap(t, 'Authenticate Second Nurse');
    await tap(t, 'Choose the second nurse');
    await tap(t, 'David Chen, RN');
    await digits(t, kPracticePin);
    await tap(t, 'Authorize & Save On This Phone', twice: true);
    await wait(t);
    await wait(t);
    final l = medsOf(h, 'o-hep');
    expect(l.length, 2);
    expect((l.first.med.rate, l.first.med.priorRate, l.first.med.doubleChecked, l.first.med.doubleCheckedBy, l.first.entry.performerId), (1100, 1000, true, 's-dc', 's-sj'));
    expect(h.app.store.count('m_attestation'), 1);
    expect(find.byType(MarScreen), findsOneWidget);
    expect(find.textContaining('checked by D. Chen, RN'), findsWidgets);
    expect(verifyChain(h.app.store.all('audit_log')).ok, isTrue);
    return h;
  });

  ui('only another active RN is offered; LPN, admin and the primary are refused by the core too', (t) async {
    final h = await start(t);
    await pumpPhone(t, h, home: CosignScreen(proposal: proposal(h)), height: 1300);
    await tap(t, 'Choose the second nurse');
    expect(label('David Chen, RN'), findsOneWidget);
    expect(label('Elena Rostova, RN'), findsOneWidget);
    for (final n in ['Marcus Vance, LPN', 'Kim Ellis', 'Sarah Jenkins, RN']) {
      expect(label(n), findsNothing);
    }
    for (final id in ['s-mv', 's-ad', 's-sj']) {
      expect(() => recordAttestation(h.app.ctx(), witnessId: id, outcome: 'given', patientId: 'p-ap', careTime: h.app.nowIso, values: rate(h, '1100'), checklist: const []), throwsA(isA<AppError>()));
    }
    final (r, id) = await real(t, () => h.app.cosign(h.app.ctx(), witnessId: 's-sj', pin: kPracticePin, patientId: 'p-ap', careTime: h.app.nowIso, values: rate(h, '1100'), checklist: const []));
    expect((r.ok, id), (false, null));
    expect(h.app.store.count('m_attestation'), 0);
    return h;
  });

  ui('wrong PINs: tries left, then a lockout that a right PIN cannot pass', (t) async {
    final h = await start(t);
    await openCosign(t, h);
    for (var i = 1; i <= 5; i++) {
      await digits(t, '1357');
      await tap(t, 'Authorize & Save On This Phone');
      await wait(t);
      expect(find.textContaining(i < 5 ? '${5 - i} tries left' : 'Too many wrong tries'), findsOneWidget);
    }
    await digits(t, kPracticePin);
    await tap(t, 'Authorize & Save On This Phone');
    await wait(t);
    expect(medsOf(h, 'o-hep').length, 1);
    expect(h.app.store.count('m_attestation'), 0);
    expect(audits(h).where((x) => x == 'cosign_wrong_pin').length, 5);
    expect(audits(h), contains('staff_pin_lockout'));
    return h;
  });

  ui('details changed after the check, a reused check and another record are refused', (t) async {
    final h = await start(t);
    final now = h.app.nowIso;
    final (r, id) = await real(t, () => h.app.cosign(h.app.ctx(), witnessId: 's-dc', pin: kPracticePin, patientId: 'p-ap', careTime: now, values: rate(h, '1100'), checklist: const ['a']));
    expect(r.ok, isTrue);
    expect(() => save(h, rate(h, '1200'), care: now, att: id), throwsA(predicate((e) => e is AppError && e.message.contains('changed after the second check'))));
    expect(() => save(h, rate(h, '1100'), care: '2026-11-14T16:00:00-05:00', att: id), throwsA(isA<AppError>()));
    save(h, rate(h, '1100'), care: now, att: id);
    expect(() => save(h, rate(h, '1100'), care: now, att: id), throwsA(predicate((e) => e is AppError && e.message.contains('already used'))));
    expect(medsOf(h, 'o-hep').length, 2);
    return h;
  });

  ui('decline needs a reason, is written down and stores no medication record', (t) async {
    final h = await start(t);
    await openCosign(t, h);
    await tap(t, 'Decline / Flag Discrepancy');
    await tap(t, 'Save Decline');
    expect(find.text('Write the reason.'), findsOneWidget);
    await t.enterText(find.byType(TextField).last, 'Pump shows another rate');
    await tap(t, 'Save Decline');
    final att = h.app.store.all('m_attestation').single;
    expect((att['outcome'], att['witness_id'], att['primary_id'], att['reason']), ('declined', 's-dc', 's-sj', 'Pump shows another rate'));
    expect(medsOf(h, 'o-hep').length, 1);
    expect(audits(h), contains('cosign_declined'));
    expect(find.byType(CosignScreen), findsNothing);
    expect(() => save(h, rate(h, '1100'), att: '${att['id']}'), throwsA(isA<AppError>()));
    return h;
  });

  ui('storage failure after the check: kept, retried without a new PIN, one record', (t) async {
    final h = await start(t);
    await openCosign(t, h);
    await digits(t, kPracticePin);
    h.app.store.fault = (op) {
      if (op == 'insert entry') throw const StorageError(kStorageFailed);
    };
    await tap(t, 'Authorize & Save On This Phone');
    await wait(t);
    expect(find.textContaining('NOT saved'), findsWidgets);
    expect((medsOf(h, 'o-hep').length, h.app.store.count('m_attestation')), (1, 1));
    h.app.store.fault = null;
    await tap(t, 'Save Again', twice: true);
    await wait(t);
    expect((medsOf(h, 'o-hep').length, h.app.store.count('m_attestation')), (2, 1));
    expect(find.byType(CosignScreen), findsNothing);
    return h;
  });

  ui('leaving after an unused check asks, writes it down and stores nothing', (t) async {
    final h = await start(t);
    await openCosign(t, h);
    await digits(t, kPracticePin);
    h.app.store.fault = (op) {
      if (op == 'insert entry') throw const StorageError(kStorageFailed);
    };
    await tap(t, 'Authorize & Save On This Phone');
    await wait(t);
    h.app.store.fault = null;
    await tap(t, 'Go back');
    expect(find.text('Leave without saving?'), findsOneWidget);
    await tap(t, 'Leave');
    expect(find.byType(CosignScreen), findsNothing);
    expect(medsOf(h, 'o-hep').length, 1);
    expect(audits(h), contains('cosign_not_used'));
    return h;
  });

  ui('LPN prepares a high-alert dose, an RN must still check it', (t) async {
    final h = await start(t, who: 's-mv');
    expect(() => save(h, given(h, 'o-hyd', dose: '0.5', route: 'IV')), throwsA(isA<AppError>()));
    final now = h.app.nowIso;
    final (_, id) = await real(t, () => h.app.cosign(h.app.ctx(), witnessId: 's-sj', pin: kPracticePin, patientId: 'p-ap', careTime: now, values: given(h, 'o-hyd', dose: '0.5', route: 'IV'), checklist: const []));
    save(h, given(h, 'o-hyd', dose: '0.5', route: 'IV'), care: now, att: id);
    expect(medsOf(h, 'o-hyd').single.med.doubleCheckedBy, 's-sj');
    return h;
  });

  /* ------------------------------ dose locks ------------------------------ */

  ui('hold: the schedule opens the lock page, the core refuses, held is stored from there', (t) async {
    final h = await start(t);
    expect(() => save(h, given(h, 'o-cef', dose: '1', unit: 'g', route: 'IV'), slot: slot18), throwsA(isA<DoseLockedError>()));
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1900);
    await tap(t, 'Order Details');
    await t.tap(find.byKey(const ValueKey('sheet-give-o-cef')));
    await settle(t);
    expect(find.byType(ConflictScreen), findsOneWidget);
    expect(find.byType(MedEventScreen), findsNothing);
    expect(audits(h).where((x) => x == 'dose_locked').length, 1);
    await t.tapAt(t.getCenter(find.text('Enter Physician Emergency Override PIN')));
    await settle(t);
    expect(find.textContaining('no override workflow is approved.'), findsWidgets);
    expect(medsOf(h, 'o-cef').length, 1);
    await t.pump(const Duration(seconds: 5)); // the message at the bottom goes away
    await settle(t);
    await tap(t, 'Confirm Hold & Return to MAR');
    await tap(t, 'Save As Held');
    expect(find.text('Write the reason.'), findsOneWidget);
    await t.enterText(find.byType(TextField).last, 'Order on hold. Prescriber called.');
    await tap(t, 'Save As Held', twice: true);
    final l = medsOf(h, 'o-cef');
    expect(l.length, 2);
    expect((l.first.med.event, l.first.entry.scheduledTime, l.first.med.doseGiven), ('held', slot18, null));
    expect(l.where((x) => x.med.event == 'administered'), isEmpty);
    expect(find.byType(MarScreen), findsOneWidget);

    Go.conflict(ctxOf(t), 'p-ap', 'o-cef', scheduledTime: slot18, locks: doseLocks(h.app.store, orderOf(h, 'o-cef'), listPatientEntries(h.app.store, 'p-ap'), careTime: h.app.nowIso, scheduledTime: slot18));
    await settle(t);
    expect(label('Confirm Hold & Return to MAR'), findsNothing);
    await t.pump(const Duration(seconds: 5));
    await settle(t);
    await tap(t, 'Return to MAR');
    expect(find.byType(ConflictScreen), findsNothing);
    expect(medsOf(h, 'o-cef').length, 2);
    expect(audits(h).where((x) => x == 'dose_locked').length, 2);
    return h;
  });

  ui('slot and interval locks stop the form and the core', (t) async {
    final h = await start(t);
    expect(() => save(h, given(h, 'o-met'), slot: slot08), throwsA(isA<DoseLockedError>()));
    expect(medsOf(h, 'o-met').length, 1);
    await pumpPhone(t, h, home: const MedEventScreen(patientId: 'p-ap', orderId: 'o-met', event: 'administered', scheduledTime: slot08), height: 1500);
    await tap(t, 'Review & Save');
    expect(find.byType(ConflictScreen), findsOneWidget);
    expect(find.text('SAME SCHEDULED TIME'), findsOneWidget);

    save(h, given(h, 'o-alb', dose: '2', unit: 'mg', route: 'INH'), care: '2026-11-14T15:05:00-05:00');
    expect(() => save(h, given(h, 'o-alb', dose: '2', unit: 'mg', route: 'INH')), throwsA(isA<DoseLockedError>()));
    await pumpPhone(t, h, home: const MarScreen(patientId: 'p-ap'), height: 1900);
    expect(find.text('LOCKED • INTERVAL'), findsOneWidget);
    await tap(t, 'Administer PRN Dose');
    expect(find.byType(ConflictScreen), findsOneWidget);
    expect(find.text('ORDER INTERVAL'), findsOneWidget);
    expect(medsOf(h, 'o-alb').length, 2);
    return h;
  });

  ui('a lock that appears while the review is open stops the save', (t) async {
    final h = await start(t);
    await pumpPhone(t, h, home: const MedEventScreen(patientId: 'p-ap', orderId: 'o-met', event: 'administered', scheduledTime: slot16), height: 1500);
    await tap(t, 'Review & Save');
    save(h, given(h, 'o-met'), slot: slot16);
    await tap(t, 'Sign & Save On This Phone');
    expect(find.byType(ConflictScreen), findsOneWidget);
    expect(medsOf(h, 'o-met').length, 2);
    return h;
  });

  /* ------------------------------ body map ------------------------------ */

  Offset onFigure(WidgetTester t, double x, double y) {
    final r = t.getRect(find.byKey(const ValueKey('body-figure')));
    return r.topLeft + Offset(x / 240 * r.width, y / 560 * r.height);
  }

  ui('a finding is saved with region, side and view and is there after a restart', (t) async {
    final h = await start(t);
    await pumpPhone(t, h, home: const BodyMapScreen(patientId: 'p-ap'), height: 1500);
    await t.tapAt(onFigure(t, 50, 250));
    await settle(t);
    expect(find.textContaining('SELECTED: RIGHT FOREARM'), findsOneWidget, reason: 'front view: the viewer\'s left is the patient\'s right');
    await tap(t, 'Tag new region');
    await tap(t, 'Add To Map');
    expect(find.text('Choose what kind of finding it is.'), findsOneWidget);
    await tap(t, 'Line');
    await t.enterText(find.byType(TextField).last, 'Dressing intact');
    await tap(t, 'Add To Map');
    expect(find.text('NOT SAVED'), findsWidgets);
    expect(h.app.store.count('m_body_finding'), 0);
    expect(listDrafts(h.app.store, 's-sj', kind: 'body').length, 1);
    final before = h.app.store.count('entry');
    h.app.store.fault = (op) {
      if (op == 'insert m_body_finding') throw const StorageError(kStorageFull);
    };
    await tap(t, 'Save Assessment On Phone');
    expect(find.text(kStorageFull), findsOneWidget);
    expect((h.app.store.count('entry'), h.app.store.count('m_body_finding')), (before, 0), reason: 'all or nothing');
    h.app.store.fault = null;
    await tap(t, 'Save Assessment On Phone', twice: true);
    final row = h.app.store.all('m_body_finding').single;
    expect((row['region_id'], row['side'], row['view'], row['kind'], row['text']), ('RIGHT_FOREARM', 'right', 'front', 'line', 'Dressing intact'));
    expect(h.app.store.count('entry'), before + 1);
    expect(getEntry(h.app.store, '${row['entry_id']}')!.note.text, contains('Right forearm'));
    expect(listDrafts(h.app.store, 's-sj', kind: 'body'), isEmpty);

    // Process death: a new app on the same files.
    await t.pumpWidget(const SizedBox());
    h.app.lockVault();
    final h2 = h.restart();
    await real(t, () async {
      await h2.app.boot();
      await h2.app.unlockVault(passphrase: kPracticePassphrase);
      await h2.signIn('s-sj');
    });
    h2.app.verifyPatient('p-ap', ['Name', 'MRN']);
    expect(h2.app.store.all('m_body_finding').single['region_id'], 'RIGHT_FOREARM');
    await pumpPhone(t, h2, home: const BodyMapScreen(patientId: 'p-ap'), height: 1500);
    expect(find.text('Right Forearm Line'), findsOneWidget);

    // Reassess adds a note; the older one stays in History.
    await t.ensureVisible(find.byKey(const ValueKey('reassess-RIGHT_FOREARM|line')));
    await t.tap(find.byKey(const ValueKey('reassess-RIGHT_FOREARM|line')));
    await settle(t);
    await t.enterText(find.byType(TextField).last, 'Dressing changed');
    await tap(t, 'Add Reassessment');
    await tap(t, 'Save Assessment On Phone');
    expect(h2.app.store.count('m_body_finding'), 2);
    await tap(t, 'History');
    expect(find.text('Dressing intact'), findsOneWidget);
    h.app.lockVault();
    return h2;
  });

  ui('back view: the patient\'s left is on the viewer\'s left', (t) async {
    final h = await start(t);
    await pumpPhone(t, h, home: const BodyMapScreen(patientId: 'p-ap'), height: 1500);
    await tap(t, 'Posterior (Back)');
    await t.tapAt(onFigure(t, 50, 250));
    await settle(t);
    expect(find.textContaining('SELECTED: LEFT FOREARM'), findsOneWidget);
    expect(regionAt('front', const Offset(190, 250))!.id, 'LEFT_FOREARM');
    expect(regionAt('back', const Offset(190, 250))!.id, 'RIGHT_FOREARM');
    expect(regionAt('front', const Offset(140, 226))!.id, 'ABDOMEN_LEFT');
    expect(kRegions.length, 24);
    for (final r in kRegions) {
      for (final v in r.zones.keys) {
        expect(r.zones[v]!.path.contains(r.zones[v]!.anchor), isTrue, reason: '${r.id} $v: the marker sits inside its region');
      }
    }
    for (final s in kSiteWords) {
      expect(siteRegion(s)!.side, s.toLowerCase().contains('left') ? 'left' : 'right');
    }
    return h;
  });

  ui('an unsaved finding is kept as a draft and Discard asks first', (t) async {
    final h = await start(t);
    Future<void> open() => pumpPhone(t, h, home: const BodyMapScreen(patientId: 'p-ap'), height: 1500);
    await open();
    await tap(t, 'Tag new region');
    await tap(t, 'Chest');
    await tap(t, 'Other');
    await t.enterText(find.byType(TextField).last, 'Small bruise');
    await tap(t, 'Add To Map');
    await open();
    expect(find.text('Small bruise'), findsOneWidget);
    expect(find.textContaining('kept on this phone'), findsOneWidget);
    await tap(t, 'Discard');
    expect(find.text('Discard unsaved findings?'), findsOneWidget);
    await tap(t, 'Cancel');
    expect(find.text('Small bruise'), findsOneWidget);
    await tap(t, 'Discard');
    await t.tap(find.widgetWithText(Btn, 'Discard').last);
    await settle(t);
    expect(listDrafts(h.app.store, 's-sj', kind: 'body'), isEmpty);
    expect(h.app.store.count('m_body_finding'), 0);
    return h;
  });

  ui('medicine sites are shown read only; admin cannot tag', (t) async {
    final h = await start(t);
    save(h, {...given(h, 'o-alb', dose: '2', unit: 'mg', route: 'INH'), 'site': 'Left hand IV line', 'route': 'IV'});
    h.app.saved();
    await pumpPhone(t, h, home: const BodyMapScreen(patientId: 'p-ap'), height: 1500);
    expect(label('Left hand: IV SITE'), findsOneWidget);
    await tap(t, RegExp('Show tagged only'));
    expect(label('Left hand: IV SITE'), findsNothing);
    await real(t, () => h.signIn('s-ad'));
    h.app.verifyPatient('p-ap', ['Name', 'MRN']);
    await pumpPhone(t, h, home: const BodyMapScreen(patientId: 'p-ap'), height: 1500);
    await tap(t, 'Tag new region');
    expect(label('Add To Map'), findsNothing);
    return h;
  });
}
