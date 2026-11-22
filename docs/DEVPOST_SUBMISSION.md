# Devpost submission: #BuildHybridAI 2026

Text for the existing draft project (do not create another one):
https://devpost.com/software/downtimekit-hybrid-ai-charting-when-hospital-ehrs-go-down

Deadline: **30 Nov 2026, 2:00 PM Pacific (22:00 UTC)**. Commits pushed after that are not judged.

Rules checked on 22 Nov 2026 (firebasehybridaihackathon.devpost.com/rules). What they need from us:

| Requirement | Status |
|---|---|
| Firebase AI Logic imported and called at runtime | Done: `src/lib/ai/firebase.ts`, `src/lib/ai/service.ts` |
| App Check (debug tokens accepted) | Done: reCAPTCHA Enterprise, enforced for AI Logic |
| Platform: Web (Chrome) with Gemini Nano via Firebase AI Logic | **Built and mock-tested; not live-verified** (test PC hardware). See "Open risks" |
| Public repo with a detectable open-source licence | Apache-2.0 `LICENSE` added in this PR; GitHub shows it after merge |
| Demo video ≤ 3 min, public on YouTube, English | Script ready (`docs/DEMO_VIDEO_SCRIPT.md`); **not recorded yet** |
| Text description: Firebase AI Logic use, features, value | Below |
| Disclose pre-existing work, summary of what was built in the period | Below. The owner confirms the dates |
| Working project for judges (link or test build) | Source and run steps. **No hosted URL yet** (optional, encouraged) |
| No production keys, secrets or PII in repo, form or instructions | `.env.local` is ignored; secret scans on every PR; fictional data only |

Facts used below come from the repository (git history, tests, `docs/LIVE_TEST_RESULTS_*.md`). Don't add claims that aren't there.

---

## 1. Project overview

**Project name** (60 characters max)

```
ClinBridge: Hybrid AI Charting When Hospital EHRs Go Down
```

**Elevator pitch** (200 characters max)

```
When the hospital EHR goes down, nurses keep charting on an encrypted offline laptop. Back online, Firebase AI Logic gives paper-photo records a cloud second look before FHIR export.
```

**Thumbnail:** the current one says "DowntimeKit". Replace it with a 3:2 screenshot of the ClinBridge app (for example the System Down banner on My Patients), JPG or PNG, under 5 MB.

## 2. Project details

### About the project (Markdown)

