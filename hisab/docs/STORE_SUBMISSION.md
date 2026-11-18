# Store submission checklist

Use this list for every App Store and Google Play release. Each item maps to a common rejection reason. Answers already filled in are correct for Hisab as built today. Re-check them if a feature changes what data leaves the device.

Last reviewed: November 2026.

---

## Go-live runbook (status 18 Nov 2026)

Ready now: the app (all tests green on UAT and production builds), the store texts in English and Arabic (`docs/STORE_LISTING.md`), draft screenshots (`store-assets/screenshots-draft/`), the security review and the legal checklist (both re-run 18 Nov), iPhone only.

Waiting on the owner:
- Apple: the switch of the Apple Developer account from individual to **organization** (FutureX, D-U-N-S number done) is pending Apple's approval. The owner chose to wait for it before TestFlight.
- Google Play: an organization account ($25 once) with the same D-U-N-S number. Huawei AppGallery: an enterprise account (free).

When the organization account is approved, in this order:
1. **Decide the permanent app ID** (bundle id / package name). Remind the owner: it can never change after the first upload. Proposed: `com.futurexoman.hisab`, or `om.futurex.hisab`; the placeholder `com.hisab.accounting` is not tied to FutureX. Set it with `HISAB_BUNDLE_ID` (EAS environment variable) or in `app.config.ts`.
2. Link Hisab to the Expo account (`eas init`), set `EAS_PROJECT_ID`, and the Apple team in EAS.
3. Bump the version if needed, move the CHANGELOG "Unreleased" section to 1.0.0, run `npm run verify`, `npm run test:e2e`, `npm run test:e2e:prod`, `npm run test:perf`.
4. `npm run build:prod` (with the owner's approval), then `npm run submit:prod` to App Store Connect: the build goes to **TestFlight** (internal testers, no review needed).
5. The owner tests on a real iPhone in English and Arabic: the remove-line bin buttons, VoiceOver reading the Arabic button names, Face ID, receipt photos, PDF sharing. Replace the draft screenshots with real ones from that iPhone.
6. App Store Connect: paste the texts, the answers in section 1 and the review notes; submit for review.

## 0. Before either store

- [ ] `npm run verify` is green on the release commit.
- [ ] The UAT build was tested on a real iPhone and a real Android phone, in English and Arabic, as admin, accountant and viewer.
- [ ] The public pages are live and open without signing in:
  - Privacy policy: `https://kalihashmi.github.io/billionpixels.github.io/hisab/privacy/`
  - Delete data: `…/hisab/delete-data/`
  - Support: `…/hisab/support/`
  - Terms of Use: `…/hisab/terms/`. In App Store Connect, set it as the custom licence agreement (EULA), or keep Apple's standard EULA and link the terms in the description.
  - Open-source licences: `…/hisab/licenses/`
- [ ] `docs/LEGAL_CHECKLIST.md` was re-run for this release.
- [x] Support email: **futurex.om@outlook.com** (the company address for all our apps). It is built into the public pages; use the same address in both store listings.
- [ ] Final bundle id / package is decided. Default: `com.hisab.accounting`, changed with `HISAB_BUNDLE_ID`. **It can never change after the first upload.**
- [ ] Optional: move the site to your own domain, then set `HISAB_SITE_URL` (app) and `HISAB_SITE_PATH` (site build).

---

## 1. Apple App Store

### App Review Guidelines, checked one by one (18 Nov 2026)

Checked against the current guidelines text (developer.apple.com/app-store/review/guidelines). ✅ = met in the app or its metadata today; ☐ = a step in App Store Connect or on a device, at submission.

| Guideline | What Apple checks | Hisab |
| --- | --- | --- |
| **1.5 Developer information** | A support URL with a way to contact you | ✅ Support page with futurex.om@outlook.com, the company, address and CR number |
| **2.1 App completeness** | Final build, no placeholder content, tested on a device, no crash; demo account info if there is a login; working URLs | ✅ No placeholders (production has no demo company or UAT label: `e2e/production.spec.ts`); all public pages live. Sign-in is local with no server, so there is no account to give: the review notes tell the reviewer to create the company and administrator. ☐ Test the TestFlight build on a real iPhone before submitting |
| **2.3.1 / 2.3.7 Accurate metadata** | No hidden features; name ≤ 30 characters, unique; honest keywords (no competitor names) | ✅ `docs/STORE_LISTING.md` (lengths checked by `scripts/listing-lengths.mjs`; no other app or brand names). ☐ App Store Connect confirms the name is free when the app record is created |
| **2.3.3 Screenshots** | Show the app in use, not a title or sign-in screen | ✅ Seven working screens per language. ☐ Replace the drafts with screenshots from the iPhone (status bar, real fonts) |
| **2.3.6 / 2.3.8 Age rating, metadata for all audiences** | Honest age-rating answers; metadata suitable for 4+ | ✅ Nothing objectionable. ☐ Answer Apple's newer age-rating questions (2025 system: 4+, 9+, 13+, 16+, 18+): no user-generated content shared with others, no messaging, no web browsing, no gambling, no ads, no medical content → 4+ |
| **2.3.10 Other platforms** | No Android, Google Play or other store names in the iOS app or its metadata | ✅ The iOS texts say "Face ID or Touch ID"; Android wording ("fingerprint") is only in the Google Play / Huawei texts. In the app, "Android" appears only in two messages shown in the browser version, never on iPhone |
| **2.4.1 iPhone apps on iPad** | iPhone apps should still run on iPad (compatibility mode); reviewers may test there | ✅ `supportsTablet: false`, so it runs on iPad as an iPhone app, portrait. ☐ Open the TestFlight build once on an iPad if one is available |
| **2.5.1 / 2.5.2 Public APIs, no downloaded code** | No private APIs; no code downloaded or executed to change features | ✅ Expo SDK only. The document reader (pdf.js, Tesseract) and its English and Arabic language data are bundled in the app (`scripts/vendor-ocr.mjs`); nothing is fetched at runtime |
| **2.5.4 Background modes** | Only declared modes, used for their purpose | ✅ None declared |
| **3.1.1 In-app purchase** | Digital features sold through Apple IAP | ✅ Nothing is sold; the Terms say Hisab is free and future plans would use App Store / Google Play billing |
| **4.0 / 4.2 Design, minimum functionality** | Native, useful, not a repackaged website | ✅ Native accounting app with offline ledger, PDFs, scanning, reports, payroll; Arabic right-to-left |
| **4.8 Login services** | Third-party login (Google, Facebook…) needs an equivalent private option (e.g. Sign in with Apple) | ✅ Not required: Hisab uses only its own sign-in, on the device |
| **5.1.1(i) Privacy policy** | Linked in App Store Connect and inside the app; says what is collected, retention and deletion | ✅ `site/privacy.html`, linked on the welcome, sign-in and account screens |
| **5.1.1(ii)–(iv) Permission, minimisation, access** | Clear purpose strings; only needed data; out-of-process pickers; works if a permission is refused | ✅ Camera, photos and Face ID purpose strings in `app.config.ts`; the system document and photo pickers are used; scanning and photos are optional, and everything works without them |
| **5.1.1(v) Sign-in and account deletion** | Login only if the app has significant account-based features; in-app deletion | ✅ Sign-in exists because a company has several users with different roles (administrator, accountant, viewer) and an audit log of who changed what; this is said in the review notes. Deletion: Delete My Account, Delete User, Delete Company |
| **5.1.1(ix) Regulated fields** | Financial apps submitted by a legal entity, not an individual | ✅ Submitted by FutureX Technical Solutions LLC once the organization account is approved (one more reason to wait for it) |
| **5.1.2 Data use and sharing** | No sharing without permission, including with AI | ✅ No data leaves the device; no AI service |
| **5.2 Intellectual property** | Only content you have rights to | ✅ Own icon and artwork; open-source licences published (`…/hisab/licenses/`); screenshots use sample company names |
| **Privacy manifest and SDK reasons** | Required-reason APIs declared | ✅ `ios.privacyManifests` in `app.config.ts` |
| **Export compliance** | Encryption declaration | ✅ `ITSAppUsesNonExemptEncryption = false` (password hashing only) |
| **Build requirements** | Built with the current Xcode / iOS SDK Apple requires for new uploads | ☐ EAS builds with its latest image for Expo SDK 58; check Apple's "Upcoming requirements" page before the build |
| **EU trader status (Digital Services Act)** | To be on the EU App Store, declare trader status; traders' address, phone and email are shown to EU customers | ☐ Decide in App Store Connect › Business: declare FutureX as a trader (company address, phone, email shown in the EU), or leave EU countries out of distribution for now |

### App Store Connect answers

- **App Privacy (nutrition label):** *Data Not Collected*.
- **Privacy manifest:** declared in `app.config.ts` → `ios.privacyManifests` (no tracking, no collected data types).
- **Export compliance:** *Uses non-exempt encryption: No*. This is already in the config (`ITSAppUsesNonExemptEncryption = false`). Hisab only hashes passwords.
- **Age rating:** answer *None* / *No* to every question in the current questionnaire (content, user-generated content, messaging, web access, gambling, ads, medical). The result is 4+.
- **Category:** Primary *Finance*, secondary *Business*.
- **Content rights:** *Does not contain third-party content*.
- **Sign-in required:** No. Use the review notes below.
- **Localizations:** English and Arabic. Add an Arabic name, subtitle, description and screenshots (`docs/STORE_LISTING.md`, `store-assets/`).
- **Availability:** Oman and the other countries you choose. The EU needs the trader-status decision above first.
- **Accessibility (optional "Accessibility" labels on the product page):** only claim what was tested on the phone: VoiceOver, larger text, dark interface not supported (the app is light only), sufficient contrast.

### App Review notes (paste into "Notes")

```
Hisab is an offline accounting app. All data is stored only on the device; there is no server
and no online account.

Why there is a sign-in: a company's books are shared by several people on the same device with
different roles (administrator, accountant, read-only viewer), and an audit log records who changed
what. There is no server to turn on and no demo account to give: the reviewer creates their own.

How to review:
1. On first launch, enter any company name, tick the Terms checkbox and create the administrator
   (e.g. username "reviewer", password "Review2026").
2. You are signed in as administrator with full access.
3. To see role restrictions, go to My Account › Users & Access and create an Accountant
   or Viewer user, then sign out and sign in as that user.
4. Account deletion: My Account › Delete My Account (any user, confirms with password);
   admins can also delete other users (Users & Access) or erase everything
   (My Account › Settings › Delete Company).
5. Language: the English / العربية switch is at the top of the sign-in screen
   (Arabic uses a right-to-left layout).

Face ID is optional and only unlocks the app on the device.
```

### Screenshots

- **iPhone 6.9"** (1320 × 2868), 3–10 images. Apple scales them down for smaller iPhones.
- No iPad screenshots: the first release is **iPhone only** (`supportsTablet: false`, owner's choice on 18 Nov 2026). Adding iPad later means iPad screenshots and an iPad review.
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
| **Account deletion**: in-app path *and* a web URL | ✅ In app (Delete My Account / Delete User / Delete Company) + `…/hisab/delete-data/` |
| **Target API level**: new apps and updates must target Android 16 (API 36) since 31 Aug 2026 | ✅ Expo SDK 58 targets API 36 by default |
| **Data safety form** completed | Answers below |
| **Closed testing**: *personal* developer accounts created after 13 Nov 2023 need **12 testers opted in for 14 consecutive days** before production access | Plan for it (below). *Organisation* accounts (with a D-U-N-S number) are exempt |
| **Generative-AI content reporting** | Not applicable (no AI) |
| **Permissions** declared and justified | Biometrics (unlock), camera and photo library (receipt photos, only when the user taps Take Photo or Choose Photo; purpose strings in the `expo-image-picker` plugin) and internet. Storage, overlay and microphone permissions are blocked in `app.config.ts`. Receipt photos stay on the device, so the privacy labels stay "Data Not Collected" |

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
