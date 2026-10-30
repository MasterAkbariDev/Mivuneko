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
| Frontend tagged streaming parser (holds back `@` lines), early mood from the header | done (stage 2) |
| Early speech: streaming `speakable`, streaming playback in `useVoice`, no failover after audio starts, stop on app-launch replies; flag `earlySpeech` | done (stage 3) |
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

### Stage 2 — Tagged streaming in the frontend, early mood, rollback switches

**Parser** — `packages/shared-schemas/tagged.ts` `taggedProgress(raw)` reveals only the body while streaming:
- the header and any line starting with `@` are held until complete, then dropped;
- lines inside code fences are kept as text;
- a missing or invalid header passes the text through with no emotion.

**Agent:**
- Requests `format: "tagged"` from Gemini/Groq.
- Passes `{emotion}` with each progress update, and the pet shows the header's emotion before the first word.
- Automatic fallback to the other provider is now allowed only while `canRetry()` holds (used by stage 3 once speech starts).

**Safety:** `parseAgentReply` now drops an invalid action plan instead of throwing, so a bad action no longer discards the whole reply (review M2).

**Rollback switches** (Settings → Connections, both on by default):
- "Stream replies as plain text": `replyFormat` = `tagged` | `json`;
- "Speak each sentence as it arrives": `earlySpeech`, used in stage 3.

**Live check** (`scripts/bench/tagged-live.mjs`; the shipped prompts from the golden files; Assist mode; catalog `["Calculator"]`; 2 runs × 8 prompts × 2 providers = 32 requests):

| | Gemini | Groq |
|---|---|---|
| Header present | 16/16 | 16/16 |
| Valid emotion | 16/16 | **16/16** (was 55% in the Slice 0 benchmark) |
| Tag leaked into visible text | 0 | 0 |
| Movement actions in the trailer (action prompts) | 4/4 | 4/4 |
| `appQuery` = Calculator (launch prompts, incl. "Can you please open the calculator for me?") | 4/4 | **4/4** (Groq could not propose launches before) |

**Tests:**
- Unit 115 (+7 `tagged.test.mjs`, including character-by-character "never reveals a tag" and "invalid actions dropped"); type check passes.
- `desktop.spec.ts`: 25/27 pass. Failures across two runs were `:90`, `:260`, `:327` (all on the baseline list) and `:178` (history), which passed 4/4 alone, so it is load-dependent and noted in `KNOWN_ISSUES.md`.

### Stage 3 — Early speech

**`speakableStream()`** (`packages/shared-schemas/speech.ts`):
- Returns newly speakable text as a reply streams. It cuts only after a finished sentence or line, never inside an open code fence, never inside a table (narrated whole), and never after a bare list number ("1.").
- It recognises text already spoken even when leading whitespace differs, so the final, authoritative reply text continues the stream without repeating it. Stream events and the command result arrive on separate channels, so the last streamed fragment can lag.

**`useVoice`:**
- Speech now reads from a segment queue that is filled as text arrives and can be replayed from the start (used when Gemini falls back to Kokoro).
- `speak(text)` = push everything, then end, so behaviour is unchanged. The new `startSpeech()` returns `{push, end, started, done}`.
- **Kokoro:** synthesizes the next phrase as soon as its text exists; playback waits only when it catches up with the stream.
- **Gemini:** each request speaks everything that arrived while the previous one ran, so a reply costs a few cloud calls, not one per sentence.
- `stop()` ends open streams, so nothing waits forever.

**`App.send`:**
- With early speech on, each speakable segment is pushed as it streams, in the emotion from the tagged header.
- Provider fallback is disabled once any speech is queued (stricter than review M2's "once audio started").
- The final reply text flushes the rest. If the reply is an app-launch proposal, the voice stops (the approval card takes over). A provider error ends the stream, so already-queued speech finishes.
- The old full-reply path runs when early speech is off.

**Measured** (`tests/e2e/streaming-voice.spec.ts`; mock streams 3 sentences, deltas at 150/700/1250 ms, reply at ~1.6 s):

| | Before | After |
|---|---|---|
| Send → first speech synthesis | 1671 ms (after the reply, 1592 ms) | **749–1119 ms** (3 runs), always ~800 ms **before** the reply completes |

The first sentence of this mock ends exactly at a delta boundary ("…see you." with nothing after), so it is released when the next delta arrives. A sentence end can't be told from "3." or "you.." until the next character. Real streams send small tokens every few tens of ms, so in practice the wait is one token.

**Tests:**
- Unit 120 (+5 `speakable-stream.test.mjs`: streamed speech equals whole-reply speech at every chunk size 1–50 on five Markdown samples; never speaks code, table pipes or bare list numbers; first sentence released early; open code held; the final flush doesn't repeat).
- E2E `streaming-voice.spec.ts` 3/3:
  - early speech;
  - rollback with early speech off waits for the full reply;
  - rollback to the legacy JSON format still streams into early speech.
- Full E2E 48 pass / 15 fail (22 min under load). Every failure is on the known list except `desktop.spec.ts:749` ×2 (open mic; pass alone, load-dependent) and `character-packs.spec.ts:23`, which fails on Slice 0 too (known issue K10, pre-existing).
