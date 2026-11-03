---
name: legal-launch-checklist
description: Legal, privacy, accessibility and store-trust checklist (35 items) for any app or website. Use when starting a new app or project, before the first store submission or public launch, before each release, and whenever a change touches personal data, payments, subscriptions, marketing, AI, analytics/SDKs, accounts, public claims or the privacy policy/terms. Produces a status table (done / not applicable / fix) and fixes the gaps.
---

# Legal launch checklist

Run this for every new project and before every release. Record the result in the project as `docs/LEGAL_CHECKLIST.md` (one row per item: **Done**, **N/A** with the reason, or **Fix** with what was changed). Re-run it when a change touches anything in the "Triggers" list in the description.

This is not legal advice. Before a paid launch, have a qualified lawyer in the target country (Oman: a licensed Omani lawyer) review the terms and privacy policy.

## How to run it

1. Read the code, the store answers, the public pages and the dependency list. Find out first, don't assume: what data leaves the device, which SDKs are in the build, what is sold, who the users are.
2. Go through every item below. For each one, decide **Done / N/A / Fix**, and write down the evidence: a file, a test or a page.
3. Fix every **Fix** in the same change, with a test where the behaviour is in code (for example, a checkbox that blocks sign-up, or an automated accessibility scan).
4. Never invent facts for legal pages: company name, registration number, address, contact email, prices. Ask the owner, or leave a clearly marked placeholder and report it.
5. Report the table to the owner, plus any open items that need their decision.

## The 35 items

### Documents and consent
1. **Privacy policy** covers: what is collected, why, who it is shared with, how long it is kept, and the user's rights. It is linked in the app before sign-in and in the store listing.
2. **Terms of use / service.** Include who the publisher is, licence, acceptable use, responsibility limits, governing law and how changes are handled.
3. **Checkbox to accept the privacy policy and terms.** Unticked by default, and it blocks sign-up until ticked.
4. **Record acceptance.** Store the version, the time and who accepted, and ask again when the terms change.
5. **Separate marketing consent.** It is never bundled with the terms checkbox and never pre-ticked.
6. **Business contact details** are published: legal name, address, registration number and a contact email.

### Data protection
7. **Data access and deletion requests:** in-app export, in-app account deletion, and a public web page explaining deletion (Apple 5.1.1(v), Google Play).
8. **Data retention limits** are stated, and legal retention duties are respected (for example, 10 years for Oman accounting records).
9. **Stop collecting unnecessary data.** Collect only what a feature uses, and request only the permissions it needs.
10. **Audit third-party SDKs, analytics and tracking.** List every SDK that sends data, and match the store privacy labels to it.
11. **Block trackers until the user consents.** Show a cookie banner only if non-essential cookies or trackers exist; strictly necessary storage needs none.
12. **Data processing agreements** are signed with every processor that handles user data: hosting, email, analytics, AI.
13. **Sub-processors list** is published, or the policy states that there are none.
14. **No AI training on user data** without explicit opt-in, and the policy says so.
15. **Children:** get parental consent before collecting children's data, or state "not for children" and gate by age if needed (COPPA, Google Families).

### Payments and subscriptions
16. **Refund policy** is stated; for store purchases, point to Apple and Google refunds.
17. **Subscriptions are easy to cancel,** as easy as signing up.
18. **Auto-renewal is disclosed** before purchase: price, period, renewal, how to cancel.
19. **No hidden fees.** The full price is shown before purchase.
20. **Digital goods use in-app purchase** (Apple 3.1.1 and Google Play billing).

### Honesty and trust
21. **No fake reviews or testimonials.**
22. **No unsupported claims:** "approved by", "certified", "#1", "bank-grade" and similar need proof.
23. **No false SOC 2, ISO or other certification claims.**
24. **No fake countdown timers or fake scarcity.**
25. **No dark patterns:** equal-weight "No" buttons, no confirm-shaming, no pre-ticked boxes, no hard-to-find cancel.
26. **Label AI-generated content,** and add a "report AI content" option if the app generates content (Google Play).
27. **Realistic uptime commitments.** Promise no SLA you can't keep.
28. **Customer logos only with written permission.**

### Accessibility (WCAG 2.1 AA)
29. **Colour contrast** of at least 4.5:1 for text. Check with an automated scan (axe).
30. **Alt text and accessible names** for images, icon buttons and form fields.
31. **Keyboard navigation** works on web: reach every control, toggle with Space or Enter, and keep focus visible.

### Licences and IP
32. **Image, font and icon licences** allow commercial use; record each source.
33. **Open-source licence obligations:** publish the notices (licence list and texts) and avoid GPL in closed apps.
34. **DMCA / takedown:** if users can upload public content, register a DMCA agent (US) and publish a takedown contact; otherwise N/A.

### Email
35. **Unsubscribe link in every marketing email** (CAN-SPAM, PDPL consent).

## Good defaults for our apps (FutureX Technical Solutions)

- Publisher: FutureX Technical Solutions (فيوتشر اكس للحلول التقنية), Al Wizarat, Bausher, Muscat Governorate, Sultanate of Oman. Support email for every app: futurex.om@outlook.com. Ask for the CR number; don't guess it.
- Write the pages bilingually (English and Arabic, with Arabic in right-to-left). The Terms state that the Arabic version prevails, under Omani law and the courts of Muscat.
- Hisab (`hisab/`) is the reference implementation:
  - `site/terms.html` and `site/privacy.html`;
  - `src/domain/legal.ts` (terms version and acceptance), with `TermsConsent` in `src/ui/LegalLinks.tsx`;
  - `e2e/a11y.spec.ts` (axe scan and keyboard test) and `e2e/terms.spec.ts`;
  - `scripts/build_pages.py` (generated open-source licences page);
  - `docs/LEGAL_CHECKLIST.md` (filled-in example).
