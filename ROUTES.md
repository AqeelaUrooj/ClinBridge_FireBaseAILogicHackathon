# Routes

Built = works. No route is a placeholder any more; an unknown address shows an honest "Page not found" page.

| Route | Page | State |
|---|---|---|
| `/sign-in` | Pick person, PIN, Practice / Real records | Built |
| `/lock` | Unlock or switch user | Built |
| `/` | Goes to `/ward` (nurse) or `/admin` (admin) | Built |
| `/ward` | My patients: search, filters, cards, patient check | Built |
| `/add` | Add Note / Form: every patient with form shortcuts (vitals, note, photo, medicine, fluids, lab, handover); patient check first | Built |
| `/alerts` | Alerts & Orders: drafts to check, critical lab results (read-back status), orders per patient (read only) | Built |
| `/tools/meds` | Ward medication schedule for today (scheduled doses, Given / Due / Held from records) | Built |
| `/tools/vitals` | Ward vitals flowsheet (latest confirmed vitals per patient, draft "unusual" ranges) | Built |
| `/tools/io` | Ward fluid balance (today's in / out / balance, confirmed only) | Built |
| `/tools/body` | Body map: pick a patient (recorded site counts) | Built |
| `/more` | Switch user, links to Ward labs / Paper form packets / AI check / Device vs Cloud (Practice), change-log check, clinical settings status, lock records, safety copies, reset practice | Built |
| `/handover` | Ward handover: latest handover per bed | Built |
| `/labs` | Ward labs, critical first (sidebar Lab Results when no patient is open; also from More) | Built |
| `/spooler` | Paper form packets: choose patients (select all / none, counts) and forms, check the list (name, born, MRN, bed), preview with each patient's sheets on new pages, confirm, then the browser's print dialog. No direct printer link | Built |
| `/print/mar/:id` | Paper MAR sheet DT-MAR-01: identifiers repeat on every page, active medicine orders with today's times (recorded times marked "in ClinBridge"), blank boxes; patient check first | Built |
| `/print/vit/:id` | Paper vitals, neuro and I/O sheet DT-VIT-02: blank time grids, last 3 confirmed readings and today's I/O totals for reference; no score | Built |
| `/print/sbar/:id` | Paper SBAR sheet DT-SBAR-03: newest saved handover (or blank), blank verbal-order and signature boxes (paper only) | Built |
| `/export` | FHIR R4 export: prepare, structure check, download, fingerprint in change log (file only, no EHR link) | Built |
| `/ai` | AI check: browser, Prompt API, on-device model readiness (text / image), Firebase AI Logic init, App Check mode, current cloud permission, inference modes; "Prepare on-device model" | Built |
| `/drill/compare` | Device vs Cloud (`PracticeComparePage`): fictional input through `ONLY_ON_DEVICE` and, on request, `ONLY_IN_CLOUD`; real source label per answer; cloud blocked in System down; nurse can review an answer as a draft. Practice data only (refused on Real records) | Built (cloud side live-verified 20 and 22 Nov 2026; on-device side hardware-blocked on the test PC) |
| `/setup` | First-time setup for Real records (first admin + this laptop); reachable before sign-in, works only while no staff exist | Built |
| `/admin` | Readiness (offline storage, network, storage space, laptop, AI availability, patient list age, change log, drafts, worklist) | Built |
| `/admin/downtime` | Declare System down → checklist + admin PIN → Back online → end (only when worklist done) | Built |
| `/admin/snapshot` | Current patient list; import (Real records only, fake files refused) | Built |
| `/admin/staff` | Add, switch off/on, new PIN | Built |
| `/admin/devices` | Laptops, last clock check, record counts | Built |
| `/admin/audit` | Change log, chain check, filter | Built |
| `/admin/backup` | Encrypted backup file (separate backup passphrase) | Built |
| `/admin/settings` | Clinical and security settings (read only, marked not approved) | Built |
| `/recovery` | Worklist: progress, filters, add new downtime records (rules only) | Built |
| `/recovery/:item` | Why flagged, compare with related record, versions, fix / confirm, sign off | Built |
| `/patients/:id` | Patient summary | Built |
| `/patients/:id/timeline` | History: filter tabs with counts, search, newest / oldest, expand / collapse cards, pre-outage baseline, charting-integrity facts, care team | Built |
| `/patients/:id/vitals` | Vitals: latest, trend, list | Built |
| `/patients/:id/vitals/record` | Record vitals → review → save | Built |
| `/patients/:id/meds` | Medicines: Scheduled, As needed, Drips; today's times with Given / Due / Held / Refused | Built |
| `/patients/:id/meds/:order` | One order: details, today's times, history | Built |
| `/patients/:id/meds/:order/record` | Record Given / Held / Refused / Rate change → review → second nurse PIN (high-alert) → save | Built |
| `/patients/:id/orders` | All orders, read only | Built |
| `/patients/:id/io` | Fluids: today's in / out / balance, list | Built |
| `/patients/:id/io/record` | Add fluid → review → save | Built |
| `/patients/:id/notes` | Notes list | Built |
| `/patients/:id/notes/new` | New note (type, text, risk score as written) → review → save | Built |
| `/patients/:id/labs` | Patient labs | Built (new route) |
| `/patients/:id/labs/record` | Record lab event / critical result | Built (new route) |
| `/patients/:id/capture` | Photo of paper: form type → photo (saved first) → quality hints → type values → save or draft | Built |
| `/patients/:id/body` | Body map: Theme 2 vector figures, 24 regions, Front/Back/Both, list picker, markers | Built |
| `/patients/:id/handoff` | Patient handover history | Built |
| `/patients/:id/handoff/new` | New handover (S, B, A, open items, linked confirmed records) → review → save | Built |
| `/patients/:id/handoff/:hid` | View + browser print | Built |
| `/entries/:entry` | Record details, Fix, Mistake | Built |
| `/entries/:entry/history` | All versions | Built |
| `/entries/:entry/correct` | Fix any record type, reason required | Built (all 5 types) |
| `/capture/:entry/confirm` | Check and confirm a draft beside its source photo | Built |

Every patient page and every `/entries/*` page asks for the patient check (name, born, MRN) first.

## Sidebar (Stitch "Sidebar A", see `docs/ZIP_REQUIREMENTS_TRACEABILITY.md`)

| Group | Item | Goes to | Who sees it |
|---|---|---|---|
| Primary operations | My Patients (count) | `/ward` | RN, LPN |
| | Add Note / Form | `/add` | RN, LPN |
| | Handover | `/handover` | RN, LPN |
| | Alerts & Orders (drafts count) | `/alerts` | RN, LPN, Admin |
| Clinical tools | Medication Schedule · Vitals Flowsheet · Fluid Balance (I/O) · Lab Results · Body Map | the open patient's `meds` / `vitals` / `io` / `labs` / `body` page, otherwise `/tools/meds` · `/tools/vitals` · `/tools/io` · `/labs` · `/tools/body` | RN, LPN |
| System admin | Readiness & Storage · Downtime Management · Recovery Gate & Worklist · Audit Log | `/admin` · `/admin/downtime` · `/recovery` · `/admin/audit` | Admin |
| — | More | `/more` | everyone |

Nurses never see admin links, and `/admin/*` refuses non-admins ("Admins only.") even if typed in.
