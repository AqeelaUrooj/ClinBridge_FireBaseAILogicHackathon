import '../core/clock.dart';
import '../core/util.dart';
import '../data/schema.dart';

/// Fluids, notes and lab events, ported from web src/lib/charting.ts. Only structural checks block.
const List<(String, String)> kIoIn = [('oral', 'By mouth'), ('tube', 'Tube feed'), ('iv', 'IV fluid'), ('ivpb', 'IV piggyback (small IV bag)'), ('other', 'Other')];
const List<(String, String)> kIoOut = [('urine', 'Urine'), ('emesis', 'Vomit'), ('ng', 'NG tube (nose-to-stomach)'), ('drain', 'Drain'), ('other', 'Other')];
const List<String> kIoMethods = ['Measured', 'Estimated', 'Pump reading'];

String ioLabel(String dir, String cat) => (dir == 'in' ? kIoIn : kIoOut).where((c) => c.$1 == cat).map((c) => c.$2).firstOrNull ?? cat;

class FormResult {
  final Doc values;
  final Map<String, String> errors;
  final List<String> warnings;
  const FormResult(this.values, this.errors, [this.warnings = const []]);
  bool get ok => errors.isEmpty;
}

FormResult validateIo({required String direction, required String category, required String volume, String? method, String? startIso, String? endIso, String? orderId, required int nowMs}) {
  final e = <String, String>{};
  if (direction != 'in' && direction != 'out') e['direction'] = 'Pick In or Out';
  if (!(direction == 'out' ? kIoOut : kIoIn).any((c) => c.$1 == category)) e['category'] = 'Pick what kind';
  final v = volume.trim();
  if (!RegExp(r'^\d{1,5}$').hasMatch(v) || int.parse(v) <= 0) e['volume'] = 'Whole number of mL above 0';
  if ((startIso == null) != (endIso == null)) e['end'] = 'Give both start and end, or neither';
  if (startIso != null && endIso != null && ms(endIso) < ms(startIso)) e['end'] = 'End is before start';
  if (endIso != null && ms(endIso) > nowMs + 60000) e['end'] = 'Cannot be in the future';
  if (method != null && method.isNotEmpty && !kIoMethods.contains(method)) e['method'] = 'Pick a method';
  return FormResult({
    'direction': direction == 'out' ? 'out' : 'in', 'category': category, 'volume_ml': int.tryParse(v) ?? 0,
    'method': method == null || method.isEmpty ? null : method, 'start_time': startIso, 'end_time': endIso, 'rate': null, 'rate_unit': null, 'order_id': orderId,
  }, e);
}

/// Plain sums of confirmed entries; no clinical interpretation. (in, out, balance)
(num, num, num) ioTotals(Iterable<IntakeOutput> rows) {
  num i = 0, o = 0;
  for (final r in rows) {
    if (r.direction == 'in') {
      i += r.volumeMl;
    } else {
      o += r.volumeMl;
    }
  }
  return (i, o, i - o);
}

const List<(String, String)> kNoteCategories = [
  ('assessment', 'Assessment'), ('intervention', 'Care given'), ('communication', 'Talked to doctor / team'),
  ('risk_score', 'Risk score'), ('restraint_check', 'Restraint check'), ('other', 'Other'),
];
String noteLabel(String c) => kNoteCategories.where((x) => x.$1 == c).map((x) => x.$2).firstOrNull ?? c;

FormResult validateNote({required String category, required String text, String scoreName = '', String scoreValue = ''}) {
  final e = <String, String>{};
  if (!kNoteCategories.any((c) => c.$1 == category)) e['category'] = 'Pick a type';
  if (text.trim().isEmpty) e['text'] = 'Write the note';
  final sv = scoreValue.trim(), risk = category == 'risk_score', okScore = RegExp(r'^\d{1,3}$').hasMatch(sv);
  if (risk && scoreName.trim().isEmpty) e['scoreName'] = 'Which score (as written on the form)';
  if (risk && !okScore) e['scoreValue'] = 'Whole number';
  return FormResult({'category': category, 'text': text.trim(), 'score_name': risk ? scoreName.trim() : null, 'score_value': risk && okScore ? int.parse(sv) : null}, e);
}

const List<(String, String)> kLabStatuses = [('pending', 'Waiting for sample'), ('collected', 'Sample taken'), ('resulted', 'Result back'), ('critical', 'Critical result (phoned by lab)')];
String labLabel(String s) => kLabStatuses.where((x) => x.$1 == s).map((x) => x.$2).firstOrNull ?? s;

FormResult validateLab({required String testName, required String status, String? orderId, String? specimenIso, String value = '', String unit = '', String calledTo = '', bool readBack = false, required int nowMs, String? careTime}) {
  final e = <String, String>{};
  final w = <String>[];
  if (testName.trim().isEmpty) e['testName'] = 'Which test';
  if (!kLabStatuses.any((s) => s.$1 == status)) e['status'] = 'Pick a status';
  if (specimenIso != null && ms(specimenIso) > nowMs + 60000) e['specimenTime'] = 'Cannot be in the future';
  final raw = value.trim(), isNum = RegExp(r'^\d{1,6}(\.\d{1,4})?$').hasMatch(raw), result = status == 'resulted' || status == 'critical';
  if (result && raw.isEmpty) e['value'] = 'Enter the result as given by the lab';
  if (status == 'critical') {
    if (calledTo.trim().isEmpty) w.add('Who was told about this critical result is not filled in');
    if (!readBack) w.add('Read-back is not ticked');
  }
  return FormResult({
    'order_id': orderId, 'test_name': testName.trim(), 'status': status, 'value_num': raw.isNotEmpty && isNum ? num.parse(raw) : null,
    'value_text': raw.isNotEmpty && !isNum ? raw : null, 'unit': unit.trim().isEmpty ? null : unit.trim(), 'order_time': null,
    'specimen_time': specimenIso, 'specimen_source': null, 'result_time': result ? careTime : null,
    'called_to': calledTo.trim().isEmpty ? null : calledTo.trim(), 'read_back': status == 'critical' ? readBack : null,
  }, e, w);
}
