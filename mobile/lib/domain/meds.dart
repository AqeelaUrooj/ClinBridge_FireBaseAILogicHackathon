import '../config/policy.dart';
import '../core/clock.dart';
import '../core/util.dart';
import '../data/schema.dart';
import '../data/store.dart';

/// Medication rules, ported from web src/lib/meds.ts and src/lib/recovery.ts.
/// No dose-range checking and no interaction checking: those need approved clinical content.
const Map<String, String> kEventLabel = {'administered': 'Given', 'held': 'Held', 'refused': 'Refused', 'rate_changed': 'Rate changed'};

HighAlertEntry? highAlertEntry(String? drug) {
  if (drug == null) return null;
  final d = drug.toLowerCase();
  for (final e in kHighAlert) {
    if (e.match.any((m) => d.contains(m.toLowerCase()))) return e;
  }
  return null;
}

bool isHighAlert(String? drug) => highAlertEntry(drug) != null;
bool needsSecondNurse(String? drug, String event) => highAlertEntry(drug)?.events.contains(event) ?? false;

enum OrderGroup { scheduled, prn, infusion }

OrderGroup orderGroup(ActiveOrder o) {
  if ((o.frequency ?? '').toLowerCase().contains('continuous')) return OrderGroup.infusion;
  return o.prn ? OrderGroup.prn : OrderGroup.scheduled;
}

bool isMedOrder(ActiveOrder o) => o.type == 'med' || o.type == 'iv';
String orderDose(ActiveOrder o) => o.dose == null ? '' : '${formatDose(o.dose)} ${o.doseUnit ?? ''}'.trim();

List<String> slotsForDay(ActiveOrder o, String dayIso) => [for (final t in o.scheduledTimes) '${dayIso.substring(0, 10)}T$t:00${dayIso.substring(19)}'];

/// Status of one scheduled time: due | given | held | refused | draft. There is no approved timing window, so never "overdue".
class Slot {
  final String time, status;
  final Entry? entry;
  const Slot(this.time, this.status, [this.entry]);
}

List<Slot> slotStatuses(ActiveOrder o, String nowIso, List<EntryX> meds) => [
      for (final time in slotsForDay(o, nowIso))
        () {
          for (final x in meds) {
            if (x.child == null || x.med.orderId != o.id || x.entry.scheduledTime != time) continue;
            if (x.entry.isDraft) return Slot(time, 'draft', x.entry);
            if (x.entry.isConfirmed) return Slot(time, x.med.event == 'held' ? 'held' : x.med.event == 'refused' ? 'refused' : 'given', x.entry);
          }
          return Slot(time, 'due');
        }(),
    ];

List<EntryX> orderHistory(ActiveOrder o, List<EntryX> meds) => [for (final x in meds) if (x.child != null && x.entry.type == 'med_admin' && x.med.orderId == o.id) x];

EntryX? lastGiven(ActiveOrder o, List<EntryX> meds) {
  for (final x in orderHistory(o, meds)) {
    if (x.entry.isConfirmed && x.med.event == 'administered') return x;
  }
  return null;
}

/// Latest confirmed rate change, else the ordered starting rate. [meds] newest first.
(num?, String?) currentRate(ActiveOrder o, List<EntryX> meds) {
  for (final x in orderHistory(o, meds)) {
    if (x.entry.isConfirmed && x.med.event == 'rate_changed') return (x.med.rate, x.med.rateUnit);
  }
  return (o.dose, o.doseUnit);
}

/// "every 6 hours" -> 6. Anything else -> null (no interval rule).
int? orderIntervalHours(ActiveOrder? o) {
  final m = RegExp(r'every\s+(\d+)\s+hours?', caseSensitive: false).firstMatch(o?.frequency ?? '');
  return m == null ? null : int.parse(m[1]!);
}

/* ------------------------------ Form ------------------------------ */

