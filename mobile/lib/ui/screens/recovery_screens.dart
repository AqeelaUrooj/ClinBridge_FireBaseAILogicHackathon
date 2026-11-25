import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/audit.dart';
import '../../data/repos/entries.dart';
import '../../data/repos/ops.dart' as ops;
import '../../data/schema.dart';
import '../../data/store.dart';
import '../../domain/charting.dart';
import '../../domain/facts.dart';
import '../../domain/fhir.dart';
import '../../domain/meds.dart';
import '../../domain/recovery.dart';
import '../../domain/vitals.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';
import 'admin_nav.dart';

const _green = Color(0xFF277453), _amber = C.caution;

/// What went wrong, in the words of the core (or of Android).
String _why(Object e) => e is AppError ? e.message : e is PlatformException ? (e.message ?? e.code) : '$e';

/// "Ward 4B Med/Surg" -> "Ward 4B", "4 West (Medical-Surgical)" -> "4 West".
String _shortUnit(String u) => u.replaceAll(RegExp(r'\s*(\(.*\)|Med/Surg)$'), '');

/* ------------------------------ Shared admin header ------------------------------ */

class _AdminHeader extends StatelessWidget {
  final String title, subtitle;
  final String? rightRail;
  const _AdminHeader({required this.title, required this.subtitle, this.rightRail});

  void _checkStore(BuildContext c) {
    final s = AppScope.read(c).store;
    try {
      final structure = s.integrity(), pages = s.cipherIntegrity(), chain = verifyChain(s.all('audit_log'));
      final ok = structure == 'ok' && pages.isEmpty && chain.ok;
      toast(c, 'Database structure: $structure. Encrypted pages: ${pages.isEmpty ? 'no problems found' : '${pages.length} problems'}. Change log: ${chain.verified} of ${chain.total} rows verified${chain.ok ? '' : ', broken at row ${chain.brokenAtSeq}'}.',
          icon: ok ? Symbols.verified_user : Symbols.warning, error: !ok);
    } catch (e) {
      toast(c, _why(e), error: true, icon: Symbols.warning);
    }
  }

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0A000000), offset: Offset(0, 1), blurRadius: 8)]),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            color: C.primaryContainer,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(children: [
              const Dot(C.tertiaryFixedDim),
              const SizedBox(width: 8),
              Expanded(child: Text('PRACTICE: ENCRYPTED ON THIS PHONE', style: T.badge.c(C.tertiaryFixed), maxLines: 1, overflow: TextOverflow.ellipsis)),
              if (rightRail != null) ...[const SizedBox(width: 8), Text(rightRail!, style: T.mono(11, w: FontWeight.w500, line: 14).c(C.onPrimaryContainer).tr(.02)), const SizedBox(width: 6)],
              const Ic(Symbols.lock, size: 15, color: C.tertiaryFixedDim),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 8, 0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 56),
              child: Row(children: [
                Expanded(
                  child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Flexible(child: Text(title, style: T.headlineSm.s(17, 21.25), maxLines: 1, overflow: TextOverflow.ellipsis)),
                      const SizedBox(width: 8),
                      Tag('ADMIN', bg: C.tertiaryContainer, fg: C.tertiaryFixed, style: T.badge.s(10, 14), pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                    ]),
                    Text(subtitle, style: T.labelSm.c(C.secondary), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ]),
                ),
                Tap(label: 'Check the encrypted store and the change log', onTap: () => _checkStore(context), child: const Ic(Symbols.verified_user, size: 22, color: C.secondary)),
                Tap(
                  label: 'More',
                  onTap: () => Go.more(context),
                  child: Container(width: 32, height: 32, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull), child: const Ic(Symbols.admin_panel_settings, size: 18, color: C.onPrimary)),
                ),
              ]),
            ),
          ),
        ]),
      );
}

Widget _cap(double max, Widget child) => ConstrainedBox(constraints: BoxConstraints(maxWidth: max), child: child);

/// Bottom sheet above the keyboard.
Future<T?> _openSheet<T>(BuildContext context, WidgetBuilder b) => showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      backgroundColor: C.surfaceLowest,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(8))),
      builder: (c) => Padding(padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(c).bottom), child: SafeArea(top: false, child: b(c))),
    );

/* ------------------------------ Recovery worklist ------------------------------ */

/// One field of a stored second reading beside the record (port of web lookRows).
class LookRow {
  final String key, label, record, reading, unit;
  final num? a, b;
  const LookRow(this.key, this.label, this.record, this.reading, this.unit, this.a, this.b);
  bool get differs => record != reading;
}

List<LookRow> lookRows(String type, Doc? child, Doc? reading) {
  if (child == null || reading == null) return const [];
  final rows = <LookRow>[];
  void add(String key, String label, String unit, String Function(Doc o) show) {
    if (!reading.containsKey(key)) return;
    rows.add(LookRow(key, label, show(child), show(reading), unit, child[key] is num ? child[key] as num : null, reading[key] is num ? reading[key] as num : null));
  }

  String text(Object? v) => v == null || v == '' ? '—' : '$v';
  if (type == 'med_admin') {
    add('drug_name', 'Drug', '', (o) => text(o['drug_name']));
    add('event', 'What happened', '', (o) => kEventLabel['${o['event']}'] ?? text(o['event']));
    add('dose_given', 'Dose given', child['dose_given_unit'] == reading['dose_given_unit'] ? '${child['dose_given_unit'] ?? ''}' : '', (o) => o['dose_given'] == null ? '—' : '${formatDose(o['dose_given'] as num)} ${text(o['dose_given_unit'])}');
    add('route', 'Route', '', (o) => text(o['route']));
  } else if (type == 'vital_sign') {
    for (final r in kVitalRules.values) {
      add(r.key, r.label, r.unit, (o) => o[r.key] == null ? '—' : '${formatDose(o[r.key] as num)} ${r.unit}');
    }
    add('o2_device', 'Oxygen given by', '', (o) => text(o['o2_device']));
    add('consciousness', 'Awake?', '', (o) => text(o['consciousness']));
  } else if (type == 'intake_output') {
    add('direction', 'In or out', '', (o) => text(o['direction']));
    add('category', 'Kind', '', (o) => text(o['category']));
    add('volume_ml', 'Amount', 'mL', (o) => o['volume_ml'] == null ? '—' : '${formatDose(o['volume_ml'] as num)} mL');
  }
  return rows;
}

/// A second reading shown beside the record.
class _Other {
  final String label, value, unit, sub, tag;
  const _Other(this.label, this.value, this.unit, this.sub, this.tag);
}

class _WorkRow {
  final WorklistItem w;
  final Patient? p;
  final Encounter? enc;
  final EntryX? x;
  final List<String> reasons;
  final String value, unit;
  final String? difference;
  final List<_Other> others;
  final Doc? resolution;
  const _WorkRow(this.w, this.p, this.enc, this.x, this.reasons, this.value, this.unit, this.difference, this.others, this.resolution);
  bool get signed => w.signedOffAt != null;
  bool get flagged => w.flags.isNotEmpty;
  bool get held => x?.child != null && x!.entry.type == 'med_admin' && x!.med.event == 'held';
}

/// (value, unit) of a record for the comparison rail.
(String, String) _valueOf(EntryX x, {String? vitalKey}) {
  final c = x.child;
  if (c == null) return ('No values', '');
  switch (x.entry.type) {
    case 'vital_sign':
      final v = x.vital;
      if (vitalKey != null && vitalKey != 'bp') return (c[vitalKey] is num ? formatDose(c[vitalKey] as num) : 'Not assessed', kVitalRules[vitalKey]!.unit);
      if (v.sys != null) return ('${v.sys}/${v.dia ?? '—'}', 'mmHg');
      for (final r in kVitalRules.values) {
        if (c[r.key] is num) return (formatDose(c[r.key] as num), r.unit);
      }
      return (v.consciousness ?? 'Not assessed', '');
    case 'med_admin':
      final m = x.med;
      if (m.event == 'rate_changed') return (grouped(m.rate), m.rateUnit ?? '');
      if (m.doseGiven != null) return (formatDose(m.doseGiven), '${m.doseGivenUnit ?? 'no unit'} · ${m.route ?? 'route not recorded'}');
      return (kEventLabel[m.event] ?? m.event, m.route ?? '');
    case 'intake_output':
      return (grouped(x.io.volumeMl), 'mL');
    case 'lab_event':
      return (x.lab.valueNum != null ? formatDose(x.lab.valueNum) : x.lab.valueText ?? labLabel(x.lab.status), x.lab.unit ?? '');
    default:
      return (noteLabel(x.note.category), '');
  }
}

