# Slice 0 — progress log

| | |
|---|---|
| Branch | `slice-0-foundations` (from `main` @ `a3131b0`) |
| Plan | [EVOLUTION_PLAN.md](EVOLUTION_PLAN.md) v3, Part D "Slice 0" |
| Review | [REVIEW_OPUS.md](REVIEW_OPUS.md) |
| Authorization | Owner approved **Slice 0 only** on 2026-10-29. Later slices need explicit approval |

## Scope (from Part D, plus the owner's final adjustments)

| Item | Status |
|---|---|
| Plan + review committed; baseline recorded | done |
| H1 — Rust-side launch policy, CSPRNG one-time approval tokens bound to action / payload / expiry / approval context, window checks, Tauri command ACL | done (stage 3) |
| Hermes `/v1/toolsets` accepts both response shapes, fails closed otherwise | done (stage 1) |
| D5 — Gemini `propertyOrdering` (text no longer generated last) + golden prompt/schema tests | done (stages 2a, 2b) |
| D13 — Groq `reasoning_effort` | done (stage 6) |
| D11 — allow pinning Gemini or Groq | done (stage 7) |
| D3 — Kokoro blend cache garbage collection | done (stage 4) |
| D4 — native fullscreen detection for check-ins | pending |
| D1 / PoC 2 — Kokoro worker for app-installed users | done (stage 5) — PoC 2 **go** |
| D9 — app crate tests in CI | pending |
| D10 — stale docs | pending |
| Latency spans + local metrics + idle probe | pending |
| PoC 1 / PoC 13 — streaming-format A/B | done (stage 6) — format B wins; PoC 13 no measurable effect |
| Device probe | cut line → Slice 3 (per plan) |

## Environment notes (dev machine: Intel i9-8950HK Mac, macOS 15.4)

- `npm ci` had not been re-run after the last merge (missing `@fontsource-variable/inter`). Re-run from the lockfile; no dependency changes.
- Playwright 1.62.1 needs `chromium_headless_shell-1234`. Installed with `npx playwright install chromium --only-shell`.
- The project-local Rust toolchain lacked `rustfmt` and `clippy`. Added with `rustup component add`.
- `cargo test -p mivuneko-desktop` fails tauri-build's feature check unless run with `TAURI_CONFIG='{"app":{"macOSPrivateApi":false}}'`. This is why the app crate's tests were never in CI (D9).

## Baseline (unmodified `a3131b0`, after the environment fixes)

| Suite | Result |
|---|---|
| Unit (`npm test`) | 104 / 104 pass |
| Type check (`npm run check`) | pass |
| Prettier | pass |
| `cargo fmt --check` | pass |
| `cargo test` (os-broker, agent-client, desktop-core, gemini-client) | 38 pass |
| `cargo test -p mivuneko-desktop` (with `TAURI_CONFIG`) | 8 pass |
| Clippy `-D warnings` (4 crates) | pass |
| Vite build | pass |
| Playwright E2E | **44 pass, 16 fail** (23 min) — pre-existing, listed below |

**Pre-existing E2E failures** on unmodified code (mostly visibility checks and timeouts on this machine). A Slice-0 change counts as a regression only if it fails a test outside this list:

```text
character-packs.spec.ts:70   standalone VRM imports keep two independent character slots
companions.spec.ts:3         walk and run repaint every illustrated character even with a selected expression
companions.spec.ts:71        2D choices and expressions update the desktop pet
companions.spec.ts:114       Luna previews unique expression and movement frames
companions.spec.ts:163       every illustrated character loads distinct nonempty emotions and directional motion artwork
desktop.spec.ts:90           settings and chat activity synchronize to an already open pet
desktop.spec.ts:260          synthetic microphone recording converts to WAV and routes transcript into consent
desktop.spec.ts:327          Gemini configuration stays private while speech uses local commands
desktop.spec.ts:666          spoken approval resolves the pending launch
settings-redesign.spec.ts:154  editable shortcuts persist and navigate without firing inside capture fields
settings-redesign.spec.ts:175  bundled and imported VRM models render and selection reaches the desktop pet
settings-redesign.spec.ts:252  Parakeet installs with one click and a visible progress line persists across sections
settings-redesign.spec.ts:643  pet hover dock opens a compact composer and edit mode starts locked
settings-redesign.spec.ts:714  microphone dot is quiet, active-only, stable across animation and optional
settings-redesign.spec.ts:803  zoom grows beyond the display while the dock and its actions stay visible
settings-redesign.spec.ts:1058 wake and movement clear sleeping overrides and the name placeholder follows the selected character
```

