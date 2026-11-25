import 'dart:io';

import 'package:clinbridge_practice/config/policy.dart';
import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/repos/ops.dart';
import 'package:clinbridge_practice/state/app_state.dart';
import 'package:clinbridge_practice/ui/app.dart';
import 'package:clinbridge_practice/ui/kit/kit.dart';
import 'package:clinbridge_practice/ui/router.dart';
import 'package:clinbridge_practice/ui/screens/entry_screens.dart';
import 'package:clinbridge_practice/ui/screens/patient_screens.dart';
import 'package:clinbridge_practice/ui/screens/ward_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/host.dart';
import '../support/shots.dart';

/* Real app, real core, real SQLCipher. */

Future<void> work(WidgetTester t) async {
  await real(t, () => Future<void>.delayed(const Duration(milliseconds: 50)));
  await settle(t);
}

Future<void> press(WidgetTester t, Object what) async {
  final f = what is Finder ? what : find.text(what as String);
  await t.ensureVisible(f.first);
  await t.pump();
  await t.tap(f.first, warnIfMissed: false); // an Unavailable control takes the tap itself
  await work(t);
}

Finder labelled(String text) => find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').contains(text));

Future<void> pin(WidgetTester t, String digits) async {
  for (final d in digits.split('')) {
    final f = find.widgetWithText(Tap, d);
    await t.ensureVisible(f);
    await t.tap(f);
    await t.pump();
  }
}

