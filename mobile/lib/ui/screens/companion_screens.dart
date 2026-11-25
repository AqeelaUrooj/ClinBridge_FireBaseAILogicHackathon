import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../config/policy.dart';
import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/repos/entries.dart';
import '../../data/repos/ops.dart';
import '../../data/schema.dart';
import '../../data/store.dart';
import '../../domain/charting.dart';
import '../../domain/facts.dart';
import '../../domain/meds.dart';
import '../../domain/vitals.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';
import 'admin_nav.dart';

/* ==================================================================================================================
 * Parts shared by the paper pages (paper_screens.dart) and the companion pages. "Rec" = one record being typed.
 * ================================================================================================================== */

const Map<String, String> kRecTitle = {'vital_sign': 'Vital signs', 'med_admin': 'Medication', 'intake_output': 'Fluid record', 'note': 'Note', 'lab_event': 'Lab'};
const Map<String, IconData> kRecIcon = {'vital_sign': Symbols.vital_signs, 'med_admin': Symbols.medication, 'intake_output': Symbols.water_drop, 'note': Symbols.edit_note, 'lab_event': Symbols.science};

/// "04/18/1958", as the designs write a birth date.
String dobText(String iso) => iso.length < 10 ? iso : '${iso.substring(5, 7)}/${iso.substring(8, 10)}/${iso.substring(0, 4)}';

/// The real reason of a failed action, for the person.
String problemText(Object e) => switch (e) {
      AppError x => x.message,
      PlatformException x => x.message ?? x.code,
      _ => '$e',
    };

String phaseLine(AppState a) => switch (a.phase) { Phase.down => 'EHR Downtime Active', Phase.online => 'Back online', Phase.ready => 'No downtime open' };

/// Elapsed time of the open downtime, refreshed every second. Empty when none is open.
class DowntimeClock extends StatefulWidget {
  final String Function(String from, String now) text;
  final TextStyle style;
  const DowntimeClock({super.key, required this.text, required this.style});
  @override
  State<DowntimeClock> createState() => _DowntimeClockState();
}

class _DowntimeClockState extends State<DowntimeClock> {
  late final Timer _t = Timer.periodic(const Duration(seconds: 1), (_) {
    if (mounted) setState(() {});
  });
  @override
  void initState() {
    super.initState();
    _t.isActive;
  }

  @override
  void dispose() {
    _t.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.read(context);
    final ev = a.downtime;
    return ev == null ? const SizedBox() : Text(widget.text(ev.declaredAt, a.nowIso), style: widget.style, maxLines: 1, overflow: TextOverflow.ellipsis);
  }
}

/// 64 dp page header of the paper references: back, title, patient line, local pill, own initials (opens More).
class RecHeader extends StatelessWidget {
  final String title, subtitle;
  final bool alert;
  const RecHeader({super.key, required this.title, required this.subtitle, this.alert = false});
  @override
  Widget build(BuildContext context) {
    final user = AppScope.of(context).user;
    return Container(
      constraints: const BoxConstraints(minHeight: 64),
      padding: const EdgeInsets.only(left: 10, right: 12),
      decoration: BoxDecoration(
        color: C.surface,
        border: alert ? const Border(bottom: BorderSide(color: Color(0x33BA1A1A))) : null,
        boxShadow: [alert ? const BoxShadow(color: Color(0x1FBA1A1A), offset: Offset(0, 2), blurRadius: 12) : const BoxShadow(color: Color(0x0F1C2536), offset: Offset(0, 1), blurRadius: 8)],
      ),
      child: Row(children: [
        Tap(label: 'Go back', onTap: () => Go.back(context), child: const Ic(Symbols.arrow_back, size: 24)),
        const SizedBox(width: 2),
        Expanded(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              if (alert) ...[const Ic(Symbols.warning, size: 18, color: C.error), const SizedBox(width: 6)],
              Flexible(child: Semantics(header: true, child: Text(title, style: T.headlineSm.tr(-0.025).c(alert ? C.error : C.onSurface), maxLines: 2, overflow: TextOverflow.ellipsis))),
            ]),
            Text(subtitle, style: T.labelSm.c(C.onSurfaceVariant), maxLines: 3, overflow: TextOverflow.ellipsis),
          ]),
        ),
        const SizedBox(width: 8),
        if (alert)
          const Tag('PRACTICE', icon: Symbols.gpp_maybe, bg: C.errorContainer, fg: C.onErrorContainer, pad: EdgeInsets.symmetric(horizontal: 4, vertical: 2))
        else ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rBase),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Ic(Symbols.lock, size: 14, color: C.onSurfaceVariant),
              const SizedBox(width: 4),
              Text('On phone', style: T.labelSm.c(C.onSurfaceVariant)),
            ]),
          ),
          if (user != null)
            Tap(
              label: 'Signed in: ${user.title}. Open More',
              onTap: () => Go.more(context),
              child: Padding(
                padding: const EdgeInsets.only(left: 8),
                child: Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rFull), child: Text(user.initials, style: T.labelSm.bold.c(C.onSecondaryContainer), textScaler: TextScaler.noScaling)),
              ),
            ),
        ],
      ]),
    );
  }
}

/// Dark strip of the capture reference: downtime, elapsed time, PRACTICE.
class RecRail extends StatelessWidget {
  const RecRail({super.key});
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowSm),
      child: Row(children: [
        Expanded(
          child: Row(children: [
            const Dot(C.secondaryFixed),
            const SizedBox(width: 4),
            Flexible(child: Text(phaseLine(a).toUpperCase(), style: T.badge.c(C.secondaryFixed))),
            if (a.downtime != null) ...[
              const SizedBox(width: 4),
              Text('•', style: T.bodySm.c(C.onPrimaryContainer.withValues(alpha: 0.4))),
              const SizedBox(width: 4),
              DowntimeClock(text: elapsedHms, style: T.labelSm.c(C.onPrimaryContainer)),
            ],
          ]),
        ),
        const SizedBox(width: 4),
        const Tag('PRACTICE', bg: C.secondaryContainer, fg: C.onSecondaryContainer, pad: EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
      ]),
    );
  }
}

/// "PENICILLIN +1" for a badge; the full list is on the summary page.
String allergyBadge(PatientFacts f) => f.realAllergies.isEmpty ? f.allergyText : '${f.realAllergies.first.substance}${f.realAllergies.length > 1 ? ' +${f.realAllergies.length - 1}' : ''}';

/// Verified-patient card of the capture reference.
class RecPatientCard extends StatelessWidget {
  final PatientFacts f;
  const RecPatientCard(this.f, {super.key});
  @override
  Widget build(BuildContext context) => Box(
        shadow: true,
        child: Row(children: [
          Container(width: 40, height: 40, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rFull), child: const Ic(Symbols.person, size: 20, color: C.primary)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 4, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(f.patient.fullName, style: T.headlineSm),
                Tag(allergyBadge(f).toUpperCase(), bg: f.realAllergies.isEmpty ? C.surfaceHigh : C.errorContainer, fg: f.realAllergies.isEmpty ? C.onSurfaceVariant : C.onErrorContainer, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                const VerifiedMark(),
              ]),
              Text.rich(
                TextSpan(children: [TextSpan(text: 'Bed ${f.bed}', style: T.labelSm.semi.c(C.primary)), TextSpan(text: ' • MRN ${f.patient.mrn} • DOB ${dobText(f.patient.birthDate)}')]),
                style: T.labelSm.c(C.onSurfaceVariant),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ]),
          ),
        ]),
      );
}

/// Small green shield: this patient was verified with two identifiers in this session.
class VerifiedMark extends StatelessWidget {
  final double radius;
  const VerifiedMark({super.key, this.radius = R.base});
  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Patient verified',
        child: Container(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2), decoration: BoxDecoration(color: C.onTertiaryContainer.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(radius)), child: const Ic(Symbols.verified_user, size: 14, color: C.onTertiaryContainer)),
      );
}

/* ------------------------------ Form state ------------------------------ */

/// Raw text and choices of one record form. Nothing here is saved as a record.
class RecForm {
  /// vital_sign | med_admin | intake_output | note | lab_event
  final String type;
  final Map<String, TextEditingController> _c = {};
  final Map<String, String> pick = {'day': 'today'};

  /// Ticked warnings (by key).
  final Set<String> rechecked = {};
  RecForm(this.type);

  TextEditingController c(String k) => _c.putIfAbsent(k, TextEditingController.new);
  String v(String k) => _c[k]?.text ?? '';
  void setText(String k, String s) => c(k).text = s;

  /// With [nowIso] (stored drafts) "today" and "yesterday" become a date, so a draft opened another day keeps its own.
  Doc toDoc([String? nowIso]) => {
        'type': type,
        'text': {for (final e in _c.entries) if (e.value.text.isNotEmpty) e.key: e.value.text},
        'pick': {...pick, if (nowIso != null) 'day': dayOf(nowIso)},
      };

  void load(Doc d) {
    for (final e in ((d['text'] as Map?) ?? const {}).entries) {
      setText(e.key as String, e.value as String);
    }
    for (final e in ((d['pick'] as Map?) ?? const {}).entries) {
      pick[e.key as String] = e.value as String;
    }
  }

  /// Everything that will be saved, as one text. A tick belongs to exactly this text.
  String get fingerprint => canonicalJson(toDoc());

  bool get hasContent => _c.entries.any((e) => e.key != 'time' && e.value.text.trim().isNotEmpty) || pick.keys.any((k) => k != 'day');

  void clear() {
    for (final x in _c.values) {
      x.clear();
    }
    pick
      ..clear()
      ..['day'] = 'today';
    rechecked.clear();
  }

  void dispose() {
    for (final x in _c.values) {
      x.dispose();
    }
  }

  /// The chosen day as a date: 2026-11-14.
  String dayOf(String nowIso) => switch (pick['day']) {
        'today' || null => nowIso.substring(0, 10),
        'yesterday' => PracticeClock.toIso(ms(nowIso) - 86400000).substring(0, 10),
        final d => d,
      };

  static final _hm = RegExp(r'^([01]?\d|2[0-3]):?([0-5]\d)$');

  /// "1612" or "16:12" on the chosen day. Null when it is not a time.
  String? iso(String key, String nowIso) {
    final m = _hm.firstMatch(v(key).trim());
    if (m == null) return null;
    return '${dayOf(nowIso)}T${m[1]!.padLeft(2, '0')}:${m[2]}:00${nowIso.substring(19)}';
  }

