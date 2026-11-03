# Legal launch checklist: Hisab

The 35-item checklist from `.claude/skills/legal-launch-checklist/SKILL.md`, applied to Hisab. Re-run it before every release.

**Last run:** 3 November 2026.

Hisab keeps all books on the device. It has no server, no accounts held by us, no analytics, no payments and no AI. That is why many items are N/A, and each one becomes relevant again if that changes.

| # | Item | Status | Evidence / what was done |
|---|---|---|---|
| 1 | Privacy policy | Done | `site/privacy.html`, linked before sign-in (`LegalLinks`), on the store listing and in Settings › About. Now names the publisher, the cookies position, GitHub Pages hosting and "no AI training" |
| 2 | Terms of use | **Fixed** | New `site/terms.html` (bilingual). Covers the publisher, licence, tax responsibility (not OTA-approved, not a Fawtara provider), price and auto-renewal, refunds, no uptime promise, liability, Omani law and Muscat courts |
| 3 | Accept checkbox | **Fixed** | `TermsConsent` on the welcome screen. Create Company, Restore and Load Demo are blocked until it is ticked (`e2e/terms.spec.ts`, English and Arabic) |
| 4 | Record acceptance | **Fixed** | `src/domain/legal.ts` stores the version, time and who accepted, and writes an audit-log entry. Settings › About shows it. A new `TERMS_VERSION` asks the administrator again (`TermsGateScreen`). Tested in `__tests__/legal.test.ts` |
| 5 | Separate marketing consent | N/A | No marketing messages are sent |
| 6 | Business contact details | **Fixed** | Support page and Terms: FutureX Technical Solutions, Al Wizarat, Bausher, Muscat. **Open:** CR number (`HISAB_CR_NUMBER`) and support email (`HISAB_CONTACT_EMAIL`) |
| 7 | Access and deletion | Done | Export Backup / CSV; Delete My Account; delete user; Delete Company; `site/delete-data.html` |
| 8 | Retention limits | Done | Privacy §6 and §9: data stays until deleted; accounting records are kept for 10 years (Oman) |
| 9 | Data minimisation | Done | Only the accounting data the user enters. Permissions: biometrics (optional) and the file picker |
| 10 | SDK and tracking audit | Done | No analytics, crash or ads SDKs. Dependencies in `package.json`; store labels say "Data not collected" |
| 11 | Trackers before consent / cookie banner | N/A | No cookies or trackers. Web local storage is strictly necessary, so no banner is needed (stated in the privacy policy) |
| 12 | Data processing agreements | N/A | No processor handles user data. GitHub Pages only serves the files (its own terms apply) |
| 13 | Sub-processors list | Done | Privacy policy states that there are none, and names GitHub Pages as host |
| 14 | No AI training | Done | No AI in the app; the privacy policy says data is never used to train AI |
| 15 | Children | Done | Terms: 18+, business tool. Privacy §8: not directed at children |
| 16 | Refund policy | Done | Terms §7: the app is free; future purchases are refunded through Apple and Google, without affecting Omani consumer rights |
| 17 | Easy to cancel | N/A (today) | No subscriptions. Terms §7 commits to cancelling in a few taps in the store account |
| 18 | Auto-renewal disclosed | Done | Terms §7, before any paid plan exists |
| 19 | No hidden fees | Done | Free; Terms §7 |
| 20 | In-app purchase for digital goods | N/A (today) | Rule in `CLAUDE.md` |
| 21 | No fake reviews | Done | None in the app, the site or the README |
| 22 | No unsupported claims | Done | "Not approved by the OTA" and "not a Fawtara provider" are stated; `CLAUDE.md` forbids such claims |
| 23 | No false SOC 2 or certification | Done | None claimed |
| 24 | No fake timers or scarcity | Done | None |
| 25 | No dark patterns | Done | Consent unticked by default; deletion available in the app; no pre-ticked boxes |
| 26 | Label AI content | N/A | No AI content |
| 27 | Realistic uptime | Done | Terms §8: no uptime promise; the app works offline |
| 28 | Customer logos | N/A | None used |
| 29 | Colour contrast | **Fixed** | Theme colours darkened to WCAG AA (success, warning, danger, info, draft, muted, accent, UAT banner, tab labels). `e2e/a11y.spec.ts` runs axe on the welcome, home, invoices, invoice, settings and account screens in English and Arabic |
| 30 | Alt text and accessible names | **Fixed** | Every text, number, date and search input now has an accessible name (`aria-label`); axe checks names and roles |
| 31 | Keyboard navigation | **Fixed** | Web: the terms checkbox toggles with Space; a keyboard-only test creates a company |
| 32 | Image, font and icon licences | Done | Icons: Ionicons via `@expo/vector-icons` (MIT). App icon made for Hisab. No web fonts |
| 33 | Open-source obligations | **Fixed** | Generated `/hisab/licenses/` page: every shipped package, its licence and the licence texts. Linked in Settings › About and from the Terms. No GPL-only packages (one dual-licensed BSD/GPL package is used under BSD) |
| 34 | DMCA | N/A | No user content is published |
| 35 | Unsubscribe in marketing email | N/A | No email is sent |

## Open items for the owner

- **Support email:** published on the privacy, terms and support pages (`HISAB_CONTACT_EMAIL`).
- **Commercial Registration number:** shown with the business details (`HISAB_CR_NUMBER`).
- **Lawyer review:** a licensed Omani lawyer reviews `site/terms.html` and `site/privacy.html` before a paid launch.
