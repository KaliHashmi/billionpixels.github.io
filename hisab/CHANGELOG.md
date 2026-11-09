# Changelog

All notable changes to Hisab. Versions follow [semantic versioning](https://semver.org); store releases are tagged `hisab-vX.Y.Z`.

## [Unreleased] — 1.0.0 candidate

### Purchases from paper and Excel
- Import purchase bills and cash expenses from a CSV file (Vendors › Purchase Invoices › Import CSV), with a downloadable template. English or Arabic column names, day-first or ISO dates, VAT 5 / 0 / exempt. Bills are confirmed and numbered, expenses become payment vouchers; bad rows are listed by row number, and a bill already in the books is not imported twice.
- Receipt photos: take or choose a photo of the paper receipt or supplier invoice on any purchase bill, vendor credit note or payment voucher. Photos are reduced in size, kept on the device and in backups; adding and removing them is recorded in the audit log.
- Scan or upload a supplier invoice or receipt (PDF or photo): Hisab reads it on the device and opens a draft bill with the vendor (by VAT number or name), invoice number, date, net amount and VAT filled in. It shows the total on the paper next to its own calculation and lists anything it could not read; the user corrects and confirms. PDFs with text are read exactly; photos and scanned PDFs go through on-device text recognition (English and Arabic). The file is kept as the receipt photo.
- Scanning made simpler: a **Scan or Upload** card on the Dashboard (camera or files); several files at once, read in the background and listed for review; each paper goes to the right place by its words (purchase bill, vendor credit note, or cash expense for till receipts) and can be switched with one tap; the account is remembered from the vendor's last booking, or chosen from words such as fuel, rent or electricity. All rules, no AI service.
- Only accounting documents are accepted: a scanned or uploaded file, and every receipt photo, is read on the device first and kept only if it shows an amount and an accounting sign (VAT number, invoice / receipt / VAT / total words, or the currency). Anything else (a person, a letter, a picture) is refused with a clear message and nothing is kept. An administrator may still attach a handwritten or faded receipt that cannot be read, after confirming; this is recorded in the audit log. Accountants are refused.
- Privacy policy updated for the camera, receipt photos and on-device document reading (terms version 2026-11-08).

### Security (27-check review, docs/SECURITY_REVIEW.md)
- PDF library jsPDF updated from 2.5.2 to 4.2.1 (removes known critical and high advisories); invoices and reports checked in English and Arabic.
- The browser frame that draws PDFs is sandboxed, so no script can run in a document.
- CSV exports keep cells starting with = + - @ as text, so a name cannot run as a formula in Excel.
- Backups are refused if their records are malformed or a "photo" is not a JPG/PNG image.
- The audit log now records adding a user, role changes and deactivation, password resets and password changes.
- Settings says plainly that a backup file holds all the books and is not encrypted.

### Development
- `npm run impact`: before each push, lists the screens, shared code and tests that use the changed files, worked out from the imports in the code (no AI, nothing to keep up to date). Its own tests run in `npm run verify`.

### Look
- Brand colour changed from purple to FutureX blue (#1E66D0, from the ATND palette) in the app, the app icon, the splash screen, PDF documents and the public pages. White text on it meets WCAG AA (5.4:1).
- New logo: حساب drawn as one geometric line with a cyan coin dot, and HISAB underneath. Used for the app icon, Android adaptive and monochrome icons, splash, favicon and the header. Source files in `assets/brand/`.

### Legal launch checklist (35 items, see docs/LEGAL_CHECKLIST.md)
- Terms of Use page (English and Arabic), linked in the app, the public pages and Settings.
- "I agree to the Terms of Use and Privacy Policy" checkbox before creating a company, restoring a backup or loading the demo. The accepted version, time and person are recorded and written to the audit log. New terms ask the administrator again.
- Privacy policy now names the publisher, states there are no cookies, trackers or sub-processors, names the GitHub Pages hosting, and says data is never used to train AI.
- Business details (FutureX Technical Solutions, Muscat) on the support page and in the terms.
- Open-source licences page listing every shipped package and its licence text.
- Accessibility (WCAG 2.1 AA): darker theme colours for contrast, names on every input, and a keyboard-operable checkbox. Automated axe scan and keyboard-only browser test.

### Oman legal compliance
- Issued documents are never deleted (10-year retention, VAT Law Art. 100):
  - issued sales invoices and credit notes are corrected or cancelled with a tax credit note, which must give a reason;
  - bills, entries, vouchers, payroll and VAT closings are cancelled and kept;
  - undoing a bank match, a cheque clearance or a cash day cancels its entry rather than erasing it.
- Audit Log of cancellations, corrections, edits and user deletions.
- Tax documents:
  - optional Date of Supply;
  - credit note reason and original reference;
  - drafts marked "not a tax document";
  - CANCELLED and CREDITED marks.
- Social Protection Fund:
  - 2026 rates (8% / 14.5% Omani, 2% expatriate employer);
  - OMR 3,000 contribution wage ceiling;
  - separate expatriate rate;
  - a "rates last checked" control.
- Fawtara e-invoicing notice; 10-year retention wording; PDPL controller notice in the privacy policy; `docs/OMAN_COMPLIANCE.md`.

### Added
- Store readiness:
  - Bilingual public pages: privacy policy, delete your data, and support.
  - Privacy Policy and Support links on the welcome, sign-in and account screens.
  - Every user can delete their own account (My Account, confirmed with their password); administrators can delete other users.
  - Delete Company now also erases saved sign-in details.
  - iOS privacy manifest.
  - Unused Android storage, overlay and microphone permissions are blocked.
- Documentation: architecture, release process, store-submission checklist, the new-app playbook and `CLAUDE.md`.
- Keep me signed in (30 days).
- Role-based edit and delete on printable documents: admins edit and delete, accountants delete, viewers read only.
- Company stamp and authorised signature on every PDF.
- PDF download, print and export in the browser previews.
- Logo in the header.
- Arabic-safe switches.

### Changed
- Accounting engine and reports split into focused modules (no behaviour change).
- Browser tests (Playwright) in `e2e/`, run by CI on every push.
- Test tooling moved to `devDependencies`.
- `npm run verify` runs all checks.
