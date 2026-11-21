"""Owned optional-component storage. Never sweep user data or arbitrary caches.

The active configuration is the transaction commit point. A candidate must synthesize
audio before activation; cleanup repeats verification before removing owned files.
This module uses only the standard library so a failed package update cannot prevent
inventory or rollback. Run through a known-good Python, not the candidate to activate.
"""
import argparse
import base64
import io
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import uuid
import wave

OWNER = "mivuneko-voice-v1"
ARCHIVES = {
    "kokoro": ("runtime.tar.bz2", "model.tar.bz2"),
    "parakeet": ("runtime.tar.bz2", "model.tar.bz2"),
}


def speech_components(app):
    app = Path(app)
    voice = read(app / "voice.json") if (app / "voice.json").exists() else {}
    for component, key in [("kokoro", "tts"), ("parakeet", "sherpa")]:
        folder = Path(voice.get(key, str(app / "speech" / component)))
        try:
            safe_tree(folder, app / "speech")
            yield component, folder
        except ValueError:
            pass  # External installs never become cleanup-owned.


def old_speech_paths(app):
    app = Path(app)
    voice = read(app / "voice.json") if (app / "voice.json").exists() else {}
    def paths(value):
        if isinstance(value, dict):
            for item in value.values():
                yield from paths(item)
        elif isinstance(value, str) and Path(value).is_absolute():
            yield Path(value).resolve()
    protected = list(paths(voice))
    versions = app / "speech/versions"
    for candidate in versions.iterdir() if versions.is_dir() else []:
        try:
            marker = read(candidate / ".mivuneko-component.json")
            if marker.get("owner") != "mivuneko-speech-v1" or marker.get("id") != candidate.name:
                continue
            safe_tree(candidate, versions)
            if any(p.is_relative_to(candidate.resolve()) for p in protected):
                continue
            # Never remove a voices/ directory, even in an obsolete installation.
            for relative in ["speech/kokoro/runtime", "speech/kokoro/x-kokoro-multi-lang-v1_0",
                             "speech/parakeet/runtime", "speech/parakeet/models",
                             "speech/runtime", "speech/models"]:
                path = candidate / relative
                if path.is_dir():
                    yield path
            for relative in ["speech/kokoro/model.tar.bz2", "speech/kokoro/runtime.tar.bz2",
                             "speech/parakeet/model.tar.bz2", "speech/parakeet/runtime.tar.bz2",
                             "speech/runtime/runtime.zip"]:
                archive = candidate / relative
                for path in [archive, archive.with_suffix(".part")]:
                    if path.is_file():
                        yield path
        except (OSError, ValueError):
            continue


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + "." + uuid.uuid4().hex + ".part")
    try:
        with temp.open("w", encoding="utf-8") as out:
            json.dump(value, out, indent=2)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def safe_tree(path, root):
    """Refuse junctions, symlinks and escapes anywhere in a deletion tree."""
    path, root = Path(os.path.abspath(path)), Path(os.path.abspath(root))
    if not path.is_relative_to(root) or path == root:
        raise ValueError("Storage path is outside its owned component root")
    for p in [path, *path.parents]:
        if p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()):
            raise ValueError("Linked storage is preserved; manage it at its original location")
    if path.exists() and path.is_dir():
        for parent, dirs, files in os.walk(path, followlinks=False):
            for name in dirs + files:
                p = Path(parent) / name
                if p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()):
                    raise ValueError("Linked files are preserved")
    return path


def size(path):
    path = Path(path)
    if not path.exists() or path.is_symlink():
        return 0
    if path.is_file():
        return path.stat().st_size
    total = 0
    for parent, dirs, files in os.walk(path, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(parent) / d).is_symlink()
                   and not (hasattr(Path(parent) / d, "is_junction") and (Path(parent) / d).is_junction())]
        for name in files:
            p = Path(parent) / name
            if not p.is_symlink():
                total += p.stat().st_size
    return total


