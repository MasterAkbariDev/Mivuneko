# Independent review — Mivuneko Evolution Plan v2

| | |
|---|---|
| Reviewer | Claude (Opus 5.5), independent session |
| Date | 2026-10-29 |
| Plan reviewed | `Mivuneko-plans/EVOLUTION_PLAN.md` (v2) |
| Code baseline | `main` @ `a3131b0` (read in worktree `tidy-denim-ridge`) |
| Scope | Review only. No code changed, nothing installed or downloaded. |

Tags: **[V]** verified by me in code (file:line). **[R]** checked against external docs (see §8). **[O]** my opinion or judgement. **[A]** assumption I could not check.

---

## 0. Verdict

**Ready for Phase 0 now (with the H1 ACL items added). Not ready to implement Phases 1–5 as written.**

Counts: **1 Critical** (C1, Hermes isolation), **7 High** (H1–H7), 12 Medium, 8 Low. Section 6 answers the owner's eight review points one by one.

The direction is right. The plan rejects an agent mesh, puts a central broker under every caller, keeps Hermes optional, uses semantic desktop control instead of coordinate replay, and starts with the biggest latency win: speaking the first sentence early. Most of the defect list holds up in code.

Five things need fixing before Phase 1+ starts:

1. **The approval boundary lives in the webview today, not in Rust** (H1). The plan says it will "keep os-broker's guarantees", but the current approval is just a flag any window can send. That has to be redesigned before anything can send a message.
2. **Hermes's own tools bypass the broker, and on macOS they can inherit Mivuneko's TCC grants** (C1). Separately, send-capable steps can be retried after an uncertain result (H2).
3. **The "0 LLM calls" workflow path still runs an LLM call on every chat turn**, and the regex trigger matcher is fragile, especially in Persian (H3).
4. **Persian is a second-class path for latency** (no streaming STT, no target, 3.5 s end-of-turn). The owner speaks Persian (H5).
5. **Scope and order.** Phase 1 bundles the easy streaming-speech win with a Rust turn-loop rewrite. The workflow recorder is underspecified. There is no MVP cut line and no effort sizing (H6, H7).

None of these is a reason to start over. They are corrections to specific sections.

---

## 1. Verification of the plan's code claims

### 1.1 Defects D1–D11

| # | Plan claim | Verdict | Evidence / correction |
|---|---|---|---|
| D1 | In-app Kokoro install never builds `luna-tts`; users get the per-phrase CLI | **Confirmed** [V] | `voice_install.rs:333-403` downloads the runtime + model only. `main.rs:354-366` uses `luna-tts` only if `root/luna-tts` exists. It is built only by `scripts/setup-sherpa.sh:46` (dev, needs clang). `docs/VOICE.md:227` admits it. **Missing from the plan: how to fix it.** End users have no compiler. The fix is to build `luna-tts` in CI per target, sign it, and ship it as a Tauri `externalBin` sidecar. Also note: switching character changes the `voices` path, which restarts the resident worker and reloads the model (`desktop-core/src/lib.rs:141`). That is a hidden multi-second stall on character switch. |
| D2 | `synthesize_speech` calls `worker.cancel()`; the counter is shared with STT; "can drop user utterances during barge-in" | **Real coupling, impact overstated** [V] | `synthesize_speech` (`main.rs:420-439`) is only used when `voiceProvider === "system"` (`useVoice.ts:213`), i.e. macOS `say`. In barge-in, `onInterrupt` → `stop()` bumps the JS generation, so no new phrase request is sent. The plan misses the other direction and the bigger coupling: `transcribe_audio` also calls `worker.cancel()` (`main.rs:627`), and **four separate `useVoice` instances** (App `voice`, `approvalVoice`, Pet `checkinVoice`, InlineChat `voice`) each call the global `cancel_voice` in `stop()` (`useVoice.ts:76`). So one window stopping cancels another window's synthesis. Fix it as part of a single audio owner (M3), not as a one-line change. |
| D3 | Blend cache writes a 28 MB `voices.bin` per character per recipe and never deletes | **Confirmed; the proposed fix figure is wrong** [V] | 54 × 510 × 256 × 4 B = 28.2 MB (`lib.rs:907-916`, `main.rs:302-328`). Files are `{character}-{hash}.bin` and old hashes are never removed. Correction: "~0.5 MB after fix (blended rows only)" is one speaker row (522 KB). A pack has up to 9 rows (neutral + 8 moods) ≈ 4.7 MB, and the sherpa CLI path needs a full-size table, so a rows-only file also needs a sid remap. **Simpler fix:** delete other `{character}-*.bin` files when writing a new one (a few lines). Better: blend in memory inside `luna-tts`, which we own, so nothing is written to disk. |
| D4 | Check-in fullscreen gate reads the pet webview's `document.fullscreenElement` | **Confirmed** [V] | `Pet.tsx:375`. It is always false for other apps' fullscreen windows. |
| D5 | No `propertyOrdering`; "emotion may arrive after text" | **Confirmed, and worse than stated** [V code, R docs] | Since Nov 2025, Gemini 2.5+ keeps the key order of the request schema (§8). The schema is built with `json!` (`gemini-client/src/lib.rs:657`). `serde_json` has **no `preserve_order`** in this build: `Cargo.lock` shows `serde_json 1.0.154` without `indexmap` (the author independently found the same from the feature graph). So keys are serialized **alphabetically**: `appQuery, companionActions, emotion, speech, text`. Emotion already comes before text. The real defect is that **visible text is generated last**, after the actions, the emotion and the whole duplicate `speech` field, which delays first token and first audio. Fix: an explicit `propertyOrdering` array (arrays keep order) or `responseJsonSchema` with an ordered array, and drop `speech`. Confirm it by logging the request body in the Phase 0 A/B. Groq has no schema mode (`groq.rs:144`: prompt-only JSON), so its order is best-effort and the parser must tolerate any order (§6.3). *Settled with the author.* |
| D6 | Inline chat hard-codes `Assist`, has no streaming or identity, ignores `approvalMode` and `companionActions` | **Confirmed** [V] | `InlineChat.tsx:67-94`. Same `agentFor(prefs.backend)` without `name`, no `onProgress`, launches always go to `setPending` (ask). |
| D7 | Native Gemini STT has no frontend caller | **Confirmed** [V] | `gemini_transcribe` is registered (`main.rs:805`); no `invoke("gemini_transcribe")` in `apps/desktop/src`. |
| D8 | `load_history`/`clear_history` not window-restricted; `consent:true` always sent | **Confirmed, and understated** [V] | `main.rs:709-715`, `history.ts:23`. More important: `request_launch` and `resolve_launch` have **no window check at all** (`main.rs:122-145`). Any webview can request and approve its own launch in two calls. `build.rs` is bare `tauri_build::build()`, so all ~40 custom commands are reachable from every window; ACL is ad-hoc `window.label()` checks. See H1. |
| D9 | `src-tauri` tests not in CI | **Confirmed** [V] | `ci.yml` runs `cargo test -p os-broker -p agent-client -p desktop-core -p gemini-client`. `src-tauri` has tests in `main.rs:848`, `voice_install.rs:635`, `project_env.rs:83`. |
| D10 | Stale docs | **Confirmed** [V] | `docs/GAPS.md:12` (no streaming, no barge-in, 29 s), `docs/ARCHITECTURE.md:34` (29 s, `say`). |
| D11 | Normalization coerces `gemini`/`groq` to `auto` | **Confirmed** [V] | `shared-schemas/preferences.ts:282-286`. |

