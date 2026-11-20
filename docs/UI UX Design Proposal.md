# UI/UX Design Proposal

This tab is the design for the **real DowntimeKit web app**: the one nurses would use on a hospital ward during an outage (when the hospital's computer record system is down). It is written to production standard (ready for real daily use), not as a quick showcase. It covers the look, every screen, what each role can do, every state a screen can be in, a fake data set that matches Data & Database Plan, and at the very end a **master prompt** (one long instruction you paste into an AI tool so it builds the app).

**Where the look comes from:** the 4 reference images shared on Nov 18: the Sage Mist colour palette, the DocuVerse dashboard, the body-map patient screen and the leaf login. The two Dribbble links could not be opened, because Dribbble shows a human check before the page loads.

## 1. The big idea: calm until it matters

Most of the time the app is quiet: white cards on pale sage green. It only gets loud (strong colour, big bold words) for **three things**: which mode we are in, a number that needs checking, and a dangerous drug. If everything on screen is loud, nurses stop noticing the warnings that matter.

**Eight design rules:**

1. **Design for the worst moment.** Picture a tired nurse at 4 am, in gloves, under bright lights, with the hospital system down. Every screen must still be easy then.
2. **The mode is always visible.** A full-width bar sits at the top of every screen and shows the mode with colour + icon + words. Never colour alone, because some staff are colour-blind.
3. **Numbers come first.** Doses and vitals (body measurements such as pulse and blood pressure) are big, line up in columns, always show their unit, and sit next to the photo of the paper they came from.
4. **At most 3 taps to save an entry.**
5. **Light enough for an old ward laptop.** No blur effects, no heavy animation, and no fonts or icons loaded from the internet: everything is packed inside the app. The laptop's memory is already busy running the on-device AI.
6. **Looks like the paper form.** Field order and labels copy the hospital's paper sheets, so nobody has to learn a new layout during a crisis.
7. **The AI helps, the nurse decides.** Anything the AI filled in looks like a draft (dashed outline + the words AI proposal) until the nurse confirms it, then it turns solid.
8. **Nothing is ever lost or silently changed.** Every entry is saved the moment it is made. A correction adds a new record and keeps the old one visible, struck through.

## 2. What we take from each reference

| Reference | What we take | What we leave out | Why we leave it out |
| --- | --- | --- | --- |
| 1. Sage Mist palette | The 6 greens as our base colours; the calm, natural mood | The very thin font; the blurred photo background | Thin text is hard to read under bright ward lights; blur slows down the laptop |
| 2. DocuVerse dashboard | Left side menu; white rounded cards on a pale background; small cards with tiny trend charts; search at the top; one strong green button at the top right | The body figure; supplement product cards; photos of faces | We don't record body locations; photos of faces don't belong in a downtime tool, so we use initials in circles |
| 3. Body-map patient screen | The treatment-plan list (time pill + coloured left edge) for our patient timeline; pill tabs at the top; the medication cards for our medication schedule; the file list for exports and print; a detail panel on the right | The body map; the buy-medicine buttons; the orange brand colour | Not part of a nurse's charting job; orange would clash with the Downtime colour |
| 4. Leaf login | Layered paper-cut leaf art beside a white card with rounded inputs and a dark green button, for the sign-in and lock screens | The Google and Office sign-in buttons; email + password | The app must work with no internet, so staff sign in with their name and a PIN only |

## 3. Colours

### 3.1 Base colours (from Sage Mist)

Contrast means how easy text is to read on a background. The web accessibility standard (WCAG 2.2, level AA) asks for at least 4.5 : 1 for normal text. Every pair below was calculated, not guessed.

| Name in code | Hex | Used for | Contrast |
| --- | --- | --- | --- |
| ink | #12201A | Main text | 16.8 : 1 on white ✅ |
| forest | #294239 | Headings, main buttons, side menu | White text on it 10.9 : 1 ✅ |
| sage | #4F6C62 | Second-level text, icons, Ready mode | 5.75 : 1 on white ✅ |
| moss | #7D9A8E | Borders, dividers and decoration **only** | 3.05 : 1, too light for text ❌ |
| mist | #B7CEC2 | Selected rows, chips, progress bars | Ink text on it 10.1 : 1 ✅ |
| fog | #EEF5F0 | Page background | Ink text on it 15.2 : 1 ✅ |
| white | #FFFFFF | Cards | n/a |
| muted | #5C6B64 | Small grey helper text | 5.6 : 1 on white ✅ |

### 3.2 Mode colours (the most important colours in the app)

| Mode | When it is used | Bar colour | Icon | Words on the bar | Contrast |
| --- | --- | --- | --- | --- | --- |
| Drill | Training and practice with fake patients | Dusty blue #3F5F8A with faint diagonal stripes | Graduation cap | DRILL · Practice · Fake patients only | 6.5 : 1 ✅ |
| Ready | Normal days: the app stands by and keeps its patient list fresh | Sage #4F6C62 | Tick in a circle | READY · Standing by · Patient list 20 min old | 5.75 : 1 ✅ |
| Downtime | The hospital system is down | Burnt amber #9A4A12 | Wi-Fi with a line through it | DOWNTIME since 03:40 · AI on this laptop only · Cloud blocked | 6.25 : 1 ✅ |
| Recovery | The network is safe again and paper work is being entered back | Ocean blue #245E7A | Cloud with a tick | RECOVERY · Cloud on · Cleared by K. Ellis at 12:40 | 7.1 : 1 ✅ |

**Why amber for Downtime:** amber means we are on backup, like a hazard light on a car. It is not red, because red is kept for danger to a patient and nothing else. The stripes on Drill make practice impossible to mistake for the real thing.

### 3.3 Status colours

| Status | Looks like | Used for |
| --- | --- | --- |
| Device badge | Forest chip, white text, chip icon, words Device · 2.1 s | Any AI result made on the laptop |
| Cloud badge | Ocean chip, white text, cloud icon, words Cloud · 1.4 s | Any AI result made in the cloud |
| Check this | Pale yellow #FFF1C2 background, dark text #6B4E00 (6.9 : 1), dashed border | AI proposals not confirmed yet; unclear fields; drafts |
| Danger | Red #B3261E (white text on red 6.5 : 1, or red text on pale red #FDECEA 5.7 : 1) | High-alert drugs, critical lab results, allergies, mismatches, overdue items |
| Confirmed | Solid border, small forest tick, word Confirmed | Entries the nurse has checked |
| Retired | Grey text with a line through it + the word Corrected or Entered in error | Old versions of a record |
| Focus ring | 2 px ocean #245E7A outline with a 2 px gap | Whatever the keyboard is on right now |

Every badge and chip carries words as well as colour.

## 4. Fonts, spacing, shapes and icons

- **Font: Inter** (free, open licence), packed inside the app so it works offline. Weights 400, 500, 600 and 700 only; no thin weights.
- **Numbers:** turn on Inter's tabular figures (every digit the same width, so columns of numbers line up). Patient numbers also use a slashed zero, so 0 and the letter O never look alike.
- **Text sizes:**

| Use | Size / line height | Weight |
| --- | --- | --- |
| Screen title | 24 / 32 px | 600 |
| Card title | 18 / 26 px | 600 |
| Body text | 16 / 24 px (never below 14) | 400 |
| Vital or dose number | 28 to 32 px | 600 |
| Table text | 14 / 20 px | 400 |
| Field label | 13 / 18 px | 500 |

- **Spacing:** steps of 4 px (4, 8, 12, 16, 24, 32, 48).
- **Corners:** cards 16 px, buttons and inputs 12 px, pills fully round (all from the references).
- **Shadow:** one very soft card shadow. No glass or blur anywhere.
- **Icons: Lucide** (free, open licence), packed inside the app, 20 or 24 px. Main actions always have a word next to the icon.
- **Touch targets:** at least 44 × 44 px. The accessibility standard's minimum is 24 × 24 px; 44 is its stricter level, which suits gloved and tired hands.
- **Movement:** short fades of 150 ms or less, switched off when the laptop's reduce-motion setting is on. While the AI works, show words instead of a spinner: Reading photo on this laptop… 3 s.

## 5. Medical safety display rules

| Rule | How it looks on screen | Why |
| --- | --- | --- |
| No trailing zero, always a leading zero on doses | 5 mg, never 5.0 mg; 0.5 mg, never .5 mg | A missed decimal point turns 5.0 into 50, a tenfold overdose. This is on the Joint Commission's Do Not Use list (the US hospital-accreditation body's list of dangerous ways to write doses) |
| Lab results keep their real precision | Potassium 4.0 mmol/L stays 4.0 | The Joint Commission allows a trailing zero when it shows how precise a lab value is |
| Unit always beside the number, from a fixed list | units, never U; mcg; mL | U can be misread as 0 or 4 |
| Tall Man letters for look-alike drug names | buPROPion vs busPIRone | FDA and ISMP (the US drug-safety institute) recommend capital letters on the part of the name that differs |
| High-alert drugs get a red banner | Red bar: High-alert drug · second nurse must check · second nurse signs with their own PIN | Drugs such as insulin and heparin cause the worst harm when wrong |
| Allergies are always in view | Red chip in the patient banner, e.g. Allergy: Penicillin; grey chip No known allergies | A medication entry must never be made without seeing them |
| AI value sits beside its paper source | The photo crop of that line shows next to the field | The nurse checks against the paper, not against the AI |
| 24-hour clock and written-out months | 14:05, 18 Nov 2026 | 01/02 can mean 1 Feb or 2 Jan |
| Clock warning | Small clock icon + Device time not checked when the laptop clock may be wrong | Wrong times end up in the legal record |
| Two patient identifiers, always | Sticky banner with name, date of birth and MRN (the hospital's patient number) on every patient screen | Stops charting on the wrong patient |
| Draft vs confirmed | Dashed yellow outline + AI proposal, then solid + Confirmed | Nobody mistakes a guess for a checked record |
| Records are never deleted | Old version stays, struck through, with who changed it and when | It is a legal record |

## 6. Who uses it (roles)

The roles come from the `practitioner` table. A hospital can adjust these rights in Settings to match its own policy.

| Action | RN (registered nurse) | LPN (licensed practical nurse) | Admin (charge nurse or IT lead) |
| --- | --- | --- | --- |
| Sign in with name + PIN, lock the screen | Yes | Yes | Yes |
| See the ward board and patient charts | Yes | Yes | Yes |
| Add and confirm entries | Yes | Yes | No (unless the same person is also a nurse) |
| Be the second checker on a high-alert drug | Yes | By hospital policy | No |
| Correct an entry or mark it entered in error | Own entries; others' with a reason | Own entries | No |
| Write and print a handoff (shift handover note) | Yes | Yes | No |
| Sign off Recovery worklist items | Yes | Yes | No |
| Declare or end a downtime; open the network gate | No | No | Yes |
| Import the patient snapshot; run exports | No | No | Yes |
| Manage staff, devices and settings; read the audit log | No | No | Yes |

When someone lacks the right, the button is shown greyed out with the reason (Admin only), not hidden. That way staff know the action exists and who to ask.

## 7. App layout (the frame around every screen)

**Screen sizes:** designed first for 1366 × 768 (a common size on ward laptops) with no sideways scrolling. It also fits 1920 × 1080 desktops and tablets held sideways (1024 px wide and up, side menu folded). Phones are not supported: below 900 px wide the app shows one polite message asking the user to open it on a laptop or tablet.

```
┌──────────────────────────────────────────────────────────────────┐
│ MODE BAR 44 px  DOWNTIME since 03:40 · AI on this laptop only  │ Device │
├──────────┬────────────────────────────────────────────────────────┤
│ Side     │ Top row: search · unit name · clock · signed-in nurse │
│ menu     ├────────────────────────────────────────┬───────────────┤
│ 240 px   │ Patient banner (stays at the top)       │ Detail panel  │
│ (72 px   │ Screen title + pill tabs                │ 320 px        │
│ folded)  │ Main content: cards, tables, timeline   │ (photo, entry │
│ Lock btn │                                         │  details)     │
└──────────┴────────────────────────────────────────┴───────────────┘
```

- **Side menu (forest green):** Ward board, Labs, Handoff, Recovery (only in Recovery mode). Admins also see an Admin group: Readiness, Downtime, Snapshot, Staff, Devices, Audit log, Settings. At the bottom: the signed-in nurse's initials and role, and a **Lock** button that is always visible.
- **Top row:** search (patient name, MRN or bed), the unit name, a clock with the clock-check icon, and which laptop this is.
- **Detail panel:** shows the paper photo, entry details or the latest vitals. It folds away when the main content needs the room.

## 8. Building blocks (components)

| Block | What it shows | Notes |
| --- | --- | --- |
| Mode bar | Mode name, short meaning, Device/Cloud badge of the last AI call | On every screen, including sign-in and lock |
| AI source badge | Device · 2.1 s or Cloud · 1.4 s | On every AI result. Must match what Firebase reports actually ran |
| Patient banner | Name, age, sex, date of birth, MRN, bed, allergy chips, code status (what to do if the heart stops), isolation | Sticky on every patient screen |
| Ward board row | Bed, patient, next medication due, overdue count, drafts waiting, critical flag | Whole row is one big tap target |
| Entry card | Time pill, form icon, the key values, who entered it, Draft/Confirmed, AI badge | Left edge: yellow = draft, green = confirmed, red = needs action, grey = retired |
| Medication row | Drug (Tall Man letters), dose, route, time due, status chip: Due, Given, Held, Refused, Overdue | High-alert drugs carry a red marker |
| Flowsheet table | Times across the top, measurements down the side, out-of-range values marked | Values from before the outage are shaded and labelled Before downtime |
| Field row (Confirm screen) | Label, AI proposal, photo crop, Edit, status chip | Yellow until the nurse checks it |
| Photo check chip | Vitals sheet · clear ✓ or Blurry · please retake | Retake button + Use anyway (the nurse can override) |
| Second-look panel | Paper photo, saved value and cloud reading side by side; differing fields in red | Recovery only |
| Compare cards | Device card and Cloud card for the same form, each with its time | Drill only |
| Worklist row | Priority, patient, entry, flag chips, second-look result, assigned nurse, Sign off | Flags: Duplicate, Time conflict, Missing field, Recheck |
| PIN keypad | 3 × 4 big keys (64 px), dots for digits | Never shows the PIN; locks for 1 minute after 5 wrong tries |
| Buttons | Main (forest), Second (white with border), Danger (red), Text-only | One main button per screen |
| Confirm box | Plain question, what will happen, two clearly named buttons | For patient confirm, sign-off, entered in error, opening the gate |
| Banners | Patient list is 9 h old; Storage low; AI model not ready; Device time not checked | Plain words + what to do next |
| Toast (small pop-up message) | Saved ✓ · Entry confirmed · Could not print | Disappears after 4 s; errors stay until closed |
| Empty, loading and error states | See section 10 | Never a blank screen or an error code alone |

## 9. The screens

The full app has 27 screens in 6 groups. The last column shows which screen of Implementation Plan (section 8) each one covers, so the build order there still holds; screens marked New are added for real daily use.

### 9.1 Getting in

| # | Screen | Who | What it shows and does | Data used | Plan # |
| --- | --- | --- | --- | --- | --- |
| S1 | Sign in | All | Leaf art on the right, white card on the left: pick your name from the staff list, then enter your PIN on the keypad. Mode bar on top. Link: Forgot PIN? Ask an admin | practitioner, key\_store | 1 |
| S2 | Lock screen | All | Appears after idle time (5 minutes by default) or when Lock is pressed. Shows who is signed in and the keypad. Work in progress is kept. Switch user button | practitioner | 1 |
| S3 | First-time setup | Admin | Five steps with a progress line: name this laptop and its unit → create the admin PIN and write down the recovery key → add staff → import the patient snapshot → download and test the AI model | device, key\_store, practitioner, snapshot | New |

### 9.2 The ward

| # | Screen | Who | What it shows and does | Data used | Plan # |
| --- | --- | --- | --- | --- | --- |
| S4 | Ward board (home) | All | One row per bed: patient, age, allergy marker, next medication due, overdue count, drafts waiting, critical flag. Filter chips: My patients, Overdue, Drafts, Critical. Banner with the age of the patient list. Tapping a row opens a confirm box showing name + date of birth + MRN before the chart opens | patient, encounter, allergy, active\_order, entry, lab\_event | 4 |
| S5 | Patient chart: Timeline | Nurses | Patient banner, pill tabs, every entry newest first as entry cards. Right panel: latest vitals as small cards with tiny trend lines. Big + New entry button | entry and its 5 child tables | 5 |
| S6 | Patient chart: Medications | Nurses | The medication schedule (hospitals call it the MAR, the medication administration record). One row per order, grouped Scheduled, As needed, Infusions (drips). Status chips Due, Given, Held, Refused, Overdue. Record dose button on each row | active\_order, med\_admin | New |
| S7 | Patient chart: Vitals | Nurses | Flowsheet table (times across, measurements down) with a trend chart above it. Out-of-range values marked. Values from before the outage are shaded | vital\_sign, snapshot\_result | New |
| S8 | Patient chart: Intake/Output | Nurses | Fluids in and fluids out as two lists with shift totals and the balance (in minus out) | intake\_output | New |
| S9 | Patient chart: Notes | Nurses | Nursing notes and risk scores (for example the pressure-sore and fall-risk scores) newest first, with a category filter | note | New |
| S10 | Patient chart: Orders & allergies | All | Read-only copy of the doctor's orders and the allergy list from the snapshot, with a clear From the 03:00 snapshot label | active\_order, allergy, encounter | New |
| S11 | Labs (whole ward) | Nurses | Three sections: Pending, Critical results, Overdue. Each critical result must record who was told, when, and that it was read back | lab\_event, active\_order | 8 |

### 9.3 Charting

| # | Screen | Who | What it shows and does | Data used | Plan # |
| --- | --- | --- | --- | --- | --- |
| S12 | Capture | Nurses | Row of big form tiles (Vitals, Medication, Intake/Output, Note, Lab), then Type it or Take photo. Saved ✓ appears the moment the input exists. The photo check chip says which form it is and whether it is clear | entry | 6 |
| S13 | Confirm | Nurses | Left: the paper photo with the current line highlighted. Right: one field row per value. Yellow rows must each be checked. High-alert drugs show the red banner and need a second nurse's PIN. Bottom bar: Reject, Edit, Confirm (grey until every yellow row is checked) | entry, child table | 7 |
| S14 | Entry detail and history | Nurses | Everything about one entry: values, paper photo, who and when, which laptop, AI badge, and every earlier version struck through. Buttons: Correct (makes a new version) and Mark entered in error (asks for a reason) | entry, audit\_log | New |
| S15 | Compare | All, Drill only | The same practice form read twice: Device card on the left, Cloud card on the right, with their times; fields that differ are highlighted. The button does not exist outside Drill | none saved | 6b |
| S16 | Handoff | Nurses | Shift handover note in four blocks (Situation, Background, Assessment, Open items), drafted by the on-device AI from confirmed entries only. Every line links to its source entry. Draft until the nurse reviews it. Print button | handoff, entry | 9 |

### 9.4 Recovery

| # | Screen | Who | What it shows and does | Data used | Plan # |
| --- | --- | --- | --- | --- | --- |
| S17 | Network gate | Admin | Quiet full page: checklist (IT confirms the network is clean; clock checked), admin PIN, one big switch Network cleared · start Recovery. A confirm box explains that the cloud will now be used. Written to the audit log | downtime\_event, audit\_log | 10 |
| S18 | Recovery worklist | Nurses, Admin | Progress line at the top (11 of 45 signed off). Table sorted by priority with filters for category, flag, nurse and status. Columns: priority, patient, entry, flags, second look, assigned to, status | worklist\_item | 11 |
| S19 | Worklist item review | Nurses | Paper photo, saved value and cloud second-look reading side by side, differing fields in red. Buttons: Keep saved value, Correct (makes a new version), then Sign off. For a Duplicate flag both entries are shown together | worklist\_item, entry | 11 |
| S20 | Export | Admin | What is ready to send back to the hospital system: counts by category, what is still unsigned, Export FHIR file (FHIR is the standard format hospital systems read), encrypted backup file, and past exports | worklist\_item, audit\_log | 11 |

### 9.5 Admin

| # | Screen | Who | What it shows and does | Data used | Plan # |
| --- | --- | --- | --- | --- | --- |
| S21 | Readiness | Admin (nurses can view) | Grid of check cards: AI model, disk space, laptop power, browser version, patient list age, last backup, clock check. Summary on top (Ready for downtime · 6 of 7 checks). Each failed check says what to do | device, snapshot | 2 |
| S22 | Downtime | Admin | The current outage: when it was declared and by whom, how long it has run, entries so far. Buttons: Declare downtime, End downtime (only after the worklist is finished). List of past outages | downtime\_event | New |
| S23 | Snapshot | Admin | When the patient list was last copied, from which system, row counts per table, and Import new snapshot (not possible during Downtime) | snapshot | New |
| S24 | Staff | Admin | Table of staff: name, initials, role, active or not. Add, deactivate (never delete), reset PIN | practitioner | New |
| S25 | Devices | Admin | Each laptop: label, unit, AI model status, last clock check, with a warning if the clock was not checked recently | device | New |
| S26 | Audit log | Admin | Read-only list of every action: time, who, which laptop, what. Filters and search. A green line Chain intact · 153 of 153 records verified shows nothing was tampered with | audit\_log | New |
| S27 | Settings | Admin | Auto-lock time, the high-alert drug list, allowed units, the role rights from section 6, recovery key rotation | key\_store | New |

**Print views (not screens):** Medication schedule, Vitals flowsheet, Handoff, and Patient summary. Black text on white, patient name + date of birth + MRN on every page, page x of y, and Printed by, time and laptop at the bottom.

## 10. States every screen must handle

| State | What the user sees |
| --- | --- |
| Loading | Grey placeholder shapes in the layout of the real content (never a blank page); after 2 s, words saying what is loading |
| Empty | A plain sentence and the next step: No entries yet · Tap New entry to start |
| Error | What went wrong in plain words, that the data is safe, and a Try again button. Never an error code alone |
| Saving | Saved ✓ with the time. If saving fails, a red banner that stays until it works |
| AI working | Reading photo on this laptop… 3 s, with a Type it instead button |
| AI not available | Banner: The AI helper is not ready on this laptop. You can still type every form. Nothing else is blocked |
| Old patient list | Yellow banner with the age of the snapshot; red when older than 12 hours |
| Clock not checked | Clock icon in the top row and on affected entries |
| Storage low | Banner for admins with how much is left and what to do |
| Second look not available | Grey chip Not available yet · no network; it retries on its own and never uses the laptop's AI instead |
| No right to do this | Button greyed out with the reason next to it |
| Unsaved edit | Leaving a half-edited form asks: Keep editing or Discard changes |
| Wrong PIN | Shake + Wrong PIN · 4 tries left; after 5 wrong tries, a 1-minute wait |
| Small screen | One message asking to use a laptop or tablet |

## 11. Main flows

1. **Charting during downtime:** Sign in → Ward board → tap patient → confirm name + date of birth → Timeline → New entry → Take photo → photo check says clear → Confirm → back on the Timeline with a new card and a Device badge. After the photo: at most 3 taps.
2. **Giving a medication:** Medications tab → Record dose on the due row → fields pre-filled from the order → (high-alert drug: second nurse enters their PIN) → Confirm → the row turns to Given with the time.
3. **Blurry photo:** Take photo → Blurry · please retake → Retake, or Use anyway → continues as flow 1. The first photo is still saved.
4. **Fixing a mistake:** Timeline → open the entry → Correct → change the value and give a reason → Confirm → the old version stays, struck through.
5. **Shift handover:** patient chart → Handoff → review and edit the draft → Print.
6. **Recovery:** admin opens Network gate → switch on → mode bar turns ocean blue → Recovery worklist → open a Recheck row → compare paper photo, saved value and cloud reading → Correct → Sign off → admin exports.
7. **Practice:** switch to Drill (admin) → striped blue bar → everything works on the fake data set from section 13 → Compare is available on Capture.

## 12. Accessibility and input

- Meets the web accessibility standard WCAG 2.2 level AA: text contrast 4.5 : 1 or better, nothing shown by colour alone, visible focus ring, targets 44 px.
- **Keyboard only:** every action can be done with Tab, Enter, Space, Esc and the arrow keys. Shortcuts: `/` search, `N` new entry, `L` lock, `G` then `W` ward board.
- **Screen readers:** every icon button has a spoken label; tables have real headers; pop-up messages are announced; a confirm box keeps the keyboard inside it until closed.
- **Zoom:** still usable at 200% browser zoom.
- **Forms:** labels above fields (never placeholder-only), errors written next to the field in words, number fields open the number keypad on tablets, and units are picked from a list, never typed.
- **Language:** plain words, sentence case, no abbreviations a new nurse would not know (Intake/Output, not I&O).

## 13. Fake data set

A ready-made practice data set, built to match the 19 tables in section 8 of Data & Database Plan field for field. It is the data behind Drill mode and the data to design and test every screen with. **File: `downtimekit-seed.json`** (429 rows, about 190 KB). Everything in it is invented: no real patients, staff, hospital or keys.

**The story inside the data:** Riverside General Hospital (fictional), unit 4 West, 10 patients. The patient list was copied at 03:00 on 14 Nov 2026. The hospital system went down at 03:40 and came back at 12:40 (9 hours), across the 07:00 shift change. The data is frozen at 13:20, with Recovery under way: 11 of 45 worklist items signed off and 5 exported.

### 13.1 Rows per table

| Group | Table | Rows | What is in it |
| --- | --- | --- | --- |
| A. Snapshot | snapshot | 1 | The 03:00 copy and its row counts |
|  | patient | 10 | Name, date of birth, sex, MRN, wristband code |
|  | encounter | 10 | Bed, admit time, doctor, code status, diet, isolation, height, weight |
|  | allergy | 11 | 7 patients with allergies (one has two), 3 with No known allergies |
|  | active\_order | 27 | 15 medications (3 as-needed, 1 infusion), 1 IV fluid, 3 lab, 5 nursing, 2 diet, 1 imaging |
|  | snapshot\_result | 61 | Last vitals for all 10 patients, 9 lab results, 24-hour fluid totals |
| B. Context | practitioner | 6 | 3 RNs, 1 LPN, 1 admin, 1 inactive RN |
|  | device | 2 | Two laptops; the second has a clock running 17 minutes fast |
|  | downtime\_event | 1 | Declared 03:40, network cleared 12:40, not ended yet |
| C. Capture | entry | 49 | 45 confirmed, 2 drafts, 1 corrected, 1 entered in error; 34 typed, 15 from photos |
|  | vital\_sign | 16 | Full sets, blood-sugar checks, one corrected pair |
|  | med\_admin | 18 | Given, held, refused, an infusion rate change, 4 double-checked high-alert doses |
|  | intake\_output | 6 | Oral, IV, urine and vomit volumes |
|  | note | 4 | 2 risk scores, 2 doctor-contact notes |
|  | lab\_event | 5 | 3 collected, 1 pending, 1 critical |
| D. Recovery and security | worklist\_item | 45 | 11 signed off, 5 exported; 7 flagged; second look: 10 match, 2 mismatch, 1 not available |
|  | handoff | 3 | Three night-to-day handover notes, each linked to its source entries |
|  | audit\_log | 153 | Every action, chained with real SHA-256 hashes so the chain check works |
|  | key\_store | 1 | Placeholder wrapped keys (clearly marked fake) |

### 13.2 The cast

| Bed | Patient | Age | MRN | Allergy | What happens to them in the data |
| --- | --- | --- | --- | --- | --- |
| 4B | Sam Rivera | 67 | DK-004512 | Penicillin | amLODIPine written as 5.0 mg on paper, saved as 50 mg; the second look reads 5 mg (Recheck) |
| 4C | Lena Ortiz | 54 | DK-004518 | Sulfa antibiotics | Blood sugar checks and two insulin doses, each double-checked |
| 5A | Arjun Mehta | 71 | DK-004527 | None known | Critical potassium 6.2 mmol/L; the doctor was reached 35 minutes late; furosemide held |
| 5C | Grace Bell | 39 | DK-004533 | Latex | Acetaminophen given at 05:40 and again at 07:25 across the shift change (Duplicate); a blurry vitals photo used anyway |
| 6A | Tom Hale | 82 | DK-004541 | Codeine, shellfish | Heparin infusion rate raised 1,000 → 1,150 units/h on the laptop with the wrong clock (Time conflict); two risk scores |
| 6B | Mei Chen | 58 | DK-004546 | None known | Vitals typed wrong (heart rate 18), then corrected: shows the correction chain |
| 7A | Daniel Okoye | 47 | DK-004552 | Morphine | HYDROmorphone 0.5 mg double-checked; IV fluid totals; one draft waiting |
| 7B | Rosa Santos | 76 | DK-004559 | Aspirin | A dose saved with no route (Missing field); a refused dose; fluid balance; one draft |
| 8A | Peter Novak | 62 | DK-004563 | None known | Oxygen level dropped to 90%, oxygen raised, rechecked; handover note |
| 8B | Aisha Rahman | 35 | DK-004570 | Iodine contrast dye | A blood-sugar value entered on the wrong patient, marked Entered in error |

**Staff:** RN Jordan Park and RN Maria Alvarez (night shift), RN Daniel Okafor and LPN Sara Whitfield (day shift), admin Kim Ellis, and RN Tara Nguyen (inactive). In Drill mode every one of them signs in with PIN 2468.

### 13.3 Which screen each case tests

| Case in the data | Screen it proves |
| --- | --- |
| 50 mg vs 5 mg mismatch | S19 Worklist item review; the no-trailing-zero rule |
| Duplicate dose across the shift change | S18 and S19 Duplicate flag; S6 Medications |
| Laptop clock 17 minutes fast | Clock warning; Time conflict flag; S25 Devices |
| Dose with no route | Missing field flag; S13 Confirm validation |
| Blurry photo used anyway | Photo check chip on S12; Recheck on S18 |
| Second look not available | The grey Not available yet state |
| Corrected vitals and entered-in-error entry | S14 Entry detail and history |
| Two drafts | Dashed AI proposal cards on S5; Drafts filter on S4 |
| Insulin, heparin, HYDROmorphone | High-alert banner and second-nurse PIN on S13 |
| Critical potassium told late | S11 Labs, critical section |
| Held and refused doses | Status chips on S6 |
| 153 chained audit records | Chain intact check on S26 |
| Inactive staff member | S24 Staff; not offered on S1 Sign in |

**Three small additions to the schema** (all noted inside the file): `route_snomed` beside `route` (the standard code for how a drug is given), a `note` on `downtime_event`, and the value `rate_changed` for an infusion rate change in `med_admin.event`.

## 14. Design tokens

Design tokens are the named colours and sizes the whole app shares, so every screen stays consistent. This is the single source; the master prompt repeats it.

```css
:root {
  /* base */
  --ink: #12201A; --forest: #294239; --sage: #4F6C62; --moss: #7D9A8E;
  --mist: #B7CEC2; --fog: #EEF5F0; --white: #FFFFFF; --muted: #5C6B64;
  --border: #D5E2DA;
  /* modes */
  --mode-drill: #3F5F8A; --mode-ready: #4F6C62;
  --mode-downtime: #9A4A12; --mode-recovery: #245E7A;
  /* status */
  --device: #294239; --cloud: #245E7A; --focus: #245E7A;
  --check-bg: #FFF1C2; --check-text: #6B4E00;
  --danger: #B3261E; --danger-bg: #FDECEA;
  /* type */
  --font: 'Inter', system-ui, sans-serif;
  --text-title: 600 24px/32px var(--font);
  --text-card: 600 18px/26px var(--font);
  --text-body: 400 16px/24px var(--font);
  --text-table: 400 14px/20px var(--font);
  --text-label: 500 13px/18px var(--font);
  --text-number: 600 30px/36px var(--font);
  /* shape + space */
  --r-card: 16px; --r-ctrl: 12px; --r-pill: 999px;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px; --s7: 48px;
  --shadow: 0 1px 2px rgba(18,32,26,.06), 0 4px 16px rgba(18,32,26,.06);
  --tap: 44px; --modebar: 44px; --sidenav: 240px; --sidenav-folded: 72px; --panel: 320px;
}
body { font: var(--text-body); color: var(--ink); background: var(--fog);
       font-feature-settings: 'tnum' 1, 'zero' 1; }   /* same-width digits, slashed zero */
```

## 15. Optional: mock-up image prompts

If you want pictures of the screens before building, paste the style block first and then one screen prompt. Image AI tools often scramble small text, so use the pictures to judge layout and colour only.

**Style block:**

```
Clean, calm hospital web app UI on a laptop screen, 16:9, flat design. Pale sage background #EEF5F0, white rounded cards with 16px corners and very soft shadows, dark forest green #294239 side menu and main buttons, sage #4F6C62 icons and secondary text, near-black green #12201A main text. Modern sans-serif font like Inter, regular and semibold only, generous spacing, thin line icons. A full-width coloured mode bar across the very top. No photos of people (initials in circles instead), no real company logos, all names fictional, no glass or blur effects. Crisp, readable, production-quality product UI.
```

**Screen prompts:**

```
S1 SIGN IN: Amber mode bar reading DOWNTIME. Left half: white card titled Sign in with a staff name list (initials in circles) and a big 3x4 PIN keypad with 4 dots. Right half: layered paper-cut tropical leaves in dark greens. Small link: Forgot PIN? Ask an admin.

S4 WARD BOARD: Amber DOWNTIME mode bar. Dark green side menu. Yellow banner: Patient list from 03:00, 9 h old. Filter chips: My patients, Overdue, Drafts, Critical. Table of 10 bed rows: bed, patient name and age, small red allergy marker, next medication due time, red overdue count, yellow drafts count. One row has a red Critical lab chip.

S5 TIMELINE: Amber DOWNTIME mode bar. Sticky patient banner: Sam Rivera, 67, male, born 12 Mar 1959, MRN DK-004512, Bed 4B, red chip Allergy: Penicillin. Pill tabs: Timeline, Medications, Vitals, Intake/Output, Notes, Orders. Vertical list of entry cards with time pills and coloured left edges (green confirmed, yellow dashed draft, grey struck-through corrected). Right panel: 4 small vital cards with tiny trend lines. Dark green New entry button.

S6 MEDICATIONS: Same patient banner. Three groups: Scheduled, As needed, Infusions. Rows with drug name, dose, route, due time and status chips: green Given, yellow Due, red Overdue, grey Held, grey Refused. One row has a red High-alert marker. Record dose button on each due row.

S7 VITALS: Same patient banner. Line chart of heart rate and blood pressure on top. Below it a flowsheet table with times across the top and measurements down the side; two out-of-range cells marked red; the first column shaded and labelled Before downtime.

S12 CAPTURE: Amber DOWNTIME mode bar. Row of 5 large tiles: Vitals, Medication, Intake/Output, Note, Lab. Two big buttons: Type it and Take photo. Photo area showing a paper vitals sheet. Chip under it: Blurry, please retake, with Retake and Use anyway buttons. Small green message: Saved.

S13 CONFIRM: Amber DOWNTIME mode bar. Left half: photo of a paper medication sheet with one line highlighted. Right half: field rows (Drug, Dose, Unit, Route, Time, Given by), two rows pale yellow with dashed borders marked AI proposal, a red banner High-alert drug, second nurse must check, with a PIN field. Dark green Device badge. Bottom bar: Reject, Edit, Confirm.

S14 ENTRY HISTORY: Entry detail card with values, paper photo thumbnail, who and when, laptop name, Device badge. Below: version list where the old version is grey and struck through with the label Corrected. Buttons: Correct and Mark entered in error.

S16 HANDOFF: Four stacked white cards: Situation, Background, Assessment, Open items, with short lines that end in small source links. Device badge at the top, Print button top right, grey note Draft, review before handover.

S17 NETWORK GATE: Quiet centred page titled Start Recovery: checklist with 2 ticked items, admin PIN field, one large switch Network cleared, start Recovery, small warning text.

S18 RECOVERY WORKLIST: Ocean blue mode bar reading RECOVERY, cloud on. Progress bar 11 of 45 signed off. Filter row. Table with priority, patient, entry, flag chips (Duplicate, Time conflict, Missing field, red Recheck), second-look column (green Match, red Mismatch, grey Not available yet), assigned nurse, Sign off button.

S19 ITEM REVIEW: Ocean blue RECOVERY mode bar. Three columns side by side: paper photo, Saved value 50 mg, Cloud reading 5 mg, with the dose field marked red in both. Ocean Cloud badge. Buttons: Keep saved value, Correct, Sign off.

S21 READINESS: Sage mode bar reading READY. Summary pill Ready for downtime, 6 of 7 checks. Grid of 7 white check cards: AI model, Disk space, Laptop power, Browser version, Patient list age, Last backup, Clock check (one amber warning).

S26 AUDIT LOG: Read-only table: time, who, laptop, action, record. Search and filters on top. Green line at the top: Chain intact, 153 of 153 records verified.

MODE BAR SHEET: The same full-width bar in 4 stacked states: striped dusty blue DRILL, sage READY, burnt amber DOWNTIME, ocean blue RECOVERY, each with an icon on the left and a small Device or Cloud badge on the right.

LEAF ART (no text): Layered paper-cut tropical leaves in 5 shades of green (#12201A to #B7CEC2) on white, soft shadows between layers, flowing in from the right edge, empty space on the left.
```

## 16. Quality checklist

The app is not done until every line is true.

- [ ] Every screen shows the mode bar, and every mode has words + icon + colour
- [ ] Every AI result has a Device or Cloud badge that matches what actually ran
- [ ] Nothing reaches the cloud in Downtime mode (check the browser's network panel: zero outside requests)
- [ ] No text uses moss (#7D9A8E); all text passes 4.5 : 1 contrast
- [ ] Every button and key is at least 44 × 44 px
- [ ] Doses show no trailing zero and always a leading zero; units always shown; units never written as U
- [ ] Patient banner with name, date of birth, MRN and allergies on every patient screen
- [ ] High-alert drugs cannot be confirmed without a second nurse's PIN
- [ ] Draft, confirmed and retired records can be told apart without colour
- [ ] No record can be deleted or edited in place; corrections keep the old version
- [ ] Every state in section 10 exists on every screen it applies to
- [ ] Every right in section 6 is enforced, and blocked buttons say why
- [ ] Works at 1366 × 768 with no sideways scrolling, at 200% zoom, and on a 1024 px tablet
- [ ] Works with the network off, after closing and reopening the browser
- [ ] A keyboard-only run through all 7 flows in section 11 works
- [ ] The audit log chain check passes on the fake data set
- [ ] No real names, patients or keys anywhere

## 17. Pages, not one long screen (fix for crowded pages)

**The problem:** an AI-built app can easily put everything on one screen: the list, the details, the side panel and long explanations, all at once. That is hard to read, especially for a tired nurse at 4 am.

**The fix:** every screen does **one job**, and details open on **their own page** with their own web address. Lists show only what you need to choose; you click a row to see the rest. This section **replaces the 320 px detail panel** in sections 7 and 9.

### 17.1 Page map

Each line is a separate page. Indented pages open from the page above them.

```
/sign-in                         Sign in
/lock                            Lock screen
/setup/1 … /setup/5              First-time setup, one step per page

/ward                            Ward board (home)
/patients/:id                    Patient summary (4 tiles, nothing else)
   /patients/:id/timeline        Timeline (entry list)
   /patients/:id/meds            Medication schedule (list)
      /patients/:id/meds/:order          One medicine: order + dose history
      /patients/:id/meds/:order/record   Record a dose (form)
   /patients/:id/vitals          Vitals chart + table
   /patients/:id/io              Intake/Output
   /patients/:id/notes           Notes list
   /patients/:id/orders          Orders and allergies
   /patients/:id/handoff         Handoff note
   /patients/:id/capture         Capture: pick a form, type or photo
      /capture/:entry/confirm    Confirm the AI proposal
/entries/:entry                  One entry: values + paper photo
   /entries/:entry/history       All versions
   /entries/:entry/correct       Correct it (form)
/labs                            Labs list for the ward
   /labs/:lab                    One lab result

/recovery                        Recovery worklist
   /recovery/:item               Review one item
/recovery/gate                   Network gate (admin)
/export                          Export (admin)

/admin                           Admin home (7 tiles)
   /admin/readiness   /admin/downtime   /admin/snapshot
   /admin/staff       /admin/staff/:id
   /admin/devices     /admin/devices/:id
   /admin/audit       /admin/audit/:seq
   /admin/settings/general | high-alert | units | roles | keys
/drill/compare                   Compare (Drill only)
```

### 17.2 Rules for less text

| Rule | Limit |
| --- | --- |
| One job per page | The page title says the job in 4 words or fewer |
| One main button | Only one dark green button per page |
| Short lists | Lists show 3 to 5 fields per row; tables at most 6 columns; 10 rows per page, then Next |
| Short labels | Labels 3 words or fewer; helper text one line, 12 words or fewer |
| No paragraphs | No explanation paragraphs inside the app. Longer help sits behind a small What is this? link |
| Cards | Title + one value + one status chip + one link. Nothing more |
| One banner | Only the most important banner shows; the rest sit behind a 2 more alerts link |
| Short forms | At most 7 fields on screen; the rest behind More fields |
| Compact patient banner | One line, 56 px tall: name, age, date of birth, MRN, bed, allergy chip. Full details live on the patient summary page |
| Short mode bar | e.g. DOWNTIME · since 03:40 · Cloud blocked |
| Short confirm boxes | One sentence + two named buttons |
| Whitespace | At least 24 px between cards; never more than 3 cards in a row |

**What never gets hidden to save space:** the mode bar, the patient banner with the allergy chip, the AI badge on an AI result, the high-alert banner and the Lock button. Safety always beats tidiness.

### 17.3 Moving between pages

- Clicking a row opens its own page. Every page has its own web address, so the browser's Back button, refresh and bookmarks all work.
- Detail pages show a breadcrumb trail (the path back) at the top, e.g. Ward board › Sam Rivera › Medications › amLODIPine.
- Going Back returns to the same list position, with the same filters (filters are kept in the web address).
- A page opened from a link still asks for the PIN first if the app is locked, then opens that exact page.
- Changing patient always goes through the name + date of birth + MRN check.

## 18. Pictures and illustrations (body map, medicine pictures, icons)

The app should explain itself with pictures first and words second, like the two reference dashboards: a body figure that shows where something is, picture cards for medicines, and small drawings beside every number. This section **changes one earlier decision**: the body figure, left out in section 2, is now in.

### 18.1 Rules for every picture

- **Drawn, not photographed.** Every picture is an SVG drawing (a picture made of shapes, so it stays sharp at any size and is very small) packed inside the app. No photos and nothing loaded from the internet, so it all works offline.
- **One style:** flat shapes in the sage greens, 2 px rounded outlines, no gradients, no brand logos, no faces.
- **A picture never replaces the words.** The drug name, dose and unit are always written out. Screen readers get a spoken label for every picture.
- **Medicine pictures show the kind, not the real product.** A tablet drawing means this is a tablet. It does not show what the real pill looks like, so a small line under the picture says Picture shows the type only. Nurses must never identify a pill from the drawing.

### 18.2 Body map

A simple body outline, front and back views, split into 24 areas you can tap (head, chest, belly, left and right upper arm, forearm, hand, thigh, lower leg, foot, upper back, lower back, buttocks, heels).

| Marker | Looks like | Comes from |
| --- | --- | --- |
| Injection site | Small forest dot with a syringe icon | `med_admin.site`, for example Abdomen, left side |
| IV line (a drip tube in a vein) | Ocean dot with a drop icon | `med_admin.site`, for example Left forearm IV line |
| Skin concern | Yellow area (red if serious) | Notes about skin, for example red heels on a pressure-sore check |
| Pain | Area outlined in red with the score, e.g. 5/10 | Pain score in vitals plus the area the nurse taps |

- **Where it shows:** a body tile on the patient summary page, and its own page, `/patients/:id/body`, with the front and back figures on the left and a short list of markers on the right. Tapping a marker opens that entry's page.
- **It is also an input.** On the Record dose form, the nurse taps the body area instead of typing the site. The app writes the standard words (Abdomen, left side). For insulin it shows the last few injection sites, so the nurse can pick a different spot.
- **One small database addition:** an optional `body_site` field on `note`, so a skin or pain note can be pinned to an area. Injection and IV sites already fit in `med_admin.site`.
- **In the fake data:** Lena Ortiz has two insulin sites on the belly, Daniel Okoye and others have IV lines on the forearm or hand, and Tom Hale has red heels.

### 18.3 Medicine pictures

Every medicine row and medicine page gets a picture card, like the medication cards in the reference image. The picture is chosen from the order's route (how the drug is given), so no new data is needed.

| Route in the data | Picture |
| --- | --- |
| PO (by mouth) | Tablet; a capsule or a medicine cup for liquids |
| IV, one dose | Syringe with a vial |
| IV, continuous infusion | IV bag on a pump, with the rate shown on the bag |
| SC or IM (injection under the skin or into muscle) | Injection pen or syringe |
| SL (under the tongue) | Small tablet with a tongue outline |
| TOP (on the skin) | Cream tube |
| PR (rectal) | Suppository |
| NG (through a feeding tube) | Feeding tube |
| Inhaled | Inhaler |

High-alert drugs get a red ring around the picture plus the words High-alert. The picture card shows: picture, drug name in Tall Man letters, dose and route, next time due, status chip.

### 18.4 Other pictures

| Where | Picture |
| --- | --- |
| Vital sign cards | Heart (heart rate), lungs (breathing), thermometer (temperature), arm cuff (blood pressure), fingertip clip (oxygen level), blood drop (blood sugar), face scale (pain) |
| Intake/Output | A glass and an IV bag for fluids in, a measuring jug for fluids out, and a balance drawing that tips to the heavier side |
| Form tiles on Capture | A small drawing of each paper form |
| Photo check | Drawing of a blurry page, a cut-off page, a dark page, a page with glare |
| Labs | Test tube; red for a critical result |
| Mode bar and mode pages | One drawing per mode: training cap, tick, unplugged cable, cloud |
| Isolation and diet chips | Mask, gloves, plate with cutlery, crossed-out plate for nothing by mouth |
| Empty states | A calm leaf drawing with one line of text |
| Sign in, lock and setup | The layered leaf art |
| Readiness | A drawing per check: chip (AI model), disk, laptop, clock |
| Handoff | Two nurse figures (no faces) passing a clipboard |

## Sources

- [Joint Commission: Facts about the Official Do Not Use List](https://www.jointcommission.org/facts_about_do_not_use_list/)
- [Joint Commission: Do Not Use list (PDF), including the lab-value exception](https://www.jointcommission.org:443/-/media/tjc/documents/resources/patient-safety-topics/patient-safety/do_not_use_list_9_14_18.pdf)
- [ISMP: FDA and ISMP Lists of Look-Alike Drug Names with Recommended Tall Man Letters (PDF)](https://online.ecri.org/hubfs/ISMP/Resources/ISMP_Look-Alike_Tallman_Letters.pdf)
- [W3C: What's New in WCAG 2.2 (target size 2.5.8)](https://w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [Inter font](https://rsms.me/inter/) and [Lucide icons](https://lucide.dev)
- The 4 reference images shared on Nov 18, 2026

## 19. Master prompt (all in one)

**How to use it:** open your AI coding tool in a new chat, attach the file `downtimekit-seed.json` and the 4 reference images, then paste everything in the box below as one message. This one prompt replaces the three earlier prompts: it includes the full app, separate pages with little text (section 17), and the pictures and body map (section 18). It is complete on its own; the AI does not need this document.

```
ROLE
You are a senior front-end engineer and product designer who builds safety-critical hospital software. Build the complete DowntimeKit web app described below. This is a real product for daily use on a hospital ward, so build working pages with real state, validation, saving and error handling. Do not build a mock-up, a landing page or a marketing site.

PRODUCT
DowntimeKit is an offline-first web app for nurses. When the hospital's electronic record system goes down, nurses keep charting on a ward laptop: vital signs, medications given, fluid intake and output, notes and lab events. An on-device AI model reads photos of paper forms and proposes values; the nurse checks and confirms every value. When the network is declared safe again, an admin opens a gate, and a cloud AI helps staff review and export everything back to the hospital system.

ATTACHED
1. downtimekit-seed.json: a fully fake data set. Its top-level keys are the 19 database tables (snapshot, patient, encounter, allergy, active_order, snapshot_result, practitioner, device, downtime_event, entry, vital_sign, med_admin, intake_output, note, lab_event, worklist_item, handoff, audit_log, key_store). Treat its field names and values as the schema. Read _meta first.
2. Four reference images for visual style: a sage green palette, a dashboard with a left side menu and white rounded cards, a patient screen with a body figure, a timeline list and medication cards, and a sign-in screen with layered paper-cut leaves. Copy their calm mood, card style, spacing, the idea of a body figure with markers and the idea of medicine picture cards. Do not copy their face photos, product photos, social sign-in buttons or blur effects; draw everything new in our own style.

TECH STACK
- React 18 + TypeScript (strict) + Vite, React Router, installable PWA with a service worker so it runs fully offline.
- Plain CSS variables and CSS modules. No UI kit. No CDN: bundle the Inter font and Lucide icons locally. Zero requests to outside hosts at runtime except the AI cloud calls in Recovery.
- Data in IndexedDB (idb library), one object store per table, behind a typed repository layer. Encrypt record bodies with WebCrypto AES-GCM; the data key is wrapped by a key derived from the PIN (PBKDF2) and again by an admin recovery key.
- Charts and all illustrations as hand-written inline SVG React components (no chart or illustration library, no image files from the internet).
- Tests: Vitest for logic, Playwright for the 8 flows under FLOWS.

DATA RULES
- Capture tables are append-only. Never update or delete an entry. A correction writes a new entry with supersedes_id and sets the old one to status corrected. Entered-in-error sets a status and a reason.
- Save raw input (typed text or photo) before any AI call.
- Every action writes an audit_log row: seq, time, user, device, action, entity, SHA-256 of before and after, and the hash of the previous row. Provide a verify function and show its result on the audit log page.
- Snapshot tables (snapshot, patient, encounter, allergy, active_order, snapshot_result) are read-only in the app.
- Add one optional field, body_site (string), to note, so skin and pain notes can be pinned to a body area. Injection and IV sites already live in med_admin.site.
- Drill mode loads downtimekit-seed.json into a separate practice database, with the clock frozen at 2026-11-14T13:20-05:00 and every seed staff PIN set to 2468. Real modes start empty and get their patients from a snapshot import (same JSON shape).

MODES (one full-width 44px bar on every page: colour + icon + short words)
- DRILL #3F5F8A with diagonal stripes: practice on the seed data.
- READY #4F6C62: standing by.
- DOWNTIME #9A4A12: outage; on-device AI only; the cloud is blocked in code. Bar text like DOWNTIME · since 03:40 · Cloud blocked.
- RECOVERY #245E7A: after an admin opens the network gate; cloud allowed.

AI LAYER
Put all AI behind one interface, AiService, with: photoCheck(image), extractForm(formType, image or text), draftHandoff(entries), buildWorklist(entries), secondLook(image, saved). Provide two implementations:
1. FirebaseAiService using Firebase AI Logic hybrid inference (check the current Firebase docs for exact names before coding):
   downtime  = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE })   // photoCheck, extractForm, draftHandoff
   drill     = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE })
   recovery  = getGenerativeModel(ai, { mode: InferenceMode.PREFER_IN_CLOUD })  // buildWorklist
   cloudOnly = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD })    // secondLook, cloud half of Compare
   Ask for JSON output with a schema for every call. Keep all prompts in /src/shared/prompts. Show a Device or Cloud badge from the response's inference source, with the time taken.
2. SeedAiService for Drill and tests: returns the ai_proposal, photo_check and second-look values already stored in the seed file, after a short realistic delay.
Rules: in Downtime no code path may call the cloud. secondLook must never fall back to the device model; with no network it shows Not available yet and retries. If no model is available, every form still works by typing. The AI only proposes; nothing is saved as confirmed without a nurse action. The AI never gives medical advice.
Sign-in is local (name + PIN checked on the device); do not use Firebase Authentication, because it needs the internet.

DESIGN TOKENS (use exactly)
--ink #12201A (text); --forest #294239 (headings, main buttons, side menu); --sage #4F6C62 (secondary text, icons); --moss #7D9A8E (borders and decoration only, never text); --mist #B7CEC2 (selected rows, chips); --fog #EEF5F0 (page background); --white #FFFFFF (cards); --muted #5C6B64 (helper text); --border #D5E2DA; --device #294239; --cloud #245E7A; --focus #245E7A; --check-bg #FFF1C2 with text #6B4E00 (drafts, unclear fields); --danger #B3261E with background #FDECEA.
Font Inter 400/500/600/700 with tabular figures and slashed zero. Sizes: page title 24/32 600; card title 18/26 600; body 16/24 400; table 14/20; label 13/18 500; vital and dose numbers 30/36 600. Spacing scale 4, 8, 12, 16, 24, 32, 48. Radius: cards 16, controls 12, pills full. One soft shadow: 0 1px 2px rgba(18,32,26,.06), 0 4px 16px rgba(18,32,26,.06). Minimum target 44x44. Motion 150ms fades at most, off under prefers-reduced-motion. No blur or glass.

LAYOUT
Mode bar on top. Left side menu 240px (72px folded) in forest: Ward board, Labs, Recovery (Recovery mode only), and Admin (admins only). Lock button always visible at the bottom with the signed-in user's initials and role. Top row: search by name, MRN or bed; unit name; clock with a clock-check icon; device name. No right-hand detail panel anywhere. Design for 1366x768 first, also 1920x1080 and 1024px tablets. Below 900px wide show one message asking for a laptop or tablet.

PAGES AND ROUTES (one URL per page; each page does one job; never show a list and an item's details together)
/sign-in: pick name from active staff (initials in circles), PIN keypad (3x4, 64px keys), leaf art. 5 wrong tries gives a 1-minute wait.
/lock: after 5 idle minutes or on Lock; keeps work in progress; Switch user.
/setup/1 to /setup/5 (admin, one step per page): name device and unit; create admin PIN and recovery key; add staff; import snapshot; download and test the AI model.
/ward (home): table with Bed, Patient (name, age), Next due, Alerts (one combined chip for overdue, drafts, critical). Filter chips My patients, Overdue, Drafts, Critical. Snapshot age banner. Opening a patient shows a confirm box with name + date of birth + MRN.
/patients/:id: patient summary with 5 tiles only: Next medicine due, Latest vitals, Drafts waiting, Alerts, Body. Each tile links to its page. Chart tab links underneath: Timeline, Medicines, Vitals, Intake/Output, Notes, Body, Orders, Handoff.
/patients/:id/timeline: entry cards newest first with time, form picture, 2 key values, status, AI badge; New entry button. A card opens /entries/:entry.
/patients/:id/meds: medicine picture cards grouped Scheduled, As needed, Infusions, with drug, dose, route, next time, status (Due, Given, Held, Refused, Overdue).
/patients/:id/meds/:order: one medicine: picture, order details, dose history.
/patients/:id/meds/:order/record: record a dose, pre-filled from the order; site chosen on the body map.
/patients/:id/vitals: SVG trend chart plus flowsheet table; out-of-range values marked; pre-outage values labelled Before downtime.
/patients/:id/io: in and out lists, shift totals, balance graphic.
/patients/:id/notes: notes and risk scores with a category filter.
/patients/:id/body: body map front and back with markers, marker list beside it.
/patients/:id/orders: orders and allergies, read-only, labelled with the snapshot time.
/patients/:id/handoff: Situation, Background, Assessment, Open items drafted from confirmed entries only; each line links to its source entry; editable; print.
/patients/:id/capture: form tiles (Vitals, Medication, Intake/Output, Note, Lab) with form drawings; Type it or Take photo; Saved message at once; photo check chip with Retake and Use anyway.
/capture/:entry/confirm: paper photo left, field rows right; Reject, Edit, Confirm.
/entries/:entry: values, paper photo, who, when, device, AI badge; links History, Correct, Mark entered in error (asks for a reason).
/entries/:entry/history: all versions, old ones struck through. /entries/:entry/correct: correction form.
/labs: Pending, Critical (who was told, when, read-back done), Overdue. /labs/:lab: one result.
/drill/compare (Drill only): the same fake form read by device and by cloud side by side with times; differing fields highlighted; nothing saved.
/recovery/gate (admin): checklist, admin PIN, one switch Network cleared · start Recovery, confirm box, audit entry; switches the app to Recovery.
/recovery: progress (e.g. 11 of 45 signed off), filters, rows with priority, patient, entry, flag chip (Duplicate, Time conflict, Missing field, Recheck), status.
/recovery/:item: paper photo, saved value and cloud reading side by side, differing fields in red; Keep saved value, Correct, Sign off; duplicates shown together.
/export (admin): counts ready and not ready, FHIR R4 bundle download, encrypted backup, export history.
/admin: 7 tiles (one word + one status each) linking to:
/admin/readiness (AI model, disk space, device power, browser version, snapshot age, last backup, clock), /admin/downtime (declare, live status, end only when the worklist is finished, history), /admin/snapshot (last import, row counts, import new; blocked in Downtime), /admin/staff and /admin/staff/:id (add, deactivate, reset PIN; never delete), /admin/devices and /admin/devices/:id, /admin/audit and /admin/audit/:seq (read-only, filters, chain check result), /admin/settings/general, /high-alert, /units, /roles, /keys.
Unknown URLs go to /ward with a short not-found message.
Print styles for medicines, vitals, handoff and a patient summary: black on white, patient identifiers on every page, page numbers, printed by and when.

NAVIGATION
- Clicking a row or card opens its own page. Detail pages show a breadcrumb, e.g. Ward board > Sam Rivera > Medicines > amLODIPine.
- Keep filters, sort and page number in the URL query, so Back returns to the same place. Browser Back, refresh and bookmarks work on every page.
- If the app is locked, ask for the PIN, then open the requested URL.
- Load each page's data only when the page opens.

TEXT AND DENSITY LIMITS (hard limits)
- Page title: 4 words or fewer. One primary (forest) button per page.
- List rows: 3 to 5 fields. Tables: at most 6 columns. 10 rows per page, then Next and Previous.
- Labels: 3 words or fewer. Helper text: one line, 12 words or fewer. No paragraphs inside the app; longer help behind a small What is this? link that opens a short popover.
- Cards: picture, title, one value, one status chip, one link.
- One banner at a time (the most important); others behind a 2 more alerts link.
- Forms: at most 7 fields visible; the rest behind More fields; long forms become steps of one page each.
- Patient banner: one line, 56px tall: name, age, date of birth, MRN, bed, allergy chip; code status and isolation as small chips only when they apply.
- Confirm boxes: one sentence and two clearly named buttons. Empty states: one line, one button, one leaf drawing.
- At least 24px between cards, at most 3 cards in a row. Show values, not sentences: Heart rate 78 /min.
- Pictures replace helper sentences; they never add clutter.

MEDICAL SAFETY DISPLAY RULES (must all hold)
1. Doses: never a trailing zero (5 mg, not 5.0 mg), always a leading zero (0.5 mg). Lab results keep their reported precision.
2. Units always shown beside the number and picked from a fixed list; write units, never U.
3. Drug names keep the Tall Man capitals stored in the data (amLODIPine, HYDROmorphone).
4. High-alert drugs (insulin, heparin, HYDROmorphone, potassium chloride; editable in settings) show a red banner and a red ring on their picture, and cannot be confirmed until a second, different nurse enters their own PIN.
5. The patient banner with the allergy chip (red; grey for No known allergies) is on every patient page.
6. Opening a chart or switching patient asks the nurse to confirm name + date of birth + MRN.
7. AI proposals look like drafts (dashed border, pale yellow, label AI proposal) with the paper photo beside them, until confirmed. Confirm stays disabled until every unclear field is checked.
8. 24-hour times and written months (14:05, 14 Nov 2026).
9. Entries from a device whose clock was not recently checked show a clock warning.
10. Never rely on colour or a picture alone: every status has words and an icon.

NEVER HIDE (safety beats tidiness)
The mode bar, the patient banner with the allergy chip, the Device or Cloud badge on every AI result, the high-alert banner and second-nurse PIN, unclear-field highlights on the confirm page, and the Lock button stay visible on every page where they apply.

ILLUSTRATIONS
- All pictures are inline SVG components in /src/illustrations: flat shapes using only the design tokens, 2px rounded strokes, no gradients, no photos, no faces, no brand logos. Every picture has an aria-label, or is aria-hidden when the same words are beside it.
- BODY MAP: component BodyMap with neutral front and back outline figures, split into 24 tappable regions (head, chest, abdomen left, abdomen right, upper back, lower back, buttocks, and left and right upper arm, forearm, hand, thigh, lower leg, foot, heel), each at least 44px and reachable by keyboard. Markers: injection site (forest dot, syringe icon), IV line (cloud-blue dot, drop icon), skin concern (check-yellow fill, red if serious), pain (red outline with the score). Every marker is also listed in text beside the figure. Map med_admin.site text to regions with a fixed table (for example Abdomen, left side; Left forearm IV line; Right hand IV line) and use note.body_site. In the seed data show Lena Ortiz's two insulin sites, the IV line sites and red heels for Tom Hale. On the record-dose page, tapping a region writes the standard site text; for injections show the last 3 sites so the nurse can rotate.
- MEDICINE PICTURES: component MedPicture chosen from the order's route and frequency: PO tablet (capsule or cup variants), IV single dose syringe and vial, continuous infusion IV bag on a pump with the rate, SC and IM injection pen or syringe, SL small tablet, TOP cream tube, PR suppository, NG feeding tube, inhaled inhaler. Under the picture on the medicine page show: Picture shows the type only. Pictures must never look like a specific real product, colour or imprint.
- OTHER PICTURES: vitals (heart, lungs, thermometer, arm cuff, fingertip clip, blood drop, pain face scale) beside each number and trend line; intake/output (glass and IV bag in, measuring jug out, balance graphic); a drawing of each paper form on the capture tiles; photo check problems drawn as blurry, cut-off, dark and glare pages; labs test tube (red when critical); isolation and diet chips (mask, gloves, plate, crossed-out plate); mode drawings (training cap, tick, unplugged cable, cloud); readiness checks (chip, disk, laptop, clock); handoff (two figures without faces passing a clipboard); layered paper-cut leaf art on sign-in, lock and setup.

ROLES (from practitioner.role; enforce in code; show blocked buttons greyed out with the reason)
- RN and LPN: chart, confirm, correct own entries (RN can correct others with a reason), write handoffs, sign off worklist items. RN can be the second checker on high-alert drugs.
- Admin: declare and end downtime, open the network gate, import snapshot, export, manage staff, devices and settings, read the audit log. Admins do not chart.

STATES (every page where they apply)
Loading skeletons; empty state with the next step; plain-language errors that say the data is safe and offer Try again; Saved with time; AI working with a Type it instead button; AI not available banner; old snapshot banner (yellow, red after 12 hours); clock not checked; storage low; second look not available; no permission; unsaved changes prompt; wrong PIN.

ACCESSIBILITY
WCAG 2.2 AA. Full keyboard use with a visible 2px focus ring; shortcuts / search, N new entry, L lock. Labels above fields, errors in words beside the field, aria labels on icon buttons, focus trapped in dialogs, live regions for messages, works at 200% zoom. Plain words and sentence case; no unexplained abbreviations.

FLOWS (each must work end to end)
1. Charting: sign in > ward > confirm patient > timeline > new entry > take photo > photo check clear > confirm > new card with Device badge. At most 3 taps after the photo.
2. Giving a medicine: medicines > record dose > site on body map > (high-alert: second nurse PIN) > confirm > status Given.
3. Blurry photo: photo check says Blurry > Retake or Use anyway; the first photo stays saved.
4. Fixing a mistake: entry page > Correct > new value and reason > old version struck through.
5. Shift handover: handoff page > review > print.
6. Recovery: admin opens the gate > bar turns ocean blue > worklist > Recheck item > compare photo, saved value and cloud reading > correct > sign off > admin exports.
7. Practice: Drill mode on the seed data, with Compare available.
8. Body view: patient summary > Body tile > body page > tap a marker > its entry page.

HOW TO WORK
1. First reply: the file tree, the TypeScript types generated from the seed file (plus note.body_site), the route table, the illustration component list, the body map region table and the build order. Then carry on building without waiting for approval.
2. Build in this order: tokens and base components, illustration components, data layer with encryption and audit chain, sign in and lock, routing and layout, ward and patient pages, capture and confirm, entry pages, body map, handoff, recovery, admin pages, print styles, tests.
3. Give complete files, never fragments or placeholders such as TODO. If a reply runs out of room, stop at a file boundary and continue in the next reply.
4. Do not invent data: Drill uses only the seed file. Do not add features that are not listed.

DONE WHEN
- Every page in PAGES AND ROUTES works in Drill mode on the seed data, including: the 50 mg vs 5 mg Recheck for Sam Rivera, the Duplicate acetaminophen for Grace Bell, the Time conflict from device dev-02, the Missing field for Rosa Santos, the corrected vitals for Mei Chen, two drafts, the critical potassium for Arjun Mehta, and the body map markers.
- No page shows a list and an item's details together, and every page meets the TEXT AND DENSITY LIMITS at 1366x768.
- Back, refresh and bookmarks work on every route, including after the lock screen, and filters survive going into a detail page and back.
- The audit chain verifies 153 of 153 seed records.
- With the network off and the browser reopened, charting and every picture still work and no outside request is made. No cloud call is possible in Downtime mode.
- Every item under MEDICAL SAFETY DISPLAY RULES, NEVER HIDE, ROLES, STATES and ACCESSIBILITY is met.
```

## 20. Make it simple for nurses (change prompt)

Nurses have no time to learn a big system. So the nurse side of the app is cut down to a few big buttons and everyday words. Details are hidden behind a **View details** button. Admin pages stay, but nurses never see them.

**Word changes (what the nurse sees):**

| Old word | New word |
| --- | --- |
| Ward board | My patients |
| Timeline | History |
| Capture / New entry | Add |
| Confirm | Save |
| Draft / AI proposal | Check this |
| Intake/Output | Fluids |
| Handoff | Handover |
| Recovery worklist | To check |
| Second look | Double check |
| Entered in error | Wrong patient or mistake |
| Snapshot | Patient list |
| Drill / Ready / Downtime / Recovery | Practice / Normal / System down / Back online |

**How to use it:** paste the box below into the same AI chat where your app is being built. It changes the app you already have; it does not start again.

```
CHANGE REQUEST: MAKE THE APP SIMPLE FOR NURSES
Keep all data, safety rules, modes, AI rules and admin features you already built. Change only what nurses see and how they move around. Nurses are busy and will not learn a big system. A new nurse must be able to use it in 2 minutes with no training.

1. NURSE MENU: ONLY 4 BUTTONS
Nurses see only: My patients, Add, Handover, Alerts. Put everything else (Labs, Orders, Settings) under a More button. Admin pages are only shown to admins, in a separate Admin area.

2. HOME = MY PATIENTS
Big cards, one per patient, 2 or 3 per row. Each card shows only: bed, name, age, allergy chip, and one status line (for example Medicine due 14:00, or All done). Tap the card to open the patient.

3. PATIENT PAGE: 4 BIG BUTTONS
Top: the patient banner (name, age, date of birth, MRN, bed, allergy chip). Below it, 4 big picture buttons: Give medicine, Vitals, Fluids, Note. Next to them, one Photo of paper button. Under the buttons, only the last 3 records, each in one line. Everything else (full history, vitals chart, body map, orders, labs) sits behind one View details button.

4. ADDING SOMETHING = SHORT STEPS
One small question per screen with big buttons, like a phone app. Example for a medicine: pick the medicine (picture cards) > check the dose > tap where on the body > Save. Show a step counter (Step 2 of 4) and a Back button. Never show more than 5 fields at once.

5. SIMPLE WORDS EVERYWHERE
Use these words on screen: My patients, History, Add, Save, Check this, Fluids, Handover, To check, Double check, Wrong patient or mistake, Patient list. Modes: Practice, Normal, System down, Back online. Buttons: 1 to 3 words. No helper sentences on screen by default; a small ? button shows a one-line tip. No codes, no abbreviations a new nurse would not know.

6. LESS ON SCREEN, MORE BEHIND BUTTONS
Show the key number big (for example Heart rate 78). Hide who, when, which laptop, AI details and full history behind View details. Lists show 5 items, then Show more. Tables only inside View details.

7. GUIDE THE NURSE
- First sign-in: a 3-screen welcome tour with pictures (how to add, how to save, where alerts are). Skip button.
- If something needs the nurse, show one clear banner with one button, for example: 2 records need checking > Check now.
- After Save, show a big green tick and Saved for 2 seconds, then go back to the patient page.
- Empty pages: one picture, one line, one button.

8. KEEP SAFE (DO NOT REMOVE)
The mode bar (with the new mode words), the patient banner with allergies, the confirm name + date of birth check, the yellow Check this highlight on AI values, the high-alert red banner and second nurse PIN, the Device/Cloud badge (small, on the result), the no-trailing-zero dose rule and the Lock button stay visible where they apply.

HOW TO WORK
First reply: list the pages and components that change. Then give the complete changed files only, no fragments or TODOs. Do not remove features; move them behind More or View details.

DONE WHEN
- A nurse can give a medicine in 4 taps or fewer after opening the patient.
- The nurse menu has only 4 buttons, and nurses never see admin pages.
- Every screen uses the simple words above, and no screen has a paragraph of text.
- All safety items in point 8 still show where they apply.
```
