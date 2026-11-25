import 'dart:ui';

/// Original vector anatomy of the ClinBridge body map and its regions, ported from the web app
/// (src/features/body/anatomy.ts and regions.ts). Drawn for this project.
///
/// Box: 0 0 240 560, body centre line x = 120. Shapes are defined for the side with x > 120 and mirrored.
/// Left/right are the PATIENT'S anatomical left/right:
///   front view: the patient's left is on the viewer's RIGHT (x > 120)
///   back view:  the patient's left is on the viewer's LEFT  (x < 120)
const double kArtWidth = 240, kArtHeight = 560;

typedef _Pts = List<Offset>;

_Pts _p(List<num> xy) => [for (var i = 0; i < xy.length; i += 2) Offset(xy[i].toDouble(), xy[i + 1].toDouble())];
_Pts _mirror(_Pts l) => [for (final p in l) Offset(240 - p.dx, p.dy)];

/// Smooth closed path through points (Catmull-Rom to cubic Bézier).
Path _closed(_Pts l) {
  final n = l.length;
  Offset at(int i) => l[(i + n) % n];
  final d = Path()..moveTo(l[0].dx, l[0].dy);
  for (var i = 0; i < n; i++) {
    _segment(d, at(i - 1), at(i), at(i + 1), at(i + 2));
  }
  return d..close();
}

/// Smooth open path (detail lines).
Path _open(_Pts l) {
  final n = l.length;
  Offset at(int i) => l[i.clamp(0, n - 1)];
  final d = Path()..moveTo(l[0].dx, l[0].dy);
  for (var i = 0; i < n - 1; i++) {
    _segment(d, at(i - 1), at(i), at(i + 1), at(i + 2));
  }
  return d;
}

void _segment(Path d, Offset p0, Offset p1, Offset p2, Offset p3) {
  final c1 = p1 + (p2 - p0) / 6, c2 = p2 - (p3 - p1) / 6;
  d.cubicTo(c1.dx, c1.dy, c2.dx, c2.dy, p2.dx, p2.dy);
}

Path _poly(_Pts l) => Path()..addPolygon(l, true);

/// A centre-line shape from its right half (top-centre to bottom-centre).
Path _symmetric(_Pts half) => _closed([...half, ..._mirror(half.sublist(1, half.length - 1)).reversed]);

/* ------------------------------ Silhouette parts ------------------------------ */

final _arm = _p([
  158, 103, 169, 104.5, 178.5, 110, 184.5, 118.5, 187, 131, 187.5, 147, 188.5, 166, 190, 186, //
  192, 203, 195.5, 223, 199, 245, 202.5, 266, 205.5, 284, 209, 291, 214.5, 299, 217.5, 307,
  216, 312.5, 212.5, 312, 212.5, 324, 211, 336, 207.5, 345.5, 202.5, 349.5, 197.5, 348, 194, 340.5,
  192, 329, 191.5, 315, 191.5, 301, 191, 290, 186.5, 271, 182, 251, 177.5, 232, 174, 214,
  171.5, 197, 169, 180, 167, 163, 165.5, 147, 163.5, 130, 160.5, 115,
]);
final _leg = _p([
  149, 262, 161.5, 266, 168, 281, 171, 300, 171, 322, 168, 346, 164.5, 370, 162, 390, //
  163, 408, 166, 426, 166.5, 446, 162.5, 466, 157.5, 486, 154.5, 500, 157, 508, 160.5, 518,
  159.5, 527, 153.5, 532, 143, 533.5, 134, 532.5, 129.5, 527, 130, 518, 132, 508, 132.5, 490,
  131, 470, 129, 448, 128, 426, 128.5, 408, 129, 392, 128, 372, 126, 350, 124, 328,
  122, 312, 121, 302, 125, 282, 137, 266,
]);
final _ear = _p([141, 47, 145, 49, 146.5, 55, 144.5, 61, 140.5, 62.5]);

/// SR = drawn on the viewer's right (x > 120), SL = viewer's left. Which PATIENT side that is depends on the view.
/// Order = draw order (legs and arms behind the torso, head on top).
final Map<String, Path> kShapes = {
  'legSR': _closed(_leg),
  'legSL': _closed(_mirror(_leg)),
  'armSR': _closed(_arm),
  'armSL': _closed(_mirror(_arm)),
  'neck': _symmetric(_p([120, 70, 128, 70, 129, 84, 131, 94, 133, 100, 120, 102])),
  'torso': _symmetric(_p([
    120, 93, 131, 93, 142, 97, 154, 101, 164, 106, 168, 116, 167, 132, 165, 150, //
    164, 168, 162, 188, 158, 210, 155.5, 228, 157, 245, 162, 262, 165.5, 279, 165, 293,
    158, 302, 145, 306.5, 131, 308, 120, 307,
  ])),
  'earSR': _closed(_ear),
  'earSL': _closed(_mirror(_ear)),
  'head': _symmetric(_p([120, 22, 131, 24, 139, 31, 142.5, 42, 142.5, 54, 140, 64, 135.5, 72, 129, 78, 120, 81])),
};

