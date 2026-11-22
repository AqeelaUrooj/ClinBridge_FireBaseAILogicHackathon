# ClinBridge demo video: 3-minute script and shot list

For the #BuildHybridAI 2026 Devpost entry. **Limit: 3:00** (judges may stop at 3:00). English narration. Upload to YouTube as public or unlisted, then paste the link into Devpost.

Rules for this video:
- Real app footage only, recorded on this PC from `npm run dev` with fictional Practice data.
- No fake model output shown as live AI. Every AI answer on screen must come from a real call made while recording, and its label ("Cloud · ONLY_IN_CLOUD · N ms") must be visible. Never show a "Simulated proposal" seed record as AI.
- Gemini Nano: show the real "can't run on this laptop" message and say so. Show on-device inference only if it has actually been filmed on a compatible laptop (see the end of this file).
- Never show the browser console, `.env.local`, the Firebase console token list or any key. Close DevTools before recording, except the Application tab in scene 6.
- No third-party logos beyond what the app itself shows. Don't use the stock photos from the Stitch ZIP.

## Before recording (about 15 minutes, network on)

1. Terminal: `git switch main`, `git pull --ff-only`, `npm run dev`. Open http://localhost:5173 in Chrome, window about 1440 × 900, zoom 100%.
2. App Check debug token: the one registered on 22 Nov ("DESKTOP-6NQ637E localhost dev (22 Nov)") works in the same Chrome profile. If a cloud call returns 401, register a new token as in `docs/DEMO_WALKTHROUGH.md` (before the demo, step 2), **off camera**.
3. More → **Reset practice** for clean fictional data.
4. Make the paper-form photo: More → Device vs Cloud → **Synthetic paper form (image)**, take a screenshot of the form and save it as `paper-form.png` on the Desktop (fictional values).
5. Do one cloud call off camera (Device vs Cloud → Run cloud model) so the first App Check exchange (about 11 s) isn't in the video. Then Reset practice again.
6. Turn off notifications (Windows Focus Assist on). Close other tabs. Hide the bookmarks bar (Ctrl+Shift+B).
7. Recording: OBS Studio (installed) → Sources → **Window Capture** → the Chrome window. Settings → Output → MKV or MP4, 1080p, 30 fps. Record each scene as its own clip; it's easier to redo one.
8. Microphone: record the narration live while clicking, or record the screen silently and add the voice afterwards (Clipchamp, the Windows Photos video editor, or the YouTube editor).

## Shot list and narration

The narration is about 320 words: at a calm 130–140 words per minute that's about 2:20–2:30 of speech, which leaves room for pauses while pages load. Times are cumulative.

| # | Time | Screen (what you click) | Narration |
|---|---|---|---|
| 1 | 0:00–0:15 | ClinBridge lock screen (title visible). Slow zoom or static | "When ransomware takes a hospital's records offline, nurses go back to paper for days, sometimes weeks. Afterwards, every vital sign and every dose has to be typed back in. ClinBridge keeps that documentation digital, safe and offline." |
| 2 | 0:15–0:32 | **Use practice passphrase** → sign in as **Daniel Okafor (RN)**, PIN 2468 → **My Patients** → **Arjun Mehta** → "Is this the right patient?" (name, birth date, MRN) → **Yes, open** | "It runs in Chrome on a ward laptop. This is fictional practice data. A nurse signs in with a PIN, and before charting, ClinBridge makes them confirm the patient: name, date of birth and record number." |
| 3 | 0:32–0:50 | More → **Switch user** → **Kim Ellis (Admin)** → **Downtime Management** → **Start a practice outage**. Hold on the red banner "AI on this laptop only · Cloud blocked". Then More → **Device vs Cloud**: the cloud button is disabled ("Cloud blocked") | "An admin declares the outage. From now on the app blocks every cloud call, even one that was already running. AI may only run on the device itself." |
| 4 | 0:50–1:10 | More → **Switch user** → Daniel Okafor → Arjun Mehta → **Vitals** → **Record vitals** → type values → save. Quick cut: **Medication Schedule** and **Body Map** pages | "Nurses keep charting as usual: vitals, medicines with a second-nurse check for high-alert drugs, notes, fluids, lab results and handovers. Everything is saved on this laptop." |
| 5 | 1:10–1:35 | Arjun Mehta → **Photo of paper** → **Vitals sheet** → choose `paper-form.png` → **Propose values from the photo** → message "The on-device model can't run with images on this laptop. Type the values instead." → type the values → Review → tick "I re-checked these values" → **Save** → shows Confirmed with the photo. Keep the default "When measured" time | "Paper forms can be photographed. ClinBridge tries Gemini Nano on the device through Firebase AI Logic. On this laptop the hardware can't run Gemini Nano, and the app says so. It never falls back to the cloud during an outage. The nurse types the values beside the photo instead." |
| 6 | 1:35–1:50 | Reload the page → unlock → the vitals record is still there. Optional: DevTools → **Application** → IndexedDB → a row showing `_enc` ciphertext (Application tab only, never Console) | "Records are encrypted at rest with AES-256, survive a restart, and every change goes into a tamper-evident audit chain." |
| 7 | 1:50–2:05 | More → **Switch user** → Kim Ellis → **Downtime Management** → tick the three checks → PIN → **Clear network — Back online**. Banner: "Cloud allowed" | "When the systems return, an admin checks the network and clears it. Only now is cloud AI allowed." |
| 8 | 2:05–2:30 | **Recovery Gate & Worklist** → **Add new downtime records** → open the new photo record → **Run cloud second look**. Hold on the label "Cloud · ONLY_IN_CLOUD · N ms", the differences table and "Nothing was changed automatically" | "In the recovery worklist, Firebase AI Logic gives each photo record a second look with Gemini in the cloud, protected by App Check. This is a live response. It lists where its reading differs from what the nurse typed, but it never changes the record. The nurse decides." |
| 9 | 2:30–2:42 | Same page → **Export** → **Export (FHIR R4)** → **Prepare export file** → hold on the warning "Sensitive: this file is NOT encrypted" | "Checked records are exported as FHIR R4 for the EHR team. The export passes the official HL7 validator with zero errors." |
| 10 | 2:42–2:55 | More → **AI check**: the on-device readiness rows show it's unavailable on this PC | "To be clear: cloud inference is tested live. The on-device Gemini Nano path is built and tested with mocks, but not verified on real hardware yet." |
| 11 | 2:55–3:00 | Back to My Patients with the Back Online banner. Text overlay: "ClinBridge · open source (Apache-2.0) · github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon" | "ClinBridge. Charting that keeps going when the EHR doesn't." |

