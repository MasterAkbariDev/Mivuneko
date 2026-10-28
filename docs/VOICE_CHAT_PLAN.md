# Voice, Luna voice, chat formatting and scroll-resize — implementation plan

Handoff plan for a follow-up agent (Sonnet / Haiku). Work through the phases **in order, one phase per session**.
Each phase lists the files to touch, what to build, and how to check it is done.

## Ground rules

- Repo: `/Users/scalesops/Developer/Mivuneko` (not `~/Downloads/mivuneko` — that copy is stale and not a git repo).
- Branch: `codex/macos-pet-voice` (made from `codex/macos-native-pet`). Stay on it. It carries a lot of uncommitted WIP from the previous branch — do not revert or "clean up" files you were not asked to touch.
- Do not commit or push unless the user asks. Before Phase 1, ask the user whether to commit the existing WIP as a baseline commit first.
- **Ask the user before downloading anything** (models, binaries, npm packages). State name, source URL and size. Verify SHA-256 like `scripts/setup-voice.mjs` already does.
- Machine: Intel i9-8950HK (x86_64), 32 GB RAM, macOS 15. No usable GPU for whisper — `crates/desktop-core/src/lib.rs` passes `-ng` on x86_64 on purpose. Keep that.
- Match the existing code style: compact TS, `#[tauri::command]` functions in `apps/desktop/src-tauri/src/main.rs`, worker logic in `crates/desktop-core/src/lib.rs`, shared pure logic in `packages/shared-schemas/*.ts` with tests in `tests/unit/*.test.mjs`.
- Checks after every phase: `npm test`, `npm run check`, `cargo check -p mivuneko-desktop` (or `cargo check` at the root — confirm the package name in `apps/desktop/src-tauri/Cargo.toml`). Run the app with `npm run mac` (`./script/build_and_run.sh`).

## Current state (verified)

| Area | Where | Problem |
| --- | --- | --- |
| Open-mic capture | `apps/desktop/src/useOpenMic.ts` | Drops every frame until `rms > 0.06` (`if (!started && !voiced) return;`), so the start of the first word is lost: "how are you" becomes "each are you". The threshold is fixed, not adapted to room noise. It records at the AudioContext rate (usually 48 kHz). |
| Push-to-talk | `apps/desktop/src/useVoice.ts` `record()` | Uses MediaRecorder, decodes, downmixes, sends a 48 kHz WAV. No filtering of the result. |
| STT backend | `crates/desktop-core/src/lib.rs` `transcribe()` + `main.rs` `transcribe_audio` | Spawns `whisper-cli` per request (model reload every time, roughly 1 s+). Args: `-l auto -nt -np -otxt`. Model = `.local/models/ggml-base.bin` (multilingual base). Config comes from `~/Library/Application Support/dev.mivuneko.companion/voice.json` or `MIVUNEKO_WHISPER_BIN` / `MIVUNEKO_WHISPER_MODEL`. |
| Junk output | — | `[BLANK_AUDIO]`, `(music)`, `[ Silence ]` and similar are passed through to chat. |
| TTS | `crates/desktop-core/src/lib.rs` `synthesize_for_character()` | macOS `/usr/bin/say` with a per-character system voice (Luna = Samantha). The user can change the style or language (`localVoiceStyle` / `localVoiceLanguage` in `packages/shared-schemas/preferences.ts`, UI in `apps/desktop/src/PetSettings.tsx` ~lines 75–140). |
| Chat render | `apps/desktop/src/InlineChat.tsx` ~line 161, `apps/desktop/src/App.tsx` ~line 471 | `{m.text}` as plain text in a `<p>`. No markdown, no code blocks. |
| Spoken text | `InlineChat.tsx:94`, `App.tsx:289`, `Pet.tsx:214` | `voice.speak(reply.text, …)` reads the entire reply, code included. |
| Reply schema | `packages/shared-schemas/agent.ts` `parseAgentReply`; system prompts in `crates/gemini-client/src/lib.rs:535`, `crates/gemini-client/src/groq.rs:57`, `crates/agent-client/src/lib.rs:105` | JSON `{text, emotion, appQuery}`. The prompts don't ask for markdown, so code comes back flattened into one line. |
| Pet size | `prefs.petScale` (clamped 0.5–1.8 in `preferences.ts`), slider in `CompanionControls.tsx:88`; `Pet.tsx` ~line 355 resizes the window whenever `petScale` changes | No scroll-to-resize. |

