# Remaining release work · v0.3

## Implemented
Gemini chat, transcription and TTS; native multi-key concurrent round-robin leases, project cooldowns and cancellation; HTTP/HTTPS/SOCKS5/SOCKS5h proxy routing without direct fallback; session-only credential configuration and environment setup. Four 2D companions, shared conversation/activity, constrained one-time launch approvals, expression cues, playback-amplitude mouth movement and opt-in spoken check-ins. Local Hermes, Whisper and macOS speech remain available.

## Local test gates
No real Gemini credentials were supplied. Google model availability, provider inference, latency, multilingual transcription and generated voice quality have not been verified against a live account. Rust fixtures exercise real local HTTP/SOCKS handshakes and the chat/STT/TTS wire contracts; browser tests exercise synthetic microphone/IPC/audio data. They do not prove physical device permissions or native playback.

An Intel macOS app bundle has been built and its pet and Conversations windows opened. Local Whisper transcribed a public recording and macOS speech generated audible waveform data; browser fixtures exercised synthetic recording. Physical microphone permissions and real speaker playback, live Gemini calls, additional displays and Windows hardware still need the local platform checklists. CI is prepared but has not been verified remotely; the app bundle is unsigned.

## Still open
- Continuous Gemini Live calls, speaking while the reply is still streaming (text streams for Gemini and Groq, but speech starts after the full reply), streaming speech recognition, full-duplex voice and wake words. Barge-in exists with open mic; open-mic phrases are capped at two minutes.
- Authored character animation and per-character voice/personality packs. The 2D characters use individual emotion cells and directional walk/run cycles; Live2D rendering/import is not implemented. The Miku design is unofficial fan art and requires a rights review for distribution.
- Local voice limits: Luna's Kokoro voice has no true emotion control (moods are voice blends tuned by guess, and it may not match the character; Gemini TTS or a cloned voice is the likely upgrade). Whisper large-v3-turbo is installable but not benchmarked. The first spoken phrase after launch waits several seconds for the model. Timings come from one throttled Intel Mac; Apple Silicon is untested. Models are not in git and must be installed per machine.
- Phoneme/viseme timing, detailed voice quality benchmarks, additional local TTS providers and local Windows speech output. Gemini speech works through portable native network code, pending device/live-account testing.
- Persistent Gemini keychain/credential-manager storage, authoritative audit logs, approval handling across concurrent windows, trust/signature checks and provider error metrics. (Command ACL separation and Rust-side approval tokens landed in Slice 0; local latency spans exist.) Current secrets are native session memory or environment, not guaranteed heap zeroization.
- Automatic per-pixel click-through, desktop icon/window perching, authored roaming for VRM, traversal across monitor gaps, monitor hotplug/mixed-DPI hardware validation and Linux app discovery.
- Signed/notarized installers, updates, release CI runs, a selected software license, locked dependency/license audit, performance and long-session/accessibility/localization QA.

This is a developer MVP with explicit setup/test gates, not a completed production release. See GEMINI_SETUP.md and CHARACTER_SOURCES.md for exact supported behaviors.


The current roadmap is [docs/plans/EVOLUTION_PLAN.md](plans/EVOLUTION_PLAN.md); Slice 0 progress is in [docs/plans/SLICE0_PROGRESS.md](plans/SLICE0_PROGRESS.md).
