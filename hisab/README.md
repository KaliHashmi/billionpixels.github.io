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
| **Data** | JSON backup export (share to email/Drive/iCloud) and restore, company reset |

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

- **Tax invoices** carry the content required by the Oman VAT law: the words "Tax Invoice", supplier name, address and VATIN, customer name and VATIN, sequential invoice number, invoice date, description, quantity, unit price, taxable amount, VAT rate and VAT amount per line, totals with and without VAT in OMR. Credit notes reference the original invoice. Documents are bilingual (English/Arabic).
- **VAT treatments** per tax: standard (5%), zero-rated (incl. exports), exempt, out of scope, reverse charge on imported services, and deferred import VAT. Reverse-charge taxes post both input and output VAT without changing the amount paid to the vendor.
- **VAT return** groups supplies, reverse-charge VAT, imports and recoverable input VAT for the period; a closing entry moves the balance to VAT payable and sets the VAT lock date.
- **Lock dates** prevent changes to closed periods; posted entries are immutable (reset to draft or reverse).
- **Social insurance** defaults to 8% employee / 12.5% employer of gross salary for insured Omani staff (including Job Security Fund contributions). Confirm current Social Protection Fund rates and adjust them in Settings.

Not included yet: integration with the Oman Tax Authority e-invoicing programme (Fawtara). When the OTA publishes the technical specification and onboarding applies to your business, invoices will need to be transmitted in the required electronic format. Always confirm VAT return box mapping and payroll rates with your tax adviser.

## Environments: UAT and production

The app ships as three variants that can be installed side by side on the same phone. They are selected with `APP_VARIANT` (`app.config.ts`) and the EAS build profiles (`eas.json`):

| | Development | UAT | Production |
| --- | --- | --- | --- |
| App name | Hisab (Dev) | Hisab UAT | Hisab |
| Bundle id / package | `com.hisab.accounting.dev` | `com.hisab.accounting.uat` | `com.hisab.accounting` |
| Database file | `hisab-development.db` | `hisab-uat.db` | `hisab.db` |
| Badge | DEV ribbon | orange UAT ribbon | none |
| Demo company | offered at setup | offered at setup | not available |
| Distribution | dev client | internal (APK / ad-hoc), Play internal track, TestFlight | App Store / Play Store |

Change the bundle id prefix with the `HISAB_BUNDLE_ID` environment variable (or edit `app.config.ts`) before the first store submission — it can never change afterwards.

## Run locally

```bash
cd hisab
npm install
npm start            # development variant (press i / a, or scan with a dev build)
npm run start:uat    # run the UAT variant
npm run start:prod   # run the production variant
npm run web          # browser preview (localStorage instead of SQLite; PDFs are generated in the browser and downloaded)
```

Checks: `npm run typecheck`, `npm run lint`, `npm test` (accounting engine, Oman features, persistence, and a test that fails if any UI string lacks an Arabic translation).

Translations live in `src/i18n/ar.ts` (keys are the English text). Switching to Arabic flips the native layout to right-to-left after an app restart.

## Build and publish

One-time setup:

1. Create an Expo account and run `npx eas-cli@latest login`, then `npx eas-cli@latest init` inside `hisab/` and copy the project id. Either keep it in `app.config.ts` via `EAS_PROJECT_ID`, or set it as a GitHub Actions variable `EAS_PROJECT_ID`.
2. Apple: an Apple Developer account; EAS creates the certificates and provisioning profiles on the first iOS build. Create two App Store Connect apps (`com.hisab.accounting` and `com.hisab.accounting.uat`) — the UAT one is only used through TestFlight.
3. Google: a Play Console account with two apps (`com.hisab.accounting`, `com.hisab.accounting.uat`). Upload the first AAB manually once, then add a service-account key for `eas submit`.
4. For CI builds, add an `EXPO_TOKEN` secret to the GitHub repository.

Day to day:

```bash
npm run build:uat     # internal UAT builds for testers (Android APK + iOS ad-hoc)
npm run build:prod    # store builds (AAB + IPA), build numbers auto-increment
npm run submit:prod   # upload to App Store Connect / Play Console
```

Or use **Actions → Hisab → Run workflow**, choose `uat` or `production` and optionally *submit*. Every push touching `hisab/` runs typecheck, lint and tests.

Suggested release flow: build UAT → testers validate on the UAT app (demo data or their own test books) → build production from the same commit → submit for review.

Store listing checklist: privacy policy URL (the app stores data only on the device and collects nothing), screenshots (6.7" iPhone, Android phone), app category *Finance/Business*, age rating questionnaire, and the "uses non-exempt encryption: No" answer (already set in the config).

## Project layout

```
hisab/
  app.config.ts        variant-aware Expo config (UAT / production)
  eas.json             EAS build & submit profiles
  src/
    domain/            pure TypeScript accounting engine (no React)
      types.ts         data model (accounts, journals, taxes, moves, reconciliations…)
      engine.ts        posting, payments (cash/transfer/card/cheque), reconciliation, reversals, bank matching
      operations.ts    daily cash closing, payroll
      management.ts    weekly/monthly management reports, Oman VAT return
      words.ts         amounts in words (English/Arabic)
      tax.ts           tax computation (excluded / included / fixed)
      reports.ts       P&L, balance sheet, ledgers, aged balances, tax report, dashboard
      assets.ts        depreciation boards and entries
      template.ts      chart of accounts, journals, taxes, currencies
      seed.ts          demo company for UAT
    data/              SQLite persistence (record-level diffing) + React store
    i18n/              English/Arabic translations, RTL switching
    services/          PDF documents, CSV, sharing, backups
    ui/                design system (cards, lists, fields, pickers)
    features/          shared screen logic (entity definitions, statuses)
    app/               Expo Router screens
  __tests__/           Jest tests for the engine and persistence
```

## Known limitations / next steps

These are deliberate scope limits of this version; consider them before a wide public launch:

- **Single user, single company, on-device data.** There is no cloud sync or multi-user access yet; users must export backups. A sync backend (e.g. Supabase/Postgres with auth) is the natural next step and the domain engine is ready to run server-side.
- **Single currency** per company (no foreign-currency invoices or exchange differences).
- **E-invoicing** (Oman Fawtara, Saudi ZATCA) is not integrated yet.
- No live bank feeds or bill OCR; bank statements are entered manually or imported from CSV (`date, label, amount` or `date, description, debit, credit`; dates as `YYYY-MM-DD`).
- No budgets, recurring entries or multi-step payment terms (installments) yet.
- No end-of-service gratuity accrual or payslip-per-employee PDF yet.
