# P-05 — Second-laptop enrollment

Status: **E1 architecture approved 20 Nov 2026, with credential transfer revised.** Not implemented. **The credential-activation choice below needs approval before any code.**

## Fixed by the owner's decision

- An authorised admin creates an **encrypted enrollment package** (a file) on laptop 1. No network needed.
- **It contains:** staff identities, roles, active/inactive status, and enrollment metadata (enrollment id, the reserved device id for the new laptop, unit, created time, expiry, who created it).
- **It does not contain:** patient records, laptop 1's data key or recovery secret, or **reusable PIN hashes**.
- Laptop 2 makes its **own** data key and recovery secret (P-04). The unit passphrase may be the same words; the wrap uses laptop 2's own salt.
- The patient list is imported separately with the existing patient-list import.
- Audit rows: `enrollment_created` on laptop 1, `enrollment_completed` and each `credential_activated` on laptop 2.
- Device ids are random UUID-based, so two laptops never share one. That keeps the recovery merge key (`device_id` + `counter`) unique.

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