List<_WorkRow> _loadRows(Store s) {
  final orders = {for (final o in s.all('active_order')) o['id'] as String: ActiveOrder(o)};
  final patients = {for (final p in s.all('patient')) p['id'] as String: Patient(p)};
  final encs = {for (final e in s.all('encounter')) e['patient_id'] as String: Encounter(e)};
  final entries = <String, List<EntryX>>{};
  final res = <String, Doc>{for (final r in s.all('m_resolution')) r['item_id'] as String: r};
  final rows = <_WorkRow>[];
  for (final w in s.all('worklist_item').map(WorklistItem.new)) {
    final mine = entries.putIfAbsent(w.patientId, () => listPatientEntries(s, w.patientId));
    final x = newestVersion(w.entryId, mine);
    final confirmed = [for (final e in mine) if (e.entry.isConfirmed) e];
    final why = x != null && x.entry.isConfirmed && w.flags.isNotEmpty ? flagEntry(x, confirmed, orders) : null;
    final reasons = [...?why?.reasons];
    final others = <_Other>[];
    var value = '', unit = '';
    String? diff;
    if (x != null) {
      (value, unit) = _valueOf(x);
      final differs = [
        if (w.secondLookStatus == 'mismatch')
          for (final l in lookRows(x.entry.type, x.child, w.secondLookReading))
            if (l.differs) l,
      ];
      if (differs.isNotEmpty) {
        const label = 'SECOND LOOK (SIMULATED PRACTICE DATA)', from = 'Stored with the practice dataset';
        final vit = x.entry.type == 'vital_sign', o = w.secondLookReading!;
        if (vit && differs.every((l) => l.unit == 'mmHg')) {
          others.add(_Other(label, '${o['bp_systolic'] ?? '—'}/${o['bp_diastolic'] ?? '—'}', 'mmHg', from, 'Simulated'));
        } else if (vit) {
          (value, unit) = _valueOf(x, vitalKey: differs.first.key);
          others.add(_Other(label, differs.first.b == null ? differs.first.reading : formatDose(differs.first.b), differs.first.unit, '${differs.first.label} • $from', 'Simulated'));
        } else if (differs.first.key == 'dose_given') {
          others.add(_Other(label, formatDose(differs.first.b), '${o['dose_given_unit'] ?? ''}${o['route'] == null ? '' : ' · ${o['route']}'}', from, 'Simulated'));
        } else {
          others.add(_Other(label, differs.first.reading, '', '${differs.first.label} • $from', 'Simulated'));
        }
        final nums = [for (final l in differs) if (l.a != null && l.b != null) '${formatDose((l.b! - l.a!).abs())} ${l.unit}'.trim()];
        diff = nums.isEmpty ? null : nums.join(' / ');
        reasons.addAll([for (final l in differs) '${l.label}: the record says ${l.record}, the second look (simulated) read ${l.reading}.']);
      }
      for (final id in (why?.related ?? const <String>[]).take(2)) {
        final o = confirmed.where((e) => e.entry.id == id).firstOrNull;
        if (o == null) continue;
        final (v, u) = _valueOf(o);
        final med = o.entry.type == 'med_admin' && o.child != null;
        others.add(_Other('OTHER RECORD: ${med ? o.med.drugName : (kCategoryLabel[kCategory[o.entry.type]] ?? '').toUpperCase()}', v, u, _times(s, o), 'Related'));
        if (med && x.entry.type == 'med_admin' && x.child != null && x.med.orderId == o.med.orderId) {
          final min = ((ms(x.entry.careTime) - ms(o.entry.careTime)).abs() / 60000).round();
          diff = '${min ~/ 60} h ${min % 60} min';
        }
      }
      if (others.isEmpty && w.flags.isNotEmpty && x.entry.type == 'vital_sign' && x.child != null) {
        final o = _snapshotOther(s, x);
        if (o != null) {
          others.add(o.$1);
          diff = o.$2;
          (value, unit) = _valueOf(x, vitalKey: o.$3);
        }
      }
      if (w.flags.isNotEmpty && x.entry.type == 'med_admin' && x.child != null && x.med.doseDue != null && x.med.doseGiven != null && (x.med.doseDue != x.med.doseGiven || x.med.doseDueUnit != x.med.doseGivenUnit)) {
        reasons.add('The order says ${formatDose(x.med.doseDue)} ${x.med.doseDueUnit ?? ''}; the record says ${formatDose(x.med.doseGiven)} ${x.med.doseGivenUnit ?? ''}.');
      }
      if (x.entry.id != w.entryId) reasons.add('This record was corrected after the list was built. The newest version is shown.');
      if (!x.entry.isConfirmed) reasons.add('The record is now marked "${x.entry.status}".');
    }
    if (w.flags.isNotEmpty && reasons.isEmpty) reasons.add('${w.flags.map((f) => kFlagText[f] ?? f).join(', ')} (stored with the list).');
    rows.add(_WorkRow(w, patients[w.patientId], encs[w.patientId], x, reasons, value, unit, diff, others, res[w.id]));
  }
  rows.sort((a, b) {
    int rank(_WorkRow r) => r.signed ? 2 : (r.flagged ? 0 : 1);
    var r = rank(a) - rank(b);
    if (r == 0) r = b.w.priority - a.w.priority;
    return r == 0 ? a.w.id.compareTo(b.w.id) : r;
  });
  return rows;
}

/// Last value from before the outage for the same measure: (other, difference, vital key).
(_Other, String, String)? _snapshotOther(Store s, EntryX x) {
  final snaps = [for (final r in s.where('snapshot_result', 'patient_id', x.entry.patientId).map(SnapshotResult.new)) if (r.kind == 'vital' && r.valueNum != null) r];
  SnapshotResult? find(String part) => snaps.where((r) => r.name.toLowerCase().contains(part)).firstOrNull;
  const label = 'PRE-OUTAGE SNAPSHOT (PATIENT LIST)';
  final sys = find('systolic'), dia = find('diastolic');
  if (x.vital.sys != null && x.vital.dia != null && sys != null && dia != null && sys.time == dia.time) {
    return (
      _Other(label, '${formatDose(sys.valueNum)}/${formatDose(dia.valueNum)}', 'mmHg', '${hm(sys.time)} • Downtime snapshot', 'Snapshot'),
      '${formatDose((sys.valueNum! - x.vital.sys!).abs())} / ${formatDose((dia.valueNum! - x.vital.dia!).abs())} mmHg',
      'bp',
    );
  }
  for (final (key, part) in const [('heart_rate', 'heart rate'), ('temp_c', 'temperature'), ('spo2', 'oxygen saturation')]) {
    final o = find(part), v = x.child![key] as num?;
    if (o == null || v == null) continue;
    final u = kVitalRules[key]!.unit;
    return (_Other(label, formatDose(o.valueNum), u, '${hm(o.time)} • Downtime snapshot', 'Snapshot'), '${formatDose((o.valueNum! - v).abs())} $u', key);
  }
  return null;
}

/// "14:15 by S. Jenkins, RN" and the time it was saved.
String _times(Store s, EntryX x) => '${hm(x.entry.careTime)} by ${staffShort(s, x.entry.performerId)}\nSaved ${hm(x.entry.entryTime)}';

/// FHIR resources of one record, exactly as the file would hold them.
List<Doc> resourcesOf(Store s, EntryX x, String nowIso) {
  final b = buildBundle(
    patients: s.all('patient'), encounters: s.all('encounter'), allergies: const [], orders: s.all('active_order'), practitioners: s.all('practitioner'),
    entries: [x], exportedAt: nowIso, deviceLabels: {for (final d in s.all('device')) d['id'] as String: d['label'] as String},
  );
  const base = {'Patient', 'Encounter', 'Practitioner', 'MedicationRequest'};
  return [for (final e in b['entry'] as List) if (!base.contains(((e as Map)['resource'] as Map)['resourceType'])) (e['resource'] as Map).cast<String, Object?>()];
}

String _fhirKinds(EntryX x) => switch (x.entry.type) {
      'med_admin' => 'MedicationAdministration',
      'note' => x.child != null && x.note.category == 'risk_score' && x.note.scoreValue != null ? 'DocumentReference, Observation' : 'DocumentReference',
      _ => 'Observation',
    };

/// The change log as a file (every row, in order).
String auditCsv(Store s) {
  String q(Object? v) => '"${'${v ?? ''}'.replaceAll('"', '""')}"';
  final b = StringBuffer('seq,time,user_id,user,device_id,action,meaning,entity,before_hash,after_hash,prev_row_hash\r\n');
  for (final r in s.all('audit_log')) {
    b.write('${[r['seq'], r['time'], r['user_id'], staffName(s, r['user_id'] as String?), r['device_id'], r['action'], auditLabel('${r['action']}'), r['entity'], r['before_hash'], r['after_hash'], r['prev_row_hash']].map(q).join(',')}\r\n');
  }
  return b.toString();
}

/// Saves the CSV with Android's own screen; recorded only after a real save.
Future<void> _saveAuditCsv(BuildContext context) async {
  final app = AppScope.read(context);
  try {
    final rows = app.store.count('audit_log');
    final bytes = Uint8List.fromList(utf8.encode(auditCsv(app.store)));
    final file = 'clinbridge-PRACTICE-audit-${app.nowIso.substring(0, 16).replaceAll(RegExp('[:T]'), '-')}.csv';
    ops.recordSaving(app.ctx(), 'audit_log', file, bytes);
    final name = await app.native.saveFile(file, 'text/csv', bytes);
    if (name == null) {
      currentToast.value = ToastMessage('Not saved. The save screen was closed.', Symbols.info, false);
      return;
    }
    ops.recordFile(app.ctx(), action: 'file_saved', entity: 'audit_log', after: {'file': name, 'rows': rows, 'bytes': bytes.length, 'sha256': sha256Hex(bytes)});
    app.saved();
    currentToast.value = ToastMessage('Saved "$name" ($rows rows). The file is not encrypted.', Symbols.check_circle, false);
  } catch (e) {
    currentToast.value = ToastMessage('The change log file: ${_why(e)}', Symbols.error, true);
  }
}

enum _Filter { all, review, waiting, signed, meds, vitals }

