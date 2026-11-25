import 'dart:convert';

import 'package:clinbridge_practice/config/policy.dart';
import 'package:clinbridge_practice/core/clock.dart';
import 'package:clinbridge_practice/data/native.dart';
import 'package:clinbridge_practice/data/repos/ops.dart' as ops;
import 'package:clinbridge_practice/ui/screens/print_battery_screens.dart';
import 'package:clinbridge_practice/ui/screens/recovery_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/host.dart';
import '../support/shots.dart';

const _recovery = 'clinbridge_recovery_reconciliation_worklist';
const _export = 'clinbridge_admin_fhir_export_bundle';
const _print = 'clinbridge_offline_print_clipboard_backup';
const _battery = 'clinbridge_low_battery_air_gap_vault_emergency_freeze';

/// The design fixture with the outage declared between the 14:12 snapshot and the 14:15 reading, and a 14:13 entry time:
/// the time-conflict rule of the app itself then flags that reading.
String conflictSeed() {
  final d = jsonDecode(designSeed()) as Map<String, dynamic>;
  (d['downtime_event'] as List).first['declared_at'] = '2026-11-14T14:13:00-05:00';
  for (final e in d['entry'] as List) {
    if (e['id'] == 'de-011') e['entry_time'] = '2026-11-14T14:13:00-05:00';
  }
  // Counters in the order of the entry times, so only that one reading is flagged.
  final list = [...d['entry'] as List]..sort((a, b) => '${a['entry_time']}'.compareTo('${b['entry_time']}'));
  for (var i = 0; i < list.length; i++) {
    list[i]['counter'] = i + 1;
  }
  return jsonEncode(d);
}

Future<Harness> online({String? seed}) async {
  final h = await Harness.make(seed: seed ?? designSeed(), clock: PracticeClock(start: designNow, frozen: true)).ready();
  await h.signIn('s-ad');
  final r = await h.app.clearNetwork(h.app.ctx(), kNetworkChecklist, '2468');
  if (!r.ok) throw StateError('${r.error}');
  return h;
}

Future<Harness> seedOnline({String? fixture}) async {
  final h = await Harness.make(clock: PracticeClock(frozen: true), fixture: fixture).ready();
  await h.signIn('pr-ellis');
  return h;
}

/// Lets real files, fonts and isolates finish, then draws.
Future<void> work(WidgetTester t, [int rounds = 30]) async {
  for (var i = 0; i < rounds; i++) {
    await real(t, () => Future<void>.delayed(const Duration(milliseconds: 40)));
    await t.pump(const Duration(milliseconds: 20));
  }
}

/// Taps start the idle timers; close the records so that none is left.
Future<void> end(WidgetTester t, Harness h) async {
  await t.pumpWidget(const SizedBox());
  h.app.lockVault();
}

