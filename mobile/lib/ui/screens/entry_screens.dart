import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../config/policy.dart';
import '../../core/clock.dart';
import '../../core/util.dart';
import '../../data/repos/ops.dart';
import '../../data/schema.dart';
import '../../data/store.dart';
import '../../state/app_state.dart';
import '../kit/kit.dart';
import '../router.dart';

/* ------------------------------ Shared by the entry and ward screens ------------------------------ */

/// "Ward 4B Med/Surg" -> "Ward 4B", "4 West (Medical-Surgical)" -> "4 West".
String unitShort(String unit) {
  final plain = unit.split(' (').first.trim();
  final w = plain.split(' ');
  return w.first.toLowerCase() == 'ward' && w.length > 2 ? '${w[0]} ${w[1]}' : plain;
}

/// "RN" -> "Registered nurse"
String roleWords(Practitioner p) => switch (p.role) { 'RN' => 'Registered nurse', 'LPN' => 'Practical nurse', 'admin' => 'Administrator', _ => p.role };

/// Title of the downtime rail for the recorded phase.
String phaseRail(Phase p) => switch (p) { Phase.down => 'EHR Downtime Active', Phase.online => 'Back Online: Local Review', Phase.ready => 'EHR Normal' };

/// Light or dark status-bar icons, to match the colour behind them.
class StatusIcons extends StatelessWidget {
  final bool light;
  final Widget child;
  const StatusIcons({super.key, required this.light, required this.child});
  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle(statusBarColor: const Color(0x00000000), statusBarIconBrightness: light ? Brightness.light : Brightness.dark, statusBarBrightness: light ? Brightness.dark : Brightness.light),
        child: child,
      );
}

/// Two sides of one line; the right side moves to a second line when the text is large or the phone is narrow.
class TwoSides extends StatelessWidget {
  final Widget left, right;
  const TwoSides(this.left, this.right, {super.key});
  @override
  Widget build(BuildContext context) => Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, runSpacing: 2, children: [left, right]);
}

/// Text that is written again every second (elapsed time).
class Ticking extends StatefulWidget {
  final String Function() text;
  final TextStyle style;
  const Ticking(this.text, {super.key, required this.style});
  @override
  State<Ticking> createState() => _TickingState();
}

class _TickingState extends State<Ticking> {
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Text(widget.text(), style: widget.style);
}

/// Real reason of a failure, in the exports' error colours.
class ErrorBox extends StatelessWidget {
  final String text;
  const ErrorBox(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Box(
          color: C.errorContainer,
          radius: R.lg,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Ic(Symbols.error, size: 20, color: C.error),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: T.bodyMd.c(C.onErrorContainer))),
          ]),
        ),
      );
}

/* ------------------------------ Opening ------------------------------ */

class OpeningScreen extends StatelessWidget {
  const OpeningScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final status = app.vaultStatus;
    void start() {
      if (!app.unlocked) return Go.vault(context);
      app.signedIn ? Go.home(context) : Go.staff(context);
    }

    final (storeText, storeColor) = switch (status) {
      VaultStatus.checking => ('Checking records', C.outline),
      VaultStatus.none => ('Not set up yet', C.outline),
      VaultStatus.locked => ('Records locked', C.tertiaryFixedDim),
      VaultStatus.unlocked => ('Encrypted vault open', C.tertiaryFixedDim),
      VaultStatus.problem => ('Records need IT', C.error),
    };