  /// Fills the form from a stored record (draft being checked).
  void loadChild(EntryX x) {
    final m = x.child ?? const <String, Object?>{};
    String n(String k) => m[k] is num ? formatDose(m[k] as num) : '';
    String s(String k) => m[k] as String? ?? '';
    void put(String k, String value) {
      if (value.isNotEmpty) pick[k] = value;
    }

    setText('time', hm(x.entry.careTime));
    pick['day'] = x.entry.careTime.substring(0, 10);
    switch (type) {
      case 'vital_sign':
        for (final k in kVitalRules.keys) {
          setText(k, n(k));
        }
        setText('o2_device', s('o2_device'));
        put('consciousness', s('consciousness'));
      case 'med_admin':
        put('order', s('order_id'));
        put('event', s('event'));
        put('slot', x.entry.scheduledTime ?? 'none');
        setText('dose', n('dose_given'));
        put('unit', s('dose_given_unit'));
        put('route', s('route'));
        setText('rate', n('infusion_rate'));
        put('rateUnit', s('infusion_rate_unit'));
        setText('reason', s('reason'));
        setText('site', s('site'));
    }
  }
}

/// What the form would save, and what is wrong with it.
class RecCheck {
  final Doc values;
  final Map<String, String> errors, warnings;
  final String? careTime, scheduledTime;
  final ActiveOrder? order;
  final bool secondNurse;
  final List<DoseLock> locks;
  const RecCheck(this.values, this.errors, this.warnings, this.careTime, {this.scheduledTime, this.order, this.secondNurse = false, this.locks = const []});
  bool get ok => errors.isEmpty;
}

List<String> medEventsFor(ActiveOrder o) => orderGroup(o) == OrderGroup.infusion ? const ['rate_changed', 'held', 'refused'] : const ['administered', 'held', 'refused'];

RecCheck checkRec(AppState a, PatientFacts f, RecForm x, {String? ignoreEntryId}) {
  final now = a.nowIso;
  final care = x.iso('time', now);
  final e = <String, String>{};
  if (care == null) {
    e['time'] = 'Enter the time as HH:MM';
  } else if (ms(care) > ms(now) + 60000) {
    e['time'] = 'Time cannot be in the future';
  } else if (f.encounter != null && ms(care) < ms(f.encounter!.admitTime)) {
    e['time'] = 'Time is before this patient was admitted';
  }
  switch (x.type) {
    case 'vital_sign':
      final r = validateVitals(VitalsForm({for (final k in kVitalRules.keys) k: x.v(k)}, o2Device: x.v('o2_device'), consciousness: x.pick['consciousness']));
      return RecCheck(r.values, {...r.errors, ...e}, r.warnings, care);
    case 'med_admin':
      final o = f.medOrders.where((o) => o.id == x.pick['order']).firstOrNull;
      if (o == null) return RecCheck(const {}, {'order': 'Pick the order', ...e}, const {}, care);
      final event = x.pick['event'] ?? '';
      final prior = currentRate(o, f.meds).$1;
      final r = validateMed(MedForm(event: event, dose: x.v('dose'), unit: x.pick['unit'] ?? '', route: x.pick['route'] ?? '', site: x.v('site'), rate: x.v('rate'), rateUnit: x.pick['rateUnit'] ?? '', reason: x.v('reason')), o, prior);
      final slots = slotsForDay(o, care ?? now);
      final pick = x.pick['slot'];
      final slot = slots.contains(pick) ? pick : null;
      if (slots.isNotEmpty && slot == null && (event == 'administered' || pick != 'none')) e['slot'] = event == 'administered' ? 'Pick the due time' : 'Pick the due time, or "Not a due time"';
      final locks = care == null ? const <DoseLock>[] : doseLocks(a.store, o, f.meds, careTime: care, scheduledTime: slot, event: event, ignoreEntryId: ignoreEntryId);
      return RecCheck(r.values, {...r.errors, ...e}, {for (final w in r.warnings) w: w}, care, scheduledTime: slot, order: o, secondNurse: r.needsSecondCheck, locks: locks);
    case 'intake_output':
      final s = x.v('start').trim(), t = x.v('end').trim();
      final si = s.isEmpty ? null : x.iso('start', now), ti = t.isEmpty ? null : x.iso('end', now);
      final r = validateIo(direction: x.pick['direction'] ?? '', category: x.pick['category'] ?? '', volume: x.v('volume'), method: x.pick['method'], startIso: si, endIso: ti, nowMs: ms(now));
      if (s.isNotEmpty && si == null) e['start'] = 'Enter the time as HH:MM';
      if (t.isNotEmpty && ti == null) e['end'] = 'Enter the time as HH:MM';
      return RecCheck(r.values, {...r.errors, ...e}, {for (final w in r.warnings) w: w}, care);
    case 'note':
      final r = validateNote(category: x.pick['category'] ?? '', text: x.v('text'), scoreName: x.v('scoreName'), scoreValue: x.v('scoreValue'));
      return RecCheck(r.values, {...r.errors, ...e}, const {}, care);
    default:
      final sp = x.v('specimen').trim();
      final spIso = sp.isEmpty ? null : x.iso('specimen', now);
      final r = validateLab(testName: x.v('testName'), status: x.pick['status'] ?? '', orderId: x.pick['order'], specimenIso: spIso, value: x.v('value'), unit: x.v('unit'), calledTo: x.v('calledTo'), readBack: x.pick['readBack'] == 'yes', nowMs: ms(now), careTime: care);
      if (sp.isNotEmpty && spIso == null) e['specimenTime'] = 'Enter the time as HH:MM';
      return RecCheck(r.values, {...r.errors, ...e}, {for (final w in r.warnings) w: w}, care);
  }
}

/// Stored fields of one record, in form order. Empty fields are left out. (Port of web entryDiff FIELDS.)
List<(String, String)> valueRows(Store s, String type, Doc m) {
  final out = <(String, String)>[];
  void add(String label, Object? v, [Object? unit]) {
    if (v == null || v == '') return;
    final text = v is num ? formatDose(v) : '$v';
    out.add((label, unit == null || unit == '' ? text : '$text $unit'));
  }

  switch (type) {
    case 'vital_sign':
      for (final r in kVitalRules.values) {
        add(r.label, m[r.key], r.unit);
      }
      add('Oxygen given by', m['o2_device']);
      add('Awake?', m['consciousness']);
      add('Weight', m['weight_kg'], 'kg');
      add('Words on the paper', m['raw_text']);
    case 'med_admin':
      add('Drug', m['drug_name']);
      add('What happened', kEventLabel[m['event']] ?? m['event']);
      add('Dose given', m['dose_given'], m['dose_given_unit']);
      add('Ordered', m['dose_due'], m['dose_due_unit']);
      add('Route', m['route']);
      add('Site', m['site']);
      add('Rate', m['infusion_rate'], m['infusion_rate_unit']);
      add('Rate before', m['prior_infusion_rate'], m['infusion_rate_unit']);
      add('Reason / note', m['reason']);
      if (m['double_checked_by'] != null) add('Second nurse', staffName(s, m['double_checked_by'] as String));
    case 'intake_output':
      add('In or out', m['direction'] == 'in' ? 'In' : 'Out');
      add('Kind', ioLabel('${m['direction']}', '${m['category']}'));
      add('Amount', m['volume_ml'], 'mL');
      add('How measured', m['method']);
      add('Period start', hm(m['start_time'] as String?));
      add('Period end', hm(m['end_time'] as String?));
    case 'note':
      add('Type', noteLabel('${m['category']}'));
      if (m['score_name'] != null) add('Score', '${m['score_name']}: ${m['score_value'] ?? '—'}');
      add('Note', m['text']);
    case 'lab_event':
      add('Test', m['test_name']);
      add('Status', labLabel('${m['status']}'));
      add('Result', m['value_num'] ?? m['value_text'], m['unit']);
      if (m['specimen_time'] != null) add('Sample taken', dateTimeLabel(m['specimen_time'] as String));
      add('Who was told', m['called_to']);
      if (m['read_back'] != null) add('Read back', m['read_back'] == true ? 'Yes' : 'No');
  }
  return out;
}

/* ------------------------------ Form widgets ------------------------------ */

/// White field card of the draft reference: "01. NAME", a state tag, the inputs.
class FieldCard extends StatelessWidget {
  final String label;
  final String? tag;
  final IconData tagIcon;
  final Color tagBg, tagFg;
  final List<Widget> children;
  const FieldCard({super.key, required this.label, this.tag, this.tagIcon = Symbols.keyboard, this.tagBg = C.surfaceContainer, this.tagFg = C.onSurface, required this.children});
  @override
  Widget build(BuildContext context) => Box(
        shadow: true,
        pad: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, spacing: 2, runSpacing: 4, children: [
              Text(label.toUpperCase(), style: T.labelSm.bold.tr(0.025).c(C.secondary)),
              if (tag != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                  decoration: BoxDecoration(color: tagBg, borderRadius: R.rBase),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [Ic(tagIcon, size: 12, color: tagFg), const SizedBox(width: 2), Flexible(child: Text(tag!, style: T.labelSm.c(tagFg)))]),
                ),
            ]),
          ),
          ...children,
        ]),
      );
}

class FieldError extends StatelessWidget {
  final String? text;
  const FieldError(this.text, {super.key});
  @override
  Widget build(BuildContext context) => text == null ? const SizedBox() : Padding(padding: const EdgeInsets.only(top: 4), child: Semantics(liveRegion: true, child: Text(text!, style: T.bodySm.c(C.error))));
}

/// Grey value box: big value, unit on the right, error below.
class ValueBox extends StatelessWidget {
  final TextEditingController controller;
  final String label;
  final String? unit, hint, error;
  final TextStyle? style;
  final bool number, enabled;
  final int minLines;
  final VoidCallback changed;
  const ValueBox(this.controller, {super.key, required this.label, this.unit, this.hint, this.error, this.style, this.number = false, this.enabled = true, this.minLines = 1, required this.changed});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TapToType(child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg, border: error == null ? null : Border.all(color: C.error)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Field(controller, label: label, style: style ?? T.vital, hint: hint, enabled: enabled, minLines: minLines, maxLines: minLines > 1 ? 8 : 1, keyboard: number ? const TextInputType.numberWithOptions(decimal: true) : (minLines > 1 ? TextInputType.multiline : TextInputType.text), onChanged: (_) => changed())),
            if (unit != null) ...[const SizedBox(width: 8), Padding(padding: const EdgeInsets.only(top: 2), child: Text(unit!, style: T.unit.c(C.onSurfaceVariant)))],
          ]),
        )),
        FieldError(error),
      ]);
}

/// One-of-many buttons (48 dp high).
class Choices extends StatelessWidget {
  final List<(String, String)> options;
  final String? value;
  final ValueChanged<String>? onPick;
  final String? error;
  const Choices({super.key, required this.options, required this.value, required this.onPick, this.error});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 6, runSpacing: 0, children: [
          for (final o in options)
            Tap(
              label: o.$2,
              selected: value == o.$1,
              onTap: onPick == null ? null : () => onPick!(o.$1),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: value == o.$1 ? C.primaryContainer : C.surfaceLow, borderRadius: R.rLg),
                child: Text(o.$2, style: T.labelMd.c(value == o.$1 ? C.onPrimary : (onPick == null ? C.outline : C.onSurface))),
              ),
            ),
        ]),
        FieldError(error),
      ]);
}