class RecoveryScreen extends StatefulWidget {
  const RecoveryScreen({super.key});
  @override
  State<RecoveryScreen> createState() => _RecoveryScreenState();
}

class _RecoveryScreenState extends State<RecoveryScreen> {
  _Filter filter = _Filter.all;
  List<_WorkRow> rows = const [];
  int? _version;
  bool busy = false;
  String? error;

  void _load(AppState app) {
    if (_version == app.dataVersion) return;
    _version = app.dataVersion;
    rows = _loadRows(app.store);
  }

  void _build() {
    final app = AppScope.read(context);
    try {
      final n = ops.buildWorklist(app.ctx());
      app.saved();
      setState(() => error = null);
      toast(context, n > 0 ? '$n record${n == 1 ? '' : 's'} added to the list.' : 'No new records to add.', icon: n > 0 ? Symbols.check_circle : Symbols.info);
    } catch (e) {
      setState(() => error = _why(e));
    }
  }

  Future<void> _signOff(_WorkRow r, {required String title, required String button, String decision = 'record_kept'}) async {
    final ok = await _openSheet<bool>(context, (_) => _ReasonSheet(itemId: r.w.id, title: title, button: button, decision: decision));
    if (ok == true && mounted) toast(context, 'Signed off. The record and the other reading are unchanged.');
  }

  void _signOffPlain(_WorkRow r) {
    final app = AppScope.read(context);
    try {
      ops.signOffItem(app.ctx(), r.w.id);
      app.saved();
      toast(context, 'Signed off.');
    } catch (e) {
      toast(context, _why(e), error: true, icon: Symbols.error);
    }
  }

  void _openRecord(_WorkRow r) {
    final x = r.x;
    if (x == null) return;
    withPatient(context, r.w.patientId, (c) => Go.entry(c, r.w.patientId, x.entry.id));
  }

