import 'dart:ffi';
import 'dart:io';

import 'package:clinbridge_practice/core/clock.dart';
import 'package:clinbridge_practice/data/ctx.dart';
import 'package:clinbridge_practice/data/native.dart';
import 'package:clinbridge_practice/state/app_state.dart';
import 'package:flutter/widgets.dart';
import 'package:sqlite3/open.dart';

/// Host tests run on real SQLCipher (Windows DLL, not in the repository). Set SQLCIPHER_HOST to its folder.
final String sqlcipherDir = Platform.environment['SQLCIPHER_HOST'] ?? (throw StateError('Set SQLCIPHER_HOST, see README.md'));
bool _loaded = false;

void useHostSqlcipher() {
  if (_loaded) return;
  _loaded = true;
  DynamicLibrary.open('$sqlcipherDir\\libcrypto-1_1-x64.dll');
  open.overrideFor(OperatingSystem.windows, () => DynamicLibrary.open('$sqlcipherDir\\sqlcipher.dll'));
}

String seedText() => File('assets/seed/downtimekit-seed.json').readAsStringSync();

class Harness {
  final Directory dir;
  final FakeBridge bridge;
  late final AppState app;
  DateTime wall = DateTime(2026, 11, 25, 10);
  Harness._(this.dir, this.bridge);

  static Harness make({String? fixture, Directory? dir, FakeBridge? bridge, PracticeClock? clock, String? seed}) {
    useHostSqlcipher();
    final d = dir ?? Directory.systemTemp.createTempSync('cb_mobile_');
    final h = Harness._(d, bridge ?? FakeBridge(d.path));
    h.app = AppState(native: h.bridge, seedLoader: () async => seed ?? seedText(), clock: clock ?? PracticeClock(), fixtureJson: fixture, vaultIterations: 1000, wallNow: () => h.wall);
    return h;
  }

  Future<Harness> ready() async {
    await app.boot();
    await app.createVault();
    return this;
  }

  Future<void> signIn(String id, {String pin = '2468'}) async {
    final r = await app.signIn(id, pin);
    if (!r.ok) throw StateError('sign-in failed: ${r.error}');
  }

  /// Verifies the patient as the screen does and returns a context for it.
  Ctx verified(String patientId) {
    app.verifyPatient(patientId, ['Name', 'MRN']);
    return app.ctx();
  }

  /// Process death: nothing is closed politely; a new app starts on the same files and the same phone key store.
  Harness restart() {
    final h = Harness._(dir, bridge)..wall = wall;
    h.app = AppState(native: bridge, seedLoader: () async => seedText(), clock: PracticeClock(), vaultIterations: 1000, wallNow: () => h.wall);
    return h;
  }

  void dispose() {
    WidgetsBinding.instance.removeObserver(app);
    app.lockVault();
    try {
      dir.deleteSync(recursive: true);
    } catch (_) {}
  }
}
