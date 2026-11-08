---
name: change-impact
description: Before every push (and before telling the owner a change is done), list which screens, shared code and tests the change affects, from the imports in the code — no AI, no generated map. Use in every project on every code change; also when setting up a new project (install it), and when the owner asks "what does this change affect?" or "what could this break?". Includes the script to copy into a project that does not have it yet.
---

# Change impact ("what does this change affect?")

The owner does not read the code. Before each push, tell them in plain words what the change touches, so a small edit never breaks something far away unnoticed. The report comes from the project's own imports: exact, free, always current.

## Every change

1. Run the project's report: `npm run impact` (uncommitted changes, or the last commit if there are none), `npm run impact -- --since <ref>` for a whole branch or release, or `npm run impact -- <files>`.
2. Make sure every listed test passed (the unit tests in `npm run verify`, the browser tests in the project's e2e command). If a touched screen has **no** test, check it by hand in the running app (English and Arabic) or add a test, and say which you did.
3. In the message to the owner, one or two plain sentences, no file paths, for example:
   > This change touches 6 screens: the Dashboard, Purchase Invoices, a bill's page, the payment vouchers and Scanned Documents. Nothing in sales, payroll, bank, VAT or reports is affected. The scanning, purchases and roles tests cover it, and all pass.
   When the report says "almost every screen", say a core file changed and that the full test suite was run.

## Project without it yet (install once)

1. Copy `impact.mjs` and `impact.test.mjs` from this folder into the project's scripts folder (`scripts/` or `tools/`; the project root must be the folder above it, where `package.json` is).
2. Add to `package.json`: `"impact": "node scripts/impact.mjs"`, and append `&& node --test scripts/impact.test.mjs` to the `verify` script.
3. Run `npm run impact -- <one screen file>` and check the screens and tests listed make sense.
4. Add to the project's `CLAUDE.md`, under its definition of done: *Before pushing, run `npm run impact` and tell the owner in plain words what the change touches and which tests cover it (the `change-impact` skill).*
5. Copy this skill folder into the project's `.claude/skills/` so sessions in that project have it.

## How it works

It reads every tracked code file, resolves its imports (relative paths, `tsconfig` aliases such as `@/`, folder `index` files, `.web`/`.native` variants), reverses the graph and follows it from the changed files. Expo Router files under `src/app/` or `app/` are reported as screens by address (`/moves/[id]`). Unit tests are files in `__tests__/` or `*.test.*`; browser tests are `*.spec.*` files in `e2e/` or `tests/` that open one of the affected screens. Translation files (`i18n/ar.ts`, `strings.en.ts`…) are listed but not followed, since every screen uses them.

Limits: it sees code connections, not data connections (a database rule, an API on a server, a value stored by one screen and read by another). Mention those yourself when the change touches them.

The master copy lives in `KaliHashmi/billionpixels.github.io`, `.claude/skills/change-impact/`. Improve it there, then copy it to the projects.
