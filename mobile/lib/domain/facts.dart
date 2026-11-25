import '../core/clock.dart';
import '../data/repos/entries.dart';
import '../data/schema.dart';
import '../data/store.dart';
import 'charting.dart';
import 'meds.dart';

/// Read-only facts for screens, derived from saved records (port of web features/ward/wardData.ts).
/// "Due" = a scheduled time today without a record yet; it never means overdue. No scores, no thresholds.
class DueDose {
  final ActiveOrder order;
  final String time;
  final bool highAlert;
  const DueDose(this.order, this.time, this.highAlert);
}

class PatientFacts {
  final Patient patient;
  final Encounter? encounter;
  final List<Allergy> allergies;
  final List<ActiveOrder> orders;

  /// All entries, newest first.
  final List<EntryX> entries;
  final List<DueDose> due;
  final String nowIso;
  PatientFacts(this.patient, this.encounter, this.allergies, this.orders, this.entries, this.due, this.nowIso);

  String get bed => encounter?.bed ?? '—';
  int get age => ageOn(patient.birthDate, nowIso);

  /// "68M"
  String get ageSex => '$age${patient.sexLetter}';
  /// Active allergies, the most severe first (stored severity; the stored order is kept within one severity), so a page with
  /// room for one name shows the severe one.
  List<Allergy> get realAllergies {
    int rank(Allergy a) => switch (a.severity) { 'severe' => 0, 'moderate' => 1, 'mild' => 2, _ => 3 };
    final real = [for (final a in allergies) if (!a.isNone && a.status == 'active') a];
    return [for (var r = 0; r < 4; r++) ...real.where((a) => rank(a) == r)];
  }
  bool get hasSevereAllergy => realAllergies.any((a) => a.severity == 'severe');

  /// "PENICILLIN" / "No known allergies" / "Allergies not recorded"
  String get allergyText => realAllergies.isNotEmpty ? realAllergies.map((a) => a.substance).join(', ') : (allergies.isEmpty ? 'Allergies not recorded' : 'No known allergies');

  List<EntryX> get meds => [for (final x in entries) if (x.entry.type == 'med_admin') x];
  List<EntryX> get drafts => [for (final x in entries) if (x.entry.isDraft) x];
  List<ActiveOrder> get medOrders => [for (final o in orders) if (isMedOrder(o)) o];
  List<ActiveOrder> get careOrders => [for (final o in orders) if (!isMedOrder(o)) o];
  bool get hasHighAlert => medOrders.any((o) => isHighAlert(o.drugName));
  List<ActiveOrder> get infusions => [for (final o in medOrders) if (orderGroup(o) == OrderGroup.infusion) o];

  /// Latest confirmed vital-sign record (one record, one time). Null = none recorded.
  EntryX? get lastVitals {
    for (final x in entries) {
      if (x.entry.type == 'vital_sign' && x.entry.isConfirmed && x.child != null) return x;
    }
    return null;
  }

  /// Latest confirmed value of one vital sign with its own time (may come from an older record).
  (num, String)? latest(String key) {
    for (final x in entries) {
      if (x.entry.type != 'vital_sign' || !x.entry.isConfirmed || x.child == null) continue;
      final v = x.child![key];
      if (v is num) return (v, x.entry.careTime);
    }
    return null;
  }

  /// Vital-sign order times of today that have no confirmed vital signs within the same slot hour window [slot, next slot).
  List<String> get vitalsDue {
    final out = <String>[];
    for (final o in careOrders) {
      if (!o.text.toLowerCase().contains('vital signs')) continue;
      final slots = slotsForDay(o, nowIso)..sort();
      for (var i = 0; i < slots.length; i++) {
        if (ms(slots[i]) > ms(nowIso)) break;
        final end = i + 1 < slots.length ? ms(slots[i + 1]) : ms(nowIso) + 1;
        if (ms(nowIso) >= end) continue; // only the current slot is shown as pending
        final has = entries.any((x) => x.entry.type == 'vital_sign' && x.entry.isConfirmed && ms(x.entry.careTime) >= ms(slots[i]) && ms(x.entry.careTime) < end);
        if (!has) out.add(slots[i]);
      }
    }
    return out;
  }

  List<EntryX> get ioToday => [for (final x in entries) if (x.entry.type == 'intake_output' && x.entry.isConfirmed && x.child != null && x.entry.careTime.substring(0, 10) == nowIso.substring(0, 10)) x];
  (num, num, num) get io => ioTotals(ioToday.map((x) => x.io));

  EntryX? get criticalLab => entries.where((x) => x.entry.type == 'lab_event' && x.entry.isConfirmed && x.child != null && x.lab.status == 'critical').firstOrNull;
}

