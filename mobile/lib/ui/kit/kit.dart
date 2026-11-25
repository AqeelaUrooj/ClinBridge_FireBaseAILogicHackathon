import 'dart:async';

import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';

import 'tokens.dart';

export 'package:material_symbols_icons/symbols.dart' show Symbols;
export 'tokens.dart';

/// Material Symbols Outlined, bundled. [fill] 1 = filled (font-variation-settings 'FILL' 1).
class Ic extends StatelessWidget {
  final IconData icon;
  final double size;
  final Color? color;
  final double fill;
  const Ic(this.icon, {super.key, this.size = 20, this.color, this.fill = 0});
  @override
  Widget build(BuildContext context) => ExcludeSemantics(child: Icon(icon, size: size, color: color ?? C.onSurface, fill: fill, weight: 400, opticalSize: 24, grade: 0));
}

class Dot extends StatelessWidget {
  final Color color;
  final double size;
  const Dot(this.color, {super.key, this.size = 8});
  @override
  Widget build(BuildContext context) => Container(width: size, height: size, decoration: BoxDecoration(color: color, shape: BoxShape.circle));
}

/// Non-interactive status badge. Text is shown as given.
class Tag extends StatelessWidget {
  final String text;
  final Color bg, fg;
  final IconData? icon;
  final TextStyle? style;
  final EdgeInsets pad;
  final double radius;
  final Color? dot;
  const Tag(this.text, {super.key, this.bg = C.surfaceHigh, this.fg = C.onSurfaceVariant, this.icon, this.style, this.pad = const EdgeInsets.symmetric(horizontal: 8, vertical: 2), this.radius = R.base, this.dot});
  @override
  Widget build(BuildContext context) {
    final st = (style ?? T.badge).c(fg);
    return Container(
      padding: pad,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(radius)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Ic(icon!, size: (st.fontSize ?? 11) + 2, color: fg), const SizedBox(width: 4)],
        if (dot != null) ...[Dot(dot!, size: 6), const SizedBox(width: 6)],
        Flexible(child: Text(text, style: st)),
      ]),
    );
  }
}

/// Coloured box with the exports' radii and shadow.
class Box extends StatelessWidget {
  final Widget child;
  final Color color;
  final EdgeInsets pad;
  final double radius;
  final bool shadow;
  final BoxBorder? border;
  final Gradient? gradient;
  final double? width, height;
  const Box({super.key, required this.child, this.color = C.surfaceLowest, this.pad = const EdgeInsets.all(S.md), this.radius = R.xl, this.shadow = false, this.border, this.gradient, this.width, this.height});
  @override
  Widget build(BuildContext context) => Container(
        width: width,
        height: height,
        padding: pad,
        decoration: BoxDecoration(color: gradient == null ? color : null, gradient: gradient, borderRadius: BorderRadius.circular(radius), boxShadow: shadow ? shadowSm : null, border: border),
        child: child,
      );
}

/// Anything tappable: at least 48 × 48 dp to touch, whatever it looks like. Disabled when [onTap] is null.
class Tap extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final String? label;
  final bool? selected, toggled;
  final bool expand;
  final bool button;
  const Tap({super.key, required this.child, required this.onTap, this.label, this.selected, this.toggled, this.expand = false, this.button = true});
  @override
  Widget build(BuildContext context) => Semantics(
        button: button,
        enabled: onTap != null,
        label: label,
        selected: selected,
        toggled: toggled,
        excludeSemantics: label != null,
        onTap: label != null ? onTap : null,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: ConstrainedBox(constraints: BoxConstraints(minWidth: 48, minHeight: 48, maxWidth: expand ? double.infinity : double.infinity), child: Center(widthFactor: expand ? null : 1, heightFactor: 1, child: child)),
        ),
      );
}

enum BtnKind { primary, navy, quiet, danger, dangerQuiet, white }

/// Full-width action button of the exports (48 dp high by default).
class Btn extends StatelessWidget {
  final String text;
  final VoidCallback? onTap;
  final IconData? icon, trailing;
  final BtnKind kind;
  final double height, radius;
  final TextStyle? style;
  final bool busy;
  final double iconSize;
  final Color? bg, fg, iconColor;
  final double iconFill;

  /// Shown under a disabled button: why it can not be used.
  final String? reason;
  const Btn(this.text, {super.key, required this.onTap, this.icon, this.trailing, this.kind = BtnKind.primary, this.height = 48, this.radius = R.base, this.style, this.busy = false, this.iconSize = 20, this.bg, this.fg, this.iconColor, this.iconFill = 0, this.reason});

