# P-05 — Second-laptop enrollment (proposal, NOT implemented)

Status: **needs owner approval.**

## What exists today

- `/setup` runs once per laptop while Real records has no staff. It creates the first admin and registers **this** laptop in `device`.
- Each laptop has its own IndexedDB. There is **no sync** between laptops, and none is planned (Implementation Plan: every laptop is independent during downtime; Recovery merges by `device_id` + `counter`).
- The documents describe **no** procedure for adding a second laptop. UI/UX S3 covers only the first-time setup steps.

## What a second laptop needs

- **Its own `device` row**, so its records carry its id and counter.
- **The staff list**, so nurses can sign in with their own PINs.
- **The current patient list**, via the existing patient-list import (the hospital's downtime report file).
- **Its own data key and recovery key**, once P-04 exists. No key sharing between laptops.

## Options

- ★ **E1. Enrollment file from laptop 1, typed passphrase, no network.**
  - On laptop 1: Admin → Laptops → "Enroll another laptop". This makes a file containing the staff list (names, roles, PIN hashes, active flags) and a new `device` row reserved for the new laptop. The file is AES-GCM encrypted with a one-time enrollment passphrase that the admin types and tells the other admin in person.
  - On laptop 2: `/setup` → "Join an existing unit" → choose the file + type the passphrase. This imports the staff and its own device row, then sets up its **own** data key and recovery key (P-04). The patient list is imported separately, as today.
  - Audit rows on both laptops (`enrollment_exported`, `enrollment_imported`). Clinical records are never included.
  - Staff changes afterwards (new nurse, PIN reset) must be repeated per laptop, or done with a new enrollment file. This is documented, not synced.
- **E2. Independent setup on every laptop:** run `/setup` again and re-create staff by hand. Simple, but error-prone (PINs typed by admins on many machines).
- **E3. A central enrollment server:** adds a cloud dependency and does not work offline. Not recommended (owner: no unsupported cloud dependency).

## Decision needed

E1 moves PIN *hashes* between laptops inside an encrypted file. Approve E1? It depends on P-04 decision A (how the new laptop's vault is unlocked).
