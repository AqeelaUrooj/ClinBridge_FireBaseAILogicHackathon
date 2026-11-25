# Bundled assets and libraries

| Item | Where | Origin and licence |
|---|---|---|
| Inter 400–800 (latin) | `assets/fonts/Inter-*.ttf` | `@fontsource/inter` WOFF files of the web app, unpacked to TTF without change. SIL OFL 1.1 (`Inter-OFL.txt`) |
| Roboto, Roboto Mono | `assets/fonts/Roboto*.ttf` | Files of the Flutter SDK. Apache-2.0 (`Roboto-LICENSE.txt`). Used for glyphs Inter's latin set lacks (₂, ≥) and for monospaced text |
| Material Symbols Outlined | package `material_symbols_icons` 4.2960.0 | Apache-2.0, Google LLC |
| Opening illustration | `assets/art/opening.png` | Owner's Stitch archive, folder `editorial_vector_illustration_…`, unchanged |
| Practice dataset | `assets/seed/downtimekit-seed.json` | Copy of `src/data/downtimekit-seed.json` (100 % fictional) |
| App icon | `android/app/src/main/res/mipmap-*` | ClinBridge icon of the web app (`public/icon-512.png`, `icon-maskable-512.png`), resized |
| Body figure | `lib/ui/screens/body_art.dart` | Port of the project's own drawing (`src/features/body/anatomy.ts`) |
| SQLCipher for Android | `net.zetetic:sqlcipher-android` through `sqlcipher_flutter_libs` 0.6.8 | Zetetic LLC, BSD-style licence |
| sqlite3 (Dart) 2.9.4, crypto 3.0.6, pointycastle 4.0.0, pdf 3.11.3, image 4.3.0 | pub.dev | MIT / BSD-3 / MIT-style / Apache-2.0 / MIT |
| AndroidX CameraX 1.4.1, Activity, Fragment | Google Maven | Apache-2.0 |

Host tests only, not in the app and not in the repository: `sqlcipher_library_windows` 1.0.2 (SQLCipher DLL) from pub.dev.