  void _json(_WorkRow r) {
    final app = AppScope.read(context);
    final list = resourcesOf(app.store, r.x!, app.nowIso);
    final text = jsonText(list, indent: '  ');
    _openSheet<void>(
      context,
      (c) => ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * .8),
        child: Padding(
          padding: const EdgeInsets.all(S.lg),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Expanded(child: Text('FHIR resources of this record', style: T.headlineSm)),
              Tag('PRACTICE', bg: C.tertiaryContainer, fg: C.tertiaryFixed, style: T.badge.s(10, 14)),
            ]),
            const SizedBox(height: 2),
            Text('${list.length} resource${list.length == 1 ? '' : 's'}, as they go into the file. Nothing is sent.', style: T.bodySm.c(C.secondary)),
            const SizedBox(height: S.md),
            Flexible(
              child: Container(
                padding: const EdgeInsets.all(S.sm),
                decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
                child: SingleChildScrollView(child: Text(text, style: T.mono(11, line: 15))),
              ),
            ),
            const SizedBox(height: S.md),
            Btn('Close', kind: BtnKind.quiet, onTap: () => Navigator.pop(c)),
          ]),
        ),
      ),
    );
  }

  bool _in(_WorkRow r, _Filter f) => switch (f) {
        _Filter.all => true,
        _Filter.review => !r.signed && r.flagged,
        _Filter.waiting => !r.signed && !r.flagged,
        _Filter.signed => r.signed,
        _Filter.meds => r.w.category == 'meds',
        _Filter.vitals => r.w.category == 'vitals',
      };

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return const ColoredBox(color: C.surface);
    final online = app.phase == ops.Phase.online;
    if (online) _load(app);
    final pr = WorkProgress.of([for (final r in rows) r.w]);
    final shown = [for (final r in rows) if (_in(r, filter)) r];
    return PhonePage(
      statusColor: C.primaryContainer,
      header: _AdminHeader(title: 'ClinBridge Admin', subtitle: 'Admin Recovery Reconciliation', rightRail: '${app.store.count('entry')} RECORDS'),
      pad: const EdgeInsets.fromLTRB(0, 5, 0, 20),
      nav: const AdminNav(active: 2),
      footer: online ? _footer(pr) : null,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const Dot(C.secondaryFixedDim, size: 10),
              const SizedBox(width: 6),
              Expanded(child: Text('RECONCILIATION PHASE', style: T.badge.c(C.secondary))),
              const SizedBox(width: 8),
              _cap(200, Tag(app.downtime == null ? 'NO DOWNTIME OPEN' : 'SESSION ${app.downtime!.id}', fg: C.secondary, style: T.labelSm)),
            ]),
            const SizedBox(height: 4),
            Text('Recovery Worklist — ${_shortUnit(app.unit)}', style: T.headlineMd.tr(-.025)),
            const SizedBox(height: 4),
            Text('Check each downtime record against its sources before the FHIR file is prepared. Nothing is merged or sent.', style: T.bodySm.c(C.onSurfaceVariant)),
            const SizedBox(height: 16),
            if (online) _metrics(pr) else _closed(app),
          ]),
        ),
        if (online) ...[
          const SizedBox(height: 9),
          _chips(),
          const SizedBox(height: 9),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (error != null) ...[_ErrorBox(error!), const SizedBox(height: 14)],
              if (rows.isEmpty)
                Box(
                  shadow: true,
                  pad: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('The list is empty', style: T.headlineSm),
                    const SizedBox(height: 4),
                    Text('Build the list from every confirmed record of this downtime. Fixed rules mark possible duplicates, time conflicts and missing fields; a person decides.', style: T.bodySm.c(C.onSurfaceVariant)),
                    const SizedBox(height: 12),
                    Btn('Build list', icon: Symbols.playlist_add, onTap: _build),
                  ]),
                )
              else if (shown.isEmpty)
                Box(shadow: true, pad: const EdgeInsets.all(14), child: Text('Nothing here', style: T.bodyMd.c(C.secondary)))
              else
                for (var i = 0; i < shown.length; i++) ...[if (i > 0) const SizedBox(height: 14), _card(app, shown[i])],
              if (rows.isNotEmpty) ...[
                const SizedBox(height: 14),
                Btn('Add New Downtime Records', kind: BtnKind.quiet, icon: Symbols.playlist_add, onTap: _build),
              ],
            ]),
          ),
        ],
      ],
    );
  }

  Widget _closed(AppState app) => Box(
        shadow: true,
        pad: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [const Ic(Symbols.cloud_off, size: 22, color: C.secondary), const SizedBox(width: 8), Expanded(child: Text('Recovery is not open', style: T.headlineSm))]),
          const SizedBox(height: 6),
          Text('Recovery starts after an admin clears the network (Back online). Now: ${ops.kPhaseLabel[app.phase]}.', style: T.bodyMd.c(C.onSurfaceVariant)),
          const SizedBox(height: 12),
          Btn('Open the downtime checklist', icon: Symbols.checklist, onTap: () => Go.checklist(context)),
        ]),
      );

  Widget _metrics(WorkProgress pr) {
    final part = pr.total == 0 ? 0.0 : pr.done / pr.total;
    Widget stat(String label, String value, {Color bg = C.surfaceLow, Color lc = C.secondary, Color vc = C.onSurface}) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: bg, borderRadius: R.rBase),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label, style: T.labelSm.c(lc)), Text(value, style: T.labelMd.c(vc).bold)]),
          ),
        );
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('SIGN-OFF PROGRESS', style: T.labelSm.c(C.secondary).semi),
              Text('${formatDose(double.parse((part * 100).toStringAsFixed(1)))}% Completed', style: T.headlineSm.bold),
            ]),
          ),
          const SizedBox(width: 8),
          _cap(
            150,
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: C.tertiaryFixed.withValues(alpha: .4), borderRadius: R.rFull),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Ic(Symbols.task_alt, size: 16, color: C.onTertiaryFixedVariant, fill: 1),
                const SizedBox(width: 6),
                Flexible(child: Text('${pr.done} Signed Off', style: T.labelSm.c(C.onTertiaryFixedVariant).bold)),
              ]),
            ),
          ),
        ]),
        const SizedBox(height: 8),
        Semantics(label: '${pr.done} of ${pr.total} signed off', child: Bar(part, color: C.tertiaryContainer, height: 8)),
        const SizedBox(height: 16),
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            stat('Total Entries', '${pr.total} Records'),
            const SizedBox(width: 8),
            stat('No Flag', '${pr.plain} Waiting', vc: C.onTertiaryFixedVariant),
            const SizedBox(width: 8),
            stat('Requires Sign-off', '${pr.flagged} Flagged', bg: C.errorContainer.withValues(alpha: .6), lc: C.error, vc: C.error),
          ]),
        ),
      ]),
    );
  }

  Widget _chips() {
    Widget chip(_Filter f, String label, {bool dot = false, Color bg = C.surfaceContainer, Color fg = C.onSurface}) {
      final on = f == filter;
      final n = rows.where((r) => _in(r, f)).length;
      final t = on ? C.onPrimary : fg;
      return Padding(
        padding: const EdgeInsets.only(right: 8),
        child: Tap(
          label: '$label, $n',
          selected: on,
          onTap: () => setState(() => filter = f),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: on ? C.primaryContainer : bg, borderRadius: R.rFull, boxShadow: on ? shadowSm : null),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (dot) ...[const Dot(C.error, size: 6), const SizedBox(width: 6)],
              Text(label, style: T.labelMd.c(t)),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                decoration: BoxDecoration(color: on ? const Color(0x33FFFFFF) : dot ? C.error.withValues(alpha: .15) : C.surfaceHigh, borderRadius: R.rFull),
                child: Text('$n', style: T.labelMd.s(11, 18).c(t).w(dot ? FontWeight.w700 : FontWeight.w600)),
              ),
            ]),
          ),
        ),
      );
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.only(left: 16, right: 8),
      child: Row(children: [
        chip(_Filter.all, 'All'),
        chip(_Filter.review, 'Needs Review', dot: true, bg: C.errorContainer, fg: C.onErrorContainer),
        chip(_Filter.waiting, 'Waiting'),
        chip(_Filter.signed, 'Signed Off'),
        chip(_Filter.meds, 'Medications'),
        chip(_Filter.vitals, 'Vitals'),
      ]),
    );
  }

  Widget _footer(WorkProgress pr) => Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x141C2536), offset: Offset(0, -4), blurRadius: 16)]),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Btn('Prepare FHIR Recovery File (${pr.done} Signed Off)', kind: BtnKind.navy, radius: R.lg, icon: Symbols.output_circle, iconColor: C.tertiaryFixed, style: T.labelMd.bold, onTap: () => Go.export(context)),
          Tap(
            label: 'Export offline audit log (CSV)',
            onTap: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    await _saveAuditCsv(context);
                    if (mounted) setState(() => busy = false);
                  },
            expand: true,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Ic(Symbols.download, size: 15, color: C.secondary),
              const SizedBox(width: 4),
              Flexible(child: Text(busy ? 'Saving…' : 'Export Offline Audit Log (CSV)', style: T.labelSm.c(C.secondary))),
            ]),
          ),
        ]),
      );

  /* ---- Cards ---- */

  Widget _card(AppState app, _WorkRow r) {
    final rail = r.signed
        ? _green
        : r.held
            ? C.error
            : r.flagged
                ? _amber
                : _green;
    return Container(
      key: ValueKey('wl-${r.w.entryId}'),
      decoration: const BoxDecoration(borderRadius: R.rXl, boxShadow: shadowSm),
      child: ClipRRect(
        borderRadius: R.rXl,
        child: ColoredBox(
          color: C.surfaceLowest,
          child: Stack(children: [
            Positioned(left: 0, top: 0, bottom: 0, width: 4, child: ColoredBox(color: rail)),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _patientHead(r),
                const SizedBox(height: 12),
                if (r.x == null)
                  Text('Record ${r.w.entryId} was not found.', style: T.bodySm.c(C.error))
                else if (!r.signed && r.held)
                  _heldBody(app, r)
                else if (!r.signed && r.flagged)
                  _flagBody(app, r)
                else
                  _plainBody(app, r),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _patientHead(_WorkRow r) {
    final (Color bg, Color fg, IconData icon, String text) = r.signed
        ? (C.tertiaryFixed.withValues(alpha: .5), C.onTertiaryFixedVariant, Symbols.check_circle, 'Signed off')
        : r.held
            ? (C.errorContainer, C.onErrorContainer, Symbols.gpp_maybe, ['Held dose', ...r.w.flags.map((f) => kFlagText[f] ?? f)].join(', '))
            : r.flagged
                ? (const Color(0xFFFFF8EB), const Color(0xFF8F620E), Symbols.warning, r.w.flags.map((f) => kFlagText[f] ?? f).join(', '))
                : (C.tertiaryFixed.withValues(alpha: .5), C.onTertiaryFixedVariant, Symbols.schedule, 'No flag, waiting');
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(spacing: 8, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Text(r.p?.fullName ?? r.w.patientId, style: T.headlineSm.s(17, 21.25).bold),
              Tag('Bed ${r.enc?.bed ?? '—'}', fg: C.secondary, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
            ]),
            Text('MRN: ${r.p?.mrn ?? '—'}', style: T.mono(11, w: FontWeight.w500, line: 14).c(C.secondary).tr(.02)),
          ]),
        ),
        const SizedBox(width: 8),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 124),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: bg, borderRadius: R.rFull),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Ic(icon, size: 13, color: fg),
              const SizedBox(width: 4),
              Flexible(child: Text(text.toUpperCase(), style: T.badge.s(10, 14).c(fg))),
            ]),
          ),
        ),
      ]),
    );
  }

  String _recordTitle(EntryX x) => 'RECORD: ${(kCategoryLabel[kCategory[x.entry.type]] ?? x.entry.type).toUpperCase()}';

  Widget _rail(String label, String value, String unit, String sub, String tag, {required bool strong}) => Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: strong ? C.surfaceLowest : C.surfaceHigh.withValues(alpha: .6), borderRadius: R.rBase),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: T.labelSm.s(10, 14).c(C.secondary).semi),
              Text.rich(TextSpan(style: T.vital.c(strong ? C.onSurface : C.secondary).tr(-.025), children: [TextSpan(text: value), if (unit.isNotEmpty) TextSpan(text: ' $unit', style: T.unit.c(C.secondary))])),
              Text(sub, style: T.bodySm.c(C.secondary)),
            ]),
          ),
          const SizedBox(width: 8),
          Tag(tag.toUpperCase(), bg: strong ? C.tertiaryFixed : C.surfaceContainer, fg: strong ? C.onTertiaryFixed : C.secondary, style: T.badge.s(10, 14)),
        ]),
      );

  Widget _flagBody(AppState app, _WorkRow r) {
    final x = r.x!;
    final source = x.entry.rawInputKind == 'photo' ? 'LOCAL DOWNTIME ENTRY, PAPER PHOTO' : 'LOCAL DOWNTIME ENTRY, TYPED';
    final drug = x.entry.type == 'med_admin' && x.child != null ? x.med.drugName : null;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
        decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('${_recordTitle(x)}${drug == null ? '' : ' · $drug'}', style: T.labelSm.c(C.secondary).semi.tr(.05))),
            if (r.difference != null) ...[
              const SizedBox(width: 8),
              _cap(
                170,
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(color: C.errorContainer.withValues(alpha: .5), borderRadius: R.rBase),
                  child: Text('Difference: ${r.difference}', style: T.labelSm.c(C.onErrorContainer)),
                ),
              ),
            ],
          ]),
          const SizedBox(height: 10),
          _rail(source, r.value, r.unit, _times(app.store, x), x.entry.isConfirmed ? 'Confirmed' : x.entry.status, strong: true),
          for (final o in r.others) ...[const SizedBox(height: 8), _rail(o.label, o.value, o.unit, o.sub, o.tag, strong: false)],
          for (final t in r.reasons) _reason(t),
        ]),
      ),
      const SizedBox(height: 12),
      Btn('Keep Record (Reason Needed)', icon: Symbols.verified, iconSize: 18, height: 44, onTap: () => _signOff(r, title: 'Keep this record', button: 'Keep record and sign off')),
      const SizedBox(height: 2),
      Row(children: [
        Expanded(child: Unavailable(reason: 'Readings are never merged. Keep the record with a reason, or open it and correct it.', child: _small(Symbols.call_merge, 'Merge Readings'))),
        const SizedBox(width: 8),
        Expanded(child: Unavailable(reason: 'No monitor is connected, so there is no waveform.', child: _small(Symbols.manage_search, 'Inspect Waveform'))),
      ]),
      Btn('Open Record', kind: BtnKind.quiet, bg: C.surfaceContainer, height: 40, icon: Symbols.open_in_new, iconSize: 17, iconColor: C.secondary, style: T.labelMd.medium, onTap: () => _openRecord(r)),
    ]);
  }

  Widget _reason(String t) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(padding: EdgeInsets.only(top: 2), child: Ic(Symbols.info, size: 15, color: _amber)),
          const SizedBox(width: 4),
          Expanded(child: Text.rich(TextSpan(style: T.bodySm.c(C.onSurfaceVariant), children: [TextSpan(text: 'Flag Reason: ', style: T.bodySm.c(C.onSurfaceVariant).bold), TextSpan(text: t)]))),
        ]),
      );

  Widget _small(IconData icon, String text) => Container(
        constraints: const BoxConstraints(minHeight: 48),
        alignment: Alignment.center,
        child: Container(
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rBase),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [Ic(icon, size: 17, color: C.secondary), const SizedBox(width: 4), Flexible(child: Text(text, style: T.labelMd.medium))]),
        ),
      );

  Widget _heldBody(AppState app, _WorkRow r) {
    final x = r.x!, m = x.med;
    final f = loadFacts(app.store, r.w.patientId, app.nowIso);
    final order = m.orderId == null ? null : app.store.get('active_order', m.orderId!);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
        decoration: BoxDecoration(color: C.errorContainer.withValues(alpha: .2), borderRadius: R.rLg),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('MED ORDER: ${order == null ? m.drugName : doseLine(ActiveOrder(order))}', style: T.labelSm.c(C.error).semi.tr(.05))),
            const SizedBox(width: 8),
            Tag('HELD AT BEDSIDE', bg: C.error, fg: C.onError, style: T.badge.s(10, 14), pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 1)),
          ]),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rBase),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                const Ic(Symbols.priority_high, size: 16, color: C.error),
                const SizedBox(width: 6),
                Expanded(child: Text('Allergies on record: ${f?.allergyText ?? 'not recorded'}', style: T.labelSm.c(C.error).bold)),
              ]),
              const SizedBox(height: 6),
              Text(m.reason ?? 'No reason is recorded.', style: T.bodySm.c(C.onSurfaceVariant)),
              const SizedBox(height: 10),
              Row(children: [
                const Ic(Symbols.history_edu, size: 14, color: C.secondary),
                const SizedBox(width: 6),
                Expanded(child: Text('Held ${_times(app.store, x).replaceAll('\n', ' • ')}', style: T.labelSm.c(C.secondary))),
              ]),
            ]),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Row(children: [
              Flexible(flex: 2, child: Text('Status in FHIR file:', style: T.bodySm.c(C.secondary))),
              const SizedBox(width: 8),
              Expanded(flex: 3, child: Text('MedicationAdministration .status = "not-done"', style: T.mono(11, w: FontWeight.w700, line: 14))),
            ]),
          ),
          for (final t in r.reasons) _reason(t),
        ]),
      ),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: Btn('Sign Off Hold', kind: BtnKind.danger, height: 44, icon: Symbols.verified, iconSize: 18, onTap: () => _signOff(r, title: 'Sign off this hold', button: 'Sign off hold', decision: 'hold_signed_off'))),
        const SizedBox(width: 8),
        Expanded(child: Btn('Review Rx Note', kind: BtnKind.quiet, bg: C.surfaceContainer, height: 44, icon: Symbols.receipt_long, iconSize: 18, iconColor: C.secondary, style: T.labelMd.medium, onTap: () => _openRecord(r))),
      ]),
    ]);
  }

  /// Two facts of a record as tiles: (label, value, unit, line).
  List<(String, String, String, String)> _tiles(Store s, EntryX x) {
    if (x.child == null) return const [];
    final who = staffShort(s, x.entry.performerId), by = '${hm(x.entry.careTime)} by $who';
    switch (x.entry.type) {
      case 'vital_sign':
        final v = x.vital;
        return [
          if (v.sys != null) ('Blood pressure', '${v.sys}/${v.dia ?? '—'}', 'mmHg', by),
          if (v.heartRate != null) ('Pulse', formatDose(v.heartRate), '/min', by),
          if (v.spo2 != null) ('Oxygen level', formatDose(v.spo2), '%', by),
          if (v.tempC != null) ('Temperature', formatDose(v.tempC), '°C', by),
        ].take(2).toList();
      case 'intake_output':
        return [(x.io.direction == 'in' ? 'Intake' : 'Output', grouped(x.io.volumeMl), 'mL', ioLabel(x.io.direction, x.io.category)), ('Recorded', hm(x.entry.careTime), '', 'by $who')];
      case 'med_admin':
        final (v, u) = _valueOf(x);
        return [(x.med.drugName, v, u, kEventLabel[x.med.event] ?? x.med.event), ('Recorded', hm(x.entry.careTime), '', 'by $who')];
      default:
        return const [];
    }
  }

  Widget _plainBody(AppState app, _WorkRow r) {
    final x = r.x!, s = app.store;
    final tiles = _tiles(s, x);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
        decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text(_recordTitle(x), style: T.labelSm.c(C.secondary).semi.tr(.05))),
            const SizedBox(width: 8),
            Text('Saved ${hm(x.entry.entryTime)}', style: T.labelSm.c(C.onTertiaryFixedVariant).semi),
          ]),
          const SizedBox(height: 8),
          if (tiles.isEmpty)
            Text('${hm(x.entry.careTime)} ${entrySummary(x)}, ${staffShort(s, x.entry.performerId)}', style: T.bodyMd)
          else
            IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (var i = 0; i < tiles.length; i++) ...[
                  if (i > 0) const SizedBox(width: 8),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rBase),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(x.entry.type == 'med_admin' && i == 0 ? tiles[i].$1 : tiles[i].$1.toUpperCase(), style: T.labelSm.s(10, 14).c(C.secondary)),
                        Text.rich(TextSpan(style: T.vital, children: [TextSpan(text: tiles[i].$2), if (tiles[i].$3.isNotEmpty) TextSpan(text: ' ${tiles[i].$3}', style: T.unit.c(C.secondary))])),
                        Text(tiles[i].$4, style: T.bodySm.s(11, 16).c(C.secondary)),
                      ]),
                    ),
                  ),
                ],
              ]),
            ),
          const SizedBox(height: 10),
          Row(children: [
            Ic(r.signed ? Symbols.task_alt : Symbols.description, size: 15, color: _green),
            const SizedBox(width: 6),
            Expanded(child: Text('In the FHIR file as ${_fhirKinds(x)} + Provenance', style: T.bodySm.c(C.onSurfaceVariant))),
          ]),
          for (final t in r.reasons) if (!r.signed || !r.flagged) Text(t, style: T.bodySm.c(C.onSurfaceVariant)),
          if (r.signed) ...[
            const SizedBox(height: 6),
            Text(
              'Signed off ${hm(r.w.signedOffAt)} by ${staffShort(s, r.w.signedOffBy)}.${r.w.flags.isEmpty ? '' : ' Was flagged: ${r.w.flags.map((f) => kFlagText[f] ?? f).join(', ')}.'}${r.resolution == null ? '' : ' Reason: ${r.resolution!['reason']}'}${r.w.exportedAt == null ? '' : ' In a saved file since ${hm(r.w.exportedAt)}.'}',
              style: T.bodySm.c(C.onSurfaceVariant),
            ),
          ],
        ]),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Row(children: [
          Expanded(child: Text('Record: ${x.entry.id}', style: T.labelSm.c(C.secondary), maxLines: 1, overflow: TextOverflow.ellipsis)),
          const SizedBox(width: 8),
          Tap(
            label: 'View JSON of record ${x.entry.id}',
            onTap: () => _json(r),
            child: Row(mainAxisSize: MainAxisSize.min, children: [Text('View JSON', style: T.labelMd.c(C.primary)), const SizedBox(width: 2), const Ic(Symbols.code, size: 16, color: C.primary)]),
          ),
        ]),
      ),
      if (!r.signed)
        Row(children: [
          Expanded(child: Btn('Sign Off', kind: BtnKind.navy, height: 40, icon: Symbols.verified, iconSize: 18, onTap: () => _signOffPlain(r))),
          const SizedBox(width: 8),
          Expanded(child: Btn('Open Record', kind: BtnKind.quiet, bg: C.surfaceContainer, height: 40, style: T.labelMd.medium, onTap: () => _openRecord(r))),
        ]),
    ]);
  }
}