def runtime_root(config):
    python = Path(config["python"])
    # Legacy and managed layouts both put the environment immediately above Scripts.
    env = python.parent.parent
    if python.parent.name.lower() != "scripts":
        raise ValueError("External Python storage is not managed by Mivuneko")
    if env.parent.parent.name == "versions" and env.name == "environment":
        return env.parent.parent.parent
    if env.name == "expressive-voice":
        return env.parent
    raise ValueError("External runtime storage is not managed by Mivuneko")


def runtime_roots(app, config):
    roots = [runtime_root(config)]
    ledger = Path(app) / "voice-storage-roots.json"
    if ledger.is_file():
        data = read(ledger)
        if data.get("owner") == OWNER:
            roots += [Path(p) for p in data.get("roots", []) if Path(p).is_absolute()]
    # Do not double-count overlapping roots chosen by a user.
    distinct = []
    for root in sorted(set(p.resolve() for p in roots), key=lambda p: len(p.parts)):
        if not any(root.is_relative_to(p) for p in distinct):
            distinct.append(root)
    return distinct


def obsolete(config, root=None):
    root = Path(root) if root else runtime_root(config)
    versions = root / "versions"
    protected = [Path(config[k]).resolve() for k in ("python", "model_dir")]
    for candidate in versions.iterdir() if versions.is_dir() else []:
        marker = candidate / ".mivuneko-component.json"
        try:
            owned = read(marker)
            if owned.get("owner") != OWNER or owned.get("id") != candidate.name:
                continue
            safe_tree(candidate, versions)
            if protected[0].is_relative_to(candidate.resolve()):
                continue
            if protected[1].is_relative_to(candidate.resolve()):
                # A newer environment can reuse an older model. Keep that model,
                # reclaim only the marked version's unused environment.
                environment = candidate / "environment"
                if environment.is_dir():
                    safe_tree(environment, versions)
                    yield environment
            else:
                yield candidate
        except (OSError, ValueError):
            continue
    legacy = root / "expressive-voice"
    try:
        if (read(legacy / ".mivuneko-component.json").get("owner") == OWNER
                and not any(p.is_relative_to(legacy.resolve()) for p in protected)):
            safe_tree(legacy, root)
            yield legacy
    except (OSError, ValueError):
        pass


def inventory(app, config):
    app = Path(app)
    root = runtime_root(config)
    roots = runtime_roots(app, config)
    archives = []
    for component, folder in speech_components(app):
        for archive_root in set([folder, app / "speech" / component]):
            for name in ARCHIVES[component]:
                p = archive_root / name
                for candidate in [p, p.with_suffix(".part")]:
                    if candidate.is_file() and not candidate.is_symlink():
                        archives.append({"path": str(candidate), "bytes": size(candidate)})
    old = [{"path": str(p), "bytes": size(p)} for p in [*(p for r in roots for p in obsolete(config, r)), *old_speech_paths(app)]]
    return {"runtimeBytes": sum(size(r) for r in roots), "speechBytes": size(app / "speech"),
            "modelBytes": size(config["model_dir"]), "runtimeRoot": str(root),
            "archives": archives, "obsolete": old,
            "reclaimableBytes": sum(p["bytes"] for p in archives + old)}


def speech_request(config, worker, request):
    # communicate waits for process exit: no orphan worker/model on failure/timeout.
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    result = run_owned([config["python"], "-u", str(worker)],
                            input=json.dumps(request) + "\n", text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=600, creationflags=flags)
    if result.returncode:
        raise ValueError("Voice verification failed; the previous setup is unchanged")
    try:
        body = json.loads(result.stdout.strip().splitlines()[-1])
        if not body["ok"]:
            raise ValueError("Voice synthesis failed")
        audio = base64.b64decode(body["result"]["audio"], validate=True)
        with wave.open(io.BytesIO(audio), "rb") as wav:
            frames = wav.readframes(wav.getnframes())
            if wav.getnframes() < wav.getframerate() // 10 or not any(frames):
                raise ValueError("Voice returned empty audio")
    except (KeyError, IndexError, ValueError, wave.Error) as error:
        raise ValueError("Voice verification produced no usable audio") from error
    return len(audio)


