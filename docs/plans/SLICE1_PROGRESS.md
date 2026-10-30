# Slice 1 — Streaming voice: progress log

| | |
|---|---|
| Branch | `slice-1-streaming` (from `slice-0-foundations` @ `ffaeeb5`, plus the docs-only `plan/tts-direction` commits) |
| Authorization | Owner confirmed the Slice 0 smoke test on 2026-10-30, which approved Slice 1. Slice 1b and later need fresh approval. No merge to `main` |
| Plan | [EVOLUTION_PLAN.md](EVOLUTION_PLAN.md) Part D, Slice 1 (plus the owner's Slice 1 priorities) |

## Scope

Owner priorities, in order:
1. Streaming text responsiveness.
2. Speech playback as soon as suitable text exists.
3. Groq's missing or invalid emotion, with a safe fallback.
4. One chat path.
5. Cancellation, interruption and audio reliability.
6. Preserve permissions, character behaviour and voice.
7. Benchmark before and after.

**Not in Slice 1:** any new TTS engine; the Rust PromptBuilder, persona and Rust turn loop (Slice 1b).

| Item | Status |
|---|---|
| Baseline: in-app streaming-voice benchmark (E2E) | done (stage 0) |
| Tagged reply format (variant B) in Rust for Gemini and Groq; safe emotion fallback; Groq receives the app list; flag `replyFormat` | done (stage 1, Rust side) |
| Frontend tagged streaming parser (holds back `@` lines), early mood from the header | pending |
| Early speech: streaming `speakable`, streaming playback in `useVoice`, no failover after audio starts, stop on app-launch replies; flag `earlySpeech` | pending |
| Mic: restart open mic after each submitted phrase (smoke-test S1); "thinking" during final transcription (S2) | pending |
| Cancellation: separate speech and transcription cancel counters (review D2) | pending |
| One chat path: remove dead `InlineChat.tsx`; more tolerant launch phrasing, EN + FA (smoke-test S3) | pending |
| After-measurements, full suite, CI, review | pending |

## Baseline (before Slice 1)

- **Tests:** identical to Slice 0 final (`SLICE0_PROGRESS.md`).
- **Provider level** (`scripts/bench/stream-ab.mjs`, Slice 0 stage 6), first visible text p50: Gemini 1430 ms, Groq 977 ms (today's JSON format). Groq's emotion was missing or invalid in 45% of replies.
- **In-app** (`tests/e2e/streaming-voice.spec.ts`, mocked provider streaming 3 sentences over 1.6 s, mocked audio):

| Metric | Before |
|---|---|
| Send → first speech synthesis request | **1671 ms** (after the full reply, 1592 ms) |

The test asserts that speech starts ≥ 500 ms before the reply completes. It **fails on the baseline by design** and must pass after Slice 1.

## Stage log

### Stage 1 — Tagged reply format (Rust)

**New `gemini-client::tagged`:**
- `ReplyFormat {Json (default, legacy), Tagged}`.
- `instructions(apps)`: one shared format instruction set for every provider.
- `normalize(raw, apps)`: turns a finished reply into the JSON object the UI already parses (`{text, emotion, appQuery, speech, companionActions}`), so `parseAgentReply` is unchanged. Rules:
  - missing or invalid `@meta` → emotion `idle` (the safe fallback for Groq's invalid-emotion bug);
  - `@actions` is read only from the final line, outside code fences;
  - a malformed trailer drops the actions, not the reply;
  - stray tag lines are never shown;
  - an `appQuery` not in the installed catalog is dropped.

  Both providers already reject any finish except a clean stop, so a truncated reply never produces actions.

**Wiring:**
- **Gemini** (`chat_request`): the tagged format sends no JSON schema, only the shared instructions.
- **Groq** (`system_prompt`): the tagged format also receives the installed-app catalog in Assist/Autonomous mode, so Groq can now propose launches. This fixes the gap behind smoke-test S3.
- **Commands:** `gemini_chat_stream` and `groq_chat` take an optional `format`; absent means `Json`, so older frontends and rollback keep working. Catalog lookup moved to a shared `launch_catalog`, used only in Assist/Autonomous mode.

**Tests:**
- 8 new `tagged` tests: header/body/trailer, idle fallback, catalog-only apps, malformed trailer, fenced trailer, stray tags, empty reply, instructions.
- New golden snapshots `gemini-chat-tagged.json` and `groq-prompts-tagged.json`; the existing JSON snapshots are unchanged.
- The snapshot caught an escaping bug before commit: the example trailer reached the model as `{\"companionActions\"…}`. Fixed.
- gemini-client 33 pass; app crate 11 pass; clippy clean.
