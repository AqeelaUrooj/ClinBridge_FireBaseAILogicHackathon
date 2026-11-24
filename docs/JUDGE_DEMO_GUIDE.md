# Judge demo guide

ClinBridge keeps nursing documentation going when the hospital's EHR is down. This public demo has **fictional patients only**. Please never type real patient details and never photograph a real paper form.

## Live website

**https://clinbridge-hackathon.web.app** (released and tested on 24 Nov 2026: [RELEASE_REPORT_2026-11-24.md](RELEASE_REPORT_2026-11-24.md))

Or on your own computer: `npm ci`, `npm run build:judge`, `npm run preview:judge`, then open http://localhost:4175.

## Install it (Windows laptop, Chrome or Edge)

1. Open the website. Wait for **"Saved in this browser. It now opens without internet."** (about 6 MB, once).
2. Click **Install Practice App** and answer your browser's question.
   If no question appears: Chrome: install icon in the address bar, or ⋮ → Cast, save and share → Install page as app. Edge: "App available" in the address bar, or … → Apps → Install this site as an app.
3. **ClinBridge Practice** opens in its own window and is in the Start menu.

It is a web app that your browser installs. There is no `.exe`. You can also use everything in the browser tab with **Launch Practice Demo**.

## Practice access

| Step | What to do |
|---|---|
| "Unlock records on this laptop" | Click **Use practice passphrase** (public on purpose; it appears after a reload or restart) |
| Who are you? | Choose a fictional person. **Daniel Okafor** is a nurse (RN), **Kim Ellis** is the admin |
| PIN | **2468** for everyone (shown on the screen) |
| Patient check | "Is this the right patient?" → **Yes, open** |

Nurses chart. The admin declares the outage, clears the network and runs the recovery.

## Recommended demo (about 6 minutes)

1. Open the landing page and **Install Practice App**. Open ClinBridge Practice from the Start menu.
2. Sign in as **Daniel Okafor**. Open two patients from the ward board.
3. Lock → Switch user → **Kim Ellis** → Downtime Management → **Start a practice outage**. The banner says SYSTEM DOWN. This is a *simulated EHR outage*.
4. **Switch the laptop's Wi-Fi off.** This is the *real* loss of network. Close the ClinBridge window and open it again from the Start menu. Unlock and sign in as Daniel Okafor.
5. Record vitals, write a note, look at the medicines (MAR) and the body map.
6. Patient → **View handwritten report**: Assessment sheet, Shift report, Bedside worksheet, Pocket notes. Try the picture download and print.
7. Close the window, open it again: what you saved is still there.
8. Switch Wi-Fi on. The banner still says SYSTEM DOWN: a network alone clears nothing.
9. **Kim Ellis** → Downtime Management → tick the three checks → PIN → **Clear network — Back online** → Recovery Gate & Worklist.
10. More → Export: **Prepare export file** → FHIR R4 file for the EHR team. ClinBridge does not send it anywhere.

Optional, only while Back online and when cloud AI is set up for this site: More → **Device vs Cloud**.

## Known limitations

- Fictional data only. Not approved for real patients. Clinical rules and warning ranges are prototypes.
- Data stays in this browser profile on this laptop. Nothing is synchronized with other devices. No hospital EHR is connected.
- On-device AI (Gemini Nano) needs a supported Chrome version, hardware and a downloaded model. Many laptops do not have it. ClinBridge then says so, never switches to the cloud by itself, and manual charting continues.
- Cloud AI is blocked while the system is down, and off when this site has no Firebase project or App Check.
- The Practice passphrase and PIN are public. They protect nothing on this site; the same encryption code runs as in the full app.
- Installation was tested on Windows 10 with Chrome. Edge, macOS, iPhone, iPad and Android were not tested.
- A preview address is temporary: an app installed from it stops being updated when the preview ends.

## Trouble with installing or the first start

| What you see | What to do |
|---|---|
| "Saving the app for offline use" does not finish | Check the internet and reload the page. Nothing is kept from a cut-off download; the next visit starts it again |
| No install option | It may already be installed (Start menu). Incognito or Guest windows cannot install. Use Chrome or Edge |
| The first start was cut off (window closed, power) | Open it again → **Use practice passphrase**. The fictional records are completed by themselves |
| "Unlock records on this laptop" | Normal after every reload, restart or visit to the public page. **Use practice passphrase** |
| "A newer version of ClinBridge is ready" | Close every ClinBridge window and tab, then open it again. Records stay |
| Start again with clean fictional data | More → **Reset practice** |
| "Storage could not open" | Leave private mode or allow site data for this address, then reload |
| Remove it | Start menu → right-click → Uninstall (or ⋮ in the app window). The records stay in the browser until you clear this site's data |

## Public demo and a hospital: what is different

The website is a special build (`npm run build:judge`). It opens Practice only: the database layer refuses Real records, the first-time setup for Real records is not in the code, and an old preference for Real records is ignored.

This is **not a security boundary**. The source code is public, and everything in a web page runs on the visitor's own computer. It only keeps visitors of this website from entering real patients by mistake. What protects people here is that there are no real patients, no server that receives records, and an address of its own.

A hospital would need much more and it does not exist today: clinical, security and legal approval, managed laptops with disk encryption, its own hosting and passphrases, approved clinical rules, and a real connection to its EHR.
