# Implementation Plan

Ship a working Web/Chrome build of DowntimeKit with all three modes by Nov 30, 2026, 2:00 PM PT, built on the solutions in Worst-Case Scenarios. Android and iOS follow only where the hardware and SDKs allow.

## 0. Implementation hurdles (read first)

The build is doable, but ten hurdles can quietly break it. The worst two: the SDK's **default cloud model is retired**, and an App Check failure can **lock the app out of the cloud for 24 hours**. Spend day 1 on the spike checklist at the end of this section before writing features.

### Hurdles and our fix

| # | Hurdle | What breaks | Fix in our build | Severity |
| --- | --- | --- | --- | --- |
| H1 | **Default cloud model is retired.** The JS SDK's default fallback model is `gemini-2.5-flash-lite` ([docs](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options?hl=th)), and Gemini 2.5 models shut down in October 2026 ([Firebase](https://firebase.google.com/docs/ai-logic/hybrid?authuser=8)). | Recovery and Demo-mode cloud calls fail. | Always set `inCloudParams.model` explicitly to a current model (e.g. a Gemini 3.x Flash-Lite), served from Remote Config so it can be swapped without redeploying. | High |
| H2 | **App Check lockout.** A 403 on the App Check token exchange can throttle the client: "Attempts allowed again after 01d:00m:00s" ([firebase-js-sdk #6708](https://github.com/firebase/firebase-js-sdk/issues/6708)). Getting a valid token after going from offline to online is a known pain ([Stack Overflow](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/tagged/firebase-app-check_page=5)). | Recovery mode (the moment the network returns) or a judge's session can't reach the cloud for a day. | Register debug tokens correctly; use reCAPTCHA Enterprise on the hosted site and test it a week early. Catch `appCheck/throttled` and show a clear message, then fall back to the **rules-only worklist** (F2). Re-check App Check right after the gate opens, before any AI call. | High |
| H3 | **On-device calls need a user click.** The Firebase guide says to initialise the on-device model on or after a user interaction such as a button click ([Firebase](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started?api=vertex)). | Auto-starting the model or pre-warming on page load silently fails. | Pre-warm (A10) and every capture start from a button press. Readiness has a "Prepare AI" button. | Medium |
| H4 | **No temperature control on the web.** The web Prompt API doesn't expose sampling parameters by default ([Chrome docs](https://developer.chrome.com/docs/ai/prompt-api?authuser=6)); temperature/topK are extension-only or behind an origin trial ([Plain English](https://javascript.plainenglish.io/google-gave-every-chrome-a-free-ai-model-and-a-javascript-api-37c185282f04)). | We can't force deterministic output on-device, so the same photo can yield slightly different results. | Lean on `responseConstraint` schemas, code validation, plausibility checks and mandatory nurse confirmation (B1). Don't pass `temperature` in `onDeviceParams` for web. | Medium |
| H5 | **Image input status is unclear.** The Firebase guide still lists enabling `#prompt-api-for-gemini-nano-multimodal-input` for on-device images ([Firebase](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference)), though MDN's image demo says multimodal was first released in Chrome 148 ([MDN](https://developer.mozilla.org/de/docs/Web/API/Prompt_API/Multimodal)). | The photo feature (D3) may not work on-device on a judge's Chrome without a flag. | Test on our machine on day 1. Typed input always works; Demo mode sends photos to the cloud if on-device images are unavailable; testing notes give the flag. | Medium |
| H6 | **Small context, slow first call.** Roughly 4K input / 1K output tokens, and a cold start of 1–4 seconds before warm calls go sub-second ([DEV guide](https://dev.to/max_quimby/chromes-gemini-nano-prompt-api-a-step-by-step-guide-26n3)). | Long notes or big photos overflow; the first capture feels laggy in the demo. | One form per call (A8), downscale photos before sending, keep prompts short, show a "preparing" state, pre-warm before recording. | Medium |
| H7 | **Hybrid web is "public preview".** The SDK moved it from "experimental" to "public preview" ([release notes](https://newreleases.io/project/github/firebase/firebase-js-sdk/release/firebase@12.3.0)). | An SDK update could change behaviour mid-build. | Pin the exact `firebase` version in `package.json`; no upgrades after Nov 24. | Low |
| H8 | **`PREFER_IN_CLOUD` only falls back on network errors.** It drops to on-device only when the cloud call fails with a network-related error ([release notes](https://newreleases.io/project/github/firebase/firebase-js-sdk/release/firebase@12.3.0)). | A quota or App Check error in Recovery won't fall back automatically. | Wrap Recovery calls: on any non-network error, switch to the rules-only worklist (F2). | Medium |
| H9 | **Secure context required.** `LanguageModel` doesn't appear on plain `file://` pages; serve it locally instead ([Plain English](https://javascript.plainenglish.io/google-gave-every-chrome-a-free-ai-model-and-a-javascript-api-37c185282f04)). | "API missing" errors during development. | Always run via `npm run dev` (localhost) or the HTTPS hosted URL. | Low |
| H10 | **Version and hardware floor.** Firebase on-device needs SDK v12.5.0+ and desktop Chrome 139+ ([Firebase](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started?api=dev&hl=nl)); the Prompt API became stable on the web in Chrome 148 ([Chrome 148 notes](https://www.superchargebrowser.com/library/chrome-148-whats-new-tab-users.md)). | Older Chrome or weak laptops get no on-device AI. | Readiness checks the Chrome version and hardware (A4); README states Chrome 148+ as the target. | Low |

**Update, Nov 18 (from the Gemini Feature Ideas research):**

- **H1:** Firebase's guide now names `gemini-3.5-flash-lite` as the default cloud model, so the retired default isn't a risk any more. Keep the fix anyway: we set the model name ourselves through Remote Config.
- **H6:** Firebase says one on-device request can be up to 9,216 tokens (a token is a small piece of a word), more than the 4K we planned for. Still keep prompts short, because shorter is faster.
- **Languages:** Gemini Nano now understands English, Japanese, Spanish, German and French.
- **Prompts stay in the app.** Firebase's server prompt templates (AI instructions stored on Firebase instead of in the app) don't work with hybrid inference, so every prompt lives in the app's `/shared/prompts` folder.
- **New hurdle for the cloud second look:** `ONLY_IN_CLOUD` throws an error when there's no network, so the second look must catch that error, show "not available yet" and try again later. It must never fall back to the laptop's model.

### Day-1 spike checklist (prove the risky parts before building features)

- [ ] On our laptop: `LanguageModel.availability()` returns `available`; record the Chrome version and `chrome://on-device-internals` status.
- [ ] Firebase `ONLY_ON_DEVICE` call with a **JSON schema** returns valid JSON with the network off.
- [ ] Same call with a **photo** (JPEG/PNG). Note whether the multimodal flag was needed.
- [ ] Force a cloud call in `ONLY_ON_DEVICE` mode and confirm it throws.
- [ ] `PREFER_IN_CLOUD` call with an explicitly set current model works with an App Check debug token.
- [ ] Turn the network off, then on again, and confirm App Check still gets a token.
- [ ] Time the cold and warm calls; write the numbers down for the video.

If any spike item fails, decide that day: switch the feature to its fallback (typed input, rules-only worklist) rather than burning days on it.

## 1. Platform strategy

**Decision: Web/Chrome is the main build; Android is a stretch goal only if we get a supported phone; iOS waits until after the hackathon.** The three platforms run different on-device models with different limits, so "cross-platform" really means three native builds sharing one design and one cloud backend.

|  | Web (Chrome desktop) | Android | iOS |
| --- | --- | --- | --- |
| On-device model | Gemini Nano via Chrome Prompt API | Gemini Nano via ML Kit Prompt API (beta) | Apple Foundation Models |
| Firebase SDK | JS `firebase/ai`, on-device from Chrome v139+ ([docs](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)) | `firebase-ai` + `firebase-ai-ondevice` (beta, not yet in the BoM) ([docs](https://firebase.google.com/docs/ai-logic/hybrid/android/get-started?authuser=6)) | Firebase Apple SDK v12.13.0+, Swift Package Manager only ([docs](https://firebase.google.com/docs/ai-logic/hybrid/ios/get-started)) |
| Which devices | Desktop with 16 GB RAM or >4 GB GPU, 22 GB free | Specific phones only: Pixel 9/10/11, Galaxy S25/S26 and a few flagships ([ML Kit list](https://developers.google.com/ml-kit/genai)) | Devices with Apple Intelligence enabled |
| Image input on-device | Yes, but the dev guide still says to enable the multimodal flag | Yes, a single Bitmap | **No, text only** ([docs](https://firebase.google.cn/docs/ai-logic/hybrid/ios/get-started)) |
| Status | Stable | Experimental | Shipping, text only |
| "Which ran?" signal | `inferenceSource` | Response tells phone vs cloud | Returned model name, e.g. `apple-foundation-models-system-language-model` ([docs](https://firebase.google.cn/docs/ai-logic/hybrid/ios/configuration-options)) |

**Why Web first:**

- Downtime laptops and Chromebook Plus devices (worst case A1) run Chrome desktop, and that's where hospital staff already work.
- It's the platform our 3 modes and the photo-of-paper-form feature (D3) fit cleanly.
- We can test it on one capable laptop. Android needs a specific flagship phone we may not have.

**Cross-platform gaps to know now:**

- **iOS can't read photos on-device.** It needs Apple's Vision OCR to turn the photo into text first, then the model structures that text. That's an extra build step.
- **Flutter:** I found no documentation that the Flutter SDK supports hybrid on-device inference, so Flutter can't give us one codebase for the on-device path. Treat Android and iOS as native (Kotlin, Swift).
- **Android on-device is beta** and only runs for the app open on screen, so no background processing.
- **App Check is mandatory** for Firebase AI Logic since Nov 2, 2026, on every platform ([Firebase](https://firebase.google.com/docs/ai-logic/hybrid?authuser=5)). Debug tokens are fine for the contest.

## 2. System architecture

One installable web app with four modes, a local encrypted vault, and a cloud path that only opens through an admin gate. Stack: **Vite + TypeScript + React**, Firebase JS SDK (`firebase/ai`, App Check, Remote Config), `idb` for IndexedDB, WebCrypto, deployed on Firebase Hosting.

&#91;embedded content: DowntimeKit modes · 4 states, 1 safety gate\]

The app can only move from Downtime to Recovery through the admin gate; that one transition enforces worst cases C2 and F1.

**Modules (each maps to worst cases):**

| Module | Job | Worst cases |
| --- | --- | --- |
| `shell` | Installable app, service worker, routing, mode state | C4, F1 |
| `readiness` | Model availability, disk space, hardware probe, daily self-test | A2, A3, A4 |
| `vault` | IndexedDB + AES-GCM encryption, PIN lock, append-only log, persistent storage, hourly export | A5, A6, C1, C3, D2 |
| `census` | Load snapshot JSON, snapshot-age banner, two-identifier patient picker | B2, B4 |
| `capture` | Forms, photo input, photo check (which form, clear enough?), prompt + schema per form, confirm screen, Compare button (Drill only) | A8, B1, D3 |
| `labs` | Pending labs, critical-result log, overdue flags | B3 |
| `handoff` | SBAR summary from confirmed entries only | B6 |
| `gate` | Admin "network cleared" switch; separate model instances per mode | C2 |
| `recovery` | Cloud worklist, priority score, dedupe/conflict flags, cloud second look of form photos, FHIR export, rules-only fallback | E1, E2, E3, F2 |
| `badge` | Device/Cloud label from `inferenceSource` on every output | C2 |

**Model instances (never shared across modes):**

```ts
const downtimeModel   = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });   // throws instead of calling cloud; also the device half of Compare
const drillModel      = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE }); // synthetic data only, judges' fallback
const recoveryModel   = getGenerativeModel(ai, { mode: InferenceMode.PREFER_IN_CLOUD });  // worklist, only after the gate opens
const cloudCheckModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD });    // second look (after the gate) + cloud half of Compare (Drill, fake data)
```

**Data model (stored encrypted, append-only):**

```ts
type EntryType = 'vitals' | 'medication' | 'note' | 'lab';

interface Entry {
  id: string;
  patientId: string;            // confirmed with 2 identifiers
  type: EntryType;
  careTime: string;             // when care happened
  entryTime: string;            // when it was recorded
  deviceId: string;
  userId: string;
  rawInput: { kind: 'text' | 'photo'; ref: string };   // saved BEFORE AI runs
  photoCheck?: {                // photo check result (photos only)
    formType: EntryType | 'unknown';
    readable: boolean;
    problem: 'none' | 'blurry' | 'cropped' | 'too_dark' | 'glare' | 'not_a_form';
    overridden: boolean;        // nurse chose to continue anyway
  };
  aiProposal?: { json: object; source: 'ON_DEVICE' | 'IN_CLOUD' };
  confirmed?: { json: object; by: string; at: string };
  supersedes?: string;          // corrections add a new row, never edit
}

interface WorklistItem {
  entryId: string;
  patientId: string;
  priority: number;             // meds > critical results > allergies/vitals, + age
  flags: ('duplicate' | 'time_conflict' | 'missing_field' | 'recheck')[];
  secondLook?: {                // cloud re-read of the photo, after the gate
    status: 'match' | 'mismatch' | 'not_available';
    cloudReading?: object;
    mismatchFields?: string[];
  };
  billable?: boolean;
  signedOffBy?: string;
}
```

The full, final field list is in the Data & Database Plan tab, section 8.

## 3. Worst-case → build task traceability

Every solution from the Worst-Case Scenarios tab becomes a task. **25 of 31** **are fully in the MVP (2 more partly)**; the rest are documented as production or stretch work, so the pitch can still show we've planned for them. Phases: **P0** setup · **P1** offline core · **P2** on-device AI · **P3** cloud recovery · **P4** safety + polish · **P5** demo + submit.

| WC | Solution (from the Worst-Case Scenarios tab) | Build task | Phase | MVP? |
| --- | --- | --- | --- | --- |
| A1 | Dedicated downtime device, off the hospital domain | Deployment guide; test on a standalone laptop | P4 | Doc only |
| A2 | Daily model-readiness check; forms work without AI | Readiness screen: `LanguageModel.availability()`, red/green status, forms-only fallback | P1 | Yes |
| A3 | Watch free disk space | `navigator.storage.estimate()` warning on the readiness screen | P1 | Yes |
| A4 | Hardware check, forms-only banner | Capability probe at first launch | P1 | Yes |
| A5 | Save first, AI second | Raw input written to the log *before* any model call | P1 | Yes |
| A6 | Persistent storage + hourly encrypted export + print | `storage.persist()`, export to file, print view | P1 / P4 | Yes |
| A7 | Device + user + time stamp; merge in Recovery | Stamp every entry; QR/USB merge later | P1 | Stamp yes, merge later |
| A8 | One form → one schema → one call | JSON schemas per form + `responseConstraint` | P2 | Yes |
| B1 | AI proposes, nurse confirms every number | Confirm screen: source beside proposal, units from a fixed list, high-alert drug double-check | P2 | Yes |
| B2 | Two identifiers + wristband scan | Census picker with name + DOB/MRN; barcode later | P1 | IDs yes, scan stretch |
| B3 | Pending labs + critical-result log | Lab tracker form + overdue highlight | P2 | Yes |
| B4 | Cached snapshot + snapshot-age banner | Load census JSON; show "snapshot from X hours ago" | P1 | Yes |
| B5 | Documentation-only prompts, no advice | Prompt rules + schemas with no recommendation fields; red-team test | P2 / P4 | Yes |
| B6 | SBAR handoff from confirmed entries only | Handoff generator (on-device) + print | P2 | Yes |
| C1 | Encrypted at rest, PIN lock | WebCrypto AES-GCM, key from PIN (PBKDF2), auto-lock timer | P1 | Yes |
| C2 | `ONLY_ON_DEVICE` in Downtime; admin "network cleared" gate; Agent Platform + BAA in production | Mode-locked model instances; gate switch; badge from `inferenceSource` | P2 / P3 | Yes (BAA = production) |
| C3 | Append-only audit log | Log stores who/when/device, original input, AI proposal, confirmed value, care time vs entry time | P1 | Yes |
| C4 | App works without Firebase at startup | Service worker caches app shell; Firebase cloud only in Recovery | P1 | Yes |
| D1 | Drill mode, forms like paper, 3-tap flows | Drill mode with sample patients; printed cheat sheet | P4 | Yes |
| D2 | Small storage, daily export, shift summaries | Text-only records; export + summaries | P4 | Yes |
| D3 | Photo of paper form → structured entry | Camera/upload → on-device image prompt | P2 | Yes |
| D4 | Printable transfer summary | Transfer summary print view | P4 | Stretch |
| E1 | Prioritised back-entry worklist | Cloud worklist with priority score | P3 | Yes |
| E2 | Dedupe rules + cloud conflict flags | Rule pass (same patient/drug/time window) + cloud flags | P3 | Yes |
| E3 | Readable worklist + FHIR bundle export | FHIR R4 Bundle JSON download | P3 | Yes |
| E4 | Tag billable items | `billable` flag on worklist items | P3 | Stretch |
| F1 | Installed and drilled in advance, zero network calls in Downtime | Network-call audit in DevTools; security notes in README | P4 | Doc |
| F2 | Cloud optional, rule-based fallback | Worklist works rules-only if cloud is off | P3 | Yes |

**Hurdle fixes → build tasks (from section 0):**

| H | Fix | Build task | Phase | MVP? |
| --- | --- | --- | --- | --- |
| H1 | Never rely on the default cloud model | Set `inCloudParams.model` to a current Gemini model on every cloud and Demo-mode instance; model name read from Remote Config with a hard-coded fallback | P0 / P3 | Yes |
| H2 | Survive App Check lockout | Debug token registered; reCAPTCHA Enterprise on the hosted site by Nov 23; catch `appCheck/throttled` → clear message + rules-only worklist; re-check App Check right after the gate opens | P0 / P3 | Yes |
| H3 | On-device starts from a click | "Prepare AI" button on Readiness runs the pre-warm; every capture starts from a button press | P1 | Yes |
| H4 | No temperature control on web | No `temperature` in `onDeviceParams`; rely on schemas, validation and confirmation | P2 | Yes |
| H5 | Image input may need a flag | Day-1 test; Demo mode sends photos to cloud when on-device images are unavailable; flag link in testing notes | P0 / P4 | Yes |
| H6 | Small context, slow first call | Downscale photos (max \~1024 px), short prompts, "preparing" state, pre-warm before recording | P2 | Yes |
| H7 | Hybrid web is public preview | Pin the exact `firebase` version; no upgrades after Nov 24 | P0 | Yes |
| H8 | `PREFER_IN_CLOUD` only falls back on network errors | Wrapper around Recovery calls: any non-network error → rules-only worklist | P3 | Yes |
| H9 | Secure context required | Dev via `npm run dev` on localhost; hosted on HTTPS | P0 | Yes |
| H10 | Chrome 139+/148+ and hardware floor | Readiness checks Chrome version + hardware; README targets Chrome 148+ | P1 | Yes |

**New Gemini features → build tasks** (chosen in the Gemini Feature Ideas tab):

| # | Feature | Build task | Effort | Phase | In MVP? |
| --- | --- | --- | --- | --- | --- |
| G1 | Photo check | One quick on-device call before reading the photo; returns form type, readable yes/no and the problem; shows "please retake" or opens the right form; nurse can override | Under 1 day | P2 | Yes |
| G2 | Cloud second look | After the gate: send each confirmed entry's photo to `cloudCheckModel` with the same form schema; compare with the confirmed values in code; add a "recheck" flag with both values side by side; if the cloud fails, show "not available yet" | 1–3 days | P3 | Yes |
| G3 | Side-by-side test | "Compare" button in Drill and Demo mode; run `downtimeModel` and `cloudCheckModel` on the same fake form; show two cards with badges, times and the fields that differ | Under 1 day | P4, done by the Nov 27 freeze | Yes |
| G4 | Phone-order read-back | Typed phone order → structured order + the exact read-back sentence; "read back done" tick; doctor's name and time required | Under 1 day | P4 | Stretch |
| G5 | Medicine cabinet check | Upload a fake cabinet report (CSV); cloud matches each medicine taken out with a recorded dose; flags "taken out but not recorded" | 1–3 days | P4 | Stretch |

## 4. Day-by-day build plan

We freeze features on Nov 27 and aim to submit Nov 29, leaving a day of buffer before the hard deadline (Nov 30, 2 PM PT = Dec 1, 3 AM PKT).

&#91;embedded content: Build timeline · 6 phases, Nov 18–30\]

**What each phase delivers (done = demoable):**

1. **P0 · Nov 18–19, setup + blockers:** run the day-1 spike checklist from section 0 (Nano on our laptop, schema + photo on-device, cloud lock, App Check offline→online, timings), email Devpost about eligibility, create the Firebase project + App Check, create the repo (Apache-2.0), scaffold the app, write synthetic patients + paper form templates.
2. **P1 · Nov 19–22, offline core:** service worker + install, encrypted vault + PIN lock, append-only log, save-first rule, persistent storage + export, readiness screen, census picker with two identifiers + snapshot-age banner. *Gate: everything works in airplane mode without AI.*
3. **P2 · Nov 21–25, on-device AI:** JSON schemas for vitals, medication, note and lab; `ONLY_ON_DEVICE` capture; photo-of-form input; photo check (G1); confirm screen; SBAR handoff; Device badge; advice-refusal prompt rules. *Gate: photo of a paper vitals sheet becomes a confirmed entry with the network off.*
4. **P3 · Nov 24–26, cloud recovery:** admin gate, `PREFER_IN_CLOUD` worklist with priority score, dedupe/conflict flags, rules-only fallback, cloud second look with "recheck" flags (G2), FHIR bundle export, Cloud badge, Remote Config model names. *Gate: a duplicate dose gets flagged and the export downloads.*
5. **P4 · Nov 26–28, safety + polish:** Drill mode + Demo mode for judges, Device vs Cloud side-by-side test (G3, finished before the Nov 27 freeze), all tests from section 6, clinical review, README (setup, security notes, architecture), hosted URL. Stretch goals, only if everything else is green, in this order: phone-order read-back (G4), medicine cabinet check (G5), then Android.
6. **P5 · Nov 28–29, video + submit:** record the 3-minute demo, upload to YouTube, finalise the story and screenshots, submit.

## 5. Hurdles, gaps and needs

The two blockers to clear **today** are hardware that can run Gemini Nano and confirming Pakistan eligibility. Everything else can be sorted while building.

### What we need (tracker)

| Need | Why | Action | Status |
| --- | --- | --- | --- |
| Laptop that runs Gemini Nano | Web on-device needs 16 GB RAM or >4 GB GPU, 22 GB free, Chrome 139+ | Check `chrome://on-device-internals` on our machine and download the model now | To do |
| Pakistan eligibility | Rules neither include nor exclude Pakistan | Email Devpost support today | To do |
| Firebase project with AI Logic | Required SDK; App Check enforced since Nov 2 | Create project, enable Gemini Developer API, register web app, App Check debug token | To do |
| Public GitHub repo, Apache-2.0 | Submission rule: license visible in the About section, Firebase AI Logic called at runtime | Create repo on day 1, commit daily | To do |
| Synthetic patients + sample paper forms | No real patient data allowed; the photo feature needs realistic forms | Make 10 fake patients + 3 printable downtime forms modelled on public hospital templates | To do |
| Clinical reviewer | We aren't clinicians; wrong form fields kill credibility | Ask one nurse/doctor contact to review forms + flow (30 min) | To do |
| Judges' testing access | Judges' laptops may not run Nano, and image input may need a Chrome flag | Hosted URL + a **Demo mode** on synthetic data using `PREFER_ON_DEVICE` (falls back to cloud), plus the video | To do |
| YouTube channel + recording setup | ≤3 min public demo video, English | Screen recorder, mic, script from the Worst-Case Scenarios tab | To do |
| Optional extra model quota | Free tier may throttle during testing | Last quota request sprint closes Nov 25, 10 AM PT ([rules](https://firebasehybridaihackathon.devpost.com/rules)) | To do |
| Supported Android phone | Only for the Android stretch goal: Pixel 9/10/11, Galaxy S25/S26 ([ML Kit list](https://developers.google.com/ml-kit/genai)) | Borrow one, or skip Android | To do |
| Mac + Xcode + Apple Intelligence iPhone | Only for iOS (post-hackathon) | Not needed by Nov 30 | To do |
| Kotlin skills | Android on-device path is native | Only if Android goes ahead | To do |
| Swift + Apple Vision OCR | iOS model can't read images | Post-hackathon | To do |
| FHIR R4 basics | Export format for back-entry | Use Bundle + Observation + MedicationAdministration resources only | To do |
| Security write-up | Hospitals and IT (worst case F1) will ask | README section: zero network in Downtime, encryption, audit log | To do |
| Production compliance path | Real deployment needs HIPAA coverage | Document: Agent Platform backend under Google Cloud BAA; not needed for the demo | To do |

### Gaps we can't close by Nov 30 (say them openly)

- **No real EHR write-back.** Export only (worst case E3).
- **No multi-device merge** (A7). One device per unit in the MVP.
- **No iOS photo reading on-device.** Needs Vision OCR first.
- **Android on-device is beta** and limited to a short list of flagship phones.
- **Hospital IT may block the model download** (A2). We mitigate with readiness checks and a forms-only fallback, but can't force it.
- **Judges may not see on-device inference live** on weaker laptops. That's why Demo mode and the video both matter.
- **The cloud second look needs a cloud agreement for real use.** It sends form photos to Google's cloud after the outage, so a real hospital needs a HIPAA agreement (BAA: the contract that lets Google handle patient data) first. The demo uses fake patients only.

### What cross-platform needs (to do later, cleanly)

- **One shared `/shared` folder** in the repo: JSON schemas for each form, prompt text, the priority formula and the FHIR mapping. Every platform reads the same files so behaviour matches.
- **One shared cloud backend**: the same Firebase project, Remote Config for model names, and the Recovery prompts kept in the app's /shared/prompts folder (Firebase's server prompt templates don't work with hybrid).
- **Per-platform shells**: Web (TypeScript), Android (Kotlin, `firebase-ai-ondevice`), iOS (Swift, Firebase SDK ≥12.13 via SPM + Vision OCR).
- **Same safety rules on every platform**: on-device-only lock in Downtime, the network-cleared gate, confirm-every-number, and the audit log format.

## 6. Testing, demo, submission and cut lines

**Testing (each test proves one worst-case fix):**

- [ ] **Airplane-mode test:** turn the network fully off, run all Downtime flows, and confirm zero network requests in DevTools (C2, F1).
- [ ] **Cloud-lock test:** in Downtime, force a cloud call and confirm `ONLY_ON_DEVICE` throws (C2).
- [ ] **No-model test:** run on a browser without Nano and confirm the forms-only banner and that nothing breaks (A2, A4).
- [ ] **Kill test:** close the tab or pull the battery mid-entry, reopen, and confirm the raw input is there (A5, A6).
- [ ] **Wrong-number test:** feed a blurry form photo and confirm every dose/time is flagged for confirmation (B1).
- [ ] **Wrong-patient test:** try saving without two identifiers; it must be blocked (B2).
- [ ] **Advice red-team:** ask the model "what dose should I give?"; it must refuse (B5).
- [ ] **Duplicate test:** log the same dose twice, and Recovery must flag it (E2).
- [ ] **Lock test:** idle timeout locks the app; data in IndexedDB is unreadable without the PIN (C1).
- [ ] **Clinical review:** a nurse walks through Drill mode and fixes form fields (D1).

**Extra tests for the implementation hurdles:**

- [ ] **Model-name test:** with Remote Config unreachable, cloud calls still use the hard-coded current model, never the SDK default (H1).
- [ ] **App Check test:** go offline → online → open Recovery; the token refreshes. Simulate a throttle error and confirm the rules-only worklist appears (H2, H8).
- [ ] **Click test:** reload the page and confirm no model call fires until a button is pressed (H3).
- [ ] **Image fallback test:** on a Chrome without on-device image input, Demo mode still reads the photo via cloud and Downtime shows typed input only (H5).
- [ ] **Version pin test:** a fresh `npm ci` installs the exact pinned `firebase` version (H7).
- [ ] **Photo check test:** for each form, try a blurry, a cut-off and a clear photo. The first two get "please retake"; the clear one opens the right form (G1).
- [ ] **Second look test:** 5 fake entries have a wrong confirmed value (e.g. dose saved as 50 when the paper says 5.0). All 5 must get a "recheck" mark (G2).
- [ ] **Second look offline test:** cut the network after the gate opens. The second look shows "not available yet" and never falls back to the laptop's model (G2).
- [ ] **Compare test:** in Drill mode both cards appear, and their Device and Cloud badges match `inferenceSource`. The Compare button doesn't exist in Downtime (G3).

**Submission checklist (Devpost rules):**

- [ ] Public repo, Apache-2.0 license visible in About, setup steps in the README, Firebase AI Logic visibly imported and called
- [ ] Hosted URL working through Dec 16, with Demo mode for judges
- [ ] ≤3 min public YouTube video in English showing it running in Chrome, with network off and on
- [ ] Project story, elevator pitch and thumbnail (already drafted)
- [ ] Platform selected: Web/Chrome
- [ ] No secrets or personal data in the repo or video
- [ ] Submitted by **Nov 30, 2:00 PM PT = Dec 1, 3:00 AM PKT**; aim for Nov 29 to leave buffer

**Cut lines (drop in this order if we fall behind):**

1. Android stretch build
2. Stretch Gemini features: phone-order read-back (G4), medicine cabinet check (G5)
3. Barcode scan, transfer summary, billable tags
4. Cloud second look cut down to medication forms only (G2)
5. Printable views (keep export file)
6. Lab tracker (keep vitals, meds, notes)
7. Photo check (the nurse picks the form type by hand instead) (G1)
8. Photo input (keep typed input). Last resort: it's our best demo moment.

**Never cut:** the `ONLY_ON_DEVICE` lock, the network-cleared gate, nurse confirmation, the audit log, the Device/Cloud badge and the Recovery worklist. Those *are* the hybrid story.

**3-minute demo video script:**

1. **0:00–0:30, the problem.** UMMC spent 9 days on paper with no Wi-Fi. Patients already admitted face 35–41% higher mortality (risk of dying) during attacks.
2. **0:30–0:45, hybrid on one screen.** In Drill mode, press Compare: the same fake form is read by the laptop's AI and the cloud AI side by side, with Device and Cloud badges and their times.
3. **0:45–1:45, Downtime.** Airplane mode on. A blurry photo is bounced by the photo check ("please retake"); a clear photo of a paper vitals sheet goes straight to Vitals and becomes a structured card with a **Device** badge. A medication entry forces dose confirmation. One tap gives the shift handoff.
4. **1:45–2:30, Recovery.** Network back, admin flips "network cleared". The cloud builds the worklist (**Cloud** badge), flags a duplicate dose, and the second look marks a dose saved as 50 when the paper says 5.0. Export FHIR.
5. **2:30–3:00, safety and impact.** The never-cloud-during-an-attack rule, "the AI only proposes and the cloud only marks", the audit log, and how it works alongside Epic BCA.

**Recording setup:** one desktop Chrome machine that meets the specs (16 GB RAM or a >4 GB GPU, 22 GB free), with the model downloaded and pre-warmed *before* recording.

## 7. Prompts and JSON schemas

The model **only extracts and never decides**: every schema allows `null` plus an `unclear` list, there are no recommendation fields, and priority is computed in code, not by the model (B1, B5).

**Shared system rules (every on-device call):**

```text
You are a documentation assistant for nurses during a hospital system outage.
Extract ONLY what is written or said. Never guess, never fill gaps, never give clinical advice.
If a value is missing or hard to read, set it to null and add the field name to "unclear".
Copy numbers exactly as written. Output JSON that matches the schema, nothing else.
```

**Vitals schema (example of the shape every form follows):**

```json
{
  "type": "object",
  "properties": {
    "bp_systolic":  { "type": ["integer", "null"] },
    "bp_diastolic": { "type": ["integer", "null"] },
    "heart_rate":   { "type": ["integer", "null"] },
    "resp_rate":    { "type": ["integer", "null"] },
    "temp_c":       { "type": ["number", "null"] },
    "spo2":         { "type": ["integer", "null"] },
    "pain_0_10":    { "type": ["integer", "null"] },
    "care_time":    { "type": ["string", "null"], "pattern": "^[0-2][0-9]:[0-5][0-9]$" },
    "unclear":      { "type": "array", "items": { "type": "string" } }
  },
  "required": ["unclear"],
  "additionalProperties": false
}
```

**The other schemas:**

| Schema | Fields | Notes |
| --- | --- | --- |
| Medication | `drug_name`, `dose_value`, `dose_unit` (enum: mg, mcg, g, mL, units, mmol, tablet), `route` (enum: PO, IV, IM, SC, SL, PR, INH, TOP), `care_time`, `given_by_initials`, `unclear` | Fixed units and routes stop free-text errors. A high-alert drug list in code triggers a double-check (B1). |
| Nursing note | `category` (assessment, intervention, communication, other), `summary` (≤300 chars), `intake_ml`, `output_ml`, `unclear` | Summary keeps the nurse's own words where possible. |
| Lab | `test_name`, `status` (pending, resulted, critical), `value`, `called_to`, `read_back` (true/false), `care_time`, `unclear` | Feeds the pending-labs list and overdue flags (B3). |
| Handoff | `situation`, `background`, `assessment`, `open_items[]` | Built **only from confirmed entries**. We use "open items" instead of SBAR's "recommendation" so the model never suggests care (B5, B6). |
| Worklist (cloud) | Input: confirmed entries. Output: `items[]` of `{entry_id, flags[] (duplicate, time_conflict, missing_field), reason}` | The model only flags. The priority score comes from the formula in code. |

**Checks in code, after the model:**

- Schema validation (reject and retry once, then fall back to the manual form).
- Plausibility ranges flag obviously wrong numbers for the nurse to check (e.g. heart rate outside 20–250). This is a data-entry check, not clinical advice.
- Any field in `unclear`, or any number at all, is highlighted on the confirm screen (B1).

**Prompts and outputs for the new Gemini features:**

| Feature | What we tell the model | Output fields | Notes |
| --- | --- | --- | --- |
| Photo check (G1) | "Look at this photo of a hospital paper form. Say which form it is and whether the writing area is fully visible and sharp enough to read. Do not read the values." | `form_type` (vitals, medication, intake\_output, note, lab, unknown), `readable` (true/false), `problem` (none, blurry, cropped, too\_dark, glare, not\_a\_form) | On-device. Photo saved first; nurse can override |
| Cloud second look (G2) | The same extraction prompt and schema as the on-device read, so the two answers can be compared | Same fields as the form type (e.g. the vitals schema above) | `ONLY_IN_CLOUD`. Code compares field by field and writes match / mismatch and the mismatched fields |
| Side-by-side test (G3) | The normal extraction prompt, sent to both models | Same fields, twice | Code adds where each ran (`inferenceSource`), time taken in milliseconds and the fields that differ |
| Phone-order read-back (G4, stretch) | "Turn this typed phone order into the fields below and write one sentence the nurse can read back to the doctor. Copy exactly; never change or judge the order." | `prescriber_name`, `order_text`, `drug_name`, `dose`, `dose_unit`, `route`, `frequency`, `read_back_sentence`, `unclear` | On-device. Doctor's name and time required |

## 8. Screen list

The MVP has 11 screens. Build them in this order, because each one unlocks the next.

| # | Screen | What it does | Worst cases | Phase |
| --- | --- | --- | --- | --- |
| 1 | PIN lock | Unlock the vault; auto-lock after idle; admin recovery-key entry | C1, C5 | P1 |
| 2 | Readiness | Model status, disk space, hardware, snapshot age, last export, "pre-warm model" button | A2–A4, A10, B4 | P1 |
| 3 | Mode bar (always visible) | Shows Drill / Ready / Downtime / Recovery and the Device/Cloud badge of the last AI call | C2 | P1 |
| 4 | Patient picker | Census list, search, two-identifier confirm, snapshot-age banner | B2, B4 | P1 |
| 5 | Patient timeline | All entries for one patient, newest first, with confirmed/draft state | C3 | P1 |
| 6 | Capture | Type or take a photo; raw input saved first; the photo check picks the form type and asks for a retake if the photo isn't clear (G1); Compare button in Drill mode (G3) | A5, D3 | P2 |
| 7 | Confirm | AI proposal beside the source; every number and unclear field highlighted; confirm/edit/reject | B1 | P2 |
| 8 | Labs | Pending labs, critical-result log, overdue highlights | B3 | P2 |
| 9 | Handoff | SBAR-style summary from confirmed entries, print button | B6 | P2 |
| 10 | Network gate (admin) | Admin PIN → "network cleared" switch → unlocks Recovery | C2, F1 | P3 |
| 11 | Recovery worklist | Prioritised items, flags (including the second look's "recheck", G2), per-item sign-off, FHIR export, export file, rules-only fallback | E1–E3, F2 | P3 |

**Design rules for every screen:** big touch targets (≥44 px), at most 3 taps to save an entry, plain labels that match the hospital's paper forms (D1), and a visible mode bar so nobody is unsure whether the cloud is on.

**New features, no new screens:** the photo check runs inside Capture, the second look's "recheck" mark shows on the Recovery worklist, and the Compare button appears on Capture only in Drill and Demo mode.

## 9. Three more worst cases (added to the list)

These weren't in the first worst-case list. They now count as **A9, A10 and C5**, all in the MVP.

| # | Worst case | Why it's real | Our solution | Phase |
| --- | --- | --- | --- | --- |
| A9 | **Device clock is wrong** | An offline laptop can't sync its time, may drift, or someone sets it wrong, so care times would be off in the legal record. | Each entry stores the device's clock time **plus** a monotonic counter and the time since the last known-good sync. Recovery compares against the real time and flags any gap over 5 minutes as `time_conflict` for the nurse to fix. Nurses can also type the care time by hand. | P1 / P3 |
| A10 | **The model starts downloading mid-outage** | The first on-device request starts the model download in the background, and that's impossible with no network. ([Firebase web guide](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)) | A **pre-warm** step in Ready mode: one tiny test prompt triggers and confirms the download, and readiness stays red until it succeeds. The daily self-test repeats it. | P1 |
| C5 | **A nurse forgets the PIN and the data is locked forever** | Strong encryption means a lost key = lost records. | Envelope encryption: data is locked with a random key, and that key is stored twice, wrapped by the nurse's PIN and by an **admin recovery key** (printed and kept in the downtime binder). Admin recovery is logged in the audit trail. | P1 |

## 10. Accuracy test set

One honest number beats any claim. We measure on 20 synthetic form photos and only publish what we actually get.

**The set (all fake, made by us):**

| Form | Photos | Variations to include |
| --- | --- | --- |
| Vitals | 8 | Neat handwriting, messy handwriting, printed, phone at an angle, glare, a crossed-out value |
| Medication | 6 | Common drugs, one high-alert drug, unit written as "mcg" vs "µg", missing route |
| Nursing note + intake/output | 4 | Short note, long note, I/O numbers in the margin |
| Lab | 2 | One pending, one critical with "called to Dr X" |

Each photo gets a hand-written **ground-truth JSON** file in `/fixtures`.

**What we score (a dev-only eval page loops through the fixtures):**

- **Field accuracy:** correct fields ÷ total fields.
- **Unsafe misses (target: 0):** a number that's wrong *and* wasn't flagged as unclear. This is the safety number judges and clinicians care about.
- **Flag rate:** how often the model marks something unclear. Too high means it's annoying; too low means it's overconfident.
- **Latency:** time per extraction on-device vs cloud, logged with Performance Monitoring.

**How we use it:** the README and video report the real results, for example "X% of fields correct on 20 synthetic forms; every dose still goes to a nurse for confirmation." If unsafe misses aren't 0, we tighten the prompt or force confirmation on more fields before submitting.

**Second look set (G2):** for 5 of the 20 photos we save a deliberately wrong value as the nurse's confirmed answer (one dose, one time, one blood pressure, one temperature, one intake amount). The second look should mark all 5. We report how many it caught and how many correct entries it marked by mistake.

## 11. Owners and judging-criteria map

**Owners (fill in names; one person can hold several roles):**

| Role | Owns | Owner |
| --- | --- | --- |
| Build lead | Architecture, vault, mode/gate logic, final merge | TBD |
| Frontend | Screens 1–11, accessibility, print views | TBD |
| AI + prompts | Schemas, prompts, eval page, accuracy test set | TBD |
| Cloud + Firebase | Project setup, App Check, Remote Config, Recovery worklist, hosting | TBD |
| QA + clinical review | Test checklist (section 6), nurse walkthrough | TBD |
| Story + video | 3-min video, Devpost text, thumbnail, screenshots | TBD |

**How we score on each judging criterion** (4 criteria, equal weight, scored 1–5 ([rules](https://firebasehybridaihackathon.devpost.com/rules))):

| Criterion | What judges look for | What we show | Where in the video |
| --- | --- | --- | --- |
| Technical implementation | How well it's built and how well it uses hybrid inference | Four mode-locked model instances (including a cloud-only checker for the second look), `ONLY_ON_DEVICE` lock, Device/Cloud badge from `inferenceSource`, schema-constrained output, encrypted offline vault, App Check, Remote Config, accuracy numbers | 0:30–2:30 |
| Design | A complete product, not a proof of concept | 11 real screens, Drill mode with a Device vs Cloud side-by-side test, photo check, confirm flow, mode bar, export + print, works with the network off | Throughout |
| Potential impact | A credible case for a real problem and real audience | 2026 hospital outages, the 35–41% mortality finding, how it fits alongside Epic BCA, who buys it | 0:00–0:30 and 2:30–3:00 |
| Quality of idea | Creative, non-obvious use of Firebase AI Logic | Hybrid as a **safety decision**: the cloud is deliberately locked out during an attack and let back in only for recovery, where it double-checks the device's work. Nobody else in the contest is in this space | 0:00–0:30 and 1:45–2:30 |

## 12. Judges' access

Every judge should see AI working within 60 seconds, whatever laptop they have. The rules require free testing access that stays live through the judging period, and accept App Check debug tokens ([rules](https://firebasehybridaihackathon.devpost.com/rules)).

**Setup:**

- **Hosted URL** on Firebase Hosting, kept live until at least Dec 16.
- **App Check:** use reCAPTCHA Enterprise on the hosted site (the correct production setup). If that eats too much time, fall back to a debug token and document it in the testing notes.
- **Demo PINs:** nurse PIN and admin PIN printed in the testing notes. The demo vault only ever holds synthetic patients.

**What judges see, by machine:**

| Judge's machine | Demo mode (synthetic data) | Downtime mode |
| --- | --- | --- |
| Chrome desktop that runs Gemini Nano | AI runs on-device → **Device** badge | Full on-device capture with the network off |
| Chrome without the model, or a weak laptop | `PREFER_ON_DEVICE` falls back to cloud → **Cloud** badge, still works | Forms-only banner, by design (proves A2/A4 handling) |
| Chrome without on-device image input | Photo goes to the cloud model | Typed input only, with a note on how to enable images |
| Phone or non-Chrome browser | Cloud fallback in Demo mode | Banner: "needs desktop Chrome" |

**Testing notes to paste into Devpost:**

1. Open the URL in desktop Chrome, enter the demo nurse PIN, then press "Start Demo".
2. Pick a patient, add vitals by typing or by uploading one of the sample form photos linked in the notes.
3. Confirm the entry and watch the Device/Cloud badge.
4. To test the real offline path: on a capable Chrome, run the readiness pre-warm, switch to Downtime, turn Wi-Fi off and repeat.
5. Turn Wi-Fi back on, enter the admin PIN, flip "network cleared", and open the Recovery worklist and FHIR export.
6. In Drill mode, press Compare to see the same fake form read on the laptop and in the cloud, side by side.

For on-device image input, the Firebase dev guide asks to enable Chrome's multimodal flag ([guide](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)). The testing notes link it, and the video shows the full offline run either way.

## 13. Repo layout and README outline

The `/shared` folder is what makes Android and iOS cheap later: schemas, prompts and rules live there once, and every platform reads them.

```text
downtimekit/
├─ LICENSE                     # Apache-2.0 (must show in GitHub About)
├─ README.md
├─ shared/                     # platform-neutral, reused by web/android/ios
│  ├─ schemas/                 # vitals.json, medication.json, note.json, lab.json, handoff.json, worklist.json, photo-check.json
│  ├─ prompts/                 # system-rules.txt + one prompt file per form
│  ├─ rules/                   # priority formula, plausibility ranges, high-alert drug list, dedupe window
│  └─ fhir/                    # entry → FHIR R4 mapping
├─ web/                        # Vite + TypeScript + React app
│  ├─ src/modules/             # shell, readiness, vault, census, capture, labs, handoff, gate, recovery, badge
│  ├─ src/screens/             # the 11 screens
│  ├─ public/sw.js             # service worker
│  └─ eval/                    # dev-only accuracy eval page
├─ fixtures/                   # 20 synthetic form photos + ground-truth JSON, synthetic census
├─ docs/                       # architecture diagram, security notes, worst-case mapping
├─ android/                    # later: Kotlin + firebase-ai-ondevice
└─ ios/                        # later: Swift + Firebase SDK ≥12.13 (SPM) + Vision OCR
```

**README outline:**

1. One-line pitch + 3-minute video link + hosted URL
2. The problem (2026 incidents, the mortality finding) in 3 bullets
3. **How it uses Firebase AI Logic**: the three modes, with code snippets showing `ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, `PREFER_IN_CLOUD` and `inferenceSource` (judges check this is real), plus ONLY\_IN\_CLOUD for the second look
4. Architecture diagram + mode diagram
5. Safety and security: zero network calls in Downtime, encryption, PIN + recovery key, audit log, no clinical advice
6. Accuracy results from the eval (real numbers only)
7. Setup: Chrome version, enabling the model and multimodal flag, Firebase config, App Check debug token, `npm install && npm run dev`
8. Testing notes for judges (copy of section 12)
9. Limitations and roadmap: EHR write-back, multi-device merge, Android, iOS, BAA setup
10. License + synthetic-data statement (no real patient data anywhere)

## Sources

- [#BuildHybridAI 2026 rules — Devpost](https://firebasehybridaihackathon.devpost.com/rules)
- [Firebase AI Logic hybrid: Web get started](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) · [Web configuration options](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options)
- [Firebase AI Logic hybrid: Android get started](https://firebase.google.com/docs/ai-logic/hybrid/android/get-started?authuser=6)
- [Firebase AI Logic hybrid: Apple get started](https://firebase.google.com/docs/ai-logic/hybrid/ios/get-started) · [Apple configuration options](https://firebase.google.cn/docs/ai-logic/hybrid/ios/configuration-options)
- [ML Kit GenAI device support](https://developers.google.com/ml-kit/genai)
- [Firebase AI Logic hybrid overview (App Check enforcement)](https://firebase.google.com/docs/ai-logic/hybrid?authuser=5)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api) · [Structured output](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api)
- Worst-case solutions this plan builds on: Worst-Case Scenarios
