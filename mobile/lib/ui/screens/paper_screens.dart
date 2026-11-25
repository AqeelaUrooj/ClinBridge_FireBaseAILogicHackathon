import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show compute;
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/native.dart';
import '../../data/repos/entries.dart';
import '../../data/schema.dart';
import '../../domain/facts.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';
import 'companion_screens.dart';

/// formType, name, record type.
const List<(String, String, String)> kPaperTypes = [
  ('vitals', 'Vitals', 'vital_sign'),
  ('medication', 'Medication Administration Record (MAR)', 'med_admin'),
  ('intake_output', 'Fluid sheet', 'intake_output'),
  ('note', 'Note', 'note'),
  ('lab', 'Lab', 'lab_event'),
];
String _typeName(String formType) => kPaperTypes.where((x) => x.$1 == formType).map((x) => x.$2).firstOrNull ?? formType;
String _typeShort(String formType) => formType == 'medication' ? 'MAR' : _typeName(formType);
String _recordType(String formType) => kPaperTypes.where((x) => x.$1 == formType).map((x) => x.$3).firstOrNull ?? 'note';

/// Why a person rejects a picture. 'undecodable' is found by the phone, not by staff.
const List<(String, String, String)> kRejectReasons = [
  ('glare', 'Glare', 'Light covers part of the writing.'),
  ('blurred', 'Blurred', 'The writing is not sharp enough to read.'),
  ('corner', 'Corner cut off', 'Part of the paper is outside the picture.'),
  ('covered', 'Hand or object covers it', 'Something lies over the writing.'),
  ('wrong', 'Wrong patient or form', 'The paper is not for this patient or not this document type.'),
];
const String kUndecodable = 'undecodable';
const Map<String, IconData> _reasonIcon = {'glare': Symbols.light_mode, 'blurred': Symbols.blur_on, 'corner': Symbols.crop_free, 'covered': Symbols.front_hand, 'wrong': Symbols.badge, 'too_dark': Symbols.brightness_medium, 'blurry': Symbols.blur_on};

(String, String) _reasonText(String code) {
  for (final r in kRejectReasons) {
    if (r.$1 == code) return (r.$2, r.$3);
  }
  if (code == kUndecodable) return ('Picture could not be opened', 'This phone cannot decode the file, so it cannot be checked or shown.');
  return ('Other reason', code.startsWith('other:') ? code.substring(6).trim() : code);
}

/// Closes this page and opens a fresh capture (no old picture stays behind it).
void _freshCapture(BuildContext context, String patientId, String? formType) {
  final nav = Navigator.of(context, rootNavigator: true);
  if (nav.canPop()) nav.pop();
  Go.paperCapture(nav.context, patientId, formType: formType);
}

/* ------------------------------ Technical picture check ------------------------------ */

