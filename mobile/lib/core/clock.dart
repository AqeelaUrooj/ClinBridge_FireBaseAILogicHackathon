/// Practice runs on a scenario clock anchored to the synthetic outage (14 Nov 2026, 13:20, UTC-05:00), as on the web
/// (src/lib/time.ts). After the records open, [advanceTo] moves it past the latest saved time; it never goes back,
/// and it does not follow the phone's wall clock (a changed phone clock cannot reorder Practice records).
class PracticeClock {
  static const String anchor = '2026-11-14T13:20:00-05:00';
  static const int offsetMinutes = -300;

  int _startMs;
  final Stopwatch _watch;
  int _fromMs = 0;

  /// Tests and pictures: the clock stands still.
  final bool frozen;

  PracticeClock({String start = anchor, Stopwatch? watch, this.frozen = false})
      : _startMs = ms(start),
        _watch = watch ?? (Stopwatch()..start()) {
    _fromMs = _watch.elapsedMilliseconds;
  }

  int now() => frozen ? _startMs : _startMs + (_watch.elapsedMilliseconds - _fromMs);
  String nowIso() => toIso(now());

  void advanceTo(int target) {
    if (target <= now()) return;
    _startMs = target;
    _fromMs = _watch.elapsedMilliseconds;
  }

  static String toIso(int at, [int offset = offsetMinutes]) {
    final local = DateTime.fromMillisecondsSinceEpoch(at + offset * 60000, isUtc: true);
    final abs = offset.abs();
    final off = '${offset >= 0 ? '+' : '-'}${_two(abs ~/ 60)}:${_two(abs % 60)}';
    return '${local.toIso8601String().substring(0, 19)}$off';
  }
}

String _two(int n) => n.toString().padLeft(2, '0');
int ms(String iso) => DateTime.parse(iso).millisecondsSinceEpoch;

/// "14:05", read straight from the stored local time.
String hm(String? iso) => iso == null || iso.length < 16 ? '' : iso.substring(11, 16);

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "14 Nov 2026"
String dayLabel(String? iso) => iso == null || iso.length < 10
    ? ''
    : '${int.parse(iso.substring(8, 10))} ${_months[int.parse(iso.substring(5, 7)) - 1]} ${iso.substring(0, 4)}';
String dateTimeLabel(String? iso) => iso == null ? '' : '${hm(iso)}, ${dayLabel(iso)}';

/// "9 h 40 min"
String sinceText(String fromIso, String nowIso) {
  var min = ((ms(nowIso) - ms(fromIso)) / 60000).round();
  if (min < 0) min = 0;
  if (min < 60) return '$min min';
  return '${min ~/ 60} h${min % 60 > 0 ? ' ${min % 60} min' : ''}';
}

/// "03h 42m"
String elapsedHm(String fromIso, String nowIso) {
  final s = ((ms(nowIso) - ms(fromIso)) ~/ 1000).clamp(0, 1 << 31);
  return '${_two(s ~/ 3600)}h ${_two(s % 3600 ~/ 60)}m';
}

/// "02:14:10"
String elapsedHms(String fromIso, String nowIso) {
  final s = ((ms(nowIso) - ms(fromIso)) ~/ 1000).clamp(0, 1 << 31);
  return '${_two(s ~/ 3600)}:${_two(s % 3600 ~/ 60)}:${_two(s % 60)}';
}

int ageOn(String birthDate, String atIso) {
  final b = birthDate.split('-').map(int.parse).toList();
  final y = int.parse(atIso.substring(0, 4)), m = int.parse(atIso.substring(5, 7)), d = int.parse(atIso.substring(8, 10));
  return y - b[0] - (m < b[1] || (m == b[1] && d < b[2]) ? 1 : 0);
}

/// Dose text per the Joint Commission "Do Not Use" list: no trailing zero, always a leading zero.
String formatDose(num? n) {
  if (n == null || n.isNaN) return '';
  final r = double.parse(n.toStringAsPrecision(12));
  return r == r.truncateToDouble() && r.abs() < 1e15 ? r.toInt().toString() : r.toString();
}

/// "1,000" (screens group thousands; records keep the plain number).
String grouped(num? n) {
  final parts = formatDose(n).split('.');
  final i = parts[0].replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');
  return parts.length > 1 ? '$i.${parts[1]}' : i;
}
