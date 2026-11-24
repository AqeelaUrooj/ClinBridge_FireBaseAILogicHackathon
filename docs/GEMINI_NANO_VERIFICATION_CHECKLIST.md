# Gemini Nano: compatibility and genuine verification checklist

For a laptop that can run Chrome's on-device model, with the **live site** https://clinbridge-hackathon.web.app (nothing has to be installed from GitHub). Fictional data only. Requirements read in the Chrome and Firebase docs on 25 Nov 2026.

**State today: not verified.** The only PC tested (DESKTOP-6NQ637E: 8 GB RAM, 2 cores, 2 GB video memory) is below the requirements; Chrome answers "unavailable". Nothing in this file is a result until it is filled in.

Local development route (clone, `npm run dev`): [GEMINI_NANO_SECOND_LAPTOP.md](GEMINI_NANO_SECOND_LAPTOP.md).

## Part 1. Is the laptop compatible? (5 minutes)

| # | Requirement (Chrome docs) | How to check on Windows | Found | OK? |
|---|---|---|---|---|
| 1 | Windows 10 or 11 (or macOS 13+, Linux, Chromebook Plus). No phones | Settings → System → About | | |
| 2a | GPU with **strictly more than 4 GB** video memory | Task Manager → Performance → GPU → Dedicated GPU memory | | |
| 2b | **or** 16 GB RAM or more **and** 4 CPU cores or more | Task Manager → Performance → Memory / CPU ("Cores", not logical processors) | | |
| 3 | **22 GB free** on the drive of the Chrome profile. The model is removed when less than 10 GB stay free | File Explorer → This PC | | |
| 4 | Desktop **Google Chrome 148 or later** (web pages). Not Edge, not Incognito for this test | `chrome://settings/help` | | |
| 5 | Unmetered network for the first download | | | |

2a **or** 2b is enough. If any row fails: stop here, write "not compatible" in Part 5. Do not force it.

Not stated in the docs: the model's size, whether image input needs a GPU (only audio is said to), and whether it works in an installed web app. Parts 3 and 4 therefore test the browser tab first and the installed app separately.

## Part 2. Prepare (network on)

- [ ] `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → Enabled → Relaunch (Firebase docs; needed for pictures). Write down whether it was needed.
- [ ] Open https://clinbridge-hackathon.web.app → wait for "Saved in this browser" → **Launch Practice Demo** → Kim Ellis, PIN 2468 → More → **AI check**.
- [ ] Press **Prepare on-device model**. Wait (several minutes or more). Then **Check again**: Prompt API, text input and image input are OK.
- [ ] `chrome://on-device-internals`: write down the model name and version. "Broker State" shows no error.
- [ ] DevTools console on the ClinBridge tab; the answer must be `"available"`:

```js
await LanguageModel.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }, { type: 'image' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] })
```

| Answer | Meaning |
|---|---|
| `available` | Go on |
| `downloading` | Wait; keep Chrome open |
| `downloadable` | Press **Prepare on-device model** (it needs a real click) |
| `unavailable` | Hardware, disk space, flag or language: not compatible |

## Part 3. Genuine run in the browser tab

Why by hand: Claude in Chrome cannot drive a browser without internet.

1. [ ] Network on: Kim Ellis → Downtime Management → **Start a practice outage**. The banner says SYSTEM DOWN.
2. [ ] F12 → Network → tick **Preserve log** → clear.
3. [ ] **Wi-Fi off, cable out.** Another website does not open.
4. [ ] Lock → Switch user → Daniel Okafor → More → **Device vs Cloud**. The cloud card says "Cloud blocked: System down".
5. [ ] Fictional patient **Tom Hale** → **Assessment sheet** → **Run on-device model**.
6. [ ] Write down the label, the time, every value, and copy the result with **Save answers (JSON)** before you change the design.
7. [ ] Repeat with **Shift report**, **Bedside worksheet**, **Pocket notes**, and **Synthetic note (text)**.
8. [ ] Network log: **no request to any other host** than `clinbridge-hackathon.web.app` (requests answered by the service worker are fine).
9. [ ] `chrome://on-device-internals` → Event Logs shows the prompts of these runs.
10. [ ] Photo of paper: a **made-up** sheet marked "PRACTICE – FICTIONAL" → **Propose values from the photo** → check against the paper → save as a draft → it says **"Device AI"** → **Check and confirm**.
11. [ ] Negative check: in a browser without the model (Firefox, Edge), still SYSTEM DOWN: "no on-device AI", nothing is sent, typing by hand works.

Known values for Tom Hale, 12:00 (the page shows them): 114/66, pulse 72, breathing 18, temperature 36.6, oxygen 95 %, oxygen flow 2 L/min, pain 2 (not on the Assessment sheet), awake: Alert. If somebody charted new vitals for Tom Hale in this browser, use the values the page shows, or More → **Reset practice** first.

## Part 4. The same in the installed app

- [ ] Install Practice App, Wi-Fi off, start from the Start menu, one design, **Run on-device model**. Write down whether it works. (Not stated in the docs; either answer is a result.)

## Part 5. Results (no keys, tokens or DevTools console in pictures)

```
Date and time (with time zone):
Laptop model / Windows version:
GPU + dedicated memory / RAM / CPU cores / free disk:
Chrome version:                         Multimodal flag: on / off, needed: yes / no
Model name and version (on-device-internals):
availability() answer:                  Download time:
AI check rows (API / text / image):
Wi-Fi really off: yes / no              Requests to other hosts during Part 3:
```

| Input | Label shown | Known values | Correct | Wrong (value → answer) | Missing | Time (ms) |
|---|---|---|---|---|---|---|
| Assessment sheet | | 8 | | | | |
| Shift report | | 9 | | | | |
| Bedside worksheet | | 9 | | | | |
| Pocket notes | | 9 | | | | |
| Synthetic note (text) | | | | | | |
| Made-up paper photo | | | | | | |
| Installed app (one design) | | | | | | |

Errors, word for word:

## Part 6. When may the demo say "on-device AI works"?

Only when **all** are true: the label says **"On this laptop · ONLY_ON_DEVICE"**; Wi-Fi was really off; no request went to another host; the Event Logs show the prompts; the model name and version are written down. Wrong and missing values are reported, not hidden: a genuine run with poor reading is still a genuine run, and is described as it was.

Never: show a mock as a run, show a cloud answer as a device answer, or say that every laptop can do this. Without such a run the demo says: built and tested with mocks, not verified on hardware.