/// Runs in an isolate. Null = the bytes are not a picture this phone can decode.
PhotoQuality? measurePhoto(Uint8List bytes) {
  try {
    // The size is read before the picture is unpacked: 50 megapixels is the most a small phone can hold.
    final info = img.findDecoderForData(bytes)?.startDecode(bytes);
    if (info == null || info.width * info.height > 50000000) return null;
    final raw = img.decodeImage(bytes);
    if (raw == null || raw.width < 3 || raw.height < 3) return null;
    final full = img.bakeOrientation(raw);
    final k = math.min(1.0, 512 / math.max(full.width, full.height));
    final w = math.max(3, (full.width * k).round()), h = math.max(3, (full.height * k).round());
    final small = k < 1 ? img.copyResize(full, width: w, height: h, interpolation: img.Interpolation.average) : full;
    final gray = List<double>.filled(small.width * small.height, 0);
    var i = 0;
    for (final p in small) {
      final m = p.maxChannelValue / 255;
      gray[i++] = (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / m;
    }
    return assessQuality(gray, small.width, small.height, full.width, full.height);
  } catch (_) {
    return null;
  }
}

/// The three measured facts of a picture: (name, value, passed, hint).
List<(String, String, bool, String)> technicalChecks(PhotoQuality q) {
  String hint(String word) => q.hints.where((h) => h.contains(word)).firstOrNull ?? '';
  final dark = q.problem == 'too_dark' || q.problem == 'glare';
  return [
    ('Brightness', '${q.brightness.round()} of 255', !dark, dark ? q.hints.first : ''),
    ('Sharpness', '${q.sharpness.round()}', hint('blurry').isEmpty, hint('blurry')),
    ('Size', '${q.shortSide} px', hint('small').isEmpty, hint('small')),
  ];
}

/* ==================================================================================================================
 * 1. Capture
 * ================================================================================================================== */

enum _Cam { checking, ask, denied, blocked, starting, on, paused, error }

class PaperCaptureScreen extends StatefulWidget {
  final String patientId;
  final String? formType;
  const PaperCaptureScreen({super.key, required this.patientId, this.formType});
  @override
  State<PaperCaptureScreen> createState() => _PaperCaptureScreenState();
}

class _PaperCaptureScreenState extends State<PaperCaptureScreen> with WidgetsBindingObserver {
  late NativeBridge native;
  late String? _type = widget.formType;
  bool _menu = false, _needType = false, _busy = false, _asking = false, _started = false;
  _Cam _cam = _Cam.checking;
  CameraInfo? _info;
  bool _torch = false;
  String? _camError, _note;
  int _gen = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    native = AppScope.read(context).native;
    if (_started) return;
    _started = true;
    _begin(ask: false);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _gen++;
    if (_info != null) unawaited(native.cameraStop(run: _info!.run).catchError((Object _) {})); // a start in flight stops itself (see _begin)
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Also after a visit to the app settings.
      if (!_asking && _cam != _Cam.on && _cam != _Cam.starting && _cam != _Cam.ask) _begin(ask: false);
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.hidden || state == AppLifecycleState.detached) {
      if (_cam == _Cam.on || _cam == _Cam.starting) _stop(_Cam.paused);
    }
  }

  void _stop(_Cam next) {
    _gen++;
    if (_info != null) unawaited(native.cameraStop(run: _info!.run).catchError((Object _) {}));
    if (mounted) {
      setState(() {
        _cam = next;
        _info = null;
        _torch = false;
      });
    }
  }

  Future<void> _begin({required bool ask}) async {
    final gen = ++_gen;
    final before = _cam;
    if (_cam != _Cam.checking) setState(() => _cam = _Cam.checking);
    try {
      _asking = ask;
      final p = await native.cameraPermission(ask: ask);
      _asking = false;
      if (!mounted || gen != _gen) return;
      if (p != 'granted') {
        // Android only tells "not granted" until the question was asked.
        setState(() => _cam = !ask ? (before == _Cam.denied || before == _Cam.blocked ? before : _Cam.ask) : (p == 'blocked' ? _Cam.blocked : _Cam.denied));
        return;
      }
      setState(() => _cam = _Cam.starting);
      final info = await native.cameraStart();
      if (!mounted || gen != _gen) {
        unawaited(native.cameraStop(run: info.run).catchError((Object _) {}));
        return;
      }
      setState(() {
        _info = info;
        _torch = false;
        _cam = _Cam.on;
        _camError = null;
      });
    } catch (e) {
      _asking = false;
      if (!mounted || gen != _gen) return;
      setState(() {
        _cam = _Cam.error;
        _camError = problemText(e);
      });
    }
  }

  bool _typeChosen() {
    if (_type != null) return true;
    setState(() => _needType = true);
    toast(context, 'Choose the document type first.', icon: Symbols.info);
    return false;
  }

  Future<void> _capture() async {
    if (_busy || _cam != _Cam.on || !_typeChosen()) return;
    setState(() {
      _busy = true;
      _note = null;
    });
    try {
      final b = await native.cameraCapture();
      if (b.isEmpty) throw const AppError('The camera gave an empty picture.');
      if (!mounted) return;
      unawaited(Go.paperPreview(context, PaperShot(widget.patientId, _type!, PickedBytes(b, 'image/jpeg', 'camera'))));
      return;
    } catch (e) {
      if (mounted) setState(() => _note = 'No picture was taken. ${problemText(e)}');
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _upload() async {
    if (_busy || !_typeChosen()) return;
    setState(() {
      _busy = true;
      _note = null;
    });
    try {
      final p = await native.pickImage();
      if (!mounted) return;
      if (p == null) {
        _note = 'No picture was chosen.';
      } else if (!p.mime.startsWith('image/')) {
        _note = 'This file is not a picture (${p.mime}).';
      } else if (p.bytes.isEmpty) {
        _note = 'The chosen picture is empty.';
      } else {
        unawaited(Go.paperPreview(context, PaperShot(widget.patientId, _type!, PickedBytes(p.bytes, p.mime, 'upload'))));
        return;
      }
    } catch (e) {
      _note = 'The picture was not opened. ${problemText(e)}';
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _setTorch() async {
    final want = !_torch;
    try {
      final on = await native.cameraTorch(want);
      if (!mounted) return;
      setState(() {
        _torch = on;
        _note = want && !on ? 'The torch did not turn on.' : null;
      });
    } catch (e) {
      if (mounted) setState(() => _note = 'The torch did not change. ${problemText(e)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final f = app.unlocked ? loadFacts(app.store, widget.patientId, app.nowIso) : null;
    if (f == null) return const PhonePage(children: []);
    return PhonePage(
      header: RecHeader(title: 'Paper Capture', subtitle: '${f.patient.family}, ${f.patient.given} • Bed ${f.bed}'),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      gap: 8,
      children: [
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const RecRail(), const SizedBox(height: 4), RecPatientCard(f)]),
        _typePanel(),
        _finder(),
        _actions(),
      ],
    );
  }

  Widget _typePanel() => Box(
        color: C.surfaceLow,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Expanded(child: Text('Capture Paper Form', style: T.headlineMd)),
            const SizedBox(width: 12),
            const Flexible(child: Tag('Step 1 of 4: Align & Capture', bg: C.surfaceHighest, fg: C.secondary, pad: EdgeInsets.symmetric(horizontal: 4, vertical: 2))),
          ]),
          const SizedBox(height: 8),
          Text('Target Document Type', style: T.labelSm.c(_needType && _type == null ? C.error : C.onSurfaceVariant)),
          const SizedBox(height: 4),
          Tap(
            label: 'Document type: ${_type == null ? 'not chosen' : _typeName(_type!)}',
            expand: true,
            onTap: () => setState(() => _menu = !_menu),
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg, boxShadow: shadowSm, border: _needType && _type == null ? Border.all(color: C.error) : null),
              child: Row(children: [
                const Ic(Symbols.description, size: 22, color: C.secondary),
                const SizedBox(width: 8),
                Expanded(child: Text(_type == null ? 'Choose the document type' : _typeName(_type!), style: T.headlineSm.c(_type == null ? C.outline : C.onSurface), maxLines: 1, overflow: TextOverflow.ellipsis)),
                Ic(_menu ? Symbols.expand_less : Symbols.expand_more, size: 20, color: C.onSurfaceVariant),
              ]),
            ),
          ),
          if (_menu)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.all(4),
              decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowMd),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (final t in kPaperTypes)
                  Tap(
                    label: t.$2,
                    selected: _type == t.$1,
                    expand: true,
                    onTap: () => setState(() {
                      _type = t.$1;
                      _menu = false;
                      _needType = false;
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
                      decoration: BoxDecoration(color: _type == t.$1 ? C.surfaceHigh : C.surfaceLowest, borderRadius: R.rLg),
                      child: Row(children: [Expanded(child: Text(t.$2, style: T.labelMd)), if (_type == t.$1) const Ic(Symbols.check, size: 18, color: C.primary)]),
                    ),
                  ),
              ]),
            ),
        ]),
      );

  Widget _hud(IconData icon, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(color: C.primary.withValues(alpha: 0.85), borderRadius: R.rBase),
        child: Row(mainAxisSize: MainAxisSize.min, children: [Ic(icon, size: 14, color: C.outlineVariant), const SizedBox(width: 4), Flexible(child: Text(text, style: T.badge.c(C.surface)))]),
      );

  Widget _corner(Alignment at) {
    const side = BorderSide(color: C.secondaryFixed, width: 4);
    return Align(
      alignment: at,
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(border: Border(top: at.y < 0 ? side : BorderSide.none, bottom: at.y > 0 ? side : BorderSide.none, left: at.x < 0 ? side : BorderSide.none, right: at.x > 0 ? side : BorderSide.none)),
      ),
    );
  }

  Widget _preview() {
    final i = _info!;
    if (i.textureId < 0) return const ColoredBox(color: C.primaryContainer);
    // A SurfaceTexture carries the camera's own transform, so the picture is already upright (as in Flutter's CameraX
    // plugin, "isPreviewPreTransformed"). Only its width and height are those of the sensor.
    final turned = i.rotation % 180 != 0;
    final w = (turned ? i.height : i.width).toDouble(), h = (turned ? i.width : i.height).toDouble();
    return ClipRect(
      child: FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(width: w, height: h, child: Texture(textureId: i.textureId)),
      ),
    );
  }

  Widget _state(IconData icon, String title, String text, {String? action, VoidCallback? onTap}) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(32, 8, 32, 8),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Ic(icon, size: 36, color: C.secondaryFixed),
            const SizedBox(height: 8),
            Text(title, style: T.headlineSm.c(C.onPrimary), textAlign: TextAlign.center),
            const SizedBox(height: 4),
            Semantics(liveRegion: true, child: Text(text, style: T.bodyMd.c(C.surfaceDim), textAlign: TextAlign.center)),
            if (action != null) ...[const SizedBox(height: 12), Btn(action, kind: BtnKind.white, radius: R.xl, onTap: onTap)],
          ]),
        ),
      );

  Widget _finder() {
    final on = _cam == _Cam.on;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: BorderRadius.all(Radius.circular(16)), boxShadow: shadowMd),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          height: 320,
          child: ColoredBox(
            color: C.primary,
            child: on
                ? Stack(fit: StackFit.expand, children: [
                    _preview(),
                    ColoredBox(color: C.primary.withValues(alpha: 0.12)),
                    Padding(padding: const EdgeInsets.all(24), child: Stack(children: [for (final a in const [Alignment.topLeft, Alignment.topRight, Alignment.bottomLeft, Alignment.bottomRight]) _corner(a)])),
                    Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Ic(Symbols.filter_center_focus, size: 28, color: C.secondaryFixed.withValues(alpha: 0.8)),
                        const SizedBox(height: 4),
                        Container(
                          margin: const EdgeInsets.symmetric(horizontal: 32),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: C.primary.withValues(alpha: 0.8), borderRadius: R.rFull),
                          child: Text('Align all 4 document corners inside frame', style: T.badge.c(C.surface), textAlign: TextAlign.center),
                        ),
                      ]),
                    ),
                    Positioned(
                      top: 8,
                      left: 8,
                      right: 8,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Wrap(spacing: 6, runSpacing: 6, children: [_hud(Symbols.wb_sunny, 'LIGHT: UNCHECKED'), _hud(Symbols.screen_rotation_alt, 'ANGLE: UNCHECKED')]),
                        const SizedBox(height: 6),
                        Align(alignment: Alignment.centerRight, child: _hud(Symbols.description, _type == null ? 'TYPE NOT CHOSEN' : '${_typeShort(_type!).toUpperCase()} CHOSEN BY YOU')),
                      ]),
                    ),
                  ])
                : switch (_cam) {
                    _Cam.checking => _state(Symbols.photo_camera, 'Checking the camera', 'One moment.'),
                    _Cam.starting => _state(Symbols.photo_camera, 'Starting the camera', 'One moment.'),
                    _Cam.paused => _state(Symbols.photo_camera, 'Camera paused', 'The camera stops while the app is not in front.', action: 'Start camera', onTap: () => _begin(ask: false)),
                    _Cam.ask => _state(Symbols.photo_camera, 'Camera not allowed yet', 'The camera is used only to photograph a fictional practice form. Pictures stay in this app.', action: 'Allow camera', onTap: () => _begin(ask: true)),
                    _Cam.denied => _state(Symbols.no_photography, 'Camera not allowed', 'You did not allow the camera. You can upload a picture or type the values.', action: 'Ask again', onTap: () => _begin(ask: true)),
                    _Cam.blocked => _state(Symbols.no_photography, 'Camera blocked', 'Android does not ask again. Allow the camera in the app settings, or upload a picture, or type the values.', action: 'Open app settings', onTap: () async {
                        try {
                          await native.openAppSettings();
                        } catch (e) {
                          if (mounted) setState(() => _note = 'The settings did not open. ${problemText(e)}');
                        }
                      }),
                    _Cam.error => _state(Symbols.error, 'Camera error', _camError ?? 'The camera did not start.', action: 'Try again', onTap: () => _begin(ask: false)),
                    _Cam.on => const SizedBox(),
                  },
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Flexible(child: _torchButton(on)),
            const SizedBox(width: 8),
            Flexible(
              child: Unavailable(
                reason: 'This app does not detect edges. Line up the paper yourself.',
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Flexible(child: Text('Auto-detect edge', style: T.labelSm.c(C.onPrimaryContainer))),
                  const SizedBox(width: 4),
                  Container(
                    width: 40,
                    height: 24,
                    padding: const EdgeInsets.all(2),
                    alignment: Alignment.centerLeft,
                    decoration: const BoxDecoration(color: C.surfaceHighest, borderRadius: R.rFull),
                    child: Container(width: 20, height: 20, decoration: const BoxDecoration(color: C.onSurfaceVariant, borderRadius: R.rFull)),
                  ),
                ]),
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _torchButton(bool on) {
    Widget face(IconData icon, String text, {bool lit = false}) => Container(
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          decoration: BoxDecoration(color: lit ? C.secondaryFixed : C.surfaceHigh.withValues(alpha: 0.2), borderRadius: R.rLg),
          child: Row(mainAxisSize: MainAxisSize.min, children: [Ic(icon, size: 18, color: lit ? C.primary : C.surface), const SizedBox(width: 4), Flexible(child: Text(text, style: T.labelMd.c(lit ? C.primary : C.surface)))]),
        );
    if (on && !_info!.hasTorch) return Unavailable(reason: 'This phone has no torch.', child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: face(Symbols.flashlight_off, 'No torch')));
    if (!on) return Unavailable(reason: 'The torch works when the camera is running.', child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: face(Symbols.flash_on, 'Torch off')));
    return Tap(label: _torch ? 'Torch is on. Turn off' : 'Torch is off. Turn on', toggled: _torch, onTap: _setTorch, child: face(_torch ? Symbols.flashlight_on : Symbols.flash_on, _torch ? 'Torch ON' : 'Torch off', lit: _torch));
  }

  Widget _side(IconData icon, String text, VoidCallback? onTap) => Tap(
        label: text,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Column(mainAxisSize: MainAxisSize.min, children: [Ic(icon, size: 24), const SizedBox(height: 2), Text(text, style: T.labelSm, textAlign: TextAlign.center)]),
        ),
      );

  Widget _actions() {
    final ready = _cam == _Cam.on && !_busy;
    return Box(
      shadow: true,
      radius: 16,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Flexible(
              child: _side(Symbols.edit_note, 'Manual Entry', () {
                if (_typeChosen()) Go.paperDraft(context, widget.patientId, formType: _type!);
              }),
            ),
            Tap(
              label: 'Capture paper form',
              onTap: ready ? _capture : null,
              child: Opacity(
                opacity: ready ? 1 : 0.5,
                child: Container(
                  width: 80,
                  height: 80,
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(color: C.surfaceHighest, borderRadius: R.rFull),
                  child: Container(
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull, boxShadow: shadowMd),
                    child: _busy
                        ? const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2, color: C.surface))
                        : Container(width: 32, height: 32, alignment: Alignment.center, decoration: BoxDecoration(borderRadius: R.rFull, border: Border.all(color: C.surface, width: 2)), child: const Ic(Symbols.photo_camera, size: 22, color: C.onPrimary)),
                  ),
                ),
              ),
            ),
            Flexible(child: _side(Symbols.photo_library, 'Upload Scan', _busy ? null : _upload)),
          ]),
        ),
        if (_note != null) Padding(padding: const EdgeInsets.only(top: 12), child: ProblemBox(_note!)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(8),
          decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl),
          child: Row(children: [
            const Ic(Symbols.info, size: 20, color: C.secondary),
            const SizedBox(width: 8),
            Expanded(
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: 'Fictional practice documents only. ', style: T.bodySm.bold.c(C.onSurface).s(12, 16.5)),
                  const TextSpan(text: 'Manual entry always works. A photo is stored, encrypted on this phone, only if you keep it.'),
                ]),
                style: T.bodySm.s(12, 16.5).c(C.onSurfaceVariant),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}

