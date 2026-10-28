#!/usr/bin/env bash
# Installs the sherpa-onnx based speech stack into .local/ (nothing is committed):
#   parakeet  speech recognition: runtime + NVIDIA Parakeet TDT 0.6B v2 int8   (~503 MB download)
#   kokoro    Luna's voice: runtime with TTS + Kokoro v1.0 full model + worker (~356 MB download)
# Every download resumes after a dropped connection and is verified against the SHA-256
# digest GitHub publishes for the release asset. Usage: setup-sherpa.sh [parakeet|kokoro|all]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ "$(uname -s)-$(uname -m)" == "Darwin-x86_64" ]] || echo "Note: runtime archives below are for macOS x64; edit RUNTIME for other platforms." >&2
VERSION="v2.0.1"
RUNTIME="osx-x64-shared"

# get <release tag> <asset> <extract dir>
get() {
  local tag="$1" name="$2" dest="$3" total digest tries=0
  if [[ -d "$dest" && -n "$(ls -A "$dest" 2>/dev/null)" ]]; then echo "Already installed: $name"; return; fi
  mkdir -p "$dest"
  read -r total digest < <(curl -fsS "https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/tags/$tag" |
    python3 -c "import sys,json; a=next(x for x in json.load(sys.stdin)['assets'] if x['name']=='$name'); print(a['size'], a['digest'].split(':')[1])")
  [[ ${#digest} -eq 64 ]] || { echo "No SHA-256 digest published for $name; aborting." >&2; exit 1; }
  local part="$dest/$name.part"
  while [[ $(stat -f%z "$part" 2>/dev/null || echo 0) -lt $total ]]; do
    tries=$((tries + 1)); [[ $tries -gt 200 ]] && { echo "Giving up on $name" >&2; exit 1; }
    curl -fL -s --connect-timeout 15 --max-time 120 -C - -o "$part" \
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/$tag/$name" || sleep 2
    printf '\r%s: %d%%' "$name" $(( $(stat -f%z "$part" 2>/dev/null || echo 0) * 100 / total ))
  done
  echo
  echo "$digest  $part" | shasum -a 256 -c - >/dev/null || { rm -f "$part"; echo "Checksum mismatch for $name" >&2; exit 1; }
  tar -xjf "$part" -C "$dest"
  rm -f "$part"
  echo "Installed $name"
}

parakeet() {
  get "$VERSION" "sherpa-onnx-$VERSION-$RUNTIME-no-tts.tar.bz2" ".local/sherpa/runtime/x"
  get asr-models "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2" ".local/sherpa/models/x"
}
kokoro() {
  get "$VERSION" "sherpa-onnx-$VERSION-$RUNTIME.tar.bz2" ".local/tts/x-sherpa-onnx-$VERSION-$RUNTIME"
  # int8 is smaller but ~3x slower than full precision on Intel CPUs (measured), so use the full model.
  get tts-models "kokoro-multi-lang-v1_0.tar.bz2" ".local/tts/x-kokoro-multi-lang-v1_0"
  local runtime
  runtime="$(echo .local/tts/x-sherpa-onnx-$VERSION-$RUNTIME/*/)"
  scripts/build-luna-tts.sh "$ROOT/${runtime%/}" "$ROOT/.local/tts/luna-tts"
  echo "Built .local/tts/luna-tts"
}
case "${1:-all}" in
  parakeet) parakeet ;;
  kokoro) kokoro ;;
  all) parakeet; kokoro ;;
  *) echo "Usage: $0 [parakeet|kokoro|all]" >&2; exit 2 ;;
esac
echo "Done. Restart Mivuneko; Settings > Speech recognition lists what is installed."