class _ErrorBox extends StatelessWidget {
  final String text;
  const _ErrorBox(this.text);
  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.all(S.md),
          decoration: const BoxDecoration(color: C.errorContainer, borderRadius: R.rXl),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Ic(Symbols.error, size: 20, color: C.error), const SizedBox(width: 8), Expanded(child: Text(text, style: T.bodyMd.c(C.onErrorContainer)))]),
        ),
      );
}

/// Reason for one decision. Stays open with its text when the save is refused.
class _ReasonSheet extends StatefulWidget {
  final String itemId, title, button, decision;
  const _ReasonSheet({required this.itemId, required this.title, required this.button, required this.decision});
  @override
  State<_ReasonSheet> createState() => _ReasonSheetState();
}

class _ReasonSheetState extends State<_ReasonSheet> {
  final reason = TextEditingController();
  String? error;
  bool busy = false;

  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  void _save() {
    if (busy) return;
    if (reason.text.trim().isEmpty) return setState(() => error = 'Write the reason for your decision.');
    final app = AppScope.read(context);
    setState(() => busy = true);
    try {
      ops.signOffItem(app.ctx(), widget.itemId, reason: reason.text, decision: widget.decision);
      app.saved();
      Navigator.pop(context, true);
    } catch (e) {
      setState(() {
        busy = false;
        error = _why(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return const SizedBox();
    return SingleChildScrollView(
      padding: const EdgeInsets.all(S.lg),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(widget.title, style: T.headlineSm)),
          Tag('PRACTICE', bg: C.tertiaryContainer, fg: C.tertiaryFixed, style: T.badge.s(10, 14)),
        ]),
        const SizedBox(height: 4),
        Text('The record and every other reading stay exactly as they are. Your name (${staffShort(app.store, app.user!.id)}), the time and your reason are saved in the change log.', style: T.bodySm.c(C.onSurfaceVariant)),
        const SizedBox(height: S.md),
        Container(
          padding: const EdgeInsets.all(S.md),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Field(reason, label: 'Reason', hint: 'Reason (required)', minLines: 3, maxLines: 6, maxLength: 500, onChanged: (_) => error == null ? null : setState(() => error = null)),
        ),
        if (error != null) ...[const SizedBox(height: S.sm), _ErrorBox(error!)],
        const SizedBox(height: S.md),
        Btn(widget.button, icon: Symbols.verified, busy: busy, onTap: _save),
        const SizedBox(height: S.sm),
        Btn('Cancel', kind: BtnKind.quiet, onTap: busy ? null : () => Navigator.pop(context, false)),
      ]),
    );
  }
}

/* ------------------------------ FHIR export ------------------------------ */

class ExportScreen extends StatefulWidget {
  const ExportScreen({super.key});
  @override
  State<ExportScreen> createState() => _ExportScreenState();
}

class _ExportScreenState extends State<ExportScreen> {
  ops.ExportFile? file;
  Uint8List bytes = Uint8List(0);
  bool building = false, saving = false;
  int? _version;
  String? error, info;

  /// (file name, bytes, SHA-256) of the file that was really saved.
  (String, int, String)? saved;

  String get fileName => 'clinbridge-PRACTICE-${file?.bundle['id'] ?? 'export'}.json';