  @override
  Widget build(BuildContext context) {
    final (b, f) = switch (kind) {
      BtnKind.primary => (C.primary, C.onPrimary),
      BtnKind.navy => (C.primaryContainer, C.onPrimary),
      BtnKind.quiet => (C.surfaceHigh, C.onSurface),
      BtnKind.danger => (C.error, C.onError),
      BtnKind.dangerQuiet => (C.errorContainer, C.error),
      BtnKind.white => (C.surfaceLowest, C.onSurface),
    };
    final on = onTap != null && !busy;
    final fgc = fg ?? f;
    final st = (style ?? T.labelMd).c(fgc);
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Semantics(
        button: true,
        enabled: on,
        label: text,
        excludeSemantics: true,
        onTap: on ? onTap : null,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: on ? onTap : null,
          child: Opacity(
            opacity: on ? 1 : 0.5,
            child: Container(
              constraints: BoxConstraints(minHeight: height < 48 ? 48 : height),
              alignment: Alignment.center,
              child: Container(
                constraints: BoxConstraints(minHeight: height),
                padding: const EdgeInsets.symmetric(horizontal: S.md, vertical: 4),
                decoration: BoxDecoration(color: bg ?? b, borderRadius: BorderRadius.circular(radius)),
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  if (busy) SizedBox(width: iconSize, height: iconSize, child: CircularProgressIndicator(strokeWidth: 2, color: fgc)) else if (icon != null) Ic(icon!, size: iconSize, color: iconColor ?? fgc, fill: iconFill),
                  if (busy || icon != null) const SizedBox(width: 8),
                  Flexible(child: Text(text, style: st, textAlign: TextAlign.center)),
                  if (trailing != null) ...[const SizedBox(width: 8), Ic(trailing!, size: iconSize, color: iconColor ?? fgc)],
                ]),
              ),
            ),
          ),
        ),
      ),
      if (onTap == null && !busy && reason != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(reason!, style: T.labelSm.c(C.onSurfaceVariant), textAlign: TextAlign.center)),
    ]);
  }
}

/// A control the design has but this app does not support: same place and look, dimmed, says why when touched.
class Unavailable extends StatelessWidget {
  final Widget child;
  final String reason;
  const Unavailable({super.key, required this.child, required this.reason});
  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        enabled: false,
        label: 'Not available: $reason',
        excludeSemantics: true,
        child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: () => toast(context, reason, icon: Symbols.info), child: Opacity(opacity: 0.6, child: IgnorePointer(child: child))),
      );
}

class ToastMessage {
  final String text;
  final IconData icon;
  final bool error;
  ToastMessage(this.text, this.icon, this.error);
}

/// The message on show now (drawn by [ToastHost] above every page).
final ValueNotifier<ToastMessage?> currentToast = ValueNotifier(null);

/// Says what really happened. Only call it after the action returned. It never takes a touch from what is under it.
void toast(BuildContext context, String text, {IconData icon = Symbols.check_circle, bool error = false}) => currentToast.value = ToastMessage(text, icon, error);

class ToastHost extends StatefulWidget {
  const ToastHost({super.key});
  @override
  State<ToastHost> createState() => _ToastHostState();
}

class _ToastHostState extends State<ToastHost> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    currentToast.value = null;
    currentToast.addListener(_changed);
  }

  void _changed() {
    _timer?.cancel();
    final m = currentToast.value;
    if (m != null) _timer = Timer(Duration(seconds: m.error ? 8 : 4), () => currentToast.value = null);
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    currentToast.removeListener(_changed);
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = currentToast.value;
    if (m == null) return const SizedBox();
    return Positioned(
      left: S.md,
      right: S.md,
      bottom: 84 + MediaQuery.paddingOf(context).bottom, // above pinned buttons and the bottom bar
      child: IgnorePointer(
        child: Semantics(
          liveRegion: true,
          child: Container(
            padding: const EdgeInsets.all(S.md),
            decoration: BoxDecoration(color: m.error ? C.onErrorContainer : C.primaryContainer, borderRadius: R.rXl, boxShadow: shadowMd),
            child: Row(children: [Ic(m.icon, size: 20, color: m.error ? C.errorContainer : C.tertiaryFixed), const SizedBox(width: 8), Expanded(child: Text(m.text, style: T.bodyMd.c(C.onPrimary)))]),
          ),
        ),
      ),
    );
  }
}

