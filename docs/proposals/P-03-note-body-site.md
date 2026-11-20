# P-03 — Add optional `note.body_site`

Status: **waiting for approval**, and it depends on P-01 (which region list). Not applied.

## Schema change

```ts
// src/db/schema.ts — interface Note
body_site?: string | null;   // NEW. Optional. Region code from the approved P-01 list.
```

- Stores the **region code** (for example `ABDOMEN_LEFT` or `REG_ABDOMEN_LL`, whichever list is approved), not free text, so it maps to the body map exactly.
- Left and right always mean the **patient's** left and right.
- Optional: most notes have no body site.
- Notes are append-only like every entry: a changed body site is a correction (new note entry plus `supersedes_id`).

## Migration (goes in the same Dexie version as P-02, or the next one)

```ts
this.version(3) // or 2, if approved together with P-02
  .stores({ note: 'id, &entry_id, body_site' }) // index added so the body map can find notes per region
  .upgrade((tx) => tx.table('note').toCollection().modify((n) => { n.body_site ??= null; }));
```

Existing notes get `null`. Nothing is guessed from note text: the seed note "Heels red…" stays without a body site unless a nurse adds one through a correction.

## Data mapping

| Screen | Field |
|---|---|
| New note → "Link body area (optional)" → tap the body map | `note.body_site` |
| Body map → skin concern / pain markers | notes where `body_site` = region |
| Medicine injection site (already exists) | `med_admin.site` (standard words such as "Abdomen, left side"), mapped to a region with a fixed table, no new field |

## FHIR export (Phase 7)

`Observation.bodySite` or `Condition.bodySite`, depending on the note type. The exact code system (SNOMED CT body structure) is to be decided at export time and needs approval.
