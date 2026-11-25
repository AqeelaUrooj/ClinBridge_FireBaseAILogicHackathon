import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/clock.dart';
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

/* ------------------------------ Shared chart pieces (summary, history, add sheet, vitals) ------------------------------ */

const chartHeadShadow = [BoxShadow(color: Color(0x0F1C2536), offset: Offset(0, 1), blurRadius: 8)];
const _tint = Color(0xFF555E72); // surface-tint of the export
const kAmberText = Color(0xFF7A5410);

/// The bundled fonts have no subscript two: it is drawn as a small 2, so no phone shows an empty box.
class SubText extends StatelessWidget {
  final String text;
  final TextStyle style;
  final int? maxLines;
  final TextAlign? align;
  const SubText(this.text, this.style, {super.key, this.maxLines, this.align});
  @override
  Widget build(BuildContext context) {
    final parts = text.split('₂');
    return Text.rich(
      TextSpan(style: style, children: [
        for (var i = 0; i < parts.length; i++) ...[
          if (i > 0) TextSpan(text: '2', style: TextStyle(fontSize: (style.fontSize ?? 12) * 0.72)),
          TextSpan(text: parts[i]),
        ],
      ]),
      maxLines: maxLines,
      overflow: maxLines == null ? null : TextOverflow.ellipsis,
      textAlign: align,
    );
  }
}

/// "18 Apr 1958"
String dobLabel(Patient p) => dayLabel(p.birthDate);

/// Square avatar with initials (the exports show a stock photo).
class InitialsBox extends StatelessWidget {
  final String text;
  final double size;
  const InitialsBox(this.text, {super.key, this.size = 32});
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rFull),
        child: Text(text, style: T.badge.c(C.onPrimary), textScaler: TextScaler.noScaling),
      );
}

/// 64 dp header with back arrow: add sheet, vitals editor, vitals review.
class BackHeader extends StatelessWidget {
  final String title, sub;
  final VoidCallback onBack;
  const BackHeader({super.key, required this.title, required this.sub, required this.onBack});
  @override
  Widget build(BuildContext context) => MediaQuery.withClampedTextScaling(maxScaleFactor: 1.25, child: Builder(builder: _bar));

  Widget _bar(BuildContext context) => Container(
        constraints: const BoxConstraints(minHeight: 64),
        padding: const EdgeInsets.only(left: 10, right: 12),
        decoration: const BoxDecoration(color: C.surface, boxShadow: chartHeadShadow),
        child: Row(children: [
          Tap(label: 'Go back', onTap: onBack, child: const Ic(Symbols.arrow_back, size: 24)),
          const SizedBox(width: 2),
          Expanded(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: T.headlineSm.tr(-0.025), maxLines: 1, overflow: TextOverflow.ellipsis),
              Text(sub, style: T.labelSm.c(C.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
            ]),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rBase),
            child: Row(children: [const Ic(Symbols.lock, size: 14, color: C.onSurfaceVariant), const SizedBox(width: 4), Text('PRACTICE', style: T.labelSm.c(C.onSurfaceVariant))]),
          ),
          const SizedBox(width: 8),
          InitialsBox(AppScope.of(context).user?.initials ?? ''),
        ]),
      );
}

/// Rebuilds every second while it is on screen (elapsed downtime).
class EverySecond extends StatefulWidget {
  final WidgetBuilder builder;
  const EverySecond(this.builder, {super.key});
  @override
  State<EverySecond> createState() => _EverySecondState();
}

class _EverySecondState extends State<EverySecond> {
  late final Timer _timer;
  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context);
}

/// Always starts with "Practice"; derived from the stored downtime event only.
String phaseText(AppState a) => switch (a.phase) { Phase.ready => 'Practice · normal', Phase.down => 'Practice downtime active', Phase.online => 'Practice · back online' };

String _outageEnd(AppState a) => a.downtime?.networkClearedAt ?? a.nowIso;
String outageHms(AppState a) => a.downtime == null ? '' : elapsedHms(a.downtime!.declaredAt, _outageEnd(a));
String outageHm(AppState a) => a.downtime == null ? '' : elapsedHm(a.downtime!.declaredAt, _outageEnd(a));

/// "45m ago", "2h ago", "3d ago" (whole units, as the design shows it; the exact time stands beside it).
String agoShort(String iso, String nowIso) {
  final min = ((ms(nowIso) - ms(iso)) ~/ 60000).clamp(0, 1 << 31);
  return min < 60 ? '${min}m ago' : min < 2880 ? '${min ~/ 60}h ago' : '${min ~/ 1440}d ago';
}

/// The allergy the header shows: the first severe one, else the first one.
Allergy? mainAllergy(PatientFacts f) => f.realAllergies.where((x) => x.severity == 'severe').firstOrNull ?? f.realAllergies.firstOrNull;

/// 112 dp two-row header of summary and history.
class _ChartHeader extends StatelessWidget {
  final PatientFacts f;
  final String title;
  const _ChartHeader(this.f, this.title);
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final down = a.phase == Phase.down;
    final color = down ? C.error : C.secondary;
    final allergy = mainAllergy(f);
    final big = MediaQuery.textScalerOf(context).scale(10) > 11.5;
    final elapsed = a.downtime == null
        ? null
        : Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
            decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rBase),
            child: EverySecond((_) => Text(outageHms(a), style: T.labelSm.c(C.onSurfaceVariant))),
          );
    Widget localTag() => Tag('Encrypted here', icon: Symbols.encrypted, bg: C.tertiaryFixed, fg: C.onTertiaryFixed, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2));
    final phase = Row(mainAxisSize: MainAxisSize.min, children: [Dot(color, size: 10), const SizedBox(width: 8), Flexible(child: Text(phaseText(a).toUpperCase(), style: T.badge.c(color)))]);
    return Container(
      constraints: const BoxConstraints(minHeight: 112),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: const BoxDecoration(color: C.surface, boxShadow: chartHeadShadow),
      child: Column(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Row(children: [
          Expanded(
            child: big
                ? Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [phase, if (elapsed != null) elapsed, localTag()])
                : Row(children: [
                    Expanded(child: Row(children: [Flexible(child: phase), if (elapsed != null) ...[const SizedBox(width: 8), elapsed]])),
                    const SizedBox(width: 8),
                    localTag(),
                  ]),
          ),
          const SizedBox(width: 8),
          InitialsBox(a.user?.initials ?? ''),
        ]),
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                Flexible(child: Text(title, style: T.headlineSm.tr(-0.025), maxLines: 1, overflow: TextOverflow.ellipsis)),
                if (!big) ...[const SizedBox(width: 8), Text('Bed ${f.bed}', style: T.labelSm.c(C.onSurfaceVariant))],
              ]),
              Text('${big ? 'Bed ${f.bed} • ' : ''}DOB: ${dobLabel(f.patient)} • MRN: ${f.patient.mrn}', style: T.bodySm.c(C.onSurfaceVariant), maxLines: 3, overflow: TextOverflow.ellipsis),
            ]),
          ),
          if (allergy != null)
            Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.all(4),
              constraints: const BoxConstraints(maxWidth: 100),
              decoration: const BoxDecoration(color: C.error, borderRadius: R.rBase),
              child: Text(allergy.substance.toUpperCase(), style: T.badge.c(C.onError), maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          Tap(label: 'Patient details', onTap: () => showPatientInfo(context, f), child: const Ic(Symbols.info, size: 20, color: C.onSurfaceVariant)),
        ]),
      ]),
    );
  }
}

/// Drafts of this person plus unsigned review items, for this patient.
int queueCount(AppState a, PatientFacts f) =>
    f.drafts.length +
    listDrafts(a.store, a.user?.id ?? '', patientId: f.patient.id).length +
    a.store.where('worklist_item', 'patient_id', f.patient.id).where((w) => w['signed_off_by'] == null && !f.drafts.any((d) => d.entry.id == w['entry_id'])).length;

class _ChartNav extends StatelessWidget {
  final PatientFacts f;
  final bool history;
  const _ChartNav(this.f, {this.history = false});
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final id = f.patient.id;
    Widget item(IconData icon, String label, bool active, VoidCallback onTap) => Expanded(
          child: Tap(
            label: label,
            selected: active,
            expand: true,
            onTap: onTap,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Ic(icon, size: 22, color: active ? C.primary : C.onSurfaceVariant),
              const SizedBox(height: 2),
              Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(active ? C.primary : C.onSurfaceVariant).w(active ? FontWeight.w600 : FontWeight.w500)),
            ]),
          ),
        );
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.15,
      child: Container(
      height: 64,
      decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0D1C2536), offset: Offset(0, -2), blurRadius: 12)]),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(children: [
        item(Symbols.monitor_heart, 'Summary', !history, () {
          if (history) Go.summary(context, id);
        }),
        item(history ? Symbols.timeline : Symbols.receipt_long, history ? 'Timeline' : 'History', history, () {
          if (!history) Go.history(context, id);
        }),
        Expanded(
          child: Semantics(
            button: true,
            label: 'Add bedside data',
            excludeSemantics: true,
            onTap: () => Go.addSheet(context, id),
            child: GestureDetector(
              key: const ValueKey('nav-add'),
              behavior: HitTestBehavior.opaque,
              onTap: () => Go.addSheet(context, id),
              child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
                const SizedBox.expand(),
                Positioned(
                  top: -10,
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull, boxShadow: [BoxShadow(color: Color(0x40071020), offset: Offset(0, 4), blurRadius: 12)]),
                    child: const Ic(Symbols.add, size: 28, color: C.onPrimary),
                  ),
                ),
              ]),
            ),
          ),
        ),
        item(Symbols.cloud_off, 'Queue (${queueCount(a, f)})', false, () => Go.queue(context, patientId: id)),
        item(Symbols.checklist_rtl, 'Protocols', false, () => Go.checklist(context)),
      ]),
      ),
    );
  }
}

const _sheetShape = RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20)));

