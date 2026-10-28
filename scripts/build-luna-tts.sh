#!/usr/bin/env bash
# Builds the resident Kokoro TTS worker against the sherpa-onnx runtime (with TTS).
# Usage: scripts/build-luna-tts.sh <sherpa-onnx runtime dir containing include/ and lib/> <output binary>
set -euo pipefail
RUNTIME="${1:?runtime dir}"; OUT="${2:?output binary}"
command -v clang >/dev/null || { echo "Install the Xcode Command Line Tools (xcode-select --install)." >&2; exit 1; }
clang -O2 -Wno-deprecated-declarations -I"$RUNTIME/include" "$(dirname "$0")/../tools/luna-tts/luna-tts.c" \
  -L"$RUNTIME/lib" -lsherpa-onnx-c-api -Wl,-rpath,"$RUNTIME/lib" -o "$OUT"
