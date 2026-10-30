# Handoff — read this first (Claude, Codex or any agent continuing the work)

Keep this file current: update it in the same commit as any step that changes status, and push every step.

## Where things are (2026-10-30)

| Branch | Purpose | State |
|---|---|---|
| `main` | Released baseline (`a3131b0`) | **Do not merge into it** without the owner's explicit approval |
| `slice-0-foundations` | Slice 0 implementation (pushed) | **Frozen**, smoke test passed 2026-10-30; awaiting merge approval. Don't add commits |
| `plan/tts-direction` | Plan-only update: expressive TTS direction (Chatterbox first) | Docs only; branched from `slice-0-foundations` |
| `slice-1-streaming` | Slice 1 — streaming voice | **In progress** (owner confirmed the Slice 0 smoke test 2026-10-30). Progress: `SLICE1_PROGRESS.md` |

## Documents (all in `docs/plans/`)

| File | What it is |
|---|---|
| `EVOLUTION_PLAN.md` | The approved architecture plan (v3+). Part D lists the slices and their gates; Part C lists the experiments (PoCs) |
| `REVIEW_OPUS.md`, `REVIEW_SLICE0.md` | Independent reviews; their findings are accepted unless the plan says otherwise |
| `SLICE0_PROGRESS.md` | What Slice 0 changed, with measurements, CI results and known gaps. Source of truth for Slice 0 |
| `KNOWN_ISSUES.md` | Pre-existing failing E2E tests and platform issues. Fix them; don't ignore them |
| `IDLE_CPU.md` | Pre-existing ~12% idle CPU: evidence and proposed fixes (not done) |
| `SMOKE_TEST_SLICE0.md` | The owner's manual checklist for Slice 0 |

## Owner rules (do not break)

1. Planning before implementation. Each slice needs explicit approval; **Slice 1 is approved only after the Slice 0 smoke test passes.** Slice 1b and later need fresh approval.
2. Never merge to `main` without explicit approval. Commit every stage and push it.
3. Local TTS speaks **English only**. **Persian speech uses Gemini TTS** until a local Persian voice passes testing.
4. Don't download large models or add a new TTS engine outside the slice that owns it (TTS evaluation = Slice 3 / PoC 5).
5. Approvals are enforced in Rust (one-time CSPRNG tokens, Tauri command ACL). Don't move policy back into the webview. Learned workflows never grant permissions.
6. Hermes is optional and never on the chat path.
7. Report deviations or blockers before changing scope. Distinguish verified facts from assumptions.

## How to build and test locally

- **Toolchain:** project-local Rust in `.local/`:

  ```sh
  export CARGO_HOME=$PWD/.local/cargo RUSTUP_HOME=$PWD/.local/rustup PATH=$PWD/.local/cargo/bin:$PATH
  ```

- **App crate tests** need `TAURI_CONFIG='{"app":{"macOSPrivateApi":false}}' cargo test -p mivuneko-desktop`.
- **Full suite:** `npm test && npm run check && npm run format:check`, `cargo fmt --all -- --check`, `cargo test -p os-broker -p agent-client -p desktop-core -p gemini-client`, clippy (same crates, `-D warnings`), `npm run build`, `npm run test:e2e`.
- **Build side effect:** `tauri build` rewrites the `tauri` features in `apps/desktop/src-tauri/Cargo.toml`. Run `git checkout -- apps/desktop/src-tauri/Cargo.toml`; never commit it.
- **Benchmarks:**
  - `scripts/bench/stream-ab.mjs` — streaming format, live APIs, uses quota;
  - `scripts/bench/kokoro.mjs`;
  - `scripts/bench/spans.mjs` — in-app latency spans;
  - `scripts/bench/idle-probe.mjs`.
- **E2E regression rule:** a test failing in CI counts as a regression only if it is not in `KNOWN_ISSUES.md`.

## Next steps, in order

1. ~~Owner runs `SMOKE_TEST_SLICE0.md`~~ — confirmed 2026-10-30. Still open: smoke-test S4 (Calculator "not found") and S5 (voice UI) need details from the owner (`KNOWN_ISSUES.md`).
2. If it passes: create `slice-1-streaming` from `slice-0-foundations`. Implement Slice 1 per `EVOLUTION_PLAN.md` Part D. Benchmark before and after with `spans.mjs` / `stream-ab.mjs`. Add regression tests, then stop for review.
   - **Slice 1 scope:** streaming text, speech from the first sentence, tagged format B with the reviewer's three rules, Groq emotion fix with a safe fallback, one shared chat path, cancellation/audio reliability.
   - **Not in Slice 1:** any new TTS engine.
3. Slice 3 voice evaluation follows `EVOLUTION_PLAN.md` §3.1–3.3b and PoC 5: Chatterbox Turbo first, then original Chatterbox, Nano, Qwen3-TTS Base, CosyVoice3, Pocket and Kokoro, with the same references and scripts. No model downloads before Slice 3 is approved. Real-time watermarking is an open owner decision settled by PoC 14; PerTh stays on pre-rendered audio, and disclosure and consent are mandatory.