/// Verified identity and the way out of this chart.
void showPatientInfo(BuildContext context, PatientFacts f) {
  final a = AppScope.read(context);
  final check = a.store.where('audit_log', 'entity', 'patient/${f.patient.id}').where((r) => r['action'] == 'patient_verified').lastOrNull;
  final rows = <(String, String)>[
    ('Name', f.patient.fullName),
    ('MRN', f.patient.mrn),
    ('Date of birth', '${dobLabel(f.patient)} (${f.age} years, ${f.patient.sex})'),
    ('Bed', '${f.bed} · ${f.encounter?.unit ?? a.unit}'),
    if (f.encounter != null) ('Admitted', dateTimeLabel(f.encounter!.admitTime)),
    ('Attending', f.encounter?.attending ?? 'Not recorded'),
    ('Code status', f.encounter?.codeStatus ?? 'Not recorded'),
    ('Allergies', f.realAllergies.isEmpty ? f.allergyText : f.realAllergies.map((x) => [x.substance, if (x.reaction != null) '(${x.reaction})', if (x.severity != null) x.severity!].join(' ')).join('\n')),
    ('Identity checked', check == null ? 'Not in the change log' : '${dateTimeLabel(check['time'] as String?)} by ${staffShort(a.store, check['user_id'] as String?)}'),
  ];
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useRootNavigator: true,
    backgroundColor: C.surfaceLowest,
    barrierColor: C.primary.withValues(alpha: 0.6),
    shape: _sheetShape,
    builder: (c) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.85),
        child: Padding(
          padding: const EdgeInsets.all(S.md),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              const Ic(Symbols.person_check, size: 20, color: C.secondary),
              const SizedBox(width: 8),
              Expanded(child: Text('Verified patient', style: T.headlineSm)),
              const Tag('PRACTICE', bg: C.secondaryContainer, fg: C.onSecondaryFixed),
              Tap(label: 'Close', onTap: () => Navigator.pop(c), child: const Ic(Symbols.close, size: 24)),
            ]),
            Flexible(
              child: SingleChildScrollView(
                child: Column(children: [
                  for (final r in rows)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        SizedBox(width: 112, child: Text(r.$1, style: T.bodySm.c(C.onSurfaceVariant))),
                        Expanded(child: Text(r.$2, style: T.bodyMd.semi)),
                      ]),
                    ),
                ]),
              ),
            ),
            const SizedBox(height: S.md),
            Btn('Leave this patient', kind: BtnKind.quiet, icon: Symbols.person_off, onTap: () {
              Navigator.pop(c);
              a.leavePatient();
              Go.ward(context);
            }),
          ]),
        ),
      ),
    ),
  );
}

/// Title of one saved record, from its stored values only.
String entryTitle(EntryX x) {
  switch (x.entry.type) {
    case 'vital_sign':
      return 'Vital signs';
    case 'med_admin':
      return x.child == null ? 'Medication event' : '${x.med.drugName} ${(kEventLabel[x.med.event] ?? x.med.event).toLowerCase()}';
    case 'intake_output':
      return x.child == null ? 'Fluid balance' : (x.io.direction == 'in' ? 'Fluid intake' : 'Fluid output');
    case 'note':
      return x.child == null ? 'Bedside note' : noteLabel(x.note.category);
    case 'lab_event':
      return x.child == null ? 'Lab result' : x.lab.testName;
  }
  return x.entry.type;
}

String entryBody(EntryX x) {
  if (x.child == null) return 'No values saved yet.';
  if (x.entry.type == 'note') return x.note.text;
  if (x.entry.type != 'med_admin') return entrySummary(x);
  final m = x.med;
  final amount = m.event == 'rate_changed'
      ? '${m.priorRate == null ? '' : '${grouped(m.priorRate)} to '}${grouped(m.rate)} ${m.rateUnit ?? ''}'
      : m.doseGiven != null
          ? '${formatDose(m.doseGiven)} ${m.doseGivenUnit ?? ''}'
          : '';
  return [amount.trim(), m.route ?? '', m.reason ?? ''].where((t) => t.isNotEmpty).join(' • ');
}

IconData entryIcon(String type) => switch (type) {
      'vital_sign' => Symbols.vital_signs,
      'med_admin' => Symbols.medication,
      'intake_output' => Symbols.water_drop,
      'note' => Symbols.clinical_notes,
      'lab_event' => Symbols.biotech,
      _ => Symbols.description,
    };

/// Two equal columns, rows of equal height.
class TwoCols extends StatelessWidget {
  final List<Widget> items;
  final double gap;
  const TwoCols(this.items, {super.key, this.gap = 4});
  @override
  Widget build(BuildContext context) => Column(children: [
        for (var i = 0; i < items.length; i += 2) ...[
          if (i > 0) SizedBox(height: gap),
          IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(child: items[i]), SizedBox(width: gap), Expanded(child: i + 1 < items.length ? items[i + 1] : const SizedBox())])),
        ],
      ]);
}

/// Decrypts one stored picture for showing. Nothing is written outside the encrypted records.
class StoredPhoto extends StatefulWidget {
  final String photoRef;
  final BoxFit fit;
  const StoredPhoto(this.photoRef, {super.key, this.fit = BoxFit.cover});
  @override
  State<StoredPhoto> createState() => _StoredPhotoState();
}

class _StoredPhotoState extends State<StoredPhoto> {
  String? _ref;
  Uint8List? _bytes;
  @override
  Widget build(BuildContext context) {
    if (_ref != widget.photoRef) {
      _ref = widget.photoRef;
      _bytes = AppScope.read(context).store.photoBytes(widget.photoRef);
    }
    const fail = Center(child: Ic(Symbols.broken_image, size: 24, color: C.onSurfaceVariant));
    return _bytes == null ? fail : Image.memory(_bytes!, fit: widget.fit, cacheWidth: 1200, gaplessPlayback: true, errorBuilder: (_, __, ___) => fail);
  }
}

class _Missing extends StatelessWidget {
  const _Missing();
  @override
  Widget build(BuildContext context) => PhonePage(children: [Text('PRACTICE', style: T.badge), Text('This patient is not in the records on this phone.', style: T.bodyMd)]);
}

/* ------------------------------ Patient summary ------------------------------ */

class PatientSummaryScreen extends StatelessWidget {
  final String patientId;
  const PatientSummaryScreen({super.key, required this.patientId});

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = a.unlocked ? loadFacts(a.store, patientId, a.nowIso) : null;
    if (f == null) return const _Missing();
    return PhonePage(
      header: _ChartHeader(f, 'Patient Summary'),
      nav: _ChartNav(f),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      gap: 12,
      footer: Padding(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
        child: DecoratedBox(
          decoration: const BoxDecoration(borderRadius: R.rLg, boxShadow: shadowMd),
          child: Btn('Record Bedside Care', kind: BtnKind.navy, radius: R.lg, style: T.headlineSm, icon: Symbols.add_circle, onTap: () => Go.addSheet(context, patientId)),
        ),
      ),
      children: [_Hero(f), _VitalsCard(f), _FluidCard(f), _MedsCard(f), _BedsideCard(f), _TimelineCard(f)],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final IconData icon;
  final String text;
  final Widget right;
  const _SectionTitle(this.icon, this.text, this.right);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 2, children: [
          Row(mainAxisSize: MainAxisSize.min, children: [Ic(icon, size: 20, color: C.secondary), const SizedBox(width: 4), Flexible(child: Text(text, style: T.headlineSm))]),
          right,
        ]),
      );
}

class _Hero extends StatelessWidget {
  final PatientFacts f;
  const _Hero(this.f);
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final severe = [for (final x in f.realAllergies) if (x.severity == 'severe') x];
    final main = severe.isNotEmpty ? severe : f.realAllergies.take(1).toList();
    final others = [for (final x in f.realAllergies) if (!main.any((m) => identical(m.m, x.m))) x];
    String withReaction(Allergy x) => x.reaction == null ? x.substance : '${x.substance} (${x.reaction})';
    final saved = [for (final x in f.entries) x.entry.entryTime]..sort((x, y) => ms(y).compareTo(ms(x)));
    final adm = f.encounter == null ? '' : ' • Adm: ${dayLabel(f.encounter!.admitTime).replaceFirst(RegExp(r' \d{4}$'), '')}';
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 4, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(f.patient.fullName, style: T.headlineSm),
                Text(f.ageSex, style: T.bodySm.c(C.onSurfaceVariant).semi),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rFull, boxShadow: shadowSm),
                  child: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    Text('PRACTICE', style: T.badge.c(C.onSecondaryFixed)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: C.surface.withValues(alpha: 0.8), borderRadius: R.rBase),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.science, size: 13, color: C.error), const SizedBox(width: 2), Flexible(child: Text('FICTIONAL DATA - NOT SENT', style: T.labelSm.c(C.onSecondaryContainer)))]),
                    ),
                  ]),
                ),
              ]),
              const SizedBox(height: 2),
              Text('Bed ${f.bed} • MRN: ${f.patient.mrn}$adm', style: T.bodySm.c(C.onSurfaceVariant)),
            ]),
          ),
          const SizedBox(width: 8),
          Semantics(
            button: true,
            label: 'Verified patient: details and leave',
            excludeSemantics: true,
            onTap: () => showPatientInfo(context, f),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => showPatientInfo(context, f),
              child: SizedBox(
                width: 48,
                height: 48,
                child: Align(
                  alignment: Alignment.topRight,
                  child: Container(width: 40, height: 40, decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rFull), child: const Ic(Symbols.person_check, size: 20, color: C.primary)),
                ),
              ),
            ),
          ),
        ]),
        const SizedBox(height: 8),
        if (main.isEmpty)
          Box(color: C.surfaceLow, radius: R.lg, pad: const EdgeInsets.symmetric(horizontal: 12, vertical: 8), child: Text(f.allergyText, style: T.labelMd.c(C.onSurfaceVariant)))
        else
          Box(
            color: C.errorContainer,
            radius: R.lg,
            pad: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(children: [
              const Ic(Symbols.warning, size: 18, color: C.error, fill: 1),
              const SizedBox(width: 4),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(main.map(withReaction).join(', ').toUpperCase(), style: T.labelMd.bold.c(C.error).tr(0.025)),
                  if (others.isNotEmpty) Text('Also recorded: ${others.map(withReaction).join(', ')}', style: T.labelSm.c(C.onErrorContainer)),
                ]),
              ),
              const SizedBox(width: 8),
              Tag((main.first.severity ?? 'recorded').toUpperCase(), bg: C.error, fg: C.onError, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
            ]),
          ),
        const SizedBox(height: 8),
        Box(
          color: C.surfaceLow,
          radius: R.lg,
          pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Row(children: [
            const Ic(Symbols.verified_user, size: 16, color: C.tertiaryFixedDim),
            const SizedBox(width: 6),
            Expanded(child: Text('Saved on this phone (encrypted)${saved.isEmpty ? '' : ' • ${hm(saved.first)}'}', style: T.labelSm)),
            const SizedBox(width: 4),
            Text(kPhaseLabel[a.phase]!, style: T.labelSm.c(C.secondary).semi),
          ]),
        ),
      ]),
    );
  }
}