    return StatusIcons(
      light: false,
      child: PhonePage(
        pad: const EdgeInsets.fromLTRB(S.md, 0, S.md, S.xl),
        children: [
          // Downtime and practice rail
          Box(
            color: C.primaryContainer,
            shadow: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              TwoSides(
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Dot(C.tertiaryFixedDim, size: 10),
                  const SizedBox(width: 4),
                  Flexible(child: Text('DOWNTIME MODE READY', style: T.badge.c(C.tertiaryFixed))),
                ]),
                Tag('PRACTICE', bg: C.secondaryContainer, fg: C.onSecondaryContainer, style: T.labelSm.tr(0.025), pad: const EdgeInsets.symmetric(horizontal: 4, vertical: 2)),
              ),
              const SizedBox(height: 8),
              TwoSides(
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Ic(Symbols.shield, size: 15, color: C.tertiaryFixedDim),
                  const SizedBox(width: 6),
                  Flexible(child: Text('Local Encrypted Store', style: T.bodySm.c(C.onPrimaryContainer))),
                ]),
                Row(mainAxisSize: MainAxisSize.min, children: [
                  const Ic(Symbols.wifi_off, size: 15, color: C.onPrimaryContainer),
                  const SizedBox(width: 4),
                  Flexible(child: Text('Works offline', style: T.bodySm.c(C.onPrimaryContainer))),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: S.lg),
          const _Hero(),
          const SizedBox(height: S.lg),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: S.sm),
            child: Column(children: [
              Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Ic(Symbols.medical_services, size: 20, color: C.secondary),
                const SizedBox(width: 6),
                Flexible(child: Text('BEDSIDE DOWNTIME DRILLS', style: T.labelMd.tr(0.05).c(C.onSurfaceVariant))),
              ]),
              const SizedBox(height: 4),
              Semantics(header: true, child: Text('ClinBridge', style: T.headlineLg.tr(-0.025), textAlign: TextAlign.center)),
              const SizedBox(height: 4),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 300),
                child: Text('Bedside charting practice with fictional patients for EHR network downtime.', style: T.bodyMd.c(C.onSurfaceVariant), textAlign: TextAlign.center),
              ),
            ]),
          ),
          const SizedBox(height: S.xl),
          const IntrinsicHeight(
            child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Expanded(child: _Feature(Symbols.bolt, 'Instant save', 'On this phone')),
              SizedBox(width: S.sm),
              Expanded(child: _Feature(Symbols.sync_saved_locally, 'Local review', 'Before any export')),
            ]),
          ),
          const SizedBox(height: S.xl),
          DecoratedBox(
            decoration: const BoxDecoration(boxShadow: shadowSm),
            child: Btn('Get started', kind: BtnKind.navy, style: T.bodyLg.bold, trailing: Symbols.arrow_forward, onTap: status == VaultStatus.checking ? null : start),
          ),
          const SizedBox(height: 6),
          Tap(
            onTap: () => Go.checklistPreview(context),
            label: 'Review Downtime Protocol Checklist',
            expand: true,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Ic(Symbols.help, size: 16, color: C.secondary),
              const SizedBox(width: 6),
              Flexible(child: Text('Review Downtime Protocol Checklist', style: T.labelMd.c(C.secondary), textAlign: TextAlign.center)),
            ]),
          ),
          const SizedBox(height: 34),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rFull),
              child: Wrap(alignment: WrapAlignment.center, crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, children: [
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Dot(storeColor, size: 6),
                  const SizedBox(width: 8),
                  Flexible(child: Text(storeText, style: T.bodySm.tr(-0.025).c(C.onSurfaceVariant))),
                ]),
                Text('•', style: T.bodySm.c(C.outlineVariant)),
                Text('THIS PHONE', style: T.mono(11, line: 14).c(C.onSurfaceVariant)),
                Text('•', style: T.bodySm.c(C.outlineVariant)),
                Text('Practice', style: T.labelSm.c(C.onSurfaceVariant)),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero();
  @override
  Widget build(BuildContext context) {
    Widget glow(Color c) => ImageFiltered(imageFilter: ImageFilter.blur(sigmaX: 40, sigmaY: 40, tileMode: TileMode.decal), child: Container(width: 192, height: 192, decoration: BoxDecoration(color: c, borderRadius: R.rFull)));
    return DecoratedBox(
      decoration: const BoxDecoration(borderRadius: R.rXl, boxShadow: shadowSm, color: C.surfaceLowest),
      child: ClipRRect(
        borderRadius: R.rXl,
        child: Stack(children: [
          Positioned(right: -48, top: -48, child: glow(C.secondaryContainer.withValues(alpha: 0.4))),
          Positioned(left: -48, bottom: -48, child: glow(C.tertiaryFixed.withValues(alpha: 0.3))),
          Padding(
            padding: const EdgeInsets.all(S.md),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 320),
                child: AspectRatio(
                  aspectRatio: 1,
                  child: ClipRRect(borderRadius: R.rLg, child: Image.asset('assets/art/opening.png', fit: BoxFit.contain, semanticLabel: 'Drawing: a nurse with a tablet beside a resting patient')),
                ),
              ),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 12,
            child: Align(
              alignment: Alignment.bottomLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: C.surfaceLow.withValues(alpha: 0.95), borderRadius: R.rBase, boxShadow: shadowSm),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Ic(Symbols.verified, size: 14, color: C.onSecondaryContainer),
                  const SizedBox(width: 6),
                  Flexible(child: Text('Practice · fictional data', style: T.labelSm.semi)),
                ]),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Feature extends StatelessWidget {
  final IconData icon;
  final String title, text;
  const _Feature(this.icon, this.title, this.text);
  @override
  Widget build(BuildContext context) => Box(
        radius: R.lg,
        shadow: true,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase), child: Ic(icon, size: 18, color: C.secondary)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: T.labelMd),
              Text(text, style: T.bodySm.c(C.onSurfaceVariant)),
            ]),
          ),
        ]),
      );
}

/* ------------------------------ Three-tier rail of the PIN screen (also used by the vault screen) ------------------------------ */

class _EntryRail extends StatelessWidget {
  final Color dot;
  final String title, unit, sub, badge, note, noteRight;
  final Widget? right;
  const _EntryRail({required this.dot, required this.title, this.right, required this.unit, required this.sub, required this.badge, required this.note, required this.noteRight});

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(color: C.primaryContainer, boxShadow: shadowSm),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            color: C.primary,
            padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 4),
            child: TwoSides(
              Row(mainAxisSize: MainAxisSize.min, children: [
                Dot(dot),
                const SizedBox(width: 6),
                Flexible(child: Text(title.toUpperCase(), style: T.badge.c(C.secondaryFixed))),
              ]),
              right ?? const SizedBox(height: 16),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: S.sm),
            child: Row(children: [
              Container(width: 28, height: 28, alignment: Alignment.center, decoration: BoxDecoration(color: C.surfaceHigh.withValues(alpha: 0.2), borderRadius: R.rLg), child: const Ic(Symbols.domain, size: 18, color: C.primaryFixed)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(unit, style: T.headlineSm.s(17, 21.25).c(C.surfaceLowest)),
                  Text(sub, style: T.bodySm.c(C.onPrimaryContainer)),
                ]),
              ),
              const SizedBox(width: 8),
              Tag(badge, icon: Symbols.school, bg: C.secondaryFixed.withValues(alpha: 0.2), fg: C.secondaryFixed),
            ]),
          ),
          Container(
            color: C.surfaceLowest,
            padding: const EdgeInsets.fromLTRB(S.xl, 4, S.md, 4),
            child: TwoSides(
              Text(note, style: T.labelSm.semi.c(C.onSurfaceVariant).copyWith(fontFeatures: const [])),
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Ic(Symbols.verified_user, size: 12, color: C.onSurfaceVariant),
                const SizedBox(width: 2),
                Flexible(child: Text(noteRight, style: T.labelSm.c(C.onSurfaceVariant))),
              ]),
            ),
          ),
        ]),
      );
}

