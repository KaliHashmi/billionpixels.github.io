# Repository guide

This repository holds two things:

- `hisab/`: the Hisab accounting app (Expo / React Native). **Read `hisab/CLAUDE.md` before working on it.** It covers the commands, the architecture, the definition of done, and the store and legal guardrails.
- Root files (`index.html`, `app.js.txt`, `styles.css .txt`): the original Billion Pixels page. Leave them alone unless asked.

Publisher of every app in this account: FutureX Technical Solutions (فيوتشر اكس للحلول التقنية), Al Wizarat, Bausher, Muscat, Commercial Registration No. 1685674. Support email for all apps: futurex.om@outlook.com.

Branches:
- Development happens on feature branches. Never push to another branch without permission.
- `main` is served by GitHub Pages. It also carries the built Hisab web previews (`hisab-uat/`, `hisab-app/`), the public pages (`hisab/`) and `404.html`, all produced by `hisab/scripts/build-web.sh`.

Plugins (enabled in `.claude/settings.json` for every session): `expo`, `andrej-karpathy-skills`, `superpowers` and `claude-code-setup`. Use Superpowers for any non-trivial change: plan, test first, self-review, and verify before saying it is done.

Skills in `.claude/skills/`:
- `watch-video`: watch and listen to videos and audio. It produces frame sheets plus an Arabic or English transcript.
- `legal-launch-checklist`: the 35-item legal, privacy, accessibility and licensing checklist. Run it for every new app and before every release.
- `security-launch-checklist`: the 27-check security review (sign-in, secrets and git history, data access, XSS and injection, files, headers, dependencies, logs, backups, attack test). Run it for every new app and before every release; the result goes in the project's `docs/SECURITY_REVIEW.md`.
- `change-impact`: before every push in **every** project, run `npm run impact` and tell the owner in plain words which screens the change touches and which tests cover it. A project without the script gets it installed first (the skill says how). Master copy of the script is in this folder.