PatientFacts? loadFacts(Store s, String patientId, String nowIso) {
  final p = s.get('patient', patientId);
  if (p == null) return null;
  final enc = s.where('encounter', 'patient_id', patientId).map(Encounter.new).firstOrNull;
  final entries = listPatientEntries(s, patientId);
  final orders = enc == null ? <ActiveOrder>[] : [for (final o in s.where('active_order', 'encounter_id', enc.id)) if (o['status'] == 'active') ActiveOrder(o)];
  final meds = [for (final x in entries) if (x.entry.type == 'med_admin') x];
  final due = <DueDose>[
    for (final o in orders)
      if (isMedOrder(o) && orderGroup(o) == OrderGroup.scheduled)
        for (final sl in slotStatuses(o, nowIso, meds))
          if (sl.status == 'due') DueDose(o, sl.time, isHighAlert(o.drugName)),
  ]..sort((a, b) => a.time.compareTo(b.time));
  return PatientFacts(Patient(p), enc, s.where('allergy', 'patient_id', patientId).map(Allergy.new).toList(), orders, entries, due, nowIso);
}

List<PatientFacts> loadWard(Store s, String nowIso) {
  final out = [for (final p in s.all('patient')) loadFacts(s, p['id'] as String, nowIso)!];
  out.sort((a, b) => a.bed.compareTo(b.bed));
  return out;
}

Practitioner? staffById(Store s, String? id) {
  final r = id == null ? null : s.get('practitioner', id);
  return r == null ? null : Practitioner(r);
}

String staffName(Store s, String? id) => staffById(s, id)?.title ?? (id ?? '—');

/// Short name as the designs show it: "S. Jenkins, RN"
String staffShort(Store s, String? id) {
  final p = staffById(s, id);
  if (p == null) return id ?? '—';
  final parts = p.name.split(' ');
  final n = parts.length < 2 ? p.name : '${parts.first[0]}. ${parts.last}';
  return p.isAdmin ? n : '$n, ${p.role}';
}

/// One-line text for any entry.
String entrySummary(EntryX x) {
  if (x.child == null) return x.entry.type;
  switch (x.entry.type) {
    case 'vital_sign':
      final v = x.vital;
      return [if (v.sys != null) 'BP ${v.sys}/${v.dia ?? '?'}', if (v.heartRate != null) 'Pulse ${v.heartRate}', if (v.spo2 != null) 'SpO2 ${v.spo2}%', if (v.tempC != null) 'Temp ${v.tempC}'].join(' · ');
    case 'med_admin':
      final m = x.med;
      final amount = m.event == 'rate_changed' ? '${formatDose(m.rate)} ${m.rateUnit ?? ''}' : m.doseGiven != null ? '${formatDose(m.doseGiven)} ${m.doseGivenUnit ?? ''}' : '';
      return '${m.drugName} ${kEventLabel[m.event]?.toLowerCase() ?? m.event} $amount'.trim();
    case 'intake_output':
      return '${x.io.direction == 'in' ? 'In' : 'Out'}: ${ioLabel(x.io.direction, x.io.category)} ${formatDose(x.io.volumeMl)} mL';
    case 'note':
      return '${noteLabel(x.note.category)}${x.note.scoreName != null ? ' (${x.note.scoreName} ${x.note.scoreValue})' : ''}';
    case 'lab_event':
      final l = x.lab;
      return '${l.testName}: ${labLabel(l.status)}${l.valueNum != null ? ' ${formatDose(l.valueNum)} ${l.unit ?? ''}' : l.valueText != null ? ' ${l.valueText}' : ''}'.trim();
  }
  return x.entry.type;
}

/// Photo quality hints, port of web src/lib/photoQuality.ts. Technical image checks only; they never block.
class PhotoQuality {
  /// none | too_dark | glare | blurry
  final String problem;
  final List<String> hints;
  final double brightness, sharpness;
  final int shortSide, width, height;
  const PhotoQuality(this.problem, this.hints, this.brightness, this.sharpness, this.shortSide, this.width, this.height);
}

/// [gray] = brightness 0–255 of a reduced copy (w × h); sizes are the full picture's.
PhotoQuality assessQuality(List<double> gray, int w, int h, int fullWidth, int fullHeight) {
  var sum = 0.0;
  for (final v in gray) {
    sum += v;
  }
  final brightness = sum / (w * h);
  var n = 0, mean = 0.0, m2 = 0.0;
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      final i = y * w + x;
      final lap = gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      n++;
      final d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }
  final sharpness = n > 1 ? m2 / (n - 1) : 0.0;
  final short = fullWidth < fullHeight ? fullWidth : fullHeight;
  final hints = <String>[];
  var problem = 'none';
  if (brightness < 55) {
    problem = 'too_dark';
    hints.add('Photo looks dark. More light may help.');
  } else if (brightness > 240) {
    problem = 'glare';
    hints.add('Photo looks washed out or has glare.');
  }
  if (sharpness < 60) {
    if (problem == 'none') problem = 'blurry';
    hints.add('Photo may be blurry. Hold still and retake.');
  }
  if (short < 600) hints.add('Photo is small. Small writing may be hard to read.');
  return PhotoQuality(problem, hints, brightness, sharpness, short, fullWidth, fullHeight);
}