/// Grey box that opens a list of choices.
class SelectBox extends StatelessWidget {
  final String label, text;
  final String? unit, error;
  final bool chosen;
  final VoidCallback? onTap;
  final TextStyle? style;
  const SelectBox({super.key, required this.label, required this.text, required this.chosen, required this.onTap, this.unit, this.error, this.style});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Tap(
          label: '$label: $text',
          onTap: onTap,
          expand: true,
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg, border: error == null ? null : Border.all(color: C.error)),
            child: Row(children: [
              Expanded(child: Text(text, style: (style ?? T.vital).c(chosen ? C.onSurface : C.outline))),
              if (unit != null) ...[const SizedBox(width: 8), Text(unit!, style: T.unit.c(C.onSurfaceVariant))],
              const SizedBox(width: 4),
              const Ic(Symbols.expand_more, size: 20, color: C.onSurfaceVariant),
            ]),
          ),
        ),
        FieldError(error),
      ]);
}

/// Square tick box of the draft reference.
class TickBox extends StatelessWidget {
  final bool on;
  const TickBox(this.on, {super.key});
  @override
  Widget build(BuildContext context) => Container(
        width: 24,
        height: 24,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: on ? C.primary : C.surfaceLowest, borderRadius: R.rBase, border: Border.all(color: on ? C.primary : C.outline)),
        child: on ? const Ic(Symbols.check, size: 18, color: C.onPrimary) : null,
      );
}

/// A tick with its sentence; the whole row is the touch target.
class TickRow extends StatelessWidget {
  final bool on;
  final String text;
  final String? sub;
  final VoidCallback? onTap;
  const TickRow({super.key, required this.on, required this.text, this.sub, required this.onTap});
  @override
  Widget build(BuildContext context) => Tap(
        label: sub == null ? text : '$text $sub',
        toggled: on,
        onTap: onTap,
        expand: true,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(padding: const EdgeInsets.only(top: 2), child: TickBox(on)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(text, style: T.labelMd.s(13, 18)),
              if (sub != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(sub!, style: T.bodySm.c(C.onSurfaceVariant))),
            ]),
          ),
        ]),
      );
}

/// Red box with a real error text.
class ProblemBox extends StatelessWidget {
  final String text;
  final String? title;
  const ProblemBox(this.text, {super.key, this.title});
  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Box(
          color: C.errorContainer,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Ic(Symbols.error, size: 20, color: C.error),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (title != null) Text(title!, style: T.headlineSm.c(C.onErrorContainer)),
                Text(text, style: T.bodyMd.c(C.onErrorContainer)),
              ]),
            ),
          ]),
        ),
      );
}

/// Bottom sheet with one scrolling body (keyboard safe).
Future<R?> recSheet<R>(BuildContext context, {required String title, required Widget Function(BuildContext c, StateSetter set) body}) => showModalBottomSheet<R>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: C.surfaceLowest,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (c) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(c).bottom),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(S.lg),
            child: StatefulBuilder(
              builder: (c, set) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(title, style: T.headlineMd),
                const SizedBox(height: S.md),
                body(c, set),
              ]),
            ),
          ),
        ),
      ),
    );

/// List of choices; null when closed without one.
Future<String?> pickOne(BuildContext context, String title, List<(String, String)> options, String? value) => recSheet<String>(
      context,
      title: title,
      body: (c, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (options.isEmpty) Text('Nothing to choose for this patient.', style: T.bodyMd.c(C.onSurfaceVariant)),
        for (final o in options)
          Tap(
            label: o.$2,
            selected: value == o.$1,
            expand: true,
            onTap: () => Navigator.pop(c, o.$1),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: BoxDecoration(color: value == o.$1 ? C.surfaceHigh : C.surfaceLowest, borderRadius: R.rLg),
              child: Row(children: [Expanded(child: Text(o.$2, style: T.labelMd)), if (value == o.$1) const Ic(Symbols.check, size: 18, color: C.primary)]),
            ),
          ),
      ]),
    );

/// One text answer (a reason). Null when cancelled or empty.
Future<String?> askText(BuildContext context, {required String title, required String text, required String label, required String yes, String hint = '', bool danger = false, bool obscure = false}) async {
  final ctl = TextEditingController();
  final r = await recSheet<String>(
    context,
    title: title,
    body: (c, set) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(text, style: T.bodyMd.c(C.onSurfaceVariant)),
      const SizedBox(height: S.md),
      Text(label.toUpperCase(), style: T.labelSm.bold.c(C.secondary)),
      const SizedBox(height: 4),
      Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
        child: Field(ctl, label: label, hint: hint, obscure: obscure, maxLines: 1, onChanged: (_) => set(() {})),
      ),
      const SizedBox(height: S.lg),
      Btn(yes, kind: danger ? BtnKind.danger : BtnKind.primary, onTap: ctl.text.trim().isEmpty ? null : () => Navigator.pop(c, ctl.text.trim())),
      const SizedBox(height: S.sm),
      Btn('Cancel', kind: BtnKind.quiet, onTap: () => Navigator.pop(c)),
    ]),
  );
  // The sheet still shows the field while it closes.
  Future<void>.delayed(const Duration(seconds: 1), ctl.dispose);
  return r;
}

/// "16:12" with the day and a "Set to now" button.
class TimeBox extends StatelessWidget {
  final RecForm form;
  final String nowIso;
  final String? error;
  final VoidCallback changed;
  const TimeBox({super.key, required this.form, required this.nowIso, this.error, required this.changed});

  /// 'today' / 'yesterday' when the chosen date is one of them.
  String? get _day {
    final d = form.dayOf(nowIso);
    if (d == nowIso.substring(0, 10)) return 'today';
    return d == PracticeClock.toIso(ms(nowIso) - 86400000).substring(0, 10) ? 'yesterday' : null;
  }

  @override
  Widget build(BuildContext context) {
    final large = MediaQuery.textScalerOf(context).scale(10) > 11.5;
    final box = ValueBox(form.c('time'), label: 'Time, hours and minutes', unit: '24-HR', hint: 'HH:MM', style: T.mono(22, w: FontWeight.w700, line: 26), error: error, changed: changed);
    final now = Tap(
      label: 'Set to now, ${hm(nowIso)}',
      onTap: () {
        form.pick['day'] = 'today';
        form.setText('time', hm(nowIso));
        changed();
      },
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg),
        child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.update, size: 16, color: C.secondary), const SizedBox(width: 4), Flexible(child: Text('Set to Now (${hm(nowIso)})', style: T.labelMd))]),
      ),
    );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (large) ...[box, const SizedBox(height: 8), Align(alignment: Alignment.centerLeft, child: now)] else Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: box), const SizedBox(width: 8), Flexible(child: now)]),
        const SizedBox(height: 4),
        Choices(
          options: [
            ('today', 'Today, ${dayLabel(nowIso)}'),
            ('yesterday', 'Yesterday'),
            if (_day == null) (form.dayOf(nowIso), dayLabel(form.dayOf(nowIso))),
          ],
          value: _day ?? form.dayOf(nowIso),
          onPick: (d) {
            form.pick['day'] = d;
            changed();
          },
        ),
      ]);
  }
}

