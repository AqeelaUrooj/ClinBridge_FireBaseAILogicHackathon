import 'dart:io';

import 'package:sqlcipher_flutter_libs/sqlcipher_flutter_libs.dart';
import 'package:sqlite3/open.dart';

/// Must run before the first use of sqlite3: without it the package looks for a plain libsqlite3.so, which this app
/// does not ship (and must not use).
void useSqlcipher() {
  if (Platform.isAndroid) open.overrideFor(OperatingSystem.android, openCipherOnAndroid);
}
