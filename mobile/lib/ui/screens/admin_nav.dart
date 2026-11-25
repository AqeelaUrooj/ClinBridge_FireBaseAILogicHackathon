import 'package:flutter/material.dart';

import '../kit/kit.dart';
import '../router.dart';

/// Bottom bar of the admin screens. [active]: 0 Readiness, 1 Downtime, 2 Recovery, 3 Audit, 4 More.
class AdminNav extends StatelessWidget {
  final int active;
  const AdminNav({super.key, required this.active});

  static const _items = [
    (Symbols.shield_with_heart, 'Readiness'),
    (Symbols.pause_circle, 'Downtime'),
    (Symbols.sync_problem, 'Recovery'),
    (Symbols.history_edu, 'Audit'),
    (Symbols.tune, 'More'),
  ];

  void _open(BuildContext c, int i) {
    if (i == active) return;
    if (i == 0) return Go.readiness(c);
    // The tabs are siblings above the admin home: they do not pile up.
    if (active > 0) Navigator.of(c, rootNavigator: true).popUntil((r) => r.isFirst);
    switch (i) {
      case 1:
        Go.checklist(c);
      case 2:
        Go.recovery(c);
      case 3:
        Go.audit(c);
      default:
        Go.more(c);
    }
  }

  @override
  Widget build(BuildContext context) => MediaQuery.withClampedTextScaling(maxScaleFactor: 1.2, child: Container(
        decoration: const BoxDecoration(color: C.surface, boxShadow: [BoxShadow(color: Color(0x0A000000), offset: Offset(0, -1), blurRadius: 8)]),
        constraints: const BoxConstraints(minHeight: 64),
        padding: const EdgeInsets.symmetric(horizontal: S.xs),
        child: Row(children: [
          for (var i = 0; i < _items.length; i++)
            Expanded(
              child: Tap(
                label: _items[i].$2,
                selected: i == active,
                onTap: () => _open(context, i),
                expand: true,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Ic(_items[i].$1, size: 22, color: i == active ? C.primary : C.onSurfaceVariant),
                  const SizedBox(height: 2),
                  Text(_items[i].$2, maxLines: 1, overflow: TextOverflow.ellipsis, style: T.labelSm.c(i == active ? C.primary : C.onSurfaceVariant).w(i == active ? FontWeight.w600 : FontWeight.w500)),
                ]),
              ),
            ),
        ]),
      ));
}
