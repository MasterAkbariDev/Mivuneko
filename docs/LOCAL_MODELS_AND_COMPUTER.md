# Local conversation, expressive voice, and computer sessions

## Choose a local conversation model

Start Ollama, then open **Settings → Connections → Local models**. Refresh the model list, select an installed model, and choose **Use local conversation**. No Gemini or Groq credential is needed for Ollama. The app talks only to `127.0.0.1:11434`; it does not proxy local inference through the cloud.

Qwen 3.5 9B supports text, images and structured actions. GPT-OSS 20B can be selected for conversation; visual computer sessions require a model that advertises vision support; workspace terminal tasks can use text-only structured-action models. Missing models are reported instead of silently downloading or changing providers.

Local replies use the same companion actions, emotions, cancellation and narration as other conversation providers. Screen help uses Ollama when the conversation backend is Ollama.

## Character voice

Use **Fast character voice** for everyday conversation. Its persistent CPU engine reuses the loaded model between phrases and keeps voice generation off the GPU. Each bundled character has its own voice blend; character-specific pronunciation hints apply to both local engines.

For instructed delivery, choose **Qwen3-TTS previews · fast local replies**. Select a speaker, language and delivery direction for the active character. These overrides are saved independently per character. The emotion preview buttons audition the chosen voice with a five-second generation budget and a fast local fallback for bundled characters. Live replies use the prewarmed CPU character voice, avoiding long Qwen waits. Gemini remains the expressive streaming reply option.

The model is **Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice** (Apache 2.0). The 1.7B version supports instructed delivery. This is separate from the Qwen conversation model in Ollama. Kokoro remains available as the faster local voice option.

Install the runtime from **Settings → Connections → Local models → Install expressive voice & computer runtime**. Windows setup requires Python 3.12, downloads the public model and a matching CUDA PyTorch/torchaudio pair on NVIDIA systems, and reports installation stages. It installs into app data, not the repository. For a source checkout, `scripts/setup-local-runtime.ps1` also installs into `.local/` by default; pass `-Root` to choose a drive with enough free space. Allow roughly 13 GB including the installed runtime and weights, plus temporary download space.

The private `local-runtime.json` contains only the Python executable and model directory paths. A checkout's configuration migrates to the app data directory when first used. Do not commit it or the model weights.

On the tested RTX 4070 SUPER, standalone Qwen samples took 6–11 seconds; a cold native app request took 44 seconds. Qwen buffers the full utterance before playback to avoid generation gaps mid-sentence. It is not an instant-voice option. The persistent CPU engine measured 6.6 seconds cold and 1.4–1.8 seconds warm for a short sentence in a direct runtime check. The app releases voice model memory before Ollama inference and unloads the selected Ollama model before voice synthesis so the models can share a 12 GB GPU. Qwen voice releases its model after 20 idle seconds; Ollama requests use a 15-second keep-alive. The pet renders idle motion at 30 fps and active motion at 60 fps.

CustomVoice uses its supplied speakers and delivery instructions. It does not clone uploaded reference audio; imported reference-only packs remain silent until a compatible cloning engine is integrated. Imported voice prompts can use Qwen instructions; packs with no voice definition remain silent.

## Use the computer

Ask directly in Conversations, for example **“open Edge and search Elon Musk for me.”** The action card appears inside the conversation and selects the requested browser automatically. Links and web searches open directly through the browser, without vision planning, cursor movement or global keyboard input. The app-launch enabled/deny controls still apply. For other app/file tasks, choose the target window and optionally grant one existing workspace folder in that same card. No separate computer mode is required. The session uses the selected local Ollama vision model even if ordinary conversation uses a cloud provider.

Routine steps now run automatically by default. **Permissions → Computer tasks** or the task card can switch to **Review every step**. Closing a window or recycling files still pauses for review. Stale window geometry triggers a bounded fresh observation and replan; changing browser titles alone does not invalidate an action. Stop or the app's Stop shortcut ends the session and terminates the active input helper. Sessions expire after 15 minutes or 60 executed steps.