class _VitalsCard extends StatelessWidget {
  final PatientFacts f;
  const _VitalsCard(this.f);
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final x = f.lastVitals;
    final v = x?.vital;
    final at = x == null ? '' : hm(x.entry.careTime);
    final today = x != null && x.entry.careTime.substring(0, 10) == a.nowIso.substring(0, 10);
    Widget cell(String label, List<InlineSpan>? value, Widget below) => Container(
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
          padding: const EdgeInsets.all(8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SubText(label.toUpperCase(), T.labelSm.semi.c(C.onSurfaceVariant)),
            const SizedBox(height: 4),
            if (value == null)
              ConstrainedBox(constraints: const BoxConstraints(minHeight: 26), child: Align(alignment: Alignment.centerLeft, heightFactor: 1, child: Text('Not assessed', style: T.bodyMd.semi.c(C.onSurfaceVariant))))
            else
              Text.rich(TextSpan(children: value), style: T.vital),
            const SizedBox(height: 4),
            below,
          ]),
        );
    InlineSpan big(String s) => TextSpan(text: s, style: T.vital.tr(-0.025));
    InlineSpan unit(String s) => TextSpan(text: ' $s', style: T.unit.c(C.onSurfaceVariant));
    InlineSpan none(String s) => TextSpan(text: s, style: T.labelSm.c(C.onSurfaceVariant));
    Widget line(String s, {bool dot = false, bool check = false}) => Row(children: [
          if (dot) ...[const Dot(C.secondary, size: 6), const SizedBox(width: 4)],
          if (check) ...[const Ic(Symbols.check_circle, size: 14, color: C.tertiaryFixedDim), const SizedBox(width: 4)],
          Expanded(child: Text(s, style: T.labelSm.c(C.onSurfaceVariant))),
        ]);
    Widget fact(List<(String, num?)> values, {bool dot = false, bool check = false, String? text}) {
      if (x == null) return line('No record');
      if (values.any((e) => isUnusual(e.$1, e.$2))) {
        return Row(children: [const Ic(Symbols.error, size: 14, color: C.caution), const SizedBox(width: 4), Expanded(child: Text('Check value', style: T.labelSm.semi.c(kAmberText)))]);
      }
      return line(text ?? 'Recorded $at', dot: dot, check: check);
    }

    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _SectionTitle(
          Symbols.vital_signs,
          'Vitals Overview',
          Text(x == null ? 'No vital signs recorded' : '${today ? '' : '${dayLabel(x.entry.careTime)} '}$at (${agoShort(x.entry.careTime, a.nowIso)}) • ${staffShort(a.store, x.entry.performerId)}', textAlign: TextAlign.right, style: T.labelSm.c(C.onSurfaceVariant)),
        ),
        TwoCols([
          cell('Blood Pressure', v?.sys == null ? null : [big('${v!.sys}/${v.dia ?? '?'}'), unit('mmHg')], fact([('bp_systolic', v?.sys), ('bp_diastolic', v?.dia)], dot: true)),
          cell('Heart Rate', v?.heartRate == null ? null : [big('${v!.heartRate}'), unit('bpm')], fact([('heart_rate', v?.heartRate)], check: true)),
          cell('Oxygen (SpO₂)', v?.spo2 == null ? null : [big('${v!.spo2}%'), if (v.o2Flow != null) unit('${formatDose(v.o2Flow)} L/min')], fact([('spo2', v?.spo2)], text: v?.o2Device ?? 'Oxygen device not recorded')),
          cell(
            'Temp / Resp',
            v == null || (v.tempC == null && v.respRate == null)
                ? null
                : [
                    if (v.tempC != null) ...[big(formatDose(v.tempC)), unit('°C')] else none('Temp not assessed'),
                    TextSpan(text: ' • ', style: T.bodyMd.c(C.onSurfaceVariant)),
                    if (v.respRate != null) ...[TextSpan(text: '${v.respRate}', style: T.headlineSm), unit('/min')] else none('Resp not assessed'),
                  ],
            fact([('temp_c', v?.tempC), ('resp_rate', v?.respRate)], text: v?.pain == null ? 'Pain not assessed' : 'Pain ${v!.pain}/10${v.consciousness == null ? '' : ' • ${v.consciousness}'}'),
          ),
        ]),
      ]),
    );
  }
}

class _FluidCard extends StatelessWidget {
  final PatientFacts f;
  const _FluidCard(this.f);
  @override
  Widget build(BuildContext context) {
    final (i, o, net) = f.io;
    final hasIn = f.ioToday.any((x) => x.io.direction == 'in'), hasOut = f.ioToday.any((x) => x.io.direction == 'out');
    Widget col(String label, String? value, {bool net = false}) => Expanded(
          child: Container(
            padding: net ? const EdgeInsets.all(4) : EdgeInsets.zero,
            decoration: net ? const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rBase) : null,
            child: Column(children: [
              Text(label.toUpperCase(), style: T.labelSm.semi.c(net ? C.secondary : C.onSurfaceVariant), textAlign: TextAlign.center),
              const SizedBox(height: 2),
              if (value == null)
                Text('Not recorded', style: T.labelSm.c(C.onSurfaceVariant).s(11, 22), textAlign: TextAlign.center)
              else
                Text.rich(TextSpan(children: [TextSpan(text: value, style: T.headlineSm.c(net ? C.secondary : C.onSurface)), TextSpan(text: ' mL', style: T.unit.regular.c(net ? C.secondary : C.onSurfaceVariant))]), textAlign: TextAlign.center),
            ]),
          ),
        );
    final both = hasIn && hasOut && i > 0;
    final share = both ? o / i : 0.0;
    final part = (share.clamp(0, 1) * 1000).round();
    final day = dayLabel(f.nowIso).replaceFirst(RegExp(r' \d{4}$'), '').toUpperCase();
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _SectionTitle(Symbols.water_drop, 'Fluid Ledger', Tag('$day 00:00 - ${hm(f.nowIso)}', bg: C.surfaceContainer)),
        Box(
          color: C.surfaceLow,
          radius: R.lg,
          pad: const EdgeInsets.all(8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            col('Intake', hasIn ? grouped(i) : null),
            const SizedBox(width: 4),
            col('Output', hasOut ? grouped(o) : null),
            const SizedBox(width: 4),
            col('Net Balance', hasIn && hasOut ? '${net > 0 ? '+' : net < 0 ? '−' : ''}${grouped(net.abs())}' : null, net: true),
          ]),
        ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: SizedBox(
                height: 8,
                child: both
                    ? Row(children: [
                        if (part > 0) Expanded(flex: part, child: const ColoredBox(color: C.secondary, child: SizedBox.expand())),
                        if (part < 1000) Expanded(flex: 1000 - part, child: const ColoredBox(color: _tint, child: SizedBox.expand())),
                      ])
                    : const ColoredBox(color: C.surfaceContainer, child: SizedBox.expand()),
              ),
            ),
          ),
          const SizedBox(width: 8),
          ConstrainedBox(constraints: const BoxConstraints(maxWidth: 200), child: Text(both ? 'Output ${(share * 100).round()}% of intake' : (f.ioToday.isEmpty ? 'No fluid entries today' : 'One side only recorded'), style: T.labelSm.c(C.onSurfaceVariant))),
        ]),
      ]),
    );
  }
}

class _MedLine {
  final int rank;
  final String sort, title, sub, tag;
  final IconData icon;
  final bool held, due;
  const _MedLine(this.rank, this.sort, this.title, this.sub, this.tag, this.icon, {this.held = false, this.due = false});
}

/// One order with its real status: hold of the order, slot records, last given, current rate. No timing judgement.
_MedLine _medLine(Store s, PatientFacts f, ActiveOrder o) {
  final hold = s.where('m_order_hold', 'order_id', o.id).where((h) => h['released_at'] == null).firstOrNull;
  final group = orderGroup(o);
  final title = group == OrderGroup.infusion ? '${o.drugName ?? o.text} infusion' : doseLine(o);
  if (hold != null) return _MedLine(1, o.id, title, 'HOLD: ${hold['reason'] ?? hold['title'] ?? 'order on hold'}', 'HELD', Symbols.block, held: true);
  final high = isHighAlert(o.drugName) ? 'High alert • ' : '';
  switch (group) {
    case OrderGroup.infusion:
      final (rate, unit) = currentRate(o, f.meds);
      final change = orderHistory(o, f.meds).where((x) => x.entry.isConfirmed && x.med.event == 'rate_changed').firstOrNull;
      return _MedLine(2, o.id, title, '$high${change == null ? 'Ordered rate' : 'Last change ${hm(change.entry.careTime)}'}', rate == null ? 'NO RATE' : '${grouped(rate)} ${unit ?? ''}'.trim(), Symbols.water_drop);
    case OrderGroup.prn:
      final g = lastGiven(o, f.meds);
      return _MedLine(3, o.id, '$title PRN', '$high${g == null ? 'Not given yet' : 'Last given: ${hm(g.entry.careTime)} (${sinceText(g.entry.careTime, f.nowIso)} ago)'}', 'AS NEEDED', o.route == 'INH' ? Symbols.air : Symbols.pill);
    case OrderGroup.scheduled:
      final slots = slotStatuses(o, f.nowIso, f.meds);
      final due = slots.where((x) => x.status == 'due').firstOrNull;
      final draft = slots.where((x) => x.status == 'draft').firstOrNull;
      final done = slots.where((x) => x.entry != null && x.status != 'draft').lastOrNull;
      final sub = '${high}Scheduled: ${o.frequency ?? 'see MAR'}';
      if (due != null) return _MedLine(0, due.time, title, sub, 'DUE ${hm(due.time)}', Symbols.alarm, due: true);
      if (draft != null) return _MedLine(0, draft.time, title, sub, 'DRAFT ${hm(draft.time)}', Symbols.edit_note);
      if (done == null) return _MedLine(4, o.id, title, sub, 'NO TIME', Symbols.medication);
      return _MedLine(4, o.id, title, sub, '${done.status.toUpperCase()} ${hm(done.entry!.careTime)}', done.status == 'given' ? Symbols.check_circle : Symbols.block, held: done.status == 'held');
  }
}