---

## Phase 1 — Fix the capture pipeline (no new downloads)

**Goal:** stop clipping words, send clean 16 kHz audio, and drop junk transcripts.

1. New `packages/shared-schemas/vad.ts` (pure, testable):
   - `createVad({ sampleRate })` returns an object with `push(frame: Float32Array) => "silence" | "speech" | "end"`.
   - Adaptive noise floor: an exponential moving average of RMS while in silence. Speech when `rms > max(0.012, noiseFloor * 3)`; end after about 700 ms below `noiseFloor * 2`. Require at least 150 ms of speech before it counts (ignores clicks).
   - Keep a **pre-roll ring buffer of about 400 ms**. When speech starts, the caller prepends it to the utterance.
2. New `packages/shared-schemas/audio.ts` helper `resampleTo16k(samples, fromRate)`. Linear interpolation with a simple low-pass is fine. Use it in **both** `useOpenMic.ts` and `useVoice.ts` before `pcm16Wav(…, 16000)`.
3. `useOpenMic.ts`: replace the `rms(frame) > 0.06` logic with the VAD. Keep the 20 s cap. Use `AudioWorklet` if easy; otherwise keep `ScriptProcessorNode` but use a 2048 buffer.
4. New `packages/shared-schemas/transcript.ts` `cleanTranscript(text): string`:
   - Remove bracketed or parenthesised tags: `[BLANK_AUDIO]`, `[ Silence ]`, `(music)`, `[MUSIC]`, `*laughs*`, `♪…♪`, `>>`.
   - Drop common whisper hallucinations when they are the *whole* result: "Thank you.", "Thanks for watching!", "Thank you for watching.", "Subtitles by …", "you", ".", "Bye.".
   - Collapse whitespace and repeated phrases (the same 3+ word phrase more than twice in a row).
   - Return `""` when nothing meaningful is left. Callers already handle `""` as "No speech was recognized". In open-mic mode, restart quietly instead of showing an error.
5. Apply `cleanTranscript` in `useVoice.ts`, `useOpenMic.ts` (partials and final), and in Rust as a backup is optional.
6. Tests: `tests/unit/transcript.test.mjs` and `tests/unit/vad.test.mjs` (synthetic sine bursts plus noise: checks that pre-roll is included and the end is detected).

**Done when:** tests pass, and in the app "how are you" no longer loses its first word and silence never produces `[BLANK_AUDIO]` in chat.

## Phase 2 — Better model plus a resident whisper-server

**Goal:** keep the model loaded and use an English-tuned model.

1. `script/setup_voice.sh` + `scripts/setup-voice.mjs`:
   - Accept `small.en-q5_1` (default), `base.en`, and `large-v3-turbo-q5_0` (in addition to the existing `base` and `tiny`). They come from the same Hugging Face repo, `ggerganov/whisper.cpp`, and the existing SHA-256 flow already handles them.
   - Also download the Silero VAD model `ggml-silero-v5.1.2.bin` from `ggml-org/whisper-vad`. Check the exact filename on HF first.
   - Build the **`whisper-server`** target too (`-DWHISPER_BUILD_SERVER=ON`, `--target whisper-cli whisper-server`).
   - Write `server`, `model`, `vadModel` and `language` (default `"en"`) into `voice.json`, next to the existing `binary`.
   - Ask the user before running it, because it downloads about 190 MB (small.en) plus the VAD model.
2. Rust: new `crates/desktop-core/src/whisper_server.rs` (or a module in `lib.rs`):
   - On the first transcription, spawn `whisper-server --host 127.0.0.1 --port <free port> -m <model> -l <lang> -bs 5 -t <physical cores, 6>`, plus `-ng` on x86_64. Add the VAD flags **only if `whisper-server --help` lists them**. Verify every flag with `--help`, because names differ between versions.
   - Keep the `Child` in Tauri state. Kill it on app exit (`RunEvent::Exit`) and restart it if it dies.
   - `POST /inference` multipart: `file=<wav>`, `response_format=json`, `temperature=0.0`, `language=en`, and `prompt=<short context>` if supported.
   - Use the HTTP client the workspace already has (check `crates/gemini-client/Cargo.toml` for `reqwest`).
   - Fall back to the existing `whisper-cli` path if the server can't start.