/* ------------------------------ Vault ------------------------------ */

class VaultScreen extends StatefulWidget {
  const VaultScreen({super.key});
  @override
  State<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends State<VaultScreen> {
  final _secret = TextEditingController();
  bool _busy = false, _recovery = false, _show = false;
  String? _error;

  @override
  void dispose() {
    _secret.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function(AppState app) work) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await work(AppScope.read(context));
      if (mounted) Go.staff(context);
    } on AppError catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = 'The encrypted store did not answer as expected: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _unlock() {
    final s = _secret.text;
    if (s.trim().isEmpty) {
      setState(() => _error = _recovery ? 'Enter the recovery code.' : 'Enter the passphrase.');
      return;
    }
    _run((a) => _recovery ? a.unlockVault(recovery: s) : a.unlockVault(passphrase: s));
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final status = app.vaultStatus;
    final (icon, title, sub) = switch (status) {
      VaultStatus.checking => (Symbols.hourglass_empty, 'Checking this phone', 'Looking for encrypted records'),
      VaultStatus.none => (Symbols.lock, 'Set up this phone', 'Encrypted Practice store'),
      VaultStatus.locked => (Symbols.lock, 'Records are locked', 'Encrypted Practice store'),
      VaultStatus.unlocked => (Symbols.lock_open_right, 'Records are open', 'Encrypted Practice store'),
      VaultStatus.problem => (Symbols.gpp_maybe, 'Records cannot be opened', 'Tell IT before you do anything else'),
    };
    final bad = status == VaultStatus.problem;

    return PopScope(
      canPop: !_busy, // the check in progress finishes on this page
      child: StatusIcons(
      light: true,
      child: PhonePage(
        statusColor: C.primary,
        header: _EntryRail(
          dot: bad ? C.error : C.tertiaryFixedDim,
          title: 'Practice records',
          right: Text('Fictional patients only', style: T.bodySm.c(C.onPrimaryContainer)),
          unit: 'ClinBridge Practice',
          sub: 'Records on this phone',
          badge: 'PRACTICE',
          note: 'OFFLINE LOCAL STORAGE (AES-256)',
          noteRight: 'On this phone',
        ),
        pad: const EdgeInsets.fromLTRB(S.md, 16, S.md, S.xl),
        children: [
          Box(
            shadow: true,
            child: Row(children: [
              Container(width: 48, height: 48, alignment: Alignment.center, decoration: BoxDecoration(color: bad ? C.error : C.primaryContainer, borderRadius: R.rFull), child: Ic(icon, size: 24, color: bad ? C.onError : C.primaryFixed)),
              const SizedBox(width: S.md),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Semantics(header: true, child: Text(title, style: T.headlineSm)),
                  Text(sub, style: T.bodySm.c(C.onSurfaceVariant)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          ...switch (status) {
            VaultStatus.checking => const [Padding(padding: EdgeInsets.all(S.xl), child: Center(child: SizedBox(width: 32, height: 32, child: CircularProgressIndicator(strokeWidth: 3, color: C.primaryContainer))))],
            VaultStatus.none => _setup(),
            VaultStatus.locked => _locked(),
            VaultStatus.unlocked => [Btn('Choose staff profile', kind: BtnKind.navy, radius: R.lg, style: T.headlineSm, icon: Symbols.badge, busy: _busy, onTap: () => Go.staff(context))],
            VaultStatus.problem => _problem(app),
          },
        ],
      ),
    ),
    );
  }

  List<Widget> _setup() => [
        const _Fact(Symbols.group, 'Fictional patients only. Never type real patient details and never photograph a real form.'),
        const _Fact(Symbols.lock, 'Everything is kept in an encrypted store on this phone. It opens only on this phone, with the passphrase or the recovery code.'),
        const _Fact(Symbols.wifi_off, 'No network is used. Nothing leaves this phone unless a person saves or prints a file.'),
        const SizedBox(height: 4),
        const _PublicSecrets(),
        const SizedBox(height: 16),
        if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 10)],
        Btn(_busy ? 'Creating encrypted store' : 'Create encrypted Practice store', kind: BtnKind.navy, radius: R.lg, style: T.headlineSm, icon: Symbols.enhanced_encryption, busy: _busy, onTap: () => _run((a) => a.createVault())),
        const SizedBox(height: 10),
        const _Note('This makes a new random key and loads the fictional ward. It can take a few seconds.'),
      ];

  List<Widget> _locked() {
    final useText = _recovery ? 'Use practice recovery code' : 'Use practice passphrase';
    final otherText = _recovery ? 'Use the passphrase instead' : 'Use the recovery code instead';
    return [
      Box(
        shadow: true,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(_recovery ? 'Recovery code' : 'Passphrase', style: T.labelMd),
          const SizedBox(height: 8),
          Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.only(left: S.md),
            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
            child: Row(children: [
              const Ic(Symbols.key, size: 20, color: C.outline),
              const SizedBox(width: 10),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: Field(
                    _secret,
                    label: _recovery ? 'Recovery code' : 'Passphrase',
                    hint: _recovery ? 'Enter the recovery code' : 'Enter the passphrase',
                    obscure: !_show && !_recovery,
                    enabled: !_busy,
                    action: TextInputAction.done,
                    onChanged: (_) {
                      if (_error != null) setState(() => _error = null);
                    },
                    onSubmitted: (_) => _unlock(),
                  ),
                ),
              ),
              if (!_recovery) Tap(label: _show ? 'Hide passphrase' : 'Show passphrase', onTap: () => setState(() => _show = !_show), child: Ic(_show ? Symbols.visibility_off : Symbols.visibility, size: 20, color: C.onSurfaceVariant)),
            ]),
          ),
          const SizedBox(height: 4),
          Tap(
            expand: true,
            label: useText,
            onTap: _busy
                ? null
                : () => setState(() {
                      _secret.text = _recovery ? kPracticeRecoveryCode : kPracticePassphrase;
                      _error = null;
                    }),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Ic(Symbols.edit_note, size: 18, color: C.secondary),
              const SizedBox(width: 6),
              Flexible(child: Text(useText, style: T.labelMd.c(C.secondary))),
            ]),
          ),
        ]),
      ),
      const SizedBox(height: 12),
      if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 10)],
      Btn(_busy ? 'Opening records' : 'Unlock records', kind: BtnKind.navy, radius: R.lg, style: T.headlineSm, icon: Symbols.lock_open_right, busy: _busy, onTap: _unlock),
      const SizedBox(height: 4),
      Tap(
        expand: true,
        label: otherText,
        onTap: _busy
            ? null
            : () => setState(() {
                  _recovery = !_recovery;
                  _secret.clear();
                  _error = null;
                }),
        child: Text(otherText, style: T.labelMd.c(C.secondary), textAlign: TextAlign.center),
      ),
      const SizedBox(height: 8),
      const _PublicSecrets(),
      const SizedBox(height: 10),
      const _Note('Locked records stay on this phone, unchanged. After they open, each person signs in with a PIN.'),
    ];
  }

  List<Widget> _problem(AppState app) => [
        ErrorBox(app.vaultProblem ?? 'The encrypted records could not be checked.'),
        const SizedBox(height: 12),
        const _Fact(Symbols.shield, 'This app changed nothing and deleted nothing.'),
        const _Fact(Symbols.description, 'Use the paper downtime form until IT has looked at this phone.'),
        const SizedBox(height: 4),
        Btn('Back to opening page', kind: BtnKind.navy, radius: R.lg, style: T.headlineSm, icon: Symbols.arrow_back, onTap: () => Go.opening(context)),
      ];
}

