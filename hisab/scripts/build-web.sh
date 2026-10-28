#!/usr/bin/env bash
# Builds the browser versions (UAT and production) as a static site in ./web-site:
#   web-site/hisab-uat/  web-site/hisab-app/  web-site/404.html
# Copy that folder's contents to the root of the GitHub Pages branch to publish.
set -euo pipefail
cd "$(dirname "$0")/.."
work=$(mktemp -d)
for v in uat production; do
  APP_VARIANT=$v HISAB_WEB_BASE=/__HB__ CI=1 npx expo export --clear --platform web --output-dir "$work/pv-$v"
done
title_uat="Hisab UAT"; title_prod="Hisab"
(cd "$work" && python3 "$OLDPWD/scripts/package_web.py" pv-uat out-uat "$title_uat" "Hisab accounting app" \
  && python3 "$OLDPWD/scripts/package_web.py" pv-production out-production "$title_prod" "Hisab accounting app" \
  && python3 "$OLDPWD/scripts/build_pages.py" site)
rm -rf web-site && mv "$work/site" web-site && rm -rf "$work"
echo "Built web-site/"
