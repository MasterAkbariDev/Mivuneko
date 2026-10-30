# Independent code review — Slice 0 (`slice-0-foundations`)

| | |
|---|---|
| Reviewer | Claude (Opus 5.5), independent session |
| Date | 2026-10-30 |
| Range | `main` (a3131b0) .. `slice-0-foundations` (a96a3a7), 12 commits |
| Method | Read the full diff and the touched files on the branch. Nothing modified, built or run. |

Tags: **[V]** verified by reading the code. **[S]** suspected; needs a run or a platform to confirm. **[R]** relies on platform documentation.

## Verdict

**Mergeable for development use.** Stage 3 (approvals and ACL) is solid. I found no bypass, replay or self-approval path. There is one **High** issue, and it is a release blocker rather than a dev regression: the embedded Kokoro worker has no runtime fallback, and it loads an unsigned downloaded library into the main signed binary. That will break voice in a notarized macOS build.

Fix S0-1 (the runtime fallback at least) before the first signed or notarized build. The rest can go into Slice 1 housekeeping.

Counts: 1 High, 3 Medium, 8 Low.

---

## Findings

### High

#### S0-1 — The embedded worker breaks in signed builds, and there is no runtime fallback to the CLI
- **Where:**
  - `tools/luna-tts/luna-tts.c:46-62` (`dlopen` / `LoadLibraryExW` of the downloaded `libsherpa-onnx-c-api`);
  - `apps/desktop/src-tauri/src/main.rs` `tts_config` (prefers `current_exe() + library` whenever the library file exists);
  - `crates/desktop-core/src/lib.rs` resident spawn (`!line.starts_with("READY")` → `Err("Character voice engine failed to load")`).
- **Why:**
  1. **[V] No fallback.** If the embedded worker fails at runtime, every `synthesize_phrase` returns an error. The per-phrase CLI is chosen only when the library file is **absent**, not when loading it **fails**. Before this change, the CLI path worked in exactly those cases. Failure triggers include:
     - a library that won't load;
     - a missing `onnxruntime` next to it;
     - an ABI or version mismatch;
     - a future runtime update.
  2. **[R] Hardened runtime.** Notarized macOS apps must enable the hardened runtime. **Library validation** then refuses to load dylibs that aren't signed by the same Team ID (or Apple). The worker *is the main app binary*, so `dlopen` of the GitHub-downloaded `libsherpa-onnx-c-api.dylib` will be refused in the Developer-ID build the plan requires.

     The progress log says it "inherits the app's signature later". That is precisely the problem. The only in-binary workaround is the `com.apple.security.cs.disable-library-validation` entitlement on the **main app**, which weakens the whole app against dylib injection.
  3. **[S] Install layout.** On macOS, the sherpa dylib finds `libonnxruntime` through its own `@rpath`/`@loader_path`. The installer layout (`speech/kokoro/runtime/...`) wasn't exercised end to end (the progress log says so).