## Stage log

Entries are added as each stage is committed.

### Stage 1 — Hermes toolsets shape
- `validate_toolsets` accepts the documented bare array **and** the `{"object":"list","data":[…]}` object that the v0.22.5 code returns. Anything else still fails closed.
- New test `toolsets_accept_the_list_object_and_still_fail_closed`. agent-client: 4/4 pass; fmt and clippy clean.
- A live Hermes install was not tested; this only fixes the shape mismatch found in the source.

### Stage 2a — Golden prompt and schema snapshots (no behaviour change)
- Extracted `chat_request` (Gemini), `system_prompt` (Groq) and `system_prompt` (Hermes) as functions. The bytes sent are unchanged.
- Golden tests snapshot every mode's system prompt and Gemini `generationConfig` into `crates/*/golden/*.json`. A prompt change now fails the test until the snapshot is re-reviewed (`UPDATE_GOLDEN=1`). This is the safety net for the PromptBuilder in Slice 1b.
- gemini-client 23 pass, agent-client 5 pass; fmt and clippy clean.

### Stage 2b — D5: Gemini key order
- Without serde_json's `preserve_order`, the schema went out alphabetically (`appQuery, companionActions, emotion, speech, text`). Gemini follows schema order, so the visible `text` was generated last.
- The schema now sets `propertyOrdering: [emotion, text, speech, appQuery, companionActions]`.
- New wire test `chat_schema_generates_emotion_then_text_first`. The golden diff contains only the new ordering lines.
- The `speech` field is kept; its removal belongs to the Slice-1 streaming-format change.
- gemini-client 24 pass; clippy clean. The measured effect is in the PoC 1/13 benchmark entry.

### Stage 3 — H1: approvals and policy enforced in Rust
- **Approval tokens** (`os-broker`):
  - 256 bits from the OS CSPRNG (`getrandom`, already in the lockfile), sent to the UI as 64 hex characters. They replace UUIDs.
  - Bound to the capability (`app.launch`), the SHA-256 of the exact target (app id + path), a 60 s expiry, and the approval context (the requesting window label).
  - Validation: constant-time compare, then the token is **removed before anything else** (one-time). Then expiry, context (a wrong context burns the token), policy, and re-discovery with a payload-hash match (a changed target is refused).
- **Launch policy in Rust:**
  - `LaunchPolicy {enabled, mode: ask|auto|deny}` lives in the broker and persists to `app_config_dir/launch-policy.json`.
  - Enforced on request (disabled → refused) and on resolve (deny/disabled → denied even if a webview sends `allow`).
  - Changing it revokes pending tokens.
  - `request_launch` returns the deciding policy, so the UI no longer decides from localStorage.
- **Main-window only:** `list_apps`, `request_launch`, `resolve_launch`, `revoke`, `get/set_launch_policy`, `load_history`, `clear_history` (`save_history` already was).
- **Tauri command ACL:**
  - `build.rs` declares all 45 commands in the app manifest. Tauri now denies any command a window's capability doesn't list.
  - `capabilities/main.json` allows all of them; `capabilities/pet.json` allows only the 13 the pet uses (state, placement, voice playback).
  - The retired `pet-monitor-*` windows get no capability.
  - `tests/unit/acl.test.mjs` keeps the handler list, manifest and capabilities in sync. It also fails if the pet's import graph reaches a command it isn't allowed, or if any sensitive command is allowed for the pet.
- **Frontend:** the settings screen mirrors the Rust policy. First run migrates the stored preference into Rust; afterwards Rust wins. The approval flow uses the policy returned with each request.
- **Approval channel:** voice approval of app launches stays allowed (`local-reversible`). No send-capable capability exists yet; the click-only rule applies when one is added (Slice 6).
- **Deviation from the plan (mechanism only):** no `rustPolicy` feature flag. An "off" switch for enforcement would itself be a bypass, so rollback is `git revert` of this stage. The stored preference stays in localStorage, so reverting loses nothing.
- **Tests:**
  - os-broker 13 pass (new: token size/uniqueness/single use, wrong context burns the token, changed target refused, policy enforced, policy change revokes, expiry, serialization);
  - unit 108 pass (+4 ACL);
  - the 7 approval/launch E2E tests pass, including 2 from the baseline failure list (flaky on full runs);
  - type check passes.
- Not covered by automated tests: the real WebView's ACL denial at runtime. Tauri's build validated every permission identifier; a manual smoke run is in the final checks.