class _Fact extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Fact(this.icon, this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: S.sm),
        child: Box(
          radius: R.lg,
          shadow: true,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rBase), child: Ic(icon, size: 18, color: C.secondary)),
            const SizedBox(width: 10),
            Expanded(child: Padding(padding: const EdgeInsets.only(top: 6), child: Text(text, style: T.bodyMd))),
          ]),
        ),
      );
}

/// The practice secrets are public on purpose (config/policy.dart).
class _PublicSecrets extends StatelessWidget {
  const _PublicSecrets();
  @override
  Widget build(BuildContext context) => Box(
        color: C.surfaceLow,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('PUBLIC PRACTICE PASSPHRASE', style: T.labelSm.tr(0.05).c(C.outline)),
          const SizedBox(height: 2),
          Text(kPracticePassphrase, style: T.mono(14, w: FontWeight.w700, line: 20)),
          const SizedBox(height: 8),
          Text('PUBLIC PRACTICE RECOVERY CODE', style: T.labelSm.tr(0.05).c(C.outline)),
          const SizedBox(height: 2),
          Text(kPracticeRecoveryCode, style: T.mono(12, w: FontWeight.w700, line: 18)),
          const SizedBox(height: 8),
          Text('These are the same for everyone. They protect fake data only and give no secrecy.', style: T.bodySm.c(C.onSurfaceVariant)),
        ]),
      );
}

class _Note extends StatelessWidget {
  final String text;
  const _Note(this.text);
  @override
  Widget build(BuildContext context) => Box(
        color: C.surfaceContainer,
        radius: R.lg,
        pad: const EdgeInsets.all(10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Padding(padding: EdgeInsets.only(top: 2), child: Ic(Symbols.lock, size: 16)),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: T.bodySm.s(12, 19.5).c(C.onSurfaceVariant))),
        ]),
      );
}

/* ------------------------------ Select staff ------------------------------ */

class SelectStaffScreen extends StatefulWidget {
  const SelectStaffScreen({super.key});
  @override
  State<SelectStaffScreen> createState() => _SelectStaffScreenState();
}

class _SelectStaffScreenState extends State<SelectStaffScreen> {
  final _search = TextEditingController();
  final _focus = FocusNode();
  String? _picked;

