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
| H1 — Rust-side launch policy, CSPRNG one-time approval tokens bound to action / payload / expiry / approval context, window checks, Tauri command ACL | pending |
| Hermes `/v1/toolsets` accepts both response shapes, fails closed otherwise | done (stage 1) |
| D5 — Gemini `propertyOrdering` (text no longer generated last) + golden prompt/schema tests | done (stages 2a, 2b) |
| D13 — Groq `reasoning_effort` | pending (decided by benchmark) |
| D11 — allow pinning Gemini or Groq | pending |
| D3 — Kokoro blend cache garbage collection | pending |
| D4 — native fullscreen detection for check-ins | pending |
| D1 / PoC 2 — Kokoro worker for app-installed users | pending |
| D9 — app crate tests in CI | pending |
| D10 — stale docs | pending |
| Latency spans + local metrics + idle probe | pending |
| PoC 1 / PoC 13 — streaming-format A/B | pending |
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
