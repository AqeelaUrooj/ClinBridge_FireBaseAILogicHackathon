# Required external reviews before any real hospital use

**Status (20 Nov 2026): no review has been done.** No hospital, reviewer, approval or certification exists for ClinBridge. The app is a hackathon prototype and stays restricted to **synthetic (fake) data** until every review below is complete and the clinical validations are done.

## Reviewer roles (to be named by the hospital)

| Role | What they review | Inputs from this repo |
|---|---|---|
| **Hospital IT security lead or CISO** (chief information security officer) | Encryption design (P-04), key handling, unlock and recovery, idle-lock time, PBKDF2 iterations, threat model, browser and laptop hardening, incident handling | `docs/proposals/P-04-encryption-at-rest.md`, `src/lib/vaultCrypto.ts`, `src/db/encryption.ts`, `src/config/securityPolicy.ts`, KNOWN_LIMITATIONS |
| **Privacy or data-protection officer** | What personal data is stored and where, plain copies, exports, backups, retention and deletion, laws that apply to the site | P-04 ("where plain data can still exist"), `DATA_MAPPING.md`, FHIR export and backup flows |
| **Nursing informatics or clinical safety lead** | Clinical workflows, warnings, high-alert check, recovery worklist rules, handover; every setting marked "not approved" | DECISIONS (open items), `src/config/clinicalPolicy.ts`, `src/config/clinicalWarnings.ts` |
| **EHR integration specialist** | FHIR R4 export, free-text (uncoded) content, what the hospital EHR can load, code mapping | `docs/FHIR_VALIDATION.md` |
| **Hospital IT operations representative** | Laptop provisioning, Chrome version, storage persistence, full-disk encryption, backup storage location, second-laptop enrollment process, support | README, P-05, `docs/AI_INTEGRATION.md` (hardware) |

## What each review should end with

- A written decision: approved, approved with changes, or not approved.
- The reviewer's name, role and date. These are added by the hospital, never by the developers.
- Changes to the "not approved" settings, made only by an approved policy.

## Until then

- Practice dataset only for demos; Real-records mode only with synthetic test values.
- No real patient data, no real staff PINs, no production backups in the repo or in chat.
