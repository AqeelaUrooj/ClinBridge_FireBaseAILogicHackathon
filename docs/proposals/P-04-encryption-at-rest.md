# P-04 — Encryption at rest

Status: **decisions made 20 Nov 2026 (owner). Reversible parts implemented on branch `feat/encryption` (PR #4), tested on synthetic data.** **No irreversible step is approved:** the Real-records migration and deleting any plain copy each need a separate, explicit approval.

## Decisions

| | Decision | Conditions from the owner |
|---|---|---|
| A | **A1, modified.** A strong unit passphrase unlocks the encrypted vault. Nurse PINs stay for identifying who acts and for authorising clinical actions. | A 4-digit PIN is never the only crypto protection. WebCrypto only. Random data key, AES-256-GCM, unique nonce per encryption, data key wrapped by a passphrase-derived key, separate recovery secret, no hard-coded secrets, passphrase never stored, lock and re-authentication, safe refresh/restart/offline reopen. Hospital IT/security review before real use. 12 characters is a starting point, not a guarantee. |
| B | **B1.** Backup files are encrypted with a separate backup passphrase. | Authenticated encryption, own salt and nonce, clear restore steps, wrong-passphrase handling, corruption detection, restored-data check, full tests, no passwords or keys inside. FHIR export stays plain but needs explicit confirmation and a "sensitive" label. Never claim a download lands in secure storage. |
| C | **C1** for the synthetic Practice dataset. | Same code path. The published practice passphrase gives **no confidentiality**. Practice and Real stay separate. Never reuse the practice secret for real records. |
| D | **D1, conditional.** Build the in-place migration in stages, proven on Practice first. | Don't delete the only recoverable copy. Address temporary plain copies, old IndexedDB versions, backup stores and downloaded files. Document what the browser can't guarantee. No silent migration of Real records; explicit approval before any irreversible Real-records step. |
| E | See P-05 (credential transfer revised). | |

## What is stored today

| Store | Content | After this work |
|---|---|---|
| `downtimekit-practice` / `downtimekit-live` (19 tables) | Patient list, clinical records, staff incl. PIN hashes, audit log | Non-index fields encrypted per row; `key_store` holds only wrapped keys |
| `downtimekit-<dataset>-photos` | Paper-form photos | Image bytes and hash encrypted |
| `downtimekit-backups` | Safety copies made before a DB upgrade (and the new pre-encryption checkpoint) | A copy of an encrypted database stays encrypted. **Existing plain copies stay until the cleanup step is approved** |
| Downloaded files | FHIR export, backup file | Backup file encrypted (B1); FHIR export plain with confirmation and label |
| `localStorage` `dtk.dataset` | "practice" or "live" | Unchanged (not clinical) |
| Service-worker cache | App code, fonts, icons | Unchanged (no patient data) |

## Design (checked against WebCrypto)

**Keys**
- **Data key (DEK):** `crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 })`. WebCrypto can only wrap a key that is extractable, so the new key is created extractable, wrapped twice, and then thrown away. The key the app works with is then made by `unwrapKey(..., extractable: false)`. Tests check that `exportKey` on it fails.
- **Passphrase key (KEK):** PBKDF2-HMAC-SHA-256, 600,000 iterations, a random 16-byte salt → AES-KW-256 key, non-extractable, wrap/unwrap only.
- **Recovery secret:** 160 random bits from `crypto.getRandomValues`, shown once as 32 base-32 characters in 8 groups of 4 (alphabet without I, O, 0, 1; checked by `vaultCrypto.test.ts`). It's high-entropy, so its wrapping key comes from HKDF-SHA-256 (random salt) instead of a slow KDF. It is never stored. Using it to recover always issues a new recovery key.
- **Wrong secret:** AES-KW has a built-in integrity check, so a wrong passphrase or recovery secret fails to unwrap. Nothing reveals which part was wrong.

**`key_store` (no schema change)**
- One row, `id = "vault"`. Each field holds a self-describing string, in the same style as `practitioner.pin_hash`:
  - `wrapped_key_pin` = `cb1$pbkdf2-sha256$600000$<salt>$<wrapped DEK>`. The field name says "pin", but it holds the **passphrase** wrap (documented).
  - `wrapped_key_recovery` = `cb1$hkdf-sha256$<salt>$<wrapped DEK>`
  - `created_at` and `rotated_at` are used as named.
- The seed file's placeholder row `ks-01` (fake values) is not a vault and is ignored.

**Records**
- A Dexie middleware sits closest to IndexedDB, so the rest of Dexie (live queries, cache) only ever sees plain values in memory.
- On write, the **index fields** of each table (from the schema's index list, e.g. `id`, `patient_id`, `care_time`) stay plain, and everything else becomes one AES-256-GCM blob with a fresh random 96-bit nonce.
- **Index fields are authenticated (format v2):** the associated data is `cb2|<table>|` + canonical JSON of *all* the row's index fields. Changing, removing or moving any plain index value (MRN, patient, encounter, time, status, audit seq, ...) without the key makes decryption fail. That is reported as an integrity error. App changes re-seal the row with the new values. All 45 index fields were tampered one by one in `indexIntegrity.test.ts`.
- **Format v1** (associated data `table + primary key` only, used by the first build of this PR) is still read for compatibility, but only while a database has v1 rows. After unlock, `resealLegacyRows()` re-seals them as v2 (content compared, audit row `vault_format_upgraded`). From then on v1 is refused. The stored version number isn't trusted: changing it changes the associated data.
- Random 96-bit nonces are safe up to about 2³² encryptions per key (NIST SP 800-38D). A ward laptop is many orders of magnitude below that. Key rotation re-encrypts if ever needed.
- The logical schema doesn't change. Only the stored form of a row does (index fields + `_enc`).
- Async WebCrypto calls inside an IndexedDB transaction keep that transaction open with tiny reads on the request's own transaction, and hand results back inside an IndexedDB callback (`keepAlive` in `encryption.ts`). `Dexie.waitFor` was tried first, but live queries hung in real Chrome (D-43). Browser tests cover it.
- `practitioner` is encrypted too, so PIN hashes can't be brute-forced from a copied profile while the vault is locked.
- The audit hash chain is computed on plain values, as today, and is verified after decryption.

**Photos:** encrypted in `photos.ts`, the only place that reads or writes them, before the transaction. The `ref`, `patient_id` and `saved_at` indexes stay plain and are bound into the associated data (v2).

**Lock and unlock**
- The working key lives only in memory. A refresh, browser restart, "Lock records now" or the idle lock means the passphrase (or recovery secret) must be typed again. Offline unlock works because everything is local.
- On lock, the app drops its key reference and closes the database, which clears Dexie's in-memory caches.
- **Limit:** JavaScript can't guarantee when the browser frees memory, so key material may stay in RAM until garbage collection. We do not claim immediate destruction.
- Vault idle lock: configurable in `src/config/securityPolicy.ts`. The prototype default is marked **not approved**; hospital IT sets it.
- The 5-minute PIN screen lock is unchanged.

**Passphrase rules (guidance, not a guarantee)**
- At least 12 characters.
- Must not be on a short common-passphrase list or be a repeated or sequential pattern.
- Must contain spaces/hyphens between 3+ words, or 3 of 4 character types.
- The screen suggests "4 or more random words".
- Sharing one passphrase across a unit is a known risk: change it when staff leave, never write it on the laptop, and treat hospital IT policy as the final word.

**Practice (C1)**
- The published practice passphrase and practice recovery secret live in one file, labelled PUBLIC.
- The Real-records code refuses those values.
- The unlock screen shows a "Use practice passphrase" button on Practice only.

**Real records (no migration)**
- A **new, empty** Real-records setup creates an encrypted vault at first-time setup: set the unit passphrase, write down the recovery secret, confirm one group. There is nothing to migrate, so this is not an irreversible step.
- An existing Real-records database that already holds plain data is **not** touched. The app shows "Records on this laptop are not encrypted" until the migration is approved.

## Staged migration (D1)

`migrateToEncrypted()` runs automatically **only for Practice**. For Real records it refuses unless called with an explicit approval flag, and no screen passes that flag.

1. **Checkpoint:** copy every table, raw, into `downtimekit-backups` (kind `pre-encryption`), then read it back and compare row counts and a SHA-256 per table. If the check fails, stop with nothing changed.
2. **Create the vault** (the `key_store` row).
3. **Encrypt** table by table, in transactions. Rows already encrypted are skipped, so the step can be re-run after an interruption. A half-done database stays readable: the read path accepts both encrypted and plain rows.
4. **Verify:** read the raw store without the middleware.
   - Every row except `key_store` has `_enc` and no plain non-index fields.
   - Every row decrypts to exactly the checkpoint row (canonical JSON).
   - The audit chain is valid.
   - Row counts per table (and so the links between tables) match the checkpoint.
5. **Audit row** `vault_encrypted` (counts only, never secrets).
6. **Cleanup: NOT done. Needs separate approval.** The pre-encryption checkpoint and the older v1→v2 safety copies are plain and stay. The proposal for removing them comes after the tests above pass on Practice.

**What browsers can't guarantee** (documented in KNOWN_LIMITATIONS):
- Deleting an IndexedDB row or database doesn't guarantee the bytes are wiped from disk. Storage engines compact files later, and SSDs remap blocks.
- Downloaded files are outside the app's control.
- Full-disk encryption stays required.

## Encrypted backup (B1)

- **File:** JSON with a header and one AES-256-GCM ciphertext.
  - Header: format, version, dataset, created time, KDF (PBKDF2-SHA-256, iterations, salt), nonce, SHA-256 of the ciphertext.
  - Plain content (only inside the ciphertext): every table as logical rows **except `key_store`**, photos, and a manifest with a SHA-256 per table.
- **Backup passphrase:** separate, with the same strength rules. It is refused if it unlocks this laptop's vault (that would mean it's the unit passphrase).
- **Errors:**
  - The hash doesn't match → "The file is damaged."
  - Decryption fails while the hash matches → "Wrong backup passphrase."
- **Restore:** only into an empty dataset of the same kind (Practice → Practice, Real → Real) with its own new vault. Rows are re-encrypted with that laptop's key. Afterwards the manifest hashes and the audit chain are checked, or the restore is rolled back.

## Risks that remain

- Forgotten passphrase **and** lost recovery secret = records can't be read (by design; paper is the source).
- Index fields stay **readable** (not secret), but they are authenticated, so changes are detected. That includes **`patient.mrn`**, record times, statuses and ids. Hiding the MRN would need a schema change and a separate decision.
- **Rollback isn't detected:** someone with the files could put back an *older genuine copy* of a whole row (index fields and ciphertext together). Detecting that needs a monotonic counter stored outside the browser profile.
- XSS (a script injected into the page) or a malicious browser extension can read data while the vault is unlocked.
- A shared unit passphrase can leak socially.
- The browser can evict storage if persistence isn't granted.
- Not a certified medical-device design. Hospital IT/security review is required.

## Implementation status (PR #4)

| Stage (owner's list, D) | Done | Evidence |
|---|---|---|
| 1. Test on synthetic Practice data | Yes | `encryptMigration.test.ts`; app migrates old plain Practice databases on start |
| 2. Verified recovery checkpoint | Yes | Checkpoint written, read back, SHA-256 per table compared; a bad copy is refused |
| 3. Encrypt records and photos | Yes | Middleware for records; `encryptPlainPhotos` checks each photo's capture hash before replacing it |
| 4. Every record decrypts and matches the original | Yes | `verifyAgainstCheckpoint` (canonical JSON per row) |
| 5. Audit integrity and relationships | Yes | Chain verified; row counts per table and per-row equality keep all links |
| 6. Interruption and recovery | Yes | Interrupted after a table; restart; wrong passphrase; resume finishes and verifies |
| 7. Wrong secrets, missing recovery key | Yes | Unit tests + browser tests (wrong passphrase, wrong/old recovery key) |
| 8. Backup and restore | Yes | `encryptedBackup.test.ts` + `e2e/backup.spec.ts` (two fresh browsers) |
| 9. No unexpected plain copies | Yes | Test lists the databases: plain data only in the kept checkpoint/safety copies (below) |
| 10. Cleanup step | **Proposed below, not done** | Needs approval |
| Real-records migration | **Not done** | Function refuses without an approval flag; no screen passes it |

**Where plain data can still exist after this PR:**
1. `downtimekit-backups`: the pre-encryption checkpoint, and any v1→v2 safety copy from earlier builds (More shows them as "not encrypted").
2. A Real-records database created before this build (red banner).
3. FHIR export files the user downloaded (plain by design, with a confirmation).
4. Old plain JSON safety-copy downloads made with earlier builds. The download button is removed in this PR, but files saved before are outside the app.
5. Deleted rows' old bytes inside the browser's storage files until the browser compacts them, and old SSD blocks. Browsers give no secure-erase API.

## Cleanup step: implemented for synthetic data, NOT approved for Real records

`src/db/plainCleanup.ts`, with Admin → Backup → "Remove plain safety copies". Checks before anything is removed:
1. the database is fully encrypted (v2, no plain rows, photos sealed);
2. the audit chain is valid;
3. a **fresh encrypted backup** is made and downloaded;
4. that backup opens with its passphrase and every table matches;
5. **restore test:** the backup is restored into a temporary database with its own key, compared table by table, then deleted;
6. a final integrity check.

Then the admin must type `REMOVE PLAIN COPIES`, with a token valid for 10 minutes and single use. Only unencrypted safety copies of that database are deleted, the deletion is verified, and the audit row `plain_copies_removed` is written. The screen states that this is not secure physical erasure.

**Real records:** the checks can run, but deletion is refused in code and the button stays off. That needs separate, explicit approval.

Tests: `plainCleanup.test.ts` (5) and `e2e/cleanup.spec.ts`.

## Real-records migration

See **P-06** (`docs/proposals/P-06-real-records-migration.md`): final algorithm, rollback, evidence, risks, compatibility, review plan. Not approved; not enabled.