class MedForm {
  final String event, dose, unit, route, site, rate, rateUnit, reason;
  const MedForm({required this.event, this.dose = '', this.unit = '', this.route = '', this.site = '', this.rate = '', this.rateUnit = '', this.reason = ''});

  factory MedForm.fromOrder(ActiveOrder o, String event) {
    final inf = orderGroup(o) == OrderGroup.infusion;
    return MedForm(
      event: event,
      dose: o.dose != null && !inf ? formatDose(o.dose) : '',
      unit: inf ? '' : o.doseUnit ?? '',
      route: o.route ?? '',
      rateUnit: inf ? o.doseUnit ?? '' : '',
    );
  }
}

class MedResult {
  final Doc values;
  final Map<String, String> errors;
  final List<String> warnings;
  final bool needsSecondCheck;
  const MedResult(this.values, this.errors, this.warnings, this.needsSecondCheck);
  bool get ok => errors.isEmpty;
}

final _positive = RegExp(r'^\d{1,5}(\.\d{1,3})?$');

MedResult validateMed(MedForm f, ActiveOrder o, num? priorRate) {
  final e = <String, String>{};
  final w = <String>[];
  String? t(String s) => s.trim().isEmpty ? null : s.trim();
  final v = <String, Object?>{
    'order_id': o.id, 'drug_name': o.drugName ?? o.text, 'rxnorm_code': o.m['rxnorm_code'], 'event': f.event,
    'dose_due': o.dose, 'dose_due_unit': o.doseUnit, 'dose_given': null, 'dose_given_unit': null, 'route': null, 'site': t(f.site),
    'end_time': null, 'infusion_rate': null, 'infusion_rate_unit': null, 'prior_infusion_rate': null, 'reason': t(f.reason),
    'double_checked': null, 'double_checked_by': null, 'raw_text': null,
  };
  if (f.event == 'administered') {
    final raw = f.dose.trim();
    if (raw.isEmpty) {
      e['dose'] = 'Enter the dose given';
    } else if (!_positive.hasMatch(raw) || num.parse(raw) <= 0) {
      e['dose'] = 'A number above 0';
    } else {
      v['dose_given'] = num.parse(raw);
    }
    if (kDoseUnits.contains(f.unit)) {
      v['dose_given_unit'] = f.unit;
    } else {
      e['unit'] = 'Pick a unit';
    }
    if (kRoutes.contains(f.route)) {
      v['route'] = f.route;
    } else {
      e['route'] = 'Pick how it was given';
    }
    final dose = v['dose_given'] as num?;
    if (dose != null && o.dose != null && dose != o.dose) w.add('Dose ${formatDose(dose)} ${f.unit} is different from the order (${orderDose(o)})');
    if (v['dose_given_unit'] != null && o.doseUnit != null && f.unit != o.doseUnit) w.add('Unit ${f.unit} is different from the order (${o.doseUnit})');
    if (v['route'] != null && o.route != null && f.route != o.route) w.add('Route ${f.route} is different from the order (${o.route})');
  } else if (f.event == 'held' || f.event == 'refused') {
    if (v['reason'] == null) e['reason'] = f.event == 'held' ? 'Say why it was held' : 'Say what the patient said';
    v['route'] = o.route;
  } else if (f.event == 'rate_changed') {
    final raw = f.rate.trim();
    if (raw.isEmpty) {
      e['rate'] = 'Enter the new rate';
    } else if (!_positive.hasMatch(raw)) {
      e['rate'] = 'A number (0 or more)';
    } else {
      v['infusion_rate'] = num.parse(raw);
    }
    if (kRateUnits.contains(f.rateUnit)) {
      v['infusion_rate_unit'] = f.rateUnit;
      if (o.doseUnit != null && f.rateUnit != o.doseUnit) w.add('Unit ${f.rateUnit} is different from the order (${o.doseUnit})');
    } else {
      e['rateUnit'] = 'Pick a unit';
    }
    v['prior_infusion_rate'] = priorRate;
    v['route'] = o.route;
    if (v['infusion_rate'] != null && v['infusion_rate'] == priorRate) w.add('New rate is the same as the current rate');
  } else {
    e['event'] = 'Pick what happened';
  }
  return MedResult(v, e, w, needsSecondNurse(v['drug_name'] as String?, f.event));
}

