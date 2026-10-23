#!/usr/bin/env bash
# render-icons.sh -- every image index.html's <head> names, rendered from the
# hand-drawn icon.svg (games-meta STANDARD.md §9). Run it from anywhere after
# icon.svg changes, and commit what it writes:
#
#   favicon-16x16.png, favicon-32x32.png, favicon.ico   (here)
#   og.png, apple-touch-icon.png                        (greykit-meta's make-assets.sh)
#
# Needs headless Chrome or Edge, Python with Pillow, and a greykit-meta clone
# (default ../../greykit-meta beside the games, or set GREYKIT_META).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
META="${GREYKIT_META:-$(cd "$ROOT/../.." 2>/dev/null && pwd)/greykit-meta}"
[ -f "$META/tools/make-assets.sh" ] || { echo "ERROR: no greykit-meta clone; set GREYKIT_META" >&2; exit 2; }

BROWSER=""
for c in "$(command -v google-chrome 2>/dev/null || true)" "$(command -v chromium 2>/dev/null || true)" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" "/c/Program Files/Microsoft/Edge/Application/msedge.exe"; do
  if [ -n "$c" ] && [ -x "$c" ]; then BROWSER="$c"; break; fi
done
[ -n "$BROWSER" ] || { echo "ERROR: no headless Chrome or Edge found" >&2; exit 2; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# make-assets.sh looks for google-chrome and hands it POSIX paths. On Windows
# (Git Bash) wrap the browser so those paths, and the file:// URLs inside the
# page it writes, become Windows ones.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/google-chrome" <<SHIM
#!/usr/bin/env bash
win() { if command -v cygpath >/dev/null; then cygpath -m "\$1"; else printf '%s' "\$1"; fi; }
args=()
for a in "\$@"; do
  case "\$a" in
    --screenshot=*)    a="--screenshot=\$(win "\${a#--screenshot=}")" ;;
    --user-data-dir=*) a="--user-data-dir=\$(win "\${a#--user-data-dir=}")" ;;
    file://*)          f="\${a#file://}"
                       sed -i 's#file:///\\([a-zA-Z]\\)/#file:///\\1:/#g' "\$f" 2>/dev/null || true
                       a="file:///\$(win "\$f")" ;;
  esac
  case "\$a" in --screenshot=*) shot="\${a#--screenshot=}" ;; esac
  args+=("\$a")
done
"$BROWSER" "\${args[@]}"
# Edge on Windows hands off and returns at once; the screenshot lands later.
for _ in \$(seq 1 60); do { [ -z "\${shot:-}" ] || [ -s "\$shot" ]; } && break; sleep 0.5; done
SHIM
chmod +x "$TMP/bin/google-chrome"
export PATH="$TMP/bin:$PATH"

# The favicons: icon.svg at 512px, scaled down by Pillow, then the .ico.
cp "$ROOT/icon.svg" "$TMP/icon.svg"
printf '<!doctype html><style>html,body{margin:0;background:#05070f}img{width:512px;height:512px;display:block}</style><img src="icon.svg">' > "$TMP/big.html"
google-chrome --headless=new --disable-gpu --hide-scrollbars --no-sandbox --user-data-dir="$TMP/prof" \
  --force-device-scale-factor=1 --window-size=512,512 --screenshot="$TMP/big.png" "file://$TMP/big.html" >/dev/null 2>&1 || true
[ -s "$TMP/big.png" ] || { echo "ERROR: could not render icon.svg" >&2; exit 1; }
PY=python3; command -v "$PY" >/dev/null || PY=python
win() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
"$PY" - "$(win "$TMP/big.png")" "$(win "$ROOT")" <<'PYEOF'
import sys
from PIL import Image
big = Image.open(sys.argv[1]).convert("RGBA")
root = sys.argv[2]
sizes = {s: big.resize((s, s), Image.LANCZOS) for s in (16, 32, 48)}
sizes[16].save(f"{root}/favicon-16x16.png")
sizes[32].save(f"{root}/favicon-32x32.png")
sizes[48].save(f"{root}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("  wrote     favicon-16x16.png, favicon-32x32.png, favicon.ico")
PYEOF

# The share card and the touch icon: the family's layout, from greykit-meta.
bash "$META/tools/make-assets.sh" "$ROOT" --accent '#54f2ff' --bg '#05070f' --font mono \
  --wordmark 'Puma[Bass]' --desc 'Learn songs on a note highway, from charts you make yourself.' \
  --tagline 'Bass first, with slow-down and section loops'