/* ------------------------------ Detail lines ------------------------------ */

List<Path> _both(List<num> xy) => [_open(_p(xy)), _open(_mirror(_p(xy)))];
Path _oval(double cx, double cy, double rx, double ry) => Path()..addOval(Rect.fromCenter(center: Offset(cx, cy), width: rx * 2, height: ry * 2));
Path _quad(double x0, double y0, double cx, double cy, double x1, double y1) => Path()
  ..moveTo(x0, y0)
  ..quadraticBezierTo(cx, cy, x1, y1);

final List<Path> kFrontDetail = [
  ..._both([123, 104, 138, 99.5, 152, 101, 162, 107]), // collar bones
  ..._both([122, 149, 134, 157, 150, 156, 162, 141]), // chest, lower edge
  ..._both([166, 113, 175, 126, 178, 142, 176.5, 158]), // shoulder
  ..._both([181.5, 160, 181, 180, 182.5, 197]), // upper arm
  ..._both([183, 226, 188, 250, 194, 277]), // forearm
  ..._both([198.5, 334, 198.5, 347]), ..._both([203, 333, 203.5, 348]), ..._both([207.5, 331, 207.5, 344]), // fingers
  ..._both([191.5, 304, 199, 310, 206, 307]), // palm crease
  ..._both([134, 527, 139, 529.5]), ..._both([146, 529.5, 152, 527]), // toes
  ..._both([146, 174, 150.5, 200, 149.5, 230, 141, 262]), // side of abdomen
  ..._both([122, 190, 139, 188.5]), ..._both([122, 210, 141, 209]), // abdominal lines
  ..._both([160, 262, 146, 281, 129, 299]), // groin crease
  ..._both([150, 302, 157.5, 338, 155.5, 378]), // thigh
  ..._both([146, 408, 149.5, 450, 146, 494]), // shin
  _open(_p([120, 104, 120, 150])), // breastbone
  _open(_p([120, 158, 120, 262])), // midline of abdomen
  _oval(120, 232, 1.9, 2.3), // navel
  _oval(146, 392, 7.5, 9.5), _oval(94, 392, 7.5, 9.5), // kneecaps
];

final List<Path> kBackDetail = [
  _open(_p([120, 96, 120, 262])), // spine
  ..._both([122, 96, 140, 101, 160, 107]), // top of shoulders
  ..._both([131, 120, 143, 116.5, 155, 115.5]), ..._both([155, 115.5, 152, 132, 145, 151]), ..._both([145, 151, 137, 136, 131, 120]), // shoulder blade
  ..._both([166, 113, 175, 126, 178, 142, 176.5, 158]), // shoulder
  ..._both([183, 206, 188, 211.5, 193, 206]), // elbow
  ..._both([195, 334, 195, 344]), ..._both([200, 336, 200, 348]), ..._both([205, 335, 205.5, 347]), // back of fingers
  ..._both([122, 236, 134, 241, 148, 238]), // lower back
  _open(_p([120, 270, 120, 314])), // cleft of buttocks
  ..._both([122, 316, 138, 322, 151, 321, 164, 311]), // fold under buttocks
  ..._both([132, 392, 146, 397, 160, 392]), // back of knee
  ..._both([131, 424, 146, 414, 163, 430]), // calf
  ..._both([145.5, 470, 145.5, 504]), // heel cord
  _oval(145, 523, 9, 6.5), _oval(95, 523, 9, 6.5), // heels
];

/// Dashed lines that show where one region ends and the next begins.
final List<Path> kFrontDividers = [
  _quad(76, 180, 120, 188, 164, 180), // chest | abdomen
  _open(_p([120, 180, 120, 268])), // abdomen left | right
  ..._both([171.5, 205, 184, 209, 195, 204]), // elbow
  ..._both([191, 290, 199, 292.5, 206.5, 287.5]), // wrist
  ..._both([128.5, 392, 146, 403, 162.5, 392]), // knee
  ..._both([132, 505, 143, 508, 155, 503]), // ankle
];
final List<Path> kBackDividers = [
  _quad(78, 192, 120, 198, 162, 192), // upper | lower back
  _quad(79, 258, 120, 264, 161, 258), // lower back | buttocks
  ..._both([171.5, 205, 184, 209, 195, 204]),
  ..._both([191, 290, 199, 292.5, 206.5, 287.5]),
  ..._both([128.5, 392, 146, 400, 162.5, 392]),
  ..._both([132, 507, 143, 510, 155, 505]), // heel
];

