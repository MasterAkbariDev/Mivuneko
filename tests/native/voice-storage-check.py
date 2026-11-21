"""Post-upgrade acceptance: failed activation leaves real installed speech usable.

Does not install packages or remove files. Needs the installed expressive/fast voice
components. Run after setup-local-runtime.ps1 against an existing installation.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time

repo = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("storage", repo / "scripts/voice-storage.py")
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)
parser = argparse.ArgumentParser()
parser.add_argument("--app", default=str(Path(os.environ.get("APPDATA", "")) / "dev.mivuneko.companion"))
parser.add_argument("--preservation", help="Optional JSON of pre-upgrade relative file names and SHA-256 hashes")
args = parser.parse_args()
app = Path(args.app)
pointer = app / "local-runtime.json"
original = pointer.read_bytes()
config = storage.read(pointer)
worker = repo / "services/local-runtime/worker.py"
started = time.monotonic()
with tempfile.TemporaryDirectory() as temporary:
    invalid = {**config, "model_dir": str(Path(temporary) / "missing-model")}
    try:
        storage.activate(pointer, invalid, worker)
    except ValueError:
        pass
    else:
        raise AssertionError("An invalid model was activated")
assert pointer.read_bytes() == original, "Failed update changed the active pointer"
assert Path(config["python"]).is_file(), "Failed update removed the current environment"
audio_bytes = storage.verify(config, worker)
components = []
for component, folder in storage.speech_components(app):
    if folder.exists():
        storage.verify_component(app, config, worker, component, folder)
        components.append(component)
preserved = 0
if args.preservation:
    for relative, expected in storage.read(args.preservation).items():
        assert hashlib.sha256((app / relative).read_bytes()).hexdigest() == expected, relative
        preserved += 1
print(json.dumps({"failedUpdatePreservedActiveRuntime": True, "qwenAudioBytes": audio_bytes,
                  "verifiedSpeechComponents": components, "preservedFiles": preserved,
                  "seconds": round(time.monotonic() - started, 2),
                  "storage": storage.inventory(app, config)}))
