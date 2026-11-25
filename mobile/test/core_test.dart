import 'dart:io';
import 'dart:typed_data';

import 'package:clinbridge_practice/config/policy.dart';
import 'package:clinbridge_practice/core/clock.dart';
import 'package:clinbridge_practice/core/util.dart';
import 'package:clinbridge_practice/data/audit.dart';
import 'package:clinbridge_practice/data/ctx.dart';
import 'package:clinbridge_practice/data/native.dart';
import 'package:clinbridge_practice/data/repos/entries.dart';
import 'package:clinbridge_practice/data/repos/ops.dart';
import 'package:clinbridge_practice/data/schema.dart';
import 'package:clinbridge_practice/data/store.dart';
import 'package:clinbridge_practice/data/vault.dart';
import 'package:clinbridge_practice/domain/fhir.dart';
import 'package:clinbridge_practice/domain/meds.dart';
import 'package:clinbridge_practice/domain/vitals.dart';
import 'package:clinbridge_practice/state/app_state.dart';
import 'package:flutter/widgets.dart' show AppLifecycleState;
import 'package:flutter_test/flutter_test.dart';

import 'support/host.dart';

late Harness h;
Store get s => h.app.store;

Doc vit({num? hr = 88, num? pain}) => validateVitals(VitalsForm({if (hr != null) 'heart_rate': '$hr', if (pain != null) 'pain_0_10': '$pain'}, consciousness: 'Alert')).values;

Entry saveVitals(Ctx c, String p, {String? key, Doc? values, String? careTime, String? sup, String? why}) =>
    createEntry(c, type: 'vital_sign', patientId: p, careTime: careTime ?? c.clock.nowIso(), values: values ?? vit(), clientKey: key ?? newId('k'), supersedesId: sup, correctionReason: why);

