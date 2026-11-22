# PR #14 review walkthrough (about 20 minutes)

For the owner, to check every new screen locally before approving the merge. **Practice (fictional patients) only.** Nothing here prints by itself; when a print dialog opens, press **Cancel**.

## 0. Start

In PowerShell, in `D:\ClinBridge_FireBaseAILogicHackathon`:

```powershell
git fetch origin
git switch feat/v3-zip-completion
git pull --ff-only
npm run dev
```

(If `npm run dev` complains about missing packages, run `npm ci` once first.) `.env.local` and your browser data stay as they are.

Open http://localhost:5173 in desktop Chrome → **Use practice passphrase** → **Daniel Okafor (RN)** → PIN **2468**.

Tick each box as you go.

## 1. Ward board
- [ ] **My patients** has a **Paper form packets** button at the top right.

## 2. Patient summary
- [ ] Open **Sam Rivera** → "Is this the right patient?" → **Yes, open**.
- [ ] Below the action cards: **Paper forms for this patient** with three buttons (DT-MAR-01, DT-VIT-02, DT-SBAR-03).

## 3. Paper MAR (DT-MAR-01)
- [ ] Sam Rivera → **Give medicine** → **Paper MAR sheet**.
- [ ] Header: "PRACTICE · FICTIONAL PATIENT · NOT A MEDICAL RECORD", name **RIVERA, Sam**, MRN **DK-004512**, bed 4B, allergy **PENICILLIN**.
- [ ] Two orders: amLODIPine (09:00 "Given 09:00 (in ClinBridge)") and metoprolol (09:00 recorded, **21:00 blank line**).
- [ ] No barcode, QR code, NEWS2 or "verified" wording anywhere.

## 4. Real print dialog: single sheet
- [ ] Press **Print this sheet**. Chrome's print preview opens.
- [ ] The preview shows only the sheet: no sidebar, header or buttons; the identity strip at the top.
- [ ] Switch **Paper size** between A4 and Letter (under "More settings"): nothing cut off at the edges.
- [ ] Press **Cancel**. Do not print.

## 5. Vitals and I/O sheet (DT-VIT-02)
- [ ] Back to the patient → **Vitals**: an **Oxygen level (SpO₂) over time** chart beside the pulse chart, with a values table.
- [ ] **Paper vitals & I/O sheet**: blank time columns, "Last confirmed in ClinBridge" line, fluid grid, "ClinBridge does not calculate a coma scale total or any score".

## 6. SBAR sheet (DT-SBAR-03) and packet printing
- [ ] On the sheet page, open **SBAR handover (DT-SBAR-03)**: Sam has no saved handover, so the sheet says so and gives blank lines.
- [ ] Go to **My Patients** → **Peter Novak** → **View details** → **Handover** → **Paper SBAR sheet**: it prints the saved handover ("Peter Novak, 62, chest infection…") with its shift text.
- [ ] Part 2 (verbal orders) and Part 3 (signatures) are blank and labelled paper-only.
- [ ] **My Patients** → **Paper form packets**:
  - [ ] **Select all 10 patients** → "10 of 10 patients selected · 30 forms"; untick it → 0.
  - [ ] Untick all three forms → "Choose at least one form." and **Check the list** is disabled. Tick MAR and SBAR again.
  - [ ] Tick **Sam Rivera** and **Peter Novak** → **Check the list**: names, birth dates, MRNs, beds, allergies; "4 forms. The number of printed pages depends on…".
  - [ ] **The list is right: show the preview**: 4 sheets, Sam's two then Peter's two.
  - [ ] **Print the packet** → confirm dialog ("4 forms for 2 patients… The print dialog shows the real page count") → **Cancel**: nothing opens.
  - [ ] **Print the packet** → **Open the print dialog** → Chrome's preview shows each patient starting on a new page, the identity strip on every page → **Cancel**.

## 7. Patient history SpO₂ card
- [ ] **Peter Novak** → **View details**. On the right: **Oxygen level (SpO₂)**.
- [ ] Latest confirmed **94% at 04:55**, lowest **90% at 04:20**, **+4 points**.
- [ ] Chart: two joined dots and one grey square (00:05, 91%, hospital list before the outage). Table lists all three. No target line or score.

## 8. Phone width
- [ ] Chrome DevTools (F12) → device toolbar (Ctrl+Shift+M) → width 390.
- [ ] A **Menu** button replaces the sidebar; it opens over the page and closes after you pick a page or press Escape.
- [ ] **Paper form packets**: born date, MRN and allergies sit under each name; no sideways scrolling of the page.
- [ ] A paper sheet scrolls sideways inside its own box; the page itself does not.
- [ ] History cards: badges sit under the summary; the expand arrow stays on screen.
- [ ] Close DevTools.

## 9. Optional
- [ ] Download the `e2e-screens` artifact from the PR's CI run: screenshots and the multi-page test PDFs (fictional "LAYOUT TEST" rows).
- [ ] Offline: with the app open, set DevTools → Network → Offline, reload, unlock, sign in, open a paper sheet.

## Expected differences from the ZIP (not bugs)

No barcodes / QR / OCR marks, no NEWS2 or GCS totals, no "verified" or countersignature status, no printer status or direct printing, verbal orders are blank paper boxes, time columns are blank (no approved schedule). Reasons: `docs/V3_ZIP_COMPLETION_REPORT.md` sections 4–5.

## When you are done

Switch back with `git switch main` if you want. Then approve (or not) the merge of PR #14 on GitHub. The 24-region body map you chose is a separate follow-up PR.