/* ==================================================================================================================
 * 2. Preview and picture check
 * ================================================================================================================== */

class PaperPreviewScreen extends StatefulWidget {
  final PaperShot shot;
  const PaperPreviewScreen({super.key, required this.shot});
  @override
  State<PaperPreviewScreen> createState() => _PaperPreviewScreenState();
}

class _PaperPreviewScreenState extends State<PaperPreviewScreen> {
  late final Uint8List _bytes = Uint8List.fromList(widget.shot.bytes.data);
  final _zoom = TransformationController();
  PhotoQuality? _q;
  bool _patient = false, _legible = false, _override = false, _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _measure();
  }

  Future<void> _measure() async {
    final q = await compute(measurePhoto, _bytes);
    if (!mounted) return;
    if (q == null) {
      unawaited(Go.paperError(context, widget.shot, staffReasons: const [kUndecodable]));
      return;
    }
    setState(() => _q = q);
  }

  @override
  void dispose() {
    _zoom.dispose();
    super.dispose();
  }

  bool get _zoomed => _zoom.value.getMaxScaleOnAxis() > 1.01;

  void _toggleZoom(Size box) => setState(() {
        if (_zoomed) {
          _zoom.value = Matrix4.identity();
        } else {
          const k = 2.5;
          _zoom.value = Matrix4.identity()
            ..translate(-box.width * (k - 1) / 2, -box.height * (k - 1) / 2)
            ..scale(k);
        }
      });

  bool get _problem => _q != null && _q!.problem != 'none';
  bool get _canKeep => _q != null && _patient && _legible && (!_problem || _override);

  void _keep() {
    if (_busy || !_canKeep) return;
    final app = AppScope.read(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ref = savePhoto(app.ctx(), patientId: widget.shot.patientId, bytes: _bytes, mime: widget.shot.bytes.mime, check: {
        'form_type': widget.shot.formType,
        'readable': true,
        'problem': _q!.problem,
        'overridden': _problem && _override,
        'checked_by': app.user!.id,
        'method': 'manual+technical',
      });
      app.saved();
      unawaited(Go.paperDraft(context, widget.shot.patientId, formType: widget.shot.formType, photoRef: ref));
    } on AppError catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  Future<void> _reject() async {
    final picked = <String>{};
    final other = TextEditingController();
    var wantOther = false;
    final r = await recSheet<List<String>>(
      context,
      title: 'Reject photo',
      body: (c, set) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('The picture is not stored. Only the reason is written to the change log.', style: T.bodyMd.c(C.onSurfaceVariant)),
        const SizedBox(height: 8),
        for (final x in kRejectReasons) TickRow(on: picked.contains(x.$1), text: x.$2, sub: x.$3, onTap: () => set(() => picked.contains(x.$1) ? picked.remove(x.$1) : picked.add(x.$1))),
        TickRow(on: wantOther, text: 'Other reason', onTap: () => set(() => wantOther = !wantOther)),
        if (wantOther) ValueBox(other, label: 'Other reason', hint: 'Say why', style: T.bodyMd, changed: () => set(() {})),
        const SizedBox(height: 16),
        Btn('Reject photo', kind: BtnKind.danger, onTap: picked.isEmpty && !(wantOther && other.text.trim().isNotEmpty) ? null : () => Navigator.pop(c, [...picked, if (wantOther && other.text.trim().isNotEmpty) 'other: ${other.text.trim()}']), reason: 'Tick a reason first.'),
        const SizedBox(height: 8),
        Btn('Cancel', kind: BtnKind.quiet, onTap: () => Navigator.pop(c)),
      ]),
    );
    if (r == null || !mounted) return;
    unawaited(Go.paperError(context, widget.shot, staffReasons: r));
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final f = app.unlocked ? loadFacts(app.store, widget.shot.patientId, app.nowIso) : null;
    if (f == null) return const PhonePage(children: []);
    final done = (_q != null ? 1 : 0) + (_patient ? 1 : 0) + (_legible ? 1 : 0);
    return PhonePage(
      header: RecHeader(title: 'Paper Capture', subtitle: '${f.patient.family}, ${f.patient.given} • Bed ${f.bed}'),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 16),
      gap: 12,
      children: [
        _lockup(app, f),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Wrap(alignment: WrapAlignment.spaceBetween, spacing: 8, children: [
              Text('STEP 2 OF 4: INSPECT LEGIBILITY', style: T.badge.c(C.secondary)),
              Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.description, size: 15, color: C.onTertiaryContainer), const SizedBox(width: 4), Flexible(child: Text('${_typeShort(widget.shot.formType)} chosen', style: T.labelSm.c(C.onSurfaceVariant)))]),
            ]),
            const SizedBox(height: 4),
            Text('Review Form Photo', style: T.headlineMd.tr(-0.025)),
            const SizedBox(height: 4),
            Text('Check that every line, amount and initial is clear before you type the values.', style: T.bodyMd.c(C.onSurfaceVariant)),
          ]),
        ),
        _viewport(),
        Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(children: [Expanded(child: Text('Picture Checks', style: T.headlineSm)), Tag('$done/3 Done', bg: C.tertiaryFixed.withValues(alpha: 0.3), fg: C.onTertiaryContainer)]),
          ),
          const SizedBox(height: 4),
          _technical(),
          const SizedBox(height: 8),
          _staff(
            on: _patient,
            icon: Symbols.badge,
            title: 'Patient Match Confirmation',
            text: 'Name and MRN on the paper match ${f.patient.family}, ${f.patient.given}, MRN ${f.patient.mrn}.',
            onTap: () => setState(() => _patient = !_patient),
          ),
          const SizedBox(height: 8),
          _staff(
            on: _legible,
            icon: Symbols.edit_note,
            title: 'Legibility & Form Type',
            text: 'I can read every value. The paper type is ${_typeShort(widget.shot.formType)}.',
            onTap: () => setState(() => _legible = !_legible),
          ),
        ]),
        Box(
          color: C.surfaceHigh,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Padding(padding: EdgeInsets.only(top: 2), child: Ic(Symbols.policy, size: 20, color: C.secondary)),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Mandatory Nurse Check', style: T.headlineSm),
                const SizedBox(height: 2),
                Text.rich(
                  TextSpan(children: [
                    TextSpan(text: 'No automatic reading on this phone. ', style: T.bodySm.bold.s(12, 19.5)),
                    const TextSpan(text: 'You type the values and check them against the paper. Keeping the photo stores it encrypted on this phone.'),
                  ]),
                  style: T.bodySm.s(12, 19.5).c(C.onSurfaceVariant),
                ),
              ]),
            ),
          ]),
        ),
        if (_error != null) ProblemBox(_error!, title: 'Photo not kept'),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Btn('Keep Photo & Type Values', icon: Symbols.edit_note, radius: R.xl, style: T.headlineSm, busy: _busy, onTap: _canKeep ? _keep : null, reason: _q == null ? 'The picture check is still running.' : 'Do the checks above first.'),
            const SizedBox(height: 8),
            Btn('Retake Form Photo', icon: Symbols.photo_camera, kind: BtnKind.white, radius: R.xl, style: T.headlineSm, onTap: () => _freshCapture(context, widget.shot.patientId, widget.shot.formType)),
            const SizedBox(height: 4),
            Center(
              child: Tap(
                label: 'Reject photo',
                onTap: _reject,
                child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.report_problem, size: 18, color: C.error), const SizedBox(width: 6), Text('Reject photo', style: T.labelMd.c(C.error).copyWith(decoration: TextDecoration.underline, decorationColor: C.error))]),
              ),
            ),
          ]),
        ),
      ],
    );
  }

  Widget _lockup(AppState app, PatientFacts f) => Container(
        clipBehavior: Clip.antiAlias,
        decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowSm),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            color: C.primary,
            child: Row(children: [
              Expanded(
                child: Row(children: [
                  const Dot(C.tertiaryFixedDim),
                  const SizedBox(width: 6),
                  Flexible(child: Text(phaseLine(app).toUpperCase(), style: T.badge.tr(0.025).c(C.secondaryFixed))),
                  if (app.downtime != null) ...[
                    const SizedBox(width: 6),
                    Text('|', style: T.bodySm.c(C.onPrimary.withValues(alpha: 0.6))),
                    const SizedBox(width: 6),
                    DowntimeClock(text: (a, b) => '${elapsedHm(a, b)} down', style: T.labelSm.c(C.surfaceHighest)),
                  ],
                ]),
              ),
              const SizedBox(width: 4),
              Tag('PRACTICE', bg: C.error.withValues(alpha: 0.2), fg: C.errorContainer, style: T.badge.s(10, 14).tr(0.05), pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
            ]),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            color: C.surfaceLowest,
            child: Row(children: [
              Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: C.secondaryContainer, borderRadius: R.rLg), child: Text('${f.patient.given[0]}${f.patient.family[0]}', style: T.headlineSm.c(C.onSecondaryContainer), textScaler: TextScaler.noScaling)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Wrap(spacing: 8, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    Text('${f.patient.family}, ${f.patient.given}', style: T.headlineSm),
                    Tag(allergyBadge(f).toUpperCase(), bg: f.realAllergies.isEmpty ? C.surfaceHigh : C.error, fg: f.realAllergies.isEmpty ? C.onSurfaceVariant : C.onError, style: T.badge.s(10, 14), pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                    const VerifiedMark(radius: R.full),
                  ]),
                  Text('MRN ${f.patient.mrn} • Bed ${f.bed} • DOB ${dobText(f.patient.birthDate)}', style: T.bodySm.c(C.onSurfaceVariant), maxLines: 2, overflow: TextOverflow.ellipsis),
                ]),
              ),
            ]),
          ),
        ]),
      );

  Widget _viewport() {
    Widget mark(Alignment at) {
      const side = BorderSide(color: C.secondaryFixedDim, width: 2);
      return Align(
        alignment: at,
        child: IgnorePointer(child: Container(width: 16, height: 16, decoration: BoxDecoration(border: Border(top: at.y < 0 ? side : BorderSide.none, bottom: at.y > 0 ? side : BorderSide.none, left: at.x < 0 ? side : BorderSide.none, right: at.x > 0 ? side : BorderSide.none)))),
      );
    }

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(color: C.surfaceHighest, borderRadius: R.rXl, boxShadow: shadowMd),
      child: AspectRatio(
        aspectRatio: 4 / 3,
        child: LayoutBuilder(
          builder: (c, box) => Stack(fit: StackFit.expand, children: [
            InteractiveViewer(
              transformationController: _zoom,
              maxScale: 6,
              onInteractionEnd: (_) => setState(() {}),
              child: Image.memory(_bytes, fit: BoxFit.contain, cacheWidth: 2400, gaplessPlayback: true, errorBuilder: (_, __, ___) => Center(child: Text('This picture cannot be shown.', style: T.bodySm))),
            ),
            Padding(padding: const EdgeInsets.all(8), child: Stack(children: [for (final a in const [Alignment.topLeft, Alignment.topRight, Alignment.bottomLeft, Alignment.bottomRight]) mark(a)])),
            Positioned(
              top: 12,
              left: 12,
              child: IgnorePointer(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: C.primaryContainer.withValues(alpha: 0.85), borderRadius: R.rBase),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [const Dot(C.tertiaryFixed, size: 6), const SizedBox(width: 4), Text(widget.shot.bytes.source == 'camera' ? 'CAMERA PICTURE' : 'UPLOADED PICTURE', style: T.badge.s(10, 15).tr(0.025).c(C.tertiaryFixed))]),
                ),
              ),
            ),
            Positioned(
              bottom: 12,
              right: 12,
              child: Tap(
                label: _zoomed ? 'Reset the zoom' : 'Zoom in to inspect',
                onTap: () => _toggleZoom(box.biggest),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 44),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(color: C.primary.withValues(alpha: 0.9), borderRadius: R.rFull, boxShadow: shadowMd),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [Ic(_zoomed ? Symbols.zoom_out : Symbols.zoom_in, size: 18, color: C.onPrimary), const SizedBox(width: 6), Text(_zoomed ? 'Reset zoom' : 'Tap to inspect', style: T.labelSm.c(C.onPrimary))]),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _card({required Widget lead, required String title, required String text, required String state, Widget? below}) => Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            lead,
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: T.headlineSm), Text(text, style: T.bodySm.c(C.onSurfaceVariant))])),
            const SizedBox(width: 8),
            Text(state, style: T.labelSm.semi.c(C.secondary)),
          ]),
          if (below != null) below,
        ]),
      );

  Widget _lead(IconData icon, {bool good = true}) => Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: good ? C.tertiaryFixed.withValues(alpha: 0.3) : C.errorContainer, borderRadius: R.rFull),
        child: Ic(icon, size: 18, color: good ? C.onTertiaryContainer : C.error),
      );

  Widget _technical() {
    final q = _q;
    if (q == null) {
      return _card(
        lead: const SizedBox(width: 28, height: 28, child: Padding(padding: EdgeInsets.all(4), child: CircularProgressIndicator(strokeWidth: 2, color: C.secondary))),
        title: 'Brightness & Sharpness',
        text: 'Measuring the picture on this phone.',
        state: 'Wait',
      );
    }
    final facts = 'Brightness ${q.brightness.round()} of 255, sharpness ${q.sharpness.round()}, ${q.width} × ${q.height} px. Measured on this phone.';
    return _card(
      lead: _lead(q.hints.isEmpty ? Symbols.check : Symbols.warning, good: q.hints.isEmpty),
      title: 'Brightness & Sharpness',
      text: q.hints.isEmpty ? facts : '${q.hints.join(' ')} $facts',
      state: q.hints.isEmpty ? 'Measured' : 'Hint',
      below: !_problem ? null : Padding(padding: const EdgeInsets.only(top: 4), child: TickRow(on: _override, text: 'I can still read it', sub: 'This choice is saved with the photo.', onTap: () => setState(() => _override = !_override))),
    );
  }

  Widget _staff({required bool on, required IconData icon, required String title, required String text, required VoidCallback onTap}) => Tap(
        label: '$title. $text',
        toggled: on,
        onTap: onTap,
        expand: true,
        child: _card(lead: on ? _lead(icon) : const SizedBox(width: 28, height: 28, child: Center(child: TickBox(false))), title: title, text: text, state: on ? 'Confirmed' : 'Tap to tick'),
      );
}

