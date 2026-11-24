# Physical tests that a person must do

On the live site https://clinbridge-hackathon.web.app, Windows laptop, Google Chrome, fictional data only. These steps cannot be done from a program: Chrome's own dialog, the Wi-Fi switch and a Windows restart. About 10 minutes.

**State on 25 Nov 2026: none of these is verified.** Automatic tests did the same with a test command instead of the dialog, and with a Chrome that could reach no address instead of Wi-Fi off ([RELEASE_REPORT_2026-11-24.md](RELEASE_REPORT_2026-11-24.md)). A Start menu entry "ClinBridge Practice" that those tests did not make, and a note "created while Wi-Fi was disconnected" on the preview, were seen on the owner's PC; the owner has not reported the steps, so they do not count.

Before you start: remove a ClinBridge Practice app that was installed from the **preview** address (⋮ in its window → Uninstall). It belongs to the preview and stops being updated on 2 Dec 2026.

## Test 1. Install with Chrome's own dialog

- [ ] Open the live site. Wait for "Saved in this browser. It now opens without internet."
- [ ] Click **Install Practice App** → Chrome's dialog → **Install**.
- [ ] Expected: the page does not say "installed" before you click Install; then an own window opens at the sign-in page; name "ClinBridge Practice" and the ClinBridge icon; an entry in the Start menu.
- [ ] Also try **Cancel** in the dialog once (before installing): the page says "Not installed."

## Test 2. Wi-Fi really off

- [ ] Kim Ellis (PIN 2468) → Downtime Management → **Start a practice outage**. Banner: SYSTEM DOWN.
- [ ] Taskbar → network icon → **Wi-Fi off**. Pull any network cable. Check: another website does not open.
- [ ] Close the app window. Start **ClinBridge Practice** from the Start menu → **Use practice passphrase** → Daniel Okafor, PIN 2468. Ten patients are there; "Network: None" on the sign-in page.
- [ ] Sam Rivera → **Yes, open** → **Record vitals** → Pulse **81** → Review → Save.
- [ ] Left menu → My Patients → Sam Rivera → **Add Note** → write "Physical test, fictional" → Review → save it.
- [ ] Sam Rivera → **View handwritten report (synthetic)** → all four designs; download one picture. Left menu → Medication Schedule and Body Map.
- [ ] More → Device vs Cloud: "Cloud blocked: System down".

## Test 3. Windows restart while offline

- [ ] Wi-Fi stays off. Start → Power → **Restart**.
- [ ] Start ClinBridge Practice from the Start menu → unlock → Daniel Okafor → Sam Rivera. Expected: pulse 81 in Vitals Flowsheet (left menu) and the note under **View details** (history).
- [ ] Switch the laptop off completely and on again, still offline: the same.

## Test 4. Network back

- [ ] Wi-Fi on. Expected: the banner still says SYSTEM DOWN.
- [ ] Kim Ellis → Downtime Management → tick the three checks → PIN → **Clear network**. Banner: Back online.
- [ ] Recovery Gate & Worklist → Export → Prepare export file → the file can be downloaded (fictional data).

## Test 5. Remove

- [ ] ⋮ in the app window → Uninstall. The Start menu entry is gone. Opening the site again still shows the saved records (they belong to the browser) until this site's data is cleared.
- [ ] Install again for the demo. More → **Reset practice** gives clean fictional data.

## Results

```
Date and time (with time zone):         Person:
Laptop / Windows version:               Chrome version:
Test 1 dialog: pass / fail              Cancel shows "Not installed": pass / fail
Test 2 Wi-Fi off (how checked):         pass / fail
Test 3 restart:  pass / fail            power off and on: pass / fail
Test 4:          pass / fail            Test 5: pass / fail
What was different from expected, word for word:
```

A failed step is written down as failed. Pictures: no DevTools, no real patient data.