/// Yes/no question. True only for the confirm button.
Future<bool> confirm(BuildContext context, {required String title, required String text, required String yes, String no = 'Cancel', bool danger = false}) async =>
    await showDialog<bool>(
      context: context,
      barrierColor: C.primaryContainer.withValues(alpha: 0.4),
      builder: (c) => Dialog(
        backgroundColor: C.surfaceLowest,
        shape: const RoundedRectangleBorder(borderRadius: R.rXl),
        insetPadding: const EdgeInsets.all(S.lg),
        child: Padding(
          padding: const EdgeInsets.all(S.lg),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(title, style: T.headlineSm),
            const SizedBox(height: S.sm),
            Flexible(child: SingleChildScrollView(child: Text(text, style: T.bodyMd.c(C.onSurfaceVariant)))),
            const SizedBox(height: S.lg),
            Btn(yes, kind: danger ? BtnKind.danger : BtnKind.primary, onTap: () => Navigator.pop(c, true)),
            const SizedBox(height: S.sm),
            Btn(no, kind: BtnKind.quiet, onTap: () => Navigator.pop(c, false)),
          ]),
        ),
      ),
    ) ??
    false;

/// Called on every typed character (the soft keyboard is outside the app's touch area). Set by the app.
void Function()? onTyping;

/// Only Paste, Select all and Delete: record text does not go to the clipboard or to other apps.
Widget safeTextMenu(BuildContext c, EditableTextState s) => AdaptiveTextSelectionToolbar.buttonItems(
      anchors: s.contextMenuAnchors,
      buttonItems: [for (final b in s.contextMenuButtonItems) if (b.type == ContextMenuButtonType.paste || b.type == ContextMenuButtonType.selectAll || b.type == ContextMenuButtonType.delete) b],
    );

/// Text input in the exports' look (no Material decoration of its own).
class Field extends StatelessWidget {
  final TextEditingController controller;
  final TextStyle? style;
  final String? hint, label;
  final TextInputType? keyboard;
  final int? maxLines, minLines, maxLength;
  final bool obscure, enabled, autofocus;
  final ValueChanged<String>? onChanged, onSubmitted;
  final FocusNode? focus;
  final TextAlign align;
  final TextInputAction? action;
  const Field(this.controller, {super.key, this.style, this.hint, this.label, this.keyboard, this.maxLines = 1, this.minLines, this.maxLength, this.obscure = false, this.enabled = true, this.autofocus = false, this.onChanged, this.onSubmitted, this.focus, this.align = TextAlign.start, this.action});
  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        child: TextField(
          controller: controller,
          focusNode: focus,
          enabled: enabled,
          autofocus: autofocus,
          style: style ?? T.bodyMd,
          keyboardType: keyboard,
          textInputAction: action,
          maxLines: maxLines,
          minLines: minLines,
          maxLength: maxLength,
          obscureText: obscure,
          textAlign: align,
          onChanged: (v) {
            onTyping?.call();
            onChanged?.call(v);
          },
          onSubmitted: onSubmitted,
          autofillHints: null,
          enableIMEPersonalizedLearning: false,
          contextMenuBuilder: safeTextMenu,
          cursorColor: C.primary,
          autocorrect: false,
          enableSuggestions: false,
          decoration: InputDecoration(isDense: true, isCollapsed: true, counterText: '', border: InputBorder.none, hintText: hint, hintStyle: (style ?? T.bodyMd).c(C.outline).regular),
        ),
      );
}

/// The whole box around a single text line starts typing, not only the thin line itself (48 dp target).
class TapToType extends StatelessWidget {
  final Widget child;
  const TapToType({super.key, required this.child});
  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.translucent,
        excludeFromSemantics: true,
        onTap: () {
          final found = <EditableTextState>[];
          void visit(Element e) {
            if (e is StatefulElement && e.state is EditableTextState) {
              found.add(e.state as EditableTextState);
            } else {
              e.visitChildren(visit);
            }
          }

          context.visitChildElements(visit);
          if (found.length == 1 && !found.single.widget.readOnly) found.single.requestKeyboard();
        },
        child: child,
      );
}