/// All field cards of one record kind. [tag] marks every card (paper: "Typed by you · not yet confirmed").
List<Widget> recFieldCards(
  BuildContext context, {
  required AppState app,
  required PatientFacts facts,
  required RecForm form,
  required RecCheck check,
  required bool showErrors,
  required VoidCallback changed,
  String? tag,
  String timeLabel = 'Time of care',
  bool orderFixed = false,
}) {
  String? err(String k) => showErrors ? check.errors[k] : null;
  var n = 0;
  Widget card(String label, List<Widget> children) => FieldCard(label: '${(++n).toString().padLeft(2, '0')}. $label', tag: tag, children: children);
  Widget sub(String s) => Padding(padding: const EdgeInsets.only(top: 8, bottom: 4), child: Text(s, style: T.labelSm.c(C.onSurfaceVariant)));
  Widget foot(String l, [String r = '']) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(children: [Expanded(flex: 2, child: Text(l, style: T.labelSm.c(C.onSurfaceVariant))), if (r.isNotEmpty) ...[const SizedBox(width: 8), Expanded(child: Text(r, style: T.labelSm.medium.c(C.secondary), textAlign: TextAlign.right))]]),
      );
  void set(String k, String? v) {
    if (v == null) return;
    form.pick[k] = v;
    changed();
  }

  Future<void> pick(String k, String title, List<(String, String)> options, {void Function(String v)? after}) async {
    final v = await pickOne(context, title, options, form.pick[k]);
    if (v == null) return;
    form.pick[k] = v;
    after?.call(v);
    changed();
  }

  Widget num(String k, {bool flex = true}) {
    final r = kVitalRules[k]!;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(r.label, style: T.labelSm.c(C.onSurfaceVariant)),
      const SizedBox(height: 4),
      ValueBox(form.c(k), label: '${r.label} in ${r.unit}', unit: r.unit, hint: '—', number: true, error: err(k), changed: changed),
    ]);
  }

  Widget two(Widget a, Widget b) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: a), const SizedBox(width: 8), Expanded(child: b)]);

  final cards = <Widget>[];
  switch (form.type) {
    case 'vital_sign':
      cards.addAll([
        card('Blood pressure', [two(num('bp_systolic'), num('bp_diastolic'))]),
        card('Pulse & breathing', [two(num('heart_rate'), num('resp_rate'))]),
        card('Temperature & oxygen level', [two(num('temp_c'), num('spo2'))]),
        card('Oxygen given', [
          Text('Oxygen given by', style: T.labelSm.c(C.onSurfaceVariant)),
          const SizedBox(height: 4),
          ValueBox(form.c('o2_device'), label: 'Oxygen given by', hint: 'e.g. nasal cannula', style: T.headlineSm, changed: changed),
          const SizedBox(height: 8),
          num('o2_flow_lpm'),
        ]),
        card('Pain & blood sugar', [two(num('pain_0_10'), num('glucose_mgdl'))]),
        card('Awake?', [
          Choices(options: [for (final x in kAvpu) (x, x)], value: form.pick['consciousness'], error: err('consciousness'), onPick: (v) {
            form.pick['consciousness'] == v ? form.pick.remove('consciousness') : form.pick['consciousness'] = v;
            changed();
          }),
          foot('A blank field is saved as "Not assessed", never as 0.'),
          FieldError(err('form')),
        ]),
      ]);
    case 'med_admin':
      final o = check.order;
      final inf = o != null && orderGroup(o) == OrderGroup.infusion;
      cards.addAll([
        card('Medication name', [
          SelectBox(
            label: 'Order',
            text: o == null ? 'Choose the order' : (o.drugName ?? o.text),
            chosen: o != null,
            unit: o == null ? null : (o.frequency ?? 'ORDER').toUpperCase(),
            error: err('order'),
            onTap: orderFixed
                ? null
                : () => pick('order', 'Active medication orders', [for (final m in facts.medOrders) (m.id, '${m.drugName ?? m.text} ${orderDose(m)} ${m.route ?? ''}${isHighAlert(m.drugName) ? ' · High-alert' : ''}')], after: (id) {
                      form.pick
                        ..remove('event')
                        ..remove('slot')
                        ..remove('unit')
                        ..remove('route')
                        ..remove('rateUnit');
                      form.setText('dose', '');
                      form.setText('rate', '');
                    }),
          ),
          if (o != null) foot('Order: ${o.text}', o.orderedBy ?? ''),
          if (o != null && check.locks.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(8),
              decoration: const BoxDecoration(color: C.errorContainer, borderRadius: R.rLg),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Ic(Symbols.lock, size: 16, color: C.error),
                const SizedBox(width: 6),
                Expanded(
                  child: Text.rich(
                    TextSpan(children: [TextSpan(text: '${check.locks.first.title}. ', style: T.bodySm.bold.c(C.onErrorContainer)), TextSpan(text: check.locks.map((l) => l.reason).join(' '))]),
                    style: T.bodySm.c(C.onErrorContainer),
                  ),
                ),
              ]),
            )
          else if (o != null && needsSecondNurse(o.drugName, form.pick['event'] ?? ''))
            foot('High-alert: a second nurse checks this before it is saved.'),
          if (o != null) ...[
            sub('What happened'),
            Choices(options: [for (final e in medEventsFor(o)) (e, kEventLabel[e]!)], value: form.pick['event'], error: err('event'), onPick: (v) => set('event', v)),
            if (form.pick['event'] == 'held' || form.pick['event'] == 'refused') ...[
              sub('Reason'),
              ValueBox(form.c('reason'), label: 'Reason', hint: form.pick['event'] == 'held' ? 'Say why it was held' : 'Say what the patient said', style: T.bodyLg, error: err('reason'), changed: changed),
            ],
          ],
        ]),
        if (o != null) ...[
          if (form.pick['event'] == 'administered')
            card('Dose & route', [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(flex: 4, child: ValueBox(form.c('dose'), label: 'Dose given', hint: 'Dose', number: true, error: err('dose'), changed: changed)),
                const SizedBox(width: 6),
                Expanded(flex: 4, child: SelectBox(label: 'Unit', text: form.pick['unit'] ?? 'Unit', chosen: form.pick['unit'] != null, style: T.headlineSm.s(17, 26), error: err('unit'), onTap: () => pick('unit', 'Unit', [for (final u in kDoseUnits) (u, u)]))),
                const SizedBox(width: 6),
                Expanded(flex: 4, child: SelectBox(label: 'Route', text: form.pick['route'] ?? 'Route', chosen: form.pick['route'] != null, style: T.headlineSm.s(17, 26), error: err('route'), onTap: () => pick('route', 'How it was given', [for (final r in kRoutes) (r, '$r · ${kRouteLabel[r]}')]))),
              ]),
              foot('Ordered: ${[orderDose(o), o.route ?? ''].where((s) => s.isNotEmpty).join(' ')}'),
            ]),
          if (inf && form.pick['event'] == 'rate_changed')
            card('New rate', [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: ValueBox(form.c('rate'), label: 'New rate', hint: 'Rate', number: true, error: err('rate'), changed: changed)),
                const SizedBox(width: 6),
                Expanded(child: SelectBox(label: 'Unit', text: form.pick['rateUnit'] ?? 'Unit', chosen: form.pick['rateUnit'] != null, style: T.headlineSm.s(17, 26), error: err('rateUnit'), onTap: () => pick('rateUnit', 'Unit', [for (final u in kRateUnits) (u, u)]))),
              ]),
              foot('Rate before: ${formatDose(currentRate(o, facts.meds).$1)} ${currentRate(o, facts.meds).$2 ?? ''}'),
            ]),
        ],
      ]);
    case 'intake_output':
      final dir = form.pick['direction'];
      void step(int d) {
        final cur = form.v('volume').trim();
        if (!RegExp(r'^\d{1,5}$').hasMatch(cur)) return;
        final next = int.parse(cur) + d;
        if (next <= 0 || next > 99999) return;
        form.setText('volume', '$next');
        changed();
      }

      Widget stepBtn(String t, String label, int d) => Tap(label: label, onTap: RegExp(r'^\d{1,5}$').hasMatch(form.v('volume').trim()) && int.parse(form.v('volume').trim()) + d > 0 ? () => step(d) : null, child: Container(width: 48, height: 48, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rLg), child: Text(t, style: T.vital)));
      cards.addAll([
        card('In or out?', [
          Choices(
            options: const [('in', 'In (patient took in)'), ('out', 'Out (patient passed out)')],
            value: dir,
            error: err('direction'),
            onPick: (v) {
              form.pick.remove('category');
              set('direction', v);
            },
          ),
          if (dir != null) ...[sub('What kind?'), Choices(options: dir == 'in' ? kIoIn : kIoOut, value: form.pick['category'], error: err('category'), onPick: (v) => set('category', v))],
        ]),
        card('Amount (mL)', [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            stepBtn('−', '50 mL less', -50),
            const SizedBox(width: 6),
            Expanded(child: ValueBox(form.c('volume'), label: 'Amount in mL', unit: 'mL', hint: '—', number: true, error: err('volume'), changed: changed)),
            const SizedBox(width: 6),
            stepBtn('+', '50 mL more', 50),
          ]),
          sub('How measured (optional)'),
          Choices(options: [for (final m in kIoMethods) (m, m)], value: form.pick['method'], error: err('method'), onPick: (v) {
            form.pick['method'] == v ? form.pick.remove('method') : form.pick['method'] = v;
            changed();
          }),
        ]),
        card('Period (optional)', [
          two(
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text('Start', style: T.labelSm.c(C.onSurfaceVariant)), const SizedBox(height: 4), ValueBox(form.c('start'), label: 'Period start', hint: 'HH:MM', style: T.mono(17, w: FontWeight.w700, line: 22), error: err('start'), changed: changed)]),
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Text('End', style: T.labelSm.c(C.onSurfaceVariant)), const SizedBox(height: 4), ValueBox(form.c('end'), label: 'Period end', hint: 'HH:MM', style: T.mono(17, w: FontWeight.w700, line: 22), error: err('end'), changed: changed)]),
          ),
        ]),
      ]);
    case 'note':
      cards.addAll([
        card('Type of note', [Choices(options: kNoteCategories, value: form.pick['category'], error: err('category'), onPick: (v) => set('category', v))]),
        if (form.pick['category'] == 'risk_score')
          card('Score', [
            Text('Score name (as on the paper form)', style: T.labelSm.c(C.onSurfaceVariant)),
            const SizedBox(height: 4),
            ValueBox(form.c('scoreName'), label: 'Score name', hint: 'e.g. Braden', style: T.headlineSm, error: err('scoreName'), changed: changed),
            sub('Score'),
            ValueBox(form.c('scoreValue'), label: 'Score', hint: '—', number: true, error: err('scoreValue'), changed: changed),
            foot('The app stores the score you enter. It does not work out or judge the score.'),
          ]),
        card('Note', [ValueBox(form.c('text'), label: 'Note', hint: 'Write the note', style: T.bodyLg, minLines: 5, error: err('text'), changed: changed)]),
      ]);
    default:
      final labs = [for (final o in facts.orders) if (o.type == 'lab') o];
      final status = form.pick['status'];
      cards.addAll([
        card('Test', [
          Text('Lab order (optional)', style: T.labelSm.c(C.onSurfaceVariant)),
          const SizedBox(height: 4),
          SelectBox(
            label: 'Lab order',
            text: labs.where((o) => o.id == form.pick['order']).firstOrNull?.text ?? (labs.isEmpty ? 'No lab orders' : '—'),
            chosen: form.pick['order'] != null,
            style: T.bodyMd,
            onTap: labs.isEmpty ? null : () => pick('order', 'Lab orders', [for (final o in labs) (o.id, o.text)], after: (id) => form.setText('testName', labs.firstWhere((o) => o.id == id).text)),
          ),
          sub('Test'),
          ValueBox(form.c('testName'), label: 'Test', hint: 'Which test', style: T.headlineSm, error: err('testName'), changed: changed),
        ]),
        card('Status', [
          Choices(options: kLabStatuses, value: status, error: err('status'), onPick: (v) => set('status', v)),
          sub('Sample taken at (optional)'),
          ValueBox(form.c('specimen'), label: 'Sample taken at', hint: 'HH:MM', style: T.mono(17, w: FontWeight.w700, line: 22), error: err('specimenTime'), changed: changed),
        ]),
        if (status == 'resulted' || status == 'critical')
          card('Result (as given by the lab)', [
            two(
              ValueBox(form.c('value'), label: 'Result', hint: 'Result', error: err('value'), changed: changed),
              ValueBox(form.c('unit'), label: 'Unit', hint: 'Unit, e.g. mmol/L', style: T.headlineSm.s(17, 26), changed: changed),
            ),
            if (status == 'critical') ...[
              sub('Who was told (doctor / team)'),
              ValueBox(form.c('calledTo'), label: 'Who was told', style: T.headlineSm, changed: changed),
              const SizedBox(height: 8),
              TickRow(
                on: form.pick['readBack'] == 'yes',
                text: 'Result was read back (repeated back to confirm)',
                onTap: () => set('readBack', form.pick['readBack'] == 'yes' ? 'no' : 'yes'),
              ),
            ],
          ]),
      ]);
  }
  final o = check.order;
  cards.add(card(timeLabel, [
    TimeBox(form: form, nowIso: app.nowIso, error: err('time'), changed: changed),
    if (form.type == 'med_admin' && o != null && slotsForDay(o, check.careTime ?? app.nowIso).isNotEmpty) ...[
      sub('Due time'),
      Choices(
        options: [for (final s in slotStatuses(o, check.careTime ?? app.nowIso, facts.meds)) (s.time, '${hm(s.time)} ${s.status}'), if (form.pick['event'] != 'administered') ('none', 'Not a due time')],
        value: form.pick['slot'],
        error: err('slot'),
        onPick: orderFixed ? null : (v) => set('slot', v),
      ),
    ],
  ]));
  return cards;
}