```markdown
## Inspiration

When ransomware or an outage takes a hospital's EHR offline, nurses switch to paper. Downtime can last days or weeks. Afterwards someone has to type every paper vital sign, medicine dose and note back into the EHR, under time pressure, with handwriting that is hard to read. Errors slip in, and the paper trail of who did what and when is hard to prove.

We wanted the "paper" to be a laptop that keeps working with no network, and an AI that helps with the back-entry without ever being trusted blindly.

## What it does

ClinBridge is an offline-first nursing documentation app that runs in Chrome on a ward laptop.

- **During downtime (System Down):** nurses chart vitals, medicines (with a second-nurse check for high-alert drugs), notes, fluid balance, lab results phoned in by the lab, a body map and SBAR handovers. They can also photograph a paper form and type its values next to the photo. Everything is saved in an encrypted local database (AES-256-GCM) with a tamper-evident audit log. **No cloud call can happen in this phase**: the app blocks it, including any request that was already running when the outage started. AI, if used, may only run on-device.
- **Back online:** an admin confirms the network is safe and clears it. Only then may cloud AI run. In the Recovery Gate & Worklist, Firebase AI Logic gives each paper-photo record a **cloud second look**: it reads the photo and lists where its reading differs from what the nurse typed. **It never edits the record.** A nurse decides, and any fix is a new version with a reason.
- **Export:** the checked records are exported as a FHIR R4 bundle for the hospital EHR team. The official HL7 validator runs on the export in CI: 0 errors.

## How we built it

- **Firebase AI Logic hybrid inference** (Firebase JS SDK 13.4, `firebase/ai`, Gemini Developer API backend):
  - On-device: `InferenceMode.ONLY_ON_DEVICE` (Gemini Nano through Chrome's Prompt API). During the call the app blocks the network and rejects any answer whose `inferenceSource` isn't on-device.
  - Cloud: `InferenceMode.ONLY_IN_CLOUD` with `gemini-3.5-flash-lite`, behind **App Check** (reCAPTCHA Enterprise, enforced). Cloud runs only when the outage phase allows it.
  - We never use `PREFER_ON_DEVICE` or `PREFER_IN_CLOUD`: in a hospital outage, silently switching engines is exactly what must not happen.
  - Structured output: a JSON schema for vitals in which every field is required but may be null, so the model writes "not written" instead of guessing.
- **Offline app:** React 18, TypeScript (strict), Vite, vite-plugin-pwa (works with no network after the first load), Dexie/IndexedDB with a 19-table schema, Web Crypto encryption.
- **Interoperability:** FHIR R4 export with a Provenance resource per record: who did it, when it happened vs when it was typed, which laptop, the source photo and any correction.
- **Quality:** 210 unit tests (Vitest) and 34 browser tests (Playwright), plus the HL7 FHIR validator, on every pull request in GitHub Actions.

## Challenges we ran into

- **Proving where the AI really ran.** Without Chrome's Prompt API, the SDK quietly sends even `ONLY_ON_DEVICE` requests to the cloud. We added our own guards (Prompt API present, model available, network blocked during the call, `inferenceSource` checked) and tests for each one.
- **App Check with two engines.** The AI SDK reads the App Check provider once, when it starts. We use two Firebase app instances, so on-device use never triggers App Check or reCAPTCHA traffic, and cloud calls always carry a token.
- **Models that skip fields.** With optional fields the cloud model sometimes skipped clearly written values. Making every field required-but-nullable, with a description of how nurses write each value, fixed it. We checked this against live responses.
- **A request in flight when the outage starts.** A cloud request started just before System Down is cancelled, and its answer is thrown away.
- **Honesty in the UI.** Every AI result shows where it ran (`ONLY_IN_CLOUD`, timing). Seed examples are labelled "Simulated proposal", and nothing is confirmed until a nurse checks it against the paper.

## Accomplishments that we're proud of

- Real Firebase cloud inference tested live with text notes and paper-form photos: all 7 vital-sign values correct in each of four extraction tests, and values that weren't written came back empty instead of guessed.
- The whole outage workflow works with no network and no AI.
- An encrypted, append-only record with a verifiable audit chain, and a FHIR export that passes the official validator.

## What we learned

Hybrid AI in healthcare is more about *where* and *when* inference may run than about the model. The outage phase, not the model, decides where AI may run, and the record must survive the AI being wrong or unavailable.

## What's next

- Verify Gemini Nano live on Chrome-supported hardware (the on-device path is implemented and tested with mocks; our test PC can't run Gemini Nano).
- Clinical review of warning ranges and medicine policies with nurses, and a security review, before any real use.
- Printable downtime sheets and a second-laptop handover.

## Status, honestly

| Feature | Status |
|---|---|
| Offline nursing documentation | Working |
| System Down blocks cloud AI | Verified |
| Firebase cloud AI (gemini-3.5-flash-lite, App Check) | Live-tested |
| Gemini Nano on-device | Implemented, mock-tested, **not live-verified** |
| FHIR R4 export | 0 validator errors |
| Real patient use | **Not approved**: prototype, fictional data only |
```

> Edit before saving: if the team wrote parts of this, keep "we". If only one person built it, change "we" to "I".

### Built with (up to 25 tags)

```
react, typescript, vite, firebase, firebase-ai-logic, gemini, gemini-nano, chrome-prompt-api, firebase-app-check, recaptcha-enterprise, indexeddb, dexie, web-crypto-api, pwa, tailwindcss, hl7-fhir-r4, vitest, playwright, github-actions
```

### "Try it out" links

- Source code: https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon

### Demo video URL

The YouTube link, once uploaded (public or unlisted, no password). Script: `docs/DEMO_VIDEO_SCRIPT.md`.

## 3. Additional info (for judges)

These are **your** answers. Evidence from the repository is given where it exists.

| Field | Draft answer / evidence |
|---|---|
| Submitter type | Owner decides. The Devpost project lists 3 members (Aqeela Urooj, Talal Khawaja, Aliya Yousuf) → "Team". Git history has one author (Aqeela Urooj) plus AI-assisted commits. |
| Country of residence | Owner fills in. |
| Organization name | Owner fills in if applicable. |
| Start date (MM-DD-YY) | **Owner confirms.** Repository evidence: first commit **20 Nov 2026** (`e194565`); the Stitch design export is dated 20 Nov 2026 and contains an item named for 18 Nov 2026. Nothing in the repo is dated before the 11 Nov 2026 start. Only you know when planning began. |
| New or existing before 11 Nov 2026 | **Owner confirms.** The repository evidence points to "New". |
| Platform(s) | Web (Chrome) |
| How it meets the main technology requirement | See below |
| Working demo URL | None yet. Optional: a hosted build (see "Open risks") |
| Testing instructions | See below |
| Open-source licence URL | https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon/blob/main/LICENSE (works after this PR is merged) |
| Three eligibility checkboxes | **Owner only.** Not filled in by Claude. |