3. `transcribe_audio` command: add an optional `context: Option<String>` argument, capped at 200 chars, for the last assistant message. Pass it as whisper's initial prompt. This helps with names like "Mivuneko" and "Luna". Always include the literal words "Mivuneko, Luna." in the prompt.
4. CLI fallback: change `-l auto` to `-l <voice.json language or "en">`, and add `-bs 5`. If the VAD model is present, add `--vad -vm <path>`.
5. Settings (`PetSettings.tsx`): a small "Speech recognition model" read-out showing which model is configured. It is not a picker. The setup script decides the model.

**Done when:** a 3-second phrase transcribes in about 2 s or less after the first warm-up, and "how are you", "give me a closure example in JS", and "open Safari" come out right 9 or 10 times out of 10.

## Phase 3 — Luna's own fixed voice (character voice packs)

**Goal:** every character pack owns its voice and the user can't change it. Start with Luna. The voice should sound bright, cute, slightly high and gentle, to match her teal, Miku-inspired style.

**Engine:** Kokoro-82M (Apache-2.0) through **sherpa-onnx** (Apache-2.0), using its offline TTS CLI (`sherpa-onnx-offline-tts`) as a subprocess, the same way `say` is called now.

- Shared engine files (Kokoro `model.onnx`, `voices.bin`, `tokens.txt`, `espeak-ng-data`) are downloaded by the setup script into `.local/models/kokoro/`. Ask the user first: roughly 330 MB for `kokoro-en-v0_19`, more for `kokoro-multi-lang-v1_0`. They are not committed to git.
- The character-specific part lives **in the pack** and is committed:
  ```
  assets/characters/luna/voice/voice.json
  ```
  ```json
  {
    "engine": "kokoro",
    "speaker": "af_sky",
    "blend": [{ "speaker": "af_sky", "weight": 0.65 }, { "speaker": "af_nicole", "weight": 0.35 }],
    "speed": 0.94,
    "detuneCents": 160,
    "gain": 1.0
  }
  ```
  - `speed` is sherpa's `--tts-speed`. `detuneCents` is applied at playback in `useVoice.ts` (`node.detune.value`). Detune raises pitch *and* tempo, so the slightly slower `speed` cancels the tempo change. The net result is a higher, cuter pitch at normal pace.
  - `blend` is optional. If it's present, a script (`scripts/build-character-voice.mjs`) mixes those speaker style vectors into a one-speaker `assets/characters/luna/voice/luna.voices.bin`. This file is about 0.5 MB, unique to Luna, and committed.
  - First check the `voices.bin` layout (speaker count × 510 × 256 float32 for kokoro-en-v0_19) against sherpa-onnx docs or source. If the layout can't be confirmed, skip the blend and just use `speaker` with speed and detune.
  - Audition 3–4 candidates and let the user pick (e.g. `af_sky`, `af_bella`, `af_nicole`, a blend). Generate WAVs to the scratchpad and send them to the user.
- Rust `synthesize_for_character(text, character)`:
  - Look up `assets/characters/<id>/voice/voice.json`. Add `assets/characters/*/voice/*` to `tauri.conf.json` `bundle.resources` and resolve it with `app.path().resource_dir()` (in dev, fall back to the repo path).
  - If the file exists and the Kokoro engine is installed, run sherpa-onnx. Otherwise fall back to the current `say` mapping so other characters keep working.
  - Return `{ wav, detuneCents, gain }` instead of raw bytes, or add a separate `character_voice_profile` command. Update `useVoice.speak` to apply detune and gain.
- Remove the user's ability to change the voice:
  - Delete the style and language selects in `PetSettings.tsx`. Show a read-only "Voice: Luna's voice" line with a Preview button.
  - Keep `localVoiceStyle` / `localVoiceLanguage` parsing in `preferences.ts` for backward compatibility but ignore them, and stop passing them from `useVoice.ts`. Update `tests/unit/preferences.test.mjs` if it asserts on them.
- Docs: document the voice pack format in `docs/CHARACTERS.md`. Add the Kokoro and sherpa-onnx licenses to `licenses/README.md`.

**Done when:** Luna speaks with the chosen Kokoro voice, there's no voice option in Settings, other characters still speak through `say`, and `cargo check` and `npm test` pass.

## Phase 4 — Pretty chat messages and spoken-text filtering

