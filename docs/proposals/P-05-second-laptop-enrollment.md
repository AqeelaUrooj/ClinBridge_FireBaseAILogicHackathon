# P-05 — Second-laptop enrollment

Status: **F1 approved 20 Nov 2026 and implemented** on branch `feat/enrollment` (synthetic data only). Original options kept below for the record.

## Fixed by the owner's decision

- An authorised admin creates an **encrypted enrollment package** (a file) on laptop 1. No network needed.
- **It contains:** staff identities, roles, active/inactive status, and enrollment metadata (enrollment id, the reserved device id for the new laptop, unit, created time, expiry, who created it).
- **It does not contain:** patient records, laptop 1's data key or recovery secret, or **reusable PIN hashes**.
- Laptop 2 makes its **own** data key and recovery secret (P-04). The unit passphrase may be the same words; the wrap uses laptop 2's own salt.
- The patient list is imported separately with the existing patient-list import.
- Audit rows: `enrollment_created` on laptop 1, `enrollment_completed` and each `credential_activated` on laptop 2.
- **Device ids are made on laptop 2 at import, never taken from the file** (random UUID-based). Two laptops never share one, even if the same file is used twice, so the recovery merge key (`device_id` + `counter`) stays unique.

## The problem: activating staff without contacting laptop 1 or a server

Without PIN hashes, laptop 2 knows who the staff are but has no way to check anyone's PIN. Something on laptop 2 has to prove "this person is really Nurse X" before they choose a PIN. There are three ways to do that offline.

### Option F1 — Admin-supervised activation (★ recommended)

1. The admin who sets up laptop 2 types the package passphrase. They are the admin who creates the vault on laptop 2, so they set **their own** PIN there as part of setup. This is the same trust step as today's first-time setup.
2. Every other account arrives as **"Needs activation"** and can't sign in.
3. To activate a nurse, the admin signs in on laptop 2 and checks the nurse's identity in person (badge), the way PIN resets already work. The nurse then picks a new PIN on laptop 2.
4. Audit: `credential_activated`, recording who was activated, the admin who checked, and the time.

- **Good:** no credential leaves laptop 1, nothing can be brute-forced from the file, and it reuses an identity check the hospital already does.
- **Cost:** an admin has to be present while each nurse activates. Do it during readiness, not during an outage.

### Option F2 — One-time activation codes

1. Laptop 1 makes a random activation code per person (≥ 60 bits, e.g. 12 base-32 characters). Each code is handed out on paper or in person.
2. The package holds only a slow hash of each code. The codes have high entropy, so unlike a 4-digit PIN hash, the hash can't practically be brute-forced.
3. On laptop 2, the nurse enters their code once and picks a PIN. The code then stops working, and expires with the package.

- **Good:** no admin needed per nurse.
- **Cost:** handing out slips is a risk of its own. A lost or seen slip lets someone else activate that account until it is used or expires. Needs a hospital process for that.

### Option F3 — Self-claim (rejected)

Anyone picks a name and sets a PIN. **Not acceptable:** it weakens authentication and lets anyone act as anyone.

## How failures are handled (F1 or F2)

- **Wrong package passphrase:** decryption fails. Nothing is imported, and you can try again.
- **Damaged file:** the hash check fails. Nothing is imported.
- **Expired package:** refused. The expiry uses laptop 2's clock, which can be wrong (worst case B4), so expiry is a safety net, not the main control.
- **Duplicate enrollment:**
  - Laptop 2 refuses a package if it is already set up, or if its enrollment id was used before.
  - Laptop 1 records each package's enrollment id and reserved device id in the audit log and never reuses them.
  - A package used twice (copied file) would create a second laptop with the **same** reserved device id. To catch that, the readiness check would list device ids, and Recovery already groups records by device. Cancelling a package is an audited action on laptop 1.
- **Interrupted import:** the import is one transaction. A half-imported laptop 2 is rolled back to "not set up".
- **Staff changes later** (new nurse, deactivation): repeat on each laptop, or make a new package. There is still no sync, by design.

## Decision needed

**Pick F1 (admin-supervised, recommended), F2 (one-time codes), or both** (F1 as the default, F2 for units with many staff). Neither moves a reusable credential between laptops. Implementation waits for this answer.

## Implementation (F1)

| Step | Where | What happens |
|---|---|---|
| Make the file | Laptop 1 → Admin → Laptops → "Enroll another laptop" | Admin only. One-time enrollment passphrase: strength rules apply, and the unit passphrase is refused. AES-256-GCM with a PBKDF2-SHA-256 key (600k). The header is associated data. The file expires 24 h after creation (prototype, not approved). Shows a 16-character **fingerprint**. Audit `enrollment_created`. |
| Check the file | Laptop 2 → first-time setup → "Join this unit" | Shows the fingerprint computed from the file **before** the passphrase is typed. "Open file" stays disabled until the admin ticks that it matches laptop 1's screen, seen in person. |
| Open | Laptop 2 | Wrong passphrase, damaged or edited file, expired file, or a file carrying credentials: refused, nothing created. |
| Join | Laptop 2 | The admin picks themself (must be an active admin in the file) and sets a **new** PIN. Then a new laptop name and their **own** unit passphrase, and the new recovery key is confirmed before anything is written. Then: own vault, new device id, staff rows, all in one transaction. Audit `enrollment_completed` (enrollment id, fingerprint, source laptop, counts). |
| Activate staff | Laptop 2 → Admin → Staff → "Activate" | Accounts show "Needs activation" and can't sign in. They are disabled on the sign-in screen, and no PIN from laptop 1 works. The admin ticks "I checked this person's identity in person". The person types a new PIN twice. Audit `credential_activated` (who, verified by). "New PIN" is refused for these accounts, so this step can't be skipped. |

Tests: `src/db/enrollment.test.ts` (8) and `e2e/enrollment.spec.ts` (two fresh browsers).

## Can laptop 2 tell the file really came from an authorised admin?

**Only partly, and we don't claim more.**
- AES-GCM with the enrollment passphrase proves two things: the file was made by **someone who knew the passphrase**, and it **wasn't changed** since. It does **not** prove who that person was. Anyone who learns the passphrase can make a valid-looking file.
- What actually ties the file to an authorised admin is the **process**:
  1. The passphrase is handed over in person.
  2. Both admins compare the fingerprint on the two screens.
  3. The receiving admin must be an admin listed in the file and present at laptop 2.
- What a forged file could do: the person importing it becomes admin of an **empty** laptop. Anyone with an empty laptop can already get that through first-time setup. A forged file can't reach laptop 1's records or keys, and every other account still needs an in-person activation on laptop 2. The real risk is a **wrong staff list** (fake names or roles). The fingerprint check and the activation step are the controls for that.
- A stronger guarantee would need a **signature with a key laptop 2 already trusts**: a per-unit signing key, its public part installed on every laptop in advance, or its fingerprint read out by IT. That needs key management the hospital owns. It is listed for the security review, not built.

## Reuse of a file: limits without central coordination

- Laptop 2 refuses a file if it is already set up, so the same file can't be used twice on one laptop.
- The file **cannot be made single-use across laptops offline**: laptop 1 never hears that it was used. A copied file could set up a third laptop until it expires.
- Mitigations:
  - short expiry (24 h, judged by laptop 2's own clock, which may be wrong);
  - a one-time passphrase handed over in person;
  - deleting the file after use;
  - every joined laptop gets its own device id.
- Detection after the fact: the enrollment id is in each joined laptop's audit log (`enrollment_completed`), and laptop 1's log has `enrollment_created`. Comparing the logs during readiness or recovery shows a file used more than once. There is no screen for that comparison yet.
