import 'package:flutter/painting.dart';

/// Tokens of the Stitch exports (tailwind.config of the 27 code.html files; identical in all of them) and DESIGN.md.
/// Screen-specific hex values stay in the screen that uses them.
class C {
  static const surface = Color(0xFFF8F9FC);
  static const surfaceLowest = Color(0xFFFFFFFF);
  static const surfaceLow = Color(0xFFF2F4F6);
  static const surfaceContainer = Color(0xFFECEEF0);
  static const surfaceHigh = Color(0xFFE7E8EB);
  static const surfaceHighest = Color(0xFFE1E2E5);
  static const surfaceDim = Color(0xFFD8DADD);
  static const surfaceVariant = Color(0xFFE1E2E5);
  static const onSurface = Color(0xFF191C1E);
  static const onSurfaceVariant = Color(0xFF45474C);
  static const inverseSurface = Color(0xFF2E3133);
  static const inverseOnSurface = Color(0xFFEFF1F3);
  static const outline = Color(0xFF75777D);
  static const outlineVariant = Color(0xFFC5C6CD);
  static const primary = Color(0xFF071020);
  static const onPrimary = Color(0xFFFFFFFF);
  static const primaryContainer = Color(0xFF1C2536);
  static const onPrimaryContainer = Color(0xFF838CA1);
  static const inversePrimary = Color(0xFFBDC6DD);
  static const primaryFixed = Color(0xFFDAE2FA);
  static const primaryFixedDim = Color(0xFFBDC6DD);
  static const onPrimaryFixedVariant = Color(0xFF3E4759);
  static const secondary = Color(0xFF4A6078);
  static const onSecondary = Color(0xFFFFFFFF);
  static const secondaryContainer = Color(0xFFCAE2FD);
  static const onSecondaryContainer = Color(0xFF4E657C);
  static const secondaryFixed = Color(0xFFCEE5FF);
  static const secondaryFixedDim = Color(0xFFB1C9E4);
  static const onSecondaryFixed = Color(0xFF031D31);
  static const onSecondaryFixedVariant = Color(0xFF32495F);
  static const tertiary = Color(0xFF001309);
  static const onTertiary = Color(0xFFFFFFFF);
  static const tertiaryContainer = Color(0xFF002B1A);
  static const onTertiaryContainer = Color(0xFF4F9A76);
  static const tertiaryFixed = Color(0xFFA6F3CA);
  static const tertiaryFixedDim = Color(0xFF8AD6AF);
  static const onTertiaryFixed = Color(0xFF002113);
  static const onTertiaryFixedVariant = Color(0xFF005236);
  static const error = Color(0xFFBA1A1A);
  static const onError = Color(0xFFFFFFFF);
  static const errorContainer = Color(0xFFFFDAD6);
  static const onErrorContainer = Color(0xFF93000A);

  // DESIGN.md palette
  static const saved = Color(0xFF277453);
  static const caution = Color(0xFFC18A28);
  static const critical = Color(0xFFB3261E);
  static const canvas = Color(0xFFF8F9FB);
  static const divider = Color(0xFFE2E8F0);
  static const slate = Color(0xFF7D94AD);
}

/// Spacing (px): xs 4, sm 8, md 12, lg 16, xl 24; gutter/margin 16; gutter-mobile/margin-mobile 12.
class S {
  static const double xs = 4, sm = 8, md = 12, lg = 16, xl = 24;
}

/// Corner radii as the exports define them: rounded 2, rounded-lg 4, rounded-xl 8, rounded-full 12 (!).
class R {
  static const double base = 2, lg = 4, xl = 8, full = 12;
  static const BorderRadius rBase = BorderRadius.all(Radius.circular(base));
  static const BorderRadius rLg = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius rXl = BorderRadius.all(Radius.circular(xl));
  static const BorderRadius rFull = BorderRadius.all(Radius.circular(full));
}

TextStyle _t(double size, double line, FontWeight w, double em) => TextStyle(
      fontFamily: 'Inter',
      fontFamilyFallback: const ['Roboto'],
      fontSize: size,
      height: line / size,
      leadingDistribution: TextLeadingDistribution.even,
      fontWeight: w,
      letterSpacing: em * size,
      color: C.onSurface,
      decoration: TextDecoration.none,
    );

/// Type scale of the exports (class names font-*/text-*).
class T {
  static final headlineLg = _t(26, 32, FontWeight.w700, -0.02);
  static final headlineMd = _t(20, 26, FontWeight.w600, -0.01);
  static final headlineSm = _t(17, 22, FontWeight.w600, 0);
  static final bodyLg = _t(16, 24, FontWeight.w400, 0);
  static final bodyMd = _t(14, 20, FontWeight.w400, 0);
  static final bodySm = _t(12, 16, FontWeight.w400, 0.01);
  /// Values and units: tabular figures (DESIGN.md). Not in running text: Inter's tabular set also widens the hyphen.
  static final vital = _t(22, 26, FontWeight.w700, -0.02).tnum;
  static final unit = _t(11, 14, FontWeight.w600, 0.04).tnum;
  static final badge = _t(11, 14, FontWeight.w700, 0.05);
  static final labelMd = _t(13, 18, FontWeight.w600, 0.01);
  static final labelSm = _t(11, 14, FontWeight.w500, 0.02);

  /// font-mono of the exports.
  static TextStyle mono(double size, {FontWeight w = FontWeight.w400, double? line}) =>
      TextStyle(fontFamily: 'RobotoMono', fontFamilyFallback: const ['Roboto'], fontSize: size, height: (line ?? size * 1.35) / size, leadingDistribution: TextLeadingDistribution.even, fontWeight: w, color: C.onSurface, decoration: TextDecoration.none);
}

extension TextStyleX on TextStyle {
  TextStyle get tnum => copyWith(fontFeatures: const [FontFeature.tabularFigures()]);
  TextStyle c(Color color) => copyWith(color: color);
  TextStyle w(FontWeight weight) => copyWith(fontWeight: weight);
  TextStyle get bold => copyWith(fontWeight: FontWeight.w700);
  TextStyle get semi => copyWith(fontWeight: FontWeight.w600);
  TextStyle get medium => copyWith(fontWeight: FontWeight.w500);
  TextStyle get regular => copyWith(fontWeight: FontWeight.w400);

  /// size in px with an optional line height in px (text-[15px] / leading-*).
  TextStyle s(double size, [double? line]) => copyWith(fontSize: size, height: (line ?? (height ?? 1.3) * (fontSize ?? size)) / size);

  /// letter spacing in em (tracking-wide .025, wider .05, widest .1, tight -.025).
  TextStyle tr(double em) => copyWith(letterSpacing: em * (fontSize ?? 14));
}

const shadowSm = [BoxShadow(color: Color(0x0D000000), offset: Offset(0, 1), blurRadius: 2)];
const shadowMd = [BoxShadow(color: Color(0x1A000000), offset: Offset(0, 4), blurRadius: 6, spreadRadius: -1), BoxShadow(color: Color(0x1A000000), offset: Offset(0, 2), blurRadius: 4, spreadRadius: -2)];
const shadowUp = [BoxShadow(color: Color(0x1F1C2536), offset: Offset(0, -4), blurRadius: 16)];
