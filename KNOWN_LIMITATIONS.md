# Known limitations

- **Not for real patients yet.** Practice mode only until clinical review (D-17) and security work below are done.
- **No encryption at rest yet.** Data in IndexedDB is not encrypted (AES-GCM + `key_store` planned for Phase 8). Laptop disk encryption is required meanwhile.
- **Session is in memory.** Reloading the page signs you out (records stay saved). This is on purpose for shared laptops.
- **Clinical warning ranges are placeholders** (D-17b). They only warn and are not a score.
- **No Overdue status** for medicines until the hospital time window is given (D-18).
- **No dose-range, allergy-vs-drug or interaction checks.** Those need approved clinical content. The allergy banner is always visible.
- **Body map not built** (waits on P-01). Site is typed, with standard words offered.
- **Reasons for fixes** are kept inside `entry.confirmed` JSON until P-02 is approved.
- **AI not wired** (no Firebase config yet, D-16). No on-device or cloud AI runs in this build.
- **Many pages are placeholders** — see ROUTES.md.
- **Date picker format** follows the browser's language setting (may show month/day order). Saved times are ISO with the ward's offset.
- **Icon font is large** (~4 MB, cached once for offline). Can be subset later.
- **One browser tab at a time.** Writes are ordered inside one tab; two tabs writing at the same moment retry, but this is not fully tested.
- **Real records setup** (`/setup`) is not built, so the Real records database stays empty.
