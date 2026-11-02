# New app playbook

This is the standard for every new app we build, so each one is delivered clean, reviewable and ready for the stores. Hisab is the reference implementation: copy its structure, not its accounting code.

## 1. Day one: set up the repository

```
<app>/
  CLAUDE.md               rules for AI-assisted work (copy Hisab's and edit the product section)
  AGENTS.md               Expo guidance (from the Expo template)
  README.md               what the app does, quick start, links to docs/
  CHANGELOG.md
  app.config.ts           variants: development / uat / production
  eas.json                build and submit profiles per variant
  docs/
    ARCHITECTURE.md
    RELEASE.md
    STORE_SUBMISSION.md   copy and re-answer every question for the new app
  site/                   privacy policy, delete data, support (bilingual)
  scripts/                build helpers
  src/
    config/  domain/  data/  services/  i18n/  ui/  features/  app/
  __tests__/
.github/workflows/<app>.yml    typecheck, lint, test on push; EAS build on dispatch
.claude/settings.json          shared plugins (expo, karpathy guidelines, claude-code-setup)
```

Checklist:

- [ ] Create from the current Expo template. Read the versioned Expo docs (`AGENTS.md`); never rely on memory.
- [ ] Choose the final bundle id now (`com.<company>.<app>`). It can never change after the first upload.
- [ ] Add the `verify` script: `typecheck && lint && test`.
- [ ] Set up CI before writing features.
- [ ] Set up the UAT and production variants, each with its own database and app name, so they install side by side.

## 2. While building

- Business rules go in a pure `domain/` layer with unit tests. Screens stay thin.
- Use one write path (a store `run()` function) that enforces roles and validation.
- Translate every string from the start (English + Arabic), and check the RTL layout every time.
- Add a dependency only with `npx expo install`. Prefer Expo modules. Record every third-party asset and its licence.
- Follow the Karpathy rules in `CLAUDE.md`: think first, keep it simple, make surgical changes, verify every goal.

## 3. Privacy by default

Decide this first, because it drives the store answers:

| Question | If yes, you must… |
| --- | --- |
| Does data leave the device (server, analytics, crash reports)? | Write a real privacy policy, fill in the App Privacy / Data safety forms honestly, encrypt in transit |
| Do users create accounts? | Offer in-app account deletion **and** a web deletion page |
| Sign-in required to use it? | Give reviewers a demo account in the review notes |
| Any AI service gets user data? | Show a consent screen naming the provider *before* sending (Apple 5.1.2(i)); add a "report AI content" button (Google) |
| Selling digital features or subscriptions? | Use Apple and Google in-app purchase |
| Could children use it? | COPPA and the Google Families policy apply. Avoid unless intended; add an age gate |
| Marketing emails or push notifications? | Get opt-in, include unsubscribe, and only send push after permission |
| Session recording or heatmaps? | Get explicit consent first, or don't use them |
| Web fonts or CDNs? | Bundle them locally (GDPR) |

## 4. Before the first submission

Follow `docs/STORE_SUBMISSION.md` from top to bottom:

- privacy policy, delete-data and support pages are live;
- privacy manifest and permissions are minimal;
- screenshots for iPhone 6.9" and iPad 13" (if tablets are supported), plus Android phone;
- English and Arabic store listings;
- age rating and content rating;
- review notes;
- Google closed test: 12 testers for 14 days on personal accounts. Start this early, because it is the longest step.

## 5. Delivery to the client

- [ ] `npm run verify` is green and CI passes on the release tag.
- [ ] The README explains how to run, build and release.
- [ ] `CHANGELOG.md` is up to date.
- [ ] No secrets are in the repository. Credentials live in EAS, App Store Connect, Play Console and GitHub secrets.
- [ ] The store accounts belong to the client, with us invited as developers.
- [ ] The UAT links work for the client's testers without our accounts.