/* ------------------------------ Regions ------------------------------ */

/// A band (polygon) clipped to body parts, so a highlight never spills outside the figure.
class BodyZone {
  final List<String> clip;
  final List<Offset> band;

  /// Where a marker sits.
  final Offset anchor;
  BodyZone(this.clip, this.band, this.anchor);

  late final Path path = Path.combine(PathOperation.intersect, _poly(band), clip.map((k) => kShapes[k]!).reduce((a, b) => Path.combine(PathOperation.union, a, b)));
}

class BodyRegion {
  final String id, label;

  /// 'left' | 'right' of the patient, or null on the centre line.
  final String? side;

  /// 'front' | 'back': where a marker is shown when the region exists in both views.
  final String primary;
  final Map<String, BodyZone> zones;
  const BodyRegion(this.id, this.label, this.side, this.primary, this.zones);

  bool get isLimb => RegExp('ARM|HAND|THIGH|LEG|FOOT|HEEL').hasMatch(id);
}

class _Limb {
  final String part;
  final _Pts band;
  final Offset anchor;
  const _Limb(this.part, this.band, this.anchor);
}

// Bands for the viewer's-RIGHT copy of a limb; mirrored for the other side.
final Map<String, _Limb> _limbs = {
  'UPPER_ARM': _Limb('arm', _p([150, 95, 215, 95, 215, 200, 195, 204, 184, 209, 171.5, 205, 150, 205]), const Offset(180, 160)),
  'FOREARM': _Limb('arm', _p([150, 205, 171.5, 205, 184, 209, 195, 204, 230, 200, 230, 285, 206.5, 287.5, 199, 292.5, 191, 290, 150, 290]), const Offset(190, 250)),
  'HAND': _Limb('arm', _p([184, 290, 191, 290, 199, 292.5, 206.5, 287.5, 226, 285, 226, 360, 184, 360]), const Offset(202, 322)),
  'THIGH_FRONT': _Limb('leg', _p([120, 296, 180, 290, 180, 392, 162.5, 392, 146, 403, 128.5, 392, 120, 392]), const Offset(148, 345)),
  'THIGH_BACK': _Limb('leg', _p([120, 318, 180, 312, 180, 392, 162.5, 392, 146, 400, 128.5, 392, 120, 392]), const Offset(149, 356)),
  'LOWER_LEG_FRONT': _Limb('leg', _p([120, 392, 128.5, 392, 146, 403, 162.5, 392, 180, 392, 180, 503, 155, 503, 143, 508, 132, 505, 120, 505]), const Offset(147, 450)),
  'LOWER_LEG_BACK': _Limb('leg', _p([120, 392, 128.5, 392, 146, 400, 162.5, 392, 180, 392, 180, 505, 155, 505, 143, 510, 132, 507, 120, 507]), const Offset(147, 450)),
  'FOOT': _Limb('leg', _p([120, 505, 132, 505, 143, 508, 155, 503, 180, 503, 180, 545, 120, 545]), const Offset(145, 521)),
  'HEEL': _Limb('leg', _p([120, 507, 132, 507, 143, 510, 155, 505, 180, 505, 180, 545, 120, 545]), const Offset(145, 523)),
};

BodyZone _limbZone(String key, String side, String view) {
  final l = _limbs[key]!;
  // Front: the patient's left = viewer's right (SR). Back: the patient's left = viewer's left (SL).
  final right = (view == 'front') == (side == 'left');
  return BodyZone(['${l.part}${right ? 'SR' : 'SL'}'], right ? l.band : _mirror(l.band), right ? l.anchor : Offset(240 - l.anchor.dx, l.anchor.dy));
}

List<BodyRegion> _limb(String part, String label, String? front, String? back, String primary) => [
      for (final side in const ['right', 'left'])
        BodyRegion('${side.toUpperCase()}_$part', '${side == 'left' ? 'Left' : 'Right'} $label', side, primary, {
          if (front != null) 'front': _limbZone(front, side, 'front'),
          if (back != null) 'back': _limbZone(back, side, 'back'),
        }),
    ];

BodyZone _z(List<String> clip, List<num> band, double ax, double ay) => BodyZone(clip, _p(band), Offset(ax, ay));
BodyZone _head() => _z(['head', 'earSR', 'earSL'], [80, 10, 160, 10, 160, 84, 80, 84], 120, 50);
// The exposed neck lies between the bottom of the head and the top of the torso.
BodyZone _neck() => _z(['neck'], [106, 81, 134, 81, 134, 93, 106, 93], 120, 87);

