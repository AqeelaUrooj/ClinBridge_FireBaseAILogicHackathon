import 'package:flutter/material.dart';

import '../state/app_state.dart';
import 'kit/kit.dart';
import 'router.dart';
import 'screens/entry_screens.dart';

/// The whole app around one [AppState].
class ClinBridgeApp extends StatefulWidget {
  final AppState state;

  /// Tests and pictures: first page instead of the opening screen.
  final Widget? home;
  const ClinBridgeApp({super.key, required this.state, this.home});
  @override
  State<ClinBridgeApp> createState() => _ClinBridgeAppState();
}

class _ClinBridgeAppState extends State<ClinBridgeApp> {
  final nav = GlobalKey<NavigatorState>();
  bool _wasUnlocked = false, _locked = false;
  String? _user;

  @override
  void initState() {
    super.initState();
    _wasUnlocked = widget.state.unlocked;
    _user = widget.state.user?.id;
    _locked = widget.state.locked;
    widget.state.addListener(_onState);
    onTyping = widget.state.touch;
  }

  @override
  void dispose() {
    widget.state.removeListener(_onState);
    super.dispose();
  }

  /// Lock, sign-out, account change and vault lock clear the pages that belonged to the earlier state.
  void _onState() {
    final a = widget.state;
    final c = nav.currentContext;
    final unlocked = a.unlocked, user = a.user?.id, locked = a.locked;
    final changed = unlocked != _wasUnlocked || user != _user || locked != _locked;
    final vaultClosed = _wasUnlocked && !unlocked;
    final left = _user != null && user == null;
    final lockedNow = locked && !_locked;
    _wasUnlocked = unlocked;
    _user = user;
    _locked = locked;
    if (!changed || c == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!c.mounted) return;
      if (vaultClosed) {
        Go.opening(c);
      } else if (lockedNow && a.user != null) {
        Go.staff(c);
        Go.pin(c, a.user!.id);
      } else if (left) {
        Go.staff(c);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.state;
    return AppScope(
      state: a,
      child: Listener(
        behavior: HitTestBehavior.translucent,
        onPointerDown: (_) => a.touch(),
        child: MaterialApp(
          navigatorKey: nav,
          debugShowCheckedModeBanner: false,
          title: 'ClinBridge Practice',
          theme: ThemeData(
            useMaterial3: true,
            fontFamily: 'Inter',
            scaffoldBackgroundColor: C.surface,
            splashFactory: NoSplash.splashFactory,
            colorScheme: const ColorScheme.light(primary: C.primary, surface: C.surface, error: C.error),
          ),
          builder: (c, child) => Stack(children: [
            child!,
            const ToastHost(),
            // Recent-apps picture and short interruptions: cover everything.
            ListenableBuilder(listenable: a, builder: (_, __) => a.covered ? const Positioned.fill(child: _Cover()) : const SizedBox()),
          ]),
          home: widget.home ?? const OpeningScreen(),
        ),
      ),
    );
  }
}

class _Cover extends StatelessWidget {
  const _Cover();
  @override
  Widget build(BuildContext context) => ColoredBox(
        color: C.primaryContainer,
        child: Center(child: Text('ClinBridge Practice', style: T.headlineMd.c(C.onPrimary))),
      );
}
