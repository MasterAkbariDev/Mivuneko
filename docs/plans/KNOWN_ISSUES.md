# Known issues

Tracked so they get fixed, not ignored. Each entry gives its status and where it was found.

## E2E tests failing on `main` before Slice 0

**Local run** (Intel Mac, Playwright 1.62.1): 16 failures on unmodified `main`. After Slice 0, 7 failures, all on the baseline list; the other 9 passed on re-run, so they are timing-sensitive on this machine.

**GitHub CI:** `main` (`a3131b0`, run 40931385272) and `slice-0-foundations` (`ad7977f`, run 40985496966) fail the **same 4** — `companions:3`, `settings-redesign:175`, `803`, `867` — and pass the other 56.

| # | Test | Local (main / Slice 0) | CI `main` | Notes |
|---|---|---|---|---|
| K1 | `companions.spec.ts:3` walk and run repaint every illustrated character even with a selected expression | fail / fail | fail | Consistent; likely a real rendering or assertion issue |
| K2 | `companions.spec.ts:163` every illustrated character loads distinct nonempty emotions and directional motion artwork | fail / fail | pass | Local-only; slow asset decode? |
| K3 | `settings-redesign.spec.ts:154` editable shortcuts persist and navigate without firing inside capture fields | fail / fail | pass | Local-only |
| K4 | `settings-redesign.spec.ts:175` bundled and imported VRM models render and selection reaches the desktop pet | fail / fail | fail | Consistent; VRM/WebGL in headless Chromium? |
| K5 | `settings-redesign.spec.ts:643` pet hover dock opens a compact composer and edit mode starts locked | fail / fail | pass | Local-only |
| K6 | `settings-redesign.spec.ts:714` microphone dot is quiet, active-only, stable across animation and optional | fail / fail | pass | Local-only |
| K7 | `settings-redesign.spec.ts:803` zoom grows beyond the display while the dock and its actions stay visible | fail / fail | fail | Consistent |
| K8 | `settings-redesign.spec.ts:867` canvas follows its frame through repeated grow and shrink operations | pass / pass | fail | CI-only |

**Next step:**
1. Fix the consistent ones first (K1, K4, K7).
2. For the local-only ones, run with `--repeat-each=5` to separate real bugs from timeouts on slow machines.
3. Then raise timeouts or fix waits.

**Owner:** next test-housekeeping pass (proposed: alongside Slice 1).

## Platform and runtime

| # | Issue | Status |
|---|---|---|
| P1 | Windows: embedded Kokoro worker never run on Windows; non-ASCII profile paths may reach sherpa-onnx as ANSI (review S0-4). CI compiles it; nobody has run it | Needs a Windows run; fix with `activeCodePage=UTF-8` if a non-ASCII `%APPDATA%` test fails |
| P2 | Signed macOS builds: hardened-runtime library validation will refuse the downloaded sherpa dylib; the runtime fallback to the CLI exists | Signing slice: bundle signed sherpa/onnxruntime libraries |
| P3 | Kokoro (sherpa-onnx v2.0.1, lexicon config) silently drops out-of-vocabulary words (`OOV word skipped: 'apps'`) | Voice slices |
| P4 | Character switch restarts the Kokoro worker (multi-second stall); no read timeout on the resident worker | Voice slices |
| P5 | Idle CPU ~12% of one core (pre-existing) | See [IDLE_CPU.md](IDLE_CPU.md) |
| P6 | `tauri build` rewrites the `tauri` features in `apps/desktop/src-tauri/Cargo.toml`; discard it, don't commit | Build hygiene; consider adding `macos-private-api` to the base dependency |
| P7 | `InlineChat.tsx` is dead code | Slice 1 (shared `runTurn`) |
| P8 | Pre-existing clippy findings in `examples/` and one `let_unit_value` in `main.rs` (not linted by CI) | Housekeeping |
