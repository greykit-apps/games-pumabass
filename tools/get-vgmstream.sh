#!/usr/bin/env bash
# get-vgmstream.sh -- download vgmstream, which decodes Rocksmith's song audio,
# into tools/vgmstream/ for this computer (Linux, macOS, or Windows in Git Bash).
#
#   tools/get-vgmstream.sh            the release below
#   tools/get-vgmstream.sh r2117      a particular release
#
# vgmstream is open source: https://github.com/vgmstream/vgmstream
set -euo pipefail

RELEASE="${1:-r2117}"
DEST="$(cd "$(dirname "$0")" && pwd)/vgmstream"

case "$(uname -s)" in
  Linux)                ZIP=vgmstream-linux.zip;  EXE=vgmstream-cli ;;
  Darwin)               ZIP=vgmstream-mac.zip;    EXE=vgmstream-cli ;;
  MINGW*|MSYS*|CYGWIN*) ZIP=vgmstream-win64.zip;  EXE=vgmstream-cli.exe ;;
  *) echo "Don't know which vgmstream build fits $(uname -s); get one from https://github.com/vgmstream/vgmstream/releases" >&2; exit 1 ;;
esac
if [ "$(uname -s)" = Linux ] && [ "$(uname -m)" != x86_64 ]; then
  echo "vgmstream's Linux release is built for x86_64, and this is $(uname -m)." >&2
  echo "Build it from source (https://github.com/vgmstream/vgmstream) and put vgmstream-cli on your PATH." >&2
  exit 1
fi

URL="https://github.com/vgmstream/vgmstream/releases/download/$RELEASE/$ZIP"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "Downloading $URL"
if command -v curl >/dev/null 2>&1; then curl -fL --progress-bar -o "$TMP/$ZIP" "$URL"
elif command -v wget >/dev/null 2>&1; then wget -q --show-progress -O "$TMP/$ZIP" "$URL"
else echo "Needs curl or wget to download." >&2; exit 1; fi

mkdir -p "$DEST"
if command -v unzip >/dev/null 2>&1; then unzip -oq "$TMP/$ZIP" -d "$DEST"
elif command -v python3 >/dev/null 2>&1; then python3 -m zipfile -e "$TMP/$ZIP" "$DEST"
else echo "Needs unzip or python3 to unpack." >&2; exit 1; fi
chmod +x "$DEST/$EXE" 2>/dev/null || true

# Judge by what it says, not its exit status: run without a file it complains and exits non-zero.
said=$("$DEST/$EXE" -V 2>&1 || true)
if printf '%s' "$said" | grep -q '"version"'; then
  echo "vgmstream $RELEASE is ready: $DEST/$EXE"
else
  echo "Unpacked to $DEST, but $EXE didn't run here. Check the files there." >&2
  exit 1
fi
