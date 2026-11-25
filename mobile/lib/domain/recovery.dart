import '../config/policy.dart';
import '../core/clock.dart';
import '../data/schema.dart';
import 'meds.dart';

/// Rules-only recovery flags, ported from web src/lib/recovery.ts. Every rule is definitional or comes from the order itself.
const Map<String, String> kCategory = {'med_admin': 'meds', 'lab_event': 'results', 'vital_sign': 'vitals', 'intake_output': 'io', 'note': 'notes'};
const Map<String, String> kCategoryLabel = {'meds': 'Medicine', 'results': 'Lab', 'vitals': 'Vitals', 'io': 'Fluids', 'notes': 'Note'};
const Map<String, String> kFlagText = {
  'duplicate': 'Possible duplicate', 'time_conflict': 'Time conflict', 'missing_field': 'Missing field', 'recheck': 'Recheck', 'not_recorded': 'Not recorded',
};

class FlagResult {
  final List<String> flags, reasons, related;
  const FlagResult(this.flags, this.reasons, this.related);
}

FlagResult flagEntry(EntryX item, List<EntryX> all, Map<String, ActiveOrder> orders) {
  final e = item.entry;
  final flags = <String>{}, related = <String>{};
  final reasons = <String>[];
  if (ms(e.careTime) > ms(e.entryTime) + 60000) {
    flags.add('time_conflict');
    reasons.add('The care time is later than the time it was typed in.');
  }
  for (final x in all) {
    if (x.entry.deviceId != e.deviceId || x.entry.id == e.id) continue;
    final a = ms(x.entry.entryTime), b = ms(e.entryTime);
    if (a != b && (x.entry.counter < e.counter) != (a < b)) {
      flags.add('time_conflict');
      reasons.add('Device ${e.deviceId}: the record order and the clock order disagree (the clock may have been changed).');
      related.add(x.entry.id);
      break;
    }
  }
  if (e.type == 'med_admin' && item.child != null) {
    final m = item.med;
    if (m.event == 'administered') {
      final missing = [if (m.route == null) 'route', if (m.doseGiven == null) 'dose', if (m.doseGivenUnit == null) 'unit'];
      if (missing.isNotEmpty) {
        flags.add('missing_field');
        reasons.add('Given dose has no ${missing.join(', ')}.');
      }
      for (final o in all) {
        if (o.entry.id == e.id || o.entry.type != 'med_admin' || o.child == null || m.orderId == null || o.med.orderId != m.orderId || o.med.event != 'administered') continue;
        final same = e.scheduledTime != null && o.entry.scheduledTime == e.scheduledTime;
        final hrs = orderIntervalHours(orders[m.orderId]);
        final gap = (ms(o.entry.careTime) - ms(e.careTime)).abs() / 3600000;
        if (same || (hrs != null && gap < hrs)) {
          flags.add('duplicate');
          reasons.add(same ? 'Another dose is recorded for the same scheduled time.' : 'Another dose of this order was given ${gap.toStringAsFixed(1)} h apart; the order says every $hrs hours.');
          related.add(o.entry.id);
        }
      }
    }
  }
  return FlagResult(flags.toList(), reasons, related.toList());
}

int queuePriority(String type, List<String> flags) => (kCategoryRank[kCategory[type]] ?? kCategoryRank['other']!) * 10 + flags.length;

/// Care time inside the downtime window, confirmed records only. Forms keep hours and minutes, so the minute in which the
/// downtime was declared counts as inside (otherwise a record typed right after it would be left out).
bool inDowntime(Entry e, DowntimeEvent? ev) {
  if (ev == null || !e.isConfirmed) return false;
  final t = ms(e.careTime);
  return t >= ms(ev.declaredAt) ~/ 60000 * 60000 && (ev.endedAt == null || t <= ms(ev.endedAt!));
}

/// The newest version of a worklist entry (web newestVersion).
EntryX? newestVersion(String id, List<EntryX> all) {
  EntryX? x = all.where((e) => e.entry.id == id).firstOrNull;
  for (var n = x, seen = 0; n != null && seen < 100; seen++) {
    x = n;
    n = all.where((e) => e.entry.supersedesId == x!.entry.id).firstOrNull;
  }
  return x;
}

/// Counts for the recovery header. "Plain" items have no flag and wait for a signature; they are not resolved automatically.
class WorkProgress {
  final int total, done, flagged, plain;
  const WorkProgress(this.total, this.done, this.flagged, this.plain);
  static WorkProgress of(List<WorklistItem> items) {
    final done = items.where((i) => i.signedOffAt != null).length;
    final flagged = items.where((i) => i.signedOffAt == null && i.flags.isNotEmpty).length;
    return WorkProgress(items.length, done, flagged, items.length - done - flagged);
  }
}
