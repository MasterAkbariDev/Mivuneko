# Gemini chat and two-way voice · v0.3

Install Node 22.18+ and Rust stable first. On Windows, install **Visual Studio Build Tools → Desktop development with C++**, including MSVC and Windows SDK. Rust alone does not supply `link.exe`. Restart your terminal after installation. VS Code is not the C++ toolchain. WebView2 Runtime is also required. On macOS install Xcode command line tools. Then run:

```sh
npm ci
npm run desktop
```

At rest the pet has one small menu handle, no frame or button row. Drag the character to move the native window. Click the handle (or right-click the character), then **Chat** to type beneath the pet. Double-click the character, or focus it and press Enter, also opens inline Chat. **Conversations & settings** opens the utility app. Escape closes the pet menus/input. Menu bar / tray → Show pet recovers click-through mode.

## Configure in the app

Open Conversations & settings → Settings → Google Gemini. Enter one line per key:

```text
YOUR_FIRST_API_KEY
YOUR_SECOND_API_KEY
YOUR_THIRD_API_KEY
```

Paste only keys, one per line: no project labels, quotes or commas. Blank lines and duplicate keys are ignored. Up to 16 unique keys are supported. Press **Apply Gemini configuration**; this selects Gemini chat and voice. Credentials and proxy URL are held in native memory only, and input fields are cleared after applying. Restarting requires reapplying or environment configuration. Clear keys cancels active provider requests and removes native configuration. No secure heap-erasure guarantee is made.

Model and voice names are editable because availability changes by account. Defaults are `gemini-3.8-flash`, `gemini-3.8-flash-tts`, voice `Kore`, from the documentation checked during this revision. If your project does not offer these, enter supported generateContent chat/audio and TTS model names. A 404 means the configured model is unavailable; a 403 may mean missing access. No account credentials are supplied with this project.

Select **Voice → Push to talk + replies** to speak and hear replies. Open inline Chat, press **Microphone**, speak, then **Finish recording**. Recording auto-stops after 29 seconds. Gemini transcribes the recording, sends the transcript through the same agent/approval flow as typing, and generates speech for normal replies. Spoken replies mode enables output without recording. Text only disables both. Speech volume is adjustable. Stop cancels pending Gemini HTTP requests, playback and recordings, releases the microphone, revokes pending approvals and suppresses stale results. A request already received by Google may still be billed or processed.

Chat text and bounded recent context go to Google. In Assist/Autonomous, installed app names are sent to support action proposals. Microphone WAV is uploaded only after you explicitly record with Gemini voice selected; raw recordings are not saved. Local whisper.cpp + macOS speech remains an alternative voice provider. Browser preview remains offline and never sends keys/audio to Google.

## Rotation and concurrency

The pool uses round-robin selection among idle, enabled keys. Each key has at most one request in flight. Different requests can run simultaneously on different keys; the same prompt is never raced across keys. If every key is busy/cooling down, the UI reports that state. There is no unbounded request queue.

Google quotas are **per project, not per key**. Rotation does not multiply quota. Because plain keys do not expose their project, HTTP 429 and 503 conservatively pause the entire key pool (numeric Retry-After honored, otherwise 60 seconds, bounded to 24 hours). Authentication failures disable the selected key until configuration is replaced. Requests are not automatically replayed on another key, avoiding retry storms and duplicate billing. Model-specific quotas may be stricter than this conservative project cooldown.

## HTTP and SOCKS proxy

Supported examples:

```text
http://127.0.0.1:8080
https://proxy.example.com:8443
socks5://127.0.0.1:1080
socks5h://127.0.0.1:1080
socks5h://username:password@127.0.0.1:1080
```

Use socks5h for proxy-side DNS; socks5 resolves hostnames locally. Percent-encode reserved characters in username/password. All Gemini chat, transcription and TTS requests share this client. A failed configured proxy never falls back to a direct request. HTTPS certificate verification remains enabled and redirects are disabled. Only Google's fixed HTTPS generateContent endpoint is used in production; fixture endpoint overrides are private test construction. Empty proxy means direct HTTPS. System proxy environment variables are intentionally not inherited by this client. The proxy setting does not affect the local Hermes backend, whisper setup downloads or general system traffic.

## Environment configuration

Set these before launching the desktop process. Values are examples, not real secrets. Do not commit credentials.

PowerShell:

```powershell
$env:MIVUNEKO_GEMINI_KEYS = '["YOUR_API_KEY","YOUR_SECOND_API_KEY"]'
$env:MIVUNEKO_PROXY = 'socks5h://127.0.0.1:1080'
$env:MIVUNEKO_GEMINI_MODEL = 'gemini-3.8-flash'
$env:MIVUNEKO_GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts'
$env:MIVUNEKO_GEMINI_VOICE = 'Kore'
npm run desktop
```

macOS/Linux shell:

```sh
export MIVUNEKO_GEMINI_KEYS='["YOUR_API_KEY","YOUR_SECOND_API_KEY"]'
export MIVUNEKO_PROXY='socks5h://127.0.0.1:1080'
npm run desktop
```

Environment credentials are available to the process and its development tooling; prefer session-only Settings on shared machines. Native app launching strips Mivuneko provider/proxy environment values from child processes. macOS launches through Launch Services, whose environment behavior is OS-managed. Persisted OS keychain storage for Gemini is remaining release work.

## Architecture and limits

`crates/gemini-client` owns configuration, HTTP TLS/SOCKS transport, native key leases, project cooldowns, cancellation and response bounds. Tauri commands expose typed operations, not arbitrary URLs or shells. React retains no provider credentials after Apply. Hermes stays available as a separate local adapter. Gemini outputs closed JSON emotion cues and optionally an exact installed-app launch proposal. Neither model output nor a transcript launches software without approval.

Audio is turn-based: record → transcribe → reason → synthesize → play. This revision does not implement a Gemini Live websocket call, continuous listening, wake words, streaming TTS, full-duplex interruption or phoneme alignment. Lip motion follows actual playback amplitude and retains the reply's expression during speech. Head effects are independent of the rig, anchored to its humanoid head bone. Missing expression morphs cannot be invented by the renderer.

Official references: https://ai.google.dev/api/generate-content · https://ai.google.dev/gemini-api/docs/audio · https://ai.google.dev/gemini-api/docs/speech-generation · https://ai.google.dev/gemini-api/docs/rate-limits · https://v2.tauri.app/start/prerequisites/

Gemini 3.8-style TTS uses speechMetadata for delivery style and sends only the transcript as text. Complete WAV responses pass through without an extra header; older PCM16/24k responses are wrapped once. Legacy Gemini 2.x/3.1 TTS uses its prompt-style direction format.

## Native/UI version mismatch
If Apply reports `expected struct Credential`, an older native backend is running with newer frontend files. v0.3.2 keeps the internal request compatible with older shells; users still paste plain keys only. Replace files from the entire updated archive, quit Mivuneko from the tray (closing the utility window only hides it), stop the dev terminal, then run `npm ci` and `npm run desktop`. If needed run `cargo clean -p gemini-client -p mivuneko-desktop` before restarting to force a native rebuild. This deserialization error occurs before contacting Google, so it does not establish whether the key is valid.