/// Values that need a second look, each with its own tick. They never block by themselves.
class WarningTicks extends StatelessWidget {
  final RecForm form;
  final RecCheck check;
  final VoidCallback changed;
  const WarningTicks({super.key, required this.form, required this.check, required this.changed});
  @override
  Widget build(BuildContext context) => Box(
        color: const Color(0xFFFDF3DC),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [const Ic(Symbols.warning, size: 20, color: Color(0xFF7A5410)), const SizedBox(width: 8), Expanded(child: Text('Check value', style: T.headlineSm.c(const Color(0xFF7A5410))))]),
          const SizedBox(height: 4),
          for (final w in check.warnings.entries)
            TickRow(
              on: form.rechecked.contains(w.key),
              text: w.value,
              sub: 'I checked this again and it is right.',
              onTap: () {
                form.rechecked.contains(w.key) ? form.rechecked.remove(w.key) : form.rechecked.add(w.key);
                changed();
              },
            ),
        ]),
      );
}

bool warningsDone(RecForm f, RecCheck r) => r.warnings.keys.every(f.rechecked.contains);

/// Label/value lines of one record.
class RowsTable extends StatelessWidget {
  final List<(String, String)> rows;
  final bool struck;
  const RowsTable(this.rows, {super.key, this.struck = false});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final r in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(flex: 2, child: Text(r.$1, style: T.bodyMd.c(C.onSurfaceVariant))),
              const SizedBox(width: 8),
              Expanded(flex: 3, child: Text(r.$2, style: T.bodyMd.semi.copyWith(decoration: struck ? TextDecoration.lineThrough : null))),
            ]),
          ),
      ]);
}

/// Keeps an unfinished form encrypted on this phone, for this person and patient only.
mixin DraftKeeper<W extends StatefulWidget> on State<W> {
  Timer? _keep;
  late AppState appState;
  String? draftProblem;

  String get draftId;
  String get draftKind;
  String get draftPatientId;
  Doc draftPayload();
  bool get draftWanted;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    appState = AppScope.of(context);
  }

  void keepSoon() {
    _keep?.cancel();
    _keep = Timer(const Duration(milliseconds: 400), () => keepNow());
  }

  /// Returns true when a draft was written.
  bool keepNow({bool quiet = false}) {
    _keep?.cancel();
    _keep = null;
    if (!draftWanted) return false;
    try {
      saveDraft(appState.ctx(), id: draftId, kind: draftKind, patientId: draftPatientId, payload: draftPayload());
      scheduleMicrotask(appState.saved); // the chart counts the kept form; not during dispose
      if (!quiet && draftProblem != null && mounted) setState(() => draftProblem = null);
      return true;
    } on AppError catch (e) {
      if (!quiet && mounted) setState(() => draftProblem = 'The unfinished form was not kept: ${e.message}');
      return false;
    }
  }

  void stopKeeping() {
    _keep?.cancel();
    _keep = null;
  }

  @override
  void dispose() {
    if (_keep != null) keepNow(quiet: true);
    super.dispose();
  }
}

/* ==================================================================================================================
 * Fluid, lab and note entry (implementation additions, in the style of the neighbouring references)
 * ================================================================================================================== */

class FluidScreen extends StatelessWidget {
  final String patientId;
  const FluidScreen({super.key, required this.patientId});
  @override
  Widget build(BuildContext context) => _EntryForm(patientId: patientId, type: 'intake_output', kind: 'fluid', title: 'Fluid In / Out');
}

class LabScreen extends StatelessWidget {
  final String patientId;
  const LabScreen({super.key, required this.patientId});
  @override
  Widget build(BuildContext context) => _EntryForm(patientId: patientId, type: 'lab_event', kind: 'lab', title: 'Lab Event');
}

class NoteScreen extends StatelessWidget {
  final String patientId;
  const NoteScreen({super.key, required this.patientId});
  @override
  Widget build(BuildContext context) => _EntryForm(patientId: patientId, type: 'note', kind: 'note', title: 'Nursing Note');
}

class _EntryForm extends StatefulWidget {
  final String patientId, type, kind, title;
  const _EntryForm({required this.patientId, required this.type, required this.kind, required this.title});
  @override
  State<_EntryForm> createState() => _EntryFormState();
}

class _EntryFormState extends State<_EntryForm> with DraftKeeper {
  late final RecForm form = RecForm(widget.type);
  String _key = newId('k');
  bool _show = false, _restored = false, _done = false, _loaded = false;

  @override
  String get draftId => '${widget.kind}:${appState.user?.id}:${widget.patientId}';
  @override
  String get draftKind => widget.kind;
  @override
  String get draftPatientId => widget.patientId;
  @override
  bool get draftWanted => !_done && form.hasContent;
  @override
  Doc draftPayload() => {'form': form.toDoc(appState.nowIso), 'key': _key};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loaded || appState.user == null) return;
    _loaded = true;
    form.setText('time', hm(appState.nowIso));
    final d = getDraft(appState.store, draftId, appState.user!.id);
    final p = (d?['payload'] as Map?)?.cast<String, Object?>();
    if (p != null) {
      form.load((p['form'] as Map).cast<String, Object?>());
      _key = p['key'] as String? ?? _key;
      _restored = true;
    }
  }

  @override
  void dispose() {
    super.dispose();
    form.dispose();
  }

  void _changed() {
    setState(() {});
    keepSoon();
  }

  Future<void> _discard() async {
    if (!await confirm(context, title: 'Discard this form?', text: 'The values typed here are removed. Nothing was saved as a record.', yes: 'Discard', danger: true) || !mounted) return;
    stopKeeping();
    try {
      discardDraft(appState.ctx(), draftId);
    } on AppError catch (e) {
      toast(context, e.message, error: true, icon: Symbols.error);
      return;
    }
    setState(() {
      form.clear();
      form.setText('time', hm(appState.nowIso));
      _key = newId('k');
      _restored = false;
      _show = false;
    });
  }

  Future<void> _review(PatientFacts f) async {
    final r = checkRec(appState, f, form);
    if (!r.ok) {
      setState(() => _show = true);
      return;
    }
    keepNow();
    form.rechecked.clear();
    var busy = false;
    String? error;
    final saved = await recSheet<Entry>(
      context,
      title: 'Check before saving',
      body: (c, set) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('${f.patient.fullName} · Bed ${f.bed} · MRN ${f.patient.mrn}', style: T.bodyMd.semi),
        const SizedBox(height: 8),
        RowsTable([...valueRows(appState.store, widget.type, r.values), ('Time of care', dateTimeLabel(r.careTime)), ('Recorded by', appState.user?.title ?? '')]),
        if (r.warnings.isNotEmpty) ...[const SizedBox(height: 8), WarningTicks(form: form, check: r, changed: () => set(() {}))],
        if (error != null) ...[const SizedBox(height: 8), ProblemBox(error!, title: 'Not saved')],
        const SizedBox(height: S.lg),
        Btn(
          error == null ? 'Save on this phone' : 'Try again',
          icon: Symbols.save,
          busy: busy,
          reason: 'Tick the warning first.',
          onTap: !warningsDone(form, r)
              ? null
              : () {
                  set(() => busy = true);
                  try {
                    final e = createEntry(appState.ctx(), type: widget.type, patientId: widget.patientId, careTime: r.careTime!, values: r.values, clientKey: _key, also: (_) => discardDraft(appState.ctx(), draftId, audit: false));
                    _done = true;
                    Navigator.pop(c, e);
                  } on AppError catch (e) {
                    set(() {
                      busy = false;
                      error = e.message;
                    });
                  }
                },
        ),
        const SizedBox(height: 8),
        Btn('Go back', kind: BtnKind.quiet, onTap: () => Navigator.pop(c)),
      ]),
    );
    if (saved == null || !mounted) return;
    stopKeeping();
    appState.saved();
    toast(context, 'Saved on this phone: ${kRecTitle[widget.type]} at ${hm(saved.careTime)}, record ${saved.counter}.');
    Go.back(context);
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final f = app.unlocked ? loadFacts(app.store, widget.patientId, app.nowIso) : null;
    if (f == null) return const PhonePage(children: []);
    final r = checkRec(app, f, form);
    return PhonePage(
      header: RecHeader(title: widget.title, subtitle: '${f.patient.family}, ${f.patient.given} • Bed ${f.bed}'),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      gap: 12,
      footer: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: const BoxDecoration(color: C.surface, boxShadow: shadowUp),
        child: Btn('Review', trailing: Symbols.arrow_forward, style: T.headlineSm, onTap: () => _review(f)),
      ),
      children: [
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const RecRail(), const SizedBox(height: 4), RecPatientCard(f)]),
        if (draftProblem != null) ProblemBox(draftProblem!),
        if (_restored)
          Box(
            color: C.secondaryContainer,
            child: Row(children: [
              const Ic(Symbols.draft, size: 20, color: C.onSecondaryContainer),
              const SizedBox(width: 8),
              Expanded(child: Text('Your unfinished form was opened again.', style: T.bodyMd.c(C.onSecondaryContainer))),
              Tap(onTap: _discard, child: Text('Discard', style: T.labelMd.c(C.error))),
            ]),
          ),
        ...recFieldCards(context, app: app, facts: f, form: form, check: r, showErrors: _show, changed: _changed),
        if (_show && !r.ok) ProblemBox('Fix the marked fields first: ${r.errors.values.join('; ')}.'),
      ],
    );
  }
}

/* ==================================================================================================================
 * One stored record
 * ================================================================================================================== */

(String, Color, Color) entryStatus(Entry e) => switch (e.status) {
      'confirmed' => ('Confirmed', C.tertiaryFixed, C.onTertiaryFixedVariant),
      'draft' => ('Draft: not confirmed', const Color(0xFFFDF3DC), const Color(0xFF7A5410)),
      'corrected' => ('Old version', C.surfaceHigh, C.onSurfaceVariant),
      'entered-in-error' => ('Marked as a mistake', C.errorContainer, C.onErrorContainer),
      _ => (e.status, C.surfaceHigh, C.onSurfaceVariant),
    };

class EntryDetailScreen extends StatefulWidget {
  final String patientId;
  final String entryId;
  const EntryDetailScreen({super.key, required this.patientId, required this.entryId});
  @override
  State<EntryDetailScreen> createState() => _EntryDetailScreenState();
}

class _EntryDetailScreenState extends State<EntryDetailScreen> {
  RecForm? _confirm;
  final String _key = newId('k');
  String? _ticked, _error;
  bool _show = false, _busy = false, _photoRead = false;
  Uint8List? _bytes;
  bool _hashOk = false;

  @override
  void dispose() {
    _confirm?.dispose();
    super.dispose();
  }

  void _readPhoto(AppState a, Entry e) {
    if (_photoRead) return;
    _photoRead = true;
    _bytes = a.store.photoBytes(e.rawInputRef);
    _hashOk = _bytes != null && verifyPhoto(a.store, e.rawInputRef);
  }

