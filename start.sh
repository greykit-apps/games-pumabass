#!/usr/bin/env bash
# Starts PumaBass and opens it in your browser (when there is a desktop).
# Stop it with Ctrl+C. Options pass through, e.g. ./start.sh --port 8015 --no-open
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "PumaBass needs Node.js 18 or newer: https://nodejs.org (or your package manager, e.g. sudo apt install nodejs)" >&2
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 18 ]; then
  echo "PumaBass needs Node.js 18 or newer; this is $(node --version)." >&2
  exit 1
fi
if [ ! -x tools/vgmstream/vgmstream-cli ] && ! command -v vgmstream-cli >/dev/null 2>&1; then
  echo "Note: vgmstream isn't installed, so song audio won't play. Run tools/get-vgmstream.sh once." >&2
fi
exec node server/server.js "$@"
