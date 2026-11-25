import 'dart:convert';

import '../core/util.dart';
import '../data/schema.dart';

/// FHIR R4 export, ported from web src/lib/fhir.ts (same mapping, same ids, same structural checks).
/// One Bundle (collection) as a FILE. Nothing is sent anywhere. Base FHIR R4 core vital-signs profiles; US Core is not claimed.
const _base = 'https://clinbridge.example/fhir';
const Doc _tag = {'system': 'https://clinbridge.example/fhir/tags', 'code': 'downtime-documentation', 'display': 'Documented during EHR downtime'};
const Doc _practiceTag = {'system': 'http://terminology.hl7.org/CodeSystem/v3-ActReason', 'code': 'HTEST', 'display': 'test health data'};
const _loinc = 'http://loinc.org', _ucum = 'http://unitsofmeasure.org', _vs = 'http://hl7.org/fhir/StructureDefinition/';

Doc _ref(String type, String id) => {'reference': '$type/$id'};
Doc _qty(num v, String unit, String code) => {'value': v, 'unit': unit, 'system': _ucum, 'code': code};
Doc _code(String code, String display) => {
      'coding': [
        {'system': _loinc, 'code': code, 'display': display}
      ],
      'text': display,
    };
Doc _text(String t) => {'text': t};
const Doc _vitalCat = {
  'coding': [
    {'system': 'http://terminology.hl7.org/CodeSystem/observation-category', 'code': 'vital-signs', 'display': 'Vital Signs'}
  ]
};

const List<(String, String, String, String, String, String?)> _vitalCodes = [
  ('heart_rate', '8867-4', 'Heart rate', '/min', '/min', 'heartrate'),
  ('resp_rate', '9279-1', 'Respiratory rate', '/min', '/min', 'resprate'),
  ('temp_c', '8310-5', 'Body temperature', 'Cel', 'Cel', 'bodytemp'),
  ('spo2', '2708-6', 'Oxygen saturation in Arterial blood', '%', '%', 'oxygensat'),
  ('pain_0_10', '72514-3', 'Pain severity - 0-10 verbal numeric rating [Score] - Reported', '{score}', '{score}', null),
  ('glucose_mgdl', '2339-0', 'Glucose [Mass/volume] in Blood', 'mg/dL', 'mg/dL', null),
  ('o2_flow_lpm', '3151-8', 'Inhaled oxygen flow rate', 'L/min', 'L/min', null),
];

