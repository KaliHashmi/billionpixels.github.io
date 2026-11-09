---
name: security-launch-checklist
description: Security checklist (27 checks) for any app or website before its first launch and before every release - sign-in, passwords, secrets and keys (including git history), database and admin protection, XSS and injection, rate limits, sessions, payments, dependencies, files, headers, CORS/CSRF/HTTPS, errors, logs, backups, account recovery, and an attack test. Use when starting a new project, before each release, and whenever a change touches sign-in, roles, data storage, files, payments, servers or third-party packages. Produces docs/SECURITY_REVIEW.md (done / not applicable / fix) and fixes the gaps.
---

# Security launch checklist

Run it for every new project, before every release, and when a change touches sign-in, roles, storage, file handling, payments, servers or packages. Record the result in the project as `docs/SECURITY_REVIEW.md`: one row per check, **Done** (with the proof: file, test or command), **N/A** (with the reason), or **Fix** (what was changed, or what is open and who decides). Re-run the failed rows after fixing.

Rules:
- **Prove, do not assume.** Each Done row names the code, test or command output that shows it. Write a test for anything an attacker could try (hostile names, files, backups, requests) and keep it in the test suite.
- **Fix what you can in scope; report the rest** with severity (critical / high / medium / low), the realistic attack path, and the proposed fix. A security finding stays open until the owner decides.
- **Never** weaken a check to make a test pass, paste a real secret into a file or chat, or run an attack against a live production system without the owner's approval.
- Server-backed projects also run Claude Code's built-in `/security-review` on the branch and fold its findings in.
- When the project's own rules name more checks (an ATND access-rules test, for example), run them too.

## The 27 checks

**Sign-in and accounts**
1. **Sign-in is safe.** Credentials checked on the server (or in the domain layer for an offline app); the same message for a wrong user or a wrong password; no sign-in bypass in a URL or a stored flag.
2. **Passwords are stored safely.** A slow, salted hash (bcrypt, scrypt, Argon2, or PBKDF2 with a high iteration count) and a secure random salt. Never plain text, never a fast hash. A minimum length.
3. **Repeated guesses are stopped.** Lockout or delay after a few failed sign-ins (rate limiting on the server for online apps).
4. **Two-step verification**, or the reason it does not apply (an offline app relies on the device lock and biometric unlock).
5. **Sessions end.** "Keep me signed in" expires; changing or resetting a password ends old sessions; sign-out really clears the session; tokens are not in URLs or logs.
6. **Account recovery cannot be abused.** A reset needs a verified channel or an administrator, and is recorded.

**Secrets**
7. **No keys or passwords in the code** that ships (app bundle, web page, mobile build). Public keys meant to be public (a Supabase anon key) are fine only with database rules behind them.
8. **Environment files are not committed** (`.env*`, `*.p8`, `*.jks`, service-account keys) and are in `.gitignore`.
9. **Git history is clean.** Scan every commit (`git log --all -p`) for key patterns (AKIA, sk_live, sk-, ghp_, github_pat_, AIza, private keys, JWTs, service_role). A key that was ever committed is rotated, not just deleted.

**Data and access**
10. **The database is protected.** Row-level security or equivalent on every table, tested per role; on an offline app, every write goes through one path that checks the role.
11. **Admin pages and actions need the admin role,** enforced where the data is (database or domain layer), not only by hiding a button.
12. **Users can only reach their own company's / their own records** (no ID guessing).
13. **Prices and totals are calculated on the server** (or recalculated by the engine), never trusted from the screen.

**Input and output**
14. **XSS:** user text shown in pages, PDFs, emails or print is escaped; no `dangerouslySetInnerHTML`/`innerHTML` with user text. Test with a hostile name.
15. **Injection:** SQL uses parameters only; no `eval` of user input; CSV exports neutralise formulas (`=`, `+`, `-`, `@`).
16. **Input is validated** (type, length, range) in the domain layer or the server, not only in the form.
17. **File uploads and imports are checked:** allowed types, size limits, content validated (a backup or CSV can be hostile), no execution of uploaded content.

**Platform**
18. **HTTPS everywhere,** HSTS where the host allows it.
19. **Security headers** (CSP, X-Content-Type-Options, frame-ancestors / X-Frame-Options, Referrer-Policy) where the host allows them; say so when it does not (GitHub Pages).
20. **CORS** allows only the app's own origins on any API.
21. **CSRF** is not possible (token-based auth in headers, SameSite cookies, or no cookies).
22. **Rate limits** on every public API and server function, not only sign-in.

**Operations**
23. **Dependencies:** `npm audit --omit=dev` (what ships) has no critical or high issue left unexplained; dev-only tools are listed separately.
24. **Error messages** show the user a plain message, never a stack trace, SQL or a secret.
25. **Logs and audit trail:** security events (sign-ins, role and password changes, deletions) are recorded, and logs hold no passwords or personal data beyond need.
26. **Backups** exist, can be restored, and the user is told what they contain (an unencrypted file must be kept safe).
27. **Attack test and report:** try the attacks above for real (hostile inputs in the running app, a role trying admin actions, a tampered backup or request), then write the review with every finding and fix.

## Offline apps (no server, books on the device) — like Hisab

Checks 18–22 mostly concern the hosting of the web version; 7, 10–13 move into the domain layer and the store's `run()` path. Data at rest is only as safe as the device: say that in the review and in the privacy policy, and keep backups' contents clear to the user.

## Server-backed apps — like ATND

All 27 apply. Database rules are the real security (screens only decide what is offered): test them per role with SQL (ATND: `supabase/tests/access-rules.sql` on UAT). Check every edge/server function for auth, CORS and rate limits, and the auth provider's settings (password policy, leaked-password protection, email confirmation, session length).