/// Asks before a page with meaningful unsaved input is left (arrow, Android back). [dirty] is read when leaving.
class LeaveGuard extends StatelessWidget {
  final bool Function() dirty;
  final Widget child;
  const LeaveGuard({super.key, required this.dirty, required this.child});
  @override
  Widget build(BuildContext context) => PopScope(
        canPop: false,
        onPopInvokedWithResult: (did, _) async {
          if (did) return;
          final nav = Navigator.of(context);
          if (dirty() && !await confirm(context, title: 'Leave without saving?', text: 'What you entered on this page is not saved and will be lost.', yes: 'Leave', no: 'Stay', danger: true)) return;
          if (nav.mounted) nav.pop();
        },
        child: child,
      );
}

/// Thin progress bar (0–1).
class Bar extends StatelessWidget {
  final double value;
  final Color color, track;
  final double height;
  const Bar(this.value, {super.key, this.color = C.primary, this.track = C.surfaceHigh, this.height = 6});
  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(height / 2),
        child: SizedBox(height: height, child: Stack(children: [Positioned.fill(child: ColoredBox(color: track)), FractionallySizedBox(widthFactor: value.clamp(0, 1).toDouble(), heightFactor: 1, child: ColoredBox(color: color))])),
      );
}

/// Page body: scrolls under a pinned header, above a pinned footer, inside the system bars, above the keyboard.
class PhonePage extends StatelessWidget {
  final Widget? header, footer, nav;
  final List<Widget> children;
  final EdgeInsets pad;
  final Color color;
  final double gap;
  final Color? statusColor;
  final ScrollController? controller;
  const PhonePage({super.key, this.header, this.footer, this.nav, required this.children, this.pad = const EdgeInsets.fromLTRB(S.md, S.md, S.md, S.xl), this.color = C.surface, this.gap = 0, this.statusColor, this.controller});
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: color,
        resizeToAvoidBottomInset: true,
        body: Column(children: [
          if (header != null) ColoredBox(color: statusColor ?? color, child: SafeArea(bottom: false, child: header!)) else SafeArea(bottom: false, child: const SizedBox()),
          Expanded(
            child: SingleChildScrollView(
              controller: controller,
              padding: pad,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (var i = 0; i < children.length; i++) ...[if (i > 0 && gap > 0) SizedBox(height: gap), children[i]],
              ]),
            ),
          ),
          if (footer != null) SafeArea(top: false, bottom: nav == null, child: footer!),
          if (nav != null) ColoredBox(color: C.surfaceLowest, child: SafeArea(top: false, child: nav!)),
        ]),
      );
}

class NavItem {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool active;
  const NavItem(this.icon, this.label, this.onTap, {this.active = false});
}

/// Bottom navigation. [fabIndex]: that item is the raised "+" square of the patient and handover screens.
class BottomNav extends StatelessWidget {
  final List<NavItem> items;
  final int? fabIndex;
  const BottomNav(this.items, {super.key, this.fabIndex});
  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(color: C.surfaceLowest, boxShadow: [BoxShadow(color: Color(0x14000000), offset: Offset(0, -2), blurRadius: 8)]),
        height: 64,
        child: Row(children: [
          for (var i = 0; i < items.length; i++)
            Expanded(
              child: Tap(
                label: items[i].label,
                selected: items[i].active,
                onTap: items[i].onTap,
                expand: true,
                child: i == fabIndex
                    ? Transform.translate(offset: const Offset(0, -14), child: Container(width: 56, height: 56, decoration: const BoxDecoration(color: C.primary, borderRadius: R.rFull, boxShadow: shadowMd), child: Ic(items[i].icon, size: 24, color: C.onPrimary)))
                    : Column(mainAxisSize: MainAxisSize.min, children: [
                        Ic(items[i].icon, size: 24, color: items[i].active ? C.primary : C.onSurfaceVariant, fill: items[i].active ? 1 : 0),
                        const SizedBox(height: 2),
                        Text(items[i].label, maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(items[i].active ? C.primary : C.onSurfaceVariant).w(items[i].active ? FontWeight.w700 : FontWeight.w500)),
                      ]),
              ),
            ),
        ]),
      );
}

/// Four masked PIN dots.
class PinDots extends StatelessWidget {
  final int filled;
  const PinDots(this.filled, {super.key});
  @override
  Widget build(BuildContext context) => Semantics(
        label: '$filled of 4 digits entered',
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          for (var i = 0; i < 4; i++)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Container(width: 16, height: 16, decoration: BoxDecoration(shape: BoxShape.circle, color: i < filled ? C.primaryContainer : C.surfaceHighest)),
            ),
        ]),
      );
}