### Stage 4 — D3: Kokoro blend cache cleanup
- Writing a new `{character}-{hash}.bin` blend (a full 28.2 MB `voices.bin` copy) now deletes that character's older blends, so each character keeps at most one file.
- The prefix guard requires an alphanumeric id; other characters' files are never touched.
- Delete errors (a file still open by the worker on Windows) are ignored; the next write retries.
- The test was extended: the superseded file is gone, the current one exists, and another character's blend survives. App crate: 8 pass.
- Deferred to the voice slices: blending in memory inside the worker, so nothing is written at all.

### Stage 5 — D1 / PoC 2: resident Kokoro worker for every user
- **Problem:** the in-app installer never builds `luna-tts`, so app-installed users ran `sherpa-onnx-offline-tts` per phrase, reloading the 321 MB model each time.
- **Fix (mechanism differs from the plan, scope unchanged):**
  - The worker is compiled **into the app** instead of shipped as a separately signed `externalBin`.
  - `build.rs` compiles `tools/luna-tts/luna-tts.c` with `LUNA_TTS_EMBEDDED`; in that mode it loads the installed sherpa-onnx C API library at runtime (`dlopen` / `LoadLibraryExW`).
  - The app re-runs itself as `<app> --luna-tts <library> <model> <threads> [voices]`, dispatched at the top of `main()` before Tauri starts.
  - No compiler on user machines, no extra binary to sign (it inherits the app's signature later), no per-target sidecar files for dev builds.
  - The pinned v2.0.1 `c-api.h` is vendored (Apache-2.0, attribution in `tools/luna-tts/include/README.md`).
  - The standalone developer build (`scripts/build-luna-tts.sh`) is unchanged and still preferred when present. The CLI path remains the last fallback.
- **Measured on the dev Mac** (Intel i9, 5 phrases, warm):

| Path | Per phrase | Cold load |
|---|---|---|
| Per-phrase CLI (what app installs got) | **7.4–16.3 s** | — (every phrase) |
| Standalone `luna-tts` (dev only) | 2.0–3.1 s | 5.6–7.5 s |
| **Embedded worker (new, all users)** | **2.0–3.2 s** | 6.6–9.5 s |

  Standalone vs embedded is within noise (back-to-back runs); a streaming benchmark ran concurrently.
- A bad library path reports `ERR cannot load the sherpa-onnx library`, and the Rust side treats it as a failed load.
- **Not verified here:**
  - the Windows build of the C file (`windows.h` path) and the Windows DLL name `sherpa-onnx-c-api.dll` — needs CI or a Windows machine;
  - an end-to-end run from the in-app installer layout (`speech/kokoro/runtime/...`). Path discovery reuses the existing `search()` used for the CLI.
- **Found, not fixed (voice slices):**
  - sherpa-onnx v2.0.1 Kokoro with the lexicon config logs `OOV word skipped: 'apps'` — words missing from the lexicon are silently dropped. This is a likely cause of "incorrect pronunciation" reports.
  - A character switch still restarts the worker (new voices table).
- Tests: desktop-core 7, app crate 8, CI-equivalent clippy and fmt clean.

### Stage 6 — PoC 1 / PoC 13 streaming-format A/B, and D13
**Method** (`scripts/bench/stream-ab.mjs`, 2026-10-30, dev Mac, home network, real APIs with the project `.env` keys):
- Prompts: 20 (7 chat, 4 code/Markdown, 4 Persian, 1 mixed, 4 companion actions).
- 11 configurations × 2 runs, interleaved; 880 requests, 1 dropped connection.
- Models: Gemini `gemini-3.1-flash-lite`; Groq `openai/gpt-oss-120b`.
- Variants:
  - **A0** — today's request (alphabetical schema / prompt-only JSON);
  - **A1** — ordered JSON (D5);
  - **B** — `@meta emotion=…` header + plain Markdown + optional final `@actions {…}` line;
  - **C** — header + body + native function call;
  - `-low` — Groq `reasoning_effort: low`;
  - `-minthink` — Gemini `thinkingLevel: minimal`.
- Times in ms from request start. "First char" is when a UI could show the first visible character; "first sentence" is when the first complete sentence is available to TTS.

| cell | n | err | first byte p50 | first char p50/p90 | first sentence p50/p90 | end p50 | malformed | emotion ok | actions ok (action prompts) | action latency p50 | trailer leak |
|---|---|---|---|---|---|---|---|---|---|---|---|
| gemini-A0 | 40 | 0 | 1430 | 1430 / 2000 | 1469 / 2379 | 1686 | 0% | 100% | 100% | 1798 | 0 |
| gemini-A1 | 40 | 0 | 1356 | 1356 / 3557 | 1356 / 3557 | 1661 | 0% | 100% | 100% | 1280 | 0 |
| gemini-B | 40 | 1 | 874 | 941 / 1812 | 1006 / 1904 | 1242 | 0% | 100% | 100% | 1120 | 0 |
| gemini-C | 40 | 0 | 998 | 1035 / 2813 | 1074 / 2813 | 1271 | 0% | 100% | 13% | 786 | 0 |
| gemini-B-minthink | 40 | 0 | 834 | 908 / 2972 | 959 / 3514 | 1248 | 0% | 100% | 100% | 1047 | 0 |
| groq-A0 | 40 | 0 | 611 | 977 / 1316 | 1014 / 1388 | 1061 | 0% | 55% | 100% | 1180 | 0 |
| groq-A1 | 40 | 0 | 359 | 885 / 1173 | 947 / 1191 | 1071 | 0% | 40% | 100% | 918 | 0 |
| groq-B | 40 | 0 | 602 | 867 / 1197 | 940 / 1219 | 1063 | 0% | 100% | 100% | 1198 | 0 |
| groq-C | 40 | 0 | 370 | 578 / 937 | 759 / 973 | 1058 | 28% | 73% | 100% | 1093 | 0 |
| groq-A0-low | 40 | 0 | 602 | 717 / 852 | 740 / 850 | 839 | 0% | 35% | 100% | 840 | 0 |
| groq-B-low | 40 | 0 | 372 | 501 / 713 | 525 / 771 | 743 | 0% | 90% | 100% | 625 | 0 |

First visible character, p50 ms, by prompt kind:

| kind | gemini-A0 | gemini-A1 | gemini-B | groq-A0 | groq-A0-low | groq-B | groq-B-low |
|---|---|---|---|---|---|---|---|
| chat | 1322 | 1422 | 1081 | 1014 | 749 | 932 | 639 |
| code | 1927 | 1787 | 887 | 919 | 682 | 721 | 633 |
| fa | 1222 | 1519 | 1112 | 991 | 694 | 794 | 437 |
| mixed | 2379 | 1204 | 5851 | 1012 | 767 | 920 | 438 |
| action | 1446 | 1148 | 927 | 1063 | 720 | 1114 | 501 |

**Results:**
- **PoC 1 → format B.**
  - Fastest on both providers: Gemini first char 1430 → 941 ms (−34%); Groq 977 → 501 ms (−49%) with low reasoning.
  - 0% malformed, 0 trailer leaks, 100% valid actions on action prompts. Consistent across chat, code and Persian.
  - **C (function calls) is rejected:** Gemini emitted valid actions on only 13% of action prompts; Groq replies were malformed in 28% of runs.
- **Found:** today's Groq path (A0) returns a missing or invalid emotion in **45%** of replies, because JSON is prompt-only. B gives 90–100%.
- **PoC 13 → no measurable latency effect.** Ordered JSON (A1) p50 is 1356 vs 1430 ms, within noise: short Gemini replies arrive in one or two large chunks. The D5 ordering is kept (correct, harmless). The latency win comes from the format change.
- **Gemini minimal thinking:** no gain (908 vs 941 ms p50, worse p90). Not adopted.
- **D13 applied:** Groq requests to `openai/gpt-oss*` send `reasoning_effort: "low"`. In today's format that is 977 → 717 ms to first char and 1061 → 839 ms to finish. Other models omit the parameter. gemini-client 25 pass.
- **Not measured here:** time to first audio. It needs the Slice-1 streaming speech; the spans for it ship in a later Slice-0 stage.
- **Slice 1 input:** adopt variant B with the reviewer's three rules (`@actions` only as the last line outside fences after a clean finish; hold back `@`-lines until newline; truncated finish → no actions), plus Groq low reasoning.

### Stage 7 — D11: pin a single provider
- New backend choices **Gemini only** and **Groq only** (`gemini-only` / `groq-only`): every turn uses that provider with no fallback, for consistent timing and style. This also lets latency be measured per provider in the app.
- The legacy stored values `gemini` / `groq` still migrate to Automatic, as before, so no existing user is silently pinned. That is why the new values are distinct.
- `agentFor` maps the pinned values to the existing provider paths. Settings and status labels are updated.
- Also: `capabilities/*.json` (stage 3) reformatted with Prettier; CI checks it.
- Tests: unit 108 (preference migration and pinning cases added to `gemini-character.test.mjs`); type check passes; backend and routing E2E 4/4 pass.
- Not changed here: Automatic still alternates per turn. Choosing by rolling p50 is review item M1, planned for Slice 1b.
