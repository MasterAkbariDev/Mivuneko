# Voice: listening, speaking and how to change them

Everything here runs on this Mac. No audio is sent anywhere unless you choose the Gemini
voice provider in Settings.

```
you speak ─► mic (AudioWorklet) ─► voice detector ─► 16 kHz WAV ─► speech recognition ─► text ─► chat
                                  (pre-roll, noise floor)          (Parakeet or Whisper)

reply ─► speech line / speakable text ─► pronunciation fixes ─► phrases + pauses ─► Luna's voice
                                                                         (Kokoro, mood-specific) ─► speakers
```

## 1. Install

| Command | Installs | Download |
| --- | --- | --- |
| `npm run setup:voice` | whisper.cpp (`whisper-cli`, `whisper-server`) and a Whisper model | 78–574 MB, your pick |
| `npm run setup:sherpa -- parakeet` | sherpa-onnx runtime + **Parakeet TDT 0.6B v2** (speech recognition) | ~503 MB |
| `npm run setup:sherpa -- kokoro` | sherpa-onnx runtime with TTS + **Kokoro v1.0** + the `luna-tts` worker (Luna's voice) | ~356 MB |
| `npm run setup:sherpa` | both of the above | ~860 MB |

Everything lands in `.local/` (git-ignored). Downloads resume after a dropped connection and
are checked against the SHA-256 digest the publisher lists; a mismatch deletes the file.
`setup:voice -- <model>` accepts `tiny`, `base`, `base.en`, `small.en-q5_1`, `large-v3-turbo-q5_0`.
The Kokoro worker is compiled with `clang` (Xcode Command Line Tools) from `tools/luna-tts/luna-tts.c`.

Restart the app afterwards. Settings → **Speech recognition** shows what is installed.

## 2. Speech recognition (your voice → text)

Settings → Speech recognition → pick an engine, then **Start test / Stop & transcribe** to try it
with your own voice. The time shown runs from Stop until the text appears. Measured on the
developer's Intel i9 Mac (no usable GPU), short phrases:

| Engine | Speed (warm) | Notes |
| --- | --- | --- |
| **Parakeet TDT 0.6B v2** | ~0.2–0.8 s | Best of those tried; English only; stays loaded in a local server |
| Whisper small.en (q5_1) | 2.7 s as a one-shot run | Heard "open a Spotify" as profanity in one test |
| Whisper large-v3-turbo (q5_0) | not benchmarked | Largest Whisper, multilingual |
| Whisper base | fast | Mis-heard "What can you do?" as "What's in it?" |

**Auto** (default) uses Parakeet when installed, otherwise the Whisper model in `voice.json`. If a
chosen engine is missing or fails, the app falls back to Whisper and carries on.
The first phrase after starting the app (or switching engines) includes loading the model, several
seconds; later ones do not. Only one engine stays in memory.

Microphone options (same panel):
- **Microphone sensitivity**: Low / Normal / High. How loud you must be relative to the room.
- **End-of-speech pause**: 1.5–10 seconds of quiet before a phrase is sent, default 3.5 seconds. Older short-pause preferences migrate once to the new default.
- **Send my voice message**: choose automatic pause detection or **Only when I press Done speaking** for unlimited thinking pauses within a two-minute recording. **Done speaking** also works in automatic mode. The old 20-second automatic submission is removed. At two minutes, open mic stops and places the transcript in the composer as a draft instead of sending it mid-sentence.
- **Interrupt Luna by speaking**: keep listening while she talks; stricter threshold so her own voice is not mistaken for you.
- **Use conversation context**: gives Whisper her last reply and the names Mivuneko and Luna (Parakeet ignores it).

### Config files

`voice.json` (written by `setup:voice`, in the app data folder `~/Library/Application Support/dev.mivuneko.companion/` and `.local/`):

| Key | Meaning |
| --- | --- |
| `binary`, `model` | `whisper-cli` and the default Whisper model (absolute paths) |
| `server` | `whisper-server`; defaults to the one next to `whisper-cli` |
| `vadModel` | Silero VAD model used by Whisper |
| `language` | Whisper language, default `en` |
| `sherpa` | root of the Parakeet install; default `<models dir>/../sherpa` |
| `tts` | root of the Kokoro install; default `<models dir>/../tts` |

Environment overrides: `MIVUNEKO_WHISPER_BIN`, `MIVUNEKO_WHISPER_MODEL`, `MIVUNEKO_WHISPER_SERVER`,
`MIVUNEKO_WHISPER_VAD`. To keep every utterance for debugging, launch with
`MIVUNEKO_DEBUG_AUDIO=<folder>`; each recording is saved as a WAV (they contain your voice, so delete them afterwards).

## 3. Luna's voice (text → speech)

Characters → **Voice output → Speech engine** offers local Kokoro character speech,
expressive Gemini speech, or basic macOS system speech. The choice persists across restarts.
Luna's local pack is `assets/characters/luna/voice/voice.json`: one warm, light identity
(65% af_heart, 35% af_sky) at a natural pace, retained across emotions. Each mood preview
changes delivery rather than turning her into a different speaker.

Gemini Luna uses **Leda**, with a consistent adult anime companion direction and natural
intonation. Only reply text is sent for synthesis; microphone transcription stays local
regardless of the output engine. Gemini failure falls back to Kokoro when installed.
Basic system speech is an explicit choice, never a silent replacement for a missing character voice.
Missing local voices produce an actionable installation message.

Use the mood buttons to audition the selected engine. Stop cancels playback, queued phrases
and cloud requests. A synthesis error also releases playback and mouth-animation state.

The private project `.env` accepts quoted multiline `GEMINI_API_KEYS`, `GROQ_API_KEY`, and
`MIVUNEKO_PROXY`. Set `MIVUNEKO_PROXY=http://127.0.0.1:10808` if your provider needs that route,
then restart the app. `.env` remains git-ignored; never commit real credentials.

### What makes it sound alive

- **Stable identity**: Luna uses the same speaker blend for every mood. Other packs may supply their own blends.
- **Delivery**: each mood also sets speed, loudness and pause length.
- **Phrases and pauses**: speech is cut into phrases; the first starts playing while the rest are still being made. Pauses follow punctuation (`.` 480 ms, `?` 520, `…` 700, `,` 200), scaled by mood.
- **No pitch shifting**: an earlier version raised pitch by playing audio faster. It sounded robotic and rushed, so it was removed.

### Pack format

```jsonc
{
  "engine": "kokoro",
  "speed": 0.86,          // base pace; lower = slower (0.5–1.6). Kokoro's own pace is brisk.
  "gain": 1.0,            // base loudness
  "neutral": [            // the everyday voice: a weighted blend of stock voices
    { "speaker": "af_sky", "weight": 0.45 },
    { "speaker": "af_heart", "weight": 0.35 },
    { "speaker": "af_nova", "weight": 0.2 }
  ],
  "moods": {              // optional; any of the eight names below
    "sad": {
      "speed": 0.9,       // multiplies "speed"
      "pause": 1.5,       // multiplies pause lengths
      "gain": 0.9,        // multiplies "gain"
      "blend": [          // voice for this mood (falls back to "neutral" if omitted)
        { "speaker": "af_nicole", "weight": 0.6 },
        { "speaker": "af_kore", "weight": 0.3 },
        { "speaker": "bf_lily", "weight": 0.1 }
      ]
    }
  }
}
```

Mood names: `happy`, `celebrating`, `surprised`, `curious`, `confused`, `concerned`, `sad`, `angry`.
Anything else (including idle) uses `neutral`. Weights are normalised, so only their ratios matter.
A pack with just `"speaker": "af_heart"` (no `neutral`) uses that stock voice for every mood.

### Voices you can blend

Names are the Kokoro v1.0 stock voices. Good starting points for a young, bright character:

`af_sky` airy · `af_heart` warm · `af_nova` bright · `af_bella` energetic · `af_aoede` musical ·
`af_nicole` soft · `af_kore` calm · `af_jessica` dramatic · `af_alloy` neutral · `af_river` · `af_sarah` ·
`bf_lily` young British · `bf_alice` · `bf_emma` · `bf_isabella`. Others (`am_*`, `bm_*`, and non-English
`e*`, `f*`, `h*`, `i*`, `j*`, `p*`, `z*`) exist; the full id list is `crates/desktop-core/src/lib.rs`, module `kokoro`.
These labels are impressions, not guarantees: **listen, then adjust the weights.**

### Changing Luna's voice, step by step

1. Copy `assets/characters/luna/voice/voice.json` to `.local/tts/packs/luna.json`.
   A file there **overrides the built-in pack with no rebuild**.
2. Edit weights, speeds or pauses. Save.
3. Settings → Voice output → press a mood button. The next phrase uses the new pack
   (a changed blend is rebuilt and cached the first time, ~1–2 s).
4. When you like it, copy the file back to `assets/characters/luna/voice/voice.json` so it ships, and rebuild.

Tips: if it is too fast, lower `speed` (0.80–0.88 is a good range). If a mood is too weak, shift its
`blend` further from `neutral` and push its `speed`/`pause`. Lots of weight on one expressive voice
(`af_bella`, `af_jessica`) sounds more emotional; mixing many voices sounds smoother but flatter.

### Giving another character its own voice

1. Create `assets/characters/<id>/voice/voice.json`.
2. Add a line for it in `embedded_pack()` in `apps/desktop/src-tauri/src/main.rs`.
3. Rebuild the app. Characters without a local pack can use Gemini, or the explicitly selected macOS system voice.

### How the blends work (for developers)

`voices.bin` holds 54 voices, each 510 × 256 float32 style vectors. The app averages the vectors you list
(`kokoro::blend_table`) and writes them into spare slots 40–48 of a copy, cached under `.local/tts/voices/`
(slot 40 = neutral, 41–48 = the moods in the order above). The resident `luna-tts` process loads that copy once
and stays running, so each phrase costs only its synthesis time. Real voices are never overwritten.

### Auditioning outside the app

```bash
cd .local/tts && R=$(echo $PWD/x-sherpa-onnx-*/*/) && K=$(echo $PWD/x-kokoro-multi-lang-v1_0/*/)
DYLD_LIBRARY_PATH=${R}lib ${R}bin/sherpa-onnx-offline-tts --kokoro-model=${K}model.onnx --kokoro-voices=${K}voices.bin \
  --kokoro-tokens=${K}tokens.txt --kokoro-lexicon=${K}lexicon-us-en.txt,${K}lexicon-zh.txt \
  --sid=10 --speed=0.86 --num-threads=4 --output-filename=test.wav "Hi, I'm Luna."
```

`--sid` is the id from `kokoro::SPEAKERS` (3 = af_heart, 10 = af_sky).

## 4. What is actually spoken

1. The model is asked to return a short `speech` field next to the formatted `text`. If present, that is spoken (≤ 300 characters).
2. Otherwise the text is shortened to about two sentences: code blocks, URLs, Markdown symbols and emoji are dropped; if there was code she adds "I put the code in the chat."
3. **Pronunciation fixes** (`packages/shared-schemas/pronounce.ts`) rewrite what is left for the engine: `OK` → "okay"
   (the engine spells it "oh kay"), `Mivuneko` → "Mee voo neh ko", `API` → "A P I", `&` → "and", `50%` → "50 percent", `e.g.` → "for example".
   **To fix a word**, add a line to `WORDS` in that file (a pattern and how it should be said) and add a case to `tests/unit/pronounce.test.mjs`.
4. The result is split into phrases with pauses (`packages/shared-schemas/voice-style.ts`, `splitSpeech`).

## 5. Troubleshooting

- **Luna sounds like the system voice**: the Kokoro engine is not installed or failed to start. Run `npm run setup:sherpa -- kokoro`. Settings → Voice output says which voice is active.
- **First sentence is slow**: the first phrase after launch loads the model (6–10 s). Later phrases are about 2 s each while the CPU is throttled, faster when cool.
- **Everything is slow / uneven**: check thermal throttling with `pmset -g therm` (`CPU_Speed_Limit` below 100 means the CPU is being slowed), close heavy apps, and check memory pressure. Measured resident memory: Parakeet server about 1.0 GB, Kokoro worker about 0.6 GB.
- **Words misread**: see "What is actually spoken", item 3.
- **Mic misses you or reacts to noise**: Settings → Microphone sensitivity; the button's level bar shows what the app hears.
- **Wrong engine used**: Settings → Speech recognition shows the selection; "Auto" prefers Parakeet.

## 6. Limits

- Kokoro has no built-in emotion control; mood comes from voice blends, speed, loudness and pauses. It is clearly better than the system voice but is still a synthetic voice.
- Blend recipes and mood labels were chosen by reading about the voices, not by a listening study; expect to tune them.
- Parakeet is English only. Whisper handles other languages.
- Measured numbers above come from one throttled Intel Mac and will differ elsewhere.