final List<BodyRegion> kRegions = [
  BodyRegion('HEAD', 'Head', null, 'front', {'front': _head(), 'back': _head()}),
  BodyRegion('NECK', 'Neck', null, 'front', {'front': _neck()}),
  BodyRegion('CHEST', 'Chest', null, 'front', {'front': _z(['torso'], [60, 90, 180, 90, 164, 180, 142, 185.5, 120, 188, 98, 185.5, 76, 180], 120, 135)}),
  // Front view: the patient's right half of the abdomen is on the viewer's left.
  BodyRegion('ABDOMEN_RIGHT', 'Abdomen, right side', 'right', 'front', {'front': _z(['torso'], [120, 188, 98, 185.5, 60, 178, 60, 268, 120, 268], 100, 226)}),
  BodyRegion('ABDOMEN_LEFT', 'Abdomen, left side', 'left', 'front', {'front': _z(['torso'], [120, 188, 142, 185.5, 180, 178, 180, 268, 120, 268], 140, 226)}),
  ..._limb('UPPER_ARM', 'upper arm', 'UPPER_ARM', 'UPPER_ARM', 'front'),
  ..._limb('FOREARM', 'forearm', 'FOREARM', 'FOREARM', 'front'),
  ..._limb('HAND', 'hand', 'HAND', 'HAND', 'front'),
  ..._limb('THIGH', 'thigh', 'THIGH_FRONT', 'THIGH_BACK', 'front'),
  ..._limb('LOWER_LEG', 'lower leg', 'LOWER_LEG_FRONT', 'LOWER_LEG_BACK', 'front'),
  ..._limb('FOOT', 'foot', 'FOOT', null, 'front'),
  BodyRegion('BACK_OF_NECK', 'Back of neck', null, 'back', {'back': _neck()}),
  BodyRegion('UPPER_BACK', 'Upper back', null, 'back', {'back': _z(['torso'], [60, 90, 180, 90, 180, 192, 162, 192, 120, 198, 78, 192, 60, 192], 120, 150)}),
  BodyRegion('LOWER_BACK', 'Lower back', null, 'back', {'back': _z(['torso'], [60, 192, 78, 192, 120, 198, 162, 192, 180, 192, 180, 258, 161, 258, 120, 264, 79, 258, 60, 258], 120, 228)}),
  // Shares a boundary with the perineum so the two targets never overlap.
  BodyRegion('BUTTOCKS', 'Buttocks', null, 'back', {'back': _z(['torso', 'legSR', 'legSL'], [60, 258, 79, 258, 120, 264, 161, 258, 180, 258, 180, 312, 128, 317.2, 128, 301, 120, 296, 112, 301, 112, 317.2, 60, 312], 120, 290)}),
  BodyRegion('PERINEUM', 'Perineum', null, 'back', {'back': _z(['torso'], [128, 317.2, 128, 301, 120, 296, 112, 301, 112, 317.2], 120, 303)}),
  ..._limb('HEEL', 'heel', null, 'HEEL', 'back'),
];

BodyRegion? regionById(String? id) {
  for (final r in kRegions) {
    if (r.id == id) return r;
  }
  return null;
}

List<BodyRegion> regionsInView(String view) => [for (final r in kRegions) if (r.zones.containsKey(view)) r];

/// The region at [p] (artwork coordinates): exactly, torso first, else the nearest region within [slop].
BodyRegion? regionAt(String view, Offset p, {double slop = 16}) {
  final all = regionsInView(view);
  final l = [...all.where((r) => !r.isLimb), ...all.where((r) => r.isLimb)];
  for (final r in l) {
    if (r.zones[view]!.path.contains(p)) return r;
  }
  for (var d = 4.0; d <= slop; d += 4) {
    for (final o in [Offset(d, 0), Offset(-d, 0), Offset(0, d), Offset(0, -d)]) {
      for (final r in l) {
        if (r.zones[view]!.path.contains(p + o)) return r;
      }
    }
  }
  return null;
}

/// Fixed table: standard site words used in med_admin.site. Exact match only; anything else is never guessed.
const Map<String, String> kSiteToRegion = {
  'Abdomen, left side': 'ABDOMEN_LEFT',
  'Abdomen, right side': 'ABDOMEN_RIGHT',
  'Left forearm IV line': 'LEFT_FOREARM',
  'Right forearm IV line': 'RIGHT_FOREARM',
  'Left hand IV line': 'LEFT_HAND',
  'Right hand IV line': 'RIGHT_HAND',
};

BodyRegion? siteRegion(String? site) => site == null ? null : regionById(kSiteToRegion[site.trim()]);
