import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'data/cipher.dart';
import 'data/native.dart';
import 'state/app_state.dart';
import 'ui/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  useSqlcipher();
  final state = AppState(native: ChannelBridge(), seedLoader: () => rootBundle.loadString('assets/seed/downtimekit-seed.json'));
  runApp(ClinBridgeApp(state: state));
  await state.boot();
}
