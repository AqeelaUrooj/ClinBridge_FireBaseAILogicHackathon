import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'data/cipher.dart';
import 'data/native.dart';
import 'state/app_state.dart';
import 'ui/app.dart';
import 'ui/kit/kit.dart';

/// A page that fails to draw says so. The log gets the kind of error and where, never a message that could hold values.
void _guardErrors() {
  ErrorWidget.builder = (_) => const BrokenPage();
  FlutterError.onError = (d) {
    if (kDebugMode) {
      FlutterError.dumpErrorToConsole(d);
    } else {
      _log(d.exception, d.stack);
    }
  };
  PlatformDispatcher.instance.onError = (e, s) {
    _log(e, s);
    return true;
  };
}

void _log(Object e, StackTrace? s) => debugPrint('ClinBridge error ${e.runtimeType} ${'$s'.split(String.fromCharCode(10)).take(4).join(' ')}');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  useSqlcipher();
  _guardErrors();
  final state = AppState(native: ChannelBridge(), seedLoader: () => rootBundle.loadString('assets/seed/downtimekit-seed.json'));
  runApp(ClinBridgeApp(state: state));
  await state.boot();
}
