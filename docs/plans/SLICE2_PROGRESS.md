# Slice 2 — Listening: progress

Scope from `EVOLUTION_PLAN.md` Part D and §3.8–3.9: Silero VAD, Smart Turn (EN), adaptive silence and grace (FA), stable-prefix partials, language toggle, Nemotron (PoC 3), Persian path (PoC 4/11), Settings ranking and benchmark.

| Item                                                                                          | Status                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Barge-in guard: speech over the character must last 400 ms before it interrupts her (§3.9.3)  | done (stage 1)                                   |
| Drop transcripts that are her own voice leaking back through the mic (§3.9.3)                 | done (stage 1)                                   |
| Adaptive end-of-turn (quick submit when the sentence is finished, longer wait when it is not) | **needs an owner decision**, see below           |
| Silero VAD, Smart Turn v3.2                                                                   | needs a download and a runtime choice (approval) |
| Stable-prefix partials, language toggle (en / fa / auto)                                      | pending                                          |
| Nemotron streaming (PoC 3), BuzzASR Persian (PoC 4), device probe, ranking, benchmark         | pending                                          |

## Stage 1 — barge-in guard and echo drop

- `packages/shared-schemas/turn.ts`: `BARGE_IN_MS` (400) and `echoOfSpoken(transcript, spoken)`, true when at least 80% of a transcript of two or more words is already in the reply being spoken.
- `useOpenMic`:
  - the interrupt fires only after 400 ms of speech over the character (it fired on the first voiced frame before);
  - a burst that ends sooner is discarded, with no transcription and no message;
  - a transcript heard over her speech that matches her reply is dropped and the mic keeps listening.
- `speechContext.ts` keeps a 2000-character tail of her reply for the echo check.
- Tests: `tests/unit/turn.test.mjs` (4); the three open-mic E2E tests still pass.
- Not covered by an automated test: the hook paths (the E2E harness cannot make the character speak). Needs a manual check with speakers, not headphones.

## Decision needed: how long to wait before replying

The default silence before a message is sent is **3500 ms** (`endPauseMs`, set when turn-taking was made patient). Every reply therefore starts about 3.5 s after the user stops, plus transcription. The plan's fix is to submit after about 700 ms when the sentence is finished and keep waiting only when it is not.

Without the Smart Turn model the "finished" test has to come from the transcript (final punctuation, trailing words like "and" or "to", and in Persian trailing connectives). That is right most of the time but will sometimes cut off a user who pauses after a complete-looking sentence, which is what the 3.5 s default was meant to prevent.

Options:

1. Add a setting "Reply quickly after a finished sentence", **off by default**, using the transcript test now; switch to Smart Turn when it is installed.
2. Download Smart Turn v3.2 (8 MB) and the Silero VAD first, then make adaptive the default.
3. Keep 3.5 s.
