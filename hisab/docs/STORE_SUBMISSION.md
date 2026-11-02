# Store submission checklist

Use this list for every App Store and Google Play release. Each item maps to a common rejection reason. Answers already filled in are correct for Hisab as built today. Re-check them if a feature changes what data leaves the device.

Last reviewed: November 2026.

---

## 0. Before either store

- [ ] `npm run verify` is green on the release commit.
- [ ] The UAT build was tested on a real iPhone and a real Android phone, in English and Arabic, as admin, accountant and viewer.
- [ ] The public pages are live and open without signing in:
  - Privacy policy: `https://kalihashmi.github.io/billionpixels.github.io/hisab/privacy/`
  - Delete data: `…/hisab/delete-data/`
  - Support: `…/hisab/support/`
- [ ] A real support email address is set. Build the site with `HISAB_CONTACT_EMAIL=… npm run build:web` and use the same address in both store listings.
- [ ] Final bundle id / package is decided. Default: `com.hisab.accounting`, changed with `HISAB_BUNDLE_ID`. **It can never change after the first upload.**
- [ ] Optional: move the site to your own domain, then set `HISAB_SITE_URL` (app) and `HISAB_SITE_PATH` (site build).

---

## 1. Apple App Store

### Guidelines that reject most apps, and Hisab's status

| Guideline | What Apple checks | Hisab |
| --- | --- | --- |
| **2.1 App Completeness** | The reviewer must be able to reach every feature. If a sign-in is required, give them working credentials. | Sign-in is local. The reviewer creates a company and administrator on the first screen. Explain this in the review notes (below). |
| **4.2 Minimum Functionality** | The app is not a thin website or chatbot wrapper. | A native accounting app with offline ledger, PDFs and reports. ✅ |
| **5.1.1(v) Account deletion** | Apps that create accounts must offer deletion inside the app. | Admin: Users & Access › **Delete User**, and Settings › **Delete Company** (erases everything). ✅ |
| **5.1.1 / 5.1.2 Privacy** | Privacy policy link in the app and in App Store Connect. No data shared (including with AI) without consent. | Policy linked on the welcome, sign-in and account screens. No data leaves the device. No AI. ✅ |
| **3.1.1 In-App Purchase** | Digital features must be sold through Apple IAP. | Nothing is sold. If subscriptions are added, use IAP (RevenueCat or StoreKit). |
| **2.3 Accurate metadata** | Screenshots show the real app; the description has no false claims. | Take screenshots from the production build. |

### App Store Connect answers

- **App Privacy (nutrition label):** *Data Not Collected*.
- **Privacy manifest:** declared in `app.config.ts` → `ios.privacyManifests` (no tracking, no collected data types).
- **Export compliance:** *Uses non-exempt encryption: No*. This is already in the config (`ITSAppUsesNonExemptEncryption = false`). Hisab only hashes passwords.
- **Age rating:** answer *None* to every content question. The result is 4+.
- **Category:** Primary *Finance*, secondary *Business*.
- **Content rights:** *Does not contain third-party content*.
- **Sign-in required:** No. Use the review notes below.
- **Localizations:** English and Arabic. Add an Arabic name, subtitle, description and screenshots.

### App Review notes (paste into "Notes")

```
Hisab is an offline accounting app. All data is stored only on the device; there is no server
and no online account.

How to review:
1. On first launch, enter any company name and create the administrator
   (e.g. username "reviewer", password "Review2026").
2. You are signed in as administrator with full access.
3. To see role restrictions, go to My Account › Users & Access and create an Accountant
   or Viewer user, then sign out and sign in as that user.
4. Account deletion: My Account › Users & Access › (user) › Delete User,
   or My Account › Settings › Delete Company to erase all data.
5. Language: the English / العربية switch is at the top of the sign-in screen
   (Arabic uses a right-to-left layout).

Face ID is optional and only unlocks the app on the device.
```

### Screenshots

- **iPhone 6.9"** (1320 × 2868), 3–10 images. Apple scales them down for smaller iPhones.
- **iPad 13"** (2064 × 2752). This is **required** because `supportsTablet: true`. If you do not want to support iPad, set `supportsTablet: false` before the first submission.
- Make one set in English and one in Arabic.

### Submit