### 1.2 Hermes client claim (§1.4)

- `validate_toolsets` calls `value.as_array()` on the whole body and fails closed otherwise. The unit test uses a bare `[]` mock (`agent-client/src/lib.rs:51-54, 190`). **Confirmed** [V].
- Whether live Hermes returns `{"object":"list","data":[…]}`: §8: docs show a bare array; v0.22.5 source returns `data[]`. Accept both.
- Also verified and not in the plan: every turn makes a **blocking** extra round-trip to `/v1/toolsets` before chatting (`lib.rs:104`), and is non-streaming (`"stream":false`, `lib.rs:106`). On macOS it also spawns `/usr/bin/security` on every call to read the key (`main.rs:160-171`). So even when it works, the Hermes chat path is the slowest one by design.
- The "tool-free profile" check is weak even once the shape is fixed. If Hermes injects MCP/memory tools outside the toolset listing (plan §1.4 [R]), `/v1/toolsets` can't prove the profile is tool-free. The fix should not claim more safety than it gives.

### 1.3 Audit table (§1.6)

| Row | Verdict |
|---|---|
| `mockHermes` is the live "open X" path for every backend and the whole `offline` backend | **Confirmed** [V] `agent.ts:39-43`, `mock.ts:2-16`. The migration plan is sound and cheap. |
| Hermes chat backend carries E2E tests | **Confirmed in substance** [V]. `desktop.spec.ts` mocks `hermes_chat`/`hermes_status` (lines 215-257, 998-1090) and sets `backend: "hermes"`. I did not recount the exact 8 + 6. The neutral `test` provider is the right fix. |
| Four system prompts differ (Groq has no `appQuery`; only Gemini gets the catalog) | **Confirmed** [V] `groq.rs:136`, `gemini-client/src/lib.rs:646-657`, `agent-client/src/lib.rs:105`. |
| **Missing row** | `approvalMode: "auto"` (`preferences.ts:89`, `App.tsx:261-275`) silently approves LLM-proposed launches. The registry's tier model (session grants) must define what `auto` maps to. Otherwise users who chose `auto` either lose the behaviour or keep a blanket grant that does not fit the new tiers. |
| **Missing row** | The `speech` reply field. Dropping it touches `agent.ts`, `pet-actions.ts`, the Hermes prompt, the Gemini schema and `speakable()` (`speech.ts:8` already prefers `text`). It is small, but it is a removal and belongs in the audit. |
| **Missing row** | The per-window `useVoice` instances and `cancel_voice`. Moving to a single speech engine removes them. |

### 1.4 Other factual claims checked

- "Speech starts only after the full reply": **confirmed** [V] `App.tsx:425-500` calls `voice.speak(speakable(reply))` after `agentFor().reply()` resolves.
- `auto` round-robins Gemini/Groq: **confirmed** [V] `agent.ts:63`. See M1.
- Open mic re-transcribes the whole buffer every 6 s; 3.5 s default end pause: **confirmed** [V] `useOpenMic.ts:181`, `preferences.ts:172`.
- CSP is strict and the UI has no `innerHTML`/`dangerouslySetInnerHTML` [V `tauri.conf.json`, grep]. This is good and lowers today's webview-compromise risk. Not mentioned in the plan; worth recording as a property to keep.
- `bundle.active: false`, Windows built with `--no-bundle`, nothing signed [V `tauri.conf.json`, `ci.yml`]. This matters for TCC (M9).

---

## 2. Findings

Severity is about impact on the plan's success, not on today's app.

### Critical

