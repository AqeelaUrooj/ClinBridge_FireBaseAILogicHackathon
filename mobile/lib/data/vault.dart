import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:pointycastle/export.dart' as pc;

import '../config/policy.dart';
import '../core/util.dart';
import 'native.dart';
import 'store.dart';

/// Vault = the key envelope (vault.json) plus the encrypted database file.
///
///   database key (random 256 bit)
///     -> AES-256-GCM with PBKDF2-HMAC-SHA256(passphrase)  and again with the recovery code
///     -> that text is sealed once more by an AES-256-GCM key inside Android Keystore.
///
/// So the records open only on this phone (Keystore) AND with a passphrase or recovery code.
/// A vault that cannot be opened is reported. It is never reset, replaced or deleted by the app on its own.
class VaultFiles {
  final String dir;
  VaultFiles(this.dir);
  File get envelope => File('$dir/vault.json');
  String get dbPath => '$dir/practice.db';
  bool get hasDb => File(dbPath).existsSync();
  bool get hasEnvelope => envelope.existsSync();

  /// Written after the dataset was loaded completely: from then on a missing database is a fault, not a first start.
  File get readyMark => File('$dir/practice.ready');
}

enum VaultPresence { none, ready, missingEnvelope, missingDeviceKey, missingDatabase }

class Vault {
  final NativeBridge native;
  final VaultFiles files;
  Vault(this.native, String dir) : files = VaultFiles(dir);

  static const _aad = 'clinbridge-mobile-vault-v1';

  Future<VaultPresence> presence() async {
    if (!files.hasEnvelope) return files.hasDb || files.readyMark.existsSync() ? VaultPresence.missingEnvelope : VaultPresence.none;
    if (files.readyMark.existsSync() && !files.hasDb) return VaultPresence.missingDatabase;
    return await native.keystoreHasKey() ? VaultPresence.ready : VaultPresence.missingDeviceKey;
  }

  /// First-time setup. Refuses to run when anything of an earlier vault exists.
  Future<void> create({required String passphrase, required String recovery, int iterations = SecurityPolicy.pbkdf2Iterations}) async {
    if (await presence() != VaultPresence.none) throw const AppError('Encrypted records already exist on this phone. They were not changed.');
    await native.keystoreCreateKey();
    final dbKey = Uint8List.fromList(randomBytes(32));
    final env = <String, Object?>{'v': 1, 'created_at': DateTime.now().toUtc().toIso8601String(), 'kdf': 'PBKDF2-HMAC-SHA256', 'iterations': iterations};
    for (final (name, secret) in [('pass', passphrase), ('recovery', recovery)]) {
      final salt = Uint8List.fromList(randomBytes(16));
      final kek = await native.pbkdf2(_norm(secret), salt, iterations);
      env['${name}_salt'] = base64Encode(salt);
      env['${name}_wrap'] = base64Encode(await native.keystoreSeal(_gcm(true, kek, dbKey)));
    }
    if (files.hasEnvelope || files.hasDb) throw const AppError('Encrypted records already exist on this phone. They were not changed.');
    final tmp = File('${files.envelope.path}.tmp');
    final raf = tmp.openSync(mode: FileMode.write);
    raf.writeStringSync(jsonEncode(env));
    raf.flushSync();
    raf.closeSync();
    tmp.renameSync(files.envelope.path);
  }

  /// Opens the records with the passphrase or the recovery code.
  Future<Store> open({String? passphrase, String? recovery}) async {
    final p = await presence();
    if (p == VaultPresence.none) throw const AppError('There are no encrypted records on this phone yet.');
    if (p == VaultPresence.missingEnvelope) {
      throw const AppError('The key file of these records is missing. The records were not opened, changed or deleted. Tell IT.');
    }
    if (p == VaultPresence.missingDeviceKey) {
      throw const AppError('This phone\'s own key for these records is missing (for example after the app data was copied or security settings were reset). The records were not opened, changed or deleted. Tell IT.');
    }
    if (p == VaultPresence.missingDatabase) {
      throw const AppError('The records file is missing on this phone. Nothing was created in its place. Tell IT.');
    }
    final Map<String, Object?> env;
    try {
      env = (jsonDecode(files.envelope.readAsStringSync()) as Map).cast<String, Object?>();
    } catch (_) {
      throw const AppError('The key file of these records is damaged. The records were not opened, changed or deleted. Tell IT.');
    }
    final name = passphrase != null ? 'pass' : 'recovery';
    final secret = _norm(passphrase ?? recovery ?? '');
    final kek = await native.pbkdf2(secret, base64Decode(env['${name}_salt'] as String), env['iterations'] as int);
    final Uint8List wrapped;
    try {
      wrapped = await native.keystoreOpen(base64Decode(env['${name}_wrap'] as String));
    } catch (_) {
      throw const AppError('This phone\'s key store did not open these records. Nothing was changed or deleted. Tell IT.');
    }
    final Uint8List dbKey;
    try {
      dbKey = _gcm(false, kek, wrapped);
    } catch (_) {
      throw AppError(passphrase != null ? 'The passphrase is not right.' : 'The recovery code is not right.');
    }
    final store = Store.open(files.dbPath, dbKey);
    dbKey.fillRange(0, dbKey.length, 0);
    return store;
  }

  /// Practice reset, asked for by a person: removes the fictional records only. The vault key stays.
  void deletePracticeDatabase() {
    if (files.readyMark.existsSync()) files.readyMark.deleteSync();
    for (final s in ['', '-wal', '-shm', '-journal']) {
      final f = File('${files.dbPath}$s');
      if (f.existsSync()) f.deleteSync();
    }
  }

  static String _norm(String s) => s.trim().replaceAll(RegExp(r'\s+'), ' ');

  static Uint8List _gcm(bool seal, Uint8List key, Uint8List data) {
    final cipher = pc.GCMBlockCipher(pc.AESEngine());
    final aad = Uint8List.fromList(utf8.encode(_aad));
    if (seal) {
      final iv = Uint8List.fromList(randomBytes(12));
      cipher.init(true, pc.AEADParameters(pc.KeyParameter(key), 128, iv, aad));
      return Uint8List.fromList([...iv, ...cipher.process(data)]);
    }
    cipher.init(false, pc.AEADParameters(pc.KeyParameter(key), 128, data.sublist(0, 12), aad));
    return cipher.process(data.sublist(12));
  }
}

/// PIN hashing, same text format as the web app: `pbkdf2$iterations$saltHex$hashHex`
Future<String> hashPin(NativeBridge native, String pin, {int iterations = SecurityPolicy.pinIterations}) async {
  final salt = Uint8List.fromList(randomBytes(16));
  return 'pbkdf2\$$iterations\$${hexOf(salt)}\$${hexOf(await native.pbkdf2(pin, salt, iterations))}';
}

Future<bool> verifyPin(NativeBridge native, String pin, String stored) async {
  final p = stored.split('\$');
  if (p.length != 4 || p[0] != 'pbkdf2') return false;
  final got = hexOf(await native.pbkdf2(pin, Uint8List.fromList(unhex(p[2])), int.parse(p[1])));
  var diff = got.length ^ p[3].length;
  for (var i = 0; i < got.length && i < p[3].length; i++) {
    diff |= got.codeUnitAt(i) ^ p[3].codeUnitAt(i);
  }
  return diff == 0;
}

bool isValidPin(String pin) => RegExp(r'^\d{4}$').hasMatch(pin);
