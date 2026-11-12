# Hisab — mobile accounting

Hisab (حساب, "account") is an iOS/Android accounting app modelled on the **Accounting** module of Odoo: invoices, bills, payments, bank reconciliation, taxes, assets and financial reports, built on a real double-entry ledger.

It targets businesses in **Oman** (OMR with 3 decimals, 5% VAT, Oman tax invoice content, social insurance) and is fully bilingual **English / Arabic** with a right-to-left layout in Arabic.

Built with Expo (SDK 58) + React Native + TypeScript + Expo Router. Data is stored on the device in SQLite.

## Features

| Area | What you can do |
| --- | --- |
| **Dashboard** | Receivables, payables, overdue amounts, bank & cash, net profit for the fiscal year, 6-month income vs. expenses chart, one card per journal (sales, purchases, bank, cash, misc) with quick actions |
| **Customers** | Invoices and credit notes (draft → posted, sequence numbers `INV/2026/00001`, `RINV/…`), company stamp and authorised signature printed on every issued invoice and voucher (generated stamp or uploaded image; drawn or uploaded signature), payment terms & due dates, products, discounts, multiple taxes per line, analytic accounts, PDF share/print, register payment (full or partial), apply outstanding credits, full or partial credit notes, duplicate, reset to draft, cancel |
| **Vendors** | Bills and refunds with bill reference and separate accounting date, vendor payments |
| **Payments** | Customer & vendor payments through bank or cash journals, automatic matching with invoices, *In Payment* → *Paid* once the bank statement is reconciled (same flow as Odoo's outstanding accounts), cancel/unreconcile |
| **Bank reconciliation** | Add transactions or import a CSV statement, smart matching suggestions (amount, partner, invoice number), match several invoices/payments at once, book the remainder on any account with an optional tax (bank fees, etc.), undo reconciliation |
| **Follow-up** | Overdue customers, payment reminder PDF, email and call shortcuts |
| **Accounting** | Manual journal entries (balanced check), reversals, journal items browser with reconciliation status |
| **Assets** | Fixed assets with straight-line monthly depreciation board, posting of due depreciation entries |
| **Taxes** | Percentage or fixed taxes, price-included taxes, sales/purchase scopes, tax report (base + tax per rate), tax closing entry with automatic tax lock date |
| **Reporting** | Profit & Loss, Balance Sheet, Cash Flow, Executive Summary, General Ledger, Trial Balance, Journal Audit, Partner Ledger, Aged Receivable, Aged Payable, Analytic report — with period presets, drill-down to entries, PDF and CSV/Excel export |
| **Configuration** | Chart of accounts (Odoo-style generic template), journals, taxes, payment terms, analytic accounts, products, contacts, company details, fiscal year end, lock dates, default accounts/taxes |
| **Users & roles** | Administrator, accountant and viewer roles; PBKDF2-hashed passwords with lockout; keep me signed in; Face ID / fingerprint unlock; admins can delete users |
| **Data** | JSON backup export (share to email/Drive/iCloud) and restore, delete company (erases all data on the device) |

Accounting rules enforced by the engine (`src/domain`): every posted entry balances, posted entries are immutable (reset to draft first), entries on or before the lock date cannot be created or changed, taxes are locked after a tax closing, sequence numbers are per journal and year, reconciliation only between items of the same account.

## Daily, weekly and monthly accounting

| Need | Where in the app |
| --- | --- |
| Record all cash and bank transactions | Accounting › Cash & Bank Book (receive / pay / expense / other income), Bank Reconciliation |
| Customer receipts and supplier payments | Customers › Customer Receipts, Vendors › Supplier Payments (cash, bank transfer, card, cheque) |
| Receipt vouchers and payment vouchers | Every receipt/payment is numbered `RV/2026/00001` / `PV/2026/00001` and prints a bilingual voucher (سند قبض / سند صرف) with the amount in words |
| Sales invoices, purchase invoices, credit notes | Customers › Sales Invoices / Credit Notes, Vendors › Purchase Invoices / Vendor Credit Notes |
| Reconcile daily cash collections and card payments | Accounting › Daily Cash Closing (cash count with automatic over/short entry, card terminal total); card receipts wait in a clearing account until the bank settlement is matched (fees booked automatically) |
| **Weekly:** customer outstanding, supplier outstanding, bank & cash balance, pending collections & payments, unallocated receipts & payments, cheques issued/received/pending | Reporting › Weekly Reports |
| **Monthly owner pack:** P&L, balance sheet, cash flow, bank reconciliation, customer & supplier outstanding, VAT report, expense report (vs previous period), budget vs actual, payroll report | Reporting › Monthly Reports for the Owner |

Cheques: received cheques sit in *Cheques Under Collection* and issued cheques in *Cheques Issued – Pending Clearance* until they clear, either by matching the bank statement or with **Mark as Cleared**. A bounced cheque cancels the receipt and reopens the invoice.

Payroll: employees (Omani / expatriate, basic + housing/transport/other allowances, bank & IBAN for WPS), monthly payroll runs with overtime and deductions, social insurance for insured employees (rates configurable in Settings), posting to salaries/SI payable and salary payment from the bank.

## Oman compliance

Hisab is built to help a business keep Oman-compliant books. It is **not approved by the Oman Tax Authority**, and the business remains responsible for its returns. The full legal review, with sources and the points to confirm with a tax adviser, is in [docs/OMAN_COMPLIANCE.md](docs/OMAN_COMPLIANCE.md).

- **Records are never erased.** Issued tax invoices and credit notes are corrected only with a tax credit note (with its reason). Bills, entries, vouchers, payroll and VAT closings are cancelled and kept, never deleted. Oman law requires records to be kept for 10 years. Only drafts that were never numbered can be deleted. Every cancellation, correction and edit of an issued document is written to the **Audit Log**.
- **Tax invoices** show:
  - the words "Tax Invoice" in English and Arabic;
  - the supplier's and customer's names, addresses and VATINs;
  - a sequential number, the issue date, and the date of supply when it differs;
  - per line: description, quantity, unit price, taxable amount, VAT rate and VAT amount;
  - totals with and without VAT in OMR.
  Credit notes reference the original invoice and state the reason. Drafts are marked "not a tax document".
- **VAT treatments** per tax: standard (5%), zero-rated (incl. exports), exempt, out of scope, reverse charge on imported services, and deferred import VAT.
- **VAT return** groups the period's figures. A closing entry moves the balance to VAT payable and locks the period.
- **Social insurance** defaults are the Social Protection Fund rates published for 2026:
  - Omani staff: 8% employee and 14.5% employer;
  - insured expatriates: 2% employer;
  - OMR 3,000 ceiling on the contribution wage.
  All are editable, with a "rates last checked" date. Confirm them with the Fund.
- **E-invoicing (Fawtara)** is not integrated yet. VAT-registered businesses must use an approved provider from 1 April 2027 (supplies above OMR 5m) or 1 October 2027 (all others). The app warns about this in Settings.

## Environments: UAT and production

Three variants install side by side: **Hisab (Dev)**, **Hisab UAT** (orange badge, demo company, separate database) and **Hisab** (production). See [docs/RELEASE.md](docs/RELEASE.md).

## Run locally

```bash
cd hisab
npm install
npm start            # development variant (press i / a, or scan with a dev build)
npm run start:uat    # run the UAT variant
npm run start:prod   # run the production variant
npm run web          # browser preview (localStorage instead of SQLite; PDFs are generated in the browser and downloaded)
```

Browser tests: `npm run test:e2e` (Playwright) checks sign-in, roles, edit/delete permissions, account deletion, PDF download and that every screen opens for each role in English and Arabic. `npm run test:e2e:live` runs the same tests against the published UAT site, demo accounts included.

Performance: `npm run test:perf` builds one busy year of books (12,000 sales invoices, 3,000 bills, payments) and checks that saving, payments, every report and opening the app stay quick. It takes about two minutes, so it runs on its own (and as its own job in CI).

Checks: `npm run verify` runs `typecheck`, `lint` and `test` (accounting engine, Oman features, persistence, and a test that fails if any UI string lacks an Arabic translation).

Translations live in `src/i18n/ar.ts` (keys are the English text). Switching to Arabic flips the native layout to right-to-left after an app restart.

## Documentation

| Document | What's inside |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Folder map, design rules, data and privacy model, third-party licences |
| [docs/RELEASE.md](docs/RELEASE.md) | Variants, versioning, UAT → production flow, EAS builds, web previews on GitHub Pages |
| [docs/STORE_SUBMISSION.md](docs/STORE_SUBMISSION.md) | App Store and Google Play checklist with Hisab's answers (privacy labels, Data safety, review notes, closed testing) |
| [docs/NEW_APP_PLAYBOOK.md](docs/NEW_APP_PLAYBOOK.md) | The standard structure and checklist for every new app |
| [CLAUDE.md](CLAUDE.md) | Rules for AI-assisted development, including store and legal guardrails |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

Public pages (linked from the app and the store listings): [privacy policy](https://kalihashmi.github.io/billionpixels.github.io/hisab/privacy/), [delete your data](https://kalihashmi.github.io/billionpixels.github.io/hisab/delete-data/), [support](https://kalihashmi.github.io/billionpixels.github.io/hisab/support/). Sources are in `site/`.

## Known limitations / next steps

These are deliberate scope limits of this version; consider them before a wide public launch:

- **Single company, on-device data.** Several users with roles can share one device, but there is no cloud sync between devices yet; users must export backups. A sync backend (e.g. Supabase/Postgres with auth) is the natural next step and the domain engine is ready to run server-side.
- **Single currency** per company (no foreign-currency invoices or exchange differences).
- **E-invoicing** (Oman Fawtara, Saudi ZATCA) is not integrated yet.
- No live bank feeds or bill OCR; bank statements are entered manually or imported from CSV (`date, label, amount` or `date, description, debit, credit`; dates as `YYYY-MM-DD`).
- No budgets, recurring entries or multi-step payment terms (installments) yet.
- No end-of-service gratuity calculation, WPS salary file or payslip-per-employee PDF yet.
