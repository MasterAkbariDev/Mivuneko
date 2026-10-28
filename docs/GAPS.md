# Remaining release work · v0.3

## Implemented
Gemini chat, transcription and TTS; native multi-key concurrent round-robin leases, project cooldowns and cancellation; HTTP/HTTPS/SOCKS5/SOCKS5h proxy routing without direct fallback; session-only credential configuration and environment setup. Inline chat beneath the frameless character, polished companion menu, shared conversation/activity, constrained one-time launch approvals, 14 expression/activity cues, real playback mouth amplitude, head-anchored anger/tear/surprise/celebration effects, opt-in spoken check-ins. One expressive Pixiv VRM sample is bundled with source metadata/license; local VRM import remains available. Local Hermes/whisper/macOS voice and previous MVP flows remain.

## Local test gates
No real Gemini credentials were supplied. Google model availability, provider inference, latency, multilingual transcription and generated voice quality have not been verified against a live account. Rust fixtures exercise real local HTTP/SOCKS handshakes and the chat/STT/TTS wire contracts; browser tests exercise synthetic microphone/IPC/audio data. They do not prove physical device permissions or native playback.

The cloud host cannot run Windows/macOS shell behavior or access your actual microphones/monitors. Complete the local platform checklists for transparent window behavior, dragging, menu bar/tray, native permissions, Gemini/local audio and app launching. Full Tauri shell compilation was not completed here; portable core crates and the frontend were compiled/tested. CI is prepared but has not run remotely. No binary, signed release or GitHub repository was published.

## Still open
- Continuous Gemini Live calls, streaming response/speech chunks, full-duplex voice, barge-in and wake words. Current voice is explicitly recorded, turn-based and capped at 29 seconds.
- Production original character art/rig, authored walk/sit/dance/gesture clips and per-character voice/personality packs. The bundled model is a technical sample; imported VRM facial morphs do not include every motion. Live2D rendering/import is not implemented. Kyndred/AIRI served as references, with no copied characters.
- Phoneme/viseme timing, detailed voice quality benchmarks, additional local TTS providers and local Windows speech output. Gemini speech works through portable native network code, pending device/live-account testing.
- Persistent Gemini keychain/credential-manager storage, stronger native custom-command ACL separation, authoritative audit logs, approval handling across concurrent windows, trust/signature checks and provider error/latency metrics. Current secrets are native session memory or environment, not guaranteed heap zeroization.
- Automatic per-pixel click-through, desktop icon/window perching, authored roaming for VRM, traversal across monitor gaps, monitor hotplug/mixed-DPI hardware validation and Linux app discovery.
- Signed/notarized installers, updates, release CI runs, a selected software license, locked dependency/license audit, performance and long-session/accessibility/localization QA.

This is a developer MVP with explicit setup/test gates, not a completed production release. See GEMINI_SETUP.md and CHARACTER_SOURCES.md for exact supported behaviors.