Doc buildBundle({required List<Doc> patients, required List<Doc> encounters, required List<Doc> allergies, required List<Doc> orders, required List<Doc> practitioners, required List<EntryX> entries, required String exportedAt, required Map<String, String> deviceLabels}) {
  final res = <Doc>[];
  Doc meta(String? profile) => {if (profile != null) 'profile': ['$_vs$profile'], 'tag': [_tag, _practiceTag]};
  void add(Doc r, [String? profile]) => res.add({...r, 'meta': meta(profile), 'text': narrative(r)});
  final encOf = {for (final e in encounters) e['patient_id'] as String: Encounter(e)};

  for (final p in patients.map(Patient.new)) {
    add({
      'resourceType': 'Patient', 'id': p.id,
      'identifier': [
        {'type': {'coding': [{'system': 'http://terminology.hl7.org/CodeSystem/v2-0203', 'code': 'MR', 'display': 'Medical record number'}], 'text': 'MRN'}, 'value': p.mrn}
      ],
      'name': [{'family': p.family, 'given': [p.given]}], 'gender': p.sex, 'birthDate': p.birthDate,
    });
  }
  for (final e in encounters.map(Encounter.new)) {
    add({
      'resourceType': 'Encounter', 'id': e.id, 'status': 'in-progress',
      'class': {'system': 'http://terminology.hl7.org/CodeSystem/v3-ActCode', 'code': 'IMP', 'display': 'inpatient encounter'},
      'subject': _ref('Patient', e.patientId), 'period': {'start': e.admitTime},
      if (e.bed != null) 'location': [{'location': {'display': '${e.unit}, bed ${e.bed}'}}],
    });
  }
  for (final p in practitioners.map(Practitioner.new)) {
    add({'resourceType': 'Practitioner', 'id': p.id, 'name': [{'text': p.name}], 'active': p.active});
  }
  for (final row in allergies) {
    final a = Allergy(row);
    if (a.isNone) continue;
    add({
      'resourceType': 'AllergyIntolerance', 'id': row['id'],
      'clinicalStatus': {'coding': [{'system': 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', 'code': a.status}]},
      'patient': _ref('Patient', row['patient_id'] as String), 'code': _text(a.substance),
      if (a.reaction != null) 'reaction': [{'manifestation': [_text(a.reaction!)], if (a.severity != null) 'severity': a.severity}],
    });
  }
  final orderIds = {for (final o in orders) o['id']};
  for (final o in orders.map(ActiveOrder.new)) {
    if (o.type != 'med' && o.type != 'iv') continue;
    final enc = encounters.where((e) => e['id'] == o.encounterId).map(Encounter.new).firstOrNull;
    if (enc == null) continue;
    add({
      'resourceType': 'MedicationRequest', 'id': o.id, 'status': o.status == 'active' ? 'active' : 'unknown', 'intent': 'order',
      'medicationCodeableConcept': _text(o.drugName ?? o.text), 'subject': _ref('Patient', enc.patientId), 'encounter': _ref('Encounter', enc.id),
      'dosageInstruction': [{'text': o.text}],
    });
  }

  for (final x in entries) {
    final e = x.entry;
    // Never confirmed (a draft, or a draft put aside as a mistake): not part of the record, not exported.
    if (e.isDraft || e.confirmedAt == null || x.child == null) continue;
    final enc = encOf[e.patientId];
    final obs = e.isConfirmed ? 'final' : 'entered-in-error';
    final common = <String, Object?>{
      'subject': _ref('Patient', e.patientId), if (enc != null) 'encounter': _ref('Encounter', enc.id), 'effectiveDateTime': e.careTime,
      'performer': [_ref('Practitioner', e.performerId)],
    };
    Doc prov(String type, String id) => _provenance(e, type, id, deviceLabels);
    if (e.type == 'vital_sign') {
      final v = x.vital;
      final parts = <(Doc, String?)>[];
      if (v.sys != null && v.dia != null) {
        parts.add(({
          'resourceType': 'Observation', 'id': '${e.id}-bp', 'status': obs, 'category': [_vitalCat], 'code': _code('85354-9', 'Blood pressure panel with all children optional'), ...common,
          'component': [
            {'code': _code('8480-6', 'Systolic blood pressure'), 'valueQuantity': _qty(v.sys!, 'mm[Hg]', 'mm[Hg]')},
            {'code': _code('8462-4', 'Diastolic blood pressure'), 'valueQuantity': _qty(v.dia!, 'mm[Hg]', 'mm[Hg]')},
          ],
        }, 'bp'));
      }
      for (final c in _vitalCodes) {
        final val = x.child![c.$1];
        if (val is num) {
          parts.add(({'resourceType': 'Observation', 'id': '${e.id}-${c.$1.replaceAll('_', '')}', 'status': obs, 'category': [_vitalCat], 'code': _code(c.$2, c.$3), ...common, 'valueQuantity': _qty(val, c.$4, c.$5)}, c.$6));
        }
      }
      if (v.consciousness != null) parts.add(({'resourceType': 'Observation', 'id': '${e.id}-consc', 'status': obs, 'category': [_vitalCat], 'code': _text('Level of consciousness (AVPU)'), ...common, 'valueString': v.consciousness}, null));
      if (v.o2Device != null) parts.add(({'resourceType': 'Observation', 'id': '${e.id}-o2dev', 'status': obs, 'category': [_vitalCat], 'code': _text('Oxygen delivery method'), ...common, 'valueString': v.o2Device}, null));
      for (final p in parts) {
        add(p.$1, p.$2);
      }
      for (final p in parts) {
        add(prov('Observation', p.$1['id'] as String));
      }
      continue;
    }
    String? target;
    if (e.type == 'med_admin') {
      final m = x.med;
      final given = m.event == 'administered' || m.event == 'rate_changed';
      final dose = m.doseGiven != null && m.doseGivenUnit != null ? {'dose': {'value': m.doseGiven, 'unit': m.doseGivenUnit}} : const <String, Object?>{};
      final rate = m.rate != null && m.rateUnit != null ? {'rateQuantity': {'value': m.rate, 'unit': m.rateUnit}} : const <String, Object?>{};
      add({
        'resourceType': 'MedicationAdministration', 'id': e.id, 'status': !e.isConfirmed ? 'entered-in-error' : given ? 'completed' : 'not-done',
        if (!given && m.reason != null) 'statusReason': [_text('${m.event}: ${m.reason}')],
        'medicationCodeableConcept': _text(m.drugName), 'subject': common['subject'], if (enc != null) 'context': _ref('Encounter', enc.id), 'effectiveDateTime': e.careTime,
        'performer': [{'actor': _ref('Practitioner', e.performerId)}],
        if (m.orderId != null && orderIds.contains(m.orderId)) 'request': _ref('MedicationRequest', m.orderId!),
        if (m.doubleCheckedBy != null) 'note': [{'text': 'Second nurse check: ${m.doubleCheckedBy}'}],
        if (dose.isNotEmpty || rate.isNotEmpty) 'dosage': {if (m.route != null) 'route': _text(m.route!), if (m.site != null) 'site': _text(m.site!), ...dose, ...rate},
      });
      target = 'MedicationAdministration';
    } else if (e.type == 'intake_output') {
      final io = x.io;
      final start = x.child!['start_time'], end = x.child!['end_time'];
      final period = start != null && end != null;
      add({
        'resourceType': 'Observation', 'id': e.id, 'status': obs, 'code': _text('Fluid ${io.direction == 'in' ? 'intake' : 'output'}: ${io.category}'),
        for (final k in common.entries) if (!(period && k.key == 'effectiveDateTime')) k.key: k.value,
        'valueQuantity': _qty(io.volumeMl, 'mL', 'mL'),
        if (period) 'effectivePeriod': {'start': start, 'end': end}, if (io.method != null) 'method': _text(io.method!),
      });
      target = 'Observation';
    } else if (e.type == 'note') {
      final n = x.note;
      if (n.category == 'risk_score' && n.scoreValue != null) {
        add({'resourceType': 'Observation', 'id': '${e.id}-score', 'status': obs, 'code': _text(n.scoreName ?? 'Risk score'), ...common, 'valueInteger': n.scoreValue, 'note': [{'text': n.text}]});
        add(prov('Observation', '${e.id}-score'));
      }
      add({
        'resourceType': 'DocumentReference', 'id': e.id, 'status': e.isConfirmed ? 'current' : 'entered-in-error', 'type': _text('Nursing note: ${n.category}'), 'subject': common['subject'], 'date': e.entryTime,
        'author': [_ref('Practitioner', e.performerId)], 'content': [{'attachment': {'contentType': 'text/plain', 'data': base64Encode(utf8.encode(n.text))}}],
        if (enc != null) 'context': {'encounter': [_ref('Encounter', enc.id)]},
      });
      target = 'DocumentReference';
    } else if (e.type == 'lab_event') {
      final l = x.lab;
      final result = l.status == 'resulted' || l.status == 'critical';
      add({
        'resourceType': 'Observation', 'id': e.id, 'status': !e.isConfirmed ? 'entered-in-error' : result ? 'final' : 'registered',
        'category': [{'coding': [{'system': 'http://terminology.hl7.org/CodeSystem/observation-category', 'code': 'laboratory'}]}],
        'code': _text(l.testName), ...common,
        if (l.valueNum != null) 'valueQuantity': {'value': l.valueNum, if (l.unit != null) 'unit': l.unit} else if (l.valueText != null) 'valueString': l.valueText,
        if (l.status == 'critical') 'interpretation': [{'coding': [{'system': 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', 'code': 'AA', 'display': 'Critical abnormal'}], 'text': 'Critical result phoned by the lab'}],
        if (l.calledTo != null) 'note': [{'text': 'Told: ${l.calledTo}. Read back: ${l.readBack == true ? 'yes' : 'no'}.'}],
      });
      target = 'Observation';
    }
    if (target != null) add(prov(target, e.id));
  }
  return {
    'resourceType': 'Bundle', 'id': 'export-${exportedAt.replaceAll(RegExp('[^0-9]'), '').substring(0, 14)}', 'type': 'collection', 'timestamp': exportedAt, 'meta': meta(null),
    'entry': [for (final r in res) {'fullUrl': '$_base/${r['resourceType']}/${r['id']}', 'resource': r}],
  };
}

Doc _provenance(Entry e, String type, String id, Map<String, String> labels) {
  final ents = [
    if (e.rawInputKind == 'photo') {'role': 'source', 'what': {'display': 'Paper form photo ${e.rawInputRef} (kept on the downtime device)'}},
    if (e.supersedesId != null) {'role': 'revision', 'what': {'display': 'Corrects record ${e.supersedesId}${e.changeReason != null ? ': ${e.changeReason}' : ''}'}},
  ];
  Doc agent(String code, Doc who) => {'type': {'coding': [{'system': 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', 'code': code}]}, 'who': who};
  return {
    'resourceType': 'Provenance', 'id': 'prov-$id', 'target': [_ref(type, id)], 'occurredDateTime': e.careTime, 'recorded': e.entryTime,
    'agent': [agent('author', _ref('Practitioner', e.performerId)), agent('enterer', {'display': 'Device ${labels[e.deviceId] ?? e.deviceId} #${e.counter}'})],
    if (ents.isNotEmpty) 'entity': ents,
    if (e.status == 'entered-in-error' && e.changeReason != null) 'reason': [_text('Entered in error: ${e.changeReason}')],
  };
}

/* ------------------------------ Structural check ------------------------------ */

const kValidatorScope = 'ClinBridge structural check (FHIR R4: required fields, ids, codes, dates, references). Not the HL7 validator, not US Core.';
final _idRe = RegExp(r'^[A-Za-z0-9\-.]{1,64}$');
final _dt = RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$');
final _date = RegExp(r'^\d{4}-\d{2}-\d{2}$');
const Map<String, List<String>> _required = {
  'Patient': [], 'Encounter': ['status', 'class', 'subject'], 'Practitioner': [], 'AllergyIntolerance': ['patient'],
  'MedicationRequest': ['status', 'intent', 'medicationCodeableConcept', 'subject'],
  'MedicationAdministration': ['status', 'medicationCodeableConcept', 'subject', 'effectiveDateTime'],
  'Observation': ['status', 'code', 'subject'], 'DocumentReference': ['status', 'content', 'subject'], 'Provenance': ['target', 'recorded', 'agent'],
};
const Map<String, List<String>> _status = {
  'Observation': ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'],
  'MedicationAdministration': ['in-progress', 'not-done', 'on-hold', 'completed', 'entered-in-error', 'stopped', 'unknown'],
  'DocumentReference': ['current', 'superseded', 'entered-in-error'],
  'Encounter': ['planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled', 'entered-in-error', 'unknown'],
  'MedicationRequest': ['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown'],
};

/// Checks the file text itself (parsed again), so what is checked is what is saved.
List<String> validateBundleText(String json) {
  try {
    return validateBundle((jsonDecode(json) as Map).cast<String, Object?>());
  } on FormatException {
    return ['The file is not readable JSON'];
  }
}

List<String> validateBundle(Doc b) {
  final errs = <String>[];
  if (b['resourceType'] != 'Bundle') errs.add('Not a Bundle');
  if (b['type'] != 'collection') errs.add('Bundle.type must be collection');
  if (b['timestamp'] is! String || !_dt.hasMatch(b['timestamp'] as String)) errs.add('Bundle.timestamp missing or not a dateTime');
  final entries = [for (final e in (b['entry'] as List? ?? const [])) (e as Map).cast<String, Object?>()];
  final keys = <String>{};
  for (final e in entries) {
    final r = e['resource'] as Map;
    final key = '${r['resourceType']}/${r['id']}';
    if (!keys.add(key)) errs.add('Duplicate resource $key');
    if (e['fullUrl'] != '$_base/$key') errs.add('$key: fullUrl does not match');
  }
  void walk(Object? node, String where, void Function(String k, Object? v, String path) cb) {
    if (node is List) {
      for (var i = 0; i < node.length; i++) {
        walk(node[i], '$where[$i]', cb);
      }
    } else if (node is Map) {
      node.forEach((k, v) {
        cb('$k', v, '$where.$k');
        walk(v, '$where.$k', cb);
      });
    }
  }

  final timeKey = RegExp(r'(DateTime|^recorded|^start|^end|^date)$');
  for (final e in entries) {
    final r = (e['resource'] as Map).cast<String, Object?>();
    final type = '${r['resourceType']}', key = '$type/${r['id']}';
    final req = _required[type];
    if (req == null) {
      errs.add('$key: unsupported resource type');
      continue;
    }
    if (r['id'] is! String || !_idRe.hasMatch(r['id'] as String)) errs.add('$key: invalid id');
    for (final f in req) {
      if (r[f] == null || (r[f] is List && (r[f] as List).isEmpty)) errs.add('$key: missing $f');
    }
    final st = _status[type];
    if (st != null && !st.contains(r['status'])) errs.add('$key: invalid status "${r['status']}"');
    if (type == 'Patient' && r['birthDate'] != null && !_date.hasMatch('${r['birthDate']}')) errs.add('$key: birthDate not a date');
    if (type == 'Observation' && r['effectiveDateTime'] == null && r['effectivePeriod'] == null) errs.add('$key: missing effective time');
    if (((r['meta'] as Map?)?['tag'] as List? ?? const []).isEmpty) errs.add('$key: missing downtime tag');
    walk(r, key, (k, v, path) {
      if (k == 'reference' && v is String && !keys.contains(v)) errs.add('$path: reference $v not in bundle');
      if (timeKey.hasMatch(k) && v is String && !_dt.hasMatch(v)) errs.add('$path: not a dateTime');
      if (k == 'coding' && v is List) {
        for (final c in v) {
          if ((c as Map)['system'] == null || c['code'] == null) errs.add('$path: coding needs system and code');
        }
      }
      if ((k == 'valueQuantity' || k == 'dose' || k == 'rateQuantity') && v is Map && v['value'] is! num) errs.add('$path: quantity value must be a number');
    });
  }
  return errs;
}

/* ------------------------------ Narrative ------------------------------ */

String _esc(String t) => t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

String _show(Object? v) {
  if (v == null) return '';
  if (v is num) return '${jsNumbers(v)}';
  if (v is String || v is bool) return '$v';
  if (v is List) return v.map(_show).where((x) => x.isNotEmpty).join('; ');
  final o = (v as Map).cast<String, Object?>();
  if (o['text'] is String && !o.containsKey('div')) return o['text'] as String;
  if (o['coding'] is List && (o['coding'] as List).isNotEmpty) {
    final c = (o['coding'] as List).first as Map;
    return _show(c['display'] ?? c['code']);
  }
  if (o['reference'] is String) return '${o['reference']}${o['display'] is String ? ' (${o['display']})' : ''}';
  if (o.containsKey('value') && (o.containsKey('unit') || o.containsKey('code'))) return '${_show(o['value'])} ${_show(o['unit'] ?? o['code'])}'.trim();
  return o.entries.map((e) => _show(e.value).isEmpty ? '' : '${e.key}: ${_show(e.value)}').where((x) => x.isNotEmpty).join(', ');
}

/// Narrative made only from the resource's own fields (FHIR status "generated").
Doc narrative(Doc r) {
  final rows = r.entries
      .where((e) => !['resourceType', 'id', 'meta', 'text'].contains(e.key))
      .map((e) => (e.key, _show(e.value)))
      .where((e) => e.$2.isNotEmpty)
      .map((e) => '<li><b>${_esc(e.$1)}</b>: ${_esc(e.$2)}</li>')
      .join();
  return {'status': 'generated', 'div': '<div xmlns="http://www.w3.org/1999/xhtml"><p><b>${_esc('${r['resourceType']}')}</b> ${_esc('${r['id'] ?? ''}')}</p><ul>$rows</ul></div>'};
}