  Future<void> _mistake(AppState a, Entry e) async {
    final reason = await askText(context, title: 'Mark as a mistake?', text: 'The record stays in the history, crossed out. It is never deleted.', label: 'Reason', hint: 'e.g. recorded on the wrong patient', yes: 'Mark as a mistake', danger: true);
    if (reason == null || !mounted) return;
    try {
      markEnteredInError(a.ctx(), e.id, reason);
      a.saved();
      if (mounted) toast(context, 'Marked as a mistake. The values stay in the history.');
    } on AppError catch (x) {
      if (mounted) toast(context, x.message, error: true, icon: Symbols.error);
    }
  }

  Future<void> _correct(EntryX x) async {
    final reason = await askText(context, title: 'Correct this record', text: 'A correction is a new record. The old one stays in the history.', label: 'Why are you fixing this?', yes: 'Open the form');
    if (reason == null || !mounted) return;
    final v = x.vital;
    await Go.vitals(
      context,
      widget.patientId,
      draft: VitalsDraft(
        patientId: widget.patientId,
        key: newId('k'),
        careTime: x.entry.careTime,
        raw: {for (final k in kVitalRules.keys) if (x.child![k] is num) k: formatDose(x.child![k] as num)},
        o2Device: v.o2Device,
        consciousness: v.consciousness,
        supersedesId: x.entry.id,
        correctionReason: reason,
      ),
    );
    if (mounted) setState(() {});
  }

  String _loaded = '';

  void _startConfirm(EntryX x) => setState(() {
        _confirm = RecForm(x.entry.type)..loadChild(x);
        _loaded = _confirm!.fingerprint;
        _ticked = null;
        _error = null;
        _show = false;
      });

  Future<void> _confirmDraft(AppState a, PatientFacts f, EntryX x) async {
    final form = _confirm;
    if (form == null || _busy) return; // second tap of a double tap
    final r = checkRec(a, f, form, ignoreEntryId: x.entry.id);
    if (!r.ok || _ticked != form.fingerprint || !warningsDone(form, r)) {
      setState(() => _show = true);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    // The words copied from the paper and a weight belong to the record being confirmed (web keepDraftSource).
    final old = x.child ?? const <String, Object?>{};
    final values = {...r.values, if (old.containsKey('raw_text')) 'raw_text': old['raw_text'], if (x.entry.type == 'vital_sign') 'weight_kg': old['weight_kg']};
    try {
      if (_bytes != null && !verifyPhoto(a.store, x.entry.rawInputRef)) throw const AppError('The stored photo does not match its saved hash. Nothing was confirmed.');
      if (r.locks.isNotEmpty) {
        await Go.conflict(context, widget.patientId, r.order!.id, scheduledTime: r.scheduledTime, locks: r.locks);
      } else if (r.secondNurse) {
        final id = await Go.cosign(context, MedProposal(patientId: widget.patientId, orderId: r.order!.id, key: _key, careTime: r.careTime!, scheduledTime: x.entry.scheduledTime, values: values, draftEntryId: x.entry.id));
        if (id != null && mounted) setState(() => _confirm = null);
      } else {
        confirmDraft(a.ctx(), x.entry.id, values, careTime: r.careTime);
        _confirm = null;
        a.saved();
        if (mounted) toast(context, 'Confirmed and saved on this phone.');
      }
    } on AppError catch (e) {
      _error = e.message;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = a.unlocked ? loadFacts(a.store, widget.patientId, a.nowIso) : null;
    final x = f == null ? null : getEntry(a.store, widget.entryId);
    if (f == null) return const PhonePage(children: []);
    if (x == null || x.entry.patientId != widget.patientId) {
      return PhonePage(header: RecHeader(title: 'Record', subtitle: f.patient.fullName), children: const [ProblemBox('This record was not found for this patient.')]);
    }
    final e = x.entry;
    final s = a.store;
    final nurse = a.user?.isNurse ?? false;
    final st = entryStatus(e);
    final retired = e.status == 'corrected' || e.status == 'entered-in-error';
    final chain = versionChain(s, e.id);
    if (e.rawInputKind == 'photo') _readPhoto(a, e);
    if (_confirm != null && !e.isDraft) _confirm = null;
    final form = _confirm;
    final check = form == null ? null : checkRec(a, f, form, ignoreEntryId: e.id);
    return LeaveGuard(
      dirty: () => !_busy && _confirm != null && _confirm!.fingerprint != _loaded,
      child: PhonePage(
      header: RecHeader(title: kRecTitle[e.type] ?? 'Record', subtitle: '${f.patient.family}, ${f.patient.given} • Bed ${f.bed}'),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      gap: 12,
      footer: form == null || check == null
          ? null
          : Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              decoration: const BoxDecoration(color: C.surface, boxShadow: shadowUp),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Btn(check.secondNurse ? 'Ask the second nurse' : 'Confirm record', icon: Symbols.fact_check, style: T.headlineSm, busy: _busy, onTap: _ticked == form.fingerprint && warningsDone(form, check) ? () => _confirmDraft(a, f, x) : null, reason: 'Tick the check above first.'),
                const SizedBox(height: 8),
                Btn('Cancel, keep the draft', kind: BtnKind.quiet, onTap: () => setState(() => _confirm = null)),
              ]),
            ),
      children: [
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const RecRail(), const SizedBox(height: 4), RecPatientCard(f)]),
        Box(
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 40, height: 40, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rFull), child: Ic(kRecIcon[e.type] ?? Symbols.description, size: 20, color: C.primary)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(kRecTitle[e.type] ?? e.type, style: T.headlineSm),
                  Text('${hm(e.careTime)}, ${dayLabel(e.careTime)} · record ${e.counter}', style: T.labelSm.c(C.onSurfaceVariant)),
                ]),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(constraints: const BoxConstraints(maxWidth: 130), child: Tag(st.$1, bg: st.$2, fg: st.$3)),
            ]),
            const SizedBox(height: 8),
            RowsTable(x.child == null ? const [('Values', 'Not stored')] : valueRows(s, e.type, x.child!), struck: retired),
          ]),
        ),
        Box(
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Who, when, where', style: T.headlineSm),
            const SizedBox(height: 4),
            RowsTable([
              ('Measured / given', dateTimeLabel(e.careTime)),
              ('Typed in', dateTimeLabel(e.entryTime)),
              if (e.scheduledTime != null) ('Due time', dateTimeLabel(e.scheduledTime)),
              ('By', staffName(s, e.performerId)),
              if (e.confirmedBy != null) ('Checked and saved by', '${staffName(s, e.confirmedBy)}, ${dateTimeLabel(e.confirmedAt)}'),
              ('Phone · number', '${e.deviceId} · #${e.counter}'),
              ('Source', e.rawInputKind == 'photo' ? 'Paper photo' : 'Typed'),
              if (e.changeReason != null) (e.status == 'entered-in-error' ? 'Mistake reason' : 'Fix reason', e.changeReason!),
            ]),
          ]),
        ),
        if (e.rawInputKind == 'photo')
          Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Source photo', style: T.headlineSm),
              const SizedBox(height: 8),
              if (_bytes == null)
                Text('The photo of this record is not stored on this phone.', style: T.bodyMd.c(C.onSurfaceVariant))
              else ...[
                Tap(
                  label: 'Open the photo full screen',
                  expand: true,
                  onTap: () => showPhoto(context, _bytes!, _hashOk ? 'Photo hash checked' : 'Photo hash does not match'),
                  child: ClipRRect(borderRadius: R.rXl, child: SizedBox(height: 160, width: double.infinity, child: Image.memory(_bytes!, fit: BoxFit.cover, cacheWidth: 900, errorBuilder: (_, __, ___) => Center(child: Text('This picture cannot be shown.', style: T.bodySm))))),
                ),
                const SizedBox(height: 8),
                Row(children: [
                  Ic(_hashOk ? Symbols.verified : Symbols.error, size: 16, color: _hashOk ? C.onTertiaryContainer : C.error),
                  const SizedBox(width: 6),
                  Expanded(child: Text(_hashOk ? 'Photo hash checked: the stored picture is unchanged since it was kept.' : 'The stored picture does not match its saved hash. Tell IT.', style: T.bodySm.c(_hashOk ? C.onSurfaceVariant : C.error))),
                ]),
              ],
            ]),
          ),
        if (chain.length > 1)
          Box(
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('All versions', style: T.headlineSm),
              for (var i = 0; i < chain.length; i++) _version(context, s, chain, i),
            ]),
          ),
        if (form != null && check != null) ...[
          Box(
            color: C.secondaryContainer,
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Ic(Symbols.fact_check, size: 20, color: C.onSecondaryContainer),
              const SizedBox(width: 8),
              Expanded(child: Text(e.aiProposal != null ? 'Values started from the proposal stored with this practice draft. Check every value.' : 'Check every value. Fix what does not match.', style: T.bodyMd.c(C.onSecondaryContainer))),
            ]),
          ),
          ...recFieldCards(context, app: a, facts: f, form: form, check: check, showErrors: _show, tag: 'Draft · not yet confirmed', orderFixed: true, changed: () => setState(() => _ticked = null)),
          if (check.warnings.isNotEmpty) WarningTicks(form: form, check: check, changed: () => setState(() {})),
          Box(
            shadow: true,
            pad: const EdgeInsets.all(14),
            child: TickRow(
              on: _ticked == form.fingerprint,
              text: e.rawInputKind == 'photo' ? 'I have compared each value with the paper document.' : 'I checked every value.',
              sub: e.rawInputKind == 'photo' && _bytes == null ? 'The photo is not on this phone: use the paper form itself.' : 'Recorded under ${a.user?.name ?? ''}.',
              onTap: () => setState(() => _ticked = _ticked == form.fingerprint ? null : form.fingerprint),
            ),
          ),
          if (_show && !check.ok) ProblemBox('Fix the marked fields first: ${check.errors.values.join('; ')}.'),
          if (_error != null) ProblemBox(_error!, title: 'Not confirmed'),
        ] else if (nurse) ...[
          if (e.isDraft && (e.type == 'vital_sign' || e.type == 'med_admin')) Btn('Check and confirm this draft', icon: Symbols.fact_check, radius: R.xl, style: T.headlineSm, onTap: () => _startConfirm(x)),
          if (e.isDraft) Btn('Mark draft as a mistake', icon: Symbols.block, kind: BtnKind.dangerQuiet, radius: R.xl, onTap: () => _mistake(a, e)),
          if (e.isConfirmed) ...[
            if (e.type == 'vital_sign')
              Btn('Correct', icon: Symbols.edit, kind: BtnKind.navy, radius: R.xl, onTap: () => _correct(x))
            else
              Unavailable(reason: 'Use Mark as a mistake and record again.', child: Btn('Correct', icon: Symbols.edit, kind: BtnKind.navy, radius: R.xl, onTap: () {})),
            Btn('Mark as a mistake', icon: Symbols.block, kind: BtnKind.dangerQuiet, radius: R.xl, onTap: () => _mistake(a, e)),
          ],
        ],
      ],
    ),
    );
  }

  Widget _version(BuildContext context, Store s, List<EntryX> chain, int i) {
    final v = chain[i];
    final st = entryStatus(v.entry);
    final before = i == 0 ? const <String, String>{} : {for (final r in valueRows(s, v.entry.type, chain[i - 1].child ?? const {})) r.$1: r.$2};
    final after = {for (final r in valueRows(s, v.entry.type, v.child ?? const {})) r.$1: r.$2};
    return Tap(
      label: 'Version ${i + 1}, ${st.$1}',
      expand: true,
      onTap: v.entry.id == widget.entryId ? null : () => Go.entry(context, widget.patientId, v.entry.id),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 24, height: 24, alignment: Alignment.center, decoration: const BoxDecoration(color: C.secondary, borderRadius: R.rFull), child: Text('${i + 1}', style: T.labelMd.c(C.onSecondary), textScaler: TextScaler.noScaling)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(entrySummary(v), style: T.bodyMd.semi),
              Text('Typed ${dateTimeLabel(v.entry.entryTime)} by ${staffName(s, v.entry.performerId)}', style: T.labelSm.c(C.onSurfaceVariant)),
              if (i > 0)
                for (final k in {...before.keys, ...after.keys})
                  if (before[k] != after[k]) Text('$k: ${before[k] ?? 'Not assessed'} → ${after[k] ?? 'Not assessed'}', style: T.bodySm),
              if (v.entry.changeReason != null) Text('${v.entry.status == 'entered-in-error' ? 'Mistake' : 'Why'}: ${v.entry.changeReason}', style: T.bodySm),
            ]),
          ),
          const SizedBox(width: 8),
          ConstrainedBox(constraints: const BoxConstraints(maxWidth: 120), child: Tag(v.entry.id == widget.entryId ? '${st.$1} · shown' : st.$1, bg: st.$2, fg: st.$3)),
        ]),
      ),
    );
  }
}

