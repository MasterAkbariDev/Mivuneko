# Mivuneko · v0.3.2 developer build

A pet-first desktop companion built with Tauri 2, React and Rust. The character lives on your screen; a discreet menu opens chat **beneath the model**. The utility app contains conversations, activity, permissions and settings. Windows and macOS are native targets; the cloud browser preview is offline.

This revision includes Gemini text chat, microphone transcription and generated speech, concurrent multi-key rotation, HTTP/SOCKS proxy support, an expressive licensed VRM sample, and head-anchored emotion effects. Hermes remains available as a local backend. Native hardware and real provider calls still require your local test pass.

## Windows quick start

Install Node 22.18+, Rust stable MSVC, Visual Studio Build Tools with **Desktop development with C++ / MSVC / Windows SDK**, and WebView2. Restart the terminal after installing tools. If `link.exe` is missing, the C++ toolchain is not installed or discoverable; VS Code alone is insufficient.

```powershell
cd J:\Projects\mivuneko
npm ci
npm run doctor
npm run desktop
```

Use the tray menu → Conversations to open settings. Enter Gemini keys/proxy in Settings → Gemini connection, press Apply, then select a voice mode. Full instructions and environment examples: [GEMINI_SETUP.md](docs/GEMINI_SETUP.md).

## macOS quick start

Requires macOS 12+, Node 22.18+, Rust stable and Xcode Command Line Tools (`xcode-select --install`).

```sh
npm ci
npm run doctor
./script/build_and_run.sh
```

The script builds/opens `Mivuneko.app`. `--verify`, `--logs`, `--telemetry`, `--debug` are supported. For development use `npm run desktop`. Local voice setup is optional: `npm run setup:voice` installs/configures whisper.cpp on a Mac; Gemini voice does not need whisper.cpp. The menu-bar menu provides Show pet, Conversations, Hide pet and Quit. Native signing/notarization is not supplied.

## Pet controls

- Click the small handle or right-click the character for the companion menu.
- Chat, double-click, or focus the character and press Enter opens inline chat.
- Drag the character to move its native window. Escape closes pet panels.
- Pet options selects characters and previews emotions. The Pixiv sample is the fresh-install default; existing preferences stay intact.
- Conversations & settings opens the full utility app. App launches require Allow once in either chat surface.
- Voice is off by default. Push to talk + replies records only on Microphone/Record; Finish recording sends it, or Stop discards/cancels it. Spoken replies mode enables output only.
- Proactive and spoken check-ins require separate opt-ins and obey quiet hours, daily limits and do not disturb. No screen monitoring is enabled.

## Agent and networking

Gemini chat/STT/TTS share one native Rust client. Up to 16 unique keys are allocated round-robin; different concurrent requests can use different keys. Each key has one in-flight lease. Quota errors conservatively pause the whole pool. Quotas are per Google project, not per key; rotation does not increase project quota. Requests are not raced/replayed across keys.

HTTP, HTTPS, SOCKS5 and SOCKS5h proxy URLs support credentials. A configured proxy has no direct fallback. TLS verification stays enabled. Credentials are session-only native memory or environment configuration, never persisted UI settings. See [Gemini setup](docs/GEMINI_SETUP.md) for exact behavior and privacy details.

Hermes is a separate, tool-free local adapter with loopback-only preflight. Explicit user launch commands and Gemini launch proposals feed the constrained broker/approval system. No unrestricted shell, arbitrary executable path, autonomous tool bypass, screenshot reader or file-access agent is implemented.

## Cloud preview and validation

```sh
npm ci
npm run dev
npm test
npm run check
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
cargo test -p os-broker -p agent-client -p desktop-core -p gemini-client --locked
cargo clippy -p os-broker -p agent-client -p desktop-core -p gemini-client --all-targets --locked -- -D warnings
```

`MIVUNEKO_CHROMIUM_PATH` can select a cloud-installed Chromium. Browser tests use synthetic audio and native IPC fixtures; they do not prove real Google inference or OS permissions. CI includes frontend/core checks, macOS Intel/Apple Silicon builds, and a Windows unsigned build. No remote repository or published release was created. Initialize/commit/push to your own GitHub destination after reviewing credentials and license choices.

## Architecture and handoff

- `apps/desktop`: pet and utility windows, React UI and Tauri shell.
- `crates/gemini-client`: Gemini transport, key pool, cooldowns, cancellation and bounded responses.
- `crates/agent-client`: local Hermes client with toolset preflight.
- `crates/os-broker`: installed-app catalog, expiring one-time approvals and native launching.
- `crates/desktop-core`: local voice worker and opt-in SQLite text history.
- `packages`: schemas, character controller, embedded VRM validation and design tokens.
- `blueprint`: original AURA source documents preserved unchanged; current Mivuneko docs record authorized revisions.

Read [architecture](docs/ARCHITECTURE.md), [character sources](docs/CHARACTER_SOURCES.md), [validation](docs/VALIDATION.md), [remaining work](docs/GAPS.md), [Windows checklist](docs/WINDOWS_TEST_CHECKLIST.md), and [Mac checklist](docs/MACOS_TEST_CHECKLIST.md). The bundled VRM's license is separate from software licensing; see [licenses](licenses/README.md). Project-wide distribution license remains an owner decision.

Two-way voice is turn-based, not a continuous Live call. Lip motion uses playback amplitude, not phonemes. Live2D import, authored VRM walk/sit clips, automatic icon/window perching, signed releases and device QA remain release work. This is a developer MVP, not a production-release claim.
