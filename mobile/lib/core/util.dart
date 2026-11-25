import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart' as c;

typedef Doc = Map<String, Object?>;

final Random _rng = Random.secure();

String newId(String prefix) => '$prefix-${uuid()}';

String uuid() {
  final b = List<int>.generate(16, (_) => _rng.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

List<int> randomBytes(int n) => List<int>.generate(n, (_) => _rng.nextInt(256));

String sha256Hex(List<int> bytes) => c.sha256.convert(bytes).toString();
String sha256Text(String s) => sha256Hex(utf8.encode(s));

String hexOf(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
List<int> unhex(String s) => [for (var i = 0; i < s.length; i += 2) int.parse(s.substring(i, i + 2), radix: 16)];

/// Numbers written as JavaScript writes them (36 not 36.0), so hashes and files equal the web app's.
Object? jsNumbers(Object? v) {
  if (v is double && v.isFinite && v == v.truncateToDouble() && v.abs() < 1e15) return v.toInt();
  if (v is Map) return {for (final e in v.entries) e.key as String: jsNumbers(e.value)};
  if (v is List) return [for (final x in v) jsNumbers(x)];
  return v;
}

String jsonText(Object? v, {String? indent}) => indent == null ? jsonEncode(jsNumbers(v)) : JsonEncoder.withIndent(indent).convert(jsNumbers(v));

/// Same serialisation as the web app's canonicalJson (Python json.dumps(sort_keys=True) layout).
String canonicalJson(Map<String, Object?> row) {
  final keys = row.keys.toList()..sort();
  return '{${keys.map((k) => '${jsonEncode(k)}: ${_canon(row[k])}').join(', ')}}';
}

String _canon(Object? v) {
  if (v is Map) return canonicalJson(v.cast<String, Object?>());
  if (v is List) return '[${v.map(_canon).join(', ')}]';
  return jsonEncode(jsNumbers(v));
}

/// A plain message the user can act on.
class AppError implements Exception {
  final String message;
  const AppError(this.message);
  @override
  String toString() => message;
}

/// The write did not happen because the phone's storage refused it.
class StorageError extends AppError {
  const StorageError(super.message);
}

/// The session, patient or lock state changed since this action was started.
class StaleContextError extends AppError {
  const StaleContextError([super.message = 'The signed-in person, the patient or the lock changed. Nothing was saved. Open the patient again.']);
}

class NotAllowedError extends AppError {
  const NotAllowedError(super.message);
}

const String kStorageFull = 'Phone storage is full, so this was NOT saved. Use the paper downtime form and tell the charge nurse or IT.';
const String kStorageFailed =
    'The phone could not write to its storage, so this was NOT saved. The last saved records are unchanged. Use the paper downtime form and tell IT.';