/* ==================================================================================================================
 * 3. Rejected picture
 * ================================================================================================================== */

class PaperErrorScreen extends StatefulWidget {
  final PaperShot shot;
  final List<String> staffReasons;
  const PaperErrorScreen({super.key, required this.shot, required this.staffReasons});
  @override
  State<PaperErrorScreen> createState() => _PaperErrorScreenState();
}

class _PaperErrorScreenState extends State<PaperErrorScreen> {
  late final Uint8List _bytes = Uint8List.fromList(widget.shot.bytes.data);
  PhotoQuality? _q;
  bool _measured = false, _recorded = false, _first = true;
  String? _recordError, _flaggedAt, _at;

  bool get _undecodable => widget.staffReasons.contains(kUndecodable);
  List<String> get _staff => [for (final r in widget.staffReasons) if (r != kUndecodable) r];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_first) return;
    _first = false;
    _at = AppScope.read(context).nowIso;
    // After this frame: the audit row notifies other listeners.
    WidgetsBinding.instance.addPostFrameCallback((_) => _record());
    if (_undecodable) {
      _measured = true;
    } else {
      compute(measurePhoto, _bytes).then((q) {
        if (mounted) {
          setState(() {
            _q = q;
            _measured = true;
          });
        }
      });
    }
  }

  void _record() {
    if (!mounted || _recorded) return;
    final app = AppScope.read(context);
    try {
      recordPhotoRejected(app.ctx(), patientId: widget.shot.patientId, check: {
        'form_type': widget.shot.formType,
        'readable': false,
        'reasons': widget.staffReasons,
        'chosen_by': _undecodable ? 'phone' : app.user!.id,
        'source': widget.shot.bytes.source,
      });
      setState(() {
        _recorded = true;
        _recordError = null;
      });
    } on AppError catch (e) {
      setState(() => _recordError = e.message);
    }
  }

  Future<void> _flag() async {
    final ok = await confirm(context, title: 'Flag the paper as damaged?', text: 'The change log gets "document damaged" for this patient. No picture and no record is saved. Tell the charge nurse about the paper.', yes: 'Flag as damaged', danger: true);
    if (!ok || !mounted) return;
    final app = AppScope.read(context);
    try {
      recordPhotoRejected(app.ctx(), patientId: widget.shot.patientId, check: {'form_type': widget.shot.formType, 'readable': false, 'reason': 'document_damaged', 'checked_by': app.user!.id});
      setState(() => _flaggedAt = hm(app.nowIso));
      toast(context, 'Flagged as damaged in the change log.');
    } on AppError catch (e) {
      toast(context, e.message, error: true, icon: Symbols.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final f = app.unlocked ? loadFacts(app.store, widget.shot.patientId, app.nowIso) : null;
    if (f == null) return const PhonePage(children: []);
    final tech = _q == null ? const <(String, String, bool, String)>[] : technicalChecks(_q!);
    final techBad = _undecodable ? 1 : tech.where((t) => !t.$3).length;
    final techAll = _undecodable ? 1 : tech.length;
    final staff = _staff;
    final bad = techBad + (staff.isEmpty ? 0 : 1), all = techAll + (staff.isEmpty ? 0 : 1);
    final firstReason = _reasonText(widget.staffReasons.firstOrNull ?? 'other: not given').$1;
    return PhonePage(
      header: RecHeader(title: 'Capture Rejected', subtitle: '${f.patient.family}, ${f.patient.given} • Bed ${f.bed}', alert: true),
      pad: const EdgeInsets.fromLTRB(12, 0, 12, 16),
      gap: 16,
      footer: Container(
        color: C.surface,
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Btn('Retake Photo', icon: Symbols.camera, onTap: () => _freshCapture(context, widget.shot.patientId, widget.shot.formType)),
          const SizedBox(height: 10),
          Tap(
            label: 'Manual form entry. Type the values yourself',
            expand: true,
            onTap: () => Go.paperDraft(context, widget.shot.patientId, formType: widget.shot.formType),
            child: Container(
              width: double.infinity,
              constraints: const BoxConstraints(minHeight: 48),
              alignment: Alignment.center,
              decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rBase),
              child: Column(mainAxisSize: MainAxisSize.min, children: [Text('Manual Bedside Form Entry', style: T.labelMd.s(13, 13)), const SizedBox(height: 2), Text('Type the values yourself, without a photo', style: T.labelSm.s(11, 13.75).c(C.onSurfaceVariant))]),
            ),
          ),
          Center(
            child: _flaggedAt != null
                ? Padding(padding: const EdgeInsets.all(16), child: Text('Flagged as damaged at $_flaggedAt', style: T.labelMd.c(C.onSurfaceVariant)))
                : Tap(
                    label: 'Flag document as damaged',
                    onTap: _flag,
                    child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.report_problem, size: 18, color: C.error), const SizedBox(width: 6), Flexible(child: Text('Flag Document as Damaged / Unusable', style: T.labelMd.c(C.error).copyWith(decoration: TextDecoration.underline, decorationColor: C.error)))]),
                  ),
          ),
        ]),
      ),
      children: [
        _rail(app, f),
        Box(
          color: C.errorContainer,
          pad: const EdgeInsets.all(16),
          shadow: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(padding: const EdgeInsets.all(8), decoration: const BoxDecoration(color: C.error, borderRadius: R.rLg), child: const Ic(Symbols.document_scanner, size: 24, color: C.onError)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  SizedBox(width: double.infinity, child: Wrap(alignment: WrapAlignment.spaceBetween, spacing: 4, children: [Text('PICTURE NOT KEPT', style: T.badge.tr(0.025).c(C.error)), Text('${hm(_at)} local', style: T.labelSm.c(C.onErrorContainer.withValues(alpha: 0.8)))])),
                  const SizedBox(height: 2),
                  Text('CAPTURE REJECTED: ${firstReason.toUpperCase()}', style: T.headlineSm.s(17, 23.4).c(C.onErrorContainer)),
                  const SizedBox(height: 4),
                  Text('The picture was not stored and no record was made. ${_recordError != null ? 'The rejection was NOT written to the change log.' : _recorded ? 'The rejection is in the change log.' : ''}', style: T.bodySm.c(C.onErrorContainer.withValues(alpha: 0.9))),
                ]),
              ),
            ]),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: C.surfaceLowest.withValues(alpha: 0.8), borderRadius: R.rLg),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  const Ic(Symbols.analytics, size: 16, color: C.error),
                  const SizedBox(width: 6),
                  Expanded(child: Text('Checks not passed', style: T.labelMd)),
                  Text(_measured ? '$bad of $all' : '…', style: T.vital.c(C.error)),
                ]),
                const SizedBox(height: 6),
                Bar(all == 0 ? 0 : bad / all, color: C.error, height: 10),
                const SizedBox(height: 6),
                Wrap(alignment: WrapAlignment.spaceBetween, spacing: 8, children: [
                  Text(!_measured ? 'Measuring on this phone' : 'Measured on this phone: $techBad of $techAll', style: T.labelSm.c(C.onSurfaceVariant)),
                  Text(staff.isEmpty ? 'Staff: nothing chosen' : 'Staff: ${staff.length} ${staff.length == 1 ? 'reason' : 'reasons'}', style: T.labelSm.semi.c(C.primary)),
                ]),
              ]),
            ),
          ]),
        ),
        if (_recordError != null)
          Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [ProblemBox(_recordError!, title: 'Not written to the change log'), const SizedBox(height: 8), Btn('Try again', kind: BtnKind.quiet, onTap: _record)]),
        _diagnostics(tech, staff),
        _reasons(tech, staff, techBad),
        _tips(),
      ],
    );
  }

  Widget _rail(AppState app, PatientFacts f) => Container(
        padding: const EdgeInsets.all(14),
        decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowSm),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            const Dot(C.error, size: 10),
            const SizedBox(width: 8),
            Expanded(child: Text(phaseLine(app).toUpperCase(), style: T.badge.c(C.secondaryContainer))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: C.surfaceHighest.withValues(alpha: 0.2), borderRadius: R.rBase),
              child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.lock, size: 14, color: C.surface), const SizedBox(width: 6), Text('Not stored', style: T.labelSm.semi.c(C.surface))]),
            ),
          ]),
          Container(margin: const EdgeInsets.only(top: 10), height: 1, color: C.onPrimaryContainer.withValues(alpha: 0.2)),
          const SizedBox(height: 8),
          Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 4, children: [
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 200),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Patient Identification', style: T.labelSm.c(C.onPrimaryContainer)), Text(f.patient.fullName, style: T.headlineSm.s(17, 21.25).c(C.surface))]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [Text('Bed / MRN', style: T.labelSm.s(11, 24).c(C.onPrimaryContainer)), Text('Bed ${f.bed} • #${f.patient.mrn}', style: T.labelMd.c(C.surface), textAlign: TextAlign.right)]),
          ]),
        ]),
      );

  Widget _bubble(String code, String title, String text, {required bool top}) => ConstrainedBox(
        constraints: BoxConstraints(maxWidth: top ? 200 : 210),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: top ? C.primary : C.inverseSurface, borderRadius: R.rLg, boxShadow: shadowMd),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [Ic(_reasonIcon[code] ?? Symbols.report_problem, size: 13, color: top ? C.errorContainer : C.secondaryFixed), const SizedBox(width: 4), Flexible(child: Text(title.toUpperCase(), style: T.badge.s(10, 14).c(top ? C.errorContainer : C.secondaryFixed)))]),
            const SizedBox(height: 2),
            Text(text, style: T.bodySm.s(11, 13.75).c(C.surface)),
          ]),
        ),
      );

  Widget _diagnostics(List<(String, String, bool, String)> tech, List<String> staff) {
    final badTech = tech.where((t) => !t.$3).firstOrNull;
    Widget pill(String name, String value, bool ok) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: const BoxDecoration(color: C.surfaceContainer, borderRadius: R.rBase),
            child: Column(children: [Text(name, style: T.labelSm.c(C.onSurfaceVariant), textAlign: TextAlign.center), Text(value, style: T.labelMd.s(13, 24).c(ok ? C.onSurface : C.error), textAlign: TextAlign.center)]),
          ),
        );
    return Box(
      shadow: true,
      pad: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Ic(Symbols.crop_free, size: 20, color: C.secondary),
          const SizedBox(width: 6),
          Expanded(child: Text('Capture Viewport Diagnostics', style: T.headlineSm)),
          const SizedBox(width: 8),
          Tag(_q == null ? 'NO SIZE' : '${_q!.width} × ${_q!.height}', bg: C.surfaceContainer),
        ]),
        const SizedBox(height: 12),
        AspectRatio(
          aspectRatio: 4 / 5,
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
            child: Stack(fit: StackFit.expand, children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Opacity(
                  opacity: 0.85,
                  child: ColoredBox(
                    color: C.surfaceLowest,
                    child: _undecodable ? const Center(child: Ic(Symbols.image, size: 48, color: C.outlineVariant)) : Image.memory(_bytes, fit: BoxFit.contain, cacheWidth: 1000, errorBuilder: (_, __, ___) => const Center(child: Ic(Symbols.image, size: 48, color: C.outlineVariant))),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(10),
                child: Stack(children: [
                  if (badTech != null) Align(alignment: Alignment.topRight, child: _bubble(_q!.problem, 'Measured: ${badTech.$1}', badTech.$4, top: true)),
                  if (_undecodable) Align(alignment: Alignment.topRight, child: _bubble(kUndecodable, 'Not opened', _reasonText(kUndecodable).$2, top: true)),
                  if (staff.isNotEmpty) Align(alignment: Alignment.bottomLeft, child: Padding(padding: const EdgeInsets.only(bottom: 8), child: _bubble(staff.first, 'Staff: ${_reasonText(staff.first).$1}', _reasonText(staff.first).$2, top: false))),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 16),
        if (tech.isEmpty)
          Text(_undecodable || _measured ? 'Nothing could be measured.' : 'Measuring the picture on this phone.', style: T.bodySm.c(C.onSurfaceVariant))
        else
          IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (var i = 0; i < tech.length; i++) ...[if (i > 0) const SizedBox(width: 6), pill(tech[i].$1, tech[i].$2, tech[i].$3)],
            ]),
          ),
      ]),
    );
  }

  Widget _reasons(List<(String, String, bool, String)> tech, List<String> staff, int techBad) {
    Widget item(bool ok, String title, String tag, String text) => Container(
          margin: const EdgeInsets.only(top: 8),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: ok ? C.surfaceLow : C.errorContainer.withValues(alpha: 0.4), borderRadius: R.rLg),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(margin: const EdgeInsets.only(top: 2), width: 24, height: 24, alignment: Alignment.center, decoration: BoxDecoration(color: ok ? C.tertiaryContainer : C.error, borderRadius: R.rBase), child: Ic(ok ? Symbols.check : Symbols.close, size: 16, color: ok ? C.onTertiaryContainer : C.onError)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(title, style: T.labelMd)),
                  const SizedBox(width: 6),
                  ConstrainedBox(constraints: const BoxConstraints(maxWidth: 140), child: Text(tag.toUpperCase(), style: T.badge.s(10, 14).c(ok ? C.onTertiaryContainer : C.error), textAlign: TextAlign.right)),
                ]),
                const SizedBox(height: 2),
                Text(text, style: T.bodySm.c(C.onSurfaceVariant)),
              ]),
            ),
          ]),
        );
    final n = techBad + staff.length;
    return Box(
      shadow: true,
      pad: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text('Reasons', style: T.headlineSm)),
          const SizedBox(width: 8),
          Text('$n ${n == 1 ? 'reason' : 'reasons'}', style: T.labelSm.c(C.error)),
        ]),
        const SizedBox(height: 4),
        for (final r in staff) item(false, _reasonText(r).$1, 'Chosen by staff', _reasonText(r).$2),
        if (_undecodable) item(false, _reasonText(kUndecodable).$1, 'Found by the phone', _reasonText(kUndecodable).$2),
        for (final t in tech.where((t) => !t.$3)) item(false, t.$1, 'Measured', '${t.$4} Value: ${t.$2}.'),
        for (final t in tech.where((t) => t.$3)) item(true, t.$1, 'Measured', 'No problem found. Value: ${t.$2}.'),
        Padding(padding: const EdgeInsets.only(top: 8), child: Text('The measured checks are simple technical hints. They do not read the writing.', style: T.bodySm.c(C.onSurfaceVariant))),
      ]),
    );
  }

  Widget _tips() {
    const tips = [
      ('Lay the Paper Flat', 'Put the paper on a table. Keep your hand and other objects off it.'),
      ('Move Away from the Lamp', 'Tilt the phone a little, or turn the paper, until the bright spot is off the writing.'),
      ('Show All 4 Corners', 'Keep the whole page inside the frame, hold still, then take the picture.'),
    ];
    return Box(
      color: C.surfaceLow,
      pad: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [const Ic(Symbols.troubleshoot, size: 22, color: C.secondary), const SizedBox(width: 8), Expanded(child: Text('Camera Tips', style: T.headlineSm))]),
        const SizedBox(height: 2),
        for (var i = 0; i < tips.length; i++)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(10),
            decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(width: 24, height: 24, alignment: Alignment.center, decoration: const BoxDecoration(color: C.secondary, borderRadius: R.rFull), child: Text('${i + 1}', style: T.labelMd.c(C.onSecondary), textScaler: TextScaler.noScaling)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(tips[i].$1, style: T.labelMd), const SizedBox(height: 2), Text(tips[i].$2, style: T.bodySm.c(C.onSurfaceVariant))])),
            ]),
          ),
      ]),
    );
  }
}