1. Reply schema:
   - Add an optional `speech` string (≤ 300 chars) to `AgentReply` in `packages/shared-schemas/index.ts` and `parseAgentReply` in `packages/shared-schemas/agent.ts`.
   - Add `speech` to the Gemini `responseSchema` (`crates/gemini-client/src/lib.rs:535`; not required).
   - Update all three system prompts: *"Format `text` as Markdown. Put code in fenced blocks with a language tag. Also return `speech`: one or two short, natural sentences to say aloud, with no code, URLs or symbols."*
2. New `packages/shared-schemas/speech.ts` `speakable(reply): string`:
   - Use `reply.speech` if it's present.
   - Otherwise take `reply.text` and replace fenced code blocks with nothing (add "I put the code in the chat." once if there was code). Strip inline code backticks, keeping short identifiers. Replace URLs with "the link". Strip markdown symbols (`#`, `*`, `_`, `>`, list bullets, table pipes).
   - Cap the result at about 2 sentences or 240 chars.
   - Use it at all three `speak()` call sites (`InlineChat.tsx:94`, `App.tsx:289`, `Pet.tsx:214` — check what that one passes).
   - Pet caption bubbles should also show the speakable or short form, not raw markdown.
3. New `apps/desktop/src/Markdown.tsx`:
   - Ask the user before adding the dependencies `react-markdown` + `remark-gfm`. **No raw HTML** (react-markdown's default), and links open through the existing safe path, or are plain text if there isn't one.
   - Code blocks: monospace, dark rounded panel, a language label, and a Copy button (`navigator.clipboard.writeText`).
   - Optional syntax highlighting with `highlight.js/lib/core` and a few registered languages (js, ts, python, bash, json, rust), only if the bundle-size increase is acceptable.
   - Use it for assistant messages in `InlineChat.tsx` and `App.tsx`. User messages stay plain text. Add styles in `apps/desktop/src/style.css` using the existing CSS variables.
4. Tests:
   - `tests/unit/speech.test.mjs`: closure-example reply leads to a short sentence with no code; URL stripping; `speech` field preferred.
   - Update `tests/unit/agent.test.mjs` for the `speech` field.

**Done when:** asking "give me a closure example in JS" shows a formatted code block with a copy button, and Luna only says a short sentence.

## Phase 5 — Resize the pet with the scroll wheel

1. `apps/desktop/src/Pet.tsx`, on the `.pet-root` div (~line 412), add `onWheel`:
   - Ignore it if `e.target` is inside a scrollable bubble or chat area.
   - Normalise the delta: `const step = -Math.sign(e.deltaY) * 0.05`. Also handle trackpad pixel deltas by accumulating until |sum| ≥ 40.
   - New scale = `clamp(petScale + step, 0.5, 1.8)`, rounded to 2 decimals.
   - Update a local `scale` state immediately for a smooth CSS `--pet-scale`. Call `updatePreferences({ petScale })` debounced about 150 ms, so the window `setSize` effect (~line 355) doesn't run on every tick.
2. Show a brief "120%" pill near the pet while resizing (fades after 800 ms).
3. The existing slider in `CompanionControls.tsx` stays in sync automatically (same preference).
4. Check the window stays clamped on-screen after growing (the existing `clampPosition` logic runs in that effect).

**Done when:** scrolling over the pet smoothly grows or shrinks it between 50% and 180%, the size persists after a restart, and the settings slider matches.

## Phase 6 — Verification

- `npm test`, `npm run check`, `cargo check`, `npm run build`, and `npm run test:e2e` if Playwright is set up (see `tests/e2e/desktop.spec.ts`).
- Manual pass with the app (`npm run mac`): use the phrases from Phase 2, 10 seconds of silence (nothing should reach chat), the closure request, scroll resize, and Luna's voice preview.
- Update `docs/MACOS_TEST_CHECKLIST.md` with the new checks and `docs/GAPS.md` with anything left out.
- Report results honestly, including failures. Do not commit unless the user asks.

## Suggested model per phase

| Phase | Model | Why |
| --- | --- | --- |
| 1 Capture pipeline | Sonnet | DSP and VAD logic needs care |
| 2 whisper-server | Sonnet | Process lifecycle, flag verification |
| 3 Luna voice | Sonnet | Binary voice format, bundling |
| 4 Chat formatting | Haiku or Sonnet | Mostly UI and string handling |
| 5 Scroll resize | Haiku | Small, contained |
| 6 Verification | Haiku | Running checks, updating docs |
