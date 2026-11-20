# P-04 — Encryption at rest (proposal, NOT implemented)

Status: **needs owner approval.** Nothing in storage has changed. All data today is synthetic.

## 1. What the documents require

- Implementation Plan C1/C5: AES-GCM at rest, key from the PIN (PBKDF2), auto-lock, and **envelope encryption**. A random data key is wrapped twice: by the nurse's PIN and by an **admin recovery key** that is written down at setup.
- Data plan §3: clinical values are encrypted; the indexes stay plain (`patient_id`, `encounter_id`, `type`, `care_time`, `status`). `key_store` is never exported.
- `key_store` (final schema): `id`, `wrapped_key_pin`, `wrapped_key_recovery`, `created_at`, `rotated_at`.
- UI/UX: setup step "create the admin PIN and write down the recovery key"; Settings "recovery key rotation"; Export "encrypted backup file".

## 2. What is stored today, all unencrypted

| Store | Content | Sensitivity |
|---|---|---|
| `downtimekit-live` / `-practice` (19 tables) | Patient list, all clinical records, staff (PIN hashes), audit log | High (live) |
| `downtimekit-<dataset>-photos` | Paper-form photos (blobs) | High: full clinical source |
| `downtimekit-backups` | Pre-upgrade safety copy of every table | High: complete copy |
| `localStorage` `dtk.dataset` | "practice" / "live" | None |
| Downloaded files | FHIR export, safety-copy JSON | High: plain JSON once saved |
| Service-worker cache | App code, fonts, icons | None |

## 3. Findings that need a decision

1. **A 4-digit PIN cannot protect data at rest.** There are only 10,000 PINs. Someone who copies the browser profile can test all of them offline, even with 600,000 PBKDF2 iterations (about 1 hour on one laptop CPU, minutes on a GPU). The PIN lockout only works inside the app. So a PIN-derived key protects against a casual look, not against a stolen disk.
2. **`key_store` has one `wrapped_key_pin`, but every nurse has a PIN.** Either the vault uses one shared unlock secret, or there is one `key_store` row per person (each with its own copy of the recovery wrap).
3. **Refresh / restart.** The unwrapped data key lives only in memory. After a reload or a browser restart, someone must unlock again. The app already signs out on reload, so the workflow does not change.
4. **Migration of existing plain data** has to rewrite every row. A failure halfway must not leave a mix nobody can read.
5. **Backups and exports.** The pre-upgrade safety copy is plain today. A FHIR export is plain by design, because the EHR team must read it.

## 4. Proposed design (recommended options marked ★)

**Primitives (WebCrypto only, nothing hand-rolled):**
- AES-GCM 256 with a random 96-bit IV per record.
- PBKDF2-SHA-256 with 600,000 iterations and a random 16-byte salt for secrets people type.
- AES-KW to wrap the data key.
- The data key is generated with `crypto.subtle.generateKey` and is never hard-coded or derived from a constant. In memory it is a **non-extractable** CryptoKey and is cleared on lock.

**Unlock secret (decision A):**
- ★ **A1. Unit passphrase + personal PIN.** At the start of a shift (or after a restart), someone types the unit passphrase (12 or more characters) once. That unwraps the data key. The 4-digit PINs then only identify who is acting and switch users, as today. One `key_store` row: `wrapped_key_pin` = data key wrapped by the passphrase-derived key; `wrapped_key_recovery` = data key wrapped by the recovery key. This fits the final schema as-is. (The field name says "pin"; we would document that it holds the passphrase wrap.)
- A2. Per-person wraps: one `key_store` row per staff member, each wrapped by that person's PIN. It matches the field names, but it is only as strong as a 4-digit PIN (finding 1). Not recommended unless PINs become 8 or more digits.
- A3. Keep 4-digit PINs and rely on the laptop's full-disk encryption (BitLocker/FileVault) for at-rest protection. App-level encryption would then only deter a casual look.

**Recovery key:** 128 random bits, shown once at setup as 8 groups of 4 characters for staff to write down. It is never stored in plain text. Rotation re-wraps the same data key and sets `rotated_at`.

**What gets encrypted:**
- Every row's non-index fields, transparently in the repository/Dexie middleware. The indexes stay plain, as the Data plan says.
- `audit_log` hashes stay as they are: the chain is computed on plain values before encryption.
- Photos: the blob is encrypted with the same data key.
- The safety copy before upgrades: encrypted with the same key.
- `practitioner.pin_hash` stays a PBKDF2 hash.

**Exports (decision B):**
- ★ B1. "Encrypted backup file" (UI/UX S20): a whole-vault export, AES-GCM with a key from a separate backup passphrase typed at export time. Restoring it on the same laptop requires that passphrase.
- The FHIR export stays plain (the EHR team must read it), with a clear warning and the fingerprint in the change log.

**Practice dataset (decision C):**
- ★ C1. Encrypt Practice with a published practice passphrase. The real code path then gets tested every day on fake data.
- C2. Leave Practice unencrypted.

**Migration of existing plain data (decision D):**
- ★ D1. Encrypt in place in one Dexie upgrade per table, verified by reading back. After a successful verify, **delete** the plain pre-upgrade safety copies, because they would defeat the encryption. This step is **irreversible**. Today it affects only synthetic and test data.
- D2. Refuse to encrypt existing live data; require a fresh Real-records setup.

## 5. Risks and limits (stay true after implementation)

- **Forgotten passphrase *and* lost recovery key** means the records cannot be read. That is by design (C5); the paper forms remain the source.
- **The browser can still evict storage** if persistence is not granted. Mitigation: the existing persistent-storage request, the readiness check, and the encrypted backup file.
- **Indexes stay readable.** Someone with the files can see which patient ids and times have records, but not the clinical values.
- **XSS or malicious extensions** while the vault is unlocked can read data. Mitigations: CSP, no third-party scripts, auto-lock.
- **Not a certified medical-device security design.** Needs review by hospital IT/security.

## 6. Order of work after approval

1. Crypto module and tests (wrap/unwrap, tamper detection, wrong secret).
2. Setup changes (passphrase + recovery key screen) and the unlock screen.
3. Dexie encryption middleware behind a feature flag on Practice.
4. Migration with verify, then Live.
5. Encrypted backup export/restore.
6. Recovery-key rotation in Settings.
