# Slice 2 — Listening: progress

Scope from `EVOLUTION_PLAN.md` Part D and §3.8–3.9: Silero VAD, Smart Turn (EN), adaptive silence and grace (FA), stable-prefix partials, language toggle, Nemotron (PoC 3), Persian path (PoC 4/11), Settings ranking and benchmark.

| Item                                                                                         | Status                                                 |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Barge-in guard: speech over the character must last 400 ms before it interrupts her (§3.9.3) | done (stage 1)                                         |
| Drop transcripts that are her own voice leaking back through the mic (§3.9.3)                | done (stage 1)                                         |
| Adaptive end-of-turn, opt-in (`quickReply`, transcript-based)                                | done (stage 2); Smart Turn would replace the text test |
| Silero VAD, Smart Turn v3.2                                                                  | needs a download and a runtime choice (approval)       |
| Stable-prefix partials, language toggle (en / fa / auto)                                     | pending                                                |
| Nemotron streaming (PoC 3), BuzzASR Persian (PoC 4), device probe, ranking, benchmark        | pending                                                |

## Stage 1 — barge-in guard and echo drop

- `packages/shared-schemas/turn.ts`: `BARGE_IN_MS` (400) and `echoOfSpoken(transcript, spoken)`, true when at least 80% of a transcript of two or more words is already in the reply being spoken.
- `useOpenMic`:
  - the interrupt fires only after 400 ms of speech over the character (it fired on the first voiced frame before);
  - a burst that ends sooner is discarded, with no transcription and no message;
  - a transcript heard over her speech that matches her reply is dropped and the mic keeps listening.
- `speechContext.ts` keeps a 2000-character tail of her reply for the echo check.
- Tests: `tests/unit/turn.test.mjs` (4); the three open-mic E2E tests still pass.
- Not covered by an automated test: the hook paths (the E2E harness cannot make the character speak). Needs a manual check with speakers, not headphones.

## Stage 2 — opt-in quick replies (owner chose option 1)

Setting "Reply quickly after a finished sentence" (`quickReply`, **off by default**, so the patient 3.5 s behaviour is unchanged).

- With it on (automatic mode, end-of-speech pause above 0.7 s) a pause of 0.7 s ends the recording. The phrase is transcribed and `looksFinished` (`turn.ts`) decides: final punctuation sends it at once; a trailing comma, ellipsis, or connective ("and", "to", "و", "که") holds it.
- A held phrase is kept outside the capture effect as a "carry" and shown as a draft. If speech resumes, its audio is joined to the new audio and the whole utterance is transcribed again; if not, it is sent once the full end-of-speech pause has passed (measured on audio frames, not wall-clock timers).
- Bug found by the first E2E run and fixed: every capture restart recalibrated the noise floor for 0.6 s, so words spoken right after a pause were lost. The VAD now takes `initialFloor`, and the hook passes the floor learned in the previous phrase (this also helps ordinary restarts between turns).
- Tests: `looksFinished` unit test, `quickReply` preference tests, VAD `initialFloor` test, and three E2E tests (finished sentence sent after 1 s of quiet; unfinished sentence joined with the next words; unfinished sentence sent after the full wait).
- Limits: the text decides, so a pause after a complete-sounding sentence can still cut the user off (the Smart Turn model is the fix, and needs a download approval). Persian filler handling is a short word list, not a model. Whisper and Parakeet punctuate differently, so quality varies by engine; not yet measured on real speech.
