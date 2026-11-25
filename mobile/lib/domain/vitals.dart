import '../config/policy.dart';
import '../core/util.dart';
import '../data/schema.dart';

/// Vital-sign validation, ported from web src/lib/vitals.ts: STRUCTURAL rules block; CLINICAL warnings never block
/// (the nurse ticks that the value was re-checked). No early-warning score is calculated.
class VitalRule {
  final String key, label, unit;
  final bool integer;
  final int decimals;
  final (int, int)? scale;
  const VitalRule(this.key, this.label, this.unit, {this.integer = true, this.decimals = 0, this.scale});
}

const Map<String, VitalRule> kVitalRules = {
  'bp_systolic': VitalRule('bp_systolic', 'Top blood pressure', 'mmHg'),
  'bp_diastolic': VitalRule('bp_diastolic', 'Bottom blood pressure', 'mmHg'),
  'heart_rate': VitalRule('heart_rate', 'Pulse', '/min'),
  'resp_rate': VitalRule('resp_rate', 'Breathing', '/min'),
  'temp_c': VitalRule('temp_c', 'Temperature', '°C', integer: false, decimals: 1),
  'spo2': VitalRule('spo2', 'Oxygen level', '%', scale: (0, 100)),
  'pain_0_10': VitalRule('pain_0_10', 'Pain', '/10', scale: (0, 10)),
  'glucose_mgdl': VitalRule('glucose_mgdl', 'Blood sugar', 'mg/dL', integer: false, decimals: 1),
  'o2_flow_lpm': VitalRule('o2_flow_lpm', 'Oxygen flow', 'L/min', integer: false, decimals: 1),
};

/// The four documented consciousness options (AVPU).
const List<String> kAvpu = ['Alert', 'Responds to voice', 'Responds to pain', 'Unresponsive'];

class VitalsForm {
  /// Raw text as typed, by schema key. Missing or blank = not assessed (never 0).
  final Map<String, String> raw;
  final String? o2Device, consciousness;
  const VitalsForm(this.raw, {this.o2Device, this.consciousness});
}

class VitalsResult {
  /// Schema values: null = not assessed.
  final Doc values;
  final Map<String, String> errors;

  /// key -> text. key 'bp_order' = bottom not lower than top.
  final Map<String, String> warnings;
  const VitalsResult(this.values, this.errors, this.warnings);
  bool get ok => errors.isEmpty;
}

final _number = RegExp(r'^\d{1,4}(\.\d+)?$');
const _measures = ['bp_systolic', 'bp_diastolic', 'heart_rate', 'resp_rate', 'temp_c', 'spo2', 'pain_0_10', 'glucose_mgdl'];

VitalsResult validateVitals(VitalsForm form) {
  final errors = <String, String>{};
  String? clean(String? s) => s == null || s.trim().isEmpty ? null : s.trim();
  final values = <String, Object?>{
    'temp_c': null, 'heart_rate': null, 'resp_rate': null, 'bp_systolic': null, 'bp_diastolic': null, 'spo2': null,
    'o2_device': clean(form.o2Device), 'o2_flow_lpm': null, 'pain_0_10': null, 'glucose_mgdl': null,
    'consciousness': clean(form.consciousness), 'weight_kg': null, 'raw_text': null,
  };
  for (final r in kVitalRules.values) {
    final raw = (form.raw[r.key] ?? '').trim();
    if (raw.isEmpty) continue;
    if (raw.startsWith('-')) {
      errors[r.key] = 'Cannot be negative';
      continue;
    }
    if (!_number.hasMatch(raw)) {
      errors[r.key] = 'Numbers only (up to 4 digits)';
      continue;
    }
    final n = num.parse(raw);
    final places = raw.contains('.') ? raw.split('.')[1].length : 0;
    if (r.integer && places > 0) {
      errors[r.key] = 'Whole number only';
      continue;
    }
    if (places > r.decimals) {
      errors[r.key] = 'Up to ${r.decimals} decimal place';
      continue;
    }
    final s = r.scale;
    if (s != null && (n < s.$1 || n > s.$2)) {
      errors[r.key] = 'Must be ${s.$1}–${s.$2}${r.unit == '%' ? '%' : ''}';
      continue;
    }
    values[r.key] = n;
  }
  final sys = values['bp_systolic'] as num?, dia = values['bp_diastolic'] as num?;
  if ((sys == null) != (dia == null) && errors['bp_systolic'] == null && errors['bp_diastolic'] == null) {
    errors[sys == null ? 'bp_systolic' : 'bp_diastolic'] = 'Enter both blood pressure numbers';
  }
  if (values['o2_flow_lpm'] != null && values['o2_device'] == null) errors['o2_flow_lpm'] = 'Say how oxygen is given';
  if (values['consciousness'] != null && !kAvpu.contains(values['consciousness'])) errors['consciousness'] = 'Pick one of the four options';
  final has = _measures.any((k) => values[k] != null) || values['consciousness'] != null;
  if (!has && errors.isEmpty) errors['form'] = 'Enter at least one measurement';

  final warnings = <String, String>{};
  for (final r in kVitalRules.values) {
    final v = values[r.key] as num?;
    if (isUnusual(r.key, v)) warnings[r.key] = '${r.label} $v ${r.unit} is unusual';
  }
  if (sys != null && dia != null && dia >= sys) warnings['bp_order'] = 'Bottom blood pressure is not lower than the top';
  return VitalsResult(values, errors, warnings);
}

/// Outside the configured (not clinically approved) warning range. Display only.
bool isUnusual(String key, num? v) {
  final r = kVitalWarnings[key];
  return v != null && r != null && (v < r.$1 || v > r.$2);
}

String vitalsSummary(VitalSign v) {
  final p = <String>[
    if (v.sys != null) 'BP ${v.sys}/${v.dia ?? '?'}',
    if (v.heartRate != null) 'Pulse ${v.heartRate}',
    if (v.tempC != null) 'Temp ${v.tempC}',
    if (v.spo2 != null) 'SpO2 ${v.spo2}%',
    if (v.glucose != null) 'Blood sugar ${v.glucose}',
  ];
  if (v.respRate != null && p.length < 3) p.add('Breathing ${v.respRate}');
  return p.isEmpty ? 'Vitals' : p.take(4).join(' · ');
}