### Narration only (for reading aloud)

1. When ransomware takes a hospital's records offline, nurses go back to paper for days, sometimes weeks. Afterwards, every vital sign and every dose has to be typed back in. ClinBridge keeps that documentation digital, safe and offline.
2. It runs in Chrome on a ward laptop. This is fictional practice data. A nurse signs in with a PIN, and before charting, ClinBridge makes them confirm the patient: name, date of birth and record number.
3. An admin declares the outage. From now on the app blocks every cloud call, even one that was already running. AI may only run on the device itself.
4. Nurses keep charting as usual: vitals, medicines with a second-nurse check for high-alert drugs, notes, fluids, lab results and handovers. Everything is saved on this laptop.
5. Paper forms can be photographed. ClinBridge tries Gemini Nano on the device through Firebase AI Logic. On this laptop the hardware can't run Gemini Nano, and the app says so. It never falls back to the cloud during an outage. The nurse types the values beside the photo instead.
6. Records are encrypted at rest with AES-256, survive a restart, and every change goes into a tamper-evident audit chain.
7. When the systems return, an admin checks the network and clears it. Only now is cloud AI allowed.
8. In the recovery worklist, Firebase AI Logic gives each photo record a second look with Gemini in the cloud, protected by App Check. This is a live response. It lists where its reading differs from what the nurse typed, but it never changes the record. The nurse decides.
9. Checked records are exported as FHIR R4 for the EHR team. The export passes the official HL7 validator with zero errors.
10. To be clear: cloud inference is tested live. The on-device Gemini Nano path is built and tested with mocks, but not verified on real hardware yet.
11. ClinBridge. Charting that keeps going when the EHR doesn't.

Captions: `docs/DEMO_VIDEO_CAPTIONS.srt` has the same text with the times above. Upload it on YouTube (Subtitles → Upload file → With timing) and adjust the times if your cut differs.

## Editing and upload checklist

- [ ] Total length 3:00 or less (check in the editor before exporting).
- [ ] Scene 8 shows a real cloud answer with its "ONLY_IN_CLOUD" label, recorded in this session.
- [ ] No console, token, key, `.env.local` or Firebase console visible in any frame.
- [ ] Only fictional Practice patients are visible.
- [ ] Export 1080p MP4.
- [ ] YouTube: title "ClinBridge: Hybrid AI Charting When Hospital EHRs Go Down (#BuildHybridAI 2026)", visibility Public or Unlisted, no password, "not made for kids". **The owner uploads; Claude doesn't.**
- [ ] Paste the YouTube URL into Devpost → Project details → Demo video URL.

## If a Gemini Nano laptop becomes available

Follow `docs/GEMINI_NANO_SECOND_LAPTOP.md` on that laptop. Only if a real on-device answer appears (label showing on-device / `ONLY_ON_DEVICE`, with the network log empty during the call), replace scenes 5 and 10:

- Scene 5 (1:10–1:35): Photo of paper → **Propose values from the photo** → the values appear with the on-device label → nurse checks and saves. Narration: "During the outage, Gemini Nano reads the photo right here on the laptop through Firebase AI Logic. Nothing leaves the device, and the nurse checks every value before saving."
- Scene 10 (2:42–2:55): More → Device vs Cloud, both answers side by side, each labelled with where it ran. Narration: "The same form, on device and in the cloud, each labelled with where it really ran."

Then update the Devpost text and `README.md` to say Gemini Nano was verified live, with the date and laptop model.
