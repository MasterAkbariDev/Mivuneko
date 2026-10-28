# Implementation Plan

## Repository
apps/desktop (Tauri + React); services/agent-adapter (Hermes bridge); crates/os-broker (Rust OS APIs); packages/ui; packages/character; packages/shared-schemas; mcp/desktop-tools; tests/{unit,integration,e2e}; docs; assets.

## Suggested boundaries
React UI talks only to Tauri commands. Rust broker mediates OS actions and permission checks. Hermes receives a curated capability list, never unrestricted shell access. Agent adapter normalizes model/provider differences and streams events to UI. Speech worker loads local models on demand.

## Tool schema example
launch_app({app_id:string}) -> {ok:boolean, pid?:number, error?:string}; get_accessibility_tree({window_id:string, max_nodes:number}) -> filtered semantic nodes; click_element({window_id:string, element_id:string}) -> action result. Never trust model-supplied coordinates without validating target window and approval.

## Implementation order
1. Repo scaffold, UI theme, tray/overlay and state machine.
2. OS app discovery and launch, permissions, tool audit.
3. Hermes bridge with mock provider, then real provider.
4. whisper.cpp and Kokoro/Piper workers, VAD and interruption handling.
5. Accessibility tree navigation and test harness.
6. Character animation/phoneme approximation and emotion mapping.
7. macOS and Linux adapters, packaging, CI, security testing.

## Testing matrix
Windows 10/11; macOS supported releases on Apple Silicon and Intel where feasible; Ubuntu GNOME X11/Wayland. Test no network, no GPU, low RAM, microphone denial, accessibility denial, tool timeouts, prompt injection in app text, long-running sessions.

## Risks
Hermes resource use and packaging; cloud LLM free quotas; multilingual TTS coverage; Wayland restrictions; signing/notarization; accessibility differences; avatar license/rigging costs. Benchmark before declaring minimum system requirements.