  @override
  void dispose() {
    _search.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// Time of the last sign-in kept in the change log of this phone.
  static Map<String, String> _lastSignIn(Store s) => {for (final a in s.where('audit_log', 'action', 'staff_signed_in')) (a['entity'] as String).replaceFirst('practitioner/', ''): a['time'] as String};

  void _continue(String id) {
    final app = AppScope.read(context);
    if (app.user == null || app.user!.id == id) return Go.pin(context, id);
    // A locked person is replaced: sign that person out first. The app then shows this list again; the PIN page goes on top of it.
    final nav = Navigator.of(context, rootNavigator: true);
    app.signOut();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (nav.mounted) Go.pin(nav.context, id);
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.unlocked) return const ColoredBox(color: C.surface);
    final staff = [for (final r in app.store.all('practitioner')) Practitioner(r)].where((p) => p.active).toList();
    final last = _lastSignIn(app.store);
    final q = _search.text.trim().toLowerCase();
    final list = [for (final p in staff) if (q.isEmpty || '${p.title} ${p.role} ${roleWords(p)}'.toLowerCase().contains(q)) p];
    final picked = staff.where((p) => p.id == _picked).firstOrNull;
    final ev = app.downtime;
    final ehr = switch (app.phase) { Phase.down => 'EHR Offline ${elapsedHm(ev!.declaredAt, app.nowIso)}', Phase.online => 'Since down ${elapsedHm(ev!.declaredAt, app.nowIso)}', Phase.ready => 'EHR normal' };
    final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;

    return StatusIcons(
      light: true,
      child: PhonePage(
        statusColor: C.primary,
        header: Container(
          decoration: const BoxDecoration(color: C.primary, boxShadow: shadowSm),
          padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: S.sm),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Ic(app.phase == Phase.ready ? Symbols.cloud : Symbols.cloud_off, size: 17, color: C.tertiaryFixed),
              const SizedBox(width: 4),
              Expanded(child: Text(app.unit, style: T.headlineSm.tr(-0.025).c(C.surface))),
              const SizedBox(width: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: const BoxDecoration(color: C.tertiaryFixed, borderRadius: R.rFull, boxShadow: shadowSm),
                child: Row(mainAxisSize: MainAxisSize.min, children: [const Dot(C.onTertiaryFixed, size: 6), const SizedBox(width: 4), Text('PRACTICE DRILL', style: T.badge.c(C.onTertiaryFixed))]),
              ),
            ]),
            const SizedBox(height: 6),
            TwoSides(
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Ic(Symbols.lock_open_right, size: 15, color: C.tertiaryFixedDim),
                const SizedBox(width: 6),
                Flexible(child: Text('Vault: Unlocked (Local Encrypted)', style: T.labelSm.c(C.tertiaryFixedDim))),
              ]),
              Text(ehr, style: T.bodySm.c(C.onPrimaryContainer.withValues(alpha: 0.9))),
            ),
          ]),
        ),
        pad: const EdgeInsets.fromLTRB(16, S.md, 16, S.xl),
        footer: Container(
          decoration: const BoxDecoration(color: C.surfaceLowest, boxShadow: [BoxShadow(color: Color(0x1A000000), offset: Offset(0, 20), blurRadius: 25, spreadRadius: -5), BoxShadow(color: Color(0x1A000000), offset: Offset(0, 8), blurRadius: 10, spreadRadius: -6)]),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: S.md),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            DecoratedBox(
              decoration: BoxDecoration(borderRadius: R.rLg, boxShadow: picked == null ? null : shadowMd),
              child: Btn(picked == null ? 'Select your name to continue' : 'Continue with ${picked.title}', icon: Symbols.how_to_reg, radius: R.lg, style: T.headlineSm, onTap: picked == null ? null : () => _continue(picked.id)),
            ),
            if (!keyboard) ...[
              const SizedBox(height: S.sm),
              Unavailable(
                reason: 'Hardware keys are not supported. Choose your name and use your PIN.',
                child: SizedBox(
                  height: 48,
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    const Ic(Symbols.key, size: 18, color: C.secondary),
                    const SizedBox(width: 6),
                    Flexible(child: Text('Unlock vault with hardware key', style: T.labelMd.c(C.secondary), maxLines: 2, overflow: TextOverflow.ellipsis)),
                  ]),
                ),
              ),
            ],
          ]),
        ),
        children: [
          TwoSides(
            Semantics(header: true, child: Text('Staff Identity', style: T.headlineMd)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: const BoxDecoration(color: C.surfaceHigh, borderRadius: R.rFull),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Ic(Symbols.schedule, size: 14, color: C.secondary),
                const SizedBox(width: 4),
                Text(shiftOf(app.nowIso).$1.startsWith('Day') ? 'Day Shift' : 'Night Shift', style: T.labelSm.c(C.secondary)),
              ]),
            ),
          ),
          const SizedBox(height: 4),
          Text('Select your staff profile, then sign in with your PIN to open the fictional bedside records.', style: T.bodyMd.c(C.onSurfaceVariant)),
          const SizedBox(height: S.lg),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _focus.requestFocus,
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              padding: const EdgeInsets.only(left: S.md),
              decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowSm),
              child: Row(children: [
                const Ic(Symbols.badge, size: 20, color: C.outline),
                const SizedBox(width: 12),
                Expanded(child: Field(_search, focus: _focus, label: 'Search staff by name or role', hint: 'Search staff by name or role...', action: TextInputAction.search, onChanged: (_) => setState(() {}))),
                if (q.isEmpty)
                  const SizedBox(width: S.md)
                else
                  Tap(
                    label: 'Clear filter',
                    onTap: () {
                      _search.clear();
                      setState(() {});
                      _focus.requestFocus();
                    },
                    child: const Ic(Symbols.cancel, size: 18, color: C.outline),
                  ),
              ]),
            ),
          ),
          const SizedBox(height: S.lg),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: S.sm),
            decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
            child: TwoSides(
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Ic(Symbols.verified_user, size: 18, color: C.secondary),
                const SizedBox(width: 8),
                Flexible(child: Text('Practice Unit Roster', style: T.labelMd)),
              ]),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: const BoxDecoration(color: C.surfaceHighest, borderRadius: R.rFull), child: Text('${staff.length} Active', style: T.labelSm.c(C.onSurfaceVariant))),
            ),
          ),
          const SizedBox(height: S.lg),
          if (list.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: S.xl),
              decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rXl),
              child: Column(children: [
                const Ic(Symbols.person_search, size: 40, color: C.outline),
                const SizedBox(height: 8),
                Text('No clinicians matched', style: T.headlineSm, textAlign: TextAlign.center),
                const SizedBox(height: 4),
                Text('Check the spelling, or clear the search. Switched-off accounts are not listed.', style: T.bodySm.c(C.onSurfaceVariant), textAlign: TextAlign.center),
              ]),
            )
          else
            for (var i = 0; i < list.length; i++) ...[
              if (i > 0) const SizedBox(height: S.sm),
              _StaffCard(list[i], selected: list[i].id == _picked, lastSignIn: last[list[i].id], nowIso: app.nowIso, onTap: () => setState(() => _picked = list[i].id)),
            ],
          const SizedBox(height: 20),
          Box(
            color: C.surfaceLow,
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(padding: const EdgeInsets.all(8), decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg, boxShadow: shadowSm), child: const Ic(Symbols.medical_services, size: 20, color: C.secondary)),
              const SizedBox(width: S.md),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Downtime Shift Assignment', style: T.labelMd),
                  const SizedBox(height: 2),
                  Text('Records you save after signing in carry this name and the time. They stay on this phone until an admin saves an export file.', style: T.bodySm.s(12, 19.5).c(C.onSurfaceVariant)),
                ]),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _StaffCard extends StatelessWidget {
  final Practitioner p;
  final bool selected;
  final String? lastSignIn;
  final String nowIso;
  final VoidCallback onTap;
  const _StaffCard(this.p, {required this.selected, required this.lastSignIn, required this.nowIso, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = lastSignIn;
    final status = t == null ? 'Not signed in on this phone' : 'Signed in ${hm(t)}${t.substring(0, 10) == nowIso.substring(0, 10) ? '' : ', ${dayLabel(t)}'}';
    return Tap(
      onTap: onTap,
      selected: selected,
      label: '${p.title}, ${roleWords(p)}. $status',
      expand: true,
      child: Container(
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 68),
        padding: const EdgeInsets.all(S.md),
        decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rXl, boxShadow: shadowSm),
        child: Row(children: [
          SizedBox(
            width: 44,
            height: 44,
            child: Stack(children: [
              Container(alignment: Alignment.center, decoration: BoxDecoration(color: selected ? C.primaryContainer : C.surfaceHigh, borderRadius: R.rFull, boxShadow: selected ? shadowSm : null), child: Text(p.initials, textScaler: TextScaler.noScaling, style: T.headlineSm.tr(-0.025).c(selected ? C.onPrimary : C.onSurfaceVariant))),
              Positioned(right: 0, bottom: 0, child: Container(width: 12, height: 12, decoration: BoxDecoration(color: t == null ? C.outline : C.tertiaryFixed, shape: BoxShape.circle, border: Border.all(color: C.surfaceLowest, width: 2)))),
            ]),
          ),
          const SizedBox(width: S.md),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.title, style: T.headlineSm),
              const SizedBox(height: 2),
              Wrap(spacing: 8, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Tag(p.isAdmin ? 'Admin' : 'Nurse', bg: selected ? C.primary : C.surfaceHighest, fg: selected ? C.onPrimary : C.onSurfaceVariant),
                Row(mainAxisSize: MainAxisSize.min, children: [
                  Dot(t == null ? C.outline : C.secondary, size: 6),
                  const SizedBox(width: 4),
                  Flexible(child: Text(status, style: T.bodySm.c(C.onSurfaceVariant))),
                ]),
              ]),
            ]),
          ),
          const SizedBox(width: 8),
          Container(width: 28, height: 28, alignment: Alignment.center, decoration: BoxDecoration(color: selected ? C.primary : C.surfaceHigh, borderRadius: R.rFull, boxShadow: selected ? shadowSm : null), child: selected ? const Ic(Symbols.check, size: 18, color: C.onPrimary) : null),
        ]),
      ),
    );
  }
}

