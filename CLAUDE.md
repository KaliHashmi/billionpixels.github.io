# Repository guide

This repository holds two things:

- `hisab/`: the Hisab accounting app (Expo / React Native). **Read `hisab/CLAUDE.md` before working on it.** It covers the commands, the architecture, the definition of done, and the store and legal guardrails.
- Root files (`index.html`, `app.js.txt`, `styles.css .txt`): the original Billion Pixels page. Leave them alone unless asked.

Branches:
- Development happens on feature branches. Never push to another branch without permission.
- `main` is served by GitHub Pages. It also carries the built Hisab web previews (`hisab-uat/`, `hisab-app/`), the public pages (`hisab/`) and `404.html`, all produced by `hisab/scripts/build-web.sh`.

Plugins (enabled in `.claude/settings.json` for every session): `expo`, `andrej-karpathy-skills`, `superpowers` and `claude-code-setup`. Use Superpowers for any non-trivial change: plan, test first, self-review, and verify before saying it is done.

Skills in `.claude/skills/`:
- `watch-video`: watch and listen to videos and audio. It produces frame sheets plus an Arabic or English transcript.
