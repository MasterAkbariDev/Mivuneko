#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if [[ "$(uname -s)" != "Darwin" ]]; then echo "This entrypoint builds the macOS app. Use npm run dev for the browser preview." >&2; exit 1; fi
MODE="${1:-run}"
case "$MODE" in run|--debug|--logs|--telemetry|--verify) ;; *) echo "Usage: $0 [--debug|--logs|--telemetry|--verify]" >&2; exit 2;; esac
command -v node >/dev/null || { echo "Install Node 22.18+ first." >&2; exit 1; }
command -v cargo >/dev/null || { echo "Install Rust stable first." >&2; exit 1; }
xcode-select -p >/dev/null || { echo "Install Xcode Command Line Tools with xcode-select --install." >&2; exit 1; }
if [[ -f .local/voice.json ]]; then
 export MIVUNEKO_WHISPER_BIN="$(node scripts/voice-config.mjs binary)"
 export MIVUNEKO_WHISPER_MODEL="$(node scripts/voice-config.mjs model)"
fi
pkill -x mivuneko-desktop >/dev/null 2>&1 || true
if [[ ! -d node_modules ]]; then npm ci; fi
npm run tauri -w @mivuneko/desktop -- build --bundles app
APP_BUNDLE="$ROOT_DIR/target/release/bundle/macos/Mivuneko.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/mivuneko-desktop"
[[ -d "$APP_BUNDLE" ]] || { echo "Tauri did not create the expected .app bundle." >&2; exit 1; }
# Pass only Mivuneko configuration via the child process environment, never a shell command or model text.
case "$MODE" in
 --debug) lldb -- "$APP_BINARY" ;;
 --logs|--telemetry) /usr/bin/open -n "$APP_BUNDLE"; /usr/bin/log stream --info --style compact --predicate 'process == "mivuneko-desktop"' ;;
 --verify) /usr/bin/open -n "$APP_BUNDLE"; sleep 1; pgrep -x mivuneko-desktop >/dev/null; echo "Mivuneko process is running." ;;
 run) /usr/bin/open -n "$APP_BUNDLE" ;;
esac
