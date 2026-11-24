# Gemini Nano on a second (compatible) Windows laptop

Goal: one genuine on-device inference run (Demo B), on synthetic data only. Nothing here is verified yet; record results only after they really happen.

## 1. Check the laptop first (5 minutes, no installs)

| Requirement (Chrome's documented minimum) | How to check on Windows |
|---|---|
| Windows 10 or 11 | Settings → System → About |
| **Either** a GPU with **more than 4 GB** dedicated video memory | Task Manager → Performance → GPU → "Dedicated GPU memory"; or `msinfo32` → Components → Display → Adapter RAM |
| **or** at least **16 GB RAM and 4 CPU cores** | Task Manager → Performance → Memory / CPU ("Cores", not logical processors) |
| **22 GB free** on the drive with the Chrome profile (usually C:) | File Explorer → This PC |
| Desktop Google Chrome **148 or later** | `chrome://settings/help` |
| Unmetered network for the model download | — |

If it fails, stop. Don't use flags or workarounds to force it.

## 2. Prepare Chrome

1. Update Chrome; note the version from `chrome://version`.
2. For paper photos: `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → Relaunch.

## 3. Run ClinBridge on that laptop

Install Git and Node.js 22 LTS, then in PowerShell:

```powershell
cd "$HOME\Documents"
git clone https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon.git
cd ClinBridge_FireBaseAILogicHackathon
npm ci
npm run dev
```

On-device AI needs **no Firebase cloud setup and no App Check**, only the three required config values. Copy `.env.local` from the main PC by a private route (USB stick or your own cloud drive; never chat, email to others, or Git). For on-device-only tests you can leave out `VITE_FIREBASE_APPCHECK_SITE_KEY` and `VITE_FIREBASE_APPCHECK_DEBUG`.

## 4. Download and check the model (network on)

1. http://localhost:5173/sign-in → **Use practice passphrase** → **Kim Ellis**, PIN 2468 → More → **AI check**.
2. Press **Prepare on-device model** and wait for "ready" (can take a long time).
3. **Check again**: Prompt API OK, text input OK, image input OK.
4. `chrome://on-device-internals`: note the model name and version.

## 5. The genuine on-device test (Wi-Fi off, done by hand)

Do this yourself: the Claude in Chrome extension can't drive the browser without internet.

1. Network on: Kim Ellis → Admin → Downtime → **Start a practice outage**.
2. F12 → Network tab → tick Preserve log → clear.
3. **Turn Wi-Fi off.** (Not DevTools "Offline": that also blocks the local dev server.)
4. Switch user → **Daniel Okafor** → a fictional patient → **Photo of paper** → **Vitals sheet** → a synthetic form photo (drawn in Device vs Cloud → "Synthetic paper form (image)", screenshotted beforehand).
5. **Propose values from the photo**. Expected: a proposal labelled **"On this laptop · ONLY_ON_DEVICE · N ms"**.
6. Check the Network log: **no request to any non-localhost host**.
7. **Put these values in the form** → correct → Review → save as draft → the entry shows **"Device AI"** → **Check and confirm**.
8. Optional Device vs Cloud: Wi-Fi back on → Admin → Downtime → clear the network → More → Device vs Cloud → same synthetic input → **Run on-device model** and **Run cloud model** (cloud needs App Check: register a new debug token as in `docs/DEMO_WALKTHROUGH.md`, revoke it afterwards).

## 6. Record (no keys or tokens)

```
Laptop model / Windows version:
CPU cores / RAM / GPU + dedicated VRAM / free disk:
Chrome version:              Multimodal flag: on/off
Model (chrome://on-device-internals):
AI check rows (API / text / image):
Proposal label + ms:
Values vs known values:
External requests during step 5 (must be 0):
Saved draft label ("Device AI"):
Errors:
```

Send this back and it goes into `TEST_REPORT.md` and `docs/AI_TEST_MATRIX.md`. Only then may the demo say Gemini Nano works.
