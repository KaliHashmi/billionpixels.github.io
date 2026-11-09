# Hisab — Security review

**Last run:** 9 November 2026, against the `security-launch-checklist` skill (27 checks). Re-run before every release and when a change touches sign-in, roles, storage, files or packages.

**What Hisab is, for security:** an offline app. The books live only on the device (SQLite on iOS/Android, browser storage on the web). There is no server, no API, no online payment, no cookie and no key to protect. The web version is static files on GitHub Pages. So most attacks in the checklist have nothing to reach; the ones that matter are a hostile name, file or backup, someone with another role on the same device, and the device itself.

**Result:** no critical or high issue left in what ships. Four gaps fixed in this run (below), tests added for each. Two notes for the owner (end of page); the first is fixed.

| # | Check | Status | Proof / reason |
| --- | --- | --- | --- |
| 1 | Sign-in is safe | Done | `src/domain/auth.ts` `login`: one message for a wrong user or password ("Invalid username or password."); constant-time compare (`safeEqual`); no bypass flag. `__tests__/auth.test.ts`, `e2e/welcome.spec.ts` (wrong password) |
| 2 | Passwords stored safely | Done | PBKDF2-SHA256, 30,000 iterations, 16-byte salt from the device's secure random (`expo-crypto`, passed by every caller); minimum 8 characters with letters and numbers. The iteration count is modest; it protects a password, not the books, which sit unencrypted on the same device (note 2) |
| 3 | Repeated guesses stopped | Done | 5 wrong passwords lock the account for 5 minutes (`MAX_ATTEMPTS`, `LOCK_MINUTES`); tested in `auth.test.ts` |
| 4 | Two-step verification | N/A | Offline, single device: there is no second channel. Biometric unlock (Face ID / fingerprint) and the phone's own lock are the second factor |
| 5 | Sessions end | Done | "Keep me signed in" lasts 30 days and is tied to the password, so a reset by an administrator ends it (changing your own password keeps you signed in); a deactivated or locked user is not restored (`restoreSession`); sign-out clears it |
| 6 | Account recovery | Done | Only an administrator sets a temporary password, which must be changed at the next sign-in. **Fixed now:** the reset is recorded in the audit log |
| 7 | No keys in shipped code | Done / N/A | Hisab uses no API keys or tokens. Bundle checked: no secrets |
| 8 | Environment files not committed | Done | `.gitignore`: `.env*.local`, `*.jks`, `*.p8`, `*.key`; none tracked |
| 9 | Git history clean | Done | All 63 commits scanned (`git log --all -p`) for AWS, Stripe, OpenAI, GitHub, Google keys, private keys, JWTs and service-role tokens: nothing. Only fake test passwords (`secret123`, `demo1234`) |
| 10 | Data protected by role | Done | Every change goes through `run()` in `src/data/store.tsx`: viewers cannot change anything, issued documents need the admin (edit) or admin/accountant (delete) role. `e2e/roles.spec.ts` per role |
| 11 | Admin pages need the admin role | Done | Users and Settings screens refuse non-administrators (`e2e/roles.spec.ts` "administration screens are for administrators only"). Enforced on the screen and by the store's role checks for documents; on an offline device anyone with the phone's raw storage could edit data anyway (note 2) |
| 12 | Only own records reachable | N/A | One company per device; no shared server to guess IDs on |
| 13 | Totals calculated by the engine | Done | Invoice, VAT and payment totals are always recalculated by `computeInvoiceTotals` and the posting engine, never taken from the screen or a scanned paper (`receipt-reader.test.ts`) |
| 14 | XSS | Done | All text in print/PDF HTML goes through `esc()` (`src/services/documents.ts`); React escapes screens; no `innerHTML`. **New test:** hostile names in invoices and vouchers come out as text (`__tests__/security.test.ts`). **Hardened now:** the frame that draws PDFs on the web is sandboxed, so no script could run there even if text escaped |
| 15 | Injection | Done | SQLite queries use parameters only (`src/data/storage.ts`); no `eval` of user input (the one `new Function` loads the bundled reader module). **Fixed now:** CSV exports neutralise cells starting with `=`, `+`, `-`, `@` (formula injection in Excel); real numbers are untouched (`security.test.ts`) |
| 16 | Input validated | Done | Domain layer validates every document (balancing, dates, lock dates, amounts, roles) with unit tests; CSV imports check every row and list errors (`purchase-import.test.ts`) |
| 17 | File uploads and imports checked | Done | Scans/uploads: PDF, JPG, PNG only, 10 MB each, read on the device, never executed, and only accounting documents kept. Photos: JPG/PNG only, size and count limits (`attachments.test.ts`). **Fixed now:** a backup is refused unless every record list is a list and every photo is a JPG/PNG image (`security.test.ts`); restoring is for administrators only and asks before replacing |
| 18 | HTTPS | Done | GitHub Pages serves HTTPS with "Enforce HTTPS" |
| 19 | Security headers | N/A (host) | GitHub Pages cannot set headers (CSP, frame-ancestors). Risk is low: no server, no cookies, no remote content, all text escaped. If the web version moves to a host with headers, add a CSP that allows only the app's own files |
| 20 | CORS | N/A | No API |
| 21 | CSRF | N/A | No server, no cookies |
| 22 | Rate limits | N/A / Done | No public API; sign-in lockout covers guessing (check 3) |
| 23 | Dependencies | Done | `npm audit --omit=dev`: **fixed now** jsPDF 2.5.2 → 4.2.1 (critical and high advisories, and its DOMPurify, gone; PDFs checked in English and Arabic). Left: 2 high in `@expo/cli` and `zod`, both build tools that are not in the app; they clear with the next Expo SDK update |
| 24 | Error messages | Done | Users see plain, translated messages; unexpected errors show only the message text, never a stack trace |
| 25 | Logs and audit trail | Done | Audit log of changes to issued documents, photos and deletions. **Fixed now:** adding a user, changing a role or deactivating, resetting a password and changing one's own password are recorded (`e2e/roles.spec.ts`, English and Arabic). The log holds no passwords |
| 26 | Backups | Done | Export/restore in Settings (`persistence.test.ts`, `security.test.ts`). **Clarified now:** Settings says the backup file holds all the books, is not encrypted, and should be shared only with trusted people |
| 27 | Attack test and report | Done | Tried: hostile names in documents, formula cells in CSV, a tampered backup (wrong types, an HTML "photo"), non-accounting files and photos, a viewer and an accountant trying admin and edit actions, wrong passwords until lockout. All refused; tests kept in `__tests__/security.test.ts`, `e2e/roles.spec.ts`, `e2e/scan.spec.ts`, `e2e/purchases.spec.ts`. This page is the report |

## Notes for the owner

1. **Printing on the web printed the screen, not the document.** Found during this review (not a security issue) and **fixed**: on the web, Print now draws the document in a hidden, sandboxed frame and prints only that frame (`e2e/pdf.spec.ts`, English and Arabic). Phones were never affected.
2. **The books are as safe as the device.** Data on the phone is not encrypted by Hisab (the phone's own encryption and lock protect it; on the web, the browser profile does). Someone who can unlock the phone, or copy the browser's storage, can read the books whatever their Hisab role. This is normal for offline apps and is why Hisab tells users to use the device lock, biometric unlock and safe backups. Encrypting the books would change the store's encryption answer (`usesNonExemptEncryption`) and is a separate decision.
