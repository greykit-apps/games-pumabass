#!/usr/bin/env bash
# build-web.sh -- the web demo, for greykit.com/games/pumabass/: the page, its icons
# and manifest, and web/, with the page marked as the web edition (web/js/api.js: WEB),
# so it plays the demo songs without a server. CI's deploy stage runs it; run it
# yourself to try the demo locally.
#
# web/ goes up as web-<commit>/: greykit.com sits behind Cloudflare, which keeps
# scripts and styles for a month, so each deploy's get addresses it has never seen,
# and the page (kept a minute) always loads the scripts it was built with. Everything
# inside finds the rest by relative path, so nothing else needs changing.
#
#
#   bash tools/build-web.sh [out]     (default: public/)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/public}"
rm -rf "$OUT"
mkdir -p "$OUT"
cd "$ROOT"
cp index.html manifest.webmanifest icon.svg favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png og.png "$OUT/"
V="${CI_COMMIT_SHORT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}" # GitLab CI names the commit (its image has no git)
cp -r web "$OUT/web-$V"
sed -i -e 's/<html lang="en" dir="ltr">/<html lang="en" dir="ltr" data-edition="web">/'   -e "s#href=\"web/style.css\"#href=\"web-$V/style.css\"#" -e "s#src=\"web/js/app.js\"#src=\"web-$V/js/app.js\"#" "$OUT/index.html"
grep -q 'data-edition="web"' "$OUT/index.html" || { echo "ERROR: couldn't mark index.html as the web edition" >&2; exit 1; }
[ "$(grep -c "web-$V/" "$OUT/index.html")" = 2 ] || { echo "ERROR: couldn't point index.html at web-$V/" >&2; exit 1; }
echo "built the web demo in $OUT"
