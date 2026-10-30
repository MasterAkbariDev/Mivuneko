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
| K10 | `character-packs.spec.ts:23` folder imports create independent persistent slots and reject a broken pack atomically | fail (Slice 0 `ffaeeb5` and Slice 1, also when run alone) | pass | Local-only, pre-existing; not related to streaming |
| K9 | `desktop.spec.ts:178` opt-in history survives reload and disabling it deletes storage | pass / pass (failed once under load in Slice 1 stage 2, 4/4 alone) | pass | Load-dependent; watch |
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

## Found in the owner's Slice 0 smoke test (2026-10-30)

| # | Report | Diagnosis | Slice 0 regression? | Plan |
|---|---|---|---|---|
| S1 | After the pet finishes speaking, open mic stops listening until it is turned off and on | **Confirmed in code.** `useOpenMic.finish()` tears capture down after a submitted phrase and restarts only on an *empty* transcript (`setRestart`). Otherwise restart depends on `paused` changing, but with barge-in on (the default) `paused` ignores `busy`, so it never changes | **No.** Identical on `main` (`useOpenMic.ts:115`, `App.tsx:133`); Slice 0 only added timing spans | Slice 1 (mic/cancellation reliability): restart capture after every submitted phrase. Regression test: two consecutive open-mic turns without toggling |
| S2 | No "thinking" state while the spoken phrase is being transcribed and sent | Open mic sets its own `working` phase but never changes the pet's mood during final transcription | No (same code on `main`) | Slice 1: mood → thinking from end-of-speech until the reply starts |
| S3 | "Open Telegram" answered "I cannot open apps directly" | Likely: the phrasing didn't match the strict local `open X` rule (only one of "can you"/"please" is stripped, e.g. "can you please open…"). The turn then went to the model, and **Groq's prompt cannot propose app launches** (known gap from the plan audit). Not yet confirmed: need the exact phrase and backend | No (rule and Groq prompt unchanged) | Slice 1 unified chat path: one launch-intent path for every provider; more tolerant phrasing (EN and FA) |
| S4 | "Open Calculator" answered "not found" | **Not yet diagnosed.** On this Mac the real catalog lists Calculator and a Rust launch request for it succeeds (checked). Need the exact message, OS, typed vs spoken, and where it was asked | Unknown until reproduced | Diagnose first |
| S5 | Voice UI looks broken/ugly | Needs specifics (which screen, screenshot) | Unknown (Slice 0 made no UI layout changes) | After details |
