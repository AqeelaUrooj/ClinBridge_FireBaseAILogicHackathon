# Routes

Built = works. No route is a placeholder any more; an unknown address shows an honest "Page not found" page.

| Route | Page | State |
|---|---|---|
| `/sign-in` | Pick person, PIN, Practice / Real records | Built |
| `/lock` | Unlock or switch user | Built |
| `/` | Not signed in: the public landing page. Signed in: goes to `/ward` (nurse) or `/admin` (admin). Screen locked: goes to `/lock` | Built |
| `/landing` | Public landing page, for everyone | Built |
| `/ward` | Nurse dashboard (sign-in needed). My patients: search, filters, cards, patient check | Built |
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
| `/patients/:id/report` | Synthetic handwritten report (Practice only, refused in Real records): four designs (`?sheet=assessment`, `shift`, `worksheet`, `pocket`), zoom, rotate, PNG, print. Drawn from this patient's records, read only; patient check first. Not a record and not a paper photo | Built |
| `/export` | FHIR R4 export: prepare, structure check, download, fingerprint in change log (file only, no EHR link) | Built |
| `/ai` | AI check: browser, Prompt API, on-device model readiness (text / image), Firebase AI Logic init, App Check mode, current cloud permission, inference modes; "Prepare on-device model" | Built |
| `/drill/compare` | Device vs Cloud (`PracticeComparePage`): a fictional patient's handwritten report (four designs, same renderer as `/patients/:id/report`) or typed note through `ONLY_ON_DEVICE` and, on request, `ONLY_IN_CLOUD`; both get the same picture file; real source label per answer; cloud blocked in System down; nurse can review an answer to the typed note as a draft (never one to a drawn report). Practice data only (refused on Real records) | Built (cloud side live-verified 20 and 22 Nov 2026; on-device side hardware-blocked on the test PC) |
| `/setup` | First-time setup for Real records (first admin + this laptop); reachable before sign-in, works only while no staff exist | Built |
| `/admin` | Admin dashboard (sign-in needed, nurses are refused). Readiness (offline storage, network, storage space, laptop, AI availability, patient list age, change log, drafts, worklist) | Built |
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
| `/patients/:id/body` | Body map: Theme 2 vector figures, 24 regions, Front/Back/Both, documented administration highlights, list counts, markers and linked entries | Built |
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

## Public homepage

`/` (for visitors) and `/landing` render the same `LandingPage` outside the clinical providers: no vault, no database, no patient, no clinical code. Launch Practice Demo opens the existing Practice sign-in flow.

| Visitor state | Opening `/` |
|---|---|
| Not signed in | Landing page |
| Signed in as nurse / admin | `/ward` / `/admin`, with no new sign-in |
| Screen locked (also after 5 minutes without use) | `/lock` until the PIN; then the dashboard |
| After "Lock records" or Switch user | Landing page. Everyone is signed out; every clinical address still asks for the unlock and the PIN |
| After a page load or refresh | Landing page. The session is only in memory and is not restored (by design) |

- `src/Root.tsx` decides. It knows one yes/no from memory (`src/state/signedIn.ts`); that is not a permission. `RequireAuth` still protects every clinical address and sends visitors to `/sign-in`.
- The installed app opens at `/sign-in`, as before (`start_url` in `vite.config.ts`; `id: '/'` keeps it the same installed app).
- Leaving the clinical app for `/` or `/landing` locks the encrypted records: the key is dropped, running cloud requests stop, and coming back asks for the unlock and the PIN.
- Public judge website (`npm run build:judge`): the landing page also has Install Practice App and View Project on GitHub; `/setup` goes to `/sign-in`; only Practice exists. See docs/JUDGE_DEMO_GUIDE.md.
- Launch Practice Demo always opens Practice. On a laptop with Real records, staff open `/sign-in` (or the installed app).
