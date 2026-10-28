# Project AURA — AI Anime Desktop Companion

Status: architecture and design proposal (not implemented). Platforms: Windows, macOS, Linux. MVP: Windows-first.

## Product vision
A consent-first desktop companion with an animated avatar, multilingual voice, emotion-driven gestures, optional memory, and computer automation. Users choose chat, assist, creative, or autonomous mode. The app never silently grants itself access to the user's computer.

## Stack
Tauri 2 / Rust / React / TypeScript; Hermes Agent as separately managed service (evaluate embedding and packaging); MCP capability gateway; whisper.cpp STT; Kokoro TTS with Piper fallback; Live2D or VRM avatar; SQLite; cloud LLM provider router.

## Key decisions to validate
Hermes packaging/licensing/version compatibility; Live2D SDK licensing or VRM alternative; macOS accessibility/screen-recording permission; Linux Wayland accessibility limitations; multilingual voice availability; model download sizes and latency; provider quotas; code-signing and notarization.

## Milestones
M0: technical spike for Hermes RPC, OS app discovery, voice latency and animation.
M1: Windows prototype: animated companion, typed chat, list/open apps with confirmation.
M2: voice pipeline and emotional expression mapping.
M3: accessibility tree and click/type tools, audit log, permissions and recovery.
M4: macOS support and Linux X11/Wayland feasibility.
M5: packaging, updates, telemetry opt-in, localization and security review.

## Deliverables in this package
- design/DESIGN_SYSTEM.md
- specs/PRODUCT_REQUIREMENTS.md
- specs/ASSET_MANIFEST.md
- specs/IMPLEMENTATION_PLAN.md
- diagrams/*.mmd (Mermaid diagrams)
- WORK_HANDOFF.md
