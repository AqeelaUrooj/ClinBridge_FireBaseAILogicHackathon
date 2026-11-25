import 'dart:convert';
import 'dart:io';

import 'package:clinbridge_practice/core/clock.dart';
import 'package:clinbridge_practice/data/repos/ops.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/host.dart';

/// The mobile FHIR file against the web app's own export of the same dataset (web: FHIR_OUT=... vitest run src/lib/fhir.export.test.ts).
/// Set WEB_FHIR to that file. Allowed differences: the additional HTEST practice tag, the word "Device"/"device" for "Laptop"/"laptop"
/// in free text, and the narrative text that repeats them.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final web = Platform.environment['WEB_FHIR'];

  test('same resources, ids, codes, values and references as the web export', () async {
    final h = await Harness.make(clock: PracticeClock(frozen: true)).ready();
    final f = prepareExport(h.app.store, '2026-11-14T13:20:00-05:00');
    final out = Platform.environment['MOBILE_FHIR_OUT'];
    if (out != null) File(out).writeAsStringSync(f.json);
    Object? norm(Object? v, [String key = '']) {
      if (v is Map) {
        final m = {for (final e in v.entries) '${e.key}': norm(e.value, '${e.key}')};
        if (m['tag'] is List) m['tag'] = [for (final t in m['tag'] as List) if ((t as Map)['code'] != 'HTEST') t];
        m.remove('text_narrative');
        return m;
      }
      if (v is List) return [for (final x in v) norm(x)];
      if (v is String && (key == 'display' || key == 'div')) return v.replaceAll('Device ', 'Laptop ').replaceAll('downtime device', 'downtime laptop');
      return v;
    }

    final a = norm(jsonDecode(File(web!).readAsStringSync())) as Map, b = norm(jsonDecode(f.json)) as Map;
    List<String> ids(Map m) => [for (final e in m['entry'] as List) (e as Map)['fullUrl'] as String];
    expect(ids(b), ids(a));
    for (var i = 0; i < (a['entry'] as List).length; i++) {
      expect((b['entry'] as List)[i], (a['entry'] as List)[i], reason: ids(a)[i]);
    }
    for (final m in [a, b]) {
      m.removeWhere((k, _) => k == 'entry' || k == 'id' || k == 'timestamp'); // export time
    }
    expect(b, a);
    h.dispose();
  }, skip: web == null ? 'WEB_FHIR is not set' : false);
}
