import 'package:clinbridge_practice/state/app_state.dart';
import 'package:clinbridge_practice/ui/screens/entry_screens.dart';
import 'package:clinbridge_practice/ui/screens/ward_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/host.dart';
import '../support/shots.dart';

/// Page heights of the references at 390 dp.
const _tall = 1600 * 390 / 706, _ward = 1600 * 390 / 523, _verify = 1600 * 390 / 659;

Future<void> work(WidgetTester t) async {
  await real(t, () => Future<void>.delayed(const Duration(milliseconds: 50)));
  await settle(t);
}

Future<void> tapText(WidgetTester t, Finder f) async {
  await t.ensureVisible(f);
  await t.tap(f);
  await work(t);
}

/// Scrolls the page back to its start (taps scroll their target into view).
Future<void> top(WidgetTester t) async {
  for (final e in find.byType(Scrollable).evaluate()) {
    final s = (e as StatefulElement).state as ScrollableState;
    if (s.axisDirection == AxisDirection.down && s.position.hasContentDimensions) s.position.jumpTo(0);
  }
  await settle(t);
}

Finder labelled(String text) => find.byWidgetPredicate((w) => w is Semantics && (w.properties.label ?? '').contains(text));

/// The idle timers belong to the test's clock: stop them before the test ends.
Future<void> done(WidgetTester t, Harness h) async {
  await t.pumpWidget(const SizedBox());
  h.app.lockVault();
}

/// 360 and 430 dp wide phones and large text. Any overflow fails the test.
Future<void> widths(WidgetTester t, Harness h, String folder, Widget Function() home) async {
  await pumpPhone(t, h, home: home(), width: 360, height: 780);
  await shot(t, '$folder/w360');
  await pumpPhone(t, h, home: home(), width: 430, height: 932);
  await shot(t, '$folder/w430');
  await pumpPhone(t, h, home: home(), width: 360, height: 2400, textScale: 1.5);
  await shot(t, '$folder/text150');
  await pumpPhone(t, h, home: home(), width: 360, height: 640, textScale: 1.5);
}

