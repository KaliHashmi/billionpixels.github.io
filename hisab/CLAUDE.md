# Hisab — project guide for Claude

Hisab (حساب) is an offline, bilingual (English/Arabic) accounting app for small businesses in Oman. It is built with Expo + React Native + TypeScript. Books live only on the device. There is no server.

@AGENTS.md

## Commands (run from `hisab/`)

| Task | Command |
| --- | --- |
| All checks (run before every commit) | `npm run verify`: typecheck, lint and Jest |
| Dev server | `npm start` · `npm run start:uat` · `npm run web` |
| Browser previews and public pages | `npm run build:web` writes the output to `web-site/` (see `docs/RELEASE.md`) |
| Store builds | `npm run build:uat` · `npm run build:prod` · `npm run submit:prod` |
| Add a package | `npx expo install <pkg>`. Never use `npm install <pkg>`. |

## Where things live

- `src/domain/`: the pure TypeScript accounting engine. It has no React and no I/O. Every rule (balancing, lock dates, matching, VAT, payroll, roles) lives here and is unit-tested.
- `src/data/`: persistence (SQLite on native, localStorage on web) and the React store.
  - Every state change goes through `run()` / `runWith()`.
  - A change that needs a role passes `requires: 'editDocuments' | 'deleteDocuments'`.
- `src/app/`: Expo Router screens only. `src/ui/` holds shared components. `src/features/` holds shared screen logic.
- `src/services/`: PDF/HTML documents, files, sharing and backups.
- `src/i18n/ar.ts`: Arabic translations, sorted, with the English text as the key.
  - Every `t('…')` string needs an entry; `__tests__/i18n.test.ts` fails otherwise.
- `site/`: public privacy policy, data-deletion and support pages. Store listings link to them.
- `docs/`: architecture, release steps, the store-submission checklist and the new-app playbook.

## Engineering principles

These are adapted from the Karpathy guidelines; the plugin is enabled in `.claude/settings.json`.

1. **Think before coding.**
   - State your assumptions.
   - When a request has more than one reading, ask instead of guessing.
   - Say so when a simpler approach exists.
2. **Simplicity first.**
   - Write the minimum code that solves the asked problem.
   - Add no speculative options, abstractions or features.
3. **Surgical changes.**
   - Every changed line traces back to the request.
   - Match the existing style.
   - Don't refactor neighbouring code; mention it instead.
4. **Goal-driven execution.**
   - Turn the task into a check you can verify: a failing test, a build, or a browser run.
   - Loop until it passes.

## Definition of done

1. `npm run verify` is green.
2. New domain behaviour has a Jest test. A bug fix comes with a test that reproduces the bug.
3. UI changes have been checked in the web build, in English **and** Arabic (RTL), for each role (admin, accountant, viewer).
4. New strings are translated in `src/i18n/ar.ts`.
5. Commits are small and say *why*. Push only to the working branch; never open a PR unless asked.

## Store and legal guardrails (do not break these)

The app is listed as **"Data Not Collected"** (App Store) and **"No data collected or shared"** (Google Play). Any change below needs the privacy policy (`site/privacy.html`), the store answers (`docs/STORE_SUBMISSION.md`) and possibly a consent screen updated **in the same change**:

- **Do not add** analytics, crash reporting, ads, session replay, remote logging or any SDK that sends data off the device unless the owner asks.
  - Session recording without consent breaches California's CIPA.
  - It also changes the privacy labels.
- **Do not load** fonts, images or scripts from third-party servers (for example Google Fonts) in the app or in `site/`. Bundle them instead.
  - A Munich court fined a site that loaded Google Fonts remotely, under the GDPR, because that sent visitors' IP addresses to Google.
- **AI features:** before sending any user data to an AI service (OpenAI, Anthropic and others):
  - Show an explicit consent screen that names the provider (App Store guideline 5.1.2(i)).
  - Add an in-app "report AI content" option (Google Play generative-AI policy).
- **Accounts:** any sign-in the app creates must be deletable in the app (App Store 5.1.1(v); Google Play account deletion).
  - Today: `deleteUser`, and Settings › Delete Company.
  - Keep `site/delete-data.html` accurate.
- **Payments:** digital features sold in the app must use Apple/Google in-app purchase (App Store 3.1.1). Stripe and other web checkouts are only for physical goods or services.
- **Images, icons, fonts:** use only assets we made or that carry a licence allowing commercial use. Record the licence in `docs/ARCHITECTURE.md`.
- **Email:** no marketing email without an unsubscribe link (CAN-SPAM).
- **Encryption:** password hashing only, so `usesNonExemptEncryption: false` stays correct. Adding custom encryption of data changes that answer.
- **Permissions:** request only what a feature uses. Every iOS permission needs a clear purpose string in `app.config.ts`.

## Never

- Edit `ios/` or `android/`. They are generated; configure through `app.config.ts` and plugins.
- Edit `package-lock.json` by hand.
- Commit secrets: `.env*.local`, `*.p8`, `*.jks`, service-account keys.
- Weaken a role check or skip a test to make something pass.
- Put model names or AI-tool identifiers in code, commits or docs.