/// Full-screen picture with pinch zoom (the lens of the draft reference).
Future<void> showPhoto(BuildContext context, Uint8List bytes, String caption) => showDialog<void>(
      context: context,
      useSafeArea: false,
      builder: (c) => Scaffold(
        backgroundColor: C.primary.withValues(alpha: 0.95),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Paper Document', style: T.headlineSm.c(C.surface)),
                    Text('Pinch to look closer · PRACTICE', style: T.bodySm.c(C.onPrimaryContainer)),
                  ]),
                ),
                Tap(label: 'Close the picture', onTap: () => Navigator.pop(c), child: Container(width: 48, height: 48, alignment: Alignment.center, decoration: BoxDecoration(color: C.surfaceHighest.withValues(alpha: 0.2), borderRadius: R.rFull), child: const Ic(Symbols.close, size: 28, color: C.surface))),
              ]),
              const SizedBox(height: 12),
              Expanded(
                child: ClipRRect(
                  borderRadius: R.rXl,
                  child: ColoredBox(
                    color: C.surfaceHighest,
                    child: InteractiveViewer(maxScale: 6, child: Image.memory(bytes, fit: BoxFit.contain, cacheWidth: 2400, errorBuilder: (_, __, ___) => Center(child: Text('This picture cannot be shown.', style: T.bodyMd)))),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rLg),
                child: Row(children: [const Ic(Symbols.document_scanner, size: 18, color: C.tertiaryFixed), const SizedBox(width: 8), Expanded(child: Text(caption, style: T.bodySm.c(C.surface)))]),
              ),
            ]),
          ),
        ),
      ),
    );

/* ==================================================================================================================
 * Ward companions: local review, alerts, more
 * ================================================================================================================== */

/// Opens another ward page instead of this one.
void _swap(BuildContext context, void Function(BuildContext c) open) {
  final nav = Navigator.of(context, rootNavigator: true);
  if (nav.canPop()) nav.pop();
  open(nav.context);
}

Widget wardNav(BuildContext context, int active) {
  final a = AppScope.of(context);
  if (a.user?.isAdmin ?? false) return AdminNav(active: active == 4 ? 4 : -1);
  final nurse = a.user?.isNurse ?? false;
  return BottomNav([
    NavItem(Symbols.group, 'Patients', () => Go.home(context)),
    NavItem(Symbols.add_box, 'Add', () {
      final p = a.verifiedPatientId;
      if (p != null) {
        Go.addSheet(context, p);
      } else {
        Go.ward(context);
      }
    }),
    NavItem(Symbols.assignment_turned_in, 'Handover', nurse ? () => _swap(context, Go.handover) : () => toast(context, 'Only nurses record a handover.', icon: Symbols.info)),
    NavItem(Symbols.notification_important, 'Alerts', active == 3 ? null : () => _swap(context, Go.alerts), active: active == 3),
    NavItem(Symbols.more_horiz, 'More', active == 4 ? null : () => _swap(context, Go.more), active: active == 4),
  ]);
}

/// White row card with icon, text and an action.
class _LineCard extends StatelessWidget {
  final IconData icon;
  final String title, text;
  final Color iconBg, iconFg;
  final VoidCallback? onTap;
  final Widget? below;
  const _LineCard({required this.icon, required this.title, required this.text, this.iconBg = C.surfaceHigh, this.iconFg = C.primary, this.onTap, this.below});
  @override
  Widget build(BuildContext context) {
    final body = Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(width: 32, height: 32, alignment: Alignment.center, decoration: BoxDecoration(color: iconBg, borderRadius: R.rFull), child: Ic(icon, size: 18, color: iconFg)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: T.labelMd.s(14, 20)), if (text.isNotEmpty) Text(text, style: T.bodySm.c(C.onSurfaceVariant))])),
          if (onTap != null) const Ic(Symbols.chevron_right, size: 20, color: C.onSurfaceVariant),
        ]),
        if (below != null) below!,
      ]),
    );
    return onTap == null ? body : Tap(label: '$title. $text', onTap: onTap, expand: true, child: body);
  }
}

class _Section extends StatelessWidget {
  final String title;
  final int count;
  final List<Widget> children;
  final String empty;
  const _Section(this.title, this.count, this.children, {required this.empty});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          child: Row(children: [Expanded(child: Text(title, style: T.headlineSm)), Tag('$count')]),
        ),
        if (children.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4), child: Text(empty, style: T.bodyMd.c(C.onSurfaceVariant))),
        for (final c in children) Padding(padding: const EdgeInsets.only(top: 8), child: c),
      ]);
}

const Map<String, String> _draftTitle = {'paper': 'Paper entry', 'vitals': 'Vital signs', 'fluid': 'Fluid record', 'note': 'Nursing note', 'lab': 'Lab event', 'sbar': 'SBAR note'};

class QueueScreen extends StatefulWidget {
  final String? patientId;
  const QueueScreen({super.key, this.patientId});
  @override
  State<QueueScreen> createState() => _QueueScreenState();
}

class _QueueScreenState extends State<QueueScreen> {
  void _continue(Doc d) {
    final p = d['patient_id'] as String?;
    final payload = (d['payload'] as Map?)?.cast<String, Object?>() ?? const <String, Object?>{};
    final kind = '${d['kind']}';
    if (p == null) {
      Go.home(context);
      return;
    }
    withPatient(context, p, (c) {
      switch (kind) {
        case 'paper':
          Go.paperDraft(c, p, formType: payload['form_type'] as String? ?? 'note', photoRef: payload['photo_ref'] as String?);
        case 'fluid':
          Go.fluid(c, p);
        case 'note':
          Go.note(c, p);
        case 'lab':
          Go.lab(c, p);
        case 'sbar':
          Go.sbar(c, p, draftId: d['id'] as String);
        case 'vitals':
          Go.vitals(c, p);
        case 'body' || 'body_map':
          Go.bodyMap(c, p);
        case 'med' || 'med_event':
          Go.mar(c, p);
        default:
          Go.summary(c, p);
      }
    });
  }

  Future<void> _discard(AppState a, Doc d) async {
    if (!await confirm(context, title: 'Discard this form?', text: 'The unfinished values are removed. Saved records and kept photos stay.', yes: 'Discard', danger: true) || !mounted) return;
    try {
      discardDraft(a.ctx(), d['id'] as String);
      a.saved();
      if (mounted) toast(context, 'Unfinished form discarded.');
    } on AppError catch (e) {
      if (mounted) toast(context, e.message, error: true, icon: Symbols.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    if (!a.signedIn) return const PhonePage(children: []);
    final s = a.store;
    final nurse = a.user!.isNurse;
    String who(String? id) {
      final p = id == null ? null : s.get('patient', id);
      final bed = id == null ? null : s.where('encounter', 'patient_id', id).firstOrNull?['bed'];
      return p == null ? 'No patient' : '${Patient(p).fullName} · Bed ${bed ?? '—'}';
    }

    final mine = listDrafts(s, a.user!.id, patientId: widget.patientId)..sort((x, y) => '${y['updated_at']}'.compareTo('${x['updated_at']}'));
    final drafts = [
      for (final e in s.all('entry'))
        if (e['status'] == 'draft' && (widget.patientId == null || e['patient_id'] == widget.patientId)) getEntry(s, e['id'] as String)!,
    ];
    final open = s.all('worklist_item').where((w) => w['signed_off_at'] == null && (widget.patientId == null || w['patient_id'] == widget.patientId)).length;
    return PhonePage(
      header: RecHeader(title: 'Local Review', subtitle: widget.patientId == null ? a.unit : who(widget.patientId)),
      nav: wardNav(context, -1),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      gap: 16,
      children: [
        const RecRail(),
        Box(
          color: C.surfaceLow,
          child: Row(children: [const Ic(Symbols.info, size: 20, color: C.secondary), const SizedBox(width: 8), Expanded(child: Text('Everything in this list is on this phone only. Nothing is sent anywhere.', style: T.bodySm.c(C.onSurfaceVariant)))]),
        ),
        _Section('Your unfinished forms', mine.length, empty: 'You have no unfinished form on this phone.', [
          for (final d in mine)
            _LineCard(
              icon: Symbols.draft,
              title: _draftTitle[d['kind']] ?? 'Unfinished form',
              text: '${who(d['patient_id'] as String?)} · kept ${dateTimeLabel(d['updated_at'] as String?)}',
              below: Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(children: [
                  Expanded(child: Btn('Discard', kind: BtnKind.dangerQuiet, onTap: () => _discard(a, d))),
                  const SizedBox(width: 8),
                  Expanded(child: Btn('Continue', kind: BtnKind.navy, onTap: () => _continue(d))),
                ]),
              ),
            ),
        ]),
        _Section('Drafts waiting for a nurse', drafts.length, empty: 'No draft record is waiting for a check.', [
          for (final x in drafts)
            _LineCard(
              icon: kRecIcon[x.entry.type] ?? Symbols.description,
              iconBg: const Color(0xFFFDF3DC),
              iconFg: const Color(0xFF7A5410),
              title: entrySummary(x),
              text: '${who(x.entry.patientId)} · ${hm(x.entry.careTime)} · by ${staffName(s, x.entry.performerId)}${nurse ? '' : ' · only nurses confirm'}',
              onTap: () => withPatient(context, x.entry.patientId, (c) => Go.entry(c, x.entry.patientId, x.entry.id)),
            ),
        ]),
        _Section('Waiting for a signature', open, empty: 'No recovery item is waiting for a signature.', [
          if (open > 0)
            _LineCard(
              icon: Symbols.pending_actions,
              title: '$open recovery ${open == 1 ? 'item is' : 'items are'} not signed yet',
              text: a.user!.isAdmin ? 'Open the recovery worklist' : 'An admin opens the recovery worklist.',
              onTap: a.user!.isAdmin ? () => Go.recovery(context) : null,
            ),
        ]),
      ],
    );
  }
}

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    if (!a.signedIn) return const PhonePage(children: []);
    final s = a.store, now = a.nowIso;
    final nurse = a.user!.isNurse;
    final ward = loadWard(s, now);
    String who(PatientFacts f) => '${f.patient.fullName} · Bed ${f.bed}';
    void open(PatientFacts f, void Function(BuildContext c) then) => withPatient(context, f.patient.id, then);

