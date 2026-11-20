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
| `/handover` | Ward handover | Placeholder (Phase 6) |
| `/labs` | Labs | Placeholder (Phase 4) |
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
| `/patients/:id/io` | Fluids | Placeholder (Phase 4) |
| `/patients/:id/notes` | Notes | Placeholder (Phase 4) |
| `/patients/:id/capture` | Photo of paper | Placeholder (Phase 5) |
| `/patients/:id/body` | Body map | Placeholder (Phase 6, waits on D-03) |
| `/patients/:id/handoff` | Patient handover | Placeholder (Phase 6) |
| `/entries/:entry` | Record details, Fix, Mistake | Built |
| `/entries/:entry/history` | All versions | Built |
| `/entries/:entry/correct` | Fix vitals or a medicine record, with reason | Built (vitals, medicines) |
| `/capture/:entry/confirm` | Check photo result | Placeholder (Phase 5) |

Every patient page and every `/entries/*` page asks for the patient check (name, born, MRN) first.
