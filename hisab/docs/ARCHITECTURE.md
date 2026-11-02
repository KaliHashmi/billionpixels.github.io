# Architecture

## Principles

1. **The domain is pure.** `src/domain/` is plain TypeScript: functions that take an `AppState` and return a new one, or throw an `AccountingError` with a user-facing (translatable) message. It has no React, no storage and no dates from the clock unless passed in. This keeps every accounting rule unit-testable and portable to a server later.
2. **One write path.** Screens never change state directly. They call `run(op, options)` or `runWith(op, options)` from `src/data/store.tsx`, which:
   - checks the signed-in user's role (`canEdit`, `requires: 'editDocuments' | 'deleteDocuments'`),
   - runs the domain function,
   - shows validation errors in the user's language,
   - saves only the records that changed (diffed by `src/data/persistence.ts`).
3. **Screens are thin.** `src/app/` holds only Expo Router routes. Shared logic goes in `src/features/` and shared components in `src/ui/`.
4. **Everything is bilingual.** UI text is the English source string wrapped in `t()`. Arabic lives in `src/i18n/ar.ts`. RTL layout is handled by `useT().rtl` and the native I18nManager.

## Folder map

Keep files focused: when a file passes ~400 lines, split it by topic behind the same entry point, as `engine.ts` and `reports.ts` do.

```
hisab/
  app.config.ts        Expo config per variant (development / uat / production), privacy manifest, permissions
  eas.json             EAS build and submit profiles
  CLAUDE.md            rules for AI-assisted work on this repo
  docs/                architecture, release, store checklist, new-app playbook
  site/                public pages (privacy, delete data, support) built into the Pages site
  scripts/             web build and Pages packaging
  e2e/                 Playwright browser tests against the UAT web build (roles, deletion, PDF, every screen EN/AR)
  __tests__/           Jest: engine, Oman VAT/payroll, roles, edit/delete, persistence, i18n, randomized stress test
  src/
    config/env.ts      variant flags, database name, public page URLs
    domain/            accounting engine (pure)
      types.ts           data model
      engine.ts          entry point; re-exports engine/
      engine/            core.ts (lookups, lock dates, sequences) · reconcile.ts (matching, invoice status)
                         documents.ts (post, reset, delete, reverse) · payments.ts (vouchers, cheques) · bank.ts (statements)
      operations.ts      cash closing, payroll
      reports.ts         entry point; re-exports reports/
      reports/           base.ts (items, trial balance) · statements.ts (P&L, balance sheet, cash flow)
                         ledgers.ts (ledgers, aged, audit) · vat.ts (tax report, closing) · dashboard.ts
      management.ts      weekly/monthly owner packs, Oman VAT return
      auth.ts            users, PBKDF2 passwords, lockout, roles, remembered sign-in, user deletion
      branding.ts        company stamp and signature
      template.ts        chart of accounts, journals, taxes; seed.ts demo company
    data/              storage.ts (SQLite) / storage.web.ts (localStorage), persistence diffing, React store
    services/          documents.ts (HTML → PDF), files (share/print/pick), backups, web PDF rendering
    i18n/              translations and language provider
    ui/                theme, components, fields, dialogs, signature pad, legal links
    features/          auth screens, onboarding, entity definitions
    app/               routes
```

## Data and privacy

- **Native:** one SQLite file per variant (`hisab.db`, `hisab-uat.db`, `hisab-development.db`). There are two tables: `records(collection, id, data)` and `meta` (settings, sequences and `pref:*` preferences).
- **Web preview:** the whole book is kept in `localStorage`.
- **Nothing is sent over the network.** Files leave the device only through the system share sheet, when the user exports something.
- **Passwords:** PBKDF2-HMAC-SHA256 with a random salt. Lockout after 5 failed attempts.
- **Delete Company** (`storage.clear()`) erases records, settings and saved sign-in preferences. **Delete My Account** (`deleteOwnAccount`) and **Delete User** (`deleteUser`) remove a user's credentials. Accounting records never reference users.

## Third-party assets and licences

| Asset | Source | Licence |
| --- | --- | --- |
| Icons | Ionicons, through `@expo/vector-icons` | MIT |
| App icon and header logo | Made for Hisab | Owned |
| Fonts | System fonts only | — |
| PDF in browser | jsPDF, html2canvas | MIT |

Add a row whenever a new asset or font is added.
