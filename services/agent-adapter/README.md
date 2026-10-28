# Hermes integration

Implemented native path: Rust agent-client -> authenticated local Hermes API -> configured model/provider. Browser path remains offline demo. The frontend sends bounded typed message history through Tauri; it never sees the API key. A structured `{text, emotion}` answer is requested and parsed through a closed expression vocabulary, with plain-text fallback.

## Setup on your Mac

1. Install Hermes using the official project instructions and configure your chosen model provider with `hermes setup`. Use a fresh dedicated profile/installation for Mivuneko rather than changing an existing agent's tools.
2. In that profile's config, set an explicit empty API-server toolset:

```yaml
platform_toolsets:
  api_server: []
```

The example YAML in this folder contains this restriction. Do not merge the unrestricted default `hermes-api-server` composite. Keep MCP servers/plugins disabled in the dedicated profile. Verify the actual resulting tool list with Mivuneko's connection test. 3. Enable its API server in the profile's `.env`: `API_SERVER_ENABLED=true`, `API_SERVER_HOST=127.0.0.1`, `API_SERVER_PORT=8642`, `API_SERVER_MODEL_NAME=hermes-agent`, and a strong private `API_SERVER_KEY`. Start that profile with `hermes gateway` (or your installed Hermes version's profile selector). Do not expose this listener publicly. 4. Give Mivuneko the same key through `MIVUNEKO_HERMES_KEY`, or create a macOS Keychain password with service/name `dev.mivuneko.hermes`. Optional `MIVUNEKO_HERMES_URL` must be an IPv4 HTTP loopback origin, without paths, credentials, query or fragment. Separate profiles can use separate loopback ports. 5. In native Settings choose Local Hermes Agent and Test Hermes connection. A missing key, API error, unsupported toolset-discovery shape or enabled tool fails closed. Do not work around a toolset failure by bypassing validation.

The native client uses GET `/v1/toolsets` and POST `/v1/chat/completions` with model alias `hermes-agent`, `tools:[]`, `tool_choice:none`, bounded messages and timeouts. Empty request tools alone are not treated as protection against Hermes's own tools: discovery and a dedicated profile are required. It is not a sandbox against a malicious/reconfigured server; the user controls the installed server. No OS broker or approval token is given to Hermes. Desktop launches are local explicit-intent requests or Apps-picker selections, always approved separately.

Auth stays in memory/environment/Keychain. No provider key field, fake endpoint, upstream process embedding or silent mock fallback is provided. Provider and Hermes logging/memory settings remain separate from Mivuneko's opt-in local history. Chat cancellation suppresses stale replies and blocks subsequent local actions; the server may complete its already-started generation. Streaming, Runs API server-side stop and model/provider selection UI are later enhancements.

Verified protocol references (2026-10-27):

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference
- https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/tools_config.py

Tests: actual local HTTP fixture checks bearer auth, discovery, typed chat and response parsing; pure policy tests reject remote origins and enabled/unknown tools. Native webview IPC is simulated in browser tests. No real Hermes inference was run without your provider configuration.