/* ==================================================================================================================
 * 4. Draft verification
 * ================================================================================================================== */

/// What happened to the commit. Shown on the same page (step 4).
enum _Out { none, saved, failed, held, waiting }

class PaperDraftScreen extends StatefulWidget {
  final String patientId;
  final String formType;
  final String? photoRef;
  const PaperDraftScreen({super.key, required this.patientId, required this.formType, this.photoRef});
  @override
  State<PaperDraftScreen> createState() => _PaperDraftScreenState();
}

class _PaperDraftScreenState extends State<PaperDraftScreen> with DraftKeeper {
  late final String type = _recordType(widget.formType);
  late final RecForm form = RecForm(type);
  String _key = newId('k');
  String? _tickedFor, _problem, _draftEntryId;
  bool _show = false, _busy = false, _help = false, _loaded = false, _hashOk = false;
  Uint8List? _bytes;
  _Out _out = _Out.none;
  Entry? _saved;

  @override
  String get draftId => 'paper:${appState.user?.id}:${widget.photoRef ?? '${widget.patientId}:${widget.formType}'}';
  @override
  String get draftKind => 'paper';
  @override
  String get draftPatientId => widget.patientId;
  @override
  bool get draftWanted => _out != _Out.saved && _draftEntryId == null && (widget.photoRef != null || form.hasContent);
  @override
  Doc draftPayload() => {'form': form.toDoc(appState.nowIso), 'key': _key, 'form_type': widget.formType, 'photo_ref': widget.photoRef};