  Future<void> _build() async {
    final app = AppScope.read(context);
    setState(() {
      building = true;
      error = null;
      info = null;
    });
    await Future<void>.delayed(const Duration(milliseconds: 60)); // shows "Building" before the work starts
    if (!mounted || !app.signedIn) return;
    try {
      final f = ops.prepareExport(app.store, app.nowIso);
      setState(() {
        file = f;
        bytes = Uint8List.fromList(utf8.encode(f.json));
        building = false;
      });
    } catch (e) {
      setState(() {
        building = false;
        error = 'The file could not be built: ${_why(e)}';
      });
    }
  }

  Future<void> _save() async {
    final app = AppScope.read(context);
    final f = file;
    if (f == null || saving) return;
    final problems = validateBundleText(utf8.decode(bytes)); // exactly the bytes that are handed to Android
    if (problems.isNotEmpty) return setState(() => error = 'The structure check found ${problems.length} problems. Nothing was saved.');
    final open = f.blockers;
    String n(int k, String one, String many) => '$k ${k == 1 ? one : many}';
    final ok = await confirm(
      context,
      title: open > 0 ? n(open, 'flagged item is not signed off', 'flagged items are not signed off') : 'Save an unencrypted file?',
      text: '${open > 0 ? 'You can still make a file, but the export should normally wait until they are signed off.\n\n' : ''}'
          '${f.openItems > 0 ? '${n(f.openItems, 'worklist item is', 'worklist items are')} still open in total.\n\n' : ''}'
          'The file is NOT encrypted. It holds names, medicines and notes of the fictional patients in plain text. Nothing is sent: Android asks where to save it.',
      yes: open > 0 ? 'Save with $open open' : 'Choose where to save',
      danger: open > 0,
    );
    if (!ok || !mounted || !app.signedIn) return;
    setState(() {
      saving = true;
      error = null;
      info = null;
    });
    final String? name;
    try {
      ops.recordSaving(app.ctx(), 'bundle', fileName, bytes);
      name = await app.native.saveFile(fileName, 'application/fhir+json', bytes);
    } catch (e) {
      return _end(err: 'The file was not saved: ${_why(e)}');
    }
    if (name == null) return _end(msg: 'Not saved. The save screen was closed.');
    try {
      final hash = ops.recordExport(app.ctx(), f.json, name);
      _version = app.dataVersion + 1; // our own change must not rebuild the saved file
      app.saved();
      _end(done: (name, bytes.length, hash));
    } catch (e) {
      _end(err: 'The file "$name" was saved, but the change log could not record it: ${_why(e)}');
    }
  }

  void _end({String? err, String? msg, (String, int, String)? done}) {
    if (!mounted) {
      // The app locked or the page was left meanwhile: still say what happened.
      currentToast.value = ToastMessage(err ?? msg ?? 'Saved "${done?.$1}".', err != null ? Symbols.error : Symbols.info, err != null);
      return;
    }
    setState(() {
      saving = false;
      error = err;
      info = msg;
      if (done != null) saved = done;
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final app = AppScope.of(context);
    if (!app.signedIn || app.phase != ops.Phase.online || _version == app.dataVersion || saving) return;
    _version = app.dataVersion;
    file = null;
    saved = null;
    building = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _build();
    });
  }