void main() {
  visual('opening', (t) async {
    const d = 'clinbridge_opening_screen';
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const OpeningScreen());
    await shot(t, '$d/first');
    await pumpPhone(t, h, home: const OpeningScreen(), height: _tall);
    await shot(t, '$d/full');
    await widths(t, h, d, () => const OpeningScreen());
    await done(t, h);
  });

  visual('opening while checking, vault setup, locked, wrong passphrase, recovery, problem', (t) async {
    const d = 'clinbridge_staff_pin_sign_in';
    final h = Harness.make(seed: designSeed());
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const OpeningScreen());
    await shot(t, 'clinbridge_opening_screen/checking');
    await pumpPhone(t, h, home: const VaultScreen());
    await shot(t, '$d/vault_checking');
    await real(t, () => h.app.boot());
    await settle(t);
    await pumpPhone(t, h, home: const VaultScreen(), height: _tall);
    await shot(t, '$d/vault_setup');
    await widths(t, h, '$d/vault_setup', () => const VaultScreen());
    await real(t, () => h.app.createVault());
    h.app.lockVault();
    await pumpPhone(t, h, home: const VaultScreen(), height: _tall);
    await shot(t, '$d/vault_locked');
    await t.enterText(find.byType(TextField), 'not the passphrase');
    await tapText(t, find.text('Unlock records'));
    await shot(t, '$d/vault_wrong');
    await tapText(t, find.text('Use the recovery code instead'));
    await shot(t, '$d/vault_recovery');
    await widths(t, h, '$d/vault_locked', () => const VaultScreen());
    h.bridge.keystoreKey = null;
    final h2 = h.restart();
    await real(t, () => h2.app.boot());
    expect(h2.app.vaultStatus, VaultStatus.problem);
    await pumpPhone(t, h2, home: const VaultScreen(), height: _tall);
    await shot(t, '$d/vault_problem');
    await widths(t, h2, '$d/vault_problem', () => const VaultScreen());
    await done(t, h2);
    h.app.lockVault();
  });

  visual('select staff', (t) async {
    const d = 'clinbridge_select_staff';
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    await real(t, () => h.signIn('s-sj'));
    h.app.signOut();
    await pumpPhone(t, h, home: const SelectStaffScreen());
    await shot(t, '$d/none_selected');
    await tapText(t, find.text('Sarah Jenkins, RN'));
    await top(t);
    await shot(t, '$d/first');
    // The export's bar is pinned at 818 dp of its 884 dp page.
    await pumpPhone(t, h, home: const SelectStaffScreen(), height: 1482 * 390 / 706);
    await tapText(t, find.text('Sarah Jenkins, RN'));
    await top(t);
    await shot(t, '$d/full');
    await t.enterText(find.byType(TextField), 'zzz');
    await settle(t);
    await shot(t, '$d/no_results');
    await widths(t, h, d, () => const SelectStaffScreen());
    // Keyboard open on a small phone.
    await pumpPhone(t, h, home: const SelectStaffScreen(), width: 360, height: 640, textScale: 1.5);
    t.view.viewInsets = const FakeViewPadding(bottom: 560);
    await settle(t);
    await done(t, h);
  });

  visual('pin', (t) async {
    const d = 'clinbridge_staff_pin_sign_in';
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const PinScreen(staffId: 's-sj'), height: _tall);
    await shot(t, '$d/empty');
    Future<void> key(String n) async {
      await t.tap(find.text(n));
      await t.pump();
    }

    for (final n in ['1', '3', '5']) {
      await key(n);
    }
    await settle(t);
    await shot(t, '$d/full');
    await key('7');
    await settle(t);
    await shot(t, '$d/complete');
    await tapText(t, find.text('Sign in to Ward 4B'));
    await shot(t, '$d/pin_wrong');
    for (var i = 0; i < 4; i++) {
      for (final n in ['1', '3', '5', '7']) {
        await key(n);
      }
      await tapText(t, find.text('Sign in to Ward 4B'));
    }
    await shot(t, '$d/lockout');
    await pumpPhone(t, h, home: const PinScreen(staffId: 's-dc'));
    await shot(t, '$d/first');
    await widths(t, h, d, () => const PinScreen(staffId: 's-dc'));
    await real(t, () => h.signIn('s-dc'));
    h.app.lock('idle');
    await pumpPhone(t, h, home: const PinScreen(staffId: 's-dc'));
    await shot(t, '$d/locked_idle');
    await done(t, h);
  });

  visual('ward', (t) async {
    const d = 'clinbridge_my_patients_ward_4b';
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    await real(t, () => h.signIn('s-sj'));
    await pumpPhone(t, h, home: const WardScreen());
    await shot(t, '$d/first');
    await pumpPhone(t, h, home: const WardScreen(), height: _ward);
    await shot(t, '$d/full');
    await pumpPhone(t, h, home: const WardScreen());
    await tapText(t, labelled('open the bedside verification sheet'));
    await shot(t, '$d/modal');
    await tapText(t, find.text('Name confirmed verbally and on band'));
    await tapText(t, find.text('MRN matched on physical wristband'));
    await shot(t, '$d/modal_ticked');
    await tapText(t, find.text('Cancel'));
    await tapText(t, find.text('Add'));
    await shot(t, '$d/add_picker');
    await tapText(t, labelled('Close'));
    await tapText(t, labelled('Patient options Maria Santos'));
    await shot(t, '$d/options');
    await tapText(t, labelled('Close'));
    await tapText(t, labelled('lock or sign out'));
    await shot(t, '$d/session');
    await tapText(t, labelled('Close'));
    await t.enterText(find.byType(TextField), 'nobody');
    await settle(t);
    await shot(t, '$d/no_results');
    await widths(t, h, d, () => const WardScreen());
    for (final (w, s) in [(360.0, 1.5), (430.0, 1.0)]) {
      await pumpPhone(t, h, home: const WardScreen(), width: w, height: 700, textScale: s);
      await tapText(t, labelled('open the bedside verification sheet'));
      await tapText(t, labelled('Close'));
      await tapText(t, labelled('Patient options Arthur'));
      await tapText(t, labelled('Close'));
      await tapText(t, find.text('Add'));
      await tapText(t, labelled('Close'));
    }
    await done(t, h);
    final a = await real(t, () => designHarness());
    addTearDown(a.dispose);
    await real(t, () => a.signIn('s-ad'));
    await pumpPhone(t, a, home: const WardScreen());
    await shot(t, '$d/admin');
    await done(t, a);
  });

  visual('ward on the installed practice data', (t) async {
    final h = await real(t, () => Harness.make().ready());
    addTearDown(h.dispose);
    await real(t, () => h.signIn('pr-alvarez'));
    await pumpPhone(t, h, home: const WardScreen(), height: 2600);
    await shot(t, 'clinbridge_my_patients_ward_4b/practice_seed');
    await pumpPhone(t, h, home: const VerifyPatientScreen(patientId: 'pt-05'), height: _verify);
    await shot(t, 'clinbridge_verify_patient/practice_seed');
    await pumpPhone(t, h, home: const SelectStaffScreen(), height: _tall);
    await shot(t, 'clinbridge_select_staff/practice_seed');
    await pumpPhone(t, h, home: const PinScreen(staffId: 'pr-okafor'), width: 360);
    await shot(t, 'clinbridge_staff_pin_sign_in/practice_seed');
    await done(t, h);
  });

  visual('verify patient', (t) async {
    const d = 'clinbridge_verify_patient';
    final h = await real(t, () => designHarness());
    addTearDown(h.dispose);
    await real(t, () => h.signIn('s-sj'));
    await pumpPhone(t, h, home: const VerifyPatientScreen(patientId: 'p-ap'));
    await shot(t, '$d/first');
    await pumpPhone(t, h, home: const VerifyPatientScreen(patientId: 'p-ap'), height: _verify);
    await shot(t, '$d/unticked');
    await tapText(t, find.text('Name confirmed verbally & band'));
    await tapText(t, find.text('MRN matched on physical wristband'));
    await top(t);
    await shot(t, '$d/full');
    await pumpPhone(t, h, home: const VerifyPatientScreen(patientId: 'p-jw'), height: _verify);
    await shot(t, '$d/no_allergy');
    await widths(t, h, d, () => const VerifyPatientScreen(patientId: 'p-ap'));
    await done(t, h);
  });
}
