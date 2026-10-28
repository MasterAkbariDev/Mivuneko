#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if [[ "$(uname -s)" != "Darwin" ]]; then echo "This helper installs the macOS voice runtime." >&2; exit 1; fi
if ! command -v whisper-cli >/dev/null; then
 command -v brew >/dev/null || { echo "Install whisper.cpp (whisper-cli) or install Homebrew, then run this helper again." >&2; exit 1; }
 brew install whisper-cpp
fi
node scripts/setup-voice.mjs "$(command -v whisper-cli)"
echo "Voice runtime configured. Run ./script/build_and_run.sh to build and launch the app."
