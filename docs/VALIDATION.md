# v0.3 cloud validation · 2026-10-28

This is a historical cloud validation record. Its VRM and inline-chat UI references describe a previous revision; see CHARACTER_SOURCES.md and the current tests for the 2D companion lineup.

Linux cloud container; Node 24.22.1, Rust 1.99.1, Playwright 1.62.1 with Chromium Headless Shell 134, software WebGL and synthetic audio. The connected Browser tool could not run because it requires the originating browser context. Cloud Playwright was used under the user's cloud-development/test instruction. The current Chromium archive endpoint returned invalid empty content, so the compatible pinned Chromium 134 headless shell was used instead.

| Check | Result |
|---|---|
| JavaScript/TypeScript units | 31 passed |
| Browser workflows | 16 passed |
| Portable Rust tests | 24 passed (os-broker 7, agent-client 3, desktop-core 4, gemini-client 10) |
| TypeScript / Vite production build | Pass |
| Portable Rust Clippy, all targets, warnings denied | Pass |
| Formatting / source whitespace / JSON / plist / shell syntax | Pass |
| Full Windows/macOS native shell | Not compiled/run in this Linux host |
| Live Google account / physical microphone / speakers | Not exercised; no live API keys supplied |

## Specific new evidence

- Native Gemini contracts use actual local HTTP fixtures, including auth headers, structured chat/installed-app proposals, WAV transcription and speech response decoding. Proxy tests perform a real HTTP forward-proxy exchange and SOCKS5h handshake with proxy-side domain resolution. A broken-proxy test verifies no connection reaches the direct target.
- Concurrent leases allocate distinct keys, and project cooldown excludes keys bearing that project label. Cancellation releases request/key slots, including cancellation before registration. Configuration validation/status redaction and malformed response handling are covered. Modern speech styles stay outside transcript text; complete WAV passes through unchanged; older PCM receives one WAV header.
- Browser tests prove the menu → Chat flow creates input beneath the pet without a new page, deny/approval handling, cross-window conversation synchronization, actual bundled VRM loading and angry expression state, and synthetic microphone → WAV → Gemini transcription → reply → speech command routing. Keys/proxy inputs clear after Apply and keys do not appear in persisted UI preferences. Native IPC is a fixture in these browser tests.
- The included Pixiv sample is validated against its recorded SHA-256 and expression metadata. Its actual model renders in browser WebGL with head-anchored effects. Its license/provenance record is included.
- Production screenshots were captured with no page errors and visually inspected. `pet.png`, `pet-menu.png`, `pet-angry.png`, `pet-options.png`, `inline-chat.png`, `approval.png`, `conversations.png`, `conversations-narrow.png`, `settings.png` are browser renders, not native-window screenshots.

## UI QA

Flow: pet → companion menu → inline Chat → message/launch request → reply or explicit one-time approval. Additional flow: options → expressive sample → angry cue → head-attached mark.

| Rendered check | Result |
|---|---|
| Intended routes/title and meaningful first screen | Pass |
| No blank surface/framework error overlay | Pass |
| Console/page runtime health | No relevant page errors in automated workflows/capture |
| Desktop and narrow utility layout | Pass at 1440×1000 and 800×900; pet captured at 400×800 |
| Interaction proof | Inline chat, emotion state, setup, consent and synthetic voice workflows pass |
| Visual evidence | Real sample, unobstructed menu, inline composer and head anger mark inspected |

Vite warns that the lazy Three.js chunk is above 500 kB (~147 kB gzip). This is a known bundle-size/performance item, not a failed build. Native hardware, mixed-DPI monitors, proxy authentication against a real service, supported account model names, real provider voices/latency and signed distribution remain local/release gates. See platform checklists and GAPS.md.

## v0.3.1 key-entry fix
Plain API keys, one per line, replace required project labels. Blank/duplicate UI entries are ignored. Native deserialization accepts plain strings and retains older object-format compatibility. Unlabeled keys share a conservative quota cooldown. TypeScript check, 11 Gemini Rust tests and the settings/voice browser contract passed for this patch.

## v0.3.2 compatibility fix
Keys-only UI sends credential objects internally for compatibility with older native shells. Native key validation treats keys as opaque visible ASCII tokens, including dotted prefixes, while rejecting embedded whitespace/control characters. Targeted settings/voice browser regression, production build and Gemini Rust tests cover the fix. Full native rebuild is required to update Rust validation on a local machine.
