# P-02 — Add `entry.change_reason`

Status: **waiting for approval**. Not applied. The schema and database are unchanged.

## Why

Right now the reason for a fix or mistake is stored inside `entry.confirmed`, next to the confirmed clinical values. That mixes two kinds of data. A dedicated field keeps them apart.

## Schema change

```ts
// src/db/schema.ts — interface Entry
change_reason?: string | null;   // NEW. Optional on normal saves.
```

Rules (enforced in `src/db/repos/entries.ts`, already enforced today for the provisional field):

| Action | Which entry gets the reason | Required? |
|---|---|---|
| Normal save | — | No (stays `null`) |
| Fix (correction) | The **new** entry (the one with `supersedes_id`) | **Yes**, not blank |
| Wrong patient or mistake | The entry being marked `entered-in-error` | **Yes**, not blank |

Kept exactly as now: `entry.supersedes_id`, all older versions, and every audit row (each audit row already copies the reason in its `after` value).

Not indexed: we never search by reason, so the Dexie store line does not change.

## Migration (Dexie version 2)

```ts
// src/db/db.ts — added after version(1); version(1) is never edited
this.version(2)
  .stores({}) // no index changes
  .upgrade(async (tx) => {
    await tx.table('entry').toCollection().modify((e: Entry) => {
      const c = (e.confirmed ?? null) as Record<string, any> | null;
      const reason = c?.correction?.reason ?? c?.entered_in_error?.reason ?? null;
      e.change_reason = typeof reason === 'string' && reason.trim() ? reason : (e.change_reason ?? null);
      if (c && ('correction' in c || 'entered_in_error' in c)) {
        const { correction, entered_in_error, ...clinicalOnly } = c;
        e.confirmed = clinicalOnly; // leaves only the clinical values
      }
    });
  });
```

After the upgrade finishes, on first open, the app adds one audit row: `action: 'schema_migrated'`, `after: { to_version: 2, reasons_moved: <count> }`. (It is written after the upgrade because hashing uses Web Crypto, which cannot run inside a Dexie upgrade transaction.)

## Not losing reasons

- Every reason found in `confirmed.correction.reason` or `confirmed.entered_in_error.reason` is copied before it is removed, in the same transaction. If anything fails, Dexie rolls back the whole upgrade.
- The audit rows keep their own copy of each reason, and the migration never touches them, so the hash chain stays valid.
- The synthetic seed has no reasons today (checked: e-040/e-041 and e-042 carry none), so Practice data only gains reasons that were typed during development.
- Test to add: build a version-1 database with a correction and a mistake (each with a reason), open it with version 2, and check that `change_reason` matches, `confirmed` holds only clinical values, and the audit chain still verifies.

## Data mapping after approval

| Screen | Field |
|---|---|
| Fix → "Why are you fixing this?" | new `entry.change_reason` |
| Wrong patient or mistake → "Reason" | marked `entry.change_reason` |
| Record details → "Fix reason" / "Mistake reason" | `entry.change_reason` |
| FHIR export (later) | `Provenance.reason` text (proposed, to check in Phase 7) |