  String get _size => bytes.length >= 1048576 ? '${(bytes.length / 1048576).toStringAsFixed(1)} MB' : '${(bytes.length / 1024).round()} KB';

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return const ColoredBox(color: C.surface);
    final online = app.phase == ops.Phase.online, f = file;
    return PhonePage(
      statusColor: C.tertiaryContainer,
      header: _header(),
      pad: const EdgeInsets.fromLTRB(16, 2, 16, 32),
      gap: 16,
      children: [
        _stepper(app, online),
        if (!online)
          _blockedCard(app)
        else ...[
          if (error != null) _ErrorBox(error!),
          if (info != null) _note(Symbols.info, info!),
          if (f == null)
            _buildingCard()
          else ...[
            _statusCard(f),
            if (saved != null) _savedCard(),
            if (f.blockers > 0) _blockers(f),
            _breakdown(f),
            _validation(f),
            _actions(f),
          ],
          _signers(app),
        ],
      ],
    );
  }

  Widget _header() => Container(
        decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0A000000), offset: Offset(0, 1), blurRadius: 8)]),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            color: C.tertiaryContainer,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(children: [
              const Dot(C.tertiaryFixedDim),
              const SizedBox(width: 6),
              Expanded(child: Text('SAVED LOCALLY (ENCRYPTED)', style: T.badge.c(C.tertiaryFixed), maxLines: 1, overflow: TextOverflow.ellipsis)),
              Text('AES-256', style: T.labelSm.c(C.tertiaryFixedDim)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 6, 0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 64),
              child: Row(children: [
                Tap(label: 'Go back', onTap: () => Go.back(context), child: const Ic(Symbols.arrow_back, size: 24)),
                const SizedBox(width: 6),
                Expanded(
                  child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Admin FHIR Export Bundle', style: T.headlineSm.s(17, 21.25), maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Row(children: [
                      Flexible(child: Text('Downtime Records File', style: T.labelSm.c(C.secondary), maxLines: 1, overflow: TextOverflow.ellipsis)),
                      const SizedBox(width: 6),
                      Tag('PRACTICE', bg: C.tertiaryContainer, fg: C.tertiaryFixed, style: T.badge.s(10, 16), pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 1)),
                    ]),
                  ]),
                ),
                Tap(
                  label: 'About this file',
                  onTap: () => _openSheet<void>(
                    context,
                    (c) => SingleChildScrollView(
                      padding: const EdgeInsets.all(S.lg),
                      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Text('About this file', style: T.headlineSm),
                        const SizedBox(height: S.sm),
                        Text('One FHIR R4 Bundle (collection) made from the records on this phone. Drafts are left out. Corrected records and records marked as a mistake are in the file as "entered-in-error". Every resource has the test-data tag HTEST.\n\n$kValidatorScope\n\nClinBridge has no connection to a hospital system. Nothing is sent.', style: T.bodyMd.c(C.onSurfaceVariant)),
                        const SizedBox(height: S.lg),
                        Btn('Close', kind: BtnKind.quiet, onTap: () => Navigator.pop(c)),
                      ]),
                    ),
                  ),
                  child: const Ic(Symbols.info, size: 22, color: C.secondary),
                ),
                Tap(label: 'More', onTap: () => Go.more(context), child: Container(width: 32, height: 32, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull), child: const Ic(Symbols.person, size: 18, color: C.onPrimary))),
              ]),
            ),
          ),
        ]),
      );

  Widget _card(Widget child) => Box(shadow: true, pad: const EdgeInsets.all(16), child: child);

  Widget _stepper(AppState app, bool online) {
    final f = file;
    final bad = f != null && f.errors.isNotEmpty, done = saved != null, wait = online && f == null;
    final step = !online || f == null ? 1 : (bad ? 2 : 3);
    final (String word, Color wc, IconData icon) = !online
        ? ('Blocked', C.error, Symbols.block)
        : wait
            ? ('Building', C.secondary, Symbols.hourglass_top)
            : bad
                ? ('Problems', C.error, Symbols.error)
                : (done ? 'Saved' : 'Ready', C.onTertiaryFixedVariant, Symbols.verified);
    Color seg(int i) => i < step || done
        ? C.tertiaryContainer
        : i > step
            ? C.surfaceHigh
            : wait
                ? C.secondaryFixedDim
                : step == 3
                    ? C.tertiaryFixedDim
                    : C.error;
    TextStyle lab(int i) => i < step || done
        ? T.labelSm.c(C.outline).copyWith(decoration: TextDecoration.lineThrough, decorationColor: C.outline)
        : i == step
            ? T.labelSm.semi
            : T.labelSm.c(C.secondary);
    return _card(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Tag('STEP $step OF 3', bg: C.primaryContainer, fg: C.onPrimary, style: T.badge.s(10, 14)),
        const SizedBox(width: 6),
        Expanded(child: Text('FHIR Export Bundle', style: T.headlineSm)),
        const SizedBox(width: 6),
        ConstrainedBox(constraints: const BoxConstraints(maxWidth: 88), child: Text('${_shortUnit(app.unit)} Recovery', style: T.labelSm.c(C.secondary))),
      ]),
      const SizedBox(height: 12),
      Row(children: [
        for (var i = 1; i <= 3; i++) ...[
          if (i > 1) const SizedBox(width: 6),
          Expanded(child: Container(height: 6, decoration: BoxDecoration(color: seg(i), borderRadius: R.rFull))),
        ],
        const SizedBox(width: 12),
        Ic(icon, size: 16, color: wc),
        const SizedBox(width: 4),
        Text(word.toUpperCase(), style: T.badge.c(wc)),
      ]),
      const SizedBox(height: 8),
      Wrap(alignment: WrapAlignment.spaceBetween, spacing: 8, children: [Text('1. Build From Records', style: lab(1)), Text('2. Check Text', style: lab(2)), Text('3. Save File', style: lab(3))]),
    ]));
  }

  Widget _blockedCard(AppState app) => _card(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [const Ic(Symbols.lock_clock, size: 22, color: C.error), const SizedBox(width: 8), Expanded(child: Text('Export is not open', style: T.headlineSm))]),
        const SizedBox(height: 6),
        Text('Export is available after an admin clears the network (Back online). Now: ${ops.kPhaseLabel[app.phase]}.', style: T.bodyMd.c(C.onSurfaceVariant)),
        const SizedBox(height: 12),
        Btn('Open the downtime checklist', icon: Symbols.checklist, onTap: () => Go.checklist(context)),
      ]));

  Widget _buildingCard() => _card(Semantics(
        liveRegion: true,
        child: Row(children: [
          if (building) const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: C.primary)),
          if (building) const SizedBox(width: 12),
          Expanded(child: Text(building ? 'Building the file from the records on this phone…' : 'The file is not built.', style: T.bodyMd)),
          if (!building) Tap(label: 'Build again', onTap: _build, child: const Ic(Symbols.refresh, size: 22)),
        ]),
      ));

  Widget _statusCard(ops.ExportFile f) {
    final ok = f.errors.isEmpty;
    final strong = ok ? C.tertiaryFixed : C.errorContainer, soft = ok ? C.tertiaryFixedDim : const Color(0xFFFFB4AB), line = ok ? C.onTertiaryFixedVariant : C.error;
    Widget fact(IconData i, String t) => Row(mainAxisSize: MainAxisSize.min, children: [Ic(i, size: 15, color: strong), const SizedBox(width: 4), Flexible(child: Text(t, style: T.labelSm.c(strong)))]);
    final dot = Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text('•', style: T.labelSm.c(strong)));
    final facts = [
      fact(Symbols.inventory_2, '${f.entries.length} Resources'),
      fact(ok ? Symbols.rule : Symbols.error, ok ? 'Zero Structure Errors' : '${f.errors.length} Structure Errors'),
      fact(Symbols.timer, '${'${f.bundle['timestamp']}'.substring(11, 19)} Local'),
    ];
    return Box(
      color: ok ? C.tertiaryContainer : C.onErrorContainer,
      shadow: true,
      pad: const EdgeInsets.all(16),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(width: 40, height: 40, decoration: BoxDecoration(color: soft.withValues(alpha: .2), borderRadius: R.rFull), child: Ic(ok ? Symbols.task_alt : Symbols.error, size: 24, color: strong)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(ok ? 'FHIR R4 Bundle Built on This Phone' : 'The Structure Check Found Problems', style: T.headlineSm.c(strong).bold),
            const SizedBox(height: 8),
            Align(alignment: Alignment.centerLeft, child: Tag(ok ? 'STRUCTURE CHECK PASSED' : '${f.errors.length} PROBLEMS, NOT SAVED', bg: line, fg: strong, style: T.badge.s(10, 20))),
            const SizedBox(height: 4),
            Text(fileName, style: T.mono(12, line: 16).c(soft)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.only(top: 8),
              decoration: BoxDecoration(border: Border(top: BorderSide(color: line.withValues(alpha: .4)))),
              child: MediaQuery.sizeOf(context).width < 380 || MediaQuery.textScalerOf(context).scale(10) > 12
                  ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: facts)
                  : Row(children: [Flexible(flex: 4, child: facts[0]), dot, Flexible(flex: 4, child: facts[1]), dot, Flexible(flex: 4, child: facts[2])]),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _savedCard() => Semantics(
        liveRegion: true,
        child: _card(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [const Ic(Symbols.download_done, size: 22, color: _green), const SizedBox(width: 8), Expanded(child: Text('File saved', style: T.headlineSm))]),
          const SizedBox(height: 8),
          Text('${saved!.$1} • ${grouped(saved!.$2)} bytes', style: T.labelMd),
          const SizedBox(height: 4),
          Text('SHA-256 of the saved text (also in the change log):', style: T.bodySm.c(C.secondary)),
          SelectableText(saved!.$3, style: T.mono(11, line: 15)),
        ])),
      );

  Widget _note(IconData icon, String text) => Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.all(S.md),
          decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rXl),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Ic(icon, size: 20, color: C.secondary), const SizedBox(width: 8), Expanded(child: Text(text, style: T.bodyMd))]),
        ),
      );

  /// Back to the worklist when it is already open below, else open it.
  void _openWorklist() {
    final nav = Navigator.of(context, rootNavigator: true);
    var found = false;
    nav.popUntil((r) => (found = r.settings.name == 'recovery') || r.isFirst);
    if (!found) Go.recovery(nav.context);
  }

  Widget _blockers(ops.ExportFile f) => Container(
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(color: C.errorContainer, borderRadius: R.rXl),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Ic(Symbols.warning, size: 22, color: C.error),
            const SizedBox(width: 8),
            Expanded(child: Text('${f.blockers} flagged item${f.blockers == 1 ? '' : 's'} not signed off', style: T.headlineSm.c(C.onErrorContainer).bold)),
          ]),
          const SizedBox(height: 4),
          Text('You can still make a file, but the export should normally wait.', style: T.bodySm.c(C.onErrorContainer)),
          const SizedBox(height: 10),
          Btn('Open the worklist', kind: BtnKind.white, onTap: _openWorklist),
        ]),
      );

  static const _kinds = [
    ('Patient', Symbols.badge, 'Patients on this phone'),
    ('Observation', Symbols.vital_signs, 'Vitals, fluids, labs, scores'),
    ('MedicationAdministration', Symbols.vaccines, 'Given, held, refused, rates'),
    ('DocumentReference', Symbols.description, 'Nursing notes'),
    ('MedicationRequest', Symbols.prescriptions, 'Medicine and IV orders'),
    ('AllergyIntolerance', Symbols.allergy, 'Recorded allergies'),
    ('Encounter', Symbols.bed, 'Stays with ward and bed'),
    ('Practitioner', Symbols.groups, 'Staff named in the records'),
    ('Provenance', Symbols.verified_user, 'Who, when and which device'),
  ];

  Widget _breakdown(ops.ExportFile f) {
    final counts = f.counts;
    return _card(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Resource Breakdown', style: T.headlineSm),
            Text('Counted in the file that will be saved', style: T.labelSm.c(C.secondary)),
          ]),
        ),
        const SizedBox(width: 8),
        Tag('${f.entries.length} TOTAL', bg: C.surfaceContainer, fg: C.onSurface, pad: const EdgeInsets.symmetric(horizontal: 10, vertical: 4)),
      ]),
      const SizedBox(height: 16),
      for (var i = 0; i < _kinds.length; i++) ...[
        if (i > 0) const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Row(children: [
            Container(width: 32, height: 32, decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rLg), child: Ic(_kinds[i].$2, size: 18, color: C.onPrimary)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                FittedBox(fit: BoxFit.scaleDown, child: Text(_kinds[i].$1, style: T.labelMd)),
                Text(_kinds[i].$3, style: T.bodySm.c(C.secondary), maxLines: 2, overflow: TextOverflow.ellipsis),
              ]),
            ),
            const SizedBox(width: 8),
            Tag('${counts[_kinds[i].$1] ?? 0} item${counts[_kinds[i].$1] == 1 ? '' : 's'}', bg: C.surface, fg: C.primaryContainer),
          ]),
        ),
      ],
      const SizedBox(height: 10),
      Text('Paper photos are not in the file. They stay encrypted on this phone; Provenance names them.', style: T.bodySm.c(C.secondary)),
    ]));
  }

  Widget _validation(ops.ExportFile f) {
    final refs = [for (final e in f.errors) if (e.contains('not in bundle')) e].length;
    final structure = f.errors.length - refs;
    final allOk = f.errors.isEmpty;
    Widget row(IconData icon, String title, String sub, String tag, {required bool ok, bool neutral = false}) => Container(
          padding: const EdgeInsets.all(10),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          child: Row(children: [
            Ic(icon, size: 20, color: neutral ? C.secondary : ok ? _green : C.error),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: T.labelMd), Text(sub, style: T.labelSm.c(C.secondary))])),
            const SizedBox(width: 8),
            Tag(tag, bg: neutral ? C.surfaceHigh : ok ? C.tertiaryFixed.withValues(alpha: .4) : C.errorContainer, fg: neutral ? C.onSurface : ok ? C.onTertiaryFixedVariant : C.onErrorContainer, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4)),
          ]),
        );
    return _card(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        const Ic(Symbols.fact_check, size: 20, color: C.secondary),
        const SizedBox(width: 8),
        Expanded(child: Text('Check of the File Text', style: T.headlineSm)),
        const SizedBox(width: 8),
        Tag(allOk ? 'PASSED' : '${f.errors.length} ERRORS', bg: allOk ? C.tertiaryContainer : C.error, fg: allOk ? C.tertiaryFixed : C.onError),
      ]),
      const SizedBox(height: 12),
      row(structure == 0 ? Symbols.check_circle : Symbols.error, 'Structure', kValidatorScope, structure == 0 ? 'NO ERRORS' : '$structure ERRORS', ok: structure == 0),
      const SizedBox(height: 8),
      row(Symbols.link, 'References', 'Each one must point to a resource in the file', refs == 0 ? 'ALL FOUND' : '$refs MISSING', ok: refs == 0),
      const SizedBox(height: 8),
      row(Symbols.edit_note, 'Drafts Left Out', 'Unconfirmed drafts are never in the file', '${f.drafts}', ok: true, neutral: true),
      const SizedBox(height: 8),
      row(Symbols.checklist, 'Worklist Items Not Signed Off', '${f.blockers} of them flagged', '${f.openItems}', ok: f.openItems == 0, neutral: f.openItems == 0),
      if (f.errors.isNotEmpty) ...[
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: const BoxDecoration(color: C.errorContainer, borderRadius: R.rLg),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (final e in f.errors.take(30)) Text(e, style: T.mono(11, line: 15).c(C.onErrorContainer)),
            if (f.errors.length > 30) Text('and ${f.errors.length - 30} more', style: T.bodySm.c(C.onErrorContainer)),
          ]),
        ),
      ],
    ]));
  }

  Widget _actions(ops.ExportFile f) {
    Widget row(IconData icon, Color bg, Color fg, String title, String sub, IconData end) => Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowSm),
          child: Row(children: [
            Container(width: 28, height: 28, decoration: BoxDecoration(color: bg, borderRadius: R.rBase), child: Ic(icon, size: 18, color: fg)),
            const SizedBox(width: 10),
            Expanded(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: T.labelMd.s(13, 16.25)), Text(sub, style: T.labelSm.c(C.secondary))])),
            Ic(end, size: 20, color: C.secondary),
          ]),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 4),
      Btn(
        saved == null ? 'Download FHIR Bundle (.JSON, $_size)' : 'Save Again (.JSON, $_size)',
        kind: BtnKind.navy,
        radius: R.xl,
        icon: saved == null ? Symbols.download : Symbols.download_done,
        busy: saving,
        onTap: f.errors.isEmpty ? _save : null,
        reason: 'Saving is blocked until the structure problems are fixed.',
      ),
      const SizedBox(height: 12),
      Unavailable(reason: 'This app has no connection to a hospital system. Save the file instead.', child: row(Symbols.cloud_sync, C.secondaryContainer, C.onSecondaryContainer, 'Stage for HL7/FHIR Direct Re-Ingest', 'Not available: no hospital connection', Symbols.chevron_right)),
      const SizedBox(height: 12),
      Unavailable(reason: 'This app cannot share with other devices. Save the file instead.', child: row(Symbols.hub, C.surfaceHigh, C.secondary, 'Share Encrypted Archive via Mesh', 'Not available: no device-to-device link', Symbols.share)),
    ]);
  }

  Widget _signers(AppState app) {
    final work = app.store.all('worklist_item').map(WorklistItem.new).toList();
    final by = <String, int>{};
    for (final w in work) {
      if (w.signedOffAt != null) by[w.signedOffBy!] = (by[w.signedOffBy!] ?? 0) + 1;
    }
    final names = (by.entries.toList()..sort((a, b) => b.value - a.value)).map((e) => '${staffShort(app.store, e.key)} (${e.value})').join(', ');
    final made = app.store.where('audit_log', 'action', 'fhir_export');
    return _card(Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(width: 32, height: 32, decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rFull), child: const Ic(Symbols.clinical_notes, size: 18, color: C.secondary)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Who Signed Off the Worklist', style: T.labelMd),
            const SizedBox(height: 2),
            Text('${by.isEmpty ? 'Nobody yet.' : '${by.values.fold(0, (a, b) => a + b)} of ${work.length} items: $names.'} The file itself has no digital signature.', style: T.bodySm.c(C.secondary)),
            const SizedBox(height: 2),
            Text(made.isEmpty ? 'No file was made on this phone yet.' : '${made.length} file${made.length == 1 ? '' : 's'} made, newest ${dateTimeLabel(AuditRow(made.last).time)}.', style: T.bodySm.c(C.secondary)),
          ]),
        ),
      ]),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(padding: EdgeInsets.only(top: 2), child: Ic(Symbols.lock_clock, size: 18, color: C.secondary)),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(TextSpan(style: T.labelSm.s(11, 16.5).c(C.secondary), children: [
              TextSpan(text: 'Where the records stay: ', style: T.labelSm.s(11, 16.5).bold),
              const TextSpan(text: 'The records stay encrypted on this phone. ClinBridge does not know when the EHR team has loaded the file.'),
            ])),
          ),
        ]),
      ),
    ]));
  }
}