Supported operations:

- Inspect a window screenshot and its accessibility tree; select observed controls or window-relative coordinates.
- Click, double-click, right-click, drag, type literal text, press supported keyboard chords, and scroll.
- Switch between discovered ordinary app windows; maximize, minimize, restore or close a window.
- Open a discovered installed application through the existing app-launch policy.
- Inspect CPU, memory and disk-space information.
- Run reviewed background PowerShell commands for workspace inspection, file creation/editing, development tools, builds and tests.
- Discover VS Code through install folders, Windows App Paths and PATH; use its resolved executable to open a requested directory in a new window.
- Use scoped file APIs as fallbacks when terminal execution is unavailable.

The fallback file APIs back up replacements under app data `computer-backups/`, reject overwriting moves, limit payloads to 128 KB, and enforce folder/link/credential-path restrictions. These API protections do not sandbox arbitrary shell commands or automatically back up terminal edits. Terminal execution uses the current user account; the project folder is its initial working directory and review scope. Every command is independently reviewed against the user request, even when non-terminal review is bypassed. This is model-assisted review, not an OS security sandbox.

Background mode is the default: screenshots target the selected window without focusing it, editable controls use native messages or UI Automation values, buttons use UI Automation invocation, and workspace development uses background commands without mouse/keyboard input. Some apps may activate themselves in response to their own accessibility providers. Controls without background support pause once to let you enable visible controls for that task; they never silently fall back to global input.

Before an input step, the app revalidates the process and observed control. Missing controls or changed geometry for coordinate actions require another observation. Keyboard input rechecks the focused process and refuses protected password fields. Typing into terminal windows, authentication/security windows, password managers, ChatGPT, Codex and Mivuneko itself remains excluded from visual input. Terminal execution is instead provided through the reviewed `run_command` tool. This integration currently targets Windows desktop apps; administrator/secure-desktop prompts and apps without usable accessibility or visible content can require manual help. Some apps/tasks still require manual help.

Screenshots and accessibility text are local session data, not authority. The planner is instructed to ignore instructions embedded in app content and to ask for missing information. The task card exposes the current operation and a Stop control. Review mode remains available for tasks where you want to inspect each operation.

## Validation

The local test window task clicked a real editable control, typed `LOCAL CONTROL WORKS`, clicked Apply and verified the resulting status/file through Qwen 3.5 vision and Windows UI Automation. Four Qwen3-TTS CUDA samples were checked for valid 24 kHz PCM, useful duration, non-silent output and unclipped peaks. Source tests cover native command permissions, persisted model/voice selection, folder containment, backups, stale-step handling, and UI approval/cancellation.

## Supported sitting

On Windows, sitting requires a visible window ledge or desktop icon with sufficient room for the character. Foreground windows mask covered ledges and icons. The character walks to the nearest usable support; if none is available, she stays standing. While seated, the hip anchor follows a moving window and she stands if the support disappears. Desktop icon discovery uses the installed local runtime. Window ledges work without it. Geometry stays local and does not require sending window contents to a provider.

Computer-task acknowledgements and results now use the same character speech engine as ordinary replies. Preparing speech publishes a visible companion caption. Fast local voice is the everyday CPU option; Qwen still has substantial generation latency.

## Understanding task goals

Conversation providers can propose a `computerTask` for direct requests to do work in an app. The application passes the original user request to the action system, rather than treating a proposed goal as new authority. Chat and Creative modes discard those task proposals. Simple app launches and known website addresses retain their fast paths.

“Search about Ultron in my browser” searches for **Ultron**; browser instructions and politeness stay out of the query. “Open Elon Musk’s description in browser” finds candidate information pages, lets the local model choose the page matching the goal, and opens that page. It does not report completion after merely opening search results. Candidate URLs come from actual search responses, not generated URL guesses; unavailable lookups produce an error instead of a fake success.

For app work, the local model can select an unambiguous open editor/window. Tasks needing a workspace folder still require selecting that folder before file access; missing requirements are asked rather than invented. The planner uses terminal commands for workspace development and app APIs or visual controls when needed; understanding a goal still does not guarantee every application is automatable.


