import 'dart:convert';

import 'package:crypto/crypto.dart' as c;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../core/util.dart';

class BatteryState {
  final int percent;
  final bool charging;

  /// Android's own "battery low" flag. The app has no threshold of its own (no approved policy).
  final bool low;
  const BatteryState(this.percent, this.charging, {this.low = false});
}

class PickedImage {
  final Uint8List bytes;
  final String mime;
  const PickedImage(this.bytes, this.mime);
}

class CameraInfo {
  final int textureId, width, height, rotation, run;
  final bool hasTorch;
  const CameraInfo({required this.textureId, required this.width, required this.height, required this.rotation, required this.hasTorch, this.run = 0});
}

/// Everything the app asks Android for. One channel, implemented in MainActivity.kt; a fake is used in tests.
abstract class NativeBridge {
  /// App-private folder that Android never backs up.
  Future<String> privateDir();

  /// Keystore-held AES-256-GCM key (never leaves the phone's key store).
  Future<bool> keystoreHasKey();
  Future<void> keystoreCreateKey();
  Future<Uint8List> keystoreSeal(Uint8List plain);
  Future<Uint8List> keystoreOpen(Uint8List sealed);

  Future<Uint8List> pbkdf2(String secret, Uint8List salt, int iterations);

  Future<BatteryState?> battery();

  /// (free, total) bytes of the app's storage volume.
  Future<(int, int)?> storage();

  /// What Android says about a network. Information only; the app has no permission to use one.
  Future<bool?> networkConnected();
  Future<String> deviceModel();

  /// Android's own "save as" screen. Returns the chosen display name, or null when cancelled.
  Future<String?> saveFile(String name, String mime, Uint8List bytes);

  /// Android's own print screen. Returns false when the phone has no print service.
  Future<bool> printPdf(String jobName, Uint8List pdf);

  /// Android photo picker (no storage permission). Null when cancelled.
  Future<PickedImage?> pickImage();

  /// 'granted' | 'denied' | 'blocked'
  Future<String> cameraPermission({required bool ask});
  Future<void> openAppSettings();
  Future<CameraInfo> cameraStart();
  Future<Uint8List> cameraCapture();

  /// Returns the torch state that is really on.
  Future<bool> cameraTorch(bool on);

  /// [run] = CameraInfo.run: stops only that start; a newer one goes on.
  Future<void> cameraStop({int? run});

  /// Hide the app's content in Android's recent-apps picture.
  Future<void> setRecentsHidden(bool hidden);
}

class ChannelBridge implements NativeBridge {
  static const _ch = MethodChannel('clinbridge/native');

  @override
  Future<String> privateDir() async => (await _ch.invokeMethod<String>('privateDir'))!;
  @override
  Future<bool> keystoreHasKey() async => (await _ch.invokeMethod<bool>('ksHas'))!;
  @override
  Future<void> keystoreCreateKey() => _ch.invokeMethod('ksCreate');
  @override
  Future<Uint8List> keystoreSeal(Uint8List plain) async => (await _ch.invokeMethod<Uint8List>('ksSeal', plain))!;
  @override
  Future<Uint8List> keystoreOpen(Uint8List sealed) async => (await _ch.invokeMethod<Uint8List>('ksOpen', sealed))!;
  @override
  Future<Uint8List> pbkdf2(String secret, Uint8List salt, int iterations) async =>
      (await _ch.invokeMethod<Uint8List>('pbkdf2', {'secret': secret, 'salt': salt, 'iterations': iterations}))!;
  @override
  Future<BatteryState?> battery() async {
    final m = await _ch.invokeMapMethod<String, Object?>('battery');
    final p = m?['percent'] as int?;
    return p == null || p < 0 ? null : BatteryState(p, m!['charging'] == true, low: m['low'] == true);
  }

  @override
  Future<(int, int)?> storage() async {
    final m = await _ch.invokeMapMethod<String, Object?>('storage');
    return m == null ? null : ((m['free'] as num).toInt(), (m['total'] as num).toInt());
  }

  @override
  Future<bool?> networkConnected() => _ch.invokeMethod<bool>('network');
  @override
  Future<String> deviceModel() async => (await _ch.invokeMethod<String>('model'))!;
  @override
  Future<String?> saveFile(String name, String mime, Uint8List bytes) =>
      _ch.invokeMethod<String>('saveFile', {'name': name, 'mime': mime, 'bytes': bytes});
  @override
  Future<bool> printPdf(String jobName, Uint8List pdf) async => (await _ch.invokeMethod<bool>('print', {'name': jobName, 'bytes': pdf}))!;
  @override
  Future<PickedImage?> pickImage() async {
    final m = await _ch.invokeMapMethod<String, Object?>('pickImage');
    return m == null ? null : PickedImage(m['bytes'] as Uint8List, m['mime'] as String);
  }

  @override
  Future<String> cameraPermission({required bool ask}) async => (await _ch.invokeMethod<String>('camPermission', ask))!;
  @override
  Future<void> openAppSettings() => _ch.invokeMethod('appSettings');
  @override
  Future<CameraInfo> cameraStart() async {
    final m = (await _ch.invokeMapMethod<String, Object?>('camStart'))!;
    return CameraInfo(
        textureId: (m['texture'] as num).toInt(), width: m['width'] as int, height: m['height'] as int, rotation: m['rotation'] as int, run: m['run'] as int, hasTorch: m['torch'] == true);
  }

