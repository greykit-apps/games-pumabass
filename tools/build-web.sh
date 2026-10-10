#!/usr/bin/env bash
# build-web.sh -- the web demo, for greykit.com/games/pumabass/: the page, its icons
# and manifest, and web/, with the page marked as the web edition (web/js/api.js: WEB),
# so it plays the demo song without a server. CI's deploy stage runs it; run it
# yourself to try the demo locally:
#
#   bash tools/build-web.sh [out]     (default: public/)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/public}"
rm -rf "$OUT"
mkdir -p "$OUT"
cd "$ROOT"
cp index.html manifest.webmanifest icon.svg favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png og.png "$OUT/"
cp -r web "$OUT/web"
sed -i 's/<html lang="en" dir="ltr">/<html lang="en" dir="ltr" data-edition="web">/' "$OUT/index.html"
grep -q 'data-edition="web"' "$OUT/index.html" || { echo "ERROR: couldn't mark index.html as the web edition" >&2; exit 1; }
echo "built the web demo in $OUT"