/* ------------------------------ PIN (sign-in and lock screen) ------------------------------ */

class PinScreen extends StatefulWidget {
  final String staffId;
  const PinScreen({super.key, required this.staffId});
  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> {
  String _pin = '';
  bool _busy = false;
  String? _error;
  Timer? _countdown;

  @override
  void dispose() {
    _countdown?.cancel();
    super.dispose();
  }

  /// While locked out the page is written again every second until the wait is over.
  void _watchLockout(Duration left) {
    if (left <= Duration.zero) {
      _countdown?.cancel();
      _countdown = null;
      return;
    }
    _countdown ??= Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        final a = AppScope.read(context);
        if (!a.unlocked || a.pinLockedFor(widget.staffId) <= Duration.zero) _error = null;
      });
    });
  }

  void _digit(String d) {
    if (_pin.length >= 4) return;
    setState(() {
      _pin += d;
      _error = null;
    });
  }

  Future<void> _submit() async {
    if (_busy || _pin.length != 4) return;
    final app = AppScope.read(context);
    setState(() => _busy = true);
    try {
      final r = await app.signIn(widget.staffId, _pin);
      if (!mounted) return;
      if (r.ok) return Go.home(context);
      setState(() {
        _pin = '';
        _error = r.error ?? 'Sign-in was not possible.';
      });
    } on AppError catch (e) {
      if (mounted) {
        setState(() {
          _pin = '';
          _error = e.message;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.unlocked) return const ColoredBox(color: C.surface);
    final row = app.store.get('practitioner', widget.staffId);
    final p = row == null ? null : Practitioner(row);
    final ev = app.downtime;
    final lockout = app.pinLockedFor(widget.staffId);
    _watchLockout(lockout);
    final out = lockout > Duration.zero;
    final off = p == null || !p.active;
    final mine = app.locked && app.user?.id == widget.staffId;
    final wrong = _error != null && !out;
    final open = !out && !off && !_busy;

    final (bg, fg, icon, iconColor, text) = out
        ? (C.secondaryFixed, C.onSecondaryFixed, Symbols.lock_clock, C.onSecondaryFixed, 'Too many wrong tries. Locked for ${_mmss(lockout)}')
        : off
            ? (C.errorContainer, C.onErrorContainer, Symbols.person_off, C.error, 'This account is switched off.')
            : wrong
                ? (C.errorContainer, C.onErrorContainer, Symbols.error, C.error, _error!)
                : _pin.length == 4
                    ? (C.tertiaryFixed.withValues(alpha: 0.3), C.onTertiaryFixedVariant, Symbols.check_circle, C.onTertiaryFixedVariant, 'PIN complete • Ready to sign in')
                    : mine && _pin.isEmpty
                        ? (C.surfaceLow, C.onSurfaceVariant, Symbols.phonelink_lock, C.secondary, app.lockReason == 'idle' ? 'Locked: nobody used it' : 'Locked by you')
                        : (C.surfaceLow, C.onSurfaceVariant, Symbols.dialpad, C.secondary, 'Enter digit ${_pin.length + 1} of 4');

    return StatusIcons(
      light: true,
      child: PhonePage(
        statusColor: C.primary,
        header: _EntryRail(
          dot: app.phase == Phase.down ? C.error : C.tertiaryFixedDim,
          title: phaseRail(app.phase),
          right: ev == null
              ? null
              : Row(mainAxisSize: MainAxisSize.min, children: [
                  const Ic(Symbols.timer, size: 14, color: C.onPrimaryContainer),
                  const SizedBox(width: 4),
                  Flexible(child: Ticking(() => !app.unlocked ? '' : app.phase == Phase.down ? '${elapsedHms(ev.declaredAt, app.nowIso)} offline' : 'since down ${elapsedHms(ev.declaredAt, app.nowIso)}', style: T.bodySm.c(C.onPrimaryContainer))),
                ]),
          unit: app.unit,
          sub: 'Practice phone • Works offline',
          badge: 'PRACTICE DRILL',
          note: 'OFFLINE LOCAL STORAGE ACTIVE (AES-256)',
          noteRight: 'On this phone',
        ),
        pad: const EdgeInsets.fromLTRB(S.md, 16, S.md, S.xl),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 396),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Box(
                  shadow: true,
                  child: Row(children: [
                    SizedBox(
                      width: 48,
                      height: 48,
                      child: Stack(children: [
                        Container(alignment: Alignment.center, decoration: const BoxDecoration(color: C.primaryContainer, borderRadius: R.rFull), child: Text(p?.initials ?? '?', textScaler: TextScaler.noScaling, style: T.headlineSm.tr(0.025).c(C.primaryFixed))),
                        if (!off) const Positioned(right: 1, bottom: 1, child: Ic(Symbols.check, size: 10, color: C.onTertiary)),
                      ]),
                    ),
                    const SizedBox(width: S.md),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                          Text(p?.title ?? 'Unknown person', style: T.headlineSm),
                          if (p != null) Tag(p.roleLabel, bg: C.surfaceContainer, fg: C.onSurfaceVariant, style: T.labelSm, pad: const EdgeInsets.symmetric(horizontal: 6, vertical: 2)),
                        ]),
                        if (p != null) Text('${unitShort(app.unit)} ${roleWords(p)}', style: T.bodySm.c(C.onSurfaceVariant)),
                      ]),
                    ),
                    const SizedBox(width: 8),
                    Tap(
                      label: 'Switch to another person',
                      onTap: _busy ? null : () => Go.staff(context),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: const BoxDecoration(color: C.surfaceLow, borderRadius: R.rLg),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [Text('Switch', style: T.labelMd.c(C.secondary)), const SizedBox(width: 4), const Ic(Symbols.swap_horiz, size: 16, color: C.secondary)]),
                      ),
                    ),
                  ]),
                ),
                const SizedBox(height: 24),
                Semantics(header: true, child: Text('Enter 4-digit staff PIN', style: T.headlineSm.tr(-0.025).copyWith(fontFeatures: const []), textAlign: TextAlign.center)),
                const SizedBox(height: 2),
                Text('Your PIN is checked on this phone only', style: T.bodySm.c(C.onSurfaceVariant), textAlign: TextAlign.center),
                const SizedBox(height: 20),
                SizedBox(height: 32, child: Center(child: _Dots(_pin.length, color: out || off ? C.outline : wrong ? C.error : null))),
                const SizedBox(height: 20),
                Center(
                  child: Semantics(
                    liveRegion: true,
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 28),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                      decoration: BoxDecoration(color: bg, borderRadius: R.rFull),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Ic(icon, size: 14, color: iconColor),
                        const SizedBox(width: 4),
                        Flexible(child: Text(text, style: T.labelSm.c(fg))),
                      ]),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 340), child: _keypad(open))),
                const SizedBox(height: 16),
                // Place of the export's simulation panel: the public practice PIN (as on the web sign-in page).
                Box(
                  color: C.surfaceLow,
                  pad: const EdgeInsets.all(8),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    TwoSides(Text('PRACTICE SIGN-IN', style: T.labelSm.tr(0.05).c(C.outline)), Text('Fictional staff only', style: T.labelSm.c(C.onSurfaceVariant))),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      decoration: const BoxDecoration(color: C.surfaceLowest, borderRadius: R.rLg),
                      child: Text('Practice PIN for every person: $kPracticePin', style: T.labelSm, textAlign: TextAlign.center),
                    ),
                  ]),
                ),
                const SizedBox(height: 12),
                DecoratedBox(
                  decoration: BoxDecoration(borderRadius: R.rLg, boxShadow: open && _pin.length == 4 ? shadowMd : null),
                  child: Btn(_busy ? 'Checking PIN' : 'Sign in to ${unitShort(app.unit)}', icon: Symbols.login, kind: BtnKind.navy, radius: R.lg, style: T.headlineSm, busy: _busy, onTap: open && _pin.length == 4 ? _submit : null),
                ),
                const SizedBox(height: 10),
                const _Note('Patient records stay encrypted on this phone. Nothing is sent. An admin can save an export file after the downtime.'),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  static String _mmss(Duration d) {
    final s = (d.inMilliseconds / 1000).ceil();
    return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
  }

  static const _letters = ['+', ' ', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ'];

  Widget _keypad(bool open) {
    Widget key({required String label, required Widget child, required VoidCallback onTap, bool quiet = false}) => Expanded(
          child: Opacity(
            opacity: open ? 1 : 0.5,
            child: Tap(
              label: label,
              expand: true,
              onTap: open ? onTap : null,
              child: Container(
                width: double.infinity,
                constraints: const BoxConstraints(minHeight: 56),
                decoration: BoxDecoration(color: quiet ? C.surfaceLow : C.surfaceLowest, borderRadius: R.rXl, boxShadow: quiet ? null : shadowSm),
                child: Center(heightFactor: 1, child: child),
              ),
            ),
          ),
        );
    Widget digit(int n) => key(
          label: '$n',
          onTap: () => _digit('$n'),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('$n', style: T.vital.s(22, 22)),
            const SizedBox(height: 2),
            Text(_letters[n], style: T.labelSm.s(10, 10).tr(0.05).c(C.outline)),
          ]),
        );
    Widget row(List<Widget> k) => Row(children: [k[0], const SizedBox(width: 10), k[1], const SizedBox(width: 10), k[2]]);
    return Column(children: [
      row([digit(1), digit(2), digit(3)]),
      const SizedBox(height: 10),
      row([digit(4), digit(5), digit(6)]),
      const SizedBox(height: 10),
      row([digit(7), digit(8), digit(9)]),
      const SizedBox(height: 10),
      row([
        key(label: 'Clear', quiet: true, onTap: () => setState(() => _pin = ''), child: Text('CLEAR', style: T.labelMd.c(C.onSurfaceVariant))),
        digit(0),
        key(label: 'Delete last digit', quiet: true, onTap: () => setState(() => _pin = _pin.isEmpty ? '' : _pin.substring(0, _pin.length - 1)), child: const Ic(Symbols.backspace, size: 24, color: C.onSurfaceVariant)),
      ]),
    ]);
  }
}

/// Masked dots; the next one shows its small marker as in the export. [color]: all dots in one state colour.
class _Dots extends StatelessWidget {
  final int filled;
  final Color? color;
  const _Dots(this.filled, {this.color});
  @override
  Widget build(BuildContext context) => Semantics(
        label: '$filled of 4 digits entered',
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          for (var i = 0; i < 4; i++)
            Padding(
              padding: EdgeInsets.only(left: i == 0 ? 0 : 16),
              child: Container(
                width: 16,
                height: 16,
                alignment: Alignment.center,
                decoration: BoxDecoration(shape: BoxShape.circle, color: color ?? (i < filled ? C.primaryContainer : C.surfaceHighest), boxShadow: color == null && i < filled ? shadowSm : null),
                child: color == null && i == filled ? const Dot(C.secondary, size: 10) : null,
              ),
            ),
        ]),
      );
}
