# Optional local voice storage

Settings → Connections → Local models → Local voice storage shows installed
runtime/speech bytes and reclaimable downloads/managed old versions. Sizes use
decimal GB and logical file lengths, not Explorer's rounded or allocated size.

- **Clean verified downloads & old versions** verifies actual Qwen speech (if
  installed), fast Kokoro speech, and Parakeet model inference before cleaning.
  Verification can take a few minutes and temporarily uses voice compute resources.
- **Remove expressive model** removes only the managed Qwen download, after an
  explicit confirmation. The shared Python computer/fast-voice runtime remains.
  If expressive voice was selected, the app switches to fast local voice.
- **Install location** chooses the folder for the next runtime installation/update.
  Existing models are reused at their existing location; this is not a silent file
  move. To relocate the expressive model too, remove it first, choose the new
  runtime folder, then install again. The app tracks previous managed roots for
  cleanup. Use a dedicated folder, not a drive root or a shared library folder.

User recordings, character voice profiles, settings, conversations, computer
backups and arbitrary external Python/model installs are not disposable caches.
In particular, `speech/kokoro/voices` contains character voice tables and is retained.
Do not delete the whole `speech` or `local-runtime` directory manually.

## Update transaction

The Windows runtime updater builds a fresh `versions/voice-…/environment` at its
final location. Python environments are not moved or hard-linked. Installed
libraries are copied into the candidate, junctions excluded, and package changes
apply only to that copy. New downloads do not retain pip wheel caches. The current
Qwen model is reused rather than downloading another 4.5 GB bundle.

The candidate must import the shared computer/voice dependencies and generate a
valid speech WAV before `local-runtime.json` is atomically replaced. Download,
package, model-load or synthesis failures before activation leave the previous
configuration and environment available. The prior pointer is saved for diagnosis;
it is not a guaranteed rollback target after successful verification and cleanup.

After activation, cleanup verifies the active components again, then removes known
archives and obsolete **owned** versions. Legacy `expressive-voice` environments
are adopted only through their exact installer layout and previous configured
Python path. Unknown directories and linked files are retained. Locked files may
be retained with a warning; retry cleanup after voice activity stops.

Speech engines also install into separate owned candidates in `speech/versions`.
Checksummed downloads and extraction cannot overwrite the active installation.
Kokoro must synthesize and recognition engines must perform inference before
activation. Interrupted candidates can resume; active candidates are never reused.
Successful candidates discard their downloaded archives. Settings cleanup removes
superseded owned model/runtime directories while preserving `voices` directories.
Distinct optional Whisper models remain registered/selectable; they are not treated
as obsolete versions of one another.

Updates temporarily require room for both environments. Failure stages are retained
until a working setup can be verified and cleanup runs. Shared/global pip or
Hugging Face caches, Ollama models and application/webview caches are not swept.

## Verification

```powershell
python tests/unit/voice-storage.test.py
npx playwright test tests/e2e/voice-storage.spec.ts
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --bin mivuneko-desktop
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --bin mivuneko-desktop installed_speech_components_run_after_upgrade -- --ignored
```

For a real upgrade, invoke `scripts/setup-local-runtime.ps1` with the existing
`-Root`, active `-ConfigPath`, and absolute `-StorageManager` (`scripts/voice-storage.py`)
and `-Worker` (`services/local-runtime/worker.py`) paths. This changes the installation
and can download packages; it is not part of the routine unit suite. Then run:

```powershell
python tests/native/voice-storage-check.py
```

That acceptance check deliberately attempts to activate an invalid model, confirms
the active pointer is byte-for-byte unchanged, then generates real Qwen/Kokoro
audio and runs Parakeet inference using the installation that survived. It accepts
`--preservation <json>` for pre-upgrade relative-path/SHA-256 fingerprints of personal
files. It does not record microphone audio or remove installed components.

## Windows acceptance result — November 21, 2026

Measured logical bytes on the existing installation, before the update versus
after a successful upgrade and a second upgrade reusing installed libraries:

| Location | Before | After |
| --- | ---: | ---: |
| Local runtime | 12,724,747,976 | 12,940,504,954 |
| Speech engines, models and profiles | 2,176,231,439 | 1,291,645,158 |
| **Total** | **14,900,979,415** | **14,232,150,112** |

Net reduction: **668,829,303 bytes (0.669 GB)**. Four retained archives accounted
for 884,586,281 bytes. Updated dependencies increased the runtime footprint, so
the net saving is smaller than the removed archive total. The multi-gigabyte old
environment was replaced by another working environment; deleting it after the
temporary upgrade peak is not counted as a net saving against the starting setup.

The 4,520,222,455-byte Qwen model was reused. There were no obsolete versions or
known archives remaining after cleanup. An invalid-model activation was rejected
without changing the active pointer, then Qwen generated a 103,724-byte WAV,
Kokoro synthesized speech, and Parakeet performed inference. All 113 recorded
personal-file SHA-256 fingerprints matched after cleanup, including conversation
data, launch policy, speech configuration, character voice tables and computer
backups. No user recordings were captured by these checks.

The native installer verifier also successfully synthesized Kokoro speech at its
native 24 kHz output rate and ran the installed Parakeet server on synthetic input.
Storage checks use bounded, deterministic Qwen samples; ordinary character speech
retains its existing generation settings.
