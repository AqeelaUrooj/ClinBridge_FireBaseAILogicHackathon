import 'dart:convert';

import '../config/policy.dart';
import '../core/clock.dart';
import '../core/util.dart';
import 'audit.dart';
import 'native.dart';
import 'schema.dart';
import 'store.dart';
import 'vault.dart';

/// Fields of the seed file that are not in the schema (web src/db/seed.ts, DECISIONS.md D-07).
const Map<String, List<String>> _drop = {
  'active_order': ['route_snomed'],
  'med_admin': ['route_snomed'],
  'downtime_event': ['note'],
};

/// Loads the approved synthetic dataset into empty Practice records, in one transaction. Does nothing when already loaded.
Future<void> importPracticeSeed(Store store, NativeBridge native, String seedJson, {required PracticeClock clock, String? extraJson}) async {
  if (store.meta('seeded') != null) return;
  final data = (jsonDecode(seedJson) as Map).cast<String, Object?>();
  final extra = extraJson == null ? const <String, Object?>{} : (jsonDecode(extraJson) as Map).cast<String, Object?>();
  final warning = (data['_meta'] as Map?)?['warning'] as String? ?? '';
  if (!RegExp('fake|synthetic|fictional', caseSensitive: false).hasMatch(warning)) throw const AppError('Only a file marked as fake practice data can be loaded.');

  final rows = <String, List<Doc>>{};
  for (final t in [...kClinicalTables, ...kMobileTables]) {
    if (t == 'key_store') continue; // the seed's row is a fake placeholder, not a vault
    rows[t] = [
      for (final r in [...(data[t] as List? ?? const []), ...(extra[t] as List? ?? const [])])
        {for (final e in (r as Map).entries) if (!(_drop[t] ?? const []).contains(e.key)) e.key as String: e.value},
    ];
  }
  // Seed PIN hashes are placeholders; every fictional staff member gets a real hash of the practice PIN.
  for (final p in rows['practitioner']!) {
    p['pin_hash'] = await hashPin(native, kPracticePin, iterations: SecurityPolicy.seedPinIterations);
  }
  final deviceId = 'dev-a${uuid().substring(0, 5)}';
  final model = await native.deviceModel();
  store.tx(() {
    if (store.meta('seeded') != null) return;
    for (final t in rows.keys) {
      for (final r in rows[t]!) {
        store.insert(t, r);
      }
    }
    final unit = rows['snapshot']!.isEmpty ? '' : rows['snapshot']!.first['unit'];
    final device = {'id': deviceId, 'label': 'Practice phone ($model)', 'unit': unit, 'last_clock_sync': null, 'model_status': 'not used'};
    store.insert('device', device);
    store.setMeta('device_id', deviceId);
    store.setMeta('seeded', clock.nowIso());
    appendAudit(store, time: clock.nowIso(), userId: 'system', deviceId: deviceId, action: 'device_registered', entity: 'device/$deviceId', after: device);
  });
}

/// Latest time already written (change log and downtime events), so the Practice clock never goes behind it.
int latestRecordedTime(Store store) {
  var max = 0;
  void take(String? iso) {
    if (iso == null) return;
    final t = ms(iso);
    if (t > max) max = t;
  }

  final last = store.lastAudit();
  if (last != null) take(AuditRow(last).time);
  for (final e in store.all('downtime_event').map(DowntimeEvent.new)) {
    take(e.declaredAt);
    take(e.networkClearedAt);
    take(e.endedAt);
  }
  return max;
}