ActiveOrder order(String id) => ActiveOrder(s.get('active_order', id)!);
bool chainOk() => verifyChain(s.all('audit_log')).ok;
Matcher throwsMsg(String part) => throwsA(isA<AppError>().having((e) => e.message, 'message', contains(part)));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() async => h = await Harness.make().ready());
  tearDown(() => h.dispose());

  group('encrypted store', () {
    test('first launch: cipher active, approved seed loaded, seed audit chain verifies', () {
      expect(s.cipherVersion, isNotEmpty);
      expect([s.count('patient'), s.count('practitioner'), s.count('entry'), s.count('worklist_item')], [10, 7, 49, 45]);
      final c = verifyChain(s.all('audit_log'));
      expect(c.ok, isTrue);
      expect(c.total, 153 + 2);
      expect(s.integrity(), 'ok');
      expect(s.cipherIntegrity(), isEmpty);
    });

    test('no patient text in any file, also while the journal is open, and after a photo', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-01');
      createEntry(c, type: 'note', patientId: 'pt-01', careTime: c.clock.nowIso(), values: {'category': 'assessment', 'text': 'UNIQUEPLAINTEXT-7731', 'score_name': null, 'score_value': null}, clientKey: newId('k'));
      savePhoto(c, patientId: 'pt-01', bytes: Uint8List.fromList('JPEGPLAIN-9921-JPEGPLAIN-9921'.codeUnits), mime: 'image/jpeg', check: {'form_type': 'vitals', 'readable': true, 'problem': 'none', 'overridden': false});
      void scan() {
        var files = 0;
        for (final f in h.dir.listSync(recursive: true).whereType<File>()) {
          files++;
          final t = String.fromCharCodes(f.readAsBytesSync());
          for (final w in ['UNIQUEPLAINTEXT-7731', 'JPEGPLAIN-9921', 'Rivera', 'DK-004512', 'amLODIPine', 'CREATE TABLE', 'SQLite format 3']) {
            expect(t.contains(w), isFalse, reason: '$w in ${f.path}');
          }
        }
        expect(files, greaterThanOrEqualTo(2));
      }

      scan(); // -wal present
      h.app.lockVault();
      scan();
      final env = File('${h.dir.path}/vault.json').readAsStringSync();
      expect(env.contains(kPracticePassphrase), isFalse);
    });

    test('wrong passphrase and wrong recovery code open nothing; the right ones do', () async {
      h.app.lockVault();
      await expectLater(h.app.unlockVault(passphrase: 'wrong words here'), throwsMsg('passphrase is not right'));
      await expectLater(h.app.unlockVault(recovery: 'AAAA'), throwsMsg('recovery code is not right'));
      expect(h.app.vaultStatus, VaultStatus.locked);
      await h.app.unlockVault(recovery: kPracticeRecoveryCode);
      expect(h.app.unlocked, isTrue);
      h.app.lockVault();
      await h.app.unlockVault(passphrase: '  practice  only fake patients ');
      expect(s.count('patient'), 10);
    });

    test('missing phone key or key file: reported, nothing deleted or replaced', () async {
      h.app.lockVault();
      final db = File('${h.dir.path}/practice.db').readAsBytesSync();
      final key = h.bridge.keystoreKey;
      h.bridge.keystoreKey = null;
      final r = h.restart();
      await r.app.boot();
      expect(r.app.vaultStatus, VaultStatus.problem);
      await expectLater(r.app.createVault(), throwsMsg('already exist'));
      await expectLater(r.app.unlockVault(passphrase: kPracticePassphrase), throwsMsg('missing'));
      h.bridge.keystoreKey = key;
      File('${h.dir.path}/vault.json').renameSync('${h.dir.path}/vault.bak');
      final r2 = h.restart();
      await r2.app.boot();
      expect(r2.app.vaultStatus, VaultStatus.problem);
      await expectLater(r2.app.createVault(), throwsMsg('already exist'));
      expect(File('${h.dir.path}/practice.db').readAsBytesSync(), db);
      File('${h.dir.path}/vault.bak').renameSync('${h.dir.path}/vault.json');
      await h.app.unlockVault(passphrase: kPracticePassphrase);
      expect(s.count('entry'), 49);
    });

    test('a changed database page is detected, not opened silently', () async {
      h.app.lockVault();
      final f = File('${h.dir.path}/practice.db');
      final b = f.readAsBytesSync();
      b[4096 * 3 + 100] ^= 0xff;
      f.writeAsBytesSync(b);
      Object? err;
      var bad = <String>[];
      try {
        await h.app.unlockVault(passphrase: kPracticePassphrase);
        bad = s.cipherIntegrity();
      } catch (e) {
        err = e;
      }
      expect(err != null || bad.isNotEmpty, isTrue);
    });

    test('newer schema is refused without changes; the same version opens again', () async {
      s.debugExec('PRAGMA user_version = 99');
      h.app.lockVault();
      final before = File('${h.dir.path}/practice.db').readAsBytesSync();
      await expectLater(h.app.unlockVault(passphrase: kPracticePassphrase), throwsMsg('newer version'));
      expect(File('${h.dir.path}/practice.db').readAsBytesSync(), before);
      expect(h.app.vaultStatus, VaultStatus.locked);
    });

    test('failed migration rolls back: nothing is created, the next opening migrates completely', () async {
      final d = Directory.systemTemp.createTempSync('cb_mig_');
      final key = List<int>.generate(32, (i) => i);
      useHostSqlcipher();
      // A table with an index name of the migration already there makes the migration fail in the middle.
      final raw = Store.open('${d.path}/x.db', key);
      for (final t in ['ix_note_entry_id', 'ux_audit_seq']) {
        raw.debugExec('DROP INDEX $t');
      }
      raw.debugExec('CREATE TABLE ux_audit_seq (a)');
      raw.debugExec('PRAGMA user_version = 0');
      raw.close();
      expect(() => Store.open('${d.path}/x.db', key), throwsA(anything));
      final again = Store.openRaw('${d.path}/x.db', key);
      expect(again.debugSelect("SELECT count(*) FROM sqlite_master WHERE name = 'ix_note_entry_id'"), 0);
      again.debugExec('DROP TABLE ux_audit_seq');
      for (final t in again.debugNames("type = 'trigger'")) {
        again.debugExec('DROP TRIGGER $t');
      }
      again.debugExec('DROP INDEX IF EXISTS ux_entry_counter');
      again.close();
      final ok = Store.open('${d.path}/x.db', key);
      expect(ok.debugSelect("SELECT count(*) FROM sqlite_master WHERE name = 'ix_note_entry_id'"), 1);
      ok.close();
      d.deleteSync(recursive: true);
    });

    test('interrupted first-time seed: nothing half loaded, next unlock loads it completely', () async {
      final d = Directory.systemTemp.createTempSync('cb_half_');
      final b = FakeBridge(d.path);
      final a = Harness.make(dir: d, bridge: b, seed: '{"_meta":{"warning":"fake"},"patient":[{"id":"x"},{"id":"x"}]}');
      await a.app.boot();
      await expectLater(a.app.createVault(), throwsA(anything));
      expect(a.app.unlocked, isFalse);
      final r = Harness.make(dir: d, bridge: b);
      await r.app.boot();
      expect(r.app.vaultStatus, VaultStatus.locked);
      await r.app.unlockVault(passphrase: kPracticePassphrase);
      expect(r.app.store.count('patient'), 10);
      r.dispose();
    });

    test('a file that is not marked fake is never loaded', () async {
      final a = Harness.make(seed: '{"_meta":{"warning":"hospital data"},"patient":[]}');
      await a.app.boot();
      await expectLater(a.app.createVault(), throwsMsg('fake practice data'));
      a.dispose();
    });

    test('a second "create" while the first one runs changes nothing; the vault opens again', () async {
      final d = Directory.systemTemp.createTempSync('cb_two_');
      final a = Harness.make(dir: d);
      await a.app.boot();
      final one = a.app.createVault();
      final two = a.app.createVault();
      await one;
      await expectLater(two, throwsMsg('already exist'));
      a.app.lockVault();
      await a.app.unlockVault(passphrase: kPracticePassphrase);
      expect(a.app.store.count('patient'), 10);
      a.dispose();
      // Two vault objects at the same time (two app instances): the second never replaces the first envelope.
      final d2 = Directory.systemTemp.createTempSync('cb_two_');
      final b = FakeBridge(d2.path);
      final v1 = Vault(b, d2.path), v2 = Vault(b, d2.path);
      final r = await Future.wait([for (final v in [v1, v2]) v.create(passphrase: 'a', recovery: 'b', iterations: 10).then((_) => true, onError: (_) => false)]);
      expect(r.where((x) => x).length, 1);
      (await v1.open(passphrase: 'a')).close();
      d2.deleteSync(recursive: true);
    });

    test('records file missing after it was complete: reported, nothing is created in its place', () async {
      h.app.lockVault();
      for (final f in h.dir.listSync().whereType<File>().where((f) => f.path.contains('practice.db'))) {
        f.renameSync('${f.path}.away');
      }
      final r = h.restart();
      await r.app.boot();
      expect(r.app.vaultStatus, VaultStatus.problem);
      await expectLater(r.app.unlockVault(passphrase: kPracticePassphrase), throwsMsg('missing'));
      expect(File('${h.dir.path}/practice.db').existsSync(), isFalse);
      for (final f in h.dir.listSync().whereType<File>().where((f) => f.path.endsWith('.away'))) {
        f.renameSync(f.path.replaceFirst('.away', ''));
      }
      await h.app.unlockVault(passphrase: kPracticePassphrase);
      expect(s.count('entry'), 49);
    });

    test('storage refuses writes: unlock and sign-in still work for reading; charts need their audit row', () async {
      h.app.lockVault();
      // The store object is new after each unlock: make it read-only right after opening.
      await h.app.unlockVault(passphrase: kPracticePassphrase);
      s.fault = (_) => throw const StorageError(kStorageFull);
      expect((await h.app.signIn('pr-okafor', kPracticePin)).ok, isTrue);
      expect(s.lastStorageError, kStorageFull);
      expect(() => h.app.verifyPatient('pt-01', ['Name', 'MRN']), throwsA(isA<StorageError>()));
      expect((await h.app.signIn('pr-alvarez', '0000')).lockedFor, SecurityPolicy.pinLockout, reason: 'a try that can not be counted locks at once');
      expect((await h.app.signIn('pr-alvarez', kPracticePin)).ok, isFalse);
      s.fault = null;
      h.app.verifyPatient('pt-01', ['Name', 'MRN']);
      expect(s.lastStorageError, isNull);
    });

    test('append-only: the database refuses to rewrite the audit log or delete an entry', () {
      expect(() => s.tx(() => s.update('audit_log', 'au-0001', {'action': 'x'})), throwsA(anything));
      expect(() => s.tx(() => s.delete('audit_log', 'au-0001')), throwsA(anything));
      expect(() => s.tx(() => s.delete('entry', 'e-001')), throwsA(anything));
      expect(chainOk(), isTrue);
    });
  });

  group('PIN, roles, lock', () {
    test('wrong PIN counts, locks after 5, survives restart, opens after the time', () async {
      for (var i = 4; i >= 1; i--) {
        final r = await h.app.signIn('pr-okafor', '0000');
        expect(r.error, 'Wrong PIN · $i tries left');
      }
      expect((await h.app.signIn('pr-okafor', '0000')).lockedFor, SecurityPolicy.pinLockout);
      expect((await h.app.signIn('pr-okafor', kPracticePin)).ok, isFalse, reason: 'right PIN during lockout');
      h.app.lockVault();
      final r = h.restart();
      await r.app.boot();
      await r.app.unlockVault(passphrase: kPracticePassphrase);
      expect((await r.app.signIn('pr-okafor', kPracticePin)).ok, isFalse);
      r.wall = r.wall.subtract(const Duration(days: 2)); // phone clock turned back: wait is still at most the policy
      expect(r.app.pinLockedFor('pr-okafor'), SecurityPolicy.pinLockout);
      r.wall = r.wall.add(const Duration(days: 2, seconds: 61));
      expect((await r.app.signIn('pr-okafor', kPracticePin)).ok, isTrue);
      r.app.lockVault();
      await h.app.unlockVault(passphrase: kPracticePassphrase);
    });

    test('parallel wrong PINs can not slip past the lockout', () async {
      await Future.wait([for (var i = 0; i < 8; i++) h.app.signIn('pr-okafor', '0000')]);
      expect(h.app.pinLockedFor('pr-okafor'), greaterThan(Duration.zero));
      expect((await h.app.signIn('pr-okafor', kPracticePin)).ok, isFalse);
    });

    test('partial failures also survive restart', () async {
      await h.app.signIn('pr-okafor', '0000');
      await h.app.signIn('pr-okafor', '0000');
      h.app.lockVault();
      final r = h.restart();
      await r.app.boot();
      await r.app.unlockVault(passphrase: kPracticePassphrase);
      expect((await r.app.signIn('pr-okafor', '0000')).triesLeft, 2);
      r.app.lockVault();
      await h.app.unlockVault(passphrase: kPracticePassphrase);
    });

    test('switched-off account can not sign in', () async => expect((await h.app.signIn('pr-nguyen', kPracticePin)).ok, isFalse));

    test('nobody signed in: no context; admin can not chart; nurse can not do admin work', () async {
      expect(() => h.app.ctx(), throwsA(isA<NotAllowedError>()));
      await h.signIn('pr-ellis');
      final c = h.verified('pt-01');
      expect(() => saveVitals(c, 'pt-01'), throwsMsg('Only nurses'));
      await h.signIn('pr-okafor');
      expect(() => startPracticeOutage(h.app.ctx()), throwsMsg('Only an admin'));
      expect(() => recordExport(h.app.ctx(), '{}', 'x'), throwsMsg('Only an admin'));
      expect(() => setChecklistItem(h.app.ctx(), eventId: 'x', itemId: 'y', done: true), throwsMsg('Only an admin'));
    });

    test('lock, sign-out, account change and vault lock invalidate an open context and the verified patient', () async {
      await h.signIn('pr-okafor');
      var c = h.verified('pt-01');
      h.app.lock();
      expect(() => saveVitals(c, 'pt-01'), throwsA(isA<StaleContextError>()));
      await h.signIn('pr-okafor');
      expect(h.app.verifiedPatientId, isNull);
      c = h.verified('pt-01');
      await h.signIn('pr-alvarez');
      expect(h.app.verifiedPatientId, isNull, reason: 'account change without a lock');
      expect(() => saveVitals(c, 'pt-01'), throwsA(isA<StaleContextError>()));
      c = h.verified('pt-01');
      h.app.lockVault();
      expect(() => saveVitals(c, 'pt-01'), throwsA(isA<AppError>()));
      await h.app.unlockVault(passphrase: kPracticePassphrase);
      expect(h.app.user, isNull);
      expect(s.count('entry'), 49);
    });

    test('an admin context from before a lock does no admin work', () async {
      await h.signIn('pr-ellis');
      final c = h.app.ctx();
      h.app.lock();
      expect(() => buildWorklist(c), throwsA(isA<StaleContextError>()));
      expect(() => startPracticeOutage(c), throwsA(isA<StaleContextError>()));
      expect(() => signOffItem(c, 'wl-011', reason: 'x'), throwsA(isA<StaleContextError>()));
    });

    test('away from the app: content covered; 5 min locks the person; 60 min locks the records', () async {
      await h.signIn('pr-okafor');
      h.app.didChangeAppLifecycleState(AppLifecycleState.inactive);
      expect(h.app.covered, isTrue);
      h.wall = h.wall.add(const Duration(minutes: 1));
      h.app.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect([h.app.covered, h.app.locked], [false, false]);
      h.app.didChangeAppLifecycleState(AppLifecycleState.paused);
      h.wall = h.wall.add(const Duration(minutes: 6));
      h.app.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect(h.app.locked, isTrue);
      h.app.didChangeAppLifecycleState(AppLifecycleState.paused);
      h.wall = h.wall.add(const Duration(minutes: 61));
      h.app.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect(h.app.vaultStatus, VaultStatus.locked);
      await h.app.unlockVault(passphrase: kPracticePassphrase);
    });
  });

  group('patient context', () {
    test('two identifiers are required and audited; another patient or a stale one is refused', () async {
      await h.signIn('pr-okafor');
      expect(() => h.app.verifyPatient('pt-01', ['Name']), throwsMsg('two identifiers'));
      final c = h.verified('pt-01');
      expect(s.lastAudit()!['action'], 'patient_verified');
      expect(s.lastAudit()!['entity'], 'patient/pt-01');
      expect(() => saveVitals(c, 'pt-02'), throwsA(isA<StaleContextError>()));
      h.verified('pt-02');
      expect(() => saveVitals(c, 'pt-01'), throwsA(isA<StaleContextError>()));
      h.app.leavePatient();
      expect(() => saveVitals(h.app.ctx(), 'pt-02'), throwsA(isA<StaleContextError>()));
      expect(s.count('entry'), 49);
    });

    test('an order of another patient is refused', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-02');
      final o = order('ord-01'); // pt-01
      final v = validateMed(MedForm.fromOrder(o, 'administered'), o, null).values;
      expect(() => createEntry(c, type: 'med_admin', patientId: 'pt-02', careTime: c.clock.nowIso(), values: v, clientKey: newId('k')), throwsMsg('another patient'));
    });
  });

  group('saving', () {
    test('blank stays not assessed, zero stays zero', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-01');
      final e = saveVitals(c, 'pt-01', values: vit(hr: null, pain: 0));
      final v = VitalSign(s.where('vital_sign', 'entry_id', e.id).first);
      expect(v.pain, 0);
      expect(v.heartRate, isNull);
      expect(validateVitals(const VitalsForm({})).ok, isFalse);
      expect(validateVitals(const VitalsForm({'bp_systolic': '120'})).errors['bp_diastolic'], isNotNull);
      expect(validateVitals(const VitalsForm({'spo2': '101'})).errors['spo2'], isNotNull);
      expect(validateVitals(const VitalsForm({'heart_rate': '40'})).warnings['heart_rate'], isNotNull);
      expect(validateVitals(const VitalsForm({'heart_rate': '40'})).ok, isTrue, reason: 'warnings never block');
    });

    test('same key twice = one record; audit chain holds', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-01');
      final k = newId('k');
      expect(saveVitals(c, 'pt-01', key: k).id, saveVitals(c, 'pt-01', key: k).id);
      expect(s.count('entry'), 50);
      expect(chainOk(), isTrue);
    });

    test('every point of failure leaves no trace, and the retry saves exactly once', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-01');
      final ops = <String>[];
      s.fault = ops.add;
      saveVitals(c, 'pt-01');
      s.fault = null;
      expect(ops.last, 'commit');
      final before = [s.count('entry'), s.count('vital_sign'), s.count('audit_log'), s.count('m_entry_key')];
      for (var i = 0; i < ops.length; i++) {
        var n = 0;
        s.fault = (_) {
          if (n++ == i) throw const StorageError(kStorageFull);
        };
        final k = newId('k');
        expect(() => saveVitals(c, 'pt-01', key: k), throwsA(isA<StorageError>()), reason: ops[i]);
        s.fault = null;
        expect([s.count('entry'), s.count('vital_sign'), s.count('audit_log'), s.count('m_entry_key')], before, reason: ops[i]);
      }
      final k = newId('k');
      saveVitals(c, 'pt-01', key: k);
      saveVitals(c, 'pt-01', key: k);
      expect(s.count('entry'), before[0] + 1);
      expect(chainOk(), isTrue);
    });

    test('process death in the middle of a transaction: last committed state is there', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-01');
      final e = saveVitals(c, 'pt-01', values: vit(hr: 81));
      // A copy of the files as they are on disk while a transaction is open = what a killed process leaves behind.
      late Directory snap;
      s.fault = (op) {
        if (op == 'commit') {
          snap = Directory.systemTemp.createTempSync('cb_kill_');
          for (final f in h.dir.listSync().whereType<File>()) {
            if (!f.path.endsWith('-shm')) f.copySync('${snap.path}/${f.uri.pathSegments.last}');
          }
          throw const StorageError('killed');
        }
      };
      expect(() => saveVitals(c, 'pt-01', values: vit(hr: 99)), throwsA(isA<StorageError>()));
      s.fault = null;
      final r = Harness.make(dir: snap, bridge: FakeBridge(snap.path)..keystoreKey = h.bridge.keystoreKey);
      await r.app.boot();
      await r.app.unlockVault(passphrase: kPracticePassphrase);
      expect(VitalSign(r.app.store.where('vital_sign', 'entry_id', e.id).first).heartRate, 81);
      expect(r.app.store.count('entry'), 50);
      expect(verifyChain(r.app.store.all('audit_log')).ok, isTrue);
      r.dispose();
    });

    test('read-only after a storage failure or freeze: writes refused, reading works', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-01');
      s.readOnlyReason = 'Frozen for the test.';
      expect(() => saveVitals(c, 'pt-01'), throwsMsg('Frozen'));
      expect(s.count('entry'), 49);
      s.readOnlyReason = null;
    });

    test('correction: new entry, old kept with its values, reason required, same patient and kind', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-01');
      final a = saveVitals(c, 'pt-01', values: vit(hr: 81));
      expect(() => saveVitals(c, 'pt-01', sup: a.id, why: ' '), throwsMsg('reason'));
      final b = saveVitals(c, 'pt-01', values: vit(hr: 83), sup: a.id, why: 'Typed wrong');
      expect(Entry(s.get('entry', a.id)!).status, 'corrected');
      expect(VitalSign(s.where('vital_sign', 'entry_id', a.id).first).heartRate, 81);
      expect(versionChain(s, a.id).map((x) => x.entry.id), [a.id, b.id]);
      expect(() => saveVitals(c, 'pt-01', sup: a.id, why: 'again'), throwsMsg('confirmed'));
      markEnteredInError(c, b.id, 'Wrong patient');
      expect(() => markEnteredInError(c, b.id, 'x'), throwsMsg('confirmed'));
      expect(chainOk(), isTrue);
    });

    test('future care time refused; counters are unique and rising; clock never goes back', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-01');
      expect(() => saveVitals(c, 'pt-01', careTime: PracticeClock.toIso(c.clock.now() + 3600000)), throwsMsg('future'));
      final a = saveVitals(c, 'pt-01'), b = saveVitals(c, 'pt-01');
      expect(b.counter, a.counter + 1);
      final t = h.app.clock.now();
      h.app.clock.advanceTo(t - 100000);
      expect(h.app.clock.now(), greaterThanOrEqualTo(t));
      h.app.lockVault();
      final r = h.restart();
      await r.app.boot();
      await r.app.unlockVault(passphrase: kPracticePassphrase);
      expect(r.app.clock.now(), greaterThanOrEqualTo(ms(b.entryTime)));
      expect(r.app.store.get('entry', b.id), isNotNull);
      r.app.lockVault();
      await h.app.unlockVault(passphrase: kPracticePassphrase);
    });

    test('drafts belong to one person; photos keep their hash', () async {
      await h.signIn('pr-okafor');
      var c = h.verified('pt-01');
      saveDraft(c, id: 'd1', kind: 'vitals', patientId: 'pt-01', payload: {'raw': {'heart_rate': '7'}});
      final ref = savePhoto(c, patientId: 'pt-01', bytes: Uint8List.fromList([1, 2, 3]), mime: 'image/jpeg', check: {'readable': true});
      expect(verifyPhoto(s, ref), isTrue);
      expect(() => s.tx(() => s.update('m_photo', ref, {'sha256': 'x'})), throwsA(anything));
      expect(() => savePhoto(c, patientId: 'pt-01', bytes: Uint8List(1), mime: 'text/plain', check: const {}), throwsMsg('picture'));
      await h.signIn('pr-alvarez');
      expect(getDraft(s, 'd1', 'pr-alvarez'), isNull);
      c = h.verified('pt-01');
      expect(() => discardDraft(c, 'd1'), throwsMsg('another person'));
    });
  });

  group('medicines', () {
    Future<(Ctx, ActiveOrder, Doc)> hydro() async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-07');
      final o = order('ord-18');
      return (c, o, validateMed(MedForm.fromOrder(o, 'administered'), o, null).values);
    }

    Entry save(Ctx c, Doc v, {String? att, String? key, String? care}) => createEntry(c, type: 'med_admin', patientId: 'pt-07', careTime: care ?? c.clock.nowIso(), values: v, clientKey: key ?? newId('k'), attestationId: att);

    test('high-alert dose: nothing is saved without a valid second nurse', () async {
      final (c, _, v) = await hydro();
      expect(() => save(c, v), throwsMsg('second nurse'));
      expect(() => save(c, {...v, 'double_checked': true, 'double_checked_by': 'pr-park'}), throwsMsg('second nurse'), reason: 'fields alone do not count');
      expect(s.count('med_admin'), 18);
    });

    test('valid co-sign saves once with both people; the check can not be used twice', () async {
      final (c, _, v) = await hydro();
      final t = c.clock.nowIso();
      final (r, att) = await h.app.cosign(c, witnessId: 'pr-park', pin: kPracticePin, patientId: 'pt-07', careTime: t, values: v, checklist: ['a']);
      expect(r.ok, isTrue);
      final k = newId('k');
      final e = save(c, v, att: att, key: k, care: t);
      expect(save(c, v, att: att, key: k, care: t).id, e.id);
      final m = MedAdmin(s.where('med_admin', 'entry_id', e.id).first);
      expect([m.doubleChecked, m.doubleCheckedBy, e.performerId], [true, 'pr-park', 'pr-okafor']);
      expect(() => save(c, v, att: att, care: t), throwsA(isA<AppError>()));
      expect(s.count('med_admin'), 19);
      expect(chainOk(), isTrue);
    });

    test('wrong PIN, self-sign, LPN, admin, switched-off: no attestation', () async {
      final (c, _, v) = await hydro();
      final t = c.clock.nowIso();
      Future<(PinResult, String?)> sign(String w, String pin) => h.app.cosign(c, witnessId: w, pin: pin, patientId: 'pt-07', careTime: t, values: v, checklist: const []);
      expect((await sign('pr-park', '1111')).$2, isNull);
      expect((await sign('pr-okafor', kPracticePin)).$2, isNull);
      await expectLater(sign('pr-whitfield', kPracticePin), throwsMsg('cannot be the second checker'));
      await expectLater(sign('pr-ellis', kPracticePin), throwsMsg('cannot be the second checker'));
      expect((await sign('pr-nguyen', kPracticePin)).$1.ok, isFalse);
      for (var i = 0; i < 4; i++) {
        await sign('pr-park', '1111');
      }
      expect((await sign('pr-park', kPracticePin)).$1.lockedFor, greaterThan(Duration.zero));
      expect(s.count('m_attestation'), 0);
    });

    test('anything changed after the check is refused', () async {
      final (c, _, v) = await hydro();
      final t = c.clock.nowIso();
      final (_, att) = await h.app.cosign(c, witnessId: 'pr-park', pin: kPracticePin, patientId: 'pt-07', careTime: t, values: v, checklist: const ['a']);
      expect(() => save(c, {...v, 'dose_given': 1}, att: att, care: t), throwsMsg('changed after the second check'));
      expect(() => save(c, v, att: att, care: PracticeClock.toIso(ms(t) - 60000)), throwsMsg('changed after the second check'));
      expect(s.count('med_admin'), 18);
    });

    test('the core itself refuses a self-check, and a used check on an infusion too', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-05');
      final o = order('ord-12');
      final v = validateMed(const MedForm(event: 'rate_changed', rate: '1100', rateUnit: 'units/h'), o, 1150).values;
      final t = c.clock.nowIso();
      expect(() => recordAttestation(c, witnessId: 'pr-okafor', outcome: 'given', patientId: 'pt-05', careTime: t, values: v, checklist: const []), throwsMsg('different nurse'));
      final att = recordAttestation(c, witnessId: 'pr-park', outcome: 'given', patientId: 'pt-05', careTime: t, values: v, checklist: const []);
      Entry rate() => createEntry(c, type: 'med_admin', patientId: 'pt-05', careTime: t, values: v, clientKey: newId('k'), attestationId: att);
      rate();
      expect(rate, throwsMsg('already used'));
      expect(currentRate(o, listPatientEntries(s, 'pt-05')), (1100, 'units/h'));
    });

    test('declined check saves no dose; account change after the check is refused', () async {
      final (c, _, v) = await hydro();
      final t = c.clock.nowIso();
      final d = recordAttestation(c, witnessId: 'pr-park', outcome: 'declined', patientId: 'pt-07', careTime: t, values: v, checklist: const [], reason: 'Rate differs');
      expect(() => save(c, v, att: d, care: t), throwsMsg('second nurse'));
      final (_, att) = await h.app.cosign(c, witnessId: 'pr-park', pin: kPracticePin, patientId: 'pt-07', careTime: t, values: v, checklist: const []);
      await h.signIn('pr-alvarez');
      final c2 = h.verified('pt-07');
      expect(() => save(c2, v, att: att, care: t), throwsMsg('changed after the second check'), reason: 'other primary nurse');
      expect(s.count('med_admin'), 18);
    });

    test('dose locks: same slot, order interval, seeded hold – in the list and again in the save', () async {
      await h.signIn('pr-okafor');
      var c = h.verified('pt-01');
      final am = order('ord-01');
      final v = validateMed(MedForm.fromOrder(am, 'administered'), am, null).values;
      final slot = slotsForDay(am, c.clock.nowIso()).first;
      expect(() => createEntry(c, type: 'med_admin', patientId: 'pt-01', careTime: c.clock.nowIso(), scheduledTime: slot, values: v, clientKey: newId('k')), throwsA(isA<DoseLockedError>()));
      c = h.verified('pt-04');
      final ac = order('ord-10'); // last given 07:25, every 6 hours, now 13:20
      final av = validateMed(MedForm.fromOrder(ac, 'administered'), ac, null).values;
      expect(doseLocks(s, ac, listPatientEntries(s, 'pt-04'), careTime: '2026-11-14T13:20:00-05:00').single.kind, 'interval');
      expect(doseLocks(s, ac, listPatientEntries(s, 'pt-04'), careTime: '2026-11-14T13:25:00-05:00'), isEmpty);
      expect(() => createEntry(c, type: 'med_admin', patientId: 'pt-04', careTime: '2026-11-14T13:20:00-05:00', values: av, clientKey: newId('k')), throwsA(isA<DoseLockedError>()));
      s.tx(() => s.put('m_order_hold', {'id': 'h1', 'order_id': 'ord-11', 'title': 'Order on hold', 'reason': 'test', 'released_at': null}));
      final cef = order('ord-11');
      expect(doseLocks(s, cef, const [], careTime: c.clock.nowIso()).first.kind, 'hold');
      expect(doseLocks(s, cef, const [], careTime: c.clock.nowIso(), event: 'held'), isEmpty);
      expect(s.count('med_admin'), 18);
    });

    test('a scheduled dose always names its due time; a waiting draft holds its slot; a draft can be put aside and is never exported', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-01');
      final o = order('ord-02'); // 09:00 recorded, 21:00 open
      final v = validateMed(MedForm.fromOrder(o, 'administered'), o, null).values;
      final slot = slotsForDay(o, c.clock.nowIso())[1];
      Entry give({String? at, String status = 'confirmed', String? key}) => createEntry(c, type: 'med_admin', patientId: 'pt-01', careTime: c.clock.nowIso(), scheduledTime: at, values: v, clientKey: key ?? newId('k'), status: status);
      expect(() => give(), throwsA(isA<DoseLockedError>().having((e) => e.locks.first.title, 'title', 'Choose the due time')));
      final k = newId('k');
      final d = give(at: slot, status: 'draft', key: k);
      expect(() => give(at: slot), throwsA(isA<DoseLockedError>()), reason: 'the draft holds the slot');
      expect(() => give(at: slot, key: k), throwsMsg('saved as a draft before'), reason: 'never reported as saved');
      markEnteredInError(c, d.id, 'Not given');
      expect(prepareExport(s, h.app.nowIso).json.contains(d.id), isFalse);
      expect(prepareExport(s, h.app.nowIso).json.contains('e-042'), isTrue, reason: 'a confirmed record marked as a mistake stays in the file');
      expect(give(at: slot).isConfirmed, isTrue);
      expect(() => createEntry(c, type: 'med_admin', patientId: 'pt-01', careTime: c.clock.nowIso(), values: {...v, 'order_id': 'ord-99'}, clientKey: newId('k')), throwsMsg('order of this record was not found'));
      expect(validateMed(const MedForm(event: 'rate_changed', rate: '12', rateUnit: 'mL/h'), order('ord-12'), 1150).warnings.single, contains('different from the order'));
    });

    test('a hold stops a higher rate, not a lower one; a second held record for the same time is refused', () async {
      await h.signIn('pr-okafor');
      final c = h.verified('pt-05');
      final o = order('ord-12'); // current 1150 units/h
      s.tx(() => s.put('m_order_hold', {'id': 'h1', 'order_id': 'ord-12', 'title': 'Order on hold', 'reason': 'test', 'released_at': null}));
      final t = c.clock.nowIso();
      Entry rate(String r) {
        final v = validateMed(MedForm(event: 'rate_changed', rate: r, rateUnit: 'units/h'), o, 1150).values;
        final att = recordAttestation(c, witnessId: 'pr-park', outcome: 'given', patientId: 'pt-05', careTime: t, values: v, checklist: const []);
        return createEntry(c, type: 'med_admin', patientId: 'pt-05', careTime: t, values: v, clientKey: newId('k'), attestationId: att);
      }

      expect(() => rate('1200'), throwsA(isA<DoseLockedError>()));
      expect(rate('0').isConfirmed, isTrue);
      final c3 = h.verified('pt-03');
      final f = order('ord-08'); // 09:00 already held
      final v = validateMed(const MedForm(event: 'held', reason: 'again'), f, null).values;
      expect(() => createEntry(c3, type: 'med_admin', patientId: 'pt-03', careTime: c3.clock.nowIso(), scheduledTime: slotsForDay(f, t).first, values: v, clientKey: newId('k')), throwsA(isA<DoseLockedError>()));
    });

    test('high-alert draft of the seed needs the second nurse to be confirmed', () async {
      final (c, _, _) = await hydro();
      final m = {...s.where('med_admin', 'entry_id', 'e-049').first}
        ..remove('id')
        ..remove('entry_id');
      expect(() => confirmDraft(c, 'e-049', m), throwsMsg('second nurse'));
      final e = Entry(s.get('entry', 'e-049')!);
      final (_, att) = await h.app.cosign(c, witnessId: 'pr-park', pin: kPracticePin, patientId: 'pt-07', careTime: e.careTime, scheduledTime: e.scheduledTime, values: m, checklist: const []);
      expect(confirmDraft(c, 'e-049', m, attestationId: att).isConfirmed, isTrue);
      expect(() => confirmDraft(c, 'e-049', m, attestationId: att), throwsMsg('already handled'));
    });

    test('drug rules: list matches, dose text', () {
      expect(isHighAlert('Heparin Sodium'), isTrue);
      expect(needsSecondNurse('heparin', 'held'), isFalse);
      expect(isHighAlert('amLODIPine'), isFalse);
      expect([formatDose(5.0), formatDose(0.5), formatDose(1000)], ['5', '0.5', '1000']);
    });
  });

  group('downtime, recovery, handover, export', () {
    test('the phone network never changes the phase; clearing needs every tick and the PIN', () async {
      await h.signIn('pr-ellis');
      startPracticeOutage(h.app.ctx());
      expect(h.app.phase, Phase.down);
      h.bridge.network = true;
      h.app.didChangeAppLifecycleState(AppLifecycleState.resumed);
      expect(h.app.phase, Phase.down);
      expect(() => clearNetwork(h.app.ctx(), kNetworkChecklist.take(2).toList(), pinOk: true), throwsMsg('every checklist item'));
      expect((await h.app.clearNetwork(h.app.ctx(), kNetworkChecklist, '9999')).ok, isFalse);
      expect(h.app.phase, Phase.down);
      expect(() => buildWorklist(h.app.ctx()), throwsMsg('Back online'));
      expect(() => recordExport(h.app.ctx(), '{}', 'f'), throwsMsg('Back online'));
      expect((await h.app.clearNetwork(h.app.ctx(), kNetworkChecklist, kPracticePin)).ok, isTrue);
      expect(h.app.phase, Phase.online);
    });

    test('worklist: flagged items need a reason, originals stay, end is blocked while open', () async {
      await h.signIn('pr-ellis');
      final c = h.app.ctx();
      expect(() => endDowntime(c), throwsMsg('not signed off'));
      final before = s.get('entry', 'e-011');
      expect(() => signOffItem(c, 'wl-011'), throwsMsg('reason'));
      signOffItem(c, 'wl-011', reason: 'Checked with the paper MAR');
      expect(() => signOffItem(c, 'wl-011', reason: 'x'), throwsMsg('Already'));
      expect(s.get('entry', 'e-011'), before);
      expect(resolutionsFor(s, 'wl-011').single['by'], 'pr-ellis');
      expect(chainOk(), isTrue);
    });

    test('SBAR: exactly once, only confirmed records of the same patient; sign-off needs all notes and two people', () async {
      await h.signIn('pr-okafor');
      var c = h.verified('pt-01');
      Handoff make(Ctx c, String p, String key, [List<String> src = const []]) => createHandoff(c, patientId: p, shift: 'Day to night', situation: 's', background: 'b', assessment: 'a', openItems: ['x', ' '], sourceEntryIds: src, clientKey: key);
      expect(() => make(c, 'pt-01', newId('k'), ['e-002']), throwsMsg('another patient'));
      expect(() => make(h.verified('pt-08'), 'pt-08', newId('k'), ['e-048']), throwsMsg(''), reason: 'draft');
      await h.signIn('pr-park'); // recorded nothing in this day shift
      setAssigned(h.app.ctx(), 'pt-01', true);
      c = h.verified('pt-01');
      final k = newId('k');
      expect(make(c, 'pt-01', k, ['e-001']).id, make(c, 'pt-01', k, ['e-001']).id);
      expect(make(c, 'pt-01', k).openItems, ['x']);
      Future<PinResult> off(List<String> roster, String inc, String a, String b) => h.app.shiftSignoff(c, roster: roster, ownPin: a, incomingId: inc, incomingPin: b);
      await expectLater(off(['pt-01', 'pt-02'], 'pr-alvarez', kPracticePin, kPracticePin), throwsMsg('no final SBAR'));
      expect((await off(['pt-01'], 'pr-park', kPracticePin, kPracticePin)).ok, isFalse);
      expect((await off(['pt-01'], 'pr-alvarez', kPracticePin, '0000')).ok, isFalse);
      await expectLater(off(['pt-01'], 'pr-whitfield', kPracticePin, kPracticePin), throwsMsg('cannot co-sign'));
      expect(s.count('m_shift_signoff'), 0);
      expect((await off(['pt-01'], 'pr-alvarez', kPracticePin, kPracticePin)).ok, isTrue);
      expect(shiftSignoff(s, h.app.nowIso)!['incoming_id'], 'pr-alvarez');
      await expectLater(off(['pt-01'], 'pr-reyes', kPracticePin, kPracticePin), throwsMsg('already signed off'));
      expect(s.count('m_shift_signoff'), 1);
      // Okafor recorded care for several patients today: an empty or short roster does not remove that duty.
      await h.signIn('pr-okafor');
      expect(() => recordShiftSignoff(h.app.ctx(), roster: const [], incomingId: 'pr-park'), throwsMsg('no final SBAR'));
      expect(handoverRoster(s, 'pr-okafor', h.app.nowIso).length, greaterThan(1));
    });

    test('FHIR file: valid, counts real, drafts left out, export recorded with the hash of the exact text', () async {
      await h.signIn('pr-ellis');
      final f = prepareExport(s, h.app.nowIso);
      expect(f.errors, isEmpty);
      expect(f.drafts, 2);
      expect(f.counts.values.fold<int>(0, (a, b) => a + b), f.entries.length);
      expect(f.json.contains('e-048'), isFalse);
      expect(f.counts['Patient'], 10);
      final broken = f.json.replaceFirst('"status": "final"', '"status": "finished"');
      expect(validateBundleText(broken), isNotEmpty);
      expect(validateBundleText('{'), isNotEmpty);
      final hash = recordExport(h.app.ctx(), f.json, 'x.json');
      expect(hash, sha256Text(f.json));
      expect(s.lastAudit()!['action'], 'fhir_export');
      expect(s.all('worklist_item').where((w) => w['signed_off_at'] != null && w['exported_at'] == null), isEmpty);
    });
  });

  test('practice reset: only after a person asks, right passphrase, log starts again and says so', () async {
    expect(() => h.app.resetPractice(passphrase: kPracticePassphrase), throwsA(isA<NotAllowedError>()));
    await h.signIn('pr-okafor');
    saveVitals(h.verified('pt-01'), 'pt-01');
    await expectLater(h.app.resetPractice(passphrase: 'wrong'), throwsMsg('not right'));
    await h.app.unlockVault(passphrase: kPracticePassphrase);
    expect(s.count('entry'), 50, reason: 'a wrong passphrase removes nothing');
    await h.signIn('pr-okafor');
    await h.app.resetPractice(passphrase: kPracticePassphrase);
    expect(s.count('entry'), 49);
    expect(s.where('audit_log', 'action', 'practice_reset').length, 1);
    expect(chainOk(), isTrue);
  });
}
