#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if [[ "$(uname -s)" != "Darwin" ]]; then echo "This helper installs the macOS voice runtime." >&2; exit 1; fi
if [[ "${1:-base}" != "base" && "${1:-base}" != "tiny" ]]; then echo "Usage: npm run setup:voice -- [base|tiny]" >&2; exit 2; fi
if command -v whisper-cli >/dev/null; then
 WHISPER_CLI="$(command -v whisper-cli)"
else
 command -v cmake >/dev/null || { echo "CMake is required to build whisper-cli. Install CMake, then run this helper again." >&2; exit 1; }
 VERSION="1.9.5"
 ARCHIVE_SHA256="ff1a9053feb509ff9d7729703355541ae9690073a6b1c40eb692c962e0dc1720"
 VOICE_DIR="$ROOT_DIR/.local/voice-runtime/whisper.cpp-$VERSION"
 SOURCE_DIR="$VOICE_DIR/source"
 BUILD_DIR="$VOICE_DIR/build"
 WHISPER_CLI="$BUILD_DIR/bin/whisper-cli"

 if [[ ! -x "$WHISPER_CLI" ]]; then
  mkdir -p "$VOICE_DIR"
  ARCHIVE="$VOICE_DIR/whisper.cpp-$VERSION.tar.gz"
  curl --fail --location --silent --show-error "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v$VERSION.tar.gz" --output "$ARCHIVE"
  echo "$ARCHIVE_SHA256  $ARCHIVE" | shasum -a 256 --check --status || { rm -f "$ARCHIVE"; echo "whisper.cpp source checksum verification failed." >&2; exit 1; }
  rm -rf "$SOURCE_DIR"
  mkdir -p "$SOURCE_DIR"
  tar -xzf "$ARCHIVE" --strip-components=1 -C "$SOURCE_DIR"
  rm -f "$ARCHIVE"
  cmake -S "$SOURCE_DIR" -B "$BUILD_DIR" \
   -DCMAKE_BUILD_TYPE=Release \
   -DBUILD_SHARED_LIBS=OFF \
   -DWHISPER_BUILD_IS_DEV=OFF \
   -DWHISPER_BUILD_TESTS=OFF \
   -DWHISPER_BUILD_EXAMPLES=ON \
   -DWHISPER_BUILD_SERVER=OFF \
   -DWHISPER_SDL2=OFF
  cmake --build "$BUILD_DIR" --target whisper-cli --parallel "$(sysctl -n hw.logicalcpu)"
 fi
fi
node scripts/setup-voice.mjs "$WHISPER_CLI" "${1:-base}"
echo "Voice runtime configured. Run ./script/build_and_run.sh to build and launch the app."