class _MedsCard extends StatelessWidget {
  final PatientFacts f;
  const _MedsCard(this.f);
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final lines = [for (final o in f.medOrders) _medLine(a.store, f, o)]..sort((x, y) {
        final r = x.rank.compareTo(y.rank);
        return r != 0 ? r : x.sort.compareTo(y.sort);
      });
    final scheduled = f.medOrders.where((o) => orderGroup(o) == OrderGroup.scheduled).length;
    final shown = lines.take(4).toList();
    void open() => Go.mar(context, f.patient.id);
    return Box(
      shadow: true,
      pad: EdgeInsets.fromLTRB(12, 0, 12, lines.length > shown.length ? 0 : 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Tap(
          label: 'Open the medication record (MAR)',
          expand: true,
          onTap: open,
          child: Row(children: [
            const Ic(Symbols.pill, size: 20, color: C.secondary),
            const SizedBox(width: 4),
            Expanded(child: Text('Medications ($scheduled Scheduled)', style: T.headlineSm)),
            const SizedBox(width: 8),
            Text('Open MAR', style: T.labelSm.c(C.onSurfaceVariant)),
            const Ic(Symbols.chevron_right, size: 16, color: C.onSurfaceVariant),
          ]),
        ),
        if (lines.isEmpty) Box(color: C.surfaceLow, radius: R.lg, child: Text('No medication orders on the pre-outage list.', style: T.bodySm.c(C.onSurfaceVariant))),
        for (var i = 0; i < shown.length; i++) ...[if (i > 0) const SizedBox(height: 4), _row(shown[i], open)],
        if (lines.length > shown.length) Tap(onTap: open, expand: true, child: Text('${lines.length - shown.length} more in the MAR', style: T.labelSm.semi.c(C.secondary))),
      ]),
    );
  }

  Widget _row(_MedLine m, VoidCallback open) {
    final (iconBg, iconFg) = m.held ? (C.error, C.onError) : m.due ? (C.secondaryContainer, C.onSecondaryContainer) : (C.surfaceHighest, C.onSurfaceVariant);
    final (tagBg, tagFg) = m.held ? (C.error, C.onError) : m.due ? (C.secondaryFixed, C.onSecondaryFixed) : (C.surfaceContainer, C.onSurfaceVariant);
    return Semantics(
      button: true,
      label: '${m.title}. ${m.sub}. ${m.tag}. Open the MAR',
      excludeSemantics: true,
      onTap: open,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: open,
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: m.held ? C.errorContainer : C.surfaceLow, borderRadius: R.rLg),
          child: Row(children: [
            Container(width: 32, height: 32, decoration: BoxDecoration(color: iconBg, borderRadius: R.rFull), child: Ic(m.icon, size: 18, color: iconFg)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m.title, style: m.held ? T.labelMd.bold.c(C.error) : T.labelMd, maxLines: 2, overflow: TextOverflow.ellipsis),
                Text(m.sub, style: T.labelSm.c(m.held ? C.onErrorContainer : C.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
              ]),
            ),
            const SizedBox(width: 8),
            Tag(m.tag, bg: tagBg, fg: tagFg, pad: const EdgeInsets.symmetric(horizontal: 8, vertical: 4)),
          ]),
        ),
      ),
    );
  }
}

class _BedsideCard extends StatelessWidget {
  final PatientFacts f;
  const _BedsideCard(this.f);
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final photos = a.store.where('m_photo', 'patient_id', f.patient.id)..sort((x, y) => '${x['saved_at']}'.compareTo('${y['saved_at']}'));
    final p = photos.lastOrNull;
    // Latest saved site whose note is still valid.
    final live = {for (final x in f.entries) if (x.entry.isConfirmed) x.entry.id};
    final finding = a.store.where('m_body_finding', 'patient_id', f.patient.id).where((r) => live.contains(r['entry_id'])).lastOrNull;
    final region = finding?['region_label'] is String ? finding!['region_label'] as String : '';
    void body() => Go.bodyMap(context, f.patient.id);
    Widget tile(String label, String? value) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase),
          child: Text.rich(TextSpan(children: [TextSpan(text: '$label: ', style: T.bodySm.semi), TextSpan(text: value ?? 'Not recorded', style: T.bodySm.c(C.onSurfaceVariant))])),
        );
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _SectionTitle(
          Symbols.bed,
          'Bedside Status & Site',
          Row(mainAxisSize: MainAxisSize.min, children: [
            Ic(Symbols.photo_camera, size: 14, color: photos.isEmpty ? C.onSurfaceVariant : C.onTertiaryContainer),
            const SizedBox(width: 4),
            Flexible(child: Text(photos.isEmpty ? 'No photo' : '${photos.length} Photo${photos.length == 1 ? '' : 's'} Local', style: T.labelSm.semi.c(photos.isEmpty ? C.onSurfaceVariant : C.onTertiaryContainer))),
          ]),
        ),
        ClipRRect(
          borderRadius: R.rLg,
          child: ColoredBox(
            color: p == null ? C.surfaceContainer : C.surfaceDim,
            child: SizedBox(
              height: 144,
              child: Stack(fit: StackFit.expand, children: [
                if (p != null)
                  Semantics(image: true, label: 'Latest paper photo of this patient', child: StoredPhoto(p['id'] as String))
                else
                  Padding(
                    padding: const EdgeInsets.only(bottom: 24),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const Ic(Symbols.no_photography, size: 24, color: C.outline),
                      const SizedBox(height: 4),
                      Text('No photo on this phone', style: T.labelSm.c(C.onSurfaceVariant)),
                    ]),
                  ),
                Positioned(
                  left: 0,
                  bottom: 0,
                  child: Semantics(
                    button: true,
                    label: 'Open the body map',
                    excludeSemantics: true,
                    onTap: body,
                    child: GestureDetector(
                      key: const ValueKey('body-map-link'),
                      behavior: HitTestBehavior.opaque,
                      onTap: body,
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 48, maxWidth: 300),
                        padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                        child: Align(
                          alignment: Alignment.bottomLeft,
                          widthFactor: 1,
                          heightFactor: 1,
                          child: Container(
                            margin: const EdgeInsets.only(top: 18),
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(color: C.primaryContainer.withValues(alpha: 0.9), borderRadius: R.rBase),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              const Ic(Symbols.pin_drop, size: 14, color: C.inversePrimary),
                              const SizedBox(width: 4),
                              Flexible(child: Text(region.isEmpty ? 'Open body map' : 'Body map: $region', style: T.labelSm.c(C.inversePrimary), maxLines: 1, overflow: TextOverflow.ellipsis)),
                              const Ic(Symbols.chevron_right, size: 14, color: C.inversePrimary),
                            ]),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                if (p != null)
                  Positioned(
                    right: 8,
                    top: 8,
                    child: Tag('Photo saved ${hm(p['saved_at'] as String?)}', bg: C.primaryContainer.withValues(alpha: 0.9), fg: C.inversePrimary, style: T.labelSm),
                  ),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 8),
        TwoCols([
          tile('Isolation', f.encounter?.isolation),
          tile('Diet', f.encounter?.diet),
          tile('Code status', f.encounter?.codeStatus),
          tile('Attending', f.encounter?.attending),
        ]),
      ]),
    );
  }
}