### How the project meets the main technology requirement

```
ClinBridge is a Web (Chrome) app built on Firebase AI Logic (Firebase JS SDK 13.4, firebase/ai) with App Check (reCAPTCHA Enterprise, enforced for AI Logic).

Hybrid inference, chosen by the hospital's outage phase:
- On-device: getGenerativeModel with InferenceMode.ONLY_ON_DEVICE (Gemini Nano through Chrome's Prompt API) proposes vitals from a paper-form photo during System Down. The network is blocked during the call and the answer is rejected unless inferenceSource is on-device. This path is implemented and covered by automated tests with a mocked Prompt API. We have NOT verified it live: our test PC's hardware does not meet Chrome's Gemini Nano requirements, and the app then tells the nurse to type the values (no cloud fallback).
- Cloud: InferenceMode.ONLY_IN_CLOUD with gemini-3.5-flash-lite, allowed only after an admin clears the network. It gives paper-photo records a "second look" that lists differences but never edits the record. Tested live with real Firebase responses (text notes and form photos, App Check enforced).
- PREFER_ON_DEVICE / PREFER_IN_CLOUD are never used, so the engine can't switch silently.

Code: src/lib/ai/firebase.ts (getAI, App Check, both modes), src/lib/ai/service.ts (generateContent calls, schemas, guards), src/lib/cloudGate.ts (cloud blocked during System Down).
```

### Testing instructions

```
No hosted build yet. Run it locally (Node 22+, desktop Chrome):
  git clone https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon
  cd ClinBridge_FireBaseAILogicHackathon
  npm ci
  npm run dev    -> open http://localhost:5173

Fictional Practice data only. Public practice credentials (they protect only fake data):
- Unlock: press "Use practice passphrase".
- Sign in: any person, PIN 2468. Daniel Okafor (RN) charts; Kim Ellis (Admin) runs downtime and recovery.

Try:
1. As Kim Ellis: Downtime Management -> Start a practice outage. The banner says Cloud blocked.
2. As Daniel Okafor: My Patients -> Arjun Mehta -> confirm the patient -> record vitals, a medicine or a note; or Photo of paper.
3. Reload: unlock again, and the records are still there (encrypted in IndexedDB).
4. As Kim Ellis: Downtime Management -> tick the checks -> PIN -> Clear network - Back online -> Recovery Gate & Worklist -> Export (FHIR R4).

Everything above works with no Firebase setup and no network. The AI features need a Firebase project:
copy .env.example to .env.local, add your Firebase web config and an App Check reCAPTCHA Enterprise
site key (or VITE_FIREBASE_APPCHECK_DEBUG=true with a registered debug token on localhost).
Then: Recovery Gate & Worklist -> a photo record -> Run cloud second look, or More -> Device vs Cloud.
On-device AI needs Chrome with Gemini Nano available (More -> AI check shows readiness).
Automated tests: npm test, npm run build, npm run test:e2e.
```

## Pre-existing work and tools (disclosure)

Put this in the Story or the "existing project" box if you answer "Existing":

- Built with standard tools: npm open-source libraries (see `package.json` and `NOTICE`) and AI coding assistance (Claude Code). The assistance is visible in the commit history.
- Visual design tokens came from a Google Stitch design export made for this project. The medical illustrations were cut from an AI-generated reference image made for this project (`docs/ASSETS.md`).
- Fictional seed data was written for the project (`scripts/gen_seed.py`). No real patient data and no MIMIC or eICU rows.

## Open risks before submitting

1. **Gemini Nano not live-verified.** The rules put Gemini Nano via Firebase AI Logic at the centre of the Web (Chrome) platform. Our on-device path is real code, but it has only been tested with mocks. If any team member has a Chrome-supported laptop (see `docs/GEMINI_NANO_SECOND_LAPTOP.md`), running it there before 30 Nov and filming it would remove the biggest gap. Otherwise the submission must say plainly that it was not live-verified, as the text above does.
2. **No hosted demo.** Judges can still read the code and video. A hosted build (for example Firebase Hosting on the free tier, with the App Check site key registered for that domain) would let them try the outage workflow without installing anything. It needs the owner's decision; it isn't required.
3. **Video not recorded yet.**
4. **Licence:** shown on GitHub only after this PR is merged into `main`.
5. **Dates and eligibility:** only the owner can answer these.
