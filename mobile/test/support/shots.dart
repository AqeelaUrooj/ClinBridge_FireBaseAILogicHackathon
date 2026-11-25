import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:clinbridge_practice/core/clock.dart';
import 'package:clinbridge_practice/ui/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'host.dart';

/// Pictures are made with the real fonts, the real app code and the DESIGN FIXTURE dataset (test/fixtures/design.json:
/// the people and values of the Stitch references). The installed app never contains that dataset.
const designNow = '2026-11-14T16:30:00-05:00';
String designSeed() => File('test/fixtures/design.json').readAsStringSync();

bool _fonts = false;
Future<void> loadFonts() async {
  if (_fonts) return;
  _fonts = true;
  final manifest = jsonDecode(await rootBundle.loadString('FontManifest.json')) as List;
  for (final f in manifest) {
    final family = f['family'] as String;
    final loader = FontLoader(family);
    for (final a in f['fonts'] as List) {
      loader.addFont(rootBundle.load(a['asset'] as String));
    }
    await loader.load();
  }
}

/// A harness on the design fixture with a clock that stands still at [now].
Future<Harness> designHarness({String now = designNow}) => Harness.make(seed: designSeed(), clock: PracticeClock(start: now, frozen: true)).ready();

final _root = GlobalKey();

/// Puts the app on a phone of [width] × [height] dp (2 pixels per dp) and shows [home].
Future<void> pumpPhone(WidgetTester t, Harness h, {Widget? home, double width = 390, double height = 844, double textScale = 1, EdgeInsets insets = EdgeInsets.zero}) async {
  t.view.devicePixelRatio = 2;
  t.view.physicalSize = Size(width * 2, height * 2);
  t.view.padding = FakeViewPadding(top: insets.top * 2, bottom: insets.bottom * 2);
  t.view.viewPadding = FakeViewPadding(top: insets.top * 2, bottom: insets.bottom * 2);
  t.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(() {
    t.view.reset();
    t.platformDispatcher.clearAllTestValues();
  });
  await t.pumpWidget(RepaintBoundary(key: _root, child: ClinBridgeApp(key: UniqueKey(), state: h.app, home: home)));
  await settle(t);
}

/// Pumps until pictures are decoded and transitions are over (no endless pumpAndSettle on spinners).
Future<void> settle(WidgetTester t) async {
  for (var i = 0; i < 6; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
  await t.runAsync(() async {
    for (final e in find.byType(Image).evaluate()) {
      await precacheImage((e.widget as Image).image, e);
    }
  });
  await t.pump(const Duration(milliseconds: 100));
}

/// A context inside the navigator, for Go.*
BuildContext ctxOf(WidgetTester t) => t.element(find.byType(Scaffold).last);

/// Saves what is on the phone now as build/shots/NAME.png
Future<void> shot(WidgetTester t, String name) async {
  final b = _root.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await t.runAsync(() async {
    final img = await b.toImage(pixelRatio: 2);
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    final f = File('build/shots/$name.png');
    f.parent.createSync(recursive: true);
    f.writeAsBytesSync(data!.buffer.asUint8List());
  });
}

/// Test wrapper: real async for crypto and files, fonts loaded, and a size that shows every overflow as an error.
void visual(String name, Future<void> Function(WidgetTester t) body) => testWidgets(name, (t) async {
      await t.runAsync(loadFonts);
      await body(t);
    });

/// Runs real asynchronous work (PBKDF2, files) inside a widget test.
Future<T> real<T>(WidgetTester t, Future<T> Function() work) async => (await t.runAsync(work)) as T;
