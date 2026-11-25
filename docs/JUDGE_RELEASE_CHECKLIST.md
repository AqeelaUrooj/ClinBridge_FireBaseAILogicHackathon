# Release checklist for the public judge website

Open tests on the live site: [PHYSICAL_OFFLINE_TESTS.md](PHYSICAL_OFFLINE_TESTS.md) (install dialog, Wi-Fi off, Windows restart) and [GEMINI_NANO_VERIFICATION_CHECKLIST.md](GEMINI_NANO_VERIFICATION_CHECKLIST.md) (on-device AI).

For the owner. `PROJECT` stands for the approved Firebase project ID. Every step marked **APPROVAL** needs a separate yes. Fictional Practice data only. Background: [DEPLOYMENT.md](../DEPLOYMENT.md). What judges read: [JUDGE_DEMO_GUIDE.md](JUDGE_DEMO_GUIDE.md).

## 1. Before anything is public

- [ ] The pull request is merged (**APPROVAL**) and `main` is checked out: `git switch main`, `git pull`.
- [ ] `npm ci`, `npm run build:judge`, `npm run check:judge`, `npm run test:judge` pass.
- [ ] `firebase --version`, `firebase login:list`, `firebase projects:list` show the CLI, your account and the project. The console page **Project settings** shows the same project ID.
- [ ] The project is on the Spark plan. Do not upgrade.

The release check runs again before every deployment. It stops the deployment when the build was made for another Firebase project than the one it is sent to.

## 2. Hosting activation (**APPROVAL**, once)

`firebase hosting:sites:list --project PROJECT`. If the list is empty, the project has no site yet: Firebase console → Hosting → **Get started** (or `firebase hosting:sites:create PROJECT --project PROJECT`). It is free on Spark and publishes nothing.

## 3. Cloud AI for the website

- [ ] `hosting/.env.local` exists (copied web app settings, no debug switch). `npm run check:judge` says which names are set, never a value.
- [ ] App Check → APIs: **Firebase AI Logic: Enforced**. App Check → Apps: the web app is **Registered**.
- [ ] reCAPTCHA key → Domains: the final host name, and the preview host name **after** the preview exists. The preview name is `PROJECT--judge-preview-HASH.web.app`; it is not covered by the final name. Never `localhost`. Remove the preview name again when the preview ends.
- [x] Done on 24 Nov 2026 (5 per minute per user in all regions). Quota: Google Cloud → APIs → Firebase AI Logic API → Quotas & System Limits → "Generate content requests … per user …": default 100 per minute.
- [x] Done on 24 Nov 2026 (production, preview and localhost:5173; two APIs; see LIVE_TEST_RESULTS_2026-11-24.md). API key: Google Cloud → Credentials → the browser key → **Websites**: the final host and the preview host, each with `/*`. A star inside a name (`name--*.web.app`) is not allowed there. If localhost is still used for development, add it too or use another key. **APIs**: Firebase AI Logic API, Firebase App Check API.
- [ ] Delete App Check debug tokens that are not needed any more.

On Spark with the Gemini Developer API nothing is charged: above the free limits a request is refused and ClinBridge says so. reCAPTCHA: 10,000 free assessments a month.

## 4. Preview (**APPROVAL**: the address is public)

```powershell
firebase hosting:channel:deploy judge-preview --project PROJECT --expires 7d --no-authorized-domains
```

`--no-authorized-domains`: Firebase Authentication is not used. The command prints the HTTPS address. Run the same command again to update it.

## 5. Tests on the preview

Use Chrome with a **new profile** (profile picture → Add → Continue without an account).

**A. Page and installation**
- [ ] The landing page opens by HTTPS. `/ward` typed in the address asks for unlock and sign-in. Reload works on every address.
- [ ] "Saved in this browser. It now opens without internet." appears. Click **Install Desktop App** → Chrome's dialog → **Install**. The page says installed only after that.
- [ ] Its own window, name and icon; Start menu entry "ClinBridge Practice"; it starts at sign-in; no Real records anywhere.

**B. Real network disconnection**
- [ ] Sign in (Daniel Okafor, 2468). Kim Ellis starts the practice outage.
- [ ] Switch Wi-Fi off and pull any network cable. Check: another website does not open.
- [ ] Close the app, open it from the Start menu, unlock, sign in. Save vitals and a note. Open the four handwritten reports and download one picture.

**C. Restart and persistence**
- [ ] Still offline: restart Windows, open the app from the Start menu. The vitals and the note are there.
- [ ] Wi-Fi on: the banner still says SYSTEM DOWN until the admin clears the network.

**D. Genuine cloud AI (fictional data)**
- [ ] The preview host name is in the reCAPTCHA key (section 3); wait a few minutes after adding it.
- [ ] Back online → More → Device vs Cloud → a fictional patient → one report design → **Run cloud model**. DevTools → Network: `exchangeRecaptchaEnterpriseToken` 200, then `generateContent` 200. The card says "Cloud · ONLY_IN_CLOUD". Do not copy or screenshot tokens or headers.
- [ ] The DevTools console shows no Content-Security-Policy message.
- [ ] System down: the cloud button is blocked and DevTools shows no new request.
- [ ] A laptop without on-device AI: the page says so, and nothing is sent to the cloud.
- [ ] App Check → APIs: verified requests for Firebase AI Logic went up.
- Write down date, model name, time and the field-by-field result as a live result. A failed run is written down as failed.

If the cloud run says 401 or 403: check the domain in the reCAPTCHA key, then the API key's websites. Do not switch App Check off.

## 6. Production (**APPROVAL**, separate for every release)

First release: 24 Nov 2026, [RELEASE_REPORT_2026-11-24.md](RELEASE_REPORT_2026-11-24.md). If the release step answers HTTP 500, check that the live site is unchanged, then run the same command again.

```powershell
firebase deploy --only hosting --project PROJECT
```

Repeat section 5 A, B and D on the final address. Then write the address into JUDGE_DEMO_GUIDE.md.

## 7. Take it back

Console → Hosting → release history → Rollback; `firebase hosting:channel:delete judge-preview --project PROJECT`; or `firebase hosting:disable --project PROJECT` (takes the public site offline).
