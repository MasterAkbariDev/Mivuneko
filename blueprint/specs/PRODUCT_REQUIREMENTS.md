# Product Requirements v0.1

## Users and jobs
Users want a personable animated desktop assistant for chat, speech, launching apps, organizing simple tasks and interacting with UI with explicit consent.

## Functional requirements
- Avatar stays visible and can be moved, hidden, muted or made click-through.
- Chat/Assist/Creative/Autonomous modes with separately scoped tool permissions.
- Local speech recognition and speech generation; support multilingual model selection and per-language voice fallback.
- Cloud LLM via user-supplied API key; local LLM optional and not required for MVP.
- Hermes agent accessed via isolated local service/API adapter; no arbitrary shell commands exposed by default.
- MCP gateway exposes allowlisted typed tools: list_apps, launch_app, list_windows, get_accessibility_tree, find_element, click_element, type_text, screenshot_with_permission, open_url.
- Tool requests validate arguments, require relevant OS permissions, and log outcomes.
- Prefer app/OS APIs; use accessibility tree next; screenshots only as explicit fallback.
- No constant screenshot streaming by default.
- Memory opt-in with view/edit/delete/export.

## Security and privacy
- Consent per sensitive action; deny high-impact operations without explicit approval.
- Treat webpages, app text and accessibility labels as untrusted input; prevent prompt-injection escalation.
- Secrets in OS credential store; never send credentials to the LLM.
- Rate limits, timeouts, cancellation, least-privilege tool scopes, signed update pipeline.
- Local STT/TTS by default; disclose any cloud audio processing.
- Separate agent from native control broker; structured tool schemas and policy checks.

## Nonfunctional targets (initial hypotheses, benchmark before promising)
- Idle memory target < 500 MB without loaded speech models.
- Interactive UI target 60 FPS on supported systems.
- Speech turn latency target < 2 seconds on recommended hardware for short utterances, excluding cloud LLM delay.
- Minimum candidate hardware: 8 GB RAM, modern 64-bit CPU, integrated GPU; storage depends on selected models and avatar assets.

## MVP acceptance criteria
- User can type 'Open Telegram'; app finds installed app, requests appropriate consent, launches it and reports result.
- User can speak a short utterance, see transcript and hear generated response.
- Avatar visibly changes between listening/thinking/speaking and at least three expressive states.
- User can revoke permissions, stop active action and delete local history.
- Errors are visible and recoverable; no silent autonomous destructive actions.