/* ------------------------------ Change log ------------------------------ */

const Map<String, List<String>> _groups = {
  'Records': ['entry_', 'entered_in_error', 'photo_', 'ai_', 'handoff_', 'second_look', 'draft_'],
  'Checks': ['cosign_', 'dose_locked', 'patient_verified', 'shift_signed_off'],
  'Recovery & Files': ['worklist_', 'recovery_', 'downtime_', 'network_', 'checklist_', 'fhir_', 'print_', 'file_', 'practice_drill'],
  'Sign-in & Phone': ['staff_', 'vault_', 'device_', 'practice_reset', 'assignment_'],
};

class AuditScreen extends StatefulWidget {
  const AuditScreen({super.key});
  @override
  State<AuditScreen> createState() => _AuditScreenState();
}

class _AuditScreenState extends State<AuditScreen> {
  static const page = 40;
  String? group;
  int limit = page;
  bool busy = false;
  int? _version;
  List<Doc> rows = const [];
  ChainResult chain = const ChainResult(0, 0, null);
  Map<int, String> hashes = const {};

  void _load(AppState app) {
    if (_version == app.dataVersion) return;
    _version = app.dataVersion;
    rows = app.store.all('audit_log')..sort((a, b) => AuditRow(b).seq.compareTo(AuditRow(a).seq));
    chain = verifyChain(rows);
    hashes = {for (final r in rows) AuditRow(r).seq: rowHash(r)};
  }

  bool _in(Doc r, String? g) => g == null || _groups[g]!.any((p) => '${r['action']}'.startsWith(p));

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.signedIn) return const ColoredBox(color: C.surface);
    _load(app);
    final shown = [for (final r in rows) if (_in(r, group)) r];
    return PhonePage(
      statusColor: C.primaryContainer,
      header: _AdminHeader(title: 'ClinBridge Admin', subtitle: 'Change Log (Audit)', rightRail: '${rows.length} ROWS'),
      nav: const AdminNav(active: 3),
      pad: const EdgeInsets.fromLTRB(0, 5, 0, 24),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const Dot(C.secondaryFixedDim, size: 10),
              const SizedBox(width: 6),
              Expanded(child: Text('CHANGE LOG', style: T.badge.c(C.secondary))),
              const SizedBox(width: 8),
              _cap(200, Tag(app.downtime == null ? 'NO DOWNTIME OPEN' : 'SESSION ${app.downtime!.id}', fg: C.secondary, style: T.labelSm)),
            ]),
            const SizedBox(height: 4),
            Text('Audit Log — ${_shortUnit(app.unit)}', style: T.headlineMd.tr(-.025)),
            const SizedBox(height: 4),
            Text('Every change on this phone, newest first. Rows are linked by SHA-256. This can show that the log was changed; it does not prove who made a row.', style: T.bodySm.c(C.onSurfaceVariant)),
            const SizedBox(height: 16),
            Box(
              color: chain.ok ? C.tertiaryContainer : C.onErrorContainer,
              shadow: true,
              pad: const EdgeInsets.all(14),
              child: Row(children: [
                Ic(chain.ok ? Symbols.verified_user : Symbols.gpp_maybe, size: 24, color: chain.ok ? C.tertiaryFixed : C.errorContainer),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(chain.ok ? 'All links match' : 'Broken at row ${chain.brokenAtSeq}', style: T.headlineSm.c(chain.ok ? C.tertiaryFixed : C.errorContainer).bold),
                    Text('${chain.verified} of ${chain.total} rows verified on this phone', style: T.bodySm.c(chain.ok ? C.tertiaryFixedDim : const Color(0xFFFFB4AB))),
                  ]),
                ),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 9),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.only(left: 16, right: 8),
          child: Row(children: [
            for (final g in <String?>[null, ..._groups.keys])
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Tap(
                  selected: g == group,
                  onTap: () => setState(() {
                    group = g;
                    limit = page;
                  }),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(color: g == group ? C.primaryContainer : C.surfaceContainer, borderRadius: R.rFull),
                    child: Text('${g ?? 'All'} ${rows.where((r) => _in(r, g)).length}', style: T.labelMd.c(g == group ? C.onPrimary : C.onSurface)),
                  ),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 9),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (shown.isEmpty) Text('Nothing here', style: T.bodyMd.c(C.secondary)),
            for (final r in shown.take(limit)) ...[_row(app, r), const SizedBox(height: 8)],
            if (shown.length > limit) Btn('Show ${shown.length - limit > page ? page : shown.length - limit} More', kind: BtnKind.quiet, onTap: () => setState(() => limit += page)),
            const SizedBox(height: 8),
            Btn('Export Offline Audit Log (CSV)', kind: BtnKind.navy, radius: R.lg, icon: Symbols.download, busy: busy, onTap: () async {
              setState(() => busy = true);
              await _saveAuditCsv(context);
              if (mounted) setState(() => busy = false);
            }),
          ]),
        ),
      ],
    );
  }

  Widget _row(AppState app, Doc r) {
    final a = AuditRow(r);
    return Box(
      shadow: true,
      pad: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: Text(auditLabel(a.action), style: T.labelMd)),
          const SizedBox(width: 8),
          Text('${hm(a.time)}, ${dayLabel(a.time)}', style: T.labelSm.c(C.secondary)),
        ]),
        const SizedBox(height: 2),
        Text('${a.userId == 'system' ? 'System' : staffShort(app.store, a.userId)} • ${a.entity}', style: T.bodySm.c(C.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 4),
        Text('#${a.seq}  ${hashes[a.seq]!.substring(0, 12)}…  after ${a.prevRowHash.substring(0, 8)}…', style: T.mono(11, line: 14).c(C.secondary), maxLines: 1, overflow: TextOverflow.ellipsis),
      ]),
    );
  }
}