    final due = <Widget>[], vit = <Widget>[], all = <Widget>[], lab = <Widget>[], dr = <Widget>[], hold = <Widget>[];
    for (final f in ward) {
      final id = f.patient.id;
      for (final d in f.due) {
        if (ms(d.time) > ms(now)) continue;
        due.add(_LineCard(icon: Symbols.medication, title: '${doseLine(d.order)} · due ${hm(d.time)}', text: '${who(f)}${d.highAlert ? ' · high-alert drug' : ''} · no record yet', onTap: () => open(f, (c) => Go.mar(c, id))));
      }
      for (final t in f.vitalsDue) {
        vit.add(_LineCard(icon: Symbols.vital_signs, title: 'Vital signs due ${hm(t)}', text: '${who(f)} · no record yet', onTap: () => open(f, (c) => nurse ? Go.vitals(c, id) : Go.summary(c, id))));
      }
      for (final x in f.realAllergies.where((x) => x.severity == 'severe')) {
        all.add(_LineCard(icon: Symbols.warning, iconBg: C.errorContainer, iconFg: C.error, title: '${x.substance}${x.reaction == null ? '' : ': ${x.reaction}'}', text: '${who(f)} · recorded as severe', onTap: () => open(f, (c) => Go.summary(c, id))));
      }
      for (final x in f.entries.where((x) => x.entry.type == 'lab_event' && x.entry.isConfirmed && x.child != null && x.lab.status == 'critical')) {
        lab.add(_LineCard(icon: Symbols.science, iconBg: C.errorContainer, iconFg: C.error, title: entrySummary(x), text: '${who(f)} · recorded ${hm(x.entry.careTime)}${x.lab.readBack == true ? ' · read back' : ' · read-back not ticked'}', onTap: () => open(f, (c) => Go.entry(c, id, x.entry.id))));
      }
      for (final x in f.drafts) {
        dr.add(_LineCard(icon: Symbols.fact_check, iconBg: const Color(0xFFFDF3DC), iconFg: const Color(0xFF7A5410), title: entrySummary(x), text: '${who(f)} · ${hm(x.entry.careTime)} · not confirmed', onTap: () => open(f, (c) => Go.entry(c, id, x.entry.id))));
      }
      for (final o in f.medOrders) {
        for (final h in s.where('m_order_hold', 'order_id', o.id).where((h) => h['released_at'] == null)) {
          hold.add(_LineCard(
            icon: Symbols.lock,
            iconBg: C.errorContainer,
            iconFg: C.error,
            title: '${o.drugName ?? o.text}: ${h['title'] ?? 'on hold'}',
            text: '${who(f)} · ${h['reason'] ?? ''}',
            onTap: () => open(f, (c) {
              final locks = doseLocks(s, o, f.meds, careTime: now);
              locks.isEmpty ? Go.mar(c, id) : Go.conflict(c, id, o.id, locks: locks);
            }),
          ));
        }
      }
    }
    return PhonePage(
      header: RecHeader(title: 'Alerts', subtitle: a.unit),
      nav: wardNav(context, 3),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      gap: 16,
      children: [
        const RecRail(),
        Box(
          color: C.surfaceLow,
          child: Row(children: [const Ic(Symbols.info, size: 20, color: C.secondary), const SizedBox(width: 8), Expanded(child: Text('Facts from the records on this phone at ${hm(now)}. "Due" means no record yet for that time. There is no score and no alarm.', style: T.bodySm.c(C.onSurfaceVariant)))]),
        ),
        _Section('Orders on hold', hold.length, hold, empty: 'No order is on hold.'),
        _Section('Critical lab results', lab.length, lab, empty: 'No critical lab result is recorded.'),
        _Section('Drafts waiting', dr.length, dr, empty: 'No draft is waiting.'),
        _Section('Doses due now', due.length, due, empty: 'No scheduled dose is due without a record.'),
        _Section('Vital signs due', vit.length, vit, empty: 'No vital-sign time is open.'),
        _Section('Severe allergies', all.length, all, empty: 'No severe allergy is recorded.'),
      ],
    );
  }
}

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});
  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  bool _busy = false;

  Future<void> _reset(AppState a) async {
    if (!await confirm(context, title: 'Reset practice?', text: 'All fictional records on this phone are deleted and the practice patient list is loaded again. This cannot be undone.', yes: 'Continue', danger: true) || !mounted) return;
    final pass = await askText(context, title: 'Reset practice', text: 'Enter the practice passphrase. The records are deleted only when it is right.', label: 'Practice passphrase', yes: 'Delete and start again', danger: true, obscure: true);
    if (pass == null || !mounted) return;
    setState(() => _busy = true);
    try {
      // Checked before anything is deleted.
      await a.resetPractice(passphrase: pass); // checks the passphrase before anything is removed; this page is gone when it returns
      currentToast.value = ToastMessage('The fictional records were loaded again.', Symbols.check_circle, false);
    } catch (e) {
      currentToast.value = ToastMessage('Practice reset: ${problemText(e)}', Symbols.error, true);
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _licence(String title, String asset) async {
    final text = await DefaultAssetBundle.of(context).loadString(asset);
    if (mounted) await recSheet<void>(context, title: title, body: (c, _) => Text(text, style: T.bodySm));
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final u = a.user;
    if (u == null) return const PhonePage(children: []);
    final admin = u.isAdmin;
    return PhonePage(
      header: RecHeader(title: 'More', subtitle: a.unit),
      nav: wardNav(context, 4),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      gap: 8,
      children: [
        const RecRail(),
        Box(
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Container(width: 40, height: 40, alignment: Alignment.center, decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rFull), child: Text(u.initials, style: T.labelMd.bold.c(C.onSecondaryContainer), textScaler: TextScaler.noScaling)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(u.title, style: T.headlineSm), Text('Signed in on this phone · ${u.roleLabel}', style: T.bodySm.c(C.onSurfaceVariant))])),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: Btn('Lock', icon: Symbols.lock, kind: BtnKind.navy, onTap: () => a.lock())),
              const SizedBox(width: 8),
              Expanded(child: Btn('Sign out', icon: Symbols.logout, kind: BtnKind.quiet, onTap: a.signOut)),
            ]),
          ]),
        ),
        _LineCard(
          icon: Symbols.lock_reset,
          title: 'Lock encrypted records',
          text: 'Everyone signs in again after the passphrase.',
          onTap: () async {
            if (await confirm(context, title: 'Lock the encrypted records?', text: 'The practice passphrase is needed to open them again. Unsaved values on open pages are closed.', yes: 'Lock records')) a.lockVault();
          },
        ),
        _LineCard(icon: Symbols.pending_actions, title: 'Local review', text: 'Unfinished forms and drafts on this phone', onTap: () => Go.queue(context)),
        _LineCard(icon: Symbols.print, title: 'Print & clipboard backup', text: 'Paper sheets from the records on this phone', onTap: () => Go.print(context)),
        _LineCard(icon: Symbols.checklist, title: 'Protocol checklist', text: admin ? 'Downtime steps' : 'Downtime steps (an admin ticks them)', onTap: () => Go.checklist(context)),
        _LineCard(icon: Symbols.battery_full, title: 'Battery status', text: 'What Android reports for this phone', onTap: () => Go.battery(context)),
        if (admin) ...[
          Padding(padding: const EdgeInsets.fromLTRB(4, 8, 4, 0), child: Text('Admin', style: T.headlineSm)),
          _LineCard(icon: Symbols.admin_panel_settings, title: 'Readiness', text: 'Home page of the admin', onTap: () => Go.readiness(context)),
          _LineCard(icon: Symbols.fact_check, title: 'Recovery worklist', text: 'Check and sign downtime records', onTap: () => Go.recovery(context)),
          _LineCard(icon: Symbols.save, title: 'FHIR file', text: 'Save the records as a file', onTap: () => Go.export(context)),
          _LineCard(icon: Symbols.history, title: 'Change log', text: 'Every change on this phone', onTap: () => Go.audit(context)),
        ],
        Padding(padding: const EdgeInsets.fromLTRB(4, 8, 4, 0), child: Text('About', style: T.headlineSm)),
        Box(
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('ClinBridge Practice', style: T.labelMd.s(14, 20)),
            const SizedBox(height: 4),
            Text('Practice only, with fictional patients. Records stay encrypted on this phone (${a.deviceId}).', style: T.bodySm.c(C.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text('The app has no permission to use the internet. It can only read whether Android reports a network.', style: T.bodySm.c(C.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text(kPolicyNote, style: T.bodySm.semi.c(C.onSurface)),
          ]),
        ),
        Padding(padding: const EdgeInsets.fromLTRB(4, 8, 4, 0), child: Text('Font and icon licences', style: T.headlineSm)),
        _LineCard(icon: Symbols.description, title: 'Inter', text: 'SIL Open Font License 1.1', onTap: () => _licence('Inter', 'assets/fonts/Inter-OFL.txt')),
        _LineCard(icon: Symbols.description, title: 'Roboto and Roboto Mono', text: 'Apache License 2.0', onTap: () => _licence('Roboto and Roboto Mono', 'assets/fonts/Roboto-LICENSE.txt')),
        _LineCard(icon: Symbols.description, title: 'Material Symbols (icons)', text: 'Apache License 2.0', onTap: () => _licence('Material Symbols: Apache License 2.0', 'assets/fonts/Roboto-LICENSE.txt')),
        const SizedBox(height: 8),
        Btn('Reset practice', icon: Symbols.restart_alt, kind: BtnKind.dangerQuiet, radius: R.xl, busy: _busy, onTap: () => _reset(a)),
      ],
    );
  }
}