int dots(WidgetTester t) {
  final s = t.widget<Semantics>(find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').endsWith('of 4 digits entered')));
  return int.parse(s.properties.label![0]);
}

Btn btn(WidgetTester t, String text) => t.widget<Btn>(find.widgetWithText(Btn, text));

List<Doc> audits(Harness h, String action) => h.app.store.where('audit_log', 'action', action);

/// The idle timers belong to the test's clock: stop them before the test ends.
Future<void> done(WidgetTester t, Harness h) async {
  await t.pumpWidget(const SizedBox());
  h.app.lockVault();
}

/// Design data, Sarah signed in, on the ward.
Future<Harness> onWard(WidgetTester t, {String who = 's-sj'}) async {
  final h = await real(t, () => designHarness());
  addTearDown(h.dispose);
  await real(t, () => h.signIn(who));
  await pumpPhone(t, h, home: const WardScreen());
  h.app.saved(); // the app widget reads its first state on the first notification
  await settle(t);
  return h;
}

void main() {
  visual('first launch: setup, roster, PIN, ward', (t) async {
    final h = Harness.make();
    addTearDown(h.dispose);
    await pumpPhone(t, h);
    expect(find.byType(OpeningScreen), findsOneWidget);
    expect(btn(t, 'Get started').onTap, isNull, reason: 'disabled while the phone is checked');
    await real(t, () => h.app.boot());
    await settle(t);
    expect(h.app.vaultStatus, VaultStatus.none);
    await press(t, 'Get started');
    expect(find.byType(VaultScreen), findsOneWidget);
    expect(find.text(kPracticePassphrase), findsOneWidget);
    await press(t, 'Create encrypted Practice store');
    expect(find.byType(SelectStaffScreen), findsOneWidget);
    expect(audits(h, 'vault_created'), hasLength(1));
    expect(h.app.store.cipherVersion, isNotEmpty);
    expect(String.fromCharCodes(File('${h.dir.path}/practice.db').readAsBytesSync().take(15)), isNot('SQLite format 3'));
    // Only active accounts are offered, the admin too.
    expect(find.text('Tara Nguyen, RN'), findsNothing);
    expect(find.text('Kim Ellis'), findsOneWidget);
    expect(btn(t, 'Select your name to continue').onTap, isNull);
    await press(t, 'Maria Alvarez, RN');
    await press(t, 'Continue with Maria Alvarez, RN');
    expect(find.byType(PinScreen), findsOneWidget);
    expect(dots(t), 0);
    await pin(t, '2468');
    await press(t, 'Sign in to 4 West');
    expect(find.byType(WardScreen), findsOneWidget);
    expect(h.app.user!.id, 'pr-alvarez');
    expect(audits(h, 'staff_signed_in').single['entity'], 'practitioner/pr-alvarez');
    expect(find.text('All Beds (10)'), findsOneWidget);
    await done(t, h);
  });

  visual('opening page: where Get started goes', (t) async {
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    await pumpPhone(t, h);
    await press(t, 'Get started');
    expect(find.byType(SelectStaffScreen), findsOneWidget);
    await real(t, () => h.signIn('s-sj'));
    await pumpPhone(t, h);
    await press(t, 'Get started');
    expect(find.byType(WardScreen), findsOneWidget);
    h.app.saved();
    h.app.lockVault();
    await settle(t);
    expect(find.byType(OpeningScreen), findsOneWidget);
    await press(t, 'Get started');
    expect(find.byType(VaultScreen), findsOneWidget);
    await done(t, h);
  });

  visual('locked records: wrong passphrase, then recovery code', (t) async {
    final h = await real(t, () => Harness.make().ready());
    addTearDown(h.dispose);
    h.app.lockVault();
    await pumpPhone(t, h, home: const VaultScreen());
    await press(t, 'Unlock records');
    expect(find.text('Enter the passphrase.'), findsOneWidget);
    await t.enterText(find.byType(TextField), 'wrong words');
    await press(t, 'Unlock records');
    expect(find.text('The passphrase is not right.'), findsOneWidget);
    expect(t.widget<TextField>(find.byType(TextField)).controller!.text, 'wrong words');
    expect(h.app.unlocked, isFalse);
    await press(t, 'Use the recovery code instead');
    await press(t, 'Use practice recovery code');
    await press(t, 'Unlock records');
    expect(find.byType(SelectStaffScreen), findsOneWidget);
    expect(audits(h, 'vault_unlocked'), hasLength(1));
    await done(t, h);
  });

  visual('records that cannot be opened: no reset, nothing deleted', (t) async {
    final h = await real(t, () => Harness.make().ready());
    addTearDown(h.dispose);
    h.app.lockVault();
    final before = File('${h.dir.path}/practice.db').readAsBytesSync().length;
    h.bridge.keystoreKey = null;
    final h2 = h.restart();
    await real(t, () => h2.app.boot());
    await pumpPhone(t, h2);
    await press(t, 'Get started');
    expect(find.text(h2.app.vaultProblem!), findsOneWidget);
    expect(find.text('This app changed nothing and deleted nothing.'), findsOneWidget);
    expect(find.textContaining('eset'), findsNothing);
    expect(find.byType(Btn), findsOneWidget);
    await press(t, 'Back to opening page');
    expect(find.byType(OpeningScreen), findsOneWidget);
    expect(File('${h.dir.path}/practice.db').readAsBytesSync().length, before);
    await done(t, h2);
  });

  visual('roster search by name and role, no results, clear', (t) async {
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const SelectStaffScreen());
    await t.enterText(find.byType(TextField), 'lpn');
    await settle(t);
    expect(find.text('Marcus Vance, LPN'), findsOneWidget);
    expect(find.text('David Chen, RN'), findsNothing);
    await t.enterText(find.byType(TextField), 'nobody here');
    await settle(t);
    expect(find.text('No clinicians matched'), findsOneWidget);
    await press(t, labelled('Clear filter'));
    expect(find.text('David Chen, RN'), findsOneWidget);
    // Hardware key: not supported, says so, changes nothing.
    await press(t, find.byType(Unavailable));
    expect(find.text('Hardware keys are not supported. Choose your name and use your PIN.'), findsOneWidget);
    await done(t, h);
  });

  visual('PIN pad: empty start, four digits needed, clear, delete, wrong PIN, right PIN', (t) async {
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const PinScreen(staffId: 's-sj'));
    expect(dots(t), 0);
    expect(btn(t, 'Sign in to Ward 4B').onTap, isNull);
    await pin(t, '135');
    expect(dots(t), 3);
    expect(btn(t, 'Sign in to Ward 4B').onTap, isNull);
    await press(t, labelled('Delete last digit'));
    expect(dots(t), 2);
    await press(t, labelled('Clear'));
    expect(dots(t), 0);
    await pin(t, '13579');
    expect(dots(t), 4, reason: 'a fifth digit is ignored');
    await press(t, 'Sign in to Ward 4B');
    expect(find.text('Wrong PIN · 4 tries left'), findsOneWidget);
    expect(dots(t), 0);
    expect(h.app.user, isNull);
    expect(audits(h, 'staff_pin_wrong'), hasLength(1));
    await pin(t, '2468');
    await press(t, 'Sign in to Ward 4B');
    expect(h.app.user!.id, 's-sj');
    expect(find.byType(WardScreen), findsOneWidget);
    await done(t, h);
  });

  visual('five wrong PINs lock out; closing the app does not shorten it', (t) async {
    final h = await real(t, () => Harness.make().ready());
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const PinScreen(staffId: 'pr-okafor'));
    for (var i = 0; i < 5; i++) {
      await pin(t, '1111');
      await press(t, 'Sign in to 4 West');
    }
    expect(find.text('Too many wrong tries. Locked for 01:00'), findsOneWidget);
    expect(audits(h, 'staff_pin_lockout'), hasLength(1));
    await pin(t, '2468');
    expect(dots(t), 0, reason: 'keys are off');
    // The countdown is written again every second.
    h.wall = h.wall.add(const Duration(seconds: 10));
    await t.pump(const Duration(seconds: 1));
    expect(find.text('Too many wrong tries. Locked for 00:50'), findsOneWidget);
    // Process death and a new start on the same files.
    await t.pumpWidget(const SizedBox());
    final h2 = h.restart();
    await real(t, () => h2.app.boot());
    await pumpPhone(t, h2);
    await press(t, 'Get started');
    await press(t, 'Use practice passphrase');
    await press(t, 'Unlock records');
    await press(t, 'Daniel Okafor, RN');
    await press(t, 'Continue with Daniel Okafor, RN');
    expect(find.text('Too many wrong tries. Locked for 00:50'), findsOneWidget);
    final r = await real(t, () => h2.app.signIn('pr-okafor', '2468'));
    expect(r.ok, isFalse);
    // Another person is not locked out.
    expect(h2.app.pinLockedFor('pr-alvarez'), Duration.zero);
    // After the wait the right PIN works.
    h2.wall = h2.wall.add(const Duration(seconds: 51));
    await t.pump(const Duration(seconds: 1));
    await t.pump();
    expect(find.text('Enter digit 1 of 4'), findsOneWidget);
    await pin(t, '2468');
    await press(t, 'Sign in to 4 West');
    expect(h2.app.user!.id, 'pr-okafor');
    expect(find.byType(WardScreen), findsOneWidget);
    await done(t, h2);
    h.app.lockVault();
  });

  visual('switched-off account cannot use the PIN page', (t) async {
    final h = await real(t, () => Harness.make().ready());
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const PinScreen(staffId: 'pr-nguyen'));
    expect(find.text('This account is switched off.'), findsOneWidget);
    await pin(t, '2468');
    expect(dots(t), 0);
    expect(btn(t, 'Sign in to 4 West').onTap, isNull);
    await done(t, h);
  });

  visual('ward: real counts, filters, search, no results', (t) async {
    final h = await onWard(t);
    expect(find.text('4 Patients'), findsOneWidget);
    expect(find.text('2 Pending'), findsOneWidget);
    expect(find.text('17 records'), findsOneWidget);
    for (final x in ['All Beds (4)', 'Assigned to Me (4)', 'Pending Vitals (2)', 'High Alert (2)']) {
      expect(find.text(x), findsOneWidget);
    }
    expect(find.textContaining('Eleanor'), findsNothing);
    await press(t, 'Pending Vitals (2)');
    expect(find.textContaining('Maria Santos'), findsNothing);
    expect(find.textContaining('James K. Wilson'), findsOneWidget);
    await press(t, 'All Beds (4)');
    await t.enterText(find.byType(TextField), '8812');
    await settle(t);
    expect(find.textContaining('Maria Santos'), findsOneWidget);
    expect(find.textContaining('Arthur Pendelton'), findsNothing);
    await t.enterText(find.byType(TextField), 'zzz');
    await settle(t);
    expect(find.text('No Patient Found'), findsOneWidget);
    await press(t, labelled('Clear search'));
    expect(find.textContaining('Arthur Pendelton'), findsOneWidget);
    await done(t, h);
  });

  visual('assign and unassign: saved on the phone; admins have no list', (t) async {
    final h = await onWard(t, who: 's-dc');
    expect(find.text('0 Patients'), findsOneWidget);
    await press(t, labelled('Patient options Arthur Pendelton'));
    await press(t, 'Assign to me');
    expect(assignedPatients(h.app.store, 's-dc'), {'p-ap'});
    expect(audits(h, 'assignment_changed'), hasLength(1));
    expect(find.text('1 Patient'), findsOneWidget);
    await press(t, labelled('Patient options Arthur Pendelton'));
    await press(t, 'Remove from my patients');
    expect(assignedPatients(h.app.store, 's-dc'), isEmpty);
    // A refused write is shown and nothing changes.
    h.app.store.fault = (op) => throw const StorageError(kStorageFull);
    await press(t, labelled('Patient options Arthur Pendelton'));
    await press(t, 'Assign to me');
    expect(find.text(kStorageFull), findsOneWidget);
    expect(assignedPatients(h.app.store, 's-dc'), isEmpty);
    h.app.store.fault = null;
    await done(t, h);

    final a = await onWard(t, who: 's-ad');
    await press(t, labelled('Patient options Arthur Pendelton'));
    expect(find.descendant(of: find.byType(Unavailable), matching: find.text('Assign to me')), findsOneWidget);
    await press(t, labelled('Close'));
    await press(t, find.descendant(of: find.byType(Unavailable), matching: find.text('Add')));
    expect(find.text('Admins can look at charts. Only nurses add records.'), findsOneWidget);
    expect(find.text('Add a record: choose the patient'), findsNothing);
    await done(t, a);
  });

  visual('verification needs both identifiers, each time', (t) async {
    final h = await onWard(t);
    await press(t, find.textContaining('Arthur Pendelton'));
    expect(find.byType(VerifyPatientScreen), findsOneWidget);
    expect(btn(t, 'Confirm Patient & Open Chart').onTap, isNull, reason: 'nothing is ticked at the start');
    await press(t, 'Name confirmed verbally & band');
    expect(btn(t, 'Confirm Patient & Open Chart').onTap, isNull);
    await press(t, 'Name confirmed verbally & band');
    await press(t, 'MRN matched on physical wristband');
    expect(btn(t, 'Confirm Patient & Open Chart').onTap, isNull);
    // Barcode: not supported, says so, verifies nothing.
    await press(t, 'Scan Wristband Barcode (Not Available)');
    expect(find.text('Barcode scanning is not available. Check the two identifiers by hand.'), findsOneWidget);
    expect(h.app.verifiedPatientId, isNull);
    await press(t, 'Name confirmed verbally & band');
    // A storage failure is shown; the patient is not verified and the ticks stay.
    h.app.store.fault = (op) => throw const StorageError(kStorageFailed);
    await press(t, 'Confirm Patient & Open Chart');
    expect(find.text(kStorageFailed), findsOneWidget);
    expect(h.app.verifiedPatientId, isNull);
    h.app.store.fault = null;
    await press(t, 'Confirm Patient & Open Chart');
    expect(h.app.verifiedPatientId, 'p-ap');
    expect(audits(h, 'patient_verified').single['entity'], 'patient/p-ap');
    expect(audits(h, 'patient_verified').single['user_id'], 's-sj');
    expect(find.byType(PatientSummaryScreen), findsOneWidget);
    // Back to the ward: the same patient opens, another one is checked again with nothing ticked.
    await t.binding.handlePopRoute();
    await settle(t);
    expect(find.byType(WardScreen), findsOneWidget);
    await press(t, find.textContaining('Maria Santos'));
    expect(find.byType(VerifyPatientScreen), findsOneWidget);
    expect(btn(t, 'Confirm Patient & Open Chart').onTap, isNull);
    await press(t, 'Name confirmed verbally & band');
    await press(t, 'MRN matched on physical wristband');
    await press(t, 'Confirm Patient & Open Chart');
    expect(h.app.verifiedPatientId, 'p-ms');
    await t.binding.handlePopRoute();
    await settle(t);
    await press(t, find.textContaining('Arthur Pendelton'));
    expect(find.byType(VerifyPatientScreen), findsOneWidget, reason: 'switching back needs a new check');
    await press(t, 'Go back to ward census');
    expect(find.byType(WardScreen), findsOneWidget);
    expect(h.app.verifiedPatientId, 'p-ms', reason: 'going back verifies nobody');
    await done(t, h);
  });

  visual('bedside verification sheet: same rules', (t) async {
    final h = await onWard(t);
    await press(t, labelled('open the bedside verification sheet'));
    expect(find.text('Bedside Verification'), findsOneWidget);
    expect(btn(t, 'Open Quick Vital Chart').onTap, isNull);
    await press(t, 'Name confirmed verbally and on band');
    expect(btn(t, 'Open Quick Vital Chart').onTap, isNull);
    await press(t, 'Cancel');
    expect(h.app.verifiedPatientId, isNull);
    await press(t, labelled('open the bedside verification sheet'));
    expect(btn(t, 'Open Quick Vital Chart').onTap, isNull, reason: 'a new sheet starts with nothing ticked');
    await press(t, 'Name confirmed verbally and on band');
    await press(t, 'MRN matched on physical wristband');
    await press(t, 'Open Quick Vital Chart');
    expect(h.app.verifiedPatientId, 'p-ap');
    expect(audits(h, 'patient_verified'), hasLength(1));
    await done(t, h);
  });

  visual('Add: choose a patient, verify, then the add page; Back goes to the ward', (t) async {
    final h = await onWard(t);
    await press(t, 'Add');
    expect(find.text('Add a record: choose the patient'), findsOneWidget);
    expect(find.byType(AddBedsideScreen), findsNothing);
    await press(t, labelled('Bed 414-A, James K. Wilson'));
    expect(find.byType(VerifyPatientScreen), findsOneWidget);
    await press(t, 'Name confirmed verbally & band');
    await press(t, 'MRN matched on physical wristband');
    await press(t, 'Confirm Patient & Open Chart');
    expect(h.app.verifiedPatientId, 'p-jw');
    expect(find.byType(AddBedsideScreen), findsOneWidget);
    expect(t.widget<AddBedsideScreen>(find.byType(AddBedsideScreen)).patientId, 'p-jw');
    await t.binding.handlePopRoute();
    await settle(t);
    expect(find.byType(VerifyPatientScreen), findsNothing);
    expect(find.byType(WardScreen), findsOneWidget);
    // Cancelled choice: nothing opens.
    await press(t, 'Add');
    await press(t, labelled('Close'));
    expect(find.byType(AddBedsideScreen), findsNothing);
    await done(t, h);
  });

  visual('lock: back to the PIN page, the verified patient is forgotten', (t) async {
    final h = await onWard(t);
    h.app.verifyPatient('p-ap', kIdentifiers);
    await settle(t);
    await press(t, labelled('lock or sign out'));
    await press(t, 'Lock');
    expect(find.byType(PinScreen), findsOneWidget);
    expect(find.text('Locked by you'), findsOneWidget);
    expect(h.app.verifiedPatientId, isNull);
    expect(() => h.app.ctx(), throwsA(isA<NotAllowedError>()));
    await pin(t, '2468');
    await press(t, 'Sign in to Ward 4B');
    expect(find.byType(WardScreen), findsOneWidget);
    await press(t, find.textContaining('Arthur Pendelton'));
    expect(find.byType(VerifyPatientScreen), findsOneWidget);
    // Idle lock, then somebody else takes the phone: the first person is signed out.
    h.app.lock('idle');
    await work(t);
    expect(find.text('Locked: nobody used it'), findsOneWidget);
    await press(t, labelled('Switch to another person'));
    expect(find.byType(SelectStaffScreen), findsOneWidget);
    await press(t, 'David Chen, RN');
    await press(t, 'Continue with David Chen, RN');
    await settle(t);
    expect(h.app.user, isNull);
    expect(find.byType(PinScreen), findsOneWidget);
    expect(t.widget<PinScreen>(find.byType(PinScreen)).staffId, 's-dc');
    expect(find.text('Enter digit 1 of 4'), findsOneWidget);
    await pin(t, '2468');
    await press(t, 'Sign in to Ward 4B');
    expect(h.app.user!.id, 's-dc');
    expect(find.byType(WardScreen), findsOneWidget);
    expect(h.app.verifiedPatientId, isNull);
    await done(t, h);
  });

  visual('sign out returns to the roster; an admin signs in to the admin pages', (t) async {
    final h = await onWard(t);
    await press(t, labelled('lock or sign out'));
    await press(t, 'Sign out');
    expect(h.app.user, isNull);
    expect(find.byType(SelectStaffScreen), findsOneWidget);
    expect(find.textContaining('Signed in 16:30'), findsOneWidget);
    await press(t, 'Kim Ellis');
    await press(t, 'Continue with Kim Ellis');
    await pin(t, '2468');
    await press(t, 'Sign in to Ward 4B');
    expect(h.app.user!.isAdmin, isTrue);
    expect(find.byType(WardScreen), findsNothing);
    Go.ward(ctxOf(t));
    await settle(t);
    expect(find.byType(WardScreen), findsOneWidget);
    expect(find.byType(ClinBridgeApp), findsOneWidget);
    await done(t, h);
  });
}
