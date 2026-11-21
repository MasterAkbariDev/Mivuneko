import importlib.util
import json
import os
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("storage", Path(__file__).parents[2] / "scripts/voice-storage.py")
storage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storage)


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.app = self.root / "app"
        self.runtime = self.root / "runtime"
        self.config = {"python": str(self.runtime / "expressive-voice/Scripts/python.exe"),
                       "model_dir": str(self.runtime / "models/qwen3-tts-customvoice")}
        self.pointer = self.app / "local-runtime.json"
        storage.atomic_json(self.pointer, self.config)

    def version(self, name):
        folder = self.runtime / "versions" / name
        storage.atomic_json(folder / ".mivuneko-component.json", {"owner": storage.OWNER, "id": name})
        (folder / "environment/Scripts").mkdir(parents=True)
        (folder / "environment/Scripts/python.exe").write_bytes(b"python")
        return folder

    def test_failed_verification_never_changes_pointer_or_removes_old_runtime(self):
        old = Path(self.config["python"])
        old.parent.mkdir(parents=True)
        old.write_bytes(b"working")
        candidate = self.version("new")
        config = {**self.config, "python": str(candidate / "environment/Scripts/python.exe")}
        with patch.object(storage, "verify", side_effect=ValueError("broken candidate")):
            with self.assertRaises(ValueError):
                storage.activate(self.pointer, config, "worker")
        self.assertEqual(storage.read(self.pointer), self.config)
        self.assertEqual(old.read_bytes(), b"working")

    def test_verified_upgrade_cleans_only_owned_obsolete_components(self):
        old = Path(self.config["python"])
        old.parent.mkdir(parents=True)
        old.write_bytes(b"old runtime")
        candidate = self.version("new")
        config = {**self.config, "python": str(candidate / "environment/Scripts/python.exe")}
        unknown = self.runtime / "versions/user-folder"
        unknown.mkdir()
        (unknown / "recording.wav").write_bytes(b"preserve")
        for relative in ["chat.json", "settings.json", "speech/kokoro/voices/haru.bin", "recordings/user.wav"]:
            path = self.app / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"personal data")
        archive = self.app / "speech/kokoro/model.tar.bz2"
        archive.write_bytes(b"cached download")
        with patch.object(storage, "verify"), patch.object(storage, "verify_component"):
            storage.activate(self.pointer, config, "worker")
            result = storage.cleanup(self.app, config, "worker")
        self.assertGreater(result["freedBytes"], 0)
        self.assertFalse(old.exists())
        self.assertFalse(archive.exists())
        self.assertTrue(Path(config["python"]).exists())
        self.assertTrue((unknown / "recording.wav").exists())
        self.assertEqual((self.app / "speech/kokoro/voices/haru.bin").read_bytes(), b"personal data")
        self.assertTrue((self.app / "chat.json").exists())

    def test_failed_component_check_keeps_archive_and_partial(self):
        archive = self.app / "speech/kokoro/model.tar.bz2"
        archive.parent.mkdir(parents=True)
        archive.write_bytes(b"download")
        archive.with_suffix(".part").write_bytes(b"resumable")
        old = self.version("old")
        with patch.object(storage, "verify"), patch.object(storage, "verify_component", side_effect=ValueError("broken")):
            result = storage.cleanup(self.app, self.config, "worker")
        self.assertTrue(result["warnings"])
        self.assertTrue(archive.exists())
        self.assertTrue(archive.with_suffix(".part").exists())
        self.assertTrue((old / "environment/Scripts/python.exe").exists())

    def test_candidate_with_broken_existing_fast_voice_cannot_activate(self):
        folder = self.app / "speech/kokoro"
        folder.mkdir(parents=True)
        candidate = self.version("new")
        config = {**self.config, "python": str(candidate / "environment/Scripts/python.exe")}
        with patch.object(storage, "verify"), patch.object(storage, "verify_component", side_effect=ValueError("bad fast voice")):
            with self.assertRaises(ValueError):
                storage.activate(self.pointer, config, "worker")
        self.assertEqual(storage.read(self.pointer), self.config)

    def test_speech_cleanup_keeps_distinct_registered_models_and_all_voice_profiles(self):
        versions = self.app / "speech/versions"
        active, old = versions / "active", versions / "old"
        for candidate in [active, old]:
            storage.atomic_json(candidate / ".mivuneko-component.json", {"owner": "mivuneko-speech-v1", "id": candidate.name})
            (candidate / "speech/models").mkdir(parents=True)
            (candidate / "speech/models/model.bin").write_bytes(b"model")
        voices = old / "speech/kokoro/voices"
        voices.mkdir(parents=True)
        (voices / "custom.bin").write_bytes(b"profile")
        storage.atomic_json(self.app / "voice.json", {"whisperModels": {"tiny": {"model": str(active / "speech/models/model.bin")}}})
        with patch.object(storage, "verify"):
            storage.cleanup(self.app, self.config, "worker")
        self.assertTrue((active / "speech/models/model.bin").exists())
        self.assertFalse((old / "speech/models").exists())
        self.assertEqual((voices / "custom.bin").read_bytes(), b"profile")

    def test_reused_model_keeps_model_but_reclaims_old_environment(self):
        old = self.version("old")
        (old / "model").mkdir()
        (old / "model/model.safetensors").write_bytes(b"working model")
        current = self.version("new")
        config = {"python": str(current / "environment/Scripts/python.exe"), "model_dir": str(old / "model")}
        self.assertEqual(storage.runtime_root(config), self.runtime)
        with patch.object(storage, "verify"):
            storage.cleanup(self.app, config, "worker")
        self.assertFalse((old / "environment").exists())
        self.assertTrue((old / "model/model.safetensors").exists())
        self.assertTrue(Path(config["python"]).exists())

    def test_new_install_root_keeps_reused_model_and_cleans_previous_owned_environment(self):
        previous = Path(self.config["python"])
        previous.parent.mkdir(parents=True)
        previous.write_bytes(b"old environment")
        model = Path(self.config["model_dir"])
        model.mkdir(parents=True)
        (model / "model.safetensors").write_bytes(b"reused model")
        new_root = self.root / "other-drive"
        candidate = new_root / "versions/new"
        storage.atomic_json(candidate / ".mivuneko-component.json", {"owner": storage.OWNER, "id": "new"})
        python = candidate / "environment/Scripts/python.exe"
        python.parent.mkdir(parents=True)
        python.write_bytes(b"new environment")
        config = {**self.config, "python": str(python)}
        with patch.object(storage, "verify"):
            storage.activate(self.pointer, config, "worker")
            storage.cleanup(self.app, config, "worker")
        self.assertFalse(previous.exists())
        self.assertTrue(python.exists())
        self.assertEqual((model / "model.safetensors").read_bytes(), b"reused model")

    def test_symlink_tree_and_root_deletion_are_refused(self):
        with self.assertRaises(ValueError):
            storage.safe_tree(self.root, self.root)
        with self.assertRaises(ValueError):
            storage.safe_tree(self.root.parent, self.root)
        with self.assertRaises(ValueError):
            storage.safe_tree(self.app / "speech/../../runtime", self.app / "speech")
        linked = self.root / "linked"
        try:
            linked.symlink_to(self.app, target_is_directory=True)
        except OSError:
            if os.name != "nt":
                raise
            import _winapi
            _winapi.CreateJunction(str(self.app), str(linked))
        with self.assertRaises(ValueError):
            storage.safe_tree(linked, self.root)

    def test_model_removal_keeps_python_and_profiles(self):
        python = Path(self.config["python"])
        python.parent.mkdir(parents=True)
        python.write_bytes(b"runtime")
        model = Path(self.config["model_dir"])
        model.mkdir(parents=True)
        (model / "model.safetensors").write_bytes(b"optional")
        profile = self.app / "speech/kokoro/voices/custom.bin"
        profile.parent.mkdir(parents=True)
        profile.write_bytes(b"personal")
        result = subprocess.run([sys.executable, str(Path(storage.__file__)), "remove-expressive",
                                 "--app", str(self.app), "--config", str(self.pointer), "--worker", "unused"],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertFalse(model.exists())
        self.assertTrue(python.exists())
        self.assertEqual(profile.read_bytes(), b"personal")
        self.assertTrue(storage.read(self.pointer)["expressive_removed"])

    def test_external_model_cannot_be_removed(self):
        model = self.root / "user-model"
        model.mkdir()
        (model / "recording.wav").write_bytes(b"personal")
        storage.atomic_json(self.pointer, {**self.config, "model_dir": str(model)})
        result = subprocess.run([sys.executable, str(Path(storage.__file__)), "remove-expressive",
                                 "--app", str(self.app), "--config", str(self.pointer), "--worker", "unused"],
                                capture_output=True, text=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((model / "recording.wav").read_bytes(), b"personal")

    def test_verification_timeout_stops_owned_process(self):
        with self.assertRaisesRegex(ValueError, "timed out"):
            storage.run_owned([sys.executable, "-c", "import time; time.sleep(30)"], timeout=0.5)


if __name__ == "__main__":
    unittest.main()