- **Fix:**
  1. **Now (small):** a runtime fallback. When the embedded worker's first line is `ERR cannot load the sherpa-onnx library` (or `READY` doesn't arrive), mark the library unusable for the session and use the CLI path. Log it once. Add a test with a bogus library path that asserts synthesis still goes through the CLI.
  2. **Before the first signed build, choose one:**
     - **(a)** ship the sherpa-onnx C API and onnxruntime dylibs **inside the bundle**, signed with our identity, and download only models;
     - **(b)** go back to a **separate helper executable** (the plan's original `externalBin`) that carries `disable-library-validation` **alone**, so the main app keeps library validation.

     I recommend (a) for simplicity, since it is a fixed ~30–40 MB per target [S]. Either way, add a signed-build smoke test to CI's macOS job (ad-hoc sign with the hardened runtime, run `--luna-tts` against the installed layout, expect `READY`).

### Medium

#### S0-2 — "Policy enforced in Rust" covers deny/off only; ask and auto are the same thing in Rust
- **Where:** `crates/os-broker/src/lib.rs` `resolve_with`; `main.rs` `set_launch_policy`; `App.tsx` `applyApproval`.
- **Why [V]:**
  - In `Ask` mode, `resolve(token, allow=true, "main")` launches with no proof that a person approved. That is the same call `Auto` makes.
  - `set_launch_policy` also accepts any change from the main window without a gesture.

  So a compromised or buggy **main** webview can still launch any catalogued app. This is acceptable for a `local-reversible` launch (the main window is the approval surface), and the pet is correctly locked out. But the progress log and docs describe more than the code enforces, and Slice 6 send-capable actions must not build on it as-is.
- **Fix:**
  - **Now:** state this precisely in `SLICE0_PROGRESS.md` and the broker doc comment: "Rust enforces off/deny and token binding. Ask vs auto is a UI decision in the main window."
  - **Slice 6:** `send-capable` approvals need a confirmation the webview can't synthesize. Options are a native dialog rendered by Rust, or a token revealed only inside a Rust-rendered confirmation, plus the payload hash shown to the user.

#### S0-3 — Turn spans can be attributed to the wrong speech, which skews the Phase 0 baselines
- **Where:** `apps/desktop/src/metrics.ts` (module-level `turn`, never ended); `useVoice.ts` (`markTurn("turn.first_audio")` in both `speakCharacter` and `speakCloud`).
- **Why [V]:**
  - `turn` stays open after the reply. If a turn has no speech (voice off, code-only, an approval flow, an error), the **next** speech from any `useVoice` instance in the main window records `turn.first_audio` for that old turn. That includes `approvalVoice`, or a reply spoken minutes later, and the span can be tens of seconds or minutes long.
  - Separately, `stt.open_mic` mixes 6 s partial snapshots with finals.

  These are exactly the baseline numbers Phase 0 exists to produce.
- **Fix:**
  - Add `endTurn()` once the reply is final and no reply speech will follow (or after its speech starts), plus a hard cap (ignore `first_audio` more than ~30 s after `reply_done`).
  - Let only the conversation voice instance mark `first_audio`.
  - Tag open-mic spans `partial` vs `final` in `detail`.

#### S0-4 — Windows worker path: never compiled, and non-ASCII paths are at risk
- **Where:** `luna-tts.c` `_WIN32` branches; `main.rs` `run_tts_worker` (`to_string_lossy` on Windows).
- **Why:**
  - **[V]** The branch isn't pushed, so the Windows CI job (`cargo test -p mivuneko-desktop`, which compiles the C file with MSVC) has not run. The progress log notes this too.
  - **[S]** Only the **library** path is widened (`MultiByteToWideChar`). The model, voices, tokens and lexicon paths reach sherpa-onnx as UTF-8 `char*`. On Windows, narrow-path file APIs use the ANSI code page. A non-ASCII profile path (for example a Persian Windows user name under `%APPDATA%`) would fail to open the model. This is likely pre-existing for the CLI too, but the owner's user base makes it relevant.
- **Fix:**
  - Push to run CI.
  - Add a Windows test that points `tts_root` at a non-ASCII temp directory and expects `READY`.
  - If it fails, the clean fix is to set `<activeCodePage>UTF-8</activeCodePage>` in the app's Windows manifest (Windows 10 1903+). The worker is the same executable, so narrow APIs then take UTF-8. The alternative is `GetShortPathNameW` 8.3 paths.

### Low

| # | Where | Issue | Fix |
|---|---|---|---|
| S0-5 | `main.rs` `record_spans`; `desktop-core` `record_spans` | **[V]** `turn` is length-checked (≤ 64) but its charset isn't, so "never text" isn't enforced by Rust. **[V/R]** Non-`async` Tauri 2 commands run on the **main thread**, so SQLite open and insert happen on the UI thread on every flush. `set_launch_policy` file I/O likewise. | Validate `turn` as `[A-Za-z0-9-]{1,64}` (it's a UUID). Make `record_spans` async with `spawn_blocking`. Create `metrics.sqlite` 0600 like history, and include it in the future "forget everything". |
| S0-6 | `luna-tts.c:140` | **[V]** `malloc(total)` isn't checked; it dereferences NULL on allocation failure. | `if (!wav) { SherpaOnnx...Destroy(audio); printf("ERR out of memory\n"); fflush(stdout); continue; }` |
| S0-7 | `desktop-core` resident I/O (pre-existing) | **[V]** `read_line` for `READY`/`OK` has no timeout, and the TTS mutex is held. A hung worker blocks all character speech, and `cancel_voice` can't interrupt it. | In the voice slice, use a reader thread with a deadline, or have `cancel_voice` kill the resident child. |
| S0-8 | `fullscreen.rs:42` | **[V]** `CFNumberGetValue` returns `Boolean` (u8), declared as Rust `bool`. It's fine in practice (0/1), but a value other than 0/1 would be UB. | Declare `-> u8` and test `!= 0`. |
| S0-9 | `scripts/bench/idle-probe.mjs` | **[V]** The macOS regex `mivuneko-desktop$` on `comm` now also matches the embedded worker (`mivuneko-desktop --luna-tts`, ~0.6 GB), which inflates "idle app RAM". On Windows, WebView2 renderers are grandchildren (via the browser process), so the child filter undercounts. | Read `args` and report the worker separately. Walk the WebView2 process tree. |
| S0-10 | `main.rs` `remove_stale_voices` | **[V]** On Windows the delete fails while the worker holds the old table open. Retry happens only on the next recipe change, so a stale 28 MB file can persist. | Also sweep stale `{character}-*.bin` files when the resident worker (re)starts with a new table. |
| S0-11 | `os-broker` `payload_digest` | **[V]** It binds id + path, not bundle identity. A same-path bundle swap between approval and `open` passes. Out of scope for launch (it needs write access to `/Applications`). | For send-capable work later, bind the payload hash to bundle id + version (+ signature team) too. |
| S0-12 | `InlineChat.tsx` | **[V]** Dead code. It isn't imported anywhere, and it calls the broker and chat commands with a hard-coded `Assist`. The ACL reachability test would catch it if it were re-mounted in the pet. | Delete it, or move it behind the shared `runTurn` in Slice 1a. |

---

## Checked and found correct

**Stage 3, broker.**
- **Tokens:** 256-bit `getrandom` tokens.
- **Single use:** the token is removed before any other check, so it can't be replayed.
- **Context:** a wrong window context burns the token.
- **Timing:** constant-time compares.
- **Expiry:** the 60 s TTL is checked on resolve (stale entries are also pruned on request).
- **Policy:** deny/off is enforced at both request and resolve, and a policy change clears pending tokens.
- **Payload:** the hash is re-checked against a **freshly rediscovered** catalog entry, so a changed target is refused.
- **Limits:** the pending cap of 8 is kept.
- **Tests:** they cover each property.

**Stage 3, ACL.**
- `build.rs` declares all handlers in the app manifest. `main.json` allows all of them; `pet.json` allows 13.
- I cross-checked every `invoke("…")` literal on the branch against the window that renders it. Nothing the pet actually calls is denied, and nothing sensitive is allowed to it.
- The `pet-monitor-*` windows are retired and closed in `sync_pet_displays`, so dropping them from capabilities is correct.
- `require_main` in Rust is good defence in depth.
- The `acl.test.mjs` reachability check, starting at `Pet.tsx`, is a strong guard.

**Stage 3, migration.** The first run pushes localStorage into Rust, after which Rust wins. A corrupt or unknown policy file means `None`, which re-migrates and fails safe to ask. `request.policy` drives `applyApproval`.

**Stage 5.**
- The embedded dispatch happens before any Tauri or env work.
- `CString` lifetimes are correct, and `argv[0]` is handled.
- `RTLD_NOW | RTLD_LOCAL` is used.
- `LoadLibraryExW(..., LOAD_WITH_ALTERED_SEARCH_PATH)` gets an absolute path, so `onnxruntime.dll` resolves next to it.
- `_setmode` binary I/O is set on Windows.
- The vendored v2.0.1 header matches the only sherpa version ever pinned (installer and `setup-sherpa.sh`).

**Stage 8, FFI.**
- **Signatures:** `CGWindowListCopyWindowInfo` / `CGGetActiveDisplayList` / `CGDisplayBounds` / `CGRectMakeWithDictionaryRepresentation` / `CFArray*` / `CFDictionaryGetValue` are correct.
- **Ownership:** the Copy-rule list is released, and Get-rule values are not.
- **Coordinates:** both window bounds and display bounds use global top-left coordinates, so they compare consistently.
- **Permissions:** no Screen Recording is needed (only bounds, layer and PID).
- **Windows:** the `SHQueryUserNotificationState` HRESULT and the `2..=4` mapping (BUSY, D3D_FULL_SCREEN, PRESENTATION_MODE) are correct.
- **Cost:** the pet queries only when check-ins are on.

**Stage 9, spans.** Name allowlist; `ms` range (NaN rejected); `detail` charset; batch ≤ 64; capped at 5,000 rows. The client sanitizes provider and engine names.

**Other stages.**
- **Hermes toolsets:** both shapes accepted, fail-closed tests.
- **Golden prompt and schema snapshots:** in place.
- **D5:** `propertyOrdering` with a wire test.
- **Groq:** `reasoning_effort: low` applies only to `openai/gpt-oss*`.
- **D11:** `-only` values, with legacy values migrated.
- **D3:** the GC guard requires an alphanumeric id, and only embedded-pack characters reach it.
- **The stream A/B method and results** are sound and well documented.

## Not checked

- No build, test or app run (review only).
- Runtime WebView ACL denial.
- An end-to-end Kokoro run from the installer layout.
- Windows anything.
- `stream-ab.mjs` request bodies beyond key handling (keys are never printed).