class _TimelineCard extends StatelessWidget {
  final PatientFacts f;
  const _TimelineCard(this.f);
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final confirmed = [for (final x in f.entries) if (x.entry.isConfirmed) x];
    final shown = confirmed.take(3).toList();
    return Box(
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _SectionTitle(Symbols.history_edu, 'Downtime Care Timeline', Text('${confirmed.length} SAVED HERE', style: T.badge.c(C.onTertiaryContainer), textAlign: TextAlign.right)),
        if (shown.isEmpty) Text('No confirmed bedside records yet.', style: T.bodySm.c(C.onSurfaceVariant)),
        for (var i = 0; i < shown.length; i++) ...[if (i > 0) const SizedBox(height: 8), _item(context, a, shown[i], i == shown.length - 1)],
      ]),
    );
  }

  Widget _item(BuildContext context, AppState a, EntryX x, bool last) {
    void open() => Go.entry(context, f.patient.id, x.entry.id);
    final vital = x.entry.type == 'vital_sign';
    return Semantics(
      button: true,
      label: 'Open record: ${entryTitle(x)} at ${hm(x.entry.careTime)}',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: open,
        child: Container(
          constraints: const BoxConstraints(minHeight: 48),
          padding: EdgeInsets.only(bottom: last ? 0 : 8),
          decoration: last ? null : const BoxDecoration(border: Border(bottom: BorderSide(color: C.surfaceLow))),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 28,
              height: 28,
              margin: const EdgeInsets.only(top: 2),
              decoration: BoxDecoration(color: vital ? C.surfaceHigh : C.secondaryContainer, borderRadius: R.rFull),
              child: Ic(entryIcon(x.entry.type), size: 15, color: vital ? C.onSurface : C.onSecondaryContainer),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(entryTitle(x), style: T.labelMd, maxLines: 1, overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 4),
                  Text(hm(x.entry.careTime), style: T.labelSm.c(C.onSurfaceVariant)),
                ]),
                const SizedBox(height: 2),
                SubText(entryBody(x), T.bodySm.c(C.onSurfaceVariant), maxLines: 4),
                const SizedBox(height: 4),
                Row(children: [
                  const Ic(Symbols.check_circle, size: 13, color: C.tertiaryFixedDim),
                  const SizedBox(width: 4),
                  Expanded(child: Text('${staffShort(a.store, x.entry.performerId)} • Confirmed, on this phone', style: T.labelSm.c(C.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis)),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

/* ------------------------------ Add bedside care ------------------------------ */

class _AddItem {
  final IconData icon;
  final String title, sub;
  final void Function(BuildContext c) go;
  final String? badge, label;
  final bool first, green;
  const _AddItem(this.icon, this.title, this.sub, this.go, {this.badge, this.label, this.first = false, this.green = false});
}

class AddBedsideScreen extends StatelessWidget {
  final String patientId;
  const AddBedsideScreen({super.key, required this.patientId});

  void _close(BuildContext c) {
    if (Navigator.of(c).canPop()) {
      Navigator.of(c).pop();
    } else {
      Go.summary(c, patientId);
    }
  }

  /// The sheet closes and the form opens on the chart, so leaving the form returns to the same chart.
  void _open(BuildContext c, void Function(BuildContext c) go) {
    final nav = Navigator.of(c);
    if (nav.canPop()) nav.pop();
    go(nav.context);
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = a.unlocked ? loadFacts(a.store, patientId, a.nowIso) : null;
    if (f == null) return const _Missing();
    final nurse = a.user?.isNurse ?? false;
    final last = f.lastVitals;
    final dueNow = f.due.where((d) => ms(d.time) <= ms(a.nowIso)).length;
    final id = patientId;
    final who = '${f.patient.fullName} • Bed ${f.bed}';
    final items = <_AddItem>[
      _AddItem(Symbols.ecg_heart, 'Record vitals', 'BP, HR, SpO₂, Temp, Resp, Pain score', (c) => Go.vitals(c, id), first: true, badge: last == null ? 'NONE YET' : 'LAST ${hm(last.entry.careTime)}'),
      _AddItem(Symbols.pill, 'Medication event', 'Give, hold, refuse or change a rate', (c) => Go.mar(c, id), label: dueNow > 0 ? '$dueNow due so far' : 'MAR on phone'),
      _AddItem(Symbols.water_drop, 'Fluid balance', 'Intake, IV fluids, urine & drain output', (c) => Go.fluid(c, id)),
      _AddItem(Symbols.edit_note, 'Bedside note', 'Focused assessment or change in condition', (c) => Go.note(c, id)),
      _AddItem(Symbols.science, 'Lab result', 'Sample, result or phoned lab read-back', (c) => Go.lab(c, id), label: 'Typed by you', green: true),
      _AddItem(Symbols.swap_horizontal_circle, 'Clinical handover', 'Shift SBAR handoff or transfer notes', (c) => Go.sbar(c, id)),
      _AddItem(Symbols.photo_camera, 'Paper photo', 'Capture bedside paper downtime worksheet', (c) => Go.paperCapture(c, id), label: 'You type values'),
      _AddItem(Symbols.accessibility_new, 'Body map', 'Skin, wound and line sites', (c) => Go.bodyMap(c, id)),
    ];
    return Scaffold(
      backgroundColor: C.surface,
      body: Column(children: [
        ColoredBox(color: C.surface, child: SafeArea(bottom: false, child: BackHeader(title: 'Quick Actions', sub: who, onBack: () => _close(context)))),
        Expanded(
          child: GestureDetector(
            key: const ValueKey('sheet-outside'),
            behavior: HitTestBehavior.opaque,
            excludeFromSemantics: true,
            onTap: () => _close(context),
            child: SafeArea(
              top: false,
              child: Align(
                alignment: Alignment.topCenter,
                child: GestureDetector(
                  onTap: () {}, // touches on the sheet do not dismiss it
                  excludeFromSemantics: true,
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 12),
                    color: const Color(0xFF4B515E), // scrim behind the rounded corners
                    child: Container(
                      decoration: const BoxDecoration(
                        color: C.surfaceLowest,
                        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                        boxShadow: [BoxShadow(color: Color(0x1A000000), offset: Offset(0, 20), blurRadius: 25, spreadRadius: -5)],
                      ),
                      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        const SizedBox(height: 8),
                        Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: C.surfaceHighest, borderRadius: BorderRadius.circular(2)))),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 2, 2, 6),
                          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                const SizedBox(height: 6),
                                Wrap(spacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                                  Text('Add Bedside Documentation', style: T.headlineSm.tr(-0.025)),
                                  const Tag('LOCAL', icon: Symbols.offline_pin, bg: C.tertiaryFixed, fg: C.onTertiaryFixed, pad: EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                                ]),
                                Text(who, style: T.labelMd.c(C.onSurfaceVariant), maxLines: 1, overflow: TextOverflow.ellipsis),
                              ]),
                            ),
                            Tap(label: 'Close', onTap: () => _close(context), child: const Ic(Symbols.close, size: 24, color: C.onSurfaceVariant)),
                          ]),
                        ),
                        Container(
                          margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
                          child: Row(children: [
                            Ic(nurse ? Symbols.verified_user : Symbols.block, size: 18, color: nurse ? C.secondary : C.error),
                            const SizedBox(width: 4),
                            Expanded(child: Text(nurse ? 'Time and your name are added on this phone • Records are stored encrypted' : 'Only nurses can record care. You can read this chart.', style: T.labelSm.c(C.onSurfaceVariant))),
                          ]),
                        ),
                        Flexible(
                          child: SingleChildScrollView(
                            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                            child: Column(children: [
                              for (var i = 0; i < items.length; i++) ...[
                                if (i > 0) const SizedBox(height: 4),
                                if (nurse) _row(context, items[i]) else Unavailable(reason: 'Only nurses can record care', child: _row(context, items[i])),
                              ],
                            ]),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: const BoxDecoration(color: C.surfaceLowest, boxShadow: [BoxShadow(color: Color(0x0A071020), offset: Offset(0, -4), blurRadius: 12)]),
                          child: Btn('Cancel and return to chart', kind: BtnKind.quiet, radius: R.lg, style: T.headlineSm, icon: Symbols.arrow_back, onTap: () => _close(context)),
                        ),
                      ]),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _row(BuildContext context, _AddItem it) => Semantics(
        button: true,
        label: '${it.title}. ${it.sub}',
        excludeSemantics: true,
        onTap: () => _open(context, it.go),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => _open(context, it.go),
          child: Container(
            constraints: const BoxConstraints(minHeight: 58),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(color: it.first ? const Color(0xFFEAF3FE) : C.surfaceLow, borderRadius: R.rXl),
            child: Row(children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: it.first ? C.primary : C.surfaceHighest, borderRadius: R.rLg, boxShadow: it.first ? shadowSm : null),
                child: Ic(it.icon, size: 24, color: it.first ? C.onPrimary : C.onSurface),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(it.title, style: T.headlineSm)),
                    if (it.badge != null) Tag(it.badge!, bg: C.primary, fg: C.onPrimary),
                    if (it.label != null)
                      it.green
                          ? Tag(it.label!, bg: C.tertiaryFixed.withValues(alpha: 0.4), fg: C.onTertiaryFixedVariant, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 1))
                          : Text(it.label!, style: T.labelSm.c(C.secondary)),
                  ]),
                  SubText(it.sub, T.bodySm.c(C.onSurfaceVariant), maxLines: 1),
                ]),
              ),
              const SizedBox(width: 12),
              const Ic(Symbols.chevron_right, size: 20, color: C.onSurfaceVariant),
            ]),
          ),
        ),
      );
}

/* ------------------------------ History (continuity ledger) ------------------------------ */

/// One line of the timeline: a saved record, a handover, or results of the pre-outage list taken at one time.
class LedgerEvent {
  /// Null only for handovers that came with the practice list without a saved time.
  final String? time;
  final EntryX? entry;
  final HandoffWithTime? handoff;
  final List<SnapshotResult> baseline;
  const LedgerEvent(this.time, {this.entry, this.handoff, this.baseline = const []});
  bool get isBaseline => baseline.isNotEmpty;
  bool get isMed => entry?.entry.type == 'med_admin';
  bool get isVitalOrLab => isBaseline || entry?.entry.type == 'vital_sign' || entry?.entry.type == 'lab_event';
  bool get isFluid => entry?.entry.type == 'intake_output';
  bool get isNote => entry?.entry.type == 'note' || handoff != null;
  String? get performer => entry?.entry.performerId ?? handoff?.handoff.createdBy;
  String get id => entry?.entry.id ?? handoff?.handoff.id ?? 'list:${baseline.first.kind}:$time';
}

/// Newest clinical time first. Records of the same time keep the core's stable order; list results come after them.
/// A corrected version is folded into the record that replaced it.
List<LedgerEvent> buildLedger(Store s, String patientId) {
  final entries = listPatientEntries(s, patientId);
  final replaced = {for (final x in entries) if (x.entry.supersedesId != null) x.entry.supersedesId!};
  final groups = <String, List<SnapshotResult>>{};
  for (final r in s.where('snapshot_result', 'patient_id', patientId)) {
    final x = SnapshotResult(r);
    groups.putIfAbsent('${x.time}|${x.kind}', () => []).add(x);
  }
  final out = <LedgerEvent>[
    for (final x in entries) if (!replaced.contains(x.entry.id)) LedgerEvent(x.entry.careTime, entry: x),
    for (final h in listHandoffs(s, patientId)) LedgerEvent(h.savedAt, handoff: h),
    for (final g in groups.values) LedgerEvent(g.first.time, baseline: g),
  ];
  final order = {for (var i = 0; i < out.length; i++) out[i]: i};
  int at(LedgerEvent e) => e.time == null ? -1 : ms(e.time!);
  out.sort((x, y) {
    final r = at(y).compareTo(at(x));
    return r != 0 ? r : order[x]!.compareTo(order[y]!);
  });
  return out;
}

enum LedgerFilter { all, bedside, list, meds, vitals, fluids, notes }

class HistoryScreen extends StatefulWidget {
  final String patientId;
  const HistoryScreen({super.key, required this.patientId});
  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  LedgerFilter _filter = LedgerFilter.all;
  String? _performer;
  final Set<String> _open = {};

  bool _in(LedgerEvent e) => switch (_filter) {
        LedgerFilter.all => true,
        LedgerFilter.bedside => !e.isBaseline,
        LedgerFilter.list => e.isBaseline,
        LedgerFilter.meds => e.isMed,
        LedgerFilter.vitals => e.isVitalOrLab,
        LedgerFilter.fluids => e.isFluid,
        LedgerFilter.notes => e.isNote,
      };

