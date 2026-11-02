# Changelog

All notable changes to Hisab. Versions follow [semantic versioning](https://semver.org); store releases are tagged `hisab-vX.Y.Z`.

## [Unreleased] — 1.0.0 candidate

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
