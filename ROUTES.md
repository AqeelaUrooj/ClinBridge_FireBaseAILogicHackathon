# Routes

Built = works. Placeholder = honest "being built" page.

| Route | Page | State |
|---|---|---|
| `/sign-in` | Pick person, PIN, Practice / Real records | Built |
| `/lock` | Unlock or switch user | Built |
| `/` | Goes to `/ward` (nurse) or `/admin` (admin) | Built |
| `/ward` | My patients: search, filters, cards, patient check | Built |
| `/add` | Pick a patient first | Built |
| `/alerts` | Drafts to check (list) | Built (checking drafts in later phase) |
| `/more` | Switch user, change-log check, reset practice | Built |
| `/handover` | Ward handover: latest handover per bed | Built |
| `/labs` | Ward labs, critical first (from More) | Built |
| `/export` | Export | Placeholder (Phase 7) |
| `/drill/compare` | Practice compare | Placeholder (Phase 7) |
| `/setup` | First-time setup (real records) | Placeholder (Phase 7) |
| `/admin/*` | Admin | Placeholder (Phase 7) |
| `/recovery/*` | To check / recovery | Placeholder (Phase 7) |
| `/patients/:id` | Patient summary | Built |
| `/patients/:id/timeline` | History | Built |
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
| `/patients/:id/body` | Body map: new Theme 2 vector figures, 21 regions, Front/Back/Both, list picker, markers | Built |
| `/patients/:id/handoff` | Patient handover history | Built |
| `/patients/:id/handoff/new` | New handover (S, B, A, open items, linked confirmed records) → review → save | Built |
| `/patients/:id/handoff/:hid` | View + browser print | Built |
| `/entries/:entry` | Record details, Fix, Mistake | Built |
| `/entries/:entry/history` | All versions | Built |
| `/entries/:entry/correct` | Fix any record type, reason required | Built (all 5 types) |
| `/capture/:entry/confirm` | Check and confirm a draft beside its source photo | Built |

Every patient page and every `/entries/*` page asks for the patient check (name, born, MRN) first.