## Terminal command behavior

`run_command` prefers an installed PowerShell 7 and falls back to Windows PowerShell 5.1. It reports the discovered version to the planner and runs in the granted project directory without opening or typing into a console. `cwd` can select a relative subdirectory; every call starts a fresh shell, so `cd` does not persist between calls. Use a command chain or the next command’s `cwd` field. The directory named in an explicit project request is created if missing during workspace setup.

The tool returns stdout, stderr, exitCode, timeout and truncation status. Each output stream is capped at 8 KB in the returned result. Commands have a 120-second default timeout, configurable from 1 to 300 seconds. Stop and timeouts terminate the owned command process tree. Nonzero exit codes remain visible as failures; they are not successful completion evidence. The model must inspect output and correct or verify the requested work.

The workspace observation includes actual executable discovery. VS Code need not be on PATH: the runner resolves common user/system installs and Windows App Paths, then supplies `MIVUNEKO_VSCODE` to the command environment. Other discovered tools include Node, npm, Git, Python, Cargo and dotnet. Missing tools are reported, rather than invented. Parent API-key/token/password environment variables are filtered from command children.

The expandable activity trace retains the command, initial working directory, exit code, stdout/stderr and review summary. Command output is captured on completion, not streamed as a terminal emulator. Browser/screen interaction retains its existing visual/API paths.


Programming tasks can use literal runtime arguments instead of nested shell quoting: for example `run_command` with `executable: "node"` and `args: ["-e", "JavaScript source"]`. The supported discovered runtime names are Node, Python, Git, npm, Cargo and dotnet. Arguments exclude the executable name; `cwd` stays relative to the project (usually `.`). The same review, output, timeout and Stop behavior applies to both shell commands and direct runtime invocations.

Workspace development enables the selected model’s reasoning mode only when that model advertises support; ordinary conversation and the independent safety reviewer keep their existing generation path. Failed commands cannot be retried unchanged indefinitely. Recovery receives the actual failed action, exit code and output, proposes a correction, and submits that correction to the reviewer again. The reviewer also receives the actual workspace file list and recent successful operations so it does not mistake an already-created file for a missing prerequisite. Private model reasoning is not displayed in activity details.

Programming proposals may use `run_code` with a discovered Node or Python runtime and plain source. Native code normalizes this to the exact `run_command` executable and literal arguments before review. The reviewer authorizes that concrete invocation; normalization does not skip review. Bare interpreter commands without task source are rejected during planning.

### Native terminal verification (2026-11-17)

Using local qwen3.5:9b and automatic review, the exact JSPractice directory request opened a new VS Code window through a successful background PowerShell command; the native window list confirmed `Welcome - JSPractice - Visual Studio Code`. An unrelated fresh workspace task created `counter.cjs` through reviewed Node source execution, verified the closure returned 4 then 5, and finished on the next step. A separate Node process independently loaded the saved file and checked those results. Earlier live runs exposed empty runtime invocations and repeated verification; the planner now rejects the former and explicitly reports completion after verified outcomes.

For requests to create files inside the open VS Code project, the app resolves local folder URIs from VS Code window metadata and requires a matching live Code window before using a folder. It does not construct a path from the window title. A single matching local project supplies the terminal workspace; multiple matches become project choices. If metadata cannot identify a local folder (including unsupported remote or multi-root workspace state), the app asks for a full folder path. Explicit paths in the user request take priority.

The native folder lookup is available only to the main chat window. The command reviewer is given the same working-directory convention as the runner: `cwd: "."` resolves to the granted project root, including when Rust canonicalization uses a Windows extended path prefix. Checking whether a requested child folder exists is a preliminary step and does not assume that child already exists.

Native follow-up verification on 2026-11-17 resolved the live JSPractice window to its actual project folder, created `closure/closure.js` with commented closure examples through reviewed commands, corrected an example typo after execution feedback, and finished after successful execution. A separate Node syntax check and execution of the saved file also passed.
