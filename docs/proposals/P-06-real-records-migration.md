# P-06 — Encrypting an existing Real-records database (proposal, NOT approved)

Status: **not approved, not enabled.** Old Real-records databases stay exactly as they are. The code refuses unless it is called with `approvedRealMigration: true`, and nothing in the app passes that. All evidence below comes from **synthetic** data in automated tests.

## Who this is for

A laptop that held Real records **before** encryption existed, i.e. a database written by a pre-PR #4 build. New Real-records setups are already encrypted from the first record and never need this.

## Final algorithm (as implemented in `src/db/encryptMigration.ts`)

Before starting, an admin must:
1. Sign in as an active admin.
2. **Make an encrypted backup file** of the plain database (Admin → Backup) and keep it off the laptop. Rollback path A.
3. Choose the new unit passphrase (strength rules apply) and confirm the new recovery key (last group typed back).

The migration itself:
1. **Checkpoint:** copy every table, raw, into `downtimekit-backups` (kind `pre-encryption`). Read it back and compare the row count and SHA-256 of every table. If anything differs, stop; nothing has changed. This is rollback path B.
2. **Vault:** create the `key_store` row (data key wrapped by the passphrase and by the recovery key).
3. **Encrypt** table by table, each in its own transaction, then photos. Each photo is hash-checked before its plain row is replaced. A half-done database stays readable. Re-running continues where it stopped and reuses the original checkpoint.
4. **Verify** against the checkpoint:
   - Every row is encrypted in format v2, with index fields authenticated.
   - No extra plain fields are left.
   - Every row decrypts to exactly the original (canonical JSON).
   - Row counts match.
   - The audit chain is valid.
   - Every photo matches its capture hash.
5. **Audit row** `vault_encrypted` (counts and checkpoint id; no secrets).
6. The checkpoint is **kept**. Removing it is the separate cleanup step, which needs its own approval.

## Recovery and rollback

| Situation | What happens | How to get back |
|---|---|---|
| Fails at step 1 (checkpoint) | Nothing changed | Fix the cause (usually storage space) and try again |
| Fails at step 2 or 3 (power, crash, tab closed) | Vault exists; some tables encrypted; all readable after unlock | Unlock with the new passphrase; the migration resumes and verifies |
| Passphrase forgotten mid-way | Recovery key unlocks; resume | Recovery key → new passphrase → resume |
| Verify fails (step 4) | Stops; nothing deleted; checkpoint kept | Path B: restore the checkpoint into an empty database (`restoreSafetyCopy`). Or path A: restore the encrypted backup file on a fresh setup |
| Laptop lost or broken | — | Path A on another laptop (restore from the encrypted backup file) |

## Evidence (synthetic data, automated)

| Test | File | Shows |
|---|---|---|
| Refused without approval, nothing changes | `realMigrationEvidence.test.ts` | The guard works; the app never passes approval |
| Backup first → migrate → verified, identical; the backup restores to the same content | `realMigrationEvidence.test.ts` | Backup verification + rollback path A |
| Checkpoint restores the original plain data into an empty database; chain valid | `realMigrationEvidence.test.ts` | Rollback path B |
| Interrupted after a table → restart → wrong passphrase refused → unlock → resume → verified, identical | `realMigrationEvidence.test.ts`, `encryptMigration.test.ts` | Interruption and restart |
| Verify catches a changed or missing row | `encryptMigration.test.ts` | The check isn't a formality |
| Photos sealed only after their hash checks out | `encryptMigration.test.ts` | No photo silently replaced |
| Index fields authenticated after migration | `indexIntegrity.test.ts` | Format v2 protection applies |

These run in CI on every PR. Results are in TEST_REPORT.md.

## Known data-loss risks

- **Both secrets lost:** forgotten passphrase *and* lost recovery key = the encrypted records can't be read. Mitigation: the checkpoint and the backup file still exist until cleanup is approved. Paper stays the source.
- **Storage space:** the checkpoint roughly doubles the database size during migration. A full disk stops the migration at step 1 (no change) or mid-way (resumable). The "storage full" message tells the nurse to use paper.
- **Browser eviction:** without persistent storage, the browser can delete IndexedDB under pressure. The app asks for persistence, but the browser decides.
- **Other tabs:** a second ClinBridge tab writing during migration isn't fully tested. The procedure says to close other tabs.
- **Clock:** irrelevant to the migration; record times are copied as they are.
- **Rollback only to the moment of the backup/checkpoint:** records added after migration aren't in either.

## Compatibility requirements

- Desktop Chrome with WebCrypto (AES-GCM, AES-KW, PBKDF2, HKDF) and IndexedDB. Tested in Chrome via Playwright and in Node/fake-indexeddb.
- Database schema version 2 (the current one). An older v1 database is upgraded by the normal schema step (with its own safety copy) before migration.
- At least as much free storage as the current database size.
- The laptop plugged in; ClinBridge open in one tab only.
- Laptops not yet migrated keep working in plain mode, with the red banner. Mixed laptops are fine because there is no sync.

## Hospital security review plan

Before approval, the roles in `docs/SECURITY_REVIEW.md` review:
1. **IT security lead / CISO:** this algorithm, P-04, the code, the test evidence. Re-run the tests themselves.
2. **Privacy / data-protection officer:** the plain copies that remain until cleanup (checkpoint, older safety copies, backup file location), and retention.
3. **IT operations:** a dry run on a non-clinical laptop with synthetic data, using the real procedure: backup → migrate → interrupt (pull power) → resume → verify → restore test.
4. **Nursing informatics / clinical safety:** downtime procedure if migration fails during a shift (use paper; don't migrate during downtime).

Approval would cover a named procedure, a named laptop set and a time window. None is assumed here.
