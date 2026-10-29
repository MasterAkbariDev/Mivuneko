# Remaining release work · v0.3

## Implemented
Gemini chat, transcription and TTS; native multi-key concurrent round-robin leases, project cooldowns and cancellation; HTTP/HTTPS/SOCKS5/SOCKS5h proxy routing without direct fallback; session-only credential configuration and environment setup. Four 2D companions, shared conversation/activity, constrained one-time launch approvals, expression cues, playback-amplitude mouth movement and opt-in spoken check-ins. Local Hermes, Whisper and macOS speech remain available.

## Local test gates
No real Gemini credentials were supplied. Google model availability, provider inference, latency, multilingual transcription and generated voice quality have not been verified against a live account. Rust fixtures exercise real local HTTP/SOCKS handshakes and the chat/STT/TTS wire contracts; browser tests exercise synthetic microphone/IPC/audio data. They do not prove physical device permissions or native playback.

An Intel macOS app bundle has been built and its pet and Conversations windows opened. Local Whisper transcribed a public recording and macOS speech generated audible waveform data; browser fixtures exercised synthetic recording. Physical microphone permissions and real speaker playback, live Gemini calls, additional displays and Windows hardware still need the local platform checklists. CI is prepared but has not been verified remotely; the app bundle is unsigned.

## Still open
- Continuous Gemini Live calls, streaming response/speech chunks, full-duplex voice, barge-in and wake words. Current voice is explicitly recorded, turn-based and capped at 29 seconds.
- Authored character animation and per-character voice/personality packs. The 2D characters use individual emotion cells and directional walk/run cycles; Live2D rendering/import is not implemented. The Miku design is unofficial fan art and requires a rights review for distribution.
- Phoneme/viseme timing, detailed voice quality benchmarks, additional local TTS providers and local Windows speech output. Gemini speech works through portable native network code, pending device/live-account testing.
- Persistent Gemini keychain/credential-manager storage, stronger native custom-command ACL separation, authoritative audit logs, approval handling across concurrent windows, trust/signature checks and provider error/latency metrics. Current secrets are native session memory or environment, not guaranteed heap zeroization.
- Automatic per-pixel click-through, desktop icon/window perching, authored roaming for VRM, traversal across monitor gaps, monitor hotplug/mixed-DPI hardware validation and Linux app discovery.
- Signed/notarized installers, updates, release CI runs, a selected software license, locked dependency/license audit, performance and long-session/accessibility/localization QA.

This is a developer MVP with explicit setup/test gates, not a completed production release. See GEMINI_SETUP.md and CHARACTER_SOURCES.md for exact supported behaviors.