  @override
  Future<Uint8List> cameraCapture() async => (await _ch.invokeMethod<Uint8List>('camCapture'))!;
  @override
  Future<bool> cameraTorch(bool on) async => (await _ch.invokeMethod<bool>('camTorch', on))!;
  @override
  Future<void> cameraStop({int? run}) => _ch.invokeMethod('camStop', run);
  @override
  Future<void> setRecentsHidden(bool hidden) => _ch.invokeMethod('recents', hidden);
}

/// PBKDF2-HMAC-SHA256 in Dart (one 32-byte block). Used by tests; Android uses its own provider.
Uint8List dartPbkdf2(String secret, List<int> salt, int iterations) {
  final mac = c.Hmac(c.sha256, utf8.encode(secret));
  var u = mac.convert([...salt, 0, 0, 0, 1]).bytes;
  final out = Uint8List.fromList(u);
  for (var i = 1; i < iterations; i++) {
    u = mac.convert(u).bytes;
    for (var k = 0; k < 32; k++) {
      out[k] ^= u[k];
    }
  }
  return out;
}

/// Test double. Never used by the installed app.
@visibleForTesting
class FakeBridge implements NativeBridge {
  final String dir;
  List<int>? keystoreKey;
  BatteryState? batteryState;
  (int, int)? storageState;
  bool? network;
  String model;
  final List<(String, String, Uint8List)> saved = [];
  final List<(String, Uint8List)> printed = [];
  bool saveCancelled = false, printAvailable = true;
  Object? saveError;
  PickedImage? picked;
  String permission = 'granted', permissionAfterAsk = 'granted';
  Uint8List? capture;
  Object? cameraError;
  bool torchSupported = true, torchOn = false, cameraRunning = false;
  bool recentsHidden = false;

  FakeBridge(this.dir, {this.batteryState = const BatteryState(82, false), this.storageState = (12 * 1073741824, 64 * 1073741824), this.network = false, this.model = 'Test phone'});

  @override
  Future<String> privateDir() async => dir;
  @override
  Future<bool> keystoreHasKey() async => keystoreKey != null;
  @override
  Future<void> keystoreCreateKey() async => keystoreKey ??= randomBytes(32);
  @override
  Future<Uint8List> keystoreSeal(Uint8List plain) async {
    final k = keystoreKey!;
    return Uint8List.fromList([...c.Hmac(c.sha256, k).convert(plain).bytes, for (var i = 0; i < plain.length; i++) plain[i] ^ k[i % 32]]);
  }

  @override
  Future<Uint8List> keystoreOpen(Uint8List sealed) async {
    final k = keystoreKey;
    if (k == null) throw PlatformException(code: 'no_key');
    final body = sealed.sublist(32);
    final plain = Uint8List.fromList([for (var i = 0; i < body.length; i++) body[i] ^ k[i % 32]]);
    if (hexOf(c.Hmac(c.sha256, k).convert(plain).bytes) != hexOf(sealed.sublist(0, 32))) throw PlatformException(code: 'bad_key');
    return plain;
  }

  /// Fewer rounds than the phone so tests stay fast; the stored iteration count is unchanged.
  @override
  Future<Uint8List> pbkdf2(String secret, Uint8List salt, int iterations) async => dartPbkdf2('$iterations|$secret', salt, 50);
  @override
  Future<BatteryState?> battery() async => batteryState;
  @override
  Future<(int, int)?> storage() async => storageState;
  @override
  Future<bool?> networkConnected() async => network;
  @override
  Future<String> deviceModel() async => model;
  @override
  Future<String?> saveFile(String name, String mime, Uint8List bytes) async {
    if (saveError != null) throw saveError!;
    if (saveCancelled) return null;
    saved.add((name, mime, bytes));
    return name;
  }

  @override
  Future<bool> printPdf(String jobName, Uint8List pdf) async {
    if (!printAvailable) return false;
    printed.add((jobName, pdf));
    return true;
  }

  @override
  Future<PickedImage?> pickImage() async => picked;
  @override
  Future<String> cameraPermission({required bool ask}) async {
    if (ask && permission != 'granted') permission = permissionAfterAsk;
    return permission;
  }

  @override
  Future<void> openAppSettings() async {}
  @override
  Future<CameraInfo> cameraStart() async {
    if (cameraError != null) throw cameraError!;
    cameraRunning = true;
    return CameraInfo(textureId: -1, width: 1200, height: 1600, rotation: 0, hasTorch: torchSupported);
  }

  @override
  Future<Uint8List> cameraCapture() async {
    if (cameraError != null) throw cameraError!;
    return capture!;
  }

  @override
  Future<bool> cameraTorch(bool on) async => torchOn = torchSupported && on;
  @override
  Future<void> cameraStop({int? run}) async => cameraRunning = false;
  @override
  Future<void> setRecentsHidden(bool hidden) async => recentsHidden = hidden;
}