  Future<void> _pickPerformer(AppState a, List<LedgerEvent> events) async {
    final ids = {for (final e in events) if (e.performer != null) e.performer!}.toList();
    final r = await showModalBottomSheet<String>(
      context: context,
      useRootNavigator: true,
      backgroundColor: C.surfaceLowest,
      barrierColor: C.primary.withValues(alpha: 0.6),
      shape: _sheetShape,
      builder: (c) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Show records of', style: T.headlineSm),
            const SizedBox(height: 8),
            Btn('Everyone', kind: _performer == null ? BtnKind.navy : BtnKind.quiet, onTap: () => Navigator.pop(c, '')),
            for (final id in ids) ...[const SizedBox(height: 8), Btn(staffName(a.store, id), kind: _performer == id ? BtnKind.navy : BtnKind.quiet, onTap: () => Navigator.pop(c, id))],
            if (ids.isEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('No records by staff yet.', style: T.bodySm.c(C.onSurfaceVariant))),
          ]),
        ),
      ),
    );
    if (r != null && mounted) setState(() => _performer = r.isEmpty ? null : r);
  }

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final f = a.unlocked ? loadFacts(a.store, widget.patientId, a.nowIso) : null;
    if (f == null) return const _Missing();
    final all = buildLedger(a.store, widget.patientId);
    final byWho = _performer == null ? all : [for (final e in all) if (e.performer == _performer) e];
    final shown = [for (final e in byWho) if (_in(e)) e];
    final local = all.where((e) => !e.isBaseline).length;
    final list = all.where((e) => e.isBaseline).toList();
    final results = list.fold<int>(0, (n, e) => n + e.baseline.length);
    final snap = a.store.all('snapshot').firstOrNull;
    final counters = [for (final x in f.entries) if (x.entry.deviceId == a.deviceId) x.entry.counter];
    final chips = <(LedgerFilter, String)>[
      (LedgerFilter.all, 'All Events (${byWho.length})'),
      (LedgerFilter.bedside, 'Bedside Records (${byWho.where((e) => !e.isBaseline).length})'),
      (LedgerFilter.list, 'Pre-Outage List (${byWho.where((e) => e.isBaseline).length})'),
      (LedgerFilter.meds, 'Meds & Drips'),
      (LedgerFilter.vitals, 'Vitals & Labs'),
      (LedgerFilter.fluids, 'Fluids'),
      (LedgerFilter.notes, 'Notes & SBAR'),
    ];
    final ev = a.downtime;
    // The line is drawn only when something lies on the newer side of it.
    var lineOpen = ev != null && shown.any((e) => e.time != null && ms(e.time!) >= ms(ev.declaredAt));
    final stream = <Widget>[];
    for (final e in shown) {
      final before = ev != null && (e.time == null || ms(e.time!) < ms(ev.declaredAt));
      if (lineOpen && before) {
        stream.add(_OutageLine(ev));
        lineOpen = false;
      }
      stream.add(_LedgerCard(
        key: ValueKey(e.id),
        event: e,
        patientId: widget.patientId,
        open: _open.contains(e.id),
        before: before,
        onToggle: () => setState(() => _open.contains(e.id) ? _open.remove(e.id) : _open.add(e.id)),
      ));
    }
    if (lineOpen) stream.add(_OutageLine(ev!));
    return PhonePage(
      header: _ChartHeader(f, 'Patient History'),
      nav: _ChartNav(f, history: true),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      children: [
        _HistoryBanner(f),
        const SizedBox(height: 12),
        TwoCols([
          _deck('Bedside Records', Symbols.lock_clock, C.tertiaryContainer, local, 'bedside events', counters.isEmpty ? 'None by this phone' : 'Last here: #${counters.reduce((x, y) => x > y ? x : y)}', mono: true),
          _deck('Pre-Outage List', Symbols.database, C.onSurfaceVariant, list.length, 'result sets', '$results results${snap?['taken_at'] == null ? '' : ' · list of ${hm(snap!['taken_at'] as String)}'}'),
        ]),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(children: [
            Expanded(child: Text('CONTINUITY LEDGER', style: T.labelMd.tr(0.05))),
            Tap(
              label: _performer == null ? 'Filter by performer' : 'Performer ${staffName(a.store, _performer)}. Change',
              onTap: () => _pickPerformer(a, all),
              child: _small(Symbols.badge, _performer == null ? 'Performer' : staffShort(a.store, _performer), _performer == null ? C.surfaceHigh : C.secondaryContainer, C.onSurface),
            ),
            const SizedBox(width: 4),
            if (a.user?.isAdmin ?? false)
              Tap(label: 'Open the change log', onTap: () => Go.audit(context), child: _small(Symbols.list_alt, 'Ledger', C.primary, C.onPrimary))
            else
              Unavailable(
                reason: 'The change log opens for admins. Every record here has its own details under Payload.',
                child: ConstrainedBox(constraints: const BoxConstraints(minHeight: 48), child: Center(widthFactor: 1, heightFactor: 1, child: _small(Symbols.download, 'Ledger', C.primary, C.onPrimary))),
              ),
          ]),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          child: Row(children: [
            for (final c in chips) ...[
              Tap(
                label: c.$2,
                selected: _filter == c.$1,
                onTap: () => setState(() => _filter = c.$1),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: _filter == c.$1 ? C.primary : C.surfaceContainer, borderRadius: R.rFull),
                  child: Text(c.$2, style: _filter == c.$1 ? T.labelSm.semi.c(C.onPrimary) : T.labelSm.c(C.onSurfaceVariant)),
                ),
              ),
              const SizedBox(width: 8),
            ],
          ]),
        ),
        const SizedBox(height: 4),
        if (shown.isEmpty)
          Box(shadow: true, child: Text(all.isEmpty ? 'No records and no pre-outage results for this patient.' : 'Nothing matches this filter.', style: T.bodyMd.c(C.onSurfaceVariant)))
        else
          Stack(children: [
            const Positioned(left: 16, top: 8, bottom: 16, child: SizedBox(width: 2, child: ColoredBox(color: C.surfaceHigh))),
            Column(children: [
              for (var i = 0; i < stream.length; i++) ...[if (i > 0) const SizedBox(height: 12), stream[i]],
            ]),
          ]),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rXl),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Ic(Symbols.history, size: 18, color: C.onSurfaceVariant),
            const SizedBox(width: 8),
            Flexible(child: Text('End of the records on this phone • ${shown.length} of ${all.length} shown', style: T.labelSm.c(C.onSurfaceVariant))),
          ]),
        ),
      ],
    );
  }

  Widget _small(IconData icon, String text, Color bg, Color fg) => Container(
        padding: const EdgeInsets.all(4),
        constraints: const BoxConstraints(maxWidth: 130),
        decoration: BoxDecoration(color: bg, borderRadius: R.rBase),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Ic(icon, size: 15, color: fg),
          const SizedBox(width: 4),
          Flexible(child: Text(text, style: T.labelSm.c(fg), maxLines: 1, overflow: TextOverflow.ellipsis)),
        ]),
      );

  Widget _deck(String label, IconData icon, Color iconColor, int n, String unit, String below, {bool mono = false}) => Box(
        shadow: true,
        pad: const EdgeInsets.all(8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Expanded(child: Text(label, style: T.labelSm.c(C.onSurfaceVariant))), Ic(icon, size: 16, color: iconColor)]),
          const SizedBox(height: 4),
          Text.rich(TextSpan(children: [TextSpan(text: '$n', style: T.headlineMd), TextSpan(text: ' $unit', style: T.bodySm.c(C.onSurfaceVariant))])),
          const SizedBox(height: 2),
          Text(below, style: mono ? T.mono(11, w: FontWeight.w700, line: 14).c(C.secondary).tr(0.05) : T.badge.c(C.onSurfaceVariant)),
        ]),
      );
}

class _HistoryBanner extends StatelessWidget {
  final PatientFacts f;
  const _HistoryBanner(this.f);
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final drafts = f.drafts.length + listDrafts(a.store, a.user?.id ?? '', patientId: f.patient.id).length;
    Widget allergy(Allergy x) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Tag([x.substance, if (x.severity != null) x.severity!].join(' · ').toUpperCase(), bg: x.severity == 'severe' ? C.error : C.surfaceHighest, fg: x.severity == 'severe' ? C.onError : C.onSurface, pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
        );
    return Box(
      color: C.primary,
      shadow: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 4, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: C.primaryContainer, borderRadius: R.rFull, border: Border.all(color: C.secondaryFixed.withValues(alpha: 0.3))),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Dot(C.secondaryFixed, size: 10),
              const SizedBox(width: 6),
              Text('PRACTICE', style: T.badge.c(C.secondaryFixed)),
              const SizedBox(width: 8),
              Container(width: 1, height: 12, color: C.outline.withValues(alpha: 0.4)),
              const SizedBox(width: 8),
              Flexible(child: Text('Fictional data', style: T.labelSm.c(C.primaryFixedDim))),
            ]),
          ),
          if (a.downtime != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rFull),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Ic(Symbols.timer, size: 14, color: C.onPrimaryContainer),
                const SizedBox(width: 6),
                Flexible(child: Text('Outage ${outageHm(a)}', style: T.labelSm.c(C.onPrimaryContainer))),
              ]),
            ),
        ]),
        const SizedBox(height: 8),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text.rich(TextSpan(children: [TextSpan(text: f.patient.fullName, style: T.headlineSm.c(C.onPrimary)), TextSpan(text: '  ${f.ageSex}', style: T.bodySm.c(C.primaryFixedDim))])),
              Text('Bed ${f.bed} • MRN ${f.patient.mrn}', style: T.bodySm.c(C.onPrimaryContainer)),
            ]),
          ),
          const SizedBox(width: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 150),
            child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              if (f.realAllergies.isEmpty) Tag(f.allergyText, bg: C.primaryContainer, fg: C.primaryFixedDim, style: T.labelSm) else for (final x in f.realAllergies) allergy(x),
            ]),
          ),
        ]),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: C.primaryContainer.withValues(alpha: 0.8), borderRadius: R.rLg),
          child: Row(children: [
            const Ic(Symbols.verified_user, size: 18, color: C.tertiaryFixed),
            const SizedBox(width: 8),
            Expanded(child: Text('Stored encrypted on this phone', style: T.labelSm.c(C.tertiaryFixed))),
            const SizedBox(width: 8),
            Text('$drafts draft${drafts == 1 ? '' : 's'}', style: T.mono(11, line: 14, w: FontWeight.w400).c(C.primaryFixedDim)),
          ]),
        ),
      ]),
    );
  }
}

