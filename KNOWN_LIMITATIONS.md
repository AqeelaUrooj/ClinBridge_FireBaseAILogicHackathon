# Known limitations

- **Not for real patients yet.** Practice mode only until clinical review (D-17) and security work below are done.
- **No encryption at rest yet.** Data in IndexedDB is not encrypted (AES-GCM + `key_store` planned for Phase 8). Laptop disk encryption is required meanwhile.
- **Session is in memory.** Reloading the page signs you out (records stay saved). This is on purpose for shared laptops.
- **Clinical warning ranges are placeholders** (D-17b). They only warn and are not a score.
- **No Overdue status** for medicines until the hospital time window is given (D-18).
- **No dose-range, allergy-vs-drug or interaction checks.** Those need approved clinical content. The allergy banner is always visible.
- **Body map is a first model** (21 regions, draft ids). No neck, groin/perineum, hips or back of limbs. Notes cannot be placed on it yet (P-03). Sites that are not in the fixed table are listed, not drawn.
- **Records saved before DB v2** keep their old reason inside `entry.confirmed` as well as the new `change_reason` (migration was additive on purpose).
- **AI not wired** (no Firebase config yet, D-16). No on-device or cloud AI runs in this build.
- **Many pages are placeholders** — see ROUTES.md.
- **Date picker format** follows the browser's language setting (may show month/day order). Saved times are ISO with the ward's offset.
- **Icon font is large** (~4 MB, cached once for offline). Can be subset later.
- **One browser tab at a time.** Writes are ordered inside one tab; two tabs writing at the same moment retry, but this is not fully tested.
- **Real records setup** (`/setup`) is not built, so the Real records database stays empty.
- **Clinical policy is a prototype.** High-alert list partial, second-checker roles not approved, no timing policy (More → Clinical settings shows this).
- **Fluid totals are per calendar day**, not per shift (shift times not approved).
- **Labs are typed in by nurses** as phoned/printed by the lab; no lab interface.
- **Not pushed to GitHub yet** (session permission step, see report).