```bash
npm run build:prod       # IPA + AAB, build numbers auto-increment
npm run submit:prod      # uploads to App Store Connect and Play Console
```

1. Test the build through TestFlight first.
2. Then add it to the version and select **Submit for Review**.

First reviews usually take 1–3 days. A rejection plus a fix and resubmission adds the same again, so plan about a week.

---

## 2. Google Play

### Requirements that block publishing, and Hisab's status

| Requirement | Hisab |
| --- | --- |
| **Privacy policy URL** in Play Console *and* inside the app | ✅ Same URL as Apple; linked in the app |
| **Account deletion**: in-app path *and* a web URL | ✅ In app (Delete User / Delete Company) + `…/hisab/delete-data/` |
| **Target API level**: new apps and updates must target Android 16 (API 36) since 31 Aug 2026 | ✅ Expo SDK 58 targets API 36 by default |
| **Data safety form** completed | Answers below |
| **Closed testing**: *personal* developer accounts created after 13 Nov 2023 need **12 testers opted in for 14 consecutive days** before production access | Plan for it (below). *Organisation* accounts (with a D-U-N-S number) are exempt |
| **Generative-AI content reporting** | Not applicable (no AI) |
| **Permissions** declared and justified | Only biometrics (unlock) and internet. Storage, overlay and microphone permissions are blocked in `app.config.ts` |

### Data safety answers

- Does your app collect or share any of the required user data types? **No.**
- Is all user data encrypted in transit? Not applicable (no data is transmitted). If asked, answer *Yes*.
- Do you provide a way for users to request that their data is deleted? **Yes**. Give the URL `…/hisab/delete-data/`.
- Account creation: *Yes, users can create an account* (username and password, stored on the device). Deletion URL: same as above.

### Other Play Console sections

- **Content rating (IARC):** category *Utility / Productivity*; answer *No* to everything. The result is *Everyone* / 3+.
- **Target audience:** 18+. This is a business tool and is not designed for children, which keeps you out of the Families policy.
- **Ads:** *No ads*.
- **App access:** "All functionality is available without special access". Add the same instructions as the Apple review notes.
- **Government app / financial features:** Not a government app. Financial features: *None of the above* (it is accounting software, not a bank, lender or wallet).
- **Store listing:** an English and an Arabic listing, a 512 × 512 icon, a 1024 × 500 feature graphic, and 2–8 phone screenshots.

### Closed testing plan (personal accounts)

1. Build a production AAB and upload it to **Testing › Closed testing**.
2. Invite at least 12 people by email list or Google Group (15–20 is safer: if anyone opts out, the 14-day count fails).
3. Each tester opens the opt-in link, installs the app and keeps it installed for 14 days.
4. On day 15, choose **Apply for production**. Answer the questions about the testing, the feedback you received and what you changed.
5. Google reviews the request (usually a few days), and then you can roll out to production.

---

## 3. Legal risks that hit apps outside the stores

These do not apply to Hisab today. They are written into `CLAUDE.md` as guardrails so a future change does not introduce them.

| Risk | Exposure | Rule |
| --- | --- | --- |
| Collecting data from children under 13 (US COPPA) | FTC civil penalty up to $53,088 per violation (2025 amount) | No age-targeting of children; ask age before collecting data in consumer apps |
| Fonts or scripts loaded from Google's servers (GDPR) | LG München I, 20 Jan 2022: €100 damages per visitor, plus injunction | Bundle fonts locally |
| Session replay or recording without consent (California CIPA) | Up to $5,000 per violation | No session-recording SDKs |
| Marketing email without an unsubscribe link (US CAN-SPAM) | Up to $53,088 per email (2025 amount) | Unsubscribe link and postal address in every marketing email |
| Images copied from Google Images (US copyright) | Statutory damages up to $150,000 per work if willful | Use your own or properly licensed assets |
| Oman Personal Data Protection Law (Royal Decree 6/2022) | Fines from the regulator | Collect nothing without a lawful basis; the privacy policy states this |

---

## 4. After approval

- [ ] Tag the release: `git tag hisab-v1.0.0 && git push origin hisab-v1.0.0`.
- [ ] Add an entry to `CHANGELOG.md`.
- [ ] Bump `version` in `app.config.ts` for the next release. Build numbers increment automatically.