class _OutageLine extends StatelessWidget {
  final DowntimeEvent ev;
  const _OutageLine(this.ev);
  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    const rule = Expanded(child: SizedBox(height: 2, child: ColoredBox(color: C.error)));
    return Container(
      color: C.surface,
      padding: const EdgeInsets.symmetric(vertical: 8),
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Column(children: [
        Row(children: [
          rule,
          const SizedBox(width: 8),
          Container(
            constraints: const BoxConstraints(maxWidth: 270),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: const BoxDecoration(color: C.error, borderRadius: R.rFull, boxShadow: shadowSm),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Ic(Symbols.cloud_off, size: 16, color: C.onError),
              const SizedBox(width: 6),
              Flexible(child: Text('${hm(ev.declaredAt)} PRACTICE OUTAGE DECLARED', style: T.badge.c(C.onError))),
            ]),
          ),
          const SizedBox(width: 8),
          rule,
        ]),
        const SizedBox(height: 4),
        Text('${dayLabel(ev.declaredAt)} • Declared by ${staffShort(a.store, ev.declaredBy)}', style: T.labelSm.c(C.error), textAlign: TextAlign.center),
      ]),
    );
  }
}

/// Stored value as text. Null in a vital-sign record = not assessed.
String _val(Object? v) => v == null ? 'not assessed' : v is num ? formatDose(v) : '$v';

class _LedgerCard extends StatelessWidget {
  final LedgerEvent event;
  final String patientId;
  final bool open, before;
  final VoidCallback onToggle;
  const _LedgerCard({super.key, required this.event, required this.patientId, required this.open, required this.before, required this.onToggle});