def run_owned(command, *, timeout, input=None, text=False, stdout=subprocess.PIPE,
              stderr=subprocess.PIPE, capture_output=False, creationflags=0):
    """Kill the whole owned launcher tree on timeout (venv launchers spawn Python)."""
    child = subprocess.Popen(command, stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,
                             stdout=stdout, stderr=stderr, text=text,
                             creationflags=creationflags, start_new_session=os.name != "nt")
    try:
        output, errors = child.communicate(input, timeout=timeout)
        return subprocess.CompletedProcess(command, child.returncode, output, errors)
    except subprocess.TimeoutExpired:
        if os.name == "nt":
            taskkill = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32/taskkill.exe"
            subprocess.run([str(taskkill), "/PID", str(child.pid), "/T", "/F"],
                           capture_output=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
        else:
            os.killpg(child.pid, signal.SIGKILL)
        child.kill()
        child.wait(timeout=10)
        raise ValueError("Voice verification timed out; the previous setup is unchanged")
    finally:
        for pipe in [child.stdin, child.stdout, child.stderr]:
            if pipe:
                pipe.close()


def verify(config, worker, expressive=True):
    if not Path(config["python"]).is_file():
        raise ValueError("Runtime Python is missing")
    result = run_owned([config["python"], "-c", "import pywinauto,sherpa_onnx,PIL"],
                            capture_output=True, timeout=60,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if result.returncode:
        raise ValueError("Shared computer/fast-voice runtime verification failed")
    if expressive:
        return speech_request(config, worker, {
            "action": "speak", "modelDir": config["model_dir"],
            "text": "Your companion voice is ready.", "mood": "happy", "speaker": "Vivian",
            "language": "English", "instruction": "Speak clearly and warmly.", "verification": True})
    return 0


def verify_component(app, config, worker, component, folder=None):
    folder = Path(folder) if folder else Path(app) / "speech" / component
    safe_tree(folder, Path(app) / "speech")
    if component == "kokoro":
        models = list((folder / "x-kokoro-multi-lang-v1_0").rglob("model.onnx"))
        if len(models) != 1 or not (folder / "runtime/.ready").is_file():
            raise ValueError("Kokoro is incomplete; retaining its downloads")
        model = models[0].parent
        speech_request(config, worker, {"action": "speak_fast", "fastModelDir": str(model),
                       "voices": str(model / "voices.bin"), "text": "Your voice is ready.",
                       "speaker": 0, "speed": 1.0})
    else:
        # Actually load and transcribe a short silent sample; checking filenames alone
        # doesn't detect truncated ONNX files or missing shared libraries.
        check = """import sherpa_onnx,numpy as np,sys
from pathlib import Path
p=Path(sys.argv[1]); e=list(p.rglob('encoder.int8.onnx'))
assert len(e)==1
p=e[0].parent
r=sherpa_onnx.OfflineRecognizer.from_transducer(encoder=str(p/'encoder.int8.onnx'),decoder=str(p/'decoder.int8.onnx'),joiner=str(p/'joiner.int8.onnx'),tokens=str(p/'tokens.txt'),num_threads=2,model_type='nemo_transducer',provider='cpu')
s=r.create_stream();s.accept_waveform(16000,np.zeros(16000,dtype=np.float32));r.decode_stream(s)
"""
        result = run_owned([config["python"], "-c", check, str(folder / "models")],
                                capture_output=True, timeout=120,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        if result.returncode or not (folder / "runtime/x/.ready").is_file():
            raise ValueError("Parakeet verification failed; retaining its downloads")


def cleanup(app, config, worker):
    before = inventory(app, config)
    # Never delete old environments until the active environment AND voice work.
    verify(config, worker, not config.get("expressive_removed", False))
    removed, warnings = [], []
    speech_verified = True
    for component, folder in speech_components(app):
        names = ARCHIVES[component]
        if not folder.exists():
            continue
        try:
            verify_component(app, config, worker, component, folder)
            for archive_root in set([folder, Path(app) / "speech" / component]):
                for name in names:
                    for path in [archive_root / name, (archive_root / name).with_suffix(".part")]:
                        safe_tree(path, Path(app) / "speech")
                        if path.exists():
                            path.unlink()
                            removed.append(str(path))
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            speech_verified = False
            warnings.append(str(error))
    for path in [p for root in runtime_roots(app, config) for p in obsolete(config, root)] if speech_verified else []:
        try:
            owner_root = next(r for r in runtime_roots(app, config) if path.resolve().is_relative_to(r))
            safe_tree(path, owner_root)
            shutil.rmtree(path)
            removed.append(str(path))
        except OSError as error:
            warnings.append(str(error))
    if speech_verified:
        for path in old_speech_paths(app):
            try:
                safe_tree(path, Path(app) / "speech/versions")
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
                removed.append(str(path))
            except OSError as error:
                warnings.append(str(error))
    after = inventory(app, config)
    return {"before": before, "after": after, "removed": removed, "warnings": warnings,
            "freedBytes": max(0, before["runtimeBytes"] + before["speechBytes"] - after["runtimeBytes"] - after["speechBytes"])}


def activate(config_path, candidate, worker):
    verify(candidate, worker)
    for component, folder in speech_components(Path(config_path).parent):
        if folder.exists():
            verify_component(Path(config_path).parent, candidate, worker, component, folder)
    # Atomic pointer swap; a failed verification or interrupted download never
    # changes the active configuration. Keep the prior pointer for diagnostics.
    path = Path(config_path)
    if path.exists():
        previous = read(path)
        atomic_json(path.with_name("local-runtime.previous.json"), previous)
        # Adopt only the installer's exact legacy environment layout on the same
        # storage root. External Python installs and model folders are never owned.
        legacy = runtime_root(previous) / "expressive-voice"
        if Path(previous["python"]).absolute() == (legacy / "Scripts/python.exe").absolute():
            safe_tree(legacy, runtime_root(previous))
            atomic_json(legacy / ".mivuneko-component.json", {"owner": OWNER, "id": legacy.name})
        ledger = path.parent / "voice-storage-roots.json"
        roots = runtime_roots(path.parent, previous) + [runtime_root(candidate)]
        atomic_json(ledger, {"owner": OWNER, "roots": [str(p) for p in roots]})
    atomic_json(path, candidate)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["inventory", "cleanup", "activate", "remove-expressive"])
    parser.add_argument("--app", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--worker", required=True)
    parser.add_argument("--candidate")
    args = parser.parse_args()
    config = read(args.config) if Path(args.config).exists() else None
    if args.action == "activate":
        activate(args.config, read(args.candidate), args.worker)
        result = {"activated": True}
    elif config is None:
        result = {"runtimeBytes": 0, "speechBytes": size(Path(args.app) / "speech"),
                  "modelBytes": 0, "reclaimableBytes": 0}
    elif args.action == "inventory":
        result = inventory(args.app, config)
    elif args.action == "cleanup":
        result = cleanup(args.app, config, args.worker)
    else:
        # Remove just the optional model, never the shared Python computer runtime,
        # character profiles, recordings or chat data. Unknown external models stay.
        model = Path(config["model_dir"])
        roots = runtime_roots(args.app, config)
        root = next((r for r in roots if model.resolve().is_relative_to(r)), runtime_root(config))
        allowed = model == root / "models/qwen3-tts-customvoice"
        marker = model.parent / ".mivuneko-component.json"
        if not allowed and marker.is_file():
            allowed = read(marker).get("owner") == OWNER and model.name == "model"
        if not allowed:
            raise ValueError("External model is not managed by Mivuneko; no files removed")
        safe_tree(model, root)
        freed = size(model)
        if model.exists():
            shutil.rmtree(model)
        config["expressive_removed"] = True
        atomic_json(args.config, config)
        result = {"freedBytes": freed}
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
