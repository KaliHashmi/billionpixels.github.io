# Release process

## Environments

| | Development | UAT | Production |
| --- | --- | --- | --- |
| App name | Hisab (Dev) | Hisab UAT | Hisab |
| Bundle id / package | `com.hisab.accounting.dev` | `com.hisab.accounting.uat` | `com.hisab.accounting` |
| Database | `hisab-development.db` | `hisab-uat.db` | `hisab.db` |
| Demo company | offered | offered | never |
| Distribution | dev client | internal APK / TestFlight / Play internal track | App Store / Google Play |
| Browser preview | — | `…/hisab-uat/` | `…/hisab-app/` |

The variant comes from `APP_VARIANT`, which the EAS profiles in `eas.json` set.

## Branches and commits

- Work happens on a feature branch. `main` holds the GitHub Pages site (the web previews and public pages) and receives merged work.
- Small commits that explain *why*. Run `npm run verify` before each commit; CI runs the same checks, plus the browser tests, on every push that touches `hisab/`.
- Tag store releases as `hisab-vX.Y.Z`.

## Versioning

- `version` in `app.config.ts` is the user-visible version (semver). Bump it for each store release.
- Build numbers (`ios.buildNumber` and `android.versionCode`) are managed remotely by EAS (`appVersionSource: remote`, `autoIncrement`). Never edit them by hand.

## Release steps

1. `npm run verify` and `npm run test:e2e`.
2. `npm run build:uat`, then testers validate. You can also publish the browser previews (below).
3. Fix, and repeat until UAT signs off.
4. Bump `version`, update `CHANGELOG.md`, commit.
5. `npm run build:prod` from that commit, then `npm run submit:prod`.
6. Follow `docs/STORE_SUBMISSION.md` in App Store Connect and Play Console.
7. After approval, tag the commit.

Builds can also run from GitHub: **Actions → Hisab → Run workflow** (choose `uat` or `production`, optionally *submit*). This needs the `EXPO_TOKEN` secret and the `EAS_PROJECT_ID` variable.

## Web previews and public pages (GitHub Pages)

```bash
HISAB_CONTACT_EMAIL=support@example.com npm run build:web   # writes web-site/
```

Copy the contents of `web-site/` to the root of the `main` branch and push. Pages serves:

- `/hisab-uat/` and `/hisab-app/`: the browser versions of the app.
- `/hisab/`, `/hisab/privacy/`, `/hisab/delete-data/`, `/hisab/support/`: the pages the stores link to.
- `/404.html`: boots the app when a deep link is reloaded.

The script URL carries a content hash (`hisab.js?v=…`), so testers always load the latest build.

## One-time setup

1. **Expo:** run `npx eas-cli@latest login`, then `npx eas-cli@latest init`. Store the project id as `EAS_PROJECT_ID`.
2. **Apple:**
   - A Developer Program membership.
   - Two App Store Connect apps: production, and UAT for TestFlight only.
   - EAS creates the signing certificates.
3. **Google:**
   - A Play Console account.
   - Two apps.
   - Upload the first AAB by hand.
   - Add a service-account key so `eas submit` can upload.
4. **GitHub:** add the `EXPO_TOKEN` secret.