  static Tag _tag(String t, Color bg, Color fg) => Tag(t, bg: bg, fg: fg, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2));

  @override
  Widget build(BuildContext context) {
    final a = AppScope.of(context);
    final s = a.store;
    final x = event.entry, h = event.handoff;
    final err = x?.entry.status == 'entered-in-error', draft = x?.entry.isDraft ?? false;
    final chain = x == null ? const <EntryX>[] : versionChain(s, x.entry.id);
    final high = x != null && x.child != null && event.isMed && isHighAlert(x.med.drugName);
    final held = x != null && x.child != null && event.isMed && x.med.event == 'held';
    final (dotBg, dotFg, icon) = event.isBaseline
        ? (C.surfaceHigh, C.onSurfaceVariant, event.baseline.first.kind == 'vital' ? Symbols.monitor : Symbols.biotech)
        : h != null
            ? (C.tertiary, C.onTertiary, Symbols.clinical_notes)
            : switch (x!.entry.type) {
                'med_admin' => (high ? C.error : C.secondaryFixed, high ? C.onError : C.onSecondaryFixed, held ? Symbols.block : high ? Symbols.vaccines : Symbols.medication),
                'vital_sign' => (C.primaryContainer, C.onPrimaryContainer, Symbols.vital_signs),
                'note' => (C.tertiary, C.onTertiary, Symbols.clinical_notes),
                _ => (C.surfaceHigh, C.onSurfaceVariant, entryIcon(x.entry.type)),
              };
    final title = event.isBaseline ? (event.baseline.first.kind == 'vital' ? 'Baseline Vitals' : 'Baseline Lab Results') : h != null ? 'SBAR Handover Note' : entryTitle(x!);
    final sub = event.isBaseline
        ? 'From the patient list saved before the outage'
        : h != null
            ? h.handoff.shift
            : switch (x!.entry.type) {
                'vital_sign' => 'Bedside observation',
                'med_admin' => x.child == null ? 'Medication record' : _medSub(x),
                'intake_output' => 'Amount recorded at the bedside',
                'lab_event' => x.child == null ? 'Lab record' : labLabel(x.lab.status),
                _ => 'Bedside note',
              };
    final tags = <Widget>[
      if (event.isBaseline) _tag('PRE-OUTAGE LIST', C.surfaceContainer, C.onSurfaceVariant),
      if (draft) _tag('DRAFT · NOT CONFIRMED', const Color(0xFFFFF8E1), kAmberText),
      if (err) _tag('ENTERED IN ERROR', C.errorContainer, C.onErrorContainer),
      if (chain.length > 1 && !err) _tag('CORRECTED', C.secondaryFixed, C.onSecondaryFixed),
      if (high) _tag('HIGH ALERT', C.errorContainer, C.onErrorContainer),
      if (held) _tag('HELD', C.errorContainer, C.onErrorContainer),
      if (h != null) _tag('SAVED HERE', C.tertiaryFixed, C.onTertiaryFixed),
      if (x != null && before && !err && !draft && !held && !high) _tag('BEFORE OUTAGE', C.surfaceContainer, C.onSurfaceVariant),
    ];
    final second = x != null && x.child != null && event.isMed ? x.med.doubleCheckedBy : null;
    final who = event.isBaseline
        ? '${event.baseline.length} result${event.baseline.length == 1 ? '' : 's'} on the list'
        : '${staffShort(s, event.performer)}${second == null ? '' : ' • Second check: ${staffShort(s, second)}'}${x == null ? '' : ' • #${x.entry.counter}'}';
    final VoidCallback? go = x != null ? () => Go.entry(context, patientId, x.entry.id) : h != null ? () => Go.sbarView(context, h.handoff.id) : null;
    final otherDay = event.time != null && event.time!.substring(0, 10) != a.nowIso.substring(0, 10);
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 28,
          height: 28,
          margin: const EdgeInsets.only(top: 4),
          decoration: BoxDecoration(color: dotBg, borderRadius: R.rFull, boxShadow: const [BoxShadow(color: C.surface, spreadRadius: 4)]),
          child: Ic(icon, size: 16, color: dotFg),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Opacity(
            opacity: event.isBaseline ? 0.9 : 1,
            child: Box(
              shadow: true,
              pad: EdgeInsets.zero,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Stack(children: [
                  Semantics(
                    button: go != null,
                    label: go == null ? null : 'Open $title ${hm(event.time)}',
                    onTap: go,
                    child: GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: go,
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Expanded(
                              child: Wrap(spacing: 6, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                                Text(title, style: err ? T.headlineSm.copyWith(decoration: TextDecoration.lineThrough) : T.headlineSm),
                                ...tags,
                              ]),
                            ),
                            const SizedBox(width: 8),
                            Text(event.time == null ? '—' : hm(event.time), style: T.mono(13, w: FontWeight.w700, line: 18).c(event.isBaseline ? C.onSurfaceVariant : C.onSurface)),
                          ]),
                          if (sub.isNotEmpty || event.time == null || otherDay)
                            Text([if (sub.isNotEmpty) sub, if (event.time == null) 'No saved time', if (otherDay) dayLabel(event.time)].join(' • '), style: T.bodySm.c(C.onSurfaceVariant)),
                          const SizedBox(height: 8),
                          ..._body(),
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Row(children: [
                              Expanded(child: Text(who, style: T.labelSm.c(C.onSurfaceVariant))),
                              const SizedBox(width: 8),
                              Text('Payload', style: T.labelSm.c(C.secondary)),
                              Ic(open ? Symbols.expand_less : Symbols.expand_more, size: 14, color: C.secondary),
                            ]),
                          ),
                        ]),
                      ),
                    ),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Semantics(
                      button: true,
                      label: '${open ? 'Hide' : 'Show'} payload of $title ${hm(event.time)}',
                      excludeSemantics: true,
                      onTap: onToggle,
                      child: GestureDetector(key: ValueKey('payload:${event.id}'), behavior: HitTestBehavior.opaque, onTap: onToggle, child: const SizedBox(width: 88, height: 48)),
                    ),
                  ),
                ]),
                if (open)
                  Container(
                    margin: const EdgeInsets.fromLTRB(8, 0, 8, 8),
                    padding: const EdgeInsets.all(8),
                    decoration: const BoxDecoration(color: C.surfaceHighest, borderRadius: R.rBase),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: _payload(a, chain)),
                  ),
              ]),
            ),
          ),
        ),
      ]),
    );
  }

  static String _medSub(EntryX x) {
    final m = x.med;
    final dose = m.event == 'rate_changed'
        ? ''
        : m.doseGiven != null
            ? '${formatDose(m.doseGiven)} ${m.doseGivenUnit ?? ''}'
            : m.doseDue != null
                ? 'Ordered ${formatDose(m.doseDue)} ${m.doseDueUnit ?? ''}'
                : '';
    return [dose.trim(), m.route ?? '', if (x.entry.scheduledTime != null) 'for ${hm(x.entry.scheduledTime)}'].where((s) => s.isNotEmpty).join(' • ');
  }

  Widget _grid(List<(String, String)> cells, int cols) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Column(children: [
          for (var i = 0; i < cells.length; i += cols) ...[
            if (i > 0) const SizedBox(height: 6),
            IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (var j = i; j < i + cols; j++) ...[
                  if (j > i) const SizedBox(width: 6),
                  Expanded(
                    child: j >= cells.length
                        ? const SizedBox()
                        : Container(
                            padding: const EdgeInsets.all(6),
                            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase),
                            child: Column(children: [
                              SubText(cells[j].$1, T.labelSm.c(C.onSurfaceVariant), align: TextAlign.center),
                              Text(cells[j].$2, style: cells[j].$2 == 'Not assessed' ? T.labelSm.c(C.onSurfaceVariant).s(11, 18) : T.labelMd.bold, textAlign: TextAlign.center),
                            ]),
                          ),
                  ),
                ],
              ]),
            ),
          ],
        ]),
      );

  Widget _text(String label, String body) => Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.all(4),
        decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
        child: Text.rich(
          TextSpan(children: [if (label.isNotEmpty) TextSpan(text: '$label ', style: T.bodySm.semi.c(C.primary).s(12, 19.5)), TextSpan(text: body)]),
          maxLines: 8,
          overflow: TextOverflow.ellipsis,
          style: T.bodySm.s(12, 19.5),
        ),
      );

  List<Widget> _body() {
    String n(num? v, [String unit = '']) => v == null ? 'Not assessed' : '${formatDose(v)}$unit';
    if (event.isBaseline) {
      final b = event.baseline;
      if (b.first.kind == 'vital') {
        num? get(String part) => b.where((r) => r.name.toLowerCase().contains(part)).firstOrNull?.valueNum;
        final sys = get('systolic'), dia = get('diastolic');
        String short(String name) {
          final t = name.toLowerCase();
          return t.contains('heart') ? 'HR' : t.contains('oxygen') ? 'SpO₂' : t.contains('temp') ? 'Temp' : t.contains('resp') ? 'Resp' : name;
        }

        return [
          _grid([
            if (sys != null || dia != null) ('BP', '${sys ?? '?'}/${dia ?? '?'}'),
            for (final r in b)
              if (!r.name.toLowerCase().contains('tolic')) (short(r.name), r.valueNum == null ? r.valueText ?? '—' : '${formatDose(r.valueNum)}${r.unit == '%' ? '%' : r.unit == 'Cel' ? '°C' : ''}'),
          ], 4),
        ];
      }
      return [
        Container(
          margin: const EdgeInsets.only(bottom: 4),
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase),
          child: Column(children: [
            for (var i = 0; i < b.length; i++)
              Padding(
                padding: EdgeInsets.only(top: i == 0 ? 0 : 6),
                child: Row(children: [
                  Expanded(child: Text(b[i].name, style: T.bodySm.c(C.onSurfaceVariant))),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text.rich(
                      TextSpan(children: [
                        TextSpan(text: '${b[i].valueNum == null ? b[i].valueText ?? '—' : formatDose(b[i].valueNum)} ${b[i].unit ?? ''}'.trim(), style: T.mono(12, w: FontWeight.w700, line: 16)),
                        if (b[i].abnormalFlag != null && b[i].abnormalFlag != 'normal') TextSpan(text: '  (list: ${b[i].abnormalFlag})', style: T.labelSm.c(C.onSurfaceVariant)),
                      ]),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ]),
              ),
          ]),
        ),
      ];
    }
    final h = event.handoff;
    if (h != null) return [_text('SBAR:', h.handoff.situation)];
    final x = event.entry!;
    if (x.child == null) return [_text('', 'No values saved yet.')];
    switch (x.entry.type) {
      case 'vital_sign':
        final v = x.vital;
        return [
          _grid([
            ('BP (mmHg)', v.sys == null ? 'Not assessed' : '${v.sys}/${v.dia ?? '?'}'),
            ('HR (bpm)', n(v.heartRate)),
            (v.o2Flow == null ? 'SpO₂' : 'SpO₂ (${formatDose(v.o2Flow)} L/min)', n(v.spo2, '%')),
            ('Temp', n(v.tempC, '°C')),
            ('Resp', n(v.respRate)),
            ('Pain', n(v.pain, '/10')),
          ], 3),
        ];
      case 'med_admin':
        final m = x.med;
        if (m.event == 'rate_changed') {
          Widget rate(String label, num? r, Color bg, Color fg, Color num) => Expanded(
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(color: bg, borderRadius: R.rBase),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(label, style: T.labelSm.c(fg)),
                    Text.rich(TextSpan(children: [TextSpan(text: r == null ? 'Not recorded' : grouped(r), style: r == null ? T.labelMd.c(fg) : T.vital.c(num)), if (r != null) TextSpan(text: ' ${m.rateUnit ?? ''}', style: T.unit.c(fg))])),
                  ]),
                ),
              );
          return [
            IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [rate('Previous Rate', m.priorRate, C.surfaceLow, C.onSurfaceVariant, C.onSurface), const SizedBox(width: 4), rate('New Rate', m.rate, C.secondaryContainer, C.onSecondaryContainer, C.primary)]),
            ),
            const SizedBox(height: 4),
            if (m.reason != null) _text('Reason:', m.reason!),
          ];
        }
        if (m.event == 'held' || m.event == 'refused') {
          return [
            Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: C.errorContainer.withValues(alpha: 0.4), borderRadius: R.rLg),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Padding(padding: EdgeInsets.only(top: 2), child: Ic(Symbols.warning, size: 18, color: C.error)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text.rich(TextSpan(children: [
                    TextSpan(text: '${kEventLabel[m.event]} at bedside: ', style: T.bodySm.bold.c(C.onErrorContainer)),
                    TextSpan(text: m.reason ?? 'No reason recorded', style: T.bodySm.c(C.onErrorContainer)),
                  ])),
                ),
              ]),
            ),
          ];
        }
        return [if (m.reason != null) _text('Reason:', m.reason!)];
      case 'intake_output':
        return [_text('${ioLabel(x.io.direction, x.io.category)}:', '${grouped(x.io.volumeMl)} mL${x.io.method == null ? '' : ' • ${x.io.method}'}')];
      case 'lab_event':
        final l = x.lab;
        final value = l.valueNum != null ? '${formatDose(l.valueNum)} ${l.unit ?? ''}'.trim() : l.valueText;
        return [_text('Result:', [value ?? 'Not recorded', if (l.calledTo != null) 'Called to ${l.calledTo}', if (l.readBack == true) 'Read back'].join(' • '))];
      default:
        return [_text('', '${x.note.text}${x.note.scoreName == null ? '' : ' (${x.note.scoreName}: ${x.note.scoreValue})'}')];
    }
  }

  List<Widget> _payload(AppState a, List<EntryX> chain) {
    final s = a.store;
    final st = T.mono(11, line: 15).c(C.onSurfaceVariant);
    Widget kv(String k, String v, {bool strike = false}) => Padding(
          padding: const EdgeInsets.only(bottom: 3),
          child: Text.rich(TextSpan(children: [TextSpan(text: '$k: ', style: st.bold), TextSpan(text: v, style: strike ? st.copyWith(decoration: TextDecoration.lineThrough) : st)])),
        );
    if (event.isBaseline) {
      final snap = s.all('snapshot').firstOrNull;
      return [
        kv('source', 'patient list saved before the outage (read only)'),
        if (snap != null) kv('list taken', dateTimeLabel(snap['taken_at'] as String?)),
        for (final r in event.baseline) kv(r.name, '${r.valueNum == null ? r.valueText ?? '—' : formatDose(r.valueNum)} ${r.unit ?? ''} · ${r.id} · ${dateTimeLabel(r.time)}'),
      ];
    }
    final h = event.handoff;
    if (h != null) {
      return [
        kv('record id', h.handoff.id),
        kv('written by', staffName(s, h.handoff.createdBy)),
        kv('saved', h.savedAt == null ? 'came with the practice list' : dateTimeLabel(h.savedAt)),
        kv('background', h.handoff.background),
        kv('assessment', h.handoff.assessment),
        kv('open items', h.handoff.openItems.isEmpty ? 'none' : h.handoff.openItems.join('; ')),
        kv('linked records', '${h.handoff.sourceEntryIds.length}'),
      ];
    }
    final x = event.entry!, e = x.entry;
    final photo = s.get('m_photo', e.rawInputRef);
    final dev = s.get('device', e.deviceId);
    const skip = {'id', 'entry_id', 'rxnorm_code', 'raw_text'};
    return [
      kv('record id', e.id),
      kv('status', e.status),
      kv('device', '${dev?['label'] ?? e.deviceId}${e.deviceId == a.deviceId ? ' (this phone)' : ''} · counter ${e.counter}'),
      kv('clinical time', dateTimeLabel(e.careTime)),
      kv('entry time', dateTimeLabel(e.entryTime)),
      if (e.scheduledTime != null) kv('scheduled time', dateTimeLabel(e.scheduledTime)),
      kv('performed by', staffName(s, e.performerId)),
      kv('confirmed by', e.confirmedBy == null ? 'not confirmed' : '${staffName(s, e.confirmedBy)}${e.confirmedAt == null ? '' : ', ${dateTimeLabel(e.confirmedAt)}'}'),
      kv('entered as', e.rawInputKind),
      if (photo != null) ...[
        kv('source photo', e.rawInputRef),
        kv('photo SHA-256', '${photo['sha256']}'),
        kv('photo check', verifyPhoto(s, e.rawInputRef) ? 'picture equals the saved SHA-256' : 'PICTURE DIFFERS FROM THE SAVED SHA-256'),
      ] else if (e.rawInputKind == 'photo')
        kv('source photo', 'no picture on this phone'),
      if (e.aiProposal != null) kv('proposal stored', 'simulated practice data, not confirmed'),
      if (x.child != null)
        for (final c in x.child!.entries)
          if (!skip.contains(c.key) && (c.value != null || (e.type == 'vital_sign' && kVitalRules.containsKey(c.key)))) kv(c.key.replaceAll('_', ' '), _val(c.value), strike: e.status == 'entered-in-error'),
      if (e.changeReason != null && (chain.length < 2 || e.status == 'entered-in-error')) kv('reason', e.changeReason!),
      if (chain.length > 1) ...[
        kv('correction chain', '${chain.length} versions'),
        for (var i = 0; i < chain.length - 1; i++) ...[
          kv('version ${i + 1}', '${dateTimeLabel(chain[i].entry.entryTime)} by ${staffShort(s, chain[i].entry.performerId)} · ${chain[i].entry.id}'),
          for (final d in _diff(chain[i], chain[i + 1]))
            Padding(
              padding: const EdgeInsets.only(left: 8, bottom: 3),
              child: Text.rich(TextSpan(children: [TextSpan(text: '${d.$1}: ', style: st.bold), TextSpan(text: d.$2, style: st.copyWith(decoration: TextDecoration.lineThrough)), TextSpan(text: ' now ${d.$3}', style: st)])),
            ),
          if (chain[i + 1].entry.changeReason != null) kv('change reason', chain[i + 1].entry.changeReason!),
        ],
      ],
    ];
  }

  /// (field, old, new) for every value that differs, plus the clinical time.
  static List<(String, String, String)> _diff(EntryX o, EntryX n) => [
        if (o.entry.careTime != n.entry.careTime) ('clinical time', dateTimeLabel(o.entry.careTime), dateTimeLabel(n.entry.careTime)),
        for (final k in {...?o.child?.keys, ...?n.child?.keys})
          if (k != 'id' && k != 'entry_id' && o.child?[k] != n.child?[k]) (k.replaceAll('_', ' '), _val(o.child?[k]), _val(n.child?[k])),
      ];
}