void main() {
  visual('recovery', (t) async {
    final h = await real(t, () => online(seed: conflictSeed()));
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const RecoveryScreen());
    await shot(t, '$_recovery/recovery_empty');
    await t.tap(find.text('Build list'));
    await settle(t);
    await t.pump(const Duration(seconds: 5));
    await settle(t);
    await shot(t, '$_recovery/first');
    await pumpPhone(t, h, home: const RecoveryScreen(), height: 1600 * 390 / 346);
    await shot(t, '$_recovery/full');
    await pumpPhone(t, h, home: const RecoveryScreen(), width: 360);
    await shot(t, '$_recovery/w360');
    await pumpPhone(t, h, home: const RecoveryScreen(), width: 430, height: 932);
    await shot(t, '$_recovery/w430');
    await pumpPhone(t, h, home: const RecoveryScreen(), textScale: 1.5, height: 2600);
    await shot(t, '$_recovery/text150');
    await pumpPhone(t, h, home: const RecoveryScreen());
    await t.ensureVisible(find.text('Keep Record (Reason Needed)').first);
    await settle(t);
    await t.tap(find.text('Keep Record (Reason Needed)').first);
    await settle(t);
    await t.tap(find.text('Keep record and sign off'));
    await settle(t);
    await shot(t, '$_recovery/recovery_reason_sheet');
    await end(t, h);
  });

  visual('recovery: seed, JSON, closed', (t) async {
    final h = await real(t, seedOnline);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const RecoveryScreen());
    await shot(t, '$_recovery/recovery_seed_first');
    await pumpPhone(t, h, home: const RecoveryScreen(), height: 2600);
    await shot(t, '$_recovery/recovery_seed');
    await t.drag(find.text('Waiting'), const Offset(-160, 0));
    await settle(t);
    await t.tap(find.text('Signed Off'));
    await settle(t);
    await shot(t, '$_recovery/recovery_signed');
    await t.tap(find.text('View JSON').first);
    await settle(t);
    await shot(t, '$_recovery/recovery_json');
    await end(t, h);
    final g = await real(t, designHarness);
    addTearDown(g.dispose);
    await real(t, () => g.signIn('s-ad'));
    await pumpPhone(t, g, home: const RecoveryScreen());
    await shot(t, '$_recovery/recovery_closed');
  });

  visual('export', (t) async {
    final h = await real(t, () => online(seed: conflictSeed()));
    addTearDown(h.dispose);
    await real(t, () async => ops.buildWorklist(h.app.ctx()));
    for (final w in h.app.store.all('worklist_item')) {
      ops.signOffItem(h.app.ctx(), w['id'] as String, reason: 'Checked against the paper');
    }
    h.app.saved();
    await pumpPhone(t, h, home: const ExportScreen());
    await work(t, 4);
    await shot(t, '$_export/first');
    await pumpPhone(t, h, home: const ExportScreen(), height: 1600 * 390 / 366);
    await work(t, 4);
    await shot(t, '$_export/full');
    await pumpPhone(t, h, home: const ExportScreen(), height: 2300);
    await work(t, 4);
    await shot(t, '$_export/long');
    for (final (w, hgt, sc, n) in [(360.0, 800.0, 1.0, 'w360'), (430.0, 932.0, 1.0, 'w430'), (390.0, 2800.0, 1.5, 'text150')]) {
      await pumpPhone(t, h, home: const ExportScreen(), width: w, height: hgt, textScale: sc);
      await work(t, 4);
      await shot(t, '$_export/$n');
    }
    await pumpPhone(t, h, home: const ExportScreen(), height: 2300);
    await work(t, 4);
    Future<void> save() async {
      await t.tap(find.textContaining('Download FHIR Bundle'));
      await settle(t);
      await shot(t, '$_export/export_confirm');
      await t.tap(find.text('Choose where to save'));
      await settle(t);
      await work(t, 4);
    }

    h.bridge.saveError = Exception('No space left on the chosen location');
    await save();
    await shot(t, '$_export/export_failed');
    h.bridge.saveError = null;
    h.bridge.saveCancelled = true;
    await save();
    await shot(t, '$_export/export_cancelled');
    h.bridge.saveCancelled = false;
    await save();
    await shot(t, '$_export/export_saved');
    await end(t, h);
  });

  visual('export: blocked, blockers, errors', (t) async {
    final g = await real(t, designHarness);
    addTearDown(g.dispose);
    await real(t, () => g.signIn('s-ad'));
    await pumpPhone(t, g, home: const ExportScreen());
    await work(t, 3);
    await shot(t, '$_export/export_blocked');
    await end(t, g);
    final h = await real(t, seedOnline);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const ExportScreen());
    await work(t, 4);
    await shot(t, '$_export/export_open_items');
    await end(t, h);
    // One stored row points to a staff member that is not in the list.
    final bad = jsonDecode(designSeed()) as Map<String, dynamic>;
    (bad['entry'] as List).first['performer_id'] = 's-unknown';
    final e = await real(t, () => online(seed: jsonEncode(bad)));
    addTearDown(e.dispose);
    await pumpPhone(t, e, home: const ExportScreen(), height: 2300);
    await work(t, 4);
    await shot(t, '$_export/export_errors');
  });

  visual('audit', (t) async {
    final h = await real(t, seedOnline);
    addTearDown(h.dispose);
    await pumpPhone(t, h, home: const AuditScreen());
    await shot(t, '$_recovery/audit');
    await pumpPhone(t, h, home: const AuditScreen(), width: 360);
    await shot(t, '$_recovery/audit_w360');
    await pumpPhone(t, h, home: const AuditScreen(), width: 430, height: 932);
    await shot(t, '$_recovery/audit_w430');
    await pumpPhone(t, h, home: const AuditScreen(), textScale: 1.5);
    await shot(t, '$_recovery/audit_text150');
  });

  visual('print', (t) async {
    final h = await real(t, designHarness);
    addTearDown(h.dispose);
    await real(t, () => h.signIn('s-sj'));
    h.app.verifyPatient('p-ap', ['Name', 'MRN']);
    Future<void> open(String name, {double width = 390, double height = 844, double scale = 1}) async {
      await pumpPhone(t, h, home: const PrintScreen(), width: width, height: height, textScale: scale);
      await work(t, 20);
      await settle(t);
      await shot(t, '$_print/$name');
    }

    await open('first');
    await open('full', height: 1600 * 390 / 389);
    await open('w360', width: 360);
    await open('w430', width: 430, height: 932);
    await open('text150', height: 3000, scale: 1.5);
    await open('long', height: 2200);
    h.bridge.printAvailable = false;
    await t.tap(find.textContaining('Print 2 Copies'));
    await work(t, 25);
    await settle(t);
    await shot(t, '$_print/print_no_service');
    h.bridge.printAvailable = true;
    await t.tap(find.textContaining('Print 2 Copies'));
    await work(t, 25);
    await settle(t);
    await shot(t, '$_print/print_sent');
    await t.tap(find.text('Full Ward Clipboard Packet'));
    await work(t, 40);
    await settle(t);
    await shot(t, '$_print/print_ward');
    await t.tap(find.text('Blank Emergency Downtime Kit'));
    await work(t, 25);
    await settle(t);
    await shot(t, '$_print/print_blank');
    await end(t, h);
  });

  visual('print: patient choice', (t) async {
    final h = await real(t, designHarness);
    addTearDown(h.dispose);
    await real(t, () => h.signIn('s-sj'));
    await pumpPhone(t, h, home: const PrintScreen());
    await work(t, 20);
    await t.tap(find.text('Emergency Bedside Packet'));
    await settle(t);
    await shot(t, '$_print/print_choose');
    await end(t, h);
  });

  visual('battery', (t) async {
    final h = await real(t, designHarness);
    addTearDown(h.dispose);
    await real(t, () => h.signIn('s-sj'));
    Future<void> open(String name, {double width = 390, double height = 844, double scale = 1}) async {
      await pumpPhone(t, h, home: const BatteryScreen(), width: width, height: height, textScale: scale);
      await work(t, 3);
      await shot(t, '$_battery/$name');
    }

    await open('battery_normal', height: 1400);
    // TEST CONDITION: 4 % and a store that refuses writes.
    h.bridge.batteryState = const BatteryState(4, false, low: true);
    h.app.store.readOnlyReason = 'Records are frozen for this drill.';
    await open('first');
    await open('full', height: 1600 * 390 / 502);
    await open('battery_frozen', height: 1400);
    await open('w360', width: 360);
    await open('w430', width: 430, height: 932);
    await open('text150', height: 2300, scale: 1.5);
    h.bridge.batteryState = null;
    await open('battery_unknown');
  });
}