/* ------------------------------ Dose lock ------------------------------ */

/// Why a dose cannot be recorded as given. Only facts from the records or an explicit seeded hold; no clinical judgement.
class DoseLock {
  /// 'hold' | 'slot' | 'interval'
  final String kind;
  final String title, reason;
  final Entry? related;
  const DoseLock(this.kind, this.title, this.reason, [this.related]);
}

/// Checked on the screen AND again inside the save.
///  hold      an explicit Practice hold on the order (m_order_hold), not released; a lower or unchanged rate may still be recorded
///  slot      this scheduled time already has a live record (also for held and refused)
///  interval  closer to the last given dose than the order's own "every N hours" (web recovery rule, used as a block here)
List<DoseLock> doseLocks(Store s, ActiveOrder o, List<EntryX> meds, {required String careTime, String? scheduledTime, String event = 'administered', String? ignoreEntryId, num? newRate}) {
  final out = <DoseLock>[];
  final prior = event == 'rate_changed' ? currentRate(o, meds).$1 : null;
  final raises = event == 'rate_changed' && (newRate == null || prior == null || newRate > prior);
  for (final h in event == 'administered' || raises ? s.where('m_order_hold', 'order_id', o.id) : const <Doc>[]) {
    if (h['released_at'] == null) out.add(DoseLock('hold', h['title'] as String? ?? 'Order on hold', h['reason'] as String? ?? 'This order has a Practice hold.'));
  }
  if (event == 'rate_changed') return out;
  if (scheduledTime == null && event == 'administered' && orderGroup(o) == OrderGroup.scheduled && o.scheduledTimes.isNotEmpty) {
    out.add(const DoseLock('slot', 'Choose the due time', 'This order has set times. A given dose belongs to one of them, so it can not be recorded without a due time.'));
  }
  for (final x in orderHistory(o, meds)) {
    if (!(x.entry.isConfirmed || x.entry.isDraft) || x.entry.id == ignoreEntryId) continue;
    if (scheduledTime != null && x.entry.scheduledTime == scheduledTime && x.entry.isDraft) {
      out.add(DoseLock('slot', 'A draft is waiting for ${hm(scheduledTime)}', 'A draft record for this scheduled time waits to be checked. Confirm it, or mark it as a mistake, first.', x.entry));
      break;
    }
    if (scheduledTime != null && x.entry.scheduledTime == scheduledTime) {
      out.add(DoseLock('slot', 'Already recorded for ${hm(scheduledTime)}', '${kEventLabel[x.med.event] ?? x.med.event} at ${hm(x.entry.careTime)} is already recorded for this scheduled time.', x.entry));
      break;
    }
  }
  final hrs = orderIntervalHours(o);
  if (hrs != null && event == 'administered') {
    for (final x in orderHistory(o, meds)) {
      if (!x.entry.isConfirmed || x.med.event != 'administered' || x.entry.id == ignoreEntryId) continue;
      final gapMin = ((ms(careTime) - ms(x.entry.careTime)).abs() / 60000).round();
      if (gapMin < hrs * 60 && (scheduledTime == null || x.entry.scheduledTime != scheduledTime)) {
        out.add(DoseLock('interval', 'Too close to the last dose',
            'Last given at ${hm(x.entry.careTime)} (${gapMin ~/ 60} h ${gapMin % 60} min apart). The order says every $hrs hours.', x.entry));
        break;
      }
    }
  }
  return out;
}

String doseLine(ActiveOrder o) => [o.drugName ?? o.text, orderDose(o), o.route].where((x) => x != null && x.isNotEmpty).join(' ');