#### C1 — Hermes's own tools bypass Mivuneko's broker, and on macOS they can inherit Mivuneko's TCC grants
(Raised to Critical after the owner's review, point 1. I agree with that severity, for the reason in item 2 below.)
- **Affected:** §0 item 3, §2.4, §2.5, §6.
- **Problem:**
  1. Hermes's value for "terminal/coding chores, browser workflows" comes from **its own** tools (terminal, file, browser, `execute_code`). Those run inside Hermes, not through our MCP facade. `approval.request` reflects Hermes's own policy (what it thinks is dangerous), not ours. Routing the prompt to our UI doesn't make it our policy. So "All actions from all callers pass the same broker" (§0.3) is false.
  2. **TCC inheritance (macOS).** If Mivuneko spawns Hermes as a child process, macOS attributes the child to Mivuneko as the "responsible process". Hermes's terminal and Python tools then run with Mivuneko's Accessibility, Screen Recording and protected-folder grants, which Phase 4 will request. One model-generated `osascript` or Python AX call then drives the desktop with no broker involved. [R/A: documented TCC responsible-process behaviour; must be confirmed by a canary test on this app.]
- **Evidence:** [V] the current client already treats any enabled toolset as unsafe (`agent-client/src/lib.rs:59-64`). [R] plan §2.5's own description of Hermes toolsets.
- **Recommendation — enforceable boundaries, not prompts:**
  1. **Never spawn Hermes as a child of the Mivuneko process** once Mivuneko holds TCC grants. Run it as a user LaunchAgent (macOS) or a separate scheduled-task/service process (Windows). Only talk to it over its loopback API. This breaks TCC attribution.
  2. **Default profile = no host-executing toolsets.** Allow terminal/file/code/browser only when Hermes is configured with an isolating backend (e.g. a container terminal backend, if Hermes supports one — see §8), with only a per-task workspace mounted. Never enable host "local" execution from Mivuneko's UI.
  3. **Windows:** run Hermes under a separate low-privilege local account or AppContainer. "Workspace-only" without OS enforcement is not a boundary.
  4. **Canary tests in the value gate** (§2.6), run on every Hermes version bump:
     - read a canary file outside the workspace → must fail;
     - an AX/UIA action via `osascript`/Python → must fail (no TCC);
     - read Mivuneko's app data or keychain items → must fail;
     - outbound network to a non-allowlisted host, if the backend supports egress rules.
  5. Rewrite §0.3/§2.4 to say: "every action on *Mivuneko's* capabilities passes the broker; external executors' own tools run in a separate, OS-enforced trust domain". Add "actions outside our broker" to the value-gate metrics.

### High

#### H1 — The approval boundary is in the webview; the plan assumes it's already in Rust
- **Affected:** §2.2 move 2 ("keep its guarantees"), §2.4, §4.4, §6.1.
- **Problem:** the plan treats today's broker as a trusted consent gate and generalises it. In reality the webview decides. `resolve_launch(request_id, allow)` takes `allow` from any window with no label check. `approvalMode` lives in localStorage prefs and is applied in JS (`App.tsx:261-275`). That is acceptable for "open an app". It is not acceptable for `send-capable` (message send, call, git commit) or `destructive` tiers, where the plan promises "fresh confirmation each time".
- **Evidence:** [V] `main.rs:122-145` (no `window.label()` check), `App.tsx:269`, `build.rs` (no app manifest / command ACL). `docs/GAPS.md` lists "stronger native custom-command ACL separation" as open.
- **Recommendation:**
  1. Policy (tiers, grants, `approvalMode`) is stored and evaluated in Rust only. The webview may display it, never decide it.
  2. Approvals for `send-capable`/`destructive` are resolved through a Rust-issued nonce bound to the exact payload hash, delivered only to a dedicated approval surface (the `main` window, or a native dialog). A pet window can't approve.
  3. Move to Tauri 2 app-manifest command permissions (`tauri_build::Attributes::app_manifest`) with per-window capabilities. Stop relying on ad-hoc label checks before the registry adds dozens of commands.
  4. **Voice approval** (§4.4 "Approval card / voice") must not approve `send-capable` actions. Open mic can hear the companion's own TTS, a video, or another person. Voice may approve `local-reversible` at most. `send-capable` needs a click or a hotkey.
  5. Add these to Phase 0 (ACL) and make Phase 4 depend on them.

#### H2 — Non-idempotent actions: retry rules contradict "fresh confirmation", and "sent" is not verified
(Owner's review, point 4. I agree it is High.)
- **Affected:** §2.3 failure rule, §4.4 recovery, §4.2, §5.3 `send_draft` postcondition.
- **Problem:**
  1. §2.3 ("a failed postcondition triggers a re-observe and one retry") and §4.4 ("Recovery: re-snapshot, re-resolve, retry once") apply to **every** step. For `send-capable` steps, a retry after an uncertain result can double-send a message or place a second call.
  2. The `send_draft` postcondition (`element_absent: text_field value == text`) proves the input was cleared, not that the message was sent. The field also clears on errors, chat switches or a draft discard.
- **Recommendation:**
  1. Model explicit states per send flow: `app_open → chat_open (title verified) → draft_filled (field value == text) → send_initiated (key/click issued) → sent_observed (new outgoing bubble with matching text appears in the history list) → delivered/read`. Treat `delivered/read` as **not observable** unless the AX tree exposes it reliably; never claim it.
  2. Capabilities declare `idempotent: true|false`. Recovery/retry is allowed only before `send_initiated` and only for idempotent steps.
  3. The broker gives every `send-capable` invocation an action id. Once `send_initiated` is recorded, that id can never be executed again. An uncertain outcome is reported as "I pressed send but couldn't confirm it went through — please check", and there is no automatic retry. This is at-most-once semantics.
  4. Persist the state machine, so a crash between `send_initiated` and `sent_observed` doesn't lead to a resend on restart.
  5. Tests: inject a postcondition timeout after `send_initiated` → assert exactly one send event and an "uncertain" report.

#### H3 — "Zero-LLM" workflow triggering is mostly illusory on the chat path, and regex intents are fragile
- **Affected:** §2.1 router row, §2.3 sequence, §5.3 `intent.patterns`, §11 "Verified workflow start → first action < 300 ms".
- **Problem:**
  1. The §2.3 sequence starts "(parallel) short acknowledgement turn" when a workflow matches. So the chat path still spends one LLM call. The zero-LLM property is real only for scheduler, hotkey and button triggers.
  2. Natural-language trigger patterns (`"send {contact} a telegram message saying {text}"`) will miss most real phrasings, and almost all Persian ones. Those misses fall to the task runner, which costs more calls than the alternative below.
- **Evidence:** [V] today's local intents are English regexes (`desktop-intent.ts:29-99`). [O] matching free speech with templates is a known brittleness.
- **Recommendation:** let the **one companion turn that already runs** choose the workflow. Its structured output gets an optional `run: {workflow_id, slots}` field, validated against the registry of verified workflows. Execution stays deterministic with zero *additional* LLM calls. It works in Persian and English, and the router keeps exact-match/hotkey triggers for the truly instant path. The acceptance metric becomes "0 LLM calls *during execution*; ≤ 1 call to select, shared with the reply". This keeps the owner's rule ("execute without LLM calls only after verification") intact.

#### H4 — Memory can poison send-capable actions
- **Affected:** §4.2 ("Resolve Amir from the people memory"), §5.1 write path, §2.4 untrusted tagging.
- **Problem:** people memory is written by automatic LLM extraction from conversations. Conversations can include pasted web text, screen-analysis output and AX text. A poisoned or simply wrong extraction ("Amir's Telegram is @attacker") flows into `telegram.open_chat_draft`. The plan tags untrusted content but doesn't say extraction skips it. It also doesn't say whether the confirmation card shows the **resolved handle** or just the display name.
- **Evidence:** [O] design gap. Nothing in §5.1 restricts extraction sources.
- **Recommendation:**
  1. Memory extraction runs only on user-authored turns, never on tool/AX/web/screen/MCP content.
  2. Contact identifiers used by `send-capable` capabilities (handles, phone numbers, emails) need `source: user-confirmed`. A model-extracted identifier triggers "Is @amir_x Amir's Telegram?" once.
  3. Confirmation cards always show the resolved identifier, not only the name.
  4. Add a "memory-poisoning" case to the §11 injection corpus.

#### H5 — Persian is second-class on latency, and the owner speaks Persian
- **Affected:** §3.6 default pipeline, §11 targets.
- **Problem:** every latency win in the plan is English-only: Nemotron streaming partials and the hybrid end-of-turn rule. Persian keeps no partials and the 3.5 s pause, plus slower engines (BuzzASR is a 1.5B Whisper large-v3 fine-tune; on CPU-only machines it will likely be slower than real time [A]). Auto mode adds a Whisper language-ID pass. §11 has no Persian targets at all. The owner's own daily use may see no improvement.
- **Evidence:** [V] `useOpenMic.ts:181` (6 s snapshots), `preferences.ts:172`. [R] Nemotron is English-only.
- **Recommendation:**
  1. Add Persian rows to §11: end-of-speech → submitted, and speech → first caption, per tier.
  2. For Persian end-of-turn, use the existing VAD with a shorter silence plus a "still talking?" grace window: submit at ~1.2 s silence, cancel if speech resumes within 400 ms. This is engine-independent.
  3. For Persian partials, re-transcribe only the **new VAD segment** (not the whole buffer) with Whisper, so partial cost stays constant.
  4. For language-ID, use the user's sticky last language plus Whisper **tiny/base** LID (74 MB), not large-v3-turbo. Don't keep two large STT models resident for LID.
  5. Make the "I'm speaking: English / فارسی / Auto" toggle a one-tap control on the pet, not a buried setting.

#### H6 — Phase 1 couples the quick win to a rewrite
- **Affected:** §2.2 move 1, §10 Phase 1.
- **Problem:** the largest UX win (speak at the first sentence) needs a sentence segmenter on the `onProgress` stream that already exists (`agent.ts:111-126`, `partialText.ts`) and a phrase queue that already exists (`useVoice.ts:179-289` pipelines phrases). Phase 1 instead bundles it with moving the turn loop and PromptBuilder into Rust, persona, pack migration, normalizer, binary IPC and the 2D mouth. If the Rust migration slips, the win slips.
- **Evidence:** [V] the files above. [O] sequencing.
- **Recommendation:** split it.
  - **1a (small):** streaming speech in the current TS path, unify the two chat surfaces through one shared TS `runTurn()` (fixes D6 without Rust), and define provider-failure behaviour mid-speech (M2).
  - **1b:** Rust PromptBuilder + persona (prompts already live in Rust per provider, so this is natural).
  - **1c:** move the turn loop to Rust only when the scheduler (Phase 5) or memory retrieval needs it. Judge it then on its own merits.

#### H7 — Scope with no MVP line or effort sizing
- **Affected:** §10 as a whole.
- **Problem:** this is a ~10 k-line app [V `wc`: core Rust + main TS ≈ 8.5 k lines]. The roadmap adds a turn engine, two STT engines plus a ggml conversion and hosting, a Python TTS sidecar, a ranking UI with on-device benchmarks, three memory layers with an extraction worker, a storage manager, a tool registry, two desktop-driver backends, four app adapters, a task runner, a workflow engine + recorder + lifecycle, a scheduler, an ACP/Codex adapter, an MCP facade, a Hermes executor and a 35-task benchmark. There are no estimates, no "ship to users here" points, and no statement of what is cut if time runs out.
- **Recommendation:** for each phase, name (a) the user-visible thing that ships, (b) a rough size (S/M/L), and (c) what is deferred if it overruns. Suggested cut lines: the desktop-driver spike with **one** backend first (native AX on macOS, since that is where the owner tests today; cua-driver for Windows); the Hermes gate suite at 5 tasks per category to start; Pocket TTS only if Kokoro voice identity is judged insufficient.

### Medium

#### M1 — `auto` round-robin hurts latency and consistency
- **Affected:** §0 item 1, §11 first-token targets.
- **Problem:** `auto` alternates providers every turn (`agent.ts:63`), so latency variance and style flip turn by turn.
- **Recommendation:** `auto` = the healthy provider with the best rolling p50 time-to-first-token, with failover. Round-robin only for spreading rate limits. Fixing D11 (pinning) supports this.

#### M2 — Mid-stream failure and failover are undefined once speech streams
- **Affected:** §3.3.
- **Problem:** today a provider failure in `auto` silently retries the next provider (`agent.ts:65-80`). Gemini can also reject a reply **after** generation (invalid JSON, `appQuery` not in the catalog: `gemini-client/src/lib.rs:676-684`). With sentence streaming, the user may already have heard half a reply, then hear a different reply from Groq.
- **Recommendation:** define the rule. Once audio has started, don't fail over. Finish or stop with a short spoken "sorry, I lost that". Validate `appQuery`/actions independently of the text, so a bad action field drops the action, not the spoken reply.

#### M3 — No single audio owner
- **Affected:** §2.2 (Speech in the Rust core), §3.3 ("native audio only if measurements require it").
- **Problem:** playback happens in whichever webview called `useVoice` (four instances across two windows [V]). The main window is often hidden. When the turn loop and the scheduler move to Rust, it's unclear who plays the audio and who owns barge-in. Overlapping check-in and chat speech is possible today.
- **Recommendation:** one speech owner. Either the pet webview hosts the only `AudioContext` and everything routes there by event, or native playback in Rust (`cpal`/`rodio`). Decide in Phase 1a, not "if measurements require it". **Keep mic capture in the webview** (`getUserMedia` gives echo cancellation, which barge-in depends on; `useOpenMic.ts` already exposes `echoCancellation`), and stream PCM to Rust over a binary Tauri `Channel`/raw request. The plan only moves *output* audio off `number[]` JSON. Input is the bigger payload: `Array.from(wav)` up to 120 s of 16 kHz audio per call, every 6 s [V `useOpenMic.ts:88`].

#### M4 — Streaming segmentation must be Markdown-aware
- **Affected:** §3.3 sentence segmenter, `speakable()`.
- **Problem:** `speakable()` works on a finished reply: it narrates tables, replaces fenced code, strips links (`speech.ts:4-30`). With streaming, an unclosed code fence or a half-received table must not be spoken. `hasCode` also opens the chat window (`App.tsx:453-470`), and that decision is currently made after the full reply.
- **Recommendation:** a stateful streaming `speakable` that holds back inside fences or tables until they close, and emits "a code example is in our chat" once. Unit-test it with chunk boundaries at every byte offset of the existing `speech` tests.

#### M5 — Mixed-language replies switch voices mid-reply
- **Affected:** §3.2 routing step 5.
- **Problem:** a reply mixing Persian and English sentences alternates between a local English voice and a Gemini voice. "Chosen to be timbre-compatible" can't be guaranteed: Gemini has fixed prebuilt voices with no cloning, so the character audibly becomes two people.
- **Recommendation:** decide per **turn**, not per sentence. If the reply contains Persian and Gemini is available, speak the whole turn with Gemini (Gemini speaks English too, so the owner's rule holds). Per-sentence switching can stay as an opt-in.

#### M6 — The Qwen3-TTS expressive tier only serves a narrow hardware band in real time
- **Affected:** §3.1, §3.2, §7.
- **Problem:** by the plan's own data, real-time streaming needs an RTX 4060-class GPU or an M4 Max; an M4 Pro is below real time. The cost is a Python sidecar and, on CUDA, several GB of torch. The owner wants local Qwen TTS, so it stays. But in real time it serves a minority of devices.
- **Recommendation:** add a second use that works on mid-tier hardware: **pre-rendered expressive lines**. Check-ins, reminders, greetings and reaction barks are known ahead of time or a few seconds early. Render them with Qwen while idle (RTF > 1 is fine), cache them in `cache/` under the LRU budget, and play them instantly. Real-time chat stays on Kokoro/Pocket on those machines. The spike's go/no-go should then be two decisions (real-time, pre-render), not one.

#### M7 — The workflow "recorder" is the riskiest piece and the least specified
- **Affected:** §5.3, §10 Phase 4.
- **Problem:** turning a task-runner trace into a parameterised, selector-based workflow is hard. Which literals become slots? Which selectors are stable? How are postconditions derived? The plan's only example (`telegram.send_message`) is two **hand-written adapter capabilities**: its value comes from the adapter, not from learning.
- **Recommendation:**
  1. Ship hand-authored adapter capabilities first.
  2. Learned workflows v1 may compose **only registry capabilities**, no raw AX steps. Generalisation is one LLM call at proposal time ("which arguments are slots?"), and the user approves it with a readable diff.
  3. Raw AX-step workflows come in v2, after the driver spike shows selector stability numbers.

  This honours the owner's rules and puts the hardest work after evidence.

#### M8 — MCP facade transport and auth are unspecified
- **Affected:** §2.4.
- **Problem:** "stdio, launched by us for the external agent". With stdio MCP, the *client* (Hermes) spawns the server process. That process must then reach the running Tauri core through some local IPC, and that channel is a new authentication boundary, with any local process as a potential caller.
- **Recommendation (settled with the author; replaces my earlier "one ACP protocol" idea):**
  - **One transport rule, with an adapter per protocol.** Every external executor (Hermes, Codex app-server, any ACP agent) is started outside Mivuneko's TCC responsibility chain: a launchd LaunchAgent via `launchctl bootstrap` on macOS; a separate scheduled task or account on Windows. It is reached only over authenticated local IPC.
    - Hermes uses `/v1/runs`.
    - Stdio-only agents get a bridge helper. It is **separately signed with its own bundle id**, because TCC keys on code identity, and it is never granted TCC permissions.
    - Auth: a per-user socket in a 0700 directory (Windows: a named pipe ACL'd to the user SID) plus a per-launch 0600 token, never in the plist or argv.
    - Use the public launchd route only, with no private disclaim API.
    - Same-user malware is out of scope; the plan should say so.
    - The TCC canary test runs for every executor type.
  - **MCP facade:** a loopback streamable-HTTP endpoint with a bearer token per client grant, revocable and audited per token.
  - **Hermes defaults (settled; revised after the author's v0.22.5 source review):**
    - **Host-executing tools only when the WHOLE Hermes process runs in a container**, never with the terminal backend alone. The docker terminal backend isolates only terminal commands; file tools, `execute_code`, plugins and MCP clients still run on the host.
      - The container gets an internal network with egress through our proxy, and no home mount.
      - The facade must be reachable from the container but not from the LAN: a mounted Unix socket, or a bridge-only bind, plus a token.
    - **Default mode = no write-capable toolsets.** Enforced by:
      - a fixed `disabled_toolsets` list, no plugins or hooks, and `mcp_servers` set to our facade only;
      - a private `HERMES_HOME` and a pinned venv that Mivuneko manages;
      - a re-hash of config and the managed dir before every run, failing closed;
      - **verification of the effective config after start**: query `/v1/toolsets` and assert only the allowed toolsets are enabled. Hermes's config loader fails open to `{}`, so a file hash alone isn't enough.
    - **Run monitor** (`tool.started` / `subagent.*` → stop and kill): this is detection, not prevention.
    - **Request bodies** are built from a fixed struct. A unit test asserts the serialized keys against an allowlist, so no `_room_*` or `hosted_room_*` fields can get in. The suspected upstream policy-override bug should be confirmed on a throwaway install and reported **privately** (a GitHub security advisory, not a public issue), with the owner's OK.
    - **Web:** the search/extract toolset only; the CDP browser stays disabled in v1.
      - The egress proxy must **block private, loopback and link-local ranges** (SSRF): Hermes's fetch tool must not reach our facade, the Hermes API itself, or LAN devices.
      - An allowlist is impractical for open research.
    - **Seatbelt / restricted-token sandboxing:** a Phase 5 hardening PoC, not promised. The author's probe showed Seatbelt does not stop AppleEvents (`osascript`), which confirms that TCC separation (C1) is the primary control.
    - Facade grant is observe-only. `local-reversible` needs a per-task grant. `send-capable`/`destructive` actions always go through our fresh, payload-bound confirmation.
    - Approvals are answered with `once`/`deny` only.
    - Hermes's own home-folder state is out of scope.
    - The injection corpus includes "an injected page asks Hermes to use our Telegram tool".

#### M9 — Signing is a prerequisite of Phase 4, not an owner question at the end
- **Affected:** §4.1, §12 item 14, §10 Phase 4.
- **Problem:** Accessibility grants are tied to the code signature. Unsigned, ad-hoc-signed builds lose them on every update. Today nothing is signed [V `bundle.active: false`, `ci.yml`]. Windows SmartScreen and Defender treat unsigned binaries that drive other apps with suspicion [A].
- **Recommendation:** list "stable signing identity (macOS Developer ID + notarization; Windows code signing)" as a hard dependency of Phase 4 in §10, with the sidecars (`luna-tts`, any driver) signed with the same identity.

#### M10 — Idle CPU/RAM targets conflict with current WebView flags
- **Affected:** §7.1 policy 4, §11 idle targets.
- **Problem:** both windows launch with `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows` [V `tauri.conf.json`]. On Windows (WebView2/Chromium) this keeps hidden windows running at full timer rate. Two WebView2 windows alone often take 200–400 MB [A]. "< 1% CPU / < 350 MB" may be unreachable on Windows as configured.
- **Recommendation:** measure first (Phase 0 already adds spans; add an idle-resource probe). Keep the flags only on the window that owns audio (M3), and set per-OS idle targets.

#### M11 — Prompt layout and memory injection should preserve provider prefix caching
- **Affected:** §3.4 personality, §5.1 read path.
- **Problem:** putting per-turn retrieved memories into the system instruction changes the prompt prefix every turn. That defeats implicit prefix caching (Gemini, Groq), which affects time-to-first-token and cost [R general provider behaviour; A for exact gains].
- **Recommendation:** order the prompt as stable system rules → persona → pinned memory (changes rarely) → history → per-turn retrieved memory as a late context message. Add "cache hit rate" to the latency harness where the provider reports it.

#### M12 — Imported character packs become a prompt-injection and voice-consent vector
- **Affected:** §3.4.
- **Problem:** packs are importable (`character-pack.ts`). A `persona.summary` from a third-party pack goes straight into the system prompt, and a `voice/ref.wav` may clone a real person.
- **Recommendation:** cap persona fields (length, no URLs), place them in a delimited section that can't override rules (the broker enforces policy anyway), and show "this pack includes a cloned voice reference" on import with a consent checkbox. Built-in packs are exempt.

### Low

- **L1 — Hermes preflight fix effort.** A "live contract test" can't run in CI without installing Hermes. Make it a dev script (`scripts/hermes-contract.mjs`), not a CI gate. Since chat-via-Hermes is slated for retirement, don't invest beyond the shape fix and the neutral `test` provider.
- **L2 — End-of-turn rule.** "Silence ≥ 700 ms and terminal punctuation" relies on streaming punctuation, which can flicker. Add a resume grace window (as in H5.2) and measure the false-cut rate per language. The plan already has that metric.
- **L3 — TTS listening panel size.** "≥ 5 listeners × 20 lines × character × engine" over 12 characters × 4 engines is ~960 lines per listener. Sample 3 characters × the engines in contention.
- **L4 — Reference hardware.** §11 targets three tiers, but the owner has an Intel Mac. Name who runs the Apple Silicon and NVIDIA passes, or mark those targets "community-measured".
- **L5 — Storage sweep.** "Unlisted files inside `models/` are removed" is risky if a user drops a model there by hand, or during a manifest-write crash. Move unlisted files to `tmp/quarantine` for 7 days instead of deleting.
- **L6 — FTS5 and Persian.** The default `unicode61` tokenizer handles ZWNJ and Persian affixes poorly. Use the `trigram` tokenizer for the Persian/mixed column, or normalise ZWNJ before indexing. Also, with small personal memory (hundreds of facts), "pinned + scoped + recent" fits the budget without retrieval. Measure before adding embeddings, as the plan already says.
- **L7 — Device probe on Intel Macs.** "Apple M-gen via sysctl" is fine. Intel Macs should explicitly map to the "Other x64" row. The heuristic table already does this; keep it.
- **L8 — Hermes key read.** `agent_config()` shells out to `/usr/bin/security` on every status/chat call [V `main.rs:160-171`]. It goes away with `keyring` (Phase 3). Note it in the audit.

---

## 3. Evaluation by area (short)

| Area | Assessment |
|---|---|
| Architecture & maintainability | Good shape: one turn, one runner, broker everywhere. Weak spots: the trust boundary (H1), audio ownership (M3), and moving the loop to Rust without a forcing reason yet (H6). [O] |
| Multi-agent necessity | **Agree with the plan: not needed.** The "task runner + profiles" is the right granularity. The only multi-agent-like part worth keeping is external executors, and those should share one protocol (M8). [O] |
| Hermes feasibility | Feasible as an optional executor. The value gate is the right idea, but it is heavy (35 tasks, clean-machine installs) and its trust model is overstated (C1). A built-in `research` profile is named, but its tools (web search/fetch, grounding) are never specified, so the gate compares against something undefined. [V plan text] |
| Qwen TTS | Correctly framed as gated and English-only. Add the pre-render use (M6). Keep the native (no-Python) path deferred. [R] |
| Desktop control & IDE | Ladder (channels → AX/UIA → vision) is right. The `DesktopDriver` trait is right. Two-backend spike is more than needed at first (H7). IDE delegation to an installed coding agent is right; don't build our own. [O] |
| Memory & learning | Three-layer split is correct and matches the owner's rule. Gaps: poisoning (H4), the recorder (M7), FTS for Persian (L6). |
| Security & privacy | Strong intent (tiers, untrusted tagging, no learned permissions). Current enforcement point is the webview (H1). Voice approvals (H1.4). Pack personas (M12). |
| Resources & disk | Good: storage classes, manifest, idle unload, game mode. D3 fix numbers corrected. Quarantine instead of delete (L5). WebView flags (M10). |
| Streaming & latency | Biggest win correctly identified. Needs failover rules (M2), Markdown-aware segmentation (M4), binary mic input (M3), Persian targets (H5). |
| Cross-platform | Mostly covered. Signing (M9). Windows WebView2 idle cost (M10). `luna-tts` must be prebuilt per OS (D1). |
| Reuse & migration | Audit table is good. Three missing rows (§1.3). |
| Phases & testing | Testing section is thorough. Phases need splitting and sizing (H6, H7). |

---

## 4. What is strong and should be kept

1. **No agent mesh.** Router + one streamed turn + one task runner + background workers. The latency argument is correct.
2. **Native registry + optional MCP facade** over MCP-only. The comparison table is fair; in-process typed calls and a native approval UI are decisive.
3. **Three distinct memory layers**, with procedural notes never entering ordinary chat, and workflows that never widen permissions.
4. **The workflow lifecycle rules:** `requires` as a ceiling checked every run, `confirm: fresh` that never decays, editing `requires` resets to draft, coordinates kept as evidence only.
5. **Telegram via deep link + verification, no MTProto client.** Right risk call.
6. **The §1.6 discovery that `mockHermes` is production code.** Easy to miss. Exactly the kind of audit the owner asked for.
7. **Storage classes** with automatic cleanup limited to disposable classes, and `user/` never touched.
8. **The Hermes value gate as a concept**, with versioned, dated results.
9. **Phase 0 first:** spans, golden prompt tests, a neutral test provider, D-fixes. This is ready now.
10. **Honest tagging** ([V]/[R]/[A]/[P]) and the "not verified" appendix.

---

## 5. Recommended changes to the plan (checklist)

1. Add H1 items to Phase 0 (command ACL via app manifest, Rust-side policy, no `resolve_launch` from the pet window). Make Phase 4 depend on payload-bound approvals and no voice approval for `send-capable`.
2. Rewrite §0.3/§2.4/§2.5 trust statements for Hermes, add OS-enforced isolation and canaries (C1). Add idempotency and at-most-once send semantics (H2).
3. Replace regex workflow triggers on the chat path with turn-selected workflows. Keep regex/hotkey/scheduler triggers for zero-call paths (H3).
4. Add memory-source rules and identifier confirmation (H4).
5. Add Persian latency targets and the VAD-based end-of-turn and partial approach (H5).
6. Split Phase 1 into 1a/1b/1c (H6). Add S/M/L sizes and cut lines (H7).
7. Specify failover-after-speech, the streaming `speakable`, a single audio owner, and binary mic input (M2–M4).
8. Add D1's fix method (CI-built, signed sidecar), the corrected D3 numbers and simpler fix, and the D2 scope correction.
9. Add the three missing audit rows (`approvalMode: auto`, the `speech` field, per-window voices).
10. Make signing a Phase 4 prerequisite (M9).

---

## 6. Response to the owner's review of v2 (points 1–8)

| # | Owner point | My view | Agree? |
|---|---|---|---|
| 1 | **Critical:** Hermes isolation needs OS-level boundaries and tests | Agree, and it is worse on macOS because of TCC responsible-process inheritance. See **C1**: don't spawn Hermes from Mivuneko, use an isolating backend or no host tools, and run canary tests. | **Yes**, Critical. |
| 2 | **High:** Qwen3-TTS — can one variant give custom identity **and** emotion control? | See below. Short answer: not off the shelf, as far as published material shows. | **Yes**, High. It decides whether the expressive tier is worth building. |
| 3 | **High:** is incremental JSON the right streaming format? Gemini vs Groq consistency | See below. JSON is fine on Gemini once keys are reordered (D5). On Groq it is prompt-only, and a malformed reply is shown and spoken **raw, braces included** [V `shared-schemas/agent.ts:9-10, 61`]. I recommend tagged text plus native function calls, decided by a Phase 0 A/B. | **Yes**, High. |
| 4 | **High:** Telegram/desktop state distinctions; no retry after an uncertain result | See **H2**: explicit states, idempotency flags, at-most-once action ids, a persisted state machine. The plan's generic "retry once" (§2.3, §4.4) is a real double-send risk. | **Yes**, High. |
| 5 | **Medium:** STT turn detection; Persian vs other Arabic script; partial corrections | See below and **H5**. | **Yes.** I rate the Persian latency part High (H5) and the rest Medium. |
| 6 | Hermes `/v1/toolsets` shape unresolved (code returns `{object,platform,data[]}`, docs show an array) | My research also found the docs example as a bare array. **Code beats docs**: against v0.22.5 source, the current client fails every turn. The fix doesn't need to wait for a live test: accept **both** shapes (`as_array().or(value["data"].as_array())`) and keep fail-closed on anything else. A live test then only confirms it. Also: the tool-free check proves little, because chat completions ignores request `tools` (verified in source, §8). | **Partly.** Not "unresolved": decide now, accept both. |
| 7 | Memory deletion completeness | See below. One additional gap in the plan's own schema: `memory_events(before, after)` and the broker audit log keep deleted content. | **Yes.** |
| 8 | Measurable targets, local vs cloud separated, PoC list, vertical slices, rollback and disk/model lifecycle tests | See below and **H6/H7**. | **Yes.** |

### 6.2 Qwen3-TTS: identity + emotion (point 2)
- **Published variants [R]:** 1.7B comes as VoiceDesign, CustomVoice and Base; 0.6B as CustomVoice and Base only (no 0.6B VoiceDesign). The plan's §3.2 "0.6B (CustomVoice for emotion, Base for cloned identity)" means **two models**, so switching between them costs reloads and RAM.
- **CustomVoice:** instruction control, but only over preset speakers. The identity is not ours.
- **Base:** clones identity from about 3 s of reference audio. Instruction control on Base is not documented [A, pending research follow-up]. If it has none, emotion on Base is limited to what the reference clip carries, plus speed and pauses.
- **VoiceDesign (1.7B):** identity from a text description, plus style. Each call re-derives the voice from text, so identity drifts across sentences. That is the plan's own "timbre drift" risk at its worst.
- **My recommendation:**
  1. The spike's first question is "does Base + per-emotion reference clips give acceptable emotion?" Record one reference clip per emotion family (neutral, bright, soft/sad, excited) for each character, all generated from the same designed voice, and switch reference by mood. Kokoro packs already use this pattern (mood blends). It keeps one model resident.
  2. Only if that fails, evaluate fine-tuning a custom speaker into CustomVoice (if official SFT exists, §8). That costs per-character GPU training, and the owner must accept it.
  3. Don't plan on two resident Qwen models.
  4. **Consent:** cloning from user-supplied audio needs an explicit "this is my voice or I have permission" step, stored with the pack. Imported packs with reference audio are flagged (M12).
- **Update after the author's source review (settled):**
  - **Variants and runtime model:**
    - Base has no `instruct`, and 0.6B CustomVoice silently drops it. Clone + instruct exists only in an unreleased model.
    - VoiceDesign is non-deterministic, so it is an **offline authoring tool only**.
    - The runtime model is **Base 1.7B, in-context**, with 0.6B Base as a measured speed fallback. CustomVoice fine-tuning is dropped: official SFT is Base-only and instruct has little effect.
  - **Stability rules:**
    - full-text prefill per sentence call (avoids speed drift);
    - a 4–6 s neutral English anchor clip;
    - a reused clone prompt;
    - calls under 30 s.
  - **Nonverbals:** not supported. Persona `expressive` flags are gated on engine capability.
  - **Speaker-similarity guard:**
    - Use a speaker-embedding model on the **existing sherpa-onnx runtime**, not speechbrain/torch.
    - Mandatory for pre-rendered lines (regenerate on fail) and for accepting each clip in the emotion clip bank (≥ anchor mean − 2σ, and above the maximum similarity to any other character).
    - For real time, the default is a **per-character calibration gate** (e.g. 200 lines; ship only if the switch rate is ≤ 1%), plus asynchronous runtime scoring that demotes a character to Light **on the next turn**. No mid-turn voice switch. The pre-play gate (~0.75 s+ on a 4060) is an option to measure, not the default.
  - **Alternates:** only on a Qwen no-go. At most 2 (e.g. VoxCPM2, CosyVoice3), time-boxed, under the same English-only rule.

### 6.3 Streaming format (point 3)
- **Facts [V]:**
  - Gemini uses schema-constrained JSON, but key order today puts `emotion` last (D5).
  - Groq uses prompt-only JSON. `partialText` shows prose raw if the reply doesn't start with `{` (`agent.ts:120`). `parseAgentReply` falls back to the raw string, so a bad JSON reply appears and is spoken **with braces**.
- **Options:**
  - (a) **JSON with leading header keys:** robust on Gemini, fragile on Groq, and needs an incremental JSON-string decoder.
  - (b) **Tagged text:** a first line `⟦mood=happy lang=en⟧`, then plain Markdown. Robust on every provider, and the body streams straight into the speech segmenter. A missing header degrades to a default mood instead of failing the turn.
  - (c) **Native function calls** for actions (`companion_actions`, `open_app`, `run_workflow`). Both Gemini and Groq stream tool calls and validate their arguments.
- **Recommendation:** (b) for the spoken body plus (c) for actions, with JSON-schema mode removed from the chat path. **Decide it with a Phase 0 A/B on both providers:** measure time to first speakable character, malformed-turn rate, and action-argument validity. One caveat: some Gemini models don't allow JSON-schema mode together with function calling, which is one more reason (b)+(c) is simpler. Keep `partialText` only for legacy and Hermes.

- **Settled with the author:** the Phase 0 A/B has three variants:
  - **A:** current JSON + `propertyOrdering` + no `speech`. This is the interim and ships immediately.
  - **B:** tagged header + body + a final `@actions {json}` trailer line.
  - **C:** tagged header + body + a function call.

  The default leans to **B**, because Groq gpt-oss has no parallel tool use and its structured output doesn't stream, and Gemini's streamed function-call arguments aren't documented outside Vertex.

  Conditions for B:
  - the trailer is valid only as the last line, outside fences, after a clean finish;
  - the segmenter holds back `@`-lines until their newline;
  - a truncated or cancelled turn never carries actions.

  Metrics: first visible character, first complete sentence, malformed-turn rate, action-argument validity, cancel behaviour, trailer leak (target 0) and action latency.

### 6.4 STT turn detection and language (point 5)
- **Turn detection beyond silence + punctuation:**
  - Use a small semantic end-of-turn model on the partial transcript or the audio, if one with acceptable licence and latency exists (candidates: Pipecat Smart Turn, LiveKit turn-detector; language coverage in §8).
  - Otherwise use the VAD grace window from H5: submit after a short silence, and cancel if speech resumes within ~400 ms.
  - Always keep "Done speaking" and the manual mode.
- **Persian vs other Arabic-script languages:** script ratio alone can't separate fa, ar and ur. Use letter evidence:
  - Persian-only letters: پ چ ژ گ, and the Persian forms ی (U+06CC) and ک (U+06A9);
  - Arabic forms: ي (U+064A) and ك (U+0643), plus ة;
  - Urdu-specific letters: ٹ ڈ ڑ ں ے.

  Back that with a text language-ID crate (`whatlang` or `lingua-rs`, both cover Persian [A]), and fall back to the user's sticky language for short sentences. For TTS routing only "Persian or not" matters. Arabic or Urdu text should go to Gemini too (it can't go to an English-only local engine), never be spoken by Kokoro.
- **Partial corrections:**
  - Show partials as a stable prefix plus an unstable tail (greyed).
  - Never run local intents, workflow triggers or barge-in *decisions* on unstable text; barge-in stays VAD-based.
  - Submit only the final.
  - With Nemotron, finals per segment are stable; with Whisper re-decoding, the whole tail can change, so diff against the previous partial.

### 6.5 Memory deletion completeness (point 7)
"Forget X" must reach all of these. Test each with a canary string that is grepped across the DB file, WAL, FTS shadow tables, logs and caches after deletion:
1. `messages` rows and their FTS5 index. External-content FTS needs explicit `'delete'` rows; or use triggers.
2. `memories` rows, **and `memory_events.before/after`**. The plan's schema stores the deleted text in the event log. Redact the payload and keep only the op, id and time.
3. **Rolling summaries.** They need provenance (`source_message_ids` / range). A summary that covers deleted content is regenerated or deleted.
4. **Queued and in-flight extraction jobs.** Cancel jobs by source id, and write **tombstones**. Any extraction result whose source is tombstoned is dropped on write. This is the anti-resurrection rule; it applies to the sync of character notes too.
5. **Procedural notes, workflows and run logs** that embed personal data (slots, `stats`, `provenance`, the broker audit log with message payloads). The audit log stores a payload hash plus redactable fields.
6. **Embeddings**, if they are ever added.
7. **SQLite internals.** Keep `secure_delete=ON` (already on), run `wal_checkpoint(TRUNCATE)` after deletes, and `VACUUM` on "forget everything".
8. **Out of reach**, said plainly in the UI: exports the user already saved, OS backups (Time Machine / OneDrive), and provider-side logs.

### 6.6 Targets, PoCs, slices, lifecycle tests (point 8)
- **Separate the spans:**
  - *Local, pass/fail:* provider first byte → first visible token (< 50 ms); first complete sentence → first local audio; barge-in → silence; local intent → reaction.
  - *Provider-bound, recorded only:* request → first byte, per provider and region.
  - §11's "< 700 ms send → first token" mixes both and can't be owned by the app.
- **PoC list before committing phases.** Each is ≤ 3 days and produces numbers or a go/no-go:
  1. streaming format A/B (§6.3);
  2. CI-built, signed `luna-tts` sidecar on 3 targets (D1);
  3. Nemotron on the pinned sherpa v2.0.1 with the macOS and Windows archives (the online server isn't confirmed in them, §8);
  4. BuzzASR ggml q5 RTF on a CPU-only laptop and on M-series;
  5. Qwen Base + mood reference clips (§6.2);
  6. Telegram Desktop AX/UIA state observation for `sent_observed`, on both OSes;
  7. Hermes isolation canaries plus a TCC inheritance check (C1);
  8. Windows WebView2 idle CPU/RAM with the current flags (M10).
- **Vertical slices:** see H6/H7. Each slice ships one user-visible improvement end to end, behind a flag, with its rollback test.
- **Rollback tests:** CI runs the golden and E2E suites with each migration flag on and off. Data migrations (history JSON → tables) are tested forward, back, and forward again.
- **Disk/model lifecycle tests:**
  - kill mid-download, then resume;
  - hash mismatch;
  - disk full during extract;
  - remove a model **while its worker is running**: on Windows an open file can't be deleted, so stop the worker first and retry;
  - app update that changes a model's manifest;
  - orphan sweep with a user-dropped file (L5);
  - cache budget eviction never touching `user/`.

## 6.7 Discussion outcome with the plan author (2026-10-29)

- **Accepted by the author as written:**
  - C1 and H1–H7;
  - M1–M7 and M9–M12;
  - L1–L8;
  - the D1, D2, D3 and D8 corrections;
  - the three missing audit rows;
  - toolsets: accept both shapes now, fail closed otherwise.
- **Author's counter 1, accepted by me:** TCC inheritance applies to every external executor. Hence one transport rule with an adapter per protocol (M8, updated), plus conditions (a)–(d).
- **Author's counter 2, accepted by me:** drop the exact Qwen3-ASR fa WER and cite the paper's per-language table as "not re-verified".
- **Author's correction on D5, accepted and confirmed by me** via `Cargo.lock` (no `indexmap`, so no `preserve_order`): keys are alphabetical, so text is generated last, not emotion. Same fix.
- **Isolation default, settled:** container-or-no-host-tools for v1; details in M8.

## 7. Open questions for the owner (in addition to plan §12)

1. Should voice ever approve anything? (Recommendation: `local-reversible` only.)
2. For mixed Persian/English replies: one Gemini voice for the whole turn (recommended), or per-sentence switching?
3. Is pre-rendering Qwen lines on mid-tier hardware acceptable as part of "local Qwen TTS"?

---

## 8. External claims checked [R]

Research was done 2026-10-29 by web search and fetch. Nothing was installed.

| Plan claim | Result | Source |
|---|---|---|
| Hermes `/v1/toolsets` returns `{"object":"list","data":[…]}` | **Docs show a bare array.** The plan author reports v0.22.5 source returns `{object, platform, data[]}`. Docs and code disagree; code wins. Accept both shapes (§6). | hermes-agent.nousresearch.com/docs/user-guide/features/api-server |
| Chat completions ignores request `tools`/`tool_choice`/`max_tokens` | **Verified in source.** `tools`/`tool_choice` are used only for the idempotency fingerprint. Even config `model.max_tokens` is reported as not applied (issue #11443). So the current client's `"tools":[]` gives no protection. | `api_server_openai_routes.py`; github.com/NousResearch/hermes-agent/issues/11443 |
| `/v1/runs` SSE, `approval.request`, approval POST, stop | **Verified.** Approval choices are `once/session/always/deny`; stop → `cancelled`. **Mivuneko must only ever send `once`** (or `deny`), never `session`/`always`, or Hermes's own grants outlive our policy. | api-server docs |
| `memory_enabled: false`, `external_dirs` | Verified (`external_dirs` only via a docs mirror). | configuration docs; skills docs mirror |
| `no_mcp` profile key | **Not found.** The documented alternative is per-server `enabled: false`. Fix the plan's wording. | MCP docs |
| Hermes ~640 MB RSS | **Unverifiable.** Mark it [A]. | — |
| Curator "50–100 API calls" | Verified; the LLM curator pass is **off by default**. | curator docs |
| `no_agent` cron scripts | Verified. | cron-script-only docs |
| cua-driver: Rust, MIT, embeddable; AX on macOS via private SkyLight SPIs; UIA on Windows; used by Hermes computer use | **Verified.** Note: the optional perception extension (OmniParser) is **AGPL**. Exclude it explicitly. | github.com/trycua/cua `libs/cua-driver`; Hermes computer-use docs |
| cua-driver Rust SDK `publish = false` | Unverifiable. | — |
| Qwen3-TTS: 2026-01-22, Apache-2.0, variants, 10 languages (no Persian), streaming | **Verified.** 0.6B has **no** VoiceDesign. First packet ~97 ms is the authors' claim. | github.com/QwenLM/Qwen3-TTS |
| faster-qwen3-tts numbers (4090 / 4060) | **Verified:** 4090 0.6B RTF 4.78 / 156 ms; 4060 0.6B RTF 2.26 / 413 ms. No Mac numbers (experimental Metal). | github.com/andimarafioti/faster-qwen3-tts |
| mlx-audio: "M4 Pro below real time, M4 Max just above" | Qwen support verified; **speed unverifiable** from the README. Treat the M-series numbers as [A] until the spike. | mlx-audio README |
| GGUF/ONNX/Candle ports | Verified, all community-made; no official llama.cpp support. | HF Serveurperso/Qwen3-TTS-GGUF, HaujetZhao, darkautism |
| Nemotron streaming EN: licence, chunks, WER | **Verified** (80/160/560/1120 ms → 8.43/7.67/7.07/6.93 avg WER). | huggingface.co/nvidia/nemotron-speech-streaming-en-0.6b |
| Nemotron in sherpa-onnx ≥ 1.13.4; pin v2.0.1 | sherpa v2.0.1 **exists** (26 Oct). Nemotron support was added upstream. The online websocket server is confirmed in **Linux** prebuilt archives only; macOS/Windows not confirmed (PoC 3). | github.com/k2-fsa/sherpa-onnx releases; openwhispr blog |
| Pocket TTS: ~100M, CPU ~6× RT, ~200 ms, cloning, sherpa support | **Verified.** Weights are **CC-BY-4.0** (gated with use terms), which closes the plan's open licence question. Not English-only (en, fr, de, pt, it, es), which doesn't matter given the English-only rule. | huggingface.co/kyutai/pocket-tts; k2-fsa sherpa pocket docs |
| Gemini structured-output ordering | **Since Nov 2025, schema key order is preserved** on 2.5+ (`responseJsonSchema` also supported). Streaming order isn't documented separately. See the corrected D5 above. | blog.google gemini-api-structured-outputs; ai.google.dev structured-output |
| Gemini TTS speaks Persian and streams | **Verified**: Iranian Persian listed; streaming 24 kHz PCM. | ai.google.dev/gemini-api/docs/speech-generation |
| BuzzASR/persian: MIT, large-v3 fine-tune, WER/CER | **Verified** (combined 14.45 / 4.71). | huggingface.co/BuzzASR/persian |
| Moonshine "MIT [A]" | **Partly wrong.** All English and all streaming models are MIT. Legacy non-English non-streaming models use a Community License (free under US$1M revenue with registration). Fine for the English use in the plan. | moonshine LICENSE |
| Telegram `tg://resolve?domain=…&text=…` fills a draft | **Verified per Telegram docs** ("if the user can write in the chat"). A phone form exists: `tg://resolve?phone=…&text=…`. This handles contacts without usernames, which the plan doesn't mention. Desktop behaviour is not separately confirmed (PoC 6). | core.telegram.org/api/links |
| Qwen3-ASR Persian FLEURS WER 53.8 | **Unverifiable.** The model card gives only a 10-language Fleurs average that includes fa (0.6B: 21.80). Remove the number or source it. | huggingface.co/Qwen/Qwen3-ASR-1.7B |