  String get _print => '${widget.photoRef ?? 'no photo'}|${form.fingerprint}';
  bool get _ticked => _tickedFor != null && _tickedFor == _print;

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
    }
    final ref = widget.photoRef;
    if (ref != null) {
      _bytes = appState.store.photoBytes(ref);
      _hashOk = verifyPhoto(appState.store, ref);
      // A kept photo without a record is listed in Local review from now on.
      if (p == null) keepNow(quiet: true);
    }
  }

  @override
  void dispose() {
    super.dispose();
    form.dispose();
  }

  /// Any edit: the tick belongs to the earlier values, so it is cleared.
  void _changed() {
    setState(() {
      _tickedFor = null;
      if (_out == _Out.failed || _out == _Out.held) _out = _Out.none;
    });
    keepSoon();
  }

  Doc? get _photoRow => widget.photoRef == null ? null : appState.store.get('m_photo', widget.photoRef!);

  Future<void> _commit(PatientFacts f) async {
    if (_busy) return;
    final r = checkRec(appState, f, form, ignoreEntryId: _draftEntryId);
    if (!r.ok || !_ticked || !warningsDone(form, r)) {
      setState(() => _show = true);
      return;
    }
    setState(() {
      _busy = true;
      _problem = null;
    });
    final ref = widget.photoRef;
    try {
      if (ref != null) {
        _hashOk = verifyPhoto(appState.store, ref);
        if (!_hashOk) throw const AppError('The stored photo is missing or does not match its saved hash. Nothing was saved. Take the photo again.');
      }
      final row = _photoRow;
      if (r.locks.isNotEmpty) {
        setState(() => _out = _Out.held);
        await Go.conflict(context, widget.patientId, r.order!.id, scheduledTime: r.scheduledTime, locks: r.locks);
        return;
      }
      Entry save(String status) => createEntry(
            appState.ctx(),
            type: type,
            patientId: widget.patientId,
            careTime: r.careTime!,
            values: r.values,
            clientKey: _key,
            rawInputKind: ref == null ? 'typed' : 'photo',
            rawInputRef: ref,
            photoCheck: (row?['check'] as Map?)?.cast<String, Object?>(),
            status: status,
            scheduledTime: r.scheduledTime,
            also: (_) => discardDraft(appState.ctx(), draftId, audit: false),
          );
      if (r.secondNurse) {
        // The record stays a draft, linked to its photo, until the second nurse agrees.
        if (ref != null && _draftEntryId == null) {
          _draftEntryId = save('draft').id;
          stopKeeping();
          appState.saved();
        } else {
          keepNow();
        }
        setState(() => _out = _Out.waiting);
        final id = await Go.cosign(
          context,
          MedProposal(patientId: widget.patientId, orderId: r.order!.id, key: _draftEntryId == null ? _key : newId('k'), careTime: r.careTime!, scheduledTime: r.scheduledTime, values: r.values, draftEntryId: _draftEntryId),
        );
        if (!mounted || id == null) return;
        final e = appState.store.get('entry', id);
        if (e == null || e['status'] != 'confirmed') return;
        stopKeeping();
        if (_draftEntryId == null) discardDraft(appState.ctx(), draftId, audit: false);
        setState(() {
          _saved = Entry(e);
          _out = _Out.saved;
        });
        return;
      }
      if (_draftEntryId != null) {
        // The photo-linked draft of an earlier commit becomes the record; a second entry would leave it behind.
        _saved = confirmDraft(appState.ctx(), _draftEntryId!, r.values, careTime: r.careTime, also: (_) => discardDraft(appState.ctx(), draftId, audit: false));
      } else {
        _saved = save('confirmed');
      }
      stopKeeping();
      _out = _Out.saved;
      appState.saved();
    } on DoseLockedError catch (e) {
      _out = _Out.held;
      if (mounted) await Go.conflict(context, widget.patientId, r.order!.id, scheduledTime: r.scheduledTime, locks: e.locks);
    } on AppError catch (e) {
      _problem = e.message;
      _out = _Out.failed;
      keepNow();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _discard() async {
    final ref = widget.photoRef;
    final ok = await confirm(
      context,
      title: 'Discard this draft?',
      text: ref == null ? 'The typed values are removed. Nothing was saved as a record.' : 'The typed values are removed and an empty manual form opens. The kept photo stays encrypted on this phone.',
      yes: 'Discard',
      danger: true,
    );
    if (!ok || !mounted) return;
    stopKeeping();
    try {
      discardDraft(appState.ctx(), draftId);
    } on AppError catch (e) {
      toast(context, e.message, error: true, icon: Symbols.error);
      return;
    }
    form.clear();
    if (ref == null) {
      setState(() {
        form.setText('time', hm(appState.nowIso));
        _key = newId('k');
        _tickedFor = null;
        _out = _Out.none;
        _show = false;
      });
      Go.back(context);
    } else {
      unawaited(Go.paperDraft(context, widget.patientId, formType: widget.formType));
    }
  }

  Future<void> _retake() async {
    if (!await confirm(context, title: 'Take the photo again?', text: 'The values typed here are kept as an unfinished form in Local review. The stored photo stays encrypted on this phone.', yes: 'Take a new photo') || !mounted) return;
    keepNow();
    _freshCapture(context, widget.patientId, widget.formType);
  }

  Future<void> _unreadable() async {
    final ok = await confirm(context, title: 'Mark the photo as unreadable?', text: 'The change log gets "unreadable" for this photo. The photo stays encrypted, and an empty manual form opens.', yes: 'Mark unreadable', danger: true);
    if (!ok || !mounted) return;
    stopKeeping();
    try {
      recordPhotoRejected(appState.ctx(), patientId: widget.patientId, check: {'form_type': widget.formType, 'readable': false, 'reason': 'unreadable', 'photo_ref': widget.photoRef, 'checked_by': appState.user!.id});
      discardDraft(appState.ctx(), draftId);
    } on AppError catch (e) {
      toast(context, e.message, error: true, icon: Symbols.error);
      return;
    }
    form.clear();
    unawaited(Go.paperDraft(context, widget.patientId, formType: widget.formType));
  }

  Future<void> _permission() async {
    try {
      final p = await appState.native.cameraPermission(ask: false);
      if (mounted) toast(context, p == 'granted' ? 'The camera is allowed for this app.' : 'The camera is not allowed for this app now.', icon: Symbols.info);
    } catch (e) {
      if (mounted) toast(context, problemText(e), error: true, icon: Symbols.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final f = app.unlocked ? loadFacts(app.store, widget.patientId, app.nowIso) : null;
    if (f == null) return const PhonePage(children: []);
    final r = checkRec(app, f, form, ignoreEntryId: _draftEntryId);
    final saved = _out == _Out.saved;
    final cards = saved
        ? <Widget>[]
        : [
            ...recFieldCards(context, app: app, facts: f, form: form, check: r, showErrors: _show, changed: _changed, tag: 'Typed by you · not yet confirmed', timeLabel: type == 'med_admin' ? 'Admin time' : 'Time of care', orderFixed: _draftEntryId != null),
          ];
    return PopScope(
      onPopInvokedWithResult: (_, __) {
        if (keepNow(quiet: true) && mounted) toast(context, 'Unfinished form kept encrypted on this phone (Local review).', icon: Symbols.draft);
      },
      child: PhonePage(
        header: RecHeader(title: 'Paper Draft', subtitle: '${f.patient.family}, ${f.patient.given} • Bed ${f.bed}'),
        pad: const EdgeInsets.fromLTRB(12, 0, 12, 16),
        gap: 12,
        footer: _footer(f, r),
        children: [
          _rail(app),
          _patient(f),
          _steps(saved ? 4 : 3),
          _source(),
          _banner(r),
          ...cards,
          if (!saved) _clinician(app, cards.length + 1),
          if (!saved && r.warnings.isNotEmpty) WarningTicks(form: form, check: r, changed: _changedWarning),
          if (!saved && _show && !r.ok) ProblemBox('Fix the marked fields first: ${r.errors.values.join('; ')}.'),
          if (!saved && draftProblem != null) ProblemBox(draftProblem!),
          if (saved) _savedRows(app) else _attest(r),
        ],
      ),
    );
  }

  void _changedWarning() => setState(() {});

  Widget _rail(AppState app) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowSm),
        child: Row(children: [
          Expanded(
            child: Row(children: [
              const Dot(C.tertiaryFixed, size: 10),
              const SizedBox(width: 8),
              Flexible(child: Text(phaseLine(app).toUpperCase(), style: T.badge.c(C.tertiaryFixed))),
              if (app.downtime != null) ...[
                const SizedBox(width: 8),
                Text('•', style: T.bodySm.c(C.onPrimaryContainer.withValues(alpha: 0.6))),
                const SizedBox(width: 8),
                DowntimeClock(text: elapsedHm, style: T.labelSm.c(C.surfaceHighest)),
              ],
            ]),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: C.surfaceContainer.withValues(alpha: 0.2), borderRadius: R.rBase),
            child: Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.shield_lock, size: 13, color: C.tertiaryFixed), const SizedBox(width: 4), Text('PRACTICE', style: T.labelSm.c(C.surface))]),
          ),
        ]),
      );

  Widget _patient(PatientFacts f) => Box(
        shadow: true,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(f.patient.fullName, style: T.headlineSm),
                Tag(f.realAllergies.isEmpty ? f.allergyText.toUpperCase() : '${f.realAllergies.map((a) => a.substance).join(', ')} allergy'.toUpperCase(), bg: f.realAllergies.isEmpty ? C.surfaceHigh : C.error, fg: f.realAllergies.isEmpty ? C.onSurfaceVariant : C.onError, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
              ]),
              const SizedBox(height: 4),
              Text.rich(
                TextSpan(children: [
                  const TextSpan(text: 'Bed '),
                  TextSpan(text: f.bed, style: T.labelSm.bold.c(C.onSurface)),
                  TextSpan(text: '  •  ', style: T.labelSm.c(C.outlineVariant)),
                  const TextSpan(text: 'MRN '),
                  TextSpan(text: f.patient.mrn, style: T.mono(11, line: 14)),
                  TextSpan(text: '  •  ', style: T.labelSm.c(C.outlineVariant)),
                  TextSpan(text: 'DOB ${dobText(f.patient.birthDate)}'),
                ]),
                style: T.labelSm.c(C.onSurfaceVariant),
              ),
            ]),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rBase),
            child: Column(children: [Text('Form', style: T.labelSm.c(C.onSurfaceVariant)), Text(_typeShort(widget.formType).toUpperCase(), style: T.badge)]),
          ),
        ]),
      );

  Widget _steps(int at) => Box(
        color: C.surfaceLow,
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, runSpacing: 4, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [const Ic(Symbols.document_scanner, size: 18, color: C.primary), const SizedBox(width: 5), Flexible(child: Text('Draft Verification', style: T.headlineSm))]),
            Tag(at == 4 ? 'Step 4 of 4: Commit' : 'Step 3 of 4: Confirm Values', bg: C.secondaryFixed, fg: C.onSecondaryFixed, radius: R.full),
          ]),
          const SizedBox(height: 12),
          Row(children: [
            for (var i = 1; i <= 4; i++) ...[
              if (i > 1) const SizedBox(width: 4),
              Expanded(child: Container(height: 6, decoration: BoxDecoration(color: i == at ? C.primary : (i < at ? C.secondary : C.surfaceHighest), borderRadius: R.rFull))),
            ],
          ]),
          const SizedBox(height: 6),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            for (final (i, t) in const [(1, '1. Choose'), (2, '2. Photo'), (3, '3. Verify'), (4, '4. Commit')])
              Flexible(child: Text(t, style: T.labelSm.s(10, 15).w(i == at ? FontWeight.w700 : (i < at ? FontWeight.w600 : FontWeight.w500)).c(i == at ? C.primary : (i < at ? C.secondary : C.onSurfaceVariant.withValues(alpha: 0.6))), maxLines: 1, overflow: TextOverflow.ellipsis)),
          ]),
        ]),
      );

  Widget _small(IconData icon, String text, VoidCallback onTap, {Color bg = C.surfaceHigh, Color fg = C.onSurface}) => Tap(
        label: text,
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 36),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: bg, borderRadius: R.rBase),
          child: Row(mainAxisSize: MainAxisSize.min, children: [Ic(icon, size: 16, color: fg), const SizedBox(width: 4), Text(text, style: T.labelSm.c(fg))]),
        ),
      );

  Widget _source() {
    if (widget.photoRef == null) {
      return Box(
        shadow: true,
        child: Row(children: [
          const Ic(Symbols.no_photography, size: 18, color: C.secondary),
          const SizedBox(width: 8),
          Expanded(child: Text('No photo: manual entry', style: T.labelMd)),
          const SizedBox(width: 8),
          if (_out != _Out.saved) _small(Symbols.photo_camera, 'Take photo', _retake),
        ]),
      );
    }
    final row = _photoRow;
    final kb = ((row?['size'] as num? ?? 0) / 1024).round();
    return Box(
      shadow: true,
      pad: const EdgeInsets.fromLTRB(12, 6, 12, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Ic(Symbols.photo_camera, size: 18, color: C.secondary),
          const SizedBox(width: 8),
          Expanded(child: Text('Source Paper Document', style: T.labelMd)),
          if (_bytes != null) _small(Symbols.zoom_in, 'Expand', () => showPhoto(context, _bytes!, _hashOk ? 'Original picture · photo hash checked' : 'Original picture · hash does not match')),
          const SizedBox(width: 6),
          _small(Symbols.help, 'Help', () => setState(() => _help = !_help), bg: C.surfaceLow, fg: C.onSurfaceVariant),
        ]),
        const SizedBox(height: 2),
        ClipRRect(
          borderRadius: R.rXl,
          child: Container(
            color: C.surfaceHighest,
            constraints: const BoxConstraints(minHeight: 112),
            child: Stack(children: [
              Positioned.fill(
                child: _bytes == null
                    ? Center(child: Text('The photo is missing.', style: T.bodyMd.c(C.error)))
                    : Image.memory(_bytes!, fit: BoxFit.cover, alignment: Alignment.center, cacheWidth: 1000, errorBuilder: (_, __, ___) => Center(child: Text('This picture cannot be shown.', style: T.bodySm))),
              ),
              const Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [Color(0xCC071020), Color(0x00071020)], stops: [0, 1])))),
              Container(
                constraints: const BoxConstraints(minHeight: 112),
                alignment: Alignment.bottomCenter,
                padding: const EdgeInsets.fromLTRB(8, 0, 8, 2),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Flexible(
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: C.surfaceLowest.withValues(alpha: 0.9), borderRadius: R.rBase),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Ic(_hashOk ? Symbols.verified : Symbols.error, size: 13, color: _hashOk ? C.primary : C.error),
                        const SizedBox(width: 4),
                        Flexible(child: Text(_hashOk ? 'Photo hash checked • $kb KB' : 'Photo hash does not match', style: T.mono(11, w: FontWeight.w500, line: 14).c(_hashOk ? C.primary : C.error))),
                      ]),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (_out != _Out.saved) _small(Symbols.refresh, 'Retake', _retake, bg: C.surfaceLowest),
                ]),
              ),
            ]),
          ),
        ),
        if (_help)
          Container(
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.all(10),
            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [const Ic(Symbols.tune, size: 15, color: C.secondary), const SizedBox(width: 4), Expanded(child: Text('Image & Camera Help', style: T.labelSm.semi)), Tap(label: 'Close help', onTap: () => setState(() => _help = false), child: const Ic(Symbols.close, size: 16, color: C.onSurfaceVariant))]),
              Text('If the writing is cut off or smudged, do not use this photo. Type the values from the paper in a manual form.', style: T.bodySm.c(C.onSurfaceVariant)),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: Btn('Check Permissions', style: T.labelSm, bg: C.surfaceHighest, fg: C.onSurface, onTap: _permission)),
                const SizedBox(width: 8),
                Expanded(child: Btn('Mark Unreadable', style: T.labelSm.semi, bg: C.errorContainer, fg: C.onErrorContainer, onTap: _out == _Out.saved ? null : _unreadable)),
              ]),
            ]),
          ),
      ]),
    );
  }

  Widget _banner(RecCheck r) {
    final (icon, bg, fg, box, over, title, text) = switch (_out) {
      _Out.none => (Symbols.keyboard, C.secondaryContainer, C.onSecondaryContainer, C.secondary, 'TYPED DRAFT', 'Every Value Needs Your Check', 'Nothing was read from the paper automatically. All fields stay editable until you commit.'),
      _Out.saved => (Symbols.check_circle, C.tertiaryContainer, C.tertiaryFixed, C.onTertiaryFixedVariant, 'SAVED ON THIS PHONE', 'Record ${_saved?.counter ?? ''} Saved', 'Time of care ${dateTimeLabel(_saved?.careTime)}. Saved ${hm(_saved?.entryTime)} · ${_saved?.id ?? ''}'),
      _Out.failed => (Symbols.error, C.errorContainer, C.onErrorContainer, C.error, 'NOT SAVED', 'Commit Failed', '${_problem ?? ''} Your values are still here. Trying again cannot save twice.'),
      _Out.held => (Symbols.lock, C.errorContainer, C.onErrorContainer, C.error, 'NOT SAVED', 'Held by a Dose Lock', r.locks.isEmpty ? 'The dose was refused by a lock.' : '${r.locks.first.title}. ${r.locks.first.reason}'),
      _Out.waiting => (Symbols.group, C.secondaryContainer, C.onSecondaryContainer, C.secondary, 'NOT CONFIRMED', 'Waiting for the Second Nurse', _draftEntryId != null ? 'The record is stored as a draft with its photo. It counts only after a second nurse checked it.' : 'Nothing is saved as a record until a second nurse checked it.'),
    };
    return Semantics(
      liveRegion: _out != _Out.none,
      child: Box(
        color: bg,
        shadow: true,
        pad: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(margin: const EdgeInsets.only(top: 2), padding: const EdgeInsets.all(6), decoration: BoxDecoration(color: box, borderRadius: R.rLg), child: Ic(icon, size: 20, color: _out == _Out.saved ? C.tertiaryFixed : C.onSecondary)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 8, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text(over, style: T.badge.tr(0.025).c(fg)),
                  if (_out == _Out.none) Container(padding: const EdgeInsets.symmetric(horizontal: 6), decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rBase), child: Text('Not confirmed', style: T.labelSm.bold.c(C.secondary))),
                ]),
                const SizedBox(height: 2),
                Text(title, style: T.headlineSm.bold.c(fg)),
                const SizedBox(height: 2),
                Text(text, style: T.bodySm.c(fg)),
              ]),
            ),
          ]),
          if (_out == _Out.waiting && _draftEntryId != null) ...[const SizedBox(height: 8), Btn('View the draft record', kind: BtnKind.white, onTap: () => Go.entry(context, widget.patientId, _draftEntryId!))],
        ]),
      ),
    );
  }

  Widget _clinician(AppState app, int n) => FieldCard(
        label: '${n.toString().padLeft(2, '0')}. ${type == 'med_admin' ? 'Administering clinician' : 'Recorded by'}',
        tag: 'Signed in here',
        tagIcon: Symbols.badge,
        children: [
          Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
            child: Text('${app.user?.title ?? ''} (${app.user?.initials ?? ''})', style: T.headlineSm),
          ),
          const SizedBox(height: 8),
          Row(children: [Expanded(child: Text('The signed-in person is stored with the record.', style: T.labelSm.c(C.onSurfaceVariant))), const SizedBox(width: 8), Expanded(child: Text(app.unit, style: T.labelSm, textAlign: TextAlign.right))]),
        ],
      );

  Widget _attest(RecCheck r) => Box(
        shadow: true,
        pad: const EdgeInsets.all(14),
        child: TickRow(
          on: _ticked,
          text: 'I have compared each value with the paper document.',
          sub: _ticked ? 'For exactly these values${widget.photoRef == null ? '' : ' and this photo'}. Any change clears the tick.' : 'Tick after the last change. Any change clears the tick.',
          onTap: () {
            if (!r.ok) {
              setState(() => _show = true);
              toast(context, 'Fill the marked fields first.', icon: Symbols.info);
              return;
            }
            setState(() => _tickedFor = _ticked ? null : _print);
          },
        ),
      );

  Widget _savedRows(AppState app) {
    final x = _saved == null ? null : getEntry(app.store, _saved!.id);
    return Box(shadow: true, pad: const EdgeInsets.all(14), child: RowsTable(x?.child == null ? const [] : valueRows(app.store, type, x!.child!)));
  }

  Widget _footer(PatientFacts f, RecCheck r) {
    final ready = r.ok && _ticked && warningsDone(form, r);
    final commit = switch (_out) { _Out.failed => 'Try Again', _Out.waiting => 'Ask the Second Nurse Again', _Out.held => 'Check the Dose Lock Again', _ => 'Confirm & Commit to Device Vault' };
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      decoration: const BoxDecoration(color: C.surface, boxShadow: shadowUp),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (_out == _Out.saved) ...[
          Btn('View Record', icon: Symbols.visibility, style: T.headlineSm, onTap: () => Go.entry(context, widget.patientId, _saved!.id)),
          const SizedBox(height: 8),
          Btn('Done', kind: BtnKind.quiet, bg: C.surfaceLow, onTap: () => Go.back(context)),
        ] else ...[
          Btn(commit, icon: Symbols.lock_clock, iconColor: C.tertiaryFixed, style: T.headlineSm, busy: _busy, onTap: ready ? () => _commit(f) : null),
          const SizedBox(height: 8),
          Btn(widget.photoRef == null ? 'Discard Draft' : 'Discard Draft & Enter Manually', icon: Symbols.edit_note, iconColor: C.secondary, iconSize: 18, kind: BtnKind.quiet, bg: C.surfaceLow, onTap: _busy || _draftEntryId != null ? null : _discard, reason: _draftEntryId != null ? 'The stored draft record stays. Open it from Local review.' : null),
        ],
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 12, 8, 4),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Ic(Symbols.fingerprint, size: 14, color: C.secondary),
            const SizedBox(width: 4),
            Flexible(child: Text(widget.photoRef == null ? 'The record is stored encrypted on this phone.' : 'The photo is stored encrypted on this phone with its SHA-256 hash, linked to the record.', style: T.bodySm.c(C.onSurfaceVariant), textAlign: TextAlign.center)),
          ]),
        ),
      ]),
    );
  }
}
